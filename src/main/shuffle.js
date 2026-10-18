// Poké Ball Shuffle (藏在哪个球里): your partner hides in a Poké Ball, the balls are swapped around, and you point
// at the right one. Five rounds, each with more balls, more swaps and quicker hands; a miss ends the game. The
// swaps are made and the pick is checked here, in the main process (main.js shuffleNext / shufflePick).
const ROUNDS = [
  { balls: 3, swaps: 4, ms: 460 },
  { balls: 3, swaps: 6, ms: 380 },
  { balls: 4, swaps: 7, ms: 340 },
  { balls: 4, swaps: 9, ms: 290 },
  { balls: 5, swaps: 11, ms: 250 }
];

/** Round `n` (0-based): where the partner starts and the swaps, each a pair of ball positions. */
function round(n, rnd = Math.random) {
  const { balls, swaps, ms } = ROUNDS[n];
  const start = Math.floor(rnd() * balls);
  const list = [];
  for (let i = 0; i < swaps; i++) {
    const a = Math.floor(rnd() * balls);
    const b = (a + 1 + Math.floor(rnd() * (balls - 1))) % balls;
    list.push([a, b]);
  }
  return { balls, start, swaps: list, ms };
}

/** Where the ball that started at `start` ends up after `swaps`. */
function trace(start, swaps) {
  let at = start;
  for (const [a, b] of swaps) {
    if (at === a) at = b;
    else if (at === b) at = a;
  }
  return at;
}

/** What a game is worth after finding the partner `found` times (0 … 5). */
function rewardFor(found) {
  const berries = [0, 1, 1, 2, 3, 4][found] || 0;
  return { found, won: found >= ROUNDS.length, berries, xp: 4 + found * 4, mood: 2 + found };
}

module.exports = { ROUNDS, round, trace, rewardFor };
