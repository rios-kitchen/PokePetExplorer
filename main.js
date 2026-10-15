// PokePet Explorer – main process: windows, tray, Pomodoro timer, to-dos, raising and persistence.
const {
  app, BrowserWindow, ipcMain, Menu, Tray, nativeImage, screen, Notification, powerMonitor
} = require('electron');
const fs = require('fs');
const path = require('path');
const { Store, today, petOf, addEgg, freshPet } = require('./src/main/store');
const Sources = require('./src/main/sources');
const Care = require('./src/main/care');
const Diary = require('./src/main/diary');
const Growth = require('./src/main/growth');
const Expedition = require('./src/main/expedition');
const Achievements = require('./src/main/achievements');
const Secrets = require('./src/main/secrets');
const Album = require('./src/main/album');
const Fishing = require('./src/main/fishing');
const { Updater } = require('./src/main/updater');
const AI = require('./src/main/ai');

let updater = null;   // created when the app is ready
const { KeyActivity } = require('./src/main/keys');

const keys = new KeyActivity();
const png = require('./src/main/png');
const I18N = require('./src/shared/i18n');
const Sprites = require('./src/shared/sprites');

const IS_MAC = process.platform === 'darwin';
const PRELOAD = path.join(__dirname, 'src', 'preload.js');

let store;
let petWin = null;
let panelWin = null;
let tray = null;
let quitting = false;
let lastReminder = Date.now();
let lastPatXp = 0;
let drag = null;

/** Pomodoro timer – lives in the main process so pet and panel always agree. */
const timer = {
  phase: 'idle',   // idle | focus | short | long
  endsAt: 0,
  remaining: 0,
  total: 0,
  paused: false,
  round: 0,        // finished focus sessions in the current cycle
  taskId: null
};

// ---------- helpers ----------
const S = () => store.data.settings;
const lang = () => S().lang;
const T = (k, v) => I18N.t(lang(), k, v);

const { levelOf } = Growth;

function spritesDir() { return path.join(app.getPath('userData'), 'sprites'); }

/** The team. Every Pokémon came from an egg (or, for old saves, was one of PokePet's built-ins). */
function petList() {
  const team = store.data.custom.map((c) => ({ id: c.id, names: c.names, dex: c.dex, builtin: false }));
  // an evolved Pokémon keeps its id (and records) but is now another species
  return team.map((p) => {
    const rec = store.data.pets[p.id];
    if (rec && rec.stage === 'egg') return { ...p, names: { en: I18N.t('en', 'egg.name'), zh: I18N.t('zh', 'egg.name') }, egg: true };
    const sp = rec && rec.species;
    return sp ? { ...p, dex: sp.dex, names: sp.names, evolved: true } : p;
  });
}

/** The sprite ("skin") a Pokémon uses: its PMD sprite, or the built-in pixel art while that downloads. */
function skinOf(id) {
  const skin = store.data.skins[id];
  if (skin && skin.style === 'pmd') return skin;
  return Sprites.DEFS[id] ? { source: 'hd' } : { source: 'none' };
}

function skinInUse(meta, exceptId) {
  return Object.entries(store.data.skins).some(([id, m]) => id !== exceptId && meta.dir && m.dir === meta.dir);
}

function removeSkinFiles(meta, exceptId) {
  if (!meta || !meta.dir || skinInUse(meta, exceptId)) return;
  try { fs.rmSync(path.join(spritesDir(), meta.dir), { recursive: true, force: true }); } catch { /* already gone */ }
}

function migrate() {
  Diary.ensure(store.data);
}

/**
 * Give every Pokémon without a PMD sprite its download, and upgrade older PMD downloads
 * to the full animation set. Runs in the background; offline → retried next start.
 */
async function ensurePmdSkins() {
  for (const p of petList()) {
    if (!p.dex) continue;   // still an egg
    const skin = store.data.skins[p.id];
    const missing = !skin || skin.style !== 'pmd';
    const outdated = skin && skin.style === 'pmd' && skin.v !== Sources.PMD_VERSION;
    if (!missing && !outdated) continue;
    const shiny = !!(skin && skin.shiny);
    try {
      let meta;
      try { meta = await Sources.downloadSkin(p.dex, shiny, spritesDir()); } catch (e) {
        if (e.code !== 'not-found' || !shiny) throw e;
        meta = await Sources.downloadSkin(p.dex, false, spritesDir());   // shiny not drawn yet
      }
      store.data.skins[p.id] = meta;
      changed();
      if (S().pokemon === p.id) petEvent('skin', { id: p.id });
    } catch { /* offline or not in PMD: keep the placeholder */ }
  }
  // artist credits for sprites/portraits downloaded before credits were tracked
  const noCredits = petList().find((p) => !Sources.cachedCredits(p.dex, spritesDir()));
  if (noCredits && await Sources.pmdCredits(noCredits.dex, spritesDir())) broadcast();
}

/** PMD SpriteCollab artists for a Pokémon's sprite (if it uses a PMD sprite) and portrait. */
function creditsOf(p) {
  const c = Sources.cachedCredits(p.dex, spritesDir());
  if (!c) return null;
  const skin = skinOf(p.id);
  return { sprite: skin.style === 'pmd' ? (skin.shiny ? c.shiny : c.sprite) : null, portrait: c.portrait };
}

/** Is there an active Pokémon? (not before the starter has been chosen) */
const hasPet = () => !!S().pokemon && store.data.custom.some((c) => c.id === S().pokemon);
// before the starter is chosen these hand out throw-away records, so nothing is saved for "no one"
const careOfActive = () => (hasPet() ? Care.careOf(store.data, S().pokemon) : Care.freshCare());
const activePet = () => (hasPet() ? petOf(store.data, S().pokemon) : freshPet());

function petName(id = S().pokemon) {
  const p = petList().find((x) => x.id === id);
  return p ? (p.names[lang()] || p.names.en) : id;
}

