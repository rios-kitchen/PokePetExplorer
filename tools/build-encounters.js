// Builds src/main/encounters.json: the main games' wild encounter tables from PokeAPI – which Pokémon live where,
// how often (%) and at which levels – for walking in grass and caves, and for fishing with the Old, Good and Super
// Rod. One game per region (the newest one PokeAPI has full tables for). Each walking place is sorted into a kind
// (route, forest, cave, volcano, ice, ruins) so outings can use places that fit them; fishing spots keep their place
// name, and every Pokémon that can be fished gets its names and height (for the fishing Pokédex and catch sizes).
// Run once (npm run encounters); the result is committed, so the app works offline.
const fs = require('fs');
const path = require('path');

const API = 'https://pokeapi.co/api/v2';
// region → the games to use, newest first; both versions of a pair are merged (exclusives of either count)
const GAMES = {
  kanto: [['firered', 'leafgreen'], ['red', 'blue']],
  johto: [['heartgold', 'soulsilver'], ['crystal']],
  hoenn: [['emerald'], ['ruby', 'sapphire']],
  sinnoh: [['platinum'], ['diamond', 'pearl']],
  unova: [['black-2', 'white-2'], ['black', 'white']],
  kalos: [['x', 'y']],
  alola: [['ultra-sun', 'ultra-moon'], ['sun', 'moon']],
  galar: [['sword', 'shield']],
  paldea: [['scarlet', 'violet']]
};
const RODS = { 'old-rod': 'old', 'good-rod': 'good', 'super-rod': 'super' };
const METHODS = new Set(['walk', 'overworld', 'dark-grass', 'grass-spots', 'cave-spots', 'tall-grass', 'rough-terrain', 'yellow-flowers', 'purple-flowers', 'red-flowers']);
// what kind of place it is, from its name (checked in this order)
const KINDS = [
  ['volcano', /volcan|chimney|fiery|stark-mountain|cinnabar|blaze|magma|wela|lava|reversal|ember/],
  ['ice', /seafoam|ice|snow|frost|glacier|icirrus|shoal-cave|acuity|frozen|crown-tundra|glaseado|tundra|frigid/],
  ['ruins', /ruin|tower|temple|tomb|relic|castle|pillar|chateau|graveyard|burned|sprout|alph|tomb|haunted|memorial|sanctuary|ancient|lost-/],
  ['forest', /forest|wood|jungle|grove|thicket|lush/],
  ['cave', /cave|tunnel|cavern|grotto|mine|mt-|mount|underground|chasm|victory-road|den|hollow|crater|tunnel/],
  ['route', /route|road|field|meadow|plain|path|island|park|lake|pasture|valley|ranch|area|province|town|city|garden|beach|coast|desert|marsh|bridge|safari|zone|hill|bay/]
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function get(url, tries = 4) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url.startsWith('http') ? url : `${API}/${url}`);
      if (res.status === 404) return null;
      if (res.ok) return res.json();
    } catch { /* retry */ }
    await sleep(800 * (i + 1));
  }
  return null;
}
async function pool(items, n, fn) {
  const out = [];
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k]); } }));
  return out;
}
const idOf = (url) => Number(url.match(/\/(\d+)\/?$/)[1]);
const kindOf = (name) => (KINDS.find(([, re]) => re.test(name)) || [null])[0];

/** One game's encounters at a place for some methods: [[dex, chance %, min level, max level], …] by chance. */
function tableOf(ad, pair, methods) {
  const mons = new Map();
  for (const pe of ad.pokemon_encounters) {
    const dex = idOf(pe.pokemon.url);
    if (dex > 1025) continue;   // regional forms etc. – the base species is enough
    for (const vd of pe.version_details) {
      if (!pair.includes(vd.version.name)) continue;
      const det = vd.encounter_details.filter((d) => methods(d.method.name));
      if (!det.length) continue;
      const chance = Math.min(100, det.reduce((s, d) => s + (d.chance || 0), 0));
      const lo = Math.min(...det.map((d) => d.min_level)), hi = Math.max(...det.map((d) => d.max_level));
      const prev = mons.get(dex);
      // both versions of a pair: keep the higher chance and the wider level range
      mons.set(dex, prev ? [dex, Math.max(prev[1], chance), Math.min(prev[2], lo), Math.max(prev[3], hi)] : [dex, chance, lo, hi]);
    }
  }
  return [...mons.values()].filter((x) => x[1] > 0).sort((a, b) => b[1] - a[1]);
}

