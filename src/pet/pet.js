/* PokePet Plus – the pet window: events from the main process, the main loop and boot.
 * The rest lives in core.js (shared object), sprite.js, pose.js, effects.js, bubble.js,
 * behavior.js, render.js and interact.js. */
(() => {
  const P = window.Pet;
  const { api, Sound, pet, say, tr } = P;

  // ================================================================ events from main
  const NEED = {
    hungry: { line: 'needHungry', item: 'oran', btn: 'btn.feed' },
    dirty: { line: 'needDirty', item: 'bath', btn: 'btn.bath' },
    sick: { line: 'needSick', item: 'potion', btn: 'btn.potion' },
    pooped: { line: 'needPooped', item: 'bath', btn: 'btn.bath' },
    fainted: { line: 'needFainted', item: 'potion', btn: 'btn.potion' }
  };

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
      if (!n || P.bubbleBusy()) return;
      if (pet.mode === 'sleep') P.wake(false);
      if (e.need === 'hungry') P.sweat();
      P.showBubble(say(n.line), { priority: 2, ms: 30000, actions: [P.careAction(n.item, tr(n.btn)), P.laterAction()] });
    },
    'got-sick'() {
      Sound.play('alarm');
      P.playAnim(['Cringe', 'Pain']);
      P.sweat();
      P.showBubble(say('gotSick'), { priority: 2, ms: 30000, actions: [P.careAction('potion', tr('btn.potion')), P.laterAction()] });
    },
    care(e) {
      P.interacted();
      P.hideBubble(true);
      if (e.kind === 'bath') { P.bath(); return; }
      const glyph = { oran: 'berry', puff: 'puff', candy: 'candy', potion: 'pill' }[e.item] || 'berry';
      P.dropTreat(glyph, () => {
        if (e.kind === 'med') {
          setTimeout(() => { P.stars(10); P.showBubble(say('healed'), { ms: 3000 }); }, 500);
        } else {
          P.showBubble(say('eat'), { ms: 1800 });
        }
      });
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
      const key = { full: 'refusedFull', clean: 'refusedClean', healthy: 'refusedHealthy', berries: 'refusedBerries', fainted: 'refusedFainted' }[e.reason];
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
    if (!prev || prev.settings.pokemon !== s.settings.pokemon) await P.loadSprite(s.settings.pokemon);
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