function fmtTime(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

function timerLeft() {
  if (timer.phase === 'idle') return 0;
  return timer.paused ? timer.remaining : Math.max(0, timer.endsAt - Date.now());
}

function findTodo(id) { return store.data.todos.find((t) => t.id === id); }
function openTodos() { return store.data.todos.filter((t) => !t.done); }

function snapshot() {
  const d = store.data;
  return {
    settings: d.settings,
    pomodoro: d.pomodoro,
    todos: d.todos,
    pets: d.pets,
    custom: d.custom.map(({ id, dex, names }) => ({ id, dex, names })),
    skins: Object.fromEntries(petList().map((p) => [p.id, { source: skinOf(p.id).source, shiny: !!skinOf(p.id).shiny, style: skinOf(p.id).style || null, credits: creditsOf(p) }])),
    berries: d.berries,
    poops: d.poops.length,
    items: Care.ITEMS,
    reward: Care.REWARD,
    diary: { startDay: d.diary.startDay, days: d.diary.days },
    stats: d.stats,
    mood: Math.round(activePet().mood),   // the active Pokémon's (each has its own)
    growthRate: Growth.growthRate(activePet(), careOfActive()),
    hatchLevel: Growth.hatchLevel(d),
    ai: {
      providers: Object.fromEntries(Object.entries(AI.PROVIDERS).map(([k, p]) => [k, { url: p.url, models: p.models || [], noKey: !!p.noKey }])),
      hasKey: !!d.aiKeys[d.settings.ai.provider],
      busy: aiBusy
    },
    update: updater ? { ...updater.state } : null,
    version: app.getVersion(),
    expeditions: Expedition.EXPEDITIONS,
    diagnoseCost: Care.DIAGNOSE_COST,
    inventory: d.inventory,
    expedition: d.expedition,
    daily: d.daily,
    achievements: Achievements.list(d),
    fishdex: d.fishdex,
    souvenirs: d.souvenirs,
    photos: d.photos,
    album: { recent: Album.RECENT, maxFavorites: Album.MAX_FAVORITES },
    fish: Fishing.FISH,
    timer: { ...timer },
    platform: process.platform
  };
}

function send(win, channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

function broadcast() {
  const snap = snapshot();
  send(petWin, 'state', snap);
  send(panelWin, 'state', snap);
  send(fishWin, 'state', snap);
  updateTray();
}

function petEvent(type, data = {}) {
  send(petWin, 'pet:event', { type, ...data });
}

function changed() {
  checkAchievements();
  store.save();
  broadcast();
}

function checkAchievements() {
  for (const id of Achievements.unlockNew(store.data)) {
    const a = Achievements.ACHIEVEMENTS[id];
    petEvent('achievement', { id, reward: a.reward });
    notify(T('notif.achievement'), `${T(`ach.${id}`)} · +${a.reward} 🍓`);
  }
}

function notify(title, body) {
  if (!Notification.isSupported()) return;
  new Notification({ title, body, silent: true, icon: appIcon(64) }).show();
}

function addMood(n) {
  const pet = activePet();
  pet.mood = Math.max(0, Math.min(100, pet.mood + n));
}

function addXp(n, id = S().pokemon) {
  if (!id || !store.data.custom.some((c) => c.id === id)) return;
  const pet = petOf(store.data, id);
  const before = levelOf(pet.xp);
  pet.xp += n;
  levelChanged(id, before);
}

function levelChanged(id, before) {
  const after = levelOf(petOf(store.data, id).xp);
  if (after <= before) return;
  petEvent('level-up', { level: after, petId: id });
  Diary.record(store.data, 'levelUps');
  checkGrowth(id);
}

// ---------- raising: hatching, evolution, expeditions ----------
/** Hatch an egg or offer an evolution when the level is reached. */
function checkGrowth(id = S().pokemon) {
  if (!id || !store.data.custom.some((c) => c.id === id)) return;
  const pet = petOf(store.data, id);
  if (Growth.readyToHatch(pet, Growth.hatchLevel(store.data))) { hatchEgg(id); return; }
  if (Growth.evolutionDue(pet)) offerEvolution(id);
}

/**
 * Hatch an egg: its species (a random unevolved one) and whether it's shiny (1/64) are decided now,
 * unless the hidden hatch command planned them. Needs the internet for the species and its sprite;
 * offline it simply tries again on a later check.
 */
let hatching = null;
async function hatchEgg(id) {
  const pet = petOf(store.data, id);
  const entry = store.data.custom.find((c) => c.id === id);
  if (hatching || pet.stage !== 'egg' || !entry) return { ok: false, error: 'busy' };
  hatching = id;
  try {
    const plan = (pet.egg && pet.egg.plan) || {};
    const shiny = plan.shiny ?? Math.random() < Growth.SHINY_RATE;
    let sp;
    if (plan.dex) {
      const found = await Sources.lookupSpecies(plan.dex);
      let skin;
      try { skin = await Sources.downloadSkin(found.dex, shiny, spritesDir()); } catch (e) {
        if (e.code !== 'not-found' || !shiny) throw e;
        skin = await Sources.downloadSkin(found.dex, false, spritesDir());
      }
      sp = { ...found, skin };
    } else {
      const taken = new Set(petList().map((p) => p.dex).filter(Boolean));
      sp = await Sources.randomEggSpecies(spritesDir(), { exclude: taken, shiny });
    }
    Object.assign(entry, { dex: sp.dex, names: sp.names });
    store.data.skins[id] = sp.skin;
    pet.stage = 'hatched';
    pet.hatchedAt = Date.now();
    delete pet.egg;
    store.data.stats.hatches = (store.data.stats.hatches || 0) + 1;
    changed();
    if (S().pokemon === id) petEvent('hatched', { name: petName(id), shiny: !!sp.skin.shiny });
    notify(T('notif.hatched'), T('notif.hatchedBody', { name: petName(id) }));
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.code === 'not-found' ? 'not-found' : 'net' };
  } finally {
    hatching = null;
  }
}

let evolutionLookup = null;   // in flight
async function offerEvolution(id) {
  if (evolutionLookup || Expedition.isAway(store.data, id)) return;
  const pet = petOf(store.data, id);
  const p = petList().find((x) => x.id === id);
  if (!p) return;
  evolutionLookup = id;
  try {
    const options = await Sources.evolutionOptions(p.dex);
    if (!options.length) { pet.finalForm = true; changed(); return; }
    pet.evolution = { options, snoozeUntil: 0 };
    changed();
    if (S().pokemon === id) petEvent('evolve-ready', { name: petName(id), options: options.slice(0, 3) });
  } catch { /* offline: try again on a later check */ } finally {
    evolutionLookup = null;
  }
}

function snoozeEvolution(id = S().pokemon) {
  const pet = petOf(store.data, id);
  if (!pet.evolution) return;
  pet.evolution.snoozeUntil = Date.now() + Growth.EVOLVE_SNOOZE_H * 3600e3;
  changed();
}

/** Evolve into one of the offered species: same records, new sprite. */
async function evolve(id, dex) {
  const pet = petOf(store.data, id);
  const option = pet.evolution && pet.evolution.options.find((o) => o.dex === Number(dex));
  if (!option) return { ok: false, error: 'not-found' };
  const before = petName(id);
  try {
    const old = store.data.skins[id];
    const meta = await Sources.downloadSkin(option.dex, !!(old && old.shiny), spritesDir());
    store.data.skins[id] = meta;
    if (old) removeSkinFiles(old, id);
  } catch (e) {
    return { ok: false, error: e.code === 'not-found' ? 'not-found' : 'net' };
  }
  pet.species = { dex: option.dex, names: option.names };
  pet.evolutions = (pet.evolutions || 0) + 1;
  pet.evolution = null;
  for (const a of Object.keys(pet.attrs)) pet.attrs[a] += 5;
  addMood(20);
  Diary.record(store.data, 'levelUps');
  changed();
  if (S().pokemon === id) {
    petEvent('skin', { id });
    petEvent('evolved', { from: before, to: petName(id) });
  }
  notify(T('notif.evolved'), T('notif.evolvedBody', { from: before, to: petName(id) }));
  return { ok: true };
}

function startExpedition(expId, id = S().pokemon) {
  const res = Expedition.start(store.data, id, expId);
  if (res.ok) {
    if (S().pokemon === id) petEvent('expedition-start', { id: expId, kind: res.expedition.kind, endsAt: res.expedition.endsAt });
    changed();
  } else if (S().pokemon === id) {
    petEvent('expedition-refused', { reason: res.reason });
  }
  return res;
}

function recallExpedition() {
  const e = Expedition.recall(store.data);
  if (e && S().pokemon === e.petId) petEvent('expedition-back', { petId: e.petId, id: e.id, kind: e.kind, recalled: true });
  changed();
}

/** Bring a pet back from its expedition when its time is up (also after the app was closed). */
function checkExpedition() {
  const out = Expedition.finish(store.data);
  if (!out) return;
  const before = levelOf(petOf(store.data, out.petId).xp);
  petOf(store.data, out.petId).xp += out.xp;
  store.data.stats.expeditions = (store.data.stats.expeditions || 0) + 1;
  if (out.kind === 'travel') store.data.stats.travels = (store.data.stats.travels || 0) + 1;
  if (S().pokemon === out.petId) petEvent('expedition-back', out);
  levelChanged(out.petId, before);
  if (out.companion) bringCompanion(out.petId);
  notify(T('notif.expeditionBack'), T('notif.expeditionBackBody', { name: petName(out.petId), n: out.berries }));
  changed();
}

/** Buy items into the bag (the Care tab's shop). */
function shopBuy(itemId, n = 1) {
  const item = Care.ITEMS[itemId];
  n = Math.max(1, Math.min(20, Math.floor(Number(n) || 1)));
  if (!item || !item.cost) return { ok: false, reason: 'unknown' };
  if (store.data.berries < item.cost * n) return { ok: false, reason: 'berries' };
  store.data.berries -= item.cost * n;
  store.data.inventory[itemId] = (store.data.inventory[itemId] || 0) + n;
  changed();
  return { ok: true };
}

/** The app was called "PokePet Plus" before: bring its save, sprites and photos over once. */
function carryOverOldData() {
  if (process.env.POKEPET_DATA_DIR) return;
  const dir = app.getPath('userData');
  const old = path.join(path.dirname(dir), 'PokePet Plus');
  const file = path.join(dir, 'pokepetexplorer-data.json');
  const oldFile = path.join(old, 'pokepetplus-data.json');
  if (fs.existsSync(file) || !fs.existsSync(oldFile)) return;
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.copyFileSync(oldFile, file);
    for (const sub of ['sprites', 'photos']) {
      if (fs.existsSync(path.join(old, sub))) fs.cpSync(path.join(old, sub), path.join(dir, sub), { recursive: true });
    }
  } catch (e) {
    console.error('Could not copy the old data:', e);
  }
}

// ---------- photo album ----------
function photosDir() { return path.join(app.getPath('userData'), 'photos'); }

function deletePhotoFiles(list) {
  for (const ph of list) { try { fs.unlinkSync(path.join(photosDir(), ph.file)); } catch { /* gone */ } }
}

/** Star / unstar a photo (favourites are kept; only the newest few others are). */
function favoritePhoto(id, fav) {
  const res = Album.setFavorite(store.data.photos, String(id || ''), !!fav);
  deletePhotoFiles(res.dropped);
  if (res.ok) changed();
  return { ok: res.ok, reason: res.reason };
}

/** Save a group photo from an expedition (PNG data URL from the pet window). */
function savePhoto({ dataUrl, expId, region, petId }) {
  const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
  if (!m || !Expedition.EXPEDITIONS[expId]) return { ok: false };
  const buf = Buffer.from(m[1], 'base64');
  if (buf.length > 3e6) return { ok: false };
  const id = `ph${Date.now().toString(36)}`;
  fs.mkdirSync(photosDir(), { recursive: true });
  fs.writeFileSync(path.join(photosDir(), `${id}.png`), buf);
  store.data.photos.push({ id, file: `${id}.png`, expId, region: region || null, petId, at: Date.now() });
  deletePhotoFiles(Album.prune(store.data.photos));
  changed();
  return { ok: true, id };
}

/** The hidden command box (settings). Returns { ok } only – nothing that would explain it. */
async function runSecret(text) {
  const { cmd, args } = Secrets.parse(text);
  if (!cmd) return { ok: false };
  if (cmd === 'return') {
    // the expedition ends right now, with its full rewards
    if (!store.data.expedition) return { ok: false };
    store.data.expedition.endsAt = Date.now();
    checkExpedition();
    return { ok: true };
  }
  if (cmd === 'berries') {
    store.data.berries += 10;
    changed();
    petEvent('daily-berries', { n: 10 });
    return { ok: true };
  }
  if (cmd === 'shiny' && hasPet() && activePet().stage !== 'egg') {
    // the partner becomes shiny (its shiny sprite downloads; falls back to normal if not drawn)
    store.data.skins[S().pokemon] = { source: 'pending', shiny: true };
    changed();
    await ensurePmdSkins().catch(() => {});
    petEvent('skin', { id: S().pokemon });
    return { ok: true };
  }
  const words = args.filter((a) => a !== 'shiny');
  if (cmd === 'hatch' && !(hasPet() && activePet().stage === 'egg')) {
    // a new Pokémon joins right away: the one named (English name or dex), or a random one
    try {
      const shiny = args.includes('shiny');
      let sp;
      if (words.length) sp = await Sources.lookupSpecies(words.join('-'));
      else { const r = await Sources.randomEggSpecies(spritesDir(), { shiny }); sp = { dex: r.dex, names: r.names }; }
      const id = addPokemon({ dex: sp.dex, names: sp.names, shiny, from: 'secret' });
      if (!hasPet()) { S().pokemon = id; if (!petWin) createPetWindow(); if (starterWin && !starterWin.isDestroyed()) starterWin.close(); }
      changed();
      petEvent('joined', { name: sp.names[lang()] || sp.names.en });
      return { ok: true };
    } catch { return { ok: false }; }
  }
  // (old saves) the active Pokémon is still in its Poké Ball: open it now, optionally as a given species / shiny
  const id = S().pokemon;
  if (!hasPet()) return { ok: false };
  const pet = petOf(store.data, id);
  const plan = pet.egg ? pet.egg.plan || {} : {};
  if (cmd === 'shiny' || args.includes('shiny')) plan.shiny = true;
  if (cmd === 'hatch' && words.length) {
    try { plan.dex = (await Sources.lookupSpecies(words.join('-'))).dex; } catch { return { ok: false }; }
  }
  pet.egg = { plan };
  const res = await hatchEgg(id);
  return { ok: res.ok };
}


/** A wild Pokémon followed the pet home: find out who (needs the internet) and ask the trainer. */
async function bringCompanion(petId) {
  try {
    const taken = new Set(petList().map((p) => p.dex).filter(Boolean));
    const shiny = Math.random() < Growth.SHINY_RATE;
    const sp = await Sources.randomEggSpecies(spritesDir(), { exclude: taken, shiny });
    const j = offerJoin({ dex: sp.dex, names: sp.names, shiny: !!sp.skin.shiny, from: 'outing' });
    const name = sp.names[lang()] || sp.names.en;
    if (S().pokemon === petId) setTimeout(() => petEvent('companion', { name, by: petName(petId), token: j.token }), 7000);
    notify(T('notif.companion'), T('notif.companionBody', { name, by: petName(petId) }));
  } catch { /* offline: nobody followed this time */ }
}

