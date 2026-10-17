/* PokePet Explorer – Who's That Pokémon? A Pokémon's outline in black and four names: pick one, and it's revealed.
 * The main process picks the question and keeps the answer until a name is picked (quiz.js, main.js quizAsk). */
(() => {
  const api = window.api;
  const I18N = window.PokeI18N;
  const Sound = window.PokeSound;
  const $ = (s) => document.querySelector(s);

  let state = null;
  let current = null;   // { token, choices }
  let asking = false;
  // the Pokémon: its idle animation (facing you), black until the answer – drawn on a canvas so only its outline shows
  const face = $('#face');
  const g = face.getContext('2d');
  let anim = null;   // { img, fw, fh, box, durs, frame, until, dark }

  /** The part of the frames (row 0) that has pixels, so a small Pokémon fills the circle too. */
  function boxOf(img, fw, fh, frames) {
    const c = document.createElement('canvas');
    c.width = fw * frames; c.height = fh;
    const cg = c.getContext('2d');
    cg.drawImage(img, 0, 0, fw * frames, fh, 0, 0, fw * frames, fh);
    const px = cg.getImageData(0, 0, fw * frames, fh).data;
    let x0 = fw, y0 = fh, x1 = -1, y1 = -1;
    for (let y = 0; y < fh; y++) {
      for (let x = 0; x < fw * frames; x++) {
        if (px[(y * fw * frames + x) * 4 + 3] < 16) continue;
        const fx = x % fw;
        x0 = Math.min(x0, fx); x1 = Math.max(x1, fx); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      }
    }
    return x1 < 0 ? { x: 0, y: 0, w: fw, h: fh } : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  }

  function draw() {
    if (!anim) return;
    const { img, fw, box } = anim;
    const scale = Math.max(1, Math.floor(Math.min(116 / box.w, 116 / box.h) * 2) / 2);
    const w = box.w * scale, h = box.h * scale;
    g.clearRect(0, 0, 128, 128);
    g.imageSmoothingEnabled = false;
    g.globalCompositeOperation = 'source-over';
    g.drawImage(img, anim.frame * fw + box.x, box.y, box.w, box.h, Math.round((128 - w) / 2), Math.round((128 - h) / 2), w, h);   // row 0: facing down
    if (anim.dark) {
      g.globalCompositeOperation = 'source-in';
      g.fillStyle = '#111';
      g.fillRect(0, 0, 128, 128);
      g.globalCompositeOperation = 'source-over';
    }
  }
  function tick(now) {
    if (anim && now >= anim.until) {
      anim.frame = (anim.frame + 1) % anim.durs.length;
      anim.until = now + anim.durs[anim.frame] * (1000 / 60);
      draw();
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
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
    anim = null;
    face.classList.add('hidden');
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
    const img = new Image();
    img.onload = () => {
      const s = res.sprite;
      const durs = s.durs && s.durs.length ? s.durs : [30];
      anim = { img, fw: s.fw, fh: s.fh, box: boxOf(img, s.fw, s.fh, durs.length), durs, frame: 0, until: performance.now() + 500, dark: true };
      draw();
      $('#loading').classList.add('hidden');
      face.classList.remove('hidden');
    };
    img.src = res.sprite.url;
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
    if (anim) { anim.dark = false; draw(); }
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
