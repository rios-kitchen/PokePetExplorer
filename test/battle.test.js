// Abilities, held items, weather, terrain, one-hit KO moves, trapping and Substitute in battle.js.
const test = require('node:test');
const assert = require('node:assert');
const Battle = require('../src/main/battle');

const seq = (...v) => { let i = 0; return () => v[Math.min(i++, v.length - 1)]; };
const BASE = { hp: 45, atk: 49, def: 49, spa: 65, spd: 65, spe: 45 };
const mv = (id, type, power, cls = 'physical', extra = {}) => ({
  id, names: { en: id, zh: id }, type, power, acc: 100, cls, category: power ? 'damage' : 'unique', target: 'selected-pokemon',
  priority: 0, ailment: 'none', ailmentChance: 0, stats: [], statChance: 0, healing: 0, drain: 0, minHits: 1, maxHits: 1, ...extra
});
const mon = (key, level, types, moves, extra = {}) => Battle.makeMon({ key, dex: 1, names: { en: key, zh: key }, level, types, base: BASE, moves, ...extra });
const splash = mv('splash', 'normal', 0, 'status', { category: 'net-good-stats', target: 'user', stats: [{ stat: 'def', change: 1 }] });
const tackle = mv('tackle', 'normal', 40);
const ember = mv('ember', 'fire', 40, 'special');
const waterGun = mv('water-gun', 'water', 40, 'special');
const fight = (party, wild, extra) => Battle.create({ party: Array.isArray(party) ? party : [party], wild, ...extra });
const dealt = (events, side) => events.filter((e) => e.t === 'move' && e.side === side).reduce((s, e) => s + e.dmg, 0);

test('pinch abilities power up moves of their type at a third of HP or less', () => {
  const run = (ability, hp) => {
    const a = mon('a', 30, ['fire'], [ember], { ability });
    if (hp) a.hp = hp;
    const b = fight(a, mon('w', 30, ['normal'], [splash]));
    return dealt(Battle.act(b, { type: 'move', index: 0 }, seq(0.5)), 'me');
  };
  assert.ok(run('blaze', 10) > run('blaze', null));
  assert.equal(run(null, 10), run(null, null));
});

test('Intimidate lowers the other one\'s Attack when it comes out; Clear Body stops it', () => {
  let b = fight(mon('a', 20, ['normal'], [tackle], { ability: 'intimidate' }), mon('w', 20, ['normal'], [splash]));
  const ev = Battle.begin(b);
  assert.ok(ev.some((e) => e.t === 'ability' && e.side === 'me'));
  assert.equal(b.wild.stages.atk, -1);
  b = fight(mon('a', 20, ['normal'], [tackle], { ability: 'intimidate' }), mon('w', 20, ['normal'], [splash], { ability: 'clear-body' }));
  Battle.begin(b);
  assert.equal(b.wild.stages.atk, 0);
});

test('Levitate and Water Absorb make moves miss out; Flash Fire powers up fire', () => {
  const quake = mv('earthquake', 'ground', 100);
  let b = fight(mon('a', 30, ['ground'], [quake]), mon('w', 30, ['normal'], [splash], { ability: 'levitate' }));
  let ev = Battle.act(b, { type: 'move', index: 0 }, seq(0.5));
  assert.equal(b.wild.hp, b.wild.maxHp);
  assert.ok(ev.some((e) => e.t === 'ability' && e.what === 'immune'));
  const w = mon('w', 30, ['normal'], [splash], { ability: 'water-absorb' });
  w.hp = 10;
  b = fight(mon('a', 30, ['water'], [waterGun]), w);
  Battle.act(b, { type: 'move', index: 0 }, seq(0.5));
  assert.ok(w.hp > 10, 'healed by water');
  const f = mon('f', 30, ['fire'], [ember], { ability: 'flash-fire' });
  b = fight(f, mon('w', 30, ['fire'], [ember]));
  Battle.act(b, { type: 'move', index: 0 }, seq(0.5));
  assert.equal(f.flashFire, true);
});

