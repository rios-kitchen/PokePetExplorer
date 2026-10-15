/* PokePet Explorer – pet window: the destination icon while the pet is away, and the photo it brings home
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

  const iconCache = {};
  function icon(expId) {
    if (!iconCache[expId]) {
      const img = Maps.iconRgba(expId);
      const c = document.createElement('canvas');
      c.width = img.width; c.height = img.height;
      c.getContext('2d').putImageData(new ImageData(img.data, img.width, img.height), 0, 0);
      iconCache[expId] = c;
    }
    return iconCache[expId];
  }

  /** While away: a small pixel icon of where the pet is, gently bobbing, with its shadow. */
  function drawAwayMap(ctx, now) {
    const e = P.state && P.state.expedition;
    if (!e) return;
    const ic = icon(e.id);
    const s = Math.max(2, P.fx());
    const w = ic.width * s, h = ic.height * s;
    const ground = P.H - P.GROUND_PAD;
    const bob = Math.round(Math.sin(now / 600) * s * 0.6);
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.beginPath();
    ctx.ellipse(P.W / 2, ground - 1, w * 0.32, Math.max(2, s * 1.2), 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.drawImage(ic, Math.round((P.W - w) / 2), Math.round(ground - h - s * 2 + bob), w, h);
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
    const S = 2, PAD = 8, CAP = 24;   // 160×96 scene → 320×192
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
