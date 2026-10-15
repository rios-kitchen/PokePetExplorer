// Raising rules: status conditions and medicine, growth rate, hatching/evolution, expeditions.
const test = require('node:test');
const assert = require('node:assert/strict');
const { defaults, merge, migrate, petOf } = require('../src/main/store');
const Care = require('../src/main/care');
const Growth = require('../src/main/growth');
const Exp = require('../src/main/expedition');

const fresh = () => migrate(merge(defaults('en'), null));
const seq = (...values) => { let i = 0; return () => values[i++ % values.length]; };

// ---------------------------------------------------------------- status conditions
test('neglect causes a matching status condition', () => {
  const care = Care.freshCare();
  care.clean = 10;                                   // dirty → poison
  assert.equal(Care.rollStatus(care, 80, 1, seq(0, 0)), 'poison');
  assert.equal(care.status.id, 'poison');
  assert.equal(care.status.stage, 1);
  assert.equal(care.status.known, false);
  assert.equal(care.sick, true);
});

test('a healthy, happy pet rarely gets ill', () => {
  const care = Care.freshCare();
  assert.equal(Care.rollStatus(care, 90, 1, seq(0.01)), null);
});

test('an untreated status gets worse every 6 hours and ends in fainting', () => {
  const care = Care.freshCare();
  const t0 = 1_000_000;
  Care.inflict(care, 'poison', t0);
  Care.decay(care, 0, { now: t0 + 6 * 3600e3 });
  assert.equal(care.status.stage, 2);
  const { events } = Care.decay(care, 0, { now: t0 + 30 * 3600e3 });   // long time passed
  assert.ok(events.includes('fainted'));
  assert.equal(care.fainted, true);
});

test('status drains health by stage', () => {
  const care = Care.freshCare();
  Care.inflict(care, 'burn');
  care.status.stage = 3;
  Care.decay(care, 1, { now: care.status.since });
  assert.equal(care.health, 94);
});

test('the right medicine cures, the wrong one makes it worse', () => {
  const d = fresh();
  d.berries = 50;
  const care = Care.careOf(d, 'pikachu');
  Care.inflict(care, 'poison');
  const wrong = Care.useItem(d, 'pikachu', 'parlyz');
  assert.equal(wrong.ok, true);
  assert.equal(wrong.wrong, true);
  assert.equal(care.status.stage, 2);
  const right = Care.useItem(d, 'pikachu', 'antidote');
  assert.equal(right.cured, true);
  assert.equal(care.status, null);
  assert.equal(care.sick, false);
  assert.equal(d.berries, 44);
});

test('wrong medicine at stage 3 makes the pet faint; only a Revive helps then', () => {
  const d = fresh();
  d.berries = 50;
  const care = Care.careOf(d, 'pikachu');
  Care.inflict(care, 'freeze');
  care.status.stage = 3;
  const res = Care.useItem(d, 'pikachu', 'antidote');
  assert.ok(res.events.includes('fainted'));
  assert.equal(Care.useItem(d, 'pikachu', 'potion').reason, 'fainted');
  assert.equal(Care.useItem(d, 'pikachu', 'revive').ok, true);
  assert.equal(care.fainted, false);
  assert.equal(care.status, null);
  assert.equal(care.health, 50);
});

test('Full Heal cures anything; Potion only heals health', () => {
  const d = fresh();
  d.berries = 50;
  const care = Care.careOf(d, 'pikachu');
  Care.inflict(care, 'confusion');
  care.health = 50;
  Care.useItem(d, 'pikachu', 'potion');
  assert.equal(care.status.id, 'confusion');
  assert.equal(care.health, 95);
  assert.equal(Care.useItem(d, 'pikachu', 'fullheal').cured, true);
  assert.equal(care.status, null);
});

test('status medicine is refused without a status', () => {
  const d = fresh();
  d.berries = 50;
  assert.equal(Care.useItem(d, 'pikachu', 'antidote').reason, 'healthy');
  assert.equal(Care.useItem(d, 'pikachu', 'revive').reason, 'notFainted');
});

