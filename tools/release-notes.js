// Release notes for a version from its CHANGELOG.md section, in the usual layout (what's new, downloads, updating,
// the unsigned-installer note, the disclaimer). The release workflow uses it when no draft with notes exists yet.
// node tools/release-notes.js 1.5.0 > notes.md
const fs = require('fs');
const path = require('path');

const REPO = 'https://github.com/rios-kitchen/PokePetExplorer';

/** The bullets under "## <version> · …" in the changelog text (null when the version isn't there). */
function section(changelog, version) {
  const lines = changelog.split(/\r?\n/);
  const start = lines.findIndex((l) => l.startsWith(`## ${version} `) || l.trim() === `## ${version}`);
  if (start < 0) return null;
  const end = lines.findIndex((l, i) => i > start && l.startsWith('## '));
  return lines.slice(start + 1, end < 0 ? undefined : end).join('\n').trim();
}

function notes(changelog, version) {
  const body = section(changelog, version);
  if (!body) return `PokePet Explorer ${version}`;
  return `宝可宠探索 ${version}。玩法说明在 [Wiki](${REPO}/wiki)，所有改动见 [CHANGELOG](${REPO}/blob/main/CHANGELOG.md)。
PokePet Explorer ${version}. How to play is in the [Wiki](${REPO}/wiki); every change is in the [CHANGELOG](${REPO}/blob/main/CHANGELOG.md).

**新内容 / What's new**
${body}

**下载 / Downloads**
- macOS：\`PokePetExplorer-${version}-macOS.dmg\`（Universal）
- Windows：\`PokePetExplorer-${version}-Windows-Setup.exe\`（x64）

从 1.3.1 起可以在应用里自动更新；更早的版本需要手动安装一次。
Updating from 1.3.1 installs automatically in the app; older versions need one manual install.

安装包没有经过 Apple 公证：第一次打开时请在「访达」里右键点击应用 → 打开。
The installers are not notarized: on macOS, right-click the app → Open the first time.

仅供个人娱乐，非商业用途。宝可梦相关形象版权归 Nintendo / Creatures / GAME FREAK 所有；像素素材来自 PMD SpriteCollab（CC BY-NC 4.0），作者署名见应用内和安装包内的 CREDITS.txt；宝可梦数据和出现表来自 PokéAPI；天气来自 Open-Meteo。
Personal, non-commercial use only. Pokémon © Nintendo / Creatures / GAME FREAK; sprites from PMD SpriteCollab (CC BY-NC 4.0), artists credited in the app and in CREDITS.txt; Pokémon data and encounter tables from PokéAPI; weather from Open-Meteo.
`;
}

if (require.main === module) {
  const version = String(process.argv[2] || '').replace(/^v/, '');
  const changelog = fs.readFileSync(path.join(__dirname, '..', 'CHANGELOG.md'), 'utf8');
  process.stdout.write(notes(changelog, version));
}

module.exports = { section, notes };
