# 宝可宠探索 · PokePet Explorer — 功能与玩法说明 / Feature Guide

> 版本 / Version **1.0.0**
>
> 这份文档讲清楚软件里每项功能**怎么打开、怎么玩、有什么规则和每日限制**。玩家看它上手，开发者看它了解当前版本的功能和数值（数值都写在代码里的常量中，下面会注明出处）。
> 安装、隐私、版权和项目结构请看 [README](README.md)。
>
> This document explains **how to open, use and play** every feature, with the rules and daily limits.
> Players can use it to get started; developers can use it as the feature list of the current version (each number
> comes from a constant in the code, noted below). For installing, privacy, licensing and project layout, see the [README](README.md).

**目录 / Contents**
- [中文](#中文)
- [English](#english)
- [开发者附录 / Developer appendix](#开发者附录--developer-appendix)

---

# 中文

## 1. 入门

| 操作 | 效果 |
|---|---|
| 第一次打开 | 弹出「大木博士」窗口，从**妙蛙种子、小火龙、杰尼龟**里选一只作为第一只搭档（1/64 概率是闪光）。关掉了也可以从右键菜单「🔴 选择你的第一只宝可梦…」重新打开。 |
| 单击宝可梦 | 摸摸它：冒爱心、心情上升；每 15 秒最多 +1 经验。 |
| 拖动宝可梦 | 把它放到屏幕任意位置。 |
| 拖着甩出去再松手 | 它会飞出去、在屏幕边缘反弹，落地时有点晕（但很开心）。 |
| 放到屏幕左右边缘 | 它会躲一半在边缘后面偷看；点一下就出来。 |
| 戳不同部位 | 头：摸摸头；肚子：咯咯笑；脚：吱一声。戳太多次它会生气。 |
| 双击宝可梦 | 打开待办清单。 |
| 右键宝可梦 / 托盘图标 | 主菜单：番茄钟、照顾、外出、钓鱼、草丛、日记、切换宝可梦、大小、语言、设置等。 |
| 点头顶的计时胶囊 | 打开番茄钟页面。 |

**控制面板**分成几个分页：**💼 工作**（番茄钟 + 待办）｜**📅 今日**（签到、每日任务）、**🍓 照顾**（背包、商店）、**🧭 外出**、**📖 图鉴**（成就、纪念品、合影、宝可梦图鉴、钓鱼图鉴）、**🐾 宝可梦**（队伍）、**📔 日记**｜**⚙️ 设置**。

## 2. 工作：番茄钟和待办

- **开始专注**：右键 →「开始专注（25 分钟）」，或在 💼 工作页点 ▶。可以选一个待办作为当前任务。
- 默认时长：专注 **25** 分钟，短休息 **5** 分钟，每 **4** 轮一次长休息 **15** 分钟（可在设置里改）。
- 专注时宝可梦不再乱走，头顶显示 🍅 倒计时。

**完成一个番茄钟的奖励：**
- **+3 🍓 树果**、**+20 经验**、心情 **+15**
- **+1 聪明**（每 25 分钟专注 +1，「一起学习」）
- 计入每日任务和成就；结束后宝可梦会问你「完成了吗？」，可以直接在气泡里勾掉待办。

**完成一个待办：** 天上掉下一颗树果给宝可梦吃，**+1 🍓**、**+10 经验**、心情上升。全部完成会有庆祝动画。

**提醒：** 每隔 N 分钟（可设置，专注时不提醒）提醒你还没做的待办；有截止时间的待办到点会响铃。

## 3. 照顾（QQ 宠物式养成）

每只宝可梦都有自己的**饥饿、清洁、健康和心情**（0–100）。

| 数值 | 下降速度 |
|---|---|
| 饥饿 | 每小时 −5（睡觉时减半） |
| 清洁 | 每小时 −3（睡觉时减半） |
| 心情 | 每小时 −8；饿（<25）再 −4，脏（<25）再 −3，生病再 −5 |
| 健康 | 饥饿或清洁 <15 时每小时 −8；有异常状态时每小时 −2×阶段；否则每小时 +4 恢复 |

- 关掉软件后也会按时间结算，但最多只算 **12 小时**。
- **饿了**：宝可梦会讨吃的。**脏了**：身上有污渍和苍蝇，想洗澡。
- **便便 💩**：吃饱后过一阵（偶尔也会随机）在屏幕上便便。点便便清理。没洗澡之前心情和健康会持续下降，便便留在屏幕上也会扣心情。

### 异常状态（生病）

| 状态 | 主要原因 | 对症药 |
|---|---|---|
| 中毒 | 太脏或便便后没洗澡 | 解毒药 |
| 麻痹 | 太饿 | 解麻药 |
| 混乱 | 心情太差（<30） | 柿仔果 |
| 灼伤 | 火山迷宫、对战 | 灼伤药 |
| 冰冻 | 冰川迷宫、对战 | 解冻药 |

- 不治疗的话，每 **6 小时**加重一阶（共 1–3 阶），第 3 阶之后**晕倒**。健康降到 0 也会晕倒。
- 一开始不知道是哪种病：花 **1 🍓「诊断」**就能知道。
- **用对药**治好；**用错药会加重一阶**。万灵药能治所有异常状态。
- 晕倒后只能用**活力碎片**救醒（健康恢复到 50）。伤药只回健康，不治病。

### 商店物品（🍓 价格）

| 物品 | 价格 | 效果 |
|---|---|---|
| 橙橙果 | 1 | 饥饿 +25，心情 +3 |
| 宝可梦泡芙 | 2 | 饥饿 +15，心情 +15 |
| 神奇糖果 | 5 | 饥饿 +5，心情 +5，**经验 +40** |
| 洗澡 | 免费 | 清洁回满，心情 +6 |
| 伤药 | 3 | 健康 +45 |
| 解毒药 / 解麻药 / 灼伤药 / 解冻药 / 柿仔果 | 各 3 | 治对应状态，健康 +20 |
| 万灵药 | 8 | 治所有状态，健康 +30 |
| 活力碎片 | 8 | 救醒晕倒的宝可梦 |
| 精灵球 / 超级球 / 高级球 | 5 / 12 / 25 | 只能在对战中用来捕捉 |

背包里有的物品会**先用背包的**，没有才花树果。可以在 🍓 照顾页、右键菜单「照顾」或宝可梦的气泡按钮里使用。

### 树果 🍓 从哪来

番茄钟 +3、待办 +1、每日签到、每日任务、成就、外出、钓鱼、对战胜利、节日礼物。

## 4. 成长与进化

- 等级公式：`等级 = 1 + ⌊√(经验 / 25)⌋`。
- 软件开着时宝可梦会**自己慢慢长**：满速每小时 +4 经验。心情不好、生病、饿或脏都会减速（参照 QQ 宠物的成长惩罚），晕倒时不长。
- **进化**：**Lv12** 第一次进化，**Lv24** 第二次。到级后宝可梦会先问你，可以选「以后再说」（6 小时后再问）；有分支进化的可以自己选。进化后等级、能力和日记都保留。
- **四项能力**（华丽大赛式）：**帅气、可爱、聪明、强壮**。来自番茄钟、外出、训练课、对战，也会给对战带来小加成。

## 5. 外出 🧭

右键 →「🧭 外出」，或 🧭 外出页。宝可梦会**离开桌面**（原地留一个倒计时和小地图），**关掉软件也照常计时**。同一时间只能有一只外出。

**出发条件：** 不是蛋、没生病没晕倒、饥饿和清洁都 ≥30，并且达到等级和能力要求。

| 目的地 | 时长 | 要求 | 奖励 | 风险 |
|---|---|---|---|---|
| 森林迷宫 | 30 分 | Lv1 | 2–4 🍓，15 经验，强壮 +1 | 10% 中毒 |
| 洞窟 | 45 分 | Lv4 | 3–6 🍓，25 经验，强壮 +2 帅气 +1 | 15% 麻痹 |
| 火山 | 60 分 | Lv8，强壮 ≥10 | 5–9 🍓，40 经验，强壮 +3 帅气 +2 | 20% 灼伤 |
| 冰川 | 60 分 | Lv8，强壮 ≥10 | 5–9 🍓，40 经验，强壮 +2 可爱 +2 | 20% 冰冻 |
| 遗迹 | 90 分 | Lv14，聪明 ≥20 | 8–14 🍓，70 经验，聪明 +4 强壮 +2 | 20% 混乱 |
| 帅气/可爱/聪明/强壮课 | 45 分 | Lv1 | 10 经验，对应能力 +3+⌊等级/5⌋ | — |
| 旅行（随机地区） | 60 分 | Lv5 | 2–5 🍓，20 经验，随机能力 +2，纪念品，心情 +10 | — |

- 回来时会饿一些、脏一些，迷宫还可能带回异常状态（已知是哪种）。
- 迷宫和旅行有几率捡到道具（从橙橙果到活力碎片）。
- 每次回来都会拍一张**合影**（随机姿势和表情），存在 📖 图鉴 → 合影：只保留**最近 3 张**，点 ☆ 收藏的会一直保留（最多 **20 张**）。
- **带回新伙伴**：迷宫和旅行回来时，有几率带回一只野生宝可梦，你可以选择让它留下或放它回去。几率 = 3% + 17% × 心情/100（心情越好越高，最高 20%）。训练课不会。
- **遇到野生宝可梦**：迷宫和旅行回来时有 **30%** 几率遇到野生宝可梦，宝可梦会问你要不要去对战，邀请 **30 分钟**内有效（见第 7 节）。
- 提前叫回来：右键菜单里「马上叫回来」，**没有任何奖励**。

## 6. 钓鱼 🎣

右键 →「🎣 钓鱼…」，或 📖 图鉴 →「去钓鱼」。

1. **甩竿**：按住鼠标（或空格）蓄力，松开甩出。甩竿的颜色决定难度：**绿色**（近、简单）、**黄色**（普通）、**红色**（远、难，但能钓到更稀有的）。
2. **等待**：浮漂往下沉时**尽快点击**。反应时间：普通 1.1 秒，非常稀有的只有 0.65 秒；红区更短，绿区更长。
3. **收线**：按住收线。鱼用力挣扎时要松一点（张力到红色线会断）；但线太松鱼会很快游走。

| 稀有度 | 例子 | 树果 | 经验 | 想跟你走的几率 |
|---|---|---|---|---|
| 常见 | 鲤鱼王、角金鱼、蚊香蝌蚪… | 0 | 2 | 6% |
| 少见 | 墨海马、大钳蟹、海星星… | 1 | 3 | 10% |
| 稀有 | 灯笼鱼、太阳珊瑚、丑丑鱼… | 3 | 5 | 16% |
| 非常稀有 | 迷你龙、拉普拉斯、暴鲤龙 | 6 | 8 | 25% |

- 共 **24 种**水系宝可梦，每条大小随机（标准身高的 70%–140%），**1/128** 闪光。
- 第一次钓到某种额外 **+2 🍓**。所有记录在 📖 图鉴 → 钓鱼图鉴（次数、最大尺寸）。
- 钓到的宝可梦有时**想跟你走**：选「欢迎加入！」它就成为新伙伴。
- 钓鱼**没有每日次数限制**。

## 7. 对战与捕捉 🌿

### 怎么开始

- **去草丛**：右键 →「🌿 去草丛探索…」→「走进草丛」。**每天最多遇到 16 次**（每天零点重置）。
- **外出遇到**：外出回来时遇到的野生宝可梦（见第 5 节），点「去和外出时遇到的宝可梦对战」。**不占草丛次数**，30 分钟内有效。
- 桌面上**不会**随机冒出野生宝可梦。

### 出战队伍

- 在 🐾 宝可梦页点「加入出战」，**最多 3 只**。没设置的话由当前搭档出战。
- 外出中、晕倒、还是蛋的宝可梦不能出战。
- 对战中可以随时换宝可梦（换人会让对方打一次）；场上的宝可梦倒下后可以免费换下一只。

### 会遇到谁

- PMD 已经画好的宝可梦，**不会出现传说、幻之、究极异兽和悖谬宝可梦**。
- 草丛偏向一般、草、虫、飞行、妖精、电、毒属性；外出遇到的按地点：洞窟（岩石、地面、钢…）、火山（火、岩石、地面、龙）、冰川（冰、水、钢）、遗迹（超能力、幽灵、恶、妖精）；旅行遇到的来自那个地区的图鉴。偶尔也会出现别的属性。
- **野生等级 = 领头宝可梦等级 −3 ～ +1**（最低 Lv2）。
- 已进化的形态要搭档 **Lv15** 以后才会出现，最终形态要 **Lv28** 以后。
- **1/128** 闪光。

### 对战规则（简化版正作规则）

- 回合制 1 对 1。指令：**战斗**（选招式）、**背包**、**宝可梦**（换人）、**逃跑**。
- 能力值由种族值和等级算出（PokeAPI 数据）。自己的宝可梦个体值 15，野生的 0。四项能力会给最多 +10% 的加成：帅气→攻击和速度，强壮→防御、特防和 HP，聪明→特攻，可爱→命中。
- 招式是该等级能学会的**攻击招式**，有威力和命中；暂时**没有变化类招式**（不造成伤害的招式）。
- **18 属性相克**、属性一致加成 ×1.5、**击中要害**（1/24，×1.5）、伤害随机 85%–100%。
- 速度快的先出手（麻痹时速度减半），同速随机。
- **异常状态**：灼伤（每回合扣 1/16，物理伤害减半）、中毒（每回合扣 1/8）、麻痹（25% 不能行动）、冰冻（不能行动，每回合 20% 解冻）、混乱（2–4 回合，1/3 几率打自己）。火系不会灼伤，冰系不会冰冻，毒和钢系不会中毒，电系不会麻痹。
- **背包**：精灵球、橙橙果（回 30% HP）、伤药（回 60%）、各种状态药、活力碎片（复活并回一半 HP）。用掉的会从背包扣除。
- **逃跑**：基础 50%，比对方快就更容易；每多试一次 +15%。逃跑失败对方会攻击。

### 捕捉规则

- 在对战中从背包扔球。**捕捉率**用正作第三世代以后的公式：
  `a = (3×最大HP − 2×当前HP) × 种族捕获率 × 球的倍率 ÷ (3×最大HP) × 状态倍率`
- 球的倍率：精灵球 ×1，超级球 ×1.5，高级球 ×2。
- 状态倍率：冰冻 ×2；麻痹、中毒、灼伤 ×1.5。
- **HP 越低越好抓**，种族捕获率越高越好抓（例如绿毛虫 255、卡比兽 25）。
- 球会摇 0–3 下，摇满并成功才算抓到。没抓到对方会攻击。
- 球只能从商店买，不能在对战外使用。

### 结果

| 结果 | 效果 |
|---|---|
| **胜利** | 参战过的宝可梦平分经验 `(8 + 3×野生等级) ÷ 参战数量`；**+1–3 🍓**；最后在场的宝可梦帅气 +1、强壮 +1；计入每日任务「对战」 |
| **捕捉成功** | 同样获得经验；野生宝可梦**加入队伍**，等级保持不变；记入宝可梦图鉴；计入每日任务「捕捉」 |
| **失败** | 轻微惩罚：出战的宝可梦**健康 −15、心情 −10**，不会晕倒 |
| **逃跑** | 没有奖励也没有惩罚 |

- 对战中得的**灼伤、中毒、麻痹、冰冻会带回家**，要在 🍓 照顾页治疗（混乱不会带回家）。
- 📖 图鉴 → 宝可梦图鉴记录**见过**和**抓到**的种类数。

## 8. 每日：签到、任务、节日、天气 📅

- **签到**：在 📅 今日页签到。连续 7 天的奖励依次是 2、2、3、3、4、4、8 🍓，第 7 天还送一颗**神奇糖果**，然后重新循环。断签就从第 1 天重新算。
- **每日任务**：每天随机 **4 个**，同一种活动不会出现两次。完成后点「领取」；4 个都领完再加 **3 🍓**。

| 任务 | 目标 | 奖励 |
|---|---|---|
| 完成番茄钟 | 1 个 / 2 个 | 3 / 5 🍓 |
| 专注分钟 | 50 分钟 | 4 🍓 |
| 完成待办 | 2 个 | 3 🍓 |
| 喂食 | 2 次 | 2 🍓 |
| 洗澡 | 1 次 | 2 🍓 |
| 摸摸 | 10 次 | 2 🍓 |
| 外出 | 1 次 | 3 🍓 |
| 训练课 | 1 次 | 3 🍓 |
| 钓鱼 | 2 条 | 3 🍓 |
| 对战胜利 | 2 次 | 3 🍓 |
| 捕捉 | 1 只 | 4 🍓 |

- **节日**：元旦、情人节、宝可梦日（2/27）、儿童节、万圣节、平安夜、圣诞节、跨年，以及春节、元宵、端午、中秋（2026–2030 年的日期）。当天会问候并送 **3 🍓**。和搭档的**第 100 天**和**每周年**也会庆祝。
- **天气**（默认关闭）：设置 → 天气与节日，打开并**手动输入城市**（不按 IP 定位），宝可梦会聊晴天、下雨、下雪、热和冷。数据来自 Open-Meteo，不需要账号。

## 9. 成就 🏆

在 📖 图鉴 → 成就，每个成就只发一次树果。

| 类别 | 成就（目标 → 奖励） |
|---|---|
| 专注 | 1 个番茄 → 2，25 个 → 5，100 个 → 10 |
| 待办 | 10 个 → 3，50 个 → 5 |
| 等级 | Lv5 → 3，Lv12 → 5，Lv24 → 10 |
| 养成 | 孵化 → 5，进化一次 → 5，进化两次 → 10，治好 5 次病 → 5，任一能力达 50 → 8，拥有闪光 → 3 |
| 外出 | 1 次 → 2，20 次 → 8，去过全部 9 个地区 → 15 |
| 钓鱼 | 第一条 → 2，钓鱼图鉴 10 种 → 8，全部 24 种 → 20 |
| 对战 | 第一次捕捉 → 3，抓到 10 种 → 10，赢 20 场 → 8 |

## 10. 新伙伴从哪来

刚开始只有博士给的一只。以后的伙伴**只能这样获得**：
1. **钓鱼**：钓到的宝可梦想跟你走（第 6 节）。
2. **外出**：心情好的宝可梦带回野生朋友（第 5 节）。
3. **对战捕捉**（第 7 节）。

在 🐾 宝可梦页可以**切换搭档**（谁在桌面上）、**加入出战**、**移除**。右键菜单「切换宝可梦」也可以快速切换。

## 11. 日记、表情和其他

- **日记**：宝可梦每天用自己的话写日记（专注、待办、吃饭、洗澡、生病、摸摸）；每 7 天总结这周开心、一般还是难过。📔 日记页能看到每天的专注分钟和时间线。
- **表情**：气泡里显示 PMD 头像，表情随心情和状态变化（开心、担心、难过、疼、晕…）。
- **对键盘鼠标做出反应**（可关）：你打字时它坐下陪你打字，连续打字 15 分钟没开番茄钟会建议你开一个；鼠标移动时它会看向光标；离开 3 分钟它会睡觉。只知道「什么时候按了键」，不知道按了哪个键。
- **全屏时躲开**：前台是全屏应用（视频、游戏、演示）时自动隐藏（设置里可关，默认开）。
- **AI 聊天**（默认关闭）：设置 → AI 聊天，选服务商、填自己的 API key 和模型，然后右键「💬 聊天」。宝可梦按自己的性格和当前状态回答。对话不保存。
- **检查更新**：启动时检查 GitHub 上的新版本（可关）；设置 → 更新 可以下载安装包到「下载」文件夹并打开。

## 12. 每日限制和计时一览

| 项目 | 限制 |
|---|---|
| 草丛遇敌 | 每天 16 次，零点重置 |
| 外出遇到的野生宝可梦 | 外出回来 30% 几率，30 分钟内有效，不占草丛次数 |
| 外出 | 同时只能一只；时长 30–90 分钟 |
| 签到 | 每天 1 次，7 天一轮 |
| 每日任务 | 每天 4 个 + 全部完成奖励 |
| 钓鱼 | 不限次数 |
| 节日礼物 | 每个节日 1 次 |
| 摸摸给经验 | 每 15 秒最多 1 点 |
| 关闭软件时的照顾结算 | 最多 12 小时 |
| 异常状态加重 | 每 6 小时一阶 |
| 进化「以后再说」 | 6 小时后再问 |
| 合影 | 最近 3 张 + 收藏最多 20 张 |
| 出战队伍 | 最多 3 只 |

---

# English

## 1. Getting started

| Action | Result |
|---|---|
| First launch | Professor Oak's window opens: pick **Bulbasaur, Charmander or Squirtle** as your first partner (1 in 64 is shiny). If you close it, reopen it from the right-click menu "🔴 Choose your first Pokémon…". |
| Click the pet | Pat it: hearts, mood up; at most +1 XP every 15 s. |
| Drag the pet | Move it anywhere on screen. |
| Drag, swing and let go | It flies, bounces off the screen edges and lands a bit dizzy (and happy). |
| Drop it at the left/right edge | It hides halfway and peeks out; click it to bring it back. |
| Poke different spots | Head: a pat; belly: a giggle; feet: a squeak. Poke too much and it gets annoyed. |
| Double-click | Open the to-do list. |
| Right-click / tray icon | Main menu: timer, care, outings, fishing, grass, diary, switch Pokémon, size, language, settings… |
| Click the timer pill | Open the Pomodoro view. |

The **panel** has these tabs: **💼 Work** (Pomodoro + to-dos) | **📅 Today** (sign-in, daily tasks), **🍓 Care** (bag, shop),
**🧭 Outing**, **📖 Dex** (achievements, souvenirs, photos, Pokédex, fishing Pokédex), **🐾 Pokémon** (team), **📔 Diary** | **⚙️ Settings**.

## 2. Work: Pomodoro and to-dos

- **Start focusing**: right-click → "Start focus (25 min)", or ▶ in the 💼 Work tab. You can pick a to-do as the current task.
- Defaults: **25** min focus, **5** min short break, a **15** min long break every **4** rounds (change them in Settings).
- While you focus, the pet stops wandering and shows a 🍅 countdown.

**Each finished Pomodoro gives:**
- **+3 🍓 berries**, **+20 XP**, mood **+15**
- **+1 Smart** per 25 minutes of focus ("studying together")
- progress on daily tasks and achievements; the pet then asks "Did you finish …?" and you can tick the to-do off in the bubble.

**Each finished to-do:** a berry drops for the pet, **+1 🍓**, **+10 XP**, mood up. Finishing all of them gets a celebration.

**Reminders:** every N minutes (configurable, never during focus) for open to-dos; to-dos with a due time ring when they're due.

## 3. Care (QQ-Pet style)

Every Pokémon has its own **hunger, cleanliness, health and mood** (0–100).

| Value | How fast it drops |
|---|---|
| Hunger | −5 per hour (half while asleep) |
| Cleanliness | −3 per hour (half while asleep) |
| Mood | −8 per hour; another −4 when hungry (<25), −3 when dirty (<25), −5 when sick |
| Health | −8 per hour when hunger or cleanliness <15; −2 × stage per hour with a status condition; otherwise +4 per hour |

- Time also passes while the app is closed, but at most **12 hours** are counted.
- **Hungry**: it asks for food. **Dirty**: dirt spots and a fly; it wants a bath.
- **Droppings 💩**: some time after eating (and now and then anyway) it poops on your screen. Click to clean up. Until
  it's bathed its mood and health keep dropping, and droppings left on screen cost mood too.

### Status conditions (being sick)

| Condition | Main cause | Medicine |
|---|---|---|
| Poison | Too dirty, or not bathed after pooping | Antidote |
| Paralysis | Too hungry | Paralyze Heal |
| Confusion | Mood too low (<30) | Persim Berry |
| Burn | Volcano dungeon, battles | Burn Heal |
| Freeze | Glacier dungeon, battles | Ice Heal |

- Untreated, it gets a stage worse every **6 hours** (stages 1–3); after stage 3 the pet **faints**. Health at 0 also makes it faint.
- At first you don't know which one it is: **Diagnose for 1 🍓** to find out.
- The **right medicine** cures it; the **wrong one makes it a stage worse**. Full Heal cures everything.
- A fainted Pokémon needs a **Revive** (back to 50 health). Potions only restore health.

### Shop (🍓 prices)

| Item | Price | Effect |
|---|---|---|
| Oran Berry | 1 | Hunger +25, mood +3 |
| Poké Puff | 2 | Hunger +15, mood +15 |
| Rare Candy | 5 | Hunger +5, mood +5, **XP +40** |
| Bath | free | Cleanliness to 100, mood +6 |
| Potion | 3 | Health +45 |
| Antidote / Paralyze Heal / Burn Heal / Ice Heal / Persim Berry | 3 each | Cures that condition, health +20 |
| Full Heal | 8 | Cures any condition, health +30 |
| Revive | 8 | Wakes a fainted Pokémon |
| Poké Ball / Great Ball / Ultra Ball | 5 / 12 / 25 | Battle only, for catching |

Items in the bag are **used first**; berries are only spent when you have none. Use items from the 🍓 Care tab, the
right-click "Care" menu or the buttons in the pet's speech bubble.

### Where berries come from

Pomodoros +3, to-dos +1, daily sign-in, daily tasks, achievements, outings, fishing, battle wins, holiday gifts.

## 4. Growing up and evolving

- Level formula: `level = 1 + ⌊√(XP / 25)⌋`.
- The pet **grows by itself while the app runs**: +4 XP per hour at full speed, slower when it's sad, sick, hungry or
  dirty (QQ Pet's growth penalties), not at all while fainted.
- **Evolution** at **Lv12** and **Lv24**. The pet asks first; "Later" asks again in 6 hours. For branching species you
  pick the form. Level, stats and diary are kept.
- **Four contest stats**: **Cool, Cute, Smart, Tough**. They come from Pomodoros, outings, classes and battles, and give small bonuses in battle.

## 5. Outings 🧭

Right-click → "🧭 Expedition", or the 🧭 Outing tab. The pet **leaves the desktop** (a countdown and a little map stay
where it was) and the **timer keeps running while the app is closed**. Only one Pokémon can be away at a time.

**To go:** not an egg, not sick or fainted, hunger and cleanliness ≥30, and the level / stats required.

| Destination | Time | Needs | Rewards | Risk |
|---|---|---|---|---|
| Woods dungeon | 30 min | Lv1 | 2–4 🍓, 15 XP, Tough +1 | 10% poison |
| Cave | 45 min | Lv4 | 3–6 🍓, 25 XP, Tough +2 Cool +1 | 15% paralysis |
| Volcano | 60 min | Lv8, Tough ≥10 | 5–9 🍓, 40 XP, Tough +3 Cool +2 | 20% burn |
| Glacier | 60 min | Lv8, Tough ≥10 | 5–9 🍓, 40 XP, Tough +2 Cute +2 | 20% freeze |
| Ruins | 90 min | Lv14, Smart ≥20 | 8–14 🍓, 70 XP, Smart +4 Tough +2 | 20% confusion |
| Cool / Cute / Smart / Tough class | 45 min | Lv1 | 10 XP, that stat +3 + ⌊level/5⌋ | — |
| Travel (random region) | 60 min | Lv5 | 2–5 🍓, 20 XP, a random stat +2, a souvenir, mood +10 | — |

- It comes back hungrier and dirtier; dungeons may give it a (known) status condition.
- Dungeons and travel can turn up an item (from Oran Berries to Revives).
- Every return brings a **photo** (random pose and expression) in 📖 Dex → Photos: only the **3 newest** are kept, and
  ☆ favourites stay for good (up to **20**).
- **A new friend**: after a dungeon or a trip, a wild Pokémon may follow it home and you decide whether it stays.
  Chance = 3% + 17% × mood/100 (up to 20% when it's happy). Classes never bring one.
- **A wild encounter**: after a dungeon or a trip there's a **30%** chance of meeting a wild Pokémon; your Pokémon asks
  whether to battle it, and the offer lasts **30 minutes** (see section 7).
- Calling it back early ("Call back now") gives **no rewards**.

## 6. Fishing 🎣

Right-click → "🎣 Fishing…", or 📖 Dex → "Go fishing".

1. **Cast**: hold the mouse (or Space) to charge, release to cast. The colour sets the difficulty: **green** (close,
   easy), **yellow** (normal), **red** (far, hard, rarer fish).
2. **Wait**: when the bobber dips, **click quickly**. Reaction time is 1.1 s for common fish, only 0.65 s for very rare
   ones; shorter in the red zone, longer in the green one.
3. **Reel in**: hold to reel. Ease off when the fish pulls hard (the line snaps in the red), but don't let the line go
   slack or it swims away fast.

| Rarity | Examples | Berries | XP | Wants to join |
|---|---|---|---|---|
| Common | Magikarp, Goldeen, Poliwag… | 0 | 2 | 6% |
| Uncommon | Horsea, Krabby, Staryu… | 1 | 3 | 10% |
| Rare | Chinchou, Corsola, Feebas… | 3 | 5 | 16% |
| Very rare | Dratini, Lapras, Gyarados | 6 | 8 | 25% |

- **24** water Pokémon, each with a random size (70%–140% of the usual height), shiny **1 in 128**.
- A new species gives **+2 🍓** extra. Everything goes into 📖 Dex → Fishing Pokédex (count, biggest size).
- A catch may **want to come along**: "Welcome to the team!" makes it a new team member.
- Fishing has **no daily limit**.

## 7. Battles and catching 🌿

### Starting a battle

- **The grass**: right-click → "🌿 Explore the grass…" → "Into the grass". **Up to 16 encounters a day** (resets at midnight).
- **From an outing**: a wild Pokémon met on an outing (section 5) → "Battle the Pokémon met on the outing". It **doesn't
  use a grass encounter** and lasts 30 minutes.
- Wild Pokémon **never** pop up on the desktop by themselves.

### Your team

- In the 🐾 Pokémon tab press "Add to team", **up to 3**. Without a team, your current partner battles.
- Pokémon that are away, fainted or still eggs can't battle.
- Switch any time in battle (the wild Pokémon gets a move); after your Pokémon faints, switching is free.

### Who appears

- Any species PMD has drawn, **except legendary, mythical, Ultra Beasts and Paradox Pokémon**.
- The grass favours Normal, Grass, Bug, Flying, Fairy, Electric and Poison; outing encounters follow the place: cave
  (Rock, Ground, Steel…), volcano (Fire, Rock, Ground, Dragon), glacier (Ice, Water, Steel), ruins (Psychic, Ghost,
  Dark, Fairy); a trip's encounter comes from that region's Pokédex. Other types turn up now and then.
- **Wild level = your lead's level −3 to +1** (at least Lv2).
- Evolved forms only appear once your partner is **Lv15**, fully evolved ones from **Lv28**.
- Shiny **1 in 128**.

### Battle rules (simplified main-series rules)

- Turn-based, one on one. Commands: **Fight** (pick a move), **Bag**, **Pokémon** (switch), **Run**.
- Stats come from base stats and level (PokeAPI). Your Pokémon have IV 15, wild ones 0. Contest stats add up to
  +10%: Cool → Attack and Speed, Tough → Defense, Sp. Def and HP, Smart → Sp. Atk, Cute → accuracy.
- Moves are the **damaging moves** it knows at its level, with power and accuracy; **status moves aren't in yet**.
- The **18-type chart**, same-type bonus ×1.5, **critical hits** (1/24, ×1.5), damage roll 85%–100%.
- The faster Pokémon moves first (paralysis halves Speed); ties are random.
- **Conditions**: burn (1/16 per turn, physical damage halved), poison (1/8 per turn), paralysis (25% can't move),
  freeze (can't move, 20% thaw per turn), confusion (2–4 turns, 1/3 chance to hit itself). Fire can't be burned,
  Ice can't be frozen, Poison and Steel can't be poisoned, Electric can't be paralyzed.
- **Bag**: balls, Oran Berry (30% HP), Potion (60% HP), status medicine, Revive (back with half HP). Used items leave your bag.
- **Run**: 50% to start, easier when you're faster, +15% for each extra try. A failed escape gives the wild Pokémon a move.

### Catching

- Throw a ball from the bag during battle. The **catch chance** uses the Gen 3+ formula:
  `a = (3 × maxHP − 2 × HP) × species catch rate × ball bonus ÷ (3 × maxHP) × status bonus`
- Ball bonus: Poké Ball ×1, Great Ball ×1.5, Ultra Ball ×2.
- Status bonus: freeze ×2; paralysis, poison, burn ×1.5.
- **The lower its HP, the easier**; species with a higher catch rate are easier too (Caterpie 255, Snorlax 25).
- The ball shakes 0–3 times; it must succeed all the way. If it breaks free, the wild Pokémon gets a move.
- Balls are only sold in the shop and can't be used outside battles.

### Results

| Result | Effect |
|---|---|
| **Win** | XP `(8 + 3 × wild level) ÷ number of participants` for each Pokémon that took part; **+1–3 🍓**; the Pokémon on the field gets Cool +1 and Tough +1; counts for the "battle" daily task |
| **Caught** | The same XP; the wild Pokémon **joins your team** at its level; recorded in the Pokédex; counts for the "catch" daily task |
| **Lose** | Light penalty: the team gets **health −15, mood −10**, never fainted |
| **Run** | Nothing gained or lost |

- **Burns, poison, paralysis and freezing from the battle come home** – treat them in the 🍓 Care tab (confusion doesn't).
- 📖 Dex → Pokédex counts the species **seen** and **caught**.

## 8. Every day: sign-in, tasks, holidays, weather 📅

- **Sign-in** in the 📅 Today tab. A 7-day streak gives 2, 2, 3, 3, 4, 4, 8 🍓, plus a **Rare Candy** on day 7, then
  starts over. Missing a day restarts at day 1.
- **Daily tasks**: **4** random ones a day, never two for the same activity. Press "Collect" for each; collecting all
  four adds **3 🍓**.

| Task | Goal | Reward |
|---|---|---|
| Finish Pomodoros | 1 / 2 | 3 / 5 🍓 |
| Focus minutes | 50 min | 4 🍓 |
| Finish to-dos | 2 | 3 🍓 |
| Feed | 2 times | 2 🍓 |
| Bathe | 1 time | 2 🍓 |
| Pat | 10 times | 2 🍓 |
| Go on an outing | 1 | 3 🍓 |
| Take a class | 1 | 3 🍓 |
| Catch fish | 2 | 3 🍓 |
| Win battles | 2 | 3 🍓 |
| Catch a Pokémon | 1 | 4 🍓 |

- **Holidays**: New Year, Valentine's Day, Pokémon Day (Feb 27), Children's Day, Halloween, Christmas Eve, Christmas,
  New Year's Eve, plus Spring Festival, Lantern Festival, Dragon Boat and Mid-Autumn (dates for 2026–2030). Your
  Pokémon greets you with **3 🍓**. **Day 100** and **every anniversary** with your partner are celebrated too.
- **Weather** (off by default): Settings → Weather & holidays, turn it on and **type your city** (never located by IP).
  Your Pokémon talks about sun, rain, snow, heat and cold. Data from Open-Meteo, no account needed.

## 9. Achievements 🏆

📖 Dex → Achievements. Each one pays berries once.

| Group | Achievements (goal → berries) |
|---|---|
| Focus | 1 Pomodoro → 2, 25 → 5, 100 → 10 |
| To-dos | 10 → 3, 50 → 5 |
| Levels | Lv5 → 3, Lv12 → 5, Lv24 → 10 |
| Raising | hatch → 5, evolve once → 5, twice → 10, cure 5 times → 5, any stat at 50 → 8, own a shiny → 3 |
| Outings | 1 → 2, 20 → 8, all 9 regions → 15 |
| Fishing | first fish → 2, 10 species → 8, all 24 → 20 |
| Battles | first catch → 3, 10 species caught → 10, 20 wins → 8 |

## 10. Where new Pokémon come from

You start with the one from the professor. After that, new team members **only** come from:
1. **Fishing** – a catch that wants to come along (section 6).
2. **Outings** – a happy Pokémon brings a wild friend home (section 5).
3. **Catching** in battle (section 7).

In the 🐾 Pokémon tab you can **switch your partner** (the one on the desktop), **add to team** and **remove**. The
right-click "Switch Pokémon" menu switches quickly too.

## 11. Diary, emotions and more

- **Diary**: the pet writes a daily entry in its own words (focus, to-dos, meals, baths, sickness, pats) and every 7 days
  says whether the week was happy, okay or sad. 📔 Diary shows focus minutes per day and a timeline.
- **Emotions**: speech bubbles show its PMD portrait, matching its mood and state (happy, worried, sad, pain, dizzy…).
- **Reacting to keyboard & mouse** (can be turned off): it types along while you type and suggests a Pomodoro after
  15 min of typing without one; it looks at the cursor; it naps when you've been away 3 min. It only knows *when* a key
  was pressed, never which.
- **Hiding over fullscreen apps** (videos, games, slides) – on by default, can be turned off.
- **AI chat** (off by default): Settings → AI chat, pick a provider, enter your own API key and a model, then right-click
  "💬 Chat…". Your Pokémon answers in character from its current state. Conversations aren't saved.
- **Updates**: checks GitHub for a new release at start (can be turned off); Settings → Updates downloads the installer
  to your Downloads folder and opens it.

## 12. Daily limits and timers at a glance

| What | Limit |
|---|---|
| Grass encounters | 16 a day, reset at midnight |
| Wild Pokémon from outings | 30% after an outing, lasts 30 min, doesn't use grass encounters |
| Outings | one Pokémon at a time; 30–90 minutes |
| Sign-in | once a day, 7-day cycle |
| Daily tasks | 4 a day + an all-done bonus |
| Fishing | unlimited |
| Holiday gifts | once per holiday |
| XP from patting | at most 1 every 15 s |
| Care while the app is closed | at most 12 hours counted |
| Status condition getting worse | one stage every 6 hours |
| Evolution "Later" | asked again after 6 hours |
| Photos | 3 newest + up to 20 favourites |
| Battle team | up to 3 |

---

# 开发者附录 / Developer appendix

**当前版本 / Current version:** 1.0.0 · Electron + vanilla JS · 数据文件版本 / store version 4

## 数值在哪里改 / Where the numbers live

| 功能 / Feature | 文件 / File | 主要常量 / Key constants |
|---|---|---|
| 照顾、物品、异常状态 / Care, items, statuses | `src/main/care.js` | `ITEMS`, `REWARD`, `DIAGNOSE_COST`, `STAGE_HOURS`, `MAX_STAGE` |
| 成长、进化 / Growth, evolution | `src/main/growth.js` | `BASE_XP_PER_HOUR`, `EVOLVE_LEVELS`, `EVOLVE_SNOOZE_H`, `SHINY_RATE` (1/64 starter) |
| 外出 / Outings | `src/main/expedition.js` | `EXPEDITIONS`, `LOOT`, `companionChance()` |
| 外出遭遇 / Outing encounters | `main.js` `checkExpedition` / `offerOutingEncounter` | 0.3 chance, 30 min window |
| 钓鱼 / Fishing | `src/main/fishing.js` | `FISH`, `TIERS`, `ZONES`, `JOIN_CHANCE`, `SHINY_RATE` |
| 对战引擎 / Battle engine | `src/main/battle.js` | `BALLS`, `STATUS_CATCH`, `WILD_IV`, `wildLevel()`, `expFor()` |
| 野生宝可梦 / Wild species | `src/main/wild.js` | `HABITATS`, `REGION_DEX`, `DAILY_GRASS`, `SPECIAL`, `SHINY_RATE` |
| 对战结算 / Battle results | `main.js` `finishBattle` | win berries 1–3, lose −15 health / −10 mood |
| 属性相克 / Type chart | `src/main/typechart.js` | 18 × 18 |
| 种族值、招式、捕获率 / Base stats, moves, catch rates | `src/main/pokedata.js` | PokeAPI, cached in `userData/pokedata.json` |
| 每日 / Daily | `src/main/daily.js` | `TASKS`, `PER_DAY`, `ALL_DONE_BONUS`, `SIGN_REWARDS` |
| 成就 / Achievements | `src/main/achievements.js` | `ACHIEVEMENTS` |
| 合影 / Photos | `src/main/album.js` | `RECENT`, `MAX_FAVORITES` |
| 节日、天气 / Holidays, weather | `src/main/weather.js` | `FIXED`, `LUNAR`, `HOLIDAY_GIFT` |
| 番茄钟默认值 / Pomodoro defaults | `src/main/store.js` | `pomodoro: { focus: 25, short: 5, long: 15, longEvery: 4 }` |
| 界面文字 / UI text | `src/shared/i18n.js` | en / zh |

## 测试 / Testing

```bash
npm test                                            # unit tests (node --test)
POKEPET_TEST=<dir> POKEPET_DATA_DIR=<dir> npx electron .   # end-to-end self-test, screenshots in <dir>
```

The self-test uses a fresh data folder, walks through the starter, Pomodoro, care, outings, evolution, fishing and
battles, and saves a screenshot of each step.
自测会用一个新的数据目录，依次走一遍选初始宝可梦、番茄钟、照顾、外出、进化、钓鱼和对战，每一步保存截图。

## 已知限制 / Known limitations (1.0.0)

- 对战只有攻击招式，没有变化类招式、能力升降、睡眠状态和天气场地。
  Battles only use damaging moves: no status moves, stat changes, sleep, weather or terrain.
- 野生宝可梦按 PMD 已画的物种出现；没有 PMD 精灵图的物种不会出现，也不能获得。
  Only species PMD has drawn can appear or join.
- 精灵图和 PokeAPI 数据需要联网下载，第一次遇到某个物种会慢一点；之后会缓存。
  Sprites and PokeAPI data are downloaded on first use (slower the first time), then cached.
- 安装包没有签名和公证（macOS 首次需右键 → 打开；Windows 需在 SmartScreen 里点「仍要运行」）。
  Installers are unsigned (macOS: right-click → Open the first time; Windows: SmartScreen → Run anyway).
- Windows 版还没在真机上完整测试过。
  The Windows build hasn't been fully tested on a real machine yet.
