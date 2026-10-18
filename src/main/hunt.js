// Shiny Hunt (找闪光): a grid of your partner, one of them a shiny with slightly different colours – click it before
// time runs out. Each find makes the grid bigger and the colours closer. The boards are made and every click is
// checked here, in the main process (main.js huntStart / huntPick / huntFinish), against its own clock.
const ROUND_S = 30;

/** Board for the `n`th find (0-based): grid size, how far the shiny's colours are shifted (deg), and where it is. */
function boardOf(n, rnd = Math.random) {
  const size = Math.min(6, 2 + Math.floor(n / 2));
  const hue = Math.max(14, 100 - n * 7);
  return { size, hue, at: Math.floor(rnd() * size * size) };
}

/** What a hunt is worth after `found` shinies. */
function rewardFor(found) {
  const berries = found >= 20 ? 4 : found >= 14 ? 3 : found >= 8 ? 2 : found >= 3 ? 1 : 0;
  return { found, berries, xp: 4 + found * 2, mood: Math.min(8, 2 + Math.floor(found / 3)) };
}

module.exports = { ROUND_S, boardOf, rewardFor };
