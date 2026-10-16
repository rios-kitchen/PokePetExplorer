// Fishing: which Pokémon bites, how hard it fights, how big it is, and what it's worth.
// After QQ Pet's pond (fishing for rewards), with water Pokémon from the games. The main process decides
// every catch; the fishing window only plays it out (see src/fishing/).

// dex, names (from PokeAPI), height in decimetres (PokeAPI) → typical size; tier: 0 common … 3 very rare
const FISH = [
  [129, 'Magikarp', '鲤鱼王', 9, 0], [118, 'Goldeen', '角金鱼', 6, 0], [60, 'Poliwag', '蚊香蝌蚪', 6, 0],
  [72, 'Tentacool', '玛瑙水母', 9, 0], [339, 'Barboach', '泥泥鳅', 4, 0], [456, 'Finneon', '荧光鱼', 4, 0],
  [116, 'Horsea', '墨海马', 4, 1], [98, 'Krabby', '大钳蟹', 4, 1], [90, 'Shellder', '大舌贝', 3, 1],
  [120, 'Staryu', '海星星', 8, 1], [223, 'Remoraid', '铁炮鱼', 6, 1], [370, 'Luvdisc', '爱心鱼', 6, 1],
  [746, 'Wishiwashi', '弱丁鱼', 2, 1], [846, 'Arrokuda', '刺梭鱼', 5, 1], [318, 'Carvanha', '利牙鱼', 8, 1],
  [170, 'Chinchou', '灯笼鱼', 5, 2], [211, 'Qwilfish', '千针鱼', 5, 2], [222, 'Corsola', '太阳珊瑚', 6, 2],
  [320, 'Wailmer', '吼吼鲸', 20, 2], [550, 'Basculin', '野蛮鲈鱼', 10, 2], [349, 'Feebas', '丑丑鱼', 6, 2],
  [147, 'Dratini', '迷你龙', 18, 3], [131, 'Lapras', '拉普拉斯', 25, 3], [130, 'Gyarados', '暴鲤龙', 65, 3]
].map(([dex, en, zh, height, tier]) => ({ dex, names: { en, zh }, height, tier }));

const TIERS = [
  { name: 'common',   bite: 1100, pull: 0.8, berries: 0, xp: 2 },
  { name: 'uncommon', bite: 950,  pull: 1.0, berries: 1, xp: 3 },
  { name: 'rare',     bite: 800,  pull: 1.25, berries: 3, xp: 5 },
  { name: 'veryRare', bite: 650,  pull: 1.55, berries: 6, xp: 8 }
];
const NEW_SPECIES_BONUS = 2;
const JOIN_CHANCE = [0.02, 0.03, 0.05, 0.08];   // by tier: rarer Pokémon are more curious about you
const SHINY_RATE = 1 / 4096;                      // as in the games
// species already in the fishing Pokédex bite this many times as often as new ones, so completing it takes a while
const REPEAT_WEIGHT = 5;

// Junk that turns up once the pond is tired: no reward, not in the Pokédex.
const JUNK = [
  { id: 'boot', icon: '🥾', names: { en: 'An old boot', zh: '破靴子' } },
  { id: 'can', icon: '🥫', names: { en: 'An empty can', zh: '空罐头' } },
  { id: 'rag', icon: '🧦', names: { en: 'A soggy rag', zh: '湿破布' } },
  { id: 'weed', icon: '🌿', names: { en: 'Some seaweed', zh: '一团水草' } },
  { id: 'bottle', icon: '🍾', names: { en: 'An empty bottle', zh: '空瓶子' } }
];
// The pond gets tired: the first bites within an hour are real, after that more and more of them are junk, and
// every bite takes longer to come (on top of the hourly and daily limits in limits.js).
const FATIGUE = { free: 2, junkStep: 0.2, junkMax: 0.8, delayMs: 2500 };
/** Chance that the next bite is junk, after `recent` bites within the hour. */
const junkChance = (recent) => Math.min(FATIGUE.junkMax, Math.max(0, recent - FATIGUE.free + 1) * FATIGUE.junkStep);
/** Extra wait before the next bite, in ms. */
const biteDelay = (recent) => Math.max(0, recent) * FATIGUE.delayMs;