(async () => {
  const areas = [];
  const fishing = [];
  for (const [region, games] of Object.entries(GAMES)) {
    const reg = await get(`region/${region}`);
    const locs = await pool(reg.locations, 8, (l) => get(l.url));
    const areaRefs = locs.filter(Boolean).flatMap((l) => l.areas.map((a) => ({ loc: l.name, url: a.url, name: a.name })));
    const data = await pool(areaRefs, 8, (a) => get(a.url));
    const locName = Object.fromEntries(locs.filter(Boolean).map((l) => [l.name, (l.names.find((n) => n.language.name === 'en') || {}).name || l.name]));
    let kept = 0, spots = 0;
    data.forEach((ad, i) => {
      if (!ad) return;
      const name = areaRefs[i].name;
      // the newest game that has walking encounters here
      for (const pair of games) {
        const e = tableOf(ad, pair, (m) => METHODS.has(m));
        if (!e.length) continue;
        const lv = [Math.min(...e.map((x) => x[2])), Math.max(...e.map((x) => x[3]))];
        areas.push({ n: name, r: region, v: pair.join('/'), k: kindOf(name) || 'route', lv, e });
        kept++;
        break;
      }
      // … and the newest game that has fishing here: one table per rod
      for (const pair of games) {
        const rods = {};
        for (const [method, rod] of Object.entries(RODS)) {
          const t = tableOf(ad, pair, (m) => m === method);
          if (t.length) rods[rod] = t;
        }
        if (!Object.keys(rods).length) continue;
        const all = Object.values(rods).flat();
        fishing.push({ n: name, r: region, v: pair.join('/'), place: locName[areaRefs[i].loc] || areaRefs[i].loc,
          lv: [Math.min(...all.map((x) => x[2])), Math.max(...all.map((x) => x[3]))], rods });
        spots++;
        break;
      }
    });
    console.log(region, `${kept} places with encounters, ${spots} fishing spots`);
  }
  // every Pokémon that can be fished: names and height (decimetres)
  const fishDex = [...new Set(fishing.flatMap((f) => Object.values(f.rods).flat().map((x) => x[0])))].sort((a, b) => a - b);
  const fish = (await pool(fishDex, 8, async (dex) => {
    const [sp, pk] = await Promise.all([get(`pokemon-species/${dex}`), get(`pokemon/${dex}`)]);
    if (!sp || !pk) return null;
    const nm = (l) => (sp.names.find((n) => n.language.name === l) || {}).name;
    return { dex, names: { en: nm('en') || sp.name, zh: nm('zh-hans') || nm('zh-hant') || nm('en') || sp.name }, height: pk.height,
      legendary: sp.is_legendary || sp.is_mythical };
  })).filter((f) => f && !f.legendary).map(({ legendary, ...f }) => f);
  console.log('fishing spots', fishing.length, 'fish species', fish.length);
  const out = { generated: new Date().toISOString().slice(0, 10), source: 'PokeAPI location-area encounters', areas, fishing, fish };
  fs.writeFileSync(path.join(__dirname, '..', 'src', 'main', 'encounters.json'), JSON.stringify(out));
  const kinds = {};
  for (const a of areas) kinds[a.k] = (kinds[a.k] || 0) + 1;
  console.log('kinds', kinds, 'size', Math.round(JSON.stringify(out).length / 1024), 'KB');
})();
