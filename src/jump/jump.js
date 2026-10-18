/* PokePet Explorer – Magikarp Jump. Pokémon swim in from the right; click or press Space to make Magikarp leap over
 * each one. 12 a round, 3 bumps and it's over. The main process makes the swimmers and replays the jump times before
 * rewarding the round (main/jump.js) – the window uses the same timings to show what happens. */
(() => {
  const api = window.api;
  const I18N = window.PokeI18N;
  const Sound = window.PokeSound;
  const Anim = window.PokeAnim;
  const $ = (s) => document.querySelector(s);

  // the same as main/jump.js
  const AIR_FROM = 70, AIR_TO = 620, JUMP_MS = 700, HALF = 70;
  const POND_W = 360, KARP_X = 90, SWIM_W = 44;

  let state = null;
  const L = () => (state ? state.settings.lang : 'en');
  const t = (k, v) => I18N.t(L(), k, v);

  let round = null;   // { token, swimmers, lives, t0, jumps (ms after the start), next (first swimmer not passed yet), bumps, dodged, els }
  let raf = 0;

  function phase(p) { document.body.dataset.phase = p; }

  function showCount(info) {
    if (!info) return;
    const mins = (at) => Math.max(1, Math.ceil((at - Date.now()) / 60000));
    $('#count').textContent = info.free ? t('jump.free')
      : info.left > 0 ? t('jump.left', { n: info.dayLeft, max: info.max, h: info.hourLeft, hmax: info.hourMax })
      : info.dayLeft > 0 ? t('jump.rest', { m: mins(info.nextAt) }) : t('jump.tired');
  }

  function labels() {
    document.title = t('jump.title');
    $('#title').textContent = t('jump.title');
    $('#keys').textContent = t('jump.keys');
  }

  function verdict(text, cls = '') {
    $('#verdict').className = `verdict ${cls}`;
    $('#verdict').textContent = text;
  }

  function score() {
    $('#score').textContent = round ? t('jump.round', { n: round.dodged, max: round.swimmers.length }) : '';
    $('#hearts').textContent = round ? '❤️'.repeat(Math.max(0, round.lives - round.bumps)) + '🖤'.repeat(Math.min(round.lives, round.bumps)) : '';
  }

  // Magikarp: its animated sprite facing right (its portrait, then 🐟, if there's no sprite)
  let player = null;
  async function karpSprite() {
    const sp = await Anim.load(129, false, ['Idle', 'Hop', 'Hurt']);
    if (!sp || player) return !!player;
    const cv = document.createElement('canvas');
    cv.width = cv.height = 80;
    $('#karp').replaceChildren(cv);
    player = new Anim.Player(cv, sp, 0.8, 2);
    return true;
  }

  // the swimmers: animated sprites facing left, or their portraits
  const looks = {};
  function swimmerEl(dex) {
    const el = document.createElement('div');
    el.className = 'swimmer';
    looks[dex] ||= Anim.load(dex, false, ['Idle']).then(async (sp) => ({ sp, face: sp ? null : await api.invoke('diary:portrait', dex, 'Normal', false).catch(() => null) }));
    looks[dex].then(({ sp, face }) => {
      if (sp) {
        const cv = document.createElement('canvas');
        cv.width = cv.height = SWIM_W;
        el.replaceChildren(cv);
        el.__player = new Anim.Player(cv, sp, 0.9, 6);
      } else if (face) {
        const img = document.createElement('img');
        img.src = face;
        img.alt = '';
        el.replaceChildren(img);
      } else el.textContent = '🐡';
    });
    return el;
  }

  const inAir = (now) => round.jumps.some((j) => now >= j && now < j + JUMP_MS);
  const clears = (s) => round.jumps.some((j) => j + AIR_FROM <= s.at - HALF && s.at + HALF <= j + AIR_TO);

  function jump() {
    if (!round || document.body.dataset.phase !== 'play') return;
    const now = performance.now() - round.t0;
    if (inAir(now)) return;
    round.jumps.push(Math.round(now));
    const karp = $('#karp');
    karp.classList.remove('leap');
    void karp.offsetWidth;   // restart the leap
    karp.classList.add('leap');
    if (player) player.play('Hop');
    Sound.play('pat');
  }

  function frame() {
    if (!round || document.body.dataset.phase !== 'play') return;
    const now = performance.now() - round.t0;
    round.swimmers.forEach((s, i) => {
      const x = KARP_X + ((s.at - now) / s.ms) * (POND_W - KARP_X + SWIM_W);
      const el = round.els[i];
      if (x > POND_W + SWIM_W || x < -SWIM_W * 2) { el.style.display = 'none'; return; }
      el.style.display = '';
      el.style.transform = `translateX(${Math.round(x - SWIM_W / 2)}px)`;
    });
    // a swimmer has passed under Magikarp: cleared or bumped?
    while (round.next < round.swimmers.length && now > round.swimmers[round.next].at + HALF) {
      const s = round.swimmers[round.next++];
      if (clears(s)) {
        round.dodged++;
        Sound.play('blip');
        verdict(t('jump.over'), 'win');
      } else {
        round.bumps++;
        Sound.play('buzz');
        verdict(t('jump.bump'), 'lose');
        if (player) player.play('Hurt');
        $('#karp').classList.add('bumped');
        setTimeout(() => $('#karp').classList.remove('bumped'), 400);
      }
      score();
      if (round.bumps >= round.lives) { finish(); return; }
    }
    if (round.next >= round.swimmers.length) { finish(); return; }
    // the self-test leaps over the first few swimmers
    const auto = window.__autoJump || 0;
    const s = round.swimmers[round.next];
    if (round.next < auto && now >= s.at - 300 && !inAir(now)) jump();
    raf = requestAnimationFrame(frame);
  }

  async function finish() {
    cancelAnimationFrame(raf);
    phase('wait');
    const res = await api.invoke('jump:finish', round.token, round.jumps);
    for (const el of round.els) { if (el.__player) el.__player.stop(); }
    $('#swimmers').replaceChildren();
    round = null;
    phase('idle');
    if (!res.ok) { verdict(t('jump.rules')); button(t('jump.start')); return; }
    const r = res.reward;
    Sound.play(r.dodged >= 9 ? 'fanfare' : 'chime');
    verdict(t('jump.result', { n: r.dodged, max: 12, b: r.berries, xp: r.xp, best: res.best }), r.dodged >= 9 ? 'win' : '');
    $('#score').textContent = t('jump.round', { n: r.dodged, max: 12 });
    showCount(res.info);
    button(t('jump.again'));
  }

  function button(label) {
    $('#next').textContent = label;
    $('#next').disabled = false;
    $('#next').onclick = start;
    $('#next').classList.remove('hidden');
  }

  function idle(text) {
    round = null;
    phase('idle');
    score();
    verdict(text);
    button(t('jump.start'));
  }

  async function start() {
    $('#next').disabled = true;
    const res = await api.invoke('jump:start');
    if (!res.ok) {
      const mins = Math.max(1, Math.ceil(((res.nextAt || Date.now()) - Date.now()) / 60000));
      verdict(res.error === 'rest' ? t('jump.rest', { m: mins }) : res.error === 'tired' ? t('jump.tired') : t('jump.rules'));
      $('#next').disabled = false;
      return;
    }
    showCount(res.info);
    $('#next').classList.add('hidden');
    if (res.face && !(await karpSprite())) { const img = document.createElement('img'); img.src = res.face; img.alt = ''; $('#karp').replaceChildren(img); }
    const els = res.swimmers.map((s) => swimmerEl(s.dex));
    for (const el of els) el.style.display = 'none';
    $('#swimmers').replaceChildren(...els);
    round = { token: res.token, swimmers: res.swimmers, lives: res.lives, t0: performance.now(), jumps: [], next: 0, bumps: 0, dodged: 0, els };
    score();
    verdict(t('jump.go'));
    Sound.play('switch');
    phase('play');
    raf = requestAnimationFrame(frame);
  }

  $('#pond').addEventListener('mousedown', jump);
  document.addEventListener('keydown', (e) => {
    if (e.code !== 'Space' && e.key !== ' ') return;
    e.preventDefault();
    if (round) jump();
    else if (!$('#next').classList.contains('hidden') && !$('#next').disabled) start();
  });

  api.on('state', (s) => {
    state = s;
    Sound.setEnabled(s.settings.sound);
    labels();
    if (!round) showCount(s.jump);
  });
  (async () => {
    state = await api.invoke('state:get');
    Sound.setEnabled(state.settings.sound);
    labels();
    showCount(state.jump);
    idle(t('jump.rules'));
    karpSprite();
  })();
})();
