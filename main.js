// PokePet Explorer – main process: windows, tray, Pomodoro timer, to-dos, raising and persistence.
const {
  app, BrowserWindow, ipcMain, Menu, Tray, nativeImage, screen, Notification, powerMonitor, dialog, shell
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
const Quiz = require('./src/main/quiz');
const CatchRules = require('./src/shared/catch-rules');
const MemoryRules = require('./src/shared/memory-rules');
const WhackRules = require('./src/shared/whack-rules');
const TypeQuiz = require('./src/main/typequiz');
const Rps = require('./src/main/rps');
const Voltorb = require('./src/main/voltorb');
const Echo = require('./src/main/echo');
const Shuffle = require('./src/main/shuffle');
const Daily = require('./src/main/daily');
const Weather = require('./src/main/weather');
const Battle = require('./src/main/battle');
const Wild = require('./src/main/wild');
const Data = require('./src/main/pokedata');
const Shiny = require('./src/main/shiny');
const Limits = require('./src/main/limits');
const Pokedex = require('./src/main/pokedex');
const { Updater, REPO: UpdaterRepo } = require('./src/main/updater');
const AI = require('./src/main/ai');

let updater = null;   // created when the app is ready
const { KeyActivity } = require('./src/main/keys');
const { FullscreenWatch } = require('./src/main/fullscreen');

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
const UPDATE_EVERY_MS = 8 * 3600e3;   // three checks a day (plus one at every start)
let updateDialogOpen = false;

/** Ask GitHub for a new release; when there is one, offer it in a dialog. */
async function checkForUpdate() {
  const st = await updater.check();
  store.data.updateCheckedAt = Date.now();
  changed();
  if (st.status === 'available' && !st.stage) promptUpdate(st);
}

async function promptUpdate(st) {
  if (updateDialogOpen) return;
  updateDialogOpen = true;
  try {
    if (IS_MAC) app.focus({ steal: true });
    const notes = String(st.notes || '').replace(/\*\*/g, '').split('\n').filter((l) => l.trim()).slice(0, 6).join('\n');
    // after an install that didn't take: install by hand, or (if that failed too) download it from GitHub
    const stage = st.stage;
    const { response } = await dialog.showMessageBox({
      type: stage ? 'warning' : 'info',
      title: T('update.dialogTitle'),
      message: stage === 'auto-failed' ? T('update.autoFailedMessage', { v: st.version })
        : stage === 'manual-failed' ? T('update.manualFailedMessage', { v: st.version })
          : T('update.dialogMessage', { v: st.version, now: app.getVersion() }),
      detail: stage ? '' : notes,
      buttons: [T(stage === 'auto-failed' ? 'update.installManual' : stage === 'manual-failed' ? 'update.dialogOpen'
        : st.canDownload ? 'update.dialogDownload' : 'update.dialogOpen'), T('update.dialogLater')],
      defaultId: 0,
      cancelId: 1,
      icon: appIcon(256)
    });
    if (response === 0) {
      openPanel('settings');
      if (stage === 'auto-failed') updater.openDownloaded();
      else if (stage === 'manual-failed') updater.openReleasePage();
      else if (st.canDownload) updater.download(); else shell.openExternal(st.url);
    }
  } finally {
    updateDialogOpen = false;
  }
}
const testFlags = { freeFishing: false, fishCenter: false, freeQuiz: false, freeCatch: false, freeMemory: false, freeWhack: false, freeTypes: false, freeRps: false, freeFlip: false, freeEcho: false, freeShuffle: false };   // switched by hidden test commands, never saved
const PAT_XP_PER_DAY = 20;
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

/** The sprite ("skin") a Pokémon uses: its PMD sprite (a Poké Ball is shown while that downloads). */
function skinOf(id) {
  const skin = store.data.skins[id];
  return skin && skin.style === 'pmd' ? skin : { source: 'none' };
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
  // the Pokédex also knows the team and every fish caught before it kept full records
  Pokedex.backfill(store.data,
    petList().map((p) => ({ dex: p.dex, names: p.names, shiny: !!(store.data.skins[p.id] || {}).shiny })),
    Object.keys(store.data.fishdex || {}).map((dex) => Fishing.FISH.find((f) => f.dex === Number(dex))).filter(Boolean));
}

/**
 * Give every Pokémon without a PMD sprite its download, and upgrade older PMD downloads
 * to the full animation set. Runs in the background; offline → retried next start.
 */
/**
 * The starters' PMD sprites and portraits ship with the app (assets/pmd, see tools/bundle-starters.js): copy them
 * into the sprite cache so the professor's window and the first partner work without the internet.
 */
function seedBundledSprites() {
  const from = path.join(__dirname, 'assets', 'pmd');
  const to = spritesDir();
  const copy = (rel) => {
    const src = path.join(from, rel), dst = path.join(to, rel);
    if (fs.statSync(src).isDirectory()) {
      fs.mkdirSync(dst, { recursive: true });
      for (const f of fs.readdirSync(src)) copy(path.join(rel, f));
    } else if (!fs.existsSync(dst)) fs.writeFileSync(dst, fs.readFileSync(src));
  };
  try {
    for (const f of fs.readdirSync(from)) if (f !== 'CREDITS.txt') copy(f);
  } catch { /* not bundled (running from source without it) */ }
}

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
    party: partyIds(),
    pokedexCount: Pokedex.counts(d),
    pokedex: Pokedex.list(d),
    grass: grassInfo(),
    fishing: fishingInfo(),
    quiz: quizInfo(),
    catchGame: catchInfo(),
    memory: memoryInfo(),
    whack: whackInfo(),
    types: typesInfo(),
    rps: rpsInfo(),
    flip: flipInfo(),
    echo: echoInfo(),
    shuffle: shuffleInfo(),
    fishingNow: fishingNow(),
    fishSpot: Fishing.spotName(fishSpot),
    encounter: waitingEncounter() ? { names: d.wild.encounter.sp.names, until: d.wild.encounter.until } : null,
    weatherNow: d.weatherNow,
    dailyInfo: { signRewards: Daily.SIGN_REWARDS, signItem: Daily.SIGN_ITEM, allDoneBonus: Daily.ALL_DONE_BONUS },
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
  send(wildWin, 'state', snap);
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
  // good moods make closer friends; close enough for a friendship evolution → look its evolution up again
  if (n > 0 && pet.stage === 'hatched' && Growth.befriend(pet, n / 2)) pet.evolveAt = null;
}

/** What it can evolve into and how, for its card: [{ dex, names, way, level, item }] (sources.js evolutionOptions). */
const evoPaths = (options) => options.map((o) => ({ dex: o.dex, names: o.names, way: Growth.wayOf(o), level: o.level || null, item: Growth.itemFor(o) }));

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
  if (pet.stage === 'hatched' && !pet.finalForm && pet.evolveAt == null) { lookupEvolveLevel(id); return; }
  if (Growth.evolutionDue(pet)) offerEvolution(id);
}

/** Find out at which level this species evolves (the games' level, from PokeAPI). Offline: try again later. */
const evolveLookups = new Set();
async function lookupEvolveLevel(id) {
  const p = petList().find((x) => x.id === id);
  if (!p || !p.dex || evolveLookups.has(id)) return;
  evolveLookups.add(id);
  try {
    const options = await Sources.evolutionOptions(p.dex);
    const pet = petOf(store.data, id);
    if (!options.length) pet.finalForm = true;
    else pet.evolveAt = Math.min(...options.map((o) => Growth.optionLevel(o, Growth.friendshipOf(pet))));
    pet.evoPaths = evoPaths(options);
    changed();
    if (Growth.evolutionDue(pet)) offerEvolution(id);
  } catch { /* offline */ } finally {
    evolveLookups.delete(id);
  }
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
    if (sp.skin.shiny) Shiny.obtained(store.data);
    Pokedex.caught(store.data, sp.dex, sp.names, { shiny: !!sp.skin.shiny });
    pet.stage = 'hatched';
    pet.hatchedAt = Date.now();
    delete pet.egg;
    store.data.stats.hatches = (store.data.stats.hatches || 0) + 1;
    changed();
    setTimeout(() => ensureAbilities().catch(() => {}), 2000);
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
    const all = await Sources.evolutionOptions(p.dex);
    if (!all.length) { pet.finalForm = true; changed(); return; }
    // only the forms it can reach at its level and friendship (e.g. Tyrogue's three at Lv20; stones are used instead)
    const need = (o) => Growth.optionLevel(o, Growth.friendshipOf(pet));
    pet.evoPaths = evoPaths(all);
    const options = all.filter((o) => need(o) <= levelOf(pet.xp));
    if (!options.length) { pet.evolveAt = Math.min(...all.map(need)); changed(); return; }
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
  setTimeout(() => ensureAbilities().catch(() => {}), 2000);   // the evolved species' ability
  Pokedex.caught(store.data, option.dex, option.names, { shiny: !!(store.data.skins[id] && store.data.skins[id].shiny) });
  pet.evolutions = (pet.evolutions || 0) + 1;
  pet.evolution = null;
  pet.evolvedAt = Date.now();
  pet.evolveAt = null;   // the new form's next evolution is looked up again
  pet.evoPaths = null;
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
  taskProgress(out.kind === 'training' ? 'train' : 'outing');
  if (out.kind === 'travel') store.data.stats.travels = (store.data.stats.travels || 0) + 1;
  if (S().pokemon === out.petId) petEvent('expedition-back', out);
  levelChanged(out.petId, before);
  if (out.companion) bringCompanion(out.petId);
  else if (out.kind !== 'training' && Math.random() < 0.3) offerOutingEncounter(out.petId, out.kind === 'travel' ? 'grass' : out.id, out.region);
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

// ---------- fullscreen apps ----------
const fullscreen = new FullscreenWatch((full) => {
  const show = !full && !S().petHidden;
  for (const w of [petWin, ...poopWins.values()]) {
    if (!w || w.isDestroyed()) continue;
    if (show) w.showInactive(); else w.hide();
  }
});

/** Apply the "hide over fullscreen apps" setting (the watcher; on macOS also the fullscreen Spaces). */
function applyFullscreenSetting() {
  const hide = S().hideOnFullscreen;
  if (IS_MAC) {
    for (const w of [petWin, ...poopWins.values()]) {
      if (w && !w.isDestroyed()) w.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: !hide });
    }
  }
  if (hide && !process.env.POKEPET_TEST) fullscreen.start(); else fullscreen.stop();
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
  if (cmd === 'forecast') {
    // testing: the Pokémon talks about the next 3 hours right now (with a made-up forecast when no city is set)
    await checkForecast(true);
    return { ok: true };
  }
  if (cmd === 'update') {
    // testing: the "new version" popup for a pretend next version (opens the releases page); with "fail" / "fail2"
    // the states after an install that didn't take (manual install / link to GitHub), in the popup and in Settings
    const [a, b, c] = app.getVersion().split('.').map(Number);
    const version = `${a}.${b}.${c + 1}`;
    const stage = args[0] === 'fail' ? 'auto-failed' : args[0] === 'fail2' ? 'manual-failed' : null;
    if (stage) updater.simulate(stage, version);
    setTimeout(() => promptUpdate(stage ? updater.state : { version, notes: T('update.testNotes'), canDownload: false,
      url: `https://github.com/${UpdaterRepo}/releases` }), 300);
    return { ok: true };
  }
  if (cmd === 'fishing') {
    // testing: fishing without daily / hourly limits or a tired pond, until used again or the app restarts;
    // with "center" every cast also lands in the deep middle (the hardest ring)
    if (args[0] === 'spot') {
      // testing: another fishing spot – one whose name contains the words after "spot" (e.g. route-12), or any
      const all = require('./src/main/encounters.json').fishing;
      const q = args.slice(1).join('-');
      fishSpot = (q && all.find((f) => f.n.includes(q))) || all[Math.floor(Math.random() * all.length)];
      changed();
      return { ok: true };
    }
    if (args[0] === 'center') { testFlags.freeFishing = true; testFlags.fishCenter = !testFlags.fishCenter; changed(); return { ok: true }; }
    testFlags.freeFishing = !testFlags.freeFishing;
    if (!testFlags.freeFishing) testFlags.fishCenter = false;
    changed();
    return { ok: true };
  }
  if (cmd === 'battle') {
    // a battle right away (no daily limit), optionally against a named Pokémon, or "legend" for a special encounter
    // ("legend ultra" / "legend paradox" / "legend mythical" / "legend legendary" for one kind)
    if (battle && !battle.b.over) { openWild(false); return { ok: true }; }
    const legend = args[0] === 'legend' ? (['legendary', 'mythical', 'ultra', 'paradox'].includes(args[1]) ? args[1] : true) : false;
    const res = await startBattle('test', { query: args.length && !legend ? args.join('-') : null, legend });
    if (!res.ok) return { ok: false };
    if (wildWin && !wildWin.isDestroyed()) { send(wildWin, 'wild:refresh'); wildWin.show(); wildWin.focus(); } else openWild(false);
    return { ok: true };
  }
  if (cmd === 'win' || cmd === 'catch') {
    // end the current battle: the wild Pokémon is beaten / caught
    if (!battle || battle.b.over) return { ok: false };
    const b = battle.b;
    if (cmd === 'win') { b.wild.hp = 0; b.wild.fainted = true; b.over = 'win'; } else b.over = 'caught';
    finishBattle();
    send(wildWin, 'wild:refresh');
    return { ok: true };
  }
  if (cmd === 'shuffle') {
    // testing: Poké Ball Shuffle without daily / hourly limits, until used again or the app restarts
    testFlags.freeShuffle = !testFlags.freeShuffle;
    changed();
    if (testFlags.freeShuffle) openShuffle();
    return { ok: true };
  }
  if (cmd === 'echo') {
    // testing: Chatot Echo without daily / hourly limits, until used again or the app restarts
    testFlags.freeEcho = !testFlags.freeEcho;
    changed();
    if (testFlags.freeEcho) openEcho();
    return { ok: true };
  }
  if (cmd === 'voltorbflip') {
    // testing: Voltorb Flip without daily / hourly limits, until used again or the app restarts
    testFlags.freeFlip = !testFlags.freeFlip;
    changed();
    if (testFlags.freeFlip) openFlip();
    return { ok: true };
  }
  if (cmd === 'rps') {
    // testing: Fire-Water-Grass without daily / hourly limits, until used again or the app restarts
    testFlags.freeRps = !testFlags.freeRps;
    changed();
    if (testFlags.freeRps) openRps();
    return { ok: true };
  }
  if (cmd === 'typequiz') {
    // testing: Type Match-up without daily / hourly limits, until used again or the app restarts
    testFlags.freeTypes = !testFlags.freeTypes;
    changed();
    if (testFlags.freeTypes) openTypes();
    return { ok: true };
  }
  if (cmd === 'whack') {
    // testing: Whack-a-Diglett without daily / hourly limits, until used again or the app restarts
    testFlags.freeWhack = !testFlags.freeWhack;
    changed();
    if (testFlags.freeWhack) openWhack();
    return { ok: true };
  }
  if (cmd === 'memory') {
    // testing: Memory Match without daily / hourly limits, until used again or the app restarts
    testFlags.freeMemory = !testFlags.freeMemory;
    changed();
    if (testFlags.freeMemory) openMemory();
    return { ok: true };
  }
  if (cmd === 'catchgame') {
    // testing: Berry Catch without daily / hourly limits, until used again or the app restarts
    testFlags.freeCatch = !testFlags.freeCatch;
    changed();
    if (testFlags.freeCatch) openCatch();
    return { ok: true };
  }
  if (cmd === 'quiz') {
    // testing: Who's That Pokémon? without daily / hourly limits, until used again or the app restarts
    testFlags.freeQuiz = !testFlags.freeQuiz;
    changed();
    if (testFlags.freeQuiz) openQuiz();
    return { ok: true };
  }
  if (cmd === 'evolution') {
    // one of every evolution item into the bag; the active Pokémon becomes a close friend and may evolve right away
    // (the week's wait is over); with a level ("evolution 36"), it also jumps to that level
    for (const id of Object.keys(Care.ITEMS)) if (Care.ITEMS[id].kind === 'evo') store.data.inventory[id] = (store.data.inventory[id] || 0) + 1;
    if (hasPet() && activePet().stage === 'hatched') {
      const pet = activePet();
      pet.friendship = Growth.FRIEND_MAX;
      pet.evolvedAt = Date.now() - 30 * 86400e3;   // evolveNotBefore counts from here
      if (Number(args[0]) > 0) pet.xp = Math.max(pet.xp, Growth.xpFor(Number(args[0])));
      pet.evolveAt = null;
      pet.evolution = null;
      checkGrowth();
    }
    changed();
    return { ok: true };
  }
  if (cmd === 'battlefx') {
    // alone: one of every held item into the bag; in a battle, with a weather, terrain, ability or held item:
    // put it on the field / give it to the Pokémon that's out
    const arg = args.join('-');
    if (!arg) {
      for (const id of Object.keys(Battle.HELD)) store.data.inventory[id] = (store.data.inventory[id] || 0) + 1;
      changed();
      return { ok: true };
    }
    if (!battle || battle.b.over) return { ok: false };
    const b = battle.b, m = b.party[b.active];
    const weather = { rain: 'rain', sun: 'sun', sand: 'sand', hail: 'hail', snow: 'snow' }[arg];
    const terrain = { electric: 'electric', grassy: 'grassy', misty: 'misty', psychic: 'psychic' }[arg];
    if (weather) b.field.weather = { id: weather, turns: 5 };
    else if (terrain) b.field.terrain = { id: terrain, turns: 5 };
    else if (Battle.HELD[arg]) { m.item = arg; m.locked = null; }
    else if (Battle.ABILITIES.has(arg)) { m.ability = arg; m.abilityNames = await Data.ability(arg, spritesDir()).catch(() => abilityLabel(arg)); }
    else return { ok: false };
    send(wildWin, 'wild:refresh');
    return { ok: true };
  }
  if (cmd === 'berries') {
    store.data.berries += 100;
    changed();
    petEvent('daily-berries', { n: 100 });
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
    const shiny = Shiny.roll(store.data);
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
  if (IS_MAC) petWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: !S().hideOnFullscreen });
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
  if (shiny) Shiny.obtained(store.data);
  Pokedex.caught(store.data, dex, names, { shiny });
  ensurePmdSkins().catch(() => {});
  setTimeout(() => ensureAbilities().catch(() => {}), 2000);
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
  if (info.from !== 'fishing') Pokedex.see(store.data, info.dex, info.names);   // a fish was seen when landed
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