test('Static can paralyse on contact; Sturdy and Focus Sash survive a knock-out blow from full HP', () => {
  let b = fight(mon('a', 30, ['normal'], [tackle]), mon('w', 30, ['electric'], [splash], { ability: 'static' }));
  Battle.act(b, { type: 'move', index: 0 }, seq(0.5, 0.5, 0.1));
  assert.equal(b.party[0].status && b.party[0].status.id, 'paralysis');
  const big = mv('giga-impact', 'normal', 150);
  for (const extra of [{ ability: 'sturdy' }, { item: 'focussash' }]) {
    const w = mon('w', 5, ['normal'], [splash], extra);
    b = fight(mon('a', 60, ['normal'], [big]), w);
    Battle.act(b, { type: 'move', index: 0 }, seq(0.5));
    assert.equal(w.hp, 1, JSON.stringify(extra));
  }
  assert.equal(b.wild.item, null, 'the sash is used up');
});

test('held items: Leftovers heal, Sitrus heals at half, Lum cures, type boosters and Life Orb hit harder', () => {
  let a = mon('a', 30, ['normal'], [splash], { item: 'leftovers' });
  a.hp = 20;
  let b = fight(a, mon('w', 30, ['normal'], [splash]));
  Battle.act(b, { type: 'move', index: 0 }, seq(0.5));
  assert.ok(a.hp > 20);

  a = mon('a', 30, ['normal'], [splash], { item: 'sitrus' });
  b = fight(a, mon('w', 60, ['normal'], [tackle]));
  Battle.act(b, { type: 'move', index: 0 }, seq(0.5));
  assert.equal(a.item, null, 'eaten after dropping to half');

  a = mon('a', 30, ['normal'], [splash], { item: 'lum' });
  const spore = mv('spore', 'grass', 0, 'status', { category: 'ailment', ailment: 'sleep' });
  b = fight(a, mon('w', 30, ['grass'], [spore]));
  Battle.act(b, { type: 'move', index: 0 }, seq(0.5));
  assert.equal(a.status, null);
  assert.equal(a.item, null);

  const hit = (item) => dealt(Battle.act(fight(mon('a', 30, ['water'], [ember], { item }), mon('w', 30, ['normal'], [splash])), { type: 'move', index: 0 }, seq(0.5)), 'me');
  assert.ok(hit('charcoal') > hit(null));
  assert.equal(hit('mysticwater'), hit(null), 'only boosts its own type');
  const lo = mon('a', 30, ['fire'], [ember], { item: 'lifeorb' });
  Battle.act(fight(lo, mon('w', 30, ['normal'], [splash])), { type: 'move', index: 0 }, seq(0.5));
  assert.ok(lo.hp < lo.maxHp, 'Life Orb costs HP');
});

test('Choice items lock the Pokémon into its first move', () => {
  const a = mon('a', 30, ['normal'], [tackle, ember], { item: 'choiceband' });
  const b = fight(a, mon('w', 30, ['normal'], [splash]));
  Battle.act(b, { type: 'move', index: 0 }, seq(0.5));
  assert.deepEqual(Battle.act(b, { type: 'move', index: 1 }, seq(0.5)), [], 'locked');
  assert.ok(Battle.act(b, { type: 'move', index: 0 }, seq(0.5)).length);
});

