/* PokePet Explorer – control panel. Tabs: work (Pomodoro + to-dos) | care, expedition, dex, Pokémon,
 * diary (raising & fun, see care-diary.js and raising.js) | settings. */
(() => {
  const api = window.api;
  const I18N = window.PokeI18N;
  const SP = window.PokeSprites;
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  let state = null;
  // the timer and the to-do list share the "work" tab; older names still open it
  const TAB_ALIAS = { focus: 'work', todos: 'work' };
  const requestedTab = new URLSearchParams(location.search).get('tab') || 'work';
  let tab = TAB_ALIAS[requestedTab] || requestedTab;
  let filter = 'open';
  const imageCache = {};   // custom id -> data URL

  const L = () => (state ? state.settings.lang : 'en');
  const t = (k, v) => I18N.t(L(), k, v);

  // the games' "medium fast" curve, as in src/main/growth.js: Lv n needs n³ − 1 XP, up to Lv100
  const xpAt = (lv) => Math.min(100, lv) ** 3 - 1;
  const levelOf = (xp) => { let l = 1; while (l < 100 && xpAt(l + 1) <= (xp || 0)) l++; return l; };

  function el(tag, attrs = {}, ...children) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') e.className = v;
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else if (v != null && v !== false) e.setAttribute(k, v === true ? '' : v);
    }
    for (const c of children.flat()) if (c != null) e.append(c);
    return e;
  }

  function fmt(ms) {
    const s = Math.max(0, Math.ceil(ms / 1000));
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  }

  const isEgg = (id) => !!(state.pets[id] && state.pets[id].stage === 'egg');

  function petName(id) {
    if (isEgg(id)) return t('egg.name');
    const sp = state.pets[id] && state.pets[id].species;   // evolved
    if (sp) return sp.names[L()] || sp.names.en;
    if (SP.DEFS[id]) return SP.DEFS[id].name[L()];
    const c = state.custom.find((x) => x.id === id);
    return c ? c.names[L()] || c.names.en : id;
  }

  /** The egg's spot colour comes from its id – its species isn't known yet. */
  const eggSeed = (id) => [...id].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7);

  function dexOf(id) {
    if (SP.DEFS[id]) return SP.DEFS[id].dex;
    const c = state.custom.find((x) => x.id === id);
    return c ? c.dex : null;
  }

  // ---------------------------------------------------------------- sprites in the panel
  const assetCache = {};   // "id|source|shiny|species" -> promise of asset

  function assets(id) {
    const sk = state.skins[id] || {};
    const sp = state.pets[id] && state.pets[id].species;   // evolving changes the sprite, too
    const key = `${id}|${sk.source}|${sk.shiny}|${sp ? sp.dex : ''}`;
    if (!assetCache[key]) assetCache[key] = api.invoke('pokemon:assets', id);
    return assetCache[key];
  }

  function fitInto(canvas, src, sx, sy, sw, sh, smooth) {
    const g = canvas.getContext('2d');
    g.imageSmoothingEnabled = !!smooth;
    g.clearRect(0, 0, canvas.width, canvas.height);
    const k = Math.min((canvas.width - 6) / sw, (canvas.height - 6) / sh);
    const dw = Math.round(sw * k), dh = Math.round(sh * k);
    g.drawImage(src, sx, sy, sw, sh, Math.round((canvas.width - dw) / 2), Math.round((canvas.height - dh) / 2), dw, dh);
  }

  function alphaBox(src, x, y, w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    g.drawImage(src, x, y, w, h, 0, 0, w, h);
    const d = g.getImageData(0, 0, w, h).data;
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) {
      if (d[(yy * w + xx) * 4 + 3] > 20) {
        x0 = Math.min(x0, xx); x1 = Math.max(x1, xx); y0 = Math.min(y0, yy); y1 = Math.max(y1, yy);
      }
    }
    return x1 < 0 ? { x0: x, y0: y, w, h } : { x0: x + x0, y0: y + y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  }

  /** A fresh element showing the Pokémon's current sprite. */
  // foldable sections (Dex tab): remember which ones are open
  for (const d of document.querySelectorAll('details.fold')) {
    const key = `fold:${d.dataset.fold}`;
    try { const v = localStorage.getItem(key); if (v !== null) d.open = v === '1'; } catch { /* storage unavailable */ }
    d.addEventListener('toggle', () => { try { localStorage.setItem(key, d.open ? '1' : '0'); } catch { /* ignore */ } });
  }

  function spriteNode(id, size) {
    const cv = el('canvas', { width: String(size), height: String(size) });
    const holder = el('div', { class: 'sprite-box', style: `width:${size}px;height:${size}px` }, cv);
    if (isEgg(id)) {
      const img = SP.ballRgba(eggSeed(id), 0);
      const c = document.createElement('canvas');
      c.width = img.width; c.height = img.height;
      c.getContext('2d').putImageData(new ImageData(img.data, img.width, img.height), 0, 0);
      fitInto(cv, c, 0, 0, img.width, img.height, false);
      return holder;
    }
    assets(id).then((asset) => {
      if (!asset || asset.kind !== 'pmd') {
        // sprite still downloading: its Poké Ball meanwhile
        const img = SP.ballRgba(eggSeed(id), 0);
        const c = document.createElement('canvas');
        c.width = img.width; c.height = img.height;
        c.getContext('2d').putImageData(new ImageData(img.data, img.width, img.height), 0, 0);
        fitInto(cv, c, 0, 0, img.width, img.height, false);
      } else {
        const a2 = asset.anims.Idle || Object.values(asset.anims)[0];
        const im = new Image();
        im.onload = () => {
          const box = alphaBox(im, 0, 0, a2.fw, a2.fh);
          fitInto(cv, im, box.x0, box.y0, box.w, box.h, false);
        };
        im.src = a2.url;
      }
    });
    return holder;
  }

  // ---------------------------------------------------------------- i18n & tabs
  function applyI18n() {
    document.documentElement.lang = L() === 'zh' ? 'zh-CN' : 'en';
    document.title = t('appName');
    $$('[data-i18n]').forEach((e) => { e.textContent = t(e.dataset.i18n); });
    $$('[data-i18n-placeholder]').forEach((e) => { e.placeholder = t(e.dataset.i18nPlaceholder); });
    $$('[data-i18n-title]').forEach((e) => { e.title = t(e.dataset.i18nTitle); });
  }

  let prevTab = null;
  function showTab(name) {
    if (name === 'diary-last') {
      name = 'diary';
      if (typeof ext !== 'undefined') ext.showWeek(-1);
    }
    const wanted = name;
    name = TAB_ALIAS[name] || name;
    tab = name;
    $$('.tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
    $$('.tab').forEach((s) => s.classList.toggle('active', s.id === `tab-${name}`));
    if (name !== prevTab) { const m = document.querySelector('main'); if (m) m.scrollTop = 0; window.scrollTo(0, 0); }
    prevTab = name;
    if (state && typeof ext !== 'undefined') { ext.render(state, name); raising.render(state, name); }
    if (wanted === 'todos') {
      setTimeout(() => { $('#todoHead').scrollIntoView({ block: 'start' }); $('#todoText').focus(); }, 50);
    }
  }
  $$('.tabs button').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));
  api.on('panel:tab', showTab);

  // ---------------------------------------------------------------- hero
  let heroId = null;
  function renderHero() {
    const id = state.settings.pokemon;
    const emotion = ext.moodEmotion(state);
    const rec = state.pets[id] || {};
    const heroKey = `${id}|${emotion}|${JSON.stringify(state.skins[id])}|${rec.stage}|${rec.species ? rec.species.dex : ''}`;
    if (heroId !== heroKey) {
      heroId = heroKey;
      const node = spriteNode(id, 58);
      node.id = 'heroSprite';
      $('#heroSprite').replaceWith(node);
      // show the PMD portrait with the current emotion when there is one
      ext.portraitFor(id, emotion).then((url) => {
        if (!url || heroId !== heroKey) return;
        $('#heroSprite').replaceChildren(el('img', { src: url, alt: emotion, title: emotion, class: 'portrait' }));
      });
    }
    const xp = state.pets[id]?.xp || 0;
    const lv = levelOf(xp);
    const base = xpAt(lv), next = xpAt(lv + 1);
    $('#heroName').textContent = petName(id);
    $('#heroLevel').textContent = t('poke.level', { n: lv });
    $('#heroXp').style.width = `${Math.round(((xp - base) / Math.max(1, next - base)) * 100)}%`;
    $('#heroXpText').textContent = `${t('poke.xp', { xp, next })} · ${t('poke.growth', { n: Math.round((state.growthRate ?? 1) * 100) })}`;
    $('#heroBerries').textContent = `🍓 ${state.berries}`;
    const m = state.mood;
    $('#heroMood').textContent = `${m >= 70 ? '😊' : m >= 40 ? '🙂' : m >= 20 ? '😕' : '😢'} ${m}`;
  }

  // ---------------------------------------------------------------- focus tab
  const RING = 2 * Math.PI * 52;
  $('#ringFg').style.strokeDasharray = RING;

  function timeLeft() {
    const tm = state.timer;
    if (tm.phase === 'idle') return state.pomodoro.focus * 60000;
    return tm.paused ? tm.remaining : Math.max(0, tm.endsAt - Date.now());
  }

  function renderClock() {
    if (!state) return;
    const tm = state.timer;
    const left = timeLeft();
    const frac = tm.phase === 'idle' ? 0 : 1 - left / tm.total;
    $('#timeLabel').textContent = fmt(left);
    $('#phaseLabel').textContent = tm.paused ? t('pomo.paused') : t(`phase.${tm.phase}`);
    const fg = $('#ringFg');
    fg.style.strokeDashoffset = RING * (1 - frac);
    fg.classList.toggle('break', tm.phase === 'short' || tm.phase === 'long');
    document.title = tm.phase === 'idle' ? t('appName') : `${fmt(left)} · ${t('appName')}`;
  }

  function renderFocus() {
    const tm = state.timer;
    const every = state.pomodoro.longEvery;
    let n = (tm.round % every) + (tm.phase === 'focus' ? 1 : 0);
    if (n === 0) n = tm.round > 0 ? every : 1;
    $('#roundLabel').textContent = t('pomo.round', { n, m: every });

    const c = $('#timerControls');
    c.innerHTML = '';
    const btn = (label, cls, fn) => el('button', { class: cls, onclick: fn }, label);
    if (tm.phase === 'idle') {
      c.append(
        btn(`▶ ${t('pomo.start')}`, 'primary', () => api.send('timer:cmd', 'start', $('#taskSelect').value || null)),
        btn(`☕ ${t('pomo.startBreak')}`, 'secondary', () => api.send('timer:cmd', 'break'))
      );
    } else {
      c.append(
        tm.paused
          ? btn(`▶ ${t('pomo.resume')}`, 'primary', () => api.send('timer:cmd', 'resume'))
          : btn(`⏸ ${t('pomo.pause')}`, 'primary', () => api.send('timer:cmd', 'pause')),
        btn(`⏭ ${t('pomo.skip')}`, 'secondary', () => api.send('timer:cmd', 'skip')),
        btn(`⏹ ${t('pomo.stop')}`, 'ghost', () => api.send('timer:cmd', 'stop'))
      );
    }

    const sel = $('#taskSelect');
    sel.innerHTML = '';
    sel.append(el('option', { value: '' }, t('pomo.noTask')));
    for (const td of state.todos.filter((x) => !x.done)) {
      sel.append(el('option', { value: td.id }, `${td.text}${td.pomos ? `  (${td.pomos}🍅)` : ''}`));
    }
    sel.value = tm.taskId && state.todos.some((x) => x.id === tm.taskId && !x.done) ? tm.taskId : '';

    const today = state.stats.todayPomos;
    $('#todayTomatoes').textContent = today ? (today <= 12 ? '🍅'.repeat(today) : `🍅 × ${today}`) : '—';

    for (const input of $$('[data-pomo]')) {
      if (document.activeElement !== input) input.value = state.pomodoro[input.dataset.pomo];
    }
    $('#autoBreak').checked = state.pomodoro.autoBreak;
    renderClock();
  }

  $('#taskSelect').addEventListener('change', (e) => api.send('timer:cmd', 'set-task', e.target.value || null));
  $$('[data-pomo]').forEach((input) => input.addEventListener('change', () => {
    api.send('pomodoro:set', { [input.dataset.pomo]: Number(input.value) });
  }));
  $('#autoBreak').addEventListener('change', (e) => api.send('pomodoro:set', { autoBreak: e.target.checked }));
  $$('[data-sound]').forEach((b) => b.addEventListener('click', () => window.PokeSound.preview(b.dataset.sound)));

  // ---------------------------------------------------------------- todos tab
  let editing = null;
  let dragId = null;

  function dueLabel(due) {
    const d = new Date(due);
    const now = new Date();
    const sameDay = d.toDateString() === now.toDateString();
    const time = d.toLocaleTimeString(L() === 'zh' ? 'zh-CN' : 'en', { hour: '2-digit', minute: '2-digit' });
    return sameDay ? time : `${d.toLocaleDateString(L() === 'zh' ? 'zh-CN' : 'en', { month: 'short', day: 'numeric' })} ${time}`;
  }

  function renderTodos() {
    if (editing) return;   // don't disturb inline editing
    $$('#todoFilter button').forEach((b) => b.classList.toggle('active', b.dataset.filter === filter));
    const list = $('#todoList');
    list.innerHTML = '';
    const items = state.todos.filter((x) => (filter === 'open' ? !x.done : x.done));
    if (filter === 'done') items.sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0));
    for (const td of items) list.append(todoItem(td));
    $('#todoEmpty').textContent = items.length ? '' : t(filter === 'open' ? 'todo.empty' : 'todo.emptyDone');
    $('#clearDone').style.display = filter === 'done' && items.length ? '' : 'none';
  }

  function todoItem(td) {
    const isCurrent = state.timer.phase === 'focus' && state.timer.taskId === td.id;
    const meta = [];
    if (td.pomos) meta.push(el('span', {}, t('todo.pomos', { n: td.pomos })));
    if (td.due) {
      const over = !td.done && td.due < Date.now();
      meta.push(el('span', { class: over ? 'overdue' : '' }, `⏰ ${dueLabel(td.due)}${over ? ` · ${t('todo.overdue')}` : ''}`));
    }
    const text = el('div', { class: 'text', title: t('todo.edit') }, td.text);
    const li = el('li', {
      class: `todo${td.done ? ' done' : ''}${isCurrent ? ' current' : ''}`,
      draggable: !td.done ? 'true' : null,
      'data-id': td.id
    },
    el('button', {
      class: 'box',
      'aria-label': 'done',
      onclick: () => api.send('todo:set-done', td.id, !td.done)
    }, '✓'),
    el('div', { class: 'body' }, text, meta.length ? el('div', { class: 'meta' }, meta) : null),
    !td.done ? el('button', {
      class: 'act', title: t('todo.focusOn'),
      onclick: () => { api.send('timer:cmd', 'start', td.id); showTab('focus'); }
    }, '▶') : null,
    el('button', { class: 'act', title: t('todo.delete'), onclick: () => api.send('todo:delete', td.id) }, '✕'));

    text.addEventListener('dblclick', () => startEdit(li, td));
    li.addEventListener('dragstart', () => { dragId = td.id; li.classList.add('dragging'); });
    li.addEventListener('dragend', () => { li.classList.remove('dragging'); dragId = null; });
    li.addEventListener('dragover', (e) => {
      if (!dragId || dragId === td.id || td.done) return;
      e.preventDefault();
      const dragged = $(`.todo[data-id="${dragId}"]`);
      const r = li.getBoundingClientRect();
      li.parentNode.insertBefore(dragged, e.clientY < r.top + r.height / 2 ? li : li.nextSibling);
    });
    li.addEventListener('drop', (e) => {
      e.preventDefault();
      const ids = $$('#todoList .todo').map((x) => x.dataset.id);
      api.send('todo:reorder', ids);
    });
    return li;
  }

  function startEdit(li, td) {
    editing = td.id;
    const input = el('input', { class: 'edit', value: td.text, maxlength: '200' });
    const text = li.querySelector('.text');
    text.replaceWith(input);
    input.focus();
    input.select();
    const finish = (save) => {
      if (editing !== td.id) return;
      editing = null;
      if (save && input.value.trim() && input.value.trim() !== td.text) {
        api.send('todo:edit', td.id, { text: input.value });
      } else {
        renderTodos();
      }
    };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') finish(true);
      if (e.key === 'Escape') finish(false);
    });
    input.addEventListener('blur', () => finish(true));
  }

  $('#todoForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const text = $('#todoText').value.trim();
    if (!text) return;
    const dueVal = $('#todoDue').value;
    api.send('todo:add', { text, due: dueVal ? new Date(dueVal).getTime() : null });
    $('#todoText').value = '';
    $('#todoDue').value = '';
    $('.due-toggle').classList.remove('set');
    filter = 'open';
  });
  $('#todoDue').addEventListener('change', (e) => {
    $('.due-toggle').classList.toggle('set', !!e.target.value);
    $('.due-toggle').title = e.target.value ? dueLabel(new Date(e.target.value).getTime()) : t('todo.due');
  });
  $('.due-toggle').addEventListener('click', () => {
    try { $('#todoDue').showPicker(); } catch { /* not supported */ }
  });
  $$('#todoFilter button').forEach((b) => b.addEventListener('click', () => { filter = b.dataset.filter; renderTodos(); }));
  $('#clearDone').addEventListener('click', () => api.send('todo:clear-done'));

  // ---------------------------------------------------------------- pokémon tab
  let pokeKey = '';
  function renderPokemon() {
    const all = state.custom.map((c) => ({ id: c.id, builtin: false }));
    const key = JSON.stringify([L(), state.settings.pokemon, all.map((p) => p.id),
      Object.fromEntries(Object.entries(state.pets).map(([k, v]) => [k, [v.xp, v.stage, v.attrs, v.species]])), state.skins, state.expedition, state.party]);
    if (key === pokeKey) return;
    pokeKey = key;
    const grid = $('#pokeGrid');
    grid.innerHTML = '';
    for (const p of all) {
      const xp = state.pets[p.id]?.xp || 0;
      const lv = levelOf(xp);
      const pct = Math.round(((xp - xpAt(lv)) / Math.max(1, xpAt(lv + 1) - xpAt(lv))) * 100);
      const cv = spriteNode(p.id, 72);
      const selected = state.settings.pokemon === p.id;
      const card = el('div', { class: `poke${selected ? ' selected' : ''}`, onclick: () => api.send('pokemon:select', p.id) },
        selected ? el('span', { class: 'badge' }, t('poke.selected')) : null,
        all.length > 1 ? el('button', {
          class: 'rm', title: t('poke.remove'),
          onclick: (e) => { e.stopPropagation(); api.send('pokemon:remove', p.id); }
        }, '✕') : null,
        cv,
        el('div', { class: 'n' }, petName(p.id), state.skins[p.id]?.shiny && !isEgg(p.id) ? el('span', { class: 'shiny', title: t('poke.shiny') }, ' ✨') : null),
        el('div', { class: 'l' }, isEgg(p.id) ? t('egg.hatchAt', { n: lv, h: state.hatchLevel }) : t('poke.level', { n: lv })),
        el('div', { class: 'bar' }, el('div', { style: `width:${pct}%` })),
        attrLine(p.id),
        isEgg(p.id) ? null : el('button', {
          class: `party-btn${state.party.includes(p.id) ? ' on' : ''}`,
          onclick: (e) => { e.stopPropagation(); api.send('party:toggle', p.id); }
        }, state.party.includes(p.id) ? t('poke.partyOn') : t('poke.partyOff')),

        creditLines(state.skins[p.id]?.credits));
      grid.append(card);
    }
  }

  /** Contest stats (😎 cool, 🎀 cute, 📚 smart, 💪 tough), and 🧭 when away. */
  function attrLine(id) {
    const rec = state.pets[id];
    const away = state.expedition && state.expedition.petId === id;
    if (!rec || !rec.attrs) return away ? el('div', { class: 'attrs' }, '🧭') : null;
    const icons = { cool: '😎', cute: '🎀', smart: '📚', tough: '💪' };
    return el('div', { class: 'attrs', title: Object.keys(icons).map((a) => `${t(`attr.${a}`)} ${rec.attrs[a] || 0}`).join(' · ') },
      away ? '🧭 ' : '', Object.entries(icons).map(([a, ic]) => `${ic}${rec.attrs[a] || 0}`).join(' '));
  }

  /** PMD SpriteCollab artists (CC BY-NC 4.0 attribution) for a card. */
  function creditLines(c) {
    if (!c) return null;
    const who = (cr) => cr.names.join(', ') + (cr.more ? ` ${t('credit.more', { n: cr.more })}` : '');
    const lines = [];
    if (c.sprite) lines.push(t('credit.sprite', { names: who(c.sprite) }));
    if (c.portrait) lines.push(t('credit.portrait', { names: who(c.portrait) }));
    if (!lines.length) return null;
    return el('div', { class: 'credit', title: `${lines.join('\n')}\n${t('credit.source')}` },
      lines.map((l) => el('div', {}, l)));
  }





  // ---------------------------------------------------------------- settings tab
  function renderSettings() {
    const s = state.settings;
    $('#setLang').value = s.lang;
    $$('#setScale button').forEach((b) => b.classList.toggle('active', Number(b.dataset.scale) === s.scale));
    const rem = $('#setReminder');
    rem.innerHTML = '';
    for (const n of [0, 15, 30, 45, 60, 90, 120]) {
      rem.append(el('option', { value: n }, n ? t('set.reminderEvery', { n }) : t('set.reminderOff')));
    }
    rem.value = s.reminderMin;
    $('#setWalk').checked = s.walk;
    $('#setSound').checked = s.sound;
    $('#setReact').checked = s.reactInput;
    $('#setLogin').checked = s.launchAtLogin;
    $('#setFullscreen').checked = s.hideOnFullscreen;
    $('#setUpdates').checked = s.checkUpdates;
    renderUpdate();
    renderAI();
    renderWeather();
    $('#stToday').textContent = state.stats.todayPomos;
    $('#stPomos').textContent = state.stats.totalPomos;
    $('#stMinutes').textContent = state.stats.focusMinutes;
    $('#stTodos').textContent = state.stats.todosDone;
  }

  $('#setLang').addEventListener('change', (e) => api.send('settings:set', { lang: e.target.value }));
  $$('#setScale button').forEach((b) => b.addEventListener('click', () => api.send('settings:set', { scale: Number(b.dataset.scale) })));
  $('#setReminder').addEventListener('change', (e) => api.send('settings:set', { reminderMin: Number(e.target.value) }));
  $('#setWalk').addEventListener('change', (e) => api.send('settings:set', { walk: e.target.checked }));
  $('#setSound').addEventListener('change', (e) => api.send('settings:set', { sound: e.target.checked }));
  $('#setReact').addEventListener('change', (e) => api.send('settings:set', { reactInput: e.target.checked }));
  $('#setLogin').addEventListener('change', (e) => api.send('settings:set', { launchAtLogin: e.target.checked }));
  $('#setFullscreen').addEventListener('change', (e) => api.send('settings:set', { hideOnFullscreen: e.target.checked }));
  $('#resetPos').addEventListener('click', () => api.send('pet:reset-pos'));
  $('#goStarter').addEventListener('click', () => api.send('starter:open'));

  // ---------------------------------------------------------------- weather & holidays
  const WX_ICON = { clear: '☀️', cloudy: '☁️', fog: '🌫️', rain: '🌧️', snow: '❄️', storm: '⛈️' };
  function renderWeather() {
    const w = state.settings.weather;
    $('#setGreetings').checked = state.settings.greetings;
    $('#wxEnabled').checked = w.enabled;
    $('#wxForm').classList.toggle('hidden', !w.enabled);
    if (document.activeElement !== $('#wxCity') && !$('#wxCity').value) $('#wxCity').value = w.city || '';
    const now = state.weatherNow;
    $('#wxStatus').textContent = !w.enabled ? '' : !w.place ? t('wx.noCity')
      : now ? `${w.place} · ${WX_ICON[now.kind] || ''} ${now.temp}°C` : w.place;
  }
  $('#setGreetings').addEventListener('change', (e) => api.send('settings:set', { greetings: e.target.checked }));
  $('#wxEnabled').addEventListener('change', (e) => api.send('settings:set', { weather: { enabled: e.target.checked } }));
  $('#wxForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    $('#wxStatus').textContent = t('ai.working');
    const res = await api.invoke('weather:city', $('#wxCity').value);
    $('#wxStatus').textContent = res.ok ? res.place : t(`wx.error.${res.error}`);
  });

  // ---------------------------------------------------------------- AI chat (optional)
  const AI_PROVIDERS = ['anthropic', 'openai', 'gemini', 'deepseek', 'moonshot', 'qwen', 'zhipu', 'siliconflow',
    'openrouter', 'groq', 'mistral', 'xai', 'ollama', 'lmstudio', 'custom'];
  let aiKey = '';
  function renderAI() {
    const a = state.settings.ai;
    const info = state.ai.providers[a.provider] || {};
    $('#aiEnabled').checked = a.enabled;
    $('#aiFields').classList.toggle('hidden', !a.enabled);
    const sel = $('#aiProvider');
    const key = `${L()}|${a.provider}`;
    if (sel.dataset.key !== key) {
      sel.dataset.key = key;
      sel.replaceChildren(...AI_PROVIDERS.map((p) => el('option', { value: p }, t(`ai.p.${p}`))));
      sel.value = a.provider;
      $('#aiUrl').value = a.baseUrl || info.url || '';
      $('#aiModel').value = a.model || (info.models[0] || '');
      $('#aiModelList').replaceChildren(...info.models.map((m) => el('option', { value: m })));
    }
    $('#aiUrlRow').classList.toggle('hidden', a.provider === 'anthropic');
    $('#aiKeyRow').classList.toggle('hidden', !!info.noKey);
    $('#aiKey').placeholder = state.ai.hasKey ? t('ai.keySaved') : t('ai.keyPlaceholder');
  }
  const aiPatch = (patch) => api.send('settings:set', { ai: { ...state.settings.ai, ...patch } });
  const aiMsg = (text) => { $('#aiStatus').textContent = text; };
  $('#aiEnabled').addEventListener('change', (e) => aiPatch({ enabled: e.target.checked }));
  $('#aiProvider').addEventListener('change', (e) => {
    const info = state.ai.providers[e.target.value] || {};
    aiPatch({ provider: e.target.value, baseUrl: info.url || '', model: (info.models || [])[0] || '' });
    aiMsg('');
  });
  $('#aiUrl').addEventListener('change', (e) => aiPatch({ baseUrl: e.target.value }));
  $('#aiModel').addEventListener('change', (e) => aiPatch({ model: e.target.value }));
  $('#aiKey').addEventListener('input', (e) => { aiKey = e.target.value; });
  $('#aiSaveKey').addEventListener('click', async () => {
    await api.invoke('ai:set-key', state.settings.ai.provider, aiKey);
    $('#aiKey').value = ''; aiKey = '';
    aiMsg(t('ai.keyStored'));
  });
  $('#aiFetch').addEventListener('click', async () => {
    aiMsg(t('ai.working'));
    const res = await api.invoke('ai:models');
    if (!res.ok) { aiMsg(t(`chat.error.${res.error}`)); return; }
    $('#aiModelList').replaceChildren(...res.models.map((m) => el('option', { value: m })));
    aiMsg(t('ai.models', { n: res.models.length }));
    $('#aiModel').focus();
  });
  $('#aiTest').addEventListener('click', async () => {
    aiMsg(t('ai.working'));
    const res = await api.invoke('ai:test');
    aiMsg(res.ok ? `✓ ${res.text}` : t(`chat.error.${res.error}`));
  });
  $('#aiOpen').addEventListener('click', () => api.send('ai:open'));

  // ---------------------------------------------------------------- updates
  function renderUpdate() {
    const u = state.update || { status: 'idle' };
    $('#updVersion').textContent = t('upd.current', { v: state.version });
    $('#updCheck').disabled = u.status === 'checking' || u.status === 'downloading';
    const msg = {
      idle: '', checking: t('upd.checking'), none: t('upd.none'),
      available: u.canDownload ? t('upd.available', { v: u.version }) : t('upd.availableNoFile', { v: u.version }),
      downloading: t('upd.downloading', { n: Math.round((u.progress || 0) * 100) }),
      downloaded: t('upd.downloaded'), installing: t('upd.installing'), error: t('upd.error')
    }[u.status] || '';
    const stageMsg = u.stage === 'auto-failed' ? t('upd.autoFailed', { v: u.version }) : u.stage === 'manual-failed' ? t('upd.manualFailed', { v: u.version }) : null;
    $('#updStatus').textContent = stageMsg || (u.error && u.status === 'available' ? `${msg} ${t('upd.error')}` : msg);
    // installing by hand didn't work either: download it from GitHub
    $('#updTrouble').classList.toggle('hidden', u.stage !== 'manual-failed');
    const bar = $('#updProgress');
    bar.classList.toggle('hidden', u.status !== 'downloading');
    bar.firstElementChild.style.width = `${Math.round((u.progress || 0) * 100)}%`;
    const dl = $('#updDownload');
    dl.classList.toggle('hidden', !(u.status === 'available' && u.canDownload) && u.status !== 'downloaded');
    dl.textContent = u.status === 'downloaded' ? (u.stage ? t('upd.installManual', { v: u.version }) : t('upd.show')) : t('upd.download', { v: u.version });
  }
  $('#updCheck').addEventListener('click', () => api.invoke('update:check'));
  // help and feedback: the wiki and the issue tracker on GitHub (main opens them; only these two)
  for (const a of document.querySelectorAll('[data-link]')) {
    a.addEventListener('click', (e) => { e.preventDefault(); api.send('link:open', a.dataset.link); });
  }
  $('#updTrouble').addEventListener('click', (e) => { e.preventDefault(); api.send('update:page'); });
  $('#updDownload').addEventListener('click', () => {
    if ((state.update || {}).status === 'downloaded') api.send('update:show');
    else api.invoke('update:download');
  });
  $('#setUpdates').addEventListener('change', (e) => api.send('settings:set', { checkUpdates: e.target.checked }));

  // a small box that appears after a few quick clicks on the "About" heading
  let aboutClicks = 0, aboutTimer = null;
  $('#aboutTitle').addEventListener('click', () => {
    clearTimeout(aboutTimer);
    aboutTimer = setTimeout(() => { aboutClicks = 0; }, 1500);
    if (++aboutClicks >= 7) {
      aboutClicks = 0;
      $('#extraForm').classList.remove('hidden');
      $('#extraInput').focus();
    }
  });
  $('#extraForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = $('#extraInput');
    input.disabled = true;
    const res = await api.invoke('settings:extra', input.value);
    input.disabled = false;
    input.classList.add(res.ok ? 'ok' : 'no');
    setTimeout(() => input.classList.remove('ok', 'no'), 900);
    if (res.ok) { input.value = ''; $('#extraForm').classList.add('hidden'); }
  });

  // ---------------------------------------------------------------- state
  let lastLang = null;
  const ext = window.PanelExt({ api, el, t, L, getState: () => state, petName, spriteNode });
  const raising = window.PanelRaising({ api, el, t, L, getState: () => state, petName });
  function render() {
    if (L() !== lastLang) {
      lastLang = L();
      applyI18n();
      pokeKey = '';
    }
    // before the starter is chosen there's nobody to look after: send the trainer to the professor
    const noPet = !state.custom.some((c) => c.id === state.settings.pokemon);
    $('#noPet').classList.toggle('hidden', !noPet);
    document.body.classList.toggle('no-pet-mode', noPet);
    if (noPet) return;
    renderHero();
    renderFocus();
    renderTodos();
    renderPokemon();
    renderSettings();
    ext.render(state, tab);
    raising.render(state, tab);
  }

  api.on('state', (s) => { state = s; render(); });
  setInterval(() => { renderClock(); raising.tick(state, tab); }, 500);

  (async () => {
    state = await api.invoke('state:get');
    if (tab === 'diary-last') ext.showWeek(-1);
    render();
    showTab(tab);
  })();
})();
