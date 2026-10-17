// Who's That Pokémon? (猜猜我是谁): a Pokémon's outline as a black silhouette and four names to pick from – the
// right one earns a few berries and makes the partner happy. The outline is its PMD SpriteCollab sprite (transparent
// around it, unlike the square portraits), names from PokeAPI (main.js quizAsk fetches them); limited per day and hour like the other mini-games (limits.js).

const CHOICES = 4;
const REWARD = { berries: 2, xp: 15, mood: 5 };
const STREAK_BONUS = 3;    // every 3rd right answer in a row: one more berry
const KNOWN_SHARE = 0.5;   // how often the answer is one you've already met (the Pokédex), when there are enough

/** Species with a PMD sprite (from the cached credit index), or all 1025 when it isn't known yet. */
function pool(creditIndex) {
  const dex = creditIndex && creditIndex.dex;
  const list = dex ? Object.entries(dex).filter(([, e]) => e && e.sprite).map(([k]) => Number(k)).filter((n) => n >= 1 && n <= 1025) : [];
  return list.length > 100 ? list : Array.from({ length: 1025 }, (_, i) => i + 1);
}

/**
 * A question: { answer, choices } – the answer and three others in a random order. known: dex numbers met before
 * (half the time the answer is one of them, so the quiz isn't only strangers). exclude: recent answers.
 */
function question(list, { known = [], exclude = [], rnd = Math.random } = {}) {
  const skip = new Set(exclude);
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  const fresh = list.filter((d) => !skip.has(d));
  const all = fresh.length >= CHOICES ? fresh : list;
  const inPool = new Set(all);
  const met = known.filter((d) => inPool.has(d));
  const answer = met.length >= 5 && rnd() < KNOWN_SHARE ? pick(met) : pick(all);
  const choices = [answer];
  for (let guard = 0; choices.length < CHOICES && guard < 200; guard++) {
    const d = pick(list);
    if (!choices.includes(d)) choices.push(d);
  }
  for (let i = choices.length - 1; i > 0; i--) {   // shuffle
    const j = Math.floor(rnd() * (i + 1));
    [choices[i], choices[j]] = [choices[j], choices[i]];
  }
  return { answer, choices };
}

/** The berries for a right answer with `streak` right in a row (this one included). */
const berriesFor = (streak) => REWARD.berries + (streak > 0 && streak % STREAK_BONUS === 0 ? 1 : 0);

module.exports = { CHOICES, REWARD, STREAK_BONUS, pool, question, berriesFor };
