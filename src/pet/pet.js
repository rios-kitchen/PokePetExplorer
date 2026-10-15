/* PokePet – the pet window: rendering, behaviour, care and reactions. */
(() => {
  const api = window.api;
  const I18N = window.PokeI18N;
  const SP = window.PokeSprites;
  const Sound = window.PokeSound;

  const canvas = document.getElementById('stage');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const bubbleEl = document.getElementById('bubble');
  const bubbleText = bubbleEl.querySelector('.text');
  const bubbleActions = bubbleEl.querySelector('.actions');
  const pillEl = document.getElementById('pill');
  const faceEl = bubbleEl.querySelector('.face');

  const GROUND_PAD = 12;      // px between the pet's feet and the window bottom
  const SLEEP_AFTER = 5 * 60e3;
  const AWAY_AFTER = 3 * 60;  // seconds without any input → the pet naps

  let state = null;
  let W = 0, H = 0, DPR = 1;

  const L = () => (state ? state.settings.lang : 'en');
  let lastLine = null;
  const say = (key, vars) => { lastLine = key; return I18N.line(L(), key, vars); };
  const tr = (key, vars) => I18N.t(L(), key, vars);
  const rand = (a, b) => a + Math.random() * (b - a);
  const phase = () => (state ? state.timer.phase : 'idle');
  const fx = () => (state ? state.settings.scale : 3);   // effect size unit

  // ================================================================ sprites
  // sprite.kind: 'pmd' (PMD SpriteCollab) | 'grid' (built-in pixel art, placeholder until PMD is downloaded)
  let sprite = null;

  function canvasFrom(img) {
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    c.getContext('2d').putImageData(new ImageData(img.data, img.width, img.height), 0, 0);
    return c;
  }

  function flipped(src) {
    const c = document.createElement('canvas');
    c.width = src.width; c.height = src.height;
    const g = c.getContext('2d');
    g.translate(src.width, 0); g.scale(-1, 1); g.drawImage(src, 0, 0);
    return c;
  }

  function loadImage(url) {
    return new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => res(img);
      img.onerror = rej;
      img.src = url;
    });
  }

  function toCanvas(img) {
    const c = document.createElement('canvas');
    c.width = img.naturalWidth || img.width; c.height = img.naturalHeight || img.height;
    c.getContext('2d').drawImage(img, 0, 0);
    return c;
  }

  /** Bounding box of non-transparent pixels over several canvases. */
  function unionBox(canvases) {
    let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
    for (const c of canvases) {
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
        if (d[(y * c.width + x) * 4 + 3] > 20) {
          if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        }
      }
    }
    return x1 < 0 ? null : { x0, y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  }

  function crop(c, box) {
    const out = document.createElement('canvas');
    out.width = box.w; out.height = box.h;
    out.getContext('2d').drawImage(c, box.x0, box.y0, box.w, box.h, 0, 0, box.w, box.h);
    return out;
  }

  async function buildGrid(id, hd) {
    const v = (name) => canvasFrom(SP.rgba(id, name, hd));
    const open = v('open'), closed = v('closed'), lookL = v('lookL'), lookR = v('lookR');
    const pair = (c) => ({ n: c, f: flipped(c) });
    return {
      kind: 'grid', hd, w: open.width, h: open.height,
      img: { open: pair(open), closed: pair(closed), [-1]: pair(lookL), [1]: pair(lookR) }
    };
  }

  async function buildPmd(asset) {
    const anims = {};
    let maxW = 0, maxH = 0;
    for (const [name, a] of Object.entries(asset.anims)) {
      const sheet = toCanvas(await loadImage(a.url));
      const cols = Math.max(1, Math.floor(sheet.width / a.fw));
      const rows = Math.max(1, Math.floor(sheet.height / a.fh));
      const raw = [];
      for (let r = 0; r < rows; r++) {
        const row = [];
        for (let c = 0; c < Math.min(cols, a.durs.length); c++) {
          const fc = document.createElement('canvas');
          fc.width = a.fw; fc.height = a.fh;
          fc.getContext('2d').drawImage(sheet, c * a.fw, r * a.fh, a.fw, a.fh, 0, 0, a.fw, a.fh);
          row.push(fc);
        }
        raw.push(row);
      }
      const box = unionBox(raw.flat());
      if (!box) continue;
      anims[name] = {
        dirs: raw.map((row) => row.map((c) => crop(c, box))),
        durs: a.durs.map((t) => (t * 1000) / 60),
        total: a.durs.reduce((s, t) => s + (t * 1000) / 60, 0),
        cx: a.fw / 2 - box.x0,        // PMD anchor (frame centre) in cropped coordinates
        cy: a.fh / 2 - box.y0,
        w: box.w, h: box.h
      };
    }
    const base = anims.Idle || anims.Walk || Object.values(anims)[0];
    // ground line relative to the anchor, taken from the idle pose (feet on the floor)
    const groundOff = base.h - base.cy;
    let left = 0, right = 0, up = 0;
    for (const a of Object.values(anims)) {
      left = Math.max(left, a.cx);
      right = Math.max(right, a.w - a.cx);
      up = Math.max(up, a.cy + groundOff);
    }
    maxW = 2 * Math.max(left, right);
    maxH = up;
    return { kind: 'pmd', anims, w: base.w, h: base.h, maxW, maxH, groundOff };
  }

  async function loadSprite(id) {
    let built = null;
    try {
      const asset = await api.invoke('pokemon:assets', id);
      if (asset && asset.kind === 'grid') built = await buildGrid(id, asset.hd);
      else if (asset && asset.kind === 'pmd') built = await buildPmd(asset);
    } catch (e) {
      console.error('sprite load failed', e);
    }
    if (!built) built = await buildGrid('pikachu', true);
    let cry, name;
    if (SP.DEFS[id]) {
      cry = SP.DEFS[id].cry; name = SP.DEFS[id].name;
    } else {
      const c = state.custom.find((x) => x.id === id);
      name = c ? c.names : { en: id, zh: id };
      cry = { en: `${name.en}!`, zh: `${name.zh}！` };
    }
    sprite = { id, cry, name, ...built };
    pet.anim = null;
    pet.action = null;
    updateUnit();
  }

  function updateUnit() {
    if (!sprite || !state) return;
    const scale = state.settings.scale;
    if (sprite.kind === 'grid') {
      sprite.unit = sprite.hd ? scale / 2 : scale;
    } else {
      sprite.unit = Math.max(1, Math.round((scale * 30) / sprite.h));
    }
    sprite.smooth = false;
    const fw = (sprite.maxW || sprite.w) * sprite.unit;
    const fh = (sprite.maxH || sprite.h) * sprite.unit;
    // a lying (fainted) pet needs its width as height, too
    api.send('pet:fit', { w: Math.ceil(Math.max(fw, fh)), h: Math.ceil(Math.max(fh, sprite.w * sprite.unit * 0.8)) });
  }

  const cry = () => (sprite ? sprite.cry[L()] || sprite.cry.en : '');

  // ================================================================ glyphs
  const GLYPH = {};
  for (const name of Object.keys(SP.GLYPHS)) GLYPH[name] = canvasFrom(SP.glyphRgba(name));

  // ================================================================ pet model
  const pet = {
    mode: 'idle',           // idle | walk | sleep
    dir: -1,                // -1 = facing left/front, 1 = facing right
    lift: 0, vy: 0, jumpsLeft: 0, squash: 0, tilt: 0,
    held: false,
    blinkUntil: 0, nextBlink: 0, happyUntil: 0,
    eatUntil: 0, bathUntil: 0, dizzyUntil: 0,
    nextDecision: 0, modeUntil: 0,
    lastInteract: Date.now(),
    nextChatter: Date.now() + rand(3, 6) * 60e3,
    nextLonely: Date.now() + 4 * 60e3,
    eating: null, walkAcc: 0, moving: false,
    anim: null, animStart: 0, nextSweat: 0, nextFly: 0, action: null, nextFun: Date.now() + 20e3
  };

  function care() {
    const c = state && state.pets[state.settings.pokemon] && state.pets[state.settings.pokemon].care;
    return c || { hunger: 80, clean: 80, health: 100, sick: false, fainted: false };
  }
  const isSick = () => care().sick;
  const isFainted = () => care().fainted;

  function interacted() {
    pet.lastInteract = Date.now();
    if (pet.mode === 'sleep') wake(false);
  }

  function jump(times = 1, power = 1) {
    if (pet.held || isFainted()) return;
    if (sprite && sprite.kind === 'pmd') {
      if (playAnim(['Hop', 'Pose'], { times })) return;
    }
    pet.jumpsLeft = Math.max(pet.jumpsLeft, times);
    if (pet.lift === 0) startJump(power);
  }

  function startJump(power = 1) {
    pet.vy = -(2.2 + fx() * 0.55) * power;
    pet.jumpsLeft -= 1;
  }

  function happy(ms = 1200) { pet.happyUntil = Date.now() + ms; }

  // Animations that belong to a state (shown automatically) – everything else is an "action".
  const STATE_ANIMS = new Set(['Idle', 'Walk', 'Sleep', 'EventSleep', 'Faint', 'Laying', 'Eat', 'Hurt']);

  /** Play the first available PMD animation of `names` once (or `times` times). */
  function playAnim(names, { times = 1, minMs = 0 } = {}) {
    if (!sprite || sprite.kind !== 'pmd') return false;
    const name = names.find((n) => sprite.anims[n]);
    if (!name) return false;
    const now = Date.now();
    pet.action = { name, start: now, until: now + Math.max(minMs, sprite.anims[name].total * times) };
    return true;
  }

  function playRandom(names, opts) {
    const avail = names.filter((n) => sprite && sprite.kind === 'pmd' && sprite.anims[n]);
    if (!avail.length) return false;
    return playAnim([avail[Math.floor(Math.random() * avail.length)]], opts);
  }

  /** Every non-state animation of this Pokémon (used for random idle fun). */
  const funAnims = () => (sprite && sprite.kind === 'pmd'
    ? Object.keys(sprite.anims).filter((n) => !STATE_ANIMS.has(n)) : []);

  const CELEBRATE = ['Attack', 'Shock', 'Shoot', 'QuickStrike', 'Swing', 'Double', 'Kick', 'Strike', 'Special', 'Charge', 'Hop'];

  function sleep(byAway = false) {
    pet.mode = 'sleep';
    pet.sleptByAway = byAway;
    pet.nextZ = 0;
    hideBubble(true);
    Sound.play('sleep');
  }

  function wake(talk = true) {
    if (pet.mode !== 'sleep') return;
    pet.mode = 'idle';
    pet.nextDecision = Date.now() + 1500;
    if (!playAnim(['Wake'])) jump(1, 0.7);
    if (talk) showBubble(say('wake', { cry: cry() }));
  }

  // ================================================================ particles
  const particles = [];

  function geometry() {
    const u = sprite ? sprite.unit : 3;
    const w = (sprite ? sprite.w : 32) * u;
    const h = (sprite ? sprite.h : 30) * u;
    const bottom = H - GROUND_PAD - Math.round(pet.lift);
    const cx = Math.round(W / 2);
    return { u, w, h, cx, left: Math.round(cx - w / 2), top: bottom - h, bottom };
  }

  function spawn(type, opts = {}) {
    const g = geometry();
    const p = {
      type,
      x: opts.x ?? g.cx + rand(-12, 12),
      y: opts.y ?? g.top + 4,
      vx: opts.vx ?? rand(-0.3, 0.3),
      vy: opts.vy ?? -rand(0.5, 0.9),
      g: opts.g ?? 0,
      life: opts.life ?? 70,
      age: 0,
      size: opts.size ?? Math.max(2, fx() - 1),
      text: opts.text,
      orbit: opts.orbit,
      onEnd: opts.onEnd
    };
    particles.push(p);
    return p;
  }

  function hearts(n = 3) {
    for (let i = 0; i < n; i++) setTimeout(() => spawn('heart', { life: 60 }), i * 120);
  }

  function stars(n = 10) {
    const g = geometry();
    for (let i = 0; i < n; i++) {
      const a = (Math.PI * 2 * i) / n + rand(-0.2, 0.2);
      const sp = rand(1.6, 2.8);
      spawn(i % 3 ? 'star' : 'spark', {
        x: g.cx, y: g.top + 10, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 1.2, g: 0.06, life: 55
      });
    }
  }

  function floatText(text) {
    const g = geometry();
    spawn('text', { text, x: g.cx + g.w * 0.3, y: g.top, vx: 0, vy: -0.6, life: 70 });
  }

  /** Drop a treat from the sky into the pet's mouth, then run `done`. */
  function dropTreat(glyph, done) {
    const g = geometry();
    const p = spawn(glyph, { x: g.cx + rand(-6, 6), y: -10, vx: 0, vy: 1.2, g: 0.15, life: 400, size: Math.max(2, fx() - 1) });
    p.target = () => geometry().top + (geometry().bottom - geometry().top) * 0.45;
    p.onHit = done;
    pet.eating = p;
  }

  function chomp(after) {
    pet.eating = null;
    pet.eatUntil = Date.now() + 1400;
    Sound.play('eat');
    happy(1500);
    if (sprite.kind === 'pmd') playAnim(['Eat'], { minMs: 1400 }); else jump(2, 0.6);
    hearts(2);
    if (after) after();
  }

  function bath() {
    pet.bathUntil = Date.now() + 3600;
    Sound.play('bath');
    const g = geometry();
    for (let i = 0; i < 16; i++) {
      setTimeout(() => spawn('bubble', {
        x: g.cx + rand(-g.w / 2, g.w / 2), y: g.bottom - rand(0, g.h * 0.6),
        vx: rand(-0.2, 0.2), vy: -rand(0.4, 1), life: 70, size: Math.max(2, fx() - 1)
      }), i * 180);
    }
    setTimeout(() => {
      stars(10);
      jump(1);
      showBubble(say('bathDone'), { ms: 2500 });
    }, 3600);
  }

  // ================================================================ emotions (PMD portraits)
  const EMO = {
    greet: 'Happy', pet: 'Joyous', petFocus: 'Determined', petBreak: 'Joyous',
    focusStart: 'Determined', focusStartTask: 'Determined', focusEnd: 'Joyous', askTaskDone: 'Normal',
    breakStart: 'Happy', breakEnd: 'Inspired', todoDone: 'Happy', allDone: 'Joyous', todoAdded: 'Normal',
    reminder: 'Worried', due: 'Surprised', levelUp: 'Inspired', sleep: 'Sigh', wake: 'Surprised',
    lonely: 'Teary-Eyed', idle: 'Normal', held: 'Surprised', dropped: 'Dizzy', switchIn: 'Determined',
    stopped: 'Normal', paused: 'Normal', typing: 'Happy', typingLong: 'Worried', dizzy: 'Dizzy',
    welcomeBack: 'Joyous', hover: 'Happy', chase: 'Determined',
    needHungry: 'Sad', needDirty: 'Worried', needSick: 'Pain', needFainted: 'Pain', needPooped: 'Worried',
    gotSick: 'Pain', eat: 'Happy', bathDone: 'Joyous', healed: 'Happy',
    refusedFull: 'Normal', refusedClean: 'Normal', refusedHealthy: 'Happy', refusedBerries: 'Sad', refusedFainted: 'Pain',
    dailyBerries: 'Happy', weekly_happy: 'Joyous', weekly_okay: 'Normal', weekly_sad: 'Crying',
    poopStart: 'Pain', poopDone: 'Worried', poopCleaned: 'Joyous'
  };

  /** The face also depends on how the pet is doing right now. */
  function emotionFor(key) {
    let e = EMO[key] || 'Normal';
    const c = care();
    if (c.fainted) return 'Pain';
    if (c.sick && (e === 'Normal' || e === 'Happy')) e = 'Pain';
    else if (c.pooped && e === 'Normal') e = 'Worried';
    else if (state && state.mood < 30 && (e === 'Normal' || e === 'Happy')) e = 'Sad';
    return e;
  }

  const faceCache = {};
  function dexOf(id) {
    if (SP.DEFS[id]) return SP.DEFS[id].dex;
    const c = state && state.custom.find((x) => x.id === id);
    return c ? c.dex : null;
  }
  function portrait(emotion) {
    const dex = sprite && dexOf(sprite.id);
    if (!dex) return Promise.resolve(null);
    const k = `${dex}-${emotion}`;
    if (!(k in faceCache)) faceCache[k] = api.invoke('diary:portrait', dex, emotion).catch(() => null);
    return faceCache[k];
  }

  // ================================================================ bubble
  let bubbleTimer = null;
  let bubblePriority = 0;

  function showBubble(text, o = {}) {
    const priority = o.priority ?? (o.actions ? 2 : 1);
    if (!bubbleEl.classList.contains('hidden') && priority < bubblePriority) return;
    bubblePriority = priority;
    bubbleText.textContent = text;
    const emotion = o.emotion || emotionFor(lastLine);
    lastLine = null;
    faceEl.classList.add('hidden');
    const token = (showBubble.token = (showBubble.token || 0) + 1);
    portrait(emotion).then((url) => {
      if (!url || token !== showBubble.token) return;
      faceEl.src = url;
      faceEl.classList.remove('hidden');
      layoutOverlays();
    });
    bubbleActions.innerHTML = '';
    for (const a of o.actions || []) {
      const b = document.createElement('button');
      b.textContent = a.label;
      if (!a.primary) b.className = 'secondary';
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        hideBubble(true);
        a.run();
      });
      bubbleActions.appendChild(b);
    }
    bubbleEl.classList.remove('hidden');
    bubbleEl.style.animation = 'none'; void bubbleEl.offsetWidth; bubbleEl.style.animation = '';
    clearTimeout(bubbleTimer);
    const ms = o.ms ?? (o.actions ? 60e3 : Math.min(9000, 2500 + text.length * 70));
    bubbleTimer = setTimeout(() => hideBubble(true), ms);
    layoutOverlays();
  }

  function hideBubble(force) {
    if (!force && bubblePriority > 1) return;
    clearTimeout(bubbleTimer);
    bubbleEl.classList.add('hidden');
    bubblePriority = 0;
  }

  const bubbleBusy = () => !bubbleEl.classList.contains('hidden') && bubblePriority > 1;

  const careAction = (item, label) => ({ label, primary: true, run: () => api.send('pet:action', 'care', item) });
  const laterAction = () => ({ label: tr('btn.later'), run: () => {} });

  // ================================================================ overlays
  let lastPillText = '';
  function fmt(ms) {
    const s = Math.max(0, Math.ceil(ms / 1000));
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  }

  function timeLeft() {
    if (!state || state.timer.phase === 'idle') return 0;
    const t = state.timer;
    return t.paused ? t.remaining : Math.max(0, t.endsAt - Date.now());
  }

  function layoutOverlays() {
    const u = sprite ? sprite.unit : 3;
    const restTop = H - GROUND_PAD - (sprite ? sprite.h : 30) * u;
    let y = restTop - 6;
    if (!pillEl.classList.contains('hidden')) {
      pillEl.style.top = `${Math.max(0, y - pillEl.offsetHeight)}px`;
      y -= pillEl.offsetHeight + 4;
    }
    if (!bubbleEl.classList.contains('hidden')) {
      bubbleEl.style.top = `${Math.max(2, y - bubbleEl.offsetHeight - 8)}px`;
    }
  }

  function updatePill() {
    const ph = phase();
    if (ph === 'idle') {
      if (!pillEl.classList.contains('hidden')) { pillEl.classList.add('hidden'); layoutOverlays(); }
      lastPillText = '';
      return;
    }
    const icon = ph === 'focus' ? '🍅' : '☕';
    const text = `${state.timer.paused ? '⏸' : icon} ${fmt(timeLeft())}`;
    if (text !== lastPillText) {
      pillEl.textContent = text;
      pillEl.className = `pill ${ph === 'focus' ? 'focus' : 'break'}${state.timer.paused ? ' paused' : ''}`;
      lastPillText = text;
      layoutOverlays();
    }
  }

  function resize() {
    DPR = window.devicePixelRatio || 1;
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.imageSmoothingEnabled = false;
    layoutOverlays();
  }
  window.addEventListener('resize', resize);

  // ================================================================ keyboard & mouse reactions
  // The main process sends the cursor position (relative to this window), how far it moved and the
  // system idle time. Input while the cursor stands still is treated as typing.
  const input = {
    live: false, x: -1e4, y: -1e4, idle: 0, look: 0,
    lastMove: 0, lastActive: Date.now(), lastType: 0, lastTypeSeen: 0, typeStreakStart: 0,
    nextTypeTalk: 0, nextTypeSuggest: Date.now() + 10 * 60e3,
    fastCount: 0, nextDizzy: 0, hoverSince: 0, nextHover: 0, nextTurn: 0, nextChase: 0
  };
  const reacting = () => !!(state && state.settings.reactInput && input.live);
  const typing = (now = Date.now()) => reacting() && now - input.lastType < 1300;

  /** Busy with something special (bath, food, sleep, …) – no keyboard then. */
  function special(now) {
    return pet.mode === 'sleep' || pet.held || isFainted() || pet.eating || pet.pooping
      || now < pet.bathUntil || now < pet.eatUntil || now < pet.dizzyUntil || now < pet.happyUntil
      || pet.lift > 0 || (pet.action && now < pet.action.until);
  }
  const showTyping = (now = Date.now()) => typing(now) && !special(now);

  function onInput(d) {
    const now = Date.now();
    input.live = true;
    input.idle = d.idle;
    input.x = d.x; input.y = d.y;
    if (pet.held || down) return;
    if (d.moved > 2) input.lastMove = now;

    if (d.idle === 0) {
      const awaySec = (now - input.lastActive) / 1000;
      input.lastActive = now;
      if (pet.mode === 'sleep' && pet.sleptByAway) {
        wake(false);
        if (awaySec > 120) {
          hearts(2);
          showBubble(say('welcomeBack', { cry: cry() }), { ms: 3000 });
        }
      }
      // without exact key data: input while the cursor stands still counts as typing
      if (d.sinceKey == null && now - input.lastMove > 700) {
        if (now - input.lastTypeSeen > 30e3) input.typeStreakStart = now;
        input.lastTypeSeen = now;
        const starting = now - input.lastType > 3000;
        input.lastType = now;
        if (starting) onTypingStart(now);
      }
    }

    // exact: a key was pressed (mouse clicks and scrolling don't count)
    if (d.sinceKey != null && d.sinceKey < 1000) {
      if (now - input.lastTypeSeen > 30e3) input.typeStreakStart = now;
      input.lastTypeSeen = now;
      const starting = now - input.lastType > 3000;
      input.lastType = now - d.sinceKey;
      if (starting) onTypingStart(now);
    }

    const speed = d.moved / 0.06;
    input.fastCount = speed > 4500 ? input.fastCount + 1 : Math.max(0, input.fastCount - 1);
    if (input.fastCount >= 5 && now > input.nextDizzy && pet.mode !== 'sleep' && !isFainted()) {
      input.nextDizzy = now + 30e3;
      input.fastCount = 0;
      dizzy();
    }

    const g = geometry();
    const over = d.x > g.left && d.x < g.left + g.w && d.y > g.top && d.y < g.bottom;
    if (!over) input.hoverSince = 0;
    else if (!input.hoverSince) input.hoverSince = now;
    else if (now - input.hoverSince > 1200 && now > input.nextHover && pet.mode !== 'sleep' && !isFainted()) {
      input.nextHover = now + 10e3;
      if (!playAnim(['LookUp'], { minMs: 1200 })) happy(1200);
      hearts(1);
      if (!bubbleBusy() && Math.random() < 0.4) showBubble(say('hover'), { ms: 1800 });
    }

    if (typing(now) && phase() === 'idle' && now - input.typeStreakStart > 15 * 60e3
        && now > input.nextTypeSuggest && !bubbleBusy()) {
      input.nextTypeSuggest = now + 30 * 60e3;
      showBubble(say('typingLong', { min: Math.round((now - input.typeStreakStart) / 60e3) }), {
        priority: 2,
        ms: 20000,
        actions: [
          { label: `▶ ${tr('btn.start')}`, primary: true, run: () => api.send('pet:action', 'start-focus') },
          laterAction()
        ]
      });
    }
  }

  function onTypingStart(now) {
    if (special(now)) return;
    if (pet.mode === 'walk') pet.mode = 'idle';
    if (now > input.nextTypeTalk && !bubbleBusy() && Math.random() < 0.35) {
      input.nextTypeTalk = now + 5 * 60e3;
      showBubble(say('typing'), { ms: 2200 });
    }
  }

  function dizzy() {
    pet.dizzyUntil = Date.now() + 1800;
    playAnim(['Tumble', 'TumbleBack', 'LostBalance'], { minMs: 1800 });
    stars(6);
    if (!bubbleBusy()) showBubble(say('dizzy'), { ms: 2000 });
  }

  function updateLook(now) {
    input.look = 0;
    if (!reacting() || !sprite || pet.held || pet.mode === 'sleep' || pet.mode === 'walk' || typing(now) || isFainted()) return;
    if (now - input.lastMove > 2500) return;
    const dx = input.x - W / 2;
    input.look = dx < -50 ? -1 : dx > 50 ? 1 : 0;
  }

  // ================================================================ behaviour
  function decide(now) {
    if (pet.held || pet.lift !== 0 || pet.eating || pet.pooping || now < pet.bathUntil) return;
    const ph = phase();
    if (isFainted()) { pet.mode = 'idle'; return; }

    const away = reacting() ? input.idle >= AWAY_AFTER : now - pet.lastInteract > SLEEP_AFTER;
    if (pet.mode !== 'sleep' && ph === 'idle' && !bubbleBusy() && away) {
      sleep(reacting());
      return;
    }
    if (pet.mode === 'sleep') return;

    if (pet.mode === 'walk' && now > pet.modeUntil) {
      pet.mode = 'idle';
      pet.nextDecision = now + rand(2500, 6000);
    }

    if (now < pet.nextDecision) return;
    pet.nextDecision = now + rand(3000, 7000);

    if (typing(now)) return;   // sits down and types along
    if (ph === 'focus') {
      if (Math.random() < 0.25) pet.dir = -pet.dir;
      else if (Math.random() < 0.12) playRandom(['Charge', 'DeepBreath', 'Nod']);
      return;
    }

    // now and then: one of the Pokémon's other animations, just for fun
    if (sprite.kind === 'pmd' && !isSick() && now > (pet.nextFun || 0)) {
      pet.nextFun = now + rand(15e3, 45e3);
      if (Math.random() < 0.6 && playRandom(funAnims())) return;
    }

    const sick = isSick();
    const walkChance = sick ? 0.1 : ph === 'idle' ? 0.45 : 0.65;   // playful in breaks, slow when sick
    if (state.settings.walk && Math.random() < walkChance) {
      pet.mode = 'walk';
      pet.dir = Math.random() < 0.5 ? -1 : 1;
      pet.modeUntil = now + rand(2000, 6000);
      if (ph !== 'idle' && reacting() && now - input.lastMove < 3000 && Math.abs(input.x - W / 2) > 60) {
        pet.dir = input.x > W / 2 ? 1 : -1;
        if (now > input.nextChase && !bubbleBusy()) {
          input.nextChase = now + 3 * 60e3;
          showBubble(say('chase'), { ms: 1800 });
        }
      }
    } else if (Math.random() < 0.3) {
      pet.dir = -pet.dir;
    } else if (ph !== 'idle' && !sick && Math.random() < 0.3) {
      jump(1, 0.6);
    }

    if (now > pet.nextChatter && ph === 'idle' && !bubbleBusy() && !sick) {
      pet.nextChatter = now + rand(3, 7) * 60e3;
      showBubble(say('idle', { cry: cry() }));
    }

    if (state.mood < 30 && now > pet.nextLonely && !bubbleBusy()) {
      pet.nextLonely = now + 4 * 60e3;
      spawn('sweat', { x: geometry().cx + geometry().w * 0.3, vy: 0.3, g: 0.02, life: 60 });
      showBubble(say('lonely'));
    }
  }

  function walkStep() {
    if (bubbleBusy()) return;   // stand still while asking something
    if (pet.mode !== 'walk' || pet.held || !state.settings.walk || phase() === 'focus' || isFainted()) {
      if (pet.mode === 'walk' && (phase() === 'focus' || !state.settings.walk || isFainted())) pet.mode = 'idle';
      return;
    }
    pet.walkAcc += pet.dir * Math.max(0.8, fx() * (isSick() ? 0.15 : 0.35));
    if (pet.moving || Math.abs(pet.walkAcc) < 1) return;
    const dx = Math.trunc(pet.walkAcc);
    pet.walkAcc -= dx;
    pet.moving = true;
    api.invoke('pet:move-by', dx).then((blocked) => {
      pet.moving = false;
      if (blocked) { pet.dir = blocked === 'left' ? 1 : -1; pet.walkAcc = 0; }
    }, () => { pet.moving = false; });
  }

  function physics(now) {
    if (pet.vy !== 0 || pet.lift > 0) {
      pet.vy += 0.42;
      pet.lift -= pet.vy;
      if (pet.lift <= 0) {
        pet.lift = 0;
        pet.vy = 0;
        pet.squash = 6;
        if (pet.jumpsLeft > 0) setTimeout(() => { if (pet.lift === 0) startJump(0.85); }, 90);
      }
    }
    if (pet.squash > 0) pet.squash--;

    pet.tilt = pet.held ? Math.sin(now / 90) * 0.12
      : now < pet.dizzyUntil ? Math.sin(now / 65) * 0.2
        : now < pet.bathUntil ? Math.sin(now / 120) * 0.08
          : pet.tilt * 0.8;
    updateLook(now);

    if (now > pet.nextBlink) {
      pet.blinkUntil = now + 140;
      pet.nextBlink = now + rand(2500, 6000);
    }

    const g = geometry();
    if (pet.mode === 'sleep' && now > (pet.nextZ || 0)) {
      pet.nextZ = now + 1400;
      spawn('z', { x: g.cx + g.w * 0.25, y: g.top + 6, vx: 0.25, vy: -0.4, life: 90 });
    }
    // sick: sweat drops; dirty: a fly buzzing around
    if (isSick() && now > pet.nextSweat) {
      pet.nextSweat = now + rand(2500, 4500);
      if (Math.random() < 0.25 && !pet.action) playAnim(['Pain', 'Cringe']);
      spawn('sweat', { x: g.cx + g.w * rand(0.15, 0.35) * (Math.random() < 0.5 ? -1 : 1), y: g.top + g.h * 0.2, vx: 0, vy: 0.4, g: 0.03, life: 50 });
    }
    if (care().pooped && now > (pet.nextStink || 0)) {
      pet.nextStink = now + rand(1200, 2200);
      spawn('stink', { x: g.cx + rand(-g.w * 0.3, g.w * 0.3), y: g.top + g.h * 0.3, vx: 0, vy: -0.35, life: 60 });
    }
    if (care().clean < 30 && now > pet.nextFly && !particles.some((p) => p.type === 'fly')) {
      pet.nextFly = now + rand(4000, 9000);
      spawn('fly', { x: g.cx, y: g.top, vx: 0, vy: 0, life: 260, orbit: { r: g.w * 0.45, speed: 0.09, phase: rand(0, 6) } });
    }

    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.age++;
      if (p.orbit) {
        const gg = geometry();
        const a = p.orbit.phase + p.age * p.orbit.speed;
        p.x = gg.cx + Math.cos(a) * p.orbit.r;
        p.y = gg.top + gg.h * 0.3 + Math.sin(a * 1.7) * p.orbit.r * 0.4;
      } else {
        p.vy += p.g;
        p.x += p.vx + (p.type === 'heart' || p.type === 'z' || p.type === 'bubble' ? Math.sin(p.age / 8) * 0.3 : 0);
        p.y += p.vy;
      }
      if (p.target && p.y >= p.target()) {
        p.age = p.life;
        chomp(p.onHit);
      }
      if (p.age >= p.life) {
        particles.splice(i, 1);
        if (p.onEnd) p.onEnd();
      }
    }
  }

  // ================================================================ drawing
  function eyesClosed(now) {
    if (pet.mode === 'sleep' || pet.held || isFainted() || pet.pooping || now < pet.happyUntil || now < pet.dizzyUntil || now < pet.bathUntil) return true;
    if (isSick() && Math.sin(now / 1500) > 0.3) return true;   // tired, droopy eyes
    return now < pet.blinkUntil;
  }

  /** PMD: choose the animation matching what the pet is doing. */
  function pmdPose(now) {
    const A = sprite.anims;
    const pick = (...names) => names.find((n) => A[n]) || 'Idle';
    if (isFainted()) return { name: pick('Faint', 'Laying', 'Sleep'), once: !!A.Faint };
    if (pet.held) return { name: pick('Hurt', 'Idle') };
    if (pet.action && now < pet.action.until) return { name: pet.action.name, start: pet.action.start };
    pet.action = null;
    if (pet.mode === 'sleep') return { name: pick('Sleep', 'EventSleep', 'Laying') };
    if (pet.pooping) return { name: pick('Sit', 'Charge', 'DeepBreath', 'Idle') };
    if (now < pet.dizzyUntil) return { name: pick('LostBalance', 'Tumble', 'Hurt') };
    if (now < pet.bathUntil) return { name: pick('Rotate', 'DeepBreath', 'Idle') };
    if (now < pet.eatUntil || pet.eating) return { name: pick('Eat', 'Nod') };
    if (now < pet.happyUntil) return { name: pick('Pose', 'Idle') };
    if (pet.mode === 'walk') return { name: pick('Walk') };
    if (showTyping(now)) return { name: pick('Sit', 'Nod', 'Idle') };
    if (isSick()) return { name: pick('Laying', 'Pain', 'Idle') };
    return { name: 'Idle' };
  }

  // PMD sheet rows: 0 down, 1 down-right, 2 right, 3 up-right, 4 up, 5 up-left, 6 left, 7 down-left
  function pmdFrame(now) {
    const pose = pmdPose(now);
    const a = sprite.anims[pose.name] || sprite.anims.Idle || Object.values(sprite.anims)[0];
    if (pose.start) { pet.anim = pose.name; pet.animStart = pose.start; }
    else if (pet.anim !== pose.name) { pet.anim = pose.name; pet.animStart = now; }
    let row = 0;
    if (pet.mode === 'walk' && pose.name === 'Walk') row = pet.dir > 0 ? 2 : 6;
    else if (input.look) row = input.look > 0 ? 1 : 7;
    else if (pose.start) row = pet.dir > 0 ? 1 : 7;   // actions face the way the pet last looked
    row = Math.min(row, a.dirs.length - 1);
    let t = now - pet.animStart;
    let i = a.durs.length - 1;
    if (!pose.once) t %= a.total;
    for (let k = 0; k < a.durs.length; k++) {
      if (t < a.durs[k]) { i = k; break; }
      t -= a.durs[k];
    }
    const frames = a.dirs[row];
    return { img: frames[Math.min(i, frames.length - 1)], w: a.w, h: a.h, cx: a.cx, cy: a.cy };
  }

  function currentImage(now) {
    const flip = pet.dir > 0;
    if (sprite.kind === 'pmd') return pmdFrame(now);
    const closed = eyesClosed(now);
    const look = !closed && input.look ? (flip ? -input.look : input.look) : 0;
    const v = closed ? sprite.img.closed : look ? sprite.img[look] : sprite.img.open;
    return { img: flip ? v.f : v.n, w: sprite.w, h: sprite.h };
  }

  // the sprite is rendered into a work canvas first, so sickness tint and dirt only touch the pet
  const work = document.createElement('canvas');
  const wctx = work.getContext('2d');
  const DIRT = [[0.3, 0.55], [0.62, 0.7], [0.45, 0.82], [0.7, 0.42], [0.25, 0.75], [0.55, 0.35]];

  function renderPet(cur, dw, dh) {
    work.width = Math.max(1, Math.round(dw * DPR));
    work.height = Math.max(1, Math.round(dh * DPR));
    wctx.imageSmoothingEnabled = !!sprite.smooth;
    wctx.imageSmoothingQuality = 'high';
    wctx.drawImage(cur.img, 0, 0, work.width, work.height);
    const c = care();
    wctx.globalCompositeOperation = 'source-atop';
    if (c.sick) {
      wctx.fillStyle = 'rgba(120, 190, 110, 0.28)';
      wctx.fillRect(0, 0, work.width, work.height);
    }
    if (c.clean < 40) {
      const n = Math.min(DIRT.length, Math.ceil((40 - c.clean) / 7));
      const r = Math.max(2, fx() * DPR * 0.9);
      wctx.fillStyle = 'rgba(110, 80, 40, 0.75)';
      for (let i = 0; i < n; i++) {
        const [px, py] = DIRT[i];
        wctx.fillRect(Math.round(work.width * px), Math.round(work.height * py), Math.round(r * 2), Math.round(r * 1.5));
        wctx.fillRect(Math.round(work.width * px + r), Math.round(work.height * py - r), Math.round(r), Math.round(r));
      }
    }
    wctx.globalCompositeOperation = 'source-over';
    return work;
  }

  function draw(now) {
    ctx.clearRect(0, 0, W, H);
    if (!sprite) return;
    const g = geometry();
    const fu = fx();
    const cur = currentImage(now);
    const u = sprite.unit;
    const fainted = isFainted();
    const isTyping = showTyping(now);

    // shadow
    const restBottom = H - GROUND_PAD;
    const shrink = Math.max(0.4, 1 - pet.lift / 120);
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath();
    ctx.ellipse(g.cx, restBottom - 1, (g.w * 0.36) * shrink, Math.max(2, fu * 1.3) * shrink, 0, 0, Math.PI * 2);
    ctx.fill();

    let bob = 0;
    if (pet.mode === 'walk' && pet.lift === 0 && sprite.kind !== 'pmd') bob = Math.abs(Math.sin(now / 110)) * fu * 1.5;
    else if (pet.mode === 'sleep' && sprite.kind !== 'pmd') bob = Math.sin(now / 900) > 0 ? fu : 0;
    else if (isTyping && sprite.kind !== 'pmd') bob = (Math.floor(now / 110) % 2) * fu * 0.6;
    else if (pet.lift === 0 && sprite.kind === 'grid') bob = Math.sin(now / 600) > 0.7 ? fu * 0.5 : 0;

    const squash = (pet.squash > 0 || pet.pooping) && sprite.kind !== 'pmd' ? fu : 0;
    const dw = cur.w * u + squash * 2;
    const dh = cur.h * u - squash;
    const img = renderPet(cur, dw, dh);
    ctx.save();
    if (fainted && sprite.kind !== 'pmd') {
      // lying on its side
      ctx.translate(g.cx, restBottom - dw / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.drawImage(img, Math.round(-dw / 2), Math.round(-dh / 2), Math.round(dw), Math.round(dh));
    } else {
      const ox = cur.cx != null ? cur.cx * u : dw / 2;
      // PMD: place the frame so its anchor sits groundOff above the floor (keeps hops/falls intact)
      const oy = cur.cy != null ? (cur.cy + sprite.groundOff) * u : dh;
      ctx.translate(g.cx, g.bottom - bob);
      if (pet.tilt && sprite.kind !== 'pmd') ctx.rotate(pet.tilt);
      ctx.drawImage(img, Math.round(-ox - squash), Math.round(-oy), Math.round(dw), Math.round(dh));
    }
    ctx.restore();

    if (isTyping) {
      const kb = Math.floor(now / 110) % 2 ? GLYPH.kbd : GLYPH.kbd2;
      const s = Math.max(2, fu);
      ctx.drawImage(kb, Math.round(g.cx - (kb.width * s) / 2), Math.round(restBottom - kb.height * s + s * 2), kb.width * s, kb.height * s);
    }

    if (phase() === 'focus' && pet.mode !== 'sleep') {
      const t = GLYPH.tomato, s = Math.max(2, fu - 1);
      ctx.drawImage(t, Math.round(g.left - t.width * s * 0.2), Math.round(g.bottom - t.height * s), t.width * s, t.height * s);
    }

    for (const p of particles) {
      const fade = p.target ? 1 : Math.min(1, (p.life - p.age) / 20);
      ctx.globalAlpha = Math.max(0, fade);
      if (p.type === 'text') {
        ctx.font = '700 13px -apple-system, "Segoe UI", sans-serif';
        ctx.textAlign = 'center';
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(255,255,255,0.9)';
        ctx.strokeText(p.text, p.x, p.y);
        ctx.fillStyle = '#c0392b';
        ctx.fillText(p.text, p.x, p.y);
        continue;
      }
      const gl = GLYPH[p.type];
      if (!gl) continue;
      const s = p.size;
      ctx.drawImage(gl, Math.round(p.x - (gl.width * s) / 2), Math.round(p.y - (gl.height * s) / 2), gl.width * s, gl.height * s);
    }
    ctx.globalAlpha = 1;
  }

  function loop() {
    const t = Date.now();
    if (state && sprite) {
      decide(t);
      walkStep();
      physics(t);
      draw(t);
      updatePill();
    }
    requestAnimationFrame(loop);
  }

  // ================================================================ mouse
  let ignoring = true;
  let down = null;

  function hitTest(x, y) {
    const el = document.elementFromPoint(x, y);
    if (el && el.closest('.bubble, .pill')) return true;
    if (x < 0 || y < 0 || x >= W || y >= H) return false;
    const a = ctx.getImageData(Math.floor(x * DPR), Math.floor(y * DPR), 1, 1).data[3];
    if (a > 10) return true;
    const g = geometry();
    return x > g.left + g.w * 0.15 && x < g.left + g.w * 0.85 && y > g.top + g.h * 0.1 && y < g.bottom;
  }

  function setIgnore(v) {
    if (v === ignoring) return;
    ignoring = v;
    api.send('pet:ignore', v);
  }

  window.addEventListener('mousemove', (e) => {
    if (down) {
      const moved = Math.hypot(e.screenX - down.sx, e.screenY - down.sy);
      if (!down.dragging && moved > 4) {
        down.dragging = true;
        pet.held = true;
        if (pet.mode === 'sleep' || pet.mode === 'walk') pet.mode = 'idle';
        interacted();
        api.send('pet:drag-start');
        if (!bubbleBusy()) showBubble(say('held'), { ms: 1500 });
      }
      if (down.dragging && e.buttons === 0) endPointer();
      return;
    }
    const hit = hitTest(e.clientX, e.clientY);
    setIgnore(!hit);
    document.body.style.cursor = hit ? 'grab' : 'default';
  });

  window.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    if (e.target.closest('.bubble, .pill')) return;
    if (!hitTest(e.clientX, e.clientY)) return;
    down = { sx: e.screenX, sy: e.screenY, dragging: false };
    document.body.style.cursor = 'grabbing';
  });

  function endPointer() {
    if (!down) return;
    const wasDrag = down.dragging;
    down = null;
    document.body.style.cursor = 'grab';
    if (wasDrag) {
      api.send('pet:drag-end');
      pet.held = false;
      pet.squash = 6;
      playAnim(['HitGround', 'Trip', 'Cringe']);
      if (!bubbleBusy()) showBubble(say('dropped'), { ms: 1500 });
    } else {
      pat();
    }
  }
  window.addEventListener('mouseup', (e) => { if (e.button === 0) endPointer(); });
  window.addEventListener('blur', () => { if (down && down.dragging) endPointer(); });

  window.addEventListener('dblclick', (e) => {
    if (e.target.closest('.bubble')) return;
    const c = care();
    const needsCare = c.sick || c.hunger < 25 || c.clean < 25;
    api.send('panel:open', e.target.closest('.pill') ? 'focus' : needsCare ? 'care' : 'todos');
  });

  window.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    interacted();
    api.send('pet:menu');
  });

  pillEl.addEventListener('click', () => api.send('panel:open', 'focus'));
  bubbleEl.addEventListener('click', (e) => {
    if (e.target.closest('button')) return;
    hideBubble(false);
  });

  let lastPat = 0;
  function pat() {
    const now = Date.now();
    const wasSleeping = pet.mode === 'sleep';
    interacted();
    if (wasSleeping) return;
    if (now - lastPat < 250) return;
    lastPat = now;
    if (isFainted()) {
      showBubble(say('needFainted'), { priority: 2, actions: [careAction('potion', tr('btn.potion')), laterAction()] });
      return;
    }
    api.invoke('pet:pat');
    Sound.play('pat');
    hearts(phase() === 'focus' ? 1 : 2);
    happy(700);
    if (phase() === 'focus') {
      if (!bubbleBusy()) showBubble(say('petFocus', { time: fmt(timeLeft()) }), { ms: 2500 });
      return;
    }
    jump(1, 0.7);
    if (!bubbleBusy() && Math.random() < 0.45) {
      showBubble(say(phase() === 'idle' ? 'pet' : 'petBreak', { cry: cry() }), { ms: 2200 });
    }
  }

  // ================================================================ events from main
  const NEED = {
    hungry: { line: 'needHungry', item: 'oran', btn: 'btn.feed' },
    dirty: { line: 'needDirty', item: 'bath', btn: 'btn.bath' },
    sick: { line: 'needSick', item: 'potion', btn: 'btn.potion' },
    pooped: { line: 'needPooped', item: 'bath', btn: 'btn.bath' },
    fainted: { line: 'needFainted', item: 'potion', btn: 'btn.potion' }
  };

  const handlers = {
    'focus-start'(e) {
      interacted();
      pet.mode = 'idle';
      Sound.play('focusStart');
      jump(1);
      showBubble(e.task ? say('focusStartTask', { task: e.task }) : say('focusStart'), { priority: 2, ms: 4000 });
    },
    'focus-end'(e) {
      interacted();
      Sound.play('focusEnd');
      stars(14);
      if (!playRandom(CELEBRATE, { times: 2 })) jump(3);
      happy(2500);
      if (e.berries) setTimeout(() => floatText(say('earned', { n: e.berries })), 600);
      showBubble(say('focusEnd', { min: e.min, n: e.n }), { priority: 2, ms: 5000 });
      if (e.taskId) {
        setTimeout(() => {
          showBubble(say('askTaskDone', { task: e.task }), {
            priority: 3,
            actions: [
              { label: tr('btn.yes'), primary: true, run: () => api.send('pet:action', 'todo-done', e.taskId) },
              { label: tr('btn.notYet'), run: () => {} }
            ]
          });
        }, 4500);
      }
    },
    'break-start'(e) {
      // after a finished focus session this waits until the victory jingle is over
      setTimeout(() => {
        Sound.play('breakStart');
        if (!bubbleBusy()) showBubble(say('breakStart'), { ms: 6000 });
      }, e.delay ?? 0);
    },
    'break-end'() {
      interacted();
      Sound.play('breakEnd');
      jump(2);
      showBubble(say('breakEnd'), {
        priority: 3,
        actions: [
          { label: tr('btn.start'), primary: true, run: () => api.send('pet:action', 'start-focus') },
          laterAction()
        ]
      });
    },
    paused() { showBubble(say('paused'), { ms: 2500 }); },
    stopped() { showBubble(say('stopped'), { ms: 2500 }); },
    'todo-added'(e) {
      interacted();
      Sound.play('blip');
      if (!playAnim(['Nod'])) jump(1, 0.6);
      if (!bubbleBusy()) showBubble(say('todoAdded', { task: e.task }), { ms: 3000 });
    },
    'todo-done'(e) {
      interacted();
      dropTreat('berry', () => floatText(say('earned', { n: state.reward ? state.reward.todo : 1 })));
      if (e.allDone) {
        setTimeout(() => { Sound.play('fanfare'); stars(16); jump(3); }, 900);
        showBubble(say('allDone'), { priority: 2, ms: 5000 });
      } else if (!bubbleBusy()) {
        showBubble(say('todoDone'), { ms: 3000 });
      }
    },
    reminder(e) {
      if (bubbleBusy() || isFainted()) return;
      if (pet.mode === 'sleep') wake(false);
      spawn('alert', { x: geometry().cx + geometry().w * 0.35, vx: 0, vy: -0.15, life: 70 });
      jump(1, 0.7);
      showBubble(say('reminder', { n: e.n, task: e.task }), {
        priority: 2,
        ms: 20000,
        actions: [
          { label: `▶ ${tr('btn.start')}`, primary: true, run: () => api.send('pet:action', 'start-focus', e.taskId) },
          laterAction()
        ]
      });
    },
    due(e) {
      interacted();
      Sound.play('alarm');
      spawn('alert', { x: geometry().cx + geometry().w * 0.35, vx: 0, vy: -0.15, life: 90 });
      jump(2);
      showBubble(say('due', { task: e.task }), {
        priority: 3,
        actions: [
          { label: tr('btn.done'), primary: true, run: () => api.send('pet:action', 'todo-done', e.taskId) },
          { label: tr('btn.open'), run: () => api.send('pet:action', 'open', 'todos') }
        ]
      });
    },
    'level-up'(e) {
      setTimeout(() => {
        if (!sprite || sprite.id !== e.petId) return;
        Sound.play('levelup');
        stars(18);
        if (!playAnim(['Charge', 'Shock', 'Special', 'Pose'], { times: 2 })) jump(2, 1.1);
        showBubble(say('levelUp', { level: e.level }), { priority: 2, ms: 4500 });
      }, 1600);
    },
    switch(e) {
      interacted();
      Sound.play('switch');
      setTimeout(() => {
        stars(10);
        jump(1);
        showBubble(say('switchIn', { name: e.name }), { ms: 3000 });
      }, 150);
    },
    async skin() {
      await loadSprite(state.settings.pokemon);
      stars(10);
      if (!playAnim(['Pose', 'Hop'])) jump(1);
    },

    // ---- care
    need(e) {
      const n = NEED[e.need];
      if (!n || bubbleBusy()) return;
      if (pet.mode === 'sleep') wake(false);
      if (e.need === 'hungry') spawn('sweat', { x: geometry().cx + geometry().w * 0.3, vy: 0.3, g: 0.02, life: 60 });
      showBubble(say(n.line), { priority: 2, ms: 30000, actions: [careAction(n.item, tr(n.btn)), laterAction()] });
    },
    'got-sick'() {
      Sound.play('alarm');
      playAnim(['Cringe', 'Pain']);
      spawn('sweat', { x: geometry().cx + geometry().w * 0.3, vy: 0.3, g: 0.02, life: 60 });
      showBubble(say('gotSick'), { priority: 2, ms: 30000, actions: [careAction('potion', tr('btn.potion')), laterAction()] });
    },
    care(e) {
      interacted();
      hideBubble(true);
      if (e.kind === 'bath') { bath(); return; }
      const glyph = { oran: 'berry', puff: 'puff', candy: 'candy', potion: 'pill' }[e.item] || 'berry';
      dropTreat(glyph, () => {
        if (e.kind === 'med') {
          setTimeout(() => { stars(10); showBubble(say('healed'), { ms: 3000 }); }, 500);
        } else {
          showBubble(say('eat'), { ms: 1800 });
        }
      });
    },
    'poop-start'() {
      if (pet.mode === 'sleep') wake(false);
      pet.mode = 'idle';
      pet.pooping = true;
      Sound.play('poop');
      showBubble(say('poopStart'), { priority: 2, ms: 1800 });
      setTimeout(() => { pet.pooping = false; }, 1800);
    },
    'poop-done'() {
      playAnim(['Cringe', 'Hop']);
      // walk away from the mess a little
      if (state.settings.walk) {
        pet.mode = 'walk';
        pet.dir = Math.random() < 0.5 ? -1 : 1;
        pet.modeUntil = Date.now() + 1500;
      }
      setTimeout(() => {
        showBubble(say('poopDone'), { priority: 2, ms: 30000, actions: [careAction('bath', tr('btn.bath')), laterAction()] });
      }, 300);
    },
    'poop-cleaned'() {
      hearts(2);
      happy(1200);
      if (!bubbleBusy()) showBubble(say('poopCleaned'), { ms: 2500 });
    },
    'care-refused'(e) {
      const key = { full: 'refusedFull', clean: 'refusedClean', healthy: 'refusedHealthy', berries: 'refusedBerries', fainted: 'refusedFainted' }[e.reason];
      if (key) showBubble(say(key), { ms: 2500 });
      playAnim(['Cringe', 'Nod']);
    },
    'daily-berries'(e) {
      if (bubbleBusy()) return;
      jump(1);
      floatText(say('earned', { n: e.n }));
      showBubble(say('dailyBerries', { n: e.n }), { ms: 3500 });
    },
    weekly(e) {
      if (pet.mode === 'sleep') wake(false);
      if (e.verdict === 'happy') { hearts(4); jump(2); } else if (e.verdict === 'sad') {
        playAnim(['Cringe', 'Sink', 'Pain']);
        spawn('sweat', { x: geometry().cx + geometry().w * 0.3, vy: 0.3, g: 0.02, life: 60 });
      }
      showBubble(say(`weekly_${e.verdict}`), {
        priority: 3,
        actions: [
          { label: `📖 ${tr('btn.diary')}`, primary: true, run: () => api.send('pet:action', 'open', 'diary-last') },
          laterAction()
        ]
      });
    }
  };

  api.on('input', onInput);

  api.on('pet:event', (e) => {
    const fn = handlers[e.type];
    if (fn && sprite) fn(e);
  });

  api.on('state', async (s) => {
    const prev = state;
    state = s;
    Sound.setEnabled(s.settings.sound);
    if (!prev || prev.settings.pokemon !== s.settings.pokemon) await loadSprite(s.settings.pokemon);
    else if (prev.settings.scale !== s.settings.scale) updateUnit();
    if (prev && prev.settings.lang !== s.settings.lang) hideBubble(true);
    if (s.timer.phase === 'focus' && pet.mode === 'walk') pet.mode = 'idle';
    layoutOverlays();
  });

  // ================================================================ boot
  (async () => {
    resize();
    state = await api.invoke('state:get');
    Sound.setEnabled(state.settings.sound);
    await loadSprite(state.settings.pokemon);
    requestAnimationFrame(loop);
    setTimeout(() => {
      jump(1);
      showBubble(say('greet', { cry: cry() }), { ms: 3500 });
    }, 700);
  })();
})();
