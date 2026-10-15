// QQ-Pet-style care: hunger, cleanliness, health, sickness. Berries are the currency
// (earned with Pomodoros and finished to-dos) and buy food and medicine.
const { petOf } = require('./store');

const ITEMS = {
  oran:   { kind: 'food', cost: 1, hunger: 25, mood: 3 },
  puff:   { kind: 'food', cost: 2, hunger: 15, mood: 15 },
  candy:  { kind: 'food', cost: 5, hunger: 5, mood: 5, xp: 40 },
  bath:   { kind: 'bath', cost: 0, mood: 6 },
  potion: { kind: 'med', cost: 3, health: 45, mood: 5 }
};

const REWARD = { pomodoro: 3, todo: 1, daily: 2 };

// status: null or a status condition id (poison, paralysis, burn, freeze, confusion), each cured by
// its own medicine – filled in by the raising rules; `sick` stays the general "unwell" flag.
function freshCare() {
  return { hunger: 80, clean: 85, health: 100, sick: false, fainted: false, status: null };
}

function careOf(data, id) {
  const pet = petOf(data, id);
  if (!pet.care) pet.care = freshCare();
  else if (pet.care.status === undefined) pet.care.status = null;
  return pet.care;
}

const clamp = (v) => Math.max(0, Math.min(100, v));

/**
 * Let time pass for the active pet.
 * @returns {{moodDelta:number, events:string[]}} events: 'sick' | 'fainted'
 */
function decay(care, hours, { asleep = false, poops = 0 } = {}) {
  const f = asleep ? 0.5 : 1;
  const events = [];
  care.hunger = clamp(care.hunger - 5 * f * hours);
  care.clean = clamp(care.clean - 3 * f * hours);

  let moodDelta = -8 * f * hours;
  if (care.hunger < 25) moodDelta -= 4 * hours;
  if (care.clean < 25) moodDelta -= 3 * hours;
  if (care.sick) moodDelta -= 5 * hours;
  // droppings left on the screen smell, and a pet that pooped and wasn't bathed feels miserable
  if (poops > 0) {
    moodDelta -= 2 * poops * hours;
    care.clean = clamp(care.clean - 2 * poops * hours);
  }
  if (care.pooped) moodDelta -= 5 * hours;

  if (care.hunger < 15 || care.clean < 15) care.health -= 8 * hours;
  else if (care.sick) care.health -= 3 * hours;
  else care.health += 4 * hours;
  if (care.pooped) care.health -= 4 * hours;   // over time this makes it sick
  care.health = clamp(care.health);

  if (care.health <= 0 && !care.fainted) {
    care.fainted = true;
    care.sick = true;
    events.push('fainted');
  }
  return { moodDelta, events };
}

/** Chance per minute to catch a cold when health is low. */
function rollSickness(care) {
  if (care.sick || care.health >= 60) return false;
  const p = ((60 - care.health) / 60) * 0.03;
  if (Math.random() < p) { care.sick = true; return true; }
  return false;
}

/**
 * Use an item. Mutates data. Returns { ok, reason?, effect? }.
 * reasons: 'unknown' | 'berries' | 'full' | 'clean' | 'healthy' | 'fainted'
 */
function useItem(data, id, itemId) {
  const item = ITEMS[itemId];
  if (!item) return { ok: false, reason: 'unknown' };
  const care = careOf(data, id);
  if (care.fainted && item.kind !== 'med') return { ok: false, reason: 'fainted' };
  if (item.kind === 'food' && care.hunger > 95) return { ok: false, reason: 'full' };
  if (item.kind === 'bath' && care.clean > 92 && !care.pooped) return { ok: false, reason: 'clean' };
  if (item.kind === 'med' && !care.sick && care.health > 90) return { ok: false, reason: 'healthy' };
  if ((data.berries || 0) < item.cost) return { ok: false, reason: 'berries' };

  data.berries -= item.cost;
  if (item.kind === 'food') care.hunger = clamp(care.hunger + item.hunger);
  if (item.kind === 'bath') { care.clean = 100; care.pooped = false; }
  if (item.kind === 'med') {
    care.health = clamp(Math.max(care.health, 10) + item.health);
    care.sick = false;
    care.fainted = false;
  }
  return { ok: true, item, kind: item.kind };
}

/** The most urgent need, for the pet to complain about. */
function urgentNeed(care) {
  if (care.fainted) return 'fainted';
  if (care.sick) return 'sick';
  if (care.pooped) return 'pooped';
  if (care.hunger < 25) return 'hungry';
  if (care.clean < 25) return 'dirty';
  return null;
}

module.exports = { ITEMS, REWARD, freshCare, careOf, decay, rollSickness, useItem, urgentNeed };