test('diagnosis costs a berry and reveals the status; remedy follows', () => {
  const d = fresh();
  d.berries = 1;
  const care = Care.careOf(d, 'pikachu');
  Care.inflict(care, 'paralysis');
  assert.equal(Care.remedyFor(care, 'sick'), null);
  assert.equal(Care.diagnose(d, 'pikachu').ok, true);
  assert.equal(d.berries, 0);
  assert.equal(Care.remedyFor(care, 'sick'), 'parlyz');
  assert.equal(Care.diagnose(d, 'pikachu').ok, true, 'already known: free');
});

test('items from the inventory are used before berries', () => {
  const d = fresh();
  d.berries = 0;
  d.inventory.oran = 1;
  const care = Care.careOf(d, 'pikachu');
  care.hunger = 10;
  assert.equal(Care.useItem(d, 'pikachu', 'oran').ok, true);
  assert.equal(d.inventory.oran, undefined);
  assert.equal(Care.useItem(d, 'pikachu', 'oran').reason, 'berries');
});

// ---------------------------------------------------------------- growth
test('growth rate follows mood, status and needs (QQ Pet penalties)', () => {
  const pet = { mood: 95 };
  const care = Care.freshCare();
  assert.equal(Growth.growthRate(pet, care), 1);
  pet.mood = 40;
  assert.equal(Growth.growthRate(pet, care), 160 / 260);
  care.hunger = 10;
  assert.equal(Growth.growthRate(pet, care), 80 / 260);
  care.fainted = true;
  assert.equal(Growth.growthRate(pet, care), 0);
});

test('passive growth adds up fractions', () => {
  const pet = { mood: 100, xp: 0, growAcc: 0 };
  const care = Care.freshCare();
  let gained = 0;
  for (let i = 0; i < 60; i++) gained += Growth.grow(pet, care, 1 / 60);
  assert.equal(gained, Growth.BASE_XP_PER_HOUR);
  assert.equal(pet.xp, Growth.BASE_XP_PER_HOUR);
});

test('eggs hatch at Lv5; evolution is offered at Lv12 and Lv24, and can be snoozed', () => {
  const pet = petOf(fresh(), 'pikachu');
  pet.stage = 'egg';
  pet.xp = Growth.xpFor(5) - 1;
  assert.equal(Growth.readyToHatch(pet), false);
  pet.xp = Growth.xpFor(5);
  assert.equal(Growth.readyToHatch(pet), true);

  pet.stage = 'hatched';
  pet.xp = Growth.xpFor(11);
  assert.equal(Growth.evolutionDue(pet), false);
  pet.xp = Growth.xpFor(12);
  assert.equal(Growth.evolutionDue(pet), true);
  pet.evolution = { options: [], snoozeUntil: Date.now() + 1000 };
  assert.equal(Growth.evolutionDue(pet), false);
  pet.evolution = null;
  pet.evolutions = 1;
  assert.equal(Growth.evolutionDue(pet), false);
  pet.xp = Growth.xpFor(24);
  assert.equal(Growth.evolutionDue(pet), true);
  pet.finalForm = true;
  assert.equal(Growth.evolutionDue(pet), false);
});

// ---------------------------------------------------------------- expeditions
test('expedition requirements', () => {
  const d = fresh();
  assert.equal(Exp.blocker(d, 'pikachu', 'woods'), null);
  assert.equal(Exp.blocker(d, 'pikachu', 'cave'), 'level');
  const pet = petOf(d, 'pikachu');
  pet.xp = Growth.xpFor(8);
  assert.equal(Exp.blocker(d, 'pikachu', 'volcano'), 'stats');
  pet.attrs.tough = 10;
  assert.equal(Exp.blocker(d, 'pikachu', 'volcano'), null);
  Care.careOf(d, 'pikachu').hunger = 20;
  assert.equal(Exp.blocker(d, 'pikachu', 'woods'), 'hungry');
});

