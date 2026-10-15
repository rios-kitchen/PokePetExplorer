// Wild Pokémon: who appears where. Any species PMD has drawn (no legendaries or mythicals), matched to
// the place by type – the grass has Normal / Grass / Bug / Flying …, the volcano Fire and Rock, and so
// on – and to the partner's level: evolved forms only show up once it's grown a bit.
const Data = require('./pokedata');

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
const SPECIAL = new Set([793, 794, 795, 796, 797, 798, 799, 803, 804, 805, 806,
  984, 985, 986, 987, 988, 989, 990, 991, 992, 993, 994, 995, 1005, 1006, 1009, 1010, 1020, 1021, 1022, 1023]);
const SHINY_RATE = 1 / 4096;   // as in the games (see shiny.js for the guarantee)
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
  return { key, dex, names, level, types: pk.types, base: pk.base, moves, attrs, shiny };
}

module.exports = { HABITATS, REGION_DEX, ENCOUNTER_WAIT_MIN, SHINY_RATE, REPEAT_SEEN, SPECIAL, drawnDex, pickSpecies, battlerFor };
