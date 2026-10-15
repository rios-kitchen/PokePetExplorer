// Downloads the three starters' PMD SpriteCollab sprites and portraits into assets/pmd/, so the app can show them
// on first launch without the internet (main.js seedBundledSprites copies them into the sprite cache).
// Runs before every build (npm run dist*) and npm start; skips what's already there. assets/pmd is not committed.
// The sprites are CC BY-NC 4.0 by the PMD SpriteCollab artists – credited in assets/pmd/CREDITS.txt and in the app.
const fs = require('fs');
const path = require('path');
const Sources = require('../src/main/sources');

const STARTERS = [1, 4, 7];
const EMOTIONS = ['Normal', 'Happy', 'Joyous', 'Pain', 'Worried', 'Sad', 'Crying', 'Determined', 'Inspired',
  'Surprised', 'Dizzy', 'Sigh', 'Angry', 'Teary-Eyed', 'Shouting', 'Special0'];
const dir = path.join(__dirname, '..', 'assets', 'pmd');

(async () => {
  fs.mkdirSync(dir, { recursive: true });
  for (const dex of STARTERS) {
    await Sources.downloadSkin(dex, false, dir);
    for (const e of EMOTIONS) await Sources.portrait(dex, e, dir);
  }
  const lines = ['PMD SpriteCollab sprites and portraits (https://github.com/PMDCollab/SpriteCollab), CC BY-NC 4.0.', ''];
  for (const dex of STARTERS) {
    const c = Sources.cachedCredits(dex, dir) || {};
    lines.push(`#${String(dex).padStart(4, '0')}  sprite: ${((c.sprite && c.sprite.names) || []).join(', ') || '?'}  ·  portrait: ${((c.portrait && c.portrait.names) || []).join(', ') || '?'}`);
  }
  fs.writeFileSync(path.join(dir, 'CREDITS.txt'), `${lines.join('\n')}\n`);
  console.log('assets/pmd:', fs.readdirSync(dir).join(', '));
})().catch((e) => {
  // a build must have them; `npm start` can do without (the app downloads them instead)
  console.error('bundle-starters:', e.message);
  process.exit(process.argv.includes('--required') ? 1 : 0);
});
