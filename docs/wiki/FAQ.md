# 常见问题 · FAQ

### 为什么不能再派宝可梦外出了？ / Why can't I send my Pokémon out again?

外出**没有每日次数限制**，但要同时满足：同一时间只能有一只在外面；不是蛋、没生病、没晕倒；**饥饿和清洁都 ≥ 30**；等级和能力够。外出回来会更饿更脏，先在 🍓 照顾页喂一下、洗个澡（免费）就能接着派。去不了的目的地，按钮上会写原因。详见 [[第 5 节](05-Outings)](05-Outings)。

There's **no daily limit** on outings, but: only one at a time; not an egg, sick or fainted; **hunger and cleanliness ≥ 30**;
the level and stats required. It comes back hungrier and dirtier – feed it and give it a (free) bath in the 🍓 Care tab.
A destination you can't go to says why on its button. See [[section 5](05-Outings)](05-Outings).

### 为什么不能去草丛 / 钓鱼了？ / Why can't I explore the grass / fish any more?

小游戏有次数限制：草丛每天 16 次、**任意 1 小时内 3 次**；钓鱼每天上钩 20 次、**任意 1 小时内 6 次**。到上限时会提示还要等几分钟。钓鱼时 1 小时内钓得越多，越容易钓到破靴子之类的垃圾。

The mini-games have limits: the grass 16 a day and **3 within any hour**; fishing 20 bites a day and **6 within any hour**.
When you hit one, it tells you how many minutes to wait. The more you fish within an hour, the more junk you reel in.

### 为什么还不能进化？ / Why doesn't it evolve yet?

要同时满足：达到**原作的进化等级**（用道具、交换、亲密度进化的在 Lv30），并且加入队伍**满 7 天**（第二次进化要在上次进化后满 14 天）。到了会先问你，可以选「以后再说」。

It needs **the games' evolution level** (Lv30 for stones, trades and friendship) **and** at least **7 days** on your team
(14 days after its previous evolution). It asks first; you can say "Later".

### 宝可梦一直显示成精灵球？ / My Pokémon is shown as a Poké Ball?

新伙伴的形象要联网从 PMD SpriteCollab 下载一次，下载好之前先显示它的精灵球。请检查网络（需要能访问 raw.githubusercontent.com）。三只初始宝可梦的形象已经装在安装包里。

A new team member's sprite is downloaded once from PMD SpriteCollab; until then its Poké Ball is shown. Check your internet
connection (raw.githubusercontent.com must be reachable). The three starters' sprites come with the installer.

### 宝可梦晕倒了怎么办？ / My Pokémon fainted – what now?

用 **活力碎片** 救醒（🛒 商店 8 树果，或外出时捡到）。伤药只回健康，不能救醒。草丛对战输了，在对战中倒下的宝可梦有 60% 几率回家后仍然晕倒。

Use a **Revive** (8 berries in the 🛒 Shop, or found on outings). Potions only restore health. After losing in the grass,
each Pokémon knocked out in the battle has a 60% chance to still be fainted at home.

### 怎么遇到和收服传说宝可梦？ / How do I meet and catch a legendary?

领头宝可梦 **Lv30** 以后，每次遭遇有 1/400 几率遇到传说、1/2000 遇到幻之宝可梦，究极异兽和悖谬宝可梦各 1/800，等级比领头高 8 级。大多数捕获率只有 3：先打到残血，用睡眠或冰冻，再扔高级球，多试几次。收服之前都还会再遇到。详见 [[第 7 节](07-Battles-and-catching)](07-Battles-and-catching)。

From lead **Lv30**, 1 in 400 encounters is a legendary, 1 in 2000 a mythical and 1 in 800 each an Ultra Beast or a Paradox Pokémon, 8 levels above your lead. Most have a catch
rate of 3: weaken it, put it to sleep or freeze it, then throw Ultra Balls – and keep trying. It turns up again until it's
caught. See [[section 7](07-Battles-and-catching)](07-Battles-and-catching).

### 多久能遇到闪光？ / How long until a shiny?

和原作一样 1/4096；距离上一只闪光加入队伍满 90 天后，遇到的野生宝可梦一定是闪光，直到有一只加入为止。

1 in 4096, as in the games; 90 days after your last shiny joined, every wild Pokémon you meet is shiny until one joins you.

### 更新装不上？ / The update doesn't install?

从 1.3.1 开始，「下载并自动安装」会自己完成下载、退出、安装和重新打开。1.3.0 及更早的版本需要手动安装一次：打开下载好的安装包，把应用拖进「应用程序」（macOS）或运行安装程序（Windows）。自动安装失败时，下次启动会提醒你手动安装；还是不行的话，设置 → 更新 里有「安装遇到问题，手动下载安装包」。

From 1.3.1, "Download and install automatically" downloads, quits, installs and restarts by itself. 1.3.0 and earlier
need one manual install: open the downloaded installer and drag the app into Applications (macOS) or run the setup
(Windows). If the automatic install fails, the next start offers a manual install; if that fails too, Settings → Updates
links to the download page.

### macOS 提示「无法验证开发者」/ Windows 提示有风险？ / macOS / Windows warns about the app?

安装包没有签名。macOS：第一次在「访达」里**右键点击应用 → 打开**；Windows：在 SmartScreen 里点「更多信息 → 仍要运行」。

The installers aren't signed. macOS: the first time, **right-click the app → Open** in Finder; Windows: "More info → Run
anyway" in SmartScreen.

### 数据存在哪里？怎么备份？ / Where's my data? How do I back it up?

所有数据都在本机的一个文件里，复制它就是备份 / Everything is in one local file – copy it to back up:
- macOS：`~/Library/Application Support/PokePet Explorer/pokepetexplorer-data.json`
- Windows：`%APPDATA%\PokePet Explorer\pokepetexplorer-data.json`

### 还有问题？ / Still stuck?

[提交 Issue / Open an issue](https://github.com/rios-kitchen/PokePetExplorer/issues/new/choose)


---
*[宝可宠探索 · PokePet Explorer](https://github.com/rios-kitchen/PokePetExplorer) · [下载 / Download](https://github.com/rios-kitchen/PokePetExplorer/releases/latest) · [反馈问题 / Report a problem](https://github.com/rios-kitchen/PokePetExplorer/issues/new/choose)*
