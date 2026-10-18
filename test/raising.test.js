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

test('the games\' level curve: Lv n needs n³ − 1 XP, up to Lv100', () => {
  assert.equal(Growth.levelOf(0), 1);
  assert.equal(Growth.xpFor(16), 4095);
  assert.equal(Growth.levelOf(4094), 15);
  assert.equal(Growth.levelOf(4095), 16);
  assert.equal(Growth.levelOf(10e6), 100);
  for (let l = 1; l <= 100; l++) assert.equal(Growth.levelOf(Growth.xpFor(l)), l);
});

test('eggs hatch at Lv5; evolution at the species\' level, not before a week (two after the last), snoozable', () => {
  const pet = petOf(fresh(), 'pikachu');
  pet.stage = 'egg';
  pet.xp = Growth.xpFor(5) - 1;
  assert.equal(Growth.readyToHatch(pet), false);
  pet.xp = Growth.xpFor(5);
  assert.equal(Growth.readyToHatch(pet), true);

  pet.stage = 'hatched';
  const day = 86400e3, now = Date.now();
  pet.hatchedAt = now - 8 * day;
  pet.xp = Growth.xpFor(16);
  assert.equal(Growth.evolutionDue(pet, now), false, 'level not looked up yet');
  pet.evolveAt = 16;
  pet.xp = Growth.xpFor(15);
  assert.equal(Growth.evolutionDue(pet, now), false);
  pet.xp = Growth.xpFor(16);
  assert.equal(Growth.evolutionDue(pet, now), true);
  pet.hatchedAt = now - 6 * day;
  assert.equal(Growth.evolutionDue(pet, now), false, 'less than a week with you');
  pet.hatchedAt = now - 8 * day;
  pet.evolution = { options: [], snoozeUntil: now + 1000 };
  assert.equal(Growth.evolutionDue(pet, now), false);
  pet.evolution = null;
  pet.evolutions = 1;
  pet.evolvedAt = now - 10 * day;
  pet.evolveAt = 36;
  assert.equal(Growth.evolutionDue(pet, now), false);
  pet.xp = Growth.xpFor(36);
  assert.equal(Growth.evolutionDue(pet, now), false, 'less than two weeks since the last evolution');
  pet.evolvedAt = now - 15 * day;
  assert.equal(Growth.evolutionDue(pet, now), true);
  assert.equal(Growth.optionLevel({ level: null }), Growth.EVOLVE_FALLBACK);
  pet.finalForm = true;
  assert.equal(Growth.evolutionDue(pet), false);
});

