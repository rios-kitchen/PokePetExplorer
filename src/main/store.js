// Tiny JSON store in the app's userData folder (local only).
const fs = require('fs');
const path = require('path');

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const Sprites = require('../shared/sprites');

// 1 = PokePet; 2 = mood per pet, raising fields; 3 = no built-ins;
// 4 = the first Pokémon is a starter picked at the professor's (no free Poké Balls)
const VERSION = 6;

const ATTRS = ['cool', 'cute', 'smart', 'tough'];   // contest-style stats, raised by expeditions and items

function defaults(lang) {
  return {
    version: VERSION,
    settings: {
      lang,
      pokemon: null,      // id of the active Pokémon (every Pokémon comes from an egg)
      scale: 3,
      walk: true,
      sound: true,
      reactInput: true,
      reminderMin: 30,
      launchAtLogin: false,
      hideOnFullscreen: true,   // step aside when a fullscreen app (video, game, slides) is in front
      checkUpdates: true,   // look for a new release on GitHub at startup
      ai: { enabled: false, provider: 'anthropic', baseUrl: '', model: '' },   // optional AI chat (ai.js)
      weather: { enabled: false, city: '', place: '', lat: null, lon: null },   // off by default; city typed by the user
      greetings: true,      // holiday and anniversary greetings (local, no network)
      party: [],            // up to 3 Pokémon ids that battle (empty: the partner alone)
      petPos: null,
      petHidden: false
    },
    pomodoro: { focus: 25, short: 5, long: 15, longEvery: 4, autoBreak: true },
    todos: [],
    pets: {},     // id -> pet record, see freshPet()
    custom: [],   // the team: { id, dex, names: {en, zh} } – dex/names are null while it's an egg
    skins: {},    // id -> sprite source meta (see sources.js)
    berries: 10,
    shiny: { since: Date.now() },   // when the last shiny joined (or the save began) – see shiny.js
    poops: [],    // droppings on the screen: { id, x, y, at }
    poopDueAt: null,
    lastRewardDay: null,
    lastSeen: null,
    diary: null,
    stats: {
      day: today(), todayPomos: 0, totalPomos: 0, focusMinutes: 0, todosDone: 0, todayTodos: 0,
      expeditions: 0, travels: 0, cures: 0, hatches: 0, fishCaught: 0,   // for achievements (hatches: also the hatch level)
      battlesWon: 0, battlesLost: 0, caught: 0
    },

    // ---- raising (PokePet Explorer)
    inventory: {},      // itemId -> count (bought in the shop, used later)
    expedition: null,   // { petId, kind: 'dungeon' | 'travel', dest, startAt, endsAt } while a pet is away
    daily: { day: null, signedIn: false, streak: 0, lastSignDay: null, tasks: [] },
                        // tasks: [{ id, kind, goal, progress, reward, claimed }], rolled each day
    achievements: {},   // id -> time unlocked (ms)
    fishdex: {},        // dex -> { caught, first (ms), best (size) }
    souvenirs: [],      // { id, region, at } brought back from travels
    photos: [],         // { id, file, expId, region, petId, at } – group photos from expeditions (userData/photos)
    aiKeys: {},         // provider -> encrypted API key (never sent to the windows)
    greeted: { holiday: null, weather: null, weatherKind: null },   // last day / time something was greeted
    weatherNow: null,   // { kind, temp, isDay, at } – the last weather report
    wild: { encounter: null },   // a wild Pokémon met on an outing that waits for a battle
    limits: {},                  // mini-game plays today and in the last hour (limits.js)
    pokedex: {}         // dex -> { seen, caught } from battles
  };
}

