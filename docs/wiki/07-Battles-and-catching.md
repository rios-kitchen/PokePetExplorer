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

**传说、幻之宝可梦、究极异兽和悖谬宝可梦（特殊遭遇）**：
- 领头宝可梦到 **Lv30** 以后，每次遭遇有 **1/400** 的几率遇到传说宝可梦，**1/2000** 的几率遇到幻之宝可梦，究极异兽和悖谬宝可梦各 **1/800**（旅行时优先遇到那个地区的；去阿罗拉旅行时更容易遇到究极异兽，去帕底亚时更容易遇到悖谬宝可梦）。出现时有专门的开场白。
- 等级比领头高 8 级（40～70 级），捕获率和原作一样，大多数只有 **3**：要先打到残血，再用高级球加睡眠或冰冻，也还要多试几次。
- 每一只**收服之前都可能再遇到**，收服之后就不会再出现。逃跑或者打倒了，以后还有机会。
- **1/4096** 闪光，另有保底（见[第 10 节](10-Where-new-Pokemon-come-from)）。

### 对战规则（简化版正作规则）

- 回合制 1 对 1。指令：**战斗**（选招式）、**背包**、**宝可梦**（换人）、**逃跑**。
- 能力值由种族值和等级算出（PokeAPI 数据）。自己的宝可梦个体值 15，野生的 0。四项能力会给最多 +10% 的加成：帅气→攻击和速度，强壮→防御、特防和 HP，聪明→特攻，可爱→命中。
- **招式和原作一样**：取自 PokeAPI，用宝可梦所在的最新一代游戏里的升级招式，带它这个等级最新学会的 **4 个**，包括**变化类招式**（叫声、剑舞、电磁波、催眠术、光合作用……）。四个里至少有一个攻击招式。天气、场地、一击必杀、束缚、替身也都能用了（见下面）；只在双打里有用的招式、换场类招式等还会跳过。
- **能力变化**：攻击、防御、特攻、特防、速度、命中、闪避各有 −6～+6 级，倍率和原作一样。
- 还支持：**先制招式**（电光一闪等先出手）、**连续攻击**（二连踢等打 2–5 次）、**吸取**（终极吸取等回复造成伤害的一部分）、**反作用力**（舍身冲撞等伤到自己）、**回复招式**（自我再生等）。
- **18 属性相克**、属性一致加成 ×1.5、**击中要害**（1/24，×1.5）、伤害随机 85%–100%。
- 先比招式的优先度，再比速度（算上能力变化，麻痹时速度减半），同速随机。
- **异常状态**：灼伤（每回合扣 1/16，物理伤害减半）、中毒（每回合扣 1/8）、麻痹（25% 不能行动）、冰冻（不能行动，每回合 20% 解冻）、混乱（2–4 回合，1/3 几率打自己）、睡眠（1–3 回合不能行动）。睡眠和混乱不会带回家。火系不会灼伤，冰系不会冰冻，毒和钢系不会中毒，电系不会麻痹。
- **背包**：精灵球、橙橙果（回 30% HP）、伤药（回 60%）、各种状态药、活力碎片（复活并回一半 HP）。用掉的会从背包扣除。
- **逃跑**：基础 50%，比对方快就更容易；每多试一次 +15%。逃跑失败对方会攻击。特性「逃跑」一定能逃走。

### 特性

