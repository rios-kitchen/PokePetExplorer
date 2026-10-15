/* PokePet Plus – pet window: particles (hearts, stars, z's, sweat, flies, falling treats …). */
(() => {
  const P = window.Pet;
  const { pet, rand } = P;

  const particles = [];

  function spawn(type, opts = {}) {
    const g = P.geometry();
    const p = {
      type,
      x: opts.x ?? g.cx + rand(-12, 12),
      y: opts.y ?? g.top + 4,
      vx: opts.vx ?? rand(-0.3, 0.3),
      vy: opts.vy ?? -rand(0.5, 0.9),
      g: opts.g ?? 0,
      life: opts.life ?? 70,
      age: 0,
      size: opts.size ?? Math.max(2, P.fx() - 1),
      text: opts.text,
      orbit: opts.orbit,
      onEnd: opts.onEnd
    };
    particles.push(p);
    return p;
  }

  function hearts(n = 3) {
    for (let i = 0; i < n; i++) setTimeout(() => spawn('heart', { life: 60 }), i * 120);
  }

  function stars(n = 10) {
    const g = P.geometry();
    for (let i = 0; i < n; i++) {
      const a = (Math.PI * 2 * i) / n + rand(-0.2, 0.2);
      const sp = rand(1.6, 2.8);
      spawn(i % 3 ? 'star' : 'spark', {
        x: g.cx, y: g.top + 10, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 1.2, g: 0.06, life: 55
      });
    }
  }

  function sweat() {
    const g = P.geometry();
    spawn('sweat', { x: g.cx + g.w * 0.3, vy: 0.3, g: 0.02, life: 60 });
  }

  function alert(life) {
    const g = P.geometry();
    spawn('alert', { x: g.cx + g.w * 0.35, vx: 0, vy: -0.15, life });
  }

  function floatText(text) {
    const g = P.geometry();
    spawn('text', { text, x: g.cx + g.w * 0.3, y: g.top, vx: 0, vy: -0.6, life: 70 });
  }

  /** Drop a treat from the sky into the pet's mouth, then run `done`. */
  function dropTreat(glyph, done) {
    const g = P.geometry();
    const p = spawn(glyph, { x: g.cx + rand(-6, 6), y: -10, vx: 0, vy: 1.2, g: 0.15, life: 400, size: Math.max(2, P.fx() - 1) });
    p.target = () => { const gg = P.geometry(); return gg.top + (gg.bottom - gg.top) * 0.45; };
    p.onHit = done;
    pet.eating = p;
  }

  /** Effects that come from the pet's condition: z's while asleep, sweat when sick, stink, flies. */
  function ambient(now) {
    const g = P.geometry();
    const care = P.care();
    if (pet.mode === 'sleep' && now > (pet.nextZ || 0)) {
      pet.nextZ = now + 1400;
      spawn('z', { x: g.cx + g.w * 0.25, y: g.top + 6, vx: 0.25, vy: -0.4, life: 90 });
    }
    if (care.sick && now > pet.nextSweat) {
      pet.nextSweat = now + rand(2500, 4500);
      if (Math.random() < 0.25 && !pet.action) P.playAnim(['Pain', 'Cringe']);
      spawn('sweat', { x: g.cx + g.w * rand(0.15, 0.35) * (Math.random() < 0.5 ? -1 : 1), y: g.top + g.h * 0.2, vx: 0, vy: 0.4, g: 0.03, life: 50 });
    }
    if (care.pooped && now > (pet.nextStink || 0)) {
      pet.nextStink = now + rand(1200, 2200);
      spawn('stink', { x: g.cx + rand(-g.w * 0.3, g.w * 0.3), y: g.top + g.h * 0.3, vx: 0, vy: -0.35, life: 60 });
    }
    if (care.clean < 30 && now > pet.nextFly && !particles.some((p) => p.type === 'fly')) {
      pet.nextFly = now + rand(4000, 9000);
      spawn('fly', { x: g.cx, y: g.top, vx: 0, vy: 0, life: 260, orbit: { r: g.w * 0.45, speed: 0.09, phase: rand(0, 6) } });
    }
  }

  function updateParticles() {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.age++;
      if (p.orbit) {
        const g = P.geometry();
        const a = p.orbit.phase + p.age * p.orbit.speed;
        p.x = g.cx + Math.cos(a) * p.orbit.r;
        p.y = g.top + g.h * 0.3 + Math.sin(a * 1.7) * p.orbit.r * 0.4;
      } else {
        p.vy += p.g;
        p.x += p.vx + (p.type === 'heart' || p.type === 'z' || p.type === 'bubble' ? Math.sin(p.age / 8) * 0.3 : 0);
        p.y += p.vy;
      }
      if (p.target && p.y >= p.target()) {
        p.age = p.life;
        P.chomp(p.onHit);
      }
      if (p.age >= p.life) {
        particles.splice(i, 1);
        if (p.onEnd) p.onEnd();
      }
    }
  }

  function drawParticles(ctx) {
    for (const p of particles) {
      const fade = p.target ? 1 : Math.min(1, (p.life - p.age) / 20);
      ctx.globalAlpha = Math.max(0, fade);
      if (p.type === 'text') {
        ctx.font = '700 13px -apple-system, "Segoe UI", sans-serif';
        ctx.textAlign = 'center';
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(255,255,255,0.9)';
        ctx.strokeText(p.text, p.x, p.y);
        ctx.fillStyle = '#c0392b';
        ctx.fillText(p.text, p.x, p.y);
        continue;
      }
      const gl = P.GLYPH[p.type];
      if (!gl) continue;
      const s = p.size;
      ctx.drawImage(gl, Math.round(p.x - (gl.width * s) / 2), Math.round(p.y - (gl.height * s) / 2), gl.width * s, gl.height * s);
    }
    ctx.globalAlpha = 1;
  }

  Object.assign(P, { spawn, hearts, stars, sweat, alert, floatText, dropTreat, ambient, updateParticles, drawParticles });
})();
