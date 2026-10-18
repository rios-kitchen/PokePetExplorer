/* PokePet Explorer – Type Match-up. An attack of one type hits a Pokémon of one or two types: how effective is it?
 * Ten questions a round; the main process deals them, checks each answer and rewards the round (main/typequiz.js). */
(() => {
  const api = window.api;
  const I18N = window.PokeI18N;
  const Sound = window.PokeSound;
  const $ = (s) => document.querySelector(s);

  const TYPE_COLORS = { normal: '#9a9a7a', fire: '#e2603b', water: '#3b78c4', electric: '#d8b020', grass: '#4fa04a', ice: '#5ab8c8',
    fighting: '#b8402a', poison: '#9a4ab8', ground: '#c8a050', flying: '#8a8ad8', psychic: '#e05a8a', bug: '#8aa020',
    rock: '#a8903a', ghost: '#6a5a98', dragon: '#6a4ad8', dark: '#5a4a3a', steel: '#8a8aa8', fairy: '#e08ab8' };
  const CHOICES = ['super', 'normal', 'weak', 'none'];

  let state = null;
  const L = () => (state ? state.settings.lang : 'en');
  const t = (k, v) => I18N.t(L(), k, v);

  let game = null;   // { token, questions, i, right, answered }

  const badge = (type) => {
    const b = document.createElement('div');
    b.className = 'type';
    b.style.background = TYPE_COLORS[type] || '#777';
    b.textContent = t(`type.${type}`);
    return b;
  };

  function showCount(info) {
    if (!info) return;
    const mins = (at) => Math.max(1, Math.ceil((at - Date.now()) / 60000));
    $('#count').textContent = info.free ? t('types.free')
      : info.left > 0 ? t('types.left', { n: info.dayLeft, max: info.max, h: info.hourLeft, hmax: info.hourMax })
      : info.dayLeft > 0 ? t('types.rest', { m: mins(info.nextAt) }) : t('types.tired');
  }

  function labels() {
    document.title = t('types.title');
    $('#title').textContent = t('types.title');
    $('#atkLbl').textContent = t('types.attack');
    $('#defLbl').textContent = t('types.target');
  }

  /** Before a round, or between rounds: the intro and a start button. */
  function idle(text) {
    game = null;
    $('#progress').textContent = '';
    $('#atk').replaceChildren(badge('fire'));
    $('#def').replaceChildren(badge('grass'));
    $('#verdict').className = 'verdict';
    $('#verdict').textContent = text;
    $('#choices').replaceChildren();
    $('#next').textContent = t('types.start');
    $('#next').disabled = false;
    $('#next').onclick = start;
    $('#next').classList.remove('hidden');
  }

  async function start() {
    $('#next').disabled = true;
    const res = await api.invoke('types:start');
    if (!res.ok) {
      const mins = Math.max(1, Math.ceil(((res.nextAt || Date.now()) - Date.now()) / 60000));
      $('#verdict').className = 'verdict';
      $('#verdict').textContent = res.error === 'rest' ? t('types.rest', { m: mins }) : t('types.tired');
      return;
    }
    showCount(res.info);
    game = { token: res.token, questions: res.questions, i: 0, right: 0 };
    Sound.play('switch');
    show();
  }

  function show() {
    const q = game.questions[game.i];
    game.answered = false;
    $('#progress').textContent = t('types.progress', { n: game.i + 1, max: game.questions.length, right: game.right });
    $('#atk').replaceChildren(badge(q.atk));
    $('#def').replaceChildren(...q.def.map(badge));
    $('#verdict').className = 'verdict';
    $('#verdict').textContent = t('types.ask');
    $('#next').classList.add('hidden');
    $('#choices').replaceChildren(...CHOICES.map((c) => {
      const b = document.createElement('button');
      b.dataset.choice = c;
      b.textContent = t(`types.c.${c}`);
      b.onclick = () => answer(c);
      return b;
    }));
  }

  async function answer(choice) {
    if (!game || game.answered) return;
    game.answered = true;
    for (const b of document.querySelectorAll('#choices button')) b.disabled = true;
    const res = await api.invoke('types:answer', game.token, game.i, choice);
    if (!res.ok) { idle(t('types.rules')); return; }
    for (const b of document.querySelectorAll('#choices button')) {
      if (b.dataset.choice === res.answer) b.classList.add('right');
      else if (b.dataset.choice === choice) b.classList.add('wrong');
    }
    const mult = res.mult === 0.25 ? '¼' : res.mult === 0.5 ? '½' : String(res.mult);
    if (res.correct) game.right++;
    $('#verdict').className = `verdict ${res.correct ? 'right' : 'wrong'}`;
    $('#verdict').textContent = `${res.correct ? t('types.right') : t('types.wrong', { a: t(`types.c.${res.answer}`) })} ×${mult}`;
    Sound.play(res.correct ? 'chime' : 'pat');
    $('#progress').textContent = t('types.progress', { n: game.i + 1, max: game.questions.length, right: game.right });
    if (res.done) {
      if (res.reward.berries) Sound.play('fanfare');
      $('#verdict').textContent += '\n' + t('types.result', { n: res.reward.right, max: game.questions.length, b: res.reward.berries, xp: res.reward.xp, best: res.best });
      showCount(res.info);
      game = null;
      $('#next').textContent = t('types.again');
      $('#next').onclick = start;
    } else {
      $('#next').textContent = t('types.next');
      $('#next').onclick = () => { game.i++; show(); };
    }
    $('#next').disabled = false;
    $('#next').classList.remove('hidden');
  }

  api.on('state', (s) => {
    state = s;
    Sound.setEnabled(s.settings.sound);
    labels();
    if (!game) showCount(s.types);
  });
  (async () => {
    state = await api.invoke('state:get');
    Sound.setEnabled(state.settings.sound);
    labels();
    showCount(state.types);
    idle(t('types.rules'));
  })();
})();
