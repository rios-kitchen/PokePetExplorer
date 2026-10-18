// Voltorb Flip (霹雳电球翻牌), from the Goldenrod and Celadon Game Corners: a 5×5 board of face-down cards, each a 1, 2
// or 3 – or a Voltorb. The numbers beside each row and under each column give that line's total and how many Voltorb
// it hides. Turn over every 2 and 3 to clear the board; turning over a Voltorb ends it. The board stays here, in the
// main process (main.js flipStart / flipTurn), so the window only learns a card once it's turned.
const SIZE = 5;
// level 1 boards from HeartGold / SoulSilver: [twos, threes, Voltorb]
const LAYOUTS = [[3, 1, 6], [0, 3, 6], [5, 0, 6], [2, 2, 6], [4, 1, 6]];

/** A new board: 25 values, 0 for a Voltorb. */
function deal(rnd = Math.random) {
  const [twos, threes, volts] = LAYOUTS[Math.floor(rnd() * LAYOUTS.length)];
  const cards = [...Array(twos).fill(2), ...Array(threes).fill(3), ...Array(volts).fill(0)];
  while (cards.length < SIZE * SIZE) cards.push(1);
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return cards;
}

/** The hints: { rows: [{ sum, volts }], cols: [{ sum, volts }] }. */
function hints(cards) {
  const line = (idx) => ({ sum: idx.reduce((s, i) => s + cards[i], 0), volts: idx.filter((i) => cards[i] === 0).length });
  const rows = [], cols = [];
  for (let k = 0; k < SIZE; k++) {
    rows.push(line(Array.from({ length: SIZE }, (_, c) => k * SIZE + c)));
    cols.push(line(Array.from({ length: SIZE }, (_, r) => r * SIZE + k)));
  }
  return { rows, cols };
}

/** Cleared when every 2 and 3 is face up. */
const cleared = (cards, up) => cards.every((v, i) => v < 2 || up[i]);

/** The coins so far: the product of the face-up cards (0 once a Voltorb is turned; 1 before anything is). */
const coinsOf = (cards, up) => cards.reduce((p, v, i) => (up[i] ? p * v : p), 1);

/** What a board is worth: cleared → 3 🍓 (4 for a big haul), otherwise a little XP for trying. */
function rewardFor(won, coins) {
  if (!won) return { won: false, berries: 0, xp: 6, mood: 2 };
  return { won: true, berries: coins >= 48 ? 4 : 3, xp: 30, mood: 8 };
}

module.exports = { SIZE, LAYOUTS, deal, hints, cleared, coinsOf, rewardFor };
