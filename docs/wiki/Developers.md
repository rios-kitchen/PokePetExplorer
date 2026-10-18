# 开发者 · Developers


Electron + vanilla JS · 数据文件版本 / store version 6（旧存档的等级会按新曲线保留 / old saves keep their levels on the new curve）

## 数值在哪里改 / Where the numbers live

| 功能 / Feature | 文件 / File | 主要常量 / Key constants |
|---|---|---|
| 照顾、物品、异常状态 / Care, items, statuses | `src/main/care.js` | `ITEMS`, `REWARD`, `DIAGNOSE_COST`, `STAGE_HOURS`, `MAX_STAGE` |
| 成长、进化 / Growth, evolution | `src/main/growth.js` | `xpFor` / `levelOf` (n³ − 1), `MAX_LEVEL`, `EVOLVE_FALLBACK`, `EVOLVE_MIN_DAYS`, `EVOLVE_SNOOZE_H`; evolution levels from `sources.js` `evolutionOptions` |
| 闪光 / Shinies | `src/main/shiny.js` | `RATE` (1/4096), `PITY_DAYS` (90); `data.shiny.since` |
| 外出 / Outings | `src/main/expedition.js` | `EXPEDITIONS`, `LOOT`, `companionChance()` |
| 外出遭遇 / Outing encounters | `main.js` `checkExpedition` / `offerOutingEncounter` / `checkEncounter` | 0.3 chance; `Wild.ENCOUNTER_WAIT_MIN` (30); saved in `data.wild.encounter` |
| 钓鱼手感 / Fishing feel | `src/fishing/fishing.js` | `POND` / `RINGS` (where each ring starts), `landing` (cast path), `REEL` (inertia, danger zone, slack drop per ring), charge speed `0.5 + 2.5 × power` |
| 自动更新 / Updates | `main.js`, `src/main/updater.js` | `UPDATE_EVERY_MS` (8 h), `checkForUpdate`, `promptUpdate`; `install` (helper scripts `MAC_SCRIPT` / `WIN_SCRIPT`), `update-pending.json` → `stageOf` |
| 钓鱼 / Fishing | `src/main/fishing.js` | `FISH`, `JUNK`, `FATIGUE`, `TIERS`, `ZONES` (4 rings), `TIER_WEIGHTS`, `JOIN_CHANCE`, `REPEAT_WEIGHT`, `SHINY_RATE` |
| 招式数据 / Move data | `src/main/pokedata.js` | `GAMES` (newest game first), `usable`, `movesAt` |
| 对战引擎 / Battle engine | `src/main/battle.js` | `BALLS`, `STATUS_CATCH`, `WILD_IV`, `wildLevel()`, `expFor()` |
| 小游戏次数 / Mini-game limits | `src/main/limits.js` | `LIMITS` (grass 16/day 3/hour, fishing 20/day 6/hour, quiz 12/day 4/hour, catch 6/day 2/hour, memory 6/day 2/hour) – 新的小游戏也加在这里 / add new mini-games here |
| 出现表 / Encounter tables | `src/main/encounters.json` (built by `npm run encounters` → `tools/build-encounters.js` from PokeAPI) | `GAMES` per region, place kinds |
| 野生宝可梦 / Wild species | `src/main/wild.js` | `pickFromTables`, `pickLegend` (`LEGEND_CHANCE` 1/400, `MYTHICAL_CHANCE` 1/2000, `ULTRA_CHANCE` / `PARADOX_CHANCE` 1/800, `LEGEND_MIN_LEVEL` 30) |
| 野生宝可梦（旧） / Wild species (fallback) | `src/main/wild.js` | `HABITATS`, `REGION_DEX`, `REPEAT_SEEN`, `SPECIAL`, `SHINY_RATE` |
| 对战结算 / Battle results | `main.js` `finishBattle`, `LOSE_PENALTY` | win berries 1–3; lose: grass −30 health / −20 mood / −3 berries / 60% faint, outing −15 / −10 / 5% faint |
| 摸摸经验 / Pat XP | `main.js` | `PAT_XP_PER_DAY` (20) |
| 属性相克 / Type chart | `src/main/typechart.js` | 18 × 18 |
| 种族值、招式、捕获率 / Base stats, moves, catch rates | `src/main/pokedata.js` | PokeAPI, cached in `userData/pokedata.json` |
| 每日 / Daily | `src/main/daily.js` | `TASKS`, `PER_DAY`, `ALL_DONE_BONUS`, `SIGN_REWARDS` |
| 成就 / Achievements | `src/main/achievements.js` | `ACHIEVEMENTS` |
| 宝可梦图鉴 / Pokédex | `src/main/pokedex.js` | `see`, `caught`, `backfill` – entries are never removed |
| 合影 / Photos | `src/main/album.js` | `RECENT`, `MAX_FAVORITES` |
| 节日、天气 / Holidays, weather | `src/main/weather.js` | `FIXED`, `LUNAR`, `HOLIDAY_GIFT` |
| 番茄钟默认值 / Pomodoro defaults | `src/main/store.js` | `pomodoro: { focus: 25, short: 5, long: 15, longEvery: 4 }` |
| 界面文字 / UI text | `src/shared/i18n.js` | en / zh |

