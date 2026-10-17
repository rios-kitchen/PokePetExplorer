// Turn-based 1-on-1 battles against wild Pokémon, after the main games but simplified:
// stats from base stats and level, the 18-type chart, same-type bonus, critical hits, stat stages (−6…+6),
// status conditions (burn, poison, paralysis, freeze, sleep, confusion), status moves, healing and draining
// moves, priority and multi-hit moves, switching between up to six party members, items, catching –
// plus abilities, held items, weather, terrain, one-hit KO moves, trapping moves and Substitute.
// Pure functions: every random roll goes through `rnd`, so battles can be tested and simulated.
const { effectiveness } = require('./typechart');

// ---------------------------------------------------------------- building a battler
/** Stats at a level (IVs 15 for raised Pokémon, lower for wild ones, no EVs), plus small bonuses from the
 *  contest stats (up to +10 %). */
function statsFor(base, level, attrs = {}, iv = 15) {
  const st = (b) => Math.floor(((2 * b + iv) * level) / 100) + 5;
  const bonus = (v) => 1 + Math.min(0.1, (v || 0) / 300);
  return {
    hp: Math.floor(((2 * base.hp + iv) * level) / 100) + level + 10 + Math.round((attrs.tough || 0) / 10),
    atk: Math.round(st(base.atk) * bonus(attrs.cool)),
    def: Math.round(st(base.def) * bonus(attrs.tough)),
    spa: Math.round(st(base.spa) * bonus(attrs.smart)),
    spd: Math.round(st(base.spd) * bonus(attrs.tough)),
    spe: Math.round(st(base.spe) * bonus(attrs.cool))
  };
}

/**
 * A battler: { key, dex, names, level, types, stats, hp, maxHp, moves, status, shiny, accBonus, ability, item }.
 * ability: an ability id ('overgrow' …) or null; abilityNames: { en, zh } for the window; item: a held item id or null.
 */
function makeMon({ key, dex, names, level, types, base, moves, attrs, shiny, wild, ability = null, abilityNames = null, item = null }) {
  const stats = statsFor(base, level, attrs, wild ? WILD_IV : 15);
  return {
    key, dex, names, level, types, stats, maxHp: stats.hp, hp: stats.hp, moves, status: null, stages: freshStages(),
    shiny: !!shiny, accBonus: Math.min(0.1, ((attrs && attrs.cute) || 0) / 300), fainted: false,
    ability, abilityNames, item: HELD[item] ? item : null, heldAtStart: HELD[item] ? item : null,
    sub: 0, bound: null, blocked: false, locked: null, flashFire: false
  };
}

// ---------------------------------------------------------------- stat stages
const freshStages = () => ({ atk: 0, def: 0, spa: 0, spd: 0, spe: 0, acc: 0, eva: 0 });
/** The games' stage multipliers: ×2/8 … ×8/2 for stats, ×3/9 … ×9/3 for accuracy and evasion. */
const stageMul = (n) => (n >= 0 ? (2 + n) / 2 : 2 / (2 - n));
const accMul = (n) => (n >= 0 ? (3 + n) / 3 : 3 / (3 - n));
const stat = (m, k) => m.stats[k] * stageMul((m.stages || {})[k] || 0);
/** Moves that act on the user itself (Swords Dance, Recover …). */
const SELF = new Set(['user', 'users-field', 'user-or-ally', 'user-and-allies', 'all-allies', 'ally', 'entire-field']);

// ---------------------------------------------------------------- abilities and held items
const has = (m, ...ids) => !!m && ids.includes(m.ability);
const holds = (m, id) => !!m && m.item === id;

/**
 * The abilities that do something in these battles (others are shown but have no effect here, like abilities
 * that only matter in double battles or outside battles).
 */
const ABILITIES = new Set([
  // stronger moves
  'overgrow', 'blaze', 'torrent', 'swarm', 'huge-power', 'pure-power', 'guts', 'hustle', 'technician', 'adaptability',
  'sniper', 'super-luck', 'tinted-lens', 'scrappy', 'sheer-force', 'reckless', 'pixilate', 'refrigerate', 'aerilate',
  'solar-power', 'skill-link', 'serene-grace', 'compound-eyes', 'no-guard',
  // tougher
  'thick-fat', 'heatproof', 'multiscale', 'filter', 'solid-rock', 'prism-armor', 'wonder-guard', 'marvel-scale',
  'shell-armor', 'battle-armor', 'sturdy', 'magic-guard', 'rock-head', 'shield-dust', 'sand-veil', 'snow-cloak',
  // type immunities
  'levitate', 'flash-fire', 'water-absorb', 'volt-absorb', 'dry-skin', 'lightning-rod', 'storm-drain', 'sap-sipper', 'motor-drive',
  // conditions
  'insomnia', 'vital-spirit', 'limber', 'immunity', 'water-veil', 'magma-armor', 'own-tempo', 'oblivious', 'leaf-guard',
  'natural-cure', 'shed-skin', 'hydration', 'early-bird', 'synchronize', 'poison-heal', 'quick-feet',
  'static', 'flame-body', 'poison-point', 'effect-spore', 'rough-skin', 'iron-barbs',
  // stat stages
  'intimidate', 'inner-focus', 'clear-body', 'white-smoke', 'full-metal-body', 'hyper-cutter', 'keen-eye', 'big-pecks',
  'contrary', 'simple', 'defiant', 'competitive', 'speed-boost',
  // weather and terrain
  'drizzle', 'drought', 'sand-stream', 'snow-warning', 'cloud-nine', 'air-lock', 'swift-swim', 'chlorophyll', 'sand-rush',
  'slush-rush', 'rain-dish', 'ice-body', 'electric-surge', 'grassy-surge', 'misty-surge', 'psychic-surge', 'overcoat',
  // switching and running
  'regenerator', 'shadow-tag', 'arena-trap', 'run-away'
]);

/**
 * Held items (one per Pokémon). Berries, Focus Sash … are used up; the others stay.
 * boost: a type it powers up by 20 %.
 */
