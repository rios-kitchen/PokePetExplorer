/* PokePet Explorer – the pet window: events from the main process, the main loop and boot.
 * The rest lives in core.js (shared object), sprite.js, pose.js, effects.js, bubble.js,
 * behavior.js, render.js and interact.js. */
(() => {
  const P = window.Pet;
  const { api, Sound, pet, say, tr } = P;

  // ================================================================ events from main
  const NEED = {
    hungry: { line: 'needHungry', item: 'oran', btn: 'btn.feed' },
    dirty: { line: 'needDirty', item: 'bath', btn: 'btn.bath' },
    sick: { line: 'needSick' },
    pooped: { line: 'needPooped', item: 'bath', btn: 'btn.bath' },
    fainted: { line: 'needFainted', item: 'revive' }
  };

  /** Buttons for a sick pet: the right medicine once diagnosed, else a trip to the doctor. */
  function sickActions(item, diagnose) {
    if (item) return [P.careAction(item, tr(`item.${item}`)), P.laterAction()];
    if (diagnose) {
      return [{ label: tr('btn.diagnose', { n: P.state.diagnoseCost }), primary: true, run: () => api.send('pet:action', 'diagnose') },
        { label: tr('btn.openCare'), run: () => api.send('pet:action', 'open', 'care') }];
    }
    return [{ label: tr('btn.openCare'), primary: true, run: () => api.send('pet:action', 'open', 'care') }, P.laterAction()];
  }

  /** "+3 🍓 · +2 Tough · Antidote" – what an expedition brought back. */
  function loot(e) {
    const parts = [];
    if (e.berries) parts.push(`+${e.berries} 🍓`);
    if (e.xp) parts.push(`+${e.xp} XP`);
    for (const [a, v] of Object.entries(e.gain || {})) parts.push(`${tr(`attr.${a}`)} +${v}`);
    for (const it of e.items || []) parts.push(tr(`item.${it}`));
    return parts.join(' · ');
  }

  const handlers = {
    'focus-start'(e) {
      P.interacted();
      pet.mode = 'idle';
      Sound.play('focusStart');
      P.jump(1);
      P.showBubble(e.task ? say('focusStartTask', { task: e.task }) : say('focusStart'), { priority: 2, ms: 4000 });
    },
    'focus-end'(e) {
      P.interacted();
      Sound.play('focusEnd');
      P.stars(14);
      if (!P.playRandom(P.CELEBRATE, { times: 2 })) P.jump(3);
      P.happy(2500);
      if (e.berries) setTimeout(() => P.floatText(say('earned', { n: e.berries })), 600);
      if (e.smart) setTimeout(() => P.floatText(`📚 +${e.smart}`), 1400);
      P.showBubble(say('focusEnd', { min: e.min, n: e.n }), { priority: 2, ms: 5000 });
      if (e.taskId) {
        setTimeout(() => {
          P.showBubble(say('askTaskDone', { task: e.task }), {
            priority: 3,
            actions: [
              { label: tr('btn.yes'), primary: true, run: () => api.send('pet:action', 'todo-done', e.taskId) },
              { label: tr('btn.notYet'), run: () => {} }
            ]
          });
        }, 4500);
      }
    },
    'break-start'(e) {
      // after a finished focus session this waits until the victory jingle is over
      setTimeout(() => {
        Sound.play('breakStart');
        if (!P.bubbleBusy()) P.showBubble(say('breakStart'), { ms: 6000 });
      }, e.delay ?? 0);
    },
    'break-end'() {
      P.interacted();
      Sound.play('breakEnd');
      P.jump(2);
      P.showBubble(say('breakEnd'), {
        priority: 3,
        actions: [
          { label: tr('btn.start'), primary: true, run: () => api.send('pet:action', 'start-focus') },
          P.laterAction()
        ]
      });
    },
    paused() { P.showBubble(say('paused'), { ms: 2500 }); },
    stopped() { P.showBubble(say('stopped'), { ms: 2500 }); },
    'todo-added'(e) {
      P.interacted();
      Sound.play('blip');
      if (!P.playAnim(['Nod'])) P.jump(1, 0.6);
      if (!P.bubbleBusy()) P.showBubble(say('todoAdded', { task: e.task }), { ms: 3000 });
    },
    'todo-done'(e) {
      P.interacted();
      P.dropTreat('berry', () => P.floatText(say('earned', { n: P.state.reward ? P.state.reward.todo : 1 })));
      if (e.allDone) {
        setTimeout(() => { Sound.play('fanfare'); P.stars(16); P.jump(3); }, 900);
        P.showBubble(say('allDone'), { priority: 2, ms: 5000 });
      } else if (!P.bubbleBusy()) {
        P.showBubble(say('todoDone'), { ms: 3000 });
      }
    },
    reminder(e) {
      if (P.bubbleBusy() || P.isFainted()) return;
      if (pet.mode === 'sleep') P.wake(false);
      P.alert(70);
      P.jump(1, 0.7);
      P.showBubble(say('reminder', { n: e.n, task: e.task }), {
        priority: 2,
        ms: 20000,
        actions: [
          { label: `▶ ${tr('btn.start')}`, primary: true, run: () => api.send('pet:action', 'start-focus', e.taskId) },
          P.laterAction()
        ]
      });
    },
    due(e) {
      P.interacted();
      Sound.play('alarm');
      P.alert(90);
      P.jump(2);
      P.showBubble(say('due', { task: e.task }), {
        priority: 3,
        actions: [
          { label: tr('btn.done'), primary: true, run: () => api.send('pet:action', 'todo-done', e.taskId) },
          { label: tr('btn.open'), run: () => api.send('pet:action', 'open', 'todos') }
        ]
      });
    },
    'level-up'(e) {
      setTimeout(() => {
        if (!P.sprite || P.sprite.id !== e.petId) return;
        Sound.play('levelup');
        P.stars(18);
        if (!P.playAnim(['Charge', 'Shock', 'Special', 'Pose'], { times: 2 })) P.jump(2, 1.1);
        P.showBubble(say('levelUp', { level: e.level }), { priority: 2, ms: 4500 });
      }, 1600);
    },
    switch(e) {
      P.interacted();
      Sound.play('switch');
      setTimeout(() => {
        P.stars(10);
        P.jump(1);
        P.showBubble(say('switchIn', { name: e.name }), { ms: 3000 });
      }, 150);
    },
    async skin() {
      await P.loadSprite(P.state.settings.pokemon);
      P.stars(10);
      if (!P.playAnim(['Pose', 'Hop'])) P.jump(1);
    },

    // ---- care
    need(e) {
      const n = NEED[e.need];
      if (!n || P.bubbleBusy() || P.isAway()) return;
      if (pet.mode === 'sleep') P.wake(false);
      if (e.need === 'hungry') P.sweat();
      const actions = e.need === 'sick' ? sickActions(e.item, e.diagnose)
        : [P.careAction(e.item || n.item, n.btn ? tr(n.btn) : tr(`item.${e.item || n.item}`)), P.laterAction()];
      P.showBubble(say(n.line), { priority: 2, ms: 30000, actions });
    },
    'got-sick'() {
      Sound.play('alarm');
      P.playAnim(['Cringe', 'Pain']);
      P.sweat();
      P.showBubble(say('gotSick'), { priority: 2, ms: 30000, actions: sickActions(null, true) });
    },
    diagnosed(e) {
      const name = tr(`status.${e.status}`);
      P.showBubble(say('diagnosed', { status: name, stage: e.stage }), {
        priority: 2, ms: 30000, actions: [P.careAction(e.item, tr(`item.${e.item}`)), P.laterAction()]
      });
    },
    'status-worse'(e) {
      Sound.play('alarm');
      P.playAnim(['Pain', 'Cringe']);
      P.sweat();
      if (!P.bubbleBusy()) P.showBubble(say('statusWorse', { stage: e.stage }), { priority: 2, ms: 8000 });
    },
    care(e) {
      P.interacted();
      P.hideBubble(true);
      if (e.kind === 'bath') { P.bath(); return; }
      const glyph = { oran: 'berry', puff: 'puff', candy: 'candy' }[e.item] || (e.kind === 'food' ? 'berry' : 'pill');
      P.dropTreat(glyph, () => {
        if (e.wrong) {
          setTimeout(() => {
            P.playAnim(['Pain', 'Cringe']);
            P.sweat();
            P.showBubble(say(e.fainted ? 'needFainted' : 'wrongMedicine'), { priority: 2, ms: 5000 });
          }, 500);
        } else if (e.kind === 'med' || e.kind === 'revive') {
          setTimeout(() => { P.stars(10); P.showBubble(say(e.kind === 'revive' ? 'revived' : 'healed'), { ms: 3000 }); }, 500);
        } else {
          P.showBubble(say('eat'), { ms: 1800 });
        }
      });
    },

    // ---- growth
    async hatched(e) {
      await P.loadSprite(P.state.settings.pokemon);
      Sound.play('levelup');
      P.stars(20);
      P.jump(2);
      if (e.shiny) setTimeout(() => P.stars(24), 600);
      P.showBubble(say(e.shiny ? 'hatchedShiny' : 'hatched', { name: e.name }), { priority: 2, ms: 6000 });
    },
    'evolve-ready'(e) {
      if (P.isAway()) return;
      if (pet.mode === 'sleep') P.wake(false);
      P.stars(8);
      P.playAnim(['Charge', 'DeepBreath', 'Pose']);
      const names = e.options.map((o) => ({
        label: `✨ ${o.names[P.L()] || o.names.en}`, primary: true, run: () => api.send('pet:action', 'evolve', o.dex)
      }));
      P.showBubble(say('evolveReady', { name: e.name }), {
        priority: 3, ms: 120000,
        actions: [...names, { label: tr('btn.later'), run: () => api.send('pet:action', 'evolve-later') }]
      });
    },
    evolved(e) {
      Sound.play('fanfare');
      P.stars(24);
      setTimeout(() => P.stars(16), 500);
      if (!P.playAnim(['Pose', 'Hop'], { times: 2 })) P.jump(3);
      P.showBubble(say('evolved', { from: e.from, to: e.to }), { priority: 3, ms: 7000 });
    },
    'evolve-failed'(e) {
      P.showBubble(say(e.error === 'net' ? 'evolveOffline' : 'evolveNoSprite'), { priority: 2, ms: 5000 });
    },

    'ai-reply'(e) {
      if (P.isAway()) return;
      P.interacted();
      P.happy(900);
      P.showBubble(e.text, { priority: 2, ms: Math.min(20000, 4000 + e.text.length * 90), emotion: 'Happy' });
    },
    // ---- desktop play
    'fling-start'() {
      P.interacted();
      pet.flying = true;
      pet.mode = 'idle';
      P.hideBubble(true);
      Sound.play('switch');
    },
    'fling-bounce'() { P.stars(3); Sound.play('pat'); },
    'fling-end'(e) {
      pet.flying = false;
      pet.tilt = 0;
      P.dizzy();
      if (e.berry) setTimeout(() => P.floatText('+1 🍓'), 600);
      setTimeout(() => { if (!P.bubbleBusy()) P.showBubble(say('flung'), { ms: 2500 }); }, 900);
    },
    peek(e) {
      pet.peek = e.side;
      pet.mode = 'idle';
      pet.dir = e.side === 'left' ? 1 : -1;
      P.hideBubble(true);
    },
    unpeek(e) {
      pet.peek = null;
      P.jump(1, 0.8);
      if (e.talk && !P.bubbleBusy()) P.showBubble(say('unpeek'), { ms: 2000 });
    },
    holiday(e) {
      if (P.isAway()) return;
      Sound.play('fanfare');
      P.stars(14);
      if (!P.playAnim(['Pose', 'Hop'], { times: 2 })) P.jump(2);
      const text = e.holiday ? say(`holiday_${e.holiday}`) : e.anniv.years ? say('anniversaryYears', { n: e.anniv.years }) : say('anniversary100');
      P.showBubble(`${text}\n+${e.gift} 🍓`, { priority: 2, ms: 8000, emotion: 'Joyous' });
    },
    weather(e) {
      if (P.isAway()) return;
      // the 3-hourly forecast waits for a free moment instead of being dropped
      if (P.bubbleBusy()) { if (e.line.startsWith('forecast')) setTimeout(() => handlers.weather(e), 8000); return; }
      P.showBubble(say(e.line, e), { ms: e.line.startsWith('forecast') ? 9000 : 6000 });
    },
    encounter(e) {
      if (P.isAway()) return;
      P.playAnim(['Charge', 'Pose']);
      P.showBubble(say('encounter', e), {
        priority: 3, ms: 120000,
        actions: [{ label: tr('btn.battle'), primary: true, run: () => api.send('pet:action', 'battle-outing') },
          { label: tr('btn.waitEncounter', { min: e.min }), run: () => {} }]
      });
    },
    'encounter-gone'(e) {
      if (P.isAway()) return;
      P.showBubble(say('encounterGone', e), { ms: 6000, emotion: 'Sad' });
    },
    'sign-in-reminder'() {
      if (P.isAway() || P.bubbleBusy()) return;
      P.showBubble(say('signReminder'), {
        priority: 2, ms: 60000,
        actions: [
          { label: tr('today.signBtn'), primary: true, run: () => api.send('pet:action', 'signin') },
          P.laterAction()
        ]
      });
    },
    'signed-in'(e) {
      Sound.play('chime');
      P.stars(10);
      P.floatText(`+${e.berries} 🍓`);
      if (!P.isAway()) P.showBubble(say(e.item ? 'signedInBig' : 'signedIn', { n: e.streak }), { ms: 3500 });
    },
    'task-done'(e) {
      if (P.isAway() || P.bubbleBusy()) return;
      P.hearts(1);
      P.showBubble(say('taskDone', { task: tr(`task.${e.id}`) }), {
        priority: 2, ms: 8000,
        actions: [{ label: tr('btn.open'), primary: true, run: () => api.send('pet:action', 'open', 'today') }]
      });
    },
    starter(e) {
      P.stars(16);
      if (!P.playAnim(['Pose', 'Hop'])) P.jump(2);
      P.showBubble(say('starter', { name: e.name }), { priority: 2, ms: 6000 });
    },
    joined(e) {
      Sound.play('levelup');
      P.hearts(3);
      P.showBubble(say('joined', { name: e.name }), { ms: 4000 });
    },
    companion(e) {
      if (P.isAway()) return;
      P.stars(8);
      if (!P.playAnim(['Pose', 'Hop'])) P.jump(1);
      const answer = (keep) => api.invoke('join:answer', e.token, keep);
      P.showBubble(say('companion', { name: e.name }), {
        priority: 3, ms: 120000,
        actions: [
          { label: tr('join.keep'), primary: true, run: () => answer(true) },
          { label: tr('join.release'), run: () => answer(false) }
        ]
      });
    },
    'catch-good'(e) {
      if (P.isAway()) return;
      P.hearts(2);
      if (!P.playAnim(['Hop', 'Pose'])) P.jump(1);
      if (!P.bubbleBusy()) P.showBubble(say('catchGood', { n: e.n }), { ms: 2500 });
    },
    'types-good'(e) {
      if (P.isAway()) return;
      P.hearts(2);
      if (!P.playAnim(['Nod', 'Hop'])) P.jump(1);
      if (!P.bubbleBusy()) P.showBubble(say('typesGood', { n: e.n }), { ms: 2500 });
    },
    'whack-good'(e) {
      if (P.isAway()) return;
      P.hearts(2);
      if (!P.playAnim(['Hop', 'Pose'])) P.jump(1);
      if (!P.bubbleBusy()) P.showBubble(say('whackGood', { n: e.n }), { ms: 2500 });
    },
    'memory-done'(e) {
      if (P.isAway()) return;
      P.hearts(2);
      if (!P.playAnim(['Hop', 'Pose'])) P.jump(1);
      if (!P.bubbleBusy()) P.showBubble(say('memoryDone', { n: e.n }), { ms: 2500 });
    },
    'quiz-right'(e) {
      if (P.isAway()) return;
      P.hearts(1);
      if (!P.playAnim(['Hop', 'Nod'])) P.jump(1);
      if (!P.bubbleBusy()) P.showBubble(say('quizRight', { name: e.name }), { ms: 2500 });
    },
    'fish-caught'(e) {
      if (P.isAway()) return;
      P.hearts(2);
      if (!P.playAnim(['Pose', 'Hop'])) P.jump(1);
      if (!P.bubbleBusy()) P.showBubble(say(e.isNew ? 'fishNew' : 'fishBig', { name: e.name, cm: e.size }), { ms: 3500 });
    },
    achievement(e) {
      Sound.play('fanfare');
      P.stars(12);
      if (!P.bubbleBusy()) P.showBubble(say('achievement', { name: tr(`ach.${e.id}`), n: e.reward }), { ms: 4500 });
    },

    // ---- expeditions
    'expedition-start'(e) {
      P.hideBubble(true);
      Sound.play('switch');
      pet.mode = 'idle';
      P.showBubble(say(`expStart_${e.kind}`, { place: tr(`exp.${e.id}`) }), { priority: 2, ms: 2500 });
      setTimeout(() => { pet.fade = { from: 1, to: 0, start: Date.now(), ms: 1200 }; }, 1500);
    },
    'expedition-refused'(e) {
      P.showBubble(tr(`exp.blocked.${e.reason}`), { ms: 3000 });
      P.playAnim(['Cringe', 'Nod']);
    },
    'expedition-back'(e) {
      pet.fade = { from: 0, to: 1, start: Date.now(), ms: 900 };
      Sound.play('switch');
      P.interacted();
      if (e.recalled) { P.showBubble(say('expRecalled'), { ms: 3000 }); return; }
      setTimeout(() => {
        P.stars(12);
        if (e.status) { P.playAnim(['Pain', 'Cringe']); P.sweat(); } else if (!P.playAnim(['Pose', 'Hop'])) P.jump(2);
        const key = e.status ? 'expBackHurt' : e.kind === 'travel' ? 'expBackTravel' : e.kind === 'training' ? 'expBackTraining' : 'expBack';
        const text = say(key, { region: e.region ? tr(`region.${e.region}`) : '', status: e.status ? tr(`status.${e.status}`) : '' });
        P.showBubble(`${text}\n${loot(e)}`, { priority: 2, ms: 9000 });
      }, 900);
      // a photo together at the place it came back from (random pose and expression)
      setTimeout(async () => {
        const res = await P.takePhoto(e).catch(() => null);
        if (res && res.ok) { Sound.play('blip'); P.floatText('📸'); }
      }, 2500);
    },
    'poop-start'() {
      if (pet.mode === 'sleep') P.wake(false);
      pet.mode = 'idle';
      pet.pooping = true;
      Sound.play('poop');
      P.showBubble(say('poopStart'), { priority: 2, ms: 1800 });
      setTimeout(() => { pet.pooping = false; }, 1800);
    },
    'poop-done'() {
      P.playAnim(['Cringe', 'Hop']);
      // walk away from the mess a little
      if (P.state.settings.walk) {
        pet.mode = 'walk';
        pet.dir = Math.random() < 0.5 ? -1 : 1;
        pet.modeUntil = Date.now() + 1500;
      }
      setTimeout(() => {
        P.showBubble(say('poopDone'), { priority: 2, ms: 30000, actions: [P.careAction('bath', tr('btn.bath')), P.laterAction()] });
      }, 300);
    },
    'poop-cleaned'() {
      P.hearts(2);
      P.happy(1200);
      if (!P.bubbleBusy()) P.showBubble(say('poopCleaned'), { ms: 2500 });
    },
    'care-refused'(e) {
      const key = { full: 'refusedFull', clean: 'refusedClean', healthy: 'refusedHealthy', berries: 'refusedBerries', fainted: 'refusedFainted', notFainted: 'refusedHealthy' }[e.reason];
      if (key) P.showBubble(say(key), { ms: 2500 });
      P.playAnim(['Cringe', 'Nod']);
    },
    'daily-berries'(e) {
      if (P.bubbleBusy()) return;
      P.jump(1);
      P.floatText(say('earned', { n: e.n }));
      P.showBubble(say('dailyBerries', { n: e.n }), { ms: 3500 });
    },
    weekly(e) {
      if (pet.mode === 'sleep') P.wake(false);
      if (e.verdict === 'happy') { P.hearts(4); P.jump(2); } else if (e.verdict === 'sad') {
        P.playAnim(['Cringe', 'Sink', 'Pain']);
        P.sweat();
      }
      P.showBubble(say(`weekly_${e.verdict}`), {
        priority: 3,
        actions: [
          { label: `📖 ${tr('btn.diary')}`, primary: true, run: () => api.send('pet:action', 'open', 'diary-last') },
          P.laterAction()
        ]
      });
    }
  };

  api.on('pet:event', (e) => {
    const fn = handlers[e.type];
    if (fn && P.sprite) fn(e);
  });

  api.on('state', async (s) => {
    const prev = P.state;
    P.state = s;
    Sound.setEnabled(s.settings.sound);
    const id = s.settings.pokemon;
    const stageOf = (st) => st && st.pets[id] && st.pets[id].stage;
    if (!prev || prev.settings.pokemon !== id || stageOf(prev) !== stageOf(s)) await P.loadSprite(id);
    else if (prev.settings.scale !== s.settings.scale) P.updateUnit();
    if (prev && prev.settings.lang !== s.settings.lang) P.hideBubble(true);
    if (s.timer.phase === 'focus' && pet.mode === 'walk') pet.mode = 'idle';
    P.layoutOverlays();
  });

  // ================================================================ main loop & boot
  function loop() {
    const t = Date.now();
    if (P.state && P.sprite) {
      P.decide(t);
      P.walkStep();
      P.physics(t);
      P.draw(t);
      P.updatePill();
    }
    requestAnimationFrame(loop);
  }

  (async () => {
    P.resize();
    P.state = await api.invoke('state:get');
    Sound.setEnabled(P.state.settings.sound);
    await P.loadSprite(P.state.settings.pokemon);
    requestAnimationFrame(loop);
    setTimeout(() => {
      P.jump(1);
      P.showBubble(say('greet', { cry: P.cry() }), { ms: 3500 });
    }, 700);
  })();
})();
