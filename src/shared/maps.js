/* Pixel-art scenes for expeditions (desktop thumbnail while away, background of the photos).
 * Drawn from code, 96×56 pixels, so there are no image files. Works in Node and the browser. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PokeMaps = api;
})(typeof self !== 'undefined' ? self : this, function () {
  const W = 96, H = 56;

  // small deterministic random generator, so a scene always looks the same
  function rng(seed) {
    let s = (seed >>> 0) || 1;
    return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 10000) / 10000; };
  }
  const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

  function canvas() {
    const data = new Uint8ClampedArray(W * H * 4);
    const px = (x, y, c) => {
      x = Math.round(x); y = Math.round(y);
      if (x < 0 || y < 0 || x >= W || y >= H) return;
      const [r, g, b] = typeof c === 'string' ? hex(c) : c;
      const i = (y * W + x) * 4;
      data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255;
    };
    const rect = (x, y, w, h, c) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) px(x + i, y + j, c); };
    const disc = (cx, cy, r, c) => {
      for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r + r * 0.6) px(cx + x, cy + y, c);
    };
    /** vertical bands of colour (sky gradients) */
    const bands = (y0, y1, colors) => {
      for (let y = y0; y < y1; y++) rect(0, y, W, 1, colors[Math.min(colors.length - 1, Math.floor(((y - y0) / (y1 - y0)) * colors.length))]);
    };
    /** a ridge line from a function, filled down to y1 */
    const ridge = (f, y1, c) => { for (let x = 0; x < W; x++) for (let y = Math.round(f(x)); y < y1; y++) px(x, y, c); };
    const tri = (cx, top, h, c) => { for (let j = 0; j < h; j++) rect(cx - Math.floor(j / 1.5), top + j, Math.floor(j / 1.5) * 2 + 1, 1, c); };
    return { data, px, rect, disc, bands, ridge, tri };
  }

  const SCENES = {
    woods(g, r) {
      g.bands(0, 30, ['#9fd8f0', '#b8e4f2', '#d2eef4']);
      g.ridge((x) => 24 + Math.sin(x / 9) * 3, 40, '#7cb86a');
      for (let i = 0; i < 9; i++) {
        const x = 4 + i * 11 + Math.floor(r() * 5);
        g.rect(x, 34, 2, 6, '#6b4a2b');
        g.tri(x + 1, 18 + Math.floor(r() * 6), 17, i % 2 ? '#3f8a45' : '#2f7a3a');
      }
      g.rect(0, 40, W, 16, '#5e9e4e');
      for (let i = 0; i < 40; i++) g.px(r() * W, 41 + r() * 14, r() < 0.5 ? '#78b862' : '#4f8a42');
      for (let i = 0; i < 6; i++) g.px(r() * W, 44 + r() * 10, '#f2d34a');   // flowers
    },
    cave(g, r) {
      g.rect(0, 0, W, H, '#2a2230');
      g.ridge((x) => 6 + Math.abs(Math.sin(x / 7)) * 6, 0, '#2a2230');
      for (let x = 0; x < W; x++) for (let y = 0; y < 8 + Math.abs(Math.sin(x / 6)) * 5; y++) g.px(x, y, '#3d3044');
      for (let i = 0; i < 7; i++) g.tri(6 + i * 14, 0, 6 + Math.floor(r() * 5), '#4a3b52');   // stalactites
      g.rect(0, 42, W, 14, '#3d3044');
      for (let i = 0; i < 9; i++) {   // glowing crystals
        const x = Math.floor(r() * W), y = 30 + Math.floor(r() * 12);
        g.tri(x, y, 5, '#f5e05a'); g.px(x, y + 1, '#fff6b0');
      }
      for (let i = 0; i < 25; i++) g.px(r() * W, 14 + r() * 26, '#5a4a62');
    },
    volcano(g, r) {
      g.bands(0, 34, ['#3a1e2a', '#6a2a2a', '#a8442e', '#d8743a']);
      g.ridge((x) => 14 + Math.abs(x - 48) * 0.7, 42, '#4a2a26');
      g.rect(44, 12, 9, 3, '#ff8a2a');
      for (let y = 15; y < 40; y++) g.px(46 + Math.round(Math.sin(y / 3) * 2), y, '#ff6a1a');   // lava stream
      g.rect(0, 42, W, 14, '#2e1c1a');
      for (let i = 0; i < 12; i++) g.rect(r() * W, 44 + r() * 10, 3, 1, r() < 0.5 ? '#ff7a2a' : '#c24a1a');
      for (let i = 0; i < 14; i++) g.px(30 + r() * 36, 2 + r() * 10, '#ffb05a');   // embers
    },
    glacier(g, r) {
      g.bands(0, 30, ['#cfe6f7', '#e0effa', '#eef6fc']);
      g.ridge((x) => 18 + Math.abs(Math.sin(x / 13)) * 10, 40, '#a8cfe8');
      g.ridge((x) => 26 + Math.sin(x / 8) * 3, 40, '#c4e2f4');
      g.rect(0, 40, W, 16, '#e8f4fb');
      for (let i = 0; i < 6; i++) { const x = 6 + i * 16 + r() * 4; g.tri(x, 33, 8, '#7fb4d8'); }
      for (let i = 0; i < 30; i++) g.px(r() * W, r() * 40, '#ffffff');   // snow
      for (let i = 0; i < 14; i++) g.px(r() * W, 42 + r() * 12, '#b8d8ec');
    },
    ruins(g, r) {
      g.bands(0, 34, ['#a6a2b8', '#bcb8c8', '#d0ccd6']);
      g.ridge((x) => 28 + Math.sin(x / 11) * 2, 42, '#8e8aa0');
      for (let i = 0; i < 5; i++) {   // columns, some broken
        const x = 8 + i * 19, top = 14 + (i % 2) * 8 + Math.floor(r() * 4);
        g.rect(x, top, 6, 42 - top, '#c8c0a8'); g.rect(x - 1, top, 8, 2, '#b0a890');
        g.rect(x + 1, top + 3, 1, 42 - top - 3, '#a8a088');
      }
      g.rect(0, 42, W, 14, '#7e7a8a');
      for (let y = 24; y < 40; y += 3) for (let x = 0; x < W; x++) if (r() < 0.25) g.px(x, y, '#dcd8e2');   // mist
    },
    classroom(g, r, opts) {
      g.rect(0, 0, W, 40, '#f0e6d2');
      g.rect(14, 6, 68, 24, '#5a3a22');
      g.rect(16, 8, 64, 20, opts.board || '#2f5a3e');
      for (let i = 0; i < 5; i++) g.rect(20 + i * 12, 12 + (i % 2) * 6, 7, 1, '#e8f0e4');   // chalk
      g.rect(0, 40, W, 16, '#b88a5a');
      for (let x = 0; x < W; x += 8) g.rect(x, 40, 1, 16, '#a07848');
      g.rect(30, 42, 36, 4, '#8a5a32'); g.rect(32, 46, 2, 6, '#6a4422'); g.rect(62, 46, 2, 6, '#6a4422');
      g.disc(84, 14, 4, '#ffffff'); g.px(84, 12, '#222'); g.px(85, 14, '#222');   // clock
    },
    travel(g, r) {
      g.rect(0, 0, W, H, '#5aa8d8');
      for (let i = 0; i < 40; i++) g.px(r() * W, r() * H, '#7cc0e6');
      const land = (cx, cy, rad, c) => { for (let k = 0; k < 6; k++) g.disc(cx + (r() - 0.5) * rad, cy + (r() - 0.5) * rad * 0.6, Math.max(2, Math.floor(rad / 2.5)), c); };
      land(22, 18, 16, '#7cc06a'); land(66, 22, 20, '#88c874'); land(46, 42, 14, '#7cc06a'); land(84, 44, 9, '#d8c27a');
      g.px(24, 16, '#e2463b'); g.px(68, 20, '#e2463b'); g.px(47, 40, '#e2463b');
      for (let x = 24; x < 68; x += 2) g.px(x, 16 + (x - 24) * 0.09, '#ffffff');   // dotted route
    }
  };

  // regions get their own landscape for the travel photos: [sky, far hills, near hills, ground, accent]
  const REGION_PALETTE = {
    kanto: ['#9fd8f0', '#86c07a', '#6aa85e', '#e8d8a0', '#e2463b'],
    johto: ['#f4c8a0', '#c08a6a', '#a07050', '#d8c090', '#c8324a'],
    hoenn: ['#8fd8f4', '#4fb8c8', '#2f98a8', '#f2e2a8', '#f28a3a'],
    sinnoh: ['#c8d8f0', '#9aaed0', '#7a90b8', '#e8eef6', '#5a6aa8'],
    unova: ['#b8c8e0', '#8a98b0', '#6a7890', '#c8c8c8', '#3a4a6a'],
    kalos: ['#f6d0e0', '#b8a0c8', '#9a82b0', '#e8dcc8', '#d84a7a'],
    alola: ['#7ad0f0', '#48b878', '#2f9858', '#f6e6b0', '#f2a03a'],
    galar: ['#b0c8d8', '#88a878', '#6a8a5e', '#c8c0a0', '#8a3a4a'],
    paldea: ['#f6d890', '#d8a060', '#b8804a', '#ecd8a8', '#d8603a']
  };

  function regionScene(g, r, region) {
    const [sky, far, near, ground, accent] = REGION_PALETTE[region] || REGION_PALETTE.kanto;
    g.rect(0, 0, W, 34, sky);
    g.disc(78, 10, 5, '#fff6c8');
    g.ridge((x) => 20 + Math.sin(x / 10 + region.length) * 5, 40, far);
    g.ridge((x) => 30 + Math.sin(x / 6 + region.length * 2) * 3, 42, near);
    g.rect(0, 42, W, 14, ground);
    g.rect(10, 30, 8, 8, '#f4f0e6'); g.tri(14, 25, 6, accent);          // a little house
    g.rect(13, 34, 2, 4, '#6a4a2a');
    for (let i = 0; i < 18; i++) g.px(r() * W, 43 + r() * 12, accent);
  }

  /** The scene for an expedition id (and the region of a trip) → { width, height, data } */
  function sceneRgba(expId, opts = {}) {
    const g = canvas();
    const r = rng([...String(expId) + (opts.region || '')].reduce((h, c) => h * 31 + c.charCodeAt(0), 7));
    const boards = { coolClass: '#2f3e5a', cuteClass: '#5a2f4e', smartClass: '#2f5a3e', toughClass: '#5a3a2f' };
    if (opts.region) regionScene(g, r, opts.region);
    else if (boards[expId]) SCENES.classroom(g, r, { board: boards[expId] });
    else (SCENES[expId] || SCENES.travel)(g, r, opts);
    return { width: W, height: H, data: g.data };
  }

  return { W, H, sceneRgba, REGION_PALETTE };
});
