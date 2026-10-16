# 对战与捕捉 🌿 · Battles and catching 🌿

## 中文

### 怎么开始

- **去草丛**：右键 →「🌿 去草丛探索…」，或在面板的 🧭 外出页点「🌿 去草丛」，再点「走进草丛」。**每天最多 16 次，并且任意 1 小时内最多 3 次**（每天零点重置；1 小时的次数满了会提示还要等几分钟）。
- **外出遇到**：外出回来时跟回来的野生宝可梦（见[第 5 节](05-Outings)）。可以在宝可梦的气泡里点「去对战！」，或在对战窗口、面板的 🧭 外出页点「⚔ 和…对战」。**不占草丛次数**，只等 **30 分钟**，过时它就离开。
- 桌面上**不会**随机冒出野生宝可梦。

### 出战队伍

- 在 🐾 宝可梦页点「加入出战」，**最多 6 只**，和原作一样。没设置的话由当前搭档出战。
- 外出中、晕倒、还是蛋的宝可梦不能出战。
- 对战中可以随时换宝可梦（换人会让对方打一次，换下的宝可梦能力变化和混乱会清除）。
- **车轮战**：场上的宝可梦倒下后，可以免费换下一只继续打，直到全队都倒下才算输。

### 会遇到谁

**和原作一样，按出现表来**（数据来自 PokeAPI，每个地区用一部游戏：关都 火红/叶绿、城都 心金/魂银、丰缘 绿宝石、神奥 白金、合众 黑2/白2、卡洛斯 X/Y、阿罗拉 究极之日/月、伽勒尔 剑/盾）：
1. **先选地方**：草丛是各地区的道路；外出遇到的按目的地选真实的地方：森林（常青森林、桧皮森林……）、洞窟（月见山、暗之洞穴……）、火山（烟囱山、灯火山……）、冰雪地带（双子岛……）、遗迹（阿露福遗迹、宝可梦塔……）；旅行遇到的就是那个地区的道路和森林。只选**等级适合领头宝可梦**的地方（那里的宝可梦平均等级在领头等级 −10 ～ +3 之间）。
2. **再按原作的出现率选宝可梦**，等级也是原作在那里的等级。比如常青森林：绿毛虫、独角虫各 40%，铁甲蛹、铁壳蛹各 10%，皮卡丘 5%。
- 只会出现 PMD 画过的宝可梦。帕底亚地区 PokeAPI 还没有出现表，那里用旧的按属性挑选的方式。
- 稀有的就是稀有：出现率 5% 甚至 1% 的宝可梦要多遇几次才碰得到；常见的总是那几只。

**传说和幻之宝可梦（特殊遭遇）**：
- 领头宝可梦到 **Lv30** 以后，每次遭遇有 **1/400** 的几率遇到传说宝可梦，**1/2000** 的几率遇到幻之宝可梦（旅行时优先遇到那个地区的）。
- 等级比领头高 8 级（40～70 级），捕获率和原作一样，大多数只有 **3**：要先打到残血，再用高级球加睡眠或冰冻，也还要多试几次。
- 每一只**收服之前都可能再遇到**，收服之后就不会再出现。逃跑或者打倒了，以后还有机会。
- 究极异兽和悖谬宝可梦暂时不出现。
- **1/4096** 闪光，另有保底（见[第 10 节](10-Where-new-Pokemon-come-from)）。

### 对战规则（简化版正作规则）

- 回合制 1 对 1。指令：**战斗**（选招式）、**背包**、**宝可梦**（换人）、**逃跑**。
- 能力值由种族值和等级算出（PokeAPI 数据）。自己的宝可梦个体值 15，野生的 0。四项能力会给最多 +10% 的加成：帅气→攻击和速度，强壮→防御、特防和 HP，聪明→特攻，可爱→命中。
- **招式和原作一样**：取自 PokeAPI，用宝可梦所在的最新一代游戏里的升级招式，带它这个等级最新学会的 **4 个**，包括**变化类招式**（叫声、剑舞、电磁波、催眠术、光合作用……）。四个里至少有一个攻击招式。一击必杀、天气场地、束缚之类暂时用不了的招式会跳过。
- **能力变化**：攻击、防御、特攻、特防、速度、命中、闪避各有 −6～+6 级，倍率和原作一样。
- 还支持：**先制招式**（电光一闪等先出手）、**连续攻击**（二连踢等打 2–5 次）、**吸取**（终极吸取等回复造成伤害的一部分）、**反作用力**（舍身冲撞等伤到自己）、**回复招式**（自我再生等）。
- **18 属性相克**、属性一致加成 ×1.5、**击中要害**（1/24，×1.5）、伤害随机 85%–100%。
- 先比招式的优先度，再比速度（算上能力变化，麻痹时速度减半），同速随机。
- **异常状态**：灼伤（每回合扣 1/16，物理伤害减半）、中毒（每回合扣 1/8）、麻痹（25% 不能行动）、冰冻（不能行动，每回合 20% 解冻）、混乱（2–4 回合，1/3 几率打自己）、睡眠（1–3 回合不能行动）。睡眠和混乱不会带回家。火系不会灼伤，冰系不会冰冻，毒和钢系不会中毒，电系不会麻痹。
- **背包**：精灵球、橙橙果（回 30% HP）、伤药（回 60%）、各种状态药、活力碎片（复活并回一半 HP）。用掉的会从背包扣除。
- **逃跑**：基础 50%，比对方快就更容易；每多试一次 +15%。逃跑失败对方会攻击。