test('weather: rain powers up water and weakens fire, sandstorm hurts, it wears off after 5 turns', () => {
  const rain = mv('rain-dance', 'water', 0, 'status', { category: 'whole-field-effect', target: 'entire-field', acc: null });
  const a = mon('a', 30, ['water'], [rain, waterGun, ember]);
  const b = fight(a, mon('w', 30, ['normal'], [splash]));
  const dry = dealt(Battle.act(fight(mon('a', 30, ['water'], [waterGun]), mon('w', 30, ['normal'], [splash])), { type: 'move', index: 0 }, seq(0.5)), 'me');
  const ev = Battle.act(b, { type: 'move', index: 0 }, seq(0.5));
  assert.ok(ev.some((e) => e.t === 'weather' && e.weather === 'rain'));
  assert.equal(Battle.weatherOf(b), 'rain');
  b.wild.hp = b.wild.maxHp;
  assert.ok(dealt(Battle.act(b, { type: 'move', index: 1 }, seq(0.5)), 'me') > dry);
  for (let i = 0; i < 5 && Battle.weatherOf(b); i++) { b.wild.hp = b.wild.maxHp; Battle.act(b, { type: 'move', index: 2 }, seq(0.5)); }
  assert.equal(Battle.weatherOf(b), null);

  const sand = fight(mon('a', 30, ['normal'], [splash]), mon('w', 30, ['rock'], [splash]), { weather: 'sand' });
  const evs = Battle.act(sand, { type: 'move', index: 0 }, seq(0.5));
  assert.ok(evs.some((e) => e.t === 'weatherHurt' && e.side === 'me'));
  assert.ok(!evs.some((e) => e.t === 'weatherHurt' && e.side === 'wild'), 'rock types are fine');
  assert.equal(sand.field.weather.turns, Infinity, 'the real weather lasts');
});

test('Drizzle starts rain; Swift Swim doubles speed in it', () => {
  const fast = mon('w', 30, ['water'], [tackle], { ability: 'drizzle' });
  const swimmer = mon('a', 30, ['water'], [tackle], { ability: 'swift-swim' });
  swimmer.stats.spe = 30; fast.stats.spe = 50;
  const b = fight(swimmer, fast);
  Battle.begin(b);
  assert.equal(Battle.weatherOf(b), 'rain');
  const order = Battle.act(b, { type: 'move', index: 0 }, seq(0.5)).filter((e) => e.t === 'move').map((e) => e.side);
  assert.equal(order[0], 'me');
});

test('terrain: Electric Terrain powers electric moves and stops sleep; Misty Terrain stops conditions', () => {
  const et = mv('electric-terrain', 'electric', 0, 'status', { category: 'whole-field-effect', target: 'entire-field', acc: null });
  const spark = mv('thunder-shock', 'electric', 40, 'special');
  const spore = mv('spore', 'grass', 0, 'status', { category: 'ailment', ailment: 'sleep' });
  const b = fight(mon('a', 30, ['electric'], [et, spark]), mon('w', 30, ['grass'], [spore]));
  b.party[0].stats.spe = 999;
  Battle.act(b, { type: 'move', index: 0 }, seq(0.5));
  assert.equal(b.field.terrain.id, 'electric');
  assert.equal(b.party[0].status, null, 'no sleep on Electric Terrain');
  const plain = dealt(Battle.act(fight(mon('a', 30, ['electric'], [spark]), mon('w', 30, ['water'], [splash])), { type: 'move', index: 0 }, seq(0.5)), 'me');
  const b2 = fight(mon('a', 30, ['electric'], [spark], { ability: 'electric-surge' }), mon('w', 30, ['water'], [splash]));
  Battle.begin(b2);
  assert.ok(dealt(Battle.act(b2, { type: 'move', index: 0 }, seq(0.5)), 'me') > plain);

  const toxic = mv('poison-powder', 'poison', 0, 'status', { category: 'ailment', ailment: 'poison' });
  const b3 = fight(mon('a', 30, ['normal'], [splash], { ability: 'misty-surge' }), mon('w', 30, ['grass'], [toxic]));
  Battle.begin(b3);
  Battle.act(b3, { type: 'move', index: 0 }, seq(0.5));
  assert.equal(b3.party[0].status, null);
});

