// Growth: levels, passive growth while the app runs, hatching and evolution.
//
// Levels follow the games' "medium fast" curve (XP = level³, up to Lv100), and Pokémon evolve at the level they
// do in the games (PokeAPI; stones, trades and friendship count as Lv30) – but never sooner than a week after
// joining, and two weeks after the previous evolution, so raising one takes a while.
//
// After QQ Pet's growth rate: a happy, healthy, fed and clean pet grows at full speed; a sad, ill,
// hungry or dirty one more slowly (the penalties are QQ Pet's, out of its base rate of 260).

const BASE_XP_PER_HOUR = 4;        // passive growth at full speed, on top of Pomodoros and to-dos
const HATCH_LEVEL = 5;             // an egg hatches at this level (QQ Pet: egg → kid at Lv5) …
const FIRST_HATCH_LEVEL = 2;       // … except the very first egg, which hatches after one level
const SHINY_RATE = 1 / 4096;       // as in the games (see shiny.js for the guarantee)
const MAX_LEVEL = 100;
const EVOLVE_FALLBACK = 30;        // evolutions without a level in the games (stones, trades, friendship …)
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

/** The level an evolution option needs: the games' level, or the fallback for stones, trades etc. */
const optionLevel = (o) => (o && o.level) || EVOLVE_FALLBACK;

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
  levelOf, xpFor, optionLevel, growthRate, grow, hatchLevel, readyToHatch, evolutionDue, evolveNotBefore
};
