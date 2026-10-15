# 宝可宠探索 · PokePet Explorer 🥚🧭

A pixel Pokémon desktop pet for **macOS and Windows** with **QQ-Pet style raising**, plus the
**Pomodoro timer** and **to-do list** from PokePet. English / 中文. Everything is stored locally.

> **Which one should I use?**
> - **PokePet** – a simple desktop pet with a timer and light care. Pick it if that's all you want.
> - **PokePet Explorer** (this repo) – everything in PokePet, plus a deeper raising game: growth stages and
>   evolution, status conditions with matching medicine, a shop, expeditions with photos, achievements
>   and an optional AI chat. It only uses PMD SpriteCollab sprites, because they have enough animations for all of it.
>
> Both can be installed side by side; they keep separate data.

**You start with an egg.** Nobody knows who's inside until it hatches – the first egg after one level,
later eggs at Lv 5 – and once in a while (1 in 64) it's a shiny one.

**Work in progress:** daily tasks and fishing are still to come.

## Run

```bash
npm install
npm start
npm test     # data model unit tests
```

## Build an installer

```bash
npm run dist       # both → install/PokePetExplorer-<version>-macOS.dmg + install/PokePetExplorer-<version>-Windows-Setup.exe
npm run dist:mac   # only macOS (universal: Apple Silicon + Intel)
npm run dist:win   # only Windows (x64 installer)
```

`install/` only keeps the two installers (unpacked builds and blockmaps are removed afterwards).

The builds are unsigned: on macOS right-click the app → *Open* the first time; on Windows click
*More info → Run anyway* in the SmartScreen dialog.

## How to play

| Action | Result |
| --- | --- |
| Click the pet | Pat it (hearts, mood ↑, a bit of XP) |
| Drag the pet | Carry it anywhere on screen |
| Double-click | Open the to-do list |
| Right-click / tray icon | Menu: timer, switch Pokémon, size, language, … |
| Click the timer pill | Open the Pomodoro view |

### How the pet, timer and to-dos work together

- **Focus session**: the pet stops wandering, shows a 🍅 countdown above its head and cheers you on
  when you pat it. Pick a to-do as the task you're working on (or press ▶ next to a to-do).
- **Session finished**: fanfare, stars, +20 XP. The pet then asks *“Did you finish …?”* – answer
  in the speech bubble to tick the task off.
- **Break**: the pet gets playful, walks around and suggests stretching / drinking water. When the
  break ends it asks whether to start the next round.
- **To-do done**: a berry drops from the sky and the pet eats it (+10 XP, mood ↑). Finishing all
  tasks triggers a celebration.
- **Reminders**: every N minutes (configurable, never during focus) the pet reminds you of open
  to-dos with a one-click “Start” button. To-dos with a due time ring an alarm when they're due.
- **Mood & levels**: each Pokémon levels up separately. Mood drops slowly if you ignore your pet;
  when it's lonely it will tell you.

### Reacting to your keyboard & mouse

No keyboard hook and no special permissions. The app only learns *when* a key was pressed, never which:
on macOS via `CGEventSourceSecondsSinceLastEventType`, on Windows via `GetAsyncKeyState`. Mouse clicks
and scrolling never count as typing, and the keyboard never appears during baths, meals, sleep etc.

- **Typing** → the pet sits down and types along on a tiny keyboard. After 15 min of typing
  without a focus session it suggests starting one.
- **Moving the mouse** → the pet looks towards the cursor (eyes for the built-ins, whole body for
  downloaded Pokémon). During breaks it sometimes chases the cursor.
- **Hovering over the pet** → it gets shy and happy. **Shaking the mouse fast** → it gets dizzy.
- **Away for 3 min** → it naps; when you come back it says hello.

### Care (QQ-Pet style)

Each Pokémon has **hunger, cleanliness, health and its own mood**. They drop over time – more slowly
while you're away or the app is closed (max. 12 h are counted).