### 捕捉规则

- 在对战中从背包扔球。**捕捉率**用正作第三世代以后的公式：
  `a = (3×最大HP − 2×当前HP) × 种族捕获率 × 球的倍率 ÷ (3×最大HP) × 状态倍率`
- 球的倍率：精灵球 ×1，超级球 ×1.5，高级球 ×2。
- 状态倍率：睡眠、冰冻 ×2.5；麻痹、中毒、灼伤 ×1.5（和第五世代以后一样）。
- **HP 越低越好抓**，种族捕获率越高越好抓（例如绿毛虫 255、卡比兽 25）。
- 球会摇 0–3 下，摇满并成功才算抓到。没抓到对方会攻击。
- 球只能从商店买，不能在对战外使用。

### 结果

| 结果 | 效果 |
|---|---|
| **胜利** | 参战过的宝可梦平分经验 `(10 + 2.5×野生等级) ÷ 参战数量`；**+1–3 🍓**；最后在场的宝可梦帅气 +1、强壮 +1；计入每日任务「对战」 |
| **捕捉成功** | 同样获得经验；野生宝可梦**加入队伍**，等级保持不变；记入宝可梦图鉴；计入每日任务「捕捉」 |
| **失败（草丛）** | 出战的宝可梦**健康 −30、心情 −20**，逃跑时还会**掉 3 颗 🍓**（不够就全掉）；在对战中倒下的宝可梦有 **60%** 几率回家后仍然**晕倒**，要用活力碎片救醒 |
| **失败（外出遇到的）** | 轻微惩罚：出战的宝可梦**健康 −15、心情 −10**；对战中倒下的只有 **5%** 几率晕倒 |
| **逃跑** | 没有奖励也没有惩罚 |

- **对战表情**：双方血条旁边有 PMD 头像，会随战况变化：被打中会疼，打出效果绝佳会高兴，被要害打中会吃惊，混乱时会晕，血量低时会担心，赢了欢呼，输了哭。
- 对战中得的**灼伤、中毒、麻痹、冰冻会带回家**，要在 🍓 照顾页治疗（混乱不会带回家）。
- 遇到和收服的宝可梦都会记进**宝可梦图鉴**（见[第 10 节](10-Where-new-Pokemon-come-from)）。

## English

### Starting a battle

- **The grass**: right-click → "🌿 Explore the grass…", or "🌿 Explore the grass" in the panel's 🧭 Outing tab, then "Into the grass". **Up to 16 encounters a day and at most 3 within any hour** (resets at midnight; when the
  hour's three are used, it tells you how many minutes to wait).
- **From an outing**: the wild Pokémon that came back from an outing ([section 5](05-Outings)). Press "Battle!" in your Pokémon's
  bubble, or "⚔ Battle …" in the battle window or the panel's 🧭 Outing tab. It **doesn't use a grass
  encounter** and only waits **30 minutes** before it leaves.
- Wild Pokémon **never** pop up on the desktop by themselves.

### Your team

- In the 🐾 Pokémon tab press "Add to team", **up to 6**, as in the games. Without a team, your current partner battles.
- Pokémon that are away, fainted or still eggs can't battle.
- Switch any time in battle (the wild Pokémon gets a move; the one coming back loses its stat changes and confusion).
- **Fight on**: when your Pokémon faints, send in the next one for free – you only lose when the whole team is down.

### Who appears

**As in the games, from the encounter tables** (PokeAPI data, one game per region: Kanto FireRed/LeafGreen, Johto
HeartGold/SoulSilver, Hoenn Emerald, Sinnoh Platinum, Unova Black 2/White 2, Kalos X/Y, Alola Ultra Sun/Ultra Moon,
Galar Sword/Shield):
1. **A place first**: the grass is the regions' routes; an outing's encounter is a real place that fits it – forests
   (Viridian Forest, Ilex Forest …), caves (Mt. Moon, Dark Cave …), volcanoes (Mt. Chimney, Mt. Ember …), icy places
   (Seafoam Islands, Ice Path …), ruins (Ruins of Alph, Pokémon Tower …); a trip's encounter comes from that region's
   routes and forests. Only places **suited to your lead's level** (their Pokémon average −10 to +3 levels around it).
2. **Then a Pokémon by its original chance there, at its level there.** Viridian Forest, for example: Caterpie and
   Weedle 40% each, Metapod and Kakuna 10% each, Pikachu 5%.
- Only species PMD has drawn. Paldea has no tables in PokeAPI yet, so it uses the older type-based pick.
- Rare is rare: a 5% or 1% Pokémon takes a lot of encounters; the usual faces keep turning up.

