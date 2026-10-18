// Berry Catch (接树果): treats fall from the trees and your Pokémon runs left and right to catch them before they
// land – 30 seconds a round. Berries are 1 point, Poké Puffs 2, stars 3; catching a poop costs 2 points.
// The round's score turns into a few real berries, XP and a good mood (main.js catchStart / catchFinish); limited
// per day and hour like the other mini-games (limits.js). Shared by the main process and the game window.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PokeCatch = api;
})(typeof self !== 'undefined' ? self : this, function () {
  const ROUND_S = 30;
  const MAX_SCORE = 90;   // more than a perfect round can reach: anything above is not believed
  const POINTS = { berry: 1, puff: 2, star: 3, poop: -2 };

  /** What a round's score is worth: { berries (at most 4), xp, mood }. */
  function rewardFor(score) {
    const s = Math.max(0, Math.min(MAX_SCORE, Math.floor(Number(score) || 0)));
    return { score: s, berries: Math.min(4, Math.floor(s / 8)), xp: Math.min(60, s * 2), mood: s >= 12 ? 6 : s > 0 ? 2 : 0 };
  }

  /**
   * What falls next, from a 0…1 roll; the later in the round (t 0…1), the more poop and stars (harder, but worth more).
   */
  function pickItem(roll, t = 0) {
    const poop = 0.12 + 0.13 * t, star = 0.05 + 0.05 * t, puff = 0.18;
    if (roll < poop) return 'poop';
    if (roll < poop + star) return 'star';
    if (roll < poop + star + puff) return 'puff';
    return 'berry';
  }

  return { ROUND_S, MAX_SCORE, POINTS, rewardFor, pickItem };
});