test('an expedition runs on time, then brings rewards and costs', () => {
  const d = fresh();
  d.berries = 0;
  const t0 = 5_000_000;
  assert.equal(Exp.start(d, 'pikachu', 'woods', t0).ok, true);
  assert.equal(Exp.isAway(d, 'pikachu'), true);
  assert.equal(Exp.start(d, 'eevee', 'woods', t0).reason, 'busy');
  assert.equal(Exp.finish(d, t0 + 29 * 60e3), null, 'not back yet');

  // rnd: berries roll 0 → 2, loot roll 0 → yes, loot pick 0 → oran, hazard roll 0.99 → none
  const out = Exp.finish(d, t0 + 30 * 60e3, { rnd: seq(0, 0, 0, 0.99) });
  assert.equal(out.berries, 2);
  assert.equal(d.berries, 2);
  assert.equal(out.xp, 15);
  assert.deepEqual(out.gain, { tough: 1 });
  assert.deepEqual(out.items, ['oran']);
  assert.equal(d.inventory.oran, 1);
  assert.equal(out.status, null);
  assert.equal(d.expedition, null);
  const care = Care.careOf(d, 'pikachu');
  assert.equal(care.hunger, 65);
  assert.equal(petOf(d, 'pikachu').attrs.tough, 1);
});

test('dungeon hazards cause a known status; travel brings a souvenir', () => {
  const d = fresh();
  Exp.start(d, 'pikachu', 'woods', 0);
  const hurt = Exp.finish(d, 0, { force: true, rnd: seq(0, 0.99, 0) });   // no loot, hazard yes
  assert.equal(hurt.status, 'poison');
  assert.equal(Care.careOf(d, 'pikachu').status.known, true);

  const d2 = fresh();
  petOf(d2, 'eevee').xp = Growth.xpFor(5);
  Exp.start(d2, 'eevee', 'travel', 0);
  const trip = Exp.finish(d2, 60 * 60e3, { rnd: seq(0) });
  assert.equal(trip.region, 'kanto');
  assert.equal(d2.souvenirs.length, 1);
  assert.equal(trip.gain.cool, 2);
});

test('training raises its stat more at higher levels; recall gives nothing', () => {
  const d = fresh();
  petOf(d, 'pikachu').xp = Growth.xpFor(10);
  Exp.start(d, 'pikachu', 'smartClass', 0);
  const out = Exp.finish(d, 45 * 60e3);
  assert.equal(out.gain.smart, 5);

  Exp.start(d, 'pikachu', 'woods', 0);
  Exp.recall(d);
  assert.equal(d.expedition, null);
  assert.equal(petOf(d, 'pikachu').attrs.tough, 0);
});

// ---------------------------------------------------------------- achievements
const Ach = require('../src/main/achievements');

test('achievements unlock once and pay berries', () => {
  const d = fresh();
  d.berries = 0;
  d.stats.totalPomos = 1;
  const first = Ach.unlockNew(d, 123);
  assert.ok(first.includes('focus1'));
  assert.ok(!first.includes('focus25'));
  assert.equal(d.achievements.focus1, 123);
  const paid = first.reduce((s, id) => s + Ach.ACHIEVEMENTS[id].reward, 0);
  assert.equal(d.berries, paid);
  assert.deepEqual(Ach.unlockNew(d), [], 'nothing twice');

  petOf(d, 'pikachu').evolutions = 1;
  d.souvenirs.push({ region: 'kanto' }, { region: 'kanto' });
  assert.ok(Ach.unlockNew(d).includes('evolve'));
  const travel = Ach.list(d).find((a) => a.id === 'travelAll');
  assert.equal(travel.progress, 1);
  assert.equal(travel.at, null);
});

// ---------------------------------------------------------------- eggs, hidden commands, scenes
const { addEgg } = require('../src/main/store');
const Secrets = require('../src/main/secrets');
const Maps = require('../src/shared/maps');

