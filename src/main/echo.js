// Chatot Echo (聒噪鸟学舌): a Simon game. Chatot sings a tune on four type pads, one note longer each round, and
// you sing it back. The tune is made and checked here, in the main process (main.js echoStart / echoAnswer), so
// the reward only counts tunes that were really sung back.
const PADS = ['fire', 'water', 'grass', 'electric'];
const MAX = 15;   // sing back a 15-note tune and the round is won

const stepOf = (rnd = Math.random) => PADS[Math.floor(rnd() * PADS.length)];

/** Whether `attempt` is exactly the tune `seq`. */
const matches = (seq, attempt) => Array.isArray(attempt) && attempt.length === seq.length && seq.every((p, i) => attempt[i] === p);

/** How long each note shows (ms): quicker as the tune grows. */
const noteMs = (len) => Math.max(260, 560 - Math.max(0, len - 4) * 30);

/** What a round is worth after singing back `cleared` tunes (0 … MAX). */
function rewardFor(cleared) {
  const berries = cleared >= MAX ? 5 : cleared >= 10 ? 4 : cleared >= 7 ? 3 : cleared >= 4 ? 2 : cleared >= 1 ? 1 : 0;
  return { cleared, won: cleared >= MAX, berries, xp: 4 + cleared * 2, mood: Math.min(8, 2 + Math.floor(cleared / 2)) };
}

module.exports = { PADS, MAX, stepOf, matches, noteMs, rewardFor };
