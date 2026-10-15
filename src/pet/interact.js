/* PokePet Explorer – pet window: reactions to keyboard and mouse, dragging, patting, click-through. */
(() => {
  const P = window.Pet;
  const { api, Sound, ctx, pet, input, bubbleEl, pillEl, say } = P;

  let down = null;   // pointer pressed on the pet: { sx, sy, dragging }

  // ================================================================ keyboard & mouse reactions
  const reacting = () => !!(P.state && P.state.settings.reactInput && input.live);
  const typing = (now = Date.now()) => reacting() && now - input.lastType < 1300;

  /** Busy with something special (bath, food, sleep, …) – no keyboard then. */
  function special(now) {
    return pet.mode === 'sleep' || pet.held || P.isFainted() || pet.eating || pet.pooping
      || now < pet.bathUntil || now < pet.eatUntil || now < pet.dizzyUntil || now < pet.happyUntil
      || pet.lift > 0 || (pet.action && now < pet.action.until);
  }
  const showTyping = (now = Date.now()) => typing(now) && !special(now);

  function typedAt(now, at) {
    if (now - input.lastTypeSeen > 30e3) input.typeStreakStart = now;
    input.lastTypeSeen = now;
    const starting = now - input.lastType > 3000;
    input.lastType = at;
    if (starting) onTypingStart(now);
  }

  function onInput(d) {
    const now = Date.now();
    input.live = true;
    input.idle = d.idle;
    input.x = d.x; input.y = d.y;
    if (pet.held || down) return;
    if (d.moved > 2) input.lastMove = now;

    if (d.idle === 0) {
      const awaySec = (now - input.lastActive) / 1000;
      input.lastActive = now;
      if (pet.mode === 'sleep' && pet.sleptByAway) {
        P.wake(false);
        if (awaySec > 120) {
          P.hearts(2);
          P.showBubble(say('welcomeBack', { cry: P.cry() }), { ms: 3000 });
        }
      }
      // without exact key data: input while the cursor stands still counts as typing
      if (d.sinceKey == null && now - input.lastMove > 700) typedAt(now, now);
    }

    // exact: a key was pressed (mouse clicks and scrolling don't count)
    if (d.sinceKey != null && d.sinceKey < 1000) typedAt(now, now - d.sinceKey);

    const speed = d.moved / 0.06;
    input.fastCount = speed > 4500 ? input.fastCount + 1 : Math.max(0, input.fastCount - 1);
    if (input.fastCount >= 5 && now > input.nextDizzy && pet.mode !== 'sleep' && !P.isFainted()) {
      input.nextDizzy = now + 30e3;
      input.fastCount = 0;
      P.dizzy();
    }

    const g = P.geometry();
    const over = d.x > g.left && d.x < g.left + g.w && d.y > g.top && d.y < g.bottom;
    if (!over) input.hoverSince = 0;
    else if (!input.hoverSince) input.hoverSince = now;
    else if (now - input.hoverSince > 1200 && now > input.nextHover && pet.mode !== 'sleep' && !P.isFainted()) {
      input.nextHover = now + 10e3;
      if (!P.playAnim(['LookUp'], { minMs: 1200 })) P.happy(1200);
      P.hearts(1);
      if (!P.bubbleBusy() && Math.random() < 0.4) P.showBubble(say('hover'), { ms: 1800 });
    }

    if (typing(now) && P.phase() === 'idle' && now - input.typeStreakStart > 15 * 60e3
        && now > input.nextTypeSuggest && !P.bubbleBusy()) {
      input.nextTypeSuggest = now + 30 * 60e3;
      P.showBubble(say('typingLong', { min: Math.round((now - input.typeStreakStart) / 60e3) }), {
        priority: 2,
        ms: 20000,
        actions: [
          { label: `▶ ${P.tr('btn.start')}`, primary: true, run: () => api.send('pet:action', 'start-focus') },
          P.laterAction()
        ]
      });
    }
  }

  function onTypingStart(now) {
    if (special(now)) return;
    if (pet.mode === 'walk') pet.mode = 'idle';
    if (now > input.nextTypeTalk && !P.bubbleBusy() && Math.random() < 0.35) {
      input.nextTypeTalk = now + 5 * 60e3;
      P.showBubble(say('typing'), { ms: 2200 });
    }
  }

  /** Follow the cursor with the eyes (or by turning) while it moves nearby. */
  function updateLook(now) {
    input.look = 0;
    if (!reacting() || !P.sprite || pet.held || pet.mode === 'sleep' || pet.mode === 'walk' || typing(now) || P.isFainted()) return;
    if (now - input.lastMove > 2500) return;
    const dx = input.x - P.W / 2;
    input.look = dx < -50 ? -1 : dx > 50 ? 1 : 0;
  }

  api.on('input', onInput);

  // ================================================================ mouse
  // The window is click-through except where the pet (or its bubble/pill) is.
  let ignoring = true;

  function hitTest(x, y) {
    const el = document.elementFromPoint(x, y);
    if (el && el.closest('.bubble, .pill')) return true;
    if (x < 0 || y < 0 || x >= P.W || y >= P.H) return false;
    if (P.isAway()) {
      // the little destination icon can be dragged around too
      const r = P.awayRect();
      return !!r && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
    }
    const a = ctx.getImageData(Math.floor(x * P.DPR), Math.floor(y * P.DPR), 1, 1).data[3];
    if (a > 10) return true;
    const g = P.geometry();
    return x > g.left + g.w * 0.15 && x < g.left + g.w * 0.85 && y > g.top + g.h * 0.1 && y < g.bottom;
  }

  function setIgnore(v) {
    if (v === ignoring) return;
    ignoring = v;
    api.send('pet:ignore', v);
  }

  window.addEventListener('mousemove', (e) => {
    if (down) {
      const moved = Math.hypot(e.screenX - down.sx, e.screenY - down.sy);
      if (!down.dragging && moved > 4) {
        down.dragging = true;
        api.send('pet:drag-start');
        if (P.isAway()) return;
        pet.held = true;
        if (pet.mode === 'sleep' || pet.mode === 'walk') pet.mode = 'idle';
        P.interacted();
        if (!P.bubbleBusy()) P.showBubble(say('held'), { ms: 1500 });
      }
      if (down.dragging && e.buttons === 0) endPointer();
      return;
    }
    const hit = hitTest(e.clientX, e.clientY);
    setIgnore(!hit);
    document.body.style.cursor = hit ? 'grab' : 'default';
  });

  window.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    if (e.target.closest('.bubble, .pill')) return;
    if (!hitTest(e.clientX, e.clientY)) return;
    down = { sx: e.screenX, sy: e.screenY, cx: e.clientX, cy: e.clientY, dragging: false };
    document.body.style.cursor = 'grabbing';
  });

  function endPointer() {
    if (!down) return;
    const wasDrag = down.dragging;
    const wasAt = { x: down.cx, y: down.cy };
    down = null;
    document.body.style.cursor = 'grab';
    if (P.isAway()) {
      // the icon: dropped where it is, or a click opens the menu (call back, …)
      if (wasDrag) api.send('pet:drag-end', { away: true });
      else api.send('pet:menu');
      return;
    }
    if (wasDrag) {
      api.send('pet:drag-end');
      pet.held = false;
      pet.squash = 6;
      P.playAnim(['HitGround', 'Trip', 'Cringe']);
      if (!P.bubbleBusy()) P.showBubble(say('dropped'), { ms: 1500 });
    } else {
      pat(wasAt);
    }
  }
  window.addEventListener('mouseup', (e) => { if (e.button === 0) endPointer(); });
  window.addEventListener('blur', () => { if (down && down.dragging) endPointer(); });

  window.addEventListener('dblclick', (e) => {
    if (e.target.closest('.bubble')) return;
    const c = P.care();
    const needsCare = c.sick || c.hunger < 25 || c.clean < 25;
    api.send('panel:open', e.target.closest('.pill') ? 'focus' : needsCare ? 'care' : 'todos');
  });

  window.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    P.interacted();
    api.send('pet:menu');
  });

  pillEl.addEventListener('click', () => {
    if (P.isAway() && P.phase() === 'idle') api.send('pet:menu');
    else api.send('panel:open', 'focus');
  });
  bubbleEl.addEventListener('click', (e) => {
    if (e.target.closest('button')) return;
    P.hideBubble(false);
  });

  let lastPat = 0;
  // where it was poked: head (pats), belly (giggles), feet (ticklish); too many pokes and it's annoyed
  const pokes = [];
  function zoneAt(at) {
    if (!at) return 'head';
    const g = P.geometry();
    const k = (at.y - g.top) / Math.max(1, g.h);
    return k < 0.4 ? 'head' : k < 0.75 ? 'belly' : 'feet';
  }

  function pat(at) {
    const now = Date.now();
    const wasSleeping = pet.mode === 'sleep';
    P.interacted();
    if (wasSleeping) return;
    if (pet.peek) { api.send('pet:unpeek'); return; }   // come out from the screen edge
    if (now - lastPat < 250) return;
    lastPat = now;
    if (P.isFainted()) {
      P.showBubble(say('needFainted'), { priority: 2, actions: [P.careAction('revive', P.tr('item.revive')), P.laterAction()] });
      return;
    }
    pokes.push(now);
    while (pokes.length && now - pokes[0] > 3000) pokes.shift();
    if (pokes.length >= 6 && !P.isEgg()) {
      pokes.length = 0;
      P.playAnim(['Cringe', 'Shake', 'Pain']);
      P.sweat();
      if (!P.bubbleBusy()) P.showBubble(say('pokeTooMuch'), { ms: 2200 });
      return;
    }
    api.invoke('pet:pat');
    Sound.play('pat');
    const focus = P.phase() === 'focus';
    const zone = P.isEgg() ? 'head' : zoneAt(at);
    P.hearts(focus ? 1 : 2);
    if (focus) {
      P.happy(700);
      if (!P.bubbleBusy()) P.showBubble(say('petFocus', { time: P.fmt(P.timeLeft()) }), { ms: 2500 });
      return;
    }
    if (zone === 'belly') {
      if (!P.playAnim(['Hop', 'Pose'], { times: 2 })) P.jump(2, 0.6);
      if (!P.bubbleBusy() && Math.random() < 0.6) P.showBubble(say('pokeBelly'), { ms: 2000 });
      return;
    }
    if (zone === 'feet') {
      if (!P.playAnim(['Shake', 'Cringe', 'Hop'])) P.jump(1, 0.5);
      if (!P.bubbleBusy() && Math.random() < 0.6) P.showBubble(say('pokeFeet'), { ms: 2000 });
      return;
    }
    P.happy(700);
    P.jump(1, 0.7);
    if (!P.bubbleBusy() && Math.random() < 0.45) {
      P.showBubble(say(P.phase() === 'idle' ? 'pet' : 'petBreak', { cry: P.cry() }), { ms: 2200 });
    }
  }

  Object.assign(P, { reacting, typing, showTyping, updateLook });
})();