- **Hungry** → the pet asks for food. **Dirty** → dirt spots and a fly; it wants a bath.
- **Status conditions** (QQ Pet's disease chains, Pokémon style): a dirty pet can get **poisoned**, a
  hungry one **paralyzed**, a sad one **confused**; dungeons can **burn** or **freeze** it. Untreated,
  a condition gets worse every 6 h (stages 1–3) and then the pet **faints**.
  **Diagnose** it (1 🍓) to learn which one it is, then give the matching medicine (Antidote, Paralyze
  Heal, Burn Heal, Ice Heal, Persim Berry – or the pricier Full Heal). **The wrong medicine makes it a
  stage worse.** A fainted Pokémon needs a **Revive**; Potions only restore health.
- **Berries 🍓 are the currency**: +3 per Pomodoro, +1 per finished to-do, +2 per day, plus
  expeditions. Items found on expeditions go to the inventory and are used before berries are spent.
- Feed/bath/heal from the Care tab, the right-click menu or directly in the pet's speech bubble.
- **Droppings 💩**: some time after a meal (and now and then anyway) the pet poops on your screen.
  Click the dropping to clean it up. Until the pet is **bathed** it smells and its mood drops; if
  it stays unbathed its health sinks and it gets sick. Droppings left on screen also cost mood.

### Growing up (QQ-Pet style)

- The pet **grows while the app runs** (a few XP per hour) on top of Pomodoros and to-dos – at full
  speed when it's happy, healthy, fed and clean, slower otherwise (QQ Pet's growth penalties).
- Eggs hatch at **Lv 5**. At **Lv 12** and **Lv 24** the pet can **evolve**: it asks first (you can say
  "later"), and branching species let you pick. It keeps its level, stats and diary.
- **Expeditions** (right-click → 🧭): explore a mystery dungeon, take a contest class or travel to a
  region. The pet **leaves the desktop** (a 🧭 countdown shows where it was) and comes back with
  berries, XP, contest stats (Cool / Cute / Smart / Tough), sometimes items or a souvenir – and
  hungrier, dirtier, maybe with a status condition. The timer keeps running while the app is closed.

### The panel

Tabs are grouped: **💼 Work** (Pomodoro timer and to-do list together) | **🍓 Care** (bag and shop),
**🧭 Outing** (expeditions), **📖 Dex** (achievements, souvenirs), **🐾 Pokémon** (team, adopt an egg),
**📔 Diary** | **⚙️ Settings**.

- **Adopt an egg** in the Pokémon tab: who is inside stays a surprise until it hatches (first egg at Lv 2, later ones at Lv 5).
- **Achievements** pay berries once (focus, to-dos, levels, hatching, evolving, outings, travel, cures…).

### Emotions

Speech bubbles show the Pokémon’s **PMD portrait with a matching emotion** (happy, joyous,
determined, worried, sad, pain, surprised, dizzy, crying …) – also depending on how it is doing
(sick, pooped, lonely). The control panel header, the Care tab and each diary entry show the
face for the current / that day’s mood.

### Diary

The pet writes a diary entry every day (in its own words, English or Chinese) from what happened:
focus sessions, finished tasks, meals, baths, sickness, pats. Every 7 days it tells you whether it
was **happy, okay or sad** that week (happiness score from mood, sick days and focus). The **Diary**
tab shows each week with focus minutes per day and a timeline of *when* you focused (hover for
details), plus the pet's portrait in a matching emotion.

### Pokémon & sprites