function diagnosePet() {
  const res = Care.diagnose(store.data, S().pokemon);
  if (res.ok) {
    petEvent('diagnosed', { status: res.status.id, stage: res.status.stage, item: Care.CURE[res.status.id] });
    changed();
  } else {
    petEvent('care-refused', { reason: res.reason });
  }
  return res;
}

// ---------- icons ----------
function pokeballPng(size) {
  const img = png.scale(Sprites.pokeballRgba(), Math.max(1, Math.round(size / 16)));
  return png.encode(img.width, img.height, img.data);
}

const iconCache = {};
function appIcon(size) {
  if (!iconCache[size]) iconCache[size] = nativeImage.createFromBuffer(pokeballPng(size));
  return iconCache[size];
}

function trayIcon() {
  const img = nativeImage.createFromBuffer(pokeballPng(16), { scaleFactor: 1 });
  img.addRepresentation({ scaleFactor: 2, buffer: pokeballPng(32) });
  return img;
}

// ---------- pet window ----------
// Displayed sprite size reported by the pet window (bigger Showdown sprites need a bigger window).
let petFit = null;

function petSize() {
  const scale = S().scale;
  const w = petFit ? petFit.w : 46 * scale;
  const h = petFit ? petFit.h : 32 * scale;
  return { width: Math.max(260, Math.ceil(w) + 60), height: Math.ceil(h) + 148 };
}

function defaultPetPos(size) {
  const wa = screen.getPrimaryDisplay().workArea;
  return { x: wa.x + wa.width - size.width - 40, y: wa.y + wa.height - size.height };
}

function validPos(pos, size) {
  if (!pos) return false;
  return screen.getAllDisplays().some((d) => {
    const b = d.workArea;
    const cx = pos.x + size.width / 2, by = pos.y + size.height - 20;
    return cx >= b.x && cx <= b.x + b.width && by >= b.y && by <= b.y + b.height + 40;
  });
}

let savePosTimer = null;
function savePetPos() {
  clearTimeout(savePosTimer);
  savePosTimer = setTimeout(() => {
    if (!petWin || petWin.isDestroyed()) return;
    const [x, y] = petWin.getPosition();
    S().petPos = { x, y };
    store.save();
  }, 400);
}

function createPetWindow() {
  const size = petSize();
  const pos = validPos(S().petPos, size) ? S().petPos : defaultPetPos(size);
  petWin = new BrowserWindow({
    ...size, ...pos,
    transparent: true,
    backgroundColor: '#00000000',
    frame: false,
    resizable: false,
    movable: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    show: false,
    title: 'PokePet Explorer',
    webPreferences: { preload: PRELOAD, contextIsolation: true, sandbox: true, backgroundThrottling: false }
  });
  petWin.setAlwaysOnTop(true, 'floating');
  if (IS_MAC) petWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  petWin.setIgnoreMouseEvents(true, { forward: true });
  if (process.env.POKEPET_TEST) petWin.webContents.on("console-message", (e) => console.log("[pet]", e.message));
  petWin.loadFile(path.join(__dirname, 'src', 'pet', 'pet.html'));
  petWin.once('ready-to-show', () => { if (!S().petHidden) petWin.showInactive(); });
  petWin.on('closed', () => { petWin = null; });
}

function resizePet() {
  if (!petWin) return;
  const b = petWin.getBounds();
  const size = petSize();
  if (size.width === b.width && size.height === b.height) return;
  // keep the bottom-centre (where the pet stands) anchored
  const x = Math.round(b.x + b.width / 2 - size.width / 2);
  const y = b.y + b.height - size.height;
  petWin.setBounds({ x, y, ...size });
  savePetPos();
}

function resetPetPos() {
  if (!petWin) return;
  const size = petSize();
  petWin.setBounds({ ...defaultPetPos(size), ...size });
  setPetHidden(false);
  savePetPos();
}

function setPetHidden(hidden) {
  S().petHidden = hidden;
  if (petWin) hidden ? petWin.hide() : petWin.showInactive();
  for (const w of poopWins.values()) hidden ? w.hide() : w.showInactive();
  changed();
}

// ---------- panel window ----------
// ---------- starter and new team members ----------
// The first Pokémon is picked at the professor's from the three Kanto starters; later ones come from
// fishing (some catches want to come along) and outings (a wild friend follows the pet home).
const STARTERS = ['bulbasaur', 'charmander', 'squirtle'];   // ids with built-in pixel art (shown until PMD loads)
let starterWin = null;

function openStarter() {
  if (hasPet()) return;
  if (!starterWin || starterWin.isDestroyed()) {
    starterWin = new BrowserWindow({
      width: 560, height: 470, resizable: false, show: false, title: T('starter.title'), icon: appIcon(256),
      backgroundColor: '#f6f4ef', autoHideMenuBar: true,
      webPreferences: { preload: PRELOAD, contextIsolation: true, sandbox: true }
    });
    if (!IS_MAC) starterWin.setMenu(null);
    starterWin.loadFile(path.join(__dirname, 'src', 'starter', 'starter.html'));
    starterWin.once('ready-to-show', () => { starterWin.show(); starterWin.focus(); });
    starterWin.on('closed', () => { starterWin = null; });
  } else {
    starterWin.show();
    starterWin.focus();
  }
  if (IS_MAC) app.focus({ steal: true });
}

/**
 * A new Pokémon joins the team (already out of its ball). Its PMD sprite downloads in the background;
 * until then it shows the built-in art (starters) or a Poké Ball.
 */
function addPokemon({ id, dex, names, shiny = false, from }) {
  id = id || `mon-${dex}-${Date.now().toString(36)}`;
  store.data.custom.push({ id, dex, names });
  const pet = petOf(store.data, id);
  pet.stage = 'hatched';
  pet.hatchedAt = Date.now();
  pet.from = from || null;
  store.data.skins[id] = { source: 'pending', shiny: !!shiny };
  ensurePmdSkins().catch(() => {});
  return id;
}

function chooseStarter(id) {
  if (hasPet() || !STARTERS.includes(id)) return { ok: false };
  const def = Sprites.DEFS[id];
  addPokemon({ id, dex: def.dex, names: def.name, shiny: Math.random() < Growth.SHINY_RATE, from: 'starter' });
  S().pokemon = id;
  changed();
  if (!petWin) createPetWindow();
  for (const p of store.data.poops) createPoopWindow(p);
  if (starterWin && !starterWin.isDestroyed()) starterWin.close();
  setTimeout(() => petEvent('starter', { name: petName(id) }), 1500);
  return { ok: true };
}

// a new friend waiting for the trainer's answer: { token, dex, names, shiny, from }
let pendingJoin = null;

function offerJoin(info) {
  pendingJoin = { ...info, token: `j${Date.now().toString(36)}` };
  return pendingJoin;
}

function answerJoin(token, keep) {
  const j = pendingJoin;
  if (!j || j.token !== token) return { ok: false };
  pendingJoin = null;
  if (!keep) { changed(); return { ok: true, kept: false }; }
  const id = addPokemon({ dex: j.dex, names: j.names, shiny: j.shiny, from: j.from });
  changed();
  notify(T('notif.joined'), T('notif.joinedBody', { name: j.names[lang()] || j.names.en }));
  petEvent('joined', { name: j.names[lang()] || j.names.en });
  return { ok: true, kept: true, id };
}

// ---------- fishing ----------
let fishWin = null;
const bites = new Map();   // token -> hidden catch (the window only learns the species once it's landed)

function openFishing() {
  if (!fishWin || fishWin.isDestroyed()) {
    fishWin = new BrowserWindow({
      width: 500, height: 520, resizable: false, show: false, title: T('fish.title'), icon: appIcon(256),
      backgroundColor: '#1d1c1a', autoHideMenuBar: true,
      webPreferences: { preload: PRELOAD, contextIsolation: true, sandbox: true }
    });
    if (!IS_MAC) fishWin.setMenu(null);
    if (process.env.POKEPET_TEST) fishWin.webContents.on('console-message', (e) => console.log('[fish]', e.message));
    fishWin.loadFile(path.join(__dirname, 'src', 'fishing', 'fishing.html'));
    fishWin.once('ready-to-show', () => { fishWin.show(); fishWin.focus(); });
    fishWin.on('closed', () => { fishWin = null; bites.clear(); });
  } else {
    fishWin.show();
    fishWin.focus();
  }
  if (IS_MAC) app.focus({ steal: true });
}

