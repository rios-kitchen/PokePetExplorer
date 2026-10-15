// The Pokédex: every species you've met (seen) and every one that joined your team (caught), with counts and
// first dates. Entries are never removed – not even when a Pokémon leaves the team later.
// data.pokedex: { [dex]: { seen, caught, names, firstSeen, firstCaught, shiny } }

function entry(data, dex) {
  data.pokedex = data.pokedex || {};
  const e = data.pokedex[dex] || (data.pokedex[dex] = { seen: 0, caught: 0 });
  return e;
}

/** Met one: in the grass, on an outing, on the fishing line, following you home … */
function see(data, dex, names, now = Date.now()) {
  if (!dex) return null;
  const e = entry(data, dex);
  e.seen += 1;
  if (names && !e.names) e.names = names;
  if (!e.firstSeen) e.firstSeen = now;
  return e;
}

/** One joined the team (caught, a starter, a friend that came along, an evolution …). Counts as seen too. */
function caught(data, dex, names, { shiny = false } = {}, now = Date.now()) {
  if (!dex) return null;
  const e = entry(data, dex);
  if (!e.seen) { e.seen = 1; e.firstSeen = e.firstSeen || now; }
  e.caught += 1;
  if (names && !e.names) e.names = names;
  if (!e.firstCaught) e.firstCaught = now;
  if (shiny) e.shiny = true;
  return e;
}

/**
 * Make sure older records are in: the team's species (and their earlier forms are unknown, so only the current
 * ones) count as caught, the fishing Pokédex as seen. Only ever adds – safe to run on every start.
 */
function backfill(data, team, fish) {
  for (const p of team) {
    if (!p.dex) continue;
    const e = entry(data, p.dex);
    if (!e.seen) e.seen = 1;
    if (!e.caught) e.caught = 1;
    if (p.names && !e.names) e.names = p.names;
    if (p.shiny) e.shiny = true;
  }
  for (const f of fish) {
    const e = entry(data, f.dex);
    if (!e.seen) e.seen = 1;
    if (f.names && !e.names) e.names = f.names;
  }
}

/** For the panel: entries sorted by number. */
function list(data) {
  return Object.entries(data.pokedex || {})
    .filter(([, e]) => e.seen > 0 || e.caught > 0)
    .map(([dex, e]) => ({ dex: Number(dex), ...e }))
    .sort((a, b) => a.dex - b.dex);
}

function counts(data) {
  const all = list(data);
  return { seen: all.length, caught: all.filter((e) => e.caught > 0).length };
}

module.exports = { see, caught, backfill, list, counts };