// ---------- battles and catching ----------
// The wild window has two modes: exploring the grass (16 encounters a day) and battling. A battle can
// also start from an outing ("we met a wild Pokémon – go and battle it?"). Main keeps the battle state.
let wildWin = null;
let battle = null;           // { b: Battle state, ctx: { place, region, source, capture, ids, wild } }
// losing: health and mood lost by everyone on the team, berries dropped, and the chance that each Pokémon knocked
// out in the battle is still fainted at home (then it needs a Revive)
const LOSE_PENALTY = {
  outing: { health: 15, mood: 10, berries: 0, faint: 0.05 },
  grass: { health: 30, mood: 20, berries: 3, faint: 0.6 }
};
const BATTLE_ITEMS = ['pokeball', 'greatball', 'ultraball', 'oran', 'potion', 'antidote', 'parlyz', 'burnheal', 'iceheal', 'persim', 'fullheal', 'revive'];

function openWild(encounter) {
  if (!wildWin || wildWin.isDestroyed()) {
    wildWin = new BrowserWindow({
      width: 520, height: 560, resizable: false, show: false, title: T('wild.title'), icon: appIcon(256),
      backgroundColor: '#1d1c1a', autoHideMenuBar: true,
      webPreferences: { preload: PRELOAD, contextIsolation: true, sandbox: true }
    });
    if (!IS_MAC) wildWin.setMenu(null);
    if (process.env.POKEPET_TEST) wildWin.webContents.on('console-message', (e) => console.log('[wild]', e.message));
    wildWin.loadFile(path.join(__dirname, 'src', 'wild', 'wild.html'), { query: { encounter: encounter ? '1' : '' } });
    wildWin.once('ready-to-show', () => { wildWin.show(); wildWin.focus(); });
    wildWin.on('closed', () => { wildWin = null; if (battle && !battle.b.over) battle = null; });
  } else {
    wildWin.show();
    wildWin.focus();
    if (encounter) send(wildWin, 'wild:encounter');
  }
  if (IS_MAC) app.focus({ steal: true });
}

/** The Pokémon that battle: the chosen party (up to 6), or the partner alone. Not eggs, not away. */
function partyIds() {
  const ok = (id) => store.data.custom.some((c) => c.id === id && c.dex) && petOf(store.data, id).stage !== 'egg'
    && !Expedition.isAway(store.data, id);
  let ids = (S().party || []).filter(ok).slice(0, Battle.MAX_PARTY);
  if (!ids.length && hasPet() && ok(S().pokemon)) ids = [S().pokemon];
  return ids;
}

/** Grass limits for the windows: left today / this hour, and when the next hourly one frees up. */
function grassInfo() {
  const i = Limits.info(store.data, 'grass', today());
  return { ...i, energy: i.left };
}

/** The wild Pokémon an outing turned up, if it's still waiting. */
function waitingEncounter() {
  const e = store.data.wild.encounter;
  return e && Date.now() <= e.until ? e : null;
}

function bagForBattle() {
  return Object.fromEntries(BATTLE_ITEMS.map((id) => [id, store.data.inventory[id] || 0]).filter(([, n]) => n > 0));
}

/** Start a battle in the grass (uses an encounter) or from an outing. */
/**
 * Who appears: now and then a legendary or mythical Pokémon (special encounter), otherwise one from the games'
 * encounter table of a fitting place (the older type-based pick where there are no tables).
 * Returns { sp: { dex, names, types, capture }, level, special }.
 */
async function pickWild({ place, region, leadLevel, legend = false }) {
  const dir = spritesDir();
  const drawn = Wild.drawnDex(Sources.creditIndexCached(dir));
  const caught = new Set(Object.entries(store.data.pokedex || {}).filter(([, e]) => e.caught > 0).map(([d]) => Number(d)));
  const hit = Wild.pickLegend({ level: leadLevel, region, drawn, caught, force: legend })
    || Wild.pickFromTables({ place, region, level: leadLevel, drawn });
  if (hit) {
    const [info, pk] = await Promise.all([Data.species(hit.dex, dir), Data.pokemon(hit.dex, dir)]);
    return { sp: { dex: hit.dex, names: info.names, types: pk.types, capture: info.capture }, level: hit.level, special: hit.special || null };
  }
  const sp = await Wild.pickSpecies({ place, region, partnerLevel: leadLevel, drawn, dir, seen: Object.keys(store.data.pokedex).map(Number) });
  return { sp, level: Battle.wildLevel(leadLevel), special: null };
}

/** An ability's names when PokeAPI couldn't be asked: its id written out ("swift-swim" → "Swift Swim"). */
function abilityLabel(id) {
  const en = String(id).split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  return { en, zh: en };
}

/**
 * A Pokémon's ability: picked once from its species' regular abilities and kept; after evolving it becomes the
 * evolved species' ability in the same slot (as in the games). abilities: from PokeAPI (fetched if not given).
 * Returns { id, names } or null.
 */
async function ensureAbility(id, dex, abilities) {
  const rec = petOf(store.data, id);
  if (!dex || rec.stage === 'egg') return null;
  const cur = rec.ability;
  if (cur && cur.id && (cur.dex === dex || cur.slot == null)) {
    if (cur.names && cur.names.zh !== cur.names.en) return cur;
    const names = await Data.ability(cur.id, spritesDir()).catch(() => null);   // a better name once online
    if (names) cur.names = names;
    return cur;
  }
  if (!abilities) abilities = (await Data.pokemon(dex, spritesDir())).abilities || [];
  const regular = abilities.filter((a) => !a.hidden);
  if (!regular.length) return null;
  const slot = cur && cur.slot != null ? Math.min(cur.slot, regular.length - 1) : Math.floor(Math.random() * regular.length);
  const abId = regular[slot].id;
  const names = await Data.ability(abId, spritesDir()).catch(() => null);
  rec.ability = { slot, dex, id: abId, names: names || abilityLabel(abId) };
  return rec.ability;
}

/** Give every Pokémon on the team its ability (shown in the Pokémon tab), in the background. */
let abilitiesBusy = false, abilitiesAgain = false;
async function ensureAbilities() {
  if (abilitiesBusy) { abilitiesAgain = true; return; }   // a Pokémon joined meanwhile: go round once more
  abilitiesBusy = true;
  let any = false;
  try {
    do {
      abilitiesAgain = false;
      for (const p of petList()) {
        if (p.egg || !p.dex) continue;
        const before = JSON.stringify(petOf(store.data, p.id).ability);
        try { await ensureAbility(p.id, p.dex); } catch { /* offline: next time */ }
        if (JSON.stringify(petOf(store.data, p.id).ability) !== before) any = true;
      }
    } while (abilitiesAgain);
  } finally { abilitiesBusy = false; }
  if (any) changed();
}

/**
 * The real weather (when weather is on and was checked in the last 3 hours) carries into battles: rain and
 * thunderstorms bring rain, snow brings snow.
 */
function realBattleWeather() {
  const w = store.data.weatherNow;
  if (!S().weather || !S().weather.enabled || !w || Date.now() - w.at > 3 * 3600e3) return null;
  return { rain: 'rain', storm: 'rain', snow: 'snow' }[w.kind] || null;
}

/** Give a held item from the bag to a Pokémon (or take it back with itemId null); its old item goes back to the bag. */
function holdItem(id, itemId) {
  const d = store.data;
  if (!d.custom.some((c) => c.id === id) || petOf(d, id).stage === 'egg') return { ok: false, reason: 'unknown' };
  if (battle && !battle.b.over && battle.ctx.ids.includes(id)) return { ok: false, reason: 'battle' };
  if (itemId && (!Battle.HELD[itemId] || !(d.inventory[itemId] > 0))) return { ok: false, reason: 'none' };
  const rec = petOf(d, id);
  if (rec.held === (itemId || null)) return { ok: true };
  if (rec.held) d.inventory[rec.held] = (d.inventory[rec.held] || 0) + 1;
  rec.held = itemId || null;
  if (itemId) { d.inventory[itemId] -= 1; if (!d.inventory[itemId]) delete d.inventory[itemId]; }
  changed();
  return { ok: true };
}

async function startBattle(source, opts = {}) {
  if (battle && !battle.b.over) return { ok: true };
  const ids = partyIds().filter((id) => !Care.careOf(store.data, id).fainted);
  if (!ids.length) return { ok: false, error: 'noParty' };
  let place = 'grass', region = null;
  let met = null;
  if (source === 'outing') {
    met = waitingEncounter();
    if (!met) { store.data.wild.encounter = null; return { ok: false, error: 'gone' }; }
    ({ place, region } = met);
  } else if (source === 'grass' && Limits.blocked(grassInfo())) {
    return { ok: false, error: Limits.blocked(grassInfo()) };
  }
  const dir = spritesDir();
  try {
    const leadLevel = levelOf(petOf(store.data, ids[0]).xp);
    let sp, level = null, special = null;
    if (met) ({ sp, level = null, special = null } = met);
    else if (opts.query) {
      const found = await Sources.lookupSpecies(opts.query);
      const [info, pk] = await Promise.all([Data.species(found.dex, dir), Data.pokemon(found.dex, dir)]);
      sp = { dex: found.dex, names: info.names, types: pk.types, capture: info.capture };
    } else ({ sp, level, special } = await pickWild({ place, region, leadLevel, legend: opts.legend }));
    level = level || Battle.wildLevel(leadLevel);
    const shiny = Shiny.roll(store.data);
    const party = [];
    for (const id of ids) {
      const p = petList().find((x) => x.id === id);
      const rec = petOf(store.data, id);
      const mon = await Wild.battlerFor({ key: id, dex: p.dex, names: p.names, level: levelOf(rec.xp), attrs: rec.attrs, shiny: !!(store.data.skins[id] || {}).shiny, dir });
      const ab = await ensureAbility(id, p.dex, mon.abilities);
      party.push(Battle.makeMon({ ...mon, ability: ab && ab.id, abilityNames: ab && ab.names, item: rec.held }));
    }
    const w = await Wild.battlerFor({ key: 'wild', dex: sp.dex, names: sp.names, level, attrs: {}, shiny, dir });
    const wildAbility = Battle.pickAbility(w.abilities);
    const wildNames = wildAbility ? await Data.ability(wildAbility, dir).catch(() => null) : null;
    const wild = Battle.makeMon({ ...w, wild: true, ability: wildAbility, abilityNames: wildNames, item: Battle.pickWildItem(w.heldItems) });
    wild.special = special;   // 'legendary' | 'mythical' | 'ultra' | 'paradox' | null
    if (source === 'grass') Limits.use(store.data, 'grass', today());
    if (met) store.data.wild.encounter = null;
    if (!met) Pokedex.see(store.data, sp.dex, sp.names);   // an outing's Pokémon was seen when it was met
    const b = Battle.create({ party, wild, bag: bagForBattle(), weather: realBattleWeather() });
    battle = { b, intro: Battle.begin(b), ctx: { place, region, source, capture: sp.capture, ids } };
    changed();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.code === 'not-found' ? 'none' : 'net' };
  }
}

/** What the window needs to draw the battle. */
function battleView() {
  if (!battle) return null;
  const { b, ctx } = battle;
  const mon = (m) => ({ key: m.key, dex: m.dex, names: m.names, level: m.level, types: m.types, hp: m.hp, maxHp: m.maxHp,
    status: m.status && m.status.id, fainted: m.fainted, shiny: m.shiny, special: m.special || null,
    ability: m.ability ? { id: m.ability, names: m.abilityNames || abilityLabel(m.ability) } : null, item: m.item,
    sub: m.sub > 0, bound: !!m.bound, locked: m.locked,
    moves: m.moves.map((x) => ({ id: x.id, names: x.names, type: x.type, power: x.power, cls: x.cls })) });
  const f = b.field || {};
  return { party: b.party.map(mon), wild: mon(b.wild), active: b.active, bag: b.bag, over: b.over, needSwitch: b.needSwitch,
    weather: Battle.weatherOf(b), weatherSet: f.weather ? f.weather.id : null, terrain: f.terrain ? f.terrain.id : null,
    trapped: !b.over && !b.needSwitch ? Battle.trappedBy(b) : null, intro: battle.intro || [],
    place: ctx.place, region: ctx.region, source: ctx.source, result: ctx.result || null };
}