const HELD = {
  leftovers: {}, sitrus: { berry: true }, lum: { berry: true }, cheri: { berry: true, cures: 'paralysis' },
  chesto: { berry: true, cures: 'sleep' }, pecha: { berry: true, cures: 'poison' }, rawst: { berry: true, cures: 'burn' },
  aspear: { berry: true, cures: 'freeze' }, focussash: { once: true }, quickclaw: {}, scopelens: {}, brightpowder: {},
  lifeorb: {}, expertbelt: {}, choiceband: {}, choicespecs: {}, choicescarf: {}, muscleband: {}, wiseglasses: {},
  shellbell: {}, blacksludge: {}, damprock: {}, heatrock: {}, smoothrock: {}, icyrock: {}, terrainextender: {},
  bindingband: {}, gripclaw: {},
  silkscarf: { boost: 'normal' }, charcoal: { boost: 'fire' }, mysticwater: { boost: 'water' }, miracleseed: { boost: 'grass' },
  magnet: { boost: 'electric' }, nevermeltice: { boost: 'ice' }, blackbelt: { boost: 'fighting' }, poisonbarb: { boost: 'poison' },
  softsand: { boost: 'ground' }, sharpbeak: { boost: 'flying' }, twistedspoon: { boost: 'psychic' }, silverpowder: { boost: 'bug' },
  hardstone: { boost: 'rock' }, spelltag: { boost: 'ghost' }, dragonfang: { boost: 'dragon' }, blackglasses: { boost: 'dark' },
  metalcoat: { boost: 'steel' }, fairyfeather: { boost: 'fairy' }
};
/** PokeAPI item names → held item ids (what wild Pokémon may carry). */
const ITEM_FROM_API = {
  leftovers: 'leftovers', 'sitrus-berry': 'sitrus', 'lum-berry': 'lum', 'cheri-berry': 'cheri', 'chesto-berry': 'chesto',
  'pecha-berry': 'pecha', 'rawst-berry': 'rawst', 'aspear-berry': 'aspear', 'focus-sash': 'focussash', 'quick-claw': 'quickclaw',
  'scope-lens': 'scopelens', 'bright-powder': 'brightpowder', 'life-orb': 'lifeorb', 'expert-belt': 'expertbelt',
  'choice-band': 'choiceband', 'choice-specs': 'choicespecs', 'choice-scarf': 'choicescarf', 'muscle-band': 'muscleband',
  'wise-glasses': 'wiseglasses', 'shell-bell': 'shellbell', 'black-sludge': 'blacksludge', 'damp-rock': 'damprock',
  'heat-rock': 'heatrock', 'smooth-rock': 'smoothrock', 'icy-rock': 'icyrock', 'terrain-extender': 'terrainextender',
  'binding-band': 'bindingband', 'grip-claw': 'gripclaw', 'silk-scarf': 'silkscarf', charcoal: 'charcoal',
  'mystic-water': 'mysticwater', 'miracle-seed': 'miracleseed', magnet: 'magnet', 'never-melt-ice': 'nevermeltice',
  'black-belt': 'blackbelt', 'poison-barb': 'poisonbarb', 'soft-sand': 'softsand', 'sharp-beak': 'sharpbeak',
  'twisted-spoon': 'twistedspoon', 'silver-powder': 'silverpowder', 'hard-stone': 'hardstone', 'spell-tag': 'spelltag',
  'dragon-fang': 'dragonfang', 'black-glasses': 'blackglasses', 'metal-coat': 'metalcoat', 'fairy-feather': 'fairyfeather'
};
const CHOICE = { choiceband: 'atk', choicespecs: 'spa', choicescarf: 'spe' };

// ---------------------------------------------------------------- weather and terrain
const WEATHER_MOVES = { 'rain-dance': 'rain', 'sunny-day': 'sun', sandstorm: 'sand', hail: 'hail', snowscape: 'snow', 'chilly-reception': 'snow' };
const WEATHER_ABILITIES = { drizzle: 'rain', drought: 'sun', 'sand-stream': 'sand', 'snow-warning': 'snow' };
const WEATHER_ROCK = { rain: 'damprock', sun: 'heatrock', sand: 'smoothrock', hail: 'icyrock', snow: 'icyrock' };
const TERRAIN_MOVES = { 'electric-terrain': 'electric', 'grassy-terrain': 'grassy', 'misty-terrain': 'misty', 'psychic-terrain': 'psychic' };
const TERRAIN_ABILITIES = { 'electric-surge': 'electric', 'grassy-surge': 'grassy', 'misty-surge': 'misty', 'psychic-surge': 'psychic' };
/** One-hit KO moves; trapping status moves (the target can't run or switch); Substitute. */
const OHKO = new Set(['fissure', 'guillotine', 'horn-drill', 'sheer-cold']);
const BLOCK_MOVES = new Set(['mean-look', 'block', 'spider-web']);
/** Every special move the engine knows by name (pokedata.usable lets these through). */
const SPECIAL_MOVES = new Set([...Object.keys(WEATHER_MOVES), ...Object.keys(TERRAIN_MOVES), ...OHKO, ...BLOCK_MOVES, 'substitute']);

/** The weather now (null when there is none, or when Cloud Nine / Air Lock is on the field). */
function weatherOf(b) {
  const w = b.field && b.field.weather;
  if (!w) return null;
  if ([me(b), b.wild].some((m) => m && m.hp > 0 && has(m, 'cloud-nine', 'air-lock'))) return null;
  return w.id;
}
const terrainOf = (b) => (b.field && b.field.terrain ? b.field.terrain.id : null);
/** On the ground: terrain works on it (not Flying types, not Levitate). */
const grounded = (m) => !m.types.includes('flying') && !has(m, 'levitate');

function setWeather(b, id, by, events, turns) {
  if (b.field.weather && b.field.weather.id === id) return false;
  b.field.weather = { id, turns: turns || (holds(by, WEATHER_ROCK[id]) ? 8 : 5) };
  events.push({ t: 'weather', weather: id });
  return true;
}
function setTerrain(b, id, by, events) {
  if (b.field.terrain && b.field.terrain.id === id) return false;
  b.field.terrain = { id, turns: holds(by, 'terrainextender') ? 8 : 5 };
  events.push({ t: 'terrain', terrain: id });
  return true;
}

// ---------------------------------------------------------------- the battle
/**
 * party: up to 6 of the trainer's battlers (the first one leads); wild: the wild battler;
 * bag: { itemId: count } – what can be used in battle (balls, potions, status medicine, revives);
 * weather: a weather that's there from the start (from the real weather), lasting the whole battle.
 */
function create({ party, wild, bag = {}, weather = null }) {
  return {
    party, wild, active: 0, bag: { ...bag }, used: {}, turn: 0, runs: 0, over: null, needSwitch: false, seen: new Set([0]),
    field: { weather: weather ? { id: weather, turns: Infinity, real: true } : null, terrain: null }
  };
}

const BALLS = { pokeball: 1, greatball: 1.5, ultraball: 2 };
const WILD_IV = 0;
/** A wild Pokémon's level next to the partner's: mostly a little lower (like wild Pokémon in the games). */
const wildLevel = (partnerLevel, rnd = Math.random) => Math.max(2, partnerLevel - 3 + Math.floor(rnd() * 5));
const STATUS_CATCH = { sleep: 2.5, freeze: 2.5, paralysis: 1.5, poison: 1.5, burn: 1.5 };   // as in Gen 5+

const me = (b) => b.party[b.active];
const foeOf = (b, side) => (side === 'me' ? b.wild : me(b));
const monOf = (b, side) => (side === 'me' ? me(b) : b.wild);
const otherSide = (side) => (side === 'me' ? 'wild' : 'me');

/** The move's type after abilities and weather (Pixilate, Weather Ball …). */
function moveType(b, att, mv) {
  if (mv.id === 'weather-ball') return { sun: 'fire', rain: 'water', sand: 'rock', hail: 'ice', snow: 'ice' }[weatherOf(b)] || mv.type;
  if (mv.type === 'normal') {
    const to = { pixilate: 'fairy', refrigerate: 'ice', aerilate: 'flying' }[att.ability];
    if (to) return to;
  }
  return mv.type;
}

