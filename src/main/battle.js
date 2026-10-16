// Turn-based 1-on-1 battles against wild Pokémon, after the main games but simplified:
// stats from base stats and level, the 18-type chart, same-type bonus, critical hits, stat stages (−6…+6),
// status conditions (burn, poison, paralysis, freeze, sleep, confusion), status moves, healing and draining
// moves, priority and multi-hit moves, switching between up to six party members, items, catching.
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

/** A battler: { key, dex, names, level, types, stats, hp, maxHp, moves, status, shiny, accBonus } */
function makeMon({ key, dex, names, level, types, base, moves, attrs, shiny, wild }) {
  const stats = statsFor(base, level, attrs, wild ? WILD_IV : 15);
  return {
    key, dex, names, level, types, stats, maxHp: stats.hp, hp: stats.hp, moves, status: null, stages: freshStages(),
    shiny: !!shiny, accBonus: Math.min(0.1, ((attrs && attrs.cute) || 0) / 300), fainted: false
  };
}

// ---------------------------------------------------------------- stat stages
const freshStages = () => ({ atk: 0, def: 0, spa: 0, spd: 0, spe: 0, acc: 0, eva: 0 });
/** The games' stage multipliers: ×2/8 … ×8/2 for stats, ×3/9 … ×9/3 for accuracy and evasion. */
const stageMul = (n) => (n >= 0 ? (2 + n) / 2 : 2 / (2 - n));
const accMul = (n) => (n >= 0 ? (3 + n) / 3 : 3 / (3 - n));
const stat = (m, k) => m.stats[k] * stageMul((m.stages || {})[k] || 0);
/** Moves that act on the user itself (Swords Dance, Recover …). */
const SELF = new Set(['user', 'users-field', 'user-or-ally', 'user-and-allies', 'all-allies', 'ally']);

// ---------------------------------------------------------------- the battle
/**
 * party: up to 6 of the trainer's battlers (the first one leads); wild: the wild battler;
 * bag: { itemId: count } – what can be used in battle (balls, potions, status medicine, revives).
 */
function create({ party, wild, bag = {} }) {
  return { party, wild, active: 0, bag: { ...bag }, used: {}, turn: 0, runs: 0, over: null, needSwitch: false, seen: new Set([0]) };
}

const BALLS = { pokeball: 1, greatball: 1.5, ultraball: 2 };
const WILD_IV = 0;
/** A wild Pokémon's level next to the partner's: mostly a little lower (like wild Pokémon in the games). */
const wildLevel = (partnerLevel, rnd = Math.random) => Math.max(2, partnerLevel - 3 + Math.floor(rnd() * 5));
const STATUS_CATCH = { sleep: 2.5, freeze: 2.5, paralysis: 1.5, poison: 1.5, burn: 1.5 };   // as in Gen 5+

const me = (b) => b.party[b.active];

