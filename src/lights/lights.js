/* PokePet Explorer – Chinchou Lights. A 4×4 pond of Chinchou; tapping one switches it and its neighbours – light them
 * all. The main process makes each pond, replays the taps and rewards it (main/lights.js). */
(() => {
  const api = window.api;
  const I18N = window.PokeI18N;
  const Sound = window.PokeSound;
  const Anim = window.PokeAnim;
  const $ = (s) => document.querySelector(s);

  const SIZE = 4;
  let state = null;
  const L = () => (state ? state.settings.lang : 'en');
  const t = (k, v) => I18N.t(L(), k, v);

  let game = null;   // { token, face, board, par, taps, busy }

  function phase(p) { document.body.dataset.phase = p; }

  function showCount(info) {
    if (!info) return;
    const mins = (at) => Math.max(1, Math.ceil((at - Date.now()) / 60000));
    $('#count').textContent = info.free ? t('lights.free')
      : info.left > 0 ? t('lights.left', { n: info.dayLeft, max: info.max, h: info.hourLeft, hmax: info.hourMax })
      : info.dayLeft > 0 ? t('lights.rest', { m: mins(info.nextAt) }) : t('lights.tired');
  }

  function labels() {
    document.title = t('lights.title');
    $('#title').textContent = t('lights.title');
  }

  function verdict(text, cls = '') {
    $('#verdict').className = `verdict ${cls}`;
    $('#verdict').textContent = text;
  }

  function score() {
    $('#score').textContent = game ? t('lights.score', { n: game.taps.length, par: game.par }) : '';
  }

  function neighbours(i) {
    const r = Math.floor(i / SIZE), c = i % SIZE, out = [];
    if (r > 0) out.push(i - SIZE);
    if (r < SIZE - 1) out.push(i + SIZE);
    if (c > 0) out.push(i - 1);
    if (c < SIZE - 1) out.push(i + 1);
    return out;
  }

  // Chinchou's animated sprite in every cell; its portrait, then 💡, if there's no sprite
  let sprite = null, portrait = null, players = [];
  function draw(board, face = portrait) {
    for (const p of players) p.stop();
    players = [];
    const cells = board.map((on, i) => {
      const el = document.createElement('div');
      el.className = `lamp ${on ? 'on' : 'off'}`;
      el.dataset.cell = i;
      if (sprite) {
        const cv = document.createElement('canvas');
        cv.width = cv.height = 64;
        el.append(cv);
        players.push(new Anim.Player(cv, sprite, 0.85));
      } else if (face) {
        const img = document.createElement('img');
        img.src = face;
        img.alt = '';
        el.append(img);
      } else {
        const b = document.createElement('span');
        b.className = 'bulb';
        b.textContent = '💡';
        el.append(b);
      }
      el.addEventListener('click', () => tap(i));
      return el;
    });
    $('#pond').replaceChildren(...cells);
  }

  function tap(i) {
    if (!game || game.busy || document.body.dataset.phase !== 'play') return;
    for (const j of [i, ...neighbours(i)]) game.board[j] = !game.board[j];
    game.taps.push(i);
    const lamps = document.querySelectorAll('#pond .lamp');
    game.board.forEach((on, j) => { lamps[j].className = `lamp ${on ? 'on' : 'off'}`; });
    Sound.play('blip');
    score();
    if (game.board.every(Boolean)) finish();
  }

  async function finish() {
    game.busy = true;
    phase('done');
    const res = await api.invoke('lights:finish', game.token, game.taps);
    game = null;
    if (!res.ok) { idle(t('lights.rules')); return; }
    const r = res.reward;
    Sound.play(r.berries >= 3 ? 'fanfare' : 'chime');
    verdict(t('lights.result', { n: r.taps, par: r.par, b: r.berries, xp: r.xp, best: res.best }), 'win');
    showCount(res.info);
    button(t('lights.again'));
  }

  function button(label) {
    $('#next').textContent = label;
    $('#next').disabled = false;
    $('#next').onclick = start;
    $('#next').classList.remove('hidden');
  }

  function idle(text) {
    game = null;
    phase('idle');
    score();
    draw([true, false, true, false, false, true, false, true, true, false, true, false, false, true, false, true]);
    verdict(text);
    button(t('lights.start'));
  }

  async function start() {
    $('#next').disabled = true;
    const res = await api.invoke('lights:start');
    if (!res.ok) {
      const mins = Math.max(1, Math.ceil(((res.nextAt || Date.now()) - Date.now()) / 60000));
      verdict(res.error === 'rest' ? t('lights.rest', { m: mins }) : res.error === 'tired' ? t('lights.tired') : t('lights.rules'));
      $('#next').disabled = false;
      return;
    }
    showCount(res.info);
    $('#next').classList.add('hidden');
    game = { token: res.token, face: res.face, board: res.board, par: res.par, taps: [], busy: false };
    draw(game.board, game.face || portrait);
    verdict(t('lights.go'));
    Sound.play('switch');
    phase('play');
    score();
  }

  api.on('state', (s) => {
    state = s;
    Sound.setEnabled(s.settings.sound);
    labels();
    if (!game) showCount(s.lights);
  });
  (async () => {
    state = await api.invoke('state:get');
    Sound.setEnabled(state.settings.sound);
    labels();
    showCount(state.lights);
    idle(t('lights.rules'));
    sprite = await Anim.load(170, false, ['Idle']);
    if (!sprite) portrait = await api.invoke('diary:portrait', 170, 'Normal', false).catch(() => null);
    if (!sprite && !portrait) return;
    // the first download can finish after a pond was started: redraw whichever board is showing
    if (game) draw(game.board, game.face || portrait); else idle(t('lights.rules'));
  })();
})();