// The pond's rings set the difficulty (the window works out where a cast landed): shallow water (green, easy),
// then yellow, red, and the deep middle (purple) – the harder, the stronger the pull, the less time to react,
// and the rarer the bites.
const ZONES = [
  { name: 'easy',   pull: 1.05, bite: 1.0 },
  { name: 'normal', pull: 1.2,  bite: 0.8 },
  { name: 'hard',   pull: 1.35, bite: 0.7 },
  { name: 'master', pull: 1.5,  bite: 0.6 }
];
const zoneOf = (zone) => Math.max(0, Math.min(ZONES.length - 1, Math.round(Number(zone) || 0)));
// tier weights (common, uncommon, rare, very rare) by zone
const TIER_WEIGHTS = [[62, 29, 8, 1], [47, 36, 14, 3], [36, 40, 19, 5], [22, 40, 26, 12]];

/** Tier weights for a cast that landed in `zone` (0 shallow … 3 the deep middle). */
function tierWeights(zone) {
  return TIER_WEIGHTS[zoneOf(zone)];
}

function pickWeighted(weights, rnd) {
  let r = rnd() * weights.reduce((s, w) => s + w, 0);
  for (let i = 0; i < weights.length; i++) { if ((r -= weights[i]) < 0) return i; }
  return weights.length - 1;
}

/**
 * Something bites. `caught`: dex numbers already in the fishing Pokédex (they turn up more often). Returns what the window needs to play it out – the species stays secret until it's landed:
 * { tier, bite (ms to react), pull (how hard it fights), hidden: { dex, size, shiny } }
 */
function bite(zoneIndex, rnd = Math.random, caught = new Set(), recent = 0) {
  const depth = zoneOf(zoneIndex);
  const zone = ZONES[depth];
  if (junkChance(recent) > 0 && rnd() < junkChance(recent)) {
    const junk = JUNK[Math.floor(rnd() * JUNK.length)];
    return { tier: 0, zone: zoneOf(depth), junk: true, bite: 1200, pull: 0.6, hidden: { junk: junk.id } };
  }
  const tier = pickWeighted(tierWeights(depth), rnd);
  const pool = FISH.filter((f) => f.tier === tier);
  const fish = pool[pickWeighted(pool.map((f) => (caught.has(f.dex) ? REPEAT_WEIGHT : 1)), rnd)];
  const size = Math.round(fish.height * 10 * (0.7 + rnd() * 0.7));   // cm, 70 %–140 % of the usual height
  return {
    tier, zone: zoneOf(depth),
    bite: Math.round(TIERS[tier].bite * zone.bite), pull: TIERS[tier].pull * zone.pull,
    hidden: { dex: fish.dex, size, shiny: rnd() < SHINY_RATE }
  };
}

/** Land a catch: record it in the fishing Pokédex and work out the rewards. Mutates data. */
function land(data, catchInfo, now = Date.now(), rnd = Math.random) {
  if (catchInfo.junk) {
    const junk = JUNK.find((j) => j.id === catchInfo.junk);
    if (!junk) return null;
    data.stats.fishJunk = (data.stats.fishJunk || 0) + 1;
    return { junk: junk.id, icon: junk.icon, names: junk.names, berries: 0, xp: 0 };
  }
  const fish = FISH.find((f) => f.dex === catchInfo.dex);
  if (!fish) return null;
  const tier = TIERS[fish.tier];
  const entry = data.fishdex[fish.dex] || null;
  const isNew = !entry;
  const best = !entry || catchInfo.size > entry.best;
  data.fishdex[fish.dex] = {
    caught: (entry ? entry.caught : 0) + 1,
    first: entry ? entry.first : now,
    best: Math.max(entry ? entry.best : 0, catchInfo.size),
    shiny: !!(entry && entry.shiny) || !!catchInfo.shiny
  };
  const berries = tier.berries + (isNew ? NEW_SPECIES_BONUS : 0);
  data.berries = (data.berries || 0) + berries;
  data.stats.fishCaught = (data.stats.fishCaught || 0) + 1;
  return {
    dex: fish.dex, names: fish.names, tier: fish.tier, size: catchInfo.size, shiny: !!catchInfo.shiny,
    isNew, best: best && !isNew, berries, xp: tier.xp,
    wantsToJoin: rnd() < JOIN_CHANCE[fish.tier]
  };
}

module.exports = { FISH, JUNK, FATIGUE, junkChance, biteDelay, TIERS, ZONES, SHINY_RATE, REPEAT_WEIGHT, NEW_SPECIES_BONUS, JOIN_CHANCE, zoneOf, tierWeights, bite, land };