test('one-hit KO moves: knock out when they hit, fail on higher levels, Sturdy stops them', () => {
  const fissure = mv('fissure', 'ground', 0, 'physical', { category: 'ohko', acc: 30 });
  let b = fight(mon('a', 40, ['ground'], [fissure]), mon('w', 30, ['normal'], [splash]));
  Battle.act(b, { type: 'move', index: 0 }, seq(0.1));
  assert.equal(b.over, 'win');
  b = fight(mon('a', 20, ['ground'], [fissure]), mon('w', 30, ['normal'], [splash]));
  assert.ok(Battle.act(b, { type: 'move', index: 0 }, seq(0.1)).some((e) => e.t === 'fail'));
  b = fight(mon('a', 40, ['ground'], [fissure]), mon('w', 30, ['normal'], [splash], { ability: 'sturdy' }));
  Battle.act(b, { type: 'move', index: 0 }, seq(0.1));
  assert.equal(b.wild.hp, b.wild.maxHp);
  b = fight(mon('a', 40, ['ground'], [fissure]), mon('w', 30, ['flying'], [splash]));
  Battle.act(b, { type: 'move', index: 0 }, seq(0.1));
  assert.equal(b.wild.hp, b.wild.maxHp, 'ground moves don\'t touch flying types');
});

test('trapping moves hurt every turn and stop running and switching; Mean Look too', () => {
  const wrap = mv('wrap', 'normal', 15, 'physical', { category: 'damage+ailment', ailment: 'trap', ailmentChance: 100 });
  const b = fight([mon('a', 30, ['normal'], [splash]), mon('c', 30, ['normal'], [splash])], mon('w', 30, ['normal'], [wrap]));
  const ev = Battle.act(b, { type: 'move', index: 0 }, seq(0.5));
  assert.ok(ev.some((e) => e.t === 'bound' && e.side === 'me'));
  assert.ok(ev.some((e) => e.t === 'boundHurt' && e.side === 'me'));
  const tr = Battle.act(b, { type: 'run' }, seq(0.01));
  assert.equal(tr[0].t, 'trapped');
  assert.equal(b.over, null);
  assert.equal(Battle.act(b, { type: 'switch', to: 1 }, seq(0.5))[0].t, 'trapped');
  for (let i = 0; i < 8 && b.party[0].bound; i++) Battle.act(b, { type: 'move', index: 0 }, seq(0.99));
  assert.equal(b.party[0].bound, null, 'it lets go after a few turns');

  const look = mv('mean-look', 'normal', 0, 'status', { category: 'unique', acc: null });
  const b2 = fight(mon('a', 30, ['normal'], [splash]), mon('w', 30, ['normal'], [look]));
  Battle.act(b2, { type: 'move', index: 0 }, seq(0.5));
  assert.equal(Battle.trappedBy(b2), 'blocked');
  const g = fight(mon('a', 30, ['ghost'], [splash]), mon('w', 30, ['normal'], [look]));
  Battle.act(g, { type: 'move', index: 0 }, seq(0.5));
  assert.equal(Battle.trappedBy(g), null, 'ghosts slip away');
});

test('Substitute takes the hits and blocks status moves, then breaks', () => {
  const sub = mv('substitute', 'normal', 0, 'status', { category: 'unique', target: 'user', acc: null });
  const spore = mv('spore', 'grass', 0, 'status', { category: 'ailment', ailment: 'sleep' });
  const a = mon('a', 30, ['normal'], [sub, splash]);
  a.stats.spe = 999;
  const b = fight(a, mon('w', 30, ['grass'], [spore]));
  const ev = Battle.act(b, { type: 'move', index: 0 }, seq(0.5));
  assert.ok(ev.some((e) => e.t === 'sub'));
  assert.equal(a.hp, a.maxHp - Math.floor(a.maxHp / 4));
  assert.equal(a.status, null, 'spore hit the substitute');
  assert.ok(Battle.act(b, { type: 'move', index: 0 }, seq(0.5)).some((e) => e.t === 'fail'), 'only one at a time');
  b.wild.moves = [mv('mega-punch', 'normal', 120)];
  const hp = a.hp;
  let broke = false;
  for (let i = 0; i < 6 && !broke; i++) broke = Battle.act(b, { type: 'move', index: 1 }, seq(0.5)).some((e) => e.t === 'subBreak');
  assert.ok(broke);
  assert.equal(a.hp, hp, 'the substitute took the damage');
});