/** Type effectiveness including Scrappy (Normal and Fighting moves hit Ghost types). */
function typeEff(att, def, type) {
  let types = def.types;
  if (has(att, 'scrappy') && (type === 'normal' || type === 'fighting')) types = types.filter((t) => t !== 'ghost');
  if (type === 'ground' && !grounded(def)) return 0;
  return effectiveness(type, types);
}

/** Does it have a secondary effect Sheer Force removes? */
const hasSecondary = (mv) => (mv.ailmentChance > 0 && mv.ailment !== 'trap') || (mv.stats && mv.stats.length > 0 && mv.statChance > 0);

function damage(b, att, def, mv, rnd, ev) {
  const physical = mv.cls === 'physical';
  const type = moveType(b, att, mv);
  const weather = weatherOf(b), terrain = terrainOf(b);
  // power
  let power = mv.power;
  if (mv.id === 'weather-ball' && weather) power *= 2;
  if (mv.id === 'solar-beam' && weather && weather !== 'sun') power /= 2;
  if (has(att, 'technician') && power <= 60) power *= 1.5;
  if (type !== mv.type && mv.type === 'normal' && has(att, 'pixilate', 'refrigerate', 'aerilate')) power *= 1.2;
  if (has(att, 'reckless') && mv.drain < 0) power *= 1.2;
  if (has(att, 'sheer-force') && hasSecondary(mv)) power *= 1.3;
  if (type === 'fire' && att.flashFire) power *= 1.5;
  if (terrain && grounded(att) && ({ electric: 'electric', grassy: 'grass', psychic: 'psychic' })[terrain] === type) power *= 1.3;
  if (terrain === 'grassy' && grounded(def) && ['earthquake', 'bulldoze', 'magnitude'].includes(mv.id)) power /= 2;
  if (terrain === 'misty' && grounded(def) && type === 'dragon') power /= 2;
  const held = HELD[att.item] || {};
  if (held.boost === type) power *= 1.2;
  if ((physical && holds(att, 'muscleband')) || (!physical && holds(att, 'wiseglasses'))) power *= 1.1;
  const pinch = { overgrow: 'grass', blaze: 'fire', torrent: 'water', swarm: 'bug' }[att.ability];
  if (pinch === type && att.hp <= att.maxHp / 3) power *= 1.5;
  if (has(def, 'heatproof') && type === 'fire') power /= 2;
  if (has(def, 'dry-skin') && type === 'fire') power *= 1.25;
  // attack and defence (critical hits ignore the attacker's drops and the target's raises)
  let critStage = (holds(att, 'scopelens') ? 1 : 0) + (has(att, 'super-luck') ? 1 : 0);
  const critRoll = rnd();
  const crit = !has(def, 'shell-armor', 'battle-armor') && critRoll < [1 / 24, 1 / 8, 1 / 2][Math.min(2, critStage)];
  const ak = physical ? 'atk' : 'spa', dk = physical ? 'def' : 'spd';
  let A = att.stats[ak] * stageMul(crit ? Math.max(0, att.stages[ak] || 0) : att.stages[ak] || 0);
  let D = def.stats[dk] * stageMul(crit ? Math.min(0, def.stages[dk] || 0) : def.stages[dk] || 0);
  if (physical && has(att, 'huge-power', 'pure-power')) A *= 2;
  if (physical && has(att, 'guts') && att.status && att.status.id !== 'confusion') A *= 1.5;
  if (physical && has(att, 'hustle')) A *= 1.5;
  if (!physical && has(att, 'solar-power') && weather === 'sun') A *= 1.5;
  if (CHOICE[att.item] === ak) A *= 1.5;
  if (has(def, 'thick-fat') && (type === 'fire' || type === 'ice')) A /= 2;
  if (!physical && weather === 'sand' && def.types.includes('rock')) D *= 1.5;
  if (physical && weather === 'snow' && def.types.includes('ice')) D *= 1.5;
  if (physical && has(def, 'marvel-scale') && def.status && def.status.id !== 'confusion') D *= 1.5;
  let dmg = Math.floor(Math.floor((((2 * att.level) / 5 + 2) * power * A) / Math.max(1, D)) / 50) + 2;
  // modifiers
  const w = weather === 'sun' ? { fire: 1.5, water: 0.5 }[type] : weather === 'rain' ? { water: 1.5, fire: 0.5 }[type] : null;
  const stab = att.types.includes(type) ? (has(att, 'adaptability') ? 2 : 1.5) : 1;
  const eff = typeEff(att, def, type);
  const burn = physical && att.status && att.status.id === 'burn' && !has(att, 'guts') ? 0.5 : 1;
  let mod = (w || 1) * stab * eff * (crit ? (has(att, 'sniper') ? 2.25 : 1.5) : 1) * burn;
  if (eff > 1 && has(def, 'filter', 'solid-rock', 'prism-armor')) mod *= 0.75;
  if (eff > 0 && eff < 1 && has(att, 'tinted-lens')) mod *= 2;
  if (eff > 1 && holds(att, 'expertbelt')) mod *= 1.2;
  if (holds(att, 'lifeorb')) mod *= 1.3;
  if (has(def, 'multiscale') && def.hp === def.maxHp) mod *= 0.5;
  dmg = Math.floor(dmg * mod * (0.85 + rnd() * 0.15));
  if (eff > 0) dmg = Math.max(1, dmg);
  ev.eff = eff; ev.crit = crit;
  return dmg;
}

/** Can it act this turn? Handles paralysis, freeze and confusion. Pushes events. */
function canAct(mon, side, rnd, events) {
  const s = mon.status;
  if (!s) return true;
  if (s.id === 'freeze') {
    if (rnd() < 0.2) { mon.status = null; events.push({ t: 'thaw', side }); return true; }
    events.push({ t: 'frozen', side }); return false;
  }
  if (s.id === 'sleep') {
    s.turns -= has(mon, 'early-bird') ? 2 : 1;
    if (s.turns <= 0) { mon.status = null; events.push({ t: 'wake', side }); return true; }
    events.push({ t: 'asleep', side }); return false;
  }
  if (s.id === 'paralysis' && rnd() < 0.25) { events.push({ t: 'paralyzed', side }); return false; }
  if (s.id === 'confusion') {
    s.turns -= 1;
    if (s.turns <= 0) { mon.status = null; events.push({ t: 'unconfused', side }); return true; }
    if (rnd() < 1 / 3) {
      const hit = Math.max(1, Math.floor(((((2 * mon.level) / 5 + 2) * 40 * mon.stats.atk) / mon.stats.def) / 50) + 2);
      mon.hp = Math.max(0, mon.hp - hit);
      events.push({ t: 'confusedHit', side, dmg: hit, hp: mon.hp });
      return false;
    }
  }
  return true;
}

const AILMENTS = new Set(['burn', 'poison', 'paralysis', 'freeze', 'sleep', 'confusion']);
/** Abilities that keep a condition away. */
const AILMENT_GUARD = {
  sleep: ['insomnia', 'vital-spirit'], paralysis: ['limber'], poison: ['immunity'], burn: ['water-veil'],
  freeze: ['magma-armor'], confusion: ['own-tempo', 'oblivious']
};

