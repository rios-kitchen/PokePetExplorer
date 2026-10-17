// QQ-Pet-style care: hunger, cleanliness, health, status conditions. Berries are the currency
// (earned with Pomodoros, finished to-dos and expeditions) and buy food and medicine.
//
// Sickness follows QQ Pet's disease chains, as Pokémon status conditions: neglect causes one
// (dirty → poison, hungry → paralysis, sad → confusion; expeditions can burn or freeze), it gets
// worse in stages 1–3 when left untreated, and after stage 3 the pet faints. Only the matching
// medicine (or a Full Heal) cures it – the wrong one makes it a stage worse. Which condition it is
// stays hidden until the pet is diagnosed (like QQ Pet's doctor), so medicine is a guess before that.
const { petOf } = require('./store');

const ITEMS = {
  oran:     { kind: 'food', cost: 1, hunger: 25, mood: 3 },
  puff:     { kind: 'food', cost: 2, hunger: 15, mood: 15 },
  candy:    { kind: 'food', cost: 20, hunger: 5, mood: 5, xp: 50 },
  bath:     { kind: 'bath', cost: 0, mood: 6 },
  potion:   { kind: 'med', cost: 3, health: 45, mood: 5 },                       // health only
  antidote: { kind: 'med', cost: 3, cures: 'poison', health: 20, mood: 5 },
  parlyz:   { kind: 'med', cost: 3, cures: 'paralysis', health: 20, mood: 5 },
  burnheal: { kind: 'med', cost: 3, cures: 'burn', health: 20, mood: 5 },
  iceheal:  { kind: 'med', cost: 3, cures: 'freeze', health: 20, mood: 5 },
  persim:   { kind: 'med', cost: 3, cures: 'confusion', health: 20, mood: 5 },
  fullheal: { kind: 'med', cost: 8, cures: 'all', health: 30, mood: 5 },
  revive:   { kind: 'revive', cost: 8, health: 50, mood: 5 },
  pokeball:  { kind: 'ball', cost: 10 },    // battle only (catching)
  greatball: { kind: 'ball', cost: 20 },
  ultraball: { kind: 'ball', cost: 40 },
  // held items (battle.HELD): given to a Pokémon to hold in battles, in the Pokémon tab
  leftovers: { kind: 'held', cost: 30 },
  sitrus: { kind: 'held', cost: 6 },
  lum: { kind: 'held', cost: 8 },
  cheri: { kind: 'held', cost: 3 },
  chesto: { kind: 'held', cost: 3 },
  pecha: { kind: 'held', cost: 3 },
  rawst: { kind: 'held', cost: 3 },
  aspear: { kind: 'held', cost: 3 },
  focussash: { kind: 'held', cost: 25 },
  quickclaw: { kind: 'held', cost: 15 },
  scopelens: { kind: 'held', cost: 15 },
  brightpowder: { kind: 'held', cost: 15 },
  lifeorb: { kind: 'held', cost: 35 },
  expertbelt: { kind: 'held', cost: 25 },
  choiceband: { kind: 'held', cost: 35 },
  choicespecs: { kind: 'held', cost: 35 },
  choicescarf: { kind: 'held', cost: 35 },
  muscleband: { kind: 'held', cost: 15 },
  wiseglasses: { kind: 'held', cost: 15 },
  shellbell: { kind: 'held', cost: 20 },
  blacksludge: { kind: 'held', cost: 20 },
  damprock: { kind: 'held', cost: 10 },
  heatrock: { kind: 'held', cost: 10 },
  smoothrock: { kind: 'held', cost: 10 },
  icyrock: { kind: 'held', cost: 10 },
  terrainextender: { kind: 'held', cost: 10 },
  bindingband: { kind: 'held', cost: 10 },
  gripclaw: { kind: 'held', cost: 10 },
  silkscarf: { kind: 'held', cost: 15 },
  charcoal: { kind: 'held', cost: 15 },
  mysticwater: { kind: 'held', cost: 15 },
  miracleseed: { kind: 'held', cost: 15 },
  magnet: { kind: 'held', cost: 15 },
  nevermeltice: { kind: 'held', cost: 15 },
  blackbelt: { kind: 'held', cost: 15 },
  poisonbarb: { kind: 'held', cost: 15 },
  softsand: { kind: 'held', cost: 15 },
  sharpbeak: { kind: 'held', cost: 15 },
  twistedspoon: { kind: 'held', cost: 15 },
  silverpowder: { kind: 'held', cost: 15 },
  hardstone: { kind: 'held', cost: 15 },
  spelltag: { kind: 'held', cost: 15 },
  dragonfang: { kind: 'held', cost: 15 },
  blackglasses: { kind: 'held', cost: 15 },
  metalcoat: { kind: 'held', cost: 15 },
  fairyfeather: { kind: 'held', cost: 15 }
};

