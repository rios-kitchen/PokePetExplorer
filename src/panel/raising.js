/* PokePet Explorer – raising parts of the control panel: shop (Care tab), Expedition tab, Dex tab. */
window.PanelRaising = function PanelRaising(env) {
  const { api, el, t, L } = env;
  const $ = (sel) => document.querySelector(sel);

  const ATTR_ICON = { cool: '😎', cute: '🎀', smart: '📚', tough: '💪' };
  // the games' "medium fast" curve, as in src/main/growth.js: Lv n needs n³ − 1 XP, up to Lv100
  const xpAt = (lv) => Math.min(100, lv) ** 3 - 1;
  const levelOf = (xp) => { let l = 1; while (l < 100 && xpAt(l + 1) <= (xp || 0)) l++; return l; };

  function fmt(ms) {
    const s = Math.max(0, Math.ceil(ms / 1000));
    const mm = `${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
    return s >= 3600 ? `${Math.floor(s / 3600)}:${mm}` : mm;
  }

  function flash(sel, text) {
    const n = $(sel);
    n.textContent = text;
    clearTimeout(n._timer);
    n._timer = setTimeout(() => { n.textContent = ''; }, 4000);
  }

  // ================================================================ SHOP (Care tab)
  let shopKey = '';
  function renderShop(state) {
    const key = JSON.stringify([L(), state.berries, state.inventory]);
    if (key === shopKey) return;
    shopKey = key;
    $('#shopHead').textContent = t('shop.balance', { n: state.berries });
    $('#careEarn').textContent = t('care.earn', { p: state.reward.pomodoro, t: state.reward.todo, d: state.reward.daily });
    const buyable = Object.entries(state.items).filter(([, item]) => item.cost > 0);
    const row = ([id, item]) => {
      const have = state.inventory[id] || 0;
      const buy = (n) => el('button', {
        class: 'ghost', disabled: state.berries < item.cost * n ? true : null,
        onclick: async () => {
          const res = await api.invoke('shop:buy', id, n);
          if (!res.ok) flash('#shopMsg', t(`care.refused.${res.reason}`));
        }
      }, `+${n}`);
      const desc = item.kind === 'held' || item.kind === 'evo' ? t(`itemdesc.${id}`) : '';
      return el('div', { class: 'shop-item', title: desc || null },
        el('span', { class: 'si-name' }, t(`item.${id}`), desc ? el('span', { class: 'si-desc' }, desc) : null),
        el('span', { class: 'si-have' }, have ? t('shop.have', { n: have }) : ''),
        el('span', { class: 'si-cost' }, `${item.cost} 🍓`),
        el('span', { class: 'si-buy' }, buy(1), ...(item.kind === 'held' || item.kind === 'evo' ? [] : [buy(5)])));
    };
    $('#shopItems').replaceChildren(...buyable.filter(([, item]) => item.kind !== 'held' && item.kind !== 'evo').map(row));
    // evolution stones and the Linking Cord: used in the Care tab
    $('#shopEvo').replaceChildren(...buyable.filter(([, item]) => item.kind === 'evo').map(row));
    // held items: a section of their own (given to a Pokémon in the Pokémon tab)
    $('#shopHeld').replaceChildren(...buyable.filter(([, item]) => item.kind === 'held').map(row));
  }

  // ================================================================ TODAY (sign-in, daily tasks)
  let todayKey = '';
  function renderToday(state) {
    const d = state.daily, info = state.dailyInfo;
    const key = JSON.stringify([L(), d, state.berries]);
    if (key === todayKey) return;
    todayKey = key;
    // which slot of the 7-day cycle is today: after signing in it's the current streak, before it the next one
    const yesterdayStreak = d.signedIn ? d.streak : (d.lastSignDay && isYesterday(d.lastSignDay, d.day) ? d.streak : 0);
    const todaySlot = d.signedIn ? (d.streak - 1) % 7 : yesterdayStreak % 7;
    $('#signRow').replaceChildren(...info.signRewards.map((n, i) => el('div', {
      class: `sign-day${i < todaySlot || (i === todaySlot && d.signedIn) ? ' got' : ''}${i === todaySlot ? ' today' : ''}`
    }, el('span', { class: 'hint' }, t('today.day', { n: i + 1 })), el('b', {}, `${n} 🍓`), i + 1 === info.signItem.day ? el('span', {}, t(`item.${info.signItem.item}`).split(' ')[0]) : null)));
    $('#signStreak').textContent = d.streak && (d.signedIn || yesterdayStreak) ? t('today.streak', { n: d.signedIn ? d.streak : yesterdayStreak }) : '';
    const btn = $('#signBtn');
    btn.textContent = d.signedIn ? t('today.signed') : t('today.signBtn');
    btn.disabled = d.signedIn ? true : null;
    btn.onclick = () => api.invoke('daily:sign');
    $('#taskList').replaceChildren(...(d.tasks || []).map((tk) => {
      const pct = Math.round((tk.progress / tk.goal) * 100);
      const done = tk.progress >= tk.goal;
      return el('div', { class: `task${tk.claimed ? ' claimed' : done ? ' done' : ''}` },
        el('div', { class: 'task-main' },
          el('b', {}, t(`task.${tk.id}`)),
          el('div', { class: 'meter' }, el('div', { style: `width:${pct}%` })),
          el('span', { class: 'hint' }, `${tk.progress}/${tk.goal}`)),
        el('button', {
          class: done && !tk.claimed ? 'primary' : 'secondary', disabled: !done || tk.claimed ? true : null,
          onclick: () => api.invoke('daily:claim', tk.id)
        }, tk.claimed ? t('today.claimed') : `${t('today.claim')} +${tk.reward} 🍓`));
    }));
    $('#taskBonus').textContent = d.bonusClaimed ? t('today.bonusDone') : t('today.bonus', { n: info.allDoneBonus });
  }
  function isYesterday(a, b) {
    if (!a || !b) return false;
    const [y, m, dd] = b.split('-').map(Number);
    const x = new Date(y, m - 1, dd - 1);
    return a === `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
  }

  // ================================================================ EXPEDITION
  function statsBox(state) {
    const id = state.settings.pokemon;
    const rec = state.pets[id] || {};
    const attrs = rec.attrs || {};
    return el('div', { class: 'exp-stats-row' },
      ...Object.entries(ATTR_ICON).map(([a, ic]) => el('div', { class: 'stat' },
        el('b', {}, `${ic} ${attrs[a] || 0}`), el('span', {}, t(`attr.${a}`)))));
  }

  /** "Lv.8+ · Tough 10+" */
  function needText(exp) {
    const parts = [t('poke.level', { n: exp.level }) + '+'];
    for (const [a, v] of Object.entries(exp.need || {})) parts.push(`${t(`attr.${a}`)} ${v}+`);
    return parts.join(' · ');
  }

  /** "2–4 🍓 · +15 XP · Tough +1 · 🎁" */
  function rewardText(exp) {
    const parts = [];
    if (exp.berries) parts.push(`${exp.berries[0]}–${exp.berries[1]} 🍓`);
    if (exp.xp) parts.push(`+${exp.xp} XP`);
    for (const [a, v] of Object.entries(exp.gain || {})) parts.push(`${t(`attr.${a}`)} +${v}`);
    if (exp.train) parts.push(`${t(`attr.${exp.train}`)} ++`);
    if (exp.kind === 'travel') parts.push(t('exp.souvenir'));
    if (exp.loot) parts.push('🎁');
    return parts.join(' · ');
  }

  /** Why the active Pokémon can't go – mirrors expedition.js blocker(). */
  function blocker(state, exp) {
    const id = state.settings.pokemon;
    const rec = state.pets[id] || {};
    const care = rec.care || {};
    if (state.expedition) return 'busy';
    if (rec.stage === 'egg') return 'egg';
    if (care.fainted || care.status || care.sick) return 'unwell';
    if (care.hunger < 30) return 'hungry';
    if (care.clean < 30) return 'dirty';
    if (levelOf(rec.xp) < exp.level) return 'level';
    for (const [a, v] of Object.entries(exp.need || {})) if (((rec.attrs || {})[a] || 0) < v) return 'stats';
    return null;
  }

  let expKey = '';
  function renderExpedition(state) {
    const e = state.expedition;
    const key = JSON.stringify([L(), state.settings.pokemon, state.pets[state.settings.pokemon], e]);
    if (key !== expKey) {
      expKey = key;
      $('#expStats').replaceChildren(statsBox(state));
      const groups = ['dungeon', 'training', 'travel'];
      $('#expList').replaceChildren(...groups.map((kind) => el('div', {},
        el('h3', {}, t(`exp.kind.${kind}`)),
        el('div', { class: 'exp-list' }, ...Object.entries(state.expeditions)
          .filter(([, x]) => x.kind === kind)
          .map(([id, exp]) => {
            const why = blocker(state, exp);
            const hazard = exp.hazard ? el('span', { class: 'exp-hazard' }, `⚠ ${t(`status.${exp.hazard[0]}`)} ${Math.round(exp.hazard[1] * 100)}%`) : null;
            return el('div', { class: `exp-card${why ? ' blocked' : ''}` },
              el('div', { class: 'exp-head' },
                el('b', {}, t(`exp.${id}`)),
                el('span', { class: 'hint' }, `${exp.min} ${t('unit.min')}`)),
              el('div', { class: 'exp-line' }, rewardText(exp)),
              el('div', { class: 'exp-line muted' },
                needText(exp), ' · ',
                t('exp.cost', { h: exp.cost.hunger, c: exp.cost.clean }), hazard ? ' · ' : '', hazard),
              el('button', {
                class: 'primary', disabled: why ? true : null,
                title: why ? t(`exp.blocked.${why}`) : '',
                onclick: async () => {
                  const res = await api.invoke('expedition:start', id);
                  if (!res.ok) flash('#expMsg', t(`exp.blocked.${res.reason}`));
                }
              }, why === 'level' || why === 'stats' ? t(`exp.blocked.${why}`) : t('exp.go')));
          })))));
    }

    // the running expedition, with a live countdown
    if (!e) { $('#expActive').replaceChildren(); return; }
    const total = e.endsAt - e.startAt;
    const pct = Math.min(100, Math.round(((Date.now() - e.startAt) / total) * 100));
    let box = $('#expActive .exp-now');
    if (!box || box.dataset.key !== `${e.petId}|${e.startAt}`) {
      box = el('div', { class: 'card exp-now', 'data-key': `${e.petId}|${e.startAt}` },
        el('div', { class: 'exp-head' },
          el('b', {}, t('exp.away', { name: env.petName(e.petId), place: t(`exp.${e.id}`) })),
          el('span', { class: 'exp-left' })),
        el('div', { class: 'meter' }, el('div', { class: 'exp-fill' })),
        el('button', { class: 'link', onclick: () => api.send('expedition:recall') }, t('menu.recall')));
      $('#expActive').replaceChildren(box);
    }
    box.querySelector('.exp-left').textContent = fmt(e.endsAt - Date.now());
    box.querySelector('.exp-fill').style.width = `${pct}%`;
  }

  // ================================================================ DEX
  const photoCache = {};
  const photoUrl = (id) => (photoCache[id] ||= api.invoke('photo:get', id));

  /** Would unstarring this photo delete it? (same rule as album.js wouldDrop) */
  function wouldDrop(state, ph) {
    const regular = state.photos.filter((p) => !p.fav || p.id === ph.id).sort((a, b) => b.at - a.at);
    return regular.findIndex((p) => p.id === ph.id) >= state.album.recent;
  }

  function photoCard(state, ph) {
    const img = el('img', { alt: '' });
    photoUrl(ph.id).then((url) => { if (url) img.src = url; });
    const place = ph.region ? t(`region.${ph.region}`) : t(`exp.${ph.expId}`);
    const star = el('button', {
      class: `star${ph.fav ? ' on' : ''}`, title: t(ph.fav ? 'dex.unfav' : 'dex.fav'),
      onclick: async (e) => {
        e.stopPropagation();
        if (ph.fav && wouldDrop(state, ph) && !window.confirm(t('dex.unfavConfirm', { n: state.album.recent }))) return;
        const res = await api.invoke('photo:fav', ph.id, !ph.fav);
        if (!res.ok && res.reason === 'full') window.alert(t('dex.favFull', { n: state.album.maxFavorites }));
      }
    }, ph.fav ? '★' : '☆');
    return el('div', { class: 'photo-wrap' },
      el('button', {
        class: 'photo', title: `${env.petName(ph.petId)} · ${place}`,
        onclick: async () => {
          const url = await photoUrl(ph.id);
          if (!url) return;
          $('#lightbox img').src = url;
          $('#lightbox').classList.remove('hidden');
        }
      }, img),
      star);
  }

  function renderAlbum(state) {
    const newest = (a, b) => b.at - a.at;
    const recent = state.photos.filter((p) => !p.fav).sort(newest);
    const favs = state.photos.filter((p) => p.fav).sort(newest);
    $('#albumHint').textContent = t('dex.albumHint', { n: state.album.recent });
    $('#albumList').replaceChildren(...recent.map((ph) => photoCard(state, ph)),
      ...(recent.length ? [] : [el('p', { class: 'hint full' }, t('dex.noPhotos'))]));
    $('#favHead').textContent = t('dex.favorites', { n: favs.length, max: state.album.maxFavorites });
    $('#favList').replaceChildren(...favs.map((ph) => photoCard(state, ph)),
      ...(favs.length ? [] : [el('p', { class: 'hint full' }, t('dex.noFavorites'))]));
  }
  $('#lightbox').addEventListener('click', () => $('#lightbox').classList.add('hidden'));

  // the fishing Pokédex: every species that can be caught, with its portrait once caught
  const fishFaces = {};
  function renderFishdex(state) {
    renderPokedex(state);
    const caught = Object.keys(state.fishdex).length;
    $('#fishHead').textContent = t('dex.fishdex', { n: caught, total: state.fish.length });
    const TIER = ['common', 'uncommon', 'rare', 'veryRare'];
    $('#fishList').replaceChildren(...state.fish.map((f) => {
      const rec = state.fishdex[f.dex];
      const face = el('div', { class: 'fish-face' }, rec ? '' : '❔');
      if (rec) {
        const k = `${f.dex}${rec.shiny ? 's' : ''}`;
        fishFaces[k] ||= api.invoke('diary:portrait', f.dex, 'Normal', !!rec.shiny);
        fishFaces[k].then((url) => { if (url) face.replaceChildren(el('img', { src: url, alt: '' })); });
      }
      return el('div', { class: `fish${rec ? ' got' : ''} tier-${TIER[f.tier]}`, title: rec ? t('dex.fishTip', { n: rec.caught, cm: rec.best }) : t(`fish.tier.${TIER[f.tier]}`) },
        face,
        el('b', {}, rec ? (f.names[L()] || f.names.en) + (rec.shiny ? ' ✨' : '') : '???'),
        el('span', { class: 'hint' }, rec ? t('dex.fishBest', { cm: rec.best, n: rec.caught }) : `#${String(f.dex).padStart(3, '0')}`));
    }));
  }
  $('#goFish').addEventListener('click', () => api.send('fish:open'));
  $('#goQuiz').addEventListener('click', () => api.send('quiz:open'));
  $('#goCatch').addEventListener('click', () => api.send('catch:open'));
  $('#goMemory').addEventListener('click', () => api.send('memory:open'));
  $('#goWhack').addEventListener('click', () => api.send('whack:open'));
  $('#goTypes').addEventListener('click', () => api.send('types:open'));
  $('#goRps').addEventListener('click', () => api.send('rps:open'));
  $('#goFlip').addEventListener('click', () => api.send('flip:open'));
  $('#goEcho').addEventListener('click', () => api.send('echo:open'));
  $('#goShuffle').addEventListener('click', () => api.send('shuffle:open'));
  $('#goJump').addEventListener('click', () => api.send('jump:open'));
  $('#goPuzzle').addEventListener('click', () => api.send('puzzle:open'));
  $('#goHunt').addEventListener('click', () => api.send('hunt:open'));
  $('#goQuick').addEventListener('click', () => api.send('quick:open'));
  $('#goLights').addEventListener('click', () => api.send('lights:open'));
  $('#goDitto').addEventListener('click', () => api.send('ditto:open'));

  // the Pokédex: every species met (grey face) or caught (with its portrait), kept even after one leaves the team
  const dexFaces = {};
  function renderPokedex(state) {
    $('#pokedexHead').textContent = t('dex.pokedexHead', state.pokedexCount);
    $('#pokedexLine').textContent = t('dex.pokedexHint');
    const fmtDay = (ts) => (ts ? new Date(ts).toLocaleDateString(L() === 'zh' ? 'zh-CN' : 'en') : '');
    $('#pokedexList').replaceChildren(...state.pokedex.map((e) => {
      const got = e.caught > 0;
      const face = el('div', { class: 'fish-face' }, '❔');
      const k = `${e.dex}${e.shiny ? 's' : ''}`;
      dexFaces[k] ||= api.invoke('diary:portrait', e.dex, 'Normal', !!e.shiny);
      dexFaces[k].then((url) => { if (url) face.replaceChildren(el('img', { src: url, alt: '' })); });
      const name = e.names ? e.names[L()] || e.names.en : `#${e.dex}`;
      const tip = got ? t('dex.caughtTip', { n: e.caught, seen: e.seen, date: fmtDay(e.firstCaught) }) : t('dex.seenTip', { n: e.seen, date: fmtDay(e.firstSeen) });
      return el('div', { class: `fish mon${got ? ' got' : ' seen'}`, title: tip },
        face,
        el('b', {}, name + (e.shiny ? ' ✨' : '')),
        el('span', { class: 'hint' }, `#${String(e.dex).padStart(4, '0')} · ${got ? t('dex.caught') : t('dex.seen')}`));
    }), ...(state.pokedex.length ? [] : [el('p', { class: 'hint full' }, t('dex.pokedexEmpty'))]));
  }

  let dexKey = '';
  function renderDex(state) {
    const key = JSON.stringify([L(), state.achievements, state.souvenirs.length, state.photos.map((p) => [p.id, !!p.fav]), state.fishdex, state.pokedex]);
    if (key === dexKey) return;
    dexKey = key;
    renderAlbum(state);
    renderFishdex(state);
    const done = state.achievements.filter((a) => a.at).length;
    $('#achList').replaceChildren(
      el('p', { class: 'hint' }, t('dex.achProgress', { n: done, total: state.achievements.length })),
      ...state.achievements.map((a) => el('div', { class: `ach${a.at ? ' done' : ''}` },
        el('span', { class: 'ach-icon' }, a.at ? '🏅' : '🔒'),
        el('div', { class: 'ach-text' },
          el('b', {}, t(`ach.${a.id}`)),
          el('span', { class: 'hint' }, t(`achdesc.${a.id}`, { n: a.goal }))),
        el('div', { class: 'ach-side' },
          a.at ? el('span', { class: 'hint' }, new Date(a.at).toLocaleDateString(L() === 'zh' ? 'zh-CN' : 'en'))
            : el('span', { class: 'hint' }, `${a.progress}/${a.goal}`),
          el('span', { class: 'ach-reward' }, `+${a.reward} 🍓`)))));

    // souvenirs: one badge per region, with how many were brought back
    const count = {};
    for (const s of state.souvenirs) count[s.region] = (count[s.region] || 0) + 1;
    const regions = ['kanto', 'johto', 'hoenn', 'sinnoh', 'unova', 'kalos', 'alola', 'galar', 'paldea'];
    $('#souvenirList').replaceChildren(
      ...regions.map((r) => el('div', { class: `souvenir${count[r] ? ' got' : ''}` },
        el('span', {}, count[r] ? '🎐' : '❔'),
        el('b', {}, t(`region.${r}`)),
        el('span', { class: 'hint' }, count[r] ? `×${count[r]}` : ''))),
      ...(state.souvenirs.length ? [] : [el('p', { class: 'hint full' }, t('dex.noSouvenirs'))]));
  }

  // battles: the grass (with today's / this hour's encounters left) and a wild Pokémon waiting from an outing
  // the mini-game cards: each shows its Pokémon (the partner for the partner games, Pikachu while there's only an egg)
  const gameFaces = {};
  function renderGameFaces(state) {
    const id = state.settings.pokemon, rec = (state.pets || {})[id] || {};
    const own = rec.stage === 'egg' ? null : (rec.species && rec.species.dex) || ((state.custom || []).find((c) => c.id === id) || {}).dex;
    const shiny = !!(own && state.skins && state.skins[id] && state.skins[id].shiny);
    for (const btn of document.querySelectorAll('.game-btn')) {
      const partner = btn.dataset.dex === 'partner';
      const dex = partner ? own || 25 : Number(btn.dataset.dex);
      const sh = partner && own ? shiny : false;
      const k = `${dex}${sh ? 's' : ''}`;
      if (btn.dataset.face === k) continue;
      btn.dataset.face = k;
      gameFaces[k] ||= api.invoke('diary:portrait', dex, 'Normal', sh).catch(() => null);
      const img = btn.querySelector('.game-face');
      gameFaces[k].then((url) => { if (url && btn.dataset.face === k) { img.src = url; img.classList.add('on'); } });
    }
  }

  // the pixel-art tuft of grass on the "go to the grass" button: one character per pixel
  const GRASS = [
    '.....l.......l..',
    '..l..gl...l..gl.',
    '..gl.gg..lg..gg.',
    '.lgg.dg..gg.lgd.',
    '.ggd.dgl.gd.ggd.',
    'lgdd.ddg.dd.gdd.',
    'gdd.lddglddlgdd.',
    'gdd.gddgdddgddd.',
    'dddlgdddddddddd.',
    'ddddddddddddddd.',
    '.d.d.d.d.d.d.d..',
  ];
  const GRASS_INK = { l: '#9be36b', g: '#4cb648', d: '#2b7a3b' };
  function grassIcon() {
    const cv = el('canvas', { class: 'pixel-grass', width: GRASS[0].length, height: GRASS.length, 'aria-hidden': 'true' });
    const g = cv.getContext('2d');
    GRASS.forEach((row, y) => [...row].forEach((c, x) => { if (GRASS_INK[c]) { g.fillStyle = GRASS_INK[c]; g.fillRect(x, y, 1, 1); } }));
    return cv;
  }

  function renderBattleBar(state) {
    renderGameFaces(state);
    const f = state.fishing;
    const fm = (at) => Math.max(1, Math.ceil((at - Date.now()) / 60000));
    $('#fishLeft').textContent = f.left > 0 || f.dayLeft <= 0 ? (f.dayLeft > 0 ? t('fish.left', { n: f.dayLeft, max: f.max, h: f.hourLeft, hmax: f.hourMax }) : t('fish.tired'))
      : t('fish.rest', { m: fm(f.nextAt) });
    const q = state.quiz;
    $('#quizLeft').textContent = q.left > 0 || q.dayLeft <= 0 ? (q.dayLeft > 0 ? t('quiz.left', { n: q.dayLeft, max: q.max, h: q.hourLeft, hmax: q.hourMax }) : t('quiz.tired'))
      : t('quiz.rest', { m: fm(q.nextAt) });
    const c = state.catchGame;
    $('#catchLeft').textContent = c.left > 0 || c.dayLeft <= 0 ? (c.dayLeft > 0 ? t('catch.left', { n: c.dayLeft, max: c.max, h: c.hourLeft, hmax: c.hourMax }) : t('catch.tired'))
      : t('catch.rest', { m: fm(c.nextAt) });
    const m = state.memory;
    $('#memoryLeft').textContent = m.left > 0 || m.dayLeft <= 0 ? (m.dayLeft > 0 ? t('memory.left', { n: m.dayLeft, max: m.max, h: m.hourLeft, hmax: m.hourMax }) : t('memory.tired'))
      : t('memory.rest', { m: fm(m.nextAt) });
    const w = state.whack;
    $('#whackLeft').textContent = w.left > 0 || w.dayLeft <= 0 ? (w.dayLeft > 0 ? t('whack.left', { n: w.dayLeft, max: w.max, h: w.hourLeft, hmax: w.hourMax }) : t('whack.tired'))
      : t('whack.rest', { m: fm(w.nextAt) });
    const ty = state.types;
    $('#typesLeft').textContent = ty.left > 0 || ty.dayLeft <= 0 ? (ty.dayLeft > 0 ? t('types.left', { n: ty.dayLeft, max: ty.max, h: ty.hourLeft, hmax: ty.hourMax }) : t('types.tired'))
      : t('types.rest', { m: fm(ty.nextAt) });
    const rp = state.rps;
    $('#rpsLeft').textContent = rp.left > 0 || rp.dayLeft <= 0 ? (rp.dayLeft > 0 ? t('rps.left', { n: rp.dayLeft, max: rp.max, h: rp.hourLeft, hmax: rp.hourMax }) : t('rps.tired'))
      : t('rps.rest', { m: fm(rp.nextAt) });
    const fl = state.flip;
    $('#flipLeft').textContent = fl.left > 0 || fl.dayLeft <= 0 ? (fl.dayLeft > 0 ? t('flip.left', { n: fl.dayLeft, max: fl.max, h: fl.hourLeft, hmax: fl.hourMax }) : t('flip.tired'))
      : t('flip.rest', { m: fm(fl.nextAt) });
    const ec = state.echo;
    $('#echoLeft').textContent = ec.left > 0 || ec.dayLeft <= 0 ? (ec.dayLeft > 0 ? t('echo.left', { n: ec.dayLeft, max: ec.max, h: ec.hourLeft, hmax: ec.hourMax }) : t('echo.tired'))
      : t('echo.rest', { m: fm(ec.nextAt) });
    const sh = state.shuffle;
    $('#shuffleLeft').textContent = sh.left > 0 || sh.dayLeft <= 0 ? (sh.dayLeft > 0 ? t('shuffle.left', { n: sh.dayLeft, max: sh.max, h: sh.hourLeft, hmax: sh.hourMax }) : t('shuffle.tired'))
      : t('shuffle.rest', { m: fm(sh.nextAt) });
    const ju = state.jump;
    $('#jumpLeft').textContent = ju.left > 0 || ju.dayLeft <= 0 ? (ju.dayLeft > 0 ? t('jump.left', { n: ju.dayLeft, max: ju.max, h: ju.hourLeft, hmax: ju.hourMax }) : t('jump.tired'))
      : t('jump.rest', { m: fm(ju.nextAt) });
    const pz = state.puzzle;
    $('#puzzleLeft').textContent = pz.left > 0 || pz.dayLeft <= 0 ? (pz.dayLeft > 0 ? t('puzzle.left', { n: pz.dayLeft, max: pz.max, h: pz.hourLeft, hmax: pz.hourMax }) : t('puzzle.tired'))
      : t('puzzle.rest', { m: fm(pz.nextAt) });
    const hu = state.hunt;
    $('#huntLeft').textContent = hu.left > 0 || hu.dayLeft <= 0 ? (hu.dayLeft > 0 ? t('hunt.left', { n: hu.dayLeft, max: hu.max, h: hu.hourLeft, hmax: hu.hourMax }) : t('hunt.tired'))
      : t('hunt.rest', { m: fm(hu.nextAt) });
    const qa = state.quick;
    $('#quickLeft').textContent = qa.left > 0 || qa.dayLeft <= 0 ? (qa.dayLeft > 0 ? t('quick.left', { n: qa.dayLeft, max: qa.max, h: qa.hourLeft, hmax: qa.hourMax }) : t('quick.tired'))
      : t('quick.rest', { m: fm(qa.nextAt) });
    const li = state.lights;
    $('#lightsLeft').textContent = li.left > 0 || li.dayLeft <= 0 ? (li.dayLeft > 0 ? t('lights.left', { n: li.dayLeft, max: li.max, h: li.hourLeft, hmax: li.hourMax }) : t('lights.tired'))
      : t('lights.rest', { m: fm(li.nextAt) });
    const di = state.ditto;
    $('#dittoLeft').textContent = di.left > 0 || di.dayLeft <= 0 ? (di.dayLeft > 0 ? t('ditto.left', { n: di.dayLeft, max: di.max, h: di.hourLeft, hmax: di.hourMax }) : t('ditto.tired'))
      : t('ditto.rest', { m: fm(di.nextAt) });
    const g = state.grass;
    const e = state.encounter;
    const mins = (at) => Math.max(1, Math.ceil((at - Date.now()) / 60000));
    for (const bar of document.querySelectorAll('.battle-bar')) {
      bar.replaceChildren(
        ...(e ? [el('button', { class: 'primary', onclick: () => api.send('wild:open', true) },
          t('dex.battleWaiting', { name: e.names[L()] || e.names.en, m: mins(e.until) }))] : []),
        el('button', { class: 'secondary grass-btn', onclick: () => api.send('wild:open') }, grassIcon(), el('span', {}, t('dex.goWild'))),
        el('span', { class: 'hint' }, g.dayLeft > 0 && g.hourLeft <= 0 ? t('wild.error.rest', { m: mins(g.nextAt) })
          : `${t('wild.explore', { n: g.dayLeft, max: g.max })}${t('wild.hour', { h: g.hourLeft, hmax: g.hourMax })}`));
    }
  }

  return {
    render(state, tab) {
      if (tab === 'expedition') renderBattleBar(state);
      if (tab === 'shop') renderShop(state);
      if (tab === 'today') renderToday(state);
      if (tab === 'expedition') renderExpedition(state);
      if (tab === 'dex') renderDex(state);
    },
    /** called every second while the panel is open (expedition countdown) */
    tick(state, tab) {
      if (tab === 'expedition' && state && state.expedition) renderExpedition(state);
      if (tab === 'expedition' && state) renderBattleBar(state);
    }
  };
};
