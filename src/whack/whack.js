/* PokePet Explorer – Whack-a-Diglett. Diglett pop out of nine holes; click them before they duck back down, but leave
 * the Voltorb alone. The main process counts the round and turns the score into rewards (shared/whack-rules.js). */
(() => {
  const api = window.api;
  const I18N = window.PokeI18N;
  const Sound = window.PokeSound;
  const Rules = window.PokeWhack;
  const $ = (s) => document.querySelector(s);

  const S = 3, VW = 160, VH = 140, PX = 2;   // pixel art at 160×140, shown 3× larger; the moles' pixels are 2×2
  const canvas = $('#field');
  const g = canvas.getContext('2d');
  g.imageSmoothingEnabled = false;

  let state = null;
  const L = () => (state ? state.settings.lang : 'en');
  const t = (k, v) => I18N.t(L(), k, v);

  // ---------------------------------------------------------------- the moles (pixel maps)
  const MAPS = {
    diglett: ['....oooo....', '..oobbbboo..', '.obbbbbbbbo.', '.obbbbbbbbo.', 'obbkbbbbkbbo', 'obbkbbbbkbbo', 'obbbbppbbbbo',
      'obbbppppbbbo', 'obbbbppbbbbo', 'obbbbbbbbbbo', 'obbbbbbbbbbo', 'obbbbbbbbbbo', 'obbbbbbbbbbo', 'obbbbbbbbbbo'],
    voltorb: ['....oooo....', '..oorrrroo..', '.orrrrrrrro.', '.orwwrrrrro.', 'orwrrrrrrrro', 'orkkrrrrkkro', 'orrkkrrkkrro',
      'oooooooooooo', 'owwwwwwwwwwo', '.owwwwwwwwo.', '.owwwwwwwwo.', '..oowwwwoo..', '....oooo....']
  };
  const COLORS = {
    diglett: { o: '#3a2418', b: '#9a6a40', k: '#1a1410', p: '#f08ca0' },
    gold: { o: '#5a3a10', b: '#f0c040', k: '#1a1410', p: '#f08ca0' },
    voltorb: { o: '#2a1a1a', r: '#e03838', w: '#f4f0ea', k: '#1a1410' }
  };
  const sprite = {};
  for (const kind of ['diglett', 'gold', 'voltorb']) {
    const map = MAPS[kind === 'gold' ? 'diglett' : kind];
    const c = document.createElement('canvas');
    c.width = map[0].length * PX; c.height = map.length * PX;
    const x = c.getContext('2d');
    map.forEach((row, y) => row.split('').forEach((ch, i) => {
      const col = COLORS[kind][ch];
      if (col) { x.fillStyle = col; x.fillRect(i * PX, y * PX, PX, PX); }
    }));
    sprite[kind] = c;
  }

  // ---------------------------------------------------------------- the field (drawn once)
  const HOLE = [];
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) HOLE.push({ x: 32 + c * 48, y: 56 + r * 34 });
  const bg = document.createElement('canvas');
  bg.width = VW; bg.height = VH;
  function paintField() {
    const b = bg.getContext('2d');
    const rect = (x, y, w, h, c) => { b.fillStyle = c; b.fillRect(x, y, w, h); };
    const sky = ['#8fd0f0', '#a8dcf4', '#c4e8f6'];
    for (let y = 0; y < 24; y++) rect(0, y, VW, 1, sky[Math.min(2, Math.floor(y / 8))]);
    for (let x = 0; x < VW; x++) {   // far hills
      const h = 16 + Math.round(Math.sin(x / 17) * 3 + Math.sin(x / 7) * 1.5);
      rect(x, h, 1, 24 - h, '#9cc8a4');
    }
    rect(0, 24, VW, VH - 24, '#6cb85a');
    for (let x = 3; x < VW; x += 7) for (let y = 30; y < VH; y += 11) rect(x + (y % 5), y, 1, 2, '#4f9a44');
    for (const h of HOLE) {   // a mound of dirt with the hole in it
      ellipse(b, h.x, h.y + 1, 17, 6, '#8a5a34');
      ellipse(b, h.x, h.y, 14, 4, '#2a1a10');
    }
  }
  function ellipse(c, cx, cy, rx, ry, col) {
    c.fillStyle = col;
    for (let y = -ry; y <= ry; y++) {
      const w = Math.round(rx * Math.sqrt(1 - (y * y) / (ry * ry)));
      c.fillRect(cx - w, cy + y, w * 2, 1);
    }
  }

  // ---------------------------------------------------------------- the round
  let round = null;   // { token, start, ends, score, moles: [hole] → { kind, at, until, hit } | null, next, pops, best }

  function hud() {
    $('#score').textContent = round ? t('whack.score', { n: round.score }) : '';
    $('#time').textContent = round ? t('whack.time', { s: Math.max(0, Math.ceil((round.ends - performance.now()) / 1000)) }) : '';
  }

  function showCount(info) {
    if (!info) return;
    const mins = (at) => Math.max(1, Math.ceil((at - Date.now()) / 60000));
    $('#count').textContent = info.free ? t('whack.free')
      : info.left > 0 ? t('whack.left', { n: info.dayLeft, max: info.max, h: info.hourLeft, hmax: info.hourMax })
      : info.dayLeft > 0 ? t('whack.rest', { m: mins(info.nextAt) }) : t('whack.tired');
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
    const res = await api.invoke('whack:start');
    if (!res.ok) {
      const mins = Math.max(1, Math.ceil(((res.nextAt || Date.now()) - Date.now()) / 60000));
      overlay(t('whack.title'), res.error === 'rest' ? t('whack.rest', { m: mins }) : t('whack.tired'), t('whack.ok'), null);
      return;
    }
    $('#overlay').classList.add('hidden');
    showCount(res.info);
    const now = performance.now();
    round = { token: res.token, start: now, ends: now + res.seconds * 1000, score: 0, moles: HOLE.map(() => null), next: now + 500, pops: [] };
    Sound.play('switch');
  }

  async function finish() {
    const r = round;
    round = null;
    hud();
    const res = await api.invoke('whack:finish', r.token, r.score);
    if (!res.ok) return;
    if (res.berries) Sound.play('fanfare'); else Sound.play('chime');
    overlay(t('whack.over'), t('whack.result', { n: res.score, b: res.berries, xp: res.xp, best: res.best }), t('whack.again'), start);
    showCount(res.info);
  }

  function spawn(now) {
    const p = (now - round.start) / (round.ends - round.start);   // 0 … 1 through the round
    const free = round.moles.map((m, i) => (m ? -1 : i)).filter((i) => i >= 0);
    if (free.length) {
      const i = free[Math.floor(Math.random() * free.length)];
      round.moles[i] = { kind: Rules.pickMole(Math.random(), p), at: now, until: now + Rules.upTime(p), hit: false };
    }
    round.next = now + 650 - p * 300 + Math.random() * 250;
  }

  const RISE = 140;   // ms to pop up / duck down
  function riseOf(m, now) {
    if (m.hit) return Math.max(0, 1 - (now - m.hit) / RISE);
    if (now < m.at + RISE) return (now - m.at) / RISE;
    if (now > m.until) return Math.max(0, 1 - (now - m.until) / RISE);
    return 1;
  }

  // ---------------------------------------------------------------- the loop
  function step(now) {
    if (round) {
      if (now >= round.ends) finish();
      else {
        if (now >= round.next) spawn(now);
        round.moles = round.moles.map((m) => (m && riseOf(m, now) <= 0 && now > m.at + RISE ? null : m));
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
    if (!r) return;
    r.moles.forEach((m, i) => {
      if (!m) return;
      const h = HOLE[i], c = sprite[m.kind];
      const y = h.y + 1 - Math.round(c.height * riseOf(m, now));
      g.save();
      g.beginPath();
      g.rect(h.x - 20, h.y - 40, 40, 41);   // only above the hole's edge
      g.clip();
      g.drawImage(c, h.x - c.width / 2, y);
      if (m.hit) {   // seeing stars
        g.fillStyle = '#ffe040';
        for (let k = 0; k < 3; k++) {
          const a = now / 120 + (k * Math.PI * 2) / 3;
          g.fillRect(Math.round(h.x + Math.cos(a) * 9), Math.round(y - 3 + Math.sin(a) * 2), 2, 2);
        }
      }
      g.restore();
    });
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

  canvas.addEventListener('mousedown', (e) => {
    if (!round) return;
    const now = performance.now();
    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * VW, y = ((e.clientY - rect.top) / rect.height) * VH;
    round.moles.forEach((m, i) => {
      if (!m || m.hit) return;
      const h = HOLE[i], c = sprite[m.kind];
      const top = h.y + 1 - c.height * riseOf(m, now);
      if (riseOf(m, now) < 0.4 || Math.abs(x - h.x) > c.width / 2 + 2 || y < top - 2 || y > h.y + 4) return;
      m.hit = now;
      const pts = Rules.POINTS[m.kind];
      round.score = Math.max(0, round.score + pts);
      round.pops.push({ x: h.x, y: top, text: pts > 0 ? `+${pts}` : `${pts}`, bad: pts < 0, until: now + 700 });
      Sound.play(pts > 0 ? 'blip' : 'pat');
    });
  });

  function labels() {
    document.title = t('whack.title');
    $('#hint').textContent = t('whack.hint');
  }

  api.on('state', (s) => {
    state = s;
    Sound.setEnabled(s.settings.sound);
    labels();
    if (!round) showCount(s.whack);
  });
  (async () => {
    state = await api.invoke('state:get');
    Sound.setEnabled(state.settings.sound);
    labels();
    paintField();
    showCount(state.whack);
    overlay(t('whack.title'), t('whack.rules'), t('whack.start'), start);
    requestAnimationFrame(step);
  })();
})();