/**
 * Give a condition, unless it already has one, its type or ability keeps it away, or the terrain or weather does.
 * from: the side that caused it (for Synchronize). Returns true if it took.
 */
function inflictAilment(b, mon, side, ailment, rnd, events, from = null) {
  if (mon.hp <= 0 || mon.status || !AILMENTS.has(ailment)) return false;
  // types are immune to "their own" conditions
  const immune = (ailment === 'burn' && mon.types.includes('fire')) || (ailment === 'freeze' && mon.types.includes('ice'))
    || (ailment === 'poison' && (mon.types.includes('poison') || mon.types.includes('steel')))
    || (ailment === 'paralysis' && mon.types.includes('electric'));
  if (immune) return false;
  const guard = (AILMENT_GUARD[ailment] || []).find((a) => has(mon, a));
  if (guard) { events.push({ t: 'ability', side, what: 'block' }); return false; }
  const weather = weatherOf(b), terrain = terrainOf(b);
  if (ailment === 'freeze' && weather === 'sun') return false;
  if (ailment !== 'confusion' && has(mon, 'leaf-guard') && weather === 'sun') { events.push({ t: 'ability', side, what: 'block' }); return false; }
  if (grounded(mon) && (terrain === 'misty' || (terrain === 'electric' && ailment === 'sleep'))) {
    events.push({ t: 'terrainBlock', side, terrain }); return false;
  }
  const turns = ailment === 'confusion' ? 2 + Math.floor(rnd() * 3) : ailment === 'sleep' ? 1 + Math.floor(rnd() * 3) : 0;
  mon.status = { id: ailment, turns };
  events.push({ t: 'status', side, status: ailment });
  // Synchronize passes burn, poison and paralysis back
  if (from && from !== side && has(mon, 'synchronize') && ['burn', 'poison', 'paralysis'].includes(ailment)) {
    events.push({ t: 'ability', side, what: 'show' });
    inflictAilment(b, monOf(b, from), from, ailment, rnd, events, null);
  }
  checkBerry(mon, side, events);
  return true;
}

/**
 * Raise or lower stat stages (−6…+6). byFoe: the change comes from the other side (abilities like Clear Body and a
 * Substitute stop drops then). Returns true if anything changed.
 */
function changeStats(b, mon, side, changes, events, byFoe = false) {
  if (mon.hp <= 0) return false;
  mon.stages = mon.stages || freshStages();
  if (byFoe && mon.sub > 0 && changes.some((c) => c.change < 0)) { events.push({ t: 'subBlock', side }); return false; }
  let did = false, dropped = false;
  for (const c of changes) {
    const k = c.stat;
    let change = c.change;
    if (has(mon, 'contrary')) change = -change;
    if (has(mon, 'simple')) change *= 2;
    if (byFoe && change < 0) {
      const guard = has(mon, 'clear-body', 'white-smoke', 'full-metal-body') || (k === 'atk' && has(mon, 'hyper-cutter'))
        || (k === 'acc' && has(mon, 'keen-eye')) || (k === 'def' && has(mon, 'big-pecks'));
      if (guard) { events.push({ t: 'ability', side, what: 'block' }); continue; }
    }
    const before = mon.stages[k] || 0;
    const after = Math.max(-6, Math.min(6, before + change));
    if (after === before) { events.push({ t: 'statMax', side, stat: k, up: change > 0 }); continue; }
    mon.stages[k] = after;
    events.push({ t: 'stat', side, stat: k, change: after - before });
    did = true;
    if (after < before) dropped = true;
  }
  // Defiant / Competitive: a drop from the other side sharply raises Attack / Sp. Atk
  if (byFoe && dropped && has(mon, 'defiant', 'competitive')) {
    events.push({ t: 'ability', side, what: 'show' });
    changeStats(b, mon, side, [{ stat: has(mon, 'defiant') ? 'atk' : 'spa', change: 2 }], events);
  }
  return did;
}

function heal(mon, side, amount, events) {
  const before = mon.hp;
  mon.hp = Math.min(mon.maxHp, mon.hp + Math.max(1, Math.round(amount)));
  if (mon.hp > before) { events.push({ t: 'heal', side, hp: mon.hp }); return true; }
  return false;
}

/** HP lost to something other than a move (weather, poison, recoil …); Magic Guard stops it. */
function hurt(mon, side, amount, events, ev) {
  if (mon.hp <= 0 || has(mon, 'magic-guard')) return false;
  mon.hp = Math.max(0, mon.hp - Math.max(1, Math.floor(amount)));
  events.push({ ...ev, side, hp: mon.hp });
  return true;
}

/** Use up the held item (berries, Focus Sash). */
function consume(mon) { mon.item = null; }

/** Berries kick in: Sitrus at half HP or less, Lum and the status berries on a condition. */
function checkBerry(mon, side, events) {
  if (mon.hp <= 0 || !mon.item) return;
  const id = mon.item, item = HELD[id];
  if (id === 'sitrus' && mon.hp <= mon.maxHp / 2) {
    consume(mon);
    events.push({ t: 'held', side, item: id, what: 'berry' });
    heal(mon, side, mon.maxHp / 4, events);
  } else if (mon.status && (id === 'lum' || (item.cures && item.cures === mon.status.id))) {
    consume(mon);
    mon.status = null;
    events.push({ t: 'held', side, item: id, what: 'cure' });
  }
}

/** Hits a Pokémon (or its Substitute) for dmg. Returns { dmg, toSub }. Handles Focus Sash and Sturdy. */
function takeHit(b, def, side, dmg, events, ev) {
  if (def.sub > 0) {
    const d = Math.min(def.sub, dmg);
    def.sub -= d;
    Object.assign(ev, { dmg: d, hp: def.hp, sub: true });
    events.push(ev);
    events.push({ t: 'subHit', side });
    if (def.sub <= 0) events.push({ t: 'subBreak', side });
    return { dmg: d, toSub: true };
  }
  let d = dmg;
  const full = def.hp === def.maxHp;
  let saved = null;
  if (full && d >= def.hp && def.hp > 1) {
    if (has(def, 'sturdy')) saved = 'ability';
    else if (holds(def, 'focussash')) saved = 'item';
    if (saved) d = def.hp - 1;
  }
  def.hp = Math.max(0, def.hp - d);
  Object.assign(ev, { dmg: d, hp: def.hp });
  events.push(ev);
  if (saved === 'ability') events.push({ t: 'ability', side, what: 'endure' });
  if (saved === 'item') { consume(def); events.push({ t: 'held', side, item: 'focussash', what: 'sash' }); }
  return { dmg: d, toSub: false };
}

/**
 * Abilities that stop a move cold by its type (Levitate, Water Absorb, Flash Fire …). Returns true if the move was
 * absorbed (events pushed).
 */
