// Magikarp Jump (鲤鱼王跳跳): a power bar sweeps back and forth – stop it in the middle of the target for a big
// splash jump. Five jumps a round; the target shrinks and the bar speeds up. The targets are made and every stop is
// graded here, in the main process (main.js jumpStart / jumpStop).
const JUMPS = 5;
const PERFECT = [0.04, 0.034, 0.029, 0.025, 0.022];   // half-widths of the bull's-eye, jump by jump

/** Jump `n` (0-based): where the target sits on the bar (0 … 1), its zones and how fast the bar sweeps. */
function jumpOf(n, rnd = Math.random) {
  const perfect = PERFECT[n];
  return { center: Math.round((0.25 + rnd() * 0.5) * 1000) / 1000, perfect, good: perfect * 2.5, ok: perfect * 5, speed: 0.7 + n * 0.15 };
}

/** Points for stopping the bar at `pos`: 3 bull's-eye, 2 good, 1 ok, 0 a splash. */
function grade(jump, pos) {
  const d = Math.abs(Number(pos) - jump.center);
  if (!(d >= 0)) return 0;
  return d <= jump.perfect ? 3 : d <= jump.good ? 2 : d <= jump.ok ? 1 : 0;
}

/** How high Magikarp flies (cm) for a jump worth `points`. */
const heightOf = (points) => [20, 150, 320, 560][points] || 20;

/** What a round is worth after `total` points (0 … 15). */
function rewardFor(total) {
  const berries = total >= 14 ? 4 : total >= 10 ? 3 : total >= 6 ? 2 : total >= 3 ? 1 : 0;
  return { total, berries, xp: 4 + total * 2, mood: Math.min(8, 2 + Math.floor(total / 2)) };
}

module.exports = { JUMPS, PERFECT, jumpOf, grade, heightOf, rewardFor };
