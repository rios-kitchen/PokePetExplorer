// Tiny JSON store in the app's userData folder (local only).
const fs = require('fs');
const path = require('path');

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function defaults(lang) {
  return {
    version: 1,
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
    pets: {},     // id -> { xp }
    custom: [],   // added Pokémon: { id, dex, names: {en, zh} }
    skins: {},    // id -> sprite source meta (see sources.js)
    berries: 10,
    poops: [],    // droppings on the screen: { id, x, y, at }
    poopDueAt: null,
    lastRewardDay: null,
    lastSeen: null,
    diary: null,
    stats: { day: today(), todayPomos: 0, totalPomos: 0, focusMinutes: 0, todosDone: 0, todayTodos: 0 },
    mood: 80
  };
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
    this.data = merge(defaults(lang), saved);
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

module.exports = { Store, today };