const REWARD = { pomodoro: 3, todo: 1, daily: 2 };
const DIAGNOSE_COST = 1;

const STATUSES = ['poison', 'paralysis', 'burn', 'freeze', 'confusion'];
const MAX_STAGE = 3;
const STAGE_HOURS = 6;   // an untreated status gets a stage worse every 6 hours

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

/** Give the pet a status condition (or make the current one a stage worse). Returns the events. */
function inflict(care, id, now = Date.now()) {
  if (care.fainted) return [];
  if (care.status) return worsen(care, now);
  care.status = { id, stage: 1, known: false, since: now, nextAt: now + STAGE_HOURS * 3600e3 };
  care.sick = true;
  return ['status'];
}

function worsen(care, now = Date.now()) {
  if (!care.status) return [];
  if (care.status.stage >= MAX_STAGE) return faint(care);
  care.status.stage += 1;
  care.status.nextAt = now + STAGE_HOURS * 3600e3;
  return ['worse'];
}

function faint(care) {
  if (care.fainted) return [];
  care.fainted = true;
  care.sick = true;
  care.health = 0;
  return ['fainted'];
}

/**
 * Let time pass for the active pet.
 * @returns {{moodDelta:number, events:string[]}} events: 'worse' | 'fainted'
 */
function decay(care, hours, { asleep = false, poops = 0, now = Date.now() } = {}) {
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
  else if (care.status) care.health -= 2 * care.status.stage * hours;
  else if (!care.sick) care.health += 4 * hours;
  if (care.pooped) care.health -= 4 * hours;
  care.health = clamp(care.health);

  // untreated status conditions get worse over time (several stages if a long time passed)
  while (care.status && !care.fainted && now >= care.status.nextAt) {
    const at = care.status.nextAt;
    events.push(...worsen(care, at));
  }
  if (care.health <= 0) events.push(...faint(care));
  return { moodDelta, events };
}

/**
 * Chance per minute to come down with a status condition, from the pet's condition (QQ Pet: being
 * hungry, dirty or sad makes it ill). Returns the new status id or null.
 */
function rollStatus(care, mood, minutes = 1, rnd = Math.random) {
  if (care.status || care.fainted) return null;
  const causes = [];
  if (care.clean < 25 || care.pooped) causes.push(['poison', 0.004]);
  if (care.hunger < 25) causes.push(['paralysis', 0.004]);
  if (mood < 30) causes.push(['confusion', 0.003]);
  // low health makes any of them likelier
  const weak = care.health < 60 ? ((60 - care.health) / 60) * 0.01 : 0;
  let p = 0.0002 + weak + causes.reduce((s, [, c]) => s + c, 0);
  p = 1 - Math.pow(1 - Math.min(p, 1), minutes);
  if (rnd() >= p) return null;
  const pool = causes.length ? causes.map(([id]) => id) : ['poison', 'paralysis', 'confusion'];
  const id = pool[Math.floor(rnd() * pool.length)];
  inflict(care, id);
  return id;
}

