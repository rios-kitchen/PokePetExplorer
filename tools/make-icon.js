// Generates build/icon.png (512x512 pixel Poké Ball) used by electron-builder.
const fs = require('fs');
const path = require('path');
const S = require('../src/shared/sprites');
const { encode, scale } = require('../src/main/png');

const img = scale(S.pokeballRgba(), 32);
const out = path.join(__dirname, '..', 'build', 'icon.png');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, encode(img.width, img.height, img.data));
console.log('wrote', out);
