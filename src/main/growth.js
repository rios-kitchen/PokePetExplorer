// Growth: levels, passive growth while the app runs, hatching and evolution.
//
// After QQ Pet's growth rate: a happy, healthy, fed and clean pet grows at full speed; a sad, ill,
// hungry or dirty one more slowly (the penalties are QQ Pet's, out of its base rate of 260).

const BASE_XP_PER_HOUR = 4;        // passive growth at full speed, on top of Pomodoros and to-dos
const HATCH_LEVEL = 5;             // an egg hatches at this level (QQ Pet: egg → kid at Lv5)
const EVOLVE_LEVELS = [12, 24];    // first and second evolution (asked, never forced)
const EVOLVE_SNOOZE_H = 6;         // "later" → ask again after this many hours

function levelOf(xp) { return 1 + Math.floor(Math.sqrt((xp || 0) / 25)); }

/** XP needed to reach `level`. */
function xpFor(level) { return 25 * (level - 1) * (level - 1); }

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

/** An egg old enough to hatch? */
function readyToHatch(pet) {
  return pet.stage === 'egg' && levelOf(pet.xp) >= HATCH_LEVEL;
}

/**
 * Is an evolution due (level reached, not the last form, not snoozed)? The options themselves come
 * from PokeAPI (see sources.js evolutionOptions).
 */
function evolutionDue(pet, now = Date.now()) {
  if (pet.stage !== 'hatched' || pet.finalForm) return false;
  const need = EVOLVE_LEVELS[pet.evolutions || 0];
  if (!need || levelOf(pet.xp) < need) return false;
  return !(pet.evolution && pet.evolution.snoozeUntil > now);
}

module.exports = {
  BASE_XP_PER_HOUR, HATCH_LEVEL, EVOLVE_LEVELS, EVOLVE_SNOOZE_H,
  levelOf, xpFor, growthRate, grow, readyToHatch, evolutionDue
};
