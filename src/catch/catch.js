/* PokePet Explorer – Berry Catch. Treats fall from the trees; move your Pokémon left and right (mouse or arrow keys)
 * to catch them. The main process counts the round and turns the score into rewards (shared/catch-rules.js). */
(() => {
  const api = window.api;
  const I18N = window.PokeI18N;
  const SP = window.PokeSprites;
  const Sound = window.PokeSound;
  const Rules = window.PokeCatch;
  const $ = (s) => document.querySelector(s);

  const S = 3, VW = 160, VH = 140, GROUND = 124;   // pixel art at 160×140, shown 3× larger
  const canvas = $('#field');
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
    const rect = (x, y, w, h, c) => { b.fillStyle = c; b.fillRect(x, y, w, h); };
    const sky = ['#8fd0f0', '#a8dcf4', '#c4e8f6', '#dcf2f8'];
    for (let y = 0; y < GROUND; y++) rect(0, y, VW, 1, sky[Math.min(3, Math.floor(y / 32))]);
    for (let x = 0; x < VW; x++) {   // far hills
      const h = 96 + Math.round(Math.sin(x / 17) * 4 + Math.sin(x / 7) * 1.5);
      rect(x, h, 1, GROUND - h, '#9cc8a4');
    }
    // the tree canopy along the top, with berries in it
    for (let x = 0; x < VW; x++) {
      const h = 16 + Math.round(Math.sin(x / 9) * 4 + Math.sin(x / 3.3) * 2);
      rect(x, 0, 1, h, '#3f8f4a');
      rect(x, h - 3, 1, 3, '#57a85c');
    }
    for (let i = 0; i < 14; i++) rect(6 + i * 11 + (i % 3), 6 + (i * 7) % 8, 2, 2, '#e03850');
    rect(0, GROUND, VW, VH - GROUND, '#6cb85a');
    rect(0, GROUND, VW, 2, '#8fd06e');
    for (let x = 3; x < VW; x += 7) rect(x, GROUND + 4 + (x % 5), 1, 2, '#4f9a44');
  }

  // ---------------------------------------------------------------- the treats (pixel glyphs, 2× size)
  const glyph = {};
  for (const name of ['berry', 'puff', 'star', 'poop']) {
    const img = SP.glyphRgba(name);
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    c.getContext('2d').putImageData(new ImageData(img.data, img.width, img.height), 0, 0);
    glyph[name] = c;
  }

  // ---------------------------------------------------------------- the partner
  let pet = null;   // { rows: { idle, left, right }: [frames], durs, w, h }
  async function loadPet() {
    const id = state.settings.pokemon;
    const rec = state.pets[id] || {};
    const toCanvas = (img) => { const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; c.getContext('2d').putImageData(new ImageData(img.data, img.width, img.height), 0, 0); return c; };
    if (rec.stage === 'egg') {
      const seed = [...id].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7);
      const c = toCanvas(SP.ballRgba(seed, 0));
      pet = { rows: { idle: [c], left: [c], right: [c] }, durs: { idle: [500], left: [500], right: [500] }, w: c.width, h: c.height };
      return;
    }
    const asset = await api.invoke('pokemon:assets', id).catch(() => null);
    if (!asset || asset.kind !== 'pmd') return;
    const load = (a) => new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = a.url; });
    const cut = (img, a, row) => a.durs.map((_, i) => {
      const c = document.createElement('canvas');
      c.width = a.fw; c.height = a.fh;
      c.getContext('2d').drawImage(img, i * a.fw, row * a.fh, a.fw, a.fh, 0, 0, a.fw, a.fh);
      return c;
    });
    const idle = asset.anims.Idle || Object.values(asset.anims)[0];
    const walk = asset.anims.Walk || idle;
    const [iImg, wImg] = await Promise.all([load(idle), load(walk)]);
    if (!iImg || !wImg) return;
    const rows = Math.floor(wImg.height / walk.fh);
    const ms = (a) => a.durs.map((d) => (d * 1000) / 60);
    pet = {
      rows: { idle: cut(iImg, idle, 0), right: cut(wImg, walk, Math.min(2, rows - 1)), left: cut(wImg, walk, rows > 6 ? 6 : 0) },
      durs: { idle: ms(idle), right: ms(walk), left: ms(walk) },
      w: Math.max(idle.fw, walk.fw), h: Math.max(idle.fh, walk.fh)
    };
  }

  // ---------------------------------------------------------------- the round
  let round = null;   // { token, ends, score, streak, items, next, x, target, facing, frame, frameAt, pops }
  const keys = { left: false, right: false };

  function hud() {
    $('#score').textContent = round ? t('catch.score', { n: round.score }) : '';
    $('#time').textContent = round ? t('catch.time', { s: Math.max(0, Math.ceil((round.ends - performance.now()) / 1000)) }) : '';
  }

  function showCount(info) {
    if (!info) return;
    const mins = (at) => Math.max(1, Math.ceil((at - Date.now()) / 60000));
    $('#count').textContent = info.free ? t('catch.free')
      : info.left > 0 ? t('catch.left', { n: info.dayLeft, max: info.max, h: info.hourLeft, hmax: info.hourMax })
      : info.dayLeft > 0 ? t('catch.rest', { m: mins(info.nextAt) }) : t('catch.tired');
  }

  function overlay(title, text, button, onClick) {
    $('#ovTitle').textContent = title;
    $('#ovText').textContent = text;
    $('#ovButton').textContent = button;
    $('#ovButton').disabled = !onClick;
    $('#ovButton').onclick = onClick;
    $('#overlay').classList.remove('hidden');
  }

  async function start() {
    $('#ovButton').disabled = true;
    const res = await api.invoke('catch:start');
    if (!res.ok) {
      const mins = Math.max(1, Math.ceil(((res.nextAt || Date.now()) - Date.now()) / 60000));
      overlay(t('catch.title'), res.error === 'rest' ? t('catch.rest', { m: mins }) : t('catch.tired'), t('catch.ok'), null);
      return;
    }
    $('#overlay').classList.add('hidden');
    showCount(res.info);
    const now = performance.now();
    round = { token: res.token, start: now, ends: now + res.seconds * 1000, score: 0, streak: 0, items: [], next: now + 600,
      x: VW / 2, target: VW / 2, facing: 'idle', frame: 0, frameAt: now, pops: [] };
    Sound.play('switch');
  }

  async function finish() {
    const r = round;
    round = null;
    hud();
    const res = await api.invoke('catch:finish', r.token, r.score);
    if (!res.ok) return;
    if (res.berries) Sound.play('fanfare'); else Sound.play('chime');
    overlay(t('catch.over'), t('catch.result', { n: res.score, b: res.berries, xp: res.xp, best: res.best }), t('catch.again'), start);
    showCount(res.info);
  }

  function spawn(now) {
    const p = (now - round.start) / (round.ends - round.start);   // 0 … 1 through the round
    const kind = Rules.pickItem(Math.random(), p);
    round.items.push({ kind, x: 8 + Math.random() * (VW - 16), y: 18, vy: 26 + p * 30 + Math.random() * 10 });
    round.next = now + 650 - p * 300 + Math.random() * 200;
  }

  // ---------------------------------------------------------------- the loop
  let last = performance.now();
  function step(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (round) {
      if (now >= round.ends) finish();
      else {
        if (now >= round.next) spawn(now);
        // move towards the mouse, or with the keys
        if (keys.left) round.target = Math.max(8, round.x - 30);
        if (keys.right) round.target = Math.min(VW - 8, round.x + 30);
        const dx = round.target - round.x;
        const move = Math.sign(dx) * Math.min(Math.abs(dx), 120 * dt);
        round.x += move;
        const facing = Math.abs(dx) > 1 ? (dx < 0 ? 'left' : 'right') : 'idle';
        if (facing !== round.facing) { round.facing = facing; round.frame = 0; round.frameAt = now; }
        // the treats fall; caught when they reach the Pokémon
        const top = GROUND - (pet ? pet.h * 0.55 : 14);
        for (const it of round.items) {
          it.y += it.vy * dt;
          if (!it.done && it.y >= top && it.y <= GROUND && Math.abs(it.x - round.x) < 11) {
            it.done = true;
            const pts = Rules.POINTS[it.kind];
            round.score = Math.max(0, round.score + pts);
            round.streak = pts > 0 ? round.streak + 1 : 0;
            round.pops.push({ x: it.x, y: top, text: pts > 0 ? `+${pts}` : `${pts}`, bad: pts < 0, until: now + 700 });
            Sound.play(pts > 0 ? 'blip' : 'pat');
          }
        }
        round.items = round.items.filter((it) => !it.done && it.y < GROUND + 4);
        round.pops = round.pops.filter((p) => p.until > now);
      }
    }
    draw(now);
    hud();
    requestAnimationFrame(step);
  }

  function draw(now) {
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.imageSmoothingEnabled = false;
    g.drawImage(bg, 0, 0, VW * S, VH * S);
    g.setTransform(S, 0, 0, S, 0, 0);
    const r = round;
    if (r) {
      for (const it of r.items) {
        const c = glyph[it.kind];
        g.drawImage(c, Math.round(it.x - c.width), Math.round(it.y - c.height * 2), c.width * 2, c.height * 2);
      }
    }
    if (pet) {
      const row = pet.rows[r ? r.facing : 'idle'];
      const durs = pet.durs[r ? r.facing : 'idle'];
      const st = r || idleAnim;
      if (now - st.frameAt > durs[st.frame % durs.length]) { st.frame = (st.frame + 1) % row.length; st.frameAt = now; }
      const f = row[st.frame % row.length];
      const x = r ? r.x : VW / 2;
      g.drawImage(f, Math.round(x - f.width / 2), Math.round(GROUND + 4 - f.height * 0.75));
    }
    if (r) {
      g.font = 'bold 8px sans-serif';
      g.textAlign = 'center';
      for (const p of r.pops) {
        const k = (p.until - now) / 700;
        g.fillStyle = p.bad ? '#e03030' : '#ffffff';
        g.strokeStyle = '#2a2420';
        g.lineWidth = 2;
        g.strokeText(p.text, p.x, p.y - (1 - k) * 12);
        g.fillText(p.text, p.x, p.y - (1 - k) * 12);
      }
    }
  }
  const idleAnim = { frame: 0, frameAt: 0 };

  canvas.addEventListener('mousemove', (e) => {
    if (!round) return;
    const rect = canvas.getBoundingClientRect();
    round.target = Math.max(8, Math.min(VW - 8, ((e.clientX - rect.left) / rect.width) * VW));
  });
  const keyOf = (e) => (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A' ? 'left' : e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D' ? 'right' : null);
  window.addEventListener('keydown', (e) => { const k = keyOf(e); if (k) { keys[k] = true; e.preventDefault(); } });
  window.addEventListener('keyup', (e) => { const k = keyOf(e); if (k) keys[k] = false; });

  function labels() {
    document.title = t('catch.title');
    $('#hint').textContent = t('catch.hint');
  }

  api.on('state', async (s) => {
    const prev = state;
    state = s;
    Sound.setEnabled(s.settings.sound);
    labels();
    if (!round) showCount(s.catchGame);
    if (!prev || prev.settings.pokemon !== s.settings.pokemon) await loadPet();
  });
  (async () => {
    state = await api.invoke('state:get');
    Sound.setEnabled(state.settings.sound);
    labels();
    paintScene();
    showCount(state.catchGame);
    overlay(t('catch.title'), t('catch.rules'), t('catch.start'), start);
    await loadPet();
    requestAnimationFrame(step);
  })();
})();
