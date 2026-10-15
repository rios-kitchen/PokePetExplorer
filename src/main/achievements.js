// Achievements: milestones across focus, care and raising. Each pays out berries once.
const { levelOf } = require('./growth');
const { REGIONS } = require('./expedition');
const FISH_SPECIES = require('./fishing').FISH.length;

const pets = (d) => Object.values(d.pets || {});
const maxLevel = (d) => Math.max(1, ...pets(d).map((p) => levelOf(p.xp)));
const regionsSeen = (d) => new Set((d.souvenirs || []).map((s) => s.region)).size;

// id → { reward (berries), goal, progress(data) } – unlocked when progress ≥ goal
const ACHIEVEMENTS = {
  focus1:    { reward: 2,  goal: 1,   progress: (d) => d.stats.totalPomos },
  focus25:   { reward: 5,  goal: 25,  progress: (d) => d.stats.totalPomos },
  focus100:  { reward: 10, goal: 100, progress: (d) => d.stats.totalPomos },
  todo10:    { reward: 3,  goal: 10,  progress: (d) => d.stats.todosDone },
  todo50:    { reward: 5,  goal: 50,  progress: (d) => d.stats.todosDone },
  level5:    { reward: 3,  goal: 5,   progress: maxLevel },
  level12:   { reward: 5,  goal: 16,  progress: maxLevel },
  level24:   { reward: 10, goal: 36,  progress: maxLevel },
  hatch:     { reward: 5,  goal: 1,   progress: (d) => pets(d).filter((p) => p.hatchedAt).length },
  evolve:    { reward: 5,  goal: 1,   progress: (d) => Math.max(0, ...pets(d).map((p) => p.evolutions || 0)) },
  evolve2:   { reward: 10, goal: 2,   progress: (d) => Math.max(0, ...pets(d).map((p) => p.evolutions || 0)) },
  explore1:  { reward: 2,  goal: 1,   progress: (d) => d.stats.expeditions || 0 },
  explore20: { reward: 8,  goal: 20,  progress: (d) => d.stats.expeditions || 0 },
  travelAll: { reward: 15, goal: REGIONS.length, progress: regionsSeen },
  doctor:    { reward: 5,  goal: 5,   progress: (d) => d.stats.cures || 0 },
  star:      { reward: 8,  goal: 50,  progress: (d) => Math.max(0, ...pets(d).map((p) => Math.max(0, ...Object.values(p.attrs || {})))) },
  team10:    { reward: 5,  goal: 10,  progress: (d) => 6 + (d.custom || []).length },
  shiny:     { reward: 3,  goal: 1,   progress: (d) => Object.values(d.skins || {}).filter((s) => s && s.shiny).length },
  fish1:     { reward: 2,  goal: 1,   progress: (d) => d.stats.fishCaught || 0 },
  catch1:    { reward: 3,  goal: 1,   progress: (d) => d.stats.caught || 0 },
  catch10:   { reward: 10, goal: 10,  progress: (d) => Object.values(d.pokedex || {}).filter((e) => e.caught).length },
  wins20:    { reward: 8,  goal: 20,  progress: (d) => d.stats.battlesWon || 0 },
  fishdex10: { reward: 8,  goal: 10,  progress: (d) => Object.keys(d.fishdex || {}).length },
  fishdexAll: { reward: 20, goal: FISH_SPECIES, progress: (d) => Object.keys(d.fishdex || {}).length }
};

/** Unlock what has been reached (pays the berries). Returns the newly unlocked ids. */
function unlockNew(data, now = Date.now()) {
  const fresh = [];
  for (const [id, a] of Object.entries(ACHIEVEMENTS)) {
    if (data.achievements[id]) continue;
    if (a.progress(data) >= a.goal) {
      data.achievements[id] = now;
      data.berries = (data.berries || 0) + a.reward;
      fresh.push(id);
    }
  }
  return fresh;
}

/** For the panel: [{ id, reward, goal, progress, at }]. */
function list(data) {
  return Object.entries(ACHIEVEMENTS).map(([id, a]) => ({
    id, reward: a.reward, goal: a.goal, progress: Math.min(a.goal, a.progress(data)), at: data.achievements[id] || null
  }));
}

module.exports = { ACHIEVEMENTS, unlockNew, list };
