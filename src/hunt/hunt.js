/* PokePet Explorer – Shiny Hunt. A grid of your partner, one of them a shiny with slightly different colours; click
 * it before time runs out. The main process makes each board, checks each click and rewards the hunt (main/hunt.js). */
(() => {
  const api = window.api;
  const I18N = window.PokeI18N;
  const Sound = window.PokeSound;
  const $ = (s) => document.querySelector(s);

  let state = null;
  const L = () => (state ? state.settings.lang : 'en');
  const t = (k, v) => I18N.t(L(), k, v);

  let game = null;   // { token, face, happy, sad, board, found, misses, ends, seconds, busy }
  let tick = 0;

  function phase(p) { document.body.dataset.phase = p; }

  function showCount(info) {
    if (!info) return;
    const mins = (at) => Math.max(1, Math.ceil((at - Date.now()) / 60000));
    $('#count').textContent = info.free ? t('hunt.free')
      : info.left > 0 ? t('hunt.left', { n: info.dayLeft, max: info.max, h: info.hourLeft, hmax: info.hourMax })
      : info.dayLeft > 0 ? t('hunt.rest', { m: mins(info.nextAt) }) : t('hunt.tired');
  }

  function labels() {
    document.title = t('hunt.title');
    $('#title').textContent = t('hunt.title');
  }

  const nameOf = (names) => (names ? names[L()] || names.en : '');
  function verdict(text, cls = '') {
    $('#verdict').className = `verdict ${cls}`;
    $('#verdict').textContent = text;
  }

  function score() {
    const left = game ? Math.max(0, Math.ceil((game.ends - Date.now()) / 1000)) : 0;
    const who = game && game.player ? `${t('game.player', { name: nameOf(game.player.names) })} · ` : '';
    $('#score').textContent = game ? who + t('hunt.score', { n: game.found, s: left }) : '';
  }

  // the board: every cell your partner, the shiny one with its colours turned by `hue` degrees
  function draw(board, face) {
    const grid = $('#grid');
    grid.style.gridTemplateColumns = `repeat(${board.size}, 1fr)`;
    const cells = [];
    for (let i = 0; i < board.size * board.size; i++) {
      const el = document.createElement('div');
      el.className = 'cell';
      const odd = i === board.at;
      if (face) {
        const img = document.createElement('img');
        img.src = face;
        img.alt = '';
        if (odd) img.style.filter = `hue-rotate(${board.hue}deg) saturate(1.2)`;
        el.append(img);
      } else {
        el.classList.add('dot');
        // plain dots are far easier to tell apart than a whole sprite, so their colours differ less
        el.style.setProperty('--c', `hsl(${48 + (odd ? Math.max(6, Math.round(board.hue * 0.4)) : 0)}, 85%, 55%)`);
      }
      el.addEventListener('click', () => pick(i));
      cells.push(el);
    }
    grid.replaceChildren(...cells);
  }

  async function pick(i) {
    if (!game || game.busy || document.body.dataset.phase !== 'play') return;
    game.busy = true;
    const res = await api.invoke('hunt:pick', game.token, i);
    if (!res.ok) { game.busy = false; return; }
    if (res.over) { finish(); return; }
    const cells = document.querySelectorAll('#grid .cell');
    // found: the shiny looks happy; missed: the one clicked and the real shiny both look sad
    const mood = (cell, url) => { const img = cell.querySelector('img'); if (img && url) img.src = url; };
    cells[res.at].classList.add('found');
    mood(cells[res.at], res.right ? game.happy : game.sad);
    if (!res.right) { cells[i].classList.add('missed'); mood(cells[i], game.sad); game.misses++; }
    Sound.play(res.right ? 'chime' : 'buzz');
    game.found = res.found;
    score();
    verdict(res.right ? t('hunt.right') : t('hunt.wrong'), res.right ? 'win' : 'lose');
    setTimeout(() => {
      if (!game || document.body.dataset.phase !== 'play') return;
      game.board = res.board;
      draw(game.board, game.face);
      game.busy = false;
    }, res.right ? 450 : 800);
  }

  async function finish() {
    if (!game || document.body.dataset.phase === 'done') return;
    clearInterval(tick);
    phase('done');
    $('#bar').style.width = '0%';
    const res = await api.invoke('hunt:finish', game.token);
    game = null;
    if (!res.ok) { idle(t('hunt.rules')); return; }
    const r = res.reward;
    Sound.play(r.found >= 8 ? 'fanfare' : 'chime');
    verdict(t('hunt.result', { n: r.found, miss: res.misses, b: r.berries, xp: r.xp, best: res.best })
      + (res.share ? `\n${t('game.share', { name: nameOf(res.shareTo), xp: res.share })}` : ''), r.found >= 8 ? 'win' : '');
    showCount(res.info);
    button(t('hunt.again'));
  }

  function button(label) {
    $('#next').textContent = label;
    $('#next').disabled = false;
    $('#next').onclick = start;
    $('#next').classList.remove('hidden');
  }

  function idle(text) {
    game = null;
    clearInterval(tick);
    phase('idle');
    score();
    $('#bar').style.width = '100%';
    draw({ size: 3, hue: 0, at: -1 }, null);
    verdict(text);
    button(t('hunt.start'));
  }

  async function start() {
    $('#next').disabled = true;
    const res = await api.invoke('hunt:start');
    if (!res.ok) {
      const mins = Math.max(1, Math.ceil(((res.nextAt || Date.now()) - Date.now()) / 60000));
      verdict(res.error === 'rest' ? t('hunt.rest', { m: mins }) : res.error === 'tired' ? t('hunt.tired') : t('hunt.rules'));
      $('#next').disabled = false;
      return;
    }
    showCount(res.info);
    $('#next').classList.add('hidden');
    game = { token: res.token, player: res.player || null, face: res.face, happy: res.happy, sad: res.sad, board: res.board, found: 0, misses: 0, seconds: res.seconds, ends: Date.now() + res.seconds * 1000, busy: false };
    draw(game.board, game.face);
    verdict(t('hunt.go'));
    Sound.play('switch');
    phase('play');
    score();
    tick = setInterval(() => {
      if (!game) return;
      const left = game.ends - Date.now();
      $('#bar').style.width = `${Math.max(0, (left / (game.seconds * 1000)) * 100)}%`;
      score();
      if (left <= 0) finish();
    }, 100);
  }

  api.on('state', (s) => {
    state = s;
    Sound.setEnabled(s.settings.sound);
    labels();
    if (!game) showCount(s.hunt);
  });
  (async () => {
    state = await api.invoke('state:get');
    Sound.setEnabled(state.settings.sound);
    labels();
    showCount(state.hunt);
    idle(t('hunt.rules'));
  })();
})();
