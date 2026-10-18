// How often the mini-games can be played: a daily and an hourly limit for each, so they stay a treat
// (QQ Pet limited its games the same way). Add new mini-games to LIMITS. State lives in data.limits[game]:
// { day, used, recent: [timestamps within the last hour] }.

const LIMITS = {
  grass:   { day: 16, hour: 3 },   // wild encounters in the tall grass
  fishing: { day: 20, hour: 6 },   // bites (something on the line, landed or not)
  quiz:    { day: 12, hour: 4 },   // Who's That Pokémon? questions
  catch:   { day: 6, hour: 2 },    // Berry Catch rounds
  memory:  { day: 6, hour: 2 },    // Memory Match boards
  whack:   { day: 6, hour: 2 },    // Whack-a-Diglett rounds
  types:   { day: 6, hour: 2 },    // Type Match-up rounds (10 questions each)
  rps:     { day: 8, hour: 3 },    // Fire-Water-Grass matches (first to 3)
  flip:    { day: 6, hour: 2 },    // Voltorb Flip boards
  echo:    { day: 6, hour: 2 }     // Chatot Echo rounds
};
const HOUR = 3600e3;

function slot(data, game, now, day) {
  data.limits = data.limits || {};
  const s = data.limits[game] || (data.limits[game] = { day: null, used: 0, recent: [] });
  if (s.day !== day) { s.day = day; s.used = 0; }
  s.recent = (s.recent || []).filter((t) => t > now - HOUR && t <= now);
  return s;
}

/**
 * What's left: { left, dayLeft, hourLeft, max, hourMax, recent (uses within the hour), nextAt (when an hourly one
 * frees up, or null) }. `day` is today's local date ("YYYY-MM-DD").
 */
function info(data, game, day, now = Date.now()) {
  const lim = LIMITS[game];
  const s = slot(data, game, now, day);
  const dayLeft = Math.max(0, lim.day - s.used);
  const hourLeft = Math.max(0, lim.hour - s.recent.length);
  return { left: Math.min(dayLeft, hourLeft), dayLeft, hourLeft, max: lim.day, hourMax: lim.hour, recent: s.recent.length,
    nextAt: hourLeft > 0 ? null : Math.min(...s.recent) + HOUR };
}

/** Count one play. Returns false (and counts nothing) when the limit is reached. */
function use(data, game, day, now = Date.now()) {
  if (info(data, game, day, now).left <= 0) return false;
  const s = data.limits[game];
  s.used += 1;
  s.recent.push(now);
  return true;
}

/** Why it can't be played right now: 'rest' (hourly limit, try later) or 'tired' (done for today), or null. */
function blocked(i) {
  if (i.left > 0) return null;
  return i.dayLeft > 0 ? 'rest' : 'tired';
}

module.exports = { LIMITS, info, use, blocked };