test('wild abilities and held items are picked from the games\' data', () => {
  const abilities = [{ id: 'overgrow', hidden: false }, { id: 'chlorophyll', hidden: true }];
  assert.equal(Battle.pickAbility(abilities, () => 0.5), 'overgrow');
  assert.equal(Battle.pickAbility(abilities, () => 0.01), 'chlorophyll', 'now and then the hidden one');
  assert.equal(Battle.pickAbility([], () => 0.5), null);
  assert.equal(Battle.pickWildItem([['leftovers', 5]], () => 0.01), 'leftovers');
  assert.equal(Battle.pickWildItem([['leftovers', 5]], () => 0.5), null);
  assert.equal(Battle.pickWildItem([['nugget', 100]], () => 0), null, 'items battles don\'t use are left out');
  assert.equal(mon('x', 5, ['normal'], [tackle], { item: 'nugget' }).item, null);
});

test('a thousand random battles with abilities, items, weather and terrain never break', () => {
  const ab = [...Battle.ABILITIES, null];
  const items = [...Object.keys(Battle.HELD), null];
  const moves = [tackle, ember, waterGun, mv('wrap', 'normal', 15, 'physical', { category: 'damage+ailment', ailment: 'trap', ailmentChance: 100 }),
    mv('rain-dance', 'water', 0, 'status', { target: 'entire-field', acc: null }), mv('sandstorm', 'rock', 0, 'status', { target: 'entire-field', acc: null }),
    mv('grassy-terrain', 'grass', 0, 'status', { target: 'entire-field', acc: null }), mv('substitute', 'normal', 0, 'status', { target: 'user', acc: null }),
    mv('fissure', 'ground', 0, 'physical', { category: 'ohko', acc: 30 }), mv('thunder-wave', 'electric', 0, 'status', { category: 'ailment', ailment: 'paralysis', acc: 90 }),
    mv('double-edge', 'normal', 120, 'physical', { drain: -33 }), mv('mean-look', 'normal', 0, 'status', { acc: null }),
    mv('quick-attack', 'normal', 40, 'physical', { priority: 1 }), mv('fury-attack', 'normal', 15, 'physical', { minHits: 2, maxHits: 5 })];
  const types = ['normal', 'fire', 'water', 'grass', 'electric', 'rock', 'ghost', 'flying', 'ice', 'poison', 'steel', 'ground'];
  let r = 12345;
  const rnd = () => { r = (r * 1103515245 + 12345) % 2147483648; return r / 2147483648; };
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const rmon = (k) => mon(k, 5 + Math.floor(rnd() * 60), [pick(types)], [pick(moves), pick(moves), pick(moves), pick(moves)], { ability: pick(ab), item: pick(items) });
  for (let n = 0; n < 1000; n++) {
    const b = fight([rmon('a'), rmon('b')], rmon('w'), { weather: rnd() < 0.2 ? pick(['rain', 'sun', 'sand', 'hail', 'snow']) : null });
    Battle.begin(b);
    for (let t = 0; t < 80 && !b.over; t++) {
      if (b.needSwitch) Battle.act(b, { type: 'switch', to: b.party.findIndex((p) => !p.fainted) }, rnd);
      else if (rnd() < 0.1) Battle.act(b, { type: 'switch', to: 1 - b.active }, rnd);
      else {
        const locked = b.party[b.active].locked;
        const i = locked ? b.party[b.active].moves.findIndex((m) => m.id === locked) : Math.floor(rnd() * 4);
        Battle.act(b, { type: 'move', index: i }, rnd);
      }
      for (const m of [...b.party, b.wild]) {
        assert.ok(m.hp >= 0 && m.hp <= m.maxHp && Number.isInteger(m.hp), `hp ${m.hp}/${m.maxHp}`);
        assert.ok(m.sub >= 0);
      }
    }
  }
});