function absorbs(b, att, def, side, type, events) {
  const ab = def.ability;
  const healIt = () => { events.push({ t: 'ability', side, what: 'show' }); if (!heal(def, side, def.maxHp / 4, events)) events.push({ t: 'ability', side, what: 'immune' }); };
  const raise = (k) => { events.push({ t: 'ability', side, what: 'show' }); changeStats(b, def, side, [{ stat: k, change: 1 }], events); };
  if (type === 'ground' && ab === 'levitate') { events.push({ t: 'ability', side, what: 'immune' }); return true; }
  if (type === 'fire' && ab === 'flash-fire') { def.flashFire = true; events.push({ t: 'ability', side, what: 'flashFire' }); return true; }
  if (type === 'water' && (ab === 'water-absorb' || ab === 'dry-skin')) { healIt(); return true; }
  if (type === 'electric' && ab === 'volt-absorb') { healIt(); return true; }
  if (type === 'electric' && ab === 'lightning-rod') { raise('spa'); return true; }
  if (type === 'water' && ab === 'storm-drain') { raise('spa'); return true; }
  if (type === 'grass' && ab === 'sap-sipper') { raise('atk'); return true; }
  if (type === 'electric' && ab === 'motor-drive') { raise('spe'); return true; }
  return false;
}

function useMove(b, side, mv, rnd, events) {
  const att = monOf(b, side);
  const def = foeOf(b, side);
  const other = otherSide(side);
  if (!canAct(att, side, rnd, events)) return;
  if (CHOICE[att.item] && att.locked == null) att.locked = mv.id;
  const onSelf = SELF.has(mv.target) || SPECIAL_SELF.has(mv.id);
  const weather = weatherOf(b);
  const type = moveType(b, att, mv);
  const isOhko = OHKO.has(mv.id) || mv.category === 'ohko';

  // Psychic Terrain: priority moves don't touch a Pokémon on the ground
  if (!onSelf && (mv.priority || 0) > 0 && terrainOf(b) === 'psychic' && grounded(def)) {
    events.push({ t: 'use', side, move: mv.id, names: mv.names, type });
    events.push({ t: 'terrainBlock', side: other, terrain: 'psychic' });
    return;
  }

  // accuracy (with accuracy / evasion stages); moves on itself and "never miss" moves always hit
  if (isOhko) {
    const diff = att.level - def.level;
    const base = mv.id === 'sheer-cold' && !att.types.includes('ice') ? 20 : 30;
    const immune = (mv.id === 'sheer-cold' && def.types.includes('ice')) || typeEff(att, def, type) === 0;
    events.push({ t: 'use', side, move: mv.id, names: mv.names, type });
    if (diff < 0 || immune) { events.push({ t: 'fail' }); return; }
    if (has(def, 'sturdy')) { events.push({ t: 'ability', side: other, what: 'immune' }); return; }
    if (!has(att, 'no-guard') && !has(def, 'no-guard') && rnd() * 100 >= base + diff) { events.push({ t: 'miss', side, move: mv.id, names: mv.names, quiet: true }); return; }
    const ev = { t: 'move', side, move: mv.id, names: mv.names, cls: mv.cls, type, again: true, eff: 1, crit: false, ohko: true };
    if (def.sub > 0) takeHit(b, def, other, def.sub, events, ev);
    else { def.hp = 0; Object.assign(ev, { dmg: def.maxHp, hp: 0 }); events.push(ev); }
    events.push({ t: 'ohko' });
    return;
  }
  if (!onSelf && mv.acc != null && !has(att, 'no-guard') && !has(def, 'no-guard')) {
    const always = (weather === 'rain' && (mv.id === 'thunder' || mv.id === 'hurricane'))
      || ((weather === 'hail' || weather === 'snow') && mv.id === 'blizzard');
    if (!always) {
      const evaStage = has(att, 'keen-eye') ? Math.min(0, (def.stages || {}).eva || 0) : (def.stages || {}).eva || 0;
      const stages = ((att.stages || {}).acc || 0) - evaStage;
      let acc = mv.acc;
      if (weather === 'sun' && (mv.id === 'thunder' || mv.id === 'hurricane')) acc = 50;
      let hitChance = (acc / 100) * accMul(stages);
      if (has(att, 'compound-eyes')) hitChance *= 1.3;
      if (has(att, 'hustle') && mv.cls === 'physical') hitChance *= 0.8;
      if (holds(def, 'brightpowder')) hitChance *= 0.9;
      if ((weather === 'sand' && has(def, 'sand-veil')) || ((weather === 'hail' || weather === 'snow') && has(def, 'snow-cloak'))) hitChance *= 0.8;
      hitChance += side === 'me' ? att.accBonus : 0;
      if (rnd() >= hitChance) { events.push({ t: 'miss', side, move: mv.id, names: mv.names }); return; }
    }
  }

  // status moves: weather, terrain, Substitute, trapping, conditions, stat changes, healing
  if (mv.cls === 'status') {
    events.push({ t: 'use', side, move: mv.id, names: mv.names, type });
    if (WEATHER_MOVES[mv.id]) { if (!setWeather(b, WEATHER_MOVES[mv.id], att, events)) events.push({ t: 'fail' }); return; }
    if (TERRAIN_MOVES[mv.id]) { if (!setTerrain(b, TERRAIN_MOVES[mv.id], att, events)) events.push({ t: 'fail' }); return; }
    if (mv.id === 'substitute') {
      const cost = Math.floor(att.maxHp / 4);
      if (att.sub > 0 || att.hp <= cost) { events.push({ t: 'fail' }); return; }
      att.hp -= cost; att.sub = cost;
      events.push({ t: 'sub', side, hp: att.hp });
      return;
    }
    // moves on the other Pokémon don't get through its Substitute
    if (!onSelf && def.sub > 0) { events.push({ t: 'subBlock', side: other }); return; }
    if (!onSelf && type === 'electric' && mv.id === 'thunder-wave' && absorbs(b, att, def, other, type, events)) return;
    if (BLOCK_MOVES.has(mv.id) || (mv.ailment === 'trap' && !onSelf)) {
      if (def.blocked || def.bound) { events.push({ t: 'fail' }); return; }
      def.blocked = true;
      events.push({ t: 'blocked', side: other });
      return;
    }
    let did = false;
    if (mv.healing > 0) {
      let pct = mv.healing;
      if (['synthesis', 'morning-sun', 'moonlight'].includes(mv.id) && weather) pct = weather === 'sun' ? 66.7 : 25;
      did = heal(att, side, (att.maxHp * pct) / 100, events) || did;
    }
    if (mv.stats && mv.stats.length) did = changeStats(b, onSelf ? att : def, onSelf ? side : other, mv.stats, events, !onSelf) || did;
    if (AILMENTS.has(mv.ailment)) did = inflictAilment(b, onSelf ? att : def, onSelf ? side : other, mv.ailment, rnd, events, side) || did;
    if (!did) events.push({ t: 'fail' });
    return;
  }

  // damaging moves, some hitting several times
  const absorbed = [];
  if (absorbs(b, att, def, other, type, absorbed)) { events.push({ t: 'use', side, move: mv.id, names: mv.names, type }, ...absorbed); return; }
  if (has(def, 'wonder-guard') && typeEff(att, def, type) <= 1) {
    events.push({ t: 'use', side, move: mv.id, names: mv.names, type });
    events.push({ t: 'ability', side: other, what: 'immune' });
    return;
  }
  const maxHits = mv.maxHits || 1, minHits = mv.minHits || 1;
  const hits = maxHits > 1 ? (has(att, 'skill-link') ? maxHits : minHits + Math.floor(rnd() * (maxHits - minHits + 1))) : 1;
  let total = 0, landed = 0, hitSub = false;
  for (let i = 0; i < hits && def.hp > 0; i++) {
    const ev = { t: 'move', side, move: mv.id, names: mv.names, cls: mv.cls, type, again: i > 0 };
    const dmg = damage(b, att, def, mv, rnd, ev);
    const r = takeHit(b, def, other, dmg, events, ev);
    total += r.dmg; landed++;
    if (r.toSub) hitSub = true;
    if (ev.eff === 0) break;
    // touching a Pokémon with Static, Flame Body … (physical moves count as contact here)
    if (!r.toSub && mv.cls === 'physical' && att.hp > 0) contact(b, att, side, def, other, rnd, events);
  }
  if (landed > 1) events.push({ t: 'hits', n: landed });
  // draining moves (Absorb, Giga Drain …) heal the user; negative drain is recoil (Double-Edge …)
  if (mv.drain > 0 && total > 0) heal(att, side, (total * mv.drain) / 100, events);
  if (mv.drain < 0 && total > 0 && !has(att, 'rock-head')) hurt(att, side, Math.max(1, Math.round((total * -mv.drain) / 100)), events, { t: 'recoil' });
  if (total > 0 && holds(att, 'shellbell') && att.hp > 0) { events.push({ t: 'held', side, item: 'shellbell', what: 'heal' }); heal(att, side, total / 8, events); }
  if (total > 0 && holds(att, 'lifeorb') && !(has(att, 'sheer-force') && hasSecondary(mv))) hurt(att, side, att.maxHp / 10, events, { t: 'itemHurt', item: 'lifeorb' });
  checkBerry(def, other, events);
  checkBerry(att, side, events);
  // side effects: a condition, trapping, or stat changes (on the target, or on the user for moves that raise its stats)
  const blocked = hitSub || has(def, 'shield-dust') || (has(att, 'sheer-force') && hasSecondary(mv));
  const chance = (c) => (has(att, 'serene-grace') ? 2 : 1) * c;
  if (def.hp > 0 && mv.ailment === 'trap' && !hitSub && total > 0 && !def.bound) {
    def.bound = { turns: holds(att, 'gripclaw') ? 7 : 4 + Math.floor(rnd() * 2), frac: holds(att, 'bindingband') ? 6 : 8, names: mv.names, by: side };
    events.push({ t: 'bound', side: other, names: mv.names });
  }
  if (!blocked && def.hp > 0 && AILMENTS.has(mv.ailment) && mv.ailmentChance > 0 && rnd() * 100 < chance(mv.ailmentChance)) {
    inflictAilment(b, def, other, mv.ailment, rnd, events, side);
  }
  if (mv.stats && mv.stats.length) {
    const toSelf = mv.category === 'damage-raise' || mv.category === 'damage+raise' || onSelf;
    if ((toSelf || !blocked) && rnd() * 100 < chance(mv.statChance || 100)) {
      changeStats(b, toSelf ? att : def, toSelf ? side : other, mv.stats, events, !toSelf);
    }
  }
}
/** Status moves that act on the user though PokeAPI says otherwise. */
const SPECIAL_SELF = new Set(['substitute', ...Object.keys(WEATHER_MOVES), ...Object.keys(TERRAIN_MOVES)]);

