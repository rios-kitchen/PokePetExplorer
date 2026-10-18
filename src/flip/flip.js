/* PokePet Explorer – Voltorb Flip. A 5×5 board of face-down 1s, 2s, 3s and Voltorb; each row and column shows its
 * total and how many Voltorb it hides. Turn over every 2 and 3 to win; right-click marks a card you think is a Voltorb.
 * The main process keeps the board and tells the window each card as it's turned (main/voltorb.js). */
(() => {
  const api = window.api;
  const I18N = window.PokeI18N;
  const Sound = window.PokeSound;
  const $ = (s) => document.querySelector(s);
  const SIZE = 5;

  let state = null;
  const L = () => (state ? state.settings.lang : 'en');
  const t = (k, v) => I18N.t(L(), k, v);

  let game = null;   // { token, tiles: [button], busy }

  function showCount(info) {
    if (!info) return;
    const mins = (at) => Math.max(1, Math.ceil((at - Date.now()) / 60000));
    $('#count').textContent = info.free ? t('flip.free')
      : info.left > 0 ? t('flip.left', { n: info.dayLeft, max: info.max, h: info.hourLeft, hmax: info.hourMax })
      : info.dayLeft > 0 ? t('flip.rest', { m: mins(info.nextAt) }) : t('flip.tired');
  }

  function labels() {
    document.title = t('flip.title');
    $('#title').textContent = t('flip.title');
    $('#hint').textContent = t('flip.hint');
  }

  const hintCell = (h, k) => {
    const d = document.createElement('div');
    d.className = `hintcell c${k}`;
    d.innerHTML = '<span class="sum"></span><span class="v"></span>';
    d.querySelector('.sum').textContent = h ? String(h.sum).padStart(2, '0') : '';
    d.querySelector('.v').textContent = h ? `💣${h.volts}` : '';
    return d;
  };

  /** The board: 5 rows of cards with the row hint at the end, then the column hints. */
  function build(hints) {
    const board = $('#board');
    board.replaceChildren();
    const tiles = [];
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        const b = document.createElement('button');
        b.className = 'tile';
        const i = r * SIZE + c;
        b.dataset.i = i;
        b.disabled = !hints;
        b.addEventListener('click', () => turn(i));
        b.addEventListener('contextmenu', (e) => { e.preventDefault(); if (!b.classList.contains('up')) { b.classList.toggle('memo'); b.textContent = b.classList.contains('memo') ? '💣' : ''; } });
        board.appendChild(b);
        tiles.push(b);
      }
      board.appendChild(hintCell(hints && hints.rows[r], r));
    }
    for (let c = 0; c < SIZE; c++) board.appendChild(hintCell(hints && hints.cols[c], c));
    const corner = document.createElement('div');
    board.appendChild(corner);
    return tiles;
  }

  function face(b, v) {
    b.classList.remove('memo');
    b.classList.add('up');
    if (v === 0) { b.classList.add('volt'); b.textContent = '💥'; } else b.textContent = String(v);
    b.disabled = true;
  }

  function idle(text) {
    game = null;
    build(null);
    $('#coins').textContent = '';
    $('#verdict').className = 'verdict';
    $('#verdict').textContent = text;
    $('#next').textContent = t('flip.start');
    $('#next').disabled = false;
    $('#next').onclick = start;
  }

  async function start() {
    $('#next').disabled = true;
    const res = await api.invoke('flip:start');
    if (!res.ok) {
      const mins = Math.max(1, Math.ceil(((res.nextAt || Date.now()) - Date.now()) / 60000));
      $('#verdict').className = 'verdict';
      $('#verdict').textContent = res.error === 'rest' ? t('flip.rest', { m: mins }) : t('flip.tired');
      return;
    }
    showCount(res.info);
    game = { token: res.token, tiles: build(res.hints), busy: false };
    $('#coins').textContent = t('flip.coins', { n: 0 });
    $('#verdict').className = 'verdict';
    $('#verdict').textContent = t('flip.go');
    Sound.play('switch');
  }

  async function turn(i) {
    if (!game || game.busy) return;
    game.busy = true;
    const res = await api.invoke('flip:turn', game.token, i);
    if (!res.ok) { game.busy = false; return; }
    face(game.tiles[i], res.value);
    $('#coins').textContent = t('flip.coins', { n: res.coins });
    Sound.play(res.value === 0 ? 'pat' : res.value > 1 ? 'chime' : 'blip');
    game.busy = false;
    if (!res.done) return;
    // show the whole board
    res.cards.forEach((v, k) => { if (!game.tiles[k].classList.contains('up')) { face(game.tiles[k], v); game.tiles[k].style.opacity = '0.6'; } });
    $('#verdict').className = `verdict ${res.reward.won ? 'win' : 'lose'}`;
    $('#verdict').textContent = res.reward.won ? t('flip.won', { n: res.coins, b: res.reward.berries, xp: res.reward.xp, w: res.wins })
      : t('flip.lost', { xp: res.reward.xp });
    if (res.reward.won) Sound.play('fanfare');
    showCount(res.info);
    game = null;
    $('#next').textContent = t('flip.again');
    $('#next').disabled = false;
    $('#next').onclick = start;
  }

  api.on('state', (s) => {
    state = s;
    Sound.setEnabled(s.settings.sound);
    labels();
    if (!game) showCount(s.flip);
  });
  (async () => {
    state = await api.invoke('state:get');
    Sound.setEnabled(state.settings.sound);
    labels();
    showCount(state.flip);
    idle(t('flip.rules'));
  })();
})();