function fishBite(depth) {
  const b = Fishing.bite(Number(depth) || 0);
  const token = `f${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  bites.clear();   // one line in the water at a time
  bites.set(token, b.hidden);
  return { token, tier: b.tier, bite: b.bite, pull: b.pull };
}

function fishLand(token) {
  const hidden = bites.get(token);
  bites.delete(token);
  if (!hidden) return { ok: false };
  const res = Fishing.land(store.data, hidden);
  if (!res) return { ok: false };
  // fishing together: the active Pokémon has fun and learns a little
  const pet = activePet();
  if (!activeAway() && pet.stage !== 'egg') { addXp(res.xp); addMood(3); }
  if (res.isNew || res.tier >= 2) petEvent('fish-caught', { name: res.names[lang()] || res.names.en, size: res.size, isNew: res.isNew });
  // sometimes the catch would rather come along than swim away
  const join = res.wantsToJoin ? offerJoin({ dex: res.dex, names: res.names, shiny: res.shiny, from: 'fishing' }) : null;
  changed();
  return { ok: true, ...res, join: join ? join.token : null };
}

// ---------- AI chat (optional, off by default) ----------
let chatWin = null;
let chatHistory = [];   // this session only – not saved
let aiBusy = false;

function openChat() {
  if (!S().ai.enabled) { openPanel('settings'); return; }
  if (!chatWin || chatWin.isDestroyed()) {
    chatWin = new BrowserWindow({
      width: 360, height: 500, minWidth: 300, minHeight: 360, show: false,
      title: T('chat.title', { name: petName() }), icon: appIcon(256), backgroundColor: '#f6f4ef', autoHideMenuBar: true,
      webPreferences: { preload: PRELOAD, contextIsolation: true, sandbox: true }
    });
    if (!IS_MAC) chatWin.setMenu(null);
    chatWin.loadFile(path.join(__dirname, 'src', 'chat', 'chat.html'));
    chatWin.once('ready-to-show', () => { chatWin.show(); chatWin.focus(); });
  } else {
    chatWin.show();
    chatWin.focus();
  }
  if (IS_MAC) app.focus({ steal: true });
}

/** What the pet knows about itself for the AI persona. */
function aiPetState() {
  const pet = activePet();
  const care = careOfActive();
  const p = petList().find((x) => x.id === S().pokemon);
  return {
    lang: lang(), name: petName(), species: p && p.names ? p.names.en : null, egg: pet.stage === 'egg',
    level: levelOf(pet.xp), mood: Math.round(pet.mood), hunger: Math.round(care.hunger), clean: Math.round(care.clean),
    health: Math.round(care.health), fainted: !!care.fainted,
    status: care.status && care.status.known ? care.status.id : care.sick ? 'unwell' : null,
    attrs: pet.attrs, focus: timer.phase === 'focus'
  };
}

async function aiChat(text) {
  text = String(text || '').trim().slice(0, 1000);
  if (!text || aiBusy) return { ok: false, error: 'busy' };
  if (!S().ai.enabled) return { ok: false, error: 'off' };
  chatHistory.push({ role: 'user', content: text, at: Date.now() });
  aiBusy = true;
  broadcastChat();
  try {
    const key = AI.decryptKey(store.data.aiKeys[S().ai.provider]);
    const res = await AI.chat(S().ai, key, aiPetState(), chatHistory.map(({ role, content }) => ({ role, content })));
    const reply = res.refused || !res.text ? T('chat.refused') : res.text;
    chatHistory.push({ role: 'assistant', content: reply, at: Date.now() });
    chatHistory = chatHistory.slice(-40);
    petEvent('ai-reply', { text: reply });
    return { ok: true, text: reply };
  } catch (e) {
    chatHistory.pop();   // let the user send it again
    return { ok: false, error: e.code || 'other' };
  } finally {
    aiBusy = false;
    broadcastChat();
  }
}

function broadcastChat() {
  send(chatWin, 'chat', { history: chatHistory, busy: aiBusy, name: petName(), lang: lang() });
}

function openPanel(tab) {
  if (!panelWin || panelWin.isDestroyed()) {
    panelWin = new BrowserWindow({
      width: 420,
      height: 640,
      minWidth: 360,
      minHeight: 480,
      show: false,
      title: T('appName'),
      icon: appIcon(256),
      backgroundColor: '#f6f4ef',
      autoHideMenuBar: true,
      webPreferences: { preload: PRELOAD, contextIsolation: true, sandbox: true }
    });
    if (!IS_MAC) panelWin.setMenu(null);
    if (process.env.POKEPET_TEST) panelWin.webContents.on("console-message", (e) => console.log("[panel]", e.message));
    panelWin.loadFile(path.join(__dirname, 'src', 'panel', 'panel.html'), { query: { tab: tab || 'focus' } });
    panelWin.once('ready-to-show', () => { panelWin.show(); panelWin.focus(); });
    panelWin.on('close', (e) => {
      if (!quitting) { e.preventDefault(); panelWin.hide(); }
    });
  } else {
    if (tab) send(panelWin, 'panel:tab', tab);
    panelWin.show();
    panelWin.focus();
  }
  if (IS_MAC) app.focus({ steal: true });
}

// ---------- timer ----------
function phaseMs(phase) {
  const p = store.data.pomodoro;
  return Math.round(({ focus: p.focus, short: p.short, long: p.long }[phase] || 25) * 60000);
}

function startPhase(phase) {
  const ms = phaseMs(phase);
  Object.assign(timer, { phase, total: ms, remaining: ms, endsAt: Date.now() + ms, paused: false, startedAt: Date.now() });
}

function nextBreakKind() {
  const every = Math.max(1, store.data.pomodoro.longEvery | 0);
  return timer.round > 0 && timer.round % every === 0 ? 'long' : 'short';
}

function timerCmd(cmd, arg) {
  switch (cmd) {
    case 'start': {
      if (arg !== undefined) timer.taskId = arg;
      if (timer.taskId && !findTodo(timer.taskId)) timer.taskId = null;
      startPhase('focus');
      const task = timer.taskId && findTodo(timer.taskId);
      petEvent('focus-start', { task: task ? task.text : null });
      break;
    }
    case 'break':
      startPhase(arg === 'long' || arg === 'short' ? arg : nextBreakKind());
      petEvent('break-start');
      break;
    case 'pause':
      if (timer.phase === 'idle' || timer.paused) return;
      timer.remaining = timerLeft();
      timer.paused = true;
      petEvent('paused');
      break;
    case 'resume':
      if (!timer.paused) return;
      timer.endsAt = Date.now() + timer.remaining;
      timer.paused = false;
      break;
    case 'stop':
      if (timer.phase === 'idle') return;
      Object.assign(timer, { phase: 'idle', paused: false, remaining: 0, endsAt: 0 });
      petEvent('stopped');
      break;
    case 'skip':
      if (timer.phase !== 'idle') completePhase(true);
      break;
    case 'set-task':
      timer.taskId = arg || null;
      break;
    default:
      return;
  }
  broadcast();
}

function completePhase(skipped) {
  const d = store.data;
  if (timer.phase === 'focus') {
    const task = timer.taskId && findTodo(timer.taskId);
    if (!skipped) {
      timer.round += 1;
      d.stats.todayPomos += 1;
      d.stats.totalPomos += 1;
      d.stats.focusMinutes += d.pomodoro.focus;
      if (task) task.pomos = (task.pomos || 0) + 1;
      d.berries += Care.REWARD.pomodoro;
      Diary.record(d, 'pomos');
      Diary.record(d, 'focusMin', d.pomodoro.focus);
      Diary.addSession(d, timer.startedAt || Date.now() - d.pomodoro.focus * 60000, d.pomodoro.focus);
      addMood(15);
      addXp(20);
      // studying together: the pet learns too (+1 Smart per 25 minutes of focus)
      const smart = Math.max(1, Math.round(d.pomodoro.focus / 25));
      if (!activeAway() && activePet().stage !== 'egg') activePet().attrs.smart += smart;
      notify(T('notif.focusEnd'), T('notif.focusEndBody', { name: petName() }));
      petEvent('focus-end', {
        min: d.pomodoro.focus,
        n: d.stats.todayPomos,
        berries: Care.REWARD.pomodoro,
        smart: !activeAway() && activePet().stage !== 'egg' ? Math.max(1, Math.round(d.pomodoro.focus / 25)) : 0,
        task: task && !task.done ? task.text : null,
        taskId: task && !task.done ? task.id : null
      });
    }
    lastReminder = Date.now();
    const kind = nextBreakKind();
    if (d.pomodoro.autoBreak || skipped) {
      startPhase(kind);
      petEvent('break-start', { delay: skipped ? 0 : 6000 });
    } else {
      Object.assign(timer, { phase: 'idle', paused: false, remaining: 0, endsAt: 0 });
    }
  } else {
    Object.assign(timer, { phase: 'idle', paused: false, remaining: 0, endsAt: 0 });
    if (!skipped) {
      notify(T('notif.breakEnd'), T('notif.breakEndBody'));
      petEvent('break-end');
    }
  }
  store.save();
}

function tick() {
  const now = Date.now();
  checkExpedition();
  if (timer.phase !== 'idle' && !timer.paused && now >= timer.endsAt) {
    completePhase(false);
    broadcast();
  }

  // due to-dos
  let dirty = false;
  for (const t of store.data.todos) {
    if (!t.done && t.due && !t.dueNotified && t.due <= now) {
      t.dueNotified = true;
      dirty = true;
      notify(T('notif.due'), t.text);
      petEvent('due', { task: t.text, taskId: t.id });
    }
  }
  if (dirty) changed();

  // gentle reminders about open to-dos (never during focus)
  const every = S().reminderMin;
  const open = openTodos();
  if (every > 0 && timer.phase !== 'focus' && open.length && now - lastReminder >= every * 60000) {
    lastReminder = now;
    petEvent('reminder', { n: open.length, task: open[0].text, taskId: open[0].id });
  }

  if (timer.phase !== 'idle') updateTrayTitle();
}

// Global input activity for the pet's reactions. No keyboard hook is used: the cursor position is
// polled, and "input happened but the cursor didn't move" (system idle time) means typing.
let lastCursor = null;
function pollInput() {
  if (!petWin || !petWin.isVisible() || !S().reactInput || process.env.POKEPET_TEST) return;
  const p = screen.getCursorScreenPoint();
  const b = petWin.getBounds();
  const moved = lastCursor ? Math.hypot(p.x - lastCursor.x, p.y - lastCursor.y) : 0;
  lastCursor = p;
  send(petWin, 'input', { x: p.x - b.x, y: p.y - b.y, moved, idle: powerMonitor.getSystemIdleTime(), sinceKey: keys.sinceKey() });
}

const lastNeedAlert = {};

const activeAway = () => Expedition.isAway(store.data, S().pokemon);

/** Time passes for the active Pokémon (not while it's away on an expedition). */
function careStep(hours, asleep) {
  if (!hasPet() || activeAway()) return;
  const care = careOfActive();
  const { moodDelta, events } = Care.decay(care, hours, { asleep, poops: store.data.poops.length });
  addMood(moodDelta);
  const caught = Care.rollStatus(care, activePet().mood);   // one roll per step (offline time too, like before)
  if (caught) {
    Diary.flag(store.data, 'sick');
    petEvent('got-sick');
  }
  if (events.includes('worse')) petEvent('status-worse', { stage: care.status && care.status.stage });
  if (events.includes('fainted')) {
    Diary.flag(store.data, 'fainted');
    notify(T('notif.fainted'), T('notif.faintedBody', { name: petName() }));
  }
}

function dailyBerries() {
  const d = store.data;
  if (d.lastRewardDay === today()) return;
  d.lastRewardDay = today();
  d.berries += Care.REWARD.daily;
  setTimeout(() => petEvent('daily-berries', { n: Care.REWARD.daily }), 4000);
}

function checkWeekly() {
  const w = Diary.pendingWeekly(store.data);
  if (!w) return;
  notify(T('notif.weekly'), T(`weekly.${w.verdict}`, { name: petName() }));
  petEvent('weekly', { score: w.score, verdict: w.verdict, start: w.start });
}

// ---------- droppings ----------
const poopWins = new Map();   // id -> BrowserWindow
const POOP_W = 64, POOP_H = 56;

function createPoopWindow(p) {
  const win = new BrowserWindow({
    width: POOP_W, height: POOP_H, x: Math.round(p.x), y: Math.round(p.y),
    transparent: true, backgroundColor: '#00000000', frame: false, resizable: false,
    minimizable: false, maximizable: false, fullscreenable: false, focusable: false,
    alwaysOnTop: true, skipTaskbar: true, hasShadow: false, show: false, title: 'PokePet Explorer',
    webPreferences: { preload: PRELOAD, contextIsolation: true, sandbox: true }
  });
  win.setAlwaysOnTop(true, 'floating');
  if (IS_MAC) win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.loadFile(path.join(__dirname, 'src', 'poop', 'poop.html'), { query: { id: p.id, lang: lang() } });
  win.once('ready-to-show', () => { if (!S().petHidden) win.showInactive(); });
  win.on('closed', () => poopWins.delete(p.id));
  poopWins.set(p.id, win);
}

function placePoop() {
  if (!petWin || store.data.poops.length >= 5) return;
  const b = petWin.getBounds();
  const wa = screen.getDisplayMatching(b).workArea;
  const x = Math.min(wa.x + wa.width - POOP_W, Math.max(wa.x, b.x + b.width / 2 - POOP_W / 2 + (Math.random() < 0.5 ? -1 : 1) * (30 + Math.random() * 40)));
  const y = b.y + b.height - POOP_H - 4;
  const p = { id: `p${Date.now().toString(36)}`, x, y, at: Date.now() };
  store.data.poops.push(p);
  createPoopWindow(p);
}

function doPoop() {
  const care = careOfActive();
  store.data.poopDueAt = null;
  petEvent('poop-start');
  setTimeout(() => {
    placePoop();
    care.pooped = true;
    care.clean = Math.max(0, care.clean - 25);
    Diary.record(store.data, 'poops');
    petEvent('poop-done');
    changed();
  }, 1800);
}

function cleanPoop(id) {
  const before = store.data.poops.length;
  store.data.poops = store.data.poops.filter((p) => id !== '*' && p.id !== id);
  const removed = before - store.data.poops.length;
  for (const [pid, win] of poopWins) {
    if (id === '*' || pid === id) { if (!win.isDestroyed()) win.close(); }
  }
  if (!removed) return;
  Diary.record(store.data, 'poopsCleaned', removed);
  addMood(2 * removed);
  petEvent('poop-cleaned', { n: removed });
  changed();
}

function poopTick(asleep) {
  const d = store.data;
  if (!hasPet() || activeAway()) return;
  const care = careOfActive();
  // now and then without a meal, too (about every 3 hours while active)
  if (!d.poopDueAt && !asleep && care.hunger > 50 && Math.random() < 1 / 180) {
    d.poopDueAt = Date.now() + (1 + Math.random() * 9) * 60000;
  }
  if (d.poopDueAt && Date.now() >= d.poopDueAt && timer.phase !== 'focus' && !asleep
      && !S().petHidden && !care.fainted && d.poops.length < 5) {
    doPoop();
  }
}

function slowTick() {
  const asleep = powerMonitor.getSystemIdleTime() >= 180;
  poopTick(asleep);
  careStep(1 / 60, asleep);
  const care = careOfActive();
  if (hasPet() && !activeAway()) {
    Diary.sample(store.data, activePet().mood, care.health, S().pokemon);
    // QQ Pet grows while it's online: a little XP every minute, slower when it's not well
    const before = levelOf(activePet().xp);
    if (Growth.grow(activePet(), care, 1 / 60)) levelChanged(S().pokemon, before);
    checkGrowth();

    // complain about the most urgent need, at most every 20 minutes per need
    const need = Care.urgentNeed(care);
    if (need && !asleep && timer.phase !== 'focus' && Date.now() - (lastNeedAlert[need] || 0) > 20 * 60000) {
      lastNeedAlert[need] = Date.now();
      petEvent('need', { need, item: Care.remedyFor(care, need), diagnose: need === 'sick' && !!care.status && !care.status.known });
    }
  }

  store.rollDay();
  dailyBerries();
  checkWeekly();
  Diary.prune(store.data);
  store.data.lastSeen = Date.now();
  store.save();
  broadcast();
}

/** Time passed while the app was closed: the pet rested in its Poké Ball (half speed, max 12 h). */
function offlineCare() {
  const last = store.data.lastSeen;
  if (!last) return;
  const hours = Math.min(12, (Date.now() - last) / 3600000);
  if (hours > 0.05) careStep(hours, true);
}

function useCareItem(itemId) {
  if (activeAway()) return { ok: false, reason: 'away' };
  const res = Care.useItem(store.data, S().pokemon, itemId);
  if (res.ok) {
    const field = { food: 'fed', bath: 'baths', med: 'meds', revive: 'meds' }[res.kind];
    if (res.kind === 'food' && !store.data.poopDueAt && Math.random() < 0.6) {
      store.data.poopDueAt = Date.now() + (20 + Math.random() * 25) * 60000;
    }
    Diary.record(store.data, field);
    if (res.cured) store.data.stats.cures = (store.data.stats.cures || 0) + 1;
    addMood(res.item.mood || 0);
    if (res.item.xp) addXp(res.item.xp);
    petEvent('care', { item: itemId, kind: res.kind, cured: !!res.cured, wrong: !!res.wrong, fainted: (res.events || []).includes('fainted') });
    changed();
  } else {
    petEvent('care-refused', { item: itemId, reason: res.reason });
  }
  return res;
}

// ---------- to-dos ----------
function addTodo({ text, due }) {
  text = String(text || '').trim().slice(0, 200);
  if (!text) return;
  const todo = {
    id: `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    text,
    done: false,
    createdAt: Date.now(),
    doneAt: null,
    due: due || null,
    pomos: 0
  };
  store.data.todos.push(todo);
  petEvent('todo-added', { task: text });
  changed();
}

