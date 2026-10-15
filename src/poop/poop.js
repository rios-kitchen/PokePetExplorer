/* A dropping on the screen. Flies buzz around it; a click cleans it up. */
(() => {
  const SP = window.PokeSprites;
  const q = new URLSearchParams(location.search);
  const id = q.get('id');
  const canvas = document.getElementById('c');
  const ctx = canvas.getContext('2d');
  document.title = window.PokeI18N.t(q.get('lang') || 'en', 'poop.tip');
  canvas.title = document.title;

  const glyph = (name) => {
    const img = SP.glyphRgba(name);
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    c.getContext('2d').putImageData(new ImageData(img.data, img.width, img.height), 0, 0);
    return c;
  };
  const poop = glyph('poop'), fly = glyph('fly'), stink = glyph('stink'), spark = glyph('spark');

  let W = 0, H = 0, cleaning = 0;
  function resize() {
    const dpr = window.devicePixelRatio || 1;
    W = innerWidth; H = innerHeight;
    canvas.width = W * dpr; canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
  }
  addEventListener('resize', resize);
  resize();

  function frame(now) {
    ctx.clearRect(0, 0, W, H);
    const s = 3;
    const pw = poop.width * s, ph = poop.height * s;
    const px = Math.round((W - pw) / 2), py = H - ph - 2;
    if (cleaning) {
      const t = (now - cleaning) / 400;
      ctx.globalAlpha = Math.max(0, 1 - t);
      ctx.drawImage(poop, px, py + t * 10, pw, ph * (1 - t * 0.5));
      ctx.globalAlpha = 1;
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        ctx.drawImage(spark, W / 2 + Math.cos(a) * t * 24, py + ph / 2 + Math.sin(a) * t * 18, 6, 6);
      }
      if (t >= 1) { window.api.send('poop:clean', id); return; }
    } else {
      ctx.drawImage(poop, px, py, pw, ph);
      // stink lines and two flies
      const wob = Math.sin(now / 300) * 2;
      ctx.globalAlpha = 0.7;
      ctx.drawImage(stink, px + 4 + wob, py - 14, 4, 8);
      ctx.drawImage(stink, px + pw - 8 - wob, py - 16, 4, 8);
      ctx.globalAlpha = 1;
      for (let i = 0; i < 2; i++) {
        const a = now / (260 + i * 90) + i * 3;
        ctx.drawImage(fly, W / 2 + Math.cos(a) * 22 - 4, py - 4 + Math.sin(a * 1.6) * 10, 9, 6);
      }
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  canvas.addEventListener('click', () => { if (!cleaning) cleaning = performance.now(); });
})();