/** After a physical hit: the target's contact abilities (Static, Flame Body, Rough Skin …). */
function contact(b, att, side, def, other, rnd, events) {
  const ab = def.ability;
  if (ab === 'rough-skin' || ab === 'iron-barbs') {
    events.push({ t: 'ability', side: other, what: 'show' });
    hurt(att, side, att.maxHp / 8, events, { t: 'abilityHurt' });
    return;
  }
  const give = { static: 'paralysis', 'flame-body': 'burn', 'poison-point': 'poison' }[ab];
  if (give || ab === 'effect-spore') {
    if (rnd() >= 0.3 || att.status) return;
    if (ab === 'effect-spore' && att.types.includes('grass')) return;
    const ail = give || ['sleep', 'paralysis', 'poison'][Math.floor(rnd() * 3)];
    const ev = [];
    if (inflictAilment(b, att, side, ail, rnd, ev, other)) events.push({ t: 'ability', side: other, what: 'show' }, ...ev);
  }
}

/** The wild Pokémon picks a move: usually the one that hurts most, sometimes any. */
function wildMove(b, rnd) {
  const w = b.wild, target = me(b);
  if (w.locked) { const m = w.moves.find((x) => x.id === w.locked); if (m) return m; }
  if (rnd() < 0.3) return w.moves[Math.floor(rnd() * w.moves.length)];
  return w.moves.slice().sort((x, y) => {
    const v = (m) => m.power * (w.types.includes(m.type) ? 1.5 : 1) * effectiveness(m.type, target.types) * ((m.acc ?? 100) / 100);
    return v(y) - v(x);
  })[0];
}

/** Abilities that act when a Pokémon comes out (Intimidate, Drizzle, Electric Surge …). */
function enter(b, side, events) {
  const m = monOf(b, side), foe = foeOf(b, side), other = otherSide(side);
  if (!m || m.hp <= 0) return;
  if (has(m, 'intimidate') && foe && foe.hp > 0) {
    events.push({ t: 'ability', side, what: 'show' });
    if (has(foe, 'inner-focus', 'oblivious', 'own-tempo', 'scrappy')) events.push({ t: 'ability', side: other, what: 'block' });
    else changeStats(b, foe, other, [{ stat: 'atk', change: -1 }], events, true);
  }
  const w = WEATHER_ABILITIES[m.ability];
  if (w && !(b.field.weather && b.field.weather.id === w)) { events.push({ t: 'ability', side, what: 'show' }); setWeather(b, w, m, events); }
  const tr = TERRAIN_ABILITIES[m.ability];
  if (tr && !(b.field.terrain && b.field.terrain.id === tr)) { events.push({ t: 'ability', side, what: 'show' }); setTerrain(b, tr, m, events); }
  if (has(m, 'cloud-nine', 'air-lock') && b.field.weather) events.push({ t: 'ability', side, what: 'show' });
}

/** What happens at the start of a battle: the real weather, then both Pokémon's abilities (faster one first). */
function begin(b) {
  const events = [];
  if (b.field.weather) events.push({ t: 'weather', weather: b.field.weather.id, real: !!b.field.weather.real });
  const order = speed(b, me(b)) >= speed(b, b.wild) ? ['me', 'wild'] : ['wild', 'me'];
  for (const side of order) enter(b, side, events);
  return events;
}

/** Leaving the field: stat changes, confusion, Substitute, trapping and locks are gone; Natural Cure, Regenerator. */
function leave(b, out) {
  out.stages = freshStages();
  if (out.status && out.status.id === 'confusion') out.status = null;
  if (has(out, 'natural-cure') && out.status) out.status = null;
  if (has(out, 'regenerator') && out.hp > 0) out.hp = Math.min(out.maxHp, out.hp + Math.floor(out.maxHp / 3));
  out.sub = 0; out.bound = null; out.blocked = false; out.locked = null; out.flashFire = false;
  // what it held the wild one with lets go too
  if (b.wild.bound && b.wild.bound.by === 'me') b.wild.bound = null;
  b.wild.blocked = false;
}