- 每只宝可梦都有一个**特性**，和原作一样从它这个种族的普通特性里定下来（在 🐾 宝可梦页卡片上能看到「特性：……」）。进化后换成进化后种族**同一个位置**的特性。
- 野生宝可梦也有特性，偶尔（1/20）是**隐藏特性**；收服后保留。对战里把鼠标停在血条上能看到特性。
- 100 多种常见特性在对战里有效果，例如：
  - **茂盛 / 猛火 / 激流 / 虫之预感**：HP 剩 1/3 以下时同属性招式威力 ×1.5
  - **威吓**：出场时降低对手攻击；**恒净之躯、白色烟雾、怪力钳、锐利目光……** 挡住能力下降
  - **漂浮**（地面招式无效）、**引火**（火招无效并强化火招）、**储水 / 蓄电**（回血）、**避雷针 / 引水 / 食草 / 电气引擎**
  - **静电 / 火焰之躯 / 毒刺 / 孢子**：被物理招式打中时 30% 让对手陷入异常状态；**粗糙皮肤 / 铁刺** 反伤
  - **结实**：满 HP 时挨了会倒下的攻击也能撑住，一击必杀无效；**多重鳞片、过滤、坚硬岩石、神奇守护、贝壳盔甲……**
  - **不眠 / 干劲 / 柔软 / 免疫 / 水幕 / 熔岩铠甲 / 我行我素 / 迟钝**：不会陷入对应的异常状态
  - **降雨 / 日照 / 扬沙 / 降雪** 出场时改变天气；**电气制造者 / 青草制造者 / 薄雾制造者 / 精神制造者** 展开场地；**无关天气 / 气闸** 让天气无效
  - **悠游自如 / 叶绿素 / 拨沙 / 拨雪**：对应天气里速度 ×2；**雨盘 / 冰冻之躯 / 干燥皮肤 / 太阳之力 / 湿润之躯**
  - **大力士、纯朴、毅力、活力、技术高手、适应力、狙击手、强运、有色眼镜、胆量、强行、舍身、妖精皮肤……**
  - **加速、蜕皮、自然回复、再生力、同步、毒疗、早起、鳞粉、天恩、连续攻击、复眼、无防守、唱反调、单纯、不服输、好胜……**
  - **踩影 / 沙穴**：对手不能逃走或替换
- 其余特性（只在双打或野外有用的）会显示，但对战里没有效果。

### 携带道具

- 在 🛒 商店的「**携带道具**」区买，然后在 🐾 宝可梦页卡片下面的「携带：……」里交给宝可梦。**每只一个**，换下来的道具回到背包。对战中不能换。
- 树果和气势披带用过就没了；其他道具一直有效。
- 野生宝可梦也可能带着原作里会带的道具（按原作的几率）；**收服后连道具一起带回来**。

| 道具 | 效果 |
|---|---|
| 吃剩的东西 | 每回合回复 1/16 HP |
| 文柚果 | HP 一半以下时回复 1/4（用掉） |
| 木子果 / 樱子果 / 零余果 / 桃桃果 / 莓莓果 / 利木果 | 治好任何 / 麻痹 / 睡眠 / 中毒 / 灼伤 / 冰冻（用掉） |
| 气势披带 | 满 HP 时挨了会倒下的攻击剩 1 HP（用掉） |
| 先制之爪 | 20% 先出手 |
| 焦点镜 | 更容易击中要害（1/8） |
| 光粉 | 对手命中 ×0.9 |
| 生命宝珠 | 招式威力 ×1.3，每次攻击扣 1/10 HP |
| 达人带 | 效果绝佳的招式 ×1.2 |
| 讲究头带 / 讲究眼镜 / 讲究围巾 | 攻击 / 特攻 / 速度 ×1.5，但只能一直用第一个招式（换下场解除） |
| 力量头带 / 博识眼镜 | 物理 / 特殊招式 ×1.1 |
| 贝壳之铃 | 回复造成伤害的 1/8 |
| 黑色污泥 | 毒属性每回合回 1/16，其他属性扣 1/8 |
| 潮湿岩石 / 炽热岩石 / 沙沙岩石 / 冰冷岩石 | 自己带来的天气持续 8 回合 |
| 大地膜 | 自己展开的场地持续 8 回合 |
| 紧绑束带 / 紧缠钩爪 | 束缚伤害 1/6 / 束缚持续 7 回合 |
| 木炭、神秘水滴、奇迹种子、磁铁…… | 18 种属性强化道具：对应属性招式 ×1.2 |

