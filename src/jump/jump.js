/* PokePet Explorer – Magikarp Jump. A power bar sweeps back and forth; stop it on the target and Magikarp splashes
 * high into the air. Five jumps a round. The main process makes the targets and grades every stop (main/jump.js). */
(() => {
  const api = window.api;
  const I18N = window.PokeI18N;
  const Sound = window.PokeSound;
  const Anim = window.PokeAnim;
  const $ = (s) => document.querySelector(s);

  const GRADE = ['jump.g0', 'jump.g1', 'jump.g2', 'jump.g3'];
  const SONG = ['buzz', 'blip', 'chime', 'levelup'];

  let state = null;
  const L = () => (state ? state.settings.lang : 'en');
  const t = (k, v) => I18N.t(L(), k, v);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const metres = (cm) => (cm / 100).toFixed(1);

  let round = null;   // { token, n, jumps, jump, total, height, t0, pos }
  let raf = 0;

  function phase(p) { document.body.dataset.phase = p; }

  function showCount(info) {
    if (!info) return;
    const mins = (at) => Math.max(1, Math.ceil((at - Date.now()) / 60000));
    $('#count').textContent = info.free ? t('jump.free')
      : info.left > 0 ? t('jump.left', { n: info.dayLeft, max: info.max, h: info.hourLeft, hmax: info.hourMax })
      : info.dayLeft > 0 ? t('jump.rest', { m: mins(info.nextAt) }) : t('jump.tired');
  }

  function labels() {
    document.title = t('jump.title');
    $('#title').textContent = t('jump.title');
    $('#keys').textContent = t('jump.keys');
  }

  function verdict(text, cls = '') {
    $('#verdict').className = `verdict ${cls}`;
    $('#verdict').textContent = text;
  }

  function score() {
    $('#score').textContent = round ? t('jump.round', { n: Math.min(round.n + 1, round.jumps), max: round.jumps, pts: round.total, m: metres(round.height) }) : '';
  }

  function zones(j) {
    const put = (el, half) => { el.style.left = `${(j.center - half) * 100}%`; el.style.width = `${half * 200}%`; };
    put($('#zOk'), j.ok); put($('#zGood'), j.good); put($('#zPerfect'), j.perfect);
  }

  const needle = (pos) => { $('#needle').style.left = `${pos * 100}%`; };

  // the bar sweeps 0 → 1 → 0 …, `speed` sweeps a second
  function sweep(now) {
    if (!round || document.body.dataset.phase !== 'aim') return;
    const p = (((now - round.t0) / 1000) * round.jump.speed) % 2;
    round.pos = p < 1 ? p : 2 - p;
    needle(round.pos);
    raf = requestAnimationFrame(sweep);
  }

  function aim() {
    zones(round.jump);
    needle(0);
    score();
    verdict(t('jump.aim'));
    round.t0 = performance.now();
    round.pos = 0;
    phase('aim');
    raf = requestAnimationFrame(sweep);
  }

  async function stop(pos) {
    if (!round || document.body.dataset.phase !== 'aim') return;
    cancelAnimationFrame(raf);
    phase('fly');
    if (pos != null) round.pos = pos;
    needle(round.pos);
    const res = await api.invoke('jump:stop', round.token, round.pos);
    if (!res.ok) { idle(t('jump.rules')); return; }
    round.total = res.total;
    round.height = res.height;
    const karp = $('#karp');
    Sound.play(SONG[res.points]);
    if (player) player.play(res.points === 0 ? 'Hurt' : 'Hop');
    if (res.points === 0) karp.classList.add('splash');
    else karp.style.transform = `translateY(-${Math.round(20 + res.points * 42)}px)`;
    $('#height').textContent = `${metres(res.cm)} m`;
    verdict(t(GRADE[res.points], { m: metres(res.cm) }), res.points ? 'win' : 'lose');
    await sleep(500);
    karp.style.transform = '';
    await sleep(600);
    karp.classList.remove('splash');
    $('#height').textContent = '';
    round.n++;
    score();
    if (!res.done) {
      round.jump = res.jump;
      aim();
      return;
    }
    const r = res.reward;
    Sound.play(r.total >= 10 ? 'fanfare' : 'chime');
    verdict(t('jump.result', { pts: r.total, m: metres(res.height), b: r.berries, xp: r.xp, best: res.best, high: metres(res.high) }), r.total >= 10 ? 'win' : '');
    showCount(res.info);
    round = null;
    phase('idle');
    button(t('jump.again'));
  }
  window.__stopAt = (pos) => stop(Math.max(0, Math.min(1, pos)));   // the self-test aims for the target

  // Magikarp's animated sprite; its portrait (from jump:start), then 🐟, if there's no sprite
  let player = null;
  async function karpSprite() {
    const sp = await Anim.load(129, false, ['Idle', 'Hop', 'Hurt']);
    if (!sp || player) return !!player;
    const cv = document.createElement('canvas');
    cv.width = cv.height = 96;
    $('#karp').replaceChildren(cv);
    player = new Anim.Player(cv, sp, 0.8);
    return true;
  }

  function button(label) {
    $('#next').textContent = label;
    $('#next').disabled = false;
    $('#next').onclick = start;
    $('#next').classList.remove('hidden');
  }

  function idle(text) {
    round = null;
    phase('idle');
    score();
    zones({ center: 0.5, ok: 0, good: 0, perfect: 0 });
    needle(0);
    verdict(text);
    button(t('jump.start'));
  }

  async function start() {
    $('#next').disabled = true;
    const res = await api.invoke('jump:start');
    if (!res.ok) {
      const mins = Math.max(1, Math.ceil(((res.nextAt || Date.now()) - Date.now()) / 60000));
      verdict(res.error === 'rest' ? t('jump.rest', { m: mins }) : res.error === 'tired' ? t('jump.tired') : t('jump.rules'));
      $('#next').disabled = false;
      return;
    }
    showCount(res.info);
    $('#next').classList.add('hidden');
    if (res.face && !(await karpSprite())) { const img = document.createElement('img'); img.src = res.face; img.alt = ''; $('#karp').replaceChildren(img); }
    round = { token: res.token, n: 0, jumps: res.jumps, jump: res.jump, total: 0, height: 0, t0: 0, pos: 0 };
    Sound.play('switch');
    await sleep(300);
    aim();
  }

  $('#bar').addEventListener('mousedown', () => stop());
  $('#pond').addEventListener('mousedown', () => stop());
  document.addEventListener('keydown', (e) => {
    if ((e.code === 'Space' || e.key === ' ') && document.body.dataset.phase === 'aim') { e.preventDefault(); stop(); }
  });

  api.on('state', (s) => {
    state = s;
    Sound.setEnabled(s.settings.sound);
    labels();
    if (!round) showCount(s.jump);
  });
  (async () => {
    state = await api.invoke('state:get');
    Sound.setEnabled(state.settings.sound);
    labels();
    showCount(state.jump);
    idle(t('jump.rules'));
    karpSprite();
  })();
})();