/** Speed with paralysis, weather abilities and the Choice Scarf. */
function speed(b, m) {
  let s = stat(m, 'spe');
  const weather = weatherOf(b);
  if (m.status && m.status.id === 'paralysis' && !has(m, 'quick-feet')) s *= 0.5;
  if (has(m, 'quick-feet') && m.status) s *= 1.5;
  if ((weather === 'rain' && has(m, 'swift-swim')) || (weather === 'sun' && has(m, 'chlorophyll'))
    || (weather === 'sand' && has(m, 'sand-rush')) || ((weather === 'hail' || weather === 'snow') && has(m, 'slush-rush'))) s *= 2;
  if (holds(m, 'choicescarf')) s *= 1.5;
  return s;
}

/** Can the trainer's Pokémon get away / be switched out? */
function trappedBy(b) {
  const m = me(b), w = b.wild;
  if (m.types.includes('ghost')) return null;
  if (m.bound) return 'bound';
  if (m.blocked) return 'blocked';
  if (w.hp > 0 && has(w, 'shadow-tag') && !has(m, 'shadow-tag')) return 'ability';
  if (w.hp > 0 && has(w, 'arena-trap') && grounded(m)) return 'ability';
  return null;
}

function endOfTurn(b, events, rnd) {
  const weather = weatherOf(b), terrain = terrainOf(b);
  const both = [['me', me(b)], ['wild', b.wild]];
  // weather
  for (const [side, mon] of both) {
    if (mon.hp <= 0) continue;
    if (weather === 'sand' && !mon.types.some((t) => ['rock', 'ground', 'steel'].includes(t)) && !has(mon, 'sand-veil', 'sand-rush', 'overcoat')) {
      hurt(mon, side, mon.maxHp / 16, events, { t: 'weatherHurt', weather });
    }
    if (weather === 'hail' && !mon.types.includes('ice') && !has(mon, 'ice-body', 'snow-cloak', 'slush-rush', 'overcoat')) {
      hurt(mon, side, mon.maxHp / 16, events, { t: 'weatherHurt', weather });
    }
    const heals = (weather === 'rain' && has(mon, 'rain-dish')) || ((weather === 'hail' || weather === 'snow') && has(mon, 'ice-body'));
    if (heals && mon.hp < mon.maxHp) { events.push({ t: 'ability', side, what: 'show' }); heal(mon, side, mon.maxHp / 16, events); }
    if (has(mon, 'dry-skin') && weather === 'rain' && mon.hp < mon.maxHp) { events.push({ t: 'ability', side, what: 'show' }); heal(mon, side, mon.maxHp / 8, events); }
    if ((has(mon, 'dry-skin') || has(mon, 'solar-power')) && weather === 'sun') hurt(mon, side, mon.maxHp / 8, events, { t: 'abilityHurt' });
    if (has(mon, 'hydration') && weather === 'rain' && mon.status && mon.status.id !== 'confusion') {
      mon.status = null; events.push({ t: 'ability', side, what: 'cure' });
    }
  }
  // Grassy Terrain, Leftovers, Black Sludge
  for (const [side, mon] of both) {
    if (mon.hp <= 0) continue;
    if (terrain === 'grassy' && grounded(mon) && mon.hp < mon.maxHp) { events.push({ t: 'terrainHeal', side }); heal(mon, side, mon.maxHp / 16, events); }
    if ((holds(mon, 'leftovers') || (holds(mon, 'blacksludge') && mon.types.includes('poison'))) && mon.hp < mon.maxHp) {
      events.push({ t: 'held', side, item: mon.item, what: 'heal' });
      heal(mon, side, mon.maxHp / 16, events);
    } else if (holds(mon, 'blacksludge') && !mon.types.includes('poison')) {
      hurt(mon, side, mon.maxHp / 8, events, { t: 'itemHurt', item: 'blacksludge' });
    }
  }
  // conditions
  for (const [side, mon] of both) {
    if (mon.hp <= 0 || !mon.status) continue;
    const id = mon.status.id;
    if (id === 'poison' && has(mon, 'poison-heal')) {
      if (mon.hp < mon.maxHp) { events.push({ t: 'ability', side, what: 'show' }); heal(mon, side, mon.maxHp / 8, events); }
    } else if (id === 'burn' || id === 'poison') {
      hurt(mon, side, mon.maxHp / (id === 'burn' ? 16 : 8), events, { t: 'statusHurt', status: id });
    }
  }
  // trapping moves
  for (const [side, mon] of both) {
    if (mon.hp <= 0 || !mon.bound) continue;
    hurt(mon, side, mon.maxHp / mon.bound.frac, events, { t: 'boundHurt', names: mon.bound.names });
    mon.bound.turns -= 1;
    if (mon.bound.turns <= 0 && mon.hp > 0) { events.push({ t: 'unbound', side, names: mon.bound.names }); mon.bound = null; }
  }
  // Speed Boost, Shed Skin, berries after the damage
  for (const [side, mon] of both) {
    if (mon.hp <= 0) continue;
    if (has(mon, 'speed-boost') && (mon.stages.spe || 0) < 6) { events.push({ t: 'ability', side, what: 'show' }); changeStats(b, mon, side, [{ stat: 'spe', change: 1 }], events); }
    if (has(mon, 'shed-skin') && mon.status && mon.status.id !== 'confusion' && rnd() < 1 / 3) {
      mon.status = null; events.push({ t: 'ability', side, what: 'cure' });
    }
    checkBerry(mon, side, events);
  }
  // weather and terrain wear off
  const w = b.field.weather;
  if (w && w.turns !== Infinity && --w.turns <= 0) { events.push({ t: 'weatherEnd', weather: w.id }); b.field.weather = null; }
  const tr = b.field.terrain;
  if (tr && --tr.turns <= 0) { events.push({ t: 'terrainEnd', terrain: tr.id }); b.field.terrain = null; }
}

/** Check for fainting. Sets b.over / b.needSwitch. */
function checkFaint(b, events) {
  if (b.wild.hp <= 0 && !b.wild.fainted) {
    b.wild.fainted = true;
    events.push({ t: 'faint', side: 'wild' });
    b.over = 'win';
    return true;
  }
  const m = me(b);
  if (m.hp <= 0 && !m.fainted) {
    m.fainted = true;
    events.push({ t: 'faint', side: 'me' });
    if (b.wild.bound && b.wild.bound.by === 'me') b.wild.bound = null;
    b.wild.blocked = false;
    if (b.party.some((p) => !p.fainted)) { b.needSwitch = true; events.push({ t: 'needSwitch' }); } else b.over = 'lose';
    return true;
  }
  return false;
}

/** The catch formula (Gen 3+): returns { shakes 0–3, caught }. */
function tryCatch(wild, ball, rate, rnd) {
  const M = wild.maxHp, H = wild.hp;
  const s = wild.status ? STATUS_CATCH[wild.status.id] || 1 : 1;
  const a = (((3 * M - 2 * H) * rate * (BALLS[ball] || 1)) / (3 * M)) * s;
  if (a >= 255) return { shakes: 3, caught: true };
  const p = 65536 / Math.pow(255 / Math.max(1, a), 0.1875);
  let shakes = 0;
  for (let i = 0; i < 4; i++) { if (rnd() * 65536 >= p) break; shakes++; }
  return { shakes: Math.min(3, shakes), caught: shakes === 4 };
}

