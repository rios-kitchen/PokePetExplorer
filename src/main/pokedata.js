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

/** { types, base: { hp, atk, def, spa, spd, spe }, learnset: [[moveName, level]] } */
async function pokemon(dex, dir) {
  const c = load(dir);
  if (c.pokemon[dex]) return c.pokemon[dex];
  const j = await getJson(`${API}/pokemon/${dex}`);
  const s = Object.fromEntries(j.stats.map((x) => [x.stat.name, x.base_stat]));
  const learnset = [];
  for (const m of j.moves) {
    const lv = m.version_group_details.filter((v) => v.move_learn_method.name === 'level-up').map((v) => v.level_learned_at);
    if (lv.length) learnset.push([m.move.name, Math.max(1, Math.min(...lv))]);
  }
  learnset.sort((a, b) => a[1] - b[1]);
  c.pokemon[dex] = {
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

/** { id, names, type, power, acc, cls ('physical' | 'special' | 'status'), ailment, ailmentChance } */
async function move(name, dir) {
  const c = load(dir);
  if (c.moves[name]) return c.moves[name];
  const j = await getJson(`${API}/move/${name}`);
  c.moves[name] = {
    id: name, names: { en: enName(j.names, name), zh: zhName(j.names) || enName(j.names, name) },
    type: j.type.name, power: j.power || 0, acc: j.accuracy || 100, cls: j.damage_class.name,
    ailment: j.meta && j.meta.ailment ? j.meta.ailment.name : 'none', ailmentChance: j.meta ? j.meta.ailment_chance || 0 : 0
  };
  save();
  return c.moves[name];
}

const STRUGGLE = { id: 'tackle', names: { en: 'Tackle', zh: '撞击' }, type: 'normal', power: 40, acc: 100, cls: 'physical', ailment: 'none', ailmentChance: 0 };

/** Up to 4 attacking moves a Pokémon of this level knows (the newest ones it has learnt). */
async function movesAt(dex, level, dir) {
  const p = await pokemon(dex, dir);
  const known = p.learnset.filter(([, lv]) => lv <= level).map(([n]) => n).reverse();
  const out = [];
  for (const name of known) {
    if (out.length >= 4) break;
    try {
      const m = await move(name, dir);
      if (m.power > 0 && m.cls !== 'status' && m.power <= 150) out.push(m);   // no one-hit wonders
    } catch { /* skip */ }
  }
  return out.length ? out.reverse() : [STRUGGLE];
}

module.exports = { pokemon, species, move, movesAt, STRUGGLE };
