// Fire-Water-Grass (火水草猜拳): rock-paper-scissors with the starters' type triangle – fire beats grass, grass beats
// water, water beats fire. First to 3 wins the match. The opponent's throws are made here, in the main process
// (main.js rpsStart / rpsThrow), so the window can't peek; a win is worth more berries than a loss.
const MOVES = ['fire', 'water', 'grass'];
const BEATS = { fire: 'grass', grass: 'water', water: 'fire' };
const TO_WIN = 3;

/** 'win', 'lose' or 'draw' for `mine` against `theirs`. */
function outcome(mine, theirs) {
  if (mine === theirs) return 'draw';
  return BEATS[mine] === theirs ? 'win' : 'lose';
}

const throwOf = (rnd = Math.random) => MOVES[Math.floor(rnd() * MOVES.length)];

/** What a finished match is worth: { won, berries, xp, mood }. */
function rewardFor(won) {
  return won ? { won: true, berries: 3, xp: 20, mood: 6 } : { won: false, berries: 1, xp: 8, mood: 2 };
}

module.exports = { MOVES, BEATS, TO_WIN, outcome, throwOf, rewardFor };