test('evolution by stones, trades and friendship', () => {
  const Sources = require('../src/main/sources');
  const d = (trigger, extra = {}) => ({ trigger: { name: trigger }, ...extra });
  // PokeAPI's evolution details → how
  assert.deepEqual(Sources.evolutionWay([d('level-up', { min_level: 16 })]), { how: 'level', level: 16 });
  assert.deepEqual(Sources.evolutionWay([d('use-item', { item: { name: 'thunder-stone' } })]), { how: 'item', item: 'thunder-stone' });
  assert.deepEqual(Sources.evolutionWay([d('trade', { held_item: { name: 'metal-coat' } })]), { how: 'trade' });
  assert.deepEqual(Sources.evolutionWay([d('level-up', { min_happiness: 160, time_of_day: 'day' })]), { how: 'friendship', level: null });
  assert.deepEqual(Sources.evolutionWay([d('level-up', { location: { name: 'x' } }), d('use-item', { item: { name: 'leaf-stone' } })]),
    { how: 'item', item: 'leaf-stone' }, 'Leafeon: the stone of the newer games');
  assert.deepEqual(Sources.evolutionWay([d('level-up', { known_move: { name: 'x' } })]), { how: 'other' });
  assert.deepEqual(Sources.evolutionWay([]), { how: 'other' });
  // how → the level it needs, and the item that does it
  assert.equal(Growth.optionLevel({ how: 'level', level: 16 }), 16);
  assert.equal(Growth.optionLevel({ how: 'item', item: 'fire-stone' }), Growth.NOT_BY_LEVEL);
  assert.equal(Growth.itemFor({ how: 'item', item: 'fire-stone' }), 'firestone');
  assert.equal(Growth.itemFor({ how: 'trade' }), 'linkingcord');
  assert.equal(Growth.optionLevel({ how: 'trade' }), Growth.NOT_BY_LEVEL);
  assert.equal(Growth.optionLevel({ how: 'item', item: 'sweet-apple' }), Growth.EVOLVE_FALLBACK, 'items the shop doesn\'t sell: Lv30');
  assert.equal(Growth.itemFor({ how: 'item', item: 'sweet-apple' }), null);
  assert.equal(Growth.optionLevel({ how: 'friendship', level: null }, 100), Growth.NOT_BY_LEVEL);
  assert.equal(Growth.optionLevel({ how: 'friendship', level: null }, 230), 1);
  assert.equal(Growth.optionLevel({ level: 20 }), 20, 'saved by an older version');
  for (const id of Object.values(Growth.EVO_ITEMS).concat(Growth.TRADE_ITEM)) assert.equal(Care.ITEMS[id].kind, 'evo', id);
  // friendship: 70 to start, grows, 255 at most; crossing 220 says so once
  const data = fresh();
  const pet = petOf(data, 'x');
  assert.equal(Growth.friendshipOf(pet), Growth.FRIEND_START);
  assert.equal(Growth.befriend(pet, 100), false);
  assert.equal(Growth.befriend(pet, 60), true);
  assert.equal(Growth.befriend(pet, 60), false);
  assert.equal(pet.friendship, Growth.FRIEND_MAX);
  assert.equal(Growth.friendshipOf({}), Growth.FRIEND_START, 'pets from older versions');
  // stones aren't used like food: main.js uses them on the Pokémon
  data.berries = 100;
  assert.equal(Care.useItem(data, 'x', 'firestone').reason, 'evoOnly');
  assert.equal(data.berries, 100);
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

test('fishing: rarer catches are likelier to want to join; the pond\'s ring sets the difficulty', () => {
  const d = fresh();
  assert.equal(Fishing.land(d, { dex: 129, size: 90 }, 1, seq(0)).wantsToJoin, true);
  assert.equal(Fishing.land(d, { dex: 129, size: 90 }, 1, seq(0.99)).wantsToJoin, false);
  assert.ok(Fishing.JOIN_CHANCE[3] > Fishing.JOIN_CHANCE[0]);
  assert.deepEqual([0, 1, 2, 3, 7, -1].map(Fishing.zoneOf), [0, 1, 2, 3, 3, 0]);
  const zones = [0, 1, 2, 3].map((z) => Fishing.bite(z, seq(0)));
  for (let z = 1; z < 4; z++) {
    // the deeper the ring, the less time to react and the harder the pull
    assert.ok(zones[z].bite < zones[z - 1].bite);
    assert.ok(zones[z].pull / Fishing.TIERS[zones[z].tier].pull > zones[z - 1].pull / Fishing.TIERS[zones[z - 1].tier].pull);
  }
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
  // newer words may not be in an older local file yet
  for (const c of ['battle', 'win', 'catch', 'fishing', 'update', 'forecast', 'battlefx', 'evolution', 'quiz', 'catchgame', 'memory', 'whack', 'typequiz', 'rps', 'voltorbflip', 'echo']) if (localWords[c]) assert.equal(Secrets.parse(localWords[c]).cmd, c);
});

test('unknown words are not commands', () => {
  for (const w of ['hello', '', 'berries', 'hatch', 'shiny', 'cheat', 'battle', 'win', 'catch', 'fishing', 'update', 'forecast', 'battlefx', 'evolution', 'quiz', 'catchgame', 'memory', 'whack', 'typequiz', 'rps', 'voltorbflip', 'echo']) assert.equal(Secrets.parse(w).cmd, null);
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

test('fish: the classic 24 first, then every Pokémon the games let you fish, names in both languages', () => {
  assert.deepEqual([0, 1, 2, 3].map((t) => Fishing.CLASSIC.filter((f) => f.tier === t).length), [6, 9, 6, 3]);
  assert.deepEqual(Fishing.FISH.slice(0, 24).map((f) => f.dex), Fishing.CLASSIC.map((f) => f.dex));
  assert.ok(Fishing.FISH.length > 40);
  assert.equal(new Set(Fishing.FISH.map((f) => f.dex)).size, Fishing.FISH.length);
  for (const f of Fishing.FISH) assert.ok(f.names.en && f.names.zh && f.height > 0 && f.tier >= 0 && f.tier <= 3);
  assert.equal(Fishing.FISH.find((f) => f.dex === 131).names.zh, '拉普拉斯');
});

test('fishing spots: the ring is the rod, the spot\'s table decides what bites', () => {
  const route12 = Fishing.pickSpot(10, () => 0) && require('../src/main/encounters.json').fishing.find((f) => f.n === 'kanto-route-12-area');
  assert.ok(route12, 'Kanto Route 12 has rod tables');
  assert.deepEqual(Fishing.spotName(route12), { en: 'Kanto · Route 12', zh: '关都 · 12号道路' });
  assert.equal(Fishing.rodTable(route12, 0).rod, 'old');
  assert.equal(Fishing.rodTable(route12, 1).rod, 'good');
  assert.equal(Fishing.rodTable(route12, 3).rod, 'super');
  // Old Rod at Route 12 (FireRed): only Magikarp
  for (let i = 0; i < 50; i++) assert.equal(Fishing.bite(0, Math.random, new Set(), 0, route12).hidden.dex, 129);
  // Super Rod (FireRed / LeafGreen): Krabby and Horsea most, Gyarados sometimes; the middle favours the rare ones
  const share = (zone, dex) => { let n = 0; for (let i = 0; i < 6000; i++) if (Fishing.bite(zone, Math.random, new Set(), 0, route12).hidden.dex === dex) n++; return n / 6000; };
  assert.ok(share(2, 116) + share(2, 98) > 0.75);
  assert.ok(share(3, 130) > share(2, 130));
  assert.equal(Fishing.tierOfChance(84), 0);
  assert.equal(Fishing.tierOfChance(1), 3);
});

test('the deep middle of the pond makes rare bites likelier', () => {
  const share = (w, i) => w[i] / w.reduce((s, x) => s + x, 0);
  for (let z = 1; z < 4; z++) {
    assert.ok(share(Fishing.tierWeights(z), 3) > share(Fishing.tierWeights(z - 1), 3));
    assert.ok(share(Fishing.tierWeights(z), 0) < share(Fishing.tierWeights(z - 1), 0));
  }
  assert.ok(share(Fishing.tierWeights(3), 3) > share(Fishing.tierWeights(0), 3) * 10);
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
    for (let i = 0; i < 20000; i++) if (Battle.tryCatch(wild, ball, 45, Math.random).caught) n++;
    return n / 20000;
  };
  assert.ok(rate(0.1, 'pokeball') > rate(1, 'pokeball') * 1.8);
  assert.ok(rate(0.5, 'ultraball') > rate(0.5, 'pokeball'));
  assert.ok(rate(0.5, 'pokeball', 'paralysis') > rate(0.5, 'pokeball'));
  assert.equal(Battle.tryCatch({ maxHp: 10, hp: 1, status: null }, 'ultraball', 255, () => 0.99).caught, true);
});

test('species already in the fishing Pokédex bite more often', () => {
  const common = Fishing.FISH.filter((f) => f.tier === 0);
  const caught = new Set(common.slice(1).map((f) => f.dex));   // all common ones but the first
  let fresh = 0;
  let r = 1;
  const rnd = () => { r = (r * 16807) % 2147483647; return r / 2147483647; };
  for (let i = 0; i < 6000; i++) if (Fishing.bite(0, rnd, caught).hidden.dex === common[0].dex) fresh++;
  // without weighting the new species would be 1 in 6 of common bites; now 1 in 26
  const commonShare = 62 / 100;
  const share = fresh / 6000 / commonShare;
  assert.ok(share > 0.025 && share < 0.06, `new species share ${share}`);
  assert.equal(Fishing.REPEAT_WEIGHT, 5);
});

test('shinies: 1 in 4096, guaranteed once 90 days passed since the last one joined', () => {
  const Shiny = require('../src/main/shiny');
  const day = 86400e3, now = Date.now();
  const d = { shiny: { since: now - 89 * day } };
  assert.equal(Shiny.roll(d, { rnd: () => 0.5, now }), false);
  assert.equal(Shiny.roll(d, { rnd: () => 0.0001, now }), true);
  d.shiny.since = now - 91 * day;
  assert.equal(Shiny.roll(d, { rnd: () => 0.5, now }), true);
  assert.equal(Shiny.roll(d, { rnd: () => 0.5, now, pity: false }), false);
  Shiny.obtained(d, now);
  assert.equal(Shiny.roll(d, { rnd: () => 0.5, now }), false);
});

test('mini-game limits: per day and per hour', () => {
  const Limits = require('../src/main/limits');
  const d = {};
  const day = '2026-10-16', t0 = Date.parse('2026-10-16T08:00:00');
  for (let i = 0; i < 6; i++) assert.equal(Limits.use(d, 'fishing', day, t0 + i * 60e3), true);
  let i1 = Limits.info(d, 'fishing', day, t0 + 10 * 60e3);
  assert.equal(i1.left, 0);
  assert.equal(Limits.blocked(i1), 'rest');
  assert.equal(Limits.use(d, 'fishing', day, t0 + 10 * 60e3), false);
  assert.equal(i1.nextAt, t0 + 3600e3);
  // an hour later the first one is free again; the day still counts all of them
  i1 = Limits.info(d, 'fishing', day, t0 + 3600e3 + 1);
  assert.equal(i1.hourLeft, 1);
  assert.equal(i1.dayLeft, 14);
  // used up for the day
  d.limits.fishing.used = 20;
  assert.equal(Limits.blocked(Limits.info(d, 'fishing', day, t0 + 5 * 3600e3)), 'tired');
  assert.equal(Limits.info(d, 'fishing', '2026-10-17', t0 + 24 * 3600e3).dayLeft, 20);
});

test('a tired pond: later bites within the hour are often junk and come slower', () => {
  assert.equal(Fishing.junkChance(0), 0);
  assert.equal(Fishing.junkChance(1), 0);
  assert.ok(Math.abs(Fishing.junkChance(5) - 0.8) < 1e-9);
  assert.equal(Fishing.biteDelay(3), 7500);
  const b = Fishing.bite(0.5, () => 0.01, new Set(), 4);
  assert.equal(b.junk, true);
  const d = { stats: {}, fishdex: {}, berries: 0 };
  const r = Fishing.land(d, b.hidden);
  assert.equal(r.berries, 0);
  assert.equal(Object.keys(d.fishdex).length, 0);
  assert.equal(d.stats.fishJunk, 1);
});

test('the Pokédex records seen and caught species and never forgets them', () => {
  const Pokedex = require('../src/main/pokedex');
  const d = {};
  Pokedex.see(d, 16, { en: 'Pidgey', zh: '波波' }, 100);
  Pokedex.see(d, 16, null, 200);
  Pokedex.caught(d, 25, { en: 'Pikachu', zh: '皮卡丘' }, { shiny: true }, 300);
  assert.deepEqual(d.pokedex[16], { seen: 2, caught: 0, names: { en: 'Pidgey', zh: '波波' }, firstSeen: 100 });
  assert.equal(d.pokedex[25].seen, 1);
  assert.equal(d.pokedex[25].caught, 1);
  assert.equal(d.pokedex[25].shiny, true);
  assert.deepEqual(Pokedex.counts(d), { seen: 2, caught: 1 });
  // older saves: the team counts as caught, the fishing records as seen – adding only, never twice
  Pokedex.backfill(d, [{ dex: 25 }, { dex: 4, names: { en: 'Charmander', zh: '小火龙' } }], [{ dex: 129, names: { en: 'Magikarp', zh: '鲤鱼王' } }]);
  Pokedex.backfill(d, [{ dex: 4 }], [{ dex: 129 }]);
  assert.equal(d.pokedex[25].caught, 1);
  assert.equal(d.pokedex[4].caught, 1);
  assert.equal(d.pokedex[129].seen, 1);
  assert.equal(d.pokedex[129].caught, 0);
  assert.deepEqual(Pokedex.list(d).map((e) => e.dex), [4, 16, 25, 129]);
});

test('status moves, stat stages, sleep, priority and draining', () => {
  const base = { cls: 'physical', category: 'damage', target: 'selected-pokemon', priority: 0, ailment: 'none', ailmentChance: 0,
    stats: [], statChance: 0, healing: 0, drain: 0, minHits: 1, maxHits: 1 };
  const growl = { ...base, id: 'growl', names: { en: 'Growl', zh: '叫声' }, type: 'normal', power: 0, acc: 100, cls: 'status',
    category: 'net-good-stats', stats: [{ stat: 'atk', change: -1 }] };
  const swords = { ...base, id: 'swords-dance', names: { en: 'Swords Dance', zh: '剑舞' }, type: 'normal', power: 0, acc: null,
    cls: 'status', category: 'net-good-stats', target: 'user', stats: [{ stat: 'atk', change: 2 }] };
  const spore = { ...base, id: 'spore', names: { en: 'Spore', zh: '蘑菇孢子' }, type: 'grass', power: 0, acc: 100, cls: 'status',
    category: 'ailment', ailment: 'sleep' };
  const quick = { ...base, id: 'quick-attack', names: { en: 'Quick Attack', zh: '电光一闪' }, type: 'normal', power: 40, acc: 100, priority: 1 };
  const drain = { ...base, id: 'giga-drain', names: { en: 'Giga Drain', zh: '终极吸取' }, type: 'grass', power: 75, acc: 100,
    cls: 'special', category: 'damage+heal', drain: 50 };
  assert.equal(Battle.stageMul(2), 2);
  assert.equal(Battle.stageMul(-1), 2 / 3);
  assert.equal(Battle.MAX_PARTY, 6);

  // Growl lowers the wild one's Attack; Swords Dance raises the user's by two (and never misses)
  let me = mon('me', 20, ['normal'], [growl, swords]);
  let wild = mon('wild', 20, ['normal'], [{ ...base, id: 'splash', names: { en: 'x', zh: 'x' }, type: 'normal', power: 0, acc: 100, cls: 'status', category: 'net-good-stats', stats: [{ stat: 'def', change: 1 }], target: 'user' }]);
  let b = Battle.create({ party: [me], wild });
  Battle.act(b, { type: 'move', index: 0 }, seq(0.1));
  assert.equal(wild.stages.atk, -1);
  Battle.act(b, { type: 'move', index: 1 }, seq(0.99));
  assert.equal(me.stages.atk, 2);

  // Spore puts it to sleep; a sleeping Pokémon can't move until it wakes up
  me = mon('me', 20, ['grass'], [spore]);
  wild = mon('wild', 20, ['normal'], [quick]);
  b = Battle.create({ party: [me], wild });
  const ev = Battle.act(b, { type: 'move', index: 0 }, seq(0.1));
  assert.ok(ev.some((e) => e.t === 'status' && e.status === 'sleep'));
  assert.equal(wild.status.id, 'sleep');

  // Quick Attack goes first even when slower
  me = mon('me', 5, ['normal'], [quick]);
  wild = mon('wild', 50, ['normal'], [{ ...quick, priority: 0, id: 'tackle' }]);
  b = Battle.create({ party: [me], wild });
  const order = Battle.act(b, { type: 'move', index: 0 }, seq(0.5)).filter((e) => e.t === 'move').map((e) => e.side);
  assert.equal(order[0], 'me');

  // Giga Drain heals the user by half the damage
  me = mon('me', 30, ['grass'], [drain]);
  me.hp = 10;
  wild = mon('wild', 30, ['water'], [{ ...base, id: 'splash2', names: { en: 'x', zh: 'x' }, type: 'normal', power: 0, acc: 100, cls: 'status', category: 'net-good-stats', stats: [{ stat: 'def', change: 1 }], target: 'user' }]);
  b = Battle.create({ party: [me], wild });
  const evs = Battle.act(b, { type: 'move', index: 0 }, seq(0.5));
  assert.ok(evs.some((e) => e.t === 'heal' && e.side === 'me'));
  assert.ok(me.hp > 10);

  // switching out resets stat stages
  const a = mon('a', 20, ['normal'], [quick]), c = mon('c', 20, ['normal'], [quick]);
  a.stages.atk = 3;
  b = Battle.create({ party: [a, c], wild: mon('w', 20, ['normal'], [quick]) });
  Battle.act(b, { type: 'switch', to: 1 }, seq(0.5));
  assert.equal(a.stages.atk, 0);
});

test('the games\' move sets: newest level-up moves, status moves included, always one that hits', () => {
  const Data = require('../src/main/pokedata');
  const ok = (o) => Data.usable({ category: 'damage', power: 40, cls: 'physical', ailment: 'none', stats: [], healing: 0, ...o });
  assert.equal(ok({}), true);
  assert.equal(ok({ category: 'ohko', power: 0, id: 'fissure' }), true, 'one-hit KO moves are in now');
  assert.equal(ok({ category: 'whole-field-effect', cls: 'status', power: 0, id: 'rain-dance' }), true, 'weather');
  assert.equal(ok({ category: 'unique', cls: 'status', power: 0, id: 'substitute' }), true, 'Substitute');
  assert.equal(ok({ category: 'whole-field-effect', cls: 'status', power: 0, id: 'trick-room' }), false, 'other field effects still not');
  assert.equal(ok({ category: 'net-good-stats', cls: 'status', power: 0, stats: [{ stat: 'atk', change: -1 }] }), true);
  assert.equal(ok({ category: 'unique', cls: 'status', power: 0 }), false);
  assert.equal(ok({ category: 'ailment', cls: 'status', power: 0, ailment: 'trap' }), true, 'trapping');
});

test('after an update: nothing pending, a manual install, then the release page', () => {
  const { stageOf, newer } = require('../src/main/updater');
  assert.equal(newer('1.3.1', '1.3.0'), true);
  assert.equal(stageOf(null, '1.3.0'), null);
  assert.equal(stageOf({ version: '1.3.1', autoTried: true }, '1.3.1'), null, 'installed');
  assert.equal(stageOf({ version: '1.3.1', autoTried: true }, '1.3.0'), 'auto-failed');
  assert.equal(stageOf({ version: '1.3.1', autoTried: true, manualTried: true }, '1.3.0'), 'manual-failed');
});

test('wild encounters follow the games\' tables; legendaries are rare special encounters', () => {
  const W = require('../src/main/wild');
  const drawn = W.drawnDex(null);
  // Viridian Forest (FireRed): Caterpie / Weedle 40 %, Metapod / Kakuna 10 %, Pikachu 5 %
  const count = {};
  for (let i = 0; i < 6000; i++) {
    const p = W.pickFromTables({ place: 'woods', region: null, level: 4, drawn });
    if (p && p.area === 'viridian-forest-area') count[p.dex] = (count[p.dex] || 0) + 1;
  }
  const total = Object.values(count).reduce((a, b) => a + b, 0);
  assert.ok(total > 50, 'Viridian Forest comes up for a Lv4 lead');
  assert.ok(count[10] / total > 0.3 && count[25] / total < 0.12, JSON.stringify(count));
  // never a legendary from the tables; special ones need a strong lead and skip caught ones
  assert.equal(W.pickLegend({ level: 10, drawn, rnd: () => 0 }), null);
  const l = W.pickLegend({ level: 40, drawn, rnd: () => 0 });
  assert.ok(l && W.LEGENDS.has(l.dex) && l.level === 48);
  const all = new Set([...W.LEGENDARY, ...W.MYTHICAL]);
  assert.equal(W.pickLegend({ level: 40, drawn, caught: all, rnd: () => 0 }), null);
  assert.equal(W.legendLevel(80), 70);
  // Ultra Beasts and Paradox Pokémon: special encounters of their own, never from the tables
  const ub = W.pickLegend({ level: 40, drawn, force: 'ultra', rnd: () => 0.3 });
  assert.ok(ub && W.ULTRA_BEASTS.includes(ub.dex) && ub.special === 'ultra');
  const px = W.pickLegend({ level: 40, drawn, force: 'paradox', rnd: () => 0.3 });
  assert.ok(px && W.PARADOX.includes(px.dex) && px.special === 'paradox');
  // a roll just past the legendary chance is an Ultra Beast, then a Paradox Pokémon, then nothing
  const at = (x) => { const v = [x, 0]; let i = 0; return () => v[Math.min(i++, 1)]; };
  assert.equal(W.pickLegend({ level: 40, drawn, rnd: at(W.MYTHICAL_CHANCE + W.LEGEND_CHANCE + 0.0001) }).special, 'ultra');
  assert.equal(W.pickLegend({ level: 40, drawn, rnd: at(W.MYTHICAL_CHANCE + W.LEGEND_CHANCE + W.ULTRA_CHANCE + 0.0001) }).special, 'paradox');
  assert.equal(W.pickLegend({ level: 40, drawn, rnd: at(0.01) }), null);
  assert.equal(W.pickLegend({ level: 40, region: 'paldea', drawn, rnd: at(W.MYTHICAL_CHANCE + W.LEGEND_CHANCE + W.ULTRA_CHANCE + W.PARADOX_CHANCE + 0.0001) }).special, 'paradox', 'more often in Paldea');
  assert.equal(W.pickLegend({ level: 40, drawn, caught: new Set([...W.ULTRA_BEASTS]), force: 'ultra' }), null);
});

test('the forecast talk: rain on its way, clearing up, or the temperature range', () => {
  const r = (now, next) => Weather.forecastRemark(now, next);
  const h = (kind, temp, pop = 0) => ({ kind, temp, pop });
  assert.deepEqual(r(h('clear', 20), [h('cloudy', 19, 20), h('rain', 18, 70), h('rain', 17, 80)]), { line: 'forecastRainSoon', vars: { lo: 17, hi: 19, pop: 80, h: 2 } });
  assert.equal(r(h('cloudy', 5), [h('snow', 1), h('snow', 0), h('cloudy', 0)]).line, 'forecastSnowSoon');
  assert.equal(r(h('rain', 15), [h('cloudy', 15), h('clear', 16), h('clear', 17)]).line, 'forecastClearing');
  assert.equal(r(h('rain', 15), [h('rain', 15), h('cloudy', 15), h('rain', 14)]).line, 'forecastStillRain');
  assert.equal(r(h('clear', 33), [h('clear', 34), h('clear', 35), h('clear', 33)]).line, 'forecastHot');
  assert.equal(r(h('clear', 20), [h('clear', 21), h('clear', 22), h('clear', 21)]).line, 'forecastSunny');
  assert.equal(r(h('cloudy', 20), [h('cloudy', 21), h('clear', 22), h('cloudy', 21)]).line, 'forecastCloudy');
  assert.equal(r(h('clear', 20), []), null);
});

test('Who\'s That Pokémon?: questions, rewards, limits', () => {
  const Quiz = require('../src/main/quiz');
  const Limits = require('../src/main/limits');
  // the pool: species with a PMD sprite, or all of them while that isn't known
  assert.equal(Quiz.pool(null).length, 1025);
  const idx = { dex: Object.fromEntries(Array.from({ length: 300 }, (_, i) => [String(i + 1).padStart(4, '0'), { sprite: i % 2 ? 'x' : null }])) };
  const list = Quiz.pool(idx);
  assert.equal(list.length, 150);
  assert.ok(list.every((d) => d % 2 === 0));
  // four different choices, the answer among them
  for (let i = 0; i < 200; i++) {
    const q = Quiz.question(list, { known: [2, 4, 6, 8, 10, 12], exclude: [20] });
    assert.equal(q.choices.length, Quiz.CHOICES);
    assert.equal(new Set(q.choices).size, Quiz.CHOICES);
    assert.ok(q.choices.includes(q.answer));
    assert.notEqual(q.answer, 20);
  }
  // half the time one you've met (when you've met at least 5)
  const met = [2, 4, 6, 8, 10];
  const hits = Array.from({ length: 400 }, () => met.includes(Quiz.question(list, { known: met }).answer)).filter(Boolean).length;
  assert.ok(hits > 150 && hits < 260, String(hits));
  assert.equal(Quiz.question(list, { known: met, rnd: () => 0 }).answer, 2);
  // berries: 2, and 3 for every 3rd right answer in a row
  assert.deepEqual([1, 2, 3, 4, 5, 6].map(Quiz.berriesFor), [2, 2, 3, 2, 2, 3]);
  // limits: 12 a day, 4 an hour
  const data = fresh();
  const day = '2026-10-18', t0 = Date.parse('2026-10-18T10:00:00');
  for (let i = 0; i < 4; i++) assert.equal(Limits.use(data, 'quiz', day, t0 + i), true);
  assert.equal(Limits.use(data, 'quiz', day, t0 + 5), false);
  assert.equal(Limits.blocked(Limits.info(data, 'quiz', day, t0 + 5)), 'rest');
  assert.equal(Limits.info(data, 'quiz', day, t0 + 3600e3 + 10).hourLeft, 4);
  assert.equal(Limits.LIMITS.quiz.day, 12);
});

test('Berry Catch: points, rewards, limits', () => {
  const C = require('../src/shared/catch-rules');
  const Limits = require('../src/main/limits');
  // the score becomes berries (at most 4), XP and mood; a score that can't be real counts as the most a round can give
  assert.deepEqual(C.rewardFor(0), { score: 0, berries: 0, xp: 0, mood: 0 });
  assert.deepEqual(C.rewardFor(7), { score: 7, berries: 0, xp: 14, mood: 2 });
  assert.deepEqual(C.rewardFor(16), { score: 16, berries: 2, xp: 32, mood: 6 });
  assert.equal(C.rewardFor(1e6).score, C.MAX_SCORE);
  assert.equal(C.rewardFor(1e6).berries, 4);
  assert.equal(C.rewardFor('x').score, 0);
  assert.equal(C.rewardFor(-5).score, 0);
  // what falls: more poop and stars late in the round
  const count = (t) => { const n = {}; for (let i = 0; i < 1000; i++) { const k = C.pickItem(i / 1000, t); n[k] = (n[k] || 0) + 1; } return n; };
  const early = count(0), late = count(1);
  assert.ok(late.poop > early.poop && late.star > early.star && late.berry < early.berry);
  for (const k of Object.keys(early)) assert.ok(k in C.POINTS, k);
  // limits: 6 rounds a day, 2 an hour
  const data = fresh();
  const day = '2026-10-18', t0 = Date.parse('2026-10-18T10:00:00');
  assert.equal(Limits.use(data, 'catch', day, t0), true);
  assert.equal(Limits.use(data, 'catch', day, t0 + 1), true);
  assert.equal(Limits.blocked(Limits.info(data, 'catch', day, t0 + 2)), 'rest');
  assert.equal(Limits.LIMITS.catch.day, 6);
});

test('Memory Match: dealing, rewards, limits', () => {
  const M = require('../src/shared/memory-rules');
  const Limits = require('../src/main/limits');
  // each face twice, in some order
  const cards = M.deal([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.equal(cards.length, 16);
  for (let d = 1; d <= 8; d++) assert.equal(cards.filter((c) => c === d).length, 2);
  assert.ok(!cards.includes(9));
  // fewer turns, more berries; fewer than 8 can't be real and counts as 8
  assert.deepEqual(M.rewardFor(8), { turns: 8, berries: 4, xp: 40, mood: 6 });
  assert.equal(M.rewardFor(3).turns, 8);
  assert.equal(M.rewardFor(16).berries, 3);
  assert.equal(M.rewardFor(20).berries, 2);
  assert.equal(M.rewardFor(60).berries, 1);
  assert.equal(M.rewardFor(60).xp, 10);
  // limits: 6 games a day, 2 an hour
  const data = fresh();
  const day = '2026-10-18', t0 = Date.parse('2026-10-18T10:00:00');
  assert.equal(Limits.use(data, 'memory', day, t0), true);
  assert.equal(Limits.use(data, 'memory', day, t0 + 1), true);
  assert.equal(Limits.blocked(Limits.info(data, 'memory', day, t0 + 2)), 'rest');
  assert.equal(Limits.LIMITS.memory.day, 6);
});

test('Type Match-up: questions, answers, rewards, limits', () => {
  const Q = require('../src/main/typequiz');
  const TypeChart = require('../src/main/typechart');
  const Limits = require('../src/main/limits');
  // the games' wording
  assert.equal(Q.categoryOf(0), 'none');
  assert.equal(Q.categoryOf(0.25), 'weak');
  assert.equal(Q.categoryOf(1), 'normal');
  assert.equal(Q.categoryOf(4), 'super');
  // a round: 10 questions, single types first, then two different types; the answer fits the chart
  const r = Q.round();
  assert.equal(r.length, Q.ROUND);
  r.forEach((q, i) => {
    assert.equal(q.def.length, i >= Q.DUAL_FROM ? 2 : 1);
    if (q.def.length === 2) assert.notEqual(q.def[0], q.def[1]);
    assert.equal(q.mult, TypeChart.effectiveness(q.atk, q.def));
    assert.equal(q.answer, Q.categoryOf(q.mult));
    assert.ok(Q.CHOICES.includes(q.answer));
  });
  // rewards: a berry for every 3 right, one more for a perfect round
  assert.deepEqual(Q.rewardFor(0), { right: 0, berries: 0, xp: 0, mood: 0 });
  assert.deepEqual(Q.rewardFor(7), { right: 7, berries: 2, xp: 28, mood: 6 });
  assert.equal(Q.rewardFor(10).berries, 4);
  assert.equal(Q.rewardFor(99).right, 10);
  const data = fresh();
  const day = '2026-10-18', t0 = Date.parse('2026-10-18T10:00:00');
  assert.equal(Limits.use(data, 'types', day, t0), true);
  assert.equal(Limits.use(data, 'types', day, t0 + 1), true);
  assert.equal(Limits.blocked(Limits.info(data, 'types', day, t0 + 2)), 'rest');
});

test('Voltorb Flip: boards, hints, clearing, rewards, limits', () => {
  const V = require('../src/main/voltorb');
  const Limits = require('../src/main/limits');
  for (let n = 0; n < 50; n++) {
    const cards = V.deal();
    assert.equal(cards.length, 25);
    const count = (v) => cards.filter((c) => c === v).length;
    assert.ok(V.LAYOUTS.some(([a, b, c]) => count(2) === a && count(3) === b && count(0) === c));
    // the hints add up to the board
    const h = V.hints(cards);
    assert.equal(h.rows.reduce((s, r) => s + r.sum, 0), cards.reduce((s, c) => s + c, 0));
    assert.equal(h.cols.reduce((s, r) => s + r.volts, 0), count(0));
  }
  const cards = [2, 1, 0, 3, 1, ...Array(20).fill(1)];
  const up = cards.map(() => false);
  assert.equal(V.coinsOf(cards, up), 1);
  up[0] = true;
  assert.equal(V.cleared(cards, up), false);
  up[3] = true;
  assert.equal(V.cleared(cards, up), true);
  assert.equal(V.coinsOf(cards, up), 6);
  assert.deepEqual(V.rewardFor(false, 6), { won: false, berries: 0, xp: 6, mood: 2 });
  assert.equal(V.rewardFor(true, 6).berries, 3);
  assert.equal(V.rewardFor(true, 54).berries, 4);
  const data = fresh();
  const day = '2026-10-18', t0 = Date.parse('2026-10-18T10:00:00');
  assert.equal(Limits.use(data, 'flip', day, t0), true);
  assert.equal(Limits.use(data, 'flip', day, t0 + 1), true);
  assert.equal(Limits.blocked(Limits.info(data, 'flip', day, t0 + 2)), 'rest');
});

test('Fire-Water-Grass: the type triangle, rewards, limits', () => {
  const R = require('../src/main/rps');
  const Limits = require('../src/main/limits');
  const TypeChart = require('../src/main/typechart');
  assert.equal(R.outcome('fire', 'grass'), 'win');
  assert.equal(R.outcome('grass', 'water'), 'win');
  assert.equal(R.outcome('water', 'fire'), 'win');
  assert.equal(R.outcome('grass', 'fire'), 'lose');
  assert.equal(R.outcome('water', 'water'), 'draw');
  // the same triangle as the type chart
  for (const a of R.MOVES) for (const b of R.MOVES) if (R.outcome(a, b) === 'win') assert.equal(TypeChart.effectiveness(a, [b]), 2);
  assert.deepEqual(R.rewardFor(true), { won: true, berries: 3, xp: 20, mood: 6 });
  assert.equal(R.rewardFor(false).berries, 1);
  assert.ok(R.MOVES.includes(R.throwOf()));
  const data = fresh();
  const day = '2026-10-18', t0 = Date.parse('2026-10-18T10:00:00');
  for (let i = 0; i < 3; i++) assert.equal(Limits.use(data, 'rps', day, t0 + i), true);
  assert.equal(Limits.blocked(Limits.info(data, 'rps', day, t0 + 5)), 'rest');
  assert.equal(Limits.LIMITS.rps.day, 8);
});

test('Chatot Echo: tunes, answers, rewards, limits', () => {
  const E = require('../src/main/echo');
  const Limits = require('../src/main/limits');
  assert.deepEqual(E.PADS, ['fire', 'water', 'grass', 'electric']);
  for (let i = 0; i < 50; i++) assert.ok(E.PADS.includes(E.stepOf()));
  assert.equal(E.stepOf(() => 0), 'fire');
  assert.equal(E.stepOf(() => 0.999), 'electric');
  assert.equal(E.matches(['fire', 'grass'], ['fire', 'grass']), true);
  assert.equal(E.matches(['fire', 'grass'], ['fire', 'water']), false);
  assert.equal(E.matches(['fire', 'grass'], ['fire']), false);
  assert.equal(E.matches(['fire'], 'fire'), false);
  // quicker as the tune grows, never too quick
  assert.ok(E.noteMs(1) > E.noteMs(10));
  assert.ok(E.noteMs(E.MAX) >= 260);
  assert.deepEqual([0, 1, 4, 7, 10, 14, 15].map((n) => E.rewardFor(n).berries), [0, 1, 2, 3, 4, 4, 5]);
  assert.equal(E.rewardFor(E.MAX).won, true);
  assert.equal(E.rewardFor(E.MAX - 1).won, false);
  const data = fresh();
  const day = '2026-10-18', t0 = Date.parse('2026-10-18T10:00:00');
  for (let i = 0; i < 2; i++) assert.equal(Limits.use(data, 'echo', day, t0 + i), true);
  assert.equal(Limits.blocked(Limits.info(data, 'echo', day, t0 + 5)), 'rest');
  assert.equal(Limits.LIMITS.echo.day, 6);
});

test('Whack-a-Diglett: points, rewards, limits', () => {
  const W = require('../src/shared/whack-rules');
  const Limits = require('../src/main/limits');
  assert.deepEqual(W.rewardFor(0), { score: 0, berries: 0, xp: 0, mood: 0 });
  assert.deepEqual(W.rewardFor(16), { score: 16, berries: 2, xp: 32, mood: 6 });
  assert.equal(W.rewardFor(1e6).score, W.MAX_SCORE);
  assert.equal(W.rewardFor(1e6).berries, 4);
  assert.equal(W.rewardFor('x').score, 0);
  // more Voltorb late in the round, and everyone ducks quicker
  const count = (t) => { const n = {}; for (let i = 0; i < 1000; i++) { const k = W.pickMole(i / 1000, t); n[k] = (n[k] || 0) + 1; } return n; };
  assert.ok(count(1).voltorb > count(0).voltorb);
  for (const k of Object.keys(count(0))) assert.ok(k in W.POINTS, k);
  assert.ok(W.upTime(1) < W.upTime(0));
  const data = fresh();
  const day = '2026-10-18', t0 = Date.parse('2026-10-18T10:00:00');
  assert.equal(Limits.use(data, 'whack', day, t0), true);
  assert.equal(Limits.use(data, 'whack', day, t0 + 1), true);
  assert.equal(Limits.blocked(Limits.info(data, 'whack', day, t0 + 2)), 'rest');
});
