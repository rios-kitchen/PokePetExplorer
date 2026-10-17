// Sprite source. Names (incl. Chinese) come from PokeAPI; sprites only from PMD SpriteCollab,
// the one source with enough animations (Idle/Walk/Sleep/Eat/Hurt/Faint...) for a raising game.
// Everything is downloaded once and cached in the app's data folder.
const fs = require('fs');
const path = require('path');
// Electron's network stack in the app; plain fetch when run from Node (tools/bundle-starters.js)
const electron = require('electron');
const fetchUrl = typeof electron === 'object' && electron.net ? (u) => electron.net.fetch(u) : (u) => fetch(u);

const API = 'https://pokeapi.co/api/v2';
const PMD = 'https://raw.githubusercontent.com/PMDCollab/SpriteCollab/master';

const SOURCES = ['pmd'];

// Version of the PMD download format: 2 = every animation listed in AnimData.xml
const PMD_VERSION = 2;

// The only hosts this app ever contacts (downloads only – nothing about the user is sent).
// URLs that come back in responses (e.g. PokeAPI's evolution-chain links) are checked too.
//   pokeapi.co                 species names, evolutions
//   raw.githubusercontent.com  PMD sprites, portraits, artist credits
//   api.github.com, github.com the app's own releases (update check / installer download)
//   *.open-meteo.com           weather, only when the user turned it on and typed a city (weather.js)
// The optional AI chat talks to the endpoint the user enters – see ai.js.
const ALLOWED_HOSTS = new Set(['pokeapi.co', 'raw.githubusercontent.com', 'api.github.com', 'github.com',
  'geocoding-api.open-meteo.com', 'api.open-meteo.com']);

function fetchAllowed(url) {
  const u = new URL(url);
  if (u.protocol !== 'https:' || !ALLOWED_HOSTS.has(u.hostname)) {
    return Promise.reject(new Error(`blocked host: ${u.hostname}`));
  }
  return fetchUrl(u.href);
}

const notFound = () => Object.assign(new Error('not-found'), { code: 'not-found' });

