// Renders all built-in sprites (open + closed eyes) into one PNG sheet.
// Usage: node tools/preview-sprites.js [out.png]
const fs = require('fs');
const path = require('path');
const S = require('../src/shared/sprites');
const { encode, scale } = require('../src/main/png');

for (const id of S.ORDER) {
  S.DEFS[id].rows.forEach((r, i) => {
    if (r.length !== 16) console.warn(`${id} row ${i}: length ${r.length}`);
  });
}

const SC = 6, CELL = 40 * SC, PAD = 8;
const imgs = [];
for (const id of S.ORDER) for (const v of (process.env.VARIANTS || 'open,closed').split(',')) imgs.push(process.env.HD ? scale(S.rgba(id, v, true), SC / 2) : scale(S.rgba(id, v), SC));
const cols = 4, rowsN = Math.ceil(imgs.length / cols);
const W = cols * (CELL + PAD), H = rowsN * (CELL + PAD);
const out = new Uint8ClampedArray(W * H * 4);
for (let i = 0; i < out.length; i += 4) { out[i] = 200; out[i + 1] = 220; out[i + 2] = 235; out[i + 3] = 255; }
imgs.forEach((img, n) => {
  const ox = (n % cols) * (CELL + PAD) + Math.floor((CELL - img.width) / 2);
  const oy = Math.floor(n / cols) * (CELL + PAD) + (CELL - img.height);
  for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) {
    const si = (y * img.width + x) * 4;
    if (!img.data[si + 3]) continue;
    const di = ((oy + y) * W + ox + x) * 4;
    out.set(img.data.subarray(si, si + 4), di);
  }
});
const file = process.argv[2] || path.join(__dirname, '..', 'sprite-preview.png');
fs.writeFileSync(file, encode(W, H, out));
console.log('wrote', file);