**Legendary and mythical Pokémon (special encounters)**:
- Once your lead is **Lv30**, each encounter has a **1 in 400** chance of a legendary and **1 in 2000** of a mythical
  Pokémon (on a trip, preferably one from that region).
- They're 8 levels above your lead (Lv40–70) with the games' catch rates – mostly **3**: weaken it, then Ultra Balls
  with sleep or freeze, and still expect a few tries.
- Each can **turn up again until it's caught**, never after. Running away or knocking it out leaves another chance.
- Ultra Beasts and Paradox Pokémon don't appear for now.
- Shiny **1 in 4096**, with a guarantee ([section 10](10-Where-new-Pokemon-come-from)).

### Battle rules (simplified main-series rules)

- Turn-based, one on one. Commands: **Fight** (pick a move), **Bag**, **Pokémon** (switch), **Run**.
- Stats come from base stats and level (PokeAPI). Your Pokémon have IV 15, wild ones 0. Contest stats add up to
  +10%: Cool → Attack and Speed, Tough → Defense, Sp. Def and HP, Smart → Sp. Atk, Cute → accuracy.
- **Moves as in the games**: from PokeAPI, the level-up moves of the newest game the Pokémon is in – the **4** it learnt
  most recently at its level, **status moves included** (Growl, Swords Dance, Thunder Wave, Hypnosis, Synthesis …).
  At least one of them deals damage. Moves the battles can't do yet (one-hit KOs, weather, terrain, trapping …) are skipped.
- **Stat stages**: Attack, Defense, Sp. Atk, Sp. Def, Speed, accuracy and evasion each go from −6 to +6, with the games' multipliers.
- Also: **priority moves** (Quick Attack goes first), **multi-hit moves** (2–5 hits), **draining moves** (heal part of the
  damage), **recoil** (Double-Edge hurts the user) and **healing moves** (Recover …).
- The **18-type chart**, same-type bonus ×1.5, **critical hits** (1/24, ×1.5), damage roll 85%–100%.
- Higher move priority goes first, then the faster Pokémon (with stat stages; paralysis halves Speed); ties are random.
- **Conditions**: burn (1/16 per turn, physical damage halved), poison (1/8 per turn), paralysis (25% can't move),
  freeze (can't move, 20% thaw per turn), confusion (2–4 turns, 1/3 chance to hit itself), sleep (can't move for 1–3 turns). Sleep and confusion don't come home. Fire can't be burned,
  Ice can't be frozen, Poison and Steel can't be poisoned, Electric can't be paralyzed.
- **Bag**: balls, Oran Berry (30% HP), Potion (60% HP), status medicine, Revive (back with half HP). Used items leave your bag.
- **Run**: 50% to start, easier when you're faster, +15% for each extra try. A failed escape gives the wild Pokémon a move.

### Catching

- Throw a ball from the bag during battle. The **catch chance** uses the Gen 3+ formula:
  `a = (3 × maxHP − 2 × HP) × species catch rate × ball bonus ÷ (3 × maxHP) × status bonus`
- Ball bonus: Poké Ball ×1, Great Ball ×1.5, Ultra Ball ×2.
- Status bonus: sleep and freeze ×2.5; paralysis, poison, burn ×1.5 (as in Gen 5+).
- **The lower its HP, the easier**; species with a higher catch rate are easier too (Caterpie 255, Snorlax 25).
- The ball shakes 0–3 times; it must succeed all the way. If it breaks free, the wild Pokémon gets a move.
- Balls are only sold in the shop and can't be used outside battles.

### Results

| Result | Effect |
|---|---|
| **Win** | XP `(10 + 2.5 × wild level) ÷ number of participants` for each Pokémon that took part; **+1–3 🍓**; the Pokémon on the field gets Cool +1 and Tough +1; counts for the "battle" daily task |
| **Caught** | The same XP; the wild Pokémon **joins your team** at its level; recorded in the Pokédex; counts for the "catch" daily task |
| **Lose (grass)** | The team gets **health −30, mood −20** and **drops 3 🍓** while running away (or all you have); each Pokémon knocked out in the battle has a **60%** chance to still be **fainted** at home and need a Revive |
| **Lose (outing encounter)** | Light penalty: the team gets **health −15, mood −10**; a Pokémon knocked out faints only **5%** of the time |
| **Run** | Nothing gained or lost |

- **Battle faces**: PMD portraits next to both HP bars react to the fight – pain when hit, joy at a super-effective move,
  surprise at a critical hit, dizzy when confused, worried when low, cheering when you win and crying when you lose.
- **Burns, poison, paralysis and freezing from the battle come home** – treat them in the 🍓 Care tab (confusion doesn't).
- Pokémon you meet and catch go into the **Pokédex** ([section 10](10-Where-new-Pokemon-come-from)).

---
*[宝可宠探索 · PokePet Explorer](https://github.com/rios-kitchen/PokePetExplorer) · [下载 / Download](https://github.com/rios-kitchen/PokePetExplorer/releases/latest) · [反馈问题 / Report a problem](https://github.com/rios-kitchen/PokePetExplorer/issues/new/choose)*
