/* PokePet – Care and Diary tabs of the control panel. */
window.PanelExt = function PanelExt(env) {
  const { api, el, t, L } = env;
  const I18N = window.PokeI18N;
  const SP = window.PokeSprites;
  const $ = (sel) => document.querySelector(sel);
  const NS = 'http://www.w3.org/2000/svg';

  const svg = (tag, attrs = {}) => {
    const e = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    return e;
  };

  const locale = () => (L() === 'zh' ? 'zh-CN' : 'en');
  const parseKey = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
  const keyOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const addDays = (k, n) => { const d = parseKey(k); d.setDate(d.getDate() + n); return keyOf(d); };
  const today = () => keyOf(new Date());
  const fmtDay = (k, opts) => parseKey(k).toLocaleDateString(locale(), opts);
  const hhmm = (ts) => new Date(ts).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' });

  // ================================================================ EMOTIONS
  /** PMD portrait emotion that matches how the pet is doing. */
  function moodEmotion(state, petId = state.settings.pokemon) {
    const c = (state.pets[petId] && state.pets[petId].care) || {};
    const m = state.mood;
    if (c.fainted) return 'Dizzy';
    if (c.sick) return 'Pain';
    if (c.pooped) return 'Worried';
    if (c.hunger < 25) return 'Sad';
    if (c.clean < 25) return 'Worried';
    return m >= 80 ? 'Joyous' : m >= 60 ? 'Happy' : m >= 35 ? 'Normal' : m >= 20 ? 'Sad' : 'Crying';
  }

  function dayEmotion(day) {
    const m = day.moodN ? day.moodSum / day.moodN : null;
    if (m == null) return null;
    if (day.fainted || day.sick) return 'Pain';
    return m >= 80 ? 'Joyous' : m >= 60 ? 'Happy' : m >= 40 ? 'Normal' : m >= 25 ? 'Sad' : 'Crying';
  }

  // ================================================================ CARE
  let careMsgTimer = null;

  function bar(label, value, icon) {
    const v = Math.round(value);
    const low = v < 25;
    return el('div', { class: `care-bar${low ? ' low' : ''}` },
      el('div', { class: 'care-bar-head' },
        el('span', {}, `${icon} ${label}`),
        el('span', { class: 'v' }, `${low ? '⚠ ' : ''}${v}`)),
      el('div', { class: 'meter', role: 'meter', 'aria-valuenow': v, 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-label': label },
        el('div', { style: `width:${v}%` })));
  }

  let careKey = '';
  function renderCare(state) {
    const id = state.settings.pokemon;
    const key = JSON.stringify([L(), id, state.pets[id], state.berries, state.inventory, state.expedition, state.poops, Math.round(state.mood)]);
    if (key === careKey) return;
    careKey = key;
    const care = (state.pets[id] && state.pets[id].care) || { hunger: 80, clean: 85, health: 100 };
    const status = care.fainted ? 'fainted' : care.sick ? 'sick' : care.pooped ? 'pooped'
      : care.hunger < 25 ? 'hungry' : care.clean < 25 ? 'dirty' : 'ok';
    const icon = { ok: '😊', hungry: '🍽️', dirty: '🫧', pooped: '💩', sick: '🤒', fainted: '💫' }[status];
    // a status condition: its name and stage once diagnosed, else "sick (not diagnosed)"
    const st = !care.fainted && care.status;
    const chipText = st
      ? (st.known ? t('care.status.condition', { status: t(`status.${st.id}`), stage: st.stage }) : t('care.status.undiagnosed'))
      : t(`care.status.${status}`);
    const diagnoseBtn = st && !st.known
      ? el('button', { class: 'ghost', onclick: async () => {
        const res = await api.invoke('care:diagnose');
        if (!res.ok) $('#careMsg').textContent = t(`care.refused.${res.reason}`);
      } }, t('btn.diagnose', { n: state.diagnoseCost }))
      : null;
    const face = el('div', { class: 'care-face' });
    const emotion = moodEmotion(state);
    portraitFor(id, emotion).then((url) => { if (url) face.replaceChildren(el('img', { src: url, alt: emotion, title: emotion })); });
    $('#careStatus').replaceChildren(
      face,
      el('div', { class: 'care-status-text' },
        el('span', { class: `care-chip ${status}` }, `${icon} ${chipText}`),
        diagnoseBtn,
        state.poops ? el('div', { class: 'care-poops' },
          el('span', {}, t('care.poops', { n: state.poops })),
          el('button', { class: 'ghost', onclick: () => api.send('poop:clean', '*') }, t('care.cleanPoops'))) : null),
      el('span', { class: 'care-berries' }, `🍓 ${state.berries}`));
    $('#careBars').replaceChildren(
      bar(t('care.hunger'), care.hunger, '🍽️'),
      bar(t('care.clean'), care.clean, '🫧'),
      bar(t('care.health'), care.health, '❤️'),
      bar(t('care.mood'), state.mood, '😊'));

    const items = $('#careItems');
    const away = !!(state.expedition && state.expedition.petId === id);
    items.replaceChildren(...Object.entries(state.items).map(([itemId, item]) => el('button', {
      class: 'care-item',
      disabled: away || (!(state.inventory[itemId] > 0) && state.berries < item.cost) ? true : null,
      onclick: async () => {
        const res = await api.invoke('care:use', itemId);
        clearTimeout(careMsgTimer);
        $('#careMsg').textContent = res.ok ? '' : t(`care.refused.${res.reason}`);
        careMsgTimer = setTimeout(() => { $('#careMsg').textContent = ''; }, 4000);
      }
    },
    el('span', { class: 'ci-name' }, t(`item.${itemId}`)),
    el('span', { class: 'ci-desc' }, t(`itemdesc.${itemId}`)),
    el('span', { class: 'ci-cost' }, state.inventory[itemId] > 0 ? `×${state.inventory[itemId]}`
      : item.cost ? `${item.cost} 🍓` : t('care.free')))));
    $('#careEarn').textContent = t('care.earn', { p: state.reward.pomodoro, t: state.reward.todo, d: state.reward.daily });
  }

  // ================================================================ DIARY
  let weekOffset = 0;        // 0 = current week, -1 = previous, …
  let diaryKey = '';
  const portraitCache = {};

  function dexOf(state, petId) {
    const sp = state.pets[petId] && state.pets[petId].species;   // evolved
    if (sp) return sp.dex;
    if (SP.DEFS[petId]) return SP.DEFS[petId].dex;
    const c = state.custom.find((x) => x.id === petId);
    return c ? c.dex : null;
  }

  function portraitFor(petId, emotion) {
    return portrait(dexOf(env.getState(), petId), emotion);
  }

  function portrait(dex, emotion) {
    const k = `${dex}-${emotion}`;
    if (!(k in portraitCache)) portraitCache[k] = dex ? api.invoke('diary:portrait', dex, emotion) : Promise.resolve(null);
    return portraitCache[k];
  }

  /** Pick a sentence variant – stable per day so the entry doesn't change on every render. */
  function pick(list, seed) {
    let h = 0;
    for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return list[h % list.length];
  }

  function fill(str, vars) { return str.replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? vars[k] : m)); }

  function moodOf(day) { return day.moodN ? day.moodSum / day.moodN : null; }

  function writeEntry(state, day) {
    const D = I18N.DIARY[L()] || I18N.DIARY.en;
    const s = (k, vars = {}) => fill(pick(D[k], day.key + k), vars);
    const mood = moodOf(day);
    const out = [s(mood >= 65 && !day.sick ? 'open_happy' : mood >= 40 ? 'open_okay' : 'open_sad')];
    if (day.pomos === 0) out.push(s('focus_none'));
    else out.push(s(day.pomos >= 6 ? 'focus_lots' : 'focus_some', { n: day.pomos, min: day.focusMin }));
    if (day.todos === 1) out.push(s('todos_one'));
    else if (day.todos > 1) out.push(s('todos_some', { n: day.todos }));
    if (day.fed > 0) out.push(s('fed_some', { n: day.fed }));
    else if (day.moodN > 60) out.push(s('fed_none'));
    if (day.baths > 0) out.push(s('bath'));
    if (day.fainted) out.push(s('fainted'));
    else if (day.sick) out.push(s(day.meds > 0 ? 'sick_med' : 'sick_nomed'));
    if (day.poops > 0) out.push(s((day.poopsCleaned || 0) >= day.poops ? 'poop_cleaned' : 'poop_left'));
    if (day.pats >= 5) out.push(s('pats', { n: day.pats }));
    if (day.levelUps > 0) out.push(s('level'));
    const petId = day.petId || state.settings.pokemon;
    const evolved = env.getState().pets[petId] && env.getState().pets[petId].species;
    const cry = SP.DEFS[petId] && !evolved ? SP.DEFS[petId].cry[L()] : `${env.petName(petId)}!`;
    out.push(s('close', { cry }));
    return out.join(L() === 'zh' ? '' : ' ');
  }

  function weekStart(state) {
    const start = state.diary.startDay || today();
    const period = Math.floor((parseKey(today()) - parseKey(start)) / 86400000 / 7);
    return addDays(start, (period + weekOffset) * 7);
  }

  // ---------------------------------------------------------------- tooltip
  function tipOn(target, html) {
    const tip = $('#chartTip');
    const show = (e) => {
      tip.textContent = html;
      tip.classList.remove('hidden');
      const host = $('#tab-diary').getBoundingClientRect();
      const x = Math.min(e.clientX - host.left + 12, host.width - tip.offsetWidth - 4);
      tip.style.left = `${Math.max(4, x)}px`;
      tip.style.top = `${e.clientY - host.top + $('main').scrollTop - tip.offsetHeight - 10}px`;
    };
    target.addEventListener('mouseenter', show);
    target.addEventListener('mousemove', show);
    target.addEventListener('mouseleave', () => tip.classList.add('hidden'));
  }

  // ---------------------------------------------------------------- charts
  function niceMax(v) {
    if (v <= 0) return 60;
    const steps = [30, 60, 90, 120, 180, 240, 300, 360, 480, 600];
    return steps.find((s) => s >= v) || Math.ceil(v / 120) * 120;
  }

  function focusBars(week) {
    const W = 360, H = 170, padL = 34, padR = 6, padT = 10, padB = 24;
    const max = niceMax(Math.max(...week.days.map((d) => d.focusMin)));
    const s = svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'bars', role: 'img', 'aria-label': t('diary.focusChart') });
    const y = (v) => padT + (H - padT - padB) * (1 - v / max);
    for (let i = 0; i <= 3; i++) {
      const v = (max / 3) * i;
      s.append(svg('line', { x1: padL, x2: W - padR, y1: y(v), y2: y(v), class: i ? 'grid' : 'axis' }));
      const lbl = svg('text', { x: padL - 6, y: y(v) + 4, class: 'tick', 'text-anchor': 'end' });
      lbl.textContent = Math.round(v);
      s.append(lbl);
    }
    const slot = (W - padL - padR) / 7;
    const bw = Math.min(26, slot * 0.55);
    week.days.forEach((d, i) => {
      const cx = padL + slot * i + slot / 2;
      const x = cx - bw / 2;
      const top = y(d.focusMin);
      const h = H - padB - top;
      if (d.focusMin > 0) {
        const r = Math.min(4, h, bw / 2);
        s.append(svg('path', {
          class: 'bar',
          d: `M${x},${H - padB} V${top + r} Q${x},${top} ${x + r},${top} H${x + bw - r} Q${x + bw},${top} ${x + bw},${top + r} V${H - padB} Z`
        }));
      }
      const lbl = svg('text', { x: cx, y: H - 7, class: `tick${d.key === today() ? ' today' : ''}`, 'text-anchor': 'middle' });
      lbl.textContent = fmtDay(d.key, { weekday: 'short' });
      s.append(lbl);
      // generous hover target over the whole column
      const hit = svg('rect', { x: padL + slot * i, y: padT, width: slot, height: H - padT - padB, class: 'hit' });
      tipOn(hit, `${fmtDay(d.key, { weekday: 'short', month: 'short', day: 'numeric' })} · ${d.focusMin ? t('diary.minutes', { n: d.focusMin }) : t('diary.noFocus')} · ${d.pomos} 🍅`);
      s.append(hit);
    });
    return s;
  }

  function timeline(week) {
    const rowH = 18, padL = 40, padR = 6, padT = 4, padB = 18;
    const W = 360, H = padT + rowH * 7 + padB;
    const s = svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'timeline', role: 'img', 'aria-label': t('diary.timeline') });
    const x = (hours) => padL + ((W - padL - padR) * hours) / 24;
    for (const hr of [0, 6, 12, 18, 24]) {
      s.append(svg('line', { x1: x(hr), x2: x(hr), y1: padT, y2: H - padB, class: hr === 0 || hr === 24 ? 'axis' : 'grid' }));
      const lbl = svg('text', { x: x(hr), y: H - 5, class: 'tick', 'text-anchor': hr === 0 ? 'start' : hr === 24 ? 'end' : 'middle' });
      lbl.textContent = `${hr}:00`;
      s.append(lbl);
    }
    week.days.forEach((d, i) => {
      const yy = padT + rowH * i;
      s.append(svg('rect', { x: padL, y: yy + 3, width: W - padL - padR, height: rowH - 6, rx: 3, class: 'lane' }));
      const lbl = svg('text', { x: padL - 6, y: yy + rowH / 2 + 4, class: `tick${d.key === today() ? ' today' : ''}`, 'text-anchor': 'end' });
      lbl.textContent = fmtDay(d.key, { weekday: 'short' });
      s.append(lbl);
      for (const [start, min] of d.sessions || []) {
        const st = new Date(start);
        const h0 = st.getHours() + st.getMinutes() / 60;
        const w = Math.max(3, x(Math.min(24, h0 + min / 60)) - x(h0));
        const block = svg('rect', { x: x(h0), y: yy + 3, width: w, height: rowH - 6, rx: 3, class: 'session' });
        tipOn(block, `${fmtDay(d.key, { weekday: 'short' })} ${hhmm(start)}–${hhmm(start + min * 60000)} · ${t('diary.minutes', { n: min })}`);
        s.append(block);
      }
    });
    return s;
  }

  // ---------------------------------------------------------------- week view
  async function renderDiary(state) {
    const start = weekStart(state);
    const key = JSON.stringify([L(), start, state.diary.days, state.settings.pokemon]);
    if (key === diaryKey) return;
    diaryKey = key;
    const week = await api.invoke('diary:week', start);
    const end = week.end;
    const inProgress = end >= today();
    $('#weekLabel').textContent = t('diary.week', {
      from: fmtDay(start, { month: 'short', day: 'numeric' }),
      to: fmtDay(end, { month: 'short', day: 'numeric' })
    });
    $('#weekNext').disabled = weekOffset >= 0;
    $('#weekPrev').disabled = start <= (state.diary.startDay || today());

    // headline card: portrait + verdict
    const dex = dexOf(state, state.settings.pokemon);
    const emotion = { happy: 'Happy', okay: 'Normal', sad: 'Sad' }[week.verdict] || 'Normal';
    const face = el('div', { class: 'week-face' }, env.spriteNode(state.settings.pokemon, 56));
    portrait(dex, emotion).then((url) => { if (url) face.replaceChildren(el('img', { src: url, alt: '' })); });
    const verdictEmoji = { happy: '😊', okay: '🙂', sad: '😢', none: '📖' }[week.verdict];
    $('#weekCard').replaceChildren(face, el('div', { class: 'week-text' },
      el('div', { class: 'verdict' }, `${verdictEmoji} ${t(`diary.verdict.${week.verdict}`)}`),
      week.score != null ? el('div', { class: 'score' }, t('diary.score', { n: week.score })) : null,
      el('div', { class: 'totals' }, t('diary.total', { min: week.focusMin, n: week.pomos, t: week.todos })),
      inProgress ? el('div', { class: 'hint' }, t('diary.inProgress')) : null));

    $('#focusBars').replaceChildren(focusBars(week));
    $('#focusTimeline').replaceChildren(timeline(week));

    // entries (newest first, only days that have started)
    const entries = week.days.filter((d) => d.key <= today()).reverse();
    $('#diaryEntries').replaceChildren(...entries.map((d) => {
      const isToday = d.key === today();
      const head = el('div', { class: 'entry-head' },
        el('b', {}, fmtDay(d.key, { weekday: 'long', month: 'short', day: 'numeric' })),
        isToday ? el('span', { class: 'hint' }, t('diary.today')) : null);
      const body = d.empty || !d.moodN
        ? el('p', { class: 'entry-text muted' }, isToday ? t('diary.writing') : t('diary.empty'))
        : el('p', { class: 'entry-text' }, writeEntry(state, d));
      const mood = moodOf(d);
      const emo = mood == null ? '·' : d.sick ? '🤒' : mood >= 65 ? '😊' : mood >= 40 ? '🙂' : '😢';
      const moodBox = el('div', { class: 'entry-mood' }, emo);
      const emotion = dayEmotion(d);
      if (emotion) {
        portraitFor(d.petId || state.settings.pokemon, emotion).then((url) => {
          if (url) moodBox.replaceChildren(el('img', { src: url, alt: emotion, title: emotion }));
        });
      }
      return el('article', { class: 'entry' }, moodBox, el('div', {}, head, body));
    }));
  }

  $('#weekPrev').addEventListener('click', () => { weekOffset -= 1; diaryKey = ''; renderDiary(env.getState()); });
  $('#weekNext').addEventListener('click', () => { weekOffset = Math.min(0, weekOffset + 1); diaryKey = ''; renderDiary(env.getState()); });

  return {
    showWeek(offset) { weekOffset = offset; diaryKey = ''; },
    moodEmotion,
    portraitFor,
    render(state, tab) {
      renderCare(state);
      if (tab === 'diary') renderDiary(state);
    }
  };
};
