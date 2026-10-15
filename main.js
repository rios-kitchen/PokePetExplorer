// PokePet – main process: windows, tray, Pomodoro timer, to-dos and persistence.
const {
  app, BrowserWindow, ipcMain, Menu, Tray, nativeImage, screen, Notification, powerMonitor
} = require('electron');
const fs = require('fs');
const path = require('path');
const { Store, today, petOf } = require('./src/main/store');
const Sources = require('./src/main/sources');
const Care = require('./src/main/care');
const Diary = require('./src/main/diary');
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

function levelOf(xp) { return 1 + Math.floor(Math.sqrt((xp || 0) / 25)); }

function spritesDir() { return path.join(app.getPath('userData'), 'sprites'); }

function petList() {
  const builtin = Sprites.ORDER.map((id) => ({ id, names: Sprites.DEFS[id].name, dex: Sprites.DEFS[id].dex, builtin: true }));
  const custom = store.data.custom.map((c) => ({ id: c.id, names: c.names, dex: c.dex, builtin: false }));
  return builtin.concat(custom);
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
    const skin = store.data.skins[p.id];
    const missing = !skin || skin.style !== 'pmd';
    const outdated = skin && skin.style === 'pmd' && skin.v !== Sources.PMD_VERSION;
    if (!missing && !outdated) continue;
    try {
      store.data.skins[p.id] = await Sources.downloadSkin(p.dex, !!(skin && skin.shiny), spritesDir());
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

const careOfActive = () => Care.careOf(store.data, S().pokemon);
const activePet = () => petOf(store.data, S().pokemon);

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
    inventory: d.inventory,
    expedition: d.expedition,
    daily: d.daily,
    achievements: d.achievements,
    fishdex: d.fishdex,
    souvenirs: d.souvenirs,
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
  updateTray();
}

function petEvent(type, data = {}) {
  send(petWin, 'pet:event', { type, ...data });
}

function changed() {
  store.save();
  broadcast();
}

function notify(title, body) {
  if (!Notification.isSupported()) return;
  new Notification({ title, body, silent: true, icon: appIcon(64) }).show();
}

function addMood(n) {
  const pet = activePet();
  pet.mood = Math.max(0, Math.min(100, pet.mood + n));
}

function addXp(n) {
  const id = S().pokemon;
  const pet = activePet();
  const before = levelOf(pet.xp);
  pet.xp += n;
  const after = levelOf(pet.xp);
  if (after > before) {
    petEvent('level-up', { level: after, petId: id });
    Diary.record(store.data, 'levelUps');
  }
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
    title: 'PokePet Plus',
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
      notify(T('notif.focusEnd'), T('notif.focusEndBody', { name: petName() }));
      petEvent('focus-end', {
        min: d.pomodoro.focus,
        n: d.stats.todayPomos,
        berries: Care.REWARD.pomodoro,
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

function careStep(hours, asleep) {
  const care = careOfActive();
  const wasSick = care.sick;
  const { moodDelta, events } = Care.decay(care, hours, { asleep, poops: store.data.poops.length });
  addMood(moodDelta);
  if (Care.rollSickness(care) || (!wasSick && care.sick)) {
    Diary.flag(store.data, 'sick');
    petEvent('got-sick');
  }
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
    alwaysOnTop: true, skipTaskbar: true, hasShadow: false, show: false, title: 'PokePet Plus',
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
  Diary.sample(store.data, activePet().mood, care.health, S().pokemon);

  // complain about the most urgent need, at most every 20 minutes per need
  const need = Care.urgentNeed(care);
  if (need && !asleep && timer.phase !== 'focus' && Date.now() - (lastNeedAlert[need] || 0) > 20 * 60000) {
    lastNeedAlert[need] = Date.now();
    petEvent('need', { need });
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
  const res = Care.useItem(store.data, S().pokemon, itemId);
  if (res.ok) {
    const field = { food: 'fed', bath: 'baths', med: 'meds' }[res.kind];
    if (res.kind === 'food' && !store.data.poopDueAt && Math.random() < 0.6) {
      store.data.poopDueAt = Date.now() + (20 + Math.random() * 25) * 60000;
    }
    Diary.record(store.data, field);
    addMood(res.item.mood || 0);
    if (res.item.xp) addXp(res.item.xp);
    petEvent('care', { item: itemId, kind: res.kind });
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

  return Menu.buildFromTemplate([
    { label: status, enabled: false },
    ...timerItems,
    { type: 'separator' },
    { label: T('menu.todos'), click: () => openPanel('todos') },
    { label: T('menu.pomodoro'), click: () => openPanel('focus') },
    { type: 'separator' },
    {
      label: `${T('menu.care')}  ·  🍓 ${store.data.berries}`,
      submenu: [
        ...Object.entries(Care.ITEMS).map(([itemId, item]) => ({
          label: `${T(`item.${itemId}`)}${item.cost ? `  (${item.cost} 🍓)` : ''}`,
          enabled: store.data.berries >= item.cost,
          click: () => useCareItem(itemId)
        })),
        { label: T('menu.cleanPoops', { n: store.data.poops.length }), enabled: store.data.poops.length > 0, click: () => cleanPoop('*') },
        { type: 'separator' },
        { label: T('menu.careOpen'), click: () => openPanel('care') }
      ]
    },
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
    { label: T('menu.settings'), click: () => openPanel('settings') },
    { type: 'separator' },
    { label: T('menu.quit'), click: () => app.quit() }
  ]);
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
    if (k in s && k !== 'petPos') s[k] = v;
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
  ipcMain.handle('pokemon:fetch', async (_e, query, shiny) => {
    try {
      const sp = await Sources.lookupSpecies(query);
      const builtin = Sprites.ORDER.find((id) => Sprites.DEFS[id].dex === sp.dex);
      let entry = builtin ? null : store.data.custom.find((c) => c.dex === sp.dex);
      const id = builtin || (entry ? entry.id : `dex-${sp.dex}`);
      const meta = await Sources.downloadSkin(sp.dex, shiny, spritesDir());
      if (!builtin && !entry) {
        entry = { id, dex: sp.dex, names: sp.names };
        store.data.custom.push(entry);
      }
      const old = store.data.skins[id];
      store.data.skins[id] = meta;
      if (old) removeSkinFiles(old, id);
      if (S().pokemon === id) petEvent('skin', { id });
      selectPokemon(id);
      changed();
      return { ok: true, id };
    } catch (e) {
      return { ok: false, error: e.code === 'not-found' ? 'not-found' : 'net' };
    }
  });
  ipcMain.handle('pokemon:skin', async (_e, id, shiny) => {
    const p = petList().find((x) => x.id === id);
    if (!p) return { ok: false, error: 'not-found' };
    try {
      const old = store.data.skins[id];
      store.data.skins[id] = await Sources.downloadSkin(p.dex, shiny, spritesDir());
      if (old) removeSkinFiles(old, id);
      changed();
      if (S().pokemon === id) petEvent('skin', { id });
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.code === 'not-found' ? 'not-found' : 'net' };
    }
  });
  ipcMain.on('pokemon:remove', (_e, id) => {
    if (!store.data.custom.some((x) => x.id === id)) return;
    removeSkinFiles(store.data.skins[id], id);
    delete store.data.skins[id];
    store.data.custom = store.data.custom.filter((x) => x.id !== id);
    if (S().pokemon === id) S().pokemon = 'pikachu';
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
  ipcMain.on('poop:clean', (_e, id) => cleanPoop(String(id || '')));
  ipcMain.handle('diary:portrait', async (_e, dex, emotion) => {
    try {
      const known = !!Sources.cachedCredits(dex, spritesDir());
      const buf = await Sources.portrait(dex, emotion, spritesDir());
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
    Object.assign(c, { hunger: 12, clean: 10, health: 40, sick: true });
    changed();
    petEvent('need', { need: 'sick' });
  });
  await wait(1500);
  await shot(petWin, '03-pet-sick-dirty');
  openPanel('care');
  panelWin.setSize(420, 1100);
  await wait(1500);
  await shot(panelWin, '04-panel-care');

  await step('potion', async () => { store.data.berries = 20; useCareItem('potion'); });
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
  await step('revive', async () => useCareItem('potion'));
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
    store = new Store(app.getPath('userData'), sysLang);
    migrate();
    offlineCare();
    dailyBerries();
    setTimeout(checkWeekly, 15000);
    setTimeout(() => ensurePmdSkins().catch((e) => console.error("PMD download failed", e)), 3000);
    if (IS_MAC && app.dock) app.dock.hide();
    setAppMenu();
    registerIpc();
    createTray();
    createPetWindow();
    for (const p of store.data.poops) createPoopWindow(p);
    keys.start();
    setInterval(tick, 1000);
    setInterval(slowTick, 60000);
    setInterval(pollInput, 60);
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
