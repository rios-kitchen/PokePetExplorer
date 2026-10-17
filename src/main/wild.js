// Wild Pokémon: who appears where. As in the games: a real place that fits (a route for the grass, a forest,
// cave, volcano, icy place or ruins for outings, a region's routes for travel) and suits the lead's level, then a
// Pokémon from that place's encounter table with its original chance and level (encounters.json, from PokeAPI –
// see tools/build-encounters.js). Only species PMD has drawn. Where there are no tables (Paldea), the older
// type-based pick is used.
//
// Legendary and mythical Pokémon are special encounters: rare, at a high level, each one until it's caught.
const Data = require('./pokedata');
const TABLES = require('./encounters.json');

// place → types that live there (any other type turns up now and then)
const HABITATS = {
  grass:   ['normal', 'grass', 'bug', 'flying', 'fairy', 'electric', 'poison'],
  woods:   ['grass', 'bug', 'normal', 'flying', 'poison'],
  cave:    ['rock', 'ground', 'steel', 'dark', 'poison', 'fighting'],
  volcano: ['fire', 'rock', 'ground', 'dragon'],
  glacier: ['ice', 'water', 'steel'],
  ruins:   ['psychic', 'ghost', 'dark', 'fairy']
};
// travel regions → their generation's Pokédex range
const REGION_DEX = {
  kanto: [1, 151], johto: [152, 251], hoenn: [252, 386], sinnoh: [387, 493], unova: [494, 649],
  kalos: [650, 721], alola: [722, 809], galar: [810, 905], paldea: [906, 1025]
};
// how often the grass can be explored: see limits.js
const ENCOUNTER_WAIT_MIN = 30;   // a wild Pokémon met on an outing waits this long for a battle
// not "legendary" in PokeAPI's data, but just as special: Ultra Beasts and Paradox Pokémon
// (they never come from the tables or the type-based pick; they turn up as special encounters, see pickLegend)
const ULTRA_BEASTS = [793, 794, 795, 796, 797, 798, 799, 803, 804, 805, 806];
const PARADOX = [984, 985, 986, 987, 988, 989, 990, 991, 992, 993, 994, 995, 1005, 1006, 1009, 1010, 1020, 1021, 1022, 1023];
const SPECIAL = new Set([...ULTRA_BEASTS, ...PARADOX]);
const SHINY_RATE = 1 / 4096;   // as in the games (see shiny.js for the guarantee)

// ---------------------------------------------------------------- the games' encounter tables
// our places → the kinds of real places (see tools/build-encounters.js)
const PLACE_KINDS = { grass: ['route'], woods: ['forest'], cave: ['cave'], volcano: ['volcano'], glacier: ['ice'], ruins: ['ruins'] };

/** Places of these kinds (in a region, if given) whose levels suit a lead of `level`: around it or a bit below. */
function placesFor(place, region, level) {
  const kinds = PLACE_KINDS[place] || PLACE_KINDS.grass;
  const all = TABLES.areas.filter((a) => (region ? a.r === region && (a.k === 'route' || a.k === 'forest') : kinds.includes(a.k)));
  if (!all.length) return [];
  const mid = (a) => (a.lv[0] + a.lv[1]) / 2;
  const near = all.filter((a) => mid(a) <= level + 3 && mid(a) >= level - 10);
  if (near.length) return near;
  // nothing at this level: the closest few
  return all.slice().sort((x, y) => Math.abs(mid(x) - level) - Math.abs(mid(y) - level)).slice(0, 5);
}

/**
 * The games' way: a place, then a Pokémon by its chance there, at its level there.
 * Returns { dex, level, area } or null (no table for this place / nothing PMD has drawn there).
 */