### 天气和场地

- **天气**（5 回合，带对应岩石 8 回合）：
  - **下雨**（求雨、降雨）：水招 ×1.5，火招 ×0.5；打雷、暴风必中
  - **大晴天**（大晴天、日照）：火招 ×1.5，水招 ×0.5；不会冰冻；光合作用等回复 2/3
  - **沙暴**（沙暴、扬沙）：岩石、地面、钢以外每回合扣 1/16；岩石系特防 ×1.5
  - **冰雹**（冰雹）：冰系以外每回合扣 1/16；**下雪**（雪景、降雪）：冰系防御 ×1.5；两者暴风雪必中
  - 气象球随天气变属性、威力翻倍；日光束在其他天气里威力减半
- **真实天气**：开了天气功能（设置里填了城市）时，外面**下雨或打雷**，对战就在**雨中**开始；**下雪**就在雪中开始，整场都不会停（招式可以换成别的天气）。
- **场地**（5 回合，带大地膜 8 回合），只对**着地**的宝可梦有效（飞行系和漂浮特性不算）：
  - **电气场地**：电招 ×1.3，不会睡着
  - **青草场地**：草招 ×1.3，每回合回 1/16；地震等威力减半
  - **薄雾场地**：龙招威力减半，不会陷入异常状态
  - **精神场地**：超能力招式 ×1.3，先制招式打不到
- 当前的天气和场地显示在对战画面中间。

### 一击必杀、束缚、替身

- **一击必杀**（地裂、断头钳、角钻、绝对零度）：命中率 30% + 等级差，对比自己等级高的无效；结实无效；绝对零度对冰系无效。打中就直接倒下。
- **束缚**（紧束、绑紧、火焰旋涡、潮旋、流沙地狱……）：4–5 回合每回合扣 1/8，期间**不能逃跑也不能换人**（幽灵系除外）。
- **黑色目光 / 挡路 / 蛛网**：只要使用者还在场，对方就不能逃跑或换人。
- **替身**：用 1/4 HP 做一个替身，替它挨打，对方的变化招式和能力下降都会被挡住；替身被打掉就消失。换下场也会消失。血条名字后的 🧸 表示有替身。

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

**Legendary, mythical, Ultra Beast and Paradox Pokémon (special encounters)**:
- Once your lead is **Lv30**, each encounter has a **1 in 400** chance of a legendary, **1 in 2000** of a mythical
  Pokémon and **1 in 800** each of an Ultra Beast and a Paradox Pokémon (on a trip, preferably one from that region;
  Ultra Beasts turn up more often on trips to Alola, Paradox Pokémon on trips to Paldea). Each kind has its own intro.
- They're 8 levels above your lead (Lv40–70) with the games' catch rates – mostly **3**: weaken it, then Ultra Balls
  with sleep or freeze, and still expect a few tries.
- Each can **turn up again until it's caught**, never after. Running away or knocking it out leaves another chance.
- Shiny **1 in 4096**, with a guarantee ([section 10](10-Where-new-Pokemon-come-from)).

### Battle rules (simplified main-series rules)

- Turn-based, one on one. Commands: **Fight** (pick a move), **Bag**, **Pokémon** (switch), **Run**.
- Stats come from base stats and level (PokeAPI). Your Pokémon have IV 15, wild ones 0. Contest stats add up to
  +10%: Cool → Attack and Speed, Tough → Defense, Sp. Def and HP, Smart → Sp. Atk, Cute → accuracy.
- **Moves as in the games**: from PokeAPI, the level-up moves of the newest game the Pokémon is in – the **4** it learnt
  most recently at its level, **status moves included** (Growl, Swords Dance, Thunder Wave, Hypnosis, Synthesis …).
  At least one of them deals damage. Weather, terrain, one-hit KOs, trapping and Substitute work too (see below); moves only
  for double battles, forcing switches and the like are still skipped.
