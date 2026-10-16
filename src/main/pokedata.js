// Battle data from PokeAPI – base stats, types, level-up moves, move details, capture rates – fetched
// once per species / move and cached in userData/pokedata.json (it's small: a few KB per species).
const fs = require('fs');
const path = require('path');
const { fetchAllowed } = require('./sources');

const API = 'https://pokeapi.co/api/v2';
const FILE = 'pokedata.json';
let cache = null, dirOf = null, saveTimer = null;

function load(dir) {
  if (!cache || dirOf !== dir) {
    dirOf = dir;
    try { cache = JSON.parse(fs.readFileSync(path.join(dir, FILE), 'utf8')); } catch { cache = null; }
    cache = { pokemon: {}, species: {}, moves: {}, ...(cache || {}) };
  }
  return cache;
}
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { fs.mkdirSync(dirOf, { recursive: true }); fs.writeFileSync(path.join(dirOf, FILE), JSON.stringify(cache)); } catch { /* next time */ }
  }, 500);
}

async function getJson(url) {
  const res = await fetchAllowed(url);
  if (res.status === 404) throw Object.assign(new Error('not-found'), { code: 'not-found' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
const zhName = (names) => (names.find((n) => n.language.name === 'zh-hans') || names.find((n) => n.language.name === 'zh-hant') || {}).name;
const enName = (names, fallback) => (names.find((n) => n.language.name === 'en') || {}).name || fallback;

// main-series games, newest first (PokeAPI version groups)
const GAMES = ['scarlet-violet', 'sword-shield', 'brilliant-diamond-shining-pearl', 'legends-arceus', 'ultra-sun-ultra-moon',
  'sun-moon', 'omega-ruby-alpha-sapphire', 'x-y', 'black-2-white-2', 'black-white', 'heartgold-soulsilver', 'platinum',
  'diamond-pearl', 'emerald', 'firered-leafgreen', 'ruby-sapphire', 'crystal', 'gold-silver', 'yellow', 'red-blue'];
const POKEMON_V = 2;   // bump when the stored learnset changes (cached entries are fetched again)

/** { types, base: { hp, atk, def, spa, spd, spe }, learnset: [[moveName, level]] } */
async function pokemon(dex, dir) {
  const c = load(dir);
  if (c.pokemon[dex] && c.pokemon[dex].v === POKEMON_V) return c.pokemon[dex];
  const j = await getJson(`${API}/pokemon/${dex}`);
  const s = Object.fromEntries(j.stats.map((x) => [x.stat.name, x.base_stat]));
  // level-up moves from one game: the newest one that has this Pokémon (games differ a lot in what's learnt when)
  const levelUp = (m, g) => m.version_group_details.filter((v) => v.move_learn_method.name === 'level-up' && (!g || v.version_group.name === g));
  const game = GAMES.find((g) => j.moves.some((m) => levelUp(m, g).length)) || null;
  const learnset = [];
  for (const m of j.moves) {
    const lv = levelUp(m, game).map((v) => v.level_learned_at);
    if (lv.length) learnset.push([m.move.name, Math.max(1, Math.min(...lv))]);
  }
  learnset.sort((a, b) => a[1] - b[1]);
  c.pokemon[dex] = {
    v: POKEMON_V,
    types: j.types.sort((a, b) => a.slot - b.slot).map((t) => t.type.name),
    base: { hp: s.hp, atk: s.attack, def: s.defense, spa: s['special-attack'], spd: s['special-defense'], spe: s.speed },
    learnset
  };
  save();
  return c.pokemon[dex];
}

/** { names, capture, legendary, mythical, from (dex it evolves from or null), generation } */
async function species(dex, dir) {
  const c = load(dir);
  if (c.species[dex]) return c.species[dex];
  const j = await getJson(`${API}/pokemon-species/${dex}`);
  const idOf = (u) => (u ? Number(u.url.match(/\/(\d+)\/?$/)[1]) : null);
  c.species[dex] = {
    names: { en: enName(j.names, j.name), zh: zhName(j.names) || enName(j.names, j.name) },
    capture: j.capture_rate, legendary: j.is_legendary, mythical: j.is_mythical,
    from: idOf(j.evolves_from_species), generation: Number((j.generation.url.match(/\/(\d+)\/?$/) || [])[1]) || 0
  };
  save();
  return c.species[dex];
}

const MOVE_V = 2;   // bump when more move fields are needed (cached moves are fetched again)
const STAT = { attack: 'atk', defense: 'def', 'special-attack': 'spa', 'special-defense': 'spd', speed: 'spe', accuracy: 'acc', evasion: 'eva' };

/**
 * { id, names, type, power, acc (null = never misses), cls ('physical' | 'special' | 'status'), category (PokeAPI's
 * meta category: damage, ailment, net-good-stats, heal, damage+ailment …), target, priority, ailment, ailmentChance,
 * stats: [{ stat, change }], statChance, healing, drain, minHits, maxHits }
 */
async function move(name, dir) {
  const c = load(dir);
  if (c.moves[name] && c.moves[name].v === MOVE_V) return c.moves[name];
  const j = await getJson(`${API}/move/${name}`);
  const meta = j.meta || {};
  c.moves[name] = {
    v: MOVE_V, id: name, names: { en: enName(j.names, name), zh: zhName(j.names) || enName(j.names, name) },
    type: j.type.name, power: j.power || 0, acc: j.accuracy ?? null, cls: j.damage_class.name,
    category: meta.category ? meta.category.name : 'unique', target: j.target ? j.target.name : 'selected-pokemon',
    priority: j.priority || 0,
    ailment: meta.ailment ? meta.ailment.name : 'none', ailmentChance: meta.ailment_chance || 0,
    stats: (j.stat_changes || []).map((x) => ({ stat: STAT[x.stat.name], change: x.change })).filter((x) => x.stat),
    statChance: meta.stat_chance || 0, healing: meta.healing || 0, drain: meta.drain || 0,
    minHits: meta.min_hits || 1, maxHits: meta.max_hits || 1
  };
  save();
  return c.moves[name];
}

// what the battle engine can do (battle.js); moves of other kinds (one-hit KOs, weather, traps, …) aren't picked
// (PokeAPI writes them with a hyphen: damage-ailment, damage-raise …)
const CATEGORIES = new Set(['damage', 'ailment', 'net-good-stats', 'heal', 'damage-ailment', 'damage-lower', 'damage-raise',
  'damage-heal', 'swagger', 'damage+ailment', 'damage+lower', 'damage+raise', 'damage+heal']);
const AILMENTS = new Set(['burn', 'poison', 'paralysis', 'freeze', 'sleep', 'confusion']);
/** Can the battle engine use this move (and does it do something there)? */
function usable(m) {
  if (!CATEGORIES.has(m.category) || m.power > 150) return false;   // no one-hit wonders
  if (m.cls !== 'status') return m.power > 0;
  return AILMENTS.has(m.ailment) || m.stats.length > 0 || m.healing > 0;
}

const STRUGGLE = { id: 'tackle', names: { en: 'Tackle', zh: '撞击' }, type: 'normal', power: 40, acc: 100, cls: 'physical',
  category: 'damage', target: 'selected-pokemon', priority: 0, ailment: 'none', ailmentChance: 0, stats: [], statChance: 0,
  healing: 0, drain: 0, minHits: 1, maxHits: 1 };

/**
 * The moves a Pokémon of this level knows, as in the games: the 4 newest level-up moves it has learnt (PokeAPI),
 * status moves included – skipping ones the battles can't do. At least one of them hits.
 */
async function movesAt(dex, level, dir) {
  const p = await pokemon(dex, dir);
  const known = [...new Set(p.learnset.filter(([, lv]) => lv <= level).map(([n]) => n))].reverse();
  const out = [];
  let attack = null;   // the newest damaging move, in case the 4 newest are all status moves
  for (const name of known) {
    if (out.length >= 4 && attack) break;
    try {
      const m = await move(name, dir);
      if (!usable(m)) continue;
      if (!attack && m.cls !== 'status') attack = m;
      if (out.length < 4) out.push(m);
    } catch { /* skip */ }
  }
  if (!out.some((m) => m.cls !== 'status')) {
    if (out.length >= 4) out.pop();
    out.push(attack || STRUGGLE);
  }
  return out.length ? out.reverse() : [STRUGGLE];
}

module.exports = { pokemon, species, move, movesAt, usable, STRUGGLE };