function pickFromTables({ place, region, level, drawn, rnd = Math.random }) {
  const ok = new Set(drawn);
  const areas = placesFor(place, region, level).map((a) => ({ a, e: a.e.filter(([dex]) => ok.has(dex) && !SPECIAL.has(dex) && !LEGENDS.has(dex)) }))
    .filter((x) => x.e.length);
  if (!areas.length) return null;
  const { a, e } = areas[Math.floor(rnd() * areas.length)];
  let r = rnd() * e.reduce((sum, x) => sum + x[1], 0);
  let pick = e[e.length - 1];
  for (const x of e) { if ((r -= x[1]) < 0) { pick = x; break; } }
  const [dex, , lo, hi] = pick;
  return { dex, level: Math.max(2, lo + Math.floor(rnd() * (hi - lo + 1))), area: a.n };
}

// ---------------------------------------------------------------- legendary and mythical Pokémon
const LEGENDARY = [144, 145, 146, 150, 243, 244, 245, 249, 250, 377, 378, 379, 380, 381, 382, 383, 384, 480, 481, 482, 483,
  484, 485, 486, 487, 488, 638, 639, 640, 641, 642, 643, 644, 645, 646, 716, 717, 718, 772, 773, 785, 786, 787, 788, 789, 790,
  791, 792, 800, 888, 889, 890, 891, 892, 894, 895, 896, 897, 898, 905, 1001, 1002, 1003, 1004, 1007, 1008, 1014, 1015, 1016,
  1017, 1024];
const MYTHICAL = [151, 251, 385, 386, 489, 490, 491, 492, 493, 494, 647, 648, 649, 719, 720, 721, 801, 802, 807, 808, 809,
  893, 1025];
const LEGENDS = new Set([...LEGENDARY, ...MYTHICAL]);
// per encounter, once the lead is strong enough; each one keeps turning up (rarely) until it has been caught
const LEGEND_CHANCE = 1 / 400, MYTHICAL_CHANCE = 1 / 2000, ULTRA_CHANCE = 1 / 800, PARADOX_CHANCE = 1 / 800, LEGEND_MIN_LEVEL = 30;
const POOLS = { legendary: LEGENDARY, mythical: MYTHICAL, ultra: ULTRA_BEASTS, paradox: PARADOX };
// where each kind prefers to turn up on a trip: Ultra Beasts in Alola, Paradox Pokémon in Paldea
const HOME_REGION = { ultra: 'alola', paradox: 'paldea' };
/** The level a special one appears at: well above the lead, as in the games (40–70). */
const legendLevel = (lead) => Math.max(40, Math.min(70, lead + 8));

/**
 * A special encounter, or null: legendary 1 in 400, mythical 1 in 2000, Ultra Beast 1 in 800, Paradox Pokémon 1 in
 * 800 (lead Lv30+), one PMD has drawn and you haven't caught yet – from the travel region if there is one (Ultra
 * Beasts rather on trips to Alola, Paradox Pokémon to Paldea). force: true, or a kind ('ultra' …).
 */
function pickLegend({ level, region, drawn, caught = new Set(), rnd = Math.random, force = false }) {
  if (!force && level < LEGEND_MIN_LEVEL) return null;
  const roll = rnd();
  let kind = null;
  if (typeof force === 'string' && POOLS[force]) kind = force;
  else if (force) kind = ['legendary', 'legendary', 'legendary', 'mythical', 'ultra', 'paradox'][Math.floor(rnd() * 6)];
  else {
    let edge = 0;
    for (const [k, chance] of [['mythical', MYTHICAL_CHANCE], ['legendary', LEGEND_CHANCE], ['ultra', ULTRA_CHANCE], ['paradox', PARADOX_CHANCE]]) {
      edge += chance;
      if (roll < edge) { kind = k; break; }
    }
    // Ultra Beasts and Paradox Pokémon come a little more often on a trip to their own region
    if (!kind && region && HOME_REGION.ultra === region && roll < edge + ULTRA_CHANCE) kind = 'ultra';
    if (!kind && region && HOME_REGION.paradox === region && roll < edge + PARADOX_CHANCE) kind = 'paradox';
  }
  if (!kind) return null;
  const ok = new Set(drawn);
  const range = region && REGION_DEX[region];
  let pool = POOLS[kind].filter((d) => ok.has(d) && !caught.has(d));
  if (range && pool.some((d) => d >= range[0] && d <= range[1])) pool = pool.filter((d) => d >= range[0] && d <= range[1]);
  if (!pool.length) return null;
  return { dex: pool[Math.floor(rnd() * pool.length)], level: legendLevel(level), special: kind };
}
// half the time the grass picks among species you've already met (if there are a few around), like the
// common Pokémon of a route turning up again and again
const REPEAT_SEEN = 0.5;