- **Stat stages**: Attack, Defense, Sp. Atk, Sp. Def, Speed, accuracy and evasion each go from −6 to +6, with the games' multipliers.
- Also: **priority moves** (Quick Attack goes first), **multi-hit moves** (2–5 hits), **draining moves** (heal part of the
  damage), **recoil** (Double-Edge hurts the user) and **healing moves** (Recover …).
- The **18-type chart**, same-type bonus ×1.5, **critical hits** (1/24, ×1.5), damage roll 85%–100%.
- Higher move priority goes first, then the faster Pokémon (with stat stages; paralysis halves Speed); ties are random.
- **Conditions**: burn (1/16 per turn, physical damage halved), poison (1/8 per turn), paralysis (25% can't move),
  freeze (can't move, 20% thaw per turn), confusion (2–4 turns, 1/3 chance to hit itself), sleep (can't move for 1–3 turns). Sleep and confusion don't come home. Fire can't be burned,
  Ice can't be frozen, Poison and Steel can't be poisoned, Electric can't be paralyzed.
- **Bag**: balls, Oran Berry (30% HP), Potion (60% HP), status medicine, Revive (back with half HP). Used items leave your bag.
- **Run**: 50% to start, easier when you're faster, +15% for each extra try. A failed escape gives the wild Pokémon a move. Run Away always gets away.

### Abilities

- Every Pokémon has an **ability**, picked as in the games from its species' regular abilities (shown on its card in the
  🐾 Pokémon tab). When it evolves it gets the evolved species' ability **in the same slot**.
- Wild Pokémon have one too, now and then (1 in 20) their **hidden ability**; they keep it when caught. Hover over an HP
  bar in battle to see it.
- Over 100 common abilities work in battle, for example:
  - **Overgrow / Blaze / Torrent / Swarm**: moves of that type ×1.5 at a third of HP or less
  - **Intimidate** lowers the other side's Attack when it comes out; **Clear Body, White Smoke, Hyper Cutter, Keen Eye …** stop drops
  - **Levitate** (no ground moves), **Flash Fire** (no fire moves, fire powered up), **Water / Volt Absorb** (heal),
    **Lightning Rod / Storm Drain / Sap Sipper / Motor Drive**
  - **Static / Flame Body / Poison Point / Effect Spore**: 30% to give a condition to a physical attacker; **Rough Skin / Iron Barbs** hurt it
  - **Sturdy**: survives a knock-out blow from full HP and one-hit KO moves; **Multiscale, Filter, Solid Rock, Wonder Guard, Shell Armor …**
  - **Insomnia / Vital Spirit / Limber / Immunity / Water Veil / Magma Armor / Own Tempo / Oblivious** keep conditions away
  - **Drizzle / Drought / Sand Stream / Snow Warning** bring weather; **Electric / Grassy / Misty / Psychic Surge** bring terrain;
    **Cloud Nine / Air Lock** cancel weather
  - **Swift Swim / Chlorophyll / Sand Rush / Slush Rush**: Speed ×2 in their weather; **Rain Dish / Ice Body / Dry Skin / Solar Power / Hydration**
  - **Huge Power, Pure Power, Guts, Hustle, Technician, Adaptability, Sniper, Super Luck, Tinted Lens, Scrappy, Sheer Force, Reckless, Pixilate …**
  - **Speed Boost, Shed Skin, Natural Cure, Regenerator, Synchronize, Poison Heal, Early Bird, Shield Dust, Serene Grace, Skill Link,
    Compound Eyes, No Guard, Contrary, Simple, Defiant, Competitive …**
  - **Shadow Tag / Arena Trap**: the other side can't run or switch
- Other abilities (double battles, the overworld) are shown but do nothing in these battles.

### Held items

- Buy them in the **Held items** part of the 🛒 Shop, then give one to a Pokémon with "Holds: …" on its card in the 🐾
  Pokémon tab. **One each**; the item it held goes back to your bag. Not during a battle.
