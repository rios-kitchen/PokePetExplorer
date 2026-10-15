// Expeditions: QQ Pet's work / study / travel, Pokémon style. The pet leaves the desktop for a while
// (the timer keeps running while the app is closed) and comes back with berries, XP, contest stats
// and sometimes items – but hungrier, dirtier and maybe with a status condition from the dungeon.
//
//   dungeon  – explore a mystery dungeon: berries, toughness, items; hazards
//   training – a contest lesson: raises one stat (more at higher levels)
//   travel   – visit a region: a souvenir, a random stat, mood

const { petOf } = require('./store');
const { careOf, inflict } = require('./care');
const { levelOf } = require('./growth');

const REGIONS = ['kanto', 'johto', 'hoenn', 'sinnoh', 'unova', 'kalos', 'alola', 'galar', 'paldea'];

// cost: hunger / clean / mood lost on the way; need: level and contest stats; gain: stats
const EXPEDITIONS = {
  // ---- mystery dungeons
  woods:   { kind: 'dungeon', min: 30, level: 1,  cost: { hunger: 15, clean: 15, mood: 5 },
    berries: [2, 4], xp: 15, gain: { tough: 1 }, hazard: ['poison', 0.1], loot: 0.4 },
  cave:    { kind: 'dungeon', min: 45, level: 4,  cost: { hunger: 20, clean: 20, mood: 8 },
    berries: [3, 6], xp: 25, gain: { tough: 2, cool: 1 }, hazard: ['paralysis', 0.15], loot: 0.5 },
  volcano: { kind: 'dungeon', min: 60, level: 8,  need: { tough: 10 }, cost: { hunger: 25, clean: 30, mood: 10 },
    berries: [5, 9], xp: 40, gain: { tough: 3, cool: 2 }, hazard: ['burn', 0.2], loot: 0.6 },
  glacier: { kind: 'dungeon', min: 60, level: 8,  need: { tough: 10 }, cost: { hunger: 30, clean: 20, mood: 10 },
    berries: [5, 9], xp: 40, gain: { tough: 2, cute: 2 }, hazard: ['freeze', 0.2], loot: 0.6 },
  ruins:   { kind: 'dungeon', min: 90, level: 14, need: { smart: 20 }, cost: { hunger: 30, clean: 30, mood: 15 },
    berries: [8, 14], xp: 70, gain: { smart: 4, tough: 2 }, hazard: ['confusion', 0.2], loot: 0.8 },

  // ---- contest training (the more advanced the pet, the more it learns)
  coolClass:  { kind: 'training', min: 45, level: 1, cost: { hunger: 12, clean: 12, mood: 8 }, xp: 10, train: 'cool' },
  cuteClass:  { kind: 'training', min: 45, level: 1, cost: { hunger: 12, clean: 12, mood: 8 }, xp: 10, train: 'cute' },
  smartClass: { kind: 'training', min: 45, level: 1, cost: { hunger: 12, clean: 12, mood: 8 }, xp: 10, train: 'smart' },
  toughClass: { kind: 'training', min: 45, level: 1, cost: { hunger: 15, clean: 15, mood: 8 }, xp: 10, train: 'tough' },

  // ---- travel
  travel: { kind: 'travel', min: 60, level: 5, cost: { hunger: 20, clean: 15, mood: -10 },
    berries: [2, 5], xp: 20, loot: 0.3 }
};

// what a dungeon or a trip can turn up (QQ Pet: mostly food and everyday things, some medicine)
const LOOT = [['oran', 30], ['puff', 15], ['antidote', 10], ['parlyz', 10], ['burnheal', 8],
  ['iceheal', 8], ['persim', 8], ['candy', 6], ['fullheal', 3], ['revive', 2]];

const pickWeighted = (list, rnd) => {
  let r = rnd() * list.reduce((s, [, w]) => s + w, 0);
  for (const [v, w] of list) { if ((r -= w) < 0) return v; }
  return list[list.length - 1][0];
};
const between = ([a, b], rnd) => a + Math.floor(rnd() * (b - a + 1));

