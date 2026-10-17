/* PokePet Explorer – Who's That Pokémon? A face as a black silhouette and four names: pick one, the face is revealed.
 * The main process picks the question and keeps the answer until a name is picked (quiz.js, main.js quizAsk). */
(() => {
  const api = window.api;
  const I18N = window.PokeI18N;
  const Sound = window.PokeSound;
  const $ = (s) => document.querySelector(s);

  let state = null;
  let current = null;   // { token, choices }
  let asking = false;
  const L = () => (state ? state.settings.lang : 'en');
  const t = (k, v) => I18N.t(L(), k, v);
  const nm = (names) => names[L()] || names.en;
  const mins = (at) => Math.max(1, Math.ceil((at - Date.now()) / 60000));

  function showCount(info) {
    if (!info) return;
    $('#count').textContent = info.free ? t('quiz.free')
      : info.left > 0 ? t('quiz.left', { n: info.dayLeft, max: info.max, h: info.hourLeft, hmax: info.hourMax })
      : info.dayLeft > 0 ? t('quiz.rest', { m: mins(info.nextAt) }) : t('quiz.tired');
  }

  function setNext(label) {
    $('#next').textContent = label;
    $('#next').classList.remove('hidden');
  }

  async function ask() {
    if (asking) return;
    asking = true;
    current = null;
    $('#next').classList.add('hidden');
    $('#verdict').textContent = '';
    $('#verdict').className = 'verdict';
    $('#choices').replaceChildren();
    $('#face').classList.add('hidden', 'silhouette');
    $('.stage').classList.remove('revealed');
    $('#loading').textContent = '?';
    $('#loading').classList.remove('hidden');
    const res = await api.invoke('quiz:ask').catch(() => ({ ok: false, error: 'net' }));
    asking = false;
    if (!res.ok) {
      $('#verdict').textContent = res.error === 'rest' ? t('quiz.rest', { m: mins(res.nextAt) })
        : res.error === 'tired' ? t('quiz.tired') : t('quiz.net');
      if (res.error === 'net') setNext(t('quiz.retry'));
      return;
    }
    current = res;
    const img = $('#face');
    img.onload = () => { $('#loading').classList.add('hidden'); img.classList.remove('hidden'); };
    img.src = res.face;
    $('#verdict').textContent = t('quiz.who');
    $('#choices').replaceChildren(...res.choices.map((c) => {
      const b = document.createElement('button');
      b.textContent = nm(c.names);
      b.dataset.dex = c.dex;
      b.onclick = () => answer(c.dex);
      return b;
    }));
    showCount(res.info);
  }

  async function answer(dex) {
    if (!current) return;
    const q = current;
    current = null;
    for (const b of $('#choices').children) b.disabled = true;
    const res = await api.invoke('quiz:answer', q.token, dex);
    if (!res.ok) return;
    $('#face').classList.remove('silhouette');
    $('.stage').classList.add('revealed');
    for (const b of $('#choices').children) {
      if (Number(b.dataset.dex) === res.answer.dex) b.classList.add('right');
      else if (Number(b.dataset.dex) === Number(dex)) b.classList.add('wrong');
    }
    const name = nm(res.answer.names);
    if (res.correct) {
      Sound.play('fanfare');
      $('#verdict').className = 'verdict right';
      $('#verdict').textContent = t(res.reward.streak > 1 ? 'quiz.rightStreak' : 'quiz.right', { name, n: res.reward.berries, s: res.reward.streak });
    } else {
      Sound.play('blip');
      $('#verdict').className = 'verdict wrong';
      $('#verdict').textContent = t('quiz.wrong', { name });
    }
    showCount(res.info);
    setNext(t('quiz.next'));
  }

  $('#next').addEventListener('click', ask);

  function start(s) {
    const first = !state;
    state = s;
    Sound.setEnabled(s.settings.sound);
    document.title = t('quiz.title');
    $('#title').textContent = t('quiz.heading');
    if (first) ask();
  }
  api.on('state', start);
  api.invoke('state:get').then((s) => { if (!state) start(s); });
})();
