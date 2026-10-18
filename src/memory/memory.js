/* PokePet Explorer – Memory Match. 16 face-down cards: turn two at a time and find the 8 pairs of Pokémon faces.
 * The main process deals the board and turns the number of turns into rewards (shared/memory-rules.js). */
(() => {
  const api = window.api;
  const I18N = window.PokeI18N;
  const Sound = window.PokeSound;
  const Rules = window.PokeMemory;
  const $ = (s) => document.querySelector(s);

  let state = null;
  const L = () => (state ? state.settings.lang : 'en');
  const t = (k, v) => I18N.t(L(), k, v);

  let game = null;   // { token, tiles: [{ dex, el, done }], open: [index], turns, pairs, busy }

  function hud() {
    $('#turns').textContent = game ? t('memory.turns', { n: game.turns }) : '';
    $('#pairs').textContent = game ? t('memory.pairs', { n: game.pairs, max: Rules.PAIRS }) : '';
  }

  function showCount(info) {
    if (!info) return;
    const mins = (at) => Math.max(1, Math.ceil((at - Date.now()) / 60000));
    $('#count').textContent = info.free ? t('memory.free')
      : info.left > 0 ? t('memory.left', { n: info.dayLeft, max: info.max, h: info.hourLeft, hmax: info.hourMax })
      : info.dayLeft > 0 ? t('memory.rest', { m: mins(info.nextAt) }) : t('memory.tired');
  }

  function overlay(title, text, button, onClick) {
    $('#ovTitle').textContent = title;
    $('#ovText').textContent = text;
    $('#ovButton').textContent = button;
    $('#ovButton').disabled = !onClick;
    $('#ovButton').onclick = onClick;
    $('#overlay').classList.remove('hidden');
  }

  /** Face-down cards, before a board is dealt. */
  function emptyBoard() {
    const board = $('#board');
    board.textContent = '';
    for (let i = 0; i < Rules.PAIRS * 2; i++) {
      const b = document.createElement('button');
      b.className = 'tile';
      b.disabled = true;
      b.innerHTML = '<div class="face back"></div><div class="face front"></div>';
      board.appendChild(b);
    }
  }

  async function start() {
    $('#ovButton').disabled = true;
    $('#ovText').textContent = t('memory.dealing');
    const res = await api.invoke('memory:start');
    if (!res.ok) {
      const mins = Math.max(1, Math.ceil(((res.nextAt || Date.now()) - Date.now()) / 60000));
      const text = res.error === 'rest' ? t('memory.rest', { m: mins }) : res.error === 'net' ? t('memory.net') : t('memory.tired');
      overlay(t('memory.title'), text, t('memory.ok'), res.error === 'net' ? start : null);
      return;
    }
    $('#overlay').classList.add('hidden');
    showCount(res.info);
    const board = $('#board');
    board.textContent = '';
    game = { token: res.token, tiles: [], open: [], turns: 0, pairs: 0, busy: false };
    res.cards.forEach((c, i) => {
      const b = document.createElement('button');
      b.className = 'tile';
      b.innerHTML = '<div class="face back"></div><div class="face front"><img alt=""></div>';
      b.querySelector('img').src = c.url;
      b.addEventListener('click', () => flip(i));
      board.appendChild(b);
      game.tiles.push({ dex: c.dex, el: b, done: false });
    });
    hud();
    Sound.play('switch');
  }

  function flip(i) {
    const g = game;
    if (!g || g.busy) return;
    const tile = g.tiles[i];
    if (tile.done || g.open.includes(i)) return;
    tile.el.classList.add('up');
    g.open.push(i);
    Sound.play('blip');
    if (g.open.length < 2) return;
    g.turns++;
    const [a, b] = g.open.map((k) => g.tiles[k]);
    if (a.dex === b.dex) {
      a.done = b.done = true;
      a.el.classList.add('done'); b.el.classList.add('done');
      a.el.disabled = b.el.disabled = true;
      g.open = [];
      g.pairs++;
      Sound.play('chime');
      hud();
      if (g.pairs === Rules.PAIRS) setTimeout(finish, 500);
      return;
    }
    hud();
    g.busy = true;
    setTimeout(() => {
      a.el.classList.remove('up'); b.el.classList.remove('up');
      g.open = [];
      g.busy = false;
    }, 800);
  }

  async function finish() {
    const g = game;
    game = null;
    const res = await api.invoke('memory:finish', g.token, g.turns);
    if (!res.ok) { overlay(t('memory.title'), t('memory.tooFast'), t('memory.again'), start); return; }
    Sound.play('fanfare');
    overlay(t('memory.over'), t('memory.result', { n: res.turns, b: res.berries, xp: res.xp, best: res.best }), t('memory.again'), start);
    showCount(res.info);
  }

  function labels() {
    document.title = t('memory.title');
    $('#hint').textContent = t('memory.hint');
  }

  api.on('state', (s) => {
    state = s;
    Sound.setEnabled(s.settings.sound);
    labels();
    if (!game) showCount(s.memory);
  });
  (async () => {
    state = await api.invoke('state:get');
    Sound.setEnabled(state.settings.sound);
    labels();
    emptyBoard();
    showCount(state.memory);
    overlay(t('memory.title'), t('memory.rules'), t('memory.start'), start);
  })();
})();
