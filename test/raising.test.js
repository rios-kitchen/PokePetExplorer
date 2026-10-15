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

  // rnd: berries 0 → 2, loot 0 → yes, pick 0 → oran, companion 0.99 → no, hazard 0.99 → none
  const out = Exp.finish(d, t0 + 30 * 60e3, { rnd: seq(0, 0, 0, 0.99, 0.99) });
  assert.equal(out.companion, false);
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

const Fishing = require('../src/main/fishing');

test('a new player has no Pokémon until the starter is chosen', () => {
  const d = fresh();
  assert.equal(d.custom.length, 0);
  assert.equal(d.settings.pokemon, null);
});

test('an old save with only an unopened Poké Ball goes to the professor instead', () => {
  const d = migrate(merge(defaults('en'), {
    version: 3, settings: { pokemon: 'egg-1' }, custom: [{ id: 'egg-1', dex: null, names: null }],
    pets: { 'egg-1': { xp: 10, stage: 'egg' } }
  }));
  assert.equal(d.custom.length, 0);
  assert.equal(d.pets['egg-1'], undefined);
  assert.equal(d.settings.pokemon, null);
  // …but a team with a hatched Pokémon keeps everything, balls included
  const k = migrate(merge(defaults('en'), {
    version: 3, settings: { pokemon: 'mon' },
    custom: [{ id: 'mon', dex: 25, names: { en: 'Pikachu', zh: '皮卡丘' } }, { id: 'egg-2', dex: null, names: null }],
    pets: { mon: { xp: 100, stage: 'hatched' }, 'egg-2': { xp: 0, stage: 'egg' } }
  }));
  assert.deepEqual(k.custom.map((c) => c.id), ['mon', 'egg-2']);
});

test('balls from old saves still open at Lv2 (first) / Lv5', () => {
  const d = fresh();
  assert.equal(Growth.hatchLevel(d), 2);
  d.stats.hatches = 1;
  assert.equal(Growth.hatchLevel(d), 5);
  const id = addEgg(d);
  const pet = d.pets[id];
  pet.xp = Growth.xpFor(5);
  assert.equal(Growth.readyToHatch(pet, 5), true);
});

test('companions: the happier the pet, the likelier a wild friend follows it home', () => {
  assert.ok(Exp.companionChance(100) > Exp.companionChance(20) * 2);
  assert.ok(Exp.companionChance(100) <= 0.2 + 1e-9);
  const d = fresh();
  petOf(d, 'mon').mood = 100;
  Exp.start(d, 'mon', 'coolClass', 0);
  assert.equal(Exp.finish(d, 0, { force: true, rnd: seq(0) }).companion, false, 'never from training');
});

test('fishing: rarer catches are likelier to want to join; cast colour sets the difficulty', () => {
  const d = fresh();
  assert.equal(Fishing.land(d, { dex: 129, size: 90 }, 1, seq(0)).wantsToJoin, true);
  assert.equal(Fishing.land(d, { dex: 129, size: 90 }, 1, seq(0.99)).wantsToJoin, false);
  assert.ok(Fishing.JOIN_CHANCE[3] > Fishing.JOIN_CHANCE[0]);
  assert.deepEqual([0.1, 0.5, 0.9].map(Fishing.zoneOf), [0, 1, 2]);
  const easy = Fishing.bite(0.1, seq(0)), hard = Fishing.bite(0.9, seq(0));
  assert.ok(easy.bite > hard.bite);
  assert.ok(hard.pull / Fishing.TIERS[hard.tier].pull > easy.pull / Fishing.TIERS[easy.tier].pull);
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
  for (const c of ['battle', 'win', 'catch']) assert.equal(Secrets.parse(localWords[c]).cmd, c);
});

