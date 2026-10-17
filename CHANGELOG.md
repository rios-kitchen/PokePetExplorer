# 更新记录 · Changelog

每个版本的安装包在 [Releases](https://github.com/rios-kitchen/PokePetExplorer/releases)，玩法说明在 [Wiki](https://github.com/rios-kitchen/PokePetExplorer/wiki)。
Installers for every version are on [Releases](https://github.com/rios-kitchen/PokePetExplorer/releases); how to play is in the [Wiki](https://github.com/rios-kitchen/PokePetExplorer/wiki).

## 未发布 · Unreleased

## 1.4.5 · 2026-10-17

- 修复：macOS 上在浏览器里全屏播放网页视频时宝可梦没有隐藏（#8）
  Fixed: on macOS the Pokémon didn't hide over fullscreen web video in a browser (#8)

## 1.4.4 · 2026-10-17

- **天气预报**：开了天气后，宝可梦每 3 小时聊一聊接下来 3 小时的天气（快下雨了、雨快停了、温度范围……）；正在外出、专注或钓鱼时，等结束后再说
  **Forecast**: with weather on, every 3 hours your Pokémon talks about the next 3 hours (rain on its way, clearing up, the temperature range …); if it's on an outing or you're focusing or fishing, it waits until that's over
- 修复：macOS 上 Safari 等全屏播放视频时宝可梦没有隐藏（#5）
  Fixed: on macOS the Pokémon didn't hide over fullscreen video in Safari and other apps (#5)

## 1.4.3 · 2026-10-16

- **钓鱼地点和钓竿与原作一样**：每次钓鱼是原作里一个真实的钓鱼地点（按搭档等级挑选，窗口里显示地点名），水池的圈就是钓竿（浅水破旧钓竿、黄圈好钓竿、红圈和正中央厉害钓竿），钓到什么按那里的原作出现表；钓鱼图鉴从 24 种扩充到 58 种
  **Fishing spots and rods as in the games**: each trip is a real fishing spot (suited to your partner's level, named in the window), the ring is the rod (Old / Good / Super), and what bites follows that spot's original table; the fishing Pokédex grows from 24 to 58 species

## 1.4.2 · 2026-10-16

- **钓鱼按水池的圈分难度**：三圈同心圆，越靠中心越难、越稀有；新增最难的「正中央」，蓄力条中段才是最难的位置
  **Fishing difficulty by the pond's rings**: three rings, harder and rarer towards the middle; a new hardest level in the deep middle, reached by the middle of the meter
- **钓鱼更难**：原来的最高难度现在是普通；正中央的张力条一半以上是红色危险区
  **Harder fishing**: the old hardest level is now normal; in the middle more than half of the tension bar is red
- 钓鱼时桌面上的宝可梦安静待着，不走动、不拉便便、不喊饿 / While you fish, the Pokémon on the desktop stays put – no walking, pooping or calling for food

## 1.4.1 · 2026-10-16

- 软件里（设置 → 关于与致谢）可以打开 Wiki 和反馈问题 / Settings → About links to the wiki and to reporting a problem
- 说明文档搬到 Wiki；问题反馈和功能建议有表单；新增 Discussions / The guide moved to the wiki; issue forms for bugs and suggestions; Discussions are open
- 安装包改由 GitHub 在 Mac 和 Windows 机器上自动打包，Windows 版每次都会自动安装测试 / Installers are now built on GitHub's Mac and Windows machines, and the Windows one is install-tested every time

## 1.4.0 · 2026-10-16

- **遇到谁和原作一样**：用原作的出现表（PokeAPI）——先选一个等级合适的真实地方，再按原作的出现率和等级选宝可梦
  **Encounters as in the games**: the games' encounter tables (PokeAPI) – a real place suited to your lead's level, then a Pokémon by its original chance and level there
- **传说和幻之宝可梦**作为特殊遭遇回来（领头 Lv30 起，1/400 和 1/2000，捕获率和原作一样，收服前都可能再遇到）
  **Legendary and mythical Pokémon** return as special encounters (from lead Lv30, 1 in 400 / 1 in 2000, the games' catch rates, until caught)

## 1.3.1 · 2026-10-16

- 更新可以**自动安装**：下载 → 退出 → 安装 → 重新打开；失败时保留安装包供手动安装，再失败就链接到发布页
  Updates **install themselves**: download → quit → install → restart; if that fails, a manual install, then a link to the release page
- 设置里的选项叫「自动检查更新」；说明里写明了外出的条件（没有每日上限）
  The setting reads "Check for updates automatically"; the guide explains what an outing needs (no daily limit)

## 1.3.0 · 2026-10-16

- **对战**：最多带 6 只，随时换人，车轮战；招式和原作一样（PokeAPI 最新一代的升级招式，含变化类招式）；能力升降、睡眠、回复、吸取、反作用力、先制和连续攻击
  **Battles**: teams of 6, switching, fight on until the whole team is down; moves as in the games (status moves included); stat stages, sleep, healing, draining, recoil, priority, multi-hit
- **面板**：今日和日记放在一起，商店单独成页，去玩的入口都在「外出」页，图鉴页只看收集成果
  **Panel**: Today next to Diary, a Shop tab, play entries on the Outing tab, the Dex only shows what you've collected

## 1.2.1 · 2026-10-16

- 图鉴页每一部分可以收起或展开 / Every part of the Dex tab folds
- 钓鱼更有手感：蓄力越往上越快，收线有惯性，甩得越远越难 / Weightier fishing: a faster charge near the top, reeling with momentum, far casts harder
- 启动时和每天 3 次检查更新，有新版本弹窗提醒 / Update checks at start and three times a day, with a popup
- 面板顶部头像铺满头像框 / The header portrait fills its frame

## 1.2.0 · 2026-10-16

- **宝可梦图鉴**：记录见过和收服过的每一种，离开队伍也保留 / **Pokédex**: every species seen or caught, kept for good
- 博士那里可以切换中文 / English，初始宝可梦用 PMD 形象（随安装包附带，第一次启动不联网也能用）
  A 中文 / English switch at the professor's; the starters in PMD sprites, bundled for an offline first launch
- 不再使用手绘的极简像素宝可梦，形象下载好之前显示精灵球 / No more hand-drawn pixel Pokémon; a Poké Ball while a sprite downloads

## 1.1.0 · 2026-10-15

- 对战表情，面板里的对战入口；外出遇到的宝可梦回来时立刻问要不要对战，等 30 分钟 / Battle faces, a battle entry in the panel; outing encounters ask on return and wait 30 minutes
- 外出时桌面上的小地图可以拖动 / The outing map can be dragged
- 等级按原作曲线（最高 Lv100），在原作等级进化且要满 7 / 14 天 / Levels on the games' curve (up to Lv100); evolution at the games' levels after 7 / 14 days
- 闪光 1/4096，满 90 天保底 / Shinies at 1/4096 with a 90-day guarantee
- 新伙伴和全图鉴更难得到；草丛打输可能晕倒 / New Pokémon and a full Pokédex are harder to get; losing in the grass may leave Pokémon fainted
- 次数限制：草丛每天 16 / 每小时 3，钓鱼每天 20 / 每小时 6，钓多了会钓到垃圾 / Limits: grass 16/day 3/hour, fishing 20/day 6/hour, a tired pond turns up junk

## 1.0.0 · 2026-10-15

第一个正式版本 / The first release: 博士那里选御三家、照顾和对症下药、成长与进化、番茄钟与待办、外出探险与合影、钓鱼、草丛对战与捕捉、成就、每日签到与任务、节日与天气、闪光、检查更新。
Choose a starter at the professor's, care and medicine, growth and evolution, Pomodoro and to-dos, outings with photos, fishing, battles and catching in the grass, achievements, daily sign-in and tasks, holidays and weather, shinies, update checks.