function setTodoDone(id, done) {
  const t = findTodo(id);
  if (!t || t.done === done) return;
  t.done = done;
  t.doneAt = done ? Date.now() : null;
  if (done) {
    store.data.stats.todosDone += 1;
    store.data.stats.todayTodos += 1;
    store.data.berries += Care.REWARD.todo;
    Diary.record(store.data, 'todos');
    addMood(8);
    addXp(10);
    petEvent('todo-done', { task: t.text, allDone: openTodos().length === 0 });
  }
  changed();
}

// ---------- menus ----------
function buildMenu() {
  const s = S();
  const status = timer.phase === 'idle'
    ? T('menu.status.idle')
    : T(`menu.status.${timer.phase}`, { time: fmtTime(timerLeft()) }) + (timer.paused ? T('menu.status.paused') : '');
  const timerItems = timer.phase === 'idle'
    ? [{ label: T('menu.startFocus', { min: store.data.pomodoro.focus }), click: () => timerCmd('start') }]
    : [
      timer.paused
        ? { label: T('menu.resume'), click: () => timerCmd('resume') }
        : { label: T('menu.pause'), click: () => timerCmd('pause') },
      { label: T('menu.skip'), click: () => timerCmd('skip') },
      { label: T('menu.stop'), click: () => timerCmd('stop') }
    ];

  if (!hasPet()) {
    return Menu.buildFromTemplate([
      { label: T('starter.menu'), click: () => openStarter() },
      { type: 'separator' },
      { label: T('menu.todos'), click: () => openPanel('todos') },
      { label: T('menu.settings'), click: () => openPanel('settings') },
      { type: 'separator' },
      { label: T('menu.quit'), click: () => app.quit() }
    ]);
  }
  return Menu.buildFromTemplate([
    { label: status, enabled: false },
    ...timerItems,
    { type: 'separator' },
    ...(s.ai.enabled ? [{ label: T('menu.chat'), click: () => openChat() }] : []),
    { label: T('menu.todos'), click: () => openPanel('todos') },
    { label: T('menu.pomodoro'), click: () => openPanel('focus') },
    { type: 'separator' },
    {
      label: `${T('menu.care')}  ·  🍓 ${store.data.berries}`,
      submenu: [
        ...Object.entries(Care.ITEMS).map(([itemId, item]) => {
          const have = store.data.inventory[itemId] || 0;
          return {
            label: `${T(`item.${itemId}`)}${have ? `  ×${have}` : item.cost ? `  (${item.cost} 🍓)` : ''}`,
            enabled: !activeAway() && (have > 0 || store.data.berries >= item.cost),
            click: () => useCareItem(itemId)
          };
        }),
        {
          label: T('menu.diagnose', { n: Care.DIAGNOSE_COST }),
          enabled: !!careOfActive().status && !careOfActive().status.known,
          click: () => diagnosePet()
        },
        { label: T('menu.cleanPoops', { n: store.data.poops.length }), enabled: store.data.poops.length > 0, click: () => cleanPoop('*') },
        { type: 'separator' },
        { label: T('menu.careOpen'), click: () => openPanel('care') }
      ]
    },
    expeditionMenu(),
    { label: T('menu.fishing'), click: () => openFishing() },
    { label: T('menu.diary'), click: () => openPanel('diary') },
    { type: 'separator' },
    {
      label: T('menu.pokemon'),
      submenu: [
        ...petList().map((p) => ({
          label: `${p.names[lang()] || p.names.en}  ·  Lv.${levelOf(store.data.pets[p.id]?.xp)}`,
          type: 'radio',
          checked: s.pokemon === p.id,
          click: () => selectPokemon(p.id)
        })),
        { type: 'separator' },
        { label: T('menu.morePokemon'), click: () => openPanel('pokemon') }
      ]
    },
    {
      label: T('menu.size'),
      submenu: [2, 3, 4, 5].map((n) => ({
        label: T(`size.${n}`), type: 'radio', checked: s.scale === n, click: () => setSettings({ scale: n })
      }))
    },
    {
      label: T('menu.language'),
      submenu: I18N.langs.map((l) => ({
        label: I18N.langNames[l], type: 'radio', checked: s.lang === l, click: () => setSettings({ lang: l })
      }))
    },
    { label: T('menu.walk'), type: 'checkbox', checked: s.walk, click: (m) => setSettings({ walk: m.checked }) },
    { label: T('menu.sound'), type: 'checkbox', checked: s.sound, click: (m) => setSettings({ sound: m.checked }) },
    { label: T('menu.reactInput'), type: 'checkbox', checked: s.reactInput, click: (m) => setSettings({ reactInput: m.checked }) },
    { label: s.petHidden ? T('menu.show') : T('menu.hide'), click: () => setPetHidden(!s.petHidden) },
    ...(updater && updater.state.status === 'available'
      ? [{ label: T('menu.update', { v: updater.state.version }), click: () => openPanel('settings') }] : []),
    { label: T('menu.settings'), click: () => openPanel('settings') },
    { type: 'separator' },
    { label: T('menu.quit'), click: () => app.quit() }
  ]);
}

