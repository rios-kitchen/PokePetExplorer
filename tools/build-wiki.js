// Builds the GitHub wiki pages from GUIDE.md (so the guide is written once): one bilingual page per topic
// (中文 first, then English), the developer appendix, a Home page, a sidebar and the FAQ (tools/wiki-faq.md).
// Usage: node tools/build-wiki.js <wiki checkout folder>   (npm run wiki -- <folder>)
const fs = require('fs');
const path = require('path');

const out = process.argv[2];
if (!out) { console.error('usage: node tools/build-wiki.js <wiki folder>'); process.exit(1); }
const root = path.join(__dirname, '..');
const guide = fs.readFileSync(path.join(root, 'GUIDE.md'), 'utf8');
const version = require(path.join(root, 'package.json')).version;
const REPO = 'https://github.com/rios-kitchen/PokePetExplorer';

// split the guide: "# 中文" / "# English" / "# 开发者附录" parts, each with numbered "## n. …" sections
const parts = guide.split(/^# /m).slice(1).map((p) => ({ title: p.slice(0, p.indexOf('\n')).trim(), body: p.slice(p.indexOf('\n') + 1) }));
const zh = parts.find((p) => p.title === '中文');
const en = parts.find((p) => p.title === 'English');
const dev = parts.find((p) => p.title.startsWith('开发者附录'));
const sections = (body) => {
  const map = {};
  for (const s of body.split(/^## /m).slice(1)) {
    const head = s.slice(0, s.indexOf('\n')).trim();
    const m = head.match(/^(\d+)\.\s*(.*)$/);
    if (m) map[m[1]] = { title: m[2].trim(), text: s.slice(s.indexOf('\n') + 1).trim() };
  }
  return map;
};
const zs = sections(zh.body), es = sections(en.body);

// page names: English words (stable links), the Chinese title shown first in the sidebar
const slug = (t) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9]+/g, ' ').trim().split(/\s+/).slice(0, 8).join('-');
const pages = Object.keys(zs).sort((a, b) => a - b).map((n) => {
  const z = zs[n], e = es[n] || { title: '', text: '' };
  const name = `${String(n).padStart(2, '0')}-${slug(e.title)}`;
  return { n, name, zh: z.title, en: e.title, z: z.text, e: e.text };
});

// links between sections ("见第 7 节" / "section 7") → wiki links
const linkSections = (text) => text
  .replace(/第 (\d+) 节/g, (m, n) => { const p = pages.find((x) => x.n === n); return p ? `[第 ${n} 节](${p.name})` : m; })
  .replace(/section (\d+)/g, (m, n) => { const p = pages.find((x) => x.n === n); return p ? `[section ${n}](${p.name})` : m; })
  .replace(/\]\(README\.md\)/g, `](${REPO}#readme)`).replace(/\]\(GUIDE\.md\)/g, `](${REPO}/blob/main/GUIDE.md)`);

fs.mkdirSync(out, { recursive: true });
const write = (file, text) => fs.writeFileSync(path.join(out, file), `${text.trim()}\n`);
const footer = `\n\n---\n*宝可宠探索 ${version} · 内容由 [GUIDE.md](${REPO}/blob/main/GUIDE.md) 生成 / generated from GUIDE.md · [反馈问题 / Report a problem](${REPO}/issues/new/choose)*`;

for (const p of pages) {
  write(`${p.name}.md`, `# ${p.zh} · ${p.en}\n\n## 中文\n\n${linkSections(p.z)}\n\n## English\n\n${linkSections(p.e)}${footer}`);
}
write('Developers.md', `# 开发者 · Developers\n\n${linkSections(dev.body)}${footer}`);
const faq = fs.readFileSync(path.join(__dirname, 'wiki-faq.md'), 'utf8');
write('FAQ.md', `${linkSections(faq)}${footer}`);

const list = (pre) => pages.map((p) => `${pre}[${p.n}. ${p.zh} · ${p.en}](${p.name})`).join('\n');
write('Home.md', `# 宝可宠探索 · PokePet Explorer

当前版本 / Current version: **${version}** · [下载 / Download](${REPO}/releases/latest) · [源码与安装 / Source & install](${REPO}#readme)

一只会陪你专注、需要你照顾的像素宝可梦桌宠：番茄钟和待办，QQ 宠物式的养成、外出、钓鱼、对战与捕捉、图鉴。
A pixel Pokémon desktop pet that keeps you company while you focus and needs your care: Pomodoro and to-dos, QQ-Pet style
raising, outings, fishing, battles and catching, a Pokédex.

## 目录 / Contents

${list('- ')}
- [常见问题 · FAQ](FAQ)
- [开发者 · Developers](Developers)

## 反馈 / Feedback

遇到问题或有建议：[提交 Issue](${REPO}/issues/new/choose)（软件里：设置 → 关于与致谢 →「反馈问题或提建议」）。
Found a bug or have an idea: [open an issue](${REPO}/issues/new/choose) (in the app: Settings → About → "Report a problem").

*仅供个人娱乐，非商业用途。Pokémon © Nintendo / Creatures / GAME FREAK。Personal, non-commercial use only.*`);
write('_Sidebar.md', `**[首页 · Home](Home)**\n\n${list('')
  .split('\n').map((l) => `- ${l}`).join('\n')}\n- [常见问题 · FAQ](FAQ)\n- [开发者 · Developers](Developers)\n\n[🐞 反馈 / Report](${REPO}/issues/new/choose)`);
write('_Footer.md', `宝可宠探索 · PokePet Explorer ${version} · by Rio's Kitchen · [Releases](${REPO}/releases) · [Issues](${REPO}/issues)`);
console.log('wiki pages:', fs.readdirSync(out).filter((f) => f.endsWith('.md')).join(', '));
