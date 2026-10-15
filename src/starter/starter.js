/* PokePet Explorer – choosing the first Pokémon at the professor's: Bulbasaur, Charmander or Squirtle.
 * The cards start as closed Poké Balls; clicking one lets its Pokémon out (its PMD sprite, bundled with the app).
 * The language can be switched right here, before anything else. */
(() => {
  const api = window.api;
  const I18N = window.PokeI18N;
  const SP = window.PokeSprites;
  const Sound = window.PokeSound;
  const $ = (s) => document.querySelector(s);

  const STARTERS = [
    { id: 'bulbasaur', dex: 1, type: 'grass' },
    { id: 'charmander', dex: 4, type: 'fire' },
    { id: 'squirtle', dex: 7, type: 'water' }
  ];
  let lang = 'en';
  let chosen = null;
  const t = (k, v) => I18N.t(lang, k, v);

  // ---------------------------------------------------------------- sprites
  function fit(cv, src, sx, sy, sw, sh) {
    const g = cv.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.clearRect(0, 0, cv.width, cv.height);
    const k = Math.min(cv.width / sw, cv.height / sh);
    g.drawImage(src, sx, sy, sw, sh, (cv.width - sw * k) / 2, (cv.height - sh * k) / 2, sw * k, sh * k);
  }
  function ballCanvas() {
    const img = SP.ballRgba(0, 0);
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    c.getContext('2d').putImageData(new ImageData(img.data, img.width, img.height), 0, 0);
    return c;
  }
  // each starter's Idle animation (front-facing row), loaded once
  const idle = {};
  function loadIdle(s) {
    idle[s.id] ||= api.invoke('battle:assets', s.dex, false).then((asset) => new Promise((res) => {
      const a = asset && (asset.anims.Idle || Object.values(asset.anims)[0]);
      if (!a) return res(null);
      const img = new Image();
      img.onload = () => res({ img, a, box: boundsOf(img, a) });
      img.onerror = () => res(null);
      img.src = a.url;
    }));
    return idle[s.id];
  }
  /** The part of the front-facing frames that isn't transparent (PMD frames have lots of padding). */
  function boundsOf(img, a) {
    const c = document.createElement('canvas');
    c.width = a.fw * a.durs.length; c.height = a.fh;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0, c.width, a.fh, 0, 0, c.width, a.fh);
    const d = g.getImageData(0, 0, c.width, a.fh).data;
    let x0 = a.fw, y0 = a.fh, x1 = -1, y1 = -1;
    for (let y = 0; y < a.fh; y++) {
      for (let x = 0; x < c.width; x++) {
        if (d[(y * c.width + x) * 4 + 3] < 10) continue;
        const fx = x % a.fw;
        x0 = Math.min(x0, fx); x1 = Math.max(x1, fx); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      }
    }
    return x1 < 0 ? { x0: 0, y0: 0, w: a.fw, h: a.fh } : { x0, y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  }
  const canvases = new Map();   // id → canvas showing the open Pokémon
  function animate(now) {
    for (const [id, cv] of canvases) {
      const sp = cv.__sprite;
      if (!sp) continue;
      const { img, a, box } = sp;
      const total = a.durs.reduce((x, d) => x + d, 0);
      let tick = Math.floor(now / (1000 / 60)) % total, f = 0;
      while (tick >= a.durs[f]) { tick -= a.durs[f]; f++; }
      // the same box for every frame, so it doesn't jump around
      fit(cv, img, f * a.fw + box.x0, box.y0, box.w, box.h);
    }
    requestAnimationFrame(animate);
  }
  requestAnimationFrame(animate);

  // ---------------------------------------------------------------- page
  function render() {
    document.title = t('starter.title');
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
    $('#lang').textContent = lang === 'zh' ? 'English' : '中文';
    $('#profName').textContent = t('starter.prof');
    $('#profText').textContent = t('starter.intro');
    $('#choose').textContent = chosen ? t('starter.choose', { name: I18N.t(lang, `starter.name.${chosen}`) }) : t('starter.pickFirst');
    $('#choose').disabled = !chosen;
    $('#pick').textContent = chosen ? t(`starter.about.${chosen}`) : t('starter.hint');
    canvases.clear();
    $('#cards').replaceChildren(...STARTERS.map((s) => {
      const cv = document.createElement('canvas');
      cv.width = 96; cv.height = 96;
      const open = chosen === s.id;
      const ball = ballCanvas();
      fit(cv, ball, 0, 0, ball.width, ball.height);
      if (open) {
        canvases.set(s.id, cv);
        loadIdle(s).then((sp) => { if (sp) cv.__sprite = sp; });
      }
      const card = document.createElement('div');
      card.className = `card${open ? ' selected' : ''}`;
      const name = document.createElement('b');
      name.textContent = open ? t(`starter.name.${s.id}`) : '？';
      const type = document.createElement('span');
      type.className = `type ${s.type}`;
      type.textContent = t(`starter.type.${s.type}`);
      card.append(cv, name, type);
      card.addEventListener('click', () => { chosen = s.id; Sound.play('pat'); render(); });
      return card;
    }));
  }

  $('#lang').addEventListener('click', () => {
    lang = lang === 'zh' ? 'en' : 'zh';
    api.send('settings:set', { lang });
    Sound.play('pat');
    render();
  });

  $('#choose').addEventListener('click', async () => {
    if (!chosen) return;
    $('#choose').disabled = true;
    Sound.play('fanfare');
    await api.invoke('starter:choose', chosen);
  });

  (async () => {
    const state = await api.invoke('state:get');
    lang = state.settings.lang;
    Sound.setEnabled(state.settings.sound);
    render();
    STARTERS.forEach(loadIdle);   // have them ready before a ball is opened
  })();
})();
