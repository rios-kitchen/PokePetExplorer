/* PokePet Explorer – the wild window: explore the grass (a limited number of encounters a day) and battle
 * wild Pokémon with up to three of your own; catch them with Poké Balls. The main process runs the battle
 * (src/main/battle.js); this window plays back its events with PMD animations. */
(() => {
  const api = window.api;
  const I18N = window.PokeI18N;
  const SP = window.PokeSprites;
  const Maps = window.PokeMaps;
  const Sound = window.PokeSound;
  const $ = (s) => document.querySelector(s);

  const S = 3;                                   // scenes are 160×96, shown 3× (480×288)
  const canvas = $('#scene');
  const g = canvas.getContext('2d');
  let state = null, info = null, view = null;
  const L = () => (state ? state.settings.lang : 'en');
  const t = (k, v) => I18N.t(L(), k, v);
  const nm = (m) => (m ? m.names[L()] || m.names.en : '');
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // ---------------------------------------------------------------- sprites
  // PMD rows: 2 right, 3 up-right (our side, seen from behind), 6 left, 7 down-left (the wild one)
  const WANT = ['Idle', 'Walk', 'Attack', 'Strike', 'Shoot', 'Charge', 'Hurt', 'Faint', 'Hop'];
  const spriteCache = {};
  async function buildPmd(asset) {
    const out = {};
    for (const name of WANT) {
      const a = asset.anims[name];
      if (!a) continue;
      const img = await new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = a.url; });
      if (!img) continue;
      const rows = Math.floor(img.height / a.fh);
      const frames = [];
      for (let r = 0; r < rows; r++) {
        frames.push(a.durs.map((_, i) => {
          const c = document.createElement('canvas'); c.width = a.fw; c.height = a.fh;
          c.getContext('2d').drawImage(img, i * a.fw, r * a.fh, a.fw, a.fh, 0, 0, a.fw, a.fh);
          return c;
        }));
      }
      out[name] = { frames, durs: a.durs.map((d) => (d * 1000) / 60), w: a.fw, h: a.fh };
    }
    return out;
  }
  function ballSprite() {
    const img = SP.ballRgba(0, 0);
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    c.getContext('2d').putImageData(new ImageData(img.data, img.width, img.height), 0, 0);
    return { Idle: { frames: [[c], [c], [c], [c], [c], [c], [c], [c]], durs: [1000], w: c.width, h: c.height } };
  }
  async function spriteFor(key, loader) {
    if (!spriteCache[key]) spriteCache[key] = loader().then((a) => (a && a.kind === 'pmd' ? buildPmd(a) : ballSprite())).catch(() => ballSprite());
    return spriteCache[key];
  }
  const ownSprite = (id) => spriteFor(`own:${id}`, () => api.invoke('pokemon:assets', id));
  const wildSprite = (m) => spriteFor(`wild:${m.dex}:${m.shiny}`, () => api.invoke('battle:assets', m.dex, m.shiny));

  // what's on stage: { sprite, row, anim, animStart, animUntil, alpha, x, y, flash }
  const actors = { me: null, wild: null, walker: null };
  function actor(sprite, row, x, y) { return { sprite, row, anim: 'Idle', animStart: performance.now(), animUntil: 0, alpha: 1, x, y, flash: 0 }; }
  function play(a, names, ms) {
    if (!a) return;
    const name = names.find((n) => a.sprite[n]);
    if (!name) return;
    a.anim = name; a.animStart = performance.now();
    const an = a.sprite[name];
    a.animUntil = performance.now() + (ms || an.durs.reduce((s, d) => s + d, 0));
  }
  function frameOf(a, now) {
    let name = a.anim;
    if (now > a.animUntil && name !== 'Faint' && name !== 'Walk') name = a.anim = 'Idle';
    const an = a.sprite[name] || a.sprite.Idle || Object.values(a.sprite)[0];
    if (!an) return null;
    const rowFrames = an.frames[Math.min(a.row, an.frames.length - 1)];
    const total = an.durs.reduce((s, d) => s + d, 0);
    let tt = name === 'Faint' ? Math.min(now - a.animStart, total - 1) : (now - a.animStart) % total;
    let i = 0;
    for (; i < an.durs.length - 1 && tt >= an.durs[i]; i++) tt -= an.durs[i];
    return { img: rowFrames[Math.min(i, rowFrames.length - 1)], w: an.w, h: an.h };
  }

  // ---------------------------------------------------------------- scene
  let bg = null, bgKey = '';
  function setScene(place, region) {
    const key = `${place}|${region || ''}`;
    if (key === bgKey) return;
    bgKey = key;
    const img = Maps.sceneRgba(place === 'grass' ? 'woods' : place, { region });
    bg = document.createElement('canvas'); bg.width = img.width; bg.height = img.height;
    bg.getContext('2d').putImageData(new ImageData(img.data, img.width, img.height), 0, 0);
  }

  let ball = null;   // { from, to, start, shakes, caught, phase }
  function draw(now) {
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.imageSmoothingEnabled = false;
    g.clearRect(0, 0, canvas.width, canvas.height);
    if (bg) g.drawImage(bg, 0, 0, bg.width * S, bg.height * S);
    if (mode === 'battle') {   // pads under the two Pokémon
      g.fillStyle = 'rgba(0,0,0,0.18)';
      g.beginPath(); g.ellipse(345, 152, 70, 14, 0, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.ellipse(140, 262, 80, 16, 0, 0, Math.PI * 2); g.fill();
    }
    for (const a of [actors.wild, actors.me, actors.walker]) {
      if (!a || a.alpha <= 0) continue;
      const f = frameOf(a, now);
      if (!f) continue;
      const sc = f.h > 56 ? 2 : 3;
      if (a.flash && now < a.flash && Math.floor(now / 80) % 2) continue;
      g.globalAlpha = a.alpha;
      // PMD frames leave room below the feet: sit them on their spot
      g.drawImage(f.img, Math.round(a.x - (f.w * sc) / 2), Math.round(a.y - f.h * sc * 0.62), f.w * sc, f.h * sc);
      g.globalAlpha = 1;
    }
    if (mode === 'explore') {   // tall grass in front of the walker
      for (let x = 0; x < 480; x += 9) {
        const h = 26 + ((x * 7) % 13), sway = Math.sin(now / 400 + x) * 2;
        g.fillStyle = x % 18 ? '#3f8a45' : '#2f7a3a';
        g.beginPath(); g.moveTo(x, 288); g.lineTo(x + 4 + sway, 288 - h); g.lineTo(x + 8, 288); g.fill();
      }
    }
    if (ball) drawBall(now);
  }

  function drawBall(now) {
    const img = SP.ballRgba(0, 0);
    if (!drawBall.c) { drawBall.c = document.createElement('canvas'); drawBall.c.width = img.width; drawBall.c.height = img.height; drawBall.c.getContext('2d').putImageData(new ImageData(img.data, img.width, img.height), 0, 0); }
    const k = Math.min(1, (now - ball.start) / 600);
    let x = ball.from.x + (ball.to.x - ball.from.x) * k, y = ball.from.y + (ball.to.y - ball.from.y) * k - Math.sin(k * Math.PI) * 120;
    let rot = k * 8;
    if (k >= 1) { x = ball.to.x; y = ball.to.y + 40; rot = ball.wobble ? Math.sin(now / 70) * 0.5 : 0; }
    g.save(); g.translate(x, y); g.rotate(rot);
    g.drawImage(drawBall.c, -20, -20, 40, 40);
    g.restore();
  }

  // ---------------------------------------------------------------- explore mode
  let mode = 'explore';
  let walkerDir = 1;
  async function showExplore() {
    mode = 'explore';
    actors.me = actors.wild = null;
    $('#wildBox').classList.add('hidden'); $('#meBox').classList.add('hidden');
    setScene('grass');
    info = await api.invoke('wild:state');
    const lead = info.party[0];
    actors.walker = lead ? actor(await ownSprite(lead), 2, 120, 250) : null;
    if (actors.walker) actors.walker.anim = 'Walk';
    renderExploreMenu();
  }
  const minsTo = (at) => Math.max(1, Math.ceil((at - Date.now()) / 60000));
  function renderExploreMenu(msg) {
    const lines = [];
    if (!info.party.length) lines.push(t('wild.noParty'));
    else if (info.dayLeft > 0 && info.hourLeft <= 0) lines.push(t('wild.error.rest', { m: minsTo(info.nextAt) }));
    else lines.push(`${t('wild.explore', { n: info.dayLeft, max: info.max })}${t('wild.hour', { h: info.hourLeft, hmax: info.hourMax })}`);
    if (info.pending) lines.push(t('wild.waiting', { name: nm(info.pending), m: minsTo(info.pending.until) }));
    $('#log').textContent = msg || lines.join('\n');
    const buttons = [];
    if (info.pending) buttons.push(button(`⚔ ${t('wild.outingFight')}`, () => explore('outing'), { primary: true, sub: `${minsTo(info.pending.until)} min` }));
    buttons.push(button(`🌿 ${t('wild.go')}`, () => explore('grass'), { primary: !info.pending, sub: `${info.energy}/${info.hourMax}`, disabled: info.energy <= 0 || !info.party.length }));
    $('#menu').className = 'menu wide';
    $('#menu').replaceChildren(...buttons);
  }
  async function explore(source) {
    $('#menu').replaceChildren();
    $('#log').textContent = t('wild.rustle');
    Sound.play('pat');
    await sleep(900);
    const res = await api.invoke(source === 'outing' ? 'wild:outing' : 'wild:explore');
    if (!res.ok) { info = await api.invoke('wild:state'); renderExploreMenu(t(`wild.error.${res.error}`, { m: info.nextAt ? minsTo(info.nextAt) : 0 })); return; }
    await startBattle();
  }

  // ---------------------------------------------------------------- battle mode
  let shown = null;   // what's displayed (updated event by event)
  async function startBattle() {
    $('#result').classList.add('hidden');
    info = await api.invoke('wild:state');
    view = info.battle;
    if (!view) { showExplore(); return; }
    mode = 'battle';
    actors.walker = null;
    setScene(view.place, view.region);
    shown = JSON.parse(JSON.stringify(view));
    actors.wild = null;
    renderBoxes();
    restFace('me'); restFace('wild');
    actors.wild = actor(await wildSprite(view.wild), 7, 345, 150);
    actors.me = actor(await ownSprite(view.party[view.active].key), 3, 140, 262);
    if (view.over) return;   // already decided (a test code): the caller shows the result
    Sound.play('alarm');
    if (view.wild.special) { Sound.play('fanfare'); await say(t(view.wild.special === 'mythical' ? 'b.appearMythical' : 'b.appearLegend'), 1600); }
    await say(t(view.wild.shiny ? 'b.appearShiny' : 'b.appear', { name: nm(view.wild) }), 1200);
    await say(t('b.go', { name: nm(view.party[view.active]) }), 700);
    // the real weather, and abilities that act right away (Intimidate, Drizzle …)
    busy = true;
    for (const e of view.intro || []) await playEvent(e);
    busy = false;
    renderBoxes();
    mainMenu();
  }

  function renderBoxes() {
    const box = (el, m) => {
      el.classList.remove('hidden');
      el.querySelector('.name').textContent = nm(m) + (m.shiny ? ' ✨' : '') + (m.sub ? ' 🧸' : '');
      el.title = [m.ability ? t('poke.ability', { name: m.ability.names[L()] || m.ability.names.en }) : '', m.sub ? t('b.subLabel') : ''].filter(Boolean).join('\n');
      el.querySelector('.lv').textContent = `Lv${m.level}`;
      const pct = Math.max(0, Math.round((m.hp / m.maxHp) * 100));
      const bar = el.querySelector('.bar > div');
      bar.style.width = `${pct}%`;
      bar.className = pct < 20 ? 'low' : pct < 50 ? 'mid' : '';
      const st = el.querySelector('.st');
      st.className = `st ${m.status || ''}`; st.textContent = m.status ? t(`status.${m.status}`) : '';
      const hp = el.querySelector('.hp'); if (hp) hp.textContent = `${Math.max(0, m.hp)}/${m.maxHp}`;
    };
    box($('#wildBox'), shown.wild);
    box($('#meBox'), shown.party[shown.active]);
    // weather and terrain on the field
    const field = [shown.weatherSet && t(`field.${shown.weatherSet}`), shown.terrain && t(`field.${shown.terrain}`)].filter(Boolean);
    $('#field').textContent = field.join(' · ');
    $('#field').classList.toggle('hidden', !field.length);
  }

  async function say(text, ms = 900) { $('#log').textContent = text; await sleep(ms); }

  function button(label, onclick, o = {}) {
    const b = document.createElement('button');
    if (o.primary) b.className = 'primary';
    if (o.back) b.className = 'back';
    if (o.type) { b.className = 'type'; b.style.background = TYPE_COLORS[o.type] || '#777'; }
    const span = document.createElement('span'); span.textContent = label; b.append(span);
    if (o.sub) { const s = document.createElement('span'); s.className = 'sub'; s.textContent = o.sub; b.append(s); }
    if (o.disabled) b.disabled = true;
    b.addEventListener('click', onclick);
    return b;
  }
  const TYPE_COLORS = { normal: '#9a9a7a', fire: '#e2603b', water: '#3b78c4', electric: '#d8b020', grass: '#4fa04a', ice: '#5ab8c8',
    fighting: '#b8402a', poison: '#9a4ab8', ground: '#c8a050', flying: '#8a8ad8', psychic: '#e05a8a', bug: '#8aa020',
    rock: '#a8903a', ghost: '#6a5a98', dragon: '#6a4ad8', dark: '#5a4a3a', steel: '#8a8aa8', fairy: '#e08ab8' };

  function mainMenu() {
    $('#log').textContent = t('b.what', { name: nm(shown.party[shown.active]) });
    $('#menu').className = 'menu';
    $('#menu').replaceChildren(
      button(`⚔ ${t('b.fight')}`, moveMenu, { primary: true }),
      button(`🎒 ${t('b.bag')}`, bagMenu),
      button(`🐾 ${t('b.pokemon')}`, () => partyMenu(false)),
      button(`🏃 ${t('b.run')}`, () => act({ type: 'run' })));
  }
  function moveMenu() {
    const m = view.party[view.active];
    $('#menu').className = 'menu';
    // a Choice item locks it into the first move it used
    const locked = m.locked && m.moves.some((x) => x.id === m.locked) ? m.locked : null;
    if (locked) $('#log').textContent = t('b.locked', { item: itemName(m.item) });
    $('#menu').replaceChildren(...m.moves.map((mv, i) => button(mv.names[L()] || mv.names.en, () => act({ type: 'move', index: i }),
      { type: mv.type, sub: `${t(`type.${mv.type}`)} · ${mv.cls === 'status' ? t('b.statusMove') : mv.power || '—'}`, disabled: locked && mv.id !== locked })), button(t('b.back'), mainMenu, { back: true }));
  }
  function bagMenu() {
    const items = Object.entries(view.bag).filter(([, n]) => n > 0);
    $('#menu').className = 'menu';
    const list = items.map(([id, n]) => button(t(`item.${id}`), () => {
      if (id.endsWith('ball')) act({ type: 'ball', ball: id });
      else if (id === 'revive') partyMenu(false, id);
      else act({ type: 'item', item: id });
    }, { sub: `×${n}` }));
    if (!list.length) $('#log').textContent = t('b.bagEmpty');
    $('#menu').replaceChildren(...list, button(t('b.back'), mainMenu, { back: true }));
  }
  function partyMenu(forced, item) {
    $('#log').textContent = forced ? t('b.needSwitch') : item ? t('b.reviveWho') : t('b.switchWho');
    $('#menu').className = 'menu wide';
    const list = view.party.map((m, i) => button(`${nm(m)}  Lv${m.level}`, () => (item ? act({ type: 'item', item, target: i }) : act({ type: 'switch', to: i })), {
      sub: m.fainted ? t('b.fainted') : `${m.hp}/${m.maxHp}`,
      disabled: item ? !m.fainted : m.fainted || i === view.active
    }));
    $('#menu').replaceChildren(...list, ...(forced ? [] : [button(t('b.back'), mainMenu, { back: true })]));
  }

  let busy = false;
  async function act(action) {
    if (busy) return;
    busy = true;
    $('#menu').replaceChildren();
    const res = await api.invoke('battle:act', action);
    for (const e of res.events) await playEvent(e);
    view = res.view;
    shown = JSON.parse(JSON.stringify(view));
    renderBoxes();
    busy = false;
    if (view.over) return showResult();
    if (view.needSwitch) return partyMenu(true);
    mainMenu();
  }

  const sideMon = (side) => (side === 'me' ? shown.party[shown.active] : shown.wild);
  /** An item's name without its emoji, for sentences. */
  const itemName = (id) => t(`item.${id}`).replace(/^[^\p{L}\p{N}]+\s/u, '');
  const abilityName = (m) => (m && m.ability ? m.ability.names[L()] || m.ability.names.en : '');
  const sideActor = (side) => (side === 'me' ? actors.me : actors.wild);

  // ---------------------------------------------------------------- faces (PMD portraits with emotions)
  const faceCache = {};
  function faceUrl(m, emotion) {
    const k = `${m.dex}:${!!m.shiny}:${emotion}`;
    faceCache[k] ||= api.invoke('diary:portrait', m.dex, emotion, !!m.shiny)
      .then((u) => u || (emotion !== 'Normal' ? faceUrl(m, 'Normal') : null));
    return faceCache[k];
  }
  /** Show a side's face with an emotion; with hold, it goes back to its resting face afterwards. */
  function setFace(side, emotion, hold) {
    const m = sideMon(side);
    const img = $(side === 'me' ? '#meFace' : '#wildFace');
    if (!m || !img) return;
    const want = `${m.dex}:${emotion}:${Date.now()}`;
    img.dataset.want = want;
    faceUrl(m, emotion).then((u) => {
      if (img.dataset.want !== want) return;
      if (u) { img.src = u; img.classList.remove('hidden'); } else img.classList.add('hidden');
    });
    if (hold) setTimeout(() => { if (img.dataset.want === want) restFace(side); }, hold);
  }
  /** The face that fits how it's doing: worried when low, dizzy when confused … */
  function restFace(side) {
    const m = sideMon(side);
    if (!m) return;
    if (m.fainted || m.hp <= 0) return setFace(side, side === 'me' ? 'Crying' : 'Pain');
    if (m.status === 'confusion' || m.status === 'paralysis') return setFace(side, 'Dizzy');
    if (m.hp / m.maxHp < 0.25) return setFace(side, side === 'me' ? 'Worried' : 'Pain');
    if (m.status === 'burn' || m.status === 'poison') return setFace(side, 'Pain');
    setFace(side, side === 'me' ? 'Determined' : 'Normal');
  }
  const other = (side) => (side === 'me' ? 'wild' : 'me');

  async function playEvent(e) {
    const who = nm(sideMon(e.side));
    switch (e.t) {
      // abilities and held items
      case 'ability': {
        const m = sideMon(e.side);
        if (e.what === 'show') { setFace(e.side, 'Determined', 1000); await say(t('b.ab.show', { name: who, ability: abilityName(m) }), 900); break; }
        if (e.what === 'flashFire') m.flashFire = true;
        if (e.what === 'cure') { m.status = null; renderBoxes(); }
        setFace(e.side, e.what === 'endure' ? 'Determined' : 'Happy', 1100);
        await say(t(`b.ab.${e.what}`, { name: who, ability: abilityName(m) }), 1000);
        break;
      }
      case 'abilityHurt': sideMon(e.side).hp = e.hp; renderBoxes(); play(sideActor(e.side), ['Hurt'], 400); setFace(e.side, 'Pain', 1000); await say(t('b.abilityHurt', { name: who }), 800); break;
      case 'held':
        if (e.what === 'cure') { sideMon(e.side).status = null; renderBoxes(); }
        if (['berry', 'cure', 'sash'].includes(e.what)) sideMon(e.side).item = null;
        setFace(e.side, e.what === 'sash' ? 'Determined' : 'Happy', 1100);
        Sound.play('chime');
        await say(t(`b.held.${e.what}`, { name: who, item: itemName(e.item) }), 900);
        break;
      case 'itemHurt': sideMon(e.side).hp = e.hp; renderBoxes(); play(sideActor(e.side), ['Hurt'], 400); await say(t('b.itemHurt', { name: who, item: itemName(e.item) }), 800); break;
      // weather and terrain
      case 'weather':
        shown.weatherSet = e.weather; renderBoxes();
        Sound.play('chime');
        await say(t(e.real && t(`b.weatherReal.${e.weather}`) !== `b.weatherReal.${e.weather}` ? `b.weatherReal.${e.weather}` : `b.weather.${e.weather}`), 1100);
        break;
      case 'weatherEnd': shown.weatherSet = null; renderBoxes(); await say(t(`b.weatherEnd.${e.weather}`), 900); break;
      case 'weatherHurt': sideMon(e.side).hp = e.hp; renderBoxes(); play(sideActor(e.side), ['Hurt'], 400); setFace(e.side, 'Pain', 1000); await say(t(`b.weatherHurt.${e.weather}`, { name: who }), 800); break;
      case 'terrain': shown.terrain = e.terrain; renderBoxes(); Sound.play('chime'); await say(t(`b.terrain.${e.terrain}`), 1100); break;
      case 'terrainEnd': shown.terrain = null; renderBoxes(); await say(t(`b.terrainEnd.${e.terrain}`), 900); break;
      case 'terrainBlock': await say(t('b.terrainBlock', { name: who }), 900); break;
      case 'terrainHeal': break;   // the heal event right after says it
      // one-hit KOs, trapping, Substitute
      case 'ohko': Sound.play('alarm'); await say(t('b.ohko'), 1000); break;
      case 'bound': sideMon(e.side).bound = true; setFace(e.side, 'Worried', 1100); await say(t('b.bound', { name: who, move: e.names[L()] || e.names.en }), 900); break;
      case 'boundHurt': sideMon(e.side).hp = e.hp; renderBoxes(); play(sideActor(e.side), ['Hurt'], 400); setFace(e.side, 'Pain', 1000); await say(t('b.boundHurt', { name: who, move: e.names[L()] || e.names.en }), 800); break;
      case 'unbound': sideMon(e.side).bound = false; await say(t('b.unbound', { name: who, move: e.names[L()] || e.names.en }), 800); break;
      case 'blocked': setFace(e.side, 'Worried', 1100); await say(t('b.blocked', { name: who }), 900); break;
      case 'trapped': setFace('me', 'Worried', 1100); await say(t('b.trapped', { name: who }), 1100); break;
      case 'sub': sideMon(e.side).hp = e.hp; sideMon(e.side).sub = true; renderBoxes(); play(sideActor(e.side), ['Charge', 'Pose', 'Hop'], 600); await say(t('b.sub', { name: who }), 900); break;
      case 'subHit': await say(t('b.subHit', { name: who }), 800); break;
      case 'subBreak': sideMon(e.side).sub = false; renderBoxes(); await say(t('b.subBreak', { name: who }), 800); break;
      case 'subBlock': await say(t('b.subBlock', { name: who }), 800); break;
      case 'use': {   // a status move
        await say(t('b.used', { name: who, move: e.names[L()] || e.names.en }), 500);
        play(sideActor(e.side), ['Charge', 'Pose', 'Hop'], 600);
        await sleep(400);
        break;
      }
      case 'stat': {
        const up = e.change > 0;
        play(sideActor(e.side), up ? ['Charge', 'Pose'] : ['Hurt'], 500);
        setFace(e.side, up ? 'Determined' : 'Worried', 1200);
        Sound.play(up ? 'chime' : 'pat');
        const key = Math.abs(e.change) >= 2 ? (up ? 'b.statUp2' : 'b.statDown2') : (up ? 'b.statUp' : 'b.statDown');
        await say(t(key, { name: who, stat: t(`stat.${e.stat}`) }), 900);
        break;
      }
      case 'statMax': await say(t(e.up ? 'b.statMaxUp' : 'b.statMaxDown', { name: who, stat: t(`stat.${e.stat}`) }), 900); break;
      case 'heal': sideMon(e.side).hp = e.hp; renderBoxes(); setFace(e.side, 'Happy', 1200); Sound.play('chime'); await say(t('b.heal', { name: who }), 900); break;
      case 'recoil': sideMon(e.side).hp = e.hp; renderBoxes(); play(sideActor(e.side), ['Hurt'], 400); setFace(e.side, 'Pain', 1100); await say(t('b.recoil', { name: who }), 900); break;
      case 'fail': await say(t('b.fail'), 800); break;
      case 'hits': await say(t('b.hits', { n: e.n }), 800); break;
      case 'asleep': setFace(e.side, 'Sigh', 1100); await say(t('b.asleep', { name: who }), 800); break;
      case 'wake': sideMon(e.side).status = null; renderBoxes(); setFace(e.side, 'Surprised', 1100); await say(t('b.wake', { name: who }), 800); break;
      case 'move': {
        if (!e.again) await say(t('b.used', { name: who, move: e.names[L()] || e.names.en }), 350);
        play(sideActor(e.side), e.cls === 'special' ? ['Shoot', 'Charge', 'Attack'] : ['Attack', 'Strike', 'Hop'], 600);
        await sleep(450);
        const target = e.side === 'me' ? 'wild' : 'me';
        Sound.play(e.eff > 1 ? 'alarm' : 'pat');
        play(sideActor(target), ['Hurt'], 500);
        sideActor(target).flash = performance.now() + 450;
        sideMon(target).hp = e.hp;
        renderBoxes();
        setFace(target, e.crit ? 'Surprised' : 'Pain', 1300);
        if (e.eff > 1) setFace(e.side, 'Joyous', 1300);
        else if (e.eff === 0) setFace(e.side, 'Surprised', 1300);
        await sleep(550);
        if (e.crit) await say(t('b.crit'), 700);
        if (e.eff > 1) await say(t('b.super'), 800);
        else if (e.eff === 0) await say(t('b.noEffect', { name: nm(sideMon(target)) }), 800);
        else if (e.eff < 1) await say(t('b.notVery'), 800);
        break;
      }
      case 'miss': setFace(e.side, 'Sigh', 1100); if (!e.quiet) await say(t('b.used', { name: who, move: e.names[L()] || e.names.en }), 400); await say(t('b.miss'), 700); break;
      case 'status': sideMon(e.side).status = e.status; renderBoxes(); setFace(e.side, e.status === 'freeze' ? 'Surprised' : e.status === 'confusion' ? 'Dizzy' : e.status === 'sleep' ? 'Sigh' : 'Pain', 1200); await say(t(`b.status.${e.status}`, { name: who }), 900); break;
      case 'statusHurt': sideMon(e.side).hp = e.hp; renderBoxes(); setFace(e.side, 'Pain', 1100); play(sideActor(e.side), ['Hurt'], 400); await say(t(`b.hurt.${e.status}`, { name: who }), 900); break;
      case 'frozen': await say(t('b.frozen', { name: who }), 800); break;
      case 'thaw': sideMon(e.side).status = null; renderBoxes(); setFace(e.side, 'Happy', 1100); await say(t('b.thaw', { name: who }), 800); break;
      case 'paralyzed': await say(t('b.paralyzed', { name: who }), 800); break;
      case 'confusedHit': sideMon(e.side).hp = e.hp; renderBoxes(); setFace(e.side, 'Dizzy', 1100); play(sideActor(e.side), ['Hurt'], 400); await say(t('b.confusedHit', { name: who }), 900); break;
      case 'unconfused': sideMon(e.side).status = null; renderBoxes(); setFace(e.side, 'Happy', 1100); await say(t('b.unconfused', { name: who }), 800); break;
      case 'faint':
        play(sideActor(e.side), ['Faint', 'Hurt'], 900);
        Sound.play('switch');
        if (e.side === 'me') shown.party[shown.active].fainted = true;
        setFace(e.side, e.side === 'me' ? 'Crying' : 'Pain');
        setFace(other(e.side), e.side === 'me' ? 'Determined' : 'Joyous');
        await say(t('b.faint', { name: who }), 1000);
        sideActor(e.side).alpha = 0;
        break;
      case 'needSwitch': break;
      case 'switch': {
        const to = shown.party[e.to];
        if (actors.me) actors.me.alpha = 0;
        await say(t('b.comeBack', { name: nm(shown.party[shown.active]) }), 500);
        shown.active = e.to;
        actors.me = actor(await ownSprite(to.key), 3, 140, 262);
        renderBoxes();
        restFace('me');
        await say(t('b.go', { name: nm(to) }), 800);
        break;
      }
      case 'item': {
        if (e.target != null) shown.party[e.target].hp = e.hp;
        renderBoxes();
        Sound.play('chime');
        if (e.target != null) setFace('me', 'Happy', 1300);
        await say(t('b.item', { item: t(`item.${e.item}`) }), 900);
        break;
      }
      case 'ball': {
        await say(t('b.throw', { ball: t(`item.${e.ball}`) }), 300);
        ball = { from: { x: 100, y: 260 }, to: { x: 345, y: 110 }, start: performance.now(), wobble: false };
        await sleep(650);
        actors.wild.alpha = 0;
        ball.wobble = true;
        for (let i = 0; i < e.shakes; i++) { Sound.play('pat'); await sleep(650); }
        ball.wobble = false;
        if (e.caught) { Sound.play('fanfare'); setFace('me', 'Inspired'); await say(t('b.caught', { name: nm(shown.wild) }), 1400); }
        else { ball = null; actors.wild.alpha = 1; setFace('wild', 'Angry', 1400); setFace('me', 'Worried', 1400); await say(t(['b.broke0', 'b.broke1', 'b.broke2', 'b.broke3'][e.shakes]), 1000); }
        break;
      }
      case 'ran': Sound.play('switch'); setFace('me', 'Sigh'); await say(t('b.ran'), 900); break;
      case 'cantRun': await say(t('b.cantRun'), 800); break;
      default: break;
    }
  }

  function showResult() {
    const r = view.result || {};
    setFace('me', { win: 'Joyous', caught: 'Inspired', lose: 'Crying', ran: 'Sigh' }[view.over] || 'Normal');
    const title = { win: 'b.resWin', caught: 'b.resCaught', lose: 'b.resLose', ran: 'b.resRan' }[view.over];
    $('#resTitle').textContent = t(title, { name: nm(view.wild) });
    const lines = [];
    if (r.xp) lines.push(t('b.resXp', { n: r.xp }));
    if (r.berries) lines.push(`+${r.berries} 🍓`);
    if (view.over === 'caught') lines.push(t('b.resJoined', { name: nm(view.wild) }));
    if (view.over === 'lose') {
      const p = r.penalty || { health: 15, mood: 10 };
      lines.push(p.health > 15 ? t('b.resPenaltyHeavy', p) : t('b.resPenalty'));
      if (r.lostBerries) lines.push(t('b.resLostBerries', { n: r.lostBerries }));
      for (const names of r.fainted || []) lines.push(t('b.resFainted', { name: names[L()] || names.en }));
    }
    $('#resText').textContent = lines.join('\n');
    $('#resOk').textContent = t('b.continue');
    $('#result').classList.remove('hidden');
  }
  $('#resOk').addEventListener('click', () => {
    $('#result').classList.add('hidden');
    ball = null;
    api.send('battle:close');
    showExplore();
  });

  // ---------------------------------------------------------------- loop & start
  function loop(now) {
    if (mode === 'explore' && actors.walker) {
      const w = actors.walker;
      w.x += walkerDir * 0.8;
      if (w.x > 400) { walkerDir = -1; w.row = 6; }
      if (w.x < 80) { walkerDir = 1; w.row = 2; }
    }
    draw(now);
    requestAnimationFrame(loop);
  }
  api.on('state', (s) => { state = s; Sound.setEnabled(s.settings.sound); document.title = t('wild.title'); });
  api.on('wild:encounter', () => { if (mode === 'explore') showExplore(); });
  // the battle changed outside this window (started or ended from Settings): catch up
  let refreshing = Promise.resolve();
  api.on('wild:refresh', () => { refreshing = refreshing.then(refresh, refresh); });
  async function refresh() {
    info = await api.invoke('wild:state');
    if (!info.battle) { showExplore(); return; }
    const fresh = !view || (view.over && !info.battle.over) || view.wild.dex !== info.battle.wild.dex;
    if (mode !== 'battle' || !actors.wild || fresh) await startBattle();
    view = info.battle;
    shown = JSON.parse(JSON.stringify(view));
    renderBoxes();
    if (view.over) {
      $('#menu').replaceChildren();
      if (view.over === 'win' && actors.wild) { play(actors.wild, ['Faint', 'Hurt'], 900); setTimeout(() => { actors.wild.alpha = 0; }, 900); }
      if (view.over === 'caught' && actors.wild) { actors.wild.alpha = 0; ball = { from: { x: 345, y: 110 }, to: { x: 345, y: 110 }, start: 0, wobble: false }; Sound.play('fanfare'); }
      showResult();
    }
  }
  (async () => {
    state = await api.invoke('state:get');
    Sound.setEnabled(state.settings.sound);
    document.title = t('wild.title');
    requestAnimationFrame(loop);
    info = await api.invoke('wild:state');
    if (info.battle && !info.battle.over) await startBattle(); else await showExplore();
    if (new URLSearchParams(location.search).get('encounter') && info.pending && mode === 'explore') explore('outing');
  })();
})();