async function battleAct(action) {
  if (!battle || battle.b.over) return { events: [], view: battleView() };
  const events = Battle.act(battle.b, action || {}, Math.random, { captureRate: battle.ctx.capture });
  if (battle.b.over) finishBattle();
  return { events, view: battleView() };
}

/** Apply the outcome: XP, berries, statuses brought back, the light penalty for losing, a new team member. */
function finishBattle() {
  const { b, ctx } = battle;
  const d = store.data;
  for (const [id, n] of Object.entries(b.used)) {
    d.inventory[id] = Math.max(0, (d.inventory[id] || 0) - n);
    if (!d.inventory[id]) delete d.inventory[id];
  }
  // berries and Focus Sashes eaten / used up in the battle are gone
  b.party.forEach((m, i) => { if (m.heldAtStart && !m.item) petOf(d, ctx.ids[i]).held = null; });
  const result = { over: b.over, xp: 0, berries: 0, caughtId: null };
  const took = [...b.seen].map((i) => ctx.ids[i]);
  if (b.over === 'win' || b.over === 'caught') {
    result.xp = Battle.expFor(b.wild, took.length);
    for (const id of took) addXp(result.xp, id);
    if (b.over === 'win') {
      result.berries = 1 + Math.floor(Math.random() * 3);
      d.berries += result.berries;
      d.stats.battlesWon = (d.stats.battlesWon || 0) + 1;
      const lead = petOf(d, ctx.ids[b.active]);
      lead.attrs.tough += 1; lead.attrs.cool += 1;
      taskProgress('battle');
    }
  }
  if (b.over === 'caught') {
    const w = b.wild;
    const id = addPokemon({ dex: w.dex, names: w.names, shiny: w.shiny, from: 'caught' });
    petOf(d, id).xp = Growth.xpFor(w.level);
    // it keeps its ability and what it was holding
    if (w.ability) petOf(d, id).ability = { slot: null, dex: w.dex, id: w.ability, names: w.abilityNames || abilityLabel(w.ability) };
    petOf(d, id).held = w.item || null;
    d.stats.caught = (d.stats.caught || 0) + 1;
    result.caughtId = id;
    taskProgress('catch');
    petEvent('joined', { name: w.names[lang()] || w.names.en });
  }
  if (b.over === 'lose') {
    d.stats.battlesLost = (d.stats.battlesLost || 0) + 1;
    // outings: a light penalty; the grass is riskier – more tired, sadder, and berries dropped in the scramble.
    // Never fainted either way.
    const p = ctx.source === 'outing' ? LOSE_PENALTY.outing : LOSE_PENALTY.grass;
    for (const id of ctx.ids) {
      const care = Care.careOf(d, id);
      care.health = Math.max(1, care.health - p.health);
      const pet = petOf(d, id);
      pet.mood = Math.max(0, pet.mood - p.mood);
    }
    result.fainted = [];
    b.party.forEach((m, i) => {
      if (!m.fainted || Math.random() >= p.faint) return;
      Object.assign(Care.careOf(d, ctx.ids[i]), { fainted: true, sick: true, health: 0 });
      result.fainted.push(m.names);
    });
    result.lostBerries = Math.min(d.berries, p.berries);
    d.berries -= result.lostBerries;
    result.penalty = { health: p.health, mood: p.mood };
  }
  // conditions from the battle come home with them (burns, poison, paralysis, freezing)
  b.party.forEach((m, i) => {
    if (m.status && m.status.id !== 'confusion' && m.status.id !== 'sleep') {
      const care = Care.careOf(d, ctx.ids[i]);
      if (!care.status && !care.fainted) { Care.inflict(care, m.status.id); care.status.known = true; }
    }
  });
  ctx.result = result;
  changed();
}

/**
 * An outing turned up a wild Pokémon: it came back with the pet and waits ENCOUNTER_WAIT_MIN minutes for a
 * battle. The pet asks right away; after that the Pokémon leaves.
 */
async function offerOutingEncounter(petId, place, region) {
  let sp, picked;
  try {
    picked = await pickWild({ place, region, leadLevel: levelOf(petOf(store.data, petId).xp) });
    sp = picked.sp;
  } catch { return; }   // offline: nobody this time
  const until = Date.now() + Wild.ENCOUNTER_WAIT_MIN * 60e3;
  store.data.wild.encounter = { place, region, by: petId, sp, until, level: picked.level, special: picked.special };
  Pokedex.see(store.data, sp.dex, sp.names);
  changed();
  const info = { name: sp.names[lang()] || sp.names.en, by: petName(petId), min: Wild.ENCOUNTER_WAIT_MIN };
  setTimeout(() => petEvent('encounter', info), 4000);   // right after the welcome-back bubble
  notify(T('notif.encounter'), T('notif.encounterBody', info));
  if (wildWin && !wildWin.isDestroyed()) send(wildWin, 'wild:encounter');
}

/** The waiting wild Pokémon gave up. */
function checkEncounter() {
  const e = store.data.wild.encounter;
  if (!e || Date.now() <= e.until || (battle && !battle.b.over && battle.ctx.source === 'outing')) return;
  store.data.wild.encounter = null;
  const name = e.sp.names[lang()] || e.sp.names.en;
  petEvent('encounter-gone', { name });
  notify(T('notif.encounterGone'), T('notif.encounterGoneBody', { name }));
  if (wildWin && !wildWin.isDestroyed()) send(wildWin, 'wild:encounter');
  changed();
}

// ---------- fishing ----------
let fishWin = null;
const bites = new Map();   // token -> hidden catch (the window only learns the species once it's landed)

let fishSpot = null;   // this trip's fishing spot (a real place from the games, see fishing.js)

function openFishing() {
  if (!fishWin || fishWin.isDestroyed()) {
    // each trip to the pond is a spot suited to the partner's level
    const lead = partyIds()[0] || S().pokemon;
    fishSpot = Fishing.pickSpot(lead ? levelOf(petOf(store.data, lead).xp) : 5);
    fishWin = new BrowserWindow({
      width: 500, height: 520, resizable: false, show: false, title: T('fish.title'), icon: appIcon(256),
      backgroundColor: '#1d1c1a', autoHideMenuBar: true,
      webPreferences: { preload: PRELOAD, contextIsolation: true, sandbox: true }
    });
    if (!IS_MAC) fishWin.setMenu(null);
    if (process.env.POKEPET_TEST) fishWin.webContents.on('console-message', (e) => console.log('[fish]', e.message));
    fishWin.loadFile(path.join(__dirname, 'src', 'fishing', 'fishing.html'));
    fishWin.once('ready-to-show', () => { fishWin.show(); fishWin.focus(); changed(); });
    fishWin.on('closed', () => { fishWin = null; bites.clear(); changed(); });
  } else {
    fishWin.show();
    fishWin.focus();
  }
  if (IS_MAC) app.focus({ steal: true });
}

/** Fishing limits as the windows see them (unlimited while testing). */
function fishingInfo() {
  if (testFlags.freeFishing) return { left: 999, dayLeft: 999, hourLeft: 999, max: 999, hourMax: 999, recent: 0, nextAt: null, free: true, center: testFlags.fishCenter };
  return Limits.info(store.data, 'fishing', today());
}

function fishBite(zone) {
  // daily and hourly limits; the more bites this hour, the longer they take and the more of them are junk
  const lim = fishingInfo();
  const why = Limits.blocked(lim);
  if (why) return { ok: false, error: why, nextAt: lim.nextAt };
  const b = Fishing.bite(Number(zone) || 0, Math.random, new Set(Object.keys(store.data.fishdex).map(Number)), lim.recent, fishSpot);
  if (!lim.free) Limits.use(store.data, 'fishing', today());
  changed();
  const token = `f${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  bites.clear();   // one line in the water at a time
  bites.set(token, b.hidden);
  return { ok: true, token, tier: b.tier, bite: b.bite, pull: b.pull, delay: Fishing.biteDelay(lim.recent) };
}

function fishLand(token) {
  const hidden = bites.get(token);
  bites.delete(token);
  if (!hidden) return { ok: false };
  const res = Fishing.land(store.data, hidden);
  if (!res) return { ok: false };
  if (res.junk) { changed(); return { ok: true, ...res }; }
  Pokedex.see(store.data, res.dex, res.names);
  taskProgress('fish');
  // fishing together: the active Pokémon has fun and learns a little
  const pet = activePet();
  if (!activeAway() && pet.stage !== 'egg') { addXp(res.xp); addMood(3); }
  if (res.isNew || res.tier >= 2) petEvent('fish-caught', { name: res.names[lang()] || res.names.en, size: res.size, isNew: res.isNew });
  // sometimes the catch would rather come along than swim away
  const join = res.wantsToJoin ? offerJoin({ dex: res.dex, names: res.names, shiny: res.shiny, from: 'fishing' }) : null;
  changed();
  return { ok: true, ...res, join: join ? join.token : null };
}

// ---------- Who's That Pokémon? (猜猜我是谁) ----------
let quizWin = null;
const quizzes = new Map();   // token -> { answer, names } (the window only learns the answer after guessing)
const quizRecent = [];       // the last answers, not asked again right away

function openQuiz() {
  if (!quizWin || quizWin.isDestroyed()) {
    quizWin = new BrowserWindow({
      width: 380, height: 500, resizable: false, show: false, title: T('quiz.title'), icon: appIcon(256),
      backgroundColor: '#1d1c1a', autoHideMenuBar: true,
      webPreferences: { preload: PRELOAD, contextIsolation: true, sandbox: true }
    });
    if (!IS_MAC) quizWin.setMenu(null);
    if (process.env.POKEPET_TEST) quizWin.webContents.on('console-message', (e) => console.log('[quiz]', e.message));
    quizWin.loadFile(path.join(__dirname, 'src', 'quiz', 'quiz.html'));
    quizWin.once('ready-to-show', () => { quizWin.show(); quizWin.focus(); });
    quizWin.on('closed', () => { quizWin = null; quizzes.clear(); });
  } else {
    quizWin.show();
    quizWin.focus();
  }
  if (IS_MAC) app.focus({ steal: true });
}

/** Quiz limits as the windows see them (unlimited while testing). */
function quizInfo() {
  if (testFlags.freeQuiz) return { left: 999, dayLeft: 999, hourLeft: 999, max: 999, hourMax: 999, recent: 0, nextAt: null, free: true };
  return Limits.info(store.data, 'quiz', today());
}

/** A new question: a silhouette (its idle sprite sheet as a data URL) and four names. Counts one play once it's ready. */
async function quizAsk() {
  const lim = quizInfo();
  const why = Limits.blocked(lim);
  if (why) return { ok: false, error: why, nextAt: lim.nextAt };
  const list = Quiz.pool(Sources.creditIndexCached(spritesDir()));
  const known = Object.keys(store.data.pokedex || {}).map(Number);
  for (let tries = 0; tries < 4; tries++) {
    const q = Quiz.question(list, { known, exclude: quizRecent });
    let sprite, species;
    try {
      const [meta, ...names] = await Promise.all([Sources.downloadSkin(q.answer, false, spritesDir()), ...q.choices.map((d) => Sources.lookupSpecies(d))]);
      const anims = JSON.parse(fs.readFileSync(path.join(spritesDir(), meta.dir, 'anims.json'), 'utf8'));
      const a = anims.Idle || anims.Walk || Object.values(anims)[0];
      sprite = { url: `data:image/png;base64,${fs.readFileSync(path.join(spritesDir(), meta.dir, a.file)).toString('base64')}`, fw: a.fw, fh: a.fh, durs: a.durs };
      species = names;
    } catch (e) {
      if (e.code === 'not-found') continue;   // no sprite drawn for this one: ask another
      return { ok: false, error: 'net' };
    }
    if (!lim.free) Limits.use(store.data, 'quiz', today());
    quizRecent.push(q.answer);
    if (quizRecent.length > 30) quizRecent.shift();
    const token = `q${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    quizzes.clear();   // one question at a time
    quizzes.set(token, { answer: q.answer, names: Object.fromEntries(species.map((sp) => [sp.dex, sp.names])) });
    changed();
    return { ok: true, token, sprite,
      choices: species.map((sp) => ({ dex: sp.dex, names: sp.names })), info: quizInfo() };
  }
  return { ok: false, error: 'net' };
}

/** The guess: right → berries (a bonus every 3rd in a row), and the partner learns a little and is happy. */
function quizAnswer(token, dex) {
  const q = quizzes.get(token);
  quizzes.delete(token);
  if (!q) return { ok: false };
  const stats = store.data.stats;
  const correct = Number(dex) === q.answer;
  let reward = null;
  if (correct) {
    stats.quizStreak = (stats.quizStreak || 0) + 1;
    stats.quizRight = (stats.quizRight || 0) + 1;
    reward = { berries: Quiz.berriesFor(stats.quizStreak), streak: stats.quizStreak };
    store.data.berries += reward.berries;
    if (hasPet() && !activeAway() && activePet().stage !== 'egg') { addXp(Quiz.REWARD.xp); addMood(Quiz.REWARD.mood); }
    petEvent('quiz-right', { name: q.names[q.answer][lang()] || q.names[q.answer].en });
  } else stats.quizStreak = 0;
  changed();
  return { ok: true, correct, answer: { dex: q.answer, names: q.names[q.answer] }, reward, info: quizInfo() };
}

// ---------- Berry Catch (接树果) ----------
let catchWin = null;
let catchRound = null;   // { token, at } – the round being played (one at a time)

function openCatch() {
  if (!catchWin || catchWin.isDestroyed()) {
    catchWin = new BrowserWindow({
      width: 500, height: 560, resizable: false, show: false, title: T('catch.title'), icon: appIcon(256),
      backgroundColor: '#1d1c1a', autoHideMenuBar: true,
      webPreferences: { preload: PRELOAD, contextIsolation: true, sandbox: true }
    });
    if (!IS_MAC) catchWin.setMenu(null);
    if (process.env.POKEPET_TEST) catchWin.webContents.on('console-message', (e) => console.log('[catch]', e.message));
    catchWin.loadFile(path.join(__dirname, 'src', 'catch', 'catch.html'));
    catchWin.once('ready-to-show', () => { catchWin.show(); catchWin.focus(); });
    catchWin.on('closed', () => { catchWin = null; catchRound = null; });
  } else {
    catchWin.show();
    catchWin.focus();
  }
  if (IS_MAC) app.focus({ steal: true });
}

/** Berry Catch limits as the windows see them (unlimited while testing). */
function catchInfo() {
  if (testFlags.freeCatch) return { left: 999, dayLeft: 999, hourLeft: 999, max: 999, hourMax: 999, recent: 0, nextAt: null, free: true };
  return Limits.info(store.data, 'catch', today());
}