/** Can `petId` go on expedition `expId` now? Returns null or the reason why not. */
function blocker(data, petId, expId) {
  const exp = EXPEDITIONS[expId];
  if (!exp) return 'unknown';
  if (data.expedition) return 'busy';
  const pet = petOf(data, petId);
  const care = careOf(data, petId);
  if (pet.stage === 'egg') return 'egg';
  if (care.fainted || care.status || care.sick) return 'unwell';
  if (care.hunger < 30) return 'hungry';
  if (care.clean < 30) return 'dirty';
  if (levelOf(pet.xp) < exp.level) return 'level';
  for (const [a, v] of Object.entries(exp.need || {})) if ((pet.attrs[a] || 0) < v) return 'stats';
  return null;
}

function start(data, petId, expId, now = Date.now()) {
  const reason = blocker(data, petId, expId);
  if (reason) return { ok: false, reason };
  const exp = EXPEDITIONS[expId];
  data.expedition = { petId, id: expId, kind: exp.kind, startAt: now, endsAt: now + exp.min * 60e3 };
  return { ok: true, expedition: data.expedition };
}

/** Is the given pet away right now? */
const isAway = (data, petId) => !!(data.expedition && data.expedition.petId === petId);

/**
 * Bring the pet back if its time is up (or `force`). Applies costs and rewards.
 * Returns null (still away / nothing to do) or a summary for the pet's bubble and the panel.
 */
function finish(data, now = Date.now(), { force = false, rnd = Math.random } = {}) {
  const e = data.expedition;
  if (!e || (!force && now < e.endsAt)) return null;
  data.expedition = null;
  const exp = EXPEDITIONS[e.id];
  const pet = petOf(data, e.petId);
  const care = careOf(data, e.petId);
  const out = { petId: e.petId, id: e.id, kind: e.kind, berries: 0, xp: 0, gain: {}, items: [], status: null, region: null };
  if (!exp) return out;

  const clamp = (v) => Math.max(0, Math.min(100, v));
  care.hunger = clamp(care.hunger - exp.cost.hunger);
  care.clean = clamp(care.clean - exp.cost.clean);
  pet.mood = clamp(pet.mood - exp.cost.mood);

  out.berries = exp.berries ? between(exp.berries, rnd) : 0;
  data.berries = (data.berries || 0) + out.berries;
  out.xp = exp.xp || 0;

  const gain = { ...(exp.gain || {}) };
  if (exp.train) gain[exp.train] = (gain[exp.train] || 0) + 3 + Math.floor(levelOf(pet.xp) / 5);
  if (exp.kind === 'travel') {
    const attrs = Object.keys(pet.attrs);
    const a = attrs[Math.floor(rnd() * attrs.length)];
    gain[a] = (gain[a] || 0) + 2;
    out.region = REGIONS[Math.floor(rnd() * REGIONS.length)];
    data.souvenirs.push({ id: `s${now.toString(36)}`, region: out.region, petId: e.petId, at: now });
  }
  for (const [a, v] of Object.entries(gain)) pet.attrs[a] = (pet.attrs[a] || 0) + v;
  out.gain = gain;

  if (exp.loot && rnd() < exp.loot) {
    const item = pickWeighted(LOOT, rnd);
    data.inventory[item] = (data.inventory[item] || 0) + 1;
    out.items.push(item);
  }
  // a wild Pokémon may follow it home – the happier the pet, the more it trusts its trainer
  out.companion = exp.kind !== 'training' && rnd() < companionChance(pet.mood);
  if (exp.hazard && rnd() < exp.hazard[1]) {
    inflict(care, exp.hazard[0], now);
    if (care.status) care.status.known = true;   // you can see what the dungeon did
    out.status = exp.hazard[0];
  }
  return out;
}

/** Chance (0…1) that a wild Pokémon follows the pet home, from its mood 0…100. */
const companionChance = (mood) => 0.01 + 0.07 * Math.max(0, Math.min(100, mood)) / 100;

/** Call off an expedition early: the pet comes straight back, without rewards. */
function recall(data) {
  const e = data.expedition;
  data.expedition = null;
  return e;
}

module.exports = { EXPEDITIONS, REGIONS, LOOT, blocker, start, isAway, finish, recall, companionChance };
