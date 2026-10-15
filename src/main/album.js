// Photo album rules: the most recent few photos are kept; favourites are kept for good (up to a limit)
// and don't count towards the recent ones. Pure functions over the photo list – files are handled by main.

const RECENT = 3;          // regular photos kept (newest first)
const MAX_FAVORITES = 20;

/** Which photos to drop: regular ones beyond the newest RECENT. Returns the dropped entries. */
function prune(photos) {
  const regular = photos.filter((p) => !p.fav).sort((a, b) => b.at - a.at);
  const drop = new Set(regular.slice(RECENT).map((p) => p.id));
  const dropped = photos.filter((p) => drop.has(p.id));
  photos.splice(0, photos.length, ...photos.filter((p) => !drop.has(p.id)));
  return dropped;
}

/**
 * Mark or unmark a favourite. Returns { ok, reason?, dropped }. reasons: 'unknown' | 'full'.
 * Unmarking can drop the photo (or another one) when it isn't among the newest regular ones.
 */
function setFavorite(photos, id, fav) {
  const ph = photos.find((p) => p.id === id);
  if (!ph) return { ok: false, reason: 'unknown', dropped: [] };
  if (fav && !ph.fav && photos.filter((p) => p.fav).length >= MAX_FAVORITES) return { ok: false, reason: 'full', dropped: [] };
  ph.fav = !!fav;
  return { ok: true, dropped: prune(photos) };
}

/** Would unmarking this favourite delete it right away? (for the panel's warning) */
function wouldDrop(photos, id) {
  const ph = photos.find((p) => p.id === id);
  if (!ph || !ph.fav) return false;
  const regular = photos.filter((p) => !p.fav || p.id === id).sort((a, b) => b.at - a.at);
  return regular.findIndex((p) => p.id === id) >= RECENT;
}

module.exports = { RECENT, MAX_FAVORITES, prune, setFavorite, wouldDrop };
