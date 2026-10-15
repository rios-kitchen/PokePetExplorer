// Data model: defaults, per-pet records and migration from PokePet's (version 1) data.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Store, defaults, merge, migrate, petOf, VERSION } = require('../src/main/store');
const Care = require('../src/main/care');

test('fresh data has the raising fields and no global mood', () => {
  const d = migrate(merge(defaults('en'), null));
  assert.equal(d.version, VERSION);
  assert.equal(d.mood, undefined);
  assert.deepEqual(d.inventory, {});
  assert.equal(d.expedition, null);
  assert.deepEqual(d.daily, { day: null, signedIn: false, streak: 0, lastSignDay: null, tasks: [] });
  assert.deepEqual(d.achievements, {});
  assert.deepEqual(d.fishdex, {});
  assert.deepEqual(d.souvenirs, []);
});

test('petOf creates a complete pet record', () => {
  const d = migrate(merge(defaults('en'), null));
  const pet = petOf(d, 'pikachu');
  assert.equal(pet.xp, 0);
  assert.equal(pet.mood, 80);
  assert.equal(pet.stage, 'hatched');
  assert.deepEqual(pet.attrs, { cool: 0, cute: 0, smart: 0, tough: 0 });
  assert.equal(typeof pet.born, 'number');
  assert.equal(petOf(d, 'pikachu'), pet, 'same record on the next call');
});

test('careOf adds care with a status field, also to old care records', () => {
  const d = migrate(merge(defaults('en'), null));
  assert.equal(Care.careOf(d, 'eevee').status, null);
  d.pets.old = { xp: 5, care: { hunger: 50, clean: 50, health: 90, sick: false, fainted: false } };
  const care = Care.careOf(d, 'old');
  assert.equal(care.status, null);
  assert.equal(care.hunger, 50, 'existing values are kept');
  assert.equal(d.pets.old.mood, 80, 'missing pet fields are filled in');
});

test('version 1 data: global mood moves into every pet', () => {
  const v1 = {
    version: 1,
    settings: { lang: 'zh', pokemon: 'eevee' },
    pets: {
      pikachu: { xp: 120, care: { hunger: 40, clean: 70, health: 100, sick: false, fainted: false } },
      eevee: { xp: 30 }
    },
    berries: 7,
    mood: 42
  };
  const d = migrate(merge(defaults('en'), v1));
  assert.equal(d.version, VERSION);
  assert.equal(d.mood, undefined);
  assert.equal(d.pets.pikachu.mood, 42);
  assert.equal(d.pets.eevee.mood, 42);
  assert.equal(d.pets.pikachu.xp, 120, 'xp kept');
  assert.equal(d.pets.pikachu.care.hunger, 40, 'care kept');
  assert.equal(d.pets.pikachu.stage, 'hatched');
  assert.equal(d.berries, 7);
  assert.equal(d.settings.lang, 'zh');
  assert.equal(d.settings.walk, true, 'new settings get defaults');
});

test('version 2 data is not migrated again', () => {
  const d = migrate(merge(defaults('en'), { version: 2, pets: { pikachu: { xp: 1, mood: 15 } } }));
  assert.equal(d.pets.pikachu.mood, 15);
});

test('Store saves and loads the new fields', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pokepetplus-'));
  try {
    const a = new Store(dir, 'en');
    petOf(a.data, 'pikachu').attrs.cute = 3;
    a.data.inventory.oran = 2;
    a.data.fishdex[129] = { caught: 1, first: 1, best: 30 };
    a.flush();
    const b = new Store(dir, 'en');
    assert.equal(b.data.pets.pikachu.attrs.cute, 3);
    assert.equal(b.data.inventory.oran, 2);
    assert.equal(b.data.fishdex[129].best, 30);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
