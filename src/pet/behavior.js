/* PokePet Explorer – pet window: behaviour (deciding what to do, walking, jumping, sleeping, eating, bathing). */
(() => {
  const P = window.Pet;
  const { api, Sound, pet, input, rand, say } = P;

  function interacted() {
    pet.lastInteract = Date.now();
    if (pet.mode === 'sleep') wake(false);
  }

  function jump(times = 1, power = 1) {
    if (pet.held || P.isFainted()) return;
    if (P.sprite && P.sprite.kind === 'pmd') {
      if (P.playAnim(['Hop', 'Pose'], { times })) return;
    }
    pet.jumpsLeft = Math.max(pet.jumpsLeft, times);
    if (pet.lift === 0) startJump(power);
  }

  function startJump(power = 1) {
    pet.vy = -(2.2 + P.fx() * 0.55) * power;
    pet.jumpsLeft -= 1;
  }

  function happy(ms = 1200) { pet.happyUntil = Date.now() + ms; }

  function sleep(byAway = false) {
    pet.mode = 'sleep';
    pet.sleptByAway = byAway;
    pet.nextZ = 0;
    P.hideBubble(true);
    Sound.play('sleep');
  }

  function wake(talk = true) {
    if (pet.mode !== 'sleep') return;
    pet.mode = 'idle';
    pet.nextDecision = Date.now() + 1500;
    if (!P.playAnim(['Wake'])) jump(1, 0.7);
    if (talk) P.showBubble(say('wake', { cry: P.cry() }));
  }

  /** A dropped treat reached the pet's mouth. */
  function chomp(after) {
    pet.eating = null;
    pet.eatUntil = Date.now() + 1400;
    Sound.play('eat');
    happy(1500);
    if (P.sprite.kind === 'pmd') P.playAnim(['Eat'], { minMs: 1400 }); else jump(2, 0.6);
    P.hearts(2);
    if (after) after();
  }

  function bath() {
    pet.bathUntil = Date.now() + 3600;
    Sound.play('bath');
    const g = P.geometry();
    for (let i = 0; i < 16; i++) {
      setTimeout(() => P.spawn('bubble', {
        x: g.cx + rand(-g.w / 2, g.w / 2), y: g.bottom - rand(0, g.h * 0.6),
        vx: rand(-0.2, 0.2), vy: -rand(0.4, 1), life: 70, size: Math.max(2, P.fx() - 1)
      }), i * 180);
    }
    setTimeout(() => {
      P.stars(10);
      jump(1);
      P.showBubble(say('bathDone'), { ms: 2500 });
    }, 3600);
  }

  function dizzy() {
    pet.dizzyUntil = Date.now() + 1800;
    P.playAnim(['Tumble', 'TumbleBack', 'LostBalance'], { minMs: 1800 });
    P.stars(6);
    if (!P.bubbleBusy()) P.showBubble(say('dizzy'), { ms: 2000 });
  }

  function decide(now) {
    if (P.isAway() || pet.flying) return;
    if (pet.peek) {
      // peeking from the screen edge: just look out now and then
      pet.mode = 'idle';
      pet.dir = pet.peek === 'left' ? 1 : -1;
      if (now > pet.nextDecision) { pet.nextDecision = now + rand(4000, 9000); P.playAnim(['LookUp', 'Nod']); }
      return;
    }
    if (P.isEgg()) {
      // an egg just sits there and wobbles now and then
      pet.mode = 'idle';
      if (now > pet.nextDecision) {
        pet.nextDecision = now + rand(4000, 11000);
        pet.wobbleUntil = now + 900;
      }
      return;
    }
    if (pet.held || pet.lift !== 0 || pet.eating || pet.pooping || now < pet.bathUntil) return;
    const ph = P.phase();
    if (P.isFainted()) { pet.mode = 'idle'; return; }

    const away = P.reacting() ? input.idle >= P.AWAY_AFTER : now - pet.lastInteract > P.SLEEP_AFTER;
    if (pet.mode !== 'sleep' && ph === 'idle' && !P.bubbleBusy() && away) {
      sleep(P.reacting());
      return;
    }
    if (pet.mode === 'sleep') return;

    if (pet.mode === 'walk' && now > pet.modeUntil) {
      pet.mode = 'idle';
      pet.nextDecision = now + rand(2500, 6000);
    }

    if (now < pet.nextDecision) return;
    pet.nextDecision = now + rand(3000, 7000);

    if (P.typing(now)) return;   // sits down and types along
    if (ph === 'focus') {
      if (Math.random() < 0.25) pet.dir = -pet.dir;
      else if (Math.random() < 0.12) P.playRandom(['Charge', 'DeepBreath', 'Nod']);
      return;
    }

    // now and then: one of the Pokémon's other animations, just for fun
    if (P.sprite.kind === 'pmd' && !P.isSick() && now > (pet.nextFun || 0)) {
      pet.nextFun = now + rand(15e3, 45e3);
      if (Math.random() < 0.6 && P.playRandom(P.funAnims())) return;
    }

    const sick = P.isSick();
    const walkChance = sick ? 0.1 : ph === 'idle' ? 0.45 : 0.65;   // playful in breaks, slow when sick
    if (P.state.settings.walk && Math.random() < walkChance) {
      pet.mode = 'walk';
      pet.dir = Math.random() < 0.5 ? -1 : 1;
      pet.modeUntil = now + rand(2000, 6000);
      if (ph !== 'idle' && P.reacting() && now - input.lastMove < 3000 && Math.abs(input.x - P.W / 2) > 60) {
        pet.dir = input.x > P.W / 2 ? 1 : -1;
        if (now > input.nextChase && !P.bubbleBusy()) {
          input.nextChase = now + 3 * 60e3;
          P.showBubble(say('chase'), { ms: 1800 });
        }
      }
    } else if (Math.random() < 0.3) {
      pet.dir = -pet.dir;
    } else if (ph !== 'idle' && !sick && Math.random() < 0.3) {
      jump(1, 0.6);
    }

    if (now > pet.nextChatter && ph === 'idle' && !P.bubbleBusy() && !sick) {
      pet.nextChatter = now + rand(3, 7) * 60e3;
      P.showBubble(say('idle', { cry: P.cry() }));
    }

    if (P.state.mood < 30 && now > pet.nextLonely && !P.bubbleBusy()) {
      pet.nextLonely = now + 4 * 60e3;
      P.sweat();
      P.showBubble(say('lonely'));
    }
  }

  function walkStep() {
    if (P.bubbleBusy() || P.isAway() || P.isEgg() || pet.peek || pet.flying) return;   // stand still while asking something
    const walkOn = P.state.settings.walk;
    if (pet.mode !== 'walk' || pet.held || !walkOn || P.phase() === 'focus' || P.isFainted()) {
      if (pet.mode === 'walk' && (P.phase() === 'focus' || !walkOn || P.isFainted())) pet.mode = 'idle';
      return;
    }
    pet.walkAcc += pet.dir * Math.max(0.8, P.fx() * (P.isSick() ? 0.15 : 0.35));
    if (pet.moving || Math.abs(pet.walkAcc) < 1) return;
    const dx = Math.trunc(pet.walkAcc);
    pet.walkAcc -= dx;
    pet.moving = true;
    api.invoke('pet:move-by', dx).then((blocked) => {
      pet.moving = false;
      if (blocked) { pet.dir = blocked === 'left' ? 1 : -1; pet.walkAcc = 0; }
    }, () => { pet.moving = false; });
  }

  function physics(now) {
    if (pet.vy !== 0 || pet.lift > 0) {
      pet.vy += 0.42;
      pet.lift -= pet.vy;
      if (pet.lift <= 0) {
        pet.lift = 0;
        pet.vy = 0;
        pet.squash = 6;
        if (pet.jumpsLeft > 0) setTimeout(() => { if (pet.lift === 0) startJump(0.85); }, 90);
      }
    }
    if (pet.squash > 0) pet.squash--;

    pet.tilt = pet.flying ? pet.tilt + 0.35
      : pet.held ? Math.sin(now / 90) * 0.12
      : now < pet.dizzyUntil ? Math.sin(now / 65) * 0.2
        : now < pet.bathUntil ? Math.sin(now / 120) * 0.08
          : now < (pet.wobbleUntil || 0) ? Math.sin(now / 70) * 0.18
            : pet.tilt * 0.8;
    P.updateLook(now);

    if (now > pet.nextBlink) {
      pet.blinkUntil = now + 140;
      pet.nextBlink = now + rand(2500, 6000);
    }

    P.ambient(now);
    P.updateParticles();
  }

  Object.assign(P, { interacted, jump, happy, sleep, wake, chomp, bath, dizzy, decide, walkStep, physics });
})();
