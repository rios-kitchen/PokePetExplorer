// Shiny Pokémon: as rare as in the games (1 in 4096), but never more than about three months apart.
// Once PITY_DAYS have passed since the last shiny joined the team, every wild Pokémon you meet (in the grass,
// on an outing, or one following you home) is shiny – until one of them joins you.

const RATE = 1 / 4096;
const PITY_DAYS = 90;

const since = (data, now) => (data.shiny && data.shiny.since) || now;

/** Has the guarantee kicked in? */
function due(data, now = Date.now()) {
  return now - since(data, now) >= PITY_DAYS * 86400e3;
}

/** Roll for a wild Pokémon (with the guarantee) or, with pity false, at the plain rate. */
function roll(data, { pity = true, rnd = Math.random, now = Date.now() } = {}) {
  if (pity && due(data, now)) return true;
  return rnd() < RATE;
}

/** A shiny joined the team: the next guarantee is PITY_DAYS from now. */
function obtained(data, now = Date.now()) {
  data.shiny = { since: now };
}

module.exports = { RATE, PITY_DAYS, due, roll, obtained };
