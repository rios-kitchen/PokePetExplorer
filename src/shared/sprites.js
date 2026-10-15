/*
 * Small pixel art drawn in code: effect glyphs (hearts, stars, z's …) and Poké Balls (eggs, placeholders while a
 * sprite downloads). Pokémon themselves always use their PMD SpriteCollab sprites. DEFS keeps the names and cries
 * of PokePet's former built-in Pokémon (old saves, the three starters).
 * Works both in Node (require) and in the browser (window.PokeSprites).
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PokeSprites = api;
})(typeof self !== 'undefined' ? self : this, function () {
  const DEFS = {
    pikachu: { dex: 25, name: {en: 'Pikachu', zh: '皮卡丘'}, cry: {en: 'Pika pika!', zh: '皮卡皮卡！'} },
    charmander: { dex: 4, name: {en: 'Charmander', zh: '小火龙'}, cry: {en: 'Char char!', zh: '火火！'} },
    bulbasaur: { dex: 1, name: {en: 'Bulbasaur', zh: '妙蛙种子'}, cry: {en: 'Bulba!', zh: '种子种子！'} },
    squirtle: { dex: 7, name: {en: 'Squirtle', zh: '杰尼龟'}, cry: {en: 'Squirtle!', zh: '杰尼杰尼！'} },
    eevee: { dex: 133, name: {en: 'Eevee', zh: '伊布'}, cry: {en: 'Vee vee!', zh: '布伊！'} },
    jigglypuff: { dex: 39, name: {en: 'Jigglypuff', zh: '胖丁'}, cry: {en: 'Jiggly~puff~', zh: '胖~丁~'} }
  };

  const ORDER = ['pikachu', 'charmander', 'bulbasaur', 'squirtle', 'eevee', 'jigglypuff'];

  function hexToRgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

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

  // ---------------------------------------------------------------- mystery Poké Ball
  // A 20×20 pixel Poké Ball holding a Pokémon nobody has met yet. The seed (from its id) picks the kind
  // of ball; `open` 0–2 shows it about to open (the button glows, then a crack of light).
  const BALLS = [
    { top: '#e3350d', dark: '#a3220a' },                          // Poké Ball
    { top: '#2f6fd6', dark: '#1f4c9a', stripe: '#e3350d' },       // Great Ball
    { top: '#2c2c34', dark: '#18181e', stripe: '#f2c42c' },       // Ultra Ball
    { top: '#f4f4f4', dark: '#c8c8c8', band: '#e3350d' }          // Premier Ball
  ];

  function ballRgba(seed = 0, open = 0) {
    const w = 20, h = 20, c = 9.5, R = 9.45;
    const data = new Uint8ClampedArray(w * h * 4);
    const kind = BALLS[Math.abs(seed) % BALLS.length];
    const set = (x, y, hexc) => {
      const [r, g, b] = hexToRgb(hexc);
      const i = (y * w + x) * 4;
      data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255;
    };
    const d = (x, y) => Math.hypot(x - c, y - c);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const r = d(x, y);
      if (r > R) continue;
      if (r > R - 1.2) { set(x, y, '#23201c'); continue; }                       // outline
      const band = y >= 9 && y <= 10;
      const shade = x + y > 25;                                                  // lower right is darker
      if (band) { set(x, y, kind.band && Math.abs(x - c) > 4 ? kind.band : '#23201c'); continue; }
      if (y < 9) {
        let col = shade ? kind.dark : kind.top;
        if (kind.stripe && (Math.abs(x - 4) <= 1 || Math.abs(x - 15) <= 1) && y > 2 && y < 8) col = kind.stripe;
        if (kind.stripe && kind.top === '#2c2c34' && y > 1 && y < 6 && Math.abs(x - c) > 3 && Math.abs(x - c) < 7) col = kind.stripe;
        if ((x - 6) ** 2 + (y - 4) ** 2 <= 2.2) col = '#ffffff';                 // shine
        set(x, y, col);
      } else {
        set(x, y, shade ? '#c8c4bc' : '#f4f2ec');
      }
    }
    // the button
    for (let y = 6; y < 14; y++) for (let x = 6; x < 14; x++) {
      const r = d(x, y);
      if (r <= 3.3) set(x, y, r > 2.2 ? '#23201c' : open ? (open > 1 ? '#fff6b0' : '#ffe680') : r > 1.2 ? '#e8e4dc' : '#ffffff');
    }
    if (open > 1) for (let x = 2; x < 18; x++) if (Math.abs(x - c) > 3.4 && d(x, 9) <= R - 1.2) set(x, 9, '#fff6b0');   // light leaks out
    return { width: w, height: h, data };
  }

  return { DEFS, ORDER, GLYPHS, glyphRgba, pokeballRgba, ballRgba };
});
