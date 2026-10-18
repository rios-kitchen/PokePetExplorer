/* PokePet Explorer – animated PMD sprites for the mini-game windows. load() fetches a Pokémon's animations (through
 * 'battle:assets', which downloads them the first time) and Player draws one into a canvas: it loops Idle and can play
 * another animation (Attack, Hurt, Hop …) once. Every animation is drawn at the same scale and spot, so switching
 * doesn't make the Pokémon jump. Row 0 of a PMD sheet is the Pokémon facing the viewer. */
(() => {
  const TICK = 1000 / 60;   // PMD frame durations are in 1/60 s

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

  function image(url) {
    return new Promise((res) => {
      const img = new Image();
      img.onload = () => res(img);
      img.onerror = () => res(null);
      img.src = url;
    });
  }

  const cache = {};
  /** { Idle: { img, a, box }, … } for the animations asked for that exist, or null (no sprite, offline …). */
  function load(dex, shiny = false, names = ['Idle']) {
    const k = `${dex}${shiny ? 's' : ''}:${names.join(',')}`;
    cache[k] ||= window.api.invoke('battle:assets', dex, !!shiny).catch(() => null).then(async (asset) => {
      if (!asset || !asset.anims) return null;
      const out = {};
      const want = names.includes('Idle') ? names : ['Idle', ...names];
      await Promise.all(want.map(async (n) => {
        const a = asset.anims[n];
        if (!a || !a.url) return;
        const img = await image(a.url);
        if (img) out[n] = { img, a, box: boundsOf(img, a) };
      }));
      if (!out.Idle) {   // a few Pokémon have no Idle: use whatever they have
        const n = Object.keys(asset.anims)[0];
        const a = n && asset.anims[n];
        const img = a && await image(a.url);
        if (img) out.Idle = { img, a, box: boundsOf(img, a) };
      }
      return out.Idle ? out : null;
    });
    return cache[k];
  }

  /** The partner shown in the game windows: { dex, shiny }, or null while it's still an egg. */
  function partnerOf(state) {
    if (!state || !state.settings) return null;
    const id = state.settings.pokemon, rec = (state.pets || {})[id] || {};
    if (rec.stage === 'egg') return null;
    const dex = (rec.species && rec.species.dex) || ((state.custom || []).find((c) => c.id === id) || {}).dex;
    return dex ? { dex, shiny: !!(state.skins && state.skins[id] && state.skins[id].shiny) } : null;
  }

  class Player {
    /** fill: how much of the canvas the idle Pokémon takes up. */
    constructor(canvas, sprite, fill = 0.8) {
      this.cv = canvas;
      this.sp = sprite;
      const idle = sprite.Idle;
      this.k = Math.max(1, Math.floor(fill * Math.min(canvas.width / idle.box.w, canvas.height / idle.box.h) * 4) / 4);
      // where each frame's centre goes, so the idle Pokémon sits in the middle of the canvas
      this.cx = canvas.width / 2 - this.k * (idle.box.x0 + idle.box.w / 2 - idle.a.fw / 2);
      this.cy = canvas.height / 2 - this.k * (idle.box.y0 + idle.box.h / 2 - idle.a.fh / 2);
      this.cur = 'Idle';
      this.t0 = performance.now();
      this.done = null;
      this.alive = true;
      const loop = (now) => { if (!this.alive) return; this.draw(now); requestAnimationFrame(loop); };
      requestAnimationFrame(loop);
    }

    has(name) { return !!this.sp[name]; }

    /** Play an animation once (then back to Idle), or loop it with loop = true. Resolves when a single play ends. */
    play(name, loop = false) {
      if (!this.sp[name]) return Promise.resolve();
      if (this.done) this.done();
      this.cur = name;
      this.loop = loop;
      this.t0 = performance.now();
      return new Promise((res) => { this.done = res; });
    }

    idle() { if (this.done) this.done(); this.done = null; this.cur = 'Idle'; this.loop = false; this.t0 = performance.now(); }

    stop() { this.alive = false; if (this.done) this.done(); }

    draw(now) {
      let { img, a } = this.sp[this.cur];
      const total = a.durs.reduce((x, d) => x + d, 0);
      let tick = Math.floor((now - this.t0) / TICK);
      if (this.cur !== 'Idle' && !this.loop && tick >= total) {
        const done = this.done;
        this.done = null;
        this.cur = 'Idle';
        this.t0 = now;
        tick = 0;
        ({ img, a } = this.sp.Idle);
        if (done) done();
      }
      const all = a.durs.reduce((x, d) => x + d, 0);
      tick %= all;
      let f = 0;
      while (tick >= a.durs[f]) { tick -= a.durs[f]; f++; }
      const g = this.cv.getContext('2d');
      g.imageSmoothingEnabled = false;
      g.clearRect(0, 0, this.cv.width, this.cv.height);
      const w = a.fw * this.k, h = a.fh * this.k;
      g.drawImage(img, f * a.fw, 0, a.fw, a.fh, Math.round(this.cx - w / 2), Math.round(this.cy - h / 2), w, h);
    }
  }

  window.PokeAnim = { load, partnerOf, Player };
})();
