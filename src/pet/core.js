/* PokePet Plus – pet window, shared core: DOM, helpers and the pet/input models.
 * The pet window is split into plain scripts that share this one object (the renderer is sandboxed,
 * so there is no require). Each module adds its functions to it; calls between modules go through
 * `P.name(...)`, so the load order in pet.html only matters for top-level code. */
window.Pet = (() => {
  const canvas = document.getElementById('stage');
  const bubbleEl = document.getElementById('bubble');

  const P = {
    api: window.api,
    I18N: window.PokeI18N,
    SP: window.PokeSprites,
    Sound: window.PokeSound,

    canvas,
    ctx: canvas.getContext('2d', { willReadFrequently: true }),
    bubbleEl,
    bubbleText: bubbleEl.querySelector('.text'),
    bubbleActions: bubbleEl.querySelector('.actions'),
    faceEl: bubbleEl.querySelector('.face'),
    pillEl: document.getElementById('pill'),

    GROUND_PAD: 12,           // px between the pet's feet and the window bottom
    SLEEP_AFTER: 5 * 60e3,
    AWAY_AFTER: 3 * 60,       // seconds without any input → the pet naps

    state: null,              // latest snapshot from the main process
    sprite: null,             // see sprite.js
    W: 0, H: 0, DPR: 1,
    lastLine: null            // key of the last line said (picks the bubble's portrait emotion)
  };

  P.L = () => (P.state ? P.state.settings.lang : 'en');
  P.say = (key, vars) => { P.lastLine = key; return P.I18N.line(P.L(), key, vars); };
  P.tr = (key, vars) => P.I18N.t(P.L(), key, vars);
  P.rand = (a, b) => a + Math.random() * (b - a);
  P.phase = () => (P.state ? P.state.timer.phase : 'idle');
  P.fx = () => (P.state ? P.state.settings.scale : 3);   // effect size unit

  // ================================================================ pet model
  P.pet = {
    mode: 'idle',           // idle | walk | sleep
    dir: -1,                // -1 = facing left/front, 1 = facing right
    lift: 0, vy: 0, jumpsLeft: 0, squash: 0, tilt: 0,
    held: false,
    blinkUntil: 0, nextBlink: 0, happyUntil: 0,
    eatUntil: 0, bathUntil: 0, dizzyUntil: 0,
    nextDecision: 0, modeUntil: 0,
    lastInteract: Date.now(),
    nextChatter: Date.now() + P.rand(3, 6) * 60e3,
    nextLonely: Date.now() + 4 * 60e3,
    eating: null, walkAcc: 0, moving: false,
    anim: null, animStart: 0, nextSweat: 0, nextFly: 0, action: null, nextFun: Date.now() + 20e3
  };

  // The main process sends the cursor position (relative to this window), how far it moved and the
  // system idle time. Input while the cursor stands still is treated as typing (see interact.js).
  P.input = {
    live: false, x: -1e4, y: -1e4, idle: 0, look: 0,
    lastMove: 0, lastActive: Date.now(), lastType: 0, lastTypeSeen: 0, typeStreakStart: 0,
    nextTypeTalk: 0, nextTypeSuggest: Date.now() + 10 * 60e3,
    fastCount: 0, nextDizzy: 0, hoverSince: 0, nextHover: 0, nextChase: 0
  };

  P.care = () => {
    const s = P.state;
    const c = s && s.pets[s.settings.pokemon] && s.pets[s.settings.pokemon].care;
    return c || { hunger: 80, clean: 80, health: 100, sick: false, fainted: false };
  };
  P.isSick = () => P.care().sick;
  P.isFainted = () => P.care().fainted;

  /** Where the pet is drawn right now (window coordinates). */
  P.geometry = () => {
    const sprite = P.sprite;
    const u = sprite ? sprite.unit : 3;
    const w = (sprite ? sprite.w : 32) * u;
    const h = (sprite ? sprite.h : 30) * u;
    const bottom = P.H - P.GROUND_PAD - Math.round(P.pet.lift);
    const cx = Math.round(P.W / 2);
    return { u, w, h, cx, left: Math.round(cx - w / 2), top: bottom - h, bottom };
  };

  return P;
})();
