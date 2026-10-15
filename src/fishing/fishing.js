/* PokePet Explorer – fishing window. Cast (hold to charge, release), wait for a bite, click to hook,
 * then hold to reel without snapping the line. The main process decides what bites (fishing.js). */
(() => {
  const api = window.api;
  const I18N = window.PokeI18N;
  const SP = window.PokeSprites;
  const Sound = window.PokeSound;
  const $ = (s) => document.querySelector(s);

  const S = 3, VW = 160, VH = 120;                  // pixel art at 160×120, shown 3× larger
  const canvas = $('#pond');
  const g = canvas.getContext('2d');
  g.imageSmoothingEnabled = false;

  let state = null;
  const L = () => (state ? state.settings.lang : 'en');
  const t = (k, v) => I18N.t(L(), k, v);

  // ---------------------------------------------------------------- the scene (drawn once)
  const bg = document.createElement('canvas');
  bg.width = VW; bg.height = VH;
  function paintScene() {
    const b = bg.getContext('2d');
    const px = (x, y, c) => { b.fillStyle = c; b.fillRect(x, y, 1, 1); };
    const rect = (x, y, w, h, c) => { b.fillStyle = c; b.fillRect(x, y, w, h); };
    const sky = ['#7cc4ec', '#9fd4f0', '#c4e6f4'];
    for (let y = 0; y < 30; y++) rect(0, y, VW, 1, sky[Math.min(2, Math.floor(y / 10))]);
    for (let x = 0; x < VW; x++) {   // far hills and trees
      const h = 20 + Math.round(Math.sin(x / 13) * 3);
      rect(x, h, 1, 30 - h, '#8ab8a0');
      const tr = 25 + Math.round(Math.abs(Math.sin(x / 3.3)) * 4);
      rect(x, tr, 1, 34 - tr, x % 7 < 3 ? '#3f8a45' : '#2f7a3a');
    }
    for (let y = 34; y < VH; y++) {  // the pond, darker where it's deep
      const k = (y - 34) / (VH - 34);
      for (let x = 0; x < VW; x++) {
        const deep = Math.max(0, 1 - Math.hypot(x - 100, (y - 70) * 1.6) / 70);
        const c = deep > 0.55 ? '#2f6ea8' : deep > 0.25 ? '#3a82bc' : k < 0.1 ? '#6fb0d8' : '#4a98cc';
        px(x, y, c);
      }
    }
    rect(0, 33, VW, 2, '#5aa04a');
    for (const [x, y] of [[130, 50], [142, 92], [118, 104], [70, 46]]) {   // lily pads
      b.fillStyle = '#4a9a4a'; b.beginPath(); b.ellipse(x, y, 5, 2, 0, 0.4, Math.PI * 2); b.fill();
      px(x + 2, y - 1, '#f2a0c0');
    }
    // the pier
    rect(0, 88, 46, 6, '#a8784a');
    for (let x = 0; x < 46; x += 6) rect(x, 88, 1, 6, '#7a5232');
    rect(0, 94, 46, 2, '#6a4224');
    for (const x of [4, 22, 40]) rect(x, 96, 3, 24, '#5a3a1e');
    rect(0, 86, 46, 2, '#c8966a');
  }

  // ---------------------------------------------------------------- the Pokémon on the pier
  let pet = null;   // { frames: [canvas], durs, w, h, cx, cy, ground }
  async function loadPet() {
    const id = state.settings.pokemon;
    const rec = state.pets[id] || {};
    const toCanvas = (img) => { const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; c.getContext('2d').putImageData(new ImageData(img.data, img.width, img.height), 0, 0); return c; };
    if (rec.stage === 'egg') {
      const seed = [...id].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7);
      const c = toCanvas(SP.ballRgba(seed, 0));
      pet = { frames: [c], durs: [1000], w: c.width, h: c.height, cx: c.width / 2, cy: c.height };
      return;
    }
    const away = state.expedition && state.expedition.petId === id;
    if (away) { pet = null; return; }
    const asset = await api.invoke('pokemon:assets', id).catch(() => null);
    if (asset && asset.kind === 'pmd') {
      const a = asset.anims.Idle || Object.values(asset.anims)[0];
      const img = await new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = a.url; });
      if (!img) return;
      const row = Math.min(2, Math.floor(img.height / a.fh) - 1);   // row 2: facing right, towards the water
      const frames = a.durs.map((_, i) => {
        const c = document.createElement('canvas');
        c.width = a.fw; c.height = a.fh;
        c.getContext('2d').drawImage(img, i * a.fw, row * a.fh, a.fw, a.fh, 0, 0, a.fw, a.fh);
        return c;
      });
      pet = { frames, durs: a.durs.map((d) => (d * 1000) / 60), w: a.fw, h: a.fh, cx: a.fw / 2, cy: a.fh / 2 + 8 };
    } else if (SP.DEFS[id]) {
      const c = toCanvas(SP.rgba(id, 'open', false));
      pet = { frames: [c], durs: [1000], w: c.width, h: c.height, cx: c.width / 2, cy: c.height };
    }
  }

  // ---------------------------------------------------------------- game state
  const TIP = { x: 50, y: 64 };          // rod tip
  const game = {
    phase: 'idle',            // idle | charging | flying | waiting | bite | reel | result
    power: 0, powerDir: 1,
    bob: { x: 0, y: 0 }, from: null, to: null, flyStart: 0,
    waitUntil: 0, nextNibble: 0, nibbleUntil: 0,
    bite: null, biteUntil: 0,
    tension: 0, progress: 0, pull: 1, nextPull: 0, holding: false,
    message: '', messageUntil: 0
  };

  const randRange = (a, b) => a + Math.random() * (b - a);
  // the cast's power is its depth (0 near the pier … 1 far out); its colour zone is the difficulty
  const zoneOf = (p) => (p < 0.4 ? 0 : p < 0.75 ? 1 : 2);
  const ZONE_KEYS = ['easy', 'normal', 'hard'];
  const ZONE_COLORS = ['#6cbf5a', '#f5c93a', '#e2463b'];

  function say(key, vars, ms = 2200) { game.message = t(key, vars); game.messageUntil = Date.now() + ms; }

  function setHint() {
    const key = { idle: 'fish.hint.idle', charging: 'fish.hint.charging', flying: 'fish.hint.waiting',
      waiting: 'fish.hint.waiting', bite: 'fish.hint.bite', reel: 'fish.hint.reel', result: '' }[game.phase];
    $('#hint').textContent = game.message && Date.now() < game.messageUntil ? game.message : key ? t(key) : '';
    const caught = Object.keys(state.fishdex || {}).length;
    $('#count').textContent = t('fish.count', { n: caught, total: state.fish.length });
  }

  // ---------------------------------------------------------------- input: mouse or space
  function press() {
    if (game.phase === 'idle') { game.phase = 'charging'; game.power = 0; game.powerDir = 1; return; }
    if (game.phase === 'bite') { hook(); return; }
    if (game.phase === 'reel') game.holding = true;
    if (game.phase === 'waiting' || game.phase === 'flying') { reelIn(); }
  }
  function release() {
    if (game.phase === 'charging') cast();
    game.holding = false;
  }
  canvas.addEventListener('mousedown', (e) => { if (e.button === 0) press(); });
  window.addEventListener('mouseup', release);
  window.addEventListener('keydown', (e) => { if (e.code === 'Space' && !e.repeat) { e.preventDefault(); if (game.phase !== 'result') press(); else closeResult(); } });
  window.addEventListener('keyup', (e) => { if (e.code === 'Space') release(); });
  window.addEventListener('blur', release);

  function cast() {
    game.depth = game.power;
    const land = 62 + game.power * 88;
    say(`fish.zone.${ZONE_KEYS[zoneOf(game.power)]}`, null, 2600);
    game.from = { ...TIP };
    game.to = { x: Math.round(land), y: Math.round(52 + game.power * 34 + randRange(-4, 4)) };
    game.flyStart = Date.now();
    game.phase = 'flying';
    Sound.play('blip');
  }

  /** Pull the line back in before anything bites. */
  function reelIn() {
    game.phase = 'idle';
    say('fish.msg.reeledIn');
  }

  async function startBite() {
    const res = await api.invoke('fish:bite', game.depth).catch(() => null);
    if (!res || game.phase !== 'waiting') return;
    game.bite = res;
    game.phase = 'bite';
    game.biteUntil = Date.now() + res.bite;
    Sound.play('alarm');
  }

  function hook() {
    game.phase = 'reel';
    game.tension = 30; game.progress = 20; game.holding = true;
    game.pull = 1; game.nextPull = 0;
  }

  function lose(key) {
    if (game.bite) api.send('fish:lost', game.bite.token);
    game.bite = null;
    game.phase = 'idle';
    say(key);
    Sound.play('switch');
  }

  async function win() {
    game.phase = 'result';
    const res = await api.invoke('fish:land', game.bite.token).catch(() => null);
    game.bite = null;
    if (!res || !res.ok) { game.phase = 'idle'; return; }
    Sound.play('fanfare');
    showResult(res);
  }

  // ---------------------------------------------------------------- result card
  const TIER_KEYS = ['common', 'uncommon', 'rare', 'veryRare'];
  async function showResult(r) {
    $('#resName').textContent = r.names[L()] || r.names.en;
    $('#resSize').textContent = t('fish.size', { n: r.size });
    $('#resReward').textContent = [r.berries ? `+${r.berries} 🍓` : null, t('fish.xp', { n: r.xp })].filter(Boolean).join(' · ');
    $('#resTags').replaceChildren(...[
      r.isNew ? ['new', t('fish.tag.new')] : null,
      r.best ? ['best', t('fish.tag.best')] : null,
      r.shiny ? ['shiny', t('fish.tag.shiny')] : null,
      ['tier', t(`fish.tier.${TIER_KEYS[r.tier]}`)]
    ].filter(Boolean).map(([c, txt]) => { const s = document.createElement('span'); s.className = c; s.textContent = txt; return s; }));
    $('#resFace').removeAttribute('src');
    $('#resOk').textContent = t('fish.again');
    // it wants to come along: keep it or let it swim off
    const name = r.names[L()] || r.names.en;
    $('#resJoin').classList.toggle('hidden', !r.join);
    $('#resOk').classList.toggle('hidden', !!r.join);
    if (r.join) {
      $('#joinText').textContent = t('fish.join', { name });
      $('#joinKeep').textContent = t('join.keep');
      $('#joinRelease').textContent = t('join.release');
      const answer = async (keep) => {
        await api.invoke('join:answer', r.join, keep);
        $('#resJoin').classList.add('hidden');
        $('#resOk').classList.remove('hidden');
        game.message = t(keep ? 'fish.joined' : 'fish.released', { name }); game.messageUntil = Date.now() + 3000;
      };
      $('#joinKeep').onclick = () => answer(true);
      $('#joinRelease').onclick = () => answer(false);
    }
    $('#result').classList.remove('hidden');
    const url = await api.invoke('diary:portrait', r.dex, 'Happy', r.shiny).catch(() => null);
    if (url) $('#resFace').src = url;
  }
  function closeResult() {
    if (!$('#resJoin').classList.contains('hidden')) return;   // answer first
    $('#result').classList.add('hidden');
    game.phase = 'idle';
  }
  $('#resOk').addEventListener('click', closeResult);

  // ---------------------------------------------------------------- loop
  let last = performance.now();
  function step(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const ms = Date.now();

    if (game.phase === 'charging') {
      game.power += game.powerDir * dt * 1.1;
      if (game.power >= 1) { game.power = 1; game.powerDir = -1; }
      if (game.power <= 0) { game.power = 0; game.powerDir = 1; }
    }
    if (game.phase === 'flying') {
      const k = Math.min(1, (ms - game.flyStart) / 650);
      game.bob.x = game.from.x + (game.to.x - game.from.x) * k;
      game.bob.y = game.from.y + (game.to.y - game.from.y) * k - Math.sin(k * Math.PI) * 26;
      if (k >= 1) {
        game.phase = 'waiting';
        game.waitUntil = ms + randRange(2500, 8000);
        game.nextNibble = ms + randRange(700, 2000);
        Sound.play('pat');
      }
    }
    if (game.phase === 'waiting') {
      if (ms > game.nextNibble) { game.nibbleUntil = ms + 220; game.nextNibble = ms + randRange(900, 2600); }
      if (ms > game.waitUntil) { game.waitUntil = Infinity; startBite(); }
    }
    if (game.phase === 'bite' && ms > game.biteUntil) lose('fish.msg.tooSlow');
    if (game.phase === 'reel') {
      const b = game.bite;
      // the fish tugs in bursts; a strong tug barely lets you gain line, so ease off when it pulls
      if (ms > game.nextPull) { game.pull = randRange(0.4, 1.7) * b.pull; game.nextPull = ms + randRange(400, 1200); }
      if (game.holding) {
        game.tension += dt * (18 + 28 * game.pull);
        game.progress += dt * (28 - 8 * game.pull);
      } else {
        // letting go relaxes the line quickly; let it go slack and the fish swims off fast
        game.tension -= dt * 60;
        game.progress -= dt * (game.tension < 25 ? 9 + 5 * b.pull : 2 + 2 * b.pull);
      }
      game.tension = Math.max(0, game.tension);
      if (game.tension >= 100) lose('fish.msg.snapped');
      else if (game.progress <= 0) lose('fish.msg.escaped');
      else if (game.progress >= 100) win();
    }

    draw(ms);
    $('#reel').classList.toggle('hidden', game.phase !== 'reel');
    $('#tension').style.width = `${Math.min(100, game.tension)}%`;
    $('#tension').parentElement.classList.toggle('danger', game.tension > 75);
    $('#progress').style.width = `${Math.max(0, Math.min(100, game.progress))}%`;
    if (state) setHint();
    requestAnimationFrame(step);
  }

  function draw(ms) {
    g.setTransform(S, 0, 0, S, 0, 0);
    g.imageSmoothingEnabled = false;
    g.drawImage(bg, 0, 0);
    // ripples
    g.fillStyle = 'rgba(255,255,255,0.35)';
    for (let k = 0; k < 9; k++) {
      const x = (k * 37 + ms / 90) % VW, y = 40 + ((k * 23) % 70);
      g.fillRect(Math.round(x), y, 4, 1);
    }

    // the Pokémon sitting on the pier, and the rod
    if (pet) {
      let tt = ms % pet.durs.reduce((s, d) => s + d, 0), i = 0;
      for (; i < pet.durs.length - 1 && tt >= pet.durs[i]; i++) tt -= pet.durs[i];
      const f = pet.frames[i];
      const scale = pet.h > 40 ? 0.75 : 1;
      g.drawImage(f, Math.round(24 - pet.cx * scale), Math.round(88 - pet.cy * scale), Math.round(pet.w * scale), Math.round(pet.h * scale));
    }
    g.strokeStyle = '#6a4224'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(32.5, 86.5); g.lineTo(TIP.x + 0.5, TIP.y + 0.5); g.stroke();

    // line and bobber
    const inWater = ['waiting', 'bite', 'reel'].includes(game.phase);
    if (game.phase === 'flying' || inWater) {
      let by = game.bob.y;
      if (game.phase === 'waiting') by += ms < game.nibbleUntil ? 1 : Math.sin(ms / 300) > 0.6 ? 0.5 : 0;
      if (game.phase === 'bite') by += 2;
      if (game.phase === 'reel') {
        // the fish pulls the bobber around; reeling brings it closer
        const k = Math.max(0, Math.min(1, game.progress / 100));
        game.bob.x += ((TIP.x + 8) - game.bob.x) * k * 0.02 + Math.sin(ms / 120) * game.pull * 0.4;
        by = game.bob.y + Math.sin(ms / 90) * 1.5;
      }
      g.strokeStyle = 'rgba(255,255,255,0.8)';
      g.beginPath(); g.moveTo(TIP.x + 0.5, TIP.y + 0.5);
      g.quadraticCurveTo((TIP.x + game.bob.x) / 2, Math.max(TIP.y, by) + (inWater ? 6 : 0), game.bob.x + 0.5, by + 0.5); g.stroke();
      if (inWater) { g.fillStyle = 'rgba(255,255,255,0.5)'; g.fillRect(Math.round(game.bob.x) - 3, Math.round(game.bob.y) + 3, 7, 1); }
      g.fillStyle = '#e2463b'; g.fillRect(Math.round(game.bob.x) - 1, Math.round(by) - 2, 3, 2);
      g.fillStyle = '#ffffff'; g.fillRect(Math.round(game.bob.x) - 1, Math.round(by), 3, 2);
      // a fish shadow circling while you wait
      if (game.phase === 'waiting' || game.phase === 'bite') {
        const a = ms / 700, r = game.phase === 'bite' ? 2 : 9;
        g.fillStyle = 'rgba(20,40,70,0.35)';
        g.beginPath(); g.ellipse(game.bob.x + Math.cos(a) * r, game.bob.y + 5 + Math.sin(a) * r * 0.4, 5, 2, 0, 0, Math.PI * 2); g.fill();
      }
      if (game.phase === 'bite') {   // the "!" bubble
        g.fillStyle = '#ffffff'; g.fillRect(Math.round(game.bob.x) - 3, Math.round(by) - 14, 7, 9);
        g.fillStyle = '#e2463b'; g.fillRect(Math.round(game.bob.x), Math.round(by) - 12, 1, 4); g.fillRect(Math.round(game.bob.x), Math.round(by) - 7, 1, 1);
      }
    }

    // power meter while charging
    if (game.phase === 'charging') {
      // the three zones, dimmed, with the current power filled in its zone's colour
      // on the right edge, clear of the Pokémon on the pier
      const X = 148, B = 76, H = 36;
      g.fillStyle = '#2a2420'; g.fillRect(X - 1, B - H - 1, 8, H + 2);
      const zone = (a, b, c) => { g.fillStyle = c; g.fillRect(X, B - Math.round(H * b), 6, Math.round(H * (b - a))); };
      g.globalAlpha = 0.35; zone(0, 0.4, ZONE_COLORS[0]); zone(0.4, 0.75, ZONE_COLORS[1]); zone(0.75, 1, ZONE_COLORS[2]); g.globalAlpha = 1;
      const h = Math.round(H * game.power);
      g.fillStyle = ZONE_COLORS[zoneOf(game.power)];
      g.fillRect(X, B - h, 6, h);
      g.fillStyle = '#ffffff'; g.fillRect(X - 1, B - h, 8, 1);
    }
  }

  // ---------------------------------------------------------------- start
  function labels() {
    $('#lblTension').textContent = t('fish.tension');
    $('#lblCatch').textContent = t('fish.catch');
  }
  api.on('state', async (s) => {
    const prev = state;
    state = s;
    Sound.setEnabled(s.settings.sound);
    document.title = t('fish.title');
    labels();
    if (!prev || prev.settings.pokemon !== s.settings.pokemon) await loadPet();
  });
  (async () => {
    state = await api.invoke('state:get');
    Sound.setEnabled(state.settings.sound);
    document.title = t('fish.title');
    labels();
    paintScene();
    await loadPet();
    requestAnimationFrame(step);
  })();
})();
