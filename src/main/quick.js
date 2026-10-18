// Quick Attack (电光一闪): your partner waits in the grass; when the "!" flashes, click as fast as you can.
// Five draws a round. Clicking before the "!" is a false start. Each draw's wait is picked and every click is
// timed here, in the main process (main.js quickReady / quickHit), against its own clock.
const DRAWS = 5;
const EARLY_MS = 90;   // faster than this is a guess, not a reaction – it counts as a false start
const LATE_MS = 1500;  // no click by then: the draw is lost

/** How long to wait (ms) before the "!" of a draw. */
function waitOf(rnd = Math.random) {
  return 1200 + Math.floor(rnd() * 2800);
}

/** A click `ms` after the "!" (negative: before it) → its grade and points. */
function grade(ms) {
  if (!(ms >= EARLY_MS)) return { grade: 'early', points: 0 };
  if (ms <= 260) return { grade: 'great', points: 3 };
  if (ms <= 380) return { grade: 'good', points: 2 };
  if (ms <= 600) return { grade: 'ok', points: 1 };
  return { grade: 'slow', points: 0 };
}

/** What a round is worth: `points` out of 15, and the best reaction time (ms, or null without a clean one). */
function rewardFor(points, best) {
  const berries = points >= 13 ? 4 : points >= 10 ? 3 : points >= 6 ? 2 : points >= 3 ? 1 : 0;
  return { points, best, berries, xp: 4 + points * 2, mood: Math.min(8, 2 + Math.floor(points / 3)) };
}

module.exports = { DRAWS, EARLY_MS, LATE_MS, waitOf, grade, rewardFor };
