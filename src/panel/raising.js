/* PokePet Explorer – raising parts of the control panel: shop (Care tab), Expedition tab, Dex tab. */
window.PanelRaising = function PanelRaising(env) {
  const { api, el, t, L } = env;
  const $ = (sel) => document.querySelector(sel);

  const ATTR_ICON = { cool: '😎', cute: '🎀', smart: '📚', tough: '💪' };
  const levelOf = (xp) => 1 + Math.floor(Math.sqrt((xp || 0) / 25));

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
    const buyable = Object.entries(state.items).filter(([, item]) => item.cost > 0);
    $('#shopItems').replaceChildren(...buyable.map(([id, item]) => {
      const have = state.inventory[id] || 0;
      const buy = (n) => el('button', {
        class: 'ghost', disabled: state.berries < item.cost * n ? true : null,
        onclick: async () => {
          const res = await api.invoke('shop:buy', id, n);
          if (!res.ok) flash('#careMsg', t(`care.refused.${res.reason}`));
        }
      }, `+${n}`);
      return el('div', { class: 'shop-item' },
        el('span', { class: 'si-name' }, t(`item.${id}`)),
        el('span', { class: 'si-have' }, have ? t('shop.have', { n: have }) : ''),
        el('span', { class: 'si-cost' }, `${item.cost} 🍓`),
        el('span', { class: 'si-buy' }, buy(1), buy(5)));
    }));
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

  let dexKey = '';
  function renderDex(state) {
    const key = JSON.stringify([L(), state.achievements, state.souvenirs.length, state.photos.map((p) => [p.id, !!p.fav]), state.fishdex]);
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

  return {
    render(state, tab) {
      if (tab === 'care') renderShop(state);
      if (tab === 'expedition') renderExpedition(state);
      if (tab === 'dex') renderDex(state);
    },
    /** called every second while the panel is open (expedition countdown) */
    tick(state, tab) {
      if (tab === 'expedition' && state && state.expedition) renderExpedition(state);
    }
  };
};
