// The pet's diary: one record per day, plus a weekly "was I happy?" report.
// The diary text itself is written in the panel (so it follows the UI language).
const { today } = require('./store');

const DAY = 86400000;

function dateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function parseKey(k) {
  const [y, m, d] = k.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function addDays(k, n) {
  const d = parseKey(k);
  d.setDate(d.getDate() + n);
  return dateKey(d);
}

function daysBetween(a, b) {
  return Math.round((parseKey(b) - parseKey(a)) / DAY);
}

function emptyDay() {
  return {
    pomos: 0, focusMin: 0, todos: 0, fed: 0, baths: 0, meds: 0, pats: 0, levelUps: 0, poops: 0, poopsCleaned: 0,
    sick: false, fainted: false, moodSum: 0, moodN: 0, healthMin: 100, petId: null, sessions: []
  };
}

function ensure(data) {
  if (!data.diary) data.diary = { startDay: today(), lastReported: -1, days: {} };
  return data.diary;
}

function day(data, key = today()) {
  const diary = ensure(data);
  return diary.days[key] || (diary.days[key] = emptyDay());
}

function record(data, field, n = 1) {
  const d = day(data);
  d[field] = (d[field] || 0) + n;
}

function flag(data, field) {
  day(data)[field] = true;
}

/** A finished focus session: [start timestamp, minutes] on the day it started. */
function addSession(data, startTs, minutes) {
  const d = day(data, dateKey(new Date(startTs)));
  d.sessions.push([startTs, minutes]);
}

function sample(data, mood, health, petId) {
  const d = day(data);
  d.moodSum += mood;
  d.moodN += 1;
  d.healthMin = Math.min(d.healthMin, health);
  d.petId = petId;
}

/** Remove days older than ~4 months. */
function prune(data) {
  const diary = ensure(data);
  const cutoff = addDays(today(), -120);
  for (const k of Object.keys(diary.days)) if (k < cutoff) delete diary.days[k];
}

/** Summary of 7 days starting at `start` (YYYY-MM-DD). */
function weekSummary(data, start) {
  const diary = ensure(data);
  const days = [];
  for (let i = 0; i < 7; i++) {
    const key = addDays(start, i);
    days.push({ key, ...(diary.days[key] || emptyDay()), empty: !diary.days[key] });
  }
  const withMood = days.filter((d) => d.moodN > 0);
  const avgMood = withMood.length ? withMood.reduce((s, d) => s + d.moodSum / d.moodN, 0) / withMood.length : 0;
  const pomos = days.reduce((s, d) => s + d.pomos, 0);
  const focusMin = days.reduce((s, d) => s + d.focusMin, 0);
  const todos = days.reduce((s, d) => s + d.todos, 0);
  const sickDays = days.filter((d) => d.sick).length;
  const fed = days.reduce((s, d) => s + d.fed, 0);
  const score = withMood.length
    ? Math.max(0, Math.min(100, Math.round(avgMood - 6 * sickDays + Math.min(10, pomos / 2))))
    : null;
  const verdict = score == null ? 'none' : score >= 70 ? 'happy' : score >= 45 ? 'okay' : 'sad';
  return { start, end: addDays(start, 6), days, avgMood: Math.round(avgMood), pomos, focusMin, todos, sickDays, fed, score, verdict };
}

/**
 * Weeks are counted from the first day the diary was kept. Returns the summary of a
 * finished week that hasn't been reported yet (and marks it reported), or null.
 */
function pendingWeekly(data) {
  const diary = ensure(data);
  const period = Math.floor(daysBetween(diary.startDay, today()) / 7);
  const last = period - 1;
  if (last < 0 || diary.lastReported >= last) return null;
  diary.lastReported = last;
  const summary = weekSummary(data, addDays(diary.startDay, last * 7));
  return summary.score == null ? null : summary;
}

module.exports = { dateKey, addDays, ensure, day, record, flag, addSession, sample, prune, weekSummary, pendingWeekly };