const HEAL = { oran: 0.3, potion: 0.6 };
const CURE = { antidote: 'poison', parlyz: 'paralysis', burnheal: 'burn', iceheal: 'freeze', persim: 'confusion', fullheal: 'all' };

/** Switch the trainer's Pokémon in (after a faint or by choice), with its entry ability. */
function switchIn(b, to, events) {
  b.active = to; b.seen.add(to);
  me(b).stages = freshStages();
  events.push({ t: 'switch', to });
  enter(b, 'me', events);
}

/**
 * One turn. action: { type: 'move', index } | { type: 'switch', to } | { type: 'item', item, target? }
 *   | { type: 'ball', ball } | { type: 'run' }.  options.captureRate for balls.
 * Returns the events in order (for the window to play back).
 */
function act(b, action, rnd = Math.random, options = {}) {
  const events = [];
  if (b.over) return events;
  b.field = b.field || { weather: null, terrain: null };

  // forced switch after a faint: free, no wild move
  if (b.needSwitch) {
    if (action.type !== 'switch') return events;
    const to = action.to;
    if (!b.party[to] || b.party[to].fainted) return events;
    b.turn++;
    b.needSwitch = false;
    switchIn(b, to, events);
    return events;
  }

  // held by a trapping move, Mean Look or Shadow Tag: no running away or switching (the turn isn't used)
  if ((action.type === 'run' && !has(me(b), 'run-away')) || action.type === 'switch') {
    const why = trappedBy(b);
    if (why) return [{ t: 'trapped', side: 'me', why, names: (me(b).bound || {}).names || null }];
  }
  b.turn++;

  let wildActs = true;
  if (action.type === 'run') {
    b.runs++;
    const chance = has(me(b), 'run-away') ? 1
      : Math.min(1, 0.5 + (me(b).stats.spe - b.wild.stats.spe) / (2 * Math.max(1, b.wild.stats.spe)) + 0.15 * (b.runs - 1));
    if (rnd() < chance) { b.over = 'ran'; events.push({ t: 'ran' }); return events; }
    events.push({ t: 'cantRun' });
  } else if (action.type === 'switch') {
    const to = action.to;
    if (to === b.active || !b.party[to] || b.party[to].fainted) return [];
    leave(b, me(b));   // coming back in resets its stat changes and confusion
    switchIn(b, to, events);
  } else if (action.type === 'item') {
    const id = action.item;
    if (!(b.bag[id] > 0)) return [];
    const target = b.party[action.target ?? b.active];
    if (id === 'revive') {
      if (!target || !target.fainted) return [];
      target.fainted = false; target.hp = Math.floor(target.maxHp / 2); target.status = null;
    } else if (HEAL[id]) {
      if (target.fainted || target.hp >= target.maxHp) return [];
      target.hp = Math.min(target.maxHp, target.hp + Math.ceil(target.maxHp * HEAL[id]));
    } else if (CURE[id]) {
      if (!target.status || (CURE[id] !== 'all' && CURE[id] !== target.status.id)) return [];
      target.status = null;
    } else return [];
    b.bag[id]--; b.used[id] = (b.used[id] || 0) + 1;
    events.push({ t: 'item', item: id, target: b.party.indexOf(target), hp: target.hp });
  } else if (action.type === 'ball') {
    const ball = action.ball;
    if (!(b.bag[ball] > 0)) return [];
    b.bag[ball]--; b.used[ball] = (b.used[ball] || 0) + 1;
    const r = tryCatch(b.wild, ball, options.captureRate || 45, rnd);
    events.push({ t: 'ball', ball, shakes: r.shakes, caught: r.caught });
    if (r.caught) { b.over = 'caught'; return events; }
  } else if (action.type === 'move') {
    const mv = me(b).moves[action.index];
    if (!mv) { b.turn--; return []; }
    if (me(b).locked && me(b).locked !== mv.id && me(b).moves.some((x) => x.id === me(b).locked)) { b.turn--; return []; }   // Choice items
    const wmv = wildMove(b, rnd);
    // higher priority goes first (Quick Attack …), then a Quick Claw, then the faster one (paralysis halves speed)
    const prio = (mv.priority || 0) - (wmv.priority || 0);
    let meFirst;
    if (prio !== 0) meFirst = prio > 0;
    else {
      const claw = (m, side) => holds(m, 'quickclaw') && rnd() < 0.2 && (events.push({ t: 'held', side, item: 'quickclaw', what: 'quick' }), true);
      const mine = claw(me(b), 'me'), theirs = !mine && claw(b.wild, 'wild');
      const sm = speed(b, me(b)), sw = speed(b, b.wild);
      meFirst = mine || (!theirs && (sm > sw || (sm === sw && rnd() < 0.5)));
    }
    const order = meFirst ? [['me', mv], ['wild', wmv]] : [['wild', wmv], ['me', mv]];
    for (const [side, m] of order) {
      useMove(b, side, m, rnd, events);
      if (checkFaint(b, events)) return events;
    }
    endOfTurn(b, events, rnd);
    checkFaint(b, events);
    return events;
  }
  if (wildActs && !b.over) {
    useMove(b, 'wild', wildMove(b, rnd), rnd, events);
    if (!checkFaint(b, events)) { endOfTurn(b, events, rnd); checkFaint(b, events); }
  }
  return events;
}

/** Experience for beating (or catching) a wild Pokémon, shared by the party members that took part. */
function expFor(wild, participants) {
  return Math.max(1, Math.round((10 + wild.level * 2.5) / Math.max(1, participants)));
}

/** A wild Pokémon's ability: one of its regular ones, now and then its hidden one (1 in 20). */
function pickAbility(abilities, rnd = Math.random) {
  const list = (abilities || []).filter((a) => a && a.id);
  const normal = list.filter((a) => !a.hidden), hidden = list.filter((a) => a.hidden);
  if (hidden.length && (!normal.length || rnd() < 1 / 20)) return hidden[0].id;
  return normal.length ? normal[Math.floor(rnd() * normal.length)].id : null;
}

/** What a wild Pokémon holds, from the games' held-item chances (PokeAPI rarity in %). */
function pickWildItem(heldItems, rnd = Math.random) {
  for (const [name, rarity] of heldItems || []) {
    const id = ITEM_FROM_API[name];
    if (id && rnd() * 100 < rarity) return id;
  }
  return null;
}

module.exports = {
  MAX_PARTY: 6, stageMul, accMul, BALLS, STATUS_CATCH, WILD_IV, ABILITIES, HELD, ITEM_FROM_API, SPECIAL_MOVES, OHKO,
  WEATHER_MOVES, TERRAIN_MOVES, wildLevel, statsFor, makeMon, create, begin, act, tryCatch, wildMove, expFor,
  pickAbility, pickWildItem, trappedBy, weatherOf
};