function expeditionMenu() {
  const e = store.data.expedition;
  if (e) {
    return {
      label: T('menu.expeditionAway', { name: petName(e.petId), time: fmtTime(e.endsAt - Date.now()) }),
      submenu: [{ label: T('menu.recall'), click: () => recallExpedition() }]
    };
  }
  const id = S().pokemon;
  const item = ([expId, exp]) => {
    const why = Expedition.blocker(store.data, id, expId);
    const req = why === 'level' ? ` · Lv.${exp.level}+`
      : why === 'stats' ? ` · ${Object.entries(exp.need).map(([a, v]) => `${T(`attr.${a}`)} ${v}+`).join(' ')}` : '';
    return { label: `${T(`exp.${expId}`)}  (${exp.min} ${T('unit.min')})${req}`, enabled: !why, click: () => startExpedition(expId) };
  };
  const all = Object.entries(Expedition.EXPEDITIONS);
  const group = (kind) => all.filter(([, x]) => x.kind === kind).map(item);
  const why = Expedition.blocker(store.data, id, 'woods');
  return {
    label: T('menu.expedition'),
    submenu: [
      ...(why && why !== 'level' && why !== 'stats' ? [{ label: T(`exp.blocked.${why}`), enabled: false }, { type: 'separator' }] : []),
      { label: T('exp.kind.dungeon'), enabled: false }, ...group('dungeon'),
      { type: 'separator' },
      { label: T('exp.kind.training'), enabled: false }, ...group('training'),
      { type: 'separator' },
      ...group('travel')
    ]
  };
}

function updateTrayTitle() {
  if (!tray) return;
  const label = timer.phase === 'idle' ? '' : `${timer.phase === 'focus' ? '🍅' : '☕'} ${fmtTime(timerLeft())}`;
  if (IS_MAC) tray.setTitle(label, { fontType: 'monospacedDigit' });
  tray.setToolTip(label ? `${T('appName')} – ${label}` : T('appName'));
}

function updateTray() { updateTrayTitle(); }

function createTray() {
  tray = new Tray(trayIcon());
  const popup = () => tray.popUpContextMenu(buildMenu());
  if (IS_MAC) {
    tray.on('click', popup);
    tray.on('right-click', popup);
  } else {
    tray.on('click', () => openPanel());
    tray.on('right-click', popup);
  }
  updateTray();
}

function setAppMenu() {
  if (!IS_MAC) { Menu.setApplicationMenu(null); return; }
  // Needed on macOS so copy/paste shortcuts work in text fields.
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { role: 'appMenu' },
    { role: 'editMenu' },
    { role: 'windowMenu' }
  ]));
}

// ---------- settings & pokémon ----------
function setSettings(patch) {
  const s = S();
  const oldScale = s.scale;
  for (const [k, v] of Object.entries(patch || {})) {
    if (k in s && k !== 'petPos' && k !== 'ai') s[k] = v;
  }
  if (patch && patch.ai && typeof patch.ai === 'object') {
    const a = patch.ai;
    s.ai = {
      enabled: !!a.enabled,
      provider: AI.PROVIDERS[a.provider] ? a.provider : s.ai.provider,
      baseUrl: String(a.baseUrl || '').trim().slice(0, 300),
      model: String(a.model || '').trim().slice(0, 120)
    };
    if (!s.ai.enabled) chatHistory = [];
  }
  s.scale = Math.max(2, Math.min(5, Number(s.scale) || 3));
  if (s.scale !== oldScale) resizePet();
  if ('launchAtLogin' in patch) {
    try { app.setLoginItemSettings({ openAtLogin: !!s.launchAtLogin }); } catch { /* unsupported */ }
  }
  if (panelWin && !panelWin.isDestroyed()) panelWin.setTitle(T('appName'));
  changed();
}

function setPomodoro(patch) {
  const p = store.data.pomodoro;
  for (const k of ['focus', 'short', 'long', 'longEvery']) {
    if (patch[k] != null) p[k] = Math.max(1, Math.min(180, Math.round(Number(patch[k]) || p[k])));
  }
  if (patch.autoBreak != null) p.autoBreak = !!patch.autoBreak;
  changed();
}

function selectPokemon(id) {
  if (!petList().some((p) => p.id === id) || S().pokemon === id) return;
  S().pokemon = id;
  changed();
  petEvent('switch', { name: petName(id) });
}

// ---------- IPC ----------
function registerIpc() {
  ipcMain.handle('state:get', () => snapshot());

  // pet window
  ipcMain.on('pet:ignore', (_e, ignore) => {
    if (petWin && !drag) petWin.setIgnoreMouseEvents(!!ignore, { forward: true });
  });
  ipcMain.on('pet:drag-start', () => {
    if (!petWin || drag) return;
    const c = screen.getCursorScreenPoint();
    const [x, y] = petWin.getPosition();
    drag = { dx: c.x - x, dy: c.y - y };
    drag.iv = setInterval(() => {
      if (!petWin) return;
      const p = screen.getCursorScreenPoint();
      petWin.setPosition(p.x - drag.dx, p.y - drag.dy);
    }, 16);
  });
  ipcMain.on('pet:drag-end', () => {
    if (!drag) return;
    clearInterval(drag.iv);
    drag = null;
    savePetPos();
  });
  ipcMain.handle('pet:move-by', (_e, dx) => {
    if (!petWin || drag) return null;
    const b = petWin.getBounds();
    const wa = screen.getDisplayMatching(b).workArea;
    const minX = wa.x - Math.round(b.width * 0.3);
    const maxX = wa.x + wa.width - Math.round(b.width * 0.7);
    let nx = b.x + Math.round(dx);
    let blocked = null;
    if (nx < minX) { nx = minX; blocked = 'left'; }
    if (nx > maxX) { nx = maxX; blocked = 'right'; }
    petWin.setPosition(nx, b.y);
    savePetPos();
    return blocked;
  });
  ipcMain.on('pet:menu', () => { if (petWin) buildMenu().popup({ window: petWin }); });
  ipcMain.handle('pet:pat', () => {
    Diary.record(store.data, 'pats');
    addMood(2);
    const now = Date.now();
    if (now - lastPatXp > 15000) { lastPatXp = now; addXp(1); }
    changed();
  });
  ipcMain.on('pet:action', (_e, action, arg) => {
    switch (action) {
      case 'todo-done': setTodoDone(arg, true); break;
      case 'start-focus': timerCmd('start', arg); break;
      case 'start-break': timerCmd('break'); break;
      case 'open': openPanel(arg); break;
      case 'care': useCareItem(arg); break;
      case 'diagnose': diagnosePet(); break;
      case 'evolve': evolve(S().pokemon, arg).then((r) => { if (!r.ok) petEvent('evolve-failed', { error: r.error }); }); break;
      case 'evolve-later': snoozeEvolution(); break;
      case 'expedition': startExpedition(arg); break;
      case 'recall': recallExpedition(); break;
      default: break;
    }
  });

  // panel
  ipcMain.on('panel:open', (_e, tab) => openPanel(tab));
  ipcMain.on('timer:cmd', (_e, cmd, arg) => timerCmd(cmd, arg));
  ipcMain.on('todo:add', (_e, todo) => addTodo(todo || {}));
  ipcMain.on('todo:set-done', (_e, id, done) => setTodoDone(id, !!done));
  ipcMain.on('todo:edit', (_e, id, patch) => {
    const t = findTodo(id);
    if (!t) return;
    if (typeof patch.text === 'string' && patch.text.trim()) t.text = patch.text.trim().slice(0, 200);
    if ('due' in patch) { t.due = patch.due || null; t.dueNotified = false; }
    changed();
  });
  ipcMain.on('todo:delete', (_e, id) => {
    store.data.todos = store.data.todos.filter((t) => t.id !== id);
    if (timer.taskId === id) timer.taskId = null;
    changed();
  });
  ipcMain.on('todo:clear-done', () => {
    store.data.todos = store.data.todos.filter((t) => !t.done);
    changed();
  });
  ipcMain.on('todo:reorder', (_e, ids) => {
    const map = new Map(store.data.todos.map((t) => [t.id, t]));
    const ordered = ids.map((id) => map.get(id)).filter(Boolean);
    const rest = store.data.todos.filter((t) => !ids.includes(t.id));
    store.data.todos = ordered.concat(rest);
    changed();
  });
  ipcMain.on('settings:set', (_e, patch) => setSettings(patch));
  ipcMain.on('pomodoro:set', (_e, patch) => setPomodoro(patch || {}));
  ipcMain.on('pet:reset-pos', () => resetPetPos());
  ipcMain.on('pokemon:select', (_e, id) => selectPokemon(id));
  ipcMain.on('pet:fit', (_e, fit) => {
    if (!fit || !(fit.w > 0) || !(fit.h > 0) || drag) return;
    petFit = { w: Math.min(600, fit.w), h: Math.min(600, fit.h) };
    resizePet();
  });
  // release a Pokémon (never the last one)
  ipcMain.on('pokemon:remove', (_e, id) => {
    if (!store.data.custom.some((x) => x.id === id) || store.data.custom.length < 2) return;
    if (Expedition.isAway(store.data, id)) Expedition.recall(store.data);
    removeSkinFiles(store.data.skins[id], id);
    delete store.data.skins[id];
    delete store.data.pets[id];
    store.data.custom = store.data.custom.filter((x) => x.id !== id);
    if (S().pokemon === id) S().pokemon = store.data.custom[0].id;
    changed();
  });
  ipcMain.handle('pokemon:assets', (_e, id) => {
    const skin = skinOf(id);
    const dataUrl = (file) => `data:image/png;base64,${fs.readFileSync(path.join(spritesDir(), file)).toString('base64')}`;
    try {
      if (skin.style === 'pmd') {
        const anims = JSON.parse(fs.readFileSync(path.join(spritesDir(), skin.dir, 'anims.json'), 'utf8'));
        for (const a of Object.values(anims)) a.url = dataUrl(path.join(skin.dir, a.file));
        return { kind: 'pmd', anims };
      }
    } catch { /* missing files */ }
    return Sprites.DEFS[id] ? { kind: 'grid', hd: true } : null;
  });
  ipcMain.handle('care:use', (_e, itemId) => useCareItem(itemId));
  ipcMain.handle('care:diagnose', () => diagnosePet());
  ipcMain.handle('shop:buy', (_e, itemId, n) => shopBuy(String(itemId || ''), n));
  ipcMain.handle('settings:extra', (_e, text) => runSecret(text));
  ipcMain.handle('starter:choose', (_e, id) => chooseStarter(String(id || '')));
  ipcMain.on('starter:open', () => openStarter());
  ipcMain.handle('join:answer', (_e, token, keep) => answerJoin(String(token || ''), !!keep));
  ipcMain.handle('fish:bite', (_e, depth) => fishBite(depth));
  ipcMain.handle('fish:land', (_e, token) => fishLand(String(token || '')));
  ipcMain.on('fish:lost', (_e, token) => bites.delete(String(token || '')));
  ipcMain.on('fish:open', () => openFishing());
  ipcMain.handle('photo:save', (_e, p) => savePhoto(p || {}));
  ipcMain.handle('photo:fav', (_e, id, fav) => favoritePhoto(id, fav));
  ipcMain.handle('photo:get', (_e, id) => {
    const ph = store.data.photos.find((x) => x.id === id);
    try { return ph ? `data:image/png;base64,${fs.readFileSync(path.join(photosDir(), ph.file)).toString('base64')}` : null; } catch { return null; }
  });
  ipcMain.handle('ai:chat', (_e, text) => aiChat(text));
  ipcMain.handle('ai:history', () => ({ history: chatHistory, busy: aiBusy, name: petName(), lang: lang() }));
  ipcMain.on('ai:clear', () => { chatHistory = []; broadcastChat(); });
  ipcMain.on('ai:open', () => openChat());
  ipcMain.handle('ai:set-key', (_e, provider, key) => {
    if (!AI.PROVIDERS[provider]) return { ok: false };
    const k = String(key || '').trim();
    if (k) store.data.aiKeys[provider] = AI.encryptKey(k); else delete store.data.aiKeys[provider];
    changed();
    return { ok: true };
  });
  ipcMain.handle('ai:models', async () => {
    try { return { ok: true, models: await AI.listModels(S().ai, AI.decryptKey(store.data.aiKeys[S().ai.provider])) }; } catch (e) { return { ok: false, error: e.code || 'other' }; }
  });
  ipcMain.handle('ai:test', async () => {
    try {
      const key = AI.decryptKey(store.data.aiKeys[S().ai.provider]);
      const res = await AI.chat(S().ai, key, aiPetState(), [{ role: 'user', content: lang() === 'zh' ? '你好！' : 'Hi!' }]);
      return { ok: true, text: res.text || T('chat.refused') };
    } catch (e) { return { ok: false, error: e.code || 'other' }; }
  });
  ipcMain.handle('update:check', () => updater.check());
  ipcMain.handle('update:download', () => updater.download());
  ipcMain.on('update:show', () => updater.openDownloaded());
  ipcMain.handle('expedition:start', (_e, expId) => startExpedition(String(expId || '')));
  ipcMain.on('expedition:recall', () => recallExpedition());
  ipcMain.handle('evolution:choose', (_e, dex) => evolve(S().pokemon, dex));
  ipcMain.on('evolution:later', () => snoozeEvolution());
  ipcMain.on('poop:clean', (_e, id) => cleanPoop(String(id || '')));
  ipcMain.handle('diary:portrait', async (_e, dex, emotion, shiny) => {
    try {
      const known = !!Sources.cachedCredits(dex, spritesDir());
      const buf = await Sources.portrait(dex, emotion, spritesDir(), !!shiny);
      if (!known && Sources.cachedCredits(dex, spritesDir())) broadcast();
      return buf ? `data:image/png;base64,${buf.toString('base64')}` : null;
    } catch { return null; }
  });
  ipcMain.handle('diary:week', (_e, start) => Diary.weekSummary(store.data, start));
}

