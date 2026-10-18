// Whack-a-Diglett (敲敲地鼠): Diglett pop out of nine holes – tap them before they duck back down. 30 seconds a round.
// A Diglett is 1 point, a rare shiny (golden) one 3; tapping a Voltorb costs 2 points.
// The round's score turns into a few real berries, XP and a good mood (main.js whackStart / whackFinish); limited
// per day and hour like the other mini-games (limits.js). Shared by the main process and the game window.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PokeWhack = api;
})(typeof self !== 'undefined' ? self : this, function () {
  const ROUND_S = 30;
  const HOLES = 9;
  const MAX_SCORE = 90;   // more than a perfect round can reach: anything above is not believed
  const POINTS = { diglett: 1, gold: 3, voltorb: -2 };

  /** What a round's score is worth: { berries (at most 4), xp, mood }. */
  function rewardFor(score) {
    const s = Math.max(0, Math.min(MAX_SCORE, Math.floor(Number(score) || 0)));
    return { score: s, berries: Math.min(4, Math.floor(s / 8)), xp: Math.min(60, s * 2), mood: s >= 12 ? 6 : s > 0 ? 2 : 0 };
  }

  /** Who pops up next, from a 0…1 roll; later in the round (t 0…1) more Voltorb, and they're quicker. */
  function pickMole(roll, t = 0) {
    const voltorb = 0.12 + 0.12 * t, gold = 0.07;
    if (roll < voltorb) return 'voltorb';
    if (roll < voltorb + gold) return 'gold';
    return 'diglett';
  }

  /** How long (ms) one stays up: shorter towards the end of the round. */
  const upTime = (t = 0) => Math.round(1100 - 450 * Math.max(0, Math.min(1, t)));

  return { ROUND_S, HOLES, MAX_SCORE, POINTS, rewardFor, pickMole, upTime };
});
