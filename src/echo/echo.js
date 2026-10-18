/* PokePet Explorer – Chatot Echo. A Simon game: Chatot sings a tune on four type pads, one note longer each time,
 * and you sing it back. The main process makes the tune, checks every answer and rewards the round (main/echo.js). */
(() => {
  const api = window.api;
  const I18N = window.PokeI18N;
  const Sound = window.PokeSound;
  const Anim = window.PokeAnim;
  const $ = (s) => document.querySelector(s);

  const PADS = ['fire', 'water', 'grass', 'electric'];
  const ICON = { fire: '🔥', water: '💧', grass: '🌿', electric: '⚡' };   // until the pad's Pokémon has been downloaded
  const DEX = { fire: 4, water: 7, grass: 1, electric: 25 };   // Charmander, Squirtle, Bulbasaur, Pikachu
  const SONG = { fire: 'padFire', water: 'padWater', grass: 'padGrass', electric: 'padElectric' };

  let state = null;
  const L = () => (state ? state.settings.lang : 'en');
  const t = (k, v) => I18N.t(L(), k, v);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  let game = null;   // { token, seq, ms, input }

  function phase(p) { document.body.dataset.phase = p; }

  function showCount(info) {
    if (!info) return;
    const mins = (at) => Math.max(1, Math.ceil((at - Date.now()) / 60000));
    $('#count').textContent = info.free ? t('echo.free')
      : info.left > 0 ? t('echo.left', { n: info.dayLeft, max: info.max, h: info.hourLeft, hmax: info.hourMax })
      : info.dayLeft > 0 ? t('echo.rest', { m: mins(info.nextAt) }) : t('echo.tired');
  }

  function labels() {
    document.title = t('echo.title');
    $('#title').textContent = t('echo.title');
    $('#keys').textContent = t('echo.keys');
    for (const p of document.querySelectorAll('.pad')) p.lastChild.textContent = t(`type.${p.dataset.pad}`);
  }

  const padEl = (pad) => document.querySelector(`.pad[data-pad="${pad}"]`);

  // light = false: only the note sounds (Chatot's tune – you have to listen, the pads stay dark)
  async function flash(pad, ms, light = true) {
    const el = padEl(pad);
    if (light) el.classList.add('lit');
    Sound.play(SONG[pad]);
    await sleep(ms);
    el.classList.remove('lit');
  }

  // before a game: each pad once, lit, so you know how they sound
  async function intro() {
    phase('intro');
    verdict(t('echo.intro'));
    await sleep(400);
    for (const pad of PADS) {
      if (!game) return;
      await flash(pad, 520);
      await sleep(160);
    }
    await sleep(500);
  }

  function score() {
    $('#score').textContent = game ? t('echo.round', { n: game.seq.length, cleared: game.seq.length - 1 }) : '';
  }

  function verdict(text, cls = '') {
    $('#verdict').className = `verdict ${cls}`;
    $('#verdict').textContent = text;
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
    verdict(text);
    button(t('echo.start'));
  }

  // Chatot sings the tune, then it's your turn
  async function sing() {
    phase('show');
    score();
    verdict(t('echo.listen'));
    $('#bird').classList.add('sing');
    await sleep(600);
    for (const pad of game.seq) {
      if (!game) return;
      await flash(pad, game.ms, false);
      await sleep(Math.round(game.ms * 0.35));
    }
    $('#bird').classList.remove('sing');
    if (!game) return;
    game.input = [];
    verdict(t('echo.yours', { n: 0, len: game.seq.length }));
    phase('input');
  }

  async function start() {
    $('#next').disabled = true;
    const res = await api.invoke('echo:start');
    if (!res.ok) {
      const mins = Math.max(1, Math.ceil(((res.nextAt || Date.now()) - Date.now()) / 60000));
      verdict(res.error === 'rest' ? t('echo.rest', { m: mins }) : t('echo.tired'));
      $('#next').disabled = false;
      return;
    }
    showCount(res.info);
    $('#next').classList.add('hidden');
    game = { token: res.token, seq: res.seq, ms: res.ms, input: [] };
    Sound.play('switch');
    await sleep(400);
    await intro();
    if (game) sing();
  }

  function press(pad) {
    if (!game || document.body.dataset.phase !== 'input') return;
    const el = padEl(pad);
    el.classList.add('lit');
    setTimeout(() => el.classList.remove('lit'), 180);
    game.input.push(pad);
    const n = game.input.length;
    const wrong = pad !== game.seq[n - 1];
    if (!wrong) Sound.play(SONG[pad]);
    if (wrong || n === game.seq.length) submit(wrong);
    else verdict(t('echo.yours', { n, len: game.seq.length }));
  }

  async function submit(wrong) {
    phase('wait');
    const res = await api.invoke('echo:answer', game.token, game.input);
    if (!res.ok) { idle(t('echo.rules')); return; }
    if (!res.done) {
      verdict(t('echo.good'), 'win');
      game.seq = res.seq;
      game.ms = res.ms;
      await sleep(700);
      sing();
      return;
    }
    const r = res.reward;
    if (r.won) {
      Sound.play('fanfare');
      verdict(t('echo.won', { b: r.berries, xp: r.xp }), 'win');
    } else {
      Sound.play('buzz');
      const right = res.seq[Math.min(game.input.length, res.seq.length) - 1];
      if (wrong && right) padEl(right).classList.add('miss');
      setTimeout(() => { for (const p of document.querySelectorAll('.pad')) p.classList.remove('miss'); }, 1100);
      verdict(t('echo.wrong', { pad: `${ICON[right]} ${t(`type.${right}`)}`, cleared: r.cleared, b: r.berries, xp: r.xp, best: res.best }), 'lose');
    }
    showCount(res.info);
    game = null;
    phase('idle');
    button(t('echo.again'));
  }

  $('#pads').replaceChildren(...PADS.map((p) => {
    const el = document.createElement('div');
    el.className = 'pad';
    el.dataset.pad = p;
    const icon = document.createElement('span');
    icon.className = 'icon';
    icon.textContent = ICON[p];
    api.invoke('diary:portrait', DEX[p], 'Normal', false).catch(() => null).then((url) => {
      if (!url) return;
      const img = document.createElement('img');
      img.src = url;
      img.alt = '';
      icon.replaceChildren(img);
    });
    el.append(icon, document.createElement('small'));
    el.addEventListener('mousedown', () => press(p));
    return el;
  }));
  document.addEventListener('keydown', (e) => {
    const i = ['1', '2', '3', '4'].indexOf(e.key);
    if (i >= 0) press(PADS[i]);
  });

  api.on('state', (s) => {
    state = s;
    Sound.setEnabled(s.settings.sound);
    labels();
    if (!game) showCount(s.echo);
  });
  (async () => {
    state = await api.invoke('state:get');
    Sound.setEnabled(state.settings.sound);
    labels();
    showCount(state.echo);
    idle(t('echo.rules'));
    // Chatot itself in the middle, animated, instead of 🦜
    const sp = await Anim.load(441, false, ['Idle']);
    if (sp) {
      const cv = document.createElement('canvas');
      cv.width = cv.height = 64;
      $('#bird').replaceChildren(cv);
      new Anim.Player(cv, sp, 0.85);
    }
  })();
})();