## 测试 / Testing

```bash
POKEPET_TEST=<dir> POKEPET_DATA_DIR=<dir> npx electron .   # end-to-end self-test, screenshots in <dir>
```

The self-test uses a fresh data folder, walks through the starter, Pomodoro, care, outings, evolution, fishing and
battles, and saves a screenshot of each step.
自测会用一个新的数据目录，依次走一遍选初始宝可梦、番茄钟、照顾、外出、进化、钓鱼和对战，每一步保存截图。

## 已知限制 / Known limitations

- 对战还没有一击必杀、天气、场地、束缚、替身之类的招式，也没有特性和道具效果；野生宝可梦只有一只。
  Battles don't have one-hit KOs, weather, terrain, trapping, Substitute and the like yet, nor abilities or held items; wild battles are one-on-one.
- 野生宝可梦按 PMD 已画的物种出现；没有 PMD 精灵图的物种不会出现，也不能获得。
  Only species PMD has drawn can appear or join.
- 精灵图和 PokeAPI 数据需要联网下载，第一次遇到某个物种会慢一点；之后会缓存。
  Sprites and PokeAPI data are downloaded on first use (slower the first time), then cached.
- Windows 版还没在真机上完整测试过。
  The Windows build hasn't been fully tested on a real machine yet.


## 文档 / Docs

这份 Wiki 就是 repo 里的 `docs/wiki/`：在那里改，推送到 `main` 后由 `.github/workflows/wiki.yml` 自动发布到 Wiki。不要直接在 GitHub 网页上改 Wiki（下次同步会被覆盖）。每个版本的改动写在 `CHANGELOG.md`。
This wiki is `docs/wiki/` in the repo: edit it there; a push to `main` publishes it (`.github/workflows/wiki.yml`). Don't edit the
wiki on GitHub – the next sync overwrites it. What changed in each version goes into `CHANGELOG.md`.

## 发布 / Releasing

1. 改 `package.json` 的版本号，写好 `CHANGELOG.md`，提交并推送。/ Bump the version in `package.json`, update `CHANGELOG.md`, commit and push.
2. 先建草稿发布并写好说明 / Create a draft release with its notes: `gh release create v1.2.3 --draft --title "PokePet Explorer 1.2.3" --notes-file notes.md`
3. 推送标签 / Push the tag: `git tag -a v1.2.3 -m "PokePet Explorer 1.2.3" && git push origin v1.2.3`
4. `.github/workflows/release.yml` 在 Mac 和 Windows 机器上打包、跑测试、在 Windows 上静默安装并启动一次，然后上传安装包并正式发布。
   `.github/workflows/release.yml` builds on a Mac and a Windows machine, runs the tests, installs silently and starts the app on Windows, then uploads the installers and publishes the release.

每次推送和 Pull Request 都会在 macOS、Windows、Linux 上跑单元测试（`.github/workflows/ci.yml`）。
Every push and pull request runs the unit tests on macOS, Windows and Linux (`.github/workflows/ci.yml`).

---
*[宝可宠探索 · PokePet Explorer](https://github.com/rios-kitchen/PokePetExplorer) · [下载 / Download](https://github.com/rios-kitchen/PokePetExplorer/releases/latest) · [反馈问题 / Report a problem](https://github.com/rios-kitchen/PokePetExplorer/issues/new/choose)*
