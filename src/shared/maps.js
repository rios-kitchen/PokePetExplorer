/* Pixel-art scenes for expeditions (backgrounds of the photos) and small destination icons (desktop,
 * while the pet is away). Everything is drawn from code, so there are no image files and no licences
 * to worry about. Scenes are 160×96 pixels. Works in Node and the browser. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PokeMaps = api;
})(typeof self !== 'undefined' ? self : this, function () {
  const W = 160, H = 96;

  // ---------------------------------------------------------------- drawing kit
  function rng(seed) {
    let s = (seed >>> 0) || 1;
    return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 100000) / 100000; };
  }
  const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const mix = (a, b, t) => { const x = hex(a), y = hex(b); return x.map((v, i) => Math.round(v + (y[i] - v) * t)); };
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);

  function canvas() {
    const data = new Uint8ClampedArray(W * H * 4);
    const toRgb = (c) => (typeof c === 'string' ? hex(c) : c);
    const px = (x, y, c) => {
      x = Math.round(x); y = Math.round(y);
      if (x < 0 || y < 0 || x >= W || y >= H) return;
      const [r, g, b] = toRgb(c);
      const i = (y * W + x) * 4;
      data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255;
    };
    /** blend a colour over what's there (glows, mist, light) */
    const blend = (x, y, c, a) => {
      x = Math.round(x); y = Math.round(y);
      if (x < 0 || y < 0 || x >= W || y >= H || a <= 0) return;
      const [r, g, b] = toRgb(c);
      const i = (y * W + x) * 4;
      data[i] += (r - data[i]) * a; data[i + 1] += (g - data[i + 1]) * a; data[i + 2] += (b - data[i + 2]) * a; data[i + 3] = 255;
    };
    const dith = (x, y, t) => t > BAYER[(y & 3) * 4 + (x & 3)];
    const rect = (x, y, w, h, c) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) px(x + i, y + j, c); };
    /** vertical gradient through several colours, dithered between steps */
    const sky = (y0, y1, colors) => {
      for (let y = y0; y < y1; y++) {
        const f = ((y - y0) / Math.max(1, y1 - y0 - 1)) * (colors.length - 1);
        const k = Math.min(colors.length - 2, Math.floor(f)), t = f - k;
        for (let x = 0; x < W; x++) px(x, y, dith(x, y, t) ? colors[k + 1] : colors[k]);
      }
    };
    const disc = (cx, cy, r, c, shade) => {
      for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
        if (x * x + y * y > r * r + r * 0.4) continue;
        px(cx + x, cy + y, shade && x + y > r * 0.5 ? shade : c);
      }
    };
    const ellipse = (cx, cy, rx, ry, c) => {
      for (let y = -ry; y <= ry; y++) for (let x = -rx; x <= rx; x++) if ((x * x) / (rx * rx) + (y * y) / (ry * ry) <= 1) px(cx + x, cy + y, c);
    };
    /** a ridge line y = f(x), filled down to y1, lit from the left: slopes facing right get `shade` */
    const ridge = (f, y1, c, shade, snow) => {
      for (let x = 0; x < W; x++) {
        const top = Math.round(f(x)), slope = f(x + 1) - f(x - 1);
        for (let y = top; y < y1; y++) {
          let col = shade && slope > 0.15 ? shade : c;
          if (snow && y < top + snow && y < snow + 30) col = slope > 0.15 ? '#c8d8ea' : '#f4f8fc';
          px(x, y, col);
        }
      }
    };
    const glow = (cx, cy, r, c, strength = 0.6) => {
      for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
        const d = Math.hypot(x, y) / r;
        if (d < 1) blend(cx + x, cy + y, c, (1 - d) * (1 - d) * strength);
      }
    };
    return { data, px, blend, dith, rect, sky, disc, ellipse, ridge, glow };
  }

  // ---------------------------------------------------------------- props
  function pine(g, x, base, h, pal, snow) {
    const { dark, mid, light, trunk } = pal;
    g.rect(x - 1, base - Math.max(2, h * 0.18), 2, Math.max(2, h * 0.18), trunk);
    const tiers = Math.max(2, Math.round(h / 7));
    for (let k = 0; k < tiers; k++) {
      const top = base - h + (k * h * 0.72) / tiers, hh = (h * 0.5) + k * 0.6, wmax = (h * 0.28) + k * h * 0.06;
      for (let j = 0; j < hh; j++) {
        const w = Math.round((j / hh) * wmax);
        for (let i = -w; i <= w; i++) {
          let c = i < -w * 0.35 ? light : i > w * 0.35 ? dark : mid;
          if (snow && j < 2) c = '#f4f8fc';
          g.px(x + i, top + j, c);
        }
      }
    }
  }

  function leafy(g, x, base, h, pal, r) {
    g.rect(x - 1, base - h * 0.45, 3, h * 0.45, pal.trunk);
    const cy = base - h * 0.62;
    for (let k = 0; k < 6; k++) {
      const ox = Math.round((r() - 0.5) * h * 0.6), oy = Math.round((r() - 0.5) * h * 0.35);
      g.disc(x + ox, cy + oy, Math.round(h * 0.22 + r() * 2), pal.mid, pal.dark);
    }
    for (let k = 0; k < 5; k++) g.px(x - h * 0.2 + r() * h * 0.2, cy - h * 0.15 + r() * h * 0.2, pal.light);
  }

  function cloud(g, x, y, w, c = '#ffffff', shade = '#dce8f4') {
    for (let k = 0; k < Math.max(3, w / 5); k++) {
      const ox = (k / Math.max(1, w / 5 - 1)) * w - w / 2, r = 3 + Math.round(Math.sin((k / (w / 5)) * Math.PI) * w * 0.14);
      g.disc(x + ox, y - r * 0.4, r, c);
    }
    g.rect(x - w / 2, y, w, 2, shade);
  }

  function rock(g, x, y, rx, ry, c, shade, hi) {
    g.ellipse(x, y, rx, ry, c);
    for (let i = 0; i <= rx; i++) g.px(x + i, y + ry - 1, shade);
    for (let i = 0; i < rx; i++) if (i % 2) g.px(x - rx + 1 + i, y + ry - 1, shade);
    g.px(x - rx / 2, y - ry / 2, hi); g.px(x - rx / 2 + 1, y - ry / 2, hi);
  }

  /** textured ground with tufts and specks */
  function ground(g, r, y0, base, dark, light, specks = []) {
    for (let y = y0; y < H; y++) for (let x = 0; x < W; x++) {
      const t = (y - y0) / (H - y0);
      g.px(x, y, g.dith(x, y, t * 0.6) ? dark : base);
    }
    for (let k = 0; k < 70; k++) {
      const x = r() * W, y = y0 + 2 + r() * (H - y0 - 2);
      g.px(x, y, light); g.px(x + 1, y - 1, light);
    }
    for (const [c, n] of specks) for (let k = 0; k < n; k++) g.px(r() * W, y0 + 3 + r() * (H - y0 - 4), c);
  }

  function sun(g, x, y, r, c, haloC) {
    g.glow(x, y, r * 4, haloC || c, 0.35);
    g.disc(x, y, r, c);
  }

  // ---------------------------------------------------------------- scenes
  const SCENES = {
    woods(g, r) {
      g.sky(0, 60, ['#6fb8e8', '#9fd2f0', '#cfeaf4', '#f2f6e0']);
      sun(g, 128, 14, 5, '#fff8d8', '#fff2b0');
      cloud(g, 30, 16, 26); cloud(g, 92, 24, 18);
      g.ridge((x) => 40 + Math.sin(x / 17) * 5 + Math.sin(x / 7) * 1.5, 70, '#8ab4c8', '#7aa2b8');
      g.ridge((x) => 50 + Math.sin(x / 11 + 2) * 4, 72, '#5f9a6a', '#4f8a5c');
      for (let k = 0; k < 26; k++) pine(g, k * 6.5 + r() * 3, 66, 12 + r() * 6, { dark: '#2f6a40', mid: '#3a7a48', light: '#4a8a52', trunk: '#3a2a1a' });
      ground(g, r, 66, '#6cad4c', '#5a9a40', '#8cc86a', [['#f2e05a', 14], ['#f28ab0', 10], ['#ffffff', 8]]);
      for (let y = 66; y < H; y++) { const w = 3 + (y - 66) * 0.55, cx = 82 + Math.sin(y / 6) * 3; for (let x = -w; x <= w; x++) g.px(cx + x, y, g.dith(x + 40, y, 0.25) ? '#c8a878' : '#d8bc8a'); }
      for (const [x, h] of [[10, 34], [148, 38], [128, 26]]) pine(g, x, 92, h, { dark: '#1f5a30', mid: '#2f7a3a', light: '#4a9a4a', trunk: '#4a321c' });
      leafy(g, 36, 90, 28, { dark: '#3a7a30', mid: '#5aa040', light: '#8ccf6a', trunk: '#5a3a1e' }, r);
      for (let k = 0; k < 4; k++) { const x = 52 + k * 22 + r() * 6; g.rect(x, 86, 1, 3, '#e8e0c8'); g.disc(x, 85, 2, '#d8402a'); g.px(x - 1, 84, '#ffffff'); }
      for (let k = 0; k < 18; k++) g.blend(60 + r() * 60, 30 + r() * 30, '#fff8d0', 0.4);   // light motes
    },

    cave(g, r) {
      g.sky(0, H, ['#1a1420', '#241c2c', '#2e2438', '#3a2e44']);
      // light shaft from an opening above
      for (let y = 0; y < 80; y++) for (let x = 0; x < W; x++) {
        const cx = 98 + y * 0.35, w = 8 + y * 0.25;
        if (Math.abs(x - cx) < w) g.blend(x, y, '#cfe0ff', 0.18 * (1 - y / 80));
      }
      g.ridge((x) => 16 + Math.abs(Math.sin(x / 9)) * 10 + Math.sin(x / 3) * 2, 0, '#2a2030');
      for (let x = 0; x < W; x++) for (let y = 0; y < 14 + Math.abs(Math.sin(x / 9)) * 10; y++) g.px(x, y, y > 10 + Math.abs(Math.sin(x / 9)) * 10 ? '#4a3a56' : '#352a40');
      for (let k = 0; k < 14; k++) {   // stalactites
        const x = 6 + k * 11 + r() * 4, h = 6 + r() * 10, top = 10 + Math.abs(Math.sin(x / 9)) * 10;
        for (let j = 0; j < h; j++) { const w = Math.round((1 - j / h) * 2.5); for (let i = -w; i <= w; i++) g.px(x + i, top + j, i > 0 ? '#2a2030' : '#4a3a56'); }
      }
      g.ridge((x) => 70 + Math.sin(x / 13) * 3, H, '#3a2e44', '#2e2438');
      for (let k = 0; k < 9; k++) {   // stalagmites
        const x = 4 + k * 19 + r() * 6, h = 8 + r() * 12;
        for (let j = 0; j < h; j++) { const w = Math.round((j / h) * 3.5); for (let i = -w; i <= w; i++) g.px(x + i, 74 - h + j, i > 0 ? '#2a2030' : '#54446a'); }
      }
      // glowing crystals
      for (const [x, y, s] of [[24, 72, 7], [40, 76, 5], [118, 70, 8], [136, 78, 5], [70, 80, 4]]) {
        g.glow(x, y - s, s * 3, '#f8e070', 0.45);
        for (let j = 0; j < s * 2; j++) { const w = Math.round(Math.min(j, s * 2 - j) / 2.2); for (let i = -w; i <= w; i++) g.px(x + i, y - s * 2 + j, i < 0 ? '#fff6b0' : i > 0 ? '#d8b030' : '#f5d84a'); }
      }
      // a still puddle reflecting the light
      g.ellipse(92, 88, 22, 4, '#2a3a5a');
      for (let k = 0; k < 10; k++) g.rect(76 + r() * 30, 86 + r() * 4, 3, 1, '#5a7aaa');
      for (let k = 0; k < 40; k++) g.px(r() * W, 20 + r() * 50, '#5a4a6a');
    },

    volcano(g, r) {
      g.sky(0, 70, ['#2a1424', '#4a1c2a', '#7a2a28', '#b8442a', '#e07a3a']);
      for (let k = 0; k < 40; k++) g.px(r() * W, r() * 30, '#d8a08a');
      // smoke
      for (let k = 0; k < 9; k++) g.disc(78 + Math.sin(k) * 6 + k * 3, 18 - k * 2, 6 + k, k % 2 ? '#5a3a3a' : '#4a3030');
      g.ridge((x) => 54 + Math.sin(x / 9) * 3, 80, '#4a2a2a', '#3a2020');
      g.ridge((x) => 26 + Math.abs(x - 80) * 0.85 + Math.sin(x / 4) * 1.2, 82, '#5a2e26', '#40201c');
      g.rect(70, 25, 21, 3, '#ff9a3a'); g.glow(80, 24, 22, '#ff7a2a', 0.5);
      // lava rivers
      for (const [x0, drift] of [[76, -0.25], [84, 0.3]]) {
        for (let y = 28; y < 84; y++) {
          const x = x0 + (y - 28) * drift + Math.sin(y / 4) * 1.5;
          g.px(x, y, '#ffb04a'); g.px(x + 1, y, '#ff7a1a'); g.blend(x - 1, y, '#ff7a1a', 0.5);
        }
      }
      ground(g, r, 82, '#2e1c1a', '#241614', '#4a2a22', [['#ff7a2a', 12], ['#c24a1a', 14]]);
      for (let k = 0; k < 6; k++) rock(g, 10 + k * 28 + r() * 8, 86 + r() * 6, 6 + r() * 4, 3 + r() * 2, '#3a2420', '#241614', '#5a3a30');
      for (let k = 0; k < 6; k++) { const x = r() * W, y = 84 + r() * 10; g.rect(x, y, 6, 1, '#ff8a2a'); g.glow(x + 3, y, 4, '#ff6a1a', 0.3); }
      for (let k = 0; k < 24; k++) g.px(60 + r() * 50, r() * 40, '#ffc06a');   // embers
    },

    glacier(g, r) {
      g.sky(0, 60, ['#3a5a8a', '#6a8ab8', '#a8c4e0', '#dce8f4']);
      for (let x = 0; x < W; x++) for (let y = 6; y < 26; y++) {   // aurora
        const c = 14 + Math.sin(x / 12) * 6;
        g.blend(x, y, Math.sin(x / 20) > 0 ? '#7af0c0' : '#9ac8ff', Math.max(0, 0.35 - Math.abs(y - c) * 0.06));
      }
      sun(g, 30, 22, 4, '#fffaf0', '#ffffff');
      g.ridge((x) => 28 + Math.abs(Math.sin(x / 19)) * 22 + Math.sin(x / 5) * 1.5, 70, '#8aa8c8', '#6a8aac', 7);
      g.ridge((x) => 46 + Math.abs(Math.sin(x / 13 + 1)) * 12, 72, '#a8c4dc', '#7fa2c4', 5);
      for (let k = 0; k < 10; k++) pine(g, 6 + k * 16 + r() * 6, 70, 12 + r() * 6, { dark: '#2f5a5a', mid: '#3a6a6a', light: '#4a7a78', trunk: '#3a2a1a' }, true);
      // frozen lake with reflections
      g.rect(0, 70, W, 10, '#b8dcf0');
      for (let k = 0; k < 18; k++) g.rect(r() * W, 71 + r() * 8, 4 + r() * 8, 1, k % 2 ? '#e8f6ff' : '#98c4e0');
      ground(g, r, 80, '#eef6fc', '#d8e8f4', '#ffffff', [['#b8d4ea', 30]]);
      for (const [x, h] of [[14, 30], [146, 34]]) pine(g, x, 94, h, { dark: '#1f4a4a', mid: '#2f5a5a', light: '#4a7a78', trunk: '#4a321c' }, true);
      for (let k = 0; k < 60; k++) g.px(r() * W, r() * 90, '#ffffff');   // snowflakes
    },

    ruins(g, r) {
      g.sky(0, 66, ['#2a2a4a', '#4a4070', '#7a6a98', '#b8a8c4', '#e0d0d8']);
      g.disc(124, 18, 7, '#f6f0e0'); g.disc(127, 16, 6, '#7a6a98');   // crescent moon
      for (let k = 0; k < 30; k++) g.px(r() * W, r() * 34, '#e8e0f0');
      g.ridge((x) => 52 + Math.sin(x / 15) * 4, 74, '#5a5478', '#4a4468');
      // arch
      for (let y = 30; y < 74; y++) { g.rect(56, y, 7, 1, '#b8b098'); g.rect(97, y, 7, 1, '#b8b098'); g.px(62, y, '#8a8270'); g.px(103, y, '#8a8270'); }
      for (let a = 0; a <= Math.PI; a += 0.02) { const x = 80 + Math.cos(a) * 21, y = 32 - Math.sin(a) * 14; g.rect(x - 3, y - 3, 6, 5, '#c8c0a8'); }
      for (let a = 0; a <= Math.PI; a += 0.05) g.px(80 + Math.cos(a) * 17, 32 - Math.sin(a) * 11, '#8a8270');
      // columns, some broken, with moss
      for (const [x, top] of [[14, 30], [34, 46], [124, 38], [146, 28]]) {
        g.rect(x - 4, top, 9, 2, '#d8d0b8'); g.rect(x - 3, top + 2, 7, 76 - top, '#c8c0a8');
        for (let y = top + 2; y < 76; y++) { g.px(x - 1, y, '#a89e84'); g.px(x + 3, y, '#8a8270'); }
        for (let k = 0; k < 8; k++) g.px(x - 3 + r() * 7, top + 2 + r() * 10, '#6a9a5a');
      }
      ground(g, r, 76, '#6a6480', '#5a5470', '#8a84a0');
      for (let y = 78; y < H; y += 5) for (let x = (y % 10) * 2; x < W; x += 12) g.rect(x, y, 11, 1, '#4e4864');   // stone tiles
      for (let y = 56; y < 86; y++) for (let x = 0; x < W; x++) g.blend(x, y, '#e0dcf0', 0.18 * Math.max(0, Math.sin((x + y * 3) / 18)));   // mist
    },

    classroom(g, r, opts) {
      // wall with a subtle pattern and a wooden rail
      g.rect(0, 0, W, 66, '#f2e6cc');
      for (let y = 0; y < 58; y += 2) for (let x = (y / 2) % 2; x < W; x += 6) g.px(x, y, '#ead8b8');
      g.rect(0, 58, W, 8, '#c89a64'); g.rect(0, 58, W, 1, '#a87a48');
      // window with a tree outside
      for (let y = 12; y < 38; y++) for (let x = 128; x < 152; x++) g.px(x, y, g.dith(x, y, (y - 12) / 26) ? '#b8dcf0' : '#7cc0e8');
      leafy(g, 146, 40, 18, { dark: '#3a7a30', mid: '#5aa040', light: '#8ccf6a', trunk: '#5a3a1e' }, r);
      g.rect(126, 10, 28, 2, '#8a5a32'); g.rect(126, 38, 28, 3, '#a87a48');
      g.rect(126, 10, 2, 30, '#8a5a32'); g.rect(152, 10, 2, 30, '#8a5a32');
      g.rect(139, 10, 2, 30, '#8a5a32'); g.rect(126, 24, 28, 2, '#8a5a32');
      // blackboard with chalk doodles (a Poké Ball, a few lines)
      const board = opts.board || '#2f5a3e';
      g.rect(30, 8, 84, 40, '#6a4224'); g.rect(32, 10, 80, 34, board);
      for (let k = 0; k < 18; k++) g.blend(34 + r() * 76, 12 + r() * 30, '#ffffff', 0.08);
      for (let k = 0; k < 3; k++) g.rect(38, 15 + k * 7, 26 - k * 6, 1, '#e8f0e4');
      for (let a = 0; a < Math.PI * 2; a += 0.06) g.px(92 + Math.cos(a) * 9, 27 + Math.sin(a) * 9, '#e8f0e4');
      g.rect(83, 27, 18, 1, '#e8f0e4'); g.disc(92, 27, 2, '#e8f0e4');
      g.rect(30, 46, 84, 2, '#8a5a32'); g.rect(40, 45, 6, 1, '#ffffff'); g.rect(50, 45, 4, 1, '#f2c44a');
      // clock and a plant
      g.disc(16, 16, 6, '#ffffff', '#e0d8c8');
      for (let a = 0; a < 6.3; a += 0.3) g.px(16 + Math.cos(a) * 6, 16 + Math.sin(a) * 6, '#6a4224');
      g.rect(16, 12, 1, 4, '#23201c'); g.rect(16, 16, 3, 1, '#23201c');
      g.rect(8, 50, 9, 8, '#c8643a'); g.rect(8, 50, 9, 1, '#a84a2a');
      for (let k = 0; k < 7; k++) g.disc(10 + k, 46 - Math.sin(k) * 3, 2, k % 2 ? '#4a9a4a' : '#6cbf5a');
      // wooden floor and desks with notebooks
      ground(g, r, 66, '#c08a58', '#b07a4a', '#d09a68');
      for (let x = 0; x < W; x += 10) g.rect(x, 66, 1, 30, '#a06a3a');
      for (const [x, y] of [[20, 74], [70, 74], [120, 74], [44, 86], [96, 86]]) {
        g.rect(x, y, 26, 3, '#8a5a32'); g.rect(x, y + 3, 26, 1, '#6a4224');
        g.rect(x + 2, y + 4, 2, 6, '#5a3a1e'); g.rect(x + 22, y + 4, 2, 6, '#5a3a1e');
        g.rect(x + 6, y - 2, 8, 2, '#f4f0e6'); g.px(x + 10, y - 2, '#d8402a');
      }
    },

    /** a parchment map (used when no region is known yet) */
    travel(g, r) {
      g.sky(0, H, ['#e8d8b0', '#e0cc9c']);
      for (let k = 0; k < 220; k++) g.px(r() * W, r() * H, '#d4bc88');
      const land = (cx, cy, rad, c) => { for (let k = 0; k < 9; k++) g.disc(cx + (r() - 0.5) * rad * 1.4, cy + (r() - 0.5) * rad * 0.8, Math.max(3, Math.floor(rad / 2.4)), c); };
      g.rect(6, 6, W - 12, H - 12, '#9ac8d8');
      for (let k = 0; k < 120; k++) g.px(8 + r() * (W - 16), 8 + r() * (H - 16), '#b0d8e4');
      land(40, 34, 30, '#8cbf6a'); land(112, 40, 34, '#9cc87a'); land(72, 74, 22, '#8cbf6a'); land(136, 78, 12, '#d8c27a');
      for (const [x, y] of [[36, 30], [112, 36], [70, 72]]) { g.disc(x, y, 2, '#d8402a'); g.px(x, y - 1, '#ffffff'); }
      for (let x = 38; x < 112; x += 3) g.px(x, 30 + (x - 38) * 0.08 + Math.sin(x / 9) * 3, '#6a4a2a');
      for (let i = 0; i < W; i++) { g.px(i, 5, '#8a6a3a'); g.px(i, H - 6, '#8a6a3a'); }
      for (let j = 0; j < H; j++) { g.px(5, j, '#8a6a3a'); g.px(W - 6, j, '#8a6a3a'); }
      // compass rose
      g.disc(144, 18, 6, '#f4ecd8'); g.rect(144, 11, 1, 14, '#6a4a2a'); g.rect(137, 18, 14, 1, '#6a4a2a'); g.px(144, 11, '#d8402a');
    }
  };

  // ---------------------------------------------------------------- regions (travel photos)
  // [sky top, sky bottom, far hills, near hills, ground, ground shade, accent, landmark]
  const REGIONS = {
    kanto:  ['#6ab4e8', '#d8eef6', '#8ab8a0', '#6aa85e', '#7cbf5a', '#68a84a', '#e2463b', 'house'],
    johto:  ['#f0a878', '#f8dcb8', '#b08a7a', '#8a7a5a', '#a8b868', '#90a058', '#c8324a', 'pagoda'],
    hoenn:  ['#4ab0e8', '#c8ecf8', '#5ab0b8', '#4aa0a8', '#f2e2a8', '#e0cc90', '#f28a3a', 'island'],
    sinnoh: ['#8aa4d0', '#e0e8f4', '#a8b8d8', '#8a9cc0', '#e8eef6', '#d0dcec', '#5a6aa8', 'peak'],
    unova:  ['#5a6a90', '#c8b8c8', '#8a8aa0', '#6a6a80', '#a8a8b0', '#90909a', '#f2c44a', 'city'],
    kalos:  ['#e8a0c0', '#f8e0e8', '#b8a0c8', '#9a82b0', '#a8c890', '#90b07a', '#d84a7a', 'tower'],
    alola:  ['#3ac0f0', '#c0f0f8', '#3aa0c0', '#48b878', '#f6e6b0', '#e8d494', '#f2a03a', 'palm'],
    galar:  ['#7a90b0', '#d8dce0', '#88a878', '#6a8a5e', '#88b070', '#78a060', '#8a3a4a', 'castle'],
    paldea: ['#f0b860', '#f8e8c0', '#d8a060', '#b8804a', '#e8cc90', '#d8b878', '#d8603a', 'windmill']
  };

  const LANDMARKS = {
    house(g, x, y, c) { g.rect(x, y - 12, 18, 12, '#f4f0e6'); for (let j = 0; j < 8; j++) g.rect(x - 2 + j, y - 12 - j, 22 - j * 2, 1, c); g.rect(x + 7, y - 7, 4, 7, '#6a4a2a'); g.rect(x + 2, y - 9, 3, 3, '#9ad0f0'); g.rect(x + 13, y - 9, 3, 3, '#9ad0f0'); },
    pagoda(g, x, y, c) { for (let k = 0; k < 4; k++) { const w = 18 - k * 4, by = y - k * 9; g.rect(x - w / 2 + 2, by - 7, w - 4, 7, '#e8d8c0'); g.rect(x - w / 2, by - 9, w, 2, c); g.px(x - w / 2 - 1, by - 10, c); g.px(x + w / 2, by - 10, c); } g.rect(x, y - 42, 1, 6, '#c8a040'); },
    island(g, x, y) { g.ellipse(x, y - 1, 16, 3, '#d8c890'); for (let j = 0; j < 14; j++) g.rect(x - 14 + j, y - 4 - j, 28 - j * 2, 1, j > 10 ? '#8a4a3a' : '#6a8a5a'); g.glow(x, y - 18, 6, '#ff9a5a', 0.5); },
    peak(g, x, y) { for (let j = 0; j < 40; j++) { const w = Math.round(j * 0.9); for (let i = -w; i <= w; i++) g.px(x + i, y - 40 + j, j < 10 ? (i > 0 ? '#c8d8ea' : '#ffffff') : i > 0 ? '#7a8aac' : '#9aaccc'); } },
    city(g, x, y, c) { for (let k = 0; k < 7; k++) { const h = 10 + ((k * 7) % 5) * 5, bx = x - 24 + k * 7; g.rect(bx, y - h, 6, h, k % 2 ? '#5a5a70' : '#4a4a60'); for (let j = 2; j < h - 2; j += 3) g.px(bx + 2, y - h + j, c); } for (let i = -30; i < 30; i++) g.px(x + i, y - 6 + Math.abs(i) * 0.08, '#d8d8e0'); },
    tower(g, x, y, c) { for (let j = 0; j < 44; j++) { const w = Math.max(1, Math.round((j / 44) * 7)); g.rect(x - w, y - 44 + j, w * 2 + 1, 1, j % 6 === 0 ? c : '#6a6a8a'); } g.glow(x, y - 44, 5, c, 0.6); },
    palm(g, x, y) { for (let j = 0; j < 26; j++) g.px(x + Math.sin(j / 8) * 3, y - j, j % 3 ? '#8a5a2a' : '#6a4a20'); for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; for (let t = 0; t < 10; t++) g.px(x + 3 + Math.cos(a) * t, y - 26 + Math.sin(a) * t * 0.5 + t * t * 0.03, '#3a9a4a'); } g.disc(x + 3, y - 25, 1, '#6a4a20'); },
    castle(g, x, y, c) { g.rect(x - 14, y - 16, 28, 16, '#b8b0a0'); for (let i = -14; i < 14; i += 4) g.rect(x + i, y - 18, 2, 2, '#b8b0a0'); g.rect(x - 4, y - 30, 8, 14, '#c8c0b0'); for (let j = 0; j < 6; j++) g.rect(x - 4 + j * 0.6, y - 36 + j, 8 - j * 1.2, 1, c); g.rect(x - 2, y - 7, 4, 7, '#5a3a2a'); g.disc(x, y - 24, 2, '#f4f0e6'); },
    windmill(g, x, y, c) { g.rect(x - 4, y - 18, 8, 18, '#f4ecd8'); for (let j = 0; j < 4; j++) g.rect(x - 4 + j, y - 22 + j, 8 - j * 2, 1, c); for (let t = -12; t <= 12; t++) { g.px(x + t, y - 20 + t, '#8a6a4a'); g.px(x + t, y - 20 - t, '#8a6a4a'); } g.rect(x - 1, y - 6, 3, 6, '#6a4a2a'); }
  };

  function regionScene(g, r, region) {
    const [s0, s1, far, near, gr, grShade, accent, landmark] = REGIONS[region] || REGIONS.kanto;
    const toHex = (c) => '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
    g.sky(0, 66, [s0, toHex(mix(s0, s1, 0.33)), toHex(mix(s0, s1, 0.66)), s1]);
    sun(g, 130, 16, 5, '#fff8e0', '#fff2c0');
    cloud(g, 34, 18, 24); cloud(g, 92, 12, 16);
    const ph = region.length;
    g.ridge((x) => 42 + Math.sin(x / 16 + ph) * 6 + Math.sin(x / 6) * 1.5, 72, far);
    if (region === 'hoenn' || region === 'alola') {
      g.rect(0, 58, W, 14, '#3a98d0');
      for (let k = 0; k < 24; k++) g.rect(r() * W, 59 + r() * 12, 3 + r() * 5, 1, '#8ad0f0');
    } else {
      g.ridge((x) => 54 + Math.sin(x / 9 + ph * 2) * 4, 74, near);
    }
    LANDMARKS[landmark](g, 112, 70, accent);
    ground(g, r, 72, gr, grShade, toHex(mix(gr, '#ffffff', 0.35)), [[accent, 10], ['#f6e05a', 6]]);
    if (landmark !== 'palm') for (const x of [14, 30]) pine(g, x, 92, 24 + (x % 7), { dark: '#2f5a3a', mid: '#3a7a48', light: '#5a9a5a', trunk: '#4a321c' }, region === 'sinnoh');
    else LANDMARKS.palm(g, 22, 92);
    for (let y = 72; y < H; y++) { const w = 2 + (y - 72) * 0.4; for (let x = -w; x <= w; x++) g.px(70 + x + (y - 72) * 0.3, y, g.dith(x + 9, y, 0.3) ? grShade : '#e8d8b0'); }
  }

  /** The scene for an expedition id (and the region of a trip) → { width, height, data } */
  function sceneRgba(expId, opts = {}) {
    const g = canvas();
    const r = rng([...String(expId) + (opts.region || '')].reduce((h, c) => h * 31 + c.charCodeAt(0), 7));
    const boards = { coolClass: '#2f3e5a', cuteClass: '#5a2f4e', smartClass: '#2f5a3e', toughClass: '#5a3a2f' };
    if (opts.region) regionScene(g, r, opts.region);
    else if (boards[expId]) SCENES.classroom(g, r, { board: boards[expId] });
    else (SCENES[expId] || SCENES.travel)(g, r, opts);
    // anything left unpainted takes the colour of the pixel above (no see-through seams)
    const d = g.data;
    for (let y = 1; y < H; y++) for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      if (!d[i + 3]) { const j = i - W * 4; d[i] = d[j]; d[i + 1] = d[j + 1]; d[i + 2] = d[j + 2]; d[i + 3] = 255; }
    }
    return { width: W, height: H, data: g.data };
  }

  // ---------------------------------------------------------------- 16×16 destination icons
  // Shown on the desktop while the pet is away. One character per pixel, '.' = transparent.
  const ICON_PALETTE = {
    k: '#2a2420', g: '#2f7a3a', G: '#4fa04a', b: '#6b4a2b', y: '#f5c93a', Y: '#fff2a0', p: '#4a3b52', P: '#6a5a7a',
    o: '#ff8a2a', R: '#8a2a1a', r: '#c2441e', i: '#a8dcf6', w: '#ffffff', s: '#d8d0b8', S: '#a89e84',
    u: '#4a98d0', U: '#7cc0e6', m: '#6cbf5a', n: '#9a6a3a', c: '#2f5a3e'
  };
  const ICONS = {
    woods: [
      '.......kk.......', '......kGGk......', '.....kGGgGk.....', '......kGgk......', '.....kGGGgk.....',
      '....kGGGGggk....', '.....kGGGgk.....', '....kGGGGGgk....', '...kGGGGGGggk...', '..kGGGGGGGGggk..',
      '..kkkkkkkkkkkk..', '.......kbk......', '.......kbk......', '......kkkkk.....'],
    cave: [
      '.......k........', '......kYk.......', '.....kYyyk......', '.....kYyyk...k..', '....kYyyyyk.kYk.',
      '....kYyyyyk.kYk.', '..k.kYyyyyk.kyk.', '.kYk.kYyyk.kYyk.', '.kyk.kYyyk.kyyk.', '.kyykkYyyk.kyyk.',
      'kPPPPPPPPPPPPPPk', 'kppppppppppppppk', '.kkkkkkkkkkkkkk.'],
    volcano: [
      '......o...o.....', '.....o.o.o.o....', '......kook......', '.....kRooRk.....', '.....kRooRk.....',
      '....kRRoRRRk....', '....kRRoRRRk....', '...kRRRRoRRRk...', '...kRRRRoRRrk...', '..kRRRRRRoRrrk..',
      '..kRRRRRRorrrk..', '.kRRRRRRRRrrrrk.', '.kkkkkkkkkkkkkk.'],
    glacier: [
      '.......kk.......', '....k..ii..k....', '.....k.ii.k.....', '......kiik......', '..k...kiik...k..',
      '...kk.kiik.kk...', '.kiiiiiwwiiiiik.', '.kiiiiiwwiiiiik.', '...kk.kiik.kk...', '..k...kiik...k..',
      '......kiik......', '.....k.ii.k.....', '....k..ii..k....', '.......kk.......'],
    ruins: [
      '..kkkkkkkkkkkk..', '..kssssssssssk..', '...kkkkkkkkkk...', '....ksSsSsSk....', '....ksSsSsSk....',
      '....ksSsSsSk....', '....ksSsSsSk....', '....ksSsSsSk....', '....ksSsSsSk....', '....ksSsSsSk....',
      '...kkkkkkkkkk...', '..kssssssssssk..', '..kkkkkkkkkkkk..'],
    travel: [
      '.....kkkkkk.....', '...kkuuuuuukk...', '..kuummmuuuuuk..', '.kuummmmuuUuuuk.', '.kuummmmuuuuuuk.',
      'kuuuummuuuuummuk', 'kuuuuuuuuummmmuk', 'kuuuuuuuuummmuuk', 'kuUuuuuuuuumuuuk', 'kuuuummuuuuuuuuk',
      '.kuummmmuuuuuuk.', '.kuuummmuuuuuuk.', '..kuuuuuuuuuuk..', '...kkuuuuuukk...', '.....kkkkkk.....']
  };
  // the contest classes: a blackboard in the class's colour
  const BOARD = { coolClass: '#2f3e5a', cuteClass: '#7a3a64', smartClass: '#2f5a3e', toughClass: '#6a3a2a' };
  const boardIcon = () => [
    'kkkkkkkkkkkkkkkk', 'knnnnnnnnnnnnnnk', 'knccccccccccccnk', 'kncwwwwcccccccnk', 'knccccccwwwcccnk',
    'knccwwwcccccccnk', 'knccccccccccccnk', 'knccccwwwwccccnk', 'knccccccccccccnk', 'knnnnnnnnnnnnnnk',
    'kkkkkkkkkkkkkkkk', '...kk......kk...', '..kk........kk..'];

  function iconRgba(expId) {
    const rows = ICONS[expId] || (BOARD[expId] ? boardIcon() : ICONS.travel);
    const pal = { ...ICON_PALETTE, ...(BOARD[expId] ? { c: BOARD[expId] } : {}) };
    const w = 16, h = 16, top = Math.floor((h - rows.length) / 2);
    const data = new Uint8ClampedArray(w * h * 4);
    rows.forEach((row, y) => [...row.padEnd(w, '.').slice(0, w)].forEach((ch, x) => {
      const col = pal[ch];
      if (!col) return;
      const [r, g, b] = hex(col);
      const i = ((y + top) * w + x) * 4;
      data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255;
    }));
    return { width: w, height: h, data };
  }

  return { W, H, sceneRgba, iconRgba, REGIONS: Object.keys(REGIONS) };
});