All sprites come from **PMD** ([SpriteCollab](https://github.com/PMDCollab/SpriteCollab)): pixel sprites
with *all* their animations (~35: idle, walk in 8 directions, sleep, eat, hurt, faint, hop, attacks,
charge, trip, look-up …). State animations follow the pet's behaviour; attacks celebrate finished focus
sessions, the rest play as random idle actions. Other sprite sources (Showdown, HOME, B/W) only have one
animation each, so PokePet Explorer doesn't use them.

Every Pokémon comes from an egg: when it hatches, a random unevolved species (that PMD has drawn) is
picked, normal or shiny. Adopt another egg in the **Pokémon** tab (one at a time). Names (incl. Chinese)
come from [PokeAPI](https://pokeapi.co); diary portraits from PMD SpriteCollab.

### Expedition photos

While your Pokémon is out, a little pixel map of where it is sits on the desktop. When it comes home it
brings a photo of the two of you there – a random pose and a random expression – collected in
**Dex → Photos**.

### Studying together

Every finished Pomodoro also teaches your Pokémon something: **+1 Smart** per 25 minutes of focus.

### AI chat (optional)

Off by default. In **Settings → AI chat** pick a provider – Anthropic (Claude), OpenAI, Google Gemini,
DeepSeek, Moonshot (Kimi), Qwen, Zhipu GLM, SiliconFlow, OpenRouter, Groq, Mistral, xAI, a local Ollama /
LM Studio, or any other OpenAI-compatible endpoint – enter your own API key and a model, then chat from
the right-click menu. Your Pokémon answers in character, coloured by its mood, hunger and health.

### Updates

The app checks GitHub for a new release when it starts (can be turned off in Settings). **Settings →
Updates** downloads the installer for your system to your Downloads folder and opens it.

## Privacy

- The app only ever contacts **pokeapi.co** (species names, evolutions), **raw.githubusercontent.com**
  (PMD sprites, portraits, artist credits) and **api.github.com / github.com** (this app's releases, for
  the update check) – downloads only; other hosts are blocked in code (`src/main/sources.js`,
  `ALLOWED_HOSTS`). No telemetry, analytics or accounts.
- **AI chat is off unless you turn it on.** Then the chat and your Pokémon's state (name, level, mood,
  needs) go to the provider you chose – nothing else. Your API key is stored with the system keychain
  (Electron `safeStorage`) and never shown to the app's windows. The conversation isn't saved.
- The keyboard helper only knows *when* a key was pressed, never which one. The clipboard, the screen
  and other apps' windows are never read. Everything stays in one local JSON file.
- The QQ Pet projects used as design references (see [Reference projects](#reference-projects--参考项目))
  were only read, not used: none of their code or assets is included. Things some desktop-pet clients
  do that this app deliberately leaves out: weather by IP location, reading the clipboard, watching
  which app is in front, collecting device or system information, running a local network server.

## Project layout

```
main.js                 main process: windows, tray, timer, to-dos, persistence
src/main/care.js        hunger / cleanliness / health, status conditions, medicine, items, berries
src/main/growth.js      levels, passive growth rate, hatching, evolution
src/main/expedition.js  dungeons, contest training, travel
src/main/achievements.js milestones and their berry rewards
src/main/ai.js          optional AI chat (Anthropic SDK + OpenAI-compatible providers)
src/main/updater.js     GitHub release check and installer download
src/shared/maps.js      pixel-art expedition scenes
src/chat/               AI chat window
src/main/diary.js       daily records, weekly report
src/main/store.js       data file: defaults, pet records, migration from PokePet's data
test/                   unit tests (node --test)
src/main/sources.js     PMD sprite and portrait downloads, artist credits
src/preload.js          safe IPC bridge
src/pet/                transparent pet window (canvas animation, behaviour, bubbles)
src/panel/              control panel (Work / Care / Outing / Dex / Pokémon / Diary / Settings)
src/shared/sprites.js   pixel art (edit here!) + effect glyphs
src/shared/i18n.js      all UI text and pet dialogue (en / zh)
src/shared/sound.js     8-bit sound effects (WebAudio)
tools/                  sprite preview + icon generator
```

Edit sprites in `src/shared/sprites.js`, then `npm run preview-sprites` to render `sprite-preview.png`.

Data file: `~/Library/Application Support/PokePet Explorer/pokepetexplorer-data.json` (macOS) or
`%APPDATA%\PokePet Explorer\pokepetexplorer-data.json` (Windows).

## Credits

- **PMD sprites & portraits**: [PMD SpriteCollab](https://github.com/PMDCollab/SpriteCollab) – original
  sprites by CHUNSOFT, community sprites by the artists listed in its
  [credit_names.txt](https://github.com/PMDCollab/SpriteCollab/blob/master/credit_names.txt);
  licensed [CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/).
- **Pokémon names and data**: [PokéAPI](https://pokeapi.co) (please respect its
  [fair use policy](https://pokeapi.co/docs/v2#fairuse)).
- **Pixel scenes and icons** for expeditions are drawn from code in `src/shared/maps.js` – no third-party
  tiles or game maps are used.

### Reference projects / 参考项目

The raising rules were designed after **QQ Pet (QQ宠物)**, Tencent's desktop pet, as documented by two
community projects. They were read for reference only – **no code, images, sounds or other assets from
them are included**, and this project is not affiliated with them or with Tencent.

- [**AnkioTomas/qqpet**](https://github.com/AnkioTomas/qqpet) – an open-source revival of the QQ Pet client.
  Referenced for the overall game design: needs and mood, growth rate, levels and stages, shop, work /
  study / travel, daily systems.
- [**xuemian168/qqpet_automation**](https://github.com/xuemian168/qqpet_automation) – tools and notes about
  the QQ Pet remake's save format and game data. Referenced for its rule tables: disease chains and their
  cures, growth penalties, need thresholds.

QQ Pet and its artwork belong to Tencent. Like those projects, this one is a non-commercial fan work made
for learning and fun.

本项目的养成规则参考了腾讯的桌面宠物 **QQ宠物**，具体参考了上面两个社区项目整理的玩法和数值。它们只用于参考，
**本项目没有包含其中的任何代码、图片、声音或其他资源**，也与这两个项目及腾讯无任何关联。QQ宠物及其美术资源归腾讯所有。

Sprites are not included in this repository or the installers; the app downloads them from PMD SpriteCollab
on demand and caches them locally.

## License & disclaimer

**For personal, non-commercial use only.** This is a free fan project for learning and fun.

- **No commercial use** of any kind: don't sell it or its derivatives, charge for downloads, put it behind
  a paywall or subscription, add advertising, or bundle it with paid products or services.
- Pokémon and Pokémon character names are trademarks of Nintendo. Pokémon characters, names and designs
  are © Nintendo / Creatures Inc. / GAME FREAK inc. / The Pokémon Company; *Pokémon Mystery Dungeon*
  sprites originate from Spike Chunsoft; QQ Pet (QQ宠物) belongs to Tencent. **PokePet Explorer is an
  unofficial fan project and is not affiliated with, endorsed, sponsored or approved by any of them.**
  No copyright or trademark infringement is intended.
- No Pokémon sprites are included in this repository or the installers. They are downloaded on demand
  from PMD SpriteCollab (CC BY-NC 4.0), with their artists credited in the app.
- The software is provided **"as is", without warranty of any kind**. Use it at your own risk; the
  authors are not liable for any damage or loss arising from it.
- By downloading or using this project you agree to these terms.

Rio's Kitchen's own work in this repository (code, original sound effects, UI) is licensed under
[CC BY-NC 4.0](LICENSE): you may share and adapt it **for non-commercial purposes with credit**. Selling
it, charging for downloads or using it in any commercial product is not allowed. The license does not
cover Pokémon intellectual property or third-party sprites; see [LICENSE](LICENSE) for details.

If you are a rights holder and have concerns about this project, please open an issue and the content
will be removed or changed promptly.

### 版权与免责声明

**仅供个人学习与娱乐使用，严禁任何商业用途。** 本项目是免费的粉丝作品。

- **禁止商用**：不得出售本项目或其衍生作品，不得收费下载、设置付费墙或订阅，不得加入广告，不得与任何付费产品或服务捆绑。
- Pokémon 及宝可梦角色名称是任天堂的商标，宝可梦角色、名称与形象版权归 Nintendo / Creatures Inc. /
  GAME FREAK inc. / The Pokémon Company 所有；《宝可梦不可思议的迷宫》精灵图源自 Spike Chunsoft；QQ宠物归腾讯所有。
  **宝可宠探索（PokePet Explorer）是非官方的粉丝作品，与上述公司均无任何关联，也未获得其认可或授权。** 无意侵犯任何版权或商标。
- 本仓库和安装包中不包含任何宝可梦精灵图，均在使用时从 PMD SpriteCollab（CC BY-NC 4.0）下载，并在应用内署名作者。
- 本软件按**「现状」**提供，**不作任何保证**。使用风险自负，作者不对因使用本软件造成的任何损失负责。
- 下载或使用本项目即表示你同意以上条款。

本仓库中由 Rio's Kitchen 原创的部分（代码、原创音效、界面）采用
[CC BY-NC 4.0（署名-非商业性使用）](LICENSE) 协议：可以在**注明出处、非商业**的前提下转载和修改；
**禁止任何人将本项目或其衍生作品用于商业用途**（包括售卖、收费下载、捆绑付费产品等）。该协议不涵盖宝可梦相关知识产权及第三方精灵图。

如果您是权利方并认为本项目侵犯了您的权益，请提交 Issue，我们会尽快删除或修改相关内容。
