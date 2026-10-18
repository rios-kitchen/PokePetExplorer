// Slide Puzzle (拼图): your partner's portrait cut into a 3×3 grid with one tile missing – slide the tiles back into
// place. The board is shuffled here, in the main process (main.js puzzleStart / puzzleFinish), and the moves the
// window sends back are replayed and checked before anything is rewarded.
const SIZE = 3;
const N = SIZE * SIZE;
const BLANK = N - 1;   // the missing bottom-right tile
const SHUFFLE = 80;    // random slides from the solved board

const solved = () => Array.from({ length: N }, (_, i) => i);
const isSolved = (board) => board.every((v, i) => v === i);

/** The cells next to `i` (up, down, left, right). */
function neighbours(i) {
  const r = Math.floor(i / SIZE), c = i % SIZE, out = [];
  if (r > 0) out.push(i - SIZE);
  if (r < SIZE - 1) out.push(i + SIZE);
  if (c > 0) out.push(i - 1);
  if (c < SIZE - 1) out.push(i + 1);
  return out;
}

/** Slide the tile in cell `i` into the gap: the new board, or null when it isn't next to the gap. */
function slide(board, i) {
  const gap = board.indexOf(BLANK);
  if (!neighbours(gap).includes(i)) return null;
  const next = board.slice();
  next[gap] = board[i];
  next[i] = BLANK;
  return next;
}

/** A shuffled board: random slides from the solved one (so it can always be solved), never already solved. */
function shuffle(rnd = Math.random, steps = SHUFFLE) {
  let board = solved(), prev = -1;
  for (let k = 0; k < steps || isSolved(board); k++) {
    const gap = board.indexOf(BLANK);
    const options = neighbours(gap).filter((i) => i !== prev);
    const i = options[Math.floor(rnd() * options.length)];
    board = slide(board, i);
    prev = gap;
  }
  return board;
}

/** Replay `moves` (cells clicked) on `board`: the final board, or null if a move was illegal. */
function replay(board, moves) {
  let b = board;
  for (const i of moves) {
    b = Number.isInteger(i) ? slide(b, i) : null;
    if (!b) return null;
  }
  return b;
}

/** The shortest list of cells to click to solve `board` (breadth-first; 3×3 has under 200 000 positions). */
function solve(board) {
  const key = (b) => b.join('');
  const start = key(board), goal = key(solved());
  const from = new Map([[start, null]]);
  const queue = [board];
  for (let q = 0; q < queue.length; q++) {
    const b = queue[q], k = key(b);
    if (k === goal) {
      const path = [];
      for (let at = k; from.get(at); at = from.get(at).prev) path.unshift(from.get(at).move);
      return path;
    }
    for (const i of neighbours(b.indexOf(BLANK))) {
      const n = slide(b, i), nk = key(n);
      if (!from.has(nk)) { from.set(nk, { prev: k, move: i }); queue.push(n); }
    }
  }
  return null;
}

const HINTS = 3;        // hints a board: each one shows the way for the next few moves
const HINT_STEPS = 5;
const CLEAN_BONUS = 2;  // extra berries for solving it without a hint

/** The next few cells to click from `board` towards the solution (empty when it's already solved). */
function hint(board, steps = HINT_STEPS) {
  return (solve(board) || []).slice(0, steps);
}

/** What a solved board is worth: fewer moves, more berries – and a bonus when no hint was used. */
function rewardFor(moves, hints = 0) {
  const base = moves <= 30 ? 4 : moves <= 60 ? 3 : moves <= 100 ? 2 : 1;
  const clean = hints === 0;
  const berries = base + (clean ? CLEAN_BONUS : 0);
  return { moves, hints, clean, berries, xp: 10 + base * 6 + (clean ? 8 : 0), mood: 2 + base + (clean ? 1 : 0) };
}

module.exports = { SIZE, N, BLANK, SHUFFLE, HINTS, HINT_STEPS, CLEAN_BONUS, solved, isSolved, neighbours, slide, shuffle, replay, solve, hint, rewardFor };