- Berries and the Focus Sash are used up; the rest keep working.
- Wild Pokémon may hold what they hold in the games (at the games' chances) – **catch one and its item comes along**.

| Item | Effect |
|---|---|
| Leftovers | 1/16 HP back every turn |
| Sitrus Berry | 1/4 HP back at half HP or less (used up) |
| Lum / Cheri / Chesto / Pecha / Rawst / Aspear Berry | cures any condition / paralysis / sleep / poison / burn / freeze (used up) |
| Focus Sash | survives a knock-out blow from full HP with 1 HP (used up) |
| Quick Claw | 20% to move first |
| Scope Lens | more critical hits (1/8) |
| Bright Powder | the other side's accuracy ×0.9 |
| Life Orb | moves ×1.3, 1/10 HP per hit |
| Expert Belt | super-effective moves ×1.2 |
| Choice Band / Specs / Scarf | Attack / Sp. Atk / Speed ×1.5, but stuck with the first move it uses (until it switches out) |
| Muscle Band / Wise Glasses | physical / special moves ×1.1 |
| Shell Bell | heals 1/8 of the damage dealt |
| Black Sludge | Poison types heal 1/16 a turn, others lose 1/8 |
| Damp / Heat / Smooth / Icy Rock | its weather lasts 8 turns |
| Terrain Extender | its terrain lasts 8 turns |
| Binding Band / Grip Claw | trapping does 1/6 / lasts 7 turns |
| Charcoal, Mystic Water, Miracle Seed, Magnet … | 18 type boosters: moves of that type ×1.2 |

### Weather and terrain

- **Weather** (5 turns, 8 with the matching rock):
  - **Rain** (Rain Dance, Drizzle): water ×1.5, fire ×0.5; Thunder and Hurricane always hit
  - **Harsh sunlight** (Sunny Day, Drought): fire ×1.5, water ×0.5; no freezing; Synthesis & co. heal 2/3
  - **Sandstorm** (Sandstorm, Sand Stream): 1/16 a turn except Rock, Ground and Steel; Rock types' Sp. Def ×1.5
  - **Hail** (Hail): 1/16 a turn except Ice; **Snow** (Snowscape, Snow Warning): Ice types' Defense ×1.5; Blizzard always hits in both
  - Weather Ball changes type and doubles in power; Solar Beam is halved in other weather
- **Real weather**: with weather on (a city in Settings), **rain or a thunderstorm** outside starts the battle **in the rain**,
  **snow** in the snow, for the whole battle (moves can change it).
- **Terrain** (5 turns, 8 with a Terrain Extender), only for Pokémon **on the ground** (not Flying types or Levitate):
  - **Electric Terrain**: electric ×1.3, no falling asleep
  - **Grassy Terrain**: grass ×1.3, 1/16 HP back a turn; Earthquake & co. halved
  - **Misty Terrain**: dragon moves halved, no conditions
  - **Psychic Terrain**: psychic ×1.3, priority moves can't touch it
- The weather and terrain are shown in the middle of the battle scene.

### One-hit KOs, trapping, Substitute

- **One-hit KO moves** (Fissure, Guillotine, Horn Drill, Sheer Cold): 30% + the level difference; they fail on higher
  levels and against Sturdy; Sheer Cold doesn't touch Ice types. A hit knocks it out.
- **Trapping moves** (Wrap, Bind, Fire Spin, Whirlpool, Sand Tomb …): 1/8 a turn for 4–5 turns, and **no running or
  switching** meanwhile (Ghost types slip away).
- **Mean Look / Block / Spider Web**: no running or switching while the user is out.
- **Substitute**: 1/4 of its HP makes a stand-in that takes the hits and blocks the other side's status moves and stat drops,
  until it breaks or the Pokémon switches out. 🧸 after the name means it has one.

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
