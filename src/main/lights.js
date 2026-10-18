// Chinchou Lights (灯笼鱼点灯): a 4×4 pond of Chinchou, some with their lights off. Tapping one switches it and its
// neighbours (up, down, left, right) – light them all. The board is made here, in the main process (main.js
// lightsStart / lightsFinish), by tapping a few random Chinchou of an all-lit pond, so it can always be solved in that
// many taps (the "par"); the taps the window sends back are replayed and checked before anything is rewarded.
const SIZE = 4;
const N = SIZE * SIZE;
const SCRAMBLE = 6;   // random taps from the all-lit pond

const allLit = () => Array(N).fill(true);
const isLit = (board) => board.every(Boolean);

/** The cells next to `i` (up, down, left, right). */
function neighbours(i) {
  const r = Math.floor(i / SIZE), c = i % SIZE, out = [];
  if (r > 0) out.push(i - SIZE);
  if (r < SIZE - 1) out.push(i + SIZE);
  if (c > 0) out.push(i - 1);
  if (c < SIZE - 1) out.push(i + 1);
  return out;
}

/** Tap Chinchou `i`: it and its neighbours switch. The new board, or null for a cell that isn't on the board. */
function tap(board, i) {
  if (!Number.isInteger(i) || i < 0 || i >= N) return null;
  const next = board.slice();
  for (const j of [i, ...neighbours(i)]) next[j] = !next[j];
  return next;
}

/** A new pond: `taps` different random cells tapped on an all-lit one (never already lit), and those cells. */
function scramble(rnd = Math.random, taps = SCRAMBLE) {
  for (;;) {
    const cells = [];
    while (cells.length < taps) {
      const i = Math.floor(rnd() * N);
      if (!cells.includes(i)) cells.push(i);
    }
    const board = cells.reduce(tap, allLit());
    if (!isLit(board)) return { board, cells };
  }
}

/** Replay the window's taps from `start`: the final board, or null when a tap is invalid. */
function replay(start, taps) {
  let board = start;
  for (const i of taps) {
    board = tap(board, i);
    if (!board) return null;
  }
  return board;
}

/** What a pond is worth when lit in `taps` taps, for a pond of `par`. */
function rewardFor(taps, par = SCRAMBLE) {
  const berries = taps <= par ? 4 : taps <= par + 4 ? 3 : taps <= par + 10 ? 2 : 1;
  return { taps, par, berries, xp: 10 + berries * 6, mood: 2 + berries };
}

module.exports = { SIZE, N, SCRAMBLE, allLit, isLit, neighbours, tap, scramble, replay, rewardFor };
