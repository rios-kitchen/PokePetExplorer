/* PokePet Explorer – pet window: speech bubble with PMD portrait, and the timer pill. */
(() => {
  const P = window.Pet;
  const { api, SP, bubbleEl, bubbleText, bubbleActions, faceEl, pillEl } = P;

  // ================================================================ emotions (PMD portraits)
  const EMO = {
    greet: 'Happy', pet: 'Joyous', petFocus: 'Determined', petBreak: 'Joyous',
    focusStart: 'Determined', focusStartTask: 'Determined', focusEnd: 'Joyous', askTaskDone: 'Normal',
    breakStart: 'Happy', breakEnd: 'Inspired', todoDone: 'Happy', allDone: 'Joyous', todoAdded: 'Normal',
    reminder: 'Worried', due: 'Surprised', levelUp: 'Inspired', sleep: 'Sigh', wake: 'Surprised',
    lonely: 'Teary-Eyed', idle: 'Normal', held: 'Surprised', dropped: 'Dizzy', switchIn: 'Determined',
    stopped: 'Normal', paused: 'Normal', typing: 'Happy', typingLong: 'Worried', dizzy: 'Dizzy',
    welcomeBack: 'Joyous', hover: 'Happy', chase: 'Determined',
    needHungry: 'Sad', needDirty: 'Worried', needSick: 'Pain', needFainted: 'Pain', needPooped: 'Worried',
    gotSick: 'Pain', eat: 'Happy', bathDone: 'Joyous', healed: 'Happy',
    refusedFull: 'Normal', refusedClean: 'Normal', refusedHealthy: 'Happy', refusedBerries: 'Sad', refusedFainted: 'Pain',
    dailyBerries: 'Happy', weekly_happy: 'Joyous', weekly_okay: 'Normal', weekly_sad: 'Crying',
    poopStart: 'Pain', poopDone: 'Worried', poopCleaned: 'Joyous',
    diagnosed: 'Worried', statusWorse: 'Pain', wrongMedicine: 'Pain', revived: 'Joyous',
    hatched: 'Joyous', evolveReady: 'Surprised', evolved: 'Inspired', evolveOffline: 'Sad', evolveNoSprite: 'Sad',
    expStart_dungeon: 'Determined', expStart_training: 'Determined', expStart_travel: 'Happy', expRecalled: 'Normal',
    expBack: 'Happy', expBackTraining: 'Happy', expBackTravel: 'Joyous', expBackHurt: 'Pain', achievement: 'Joyous', hatchedShiny: 'Joyous'
  };

  /** The face also depends on how the pet is doing right now. */
  function emotionFor(key) {
    let e = EMO[key] || 'Normal';
    const c = P.care();
    if (c.fainted) return 'Pain';
    if (c.sick && (e === 'Normal' || e === 'Happy')) e = 'Pain';
    else if (c.pooped && e === 'Normal') e = 'Worried';
    else if (P.state && P.state.mood < 30 && (e === 'Normal' || e === 'Happy')) e = 'Sad';
    return e;
  }

  const faceCache = {};
  function dexOf(id) {
    if (P.isEgg()) return null;   // a surprise until it hatches
    const sp = P.state && P.state.pets[id] && P.state.pets[id].species;   // evolved
    if (sp) return sp.dex;
    if (SP.DEFS[id]) return SP.DEFS[id].dex;
    const c = P.state && P.state.custom.find((x) => x.id === id);
    return c ? c.dex : null;
  }
  function portrait(emotion) {
    const dex = P.sprite && dexOf(P.sprite.id);
    if (!dex) return Promise.resolve(null);
    const k = `${dex}-${emotion}`;
    if (!(k in faceCache)) faceCache[k] = api.invoke('diary:portrait', dex, emotion).catch(() => null);
    return faceCache[k];
  }

  // ================================================================ bubble
  let bubbleTimer = null;
  let bubblePriority = 0;
  let faceToken = 0;

  function showBubble(text, o = {}) {
    const priority = o.priority ?? (o.actions ? 2 : 1);
    if (!bubbleEl.classList.contains('hidden') && priority < bubblePriority) return;
    bubblePriority = priority;
    bubbleText.textContent = text;
    const emotion = o.emotion || emotionFor(P.lastLine);
    P.lastLine = null;
    faceEl.classList.add('hidden');
    const token = ++faceToken;
    portrait(emotion).then((url) => {
      if (!url || token !== faceToken) return;
      faceEl.src = url;
      faceEl.classList.remove('hidden');
      layoutOverlays();
    });
    bubbleActions.innerHTML = '';
    for (const a of o.actions || []) {
      const b = document.createElement('button');
      b.textContent = a.label;
      if (!a.primary) b.className = 'secondary';
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        hideBubble(true);
        a.run();
      });
      bubbleActions.appendChild(b);
    }
    bubbleEl.classList.remove('hidden');
    bubbleEl.style.animation = 'none'; void bubbleEl.offsetWidth; bubbleEl.style.animation = '';
    clearTimeout(bubbleTimer);
    const ms = o.ms ?? (o.actions ? 60e3 : Math.min(9000, 2500 + text.length * 70));
    bubbleTimer = setTimeout(() => hideBubble(true), ms);
    layoutOverlays();
  }

  function hideBubble(force) {
    if (!force && bubblePriority > 1) return;
    clearTimeout(bubbleTimer);
    bubbleEl.classList.add('hidden');
    bubblePriority = 0;
  }

  const bubbleBusy = () => !bubbleEl.classList.contains('hidden') && bubblePriority > 1;

  const careAction = (item, label) => ({ label, primary: true, run: () => api.send('pet:action', 'care', item) });
  const laterAction = () => ({ label: P.tr('btn.later'), run: () => {} });

  // ================================================================ timer pill
  let lastPillText = '';
  function fmt(ms) {
    const s = Math.max(0, Math.ceil(ms / 1000));
    const mm = `${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
    return s >= 3600 ? `${Math.floor(s / 3600)}:${mm}` : mm;
  }

  function timeLeft() {
    const state = P.state;
    if (!state || state.timer.phase === 'idle') return 0;
    const t = state.timer;
    return t.paused ? t.remaining : Math.max(0, t.endsAt - Date.now());
  }

  function layoutOverlays() {
    const sprite = P.sprite;
    const u = sprite ? sprite.unit : 3;
    // while away only the small destination icon (16 px, see photo.js) stands there
    const standing = P.isAway() ? 18 * Math.max(2, P.fx()) : (sprite ? sprite.h : 30) * u;
    const restTop = P.H - P.GROUND_PAD - standing;
    let y = restTop - 6;
    if (!pillEl.classList.contains('hidden')) {
      pillEl.style.top = `${Math.max(0, y - pillEl.offsetHeight)}px`;
      y -= pillEl.offsetHeight + 4;
    }
    if (!bubbleEl.classList.contains('hidden')) {
      bubbleEl.style.top = `${Math.max(2, y - bubbleEl.offsetHeight - 8)}px`;
    }
  }

  function updatePill() {
    const ph = P.phase();
    const exp = P.isAway() ? P.state.expedition : null;
    if (exp && ph === 'idle') {
      const text = `🧭 ${fmt(exp.endsAt - Date.now())}`;
      if (text !== lastPillText) {
        pillEl.textContent = text;
        pillEl.className = 'pill away';
        pillEl.title = P.tr(`exp.${exp.id}`);
        lastPillText = text;
        layoutOverlays();
      }
      return;
    }
    if (ph === 'idle') {
      if (!pillEl.classList.contains('hidden')) { pillEl.classList.add('hidden'); layoutOverlays(); }
      lastPillText = '';
      return;
    }
    const paused = P.state.timer.paused;
    const icon = ph === 'focus' ? '🍅' : '☕';
    const text = `${paused ? '⏸' : icon} ${fmt(timeLeft())}`;
    if (text !== lastPillText) {
      pillEl.textContent = text;
      pillEl.className = `pill ${ph === 'focus' ? 'focus' : 'break'}${paused ? ' paused' : ''}`;
      pillEl.title = '';
      lastPillText = text;
      layoutOverlays();
    }
  }

  Object.assign(P, { portrait, showBubble, hideBubble, bubbleBusy, careAction, laterAction, fmt, timeLeft, layoutOverlays, updatePill });
})();
