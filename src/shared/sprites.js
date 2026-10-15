/*
 * Hand-made pixel sprites for the built-in Pokémon.
 *
 * Format:
 *   rows    – left half of a front-facing sprite (16 chars per row), mirrored
 *             to build the right half. '.' = transparent.
 *   patches – [row, col, 'text', mode] drawn after mirroring.
 *             mode 'behind' only paints transparent pixels, 'over' paints all.
 *             A space ' ' inside a patch is skipped.
 *   width   – canvas width (base sprite is placed at x = 0..31).
 *   lid     – palette char used for closed eyelids.
 *
 * Eyes use the chars 'e' (pupil) and 'w' (highlight); blinking replaces them.
 * Works both in Node (require) and in the browser (window.PokeSprites).
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PokeSprites = api;
})(typeof self !== 'undefined' ? self : this, function () {
  const DEFS = {
    pikachu: {
      name: { en: 'Pikachu', zh: '皮卡丘' },
      cry: { en: 'Pika pika!', zh: '皮卡皮卡！' },
      dex: 25,
      width: 38,
      lid: 'y',
      palette: {
        k: '#3b2a12', y: '#f8d030', Y: '#d8a818', b: '#2a2018', r: '#e8463a',
        t: '#9a5a2a', e: '#1c1410', w: '#ffffff'
      },
      rows: [
        '................',
        '...kk...........',
        '...kbk..........',
        '...kbbk.........',
        '....kbbk........',
        '....kbbyk.......',
        '.....kyyk.......',
        '.....kyyyk......',
        '......kyyyk.....',
        '......kyyyyk....',
        '.......kyyyykkkk',
        '......kyyyyyyyyy',
        '.....kyyyyyyyyyy',
        '.....kyyyyyyyyyy',
        '....kyyyyweyyyyy',
        '....kyyyyeeyyyyy',
        '....kyyyyeeyyyyy',
        '....krrryyyyyyyk',
        '....krrrryyyyyky',
        '....krrrryyyyyyk',
        '.....krryyyyyyyy',
        '......kkyyyyyyyy',
        '.......kyyyyyyyy',
        '......kyyyyyyyyy',
        '......kyykyyyyyy',
        '.....kyyykyyyyyy',
        '.....kyyyykkyyyy',
        '.....kyyyyyyyyyy',
        '.....kYyyyyyyyyy',
        '......kYyyyyyyyy',
        '......kyyykkkkkk',
        '.......kkkk.....'
      ],
      patches: [
        [7, 27, [
          '.......kkkk',
          '.....kkyyyk',
          '....kyyyyyk',
          '...kyyyyyk.',
          '...kyyyyk..',
          '....kyyyk..',
          '.....kyyyk.',
          '....kyyyk..',
          '...kyyyk...',
          '..kyyyk....',
          '..kyyk.....',
          '...kyyk....',
          '....kyyk...',
          '...kyyk....',
          '..kttk.....',
          '.kttk......',
          'kttk.......'
        ], 'behind'],
        [24, 25, ['kttk', '.kk.'], 'behind']
      ]
    },

    charmander: {
      name: { en: 'Charmander', zh: '小火龙' },
      cry: { en: 'Char char!', zh: '火火！' },
      dex: 4,
      width: 38,
      lid: 'o',
      palette: {
        k: '#4a2210', o: '#f48a3a', O: '#d0682a', c: '#f8dc98', f: '#f04020',
        F: '#f8a028', Y: '#fff070', e: '#1a1020', w: '#ffffff'
      },
      rows: [
        '..........kkkkkk',
        '........kkoooooo',
        '.......koooooooo',
        '......kooooooooo',
        '.....koooooooooo',
        '.....koooooooooo',
        '....koooKKoooooo',
        '....kooKweKooooo',
        '....kooKeeKooooo',
        '....kooKeeKooooo',
        '....koooKKoooooo',
        '....kooooooooooo',
        '.....koooooooooo',
        '.....koookoooooo',
        '......kooookkkkk',
        '.......koooooooo',
        '........kkoooooo',
        '.......koocccccc',
        '......kooocccccc',
        '.....koookcccccc',
        '....kooookcccccc',
        '....kckckkcccccc',
        '.......koccccccc',
        '......kooccccccc',
        '......kooccccccc',
        '......kooocccccc',
        '.....koooooccccc',
        '.....koooooocccc',
        '.....koooooook..',
        '.....kckckckk...'
      ],
      patches: [
        [10, 28, [
          '....kk....',
          '...kFFk...',
          '..kFYFFk..',
          '.kfFYYFfk.',
          '.kfFYYFfk.',
          '.kffFFffk.',
          '..kffffk..',
          '...kook...',
          '...kook...',
          '..kook....',
          '.kook.....',
          'kook......',
          'ook.......',
          'kk........'
        ], 'behind'],
        [22, 26, ['kook'], 'behind']
      ]
    },

    bulbasaur: {
      name: { en: 'Bulbasaur', zh: '妙蛙种子' },
      cry: { en: 'Bulba!', zh: '种子种子！' },
      dex: 1,
      width: 32,
      lid: 'g',
      palette: {
        k: '#1f3a2c', g: '#78ccb0', G: '#3e9078', b: '#62b84a', B: '#3a8a2c',
        m: '#f07888', w: '#ffffff', e: '#c8283a'
      },
      rows: [
        '...........kkkkk',
        '.........kkbbbbB',
        '........kbbbbBbb',
        '.......kbbbbBbbb',
        '.......kbbbBbbbb',
        '......kbbbbBbbbb',
        '..kk...kbbbBbbbb',
        '..kgk..kkkkkkkkk',
        '..kggkkggggggggg',
        '..kgggggggGggggg',
        '.kgggggggGGggggg',
        '.kgggggggggggggg',
        '.kggggKKKggggggg',
        '.kgggKwweKgggggg',
        '.kgggKweeKgggggg',
        '.kggggKKKggggggg',
        '.kgggggggggggggg',
        '..kggggkkkkkkkkk',
        '...kggggkmmmmmmm',
        '....kggggkkkkkkk',
        '.....kgggggggggg',
        '....kggggggggggg',
        '...kgggggkgggggg',
        '...kGgggkggggggg',
        '...kggggkgggGggg',
        '...kgGggkggggGgg',
        '...kggggkggggggg',
        '...kwgwgkggggggg',
        '...kkkkkkkkkkkkk'
      ],
      patches: []
    },

    squirtle: {
      name: { en: 'Squirtle', zh: '杰尼龟' },
      cry: { en: 'Squirtle!', zh: '杰尼杰尼！' },
      dex: 7,
      width: 38,
      lid: 'b',
      palette: {
        k: '#1c3048', b: '#84ccf4', B: '#4c94cc', s: '#c88848', S: '#8a5428',
        c: '#f4e4a4', C: '#d0b468', e: '#5a2418', w: '#ffffff'
      },
      rows: [
        '..........kkkkkk',
        '........kkbbbbbb',
        '.......kbbbbbbbb',
        '......kbbbbbbbbb',
        '.....kbbbbbbbbbb',
        '.....kbbbbbbbbbb',
        '....kbbbbKKbbbbb',
        '....kbbbKweKbbbb',
        '....kbbbKeeKbbbb',
        '....kbbbKeeKbbbb',
        '....kbbbbKKbbbbb',
        '....kbbbbbbbbbbb',
        '.....kbbbbbbkbbb',
        '......kbbbbbbkkk',
        '.......kkbbbbbbb',
        '......kskkcccccc',
        '.....kssskcccccc',
        '...kbbbsskcccccc',
        '...kbbbsskcccccc',
        '....kkksskCCCCCC',
        '......kskccccccc',
        '......kskccccccc',
        '......kskCCCCCCC',
        '.....kbskccccccc',
        '....kbbbkccccccc',
        '....kbbbbkkkkkkk',
        '....kbbbbk......',
        '.....kkkk.......'
      ],
      patches: [
        [18, 27, [
          '.....kkk.',
          '....kbbbk',
          '...kbkkbk',
          '..kbbkbbk',
          '.kbbbbbk.',
          'kbbbbkk..',
          'kkkkk....'
        ], 'behind']
      ]
    },

    eevee: {
      name: { en: 'Eevee', zh: '伊布' },
      cry: { en: 'Vee vee!', zh: '布伊！' },
      dex: 133,
      width: 38,
      lid: 'b',
      palette: {
        k: '#3a2214', b: '#c88a52', B: '#7a4a28', c: '#f8ecc8', C: '#dcc898',
        e: '#2a1408', w: '#ffffff'
      },
      rows: [
        '................',
        '..kk............',
        '..kbk...........',
        '..kbbk..........',
        '..kbBbk.........',
        '..kbBBbk........',
        '..kbBBBbk.......',
        '...kbBBbbk......',
        '...kbbBbbbkkkkkk',
        '....kbbbbbbbbbbb',
        '....kbbbbbbbbbbb',
        '....kbbbbbbbbbbb',
        '...kbbbbbbbbbbbb',
        '...kbbbbKKbbbbbb',
        '...kbbbKweeKbbbb',
        '...kbbbKeeeKbbbb',
        '...kbbbbKKKbbbbb',
        '....kbbbbbbbbbbk',
        '....kbbbbbbbbkbb',
        '.....kbbbbbbbbkk',
        '......kkbbbbbbbb',
        '...kkccccckkkkkk',
        '..kccccccccccccc',
        '.kcckccccccccccc',
        '..kcccCccccccccc',
        '...kkkcccccccccc',
        '.....kbbkccccccc',
        '.....kbbbkbbbbbb',
        '.....kbbbkbbbbbb',
        '.....kbbbkbbbbbb',
        '.....kbbbkkkkkkk',
        '......kkk.......'
      ],
      patches: [
        [13, 26, [
          '.......kkk..',
          '.....kkccck.',
          '....kcccccck',
          '...kccccccck',
          '...kcccccck.',
          '..kbcccckk..',
          '..kbbbbbk...',
          '.kbbbbbbk...',
          '.kbbbbbbk...',
          '.kbbbbbk....',
          'kbbbbbk.....',
          'kbbbbk......',
          'kbbbk.......',
          'kkkk........'
        ], 'behind']
      ]
    },

    jigglypuff: {
      name: { en: 'Jigglypuff', zh: '胖丁' },
      cry: { en: 'Jiggly~puff~', zh: '胖~丁~' },
      dex: 39,
      width: 32,
      lid: 'p',
      palette: {
        k: '#5a2838', p: '#fbbccc', P: '#ec94ac', D: '#3c2a3c', e: '#2f76c0',
        w: '#ffffff', E: '#173e70'
      },
      rows: [
        '..kk......kkkkkk',
        '..kDk...kkpppppp',
        '..kDDk.kpppppppp',
        '..kDDpkppppppppp',
        '..kDpppppppppppp',
        '.kpppppppppppppp',
        '.kpppppppppppppp',
        'kppppKKKKppppppp',
        'kpppKwweeKpppppp',
        'kpppKwweeKpppppp',
        'kpppKeeEeKpppppp',
        'kpppKeeeeKpppppp',
        'kppppKKKKppppppp',
        'kPpppppppppppppp',
        'kPpppppppppppppk',
        'kPPppppppppppppp',
        '.kPppppppppppppp',
        '.kPPpppppppppppp',
        '..kPPppppppppppp',
        '...kPPpppppppppp',
        '....kkPPPppppppp',
        '......kkkkkkkkkk',
        '.....kpppk......',
        '.....kkkkk......'
      ],
      patches: [
        [0, 13, [
          '..kkkk',
          '.kppppk',
          'kpkkkpk',
          'kpk.kpk',
          '.kpkkp ',
          '..kpp  '
        ], 'over']
      ]
    }
  };

  const ORDER = ['pikachu', 'charmander', 'bulbasaur', 'squirtle', 'eevee', 'jigglypuff'];

  /** Build the char grid (rows of equal length) for a sprite. */
  function buildGrid(id) {
    const def = DEFS[id];
    const W = def.width || 32;
    const grid = def.rows.map((half) => {
      const h = half.slice(0, 16).padEnd(16, '.');
      const full = h + h.split('').reverse().join('');
      return (full + '.'.repeat(W)).slice(0, W).split('');
    });
    for (const [row, col, lines, mode] of def.patches || []) {
      lines.forEach((line, dy) => {
        const y = row + dy;
        if (!grid[y]) return;
        for (let dx = 0; dx < line.length; dx++) {
          const ch = line[dx];
          const x = col + dx;
          if (ch === ' ' || x >= W) continue;
          if (ch === '.' && mode !== 'over') continue;
          if (mode === 'behind' && grid[y][x] !== '.') continue;
          if (ch === '.') continue;
          grid[y][x] = ch;
        }
      });
    }
    return trim(grid);
  }

  function trim(grid) {
    let top = grid.length, bottom = -1, left = Infinity, right = -1;
    grid.forEach((row, y) => row.forEach((c, x) => {
      if (c === '.') return;
      top = Math.min(top, y); bottom = Math.max(bottom, y);
      left = Math.min(left, x); right = Math.max(right, x);
    }));
    if (bottom < 0) return [['.']];
    return grid.slice(top, bottom + 1).map((r) => r.slice(left, right + 1));
  }

  const EYE = new Set(['e', 'w', 'E', 'K']);

  /** Replace each open eye (incl. its 'K' ring) by a short closed-eye line. */
  function closeEyes(grid, lid) {
    const g = grid.map((r) => r.slice());
    const H = g.length, W = g[0].length;
    const seen = new Set();
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (!EYE.has(g[y][x]) || seen.has(y * W + x)) continue;
      // flood-fill one eye cluster
      const stack = [[x, y]], cells = [];
      seen.add(y * W + x);
      while (stack.length) {
        const [cx, cy] = stack.pop();
        cells.push([cx, cy]);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = cx + dx, ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          if (!EYE.has(g[ny][nx]) || seen.has(ny * W + nx)) continue;
          seen.add(ny * W + nx);
          stack.push([nx, ny]);
        }
      }
      const xs = cells.map((c) => c[0]), ys = cells.map((c) => c[1]);
      const x0 = Math.min(...xs), x1 = Math.max(...xs);
      const lineY = Math.ceil((Math.min(...ys) + Math.max(...ys)) / 2);
      for (const [cx, cy] of cells) g[cy][cx] = lid;
      for (let lx = x0; lx <= x1; lx++) g[lineY][lx] = 'k';
    }
    return g;
  }

  /**
   * Shift the pupils one pixel left (dir -1) or right (dir 1) so the pet "looks" that way.
   * Eyes with a 'K' ring keep their outline and only the pupils move (white fills the gap);
   * eyes without a ring move as a whole.
   */
  function lookEyes(grid, dir, lid) {
    const g = grid.map((r) => r.slice());
    const H = g.length, W = g[0].length;
    const seen = new Set();
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (!EYE.has(grid[y][x]) || seen.has(y * W + x)) continue;
      const stack = [[x, y]], cells = [];
      seen.add(y * W + x);
      while (stack.length) {
        const [cx, cy] = stack.pop();
        cells.push([cx, cy]);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = cx + dx, ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          if (!EYE.has(grid[ny][nx]) || seen.has(ny * W + nx)) continue;
          seen.add(ny * W + nx);
          stack.push([nx, ny]);
        }
      }
      const ringed = cells.some(([cx, cy]) => grid[cy][cx] === 'K');
      const inCluster = new Set(cells.map(([cx, cy]) => cy * W + cx));
      const moving = cells.filter(([cx, cy]) => {
        const c = grid[cy][cx];
        return ringed ? c === 'e' || c === 'E' : c !== 'K';
      });
      const writes = [];
      for (const [cx, cy] of moving) {
        const tx = cx + dir;
        const target = grid[cy][tx];
        const ok = tx >= 0 && tx < W && (ringed
          ? inCluster.has(cy * W + tx) && target !== 'K'
          : target !== undefined && target !== 'k' && target !== 'K' && target !== '.');
        writes.push([ok ? tx : cx, cy, grid[cy][cx]]);
        g[cy][cx] = ringed ? 'w' : lid;
      }
      for (const [wx, wy, c] of writes) g[wy][wx] = c;
    }
    return g;
  }

  function hexToRgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  // ------------------------------------------------------------------ HD rendering
  // The hand-drawn grids are upscaled with Scale2x (smoother curves), then shaded:
  // a darker band along the lower/right rims, a light rim on top, and a softer
  // inner outline ("sel-out"). This gives the 32px designs a much richer look.
  const OUTLINE = new Set(['k', 'K']);
  const NO_SHADE = new Set(['e', 'w', 'E', 'K', 'k', '.']);

  function scale2x(grid) {
    const H = grid.length, W = grid[0].length;
    const at = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? '.' : grid[y][x]);
    const out = Array.from({ length: H * 2 }, () => new Array(W * 2));
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const P = at(x, y), A = at(x, y - 1), B = at(x + 1, y), C = at(x - 1, y), D = at(x, y + 1);
      out[2 * y][2 * x] = C === A && C !== D && A !== B ? A : P;
      out[2 * y][2 * x + 1] = A === B && A !== C && B !== D ? B : P;
      out[2 * y + 1][2 * x] = D === C && D !== B && C !== A ? C : P;
      out[2 * y + 1][2 * x + 1] = B === D && B !== A && D !== C ? D : P;
    }
    return out;
  }

  const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
  const shade = (rgb) => mix(rgb, [rgb[0] * 0.62, rgb[1] * 0.6, Math.min(255, rgb[2] * 0.72 + 18)], 0.55);
  const light = (rgb) => mix(rgb, [255, 255, 245], 0.28);

  function hdPixels(def, grid) {
    const g = scale2x(grid);
    const H = g.length, W = g[0].length;
    const at = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? '.' : g[y][x]);
    const col = (c) => hexToRgb(def.palette[c] || def.palette.k);
    const data = new Uint8ClampedArray(W * H * 4);
    const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    const outer = (x, y) => OUTLINE.has(at(x, y)) && N4.some(([dx, dy]) => at(x + dx, y + dy) === '.');
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const c = g[y][x];
      if (c === '.') continue;
      let rgb;
      if (OUTLINE.has(c)) {
        // the inner half of the (now 2px thick) silhouette line becomes a dark tint of the
        // neighbouring fill; inner details (mouth, eyes, arms) stay crisp and dark
        const innerHalf = !outer(x, y) && N4.some(([dx, dy]) => outer(x + dx, y + dy));
        const fill = [[1, 0], [0, 1], [-1, 0], [0, -1]].map(([dx, dy]) => at(x + dx, y + dy)).find((n) => !NO_SHADE.has(n));
        rgb = col('k');
        if (innerHalf && fill) rgb = mix(shade(shade(col(fill))), rgb, 0.35);
      } else {
        rgb = col(c);
        if (!NO_SHADE.has(c)) {
          const edge = (dx, dy, n) => {
            for (let i = 1; i <= n; i++) {
              const v = at(x + dx * i, y + dy * i);
              if (OUTLINE.has(v) || v === '.') return true;
            }
            return false;
          };
          if (edge(0, 1, 3) || edge(1, 0, 2) || edge(1, 1, 2)) rgb = shade(rgb);
          else if (edge(0, -1, 1) || edge(-1, -1, 1)) rgb = light(rgb);
        }
      }
      const i = (y * W + x) * 4;
      data[i] = rgb[0]; data[i + 1] = rgb[1]; data[i + 2] = rgb[2]; data[i + 3] = 255;
    }
    return { width: W, height: H, data };
  }

  /** RGBA pixel data for a sprite. variant: 'open' | 'closed' | 'lookL' | 'lookR'; hd: 2x shaded. */
  function rgba(id, variant, hd) {
    const def = DEFS[id];
    let grid = buildGrid(id);
    if (variant === 'closed') grid = closeEyes(grid, def.lid);
    if (variant === 'lookL') grid = lookEyes(grid, -1, def.lid);
    if (variant === 'lookR') grid = lookEyes(grid, 1, def.lid);
    if (hd) return hdPixels(def, grid);
    const h = grid.length, w = grid[0].length;
    const data = new Uint8ClampedArray(w * h * 4);
    const cache = {};
    grid.forEach((row, y) => row.forEach((c, x) => {
      if (c === '.') return;
      const hex = def.palette[c] || (c === 'K' ? def.palette.k : null);
      if (!hex) throw new Error(`Sprite ${id}: unknown color '${c}' at ${x},${y}`);
      const rgb = cache[c] || (cache[c] = hexToRgb(hex));
      const i = (y * w + x) * 4;
      data[i] = rgb[0]; data[i + 1] = rgb[1]; data[i + 2] = rgb[2]; data[i + 3] = 255;
    }));
    return { width: w, height: h, data };
  }

  /* Small effect glyphs (hearts, stars, …) drawn around the pet. */
  const GLYPHS = {
    heart: { p: { r: '#ff5a7a', R: '#ffb0c0' }, rows: ['.rr.rr.', 'rRrrrrr', 'rrrrrrr', '.rrrrr.', '..rrr..', '...r...'] },
    star: { p: { y: '#ffd84a', Y: '#fff6b0' }, rows: ['..y..', '.yYy.', 'yyyyy', '.yyy.', '.y.y.'] },
    note: { p: { k: '#5060c8' }, rows: ['..kk', '.k.k', '.k..', '.k..', 'kk..', 'kk..'] },
    z: { p: { b: '#7aa0e0' }, rows: ['bbbb', '..b.', '.b..', 'bbbb'] },
    sweat: { p: { b: '#7ac8f8', w: '#ffffff' }, rows: ['.b.', 'bwb', 'bbb', '.b.'] },
    berry: { p: { g: '#4aa040', r: '#e03850', R: '#ff90a0', k: '#702030' }, rows: ['..g..', '.ggg.', '.rrr.', 'rRrrr', 'rrrrr', '.rrr.'] },
    spark: { p: { y: '#fff27a' }, rows: ['.y.', 'yyy', '.y.'] },
    anger: { p: { r: '#e83030' }, rows: ['r.r', '.r.', 'r.r'] },
    alert: { p: { r: '#ff4040', k: '#701010' }, rows: ['krk', 'krk', 'krk', 'krk', '.k.', 'krk', '.k.'] },
    kbd: { p: { k: '#3a3a46', w: '#f0f0f6', g: '#a8a8bc' }, rows: ['kkkkkkkkkkkkk', 'kwgwgwgwgwgwk', 'kgwgwgwgwgwgk', 'kwwwgggggwwwk', 'kkkkkkkkkkkkk'] },
    kbd2: { p: { k: '#3a3a46', w: '#f0f0f6', g: '#a8a8bc' }, rows: ['kkkkkkkkkkkkk', 'kgwgwgwgwgwgk', 'kwgwgwgwgwgwk', 'kwwwgggggwwwk', 'kkkkkkkkkkkkk'] },
    puff: { p: { p: '#ff9ec4', P: '#ffd0e4', b: '#b0703c', B: '#e0a868', w: '#ffffff' }, rows: ['..w..', '.pPp.', 'pPppp', 'BbBbB', '.bBb.'] },
    candy: { p: { b: '#5a8cf0', B: '#a8c8ff', y: '#ffe060' }, rows: ['y.....y', 'yybBbyy', 'y.bbb.y'] },
    pill: { p: { r: '#e84848', w: '#f6f6f6', k: '#803030' }, rows: ['.rrww.', 'rrrwww', '.rrww.'] },
    bubble: { p: { b: '#9fd8ff', w: '#ffffff' }, rows: ['.bbb.', 'bw..b', 'b...b', 'b...b', '.bbb.'] },
    fly: { p: { k: '#303030', w: '#d0e8ff' }, rows: ['w.w', '.k.'] },
    poop: {
      p: { k: '#3a2410', b: '#7a4a22', B: '#a8703a', h: '#d8a868' },
      rows: [
        '.....k.....',
        '....kbk....',
        '...kbhbk...',
        '...kbbbk...',
        '..kbBhbbk..',
        '.kbbbbbBbk.',
        'kbBhbbbbbbk',
        'kbbbbbbBbbk',
        '.kkkkkkkkk.'
      ]
    },
    stink: { p: { g: '#9ab86a' }, rows: ['.g', 'g.', '.g', 'g.'] },
    tomato: { p: { g: '#3a9a40', r: '#ee4433', R: '#ff9a88' }, rows: ['..gg.', '.ggg.', 'rrgrr', 'rRrrr', 'rrrrr', '.rrr.'] }
  };

  function glyphRgba(name) {
    const gl = GLYPHS[name];
    const h = gl.rows.length, w = gl.rows[0].length;
    const data = new Uint8ClampedArray(w * h * 4);
    gl.rows.forEach((row, y) => row.split('').forEach((c, x) => {
      if (c === '.') return;
      const [r, g, b] = hexToRgb(gl.p[c]);
      const i = (y * w + x) * 4;
      data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255;
    }));
    return { width: w, height: h, data };
  }

  /* 16x16 Poké Ball used for the tray / app icon. */
  const POKEBALL = {
    p: { k: '#202020', r: '#e83838', R: '#ff8080', w: '#f4f4f4', g: '#c8c8c8' },
    rows: [
      '.....kkkkkk.....',
      '...kkrrrrrrkk...',
      '..krrRRrrrrrrk..',
      '.krRRrrrrrrrrrk.',
      '.krRrrrrrrrrrrk.',
      'krrrrrrrrrrrrrrk',
      'krrrrrkkkkrrrrrk',
      'kkkkkkkwwkkkkkkk',
      'kwwwwwkwwkwwwwwk',
      'kwwwwwwkkwwwwwgk',
      'kwwwwwwwwwwwwwgk',
      '.kwwwwwwwwwwwgk.',
      '.kwwwwwwwwwwggk.',
      '..kgwwwwwwwggk..',
      '...kkggggggkk...',
      '.....kkkkkk.....'
    ]
  };

  function pokeballRgba() {
    const h = 16, w = 16;
    const data = new Uint8ClampedArray(w * h * 4);
    POKEBALL.rows.forEach((row, y) => row.split('').forEach((c, x) => {
      if (c === '.') return;
      const [r, g, b] = hexToRgb(POKEBALL.p[c]);
      const i = (y * w + x) * 4;
      data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255;
    }));
    return { width: w, height: h, data };
  }

  // ---------------------------------------------------------------- mystery egg
  // A 16×20 pixel egg: cream shell, spots in a colour picked from the seed (the species' dex),
  // outline and shading like the other pixel art. `crack` 0–2 draws hatching cracks.
  const EGG_SPOTS = ['#6bbf59', '#e2603b', '#4a8fd6', '#d9a62e', '#9b6bd6', '#e07aa8', '#4fb3a8', '#8a6a4a'];

  function eggRgba(seed = 0, crack = 0) {
    const w = 16, h = 20;
    const data = new Uint8ClampedArray(w * h * 4);
    const cx = 7.5;
    const inside = (x, y) => {
      if (y < 0 || y >= h || x < 0 || x >= w) return false;
      // narrower at the top: an egg, not an ellipse
      const t = (y + 0.5) / h;
      const rx = 7.6 * Math.sqrt(Math.max(0, 1 - Math.pow((t - 0.58) / 0.6, 2))) * (t < 0.58 ? 0.9 + 0.1 * t / 0.58 : 1);
      return Math.abs(x + 0.5 - (cx + 0.5)) <= rx;
    };
    const spot = hexToRgb(EGG_SPOTS[Math.abs(seed) % EGG_SPOTS.length]);
    const spots = [[4, 6], [10, 4], [11, 11], [5, 13], [8, 9], [3, 9]].slice(0, 4 + (seed % 3));
    const set = (x, y, [r, g, b]) => {
      const i = (y * w + x) * 4;
      data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255;
    };
    const cracks = crack > 0 ? [[5, 7], [6, 8], [7, 7], [8, 8], [9, 7], [10, 8]].concat(crack > 1 ? [[7, 6], [7, 5], [9, 9], [6, 9]] : []) : [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (!inside(x, y)) continue;
      const edge = !inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1);
      if (edge) { set(x, y, [40, 36, 30]); continue; }
      let c = [246, 238, 220];
      if (spots.some(([sx, sy]) => (x - sx) ** 2 + (y - sy) ** 2 <= 2.2)) c = spot;
      if (x > 10 || y > 15) c = c.map((v) => Math.round(v * 0.86));        // shade
      if (x === 4 && y >= 3 && y <= 5) c = [255, 255, 255];                  // shine
      if (cracks.some(([qx, qy]) => qx === x && qy === y)) c = [40, 36, 30];
      set(x, y, c);
    }
    return { width: w, height: h, data };
  }

  return { DEFS, ORDER, GLYPHS, buildGrid, rgba, glyphRgba, pokeballRgba, eggRgba };
});
