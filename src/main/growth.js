// Growth: levels, passive growth while the app runs, hatching and evolution.
//
// Levels follow the games' "medium fast" curve (XP = level³, up to Lv100), and Pokémon evolve at the level they
// do in the games (PokeAPI) – but never sooner than a week after joining, and two weeks after the previous evolution,
// so raising one takes a while. As in the games, some need an evolution stone or a Linking Cord (for trade evolutions:
// there's no one to trade with), and some a close friendship; the rest without a level count as Lv30.
//
// After QQ Pet's growth rate: a happy, healthy, fed and clean pet grows at full speed; a sad, ill,
// hungry or dirty one more slowly (the penalties are QQ Pet's, out of its base rate of 260).

const BASE_XP_PER_HOUR = 4;        // passive growth at full speed, on top of Pomodoros and to-dos
const HATCH_LEVEL = 5;             // an egg hatches at this level (QQ Pet: egg → kid at Lv5) …
const FIRST_HATCH_LEVEL = 2;       // … except the very first egg, which hatches after one level
const SHINY_RATE = 1 / 4096;       // as in the games (see shiny.js for the guarantee)
const MAX_LEVEL = 100;
const EVOLVE_FALLBACK = 30;        // other evolutions without a level in the games (a place, a move, a time of day …)
const NOT_BY_LEVEL = MAX_LEVEL + 1; // evolveAt for a Pokémon that only evolves with an item (or friendship still to grow)
// friendship as in the games: 70 when it joins, 220 for friendship evolutions (Pichu, Golbat, Eevee …), at most 255
const FRIEND_START = 70, FRIEND_EVOLVE = 220, FRIEND_MAX = 255;
// evolution items in the shop (care.js ITEMS, kind 'evo') ← PokeAPI's item names
const EVO_ITEMS = {
  'fire-stone': 'firestone', 'water-stone': 'waterstone', 'thunder-stone': 'thunderstone', 'leaf-stone': 'leafstone',
  'moon-stone': 'moonstone', 'sun-stone': 'sunstone', 'shiny-stone': 'shinystone', 'dusk-stone': 'duskstone',
  'dawn-stone': 'dawnstone', 'ice-stone': 'icestone'
};
const TRADE_ITEM = 'linkingcord';   // trade evolutions (as in Legends: Arceus)
const EVOLVE_MIN_DAYS = [7, 14];   // days with you before the first evolution / since the previous one
const EVOLVE_SNOOZE_H = 6;         // "later" → ask again after this many hours

/** XP needed to reach `level` (Lv1 = 0). */
function xpFor(level) {
  const l = Math.max(1, Math.min(MAX_LEVEL, Math.floor(level)));
  return l * l * l - 1;
}

function levelOf(xp) {
  xp = Math.max(0, xp || 0);
  let l = Math.max(1, Math.min(MAX_LEVEL, Math.floor(Math.cbrt(xp + 1) + 1e-9)));
  while (l < MAX_LEVEL && xpFor(l + 1) <= xp) l++;
  while (l > 1 && xpFor(l) > xp) l--;
  return l;
}

/**
 * How an evolution option (sources.js evolutionOptions) is reached: 'level', 'item' (a stone from the shop), 'trade'
 * (a Linking Cord), 'friendship', or 'other' (Lv30). Options saved by older versions only have a level.
 */
function wayOf(o) {
  if (!o) return 'other';
  if (o.how === 'item') return EVO_ITEMS[o.item] ? 'item' : 'other';
  if (o.how === 'trade' || o.how === 'friendship') return o.how;
  return o.level ? 'level' : 'other';
}

/** The item that triggers an option (a stone or the Linking Cord), or null. */
function itemFor(o) {
  const way = wayOf(o);
  return way === 'item' ? EVO_ITEMS[o.item] : way === 'trade' ? TRADE_ITEM : null;
}

/**
 * The level an evolution option needs when levelling up: the games' level, the fallback for the rest without one, and
 * NOT_BY_LEVEL for items – and for friendship evolutions until the friendship (the pet's) is close enough.
 */