/** A new pet record. `stage` is 'egg' until it hatches; Pokémon picked directly start 'hatched'. */
function freshPet(stage = 'hatched') {
  return {
    xp: 0,
    mood: 80,
    stage,
    attrs: Object.fromEntries(ATTRS.map((a) => [a, 0])),
    born: Date.now(),
    growAcc: 0,          // fraction of an XP point from passive growth (growth.js)
    species: null,       // after evolving: { dex, names } – the id keeps its records, the species changes
    evolutions: 0,
    evolution: null,     // pending: { options: [{ dex, names }], snoozeUntil }
    finalForm: false,    // no further evolution exists
    hatchedAt: null,     // when it came out of its egg / joined the team
    evolveAt: null,      // the level its next evolution needs (looked up from PokeAPI), null = not known yet
    evolvedAt: null      // when it last evolved
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

/** A new egg on the team (one at a time). Its species is decided when it hatches. */
function addEgg(data, now = Date.now()) {
  const id = `egg-${now.toString(36)}${Math.random().toString(36).slice(2, 5)}`;
  data.custom.push({ id, dex: null, names: null });
  data.pets[id] = freshPet('egg');
  data.pets[id].egg = { plan: null };   // plan: { dex?, shiny? } – set by the hidden hatch command
  return id;
}

/** Bring data saved by an older version up to date. Mutates and returns `data`. */
function migrate(data) {
  if ((data.version || 1) < 2) {
    // mood used to be one value for all Pokémon
    const mood = typeof data.mood === 'number' ? data.mood : 80;
    for (const id of Object.keys(data.pets)) petOf(data, id).mood = mood;
  }
  delete data.mood;
  if ((data.version || 1) < 3) {
    // the six built-in Pokémon are gone: the ones already raised join the team as normal entries
    for (const id of Sprites.ORDER) {
      const def = Sprites.DEFS[id];
      const rec = data.pets[id];
      if (!rec || data.custom.some((c) => c.id === id)) continue;
      data.custom.unshift({ id, dex: def.dex, names: def.name });
    }
  }
  for (const id of Object.keys(data.pets)) petOf(data, id);
  if ((data.version || 1) < 4) {
    // a team of nothing but unopened Poké Balls (the old way to start) → choose a starter instead
    const hatched = data.custom.some((c) => data.pets[c.id] && data.pets[c.id].stage !== 'egg');
    if (!hatched) {
      for (const c of data.custom) { delete data.pets[c.id]; delete data.skins[c.id]; }
      data.custom = [];
    }
  }
  if ((data.version || 1) < 5) {
    // levels moved to the games' curve (level³): keep every Pokémon's level and its progress towards the next one;
    // evolutions are now asked at the games' levels, so pending offers are looked up again
    const oldAt = (l) => 25 * (l - 1) * (l - 1);
    const newAt = (l) => l * l * l - 1;
    for (const pet of Object.values(data.pets)) {
      const xp = pet.xp || 0;
      const l = Math.min(100, 1 + Math.floor(Math.sqrt(xp / 25)));
      const frac = Math.min(0.99, (xp - oldAt(l)) / Math.max(1, oldAt(l + 1) - oldAt(l)));
      pet.xp = Math.round(newAt(l) + frac * (newAt(l + 1) - newAt(l)));
      pet.evolution = null;
      pet.evolveAt = null;
      if (!pet.finalForm) pet.finalForm = false;
    }
    data.shiny = { since: Date.now() };
  }
  if ((data.version || 1) < 6) {
    // grass encounters moved into the shared mini-game limits
    const w = data.wild || {};
    data.limits = data.limits || {};
    if (w.day) data.limits.grass = { day: w.day, used: w.used || 0, recent: w.recent || [] };
    data.wild = { encounter: w.encounter || null };
  }
  // no team yet: the starter is chosen at the professor's (main.js openStarter)
  if (!data.custom.some((c) => c.id === data.settings.pokemon)) data.settings.pokemon = data.custom.length ? data.custom[0].id : null;
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
    this.file = path.join(dir, 'pokepetexplorer-data.json');
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

module.exports = { Store, today, defaults, merge, migrate, freshPet, petOf, addEgg, ATTRS, VERSION };
