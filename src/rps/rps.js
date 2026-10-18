/* PokePet Explorer – Fire-Water-Grass. Rock-paper-scissors with the starters' types: fire beats grass, grass beats
 * water, water beats fire; first to 3. The main process throws for the other side and rewards the match (main/rps.js). */
(() => {
  const api = window.api;
  const I18N = window.PokeI18N;
  const Sound = window.PokeSound;
  const $ = (s) => document.querySelector(s);

  const MOVES = ['fire', 'water', 'grass'];
  const ICON = { fire: '🔥', water: '💧', grass: '🌿' };   // until the starters' portraits have been downloaded
  const DEX = { fire: 4, water: 7, grass: 1 };   // Charmander, Squirtle, Bulbasaur
  const faces = {};
  const mark = (move) => {
    if (!faces[move]) return document.createTextNode(ICON[move]);
    const img = document.createElement('img');
    img.src = faces[move];
    img.alt = '';
    return img;
  };

  let state = null;
  const L = () => (state ? state.settings.lang : 'en');
  const t = (k, v) => I18N.t(L(), k, v);

  let match = null;   // { token, you, them, busy }

  function showCount(info) {
    if (!info) return;
    const mins = (at) => Math.max(1, Math.ceil((at - Date.now()) / 60000));
    $('#count').textContent = info.free ? t('rps.free')
      : info.left > 0 ? t('rps.left', { n: info.dayLeft, max: info.max, h: info.hourLeft, hmax: info.hourMax })
      : info.dayLeft > 0 ? t('rps.rest', { m: mins(info.nextAt) }) : t('rps.tired');
  }

  function labels() {
    document.title = t('rps.title');
    $('#title').textContent = t('rps.title');
    const pet = state && (state.custom || []).find((c) => c.id === state.settings.pokemon);
    $('#youLbl').textContent = pet && pet.names ? (pet.names[L()] || pet.names.en) : t('rps.you');
    $('#themLbl').textContent = t('rps.them');
    for (const b of document.querySelectorAll('#moves button')) b.replaceChildren(mark(b.dataset.move), ` ${t(`type.${b.dataset.move}`)}`);
  }

  function hand(el, move, win) {
    el.className = `hand${move ? ` ${move}` : ''}${win ? ' win' : ''}`;
    el.replaceChildren(move ? mark(move) : '?');
  }

  function score() {
    $('#score').textContent = match ? t('rps.score', { a: match.you, b: match.them }) : '';
  }

  function idle(text) {
    match = null;
    score();
    hand($('#you'), null); hand($('#them'), null);
    $('#verdict').className = 'verdict';
    $('#verdict').textContent = text;
    for (const b of document.querySelectorAll('#moves button')) b.disabled = true;
    $('#next').textContent = t('rps.start');
    $('#next').disabled = false;
    $('#next').onclick = start;
    $('#next').classList.remove('hidden');
  }

  async function start() {
    $('#next').disabled = true;
    const res = await api.invoke('rps:start');
    if (!res.ok) {
      const mins = Math.max(1, Math.ceil(((res.nextAt || Date.now()) - Date.now()) / 60000));
      $('#verdict').className = 'verdict';
      $('#verdict').textContent = res.error === 'rest' ? t('rps.rest', { m: mins }) : t('rps.tired');
      return;
    }
    showCount(res.info);
    match = { token: res.token, you: 0, them: 0, busy: false };
    $('#next').classList.add('hidden');
    hand($('#you'), null); hand($('#them'), null);
    $('#verdict').className = 'verdict';
    $('#verdict').textContent = t('rps.pick');
    for (const b of document.querySelectorAll('#moves button')) b.disabled = false;
    score();
    Sound.play('switch');
  }

  async function play(move) {
    if (!match || match.busy) return;
    match.busy = true;
    for (const b of document.querySelectorAll('#moves button')) b.disabled = true;
    hand($('#you'), move);
    hand($('#them'), null);
    const res = await api.invoke('rps:throw', match.token, move);
    if (!res.ok) { idle(t('rps.rules')); return; }
    match.you = res.you; match.them = res.them;
    hand($('#you'), move, res.result === 'win');
    hand($('#them'), res.theirs, res.result === 'lose');
    score();
    $('#verdict').className = `verdict ${res.result === 'draw' ? '' : res.result}`;
    $('#verdict').textContent = t(`rps.${res.result}`, { a: t(`type.${move}`), b: t(`type.${res.theirs}`) });
    Sound.play(res.result === 'win' ? 'chime' : res.result === 'lose' ? 'pat' : 'blip');
    if (res.done) {
      Sound.play(res.reward.won ? 'fanfare' : 'chime');
      $('#verdict').textContent += '\n' + t(res.reward.won ? 'rps.matchWon' : 'rps.matchLost', { b: res.reward.berries, xp: res.reward.xp, w: res.wins });
      showCount(res.info);
      match = null;
      $('#next').textContent = t('rps.again');
      $('#next').disabled = false;
      $('#next').onclick = start;
      $('#next').classList.remove('hidden');
      return;
    }
    match.busy = false;
    for (const b of document.querySelectorAll('#moves button')) b.disabled = false;
  }

  $('#moves').replaceChildren(...MOVES.map((m) => {
    const b = document.createElement('button');
    b.dataset.move = m;
    b.onclick = () => play(m);
    return b;
  }));

  api.on('state', (s) => {
    state = s;
    Sound.setEnabled(s.settings.sound);
    labels();
    if (!match) showCount(s.rps);
  });
  (async () => {
    state = await api.invoke('state:get');
    Sound.setEnabled(state.settings.sound);
    labels();
    showCount(state.rps);
    idle(t('rps.rules'));
    await Promise.all(Object.entries(DEX).map(async ([move, dex]) => { faces[move] = await api.invoke('diary:portrait', dex, 'Normal', false).catch(() => null); }));
    labels();
    if (!match) { hand($('#you'), null); hand($('#them'), null); }
  })();
})();
