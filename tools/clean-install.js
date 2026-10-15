// Leaves only the installers (.dmg / .exe) in install/ – removes unpacked apps, blockmaps and logs.
const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '..', 'install');
if (fs.existsSync(dir)) {
  for (const name of fs.readdirSync(dir)) {
    if (/\.(dmg|exe)$/i.test(name)) continue;
    fs.rmSync(path.join(dir, name), { recursive: true, force: true });
  }
  console.log('install/:', fs.readdirSync(dir).join(', '));
}