async function getJson(url) {
  const res = await fetchAllowed(url);
  if (res.status === 404) throw notFound();
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function getBuffer(url) {
  const res = await fetchAllowed(url);
  if (!res.ok) return null;
  return Buffer.from(await res.arrayBuffer());
}

const dex4 = (dex) => String(dex).padStart(4, '0');

/** Look up a species by English name or Pokédex number → { dex, names: { en, zh } }. */
async function lookupSpecies(query) {
  const q = String(query).trim().toLowerCase().replace(/\s+/g, '-').replace(/^#/, '');
  if (!q) throw notFound();
  const species = await getJson(`${API}/pokemon-species/${encodeURIComponent(q)}`);
  const pick = (lang) => species.names.find((n) => n.language.name === lang)?.name;
  return {
    dex: species.id,
    names: {
      en: pick('en') || species.name,
      zh: pick('zh-hans') || pick('zh-hant') || pick('en') || species.name
    }
  };
}

/**
 * How the games evolve it, from PokeAPI's evolution details: { how: 'level', level } | { how: 'item', item } (PokeAPI's
 * item name) | { how: 'trade' } | { how: 'friendship', level } | { how: 'other' }. Several ways (different games):
 * a level first, then an item, friendship, a trade.
 */
function wayOf(details) {
  const ways = (details || []).map((d) => {
    const trigger = d.trigger && d.trigger.name;
    if (trigger === 'use-item' && d.item) return { how: 'item', item: d.item.name };
    if (trigger === 'trade') return { how: 'trade' };
    if (trigger === 'level-up' && (d.min_happiness || d.min_affection)) return { how: 'friendship', level: d.min_level || null };
    if (trigger === 'level-up' && d.min_level) return { how: 'level', level: d.min_level };
    return { how: 'other' };
  });
  const levels = ways.filter((w) => w.how === 'level').map((w) => w.level);
  if (levels.length) return { how: 'level', level: Math.min(...levels) };
  return ['item', 'friendship', 'trade'].map((h) => ways.find((w) => w.how === h)).find(Boolean) || { how: 'other' };
}

/**
 * What a species can evolve into: [{ dex, names, level, how, item? }] (empty for a final form); level is the games'
 * level-up level (null for stones, trades and the like), how and item as in wayOf. Uses PokeAPI's evolution chain;
 * branching species (Eevee …) have several options.
 */
async function evolutionOptions(dex) {
  const species = await getJson(`${API}/pokemon-species/${dex}`);
  if (!species.evolution_chain) return [];
  const chain = await getJson(species.evolution_chain.url);
  const idOf = (node) => Number(node.species.url.match(/\/(\d+)\/?$/)[1]);
  const find = (node) => (idOf(node) === Number(dex) ? node : node.evolves_to.map(find).find(Boolean));
  const node = find(chain.chain);
  if (!node) return [];
  const out = [];
  for (const next of node.evolves_to.slice(0, 8)) {
    const way = wayOf(next.evolution_details);
    try { out.push({ ...(await lookupSpecies(idOf(next))), level: way.how === 'level' ? way.level : null, ...way }); } catch { /* skip */ }
  }
  return out;
}

/**
 * A random unevolved, non-legendary species that PMD has drawn – for adopting an egg.
 * Downloads its sprite on the way. Returns { dex, names, skin } (throws when nothing was found).
 */
async function randomEggSpecies(dir, { exclude = new Set(), shiny = false, tries = 12 } = {}) {
  for (let i = 0; i < tries; i++) {
    const dex = 1 + Math.floor(Math.random() * 1025);
    if (exclude.has(dex)) continue;
    let species;
    try { species = await getJson(`${API}/pokemon-species/${dex}`); } catch (e) { if (e.code === 'not-found') continue; throw e; }
    if (species.evolves_from_species || species.is_legendary || species.is_mythical) continue;
    let skin;
    try { skin = await downloadSkin(dex, shiny, dir); } catch (e) {
      if (e.code !== 'not-found') throw e;
      if (!shiny) continue;
      try { skin = await downloadSkin(dex, false, dir); } catch { continue; }   // no shiny sprite drawn yet
    }
    const pick = (lang) => species.names.find((n) => n.language.name === lang)?.name;
    const names = { en: pick('en') || species.name, zh: pick('zh-hans') || pick('zh-hant') || pick('en') || species.name };
    return { dex, names, skin };
  }
  throw notFound();
}

/** Parse PMD AnimData.xml → { Name: { fw, fh, durs: [ticks], copyOf } } */
function parseAnimData(xml) {
  const anims = {};
  for (const block of xml.match(/<Anim>[\s\S]*?<\/Anim>/g) || []) {
    const get = (tag) => (block.match(new RegExp(`<${tag}>([^<]*)</${tag}>`)) || [])[1];
    const name = get('Name');
    if (!name) continue;
    anims[name] = {
      fw: Number(get('FrameWidth')) || 0,
      fh: Number(get('FrameHeight')) || 0,
      durs: (block.match(/<Duration>(\d+)<\/Duration>/g) || []).map((d) => Number(d.replace(/\D/g, ''))),
      copyOf: get('CopyOf') || null
    };
  }
  return anims;
}

// ---------- PMD SpriteCollab artist credits (CC BY-NC 4.0 requires attribution) ----------
// tracker.json (~10 MB) lists the credit IDs per species/form; credit_names.txt maps IDs to names.
// Both are boiled down to a small index { "0025": { sprite, shiny, portrait } } cached in pmd-credits.json.
const CREDITS_FILE = 'pmd-credits.json';
const CREDITS_MAX_AGE = 7 * 24 * 3600 * 1000;
let creditIndex = null;     // { at, dex: { … } }
let creditFetch = null;     // in-flight refresh

function parseCreditNames(txt) {
  const names = {};
  for (const line of txt.split(/\r?\n/).slice(1)) {
    const [name, id] = line.split('\t');
    if (name && id) names[id.trim()] = name.trim();
  }
  return names;
}

/** { primary, secondary, total } → { names: [...], more: n } (unknown IDs are counted in "more"). */
function resolveCredit(credit, names) {
  if (!credit || !credit.primary) return null;
  const ids = [credit.primary, ...(credit.secondary || [])];
  const list = [...new Set(ids.map((id) => names[id]).filter(Boolean))];
  return { names: list, more: Math.max(0, (credit.total || ids.length) - list.length) };
}

function buildCreditIndex(tracker, names) {
  const dex = {};
  for (const [id, e] of Object.entries(tracker)) {
    const shinyEntry = e.subgroups?.['0000']?.subgroups?.['0001'];
    const sprite = resolveCredit(e.sprite_credit, names);
    dex[id] = {
      sprite,
      shiny: resolveCredit(shinyEntry?.sprite_credit, names) || sprite,
      portrait: resolveCredit(e.portrait_credit, names)
    };
  }
  return { at: Date.now(), dex };
}

function loadCreditIndex(dir) {
  if (!creditIndex) {
    try { creditIndex = JSON.parse(fs.readFileSync(path.join(dir, CREDITS_FILE), 'utf8')); } catch { creditIndex = null; }
  }
  return creditIndex;
}

function refreshCreditIndex(dir) {
  if (!creditFetch) {
    creditFetch = (async () => {
      const [tracker, namesRes] = await Promise.all([getJson(`${PMD}/tracker.json`), fetchAllowed(`${PMD}/credit_names.txt`)]);
      if (!namesRes.ok) throw new Error(`HTTP ${namesRes.status}`);
      creditIndex = buildCreditIndex(tracker, parseCreditNames(await namesRes.text()));
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, CREDITS_FILE), JSON.stringify(creditIndex));
      return creditIndex;
    })().finally(() => { creditFetch = null; });
  }
  return creditFetch;
}