test('unknown words are not commands', () => {
  for (const w of ['hello', '', 'berries', 'hatch', 'shiny', 'cheat', 'battle', 'win', 'catch']) assert.equal(Secrets.parse(w).cmd, null);
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

// ---------------------------------------------------------------- fishing

test('fishing table: 24 species in four tiers, names in both languages', () => {
  assert.equal(Fishing.FISH.length, 24);
  assert.deepEqual([0, 1, 2, 3].map((t) => Fishing.FISH.filter((f) => f.tier === t).length), [6, 9, 6, 3]);
  for (const f of Fishing.FISH) assert.ok(f.names.en && f.names.zh && f.height > 0);
  assert.equal(Fishing.FISH.find((f) => f.dex === 131).names.zh, '拉普拉斯');
});

test('casting farther out makes rare bites likelier', () => {
  const near = Fishing.tierWeights(0), far = Fishing.tierWeights(1);
  const share = (w, i) => w[i] / w.reduce((s, x) => s + x, 0);
  assert.ok(share(far, 3) > share(near, 3) * 3);
  assert.ok(share(far, 0) < share(near, 0));
});

test('a bite hides the species; landing records it and pays out', () => {
  const b = Fishing.bite(0, seq(0, 0, 0.5, 0.99));   // common tier, first species, mid size, not shiny
  assert.equal(b.tier, 0);
  assert.equal(b.hidden.dex, 129);
  assert.equal(b.hidden.size, Math.round(90 * (0.7 + 0.5 * 0.7)));
  const d = fresh();
  d.berries = 0;
  const first = Fishing.land(d, b.hidden, 100);
  assert.equal(first.isNew, true);
  assert.equal(first.berries, Fishing.TIERS[0].berries + Fishing.NEW_SPECIES_BONUS);
  assert.deepEqual(d.fishdex[129], { caught: 1, first: 100, best: b.hidden.size, shiny: false });
  const bigger = Fishing.land(d, { dex: 129, size: 200, shiny: true }, 200);
  assert.equal(bigger.isNew, false);
  assert.equal(bigger.best, true);
  assert.deepEqual(d.fishdex[129], { caught: 2, first: 100, best: 200, shiny: true });
  assert.equal(d.stats.fishCaught, 2);
  assert.equal(Fishing.land(d, { dex: 25, size: 40 }), null, 'not a fishing Pokémon');
});

// ---------------------------------------------------------------- daily, holidays, weather
const Daily = require('../src/main/daily');
const Weather = require('../src/main/weather');

test('a new day brings 4 tasks for 4 different activities', () => {
  const d = fresh();
  assert.equal(Daily.roll(d, '2026-10-15', seq(0.1, 0.5, 0.9, 0.3, 0.7)), true);
  assert.equal(d.daily.tasks.length, 4);
  assert.equal(new Set(d.daily.tasks.map((t) => t.kind)).size, 4);
  assert.equal(Daily.roll(d, '2026-10-15'), false, 'same day: nothing changes');
});

test('sign-in streak: rewards climb over 7 days, a gap starts over', () => {
  const d = fresh();
  d.berries = 0;
  const days = ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07'];
  const got = days.map((day) => Daily.signIn(d, day));
  assert.deepEqual(got.map((r) => r.berries), Daily.SIGN_REWARDS);
  assert.equal(got[6].item, 'candy');
  assert.equal(d.inventory.candy, 1);
  assert.equal(Daily.signIn(d, '2026-10-07').reason, 'done');
  assert.equal(Daily.signIn(d, '2026-10-09').streak, 1, 'missed a day');
  assert.equal(Daily.yesterdayOf('2026-03-01'), '2026-02-28');
});

test('tasks count activities, pay once, and all four pay a bonus', () => {
  const d = fresh();
  Daily.roll(d, '2026-10-15');
  d.berries = 0;
  const kinds = d.daily.tasks.map((t) => t.kind);
  assert.equal(Daily.claim(d, d.daily.tasks[0].id).reason, 'notDone');
  for (const t of d.daily.tasks) Daily.progress(d, t.kind, t.goal);
  assert.ok(Daily.progress(d, kinds[0], 1).length === 0, 'already complete');
  let total = 0;
  const results = d.daily.tasks.map((t) => Daily.claim(d, t.id));
  for (const r of results) total += r.berries;
  assert.equal(results[3].bonus, true);
  assert.equal(d.berries, total);
  assert.equal(Daily.claim(d, d.daily.tasks[0].id).reason, 'claimed');
});

test('holidays and anniversaries', () => {
  assert.equal(Weather.holidayOn('2026-12-25'), 'christmas');
  assert.equal(Weather.holidayOn('2027-02-06'), 'springFestival');
  assert.equal(Weather.holidayOn('2026-09-25'), 'midAutumn');
  assert.equal(Weather.holidayOn('2026-10-15'), null);
  const met = new Date(2026, 0, 10, 15, 0).getTime();
  assert.deepEqual(Weather.anniversary(met, '2026-04-20'), { days: 100 });
  assert.deepEqual(Weather.anniversary(met, '2028-01-10'), { years: 2 });
  assert.equal(Weather.anniversary(met, '2026-01-10'), null);
});

test('weather codes and what the pet says', () => {
  assert.deepEqual([0, 2, 45, 61, 73, 95].map(Weather.kindOf), ['clear', 'cloudy', 'fog', 'rain', 'snow', 'storm']);
  assert.equal(Weather.remark({ kind: 'clear', temp: 35, isDay: true }), 'weatherHot');
  assert.equal(Weather.remark({ kind: 'rain', temp: 35, isDay: true }), 'weatherRain');
  assert.equal(Weather.remark({ kind: 'clear', temp: 20, isDay: true }), 'weatherSunny');
});

// ---------------------------------------------------------------- battles
const Battle = require('../src/main/battle');
const { effectiveness } = require('../src/main/typechart');
const mv = (id, type, power, cls = 'physical', extra = {}) => ({ id, names: { en: id, zh: id }, type, power, acc: 100, cls, ailment: 'none', ailmentChance: 0, ...extra });
const BASE = { hp: 45, atk: 49, def: 49, spa: 65, spd: 65, spe: 45 };   // Bulbasaur
const mon = (key, level, types, moves, extra = {}) => Battle.makeMon({ key, dex: 1, names: { en: key, zh: key }, level, types, base: BASE, moves, ...extra });

test('type chart', () => {
  assert.equal(effectiveness('fire', ['grass']), 2);
  assert.equal(effectiveness('water', ['fire', 'rock']), 4);
  assert.equal(effectiveness('electric', ['ground']), 0);
  assert.equal(effectiveness('normal', ['ghost']), 0);
  assert.equal(effectiveness('grass', ['fire', 'flying']), 0.25);
});

test('stats grow with level; contest stats give a small bonus', () => {
  const s5 = Battle.statsFor(BASE, 5), s20 = Battle.statsFor(BASE, 20);
  assert.ok(s20.hp > s5.hp * 2.5 && s20.atk > s5.atk * 2);
  assert.ok(Battle.statsFor(BASE, 20, { cool: 60 }).atk > s20.atk);
});

test('a super-effective move does more damage; the battle is won', () => {
  const me = mon('me', 12, ['fire'], [mv('ember', 'fire', 40, 'special'), mv('scratch', 'normal', 40)]);
  const wild = mon('wild', 10, ['grass'], [mv('tackle', 'normal', 40)]);
  const b = Battle.create({ party: [me], wild });
  const e1 = Battle.act(b, { type: 'move', index: 0 }, seq(0.5));
  const hit = e1.find((e) => e.t === 'move' && e.side === 'me');
  assert.equal(hit.eff, 2);
  let guard = 0;
  while (!b.over && guard++ < 30) Battle.act(b, { type: 'move', index: 0 }, seq(0.5));
  assert.equal(b.over, 'win');
});

test('switching, fainting and losing', () => {
  const a = mon('a', 5, ['grass'], [mv('tackle', 'normal', 40)]);
  const c = mon('c', 5, ['grass'], [mv('tackle', 'normal', 40)]);
  const wild = mon('wild', 30, ['fire'], [mv('flamethrower', 'fire', 90, 'special')]);
  const b = Battle.create({ party: [a, c], wild });
  const sw = Battle.act(b, { type: 'switch', to: 1 }, seq(0.5));
  assert.equal(sw[0].t, 'switch');
  assert.equal(b.active, 1);
  let guard = 0;
  while (!b.over && guard++ < 20) {
    if (b.needSwitch) Battle.act(b, { type: 'switch', to: b.party.findIndex((p) => !p.fainted) }, seq(0.5));
    else Battle.act(b, { type: 'move', index: 0 }, seq(0.5));
  }
  assert.equal(b.over, 'lose');
  assert.ok(a.fainted && c.fainted);
});

test('items: potions heal, a Revive brings a fainted member back, the bag is used up', () => {
  const a = mon('a', 10, ['grass'], [mv('tackle', 'normal', 40)]);
  const wild = mon('wild', 3, ['normal'], [mv('tackle', 'normal', 10)]);
  const b = Battle.create({ party: [a], wild, bag: { potion: 1 } });
  a.hp = 5;
  Battle.act(b, { type: 'item', item: 'potion' }, seq(0.99));
  assert.ok(a.hp > 5);
  assert.equal(b.bag.potion, 0);
  assert.deepEqual(Battle.act(b, { type: 'item', item: 'potion' }, seq(0.5)), [], 'none left');
});

test('catching: low HP, status and better balls help', () => {
  const wild = mon('wild', 10, ['normal'], [mv('tackle', 'normal', 40)]);
  const rate = (hpFrac, ball, status) => {
    wild.hp = Math.max(1, Math.round(wild.maxHp * hpFrac)); wild.status = status ? { id: status } : null;
    let n = 0;
    for (let i = 0; i < 2000; i++) if (Battle.tryCatch(wild, ball, 45, Math.random).caught) n++;
    return n / 2000;
  };
  assert.ok(rate(0.1, 'pokeball') > rate(1, 'pokeball') * 1.8);
  assert.ok(rate(0.5, 'ultraball') > rate(0.5, 'pokeball'));
  assert.ok(rate(0.5, 'pokeball', 'paralysis') > rate(0.5, 'pokeball'));
  assert.equal(Battle.tryCatch({ maxHp: 10, hp: 1, status: null }, 'ultraball', 255, () => 0.99).caught, true);
});
