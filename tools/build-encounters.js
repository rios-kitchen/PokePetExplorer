// Builds src/main/encounters.json: the main games' wild encounter tables from PokeAPI – which Pokémon live where,
// how often (%) and at which levels – for walking in grass and caves. One game per region (the newest one PokeAPI has
// full tables for). Each place is sorted into a kind (route, forest, cave, volcano, ice, ruins) so outings can use
// places that fit them. Run once (npm run encounters); the result is committed, so the app works offline.
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

(async () => {
  const areas = [];
  for (const [region, games] of Object.entries(GAMES)) {
    const reg = await get(`region/${region}`);
    const locs = await pool(reg.locations, 8, (l) => get(l.url));
    const areaRefs = locs.filter(Boolean).flatMap((l) => l.areas.map((a) => ({ loc: l.name, url: a.url, name: a.name })));
    const data = await pool(areaRefs, 8, (a) => get(a.url));
    let kept = 0;
    data.forEach((ad, i) => {
      if (!ad) return;
      const name = areaRefs[i].name;
      // the newest game that has walking encounters here
      for (const pair of games) {
        const mons = new Map();
        for (const pe of ad.pokemon_encounters) {
          const dex = idOf(pe.pokemon.url);
          if (dex > 1025) continue;   // regional forms etc. – the base species is enough
          for (const vd of pe.version_details) {
            if (!pair.includes(vd.version.name)) continue;
            const det = vd.encounter_details.filter((d) => METHODS.has(d.method.name));
            if (!det.length) continue;
            const chance = Math.min(100, det.reduce((s, d) => s + (d.chance || 0), 0));
            const lo = Math.min(...det.map((d) => d.min_level)), hi = Math.max(...det.map((d) => d.max_level));
            const prev = mons.get(dex);
            // both versions of a pair: keep the higher chance and the wider level range
            mons.set(dex, prev ? [dex, Math.max(prev[1], chance), Math.min(prev[2], lo), Math.max(prev[3], hi)] : [dex, chance, lo, hi]);
          }
        }
        if (!mons.size) continue;
        const e = [...mons.values()].filter((x) => x[1] > 0).sort((a, b) => b[1] - a[1]);
        if (!e.length) continue;
        const lv = [Math.min(...e.map((x) => x[2])), Math.max(...e.map((x) => x[3]))];
        areas.push({ n: name, r: region, v: pair.join('/'), k: kindOf(name) || 'route', lv, e });
        kept++;
        break;
      }
    });
    console.log(region, `${kept} places with encounters`);
  }
  const out = { generated: new Date().toISOString().slice(0, 10), source: 'PokeAPI location-area encounters', areas };
  fs.writeFileSync(path.join(__dirname, '..', 'src', 'main', 'encounters.json'), JSON.stringify(out));
  const kinds = {};
  for (const a of areas) kinds[a.k] = (kinds[a.k] || 0) + 1;
  console.log('kinds', kinds, 'size', Math.round(JSON.stringify(out).length / 1024), 'KB');
})();
