// Type Match-up (属性相克): a round of 10 questions – an attack of one type hits a Pokémon of one or two types; is it
// super effective, normal, not very effective, or does it have no effect? As the games say it. The later questions
// have dual types. Right answers turn into berries, XP and a good mood (main.js typesStart / typesAnswer).
const TypeChart = require('./typechart');

const ROUND = 10;
const DUAL_FROM = 5;                         // questions from this index on have two defending types
const CHOICES = ['none', 'weak', 'normal', 'super'];

/** The games' wording for a multiplier. */
function categoryOf(mult) {
  return mult === 0 ? 'none' : mult < 1 ? 'weak' : mult > 1 ? 'super' : 'normal';
}

/**
 * One question: { atk, def: [type] or [type, type], mult, answer }. Matches with an effect other than "normal" come up
 * more often than chance would have them (a type chart is mostly 1×), so the round isn't all "normal".
 */
function question(rnd = Math.random, dual = false) {
  const T = TypeChart.TYPES;
  const pick = () => T[Math.floor(rnd() * T.length)];
  for (let tries = 0; ; tries++) {
    const atk = pick();
    const def = [pick()];
    if (dual) { let b = pick(); while (b === def[0]) b = pick(); def.push(b); }
    const mult = TypeChart.effectiveness(atk, def);
    if (mult !== 1 || tries >= 3 || rnd() < 0.25) return { atk, def, mult, answer: categoryOf(mult) };
  }
}

function round(rnd = Math.random) {
  return Array.from({ length: ROUND }, (_, i) => question(rnd, i >= DUAL_FROM));
}

/** What a round is worth by right answers (0…10): { right, berries (at most 4), xp, mood }. */
function rewardFor(right) {
  const n = Math.max(0, Math.min(ROUND, Math.floor(Number(right) || 0)));
  return { right: n, berries: Math.floor(n / 3) + (n === ROUND ? 1 : 0), xp: n * 4, mood: n >= 7 ? 6 : n > 0 ? 2 : 0 };
}

module.exports = { ROUND, DUAL_FROM, CHOICES, categoryOf, question, round, rewardFor };