// ---------- self-test (POKEPET_TEST=<dir>) ----------
// Runs a short scripted session with a throw-away data folder and saves window screenshots.
async function selfTest(dir) {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const shot = async (win, name) => {
    const img = await win.webContents.capturePage();
    fs.writeFileSync(path.join(dir, `${name}.png`), img.toPNG());
  };
  const step = async (name, fn) => {
    try { await fn(); } catch (e) { console.error(`self-test step ${name} failed:`, e); }
  };
  fs.mkdirSync(dir, { recursive: true });
  // a new player starts at the professor's: pick a starter (Charmander), then the test also uses a Pikachu
  await wait(2000);
  if (starterWin) {
    await starterWin.webContents.executeJavaScript("document.querySelectorAll('.card')[1].click(); 0");
    await wait(500);
    await shot(starterWin, '00-starter');
  }
  await step('starter', async () => console.log('[test] starter:', JSON.stringify(chooseStarter('charmander'))));
  await wait(2500);
  await shot(petWin, '00b-pet-starter');
  store.data.custom.unshift({ id: 'pikachu', dex: 25, names: Sprites.DEFS.pikachu.name });
  petOf(store.data, 'pikachu').stage = 'hatched';
  selectPokemon('pikachu');
  await wait(2500);
  await shot(petWin, '01-pet-hd');
  // phase sounds: run all four through the real event handlers
  for (const [type, data] of [['focus-start', {}], ['focus-end', { min: 25, n: 1 }], ['break-start', { delay: 0 }], ['break-end', {}]]) {
    petEvent(type, data);
    await wait(1600);
  }
  await shot(petWin, '01a-pet-break-end');
  const played = await petWin.webContents.executeJavaScript(
    "['focusStart', 'focusEnd', 'breakStart', 'breakEnd'].map((n) => { window.PokeSound.preview(n); return n; }).join(',')");
  console.log('[test] sounds played:', played);

  // keyboard only for real typing: a key press shows it, a mouse click (no key) must not
  const fake = (o) => send(petWin, 'input', { x: 600, y: 100, moved: 0, idle: 0, ...o });
  await wait(3000);
  for (let i = 0; i < 12; i++) { fake({ sinceKey: 80 }); await wait(60); }
  await shot(petWin, '01b-typing-key');
  await wait(2500);
  for (let i = 0; i < 20; i++) { fake({ sinceKey: 60000 }); await wait(60); }   // clicking only
  await shot(petWin, '01c-click-no-keyboard');

  // pooping: squat, dropping window, worried face with a bath button
  await step('poop', async () => doPoop());
  await wait(900);
  await shot(petWin, '01d-poop-squat');
  await wait(2500);
  await shot(petWin, '01e-poop-done');
  const pw = [...poopWins.values()][0];
  if (pw) await shot(pw, '01f-poop-window');
  console.log('[test] poops on screen:', store.data.poops.length, 'pooped flag:', careOfActive().pooped);
  openPanel('care');
  await wait(2000);
  await shot(panelWin, '01g-panel-care-pooped');
  await step('clean', async () => cleanPoop('*'));
  await wait(1500);
  console.log('[test] after cleaning:', store.data.poops.length, 'windows:', poopWins.size);

  // a week of fake history so the diary and the weekly report have something to show
  await step('history', async () => {
    const d = store.data;
    d.diary.startDay = Diary.addDays(today(), -8);
    d.diary.lastReported = -1;
    for (let i = 8; i >= 1; i--) {
      const key = Diary.addDays(today(), -i);
      const day = Diary.day(d, key);
      const n = (i * 7) % 5;
      for (let k = 0; k < n; k++) {
        const start = new Date(`${key}T${String(9 + k * 2 + (i % 3)).padStart(2, '0')}:${k % 2 ? '30' : '05'}:00`).getTime();
        day.sessions.push([start, 25]);
      }
      Object.assign(day, {
        pomos: n, focusMin: n * 25, todos: i % 3, fed: (i % 2) + 1, baths: i % 4 === 0 ? 1 : 0,
        pats: i * 2, moodSum: (55 + i * 4) * 60, moodN: 60, petId: 'pikachu', sick: i === 5, meds: i === 5 ? 1 : 0
      });
    }
    checkWeekly();
  });
  await wait(1500);
  await shot(petWin, '02-pet-weekly');

  await step('needs', async () => {
    const c = careOfActive();
    Object.assign(c, { hunger: 12, clean: 10, health: 40 });
    Care.inflict(c, 'poison');
    changed();
    petEvent('need', { need: 'sick', item: null, diagnose: true });
  });
  await wait(1500);
  await shot(petWin, '03-pet-sick-dirty');
  openPanel('care');
  panelWin.setSize(420, 1100);
  await wait(1500);
  await shot(panelWin, '04-panel-care');

  await step('diagnose+antidote', async () => {
    store.data.berries = 20;
    useCareItem('parlyz');                       // wrong medicine: poison gets a stage worse
    console.log('[test] after wrong medicine, stage:', careOfActive().status && careOfActive().status.stage);
    diagnosePet();
    useCareItem('antidote');
    console.log('[test] after antidote, status:', careOfActive().status);
  });
  await wait(2500);
  await shot(petWin, '05-pet-healed');
  await step('bath', async () => useCareItem('bath'));
  await wait(1500);
  await shot(petWin, '06-pet-bath');
  await wait(3000);
  await step('feed', async () => useCareItem('puff'));
  await wait(1800);
  await shot(petWin, '07-pet-eat');

  send(panelWin, 'panel:tab', 'diary');
  await wait(2500);
  await shot(panelWin, '08-panel-diary');

  await step('fainted', async () => {
    Object.assign(careOfActive(), { health: 0, sick: true, fainted: true });
    changed();
  });
  await wait(1200);
  await shot(petWin, '09-pet-fainted');
  await step('revive', async () => useCareItem('revive'));
  await wait(2500);

  await step('pmd', async () => {
    store.data.skins.pikachu = await Sources.downloadSkin(25, false, spritesDir());
    changed();
    petEvent('skin', { id: 'pikachu' });
  });
  await wait(3500);
  await shot(petWin, '10-pet-pmd');
  petEvent("focus-end", { min: 25, n: 1, berries: 3 });
  await wait(700);
  await shot(petWin, "10b-pet-pmd-celebrate");
  await wait(5000);
  petEvent("level-up", { level: 3, petId: S().pokemon });
  await wait(2300);
  await shot(petWin, "10c-pet-pmd-levelup");
  await wait(3000);

  // ---- raising: expedition (leave → away pill → back with loot), evolution offer → evolve
  await step('expedition', async () => {
    Object.assign(careOfActive(), { hunger: 90, clean: 90 });
    console.log('[test] expedition start:', JSON.stringify(startExpedition('woods')));
  });
  await wait(4000);
  await shot(petWin, '10d-pet-expedition-away');
  await step('expedition-back', async () => {
    let words = null;
    try { words = JSON.parse(fs.readFileSync(path.join(__dirname, 'test', 'secrets.local.json'), 'utf8')); } catch { /* none */ }
    if (words && words.return) console.log('[test] return code:', JSON.stringify(await runSecret(words.return)));
    else store.data.expedition.endsAt = Date.now();
  });
  await wait(3000);
  await shot(petWin, '10e-pet-expedition-back');
  await wait(6000);
  console.log('[test] photos:', store.data.photos.length);
  await step('evolution', async () => {
    const pet = activePet();
    pet.xp = Growth.xpFor(Growth.EVOLVE_LEVELS[0]);
    await offerEvolution(S().pokemon);
    console.log('[test] evolution options:', JSON.stringify((pet.evolution || {}).options));
  });
  await wait(1500);
  await shot(petWin, '10f-pet-evolve-ready');
  await step('evolve', async () => {
    const opt = activePet().evolution && activePet().evolution.options[0];
    console.log('[test] evolve:', JSON.stringify(opt && await evolve(S().pokemon, opt.dex)));
  });
  await wait(4000);
  await shot(petWin, '10g-pet-evolved');
  await wait(4000);

  await step('add-gengar', async () => {
    const sp = await Sources.lookupSpecies('gengar');
    const meta = await Sources.downloadSkin(sp.dex, false, spritesDir());
    store.data.custom.push({ id: `dex-${sp.dex}`, dex: sp.dex, names: sp.names });
    store.data.skins[`dex-${sp.dex}`] = meta;
    setSettings({ lang: 'zh' });
    selectPokemon(`dex-${sp.dex}`);
  });
  send(panelWin, 'panel:tab', 'pokemon');
  await wait(3000);
  await shot(petWin, '11-pet-gengar');
  await shot(panelWin, '12-panel-pokemon-zh');
  send(panelWin, 'panel:tab', 'diary');
  await wait(2000);
  await shot(panelWin, '13-panel-diary-zh');

  // ---- step 6 panel: work tab (timer + to-dos), shop, expedition, dex, egg → hatch
  addTodo({ text: '写周报' });
  addTodo({ text: '整理照片' });
  send(panelWin, 'panel:tab', 'work');
  await wait(1200);
  await shot(panelWin, '14-panel-work');
  await step('shop', async () => { store.data.berries = 40; shopBuy('antidote', 2); shopBuy('revive', 1); });
  send(panelWin, 'panel:tab', 'care');
  await wait(1200);
  await shot(panelWin, '15-panel-care-shop');
  await step('expedition-panel', async () => {
    Object.assign(careOfActive(), { hunger: 90, clean: 90 });
    startExpedition('coolClass');
  });
  send(panelWin, 'panel:tab', 'expedition');
  await wait(2500);
  await shot(panelWin, '16-panel-expedition');
  recallExpedition();
  send(panelWin, 'panel:tab', 'dex');
  await wait(1200);
  await shot(panelWin, '17-panel-dex');
  // a wild friend follows the pet home from an outing and asks to join
  await step('companion', async () => bringCompanion(S().pokemon));
  await wait(9000);
  await shot(petWin, '18-pet-companion');
  await step('companion-keep', async () => console.log('[test] companion keep:', JSON.stringify(pendingJoin && answerJoin(pendingJoin.token, true))));
  send(panelWin, 'panel:tab', 'pokemon');
  await wait(3000);
  await shot(panelWin, '19-panel-pokemon-team');
  // hidden commands (words from the untracked test/secrets.local.json): +10 berries, then a shiny Bulbasaur
  await step('secret', async () => {
    let words = null;
    try { words = JSON.parse(fs.readFileSync(path.join(__dirname, 'test', 'secrets.local.json'), 'utf8')); } catch { /* not on this machine */ }
    console.log('[test] wrong code:', JSON.stringify(await runSecret('nope')));
    if (!words) { console.log('[test] hidden commands: skipped (no test/secrets.local.json)'); return; }
    const before = store.data.berries;
    console.log('[test] berries code:', JSON.stringify(await runSecret(words.berries)), store.data.berries - before);
    console.log('[test] hatch code:', JSON.stringify(await runSecret(`${words.hatch} bulbasaur shiny`)), petName(), !!store.data.skins[S().pokemon].shiny);
  });
  await wait(3500);
  await shot(petWin, '20-pet-hatched-shiny');
  // album: four outings in a row → only the latest 3 regular photos stay; star the oldest one
  for (let i = 0; i < 4; i++) {
    await step(`photo-${i}`, async () => {
      Object.assign(careOfActive(), { hunger: 95, clean: 95, health: 100, sick: false, status: null });
      startExpedition('woods');
      store.data.expedition.endsAt = Date.now();
      checkExpedition();
    });
    await wait(4500);
  }
  console.log('[test] photos kept:', store.data.photos.length);
  await step('fav', async () => {
    const oldest = [...store.data.photos].sort((x, y) => x.at - y.at)[0];
    console.log('[test] star:', JSON.stringify(favoritePhoto(oldest.id, true)));
  });
  send(panelWin, 'panel:tab', 'dex');
  await wait(2000);
  await shot(panelWin, '21-panel-dex-album');
  await step('settings-ai', async () => setSettings({ ai: { enabled: true, provider: 'deepseek', baseUrl: '', model: 'deepseek-chat' } }));
  send(panelWin, 'panel:tab', 'settings');
  await wait(1500);
  await panelWin.webContents.executeJavaScript("document.querySelector('#aiTitle, [data-i18n=\"ai.title\"]').scrollIntoView()");
  await wait(500);
  await shot(panelWin, '22-panel-settings-ai');

  // ---- fishing: really play it – charge, cast, wait for the bite, hook, reel while watching the tension
  await step('fishing', async () => openFishing());
  await wait(2500);
  await shot(fishWin, '23-fish-idle');
  const js = (code) => fishWin.webContents.executeJavaScript(code);
  const DRIVER = `
    window.__fire = (type) => (type === 'mousedown' ? document.querySelector('#pond') : window)
      .dispatchEvent(new MouseEvent(type, { bubbles: true, button: 0 }));
    window.__isBite = () => ['en', 'zh'].some((l) => document.querySelector('#hint').textContent === window.PokeI18N.t(l, 'fish.hint.bite'));
    window.__reel = async () => {
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      for (let i = 0; i < 400 && !window.__isBite(); i++) await sleep(50);
      if (!window.__isBite()) return 'no-bite';
      window.__fire('mousedown');
      for (let i = 0; i < 600; i++) {
        await sleep(50);
        if (!document.querySelector('#result').classList.contains('hidden')) return 'caught';
        if (document.querySelector('#reel').classList.contains('hidden')) {
          await sleep(800);   // a catch shows its card a moment after the reel bars go away
          return document.querySelector('#result').classList.contains('hidden') ? 'lost' : 'caught';
        }
        const tension = parseFloat(document.querySelector('#tension').style.width) || 0;
        if (tension > 62) window.__fire('mouseup'); else if (tension < 30) window.__fire('mousedown');
      }
      return 'timeout';
    };
    0`;
  await js(DRIVER);
  let outcome = '';
  for (let attempt = 0; attempt < 3 && outcome !== 'caught'; attempt++) {
    await js("document.querySelector('#resOk').click(); window.__fire('mousedown'); 0");
    await wait(650);
    if (attempt === 0) await shot(fishWin, '24-fish-charging');
    await js("window.__fire('mouseup'); 0");
    await wait(1500);
    if (attempt === 0) await shot(fishWin, '25-fish-waiting');
    await js('window.__play = window.__reel(); 0');
    await wait(9000);
    if (attempt === 0) await shot(fishWin, '26-fish-reeling');
    outcome = await js('window.__play');
    console.log('[test] fishing attempt', attempt + 1, '→', outcome);
  }
  await wait(1500);
  await shot(fishWin, '27-fish-result');
  console.log('[test] fishdex:', JSON.stringify(store.data.fishdex));
  send(panelWin, 'panel:tab', 'dex');
  await wait(1500);
  await panelWin.webContents.executeJavaScript("document.querySelector('#fishHead').scrollIntoView()");
  await wait(1500);
  await shot(panelWin, '28-panel-fishdex');
  quitting = true;
  app.quit();
}

