// Tiny JSON store in the app's userData folder (local only).
const fs = require('fs');
const path = require('path');

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// 1 = PokePet; 2 = PokePet Plus (mood per pet, raising fields)
const VERSION = 2;

const ATTRS = ['cool', 'cute', 'smart', 'tough'];   // contest-style stats, raised by expeditions and items

function defaults(lang) {
  return {
    version: VERSION,
    settings: {
      lang,
      pokemon: 'pikachu',
      scale: 3,
      walk: true,
      sound: true,
      reactInput: true,
      reminderMin: 30,
      launchAtLogin: false,
      petPos: null,
      petHidden: false
    },
    pomodoro: { focus: 25, short: 5, long: 15, longEvery: 4, autoBreak: true },
    todos: [],
    pets: {},     // id -> pet record, see freshPet()
    custom: [],   // added Pokémon: { id, dex, names: {en, zh} }
    skins: {},    // id -> sprite source meta (see sources.js)
    berries: 10,
    poops: [],    // droppings on the screen: { id, x, y, at }
    poopDueAt: null,
    lastRewardDay: null,
    lastSeen: null,
    diary: null,
    stats: { day: today(), todayPomos: 0, totalPomos: 0, focusMinutes: 0, todosDone: 0, todayTodos: 0 },

    // ---- raising (PokePet Plus)
    inventory: {},      // itemId -> count (bought in the shop, used later)
    expedition: null,   // { petId, kind: 'dungeon' | 'travel', dest, startAt, endsAt } while a pet is away
    daily: { day: null, signedIn: false, streak: 0, lastSignDay: null, tasks: [] },
                        // tasks: [{ id, kind, goal, progress, reward, claimed }], rolled each day
    achievements: {},   // id -> time unlocked (ms)
    fishdex: {},        // dex -> { caught, first (ms), best (size) }
    souvenirs: []       // { id, region, at } brought back from travels
  };
}

/** A new pet record. `stage` is 'egg' until it hatches; Pokémon picked directly start 'hatched'. */
function freshPet(stage = 'hatched') {
  return {
    xp: 0,
    mood: 80,
    stage,
    attrs: Object.fromEntries(ATTRS.map((a) => [a, 0])),
    born: Date.now()
    // care: added by care.js (careOf)
  };
}

/** A pet's record, created if missing and completed with fields added in newer versions. */
function petOf(data, id) {
  const pet = data.pets[id] || (data.pets[id] = freshPet());
  const fresh = freshPet();
  for (const k of Object.keys(fresh)) if (pet[k] === undefined) pet[k] = fresh[k];
  for (const a of ATTRS) if (typeof pet.attrs[a] !== 'number') pet.attrs[a] = 0;
  return pet;
}

/** Bring data saved by an older version up to date. Mutates and returns `data`. */
function migrate(data) {
  if ((data.version || 1) < 2) {
    // mood used to be one value for all Pokémon
    const mood = typeof data.mood === 'number' ? data.mood : 80;
    for (const id of Object.keys(data.pets)) petOf(data, id).mood = mood;
  }
  delete data.mood;
  for (const id of Object.keys(data.pets)) petOf(data, id);
  data.version = VERSION;
  return data;
}

function merge(base, saved) {
  if (!saved || typeof saved !== 'object' || Array.isArray(base)) return saved ?? base;
  const out = { ...base };
  for (const k of Object.keys(saved)) {
    out[k] = base[k] && typeof base[k] === 'object' && !Array.isArray(base[k])
      ? merge(base[k], saved[k]) : saved[k];
  }
  return out;
}

class Store {
  constructor(dir, lang) {
    this.dir = dir;
    this.file = path.join(dir, 'pokepetplus-data.json');
    let saved = null;
    try { saved = JSON.parse(fs.readFileSync(this.file, 'utf8')); } catch { /* first run */ }
    this.data = migrate(merge(defaults(lang), saved));
    this.rollDay();
    this.timer = null;
  }

  rollDay() {
    const d = today();
    if (this.data.stats.day !== d) {
      this.data.stats.day = d;
      this.data.stats.todayPomos = 0;
      this.data.stats.todayTodos = 0;
    }
  }

  save() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), 300);
  }

  flush() {
    clearTimeout(this.timer);
    try {
      fs.mkdirSync(this.dir, { recursive: true });
      const tmp = this.file + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2));
      fs.renameSync(tmp, this.file);
    } catch (e) {
      console.error('Could not save data:', e);
    }
  }
}

module.exports = { Store, today, defaults, merge, migrate, freshPet, petOf, ATTRS, VERSION };
