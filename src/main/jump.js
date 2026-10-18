// Magikarp Jump (鲤鱼王跳跳): Pokémon swim in from the right along the water – click or press Space to make Magikarp
// leap over each one. A round has 12 of them, coming closer together and faster; 3 bumps and the round is over. The
// main process makes the swimmers here and replays the window's jump times to see which ones were cleared
// (main.js jumpStart / jumpFinish), so nothing can be dodged that wasn't.
const SWIMMERS = 12;
const LIVES = 3;
const AIR_FROM = 70;    // ms after the click Magikarp is high enough to clear a swimmer …
const AIR_TO = 620;     // … and until it's back in the water
const JUMP_MS = 700;    // a whole jump: no new one starts before this
const HALF = 70;        // how long a swimmer is under Magikarp, either side of its arrival
const KINDS = [211, 72, 90, 223, 318];   // Qwilfish, Tentacool, Shellder, Remoraid, Carvanha
const FIRST_AT = 1800;  // the first swimmer arrives this long after the start

/** The round's swimmers: { at (ms after the start when it reaches Magikarp), dex, ms (time to cross the pond) }. */
function swimmersOf(rnd = Math.random) {
  const out = [];
  let at = FIRST_AT;
  for (let i = 0; i < SWIMMERS; i++) {
    const gap = Math.max(1000, 1700 - i * 60) + Math.round(rnd() * 700);
    if (i > 0) at += gap;
    out.push({ at, dex: KINDS[Math.floor(rnd() * KINDS.length)], ms: Math.max(1300, 2600 - i * 110) });
  }
  return out;
}

/** The jumps that really happen: clicks while Magikarp is already in the air are ignored. */
function jumpsOf(times) {
  const out = [];
  for (const t of times.map(Number).filter((x) => x >= 0).sort((a, b) => a - b)) {
    if (!out.length || t - out[out.length - 1] >= JUMP_MS) out.push(t);
  }
  return out;
}

/** Is Magikarp in the air for the whole time swimmer `s` passes under it? */
const clears = (s, jumps) => jumps.some((j) => j + AIR_FROM <= s.at - HALF && s.at + HALF <= j + AIR_TO);

/**
 * Replay a round: { dodged, bumps, results: [true / false per swimmer reached], over (ran out of lives) }. Swimmers
 * after the third bump never come.
 */
function replay(swimmers, times) {
  const jumps = jumpsOf(times);
  const results = [];
  let bumps = 0;
  for (const s of swimmers) {
    if (bumps >= LIVES) break;
    const ok = clears(s, jumps);
    results.push(ok);
    if (!ok) bumps++;
  }
  return { dodged: results.filter(Boolean).length, bumps, results, over: bumps >= LIVES };
}

/** What a round is worth after dodging `dodged` of the 12. */
function rewardFor(dodged) {
  const berries = dodged >= 12 ? 4 : dodged >= 9 ? 3 : dodged >= 6 ? 2 : dodged >= 3 ? 1 : 0;
  return { dodged, berries, xp: 4 + dodged * 2, mood: Math.min(8, 2 + Math.floor(dodged / 2)) };
}

module.exports = { SWIMMERS, LIVES, AIR_FROM, AIR_TO, JUMP_MS, HALF, KINDS, FIRST_AT, swimmersOf, jumpsOf, clears, replay, rewardFor };
