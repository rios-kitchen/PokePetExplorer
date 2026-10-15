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
const SHINY_RATE = 1 / 128;

/** Tier weights for a cast that landed at `depth` 0 (close to the pier) … 1 (far out). */
function tierWeights(depth) {
  const d = Math.max(0, Math.min(1, depth));
  return [60 - 30 * d, 28 + 10 * d, 10 + 14 * d, 2 + 6 * d];
}

function pickWeighted(weights, rnd) {
  let r = rnd() * weights.reduce((s, w) => s + w, 0);
  for (let i = 0; i < weights.length; i++) { if ((r -= weights[i]) < 0) return i; }
  return weights.length - 1;
}

/**
 * Something bites. Returns what the window needs to play it out – the species stays secret until it's landed:
 * { tier, bite (ms to react), pull (how hard it fights), hidden: { dex, size, shiny } }
 */
function bite(depth, rnd = Math.random) {
  const tier = pickWeighted(tierWeights(depth), rnd);
  const pool = FISH.filter((f) => f.tier === tier);
  const fish = pool[Math.floor(rnd() * pool.length)];
  const size = Math.round(fish.height * 10 * (0.7 + rnd() * 0.7));   // cm, 70 %–140 % of the usual height
  return { tier, bite: TIERS[tier].bite, pull: TIERS[tier].pull, hidden: { dex: fish.dex, size, shiny: rnd() < SHINY_RATE } };
}

/** Land a catch: record it in the fishing Pokédex and work out the rewards. Mutates data. */
function land(data, catchInfo, now = Date.now()) {
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
    isNew, best: best && !isNew, berries, xp: tier.xp
  };
}

module.exports = { FISH, TIERS, SHINY_RATE, NEW_SPECIES_BONUS, tierWeights, bite, land };
