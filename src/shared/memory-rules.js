// Memory Match (记忆翻牌): 16 face-down cards, 8 pairs of Pokémon faces – turn two at a time and find the pairs.
// The fewer turns it takes, the more berries (main.js memoryStart / memoryFinish); limited per day and hour like the
// other mini-games (limits.js). Shared by the main process and the game window.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PokeMemory = api;
})(typeof self !== 'undefined' ? self : this, function () {
  const PAIRS = 8;
  const MIN_SECONDS = 8;   // a whole board can't honestly be cleared faster

  /** What a cleared board is worth, by the turns it took (8 is perfect): { turns, berries, xp, mood }. */
  function rewardFor(turns) {
    const n = Math.max(PAIRS, Math.floor(Number(turns) || 0));
    const berries = n <= 12 ? 4 : n <= 16 ? 3 : n <= 22 ? 2 : 1;
    return { turns: n, berries, xp: Math.max(10, 40 - (n - PAIRS) * 2), mood: 6 };
  }

  /** The 16 cards in a random order: each dex twice. */
  function deal(dexes, rnd = Math.random) {
    const cards = [...dexes.slice(0, PAIRS), ...dexes.slice(0, PAIRS)];
    for (let i = cards.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [cards[i], cards[j]] = [cards[j], cards[i]];
    }
    return cards;
  }

  return { PAIRS, MIN_SECONDS, rewardFor, deal };
});