/** Start a round (counts one play). */
function catchStart() {
  const lim = catchInfo();
  const why = Limits.blocked(lim);
  if (why) return { ok: false, error: why, nextAt: lim.nextAt };
  if (!lim.free) Limits.use(store.data, 'catch', today());
  catchRound = { token: `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, at: Date.now() };
  changed();
  return { ok: true, token: catchRound.token, seconds: CatchRules.ROUND_S, info: catchInfo() };
}

/** The round is over: its score becomes berries, XP and mood for the partner (a round can't end before its time). */
function catchFinish(token, score) {
  const round = catchRound;
  if (!round || round.token !== token) return { ok: false };
  catchRound = null;
  const early = Date.now() - round.at < (CatchRules.ROUND_S - 3) * 1000;
  const r = CatchRules.rewardFor(early ? 0 : score);
  const stats = store.data.stats;
  stats.catchBest = Math.max(stats.catchBest || 0, r.score);
  store.data.berries += r.berries;
  if (hasPet() && !activeAway() && activePet().stage !== 'egg') {
    if (r.xp) addXp(r.xp);
    if (r.mood) addMood(r.mood);
    if (r.score >= 12) petEvent('catch-good', { n: r.score });
  }
  changed();
  return { ok: true, ...r, best: stats.catchBest, info: catchInfo() };
}

// ---------- Whack-a-Diglett (敲敲地鼠) ----------
let whackWin = null;
let whackRound = null;   // { token, at } – the round being played (one at a time)

function openWhack() {
  if (!whackWin || whackWin.isDestroyed()) {
    whackWin = new BrowserWindow({
      width: 500, height: 560, resizable: false, show: false, title: T('whack.title'), icon: appIcon(256),
      backgroundColor: '#1d1c1a', autoHideMenuBar: true,
      webPreferences: { preload: PRELOAD, contextIsolation: true, sandbox: true }
    });
    if (!IS_MAC) whackWin.setMenu(null);
    if (process.env.POKEPET_TEST) whackWin.webContents.on('console-message', (e) => console.log('[whack]', e.message));
    whackWin.loadFile(path.join(__dirname, 'src', 'whack', 'whack.html'));
    whackWin.once('ready-to-show', () => { whackWin.show(); whackWin.focus(); });
    whackWin.on('closed', () => { whackWin = null; whackRound = null; });
  } else {
    whackWin.show();
    whackWin.focus();
  }
  if (IS_MAC) app.focus({ steal: true });
}

/** Whack-a-Diglett limits as the windows see them (unlimited while testing). */
function whackInfo() {
  if (testFlags.freeWhack) return { left: 999, dayLeft: 999, hourLeft: 999, max: 999, hourMax: 999, recent: 0, nextAt: null, free: true };
  return Limits.info(store.data, 'whack', today());
}

/** Start a round (counts one play). */
function whackStart() {
  const lim = whackInfo();
  const why = Limits.blocked(lim);
  if (why) return { ok: false, error: why, nextAt: lim.nextAt };
  if (!lim.free) Limits.use(store.data, 'whack', today());
  whackRound = { token: `w${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, at: Date.now() };
  changed();
  return { ok: true, token: whackRound.token, seconds: WhackRules.ROUND_S, info: whackInfo() };
}

/** The round is over: its score becomes berries, XP and mood for the partner (a round can't end before its time). */
function whackFinish(token, score) {
  const round = whackRound;
  if (!round || round.token !== token) return { ok: false };
  whackRound = null;
  const early = Date.now() - round.at < (WhackRules.ROUND_S - 3) * 1000;
  const r = WhackRules.rewardFor(early ? 0 : score);
  const stats = store.data.stats;
  stats.whackBest = Math.max(stats.whackBest || 0, r.score);
  store.data.berries += r.berries;
  if (hasPet() && !activeAway() && activePet().stage !== 'egg') {
    if (r.xp) addXp(r.xp);
    if (r.mood) addMood(r.mood);
    if (r.score >= 12) petEvent('whack-good', { n: r.score });
  }
  changed();
  return { ok: true, ...r, best: stats.whackBest, info: whackInfo() };
}

// ---------- Type Match-up (属性相克) ----------
let typesWin = null;
let typesRound = null;   // { token, questions, answered: [bool], right } – the round being played (one at a time)

function openTypes() {
  if (!typesWin || typesWin.isDestroyed()) {
    typesWin = new BrowserWindow({
      width: 420, height: 490, resizable: false, show: false, title: T('types.title'), icon: appIcon(256),
      backgroundColor: '#1d1c1a', autoHideMenuBar: true,
      webPreferences: { preload: PRELOAD, contextIsolation: true, sandbox: true }
    });
    if (!IS_MAC) typesWin.setMenu(null);
    if (process.env.POKEPET_TEST) typesWin.webContents.on('console-message', (e) => console.log('[types]', e.message));
    typesWin.loadFile(path.join(__dirname, 'src', 'types', 'types.html'));
    typesWin.once('ready-to-show', () => { typesWin.show(); typesWin.focus(); });
    typesWin.on('closed', () => { typesWin = null; typesRound = null; });
  } else {
    typesWin.show();
    typesWin.focus();
  }
  if (IS_MAC) app.focus({ steal: true });
}

/** Type Match-up limits as the windows see them (unlimited while testing). */
function typesInfo() {
  if (testFlags.freeTypes) return { left: 999, dayLeft: 999, hourLeft: 999, max: 999, hourMax: 999, recent: 0, nextAt: null, free: true };
  return Limits.info(store.data, 'types', today());
}

/** Start a round of questions (counts one play). The answers stay here. */
function typesStart() {
  const lim = typesInfo();
  const why = Limits.blocked(lim);
  if (why) return { ok: false, error: why, nextAt: lim.nextAt };
  if (!lim.free) Limits.use(store.data, 'types', today());
  const questions = TypeQuiz.round();
  typesRound = { token: `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, questions, answered: questions.map(() => false), right: 0 };
  changed();
  return { ok: true, token: typesRound.token, questions: questions.map((q) => ({ atk: q.atk, def: q.def })), info: typesInfo() };
}

/** Check one answer; after the last one, the round's reward. */
function typesAnswer(token, i, choice) {
  const r = typesRound;
  if (!r || r.token !== token || !r.questions[i] || r.answered[i]) return { ok: false };
  r.answered[i] = true;
  const q = r.questions[i];
  const correct = choice === q.answer;
  if (correct) r.right++;
  const out = { ok: true, correct, answer: q.answer, mult: q.mult };
  if (!r.answered.every(Boolean)) return out;
  typesRound = null;
  const reward = TypeQuiz.rewardFor(r.right);
  const stats = store.data.stats;
  stats.typesBest = Math.max(stats.typesBest || 0, reward.right);
  store.data.berries += reward.berries;
  if (hasPet() && !activeAway() && activePet().stage !== 'egg') {
    if (reward.xp) addXp(reward.xp);
    if (reward.mood) addMood(reward.mood);
    if (reward.right >= 7) petEvent('types-good', { n: reward.right });
  }
  changed();
  return { ...out, done: true, reward, best: stats.typesBest, info: typesInfo() };
}

// ---------- Fire-Water-Grass (火水草猜拳) ----------
let rpsWin = null;
let rpsMatch = null;   // { token, you, them } – the match being played (one at a time)

function openRps() {
  if (!rpsWin || rpsWin.isDestroyed()) {
    rpsWin = new BrowserWindow({
      width: 420, height: 480, resizable: false, show: false, title: T('rps.title'), icon: appIcon(256),
      backgroundColor: '#1d1c1a', autoHideMenuBar: true,
      webPreferences: { preload: PRELOAD, contextIsolation: true, sandbox: true }
    });
    if (!IS_MAC) rpsWin.setMenu(null);
    if (process.env.POKEPET_TEST) rpsWin.webContents.on('console-message', (e) => console.log('[rps]', e.message));
    rpsWin.loadFile(path.join(__dirname, 'src', 'rps', 'rps.html'));
    rpsWin.once('ready-to-show', () => { rpsWin.show(); rpsWin.focus(); });
    rpsWin.on('closed', () => { rpsWin = null; rpsMatch = null; });
  } else {
    rpsWin.show();
    rpsWin.focus();
  }
  if (IS_MAC) app.focus({ steal: true });
}

/** Fire-Water-Grass limits as the windows see them (unlimited while testing). */
function rpsInfo() {
  if (testFlags.freeRps) return { left: 999, dayLeft: 999, hourLeft: 999, max: 999, hourMax: 999, recent: 0, nextAt: null, free: true };
  return Limits.info(store.data, 'rps', today());
}

/** Start a match (counts one play). */
function rpsStart() {
  const lim = rpsInfo();
  const why = Limits.blocked(lim);
  if (why) return { ok: false, error: why, nextAt: lim.nextAt };
  if (!lim.free) Limits.use(store.data, 'rps', today());
  rpsMatch = { token: `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, you: 0, them: 0 };
  changed();
  return { ok: true, token: rpsMatch.token, info: rpsInfo() };
}

/** One throw: the other side throws too; at 3 wins the match is over and rewarded. */
function rpsThrow(token, move) {
  const m = rpsMatch;
  if (!m || m.token !== token || !Rps.MOVES.includes(move)) return { ok: false };
  const theirs = Rps.throwOf();
  const result = Rps.outcome(move, theirs);
  if (result === 'win') m.you++;
  if (result === 'lose') m.them++;
  const out = { ok: true, theirs, result, you: m.you, them: m.them };
  if (m.you < Rps.TO_WIN && m.them < Rps.TO_WIN) return out;
  rpsMatch = null;
  const reward = Rps.rewardFor(m.you >= Rps.TO_WIN);
  const stats = store.data.stats;
  if (reward.won) stats.rpsWins = (stats.rpsWins || 0) + 1;
  store.data.berries += reward.berries;
  if (hasPet() && !activeAway() && activePet().stage !== 'egg') {
    addXp(reward.xp);
    addMood(reward.mood);
    if (reward.won) petEvent('rps-won', {});
  }
  changed();
  return { ...out, done: true, reward, wins: stats.rpsWins || 0, info: rpsInfo() };
}

// ---------- Voltorb Flip (霹雳电球翻牌) ----------
let flipWin = null;
let flipBoard = null;   // { token, cards, up: [bool] } – the board being played (one at a time)

function openFlip() {
  if (!flipWin || flipWin.isDestroyed()) {
    flipWin = new BrowserWindow({
      width: 460, height: 690, resizable: false, show: false, title: T('flip.title'), icon: appIcon(256),
      backgroundColor: '#1d1c1a', autoHideMenuBar: true,
      webPreferences: { preload: PRELOAD, contextIsolation: true, sandbox: true }
    });
    if (!IS_MAC) flipWin.setMenu(null);
    if (process.env.POKEPET_TEST) flipWin.webContents.on('console-message', (e) => console.log('[flip]', e.message));
    flipWin.loadFile(path.join(__dirname, 'src', 'flip', 'flip.html'));
    flipWin.once('ready-to-show', () => { flipWin.show(); flipWin.focus(); });
    flipWin.on('closed', () => { flipWin = null; flipBoard = null; });
  } else {
    flipWin.show();
    flipWin.focus();
  }
  if (IS_MAC) app.focus({ steal: true });
}

/** Voltorb Flip limits as the windows see them (unlimited while testing). */
function flipInfo() {
  if (testFlags.freeFlip) return { left: 999, dayLeft: 999, hourLeft: 999, max: 999, hourMax: 999, recent: 0, nextAt: null, free: true };
  return Limits.info(store.data, 'flip', today());
}

/** Deal a board (counts one play): the window gets only the hints. */
function flipStart() {
  const lim = flipInfo();
  const why = Limits.blocked(lim);
  if (why) return { ok: false, error: why, nextAt: lim.nextAt };
  if (!lim.free) Limits.use(store.data, 'flip', today());
  const cards = Voltorb.deal();
  flipBoard = { token: `f${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, cards, up: cards.map(() => false) };
  changed();
  return { ok: true, token: flipBoard.token, hints: Voltorb.hints(cards), info: flipInfo() };
}

/** Turn one card over; a Voltorb ends the board, the last 2 or 3 clears it. */
function flipTurn(token, i) {
  const b = flipBoard;
  if (!b || b.token !== token || !(i >= 0 && i < b.cards.length) || b.up[i]) return { ok: false };
  b.up[i] = true;
  const value = b.cards[i];
  const coins = Voltorb.coinsOf(b.cards, b.up);
  const won = value !== 0 && Voltorb.cleared(b.cards, b.up);
  const out = { ok: true, value, coins: value === 0 ? 0 : coins };
  if (value !== 0 && !won) return out;
  flipBoard = null;
  const reward = Voltorb.rewardFor(won, coins);
  const stats = store.data.stats;
  if (won) stats.flipWins = (stats.flipWins || 0) + 1;
  store.data.berries += reward.berries;
  if (hasPet() && !activeAway() && activePet().stage !== 'egg') {
    addXp(reward.xp);
    addMood(reward.mood);
    if (won) petEvent('flip-won', {});
  }
  changed();
  return { ...out, done: true, cards: b.cards, reward, wins: stats.flipWins || 0, info: flipInfo() };
}

// ---------- Chatot Echo (聒噪鸟学舌) ----------
let echoWin = null;
let echoGame = null;   // { token, seq } – the tune being sung (one round at a time)

function openEcho() {
  if (!echoWin || echoWin.isDestroyed()) {
    echoWin = new BrowserWindow({
      width: 420, height: 560, resizable: false, show: false, title: T('echo.title'), icon: appIcon(256),
      backgroundColor: '#1d1c1a', autoHideMenuBar: true,
      webPreferences: { preload: PRELOAD, contextIsolation: true, sandbox: true }
    });
    if (!IS_MAC) echoWin.setMenu(null);
    if (process.env.POKEPET_TEST) echoWin.webContents.on('console-message', (e) => console.log('[echo]', e.message));
    echoWin.loadFile(path.join(__dirname, 'src', 'echo', 'echo.html'));
    echoWin.once('ready-to-show', () => { echoWin.show(); echoWin.focus(); });
    echoWin.on('closed', () => { echoWin = null; echoGame = null; });
  } else {
    echoWin.show();
    echoWin.focus();
  }
  if (IS_MAC) app.focus({ steal: true });
}

/** Chatot Echo limits as the windows see them (unlimited while testing). */
function echoInfo() {
  if (testFlags.freeEcho) return { left: 999, dayLeft: 999, hourLeft: 999, max: 999, hourMax: 999, recent: 0, nextAt: null, free: true };
  return Limits.info(store.data, 'echo', today());
}

/** Start a round (counts one play): Chatot sings the first note. */
function echoStart() {
  const lim = echoInfo();
  const why = Limits.blocked(lim);
  if (why) return { ok: false, error: why, nextAt: lim.nextAt };
  if (!lim.free) Limits.use(store.data, 'echo', today());
  echoGame = { token: `e${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, seq: [Echo.stepOf()] };
  changed();
  return { ok: true, token: echoGame.token, seq: echoGame.seq.slice(), ms: Echo.noteMs(1), max: Echo.MAX, info: echoInfo() };
}

/** The tune sung back: right → one note longer (or won at MAX); wrong → the round ends and is rewarded. */
function echoAnswer(token, attempt) {
  const g = echoGame;
  if (!g || g.token !== token) return { ok: false };
  const right = Echo.matches(g.seq, attempt);
  if (right && g.seq.length < Echo.MAX) {
    g.seq.push(Echo.stepOf());
    return { ok: true, right, seq: g.seq.slice(), ms: Echo.noteMs(g.seq.length) };
  }
  echoGame = null;
  const reward = Echo.rewardFor(right ? g.seq.length : g.seq.length - 1);
  const stats = store.data.stats;
  stats.echoBest = Math.max(stats.echoBest || 0, reward.cleared);
  store.data.berries += reward.berries;
  if (hasPet() && !activeAway() && activePet().stage !== 'egg') {
    addXp(reward.xp);
    addMood(reward.mood);
    if (reward.cleared >= 5) petEvent('echo-good', { n: reward.cleared });
  }
  changed();
  return { ok: true, right, seq: g.seq.slice(), done: true, reward, best: stats.echoBest, info: echoInfo() };
}

// ---------- Poké Ball Shuffle (藏在哪个球里) ----------
let shuffleWin = null;
let shuffleGame = null;   // { token, n, found, cur } – the game being played (one at a time)

function openShuffle() {
  if (!shuffleWin || shuffleWin.isDestroyed()) {
    shuffleWin = new BrowserWindow({
      width: 460, height: 460, resizable: false, show: false, title: T('shuffle.title'), icon: appIcon(256),
      backgroundColor: '#1d1c1a', autoHideMenuBar: true,
      webPreferences: { preload: PRELOAD, contextIsolation: true, sandbox: true }
    });
    if (!IS_MAC) shuffleWin.setMenu(null);
    if (process.env.POKEPET_TEST) shuffleWin.webContents.on('console-message', (e) => console.log('[shuffle]', e.message));
    shuffleWin.loadFile(path.join(__dirname, 'src', 'shuffle', 'shuffle.html'));
    shuffleWin.once('ready-to-show', () => { shuffleWin.show(); shuffleWin.focus(); });
    shuffleWin.on('closed', () => { shuffleWin = null; shuffleGame = null; });
  } else {
    shuffleWin.show();
    shuffleWin.focus();
  }
  if (IS_MAC) app.focus({ steal: true });
}

/** Poké Ball Shuffle limits as the windows see them (unlimited while testing). */
function shuffleInfo() {
  if (testFlags.freeShuffle) return { left: 999, dayLeft: 999, hourLeft: 999, max: 999, hourMax: 999, recent: 0, nextAt: null, free: true };
  return Limits.info(store.data, 'shuffle', today());
}

/** Start a game (counts one play): the first round, and the partner's portrait to hide in the balls. */
async function shuffleStart() {
  const lim = shuffleInfo();
  const why = Limits.blocked(lim);
  if (why) return { ok: false, error: why, nextAt: lim.nextAt };
  if (!lim.free) Limits.use(store.data, 'shuffle', today());
  shuffleGame = { token: `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, n: 0, found: 0, cur: Shuffle.round(0) };
  const token = shuffleGame.token;
  changed();
  let face = null;
  const pet = hasPet() ? activePet() : null;
  if (pet && pet.dex && pet.stage !== 'egg') {
    try {
      const buf = await Sources.portrait(pet.dex, 'Normal', spritesDir(), !!(store.data.skins[pet.id] || {}).shiny);
      if (buf) face = `data:image/png;base64,${buf.toString('base64')}`;
    } catch { /* the window draws a Pikachu-yellow ⚡ instead */ }
  }
  if (!shuffleGame || shuffleGame.token !== token) return { ok: false };
  return { ok: true, token, round: shuffleGame.cur, rounds: Shuffle.ROUNDS.length, face, info: shuffleInfo() };
}

/** Point at a ball: found → the next round (or won after the last); missed → the game ends and is rewarded. */
function shufflePick(token, i) {
  const g = shuffleGame;
  if (!g || g.token !== token || !(i >= 0 && i < g.cur.balls)) return { ok: false };
  const at = Shuffle.trace(g.cur.start, g.cur.swaps);
  const right = i === at;
  if (right) g.found++;
  if (right && g.n + 1 < Shuffle.ROUNDS.length) {
    g.n++;
    g.cur = Shuffle.round(g.n);
    return { ok: true, right, at, found: g.found, round: g.cur };
  }
  shuffleGame = null;
  const reward = Shuffle.rewardFor(g.found);
  const stats = store.data.stats;
  stats.shuffleBest = Math.max(stats.shuffleBest || 0, g.found);
  store.data.berries += reward.berries;
  if (hasPet() && !activeAway() && activePet().stage !== 'egg') {
    addXp(reward.xp);
    addMood(reward.mood);
    if (g.found >= 3) petEvent('shuffle-good', { n: g.found });
  }
  changed();
  return { ok: true, right, at, found: g.found, done: true, reward, best: stats.shuffleBest, info: shuffleInfo() };
}

// ---------- Memory Match (记忆翻牌) ----------
let memoryWin = null;
let memoryBoard = null;   // { token, at, cards } – the board being played (one at a time)

function openMemory() {
  if (!memoryWin || memoryWin.isDestroyed()) {
    memoryWin = new BrowserWindow({
      width: 460, height: 580, resizable: false, show: false, title: T('memory.title'), icon: appIcon(256),
      backgroundColor: '#1d1c1a', autoHideMenuBar: true,
      webPreferences: { preload: PRELOAD, contextIsolation: true, sandbox: true }
    });
    if (!IS_MAC) memoryWin.setMenu(null);
    if (process.env.POKEPET_TEST) memoryWin.webContents.on('console-message', (e) => console.log('[memory]', e.message));
    memoryWin.loadFile(path.join(__dirname, 'src', 'memory', 'memory.html'));
    memoryWin.once('ready-to-show', () => { memoryWin.show(); memoryWin.focus(); });
    memoryWin.on('closed', () => { memoryWin = null; memoryBoard = null; });
  } else {
    memoryWin.show();
    memoryWin.focus();
  }
  if (IS_MAC) app.focus({ steal: true });
}

/** Memory Match limits as the windows see them (unlimited while testing). */
function memoryInfo() {
  if (testFlags.freeMemory) return { left: 999, dayLeft: 999, hourLeft: 999, max: 999, hourMax: 999, recent: 0, nextAt: null, free: true };
  return Limits.info(store.data, 'memory', today());
}

/**
 * A new board: 8 Pokémon faces (PMD portraits – your team and ones you've met first, then any), dealt twice.
 * Counts one play once the faces are ready.
 */
async function memoryStart() {
  const lim = memoryInfo();
  const why = Limits.blocked(lim);
  if (why) return { ok: false, error: why, nextAt: lim.nextAt };
  const idx = Sources.creditIndexCached(spritesDir());
  const drawn = idx && idx.dex ? new Set(Object.entries(idx.dex).filter(([, e]) => e && e.portrait).map(([k]) => Number(k))) : null;
  const ok = (d) => d >= 1 && d <= 1025 && (!drawn || drawn.has(d));
  const shuffle = (a) => a.map((v) => [Math.random(), v]).sort((x, y) => x[0] - y[0]).map((x) => x[1]);
  const mine = shuffle([...new Set([...petList().map((p) => p.dex), ...Object.keys(store.data.pokedex || {}).map(Number)])].filter((d) => d && ok(d)));
  const pool = drawn ? [...drawn].filter(ok) : Array.from({ length: 1025 }, (_, i) => i + 1);
  const picked = mine.slice(0, 4);
  while (picked.length < MemoryRules.PAIRS + 4) {   // a few spare in case a face can't be had
    const d = pool[Math.floor(Math.random() * pool.length)];
    if (!picked.includes(d)) picked.push(d);
  }
  const faces = [];
  for (const dex of picked) {
    if (faces.length >= MemoryRules.PAIRS) break;
    let buf = null;
    try { buf = await Sources.portrait(dex, 'Normal', spritesDir()); } catch { return { ok: false, error: 'net' }; }
    if (buf) faces.push({ dex, url: `data:image/png;base64,${buf.toString('base64')}` });
  }
  if (faces.length < MemoryRules.PAIRS) return { ok: false, error: 'net' };
  if (!lim.free) Limits.use(store.data, 'memory', today());
  const cards = MemoryRules.deal(faces.map((f) => f.dex));
  memoryBoard = { token: `m${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, at: Date.now(), cards };
  changed();
  const urls = Object.fromEntries(faces.map((f) => [f.dex, f.url]));
  return { ok: true, token: memoryBoard.token, cards: cards.map((dex) => ({ dex, url: urls[dex] })), info: memoryInfo() };
}

/** The board is cleared: berries by the turns it took, and the partner learns a little and is happy. */
function memoryFinish(token, turns) {
  const board = memoryBoard;
  if (!board || board.token !== token) return { ok: false };
  memoryBoard = null;
  if (Date.now() - board.at < MemoryRules.MIN_SECONDS * 1000) return { ok: false };
  const r = MemoryRules.rewardFor(turns);
  const stats = store.data.stats;
  stats.memoryBest = Math.min(stats.memoryBest || Infinity, r.turns);
  store.data.berries += r.berries;
  if (hasPet() && !activeAway() && activePet().stage !== 'egg') {
    addXp(r.xp);
    addMood(r.mood);
    petEvent('memory-done', { n: r.turns });
  }
  changed();
  return { ok: true, ...r, best: stats.memoryBest, info: memoryInfo() };
}

// ---------- desktop play: fling (丢丢乐) and peeking from the screen edge ----------
let flingIv = null;
let peek = null;          // { side: 'left' | 'right' } while hiding halfway off the screen
let lastFlingBerry = 0;

function stopFling() { clearInterval(flingIv); flingIv = null; }

/** Throw the pet: it flies with gravity, bounces off the screen edges and floor, then lands dizzy. */
function fling(vx, vy) {
  if (!petWin) return;
  stopFling();
  petEvent('fling-start');
  const b = petWin.getBounds();
  const wa = screen.getDisplayMatching(b).workArea;
  const half = b.width / 2;
  const floor = wa.y + wa.height - b.height, ceil = wa.y - b.height * 0.4;
  const minX = wa.x + 30 - half, maxX = wa.x + wa.width - 30 - half;
  let x = b.x, y = b.y, last = Date.now(), bounces = 0;
  const started = last;
  vx = Math.max(-4000, Math.min(4000, vx)); vy = Math.max(-4000, Math.min(4000, vy));
  flingIv = setInterval(() => {
    if (!petWin || petWin.isDestroyed()) { stopFling(); return; }
    const now = Date.now(), dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    vy += 2600 * dt;
    x += vx * dt; y += vy * dt;
    let hit = false;
    if (x < minX) { x = minX; vx = -vx * 0.55; hit = true; }
    if (x > maxX) { x = maxX; vx = -vx * 0.55; hit = true; }
    if (y < ceil) { y = ceil; vy = -vy * 0.5; hit = true; }
    if (y > floor) {
      y = floor;
      if (Math.abs(vy) > 160) { vy = -vy * 0.45; hit = true; } else vy = 0;
      vx *= 0.82;   // friction on the ground
    }
    if (hit && Math.abs(vx) + Math.abs(vy) > 300) { bounces++; petEvent('fling-bounce'); }
    petWin.setPosition(Math.round(x), Math.round(y));
    const resting = y >= floor && Math.abs(vy) < 1 && Math.abs(vx) < 40;
    if (resting || now - started > 5000) {
      stopFling();
      addMood(3);
      let berry = 0;
      if (now - lastFlingBerry > 10 * 60e3) { lastFlingBerry = now; berry = 1; store.data.berries += 1; }
      petEvent('fling-end', { bounces, berry });
      changed();
      settleAtEdge();
      savePetPos();
    }
  }, 16);
}

/** Dropped right at the left/right screen edge: hide halfway and peek out. */
function settleAtEdge() {
  if (!petWin) return;
  const b = petWin.getBounds();
  const wa = screen.getDisplayMatching(b).workArea;
  const cx = b.x + b.width / 2;
  const side = cx < wa.x + 40 ? 'left' : cx > wa.x + wa.width - 40 ? 'right' : null;
  if (!side) return;
  peek = { side };
  petWin.setPosition(Math.round((side === 'left' ? wa.x : wa.x + wa.width) - b.width / 2), b.y);
  petEvent('peek', { side });
}

/** Come out from the edge (clicked, or picked up). */
function unpeek(talk = true) {
  if (!peek || !petWin) return;
  const b = petWin.getBounds();
  const wa = screen.getDisplayMatching(b).workArea;
  const cx = peek.side === 'left' ? wa.x + 90 : wa.x + wa.width - 90;
  peek = null;
  petWin.setPosition(Math.round(cx - b.width / 2), b.y);
  petEvent('unpeek', { talk });
  savePetPos();
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
      taskProgress('focus');
      taskProgress('focusMin', d.pomodoro.focus);
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

/** New day: new daily tasks, and the pet reminds the trainer to sign in. */
function dailyRoll() {
  if (Daily.roll(store.data, today()) || !store.data.daily.signedIn) {
    if (hasPet() && !remindedSignIn) {
      remindedSignIn = true;
      setTimeout(() => petEvent('sign-in-reminder', { streak: store.data.daily.streak }), 5000);
    }
  }
}
let remindedSignIn = false;

function signIn() {
  const res = Daily.signIn(store.data, today());
  if (res.ok) {
    petEvent('signed-in', res);
    changed();
  }
  return res;
}

// ---------- holidays and weather ----------
/** Once a day: a holiday or a partner anniversary gets a greeting (and a little gift). */
function greetHoliday() {
  const d = store.data, day = today();
  if (!S().greetings || !hasPet() || d.greeted.holiday === day) return;
  d.greeted.holiday = day;
  const holiday = Weather.holidayOn(day);
  const anniv = Weather.anniversary(activePet().hatchedAt, day);
  if (!holiday && !anniv) return;
  d.berries += Weather.HOLIDAY_GIFT;
  setTimeout(() => petEvent('holiday', { holiday, anniv, gift: Weather.HOLIDAY_GIFT }), 9000);
  changed();
}

const WEATHER_EVERY = 2 * 3600e3;
let weatherBusy = false;
/** Ask Open-Meteo for the weather (only when the user turned it on); remark on it now and then. */
async function checkWeather(force = false) {
  const w = S().weather, d = store.data;
  if (!w.enabled || w.lat == null || weatherBusy) return;
  if (!force && d.weatherNow && Date.now() - d.weatherNow.at < WEATHER_EVERY) return;
  weatherBusy = true;
  try {
    d.weatherNow = await Weather.current(w.lat, w.lon);
    const line = Weather.remark(d.weatherNow);
    // remark once a day, and again when it starts raining / snowing / storming
    const newDay = d.greeted.weather !== today();
    const turned = d.greeted.weatherKind && d.greeted.weatherKind !== d.weatherNow.kind && ['rain', 'snow', 'storm'].includes(d.weatherNow.kind);
    if (hasPet() && line && (newDay || turned)) petEvent('weather', { line, temp: d.weatherNow.temp, place: w.place });
    d.greeted.weather = today();
    d.greeted.weatherKind = d.weatherNow.kind;
    changed();
  } catch { /* offline: try again later */ } finally {
    weatherBusy = false;
  }
}

// ---------- what the weather will do: a word about the next 3 hours, every 3 hours ----------
const FORECAST_EVERY = 3 * 3600e3;
let forecastBusy = false;
/** Away on an outing, focusing or fishing: the forecast waits and comes right after. */
const forecastWaits = () => activeAway() || timer.phase === 'focus' || fishingNow();

async function checkForecast(force = false) {
  const w = S().weather, d = store.data;
  if (!hasPet() || forecastBusy) return;
  if (!force && (!w.enabled || w.lat == null)) return;
  if (!force && Date.now() - (d.greeted.forecastAt || 0) < FORECAST_EVERY) return;
  if (!force && forecastWaits()) return;   // due, but later – checked again every minute
  forecastBusy = true;
  try {
    let now = d.weatherNow, next;
    if (w.lat != null) {
      // the forecast is what counts; the current weather only tells whether it's raining now (last report if it fails)
      const [cur, fc] = await Promise.allSettled([Weather.current(w.lat, w.lon), Weather.forecast(w.lat, w.lon, 3)]);
      if (fc.status !== 'fulfilled') throw fc.reason;
      next = fc.value;
      if (cur.status === 'fulfilled') d.weatherNow = now = cur.value;
      now = now || { kind: next[0] && next[0].kind, temp: next[0] && next[0].temp };
    } else {
      // testing without a city: a made-up afternoon
      now = { kind: 'clear', temp: 21 };
      next = [{ kind: 'cloudy', temp: 20, pop: 30 }, { kind: 'rain', temp: 18, pop: 70 }, { kind: 'rain', temp: 17, pop: 80 }];
    }
    const r = Weather.forecastRemark(now, next);
    if (r) petEvent('weather', { line: r.line, ...r.vars, temp: now && now.temp, place: w.place });
    d.greeted.forecastAt = Date.now();
    changed();
  } catch { /* offline: try again later */ } finally {
    forecastBusy = false;
  }
}

async function setWeatherCity(query) {
  try {
    const c = await Weather.findCity(query, lang());
    S().weather = { ...S().weather, city: String(query).trim(), place: c.country ? `${c.name}, ${c.country}` : c.name, lat: c.lat, lon: c.lon };
    store.data.weatherNow = null;
    changed();
    checkWeather(true);
    return { ok: true, place: S().weather.place };
  } catch (e) {
    return { ok: false, error: e.code === 'not-found' ? 'not-found' : 'net' };
  }
}

/** Something that daily tasks count happened. */
function taskProgress(kind, n = 1) {
  for (const t of Daily.progress(store.data, kind, n)) petEvent('task-done', { id: t.id, reward: t.reward });
}

function claimTask(id) {
  const res = Daily.claim(store.data, id);
  if (res.ok) changed();
  return res;
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
  if (IS_MAC) win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: !S().hideOnFullscreen });
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

/** The fishing window is open: the partner is at the pond, not on the desktop. */
const fishingNow = () => !!(fishWin && !fishWin.isDestroyed() && fishWin.isVisible());

function poopTick(asleep) {
  const d = store.data;
  if (!hasPet() || activeAway() || fishingNow()) return;
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
  checkEncounter();
  checkForecast();
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
    if (need && !asleep && timer.phase !== 'focus' && !fishingNow() && Date.now() - (lastNeedAlert[need] || 0) > 20 * 60000) {
      lastNeedAlert[need] = Date.now();
      petEvent('need', { need, item: Care.remedyFor(care, need), diagnose: need === 'sick' && !!care.status && !care.status.known });
    }
  }

  store.rollDay();
  dailyRoll();
  greetHoliday();
  checkWeather();
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
  if (Care.ITEMS[itemId] && Care.ITEMS[itemId].kind === 'evo') return useEvoItem(itemId);
  const res = Care.useItem(store.data, S().pokemon, itemId);
  if (res.ok) {
    const field = { food: 'fed', bath: 'baths', med: 'meds', revive: 'meds' }[res.kind];
    if (res.kind === 'food') taskProgress('feed');
    if (res.kind === 'bath') taskProgress('bath');
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

/**
 * An evolution stone or the Linking Cord on the active Pokémon: it evolves right away if the games evolve it with that
 * (still not sooner than evolveNotBefore). Nothing is used up when it has no effect or the evolution fails.
 */
async function useEvoItem(itemId, id = S().pokemon) {
  const refuse = (reason) => { petEvent('care-refused', { item: itemId, reason }); return { ok: false, reason }; };
  const item = Care.ITEMS[itemId];
  const pet = petOf(store.data, id);
  const p = petList().find((x) => x.id === id);
  if (!p || !p.dex || pet.stage !== 'hatched' || pet.finalForm) return refuse('noEffect');
  if (!(store.data.inventory?.[itemId] > 0) && (store.data.berries || 0) < item.cost) return refuse('berries');
  let all;
  try { all = await Sources.evolutionOptions(p.dex); } catch { return refuse('net'); }
  const option = all.find((o) => Growth.itemFor(o) === itemId);
  if (!option) return refuse('noEffect');
  if (Date.now() < Growth.evolveNotBefore(pet)) return refuse('tooSoon');
  if (!Care.pay(store.data, itemId, item)) return refuse('berries');
  pet.evolution = { options: [option], snoozeUntil: 0 };
  const res = await evolve(id, option.dex);
  if (!res.ok) {
    store.data.inventory[itemId] = (store.data.inventory[itemId] || 0) + 1;   // back into the bag
    pet.evolution = null;
    changed();
    return refuse(res.error);
  }
  addMood(item.mood);
  changed();
  return { ok: true, item, kind: 'evo' };
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
    taskProgress('todo');
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
        ...Object.entries(Care.ITEMS).filter(([, item]) => item.kind !== 'held' && item.kind !== 'evo').map(([itemId, item]) => {
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
    { label: T('menu.quiz'), click: () => openQuiz() },
    { label: T('menu.catch'), click: () => openCatch() },
    { label: T('menu.memory'), click: () => openMemory() },
    { label: T('menu.whack'), click: () => openWhack() },
    { label: T('menu.types'), click: () => openTypes() },
    { label: T('menu.rps'), click: () => openRps() },
    { label: T('menu.flip'), click: () => openFlip() },
    { label: T('menu.echo'), click: () => openEcho() },
    { label: T('menu.shuffle'), click: () => openShuffle() },
    { label: T('menu.wild'), click: () => openWild(false) },
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
    if (k in s && k !== 'petPos' && k !== 'ai' && k !== 'weather') s[k] = v;
  }
  if (patch && patch.weather && typeof patch.weather === 'object') {
    s.weather = { ...s.weather, enabled: !!patch.weather.enabled };
    if (s.weather.enabled) checkWeather(true);
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
  if ('hideOnFullscreen' in patch) applyFullscreenSetting();
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
    stopFling();
    if (peek) unpeek(false);
    const c = screen.getCursorScreenPoint();
    const [x, y] = petWin.getPosition();
    drag = { dx: c.x - x, dy: c.y - y, trail: [] };
    drag.iv = setInterval(() => {
      if (!petWin) return;
      const p = screen.getCursorScreenPoint();
      petWin.setPosition(p.x - drag.dx, p.y - drag.dy);
      drag.trail.push({ t: Date.now(), x: p.x, y: p.y });
      if (drag.trail.length > 8) drag.trail.shift();
    }, 16);
  });
  ipcMain.on('pet:drag-end', (_e, o) => {
    if (!drag) return;
    clearInterval(drag.iv);
    if (o && o.away) { drag = null; savePetPos(); return; }   // the away icon: no flinging
    // how fast was it moving when let go? (px/s over the last ~100 ms)
    const tr = drag.trail.filter((q) => Date.now() - q.t < 120);
    drag = null;
    if (tr.length >= 2) {
      const a = tr[0], b = tr[tr.length - 1], dt = Math.max(16, b.t - a.t) / 1000;
      const vx = (b.x - a.x) / dt, vy = (b.y - a.y) / dt;
      if (Math.hypot(vx, vy) > 900) { fling(vx, vy); return; }
    }
    settleAtEdge();
    savePetPos();
  });
  ipcMain.handle('pet:move-by', (_e, dx) => {
    if (!petWin || drag || flingIv || peek) return null;
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
  ipcMain.on('pet:unpeek', () => unpeek(true));
  ipcMain.handle('pet:pat', () => {
    Diary.record(store.data, 'pats');
    taskProgress('pat');
    addMood(2);
    const now = Date.now();
    // a little XP for pats: one every 15 s, at most PAT_XP_PER_DAY a day
    const st = store.data.stats;
    if (st.patDay !== today()) { st.patDay = today(); st.patXp = 0; }
    if (now - lastPatXp > 15000 && st.patXp < PAT_XP_PER_DAY) { lastPatXp = now; st.patXp++; addXp(1); }
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
      case 'signin': signIn(); break;
      case 'battle-outing': openWild(true); break;
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
  ipcMain.on('party:toggle', (_e, id) => {
    const cur = partyIds();
    let next = cur.includes(id) ? cur.filter((x) => x !== id) : cur.length < Battle.MAX_PARTY ? [...cur, id] : cur;
    if (!next.length) next = cur;   // keep at least one
    S().party = next;
    changed();
  });
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
    return null;
  });
  ipcMain.handle('care:use', (_e, itemId) => useCareItem(itemId));
  ipcMain.handle('care:diagnose', () => diagnosePet());
  ipcMain.handle('shop:buy', (_e, itemId, n) => shopBuy(String(itemId || ''), n));
  ipcMain.handle('settings:extra', (_e, text) => runSecret(text));
  ipcMain.handle('daily:sign', () => signIn());
  ipcMain.handle('weather:city', (_e, q) => setWeatherCity(q));
  ipcMain.handle('daily:claim', (_e, id) => claimTask(String(id || '')));
  ipcMain.handle('starter:choose', (_e, id) => chooseStarter(String(id || '')));
  ipcMain.on('starter:open', () => openStarter());
  ipcMain.handle('join:answer', (_e, token, keep) => answerJoin(String(token || ''), !!keep));
  ipcMain.handle('wild:explore', () => startBattle('grass'));
  ipcMain.handle('wild:outing', () => startBattle('outing'));
  ipcMain.handle('wild:state', () => {
    const e = waitingEncounter();
    return { battle: battleView(), ...grassInfo(), party: partyIds(),
      pending: e ? { names: e.sp.names, until: e.until } : null };
  });
  ipcMain.handle('battle:act', (_e, action) => battleAct(action));
  ipcMain.handle('pokemon:hold', (_e, id, itemId) => holdItem(String(id || ''), itemId ? String(itemId) : null));
  ipcMain.on('battle:close', () => { if (battle && battle.b.over) battle = null; });
  ipcMain.on('wild:open', (_e, encounter) => openWild(!!encounter));
  ipcMain.handle('battle:assets', async (_e, dex, shiny) => {
    try {
      const meta = await Sources.downloadSkin(Number(dex), !!shiny, spritesDir()).catch((e) => {
        if (e.code === 'not-found' && shiny) return Sources.downloadSkin(Number(dex), false, spritesDir());
        throw e;
      });
      const anims = JSON.parse(fs.readFileSync(path.join(spritesDir(), meta.dir, 'anims.json'), 'utf8'));
      for (const a of Object.values(anims)) a.url = `data:image/png;base64,${fs.readFileSync(path.join(spritesDir(), meta.dir, a.file)).toString('base64')}`;
      return { kind: 'pmd', anims };
    } catch { return null; }
  });
  ipcMain.handle('fish:bite', (_e, zone) => fishBite(zone));
  ipcMain.handle('fish:land', (_e, token) => fishLand(String(token || '')));
  ipcMain.on('fish:lost', (_e, token) => bites.delete(String(token || '')));
  ipcMain.on('fish:open', () => openFishing());
  ipcMain.handle('quiz:ask', () => quizAsk());
  ipcMain.handle('quiz:answer', (_e, token, dex) => quizAnswer(String(token || ''), dex));
  ipcMain.on('quiz:open', () => openQuiz());
  ipcMain.handle('catch:start', () => catchStart());
  ipcMain.handle('catch:finish', (_e, token, score) => catchFinish(String(token || ''), score));
  ipcMain.on('catch:open', () => openCatch());
  ipcMain.handle('memory:start', () => memoryStart());
  ipcMain.handle('memory:finish', (_e, token, turns) => memoryFinish(String(token || ''), turns));
  ipcMain.on('memory:open', () => openMemory());
  ipcMain.handle('whack:start', () => whackStart());
  ipcMain.handle('whack:finish', (_e, token, score) => whackFinish(String(token || ''), score));
  ipcMain.on('whack:open', () => openWhack());
  ipcMain.handle('types:start', () => typesStart());
  ipcMain.handle('types:answer', (_e, token, i, choice) => typesAnswer(String(token || ''), Number(i), String(choice || '')));
  ipcMain.on('types:open', () => openTypes());
  ipcMain.handle('rps:start', () => rpsStart());
  ipcMain.handle('rps:throw', (_e, token, move) => rpsThrow(String(token || ''), String(move || '')));
  ipcMain.on('rps:open', () => openRps());
  ipcMain.handle('flip:start', () => flipStart());
  ipcMain.handle('flip:turn', (_e, token, i) => flipTurn(String(token || ''), Number(i)));
  ipcMain.on('flip:open', () => openFlip());
  ipcMain.handle('echo:start', () => echoStart());
  ipcMain.handle('echo:answer', (_e, token, attempt) => echoAnswer(String(token || ''), Array.isArray(attempt) ? attempt.slice(0, Echo.MAX + 1).map(String) : []));
  ipcMain.on('echo:open', () => openEcho());
  ipcMain.handle('shuffle:start', () => shuffleStart());
  ipcMain.handle('shuffle:pick', (_e, token, i) => shufflePick(String(token || ''), Number(i)));
  ipcMain.on('shuffle:open', () => openShuffle());
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
  ipcMain.on('update:page', () => updater.openReleasePage());
  // the help pages and the issue tracker on GitHub (a fixed list – the windows can't open other addresses)
  ipcMain.on('link:open', (_e, key) => {
    const url = { wiki: `https://github.com/${UpdaterRepo}/wiki`, issues: `https://github.com/${UpdaterRepo}/issues/new/choose` }[key];
    if (url) shell.openExternal(url);
  });
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
    await shot(starterWin, '00-starter-closed');
    await starterWin.webContents.executeJavaScript("document.querySelector('#lang').click(); document.querySelectorAll('.card')[1].click(); 0");
    await wait(1500);
    await shot(starterWin, '00-starter');
    console.log('[test] starter lang:', S().lang);
    await starterWin.webContents.executeJavaScript("document.querySelector('#lang').click(); 0");
    await wait(300);
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
    pet.evolveAt = null;
    await lookupEvolveLevel(S().pokemon);
    console.log('[test] evolves at Lv', pet.evolveAt, 'not before', new Date(Growth.evolveNotBefore(pet)).toISOString());
    pet.xp = Growth.xpFor(pet.evolveAt || 30);
    console.log('[test] due before a week:', Growth.evolutionDue(pet));
    pet.hatchedAt = Date.now() - 8 * 86400e3;
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
  send(panelWin, 'panel:tab', 'shop');
  await wait(1200);
  await shot(panelWin, '15-panel-shop');
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
  let words = null;
  try { words = JSON.parse(fs.readFileSync(path.join(__dirname, 'test', 'secrets.local.json'), 'utf8')); } catch { /* not on this machine */ }
  if (words && words.battle) {
    // test codes: a forced battle against a chosen Pokémon, then win; another, then catch
    await step('battle-codes', async () => {
      const used = grassInfo().dayLeft;
      console.log('[test] battle code:', JSON.stringify(await runSecret(`${words.battle} snorlax`)), battle && battle.b.wild.dex, grassInfo().dayLeft === used);
    });
    await wait(3500);
    await shot(wildWin, '20b-battle-forced');
    await step('win-code', async () => {
      const xp = activePet().xp;
      console.log('[test] win code:', JSON.stringify(await runSecret(words.win)), activePet().xp > xp);
    });
    await wait(2500);
    await shot(wildWin, '20c-battle-won');
    await step('catch-code', async () => {
      const n = Object.keys(store.data.pets).length;
      await runSecret(words.battle);
      console.log('[test] catch code:', JSON.stringify(await runSecret(words.catch)), Object.keys(store.data.pets).length === n + 1);
    });
    await step('legend-code', async () => {
      await runSecret(`${words.battle} legend`);
      console.log('[test] legend code:', battle && battle.b.wild.special, battle && battle.b.wild.names.en, 'Lv', battle && battle.b.wild.level, 'capture', battle && battle.ctx.capture);
      await runSecret(words.win);
    });
    await wait(15000);
    console.log('[test] caught screen:', await wildWin.webContents.executeJavaScript("document.querySelector('#resTitle').textContent + ' | ' + document.querySelector('#result').className + ' | ' + document.querySelector('#wildBox .name').textContent"));
    await shot(wildWin, '20d-battle-caught');
    if (wildWin && !wildWin.isDestroyed()) wildWin.close();
  }
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
        if (tension > 48) window.__fire('mouseup'); else if (tension < 28) window.__fire('mousedown');
      }
      return 'timeout';
    };
    0`;
  fishWin.show(); fishWin.focus();   // a hidden window's animation is throttled
  await js(DRIVER);
  let outcome = '';
  for (let attempt = 0; attempt < 3 && outcome !== 'caught'; attempt++) {
    await js("document.querySelector('#resOk').click(); window.__fire('mousedown'); 0");
    await wait(120);   // a short cast: the shallow (easy) water
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
  // a tired pond: the 6th bite this hour is mostly junk, a 7th doesn't come
  await step('fish-limits', async () => {
    const lim = () => Limits.info(store.data, 'fishing', today());
    lim();
    const now = Date.now();
    store.data.limits.fishing.recent = [now - 50 * 60e3, now - 40 * 60e3, now - 30 * 60e3, now - 20 * 60e3, now - 10 * 60e3];
    const b = fishBite(0.5);
    const land = fishLand(b.token);
    console.log('[test] 6th bite this hour: delay', b.delay, 'junk?', !!land.junk, JSON.stringify(land.names), 'junk chance', Fishing.junkChance(5));
    console.log('[test] 7th bite:', JSON.stringify(fishBite(0.5)), JSON.stringify(lim()));
    let words = null;
    try { words = JSON.parse(fs.readFileSync(path.join(__dirname, 'test', 'secrets.local.json'), 'utf8')); } catch { /* not here */ }
    if (words && words.fishing) {
      await runSecret(words.fishing);
      const free = fishBite(0.5);
      console.log('[test] fishing code: bite', free.ok, 'delay', free.delay, 'used', lim().recent);
      await runSecret(words.fishing);
      console.log('[test] fishing code off:', fishBite(0.5).ok === false);
    }
    changed();
  });
  await wait(1000);
  await fishWin.webContents.executeJavaScript("document.querySelector('#resOk').click(); window.__fire('mousedown'); window.__fire('mouseup'); 0");
  await wait(800);
  await shot(fishWin, '27b-fish-rest');
  send(panelWin, 'panel:tab', 'dex');
  await wait(1500);
  await panelWin.webContents.executeJavaScript("document.querySelector('[data-fold=fishdex]').open = true; document.querySelector('#fishHead').scrollIntoView(); 0");
  await wait(1500);
  await shot(panelWin, '28-panel-fishdex');

  // ---- daily sign-in and tasks
  await step('daily', async () => {
    console.log('[test] sign in:', JSON.stringify(signIn()));
    for (const t of store.data.daily.tasks.slice(0, 2)) taskProgress(t.kind, t.goal);
    console.log('[test] claim:', JSON.stringify(claimTask(store.data.daily.tasks[0].id)));
  });
  send(panelWin, 'panel:tab', 'today');
  await wait(1500);
  await shot(panelWin, '29-panel-today');

  // ---- weather (a real lookup) and the settings section
  await step('weather', async () => {
    setSettings({ weather: { enabled: true } });
    console.log('[test] weather city:', JSON.stringify(await setWeatherCity('Shanghai')));
    await wait(3000);
    console.log('[test] weather now:', JSON.stringify(store.data.weatherNow));
  });
  send(panelWin, 'panel:tab', 'settings');
  await wait(1200);
  await panelWin.webContents.executeJavaScript("document.querySelector('[data-i18n=\"wx.title\"]').scrollIntoView(); 0");
  await wait(600);
  await shot(panelWin, '30-panel-weather');

  // ---- desktop play: fling, then peek from the left edge, then a holiday greeting
  await step('fling', async () => fling(1600, -1400));
  await wait(450);
  await shot(petWin, '31-pet-flying');
  await wait(5500);
  await shot(petWin, '32-pet-landed');
  await step('peek', async () => {
    const b = petWin.getBounds();
    const wa = screen.getDisplayMatching(b).workArea;
    petWin.setPosition(Math.round(wa.x + 10 - b.width / 2), b.y);
    settleAtEdge();
    console.log('[test] peek:', JSON.stringify(peek));
  });
  await wait(2000);
  await shot(petWin, '33-pet-peek');
  await step('unpeek', async () => unpeek(true));
  await wait(1500);
  await step('holiday', async () => petEvent('holiday', { holiday: 'midAutumn', anniv: null, gift: 3 }));
  await wait(1500);
  await shot(petWin, '34-pet-holiday');

  // ---- battles: buy balls, a team of two, explore the grass, fight and try to catch
  await step('battle-setup', async () => {
    store.data.berries += 60;
    shopBuy('pokeball', 5); shopBuy('potion', 1);
    S().party = []; changed();
    for (const id of ['pikachu', 'charmander']) { petOf(store.data, id).xp = Growth.xpFor(10); Object.assign(Care.careOf(store.data, id), { fainted: false, sick: false, status: null, health: 100 }); }
    S().party = ['pikachu', 'charmander']; changed();
    // a held item: bought in the shop, given to Pikachu
    shopBuy('leftovers', 1);
    console.log('[test] hold leftovers:', JSON.stringify(holdItem('pikachu', 'leftovers')), petOf(store.data, 'pikachu').held, store.data.inventory.leftovers || 0);
    openWild(false);
  });
  await wait(4000);
  await shot(wildWin, '35-wild-explore');
  const wjs = (code) => wildWin.webContents.executeJavaScript(code);
  await wjs("document.querySelector('#menu button').click(); 0");
  await wait(9000);
  await shot(wildWin, '36-battle-start');
  if (battle) {
    const v = battleView();
    console.log('[test] battle abilities:', JSON.stringify(v.party.map((m) => [m.key, m.ability && m.ability.id, m.item])), 'wild:', v.wild.ability && v.wild.ability.id, v.wild.item, 'weather:', v.weather, 'intro:', v.intro.map((e) => e.t).join(','));
  }
  await wjs(`window.__drive = (async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const btns = () => [...document.querySelectorAll('#menu button')];
    for (let i = 0; i < 200; i++) {
      await sleep(400);
      if (!document.querySelector('#result').classList.contains('hidden')) return document.querySelector('#resTitle').textContent;
      const list = btns();
      if (!list.length) continue;
      const fight = list.find((b) => b.textContent.includes('⚔'));
      if (fight) {
        const wildPct = parseFloat(document.querySelector('#wildBox .bar > div').style.width) || 100;
        if (wildPct < 45) {
          list.find((b) => b.textContent.includes('🎒')).click(); await sleep(150);
          const ball = btns().find((b) => b.textContent.includes('🔴'));
          if (ball) { ball.click(); continue; }
          btns().pop().click(); await sleep(150);
        }
        btns().find((b) => b.textContent.includes('⚔')).click(); await sleep(150);
        const mv = document.querySelector('#menu button.type'); if (mv) mv.click();
        continue;
      }
      const any = list.find((b) => !b.disabled && b.className !== 'back'); if (any) any.click();
    }
    return 'timeout';
  })(); 0`);
  await wait(12000);
  await shot(wildWin, '37-battle-mid');
  console.log('[test] battle result:', await wjs('window.__drive'));
  await wait(800);
  await shot(wildWin, '38-battle-result');
  console.log('[test] pokedex:', JSON.stringify(store.data.pokedex), 'team:', store.data.custom.map((c) => c.id).join(','), 'balls left:', store.data.inventory.pokeball || 0);
  send(panelWin, 'panel:tab', 'pokemon');
  await wait(2000);
  await shot(panelWin, '39-panel-party');
  console.log('[test] abilities on the team:', JSON.stringify(store.data.custom.map((c) => [c.id, (petOf(store.data, c.id).ability || {}).id || null, petOf(store.data, c.id).held || null])));
  // the hidden battle command: weather, terrain, an ability and a held item in a forced battle
  {
    let words = null;
    try { words = JSON.parse(fs.readFileSync(path.join(__dirname, 'test', 'secrets.local.json'), 'utf8')); } catch { /* not here */ }
    if (words && words.battlefx && words.battle) {
      await step('battle-fx', async () => {
        await runSecret(`${words.battle} pikachu`);
        for (const a of ['rain', 'grassy', 'swift-swim', 'leftovers']) console.log(`[test] battlefx ${a}:`, JSON.stringify(await runSecret(`${words.battlefx} ${a}`)));
        const v = battleView();
        console.log('[test] battlefx view:', v.weather, v.terrain, v.party[v.active].ability && v.party[v.active].ability.id, v.party[v.active].item);
        const r = await battleAct({ type: 'move', index: 0 });
        console.log('[test] battlefx turn events:', r.events.map((e) => e.t).join(','));
      });
      await wait(2500);
      await shot(wildWin, '39b-battle-weather-terrain');
      await runSecret(words.win);
      await wait(1000);
    } else console.log('[test] battlefx: skipped (no word in test/secrets.local.json)');
  }
  // the update reminder (dialog stubbed out: it can't be clicked here)
  await step('update-popup', async () => {
    const real = dialog.showMessageBox;
    let shown = null;
    dialog.showMessageBox = async (o) => { shown = o; return { response: 1 }; };
    let words = null;
    try { words = JSON.parse(fs.readFileSync(path.join(__dirname, 'test', 'secrets.local.json'), 'utf8')); } catch { /* not here */ }
    if (words && words.update) await runSecret(words.update);
    else await promptUpdate({ version: '9.9.9', notes: 'test', canDownload: false, url: 'https://github.com' });
    await wait(800);
    dialog.showMessageBox = real;
    console.log('[test] update popup:', shown && shown.message, '|', shown && shown.buttons.join(' / '));
  });
  // the forecast talk (no city set: a made-up forecast)
  await step('forecast-code', async () => {
    let words = null;
    try { words = JSON.parse(fs.readFileSync(path.join(__dirname, 'test', 'secrets.local.json'), 'utf8')); } catch { /* not here */ }
    const city = { lat: S().weather.lat, lon: S().weather.lon };
    S().weather.lat = null;   // the made-up forecast, so the test doesn't depend on the weather service
    if (words && words.forecast) await runSecret(words.forecast); else await checkForecast(true);
    Object.assign(S().weather, city);
    console.log('[test] forecast talk at', store.data.greeted.forecastAt ? 'set' : 'missing');
  });
  for (let i = 0; i < 6; i++) {   // the bubble may wait a moment for its turn
    await wait(1500);
    if (await petWin.webContents.executeJavaScript("!document.querySelector('.bubble').classList.contains('hidden')")) break;
  }
  await shot(petWin, '41e-pet-forecast');
  // after an install that didn't take: the manual install button and the GitHub link in Settings
  await step('update-failed-states', async () => {
    const real = dialog.showMessageBox;
    const seen = [];
    dialog.showMessageBox = async (o) => { seen.push(o.message); return { response: 1 }; };
    let words = null;
    try { words = JSON.parse(fs.readFileSync(path.join(__dirname, 'test', 'secrets.local.json'), 'utf8')); } catch { /* not here */ }
    if (words && words.update) { await runSecret(`${words.update} fail`); await wait(600); await runSecret(`${words.update} fail2`); await wait(600); }
    dialog.showMessageBox = real;
    console.log('[test] update failed popups:', seen.join(' | '));
  });
  openPanel('settings');
  await wait(1500);
  await panelWin.webContents.executeJavaScript("document.querySelector('#updStatus').scrollIntoView({ block: 'center' }); 0");
  await wait(500);
  await shot(panelWin, '41d-settings-update-trouble');
  updater.state.stage = null; updater.state.status = 'idle';
  // the Pokédex keeps a Pokémon that left the team
  await step('pokedex-keeps', async () => {
    const leaving = store.data.custom.find((c) => c.id !== S().pokemon && c.dex);
    const before = JSON.stringify(store.data.pokedex[leaving.dex]);
    ipcMain.emit('pokemon:remove', {}, leaving.id);
    console.log('[test] removed', leaving.names.en, '– still in the Pokédex:', before === JSON.stringify(store.data.pokedex[leaving.dex]), JSON.stringify(Pokedex.counts(store.data)));
  });
  openPanel('dex');
  await wait(3000);
  await panelWin.webContents.executeJavaScript("document.querySelector('[data-fold=pokedex]').open = true; document.querySelector('#pokedexHead').scrollIntoView(); 0");
  await wait(500);
  await shot(panelWin, '41c-panel-pokedex');
  // grass: at most 3 an hour
  await step('grass-hourly', async () => {
    grassInfo();
    store.data.limits.grass.recent = [Date.now() - 50 * 60e3, Date.now() - 20 * 60e3, Date.now() - 60e3];
    console.log('[test] 4th grass this hour:', JSON.stringify(await startBattle('grass')), JSON.stringify(grassInfo()));
  });
  // losing in the grass costs more than losing to an outing's Pokémon
  await step('grass-lose', async () => {
    store.data.limits.grass.recent = [];
    const id = partyIds()[0];
    Object.assign(Care.careOf(store.data, id), { health: 100 });
    petOf(store.data, id).mood = 100;
    const berries = store.data.berries;
    await startBattle('grass');
    battle.b.over = 'lose';
    finishBattle();
    console.log('[test] grass lose: health', Care.careOf(store.data, id).health, 'mood', petOf(store.data, id).mood, 'berries', store.data.berries - berries);
  });
  // an outing's wild Pokémon: asked at once, waits, then leaves
  await step('outing-encounter', async () => {
    if (wildWin && !wildWin.isDestroyed()) wildWin.close();
    battle = null;
    await offerOutingEncounter(S().pokemon, 'cave', null);
    console.log('[test] encounter waiting:', !!waitingEncounter(), waitingEncounter() && waitingEncounter().sp.names.en);
  });
  await wait(5500);
  await shot(petWin, '40-encounter-ask');
  openPanel('expedition');
  await wait(2500);
  await shot(panelWin, '41-panel-outing-play');
  await step('encounter-leaves', async () => {
    store.data.wild.encounter.until = Date.now() - 1;
    checkEncounter();
    console.log('[test] encounter after 30 min:', store.data.wild.encounter, JSON.stringify(await startBattle('outing')));
  });
  await wait(1500);
  await shot(petWin, '42-encounter-gone');
  // evolution items, on a fresh Eevee: the Linking Cord has no effect, a Water Stone evolves it (as in the games)
  const eevee = 'dex-133';
  await step('evolve-stone', async () => {
    const sp = await Sources.lookupSpecies(133);
    store.data.custom.push({ id: eevee, dex: sp.dex, names: sp.names });
    store.data.skins[eevee] = await Sources.downloadSkin(sp.dex, false, spritesDir());
    const pet = petOf(store.data, eevee);
    pet.stage = 'hatched';
    pet.evolvedAt = Date.now() - 30 * 86400e3;
    await lookupEvolveLevel(eevee);
    console.log('[test] eevee evolves:', JSON.stringify((pet.evoPaths || []).map((o) => [o.names.en, o.way, o.level, o.item])), 'at', pet.evolveAt, 'friendship', Growth.friendshipOf(pet));
    changed();
  });
  openPanel('pokemon');
  await wait(2500);
  await shot(panelWin, '43-panel-eevee-paths');
  await step('evolve-stone-use', async () => {
    for (const id of ['linkingcord', 'waterstone']) store.data.inventory[id] = (store.data.inventory[id] || 0) + 1;
    console.log('[test] linking cord on eevee:', JSON.stringify(await useEvoItem('linkingcord', eevee)));
    console.log('[test] water stone on eevee:', JSON.stringify(await useEvoItem('waterstone', eevee)), (petOf(store.data, eevee).species || {}).dex);
  });
  await wait(2500);
  await shot(panelWin, '43b-panel-evolved-stone');
  openPanel('shop');
  await wait(1500);
  await panelWin.webContents.executeJavaScript(`document.querySelector('#shopEvo') && document.querySelector('#shopEvo').scrollIntoView()`).catch(() => {});
  await wait(800);
  await shot(panelWin, '43c-panel-shop-evo');
  {
    let words = null;
    try { words = JSON.parse(fs.readFileSync(path.join(__dirname, 'test', 'secrets.local.json'), 'utf8')); } catch { /* not here */ }
    if (words && words.evolution) {
      await step('evolution-code', async () => {
        console.log('[test] evolution code:', JSON.stringify(await runSecret(words.evolution)), Growth.friendshipOf(activePet()),
          Object.keys(store.data.inventory).filter((k) => Care.ITEMS[k] && Care.ITEMS[k].kind === 'evo').length);
      });
      await wait(3000);
      await shot(petWin, '44-evolution-code');
    } else console.log('[test] evolution code: skipped (no word in test/secrets.local.json)');
  }
  // Who's That Pokémon?: a question opens with the window; pick the right name, then a wrong one
  await step('quiz', async () => openQuiz());
  await wait(6000);
  await shot(quizWin, '45-quiz-silhouette');
  await step('quiz-answer', async () => {
    const [q] = [...quizzes.values()];
    console.log('[test] quiz question:', !!q, q && Object.keys(q.names).length, JSON.stringify(quizInfo()));
    if (q) await quizWin.webContents.executeJavaScript(`document.querySelector('#choices button[data-dex="${q.answer}"]').click()`);
  });
  await wait(2000);
  await shot(quizWin, '46-quiz-right');
  console.log('[test] quiz after right answer:', store.data.berries, store.data.stats.quizStreak, store.data.stats.quizRight);
  await step('quiz-wrong', async () => {
    await quizWin.webContents.executeJavaScript(`document.querySelector('#next').click()`);
    await wait(5000);
    const [q] = [...quizzes.values()];
    const wrong = q && Object.keys(q.names).map(Number).find((d) => d !== q.answer);
    if (q) await quizWin.webContents.executeJavaScript(`document.querySelector('#choices button[data-dex="${wrong}"]').click()`);
    await wait(1500);
    console.log('[test] quiz after wrong answer: streak', store.data.stats.quizStreak, JSON.stringify(quizInfo()));
  });
  await shot(quizWin, '47-quiz-wrong');
  // Berry Catch: play a round, sweeping the Pokémon back and forth, and see the result
  await step('catch', async () => openCatch());
  await wait(4000);
  await shot(catchWin, '48-catch-start');
  await step('catch-play', async () => {
    await catchWin.webContents.executeJavaScript(`document.querySelector('#ovButton').click();
      (() => { const c = document.querySelector('#field'); const r = c.getBoundingClientRect(); let i = 0;
        const iv = setInterval(() => { i++; c.dispatchEvent(new MouseEvent('mousemove', { clientX: r.left + r.width * (0.5 + 0.4 * Math.sin(i / 6)), clientY: r.top + 300, bubbles: true }));
          if (i > 400) clearInterval(iv); }, 80); })()`);
  });
  await wait(9000);
  await shot(catchWin, '49-catch-playing');
  await wait(24000);
  await shot(catchWin, '50-catch-result');
  console.log('[test] catch after a round:', store.data.stats.catchBest, JSON.stringify(catchInfo()));
  // Memory Match: deal a board, turn a wrong pair, then clear it
  await step('memory', async () => openMemory());
  await wait(3000);
  await shot(memoryWin, '51-memory-start');
  await step('memory-play', async () => {
    await memoryWin.webContents.executeJavaScript(`document.querySelector('#ovButton').click()`);
    await wait(6000);
    const order = memoryBoard ? memoryBoard.cards : [];
    const first = order.findIndex((d) => d !== order[0]);
    if (first > 0) await memoryWin.webContents.executeJavaScript(`(() => { const t = document.querySelectorAll('.tile'); t[0].click(); t[${first}].click(); })()`);
    await wait(300);
  });
  await shot(memoryWin, '52-memory-turned');
  await step('memory-clear', async () => {
    await wait(5000);   // past MIN_SECONDS
    const order = memoryBoard ? memoryBoard.cards : [];
    for (const dex of [...new Set(order)]) {
      const [a, b] = order.map((d, i) => (d === dex ? i : -1)).filter((i) => i >= 0);
      await memoryWin.webContents.executeJavaScript(`(() => { const t = document.querySelectorAll('.tile'); t[${a}].click(); t[${b}].click(); })()`);
      await wait(150);
    }
  });
  await wait(2500);
  await shot(memoryWin, '53-memory-result');
  console.log('[test] memory after a board:', store.data.stats.memoryBest, JSON.stringify(memoryInfo()));
  // Whack-a-Diglett: play a round, tapping every hole now and then
  await step('whack', async () => openWhack());
  await wait(3000);
  await shot(whackWin, '54-whack-start');
  await step('whack-play', async () => {
    await whackWin.webContents.executeJavaScript(`document.querySelector('#ovButton').click();
      (() => { const c = document.querySelector('#field'); const r = c.getBoundingClientRect(); let i = 0;
        const iv = setInterval(() => { i++; const h = i % 9; const x = 32 + (h % 3) * 48, y = 52 + Math.floor(h / 3) * 34;
          c.dispatchEvent(new MouseEvent('mousedown', { clientX: r.left + (x / 160) * r.width, clientY: r.top + (y / 140) * r.height, bubbles: true }));
          if (i > 600) clearInterval(iv); }, 45); })()`);
  });
  await wait(9000);
  await shot(whackWin, '55-whack-playing');
  await wait(24000);
  await shot(whackWin, '56-whack-result');
  console.log('[test] whack after a round:', store.data.stats.whackBest, JSON.stringify(whackInfo()));
  // Type Match-up: answer the first question right and the second wrong, then the rest right
  await step('types', async () => openTypes());
  await wait(2500);
  await shot(typesWin, '57-types-start');
  await step('types-play', async () => {
    await typesWin.webContents.executeJavaScript(`document.querySelector('#next').click()`);
    await wait(800);
    const qs = typesRound ? typesRound.questions : [];
    for (let i = 0; i < qs.length; i++) {
      const pick = i === 1 ? TypeQuiz.CHOICES.find((c) => c !== qs[i].answer) : qs[i].answer;
      await typesWin.webContents.executeJavaScript(`document.querySelector('#choices button[data-choice="${pick}"]').click()`);
      await wait(400);
      if (i === 0) await shot(typesWin, '58-types-right');
      if (i === 1) await shot(typesWin, '59-types-wrong');
      if (i < qs.length - 1) await typesWin.webContents.executeJavaScript(`document.querySelector('#next').click()`);
      await wait(200);
    }
  });
  await wait(800);
  await shot(typesWin, '60-types-result');
  console.log('[test] types after a round:', store.data.stats.typesBest, JSON.stringify(typesInfo()));
  // Fire-Water-Grass: throw fire until the match is over
  await step('rps', async () => openRps());
  await wait(2500);
  await shot(rpsWin, '61-rps-start');
  await step('rps-play', async () => {
    await rpsWin.webContents.executeJavaScript(`document.querySelector('#next').click()`);
    await wait(600);
    for (let i = 0; i < 30 && rpsMatch; i++) {
      await rpsWin.webContents.executeJavaScript(`document.querySelector('#moves button[data-move="fire"]').click()`);
      await wait(300);
      if (i === 0) await shot(rpsWin, '62-rps-throw');
    }
  });
  await wait(600);
  await shot(rpsWin, '63-rps-result');
  console.log('[test] rps after a match:', store.data.stats.rpsWins || 0, JSON.stringify(rpsInfo()));
  // Voltorb Flip: a cleared board (turning only the cards that aren't Voltorb), then one lost on a Voltorb
  await step('flip', async () => openFlip());
  await wait(2500);
  await shot(flipWin, '64-flip-start');
  await step('flip-win', async () => {
    await flipWin.webContents.executeJavaScript(`document.querySelector('#next').click()`);
    await wait(800);
    const cards = flipBoard ? flipBoard.cards : [];
    const safe = cards.map((v, i) => (v > 1 ? i : -1)).filter((i) => i >= 0);
    for (const [k, i] of safe.entries()) {
      await flipWin.webContents.executeJavaScript(`document.querySelectorAll('.tile')[${i}].click()`);
      await wait(150);
      if (k === 1) await shot(flipWin, '65-flip-turning');
    }
  });
  await wait(800);
  await shot(flipWin, '66-flip-won');
  await step('flip-lose', async () => {
    await flipWin.webContents.executeJavaScript(`document.querySelector('#next').click()`);
    await wait(800);
    const i = flipBoard ? flipBoard.cards.indexOf(0) : -1;
    if (i >= 0) await flipWin.webContents.executeJavaScript(`document.querySelectorAll('.tile')[${i}].click()`);
  });
  await wait(800);
  await shot(flipWin, '67-flip-lost');
  console.log('[test] flip after two boards:', store.data.stats.flipWins || 0, JSON.stringify(flipInfo()));
  // Chatot Echo: sing back three tunes, then a wrong note
  await step('echo', async () => openEcho());
  await wait(2500);
  await shot(echoWin, '68-echo-start');
  await step('echo-play', async () => {
    const phase = () => echoWin.webContents.executeJavaScript('document.body.dataset.phase');
    const press = (pad) => echoWin.webContents.executeJavaScript(`document.querySelector('.pad[data-pad="${pad}"]').dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))`);
    await echoWin.webContents.executeJavaScript(`document.querySelector('#next').click()`);
    for (let round = 0; round < 4 && echoGame; round++) {
      for (let i = 0; i < 60 && (await phase()) !== 'input'; i++) await wait(100);
      if (round === 1) await shot(echoWin, '69-echo-input');
      const seq = echoGame.seq.slice();
      if (round === 3) { await press(Echo.PADS.find((p) => p !== seq[0])); break; }
      for (const pad of seq) { await press(pad); await wait(120); }
    }
  });
  await wait(1200);
  await shot(echoWin, '70-echo-result');
  console.log('[test] echo after a round:', store.data.stats.echoBest || 0, JSON.stringify(echoInfo()));
  // Poké Ball Shuffle: find the partner three times, then pick a wrong ball
  await step('shuffle', async () => openShuffle());
  await wait(2500);
  await shot(shuffleWin, '71-shuffle-start');
  await step('shuffle-play', async () => {
    const phase = () => shuffleWin.webContents.executeJavaScript('document.body.dataset.phase');
    await shuffleWin.webContents.executeJavaScript(`document.querySelector('#next').click()`);
    for (let n = 0; n < 4 && shuffleGame; n++) {
      for (let i = 0; i < 40 && (await phase()) === 'idle'; i++) await wait(100);
      if (n === 1) { await wait(1500); await shot(shuffleWin, '72-shuffle-swapping'); }
      for (let i = 0; i < 100 && (await phase()) !== 'pick'; i++) await wait(100);
      const g = shuffleGame.cur;
      const at = Shuffle.trace(g.start, g.swaps);
      const slot = n < 3 ? at : (at + 1) % g.balls;
      await shuffleWin.webContents.executeJavaScript(`document.querySelector('.ball[data-slot="${slot}"]').click()`);
      for (let i = 0; i < 40 && (await phase()) === 'wait'; i++) await wait(100);
    }
  });
  await wait(1200);
  await shot(shuffleWin, '73-shuffle-result');
  console.log('[test] shuffle after a game:', store.data.stats.shuffleBest || 0, JSON.stringify(shuffleInfo()));
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
    seedBundledSprites();
    deletePhotoFiles(Album.prune(store.data.photos));   // older saves kept up to 60 photos
    migrate();
    offlineCare();
    dailyRoll();
    setTimeout(() => { greetHoliday(); checkWeather(); }, 6000);
    setTimeout(checkWeekly, 15000);
    setTimeout(() => ensurePmdSkins().catch((e) => console.error("PMD download failed", e)), 3000);
    setTimeout(() => ensureAbilities().catch(() => {}), 8000);
    // how each one evolves (stones, the Linking Cord, friendship): looked up again once for pets from older versions
    setTimeout(() => {
      for (const c of store.data.custom) {
        const pet = petOf(store.data, c.id);
        if (pet.stage === 'hatched' && !pet.finalForm && !pet.evoPaths) lookupEvolveLevel(c.id);
      }
    }, 12000);
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
    applyFullscreenSetting();
    setInterval(tick, 1000);
    setInterval(slowTick, 60000);
    setInterval(pollInput, 60);
    // new release on GitHub? Checked at startup and three times a day (settings can turn it off); a new version
    // pops up a dialog after each check that finds it
    updater = new Updater(() => broadcast(), { quit: () => { quitting = true; app.quit(); } });
    // an update that was downloaded but didn't get installed: offer to install it by hand
    if (updater.state.stage && !process.env.POKEPET_TEST) setTimeout(() => promptUpdate(updater.state), 6000);
    if (S().checkUpdates && !process.env.POKEPET_TEST) {
      setTimeout(() => checkForUpdate(), 8000);
      setInterval(() => {
        if (S().checkUpdates && Date.now() - (store.data.updateCheckedAt || 0) >= UPDATE_EVERY_MS) checkForUpdate();
      }, 10 * 60e3);   // looked at every 10 minutes, so a sleeping computer catches up when it wakes
    }
    if (process.env.POKEPET_TEST) selfTest(process.env.POKEPET_TEST).catch((e) => { console.error(e); app.exit(1); });
    screen.on('display-removed', () => {
      if (petWin && !validPos({ x: petWin.getBounds().x, y: petWin.getBounds().y }, petSize())) resetPetPos();
    });
  });

  app.on('before-quit', () => {
    quitting = true;
    keys.stop();
    fullscreen.stop();
    if (store) store.flush();
  });

  // Keep running in the tray when windows are closed (having a handler prevents auto-quit).
  app.on('window-all-closed', () => {});
}
