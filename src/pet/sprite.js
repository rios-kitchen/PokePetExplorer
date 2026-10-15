/* PokePet Explorer – pet window: building the sprite from PMD sheets (or the built-in pixel art). */
(() => {
  const P = window.Pet;
  const { api, SP } = P;

  // P.sprite.kind: 'pmd' (PMD SpriteCollab) | 'grid' (built-in pixel art, placeholder until PMD is downloaded)

  function canvasFrom(img) {
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    c.getContext('2d').putImageData(new ImageData(img.data, img.width, img.height), 0, 0);
    return c;
  }

  function flipped(src) {
    const c = document.createElement('canvas');
    c.width = src.width; c.height = src.height;
    const g = c.getContext('2d');
    g.translate(src.width, 0); g.scale(-1, 1); g.drawImage(src, 0, 0);
    return c;
  }

  function loadImage(url) {
    return new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => res(img);
      img.onerror = rej;
      img.src = url;
    });
  }

  function toCanvas(img) {
    const c = document.createElement('canvas');
    c.width = img.naturalWidth || img.width; c.height = img.naturalHeight || img.height;
    c.getContext('2d').drawImage(img, 0, 0);
    return c;
  }

  /** Bounding box of non-transparent pixels over several canvases. */
  function unionBox(canvases) {
    let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
    for (const c of canvases) {
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
        if (d[(y * c.width + x) * 4 + 3] > 20) {
          if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        }
      }
    }
    return x1 < 0 ? null : { x0, y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  }

  function crop(c, box) {
    const out = document.createElement('canvas');
    out.width = box.w; out.height = box.h;
    out.getContext('2d').drawImage(c, box.x0, box.y0, box.w, box.h, 0, 0, box.w, box.h);
    return out;
  }

  async function buildGrid(id, hd) {
    const v = (name) => canvasFrom(SP.rgba(id, name, hd));
    const open = v('open'), closed = v('closed'), lookL = v('lookL'), lookR = v('lookR');
    const pair = (c) => ({ n: c, f: flipped(c) });
    return {
      kind: 'grid', hd, w: open.width, h: open.height,
      img: { open: pair(open), closed: pair(closed), [-1]: pair(lookL), [1]: pair(lookR) }
    };
  }

  async function buildPmd(asset) {
    const anims = {};
    for (const [name, a] of Object.entries(asset.anims)) {
      const sheet = toCanvas(await loadImage(a.url));
      const cols = Math.max(1, Math.floor(sheet.width / a.fw));
      const rows = Math.max(1, Math.floor(sheet.height / a.fh));
      const raw = [];
      for (let r = 0; r < rows; r++) {
        const row = [];
        for (let c = 0; c < Math.min(cols, a.durs.length); c++) {
          const fc = document.createElement('canvas');
          fc.width = a.fw; fc.height = a.fh;
          fc.getContext('2d').drawImage(sheet, c * a.fw, r * a.fh, a.fw, a.fh, 0, 0, a.fw, a.fh);
          row.push(fc);
        }
        raw.push(row);
      }
      const box = unionBox(raw.flat());
      if (!box) continue;
      anims[name] = {
        dirs: raw.map((row) => row.map((c) => crop(c, box))),
        durs: a.durs.map((t) => (t * 1000) / 60),
        total: a.durs.reduce((s, t) => s + (t * 1000) / 60, 0),
        cx: a.fw / 2 - box.x0,        // PMD anchor (frame centre) in cropped coordinates
        cy: a.fh / 2 - box.y0,
        w: box.w, h: box.h
      };
    }
    const base = anims.Idle || anims.Walk || Object.values(anims)[0];
    // ground line relative to the anchor, taken from the idle pose (feet on the floor)
    const groundOff = base.h - base.cy;
    let left = 0, right = 0, up = 0;
    for (const a of Object.values(anims)) {
      left = Math.max(left, a.cx);
      right = Math.max(right, a.w - a.cx);
      up = Math.max(up, a.cy + groundOff);
    }
    return { kind: 'pmd', anims, w: base.w, h: base.h, maxW: 2 * Math.max(left, right), maxH: up, groundOff };
  }

  /** A mystery egg: the same pixel egg for every pose (it has no eyes to blink). */
  function buildEgg(seed) {
    const c = canvasFrom(SP.ballRgba(seed, 0));
    const pair = { n: c, f: flipped(c) };
    return { kind: 'grid', hd: false, egg: true, w: c.width, h: c.height, img: { open: pair, closed: pair, [-1]: pair, [1]: pair } };
  }

  async function loadSprite(id) {
    if (P.state.pets[id] && P.state.pets[id].stage === 'egg') {
      const name = { en: P.I18N.t('en', 'egg.name'), zh: P.I18N.t('zh', 'egg.name') };
      const seed = [...id].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7);   // same as the panel
      P.sprite = { id, cry: { en: '…', zh: '……' }, name, ...buildEgg(seed) };
      P.pet.anim = null;
      P.pet.action = null;
      updateUnit();
      return;
    }
    let built = null;
    try {
      const asset = await api.invoke('pokemon:assets', id);
      if (asset && asset.kind === 'grid') built = await buildGrid(id, asset.hd);
      else if (asset && asset.kind === 'pmd') built = await buildPmd(asset);
    } catch (e) {
      console.error('sprite load failed', e);
    }
    if (!built) built = await buildGrid('pikachu', true);
    let cry, name;
    const sp = P.state.pets[id] && P.state.pets[id].species;   // evolved
    if (sp) {
      name = sp.names;
      cry = { en: `${name.en}!`, zh: `${name.zh}！` };
    } else if (SP.DEFS[id]) {
      cry = SP.DEFS[id].cry; name = SP.DEFS[id].name;
    } else {
      const c = P.state.custom.find((x) => x.id === id);
      name = c ? c.names : { en: id, zh: id };
      cry = { en: `${name.en}!`, zh: `${name.zh}！` };
    }
    P.sprite = { id, cry, name, ...built };
    P.pet.anim = null;
    P.pet.action = null;
    updateUnit();
  }

  function updateUnit() {
    const { sprite, state } = P;
    if (!sprite || !state) return;
    const scale = state.settings.scale;
    sprite.unit = sprite.kind === 'grid'
      ? (sprite.hd ? scale / 2 : scale)
      : Math.max(1, Math.round((scale * 30) / sprite.h));
    const fw = (sprite.maxW || sprite.w) * sprite.unit;
    const fh = (sprite.maxH || sprite.h) * sprite.unit;
    // a lying (fainted) pet needs its width as height, too
    api.send('pet:fit', { w: Math.ceil(Math.max(fw, fh)), h: Math.ceil(Math.max(fh, sprite.w * sprite.unit * 0.8)) });
  }

  const cry = () => (P.sprite ? P.sprite.cry[P.L()] || P.sprite.cry.en : '');

  // effect glyphs (hearts, stars, z's, …) as canvases
  const GLYPH = {};
  for (const name of Object.keys(SP.GLYPHS)) GLYPH[name] = canvasFrom(SP.glyphRgba(name));

  Object.assign(P, { loadSprite, updateUnit, cry, GLYPH });
})();
