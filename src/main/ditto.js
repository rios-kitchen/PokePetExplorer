// Ditto Copy (百变怪照着变): a pattern lights up on a 4×4 grid for a moment – Ditto has to copy it. Tap the same cells
// from memory. Five rounds, each pattern a cell longer. The patterns are made and every answer is checked here, in
// the main process (main.js dittoStart / dittoAnswer).
const SIZE = 4;
const N = SIZE * SIZE;
const ROUNDS = [3, 4, 5, 6, 7];   // cells to remember in each round

/** How long (ms) round `n`'s pattern stays up: a little longer for longer patterns. */
const showMs = (n) => 1200 + ROUNDS[n] * 150;

/** Round `n`'s pattern: that many different cells, sorted. */
function patternOf(n, rnd = Math.random) {
  const cells = [];
  while (cells.length < ROUNDS[n]) {
    const i = Math.floor(rnd() * N);
    if (!cells.includes(i)) cells.push(i);
  }
  return cells.sort((a, b) => a - b);
}

/** The cells tapped (any order) are exactly the pattern. */
function matches(pattern, taps) {
  if (!Array.isArray(taps) || taps.length !== pattern.length) return false;
  const set = new Set(taps);
  return set.size === pattern.length && pattern.every((i) => set.has(i));
}

/** What a game is worth after `right` copied patterns out of 5. */
function rewardFor(right) {
  const berries = right >= 5 ? 4 : right >= 4 ? 3 : right >= 2 ? 2 : right >= 1 ? 1 : 0;
  return { right, berries, xp: 4 + right * 5, mood: Math.min(8, 2 + right) };
}

module.exports = { SIZE, N, ROUNDS, showMs, patternOf, matches, rewardFor };
