/* PokePet Explorer – Poké Ball Shuffle. Your partner hides in a Poké Ball, the balls swap places, and you point at the
 * right one. The main process makes the swaps, checks the pick and rewards the game (main/shuffle.js). */
(() => {
  const api = window.api;
  const I18N = window.PokeI18N;
  const Sound = window.PokeSound;
  const $ = (s) => document.querySelector(s);

  const W = 420;

  let state = null;
  const L = () => (state ? state.settings.lang : 'en');
  const t = (k, v) => I18N.t(L(), k, v);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  let game = null;   // { token, n, found, rounds, face, happy, sad, round }

  function phase(p) { document.body.dataset.phase = p; }

  function showCount(info) {
    if (!info) return;
    const mins = (at) => Math.max(1, Math.ceil((at - Date.now()) / 60000));
    $('#count').textContent = info.free ? t('shuffle.free')
      : info.left > 0 ? t('shuffle.left', { n: info.dayLeft, max: info.max, h: info.hourLeft, hmax: info.hourMax })
      : info.dayLeft > 0 ? t('shuffle.rest', { m: mins(info.nextAt) }) : t('shuffle.tired');
  }

  function partner() {
    const pet = state && (state.custom || []).find((c) => c.id === state.settings.pokemon);
    return pet && pet.names ? (pet.names[L()] || pet.names.en) : t('shuffle.partner');
  }

  function labels() {
    document.title = t('shuffle.title');
    $('#title').textContent = t('shuffle.title');
  }

  function verdict(text, cls = '') {
    $('#verdict').className = `verdict ${cls}`;
    $('#verdict').textContent = text;
  }

  function score() {
    $('#score').textContent = game ? t('shuffle.round', { n: game.n + 1, max: game.rounds, found: game.found }) : '';
  }

  const xOf = (slot, balls) => Math.round((W / (balls + 1)) * (slot + 1));
  const ballAt = (slot) => document.querySelector(`.ball[data-slot="${slot}"]`);

  // lay out a round's balls, the partner in the one at `start`
  function layout(r, withFace) {
    $('#stage').replaceChildren(...Array.from({ length: r.balls }, (_, i) => {
      const el = document.createElement('div');
      el.className = `ball${withFace && i === r.start ? ' has' : ''}`;
      el.dataset.slot = i;
      el.style.left = `${xOf(i, r.balls)}px`;
      const face = document.createElement('div');
      face.className = 'face';
      if (game && game.face) { const img = document.createElement('img'); img.src = game.face; img.alt = ''; face.append(img); } else face.textContent = '⚡';
      const shell = document.createElement('div');
      shell.className = 'shell';
      shell.addEventListener('click', () => pick(Number(el.dataset.slot)));
      el.append(face, shell);
      return el;
    }));
  }

  async function play(r) {
    game.round = r;
    score();
    layout(r, true);
    phase('reveal');
    verdict(t('shuffle.watch', { name: partner() }));
    const home = ballAt(r.start);
    await sleep(350);
    home.classList.add('open');
    Sound.play('blip');
    await sleep(1100);
    home.classList.remove('open');
    await sleep(450);
    phase('swap');
    verdict(t('shuffle.swapping'));
    for (const el of document.querySelectorAll('.ball')) el.style.transitionDuration = `${r.ms}ms`;
    for (const [a, b] of r.swaps) {
      if (!game) return;
      const A = ballAt(a), B = ballAt(b);
      A.dataset.slot = b; B.dataset.slot = a;
      A.style.left = `${xOf(b, r.balls)}px`; B.style.left = `${xOf(a, r.balls)}px`;
      A.classList.add('up'); B.classList.add('down');
      Sound.play('pat');
      await sleep(r.ms + 40);
      A.classList.remove('up'); B.classList.remove('down');
    }
    if (!game) return;
    await sleep(150);
    verdict(t('shuffle.which', { name: partner() }));
    phase('pick');
  }

  async function start() {
    $('#next').disabled = true;
    const res = await api.invoke('shuffle:start');
    if (!res.ok) {
      const mins = Math.max(1, Math.ceil(((res.nextAt || Date.now()) - Date.now()) / 60000));
      verdict(res.error === 'rest' ? t('shuffle.rest', { m: mins }) : res.error === 'tired' ? t('shuffle.tired') : t('shuffle.rules'));
      $('#next').disabled = false;
      return;
    }
    showCount(res.info);
    $('#next').classList.add('hidden');
    game = { token: res.token, n: 0, found: 0, rounds: res.rounds, face: res.face, happy: res.happy, sad: res.sad, round: null };
    Sound.play('switch');
    play(res.round);
  }

  async function pick(slot) {
    if (!game || document.body.dataset.phase !== 'pick') return;
    phase('wait');
    const res = await api.invoke('shuffle:pick', game.token, slot);
    if (!res.ok) { idle(t('shuffle.rules')); return; }
    const mine = ballAt(slot), real = ballAt(res.at);
    // found: the partner pops out happy; missed: it peeks out of the real ball looking sad
    const mood = (ball, url) => { const img = ball.querySelector('.face img'); if (img && url) img.src = url; };
    if (res.right) mood(mine, game.happy);
    mine.classList.add('open', res.right ? 'right' : 'wrong');
    if (!res.right) { await sleep(500); mood(real, game.sad); real.classList.add('open', 'right'); }
    game.found = res.found;
    score();
    if (res.right) Sound.play('chime'); else Sound.play('buzz');
    if (!res.done) {
      verdict(t('shuffle.found', { name: partner() }), 'win');
      await sleep(1300);
      game.n++;
      play(res.round);
      return;
    }
    const r = res.reward;
    if (r.won) Sound.play('fanfare');
    verdict(t(r.won ? 'shuffle.won' : 'shuffle.missed', { name: partner(), found: r.found, b: r.berries, xp: r.xp, best: res.best }), r.won ? 'win' : 'lose');
    showCount(res.info);
    game = null;
    phase('idle');
    button(t('shuffle.again'));
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
    layout({ balls: 3, start: -1 }, false);
    verdict(text);
    button(t('shuffle.start'));
  }

  api.on('state', (s) => {
    state = s;
    Sound.setEnabled(s.settings.sound);
    labels();
    if (!game) showCount(s.shuffle);
  });
  (async () => {
    state = await api.invoke('state:get');
    Sound.setEnabled(state.settings.sound);
    labels();
    showCount(state.shuffle);
    idle(t('shuffle.rules'));
  })();
})();
