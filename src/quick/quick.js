/* PokePet Explorer – Quick Attack. Your partner waits in the grass; when the "!" flashes, click (or press Space) as
 * fast as you can. The main process picks each wait, times each click and rewards the round (main/quick.js). */
(() => {
  const api = window.api;
  const I18N = window.PokeI18N;
  const Sound = window.PokeSound;
  const $ = (s) => document.querySelector(s);

  let state = null;
  const L = () => (state ? state.settings.lang : 'en');
  const t = (k, v) => I18N.t(L(), k, v);

  const LATE_MS = 1500;   // matches main/quick.js: no click by then and the draw is lost
  let game = null;   // { token, face, draws, n, points, busy }
  let goTimer = 0;
  let lateTimer = 0;

  function phase(p) { document.body.dataset.phase = p; }

  function showCount(info) {
    if (!info) return;
    const mins = (at) => Math.max(1, Math.ceil((at - Date.now()) / 60000));
    $('#count').textContent = info.free ? t('quick.free')
      : info.left > 0 ? t('quick.left', { n: info.dayLeft, max: info.max, h: info.hourLeft, hmax: info.hourMax })
      : info.dayLeft > 0 ? t('quick.rest', { m: mins(info.nextAt) }) : t('quick.tired');
  }

  function labels() {
    document.title = t('quick.title');
    $('#title').textContent = t('quick.title');
  }

  function verdict(text, cls = '') {
    $('#verdict').className = `verdict ${cls}`;
    $('#verdict').textContent = text;
  }

  function score() {
    $('#score').textContent = game ? t('quick.score', { n: Math.min(game.n + 1, game.draws), max: game.draws, p: game.points }) : '';
  }

  function face(url) {
    if (url) {
      const img = document.createElement('img');
      img.src = url;
      img.alt = '';
      $('#face').replaceChildren(img);
    } else $('#face').textContent = '⚡';
  }

  function dots(draws, grades = []) {
    $('#dots').replaceChildren(...Array.from({ length: draws }, (_, i) => {
      const d = document.createElement('div');
      d.className = `dot ${grades[i] || ''}`;
      return d;
    }));
  }

  // wait for the "!": the main process picks how long
  async function ready() {
    if (!game) return;
    $('#ms').textContent = '';
    document.body.classList.remove('hit-good');
    score();
    verdict(t('quick.wait'));
    phase('wait');
    const res = await api.invoke('quick:ready', game.token);
    if (!res.ok || !game) return;
    goTimer = setTimeout(() => {
      if (!game || document.body.dataset.phase !== 'wait') return;
      phase('go');
      verdict(t('quick.go'), 'win');
      Sound.play('switch');
      lateTimer = setTimeout(hit, LATE_MS);
    }, res.wait);
  }

  async function hit() {
    const p = document.body.dataset.phase;
    if (!game || game.busy || (p !== 'wait' && p !== 'go')) return;
    game.busy = true;
    clearTimeout(goTimer);
    clearTimeout(lateTimer);
    phase('hit');
    const res = await api.invoke('quick:hit', game.token);
    game.busy = false;
    if (!res.ok) return;
    game.n = res.n;
    game.points = res.points;
    game.grades.push(res.grade);
    dots(game.draws, game.grades);
    const good = res.grade === 'great' || res.grade === 'good' || res.grade === 'ok';
    document.body.classList.toggle('hit-good', good);
    $('#ms').textContent = res.ms === null ? t('quick.tooSoon') : t('quick.ms', { ms: res.ms });
    verdict(t(`quick.${res.grade}`), good ? 'win' : 'lose');
    Sound.play(res.grade === 'great' ? 'chime' : good ? 'blip' : 'buzz');
    if (res.done) { done(res); return; }
    setTimeout(ready, 1100);
  }

  function done(res) {
    phase('done');
    const r = res.reward;
    game = null;
    score();
    setTimeout(() => {
      Sound.play(r.points >= 10 ? 'fanfare' : 'chime');
      verdict(t('quick.result', { p: r.points, best: r.best === null ? '–' : r.best, b: r.berries, xp: r.xp, rec: res.record || '–' }), r.points >= 10 ? 'win' : '');
    }, 700);
    showCount(res.info);
    button(t('quick.again'));
  }

  function button(label) {
    $('#next').textContent = label;
    $('#next').disabled = false;
    $('#next').onclick = start;
    $('#next').classList.remove('hidden');
  }

  function idle(text) {
    game = null;
    clearTimeout(goTimer);
    clearTimeout(lateTimer);
    phase('idle');
    score();
    $('#ms').textContent = '';
    face(null);
    dots(5);
    verdict(text);
    button(t('quick.start'));
  }

  async function start() {
    $('#next').disabled = true;
    const res = await api.invoke('quick:start');
    if (!res.ok) {
      const mins = Math.max(1, Math.ceil(((res.nextAt || Date.now()) - Date.now()) / 60000));
      verdict(res.error === 'rest' ? t('quick.rest', { m: mins }) : res.error === 'tired' ? t('quick.tired') : t('quick.rules'));
      $('#next').disabled = false;
      return;
    }
    showCount(res.info);
    $('#next').classList.add('hidden');
    game = { token: res.token, face: res.face, draws: res.draws, n: 0, points: 0, grades: [], busy: false };
    face(game.face);
    dots(game.draws);
    ready();
  }

  $('#arena').addEventListener('mousedown', hit);
  $('#arena').addEventListener('click', (e) => { if (e.detail === 0) hit(); });   // a scripted click (the self-test)
  document.addEventListener('keydown', (e) => {
    if (e.code !== 'Space' && e.code !== 'Enter') return;
    e.preventDefault();
    if (game) hit();
    else if (!$('#next').classList.contains('hidden') && !$('#next').disabled) start();
  });

  api.on('state', (s) => {
    state = s;
    Sound.setEnabled(s.settings.sound);
    labels();
    if (!game) showCount(s.quick);
  });
  (async () => {
    state = await api.invoke('state:get');
    Sound.setEnabled(state.settings.sound);
    labels();
    showCount(state.quick);
    idle(t('quick.rules'));
  })();
})();
