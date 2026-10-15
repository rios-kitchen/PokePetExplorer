/* PokePet Explorer – pet window: the map thumbnail while the pet is away, and the photo it brings home
 * (the place's pixel scene, the Pokémon in a random pose and a random portrait expression). */
(() => {
  const P = window.Pet;
  const { api } = P;
  const Maps = window.PokeMaps;

  const sceneCache = {};
  /** The pixel scene of an expedition (or a travel region) as a canvas. */
  function scene(expId, region) {
    const k = `${expId}|${region || ''}`;
    if (!sceneCache[k]) {
      const img = Maps.sceneRgba(expId, { region });
      const c = document.createElement('canvas');
      c.width = img.width; c.height = img.height;
      c.getContext('2d').putImageData(new ImageData(img.data, img.width, img.height), 0, 0);
      sceneCache[k] = c;
    }
    return sceneCache[k];
  }

  /** While away: a little framed map where the pet stands, with a blinking pin. */
  function drawAwayMap(ctx, now) {
    const e = P.state && P.state.expedition;
    if (!e) return;
    const sc = scene(e.id);
    const room = Math.min(P.W - 8, (P.H - P.GROUND_PAD) * 1.6);
    const s = Math.max(1, Math.min(2, Math.floor(room / sc.width)));
    const w = sc.width * s, h = sc.height * s;
    const x = Math.round((P.W - w) / 2), y = P.H - P.GROUND_PAD - h;
    ctx.fillStyle = '#2a2a2a';
    ctx.fillRect(x - 3, y - 3, w + 6, h + 6);
    ctx.fillStyle = '#fbf8f0';
    ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
    ctx.drawImage(sc, x, y, w, h);
    // the pin moves slowly across the map as the expedition goes on
    const k = Math.min(1, (Date.now() - e.startAt) / (e.endsAt - e.startAt));
    const px = x + Math.round(w * (0.15 + 0.7 * k)), py = y + Math.round(h * 0.7);
    if (Math.floor(now / 500) % 2) {
      ctx.fillStyle = '#e2463b';
      ctx.fillRect(px - s, py - 4 * s, 3 * s, 3 * s);
      ctx.fillRect(px, py - s, s, 2 * s);
    }
  }

  const EMOTIONS = ['Happy', 'Joyous', 'Normal', 'Surprised', 'Determined', 'Inspired', 'Teary-Eyed', 'Worried', 'Sigh', 'Special0'];
  const LIVELY = (n) => !['Sleep', 'EventSleep', 'Faint', 'Laying'].includes(n);
  const pick = (list) => list[Math.floor(Math.random() * list.length)];

  function loadImage(url) {
    return new Promise((res) => {
      const img = new Image();
      img.onload = () => res(img);
      img.onerror = () => res(null);
      img.src = url;
    });
  }

  /** The pet in a random pose: { img, w, h, cx, cy } (cx/cy: PMD anchor). */
  function randomPose() {
    const sp = P.sprite;
    if (sp.kind !== 'pmd') {
      const v = sp.img.open;
      return { img: v.n, w: sp.w, h: sp.h, cx: sp.w / 2, cy: sp.h, ground: 0 };
    }
    const names = Object.keys(sp.anims).filter(LIVELY);
    const a = sp.anims[pick(names.length ? names : Object.keys(sp.anims))];
    const frames = a.dirs[0];
    return { img: frames[Math.floor(Math.random() * frames.length)], w: a.w, h: a.h, cx: a.cx, cy: a.cy, ground: sp.groundOff };
  }

  /** Take the group photo at the place the pet came back from and save it to the album. */
  async function takePhoto(e) {
    if (!P.sprite || e.recalled) return null;
    const S = 3, PAD = 8, CAP = 24;
    const sc = scene(e.id, e.region);
    const W = sc.width * S, H = sc.height * S;
    const c = document.createElement('canvas');
    c.width = W + PAD * 2; c.height = H + PAD + CAP;
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.fillStyle = '#fbf8f0';
    g.fillRect(0, 0, c.width, c.height);
    g.drawImage(sc, PAD, PAD, W, H);

    // the Pokémon, standing on the ground of the scene
    const pose = randomPose();
    const u = Math.max(2, Math.min(4, Math.floor((H * 0.55) / pose.h)));
    const groundY = PAD + Math.round(H * 0.86);
    const flip = Math.random() < 0.5;
    g.save();
    g.translate(PAD + W * (0.35 + Math.random() * 0.3), groundY);
    if (flip) g.scale(-1, 1);
    g.drawImage(pose.img, Math.round(-pose.cx * u), Math.round(-(pose.cy + pose.ground) * u), pose.w * u, pose.h * u);
    g.restore();

    // a sticker of its face, with a random expression
    const url = await P.portrait(pick(EMOTIONS));
    const face = url && await loadImage(url);
    if (face) {
      const fs = 52, fx = PAD + W - fs - 8, fy = PAD + 8;
      g.fillStyle = '#ffffff';
      g.fillRect(fx - 3, fy - 3, fs + 6, fs + 6);
      g.drawImage(face, fx, fy, fs, fs);
    }

    // caption: place and date
    const place = e.region ? P.tr(`region.${e.region}`) : P.tr(`exp.${e.id}`);
    g.fillStyle = '#3a3630';
    g.font = '600 12px -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif';
    g.textBaseline = 'middle';
    g.fillText(`${P.sprite.name[P.L()] || P.sprite.name.en} · ${place}`, PAD, PAD + H + CAP / 2);
    g.textAlign = 'right';
    g.fillText(new Date().toLocaleDateString(P.L() === 'zh' ? 'zh-CN' : 'en'), PAD + W, PAD + H + CAP / 2);

    return api.invoke('photo:save', { dataUrl: c.toDataURL('image/png'), expId: e.id, region: e.region || null, petId: e.petId });
  }

  Object.assign(P, { drawAwayMap, takePhoto });
})();