/** Credits already cached locally (no network): { sprite, shiny, portrait } or null. */
function cachedCredits(dex, dir) {
  return loadCreditIndex(dir)?.dex?.[dex4(dex)] || null;
}

/** Credits for a species, refreshing the cached index when it's stale or lacks the species. Never throws. */
async function pmdCredits(dex, dir) {
  const idx = loadCreditIndex(dir);
  const hit = idx?.dex?.[dex4(dex)];
  if (hit && Date.now() - idx.at < CREDITS_MAX_AGE) return hit;
  try { return (await refreshCreditIndex(dir)).dex[dex4(dex)] || null; } catch { return hit || null; }
}

async function downloadPmd(dex, shiny, dir) {
  const base = `${PMD}/sprite/${dex4(dex)}${shiny ? '/0000/0001' : ''}`;
  // already here in the current format (downloaded before, or bundled with the app): no network needed
  const cached = path.join(dir, `pmd-${dex4(dex)}${shiny ? '-shiny' : ''}`);
  try {
    if (JSON.parse(fs.readFileSync(path.join(cached, 'pmd.json'), 'utf8')).v === PMD_VERSION
      && fs.existsSync(path.join(cached, 'anims.json'))) {
      return { source: 'pmd', style: 'pmd', dir: path.basename(cached), v: PMD_VERSION };
    }
  } catch { /* not cached yet */ }
  const xmlBuf = await getBuffer(`${base}/AnimData.xml`);
  if (!xmlBuf) throw notFound();
  const all = parseAnimData(xmlBuf.toString('utf8'));
  const folder = `pmd-${dex4(dex)}${shiny ? '-shiny' : ''}`;
  const out = path.join(dir, folder);
  fs.mkdirSync(out, { recursive: true });
  const meta = { source: 'pmd', style: 'pmd', dir: folder, v: PMD_VERSION };

  const anims = {};
  for (const name of Object.keys(all)) {
    let a = all[name];
    const sheetName = a.copyOf || name;
    if (a.copyOf) a = { ...all[a.copyOf], copyOf: a.copyOf };
    if (!a || !a.fw || !a.durs.length) continue;
    const file = `${sheetName}-Anim.png`;
    if (!fs.existsSync(path.join(out, file))) {
      const buf = await getBuffer(`${base}/${file}`);
      if (!buf) continue;
      fs.writeFileSync(path.join(out, file), buf);
    }
    anims[name] = { fw: a.fw, fh: a.fh, durs: a.durs, file };
  }
  if (!anims.Idle && !anims.Walk) throw notFound();
  fs.writeFileSync(path.join(out, 'anims.json'), JSON.stringify(anims));
  fs.writeFileSync(path.join(out, 'pmd.json'), JSON.stringify({ v: PMD_VERSION }));
  await pmdCredits(dex, dir);   // cache the artists' names for the panel
  return meta;
}

/** Download a species' PMD sprite ("skin"). Throws code 'not-found' when PMD has none. */
async function downloadSkin(dex, shiny, dir) {
  return { ...(await downloadPmd(dex, shiny, dir)), shiny: !!shiny };
}

/** PMD portrait (40x40 face), cached. emotion: Normal | Happy | Sad | Pain | Joyous … – shiny for shiny Pokémon. */
async function portrait(dex, emotion, dir, shiny = false) {
  const folder = path.join(dir, 'portraits');
  const file = path.join(folder, `${dex4(dex)}${shiny ? '-shiny' : ''}-${emotion}.png`);
  if (fs.existsSync(file)) return fs.readFileSync(file);
  // shiny faces live in portrait/<dex>/0000/0001/; fall back to the shiny "Normal" face, then the regular ones
  const base = `${PMD}/portrait/${dex4(dex)}`;
  const tries = [
    ...(shiny ? [`${base}/0000/0001/${emotion}.png`, `${base}/0000/0001/Normal.png`] : []),
    `${base}/${emotion}.png`, `${base}/Normal.png`
  ];
  let buf = null;
  for (const url of [...new Set(tries)]) { buf = await getBuffer(url); if (buf) break; }
  if (!buf) return null;
  fs.mkdirSync(folder, { recursive: true });
  fs.writeFileSync(file, buf);   // a missing emotion is stored as the closest face found
  await pmdCredits(dex, dir);    // and its artists' names
  return buf;
}

/** The cached PMD artist index ({ dex: { "0025": {…} } }) – also tells which species have sprites. */
function creditIndexCached(dir) { return loadCreditIndex(dir); }

module.exports = { SOURCES, PMD_VERSION, ALLOWED_HOSTS, fetchAllowed, creditIndexCached, lookupSpecies, evolutionWay: wayOf, evolutionOptions, randomEggSpecies, downloadSkin, portrait, pmdCredits, cachedCredits };