/** Dex numbers PMD has drawn (from the cached artist index), else everything up to 1025. */
function drawnDex(creditIndex) {
  const dex = creditIndex && creditIndex.dex;
  const list = dex ? Object.entries(dex).filter(([, e]) => e && e.sprite).map(([k]) => Number(k)).filter((n) => n >= 1 && n <= 1025) : [];
  return list.length > 100 ? list : Array.from({ length: 1025 }, (_, i) => i + 1);
}

/**
 * Pick a wild species for a place: { dex, names, types, capture }. Tries a few random candidates and
 * keeps one that fits the place (sometimes accepting an odd one out, for variety). Needs PokeAPI.
 */
async function pickSpecies({ place, region, partnerLevel, drawn, dir, seen = [], rnd = Math.random }) {
  const range = region && REGION_DEX[region];
  let pool = range ? drawn.filter((d) => d >= range[0] && d <= range[1]) : drawn;
  if (rnd() < REPEAT_SEEN) {
    const inPool = new Set(pool);
    const met = seen.filter((d) => inPool.has(d));
    if (met.length >= 3) pool = met;
  }
  const fits = HABITATS[place] || HABITATS.grass;
  let fallback = null;
  for (let tries = 0; tries < 14; tries++) {
    const dex = pool[Math.floor(rnd() * pool.length)];
    if (SPECIAL.has(dex)) continue;
    let sp, pk;
    try { sp = await Data.species(dex, dir); } catch (e) { if (e.code === 'not-found') continue; throw e; }
    if (sp.legendary || sp.mythical) continue;
    // evolved forms only once the partner has grown; fully evolved ones later still
    if (sp.from) {
      if (partnerLevel < 15 || rnd() > 0.4) continue;
      const pre = await Data.species(sp.from, dir).catch(() => null);
      if (pre && pre.from && partnerLevel < 28) continue;
    }
    try { pk = await Data.pokemon(dex, dir); } catch { continue; }
    const cand = { dex, names: sp.names, types: pk.types, capture: sp.capture };
    if (range || pk.types.some((t) => fits.includes(t)) || rnd() < 0.12) return cand;
    fallback = fallback || cand;
  }
  if (fallback) return fallback;
  throw Object.assign(new Error('no-species'), { code: 'not-found' });
}

/** A battler for one of the trainer's Pokémon. */
async function battlerFor({ key, dex, names, level, attrs, shiny, dir }) {
  const [pk, moves] = await Promise.all([Data.pokemon(dex, dir), Data.movesAt(dex, level, dir)]);
  return { key, dex, names, level, types: pk.types, base: pk.base, moves, attrs, shiny, abilities: pk.abilities || [], heldItems: pk.heldItems || [] };
}

module.exports = { HABITATS, REGION_DEX, ENCOUNTER_WAIT_MIN, SHINY_RATE, REPEAT_SEEN, SPECIAL, ULTRA_BEASTS, PARADOX, LEGENDARY, MYTHICAL, LEGENDS,
  LEGEND_CHANCE, MYTHICAL_CHANCE, ULTRA_CHANCE, PARADOX_CHANCE, LEGEND_MIN_LEVEL, TABLES, placesFor, pickFromTables, pickLegend, legendLevel,
  drawnDex, pickSpecies, battlerFor };