function optionLevel(o, friendship = FRIEND_EVOLVE) {
  const way = wayOf(o);
  if (way === 'level') return o.level;
  if (way === 'item' || way === 'trade') return NOT_BY_LEVEL;
  if (way === 'friendship') return friendship >= FRIEND_EVOLVE ? Math.max(1, o.level || 1) : NOT_BY_LEVEL;
  return EVOLVE_FALLBACK;
}

const friendshipOf = (pet) => (typeof pet.friendship === 'number' ? pet.friendship : FRIEND_START);

/** Closer friends (fractions add up). Returns true when it just became close enough for a friendship evolution. */
function befriend(pet, n) {
  const before = friendshipOf(pet);
  pet.friendship = Math.max(0, Math.min(FRIEND_MAX, before + n));
  return before < FRIEND_EVOLVE && pet.friendship >= FRIEND_EVOLVE;
}

function moodPenalty(mood) {
  if (mood >= 90) return 0;
  if (mood >= 70) return 20;
  if (mood >= 50) return 70;
  if (mood >= 30) return 100;
  if (mood >= 10) return 140;
  return 180;
}

const STAGE_PENALTY = [0, 30, 80, 120];   // by status stage 0 (none) … 3

/** 0…1: how fast the pet grows right now. */
function growthRate(pet, care) {
  if (!care || care.fainted) return 0;
  let p = moodPenalty(pet.mood);
  p += STAGE_PENALTY[care.status ? care.status.stage : 0] || 0;
  if (care.hunger < 25 || care.clean < 25) p += 80;
  return Math.max(0, (260 - p) / 260);
}

/**
 * Passive growth for `hours` of the app running. Fractions are kept in pet.growAcc so slow growth
 * still adds up. Returns the whole XP points gained.
 */
function grow(pet, care, hours) {
  pet.growAcc = (pet.growAcc || 0) + BASE_XP_PER_HOUR * growthRate(pet, care) * hours;
  const whole = Math.floor(pet.growAcc + 1e-9);   // 60 × (4/60) must add up to 4, not 3.999…
  pet.growAcc -= whole;
  pet.xp += whole;
  return whole;
}

/** The level eggs hatch at: Lv2 for the first egg ever, Lv5 after that. */
function hatchLevel(data) {
  return (data.stats.hatches || 0) > 0 ? HATCH_LEVEL : FIRST_HATCH_LEVEL;
}

/** An egg old enough to hatch? */
function readyToHatch(pet, level = HATCH_LEVEL) {
  return pet.stage === 'egg' && levelOf(pet.xp) >= level;
}

/**
 * Is an evolution due (level reached, not the last form, not snoozed)? The options themselves come
 * from PokeAPI (see sources.js evolutionOptions).
 */
function evolutionDue(pet, now = Date.now()) {
  if (pet.stage !== 'hatched' || pet.finalForm || typeof pet.evolveAt !== 'number') return false;
  if (levelOf(pet.xp) < pet.evolveAt) return false;
  if (now < evolveNotBefore(pet)) return false;
  return !(pet.evolution && pet.evolution.snoozeUntil > now);
}

/** The earliest time it may evolve: a week after joining, two weeks after its last evolution. */
function evolveNotBefore(pet) {
  const since = pet.evolvedAt || pet.hatchedAt || pet.born || 0;
  return since + EVOLVE_MIN_DAYS[Math.min(1, pet.evolutions || 0)] * 86400e3;
}

module.exports = {
  BASE_XP_PER_HOUR, HATCH_LEVEL, FIRST_HATCH_LEVEL, SHINY_RATE, MAX_LEVEL, EVOLVE_FALLBACK, EVOLVE_MIN_DAYS, EVOLVE_SNOOZE_H,
  NOT_BY_LEVEL, FRIEND_START, FRIEND_EVOLVE, FRIEND_MAX, EVO_ITEMS, TRADE_ITEM,
  levelOf, xpFor, wayOf, itemFor, optionLevel, friendshipOf, befriend, growthRate, grow, hatchLevel, readyToHatch, evolutionDue, evolveNotBefore
};