/** Take an item from the inventory if there is one, else pay with berries. */
function pay(data, itemId, item) {
  const inv = data.inventory || (data.inventory = {});
  if (inv[itemId] > 0) {
    inv[itemId] -= 1;
    if (!inv[itemId]) delete inv[itemId];
    return true;
  }
  if ((data.berries || 0) < item.cost) return false;
  data.berries -= item.cost;
  return true;
}

/**
 * Use an item. Mutates data. Returns { ok, reason?, item, kind, cured?, wrong?, events? }.
 * reasons: 'unknown' | 'berries' | 'full' | 'clean' | 'healthy' | 'fainted' | 'notFainted'
 */
function useItem(data, id, itemId) {
  const item = ITEMS[itemId];
  if (!item) return { ok: false, reason: 'unknown' };
  if (item.kind === 'ball') return { ok: false, reason: 'battleOnly' };
  if (item.kind === 'held') return { ok: false, reason: 'holdOnly' };
  const care = careOf(data, id);
  if (care.fainted && item.kind !== 'revive') return { ok: false, reason: 'fainted' };
  if (item.kind === 'revive' && !care.fainted) return { ok: false, reason: 'notFainted' };
  if (item.kind === 'food' && care.hunger > 95) return { ok: false, reason: 'full' };
  if (item.kind === 'bath' && care.clean > 92 && !care.pooped) return { ok: false, reason: 'clean' };
  if (item.kind === 'med') {
    // status medicine without a status, or a Potion at full health: nothing to do
    if (item.cures ? !care.status && !(care.sick && item.cures === 'all') : care.health > 90) {
      return { ok: false, reason: 'healthy' };
    }
  }
  if (!pay(data, itemId, item)) return { ok: false, reason: 'berries' };

  const res = { ok: true, item, kind: item.kind };
  if (item.kind === 'food') care.hunger = clamp(care.hunger + item.hunger);
  if (item.kind === 'bath') { care.clean = 100; care.pooped = false; }
  if (item.kind === 'revive') {
    Object.assign(care, { fainted: false, sick: false, status: null, health: item.health });
    res.cured = true;
  }
  if (item.kind === 'med') {
    if (!item.cures) {
      care.health = clamp(care.health + item.health);
    } else if (item.cures === 'all' || (care.status && care.status.id === item.cures)) {
      care.status = null;
      care.sick = false;
      care.health = clamp(care.health + item.health);
      res.cured = true;
    } else {
      res.wrong = true;
      res.events = worsen(care);
    }
  }
  return res;
}

/** Find out which status condition the pet has. Returns { ok, reason?, status }. */
function diagnose(data, id) {
  const care = careOf(data, id);
  if (!care.status) return { ok: false, reason: 'healthy' };
  if (care.status.known) return { ok: true, status: care.status };
  if ((data.berries || 0) < DIAGNOSE_COST) return { ok: false, reason: 'berries' };
  data.berries -= DIAGNOSE_COST;
  care.status.known = true;
  return { ok: true, status: care.status };
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

const CURE = { poison: 'antidote', paralysis: 'parlyz', burn: 'burnheal', freeze: 'iceheal', confusion: 'persim' };

/**
 * The item that helps with a need (for the pet's "help me" buttons): null for an undiagnosed status –
 * then the pet asks to see a doctor instead.
 */
function remedyFor(care, need) {
  if (need === 'fainted') return 'revive';
  if (need === 'sick') {
    if (!care.status) return 'fullheal';
    return care.status.known ? CURE[care.status.id] : null;
  }
  if (need === 'hungry') return 'oran';
  return 'bath';
}

module.exports = {
  ITEMS, REWARD, STATUSES, MAX_STAGE, STAGE_HOURS, DIAGNOSE_COST, CURE,
  freshCare, careOf, inflict, worsen, decay, rollStatus, useItem, diagnose, urgentNeed, remedyFor
};