// ---------- app lifecycle ----------
if (process.env.POKEPET_DATA_DIR) app.setPath('userData', process.env.POKEPET_DATA_DIR);

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => openPanel());

  app.whenReady().then(() => {
    const sysLang = (app.getLocale() || 'en').toLowerCase().startsWith('zh') ? 'zh' : 'en';
    carryOverOldData();
    store = new Store(app.getPath('userData'), sysLang);
    deletePhotoFiles(Album.prune(store.data.photos));   // older saves kept up to 60 photos
    migrate();
    offlineCare();
    dailyBerries();
    setTimeout(checkWeekly, 15000);
    setTimeout(() => ensurePmdSkins().catch((e) => console.error("PMD download failed", e)), 3000);
    if (IS_MAC && app.dock) app.dock.hide();
    setAppMenu();
    registerIpc();
    createTray();
    if (hasPet()) {
      createPetWindow();
      for (const p of store.data.poops) createPoopWindow(p);
    } else {
      setTimeout(openStarter, 600);
    }
    keys.start();
    setInterval(tick, 1000);
    setInterval(slowTick, 60000);
    setInterval(pollInput, 60);
    // new release on GitHub? (checked once at startup; settings can turn it off)
    let announced = null;
    updater = new Updater((st) => {
      broadcast();
      if (st.status === 'available' && announced !== st.version) {
        announced = st.version;
        notify(T('notif.update'), T('notif.updateBody', { v: st.version }));
      }
    });
    if (S().checkUpdates && !process.env.POKEPET_TEST) setTimeout(() => updater.check(), 8000);
    if (process.env.POKEPET_TEST) selfTest(process.env.POKEPET_TEST).catch((e) => { console.error(e); app.exit(1); });
    screen.on('display-removed', () => {
      if (petWin && !validPos({ x: petWin.getBounds().x, y: petWin.getBounds().y }, petSize())) resetPetPos();
    });
  });

  app.on('before-quit', () => {
    quitting = true;
    keys.stop();
    if (store) store.flush();
  });

  // Keep running in the tray when windows are closed (having a handler prevents auto-quit).
  app.on('window-all-closed', () => {});
}
