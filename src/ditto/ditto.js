/* PokePet Explorer – Ditto Copy. A pattern lights up on a 4×4 grid for a moment; tap the same cells from memory.
 * Five rounds, each a cell longer. The main process makes each pattern, checks each copy and rewards the game
 * (main/ditto.js). */
(() => {
  const api = window.api;
  const I18N = window.PokeI18N;
  const Sound = window.PokeSound;
  const $ = (s) => document.querySelector(s);

  const N = 16;
  let state = null;
  const L = () => (state ? state.settings.lang : 'en');
  const t = (k, v) => I18N.t(L(), k, v);

  let game = null;   // { token, face, rounds, round, taps, results, busy }
  let timer = 0;

  function phase(p) { document.body.dataset.phase = p; }

  function showCount(info) {
    if (!info) return;
    const mins = (at) => Math.max(1, Math.ceil((at - Date.now()) / 60000));
    $('#count').textContent = info.free ? t('ditto.free')
      : info.left > 0 ? t('ditto.left', { n: info.dayLeft, max: info.max, h: info.hourLeft, hmax: info.hourMax })
      : info.dayLeft > 0 ? t('ditto.rest', { m: mins(info.nextAt) }) : t('ditto.tired');
  }

  function labels() {
    document.title = t('ditto.title');
    $('#title').textContent = t('ditto.title');
  }

  function verdict(text, cls = '') {
    $('#verdict').className = `verdict ${cls}`;
    $('#verdict').textContent = text;
  }

  function score() {
    $('#score').textContent = game ? t('ditto.score', { n: game.round.n + 1, max: game.rounds, k: game.round.cells.length }) : '';
  }

  function dots(rounds, results = []) {
    $('#dots').replaceChildren(...Array.from({ length: rounds }, (_, i) => {
      const d = document.createElement('div');
      d.className = `dot ${results[i] === true ? 'right' : results[i] === false ? 'wrong' : ''}`;
      return d;
    }));
  }

  let idleFace = null;   // Ditto's portrait for the board between games (plain blobs until it's downloaded)
  function draw(face) {
    const cells = Array.from({ length: N }, (_, i) => {
      const el = document.createElement('div');
      el.className = 'cell';
      el.dataset.cell = i;
      if (face) {
        const img = document.createElement('img');
        img.src = face;
        img.alt = '';
        el.append(img);
      } else {
        const b = document.createElement('div');
        b.className = 'blob';
        el.append(b);
      }
      el.addEventListener('click', () => tap(i));
      return el;
    });
    $('#grid').replaceChildren(...cells);
  }

  const cellEls = () => document.querySelectorAll('#grid .cell');

  // show the pattern for a moment, then hide it and let the player copy it
  function show() {
    if (!game) return;
    game.taps = [];
    cellEls().forEach((el, i) => { el.className = `cell ${game.round.cells.includes(i) ? 'lit' : ''}`; });
    score();
    verdict(t('ditto.watch'));
    phase('show');
    Sound.play('pat');
    timer = setTimeout(() => {
      if (!game) return;
      cellEls().forEach((el) => { el.className = 'cell'; });
      verdict(t('ditto.copy', { k: game.round.cells.length }));
      phase('copy');
    }, game.round.show);
  }

  async function tap(i) {
    if (!game || game.busy || document.body.dataset.phase !== 'copy' || game.taps.includes(i)) return;
    game.taps.push(i);
    cellEls()[i].classList.add('tapped');
    Sound.play('blip');
    if (game.taps.length < game.round.cells.length) return;
    game.busy = true;
    phase('check');
    const res = await api.invoke('ditto:answer', game.token, game.taps);
    game.busy = false;
    if (!res.ok) { idle(t('ditto.rules')); return; }
    game.results.push(res.right);
    dots(game.rounds, game.results);
    // mark the cells: green ring where a cell was missed, red where a tap was wrong
    cellEls().forEach((el, j) => {
      const inPattern = res.pattern.includes(j), tapped = game.taps.includes(j);
      if (inPattern && !tapped) el.classList.add('miss');
      if (!inPattern && tapped) el.classList.add('wrong');
    });
    Sound.play(res.right ? 'chime' : 'buzz');
    verdict(res.right ? t('ditto.right') : t('ditto.wrong'), res.right ? 'win' : 'lose');
    if (res.done) { done(res); return; }
    game.round = res.next;
    timer = setTimeout(show, res.right ? 900 : 1600);
  }

  function done(res) {
    phase('done');
    const r = res.reward;
    game = null;
    score();
    setTimeout(() => {
      Sound.play(r.right >= 4 ? 'fanfare' : 'chime');
      verdict(t('ditto.result', { n: r.right, b: r.berries, xp: r.xp, best: res.best }), r.right >= 4 ? 'win' : '');
    }, 900);
    showCount(res.info);
    button(t('ditto.again'));
  }

  function button(label) {
    $('#next').textContent = label;
    $('#next').disabled = false;
    $('#next').onclick = start;
    $('#next').classList.remove('hidden');
  }

  function idle(text) {
    game = null;
    clearTimeout(timer);
    phase('idle');
    score();
    draw(idleFace);
    [0, 5, 10, 15, 3, 12].forEach((i) => cellEls()[i].classList.add('lit'));
    dots(5);
    verdict(text);
    button(t('ditto.start'));
  }

  async function start() {
    $('#next').disabled = true;
    const res = await api.invoke('ditto:start');
    if (!res.ok) {
      const mins = Math.max(1, Math.ceil(((res.nextAt || Date.now()) - Date.now()) / 60000));
      verdict(res.error === 'rest' ? t('ditto.rest', { m: mins }) : res.error === 'tired' ? t('ditto.tired') : t('ditto.rules'));
      $('#next').disabled = false;
      return;
    }
    showCount(res.info);
    $('#next').classList.add('hidden');
    game = { token: res.token, face: res.face, rounds: res.rounds, round: res.round, taps: [], results: [], busy: false };
    draw(game.face);
    dots(game.rounds);
    Sound.play('switch');
    timer = setTimeout(show, 500);
  }

  api.on('state', (s) => {
    state = s;
    Sound.setEnabled(s.settings.sound);
    labels();
    if (!game) showCount(s.ditto);
  });
  (async () => {
    state = await api.invoke('state:get');
    Sound.setEnabled(state.settings.sound);
    labels();
    showCount(state.ditto);
    idle(t('ditto.rules'));
    idleFace = await api.invoke('diary:portrait', 132, 'Normal', false).catch(() => null);
    if (idleFace && !game) idle(t('ditto.rules'));
  })();
})();
