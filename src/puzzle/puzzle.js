/* PokePet Explorer – Slide Puzzle. Your partner's portrait cut into a 3×3 grid with one tile missing; slide the tiles
 * back into place. The main process shuffles the board and replays the moves before rewarding them (main/puzzle.js). */
(() => {
  const api = window.api;
  const I18N = window.PokeI18N;
  const Sound = window.PokeSound;
  const $ = (s) => document.querySelector(s);

  const SIZE = 3, N = 9, BLANK = 8;

  let state = null;
  const L = () => (state ? state.settings.lang : 'en');
  const t = (k, v) => I18N.t(L(), k, v);

  let game = null;   // { token, board, moves, face, hints (left), used, guide (cells still to click) }
  let cellPx = 88;

  function phase(p) { document.body.dataset.phase = p; }

  function showCount(info) {
    if (!info) return;
    const mins = (at) => Math.max(1, Math.ceil((at - Date.now()) / 60000));
    $('#count').textContent = info.free ? t('puzzle.free')
      : info.left > 0 ? t('puzzle.left', { n: info.dayLeft, max: info.max, h: info.hourLeft, hmax: info.hourMax })
      : info.dayLeft > 0 ? t('puzzle.rest', { m: mins(info.nextAt) }) : t('puzzle.tired');
  }

  function labels() {
    document.title = t('puzzle.title');
    $('#title').textContent = t('puzzle.title');
    $('#previewLbl').textContent = t('puzzle.goal');
  }

  function verdict(text, cls = '') {
    $('#verdict').className = `verdict ${cls}`;
    $('#verdict').textContent = text;
  }

  function score() {
    $('#score').textContent = game ? t('puzzle.moves', { n: game.moves.length }) : '';
  }

  const at = (cell) => ({ left: `${3 + (cell % SIZE) * cellPx}px`, top: `${3 + Math.floor(cell / SIZE) * cellPx}px` });

  // one element per tile, placed at the cell it's in now
  function draw(board, face, whole = false) {
    const tiles = [];
    board.forEach((v, cell) => {
      if (v === BLANK && !whole) return;
      const el = document.createElement('div');
      el.className = `tile${face ? '' : ' plain'}`;
      el.dataset.tile = v;
      el.dataset.cell = cell;
      Object.assign(el.style, at(cell));
      if (face) {
        el.style.backgroundImage = `url("${face}")`;
        const inner = cellPx - 8;   // the tile's inside, without its 2 px border and the 4 px gap
        el.style.backgroundSize = `${inner * SIZE}px ${inner * SIZE}px`;
        el.style.backgroundPosition = `-${(v % SIZE) * inner}px -${Math.floor(v / SIZE) * inner}px`;
        const num = document.createElement('span');
        num.className = 'num';
        num.textContent = v + 1;
        el.append(num);
      } else el.textContent = v + 1;
      el.addEventListener('click', () => move(Number(el.dataset.cell)));
      tiles.push(el);
    });
    $('#board').replaceChildren(...tiles);
  }

  function preview(face) {
    const p = $('#preview');
    p.style.backgroundImage = face ? `url("${face}")` : '';
    p.textContent = face ? '' : '1–8';
    p.style.fontSize = face ? '' : '18px';
  }

  function neighbours(i) {
    const r = Math.floor(i / SIZE), c = i % SIZE, out = [];
    if (r > 0) out.push(i - SIZE);
    if (r < SIZE - 1) out.push(i + SIZE);
    if (c > 0) out.push(i - 1);
    if (c < SIZE - 1) out.push(i + 1);
    return out;
  }

  // hints: the tile to slide next glows, and keeps glowing for the next few moves while you follow it
  function hintLabel() {
    const h = $('#hint');
    h.classList.toggle('hidden', !game);
    if (!game) return;
    h.textContent = t('puzzle.hint', { n: game.hints > 90 ? '∞' : game.hints });
    h.disabled = game.hints <= 0 || document.body.dataset.phase !== 'play';
  }

  function glow() {
    for (const el of document.querySelectorAll('.tile.next')) el.classList.remove('next');
    const cell = game && game.guide[0];
    if (cell === undefined) return;
    const el = document.querySelector(`.tile[data-cell="${cell}"]`);
    if (el) el.classList.add('next');
  }

  async function hint() {
    if (!game || game.hints <= 0 || document.body.dataset.phase !== 'play') return;
    $('#hint').disabled = true;
    const res = await api.invoke('puzzle:hint', game.token, game.moves);
    if (!game) return;
    if (res.ok) {
      game.hints = res.left;
      game.used++;
      game.guide = res.steps;
      Sound.play('chime');
      verdict(t('puzzle.hinted', { n: res.steps.length }));
      glow();
    }
    hintLabel();
  }
  $('#hint').addEventListener('click', hint);

  function move(cell) {
    if (!game || document.body.dataset.phase !== 'play') return;
    const gap = game.board.indexOf(BLANK);
    if (!neighbours(gap).includes(cell)) return;
    const el = document.querySelector(`.tile[data-cell="${cell}"]`);
    game.board[gap] = game.board[cell];
    game.board[cell] = BLANK;
    el.dataset.cell = gap;
    Object.assign(el.style, at(gap));
    game.moves.push(cell);
    if (game.guide[0] === cell) game.guide.shift(); else game.guide = [];
    glow();
    Sound.play('blip');
    score();
    if (game.board.every((v, i) => v === i)) finish();
  }

  async function finish() {
    phase('wait');
    $('#hint').disabled = true;
    const res = await api.invoke('puzzle:finish', game.token, game.moves);
    if (!res.ok) { idle(t('puzzle.rules')); return; }
    phase('done');
    if (game.face) draw(game.board, game.face, true);   // the missing piece drops in
    Sound.play('fanfare');
    const r = res.reward;
    verdict(t(r.clean ? 'puzzle.doneClean' : 'puzzle.done', { n: r.moves, b: r.berries, xp: r.xp, best: res.best, h: r.hints }), 'win');
    showCount(res.info);
    game = null;
    hintLabel();
    button(t('puzzle.again'));
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
    hintLabel();
    draw([0, 1, 2, 3, 4, 5, 6, 7, 8], null);
    preview(null);
    verdict(text);
    button(t('puzzle.start'));
  }

  async function start() {
    $('#next').disabled = true;
    const res = await api.invoke('puzzle:start');
    if (!res.ok) {
      const mins = Math.max(1, Math.ceil(((res.nextAt || Date.now()) - Date.now()) / 60000));
      verdict(res.error === 'rest' ? t('puzzle.rest', { m: mins }) : res.error === 'tired' ? t('puzzle.tired') : t('puzzle.rules'));
      $('#next').disabled = false;
      return;
    }
    showCount(res.info);
    $('#next').classList.add('hidden');
    game = { token: res.token, board: res.board, moves: [], face: res.face, hints: res.hints, used: 0, guide: [] };
    draw(game.board, game.face);
    preview(game.face);
    score();
    verdict(t('puzzle.go'));
    Sound.play('switch');
    phase('play');
    hintLabel();
  }

  api.on('state', (s) => {
    state = s;
    Sound.setEnabled(s.settings.sound);
    labels();
    if (!game) showCount(s.puzzle);
  });
  (async () => {
    state = await api.invoke('state:get');
    Sound.setEnabled(state.settings.sound);
    labels();
    showCount(state.puzzle);
    idle(t('puzzle.rules'));
  })();
})();