test('a new player starts with one egg; the first hatches at Lv2, later ones at Lv5', () => {
  const d = fresh();
  assert.equal(d.custom.length, 1);
  const egg = d.custom[0];
  assert.equal(egg.dex, null);
  assert.equal(d.pets[egg.id].stage, 'egg');
  assert.equal(d.settings.pokemon, egg.id);
  assert.equal(Growth.hatchLevel(d), 2);
  d.stats.hatches = 1;
  assert.equal(Growth.hatchLevel(d), 5);
  const pet = d.pets[egg.id];
  pet.xp = Growth.xpFor(2);
  assert.equal(Growth.readyToHatch(pet, 2), true);
  assert.equal(Growth.readyToHatch(pet, 5), false);
  const id2 = addEgg(d);
  assert.notEqual(id2, egg.id);
  assert.equal(d.custom.length, 2);
});

test('old saves keep the built-in Pokémon they raised', () => {
  const d = migrate(merge(defaults('en'), { version: 2, settings: { pokemon: 'eevee' }, pets: { eevee: { xp: 50 } } }));
  assert.deepEqual(d.custom.map((c) => c.id), ['eevee']);
  assert.equal(d.custom[0].dex, 133);
  assert.equal(d.settings.pokemon, 'eevee');
});

// the words themselves aren't in the repository: put them in test/secrets.local.json to run this fully
let localWords = null;
try { localWords = JSON.parse(require('fs').readFileSync(require('path').join(__dirname, 'secrets.local.json'), 'utf8')); } catch { /* none */ }

test('hidden commands are recognised only by their exact word', { skip: !localWords && 'no test/secrets.local.json' }, () => {
  assert.equal(Secrets.parse('hello').cmd, null);
  assert.equal(Secrets.parse('').cmd, null);
  const found = [localWords.berries, `${localWords.hatch} pikachu shiny`, localWords.shiny.toUpperCase()].map((t) => Secrets.parse(t));
  assert.deepEqual(found.map((f) => f.cmd), ['berries', 'hatch', 'shiny']);
  assert.deepEqual(found[1].args, ['pikachu', 'shiny']);
  assert.equal(Secrets.parse(localWords.return).cmd, 'return');
});

test('unknown words are not commands', () => {
  for (const w of ['hello', '', 'berries', 'hatch', 'shiny', 'cheat']) assert.equal(Secrets.parse(w).cmd, null);
});

test('every expedition has a pixel scene', () => {
  for (const id of Object.keys(Exp.EXPEDITIONS)) {
    const s = Maps.sceneRgba(id);
    assert.equal(s.data.length, Maps.W * Maps.H * 4);
    assert.ok(s.data.some((v, i) => i % 4 === 3 && v === 255), `${id} is drawn`);
  }
  for (const r of Exp.REGIONS) assert.equal(Maps.sceneRgba('travel', { region: r }).width, Maps.W);
});

// ---------------------------------------------------------------- photo album
const Album = require('../src/main/album');
const photo = (i, fav = false) => ({ id: `p${i}`, file: `p${i}.png`, at: i, fav });

test('only the latest 3 regular photos are kept; favourites stay', () => {
  const photos = [photo(1, true), photo(2), photo(3), photo(4), photo(5), photo(6, true)];
  const dropped = Album.prune(photos);
  assert.deepEqual(dropped.map((p) => p.id), ['p2']);
  assert.deepEqual(photos.map((p) => p.id).sort(), ['p1', 'p3', 'p4', 'p5', 'p6']);
});

test('at most 20 favourites; unstarring an old photo drops it', () => {
  const photos = Array.from({ length: 20 }, (_, i) => photo(i, true)).concat([photo(30)]);
  assert.equal(Album.setFavorite(photos, 'p30', true).reason, 'full');
  assert.equal(Album.wouldDrop(photos, 'p0'), false, 'only 1 regular photo – it stays');
  photos.push(photo(31), photo(32));
  assert.equal(Album.wouldDrop(photos, 'p0'), true);
  const res = Album.setFavorite(photos, 'p0', false);
  assert.deepEqual(res.dropped.map((p) => p.id), ['p0']);
  assert.equal(Album.setFavorite(photos, 'p30', true).ok, true);
});