function damage(att, def, mv, rnd, ev) {
  const physical = mv.cls === 'physical';
  const A = stat(att, physical ? 'atk' : 'spa');
  const D = stat(def, physical ? 'def' : 'spd');
  let dmg = Math.floor(Math.floor((((2 * att.level) / 5 + 2) * mv.power * A) / D) / 50) + 2;
  const stab = att.types.includes(mv.type) ? 1.5 : 1;
  const eff = effectiveness(mv.type, def.types);
  const crit = rnd() < 1 / 24 ? 1.5 : 1;
  const burn = physical && att.status && att.status.id === 'burn' ? 0.5 : 1;
  dmg = Math.floor(dmg * stab * eff * crit * burn * (0.85 + rnd() * 0.15));
  if (eff > 0) dmg = Math.max(1, dmg);
  ev.eff = eff; ev.crit = crit > 1;
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
    s.turns -= 1;
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

/** Give a condition, unless it already has one or its type is immune. Returns true if it took. */
function inflictAilment(mon, side, ailment, rnd, events) {
  if (mon.hp <= 0 || mon.status || !AILMENTS.has(ailment)) return false;
  // types are immune to "their own" conditions
  const immune = (ailment === 'burn' && mon.types.includes('fire')) || (ailment === 'freeze' && mon.types.includes('ice'))
    || (ailment === 'poison' && (mon.types.includes('poison') || mon.types.includes('steel')))
    || (ailment === 'paralysis' && mon.types.includes('electric'));
  if (immune) return false;
  const turns = ailment === 'confusion' ? 2 + Math.floor(rnd() * 3) : ailment === 'sleep' ? 1 + Math.floor(rnd() * 3) : 0;
  mon.status = { id: ailment, turns };
  events.push({ t: 'status', side, status: ailment });
  return true;
}

/** Raise or lower stat stages (−6…+6). Returns true if anything changed. */
function changeStats(mon, side, changes, events) {
  if (mon.hp <= 0) return false;
  mon.stages = mon.stages || freshStages();
  let did = false;
  for (const { stat: k, change } of changes) {
    const before = mon.stages[k] || 0;
    const after = Math.max(-6, Math.min(6, before + change));
    if (after === before) { events.push({ t: 'statMax', side, stat: k, up: change > 0 }); continue; }
    mon.stages[k] = after;
    events.push({ t: 'stat', side, stat: k, change: after - before });
    did = true;
  }
  return did;
}

function heal(mon, side, amount, events) {
  const before = mon.hp;
  mon.hp = Math.min(mon.maxHp, mon.hp + Math.max(1, Math.round(amount)));
  if (mon.hp > before) { events.push({ t: 'heal', side, hp: mon.hp }); return true; }
  return false;
}

function useMove(b, side, mv, rnd, events) {
  const att = side === 'me' ? me(b) : b.wild;
  const def = side === 'me' ? b.wild : me(b);
  const other = side === 'me' ? 'wild' : 'me';
  if (!canAct(att, side, rnd, events)) return;
  const onSelf = SELF.has(mv.target);
  // accuracy (with accuracy / evasion stages); moves on itself and "never miss" moves always hit
  if (!onSelf && mv.acc != null) {
    const stages = ((att.stages || {}).acc || 0) - ((def.stages || {}).eva || 0);
    const hitChance = (mv.acc / 100) * accMul(stages) + (side === 'me' ? att.accBonus : 0);
    if (rnd() >= hitChance) { events.push({ t: 'miss', side, move: mv.id, names: mv.names }); return; }
  }

  // status moves: conditions, stat changes, healing
  if (mv.cls === 'status') {
    events.push({ t: 'use', side, move: mv.id, names: mv.names, type: mv.type });
    let did = false;
    if (mv.healing > 0) did = heal(att, side, (att.maxHp * mv.healing) / 100, events) || did;
    if (mv.stats && mv.stats.length) did = changeStats(onSelf ? att : def, onSelf ? side : other, mv.stats, events) || did;
    if (AILMENTS.has(mv.ailment)) did = inflictAilment(onSelf ? att : def, onSelf ? side : other, mv.ailment, rnd, events) || did;
    if (!did) events.push({ t: 'fail' });
    return;
  }

  // damaging moves, some hitting several times
  const hits = (mv.maxHits || 1) > 1 ? mv.minHits + Math.floor(rnd() * (mv.maxHits - mv.minHits + 1)) : 1;
  let total = 0, landed = 0;
  for (let i = 0; i < hits && def.hp > 0; i++) {
    const ev = { t: 'move', side, move: mv.id, names: mv.names, cls: mv.cls, type: mv.type, again: i > 0 };
    const dmg = damage(att, def, mv, rnd, ev);
    def.hp = Math.max(0, def.hp - dmg);
    Object.assign(ev, { dmg, hp: def.hp });
    events.push(ev);
    total += dmg; landed++;
    if (ev.eff === 0) break;
  }
  if (landed > 1) events.push({ t: 'hits', n: landed });
  // draining moves (Absorb, Giga Drain …) heal the user; negative drain is recoil (Double-Edge …)
  if (mv.drain > 0 && total > 0) heal(att, side, (total * mv.drain) / 100, events);
  if (mv.drain < 0 && total > 0) {
    att.hp = Math.max(0, att.hp - Math.max(1, Math.round((total * -mv.drain) / 100)));
    events.push({ t: 'recoil', side, hp: att.hp });
  }
  // side effects: a condition, or stat changes (on the target, or on the user for moves that raise its stats)
  if (def.hp > 0 && AILMENTS.has(mv.ailment) && mv.ailmentChance > 0 && rnd() * 100 < mv.ailmentChance) {
    inflictAilment(def, other, mv.ailment, rnd, events);
  }
  if (mv.stats && mv.stats.length && rnd() * 100 < (mv.statChance || 100)) {
    const toSelf = mv.category === 'damage-raise' || mv.category === 'damage+raise' || onSelf;
    changeStats(toSelf ? att : def, toSelf ? side : other, mv.stats, events);
  }
}

/** The wild Pokémon picks a move: usually the one that hurts most, sometimes any. */
function wildMove(b, rnd) {
  const w = b.wild, target = me(b);
  if (rnd() < 0.3) return w.moves[Math.floor(rnd() * w.moves.length)];
  return w.moves.slice().sort((x, y) => {
    const v = (m) => m.power * (w.types.includes(m.type) ? 1.5 : 1) * effectiveness(m.type, target.types) * ((m.acc ?? 100) / 100);
    return v(y) - v(x);
  })[0];
}

function endOfTurn(b, events) {
  for (const [side, mon] of [['me', me(b)], ['wild', b.wild]]) {
    if (mon.hp <= 0 || !mon.status) continue;
    const id = mon.status.id;
    if (id === 'burn' || id === 'poison') {
      const d = Math.max(1, Math.floor(mon.maxHp / (id === 'burn' ? 16 : 8)));
      mon.hp = Math.max(0, mon.hp - d);
      events.push({ t: 'statusHurt', side, status: id, dmg: d, hp: mon.hp });
    }
  }
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

/**
 * One turn. action: { type: 'move', index } | { type: 'switch', to } | { type: 'item', item, target? }
 *   | { type: 'ball', ball } | { type: 'run' }.  options.captureRate for balls.
 * Returns the events in order (for the window to play back).
 */
function act(b, action, rnd = Math.random, options = {}) {
  const events = [];
  if (b.over) return events;
  b.turn++;

  // forced switch after a faint: free, no wild move
  if (b.needSwitch) {
    if (action.type !== 'switch') return events;
    const to = action.to;
    if (!b.party[to] || b.party[to].fainted) return events;
    b.active = to; b.needSwitch = false; b.seen.add(to);
    me(b).stages = freshStages();
    events.push({ t: 'switch', to });
    return events;
  }

  let wildActs = true;
  if (action.type === 'run') {
    b.runs++;
    const chance = Math.min(1, 0.5 + (me(b).stats.spe - b.wild.stats.spe) / (2 * Math.max(1, b.wild.stats.spe)) + 0.15 * (b.runs - 1));
    if (rnd() < chance) { b.over = 'ran'; events.push({ t: 'ran' }); return events; }
    events.push({ t: 'cantRun' });
  } else if (action.type === 'switch') {
    const to = action.to;
    if (to === b.active || !b.party[to] || b.party[to].fainted) return [];
    const out = me(b);
    out.stages = freshStages();   // coming back in resets its stat changes and confusion
    if (out.status && out.status.id === 'confusion') out.status = null;
    b.active = to; b.seen.add(to);
    events.push({ t: 'switch', to });
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
    if (!mv) return [];
    // faster one goes first (paralysis halves speed); the trainer's move vs the wild one's
    const wmv = wildMove(b, rnd);
    const speed = (m) => stat(m, 'spe') * (m.status && m.status.id === 'paralysis' ? 0.5 : 1);
    // higher priority goes first (Quick Attack …), then the faster one
    const prio = (mv.priority || 0) - (wmv.priority || 0);
    const meFirst = prio > 0 || (prio === 0 && (speed(me(b)) > speed(b.wild) || (speed(me(b)) === speed(b.wild) && rnd() < 0.5)));
    const order = meFirst ? [['me', mv], ['wild', wmv]] : [['wild', wmv], ['me', mv]];
    for (const [side, m] of order) {
      useMove(b, side, m, rnd, events);
      if (checkFaint(b, events)) return events;
    }
    endOfTurn(b, events);
    checkFaint(b, events);
    return events;
  }
  if (wildActs && !b.over) {
    useMove(b, 'wild', wildMove(b, rnd), rnd, events);
    if (!checkFaint(b, events)) { endOfTurn(b, events); checkFaint(b, events); }
  }
  return events;
}

/** Experience for beating (or catching) a wild Pokémon, shared by the party members that took part. */
function expFor(wild, participants) {
  return Math.max(1, Math.round((10 + wild.level * 2.5) / Math.max(1, participants)));
}

module.exports = { MAX_PARTY: 6, stageMul, accMul, BALLS, STATUS_CATCH, WILD_IV, wildLevel, statsFor, makeMon, create, act, tryCatch, wildMove, expFor };
