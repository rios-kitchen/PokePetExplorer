/* PokePet Plus – pet window: drawing the pet, its shadow, overlays and particles. */
(() => {
  const P = window.Pet;
  const { canvas, ctx, pet, GLYPH } = P;

  function resize() {
    P.DPR = window.devicePixelRatio || 1;
    P.W = window.innerWidth; P.H = window.innerHeight;
    canvas.width = Math.round(P.W * P.DPR);
    canvas.height = Math.round(P.H * P.DPR);
    ctx.setTransform(P.DPR, 0, 0, P.DPR, 0, 0);
    ctx.imageSmoothingEnabled = false;
    P.layoutOverlays();
  }
  window.addEventListener('resize', resize);

  // the sprite is rendered into a work canvas first, so sickness tint and dirt only touch the pet
  const work = document.createElement('canvas');
  const wctx = work.getContext('2d');
  const DIRT = [[0.3, 0.55], [0.62, 0.7], [0.45, 0.82], [0.7, 0.42], [0.25, 0.75], [0.55, 0.35]];

  function renderPet(cur, dw, dh) {
    const DPR = P.DPR;
    work.width = Math.max(1, Math.round(dw * DPR));
    work.height = Math.max(1, Math.round(dh * DPR));
    wctx.imageSmoothingEnabled = false;
    wctx.drawImage(cur.img, 0, 0, work.width, work.height);
    const c = P.care();
    wctx.globalCompositeOperation = 'source-atop';
    if (c.sick) {
      wctx.fillStyle = 'rgba(120, 190, 110, 0.28)';
      wctx.fillRect(0, 0, work.width, work.height);
    }
    if (c.clean < 40) {
      const n = Math.min(DIRT.length, Math.ceil((40 - c.clean) / 7));
      const r = Math.max(2, P.fx() * DPR * 0.9);
      wctx.fillStyle = 'rgba(110, 80, 40, 0.75)';
      for (let i = 0; i < n; i++) {
        const [px, py] = DIRT[i];
        wctx.fillRect(Math.round(work.width * px), Math.round(work.height * py), Math.round(r * 2), Math.round(r * 1.5));
        wctx.fillRect(Math.round(work.width * px + r), Math.round(work.height * py - r), Math.round(r), Math.round(r));
      }
    }
    wctx.globalCompositeOperation = 'source-over';
    return work;
  }

  /** 0…1 – the pet fades out when it leaves on an expedition and in when it comes back. */
  function petAlpha(now) {
    const f = pet.fade;
    if (f) {
      const k = Math.min(1, (now - f.start) / f.ms);
      if (k >= 1) pet.fade = null;
      return f.from + (f.to - f.from) * k;
    }
    return P.isAway() ? 0 : 1;
  }

  function draw(now) {
    const sprite = P.sprite;
    ctx.clearRect(0, 0, P.W, P.H);
    if (!sprite) return;
    const alpha = petAlpha(now);
    if (alpha <= 0) { P.drawParticles(ctx); return; }
    ctx.globalAlpha = alpha;
    const g = P.geometry();
    const fu = P.fx();
    const cur = P.currentImage(now);
    const u = sprite.unit;
    const pmd = sprite.kind === 'pmd';
    const isTyping = P.showTyping(now);

    // shadow
    const restBottom = P.H - P.GROUND_PAD;
    const shrink = Math.max(0.4, 1 - pet.lift / 120);
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath();
    ctx.ellipse(g.cx, restBottom - 1, (g.w * 0.36) * shrink, Math.max(2, fu * 1.3) * shrink, 0, 0, Math.PI * 2);
    ctx.fill();

    // the built-in pixel art has no animations: fake them with bobbing, squashing and tilting
    let bob = 0;
    if (!pmd) {
      if (pet.mode === 'walk' && pet.lift === 0) bob = Math.abs(Math.sin(now / 110)) * fu * 1.5;
      else if (pet.mode === 'sleep') bob = Math.sin(now / 900) > 0 ? fu : 0;
      else if (isTyping) bob = (Math.floor(now / 110) % 2) * fu * 0.6;
      else if (pet.lift === 0) bob = Math.sin(now / 600) > 0.7 ? fu * 0.5 : 0;
    }

    const squash = (pet.squash > 0 || pet.pooping) && !pmd ? fu : 0;
    const dw = cur.w * u + squash * 2;
    const dh = cur.h * u - squash;
    const img = renderPet(cur, dw, dh);
    ctx.save();
    if (P.isFainted() && !pmd) {
      // lying on its side
      ctx.translate(g.cx, restBottom - dw / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.drawImage(img, Math.round(-dw / 2), Math.round(-dh / 2), Math.round(dw), Math.round(dh));
    } else {
      const ox = cur.cx != null ? cur.cx * u : dw / 2;
      // PMD: place the frame so its anchor sits groundOff above the floor (keeps hops/falls intact)
      const oy = cur.cy != null ? (cur.cy + sprite.groundOff) * u : dh;
      ctx.translate(g.cx, g.bottom - bob);
      if (pet.tilt && !pmd) ctx.rotate(pet.tilt);
      ctx.drawImage(img, Math.round(-ox - squash), Math.round(-oy), Math.round(dw), Math.round(dh));
    }
    ctx.restore();

    if (isTyping) {
      const kb = Math.floor(now / 110) % 2 ? GLYPH.kbd : GLYPH.kbd2;
      const s = Math.max(2, fu);
      ctx.drawImage(kb, Math.round(g.cx - (kb.width * s) / 2), Math.round(restBottom - kb.height * s + s * 2), kb.width * s, kb.height * s);
    }

    if (P.phase() === 'focus' && pet.mode !== 'sleep') {
      const t = GLYPH.tomato, s = Math.max(2, fu - 1);
      ctx.drawImage(t, Math.round(g.left - t.width * s * 0.2), Math.round(g.bottom - t.height * s), t.width * s, t.height * s);
    }

    ctx.globalAlpha = 1;
    P.drawParticles(ctx);
  }

  Object.assign(P, { resize, draw });
})();
