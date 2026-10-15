// Daily sign-in and tasks (QQ Pet's 签到 and 每日任务). Four tasks a day, mixing work (Pomodoros,
// to-dos) and play (care, outings, fishing); rewards are berries. Pure functions over data.daily.

// kind: the activity that counts (see progress()); goal; reward in berries; w: how often it's picked
const TASKS = [
  { id: 'focus1',   kind: 'focus',    goal: 1,  reward: 3, w: 3 },
  { id: 'focus2',   kind: 'focus',    goal: 2,  reward: 5, w: 2 },
  { id: 'focusMin', kind: 'focusMin', goal: 50, reward: 4, w: 2 },
  { id: 'todo2',    kind: 'todo',     goal: 2,  reward: 3, w: 3 },
  { id: 'feed2',    kind: 'feed',     goal: 2,  reward: 2, w: 2 },
  { id: 'bath1',    kind: 'bath',     goal: 1,  reward: 2, w: 2 },
  { id: 'pat10',    kind: 'pat',      goal: 10, reward: 2, w: 2 },
  { id: 'outing1',  kind: 'outing',   goal: 1,  reward: 3, w: 2 },
  { id: 'train1',   kind: 'train',    goal: 1,  reward: 3, w: 1 },
  { id: 'fish2',    kind: 'fish',     goal: 2,  reward: 3, w: 2 }
];
const PER_DAY = 4;
const ALL_DONE_BONUS = 3;
// sign-in rewards over a 7-day streak; day 7 also brings a Rare Candy
const SIGN_REWARDS = [2, 2, 3, 3, 4, 4, 8];
const SIGN_ITEM = { day: 7, item: 'candy' };

function yesterdayOf(day) {
  const [y, m, d] = day.split('-').map(Number);
  const dt = new Date(y, m - 1, d - 1);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

/** Start a new day if needed: fresh tasks, not signed in yet. Returns true when the day changed. */
function roll(data, day, rnd = Math.random) {
  const d = data.daily;
  if (d.day === day) return false;
  const pool = TASKS.slice();
  const tasks = [];
  while (tasks.length < PER_DAY && pool.length) {
    let r = rnd() * pool.reduce((s, t) => s + t.w, 0);
    let k = 0;
    while (k < pool.length - 1 && (r -= pool[k].w) >= 0) k++;
    const t = pool.splice(k, 1)[0];
    // never two tasks for the same activity on one day
    for (let i = pool.length - 1; i >= 0; i--) if (pool[i].kind === t.kind) pool.splice(i, 1);
    tasks.push({ id: t.id, kind: t.kind, goal: t.goal, reward: t.reward, progress: 0, claimed: false });
  }
  Object.assign(d, { day, signedIn: false, tasks, bonusClaimed: false });
  return true;
}

/** Sign in for today. Returns { ok, reason?, streak, berries, item }. */
function signIn(data, day) {
  const d = data.daily;
  if (d.day !== day) roll(data, day);
  if (d.signedIn) return { ok: false, reason: 'done' };
  d.streak = d.lastSignDay === yesterdayOf(day) ? (d.streak || 0) + 1 : 1;
  d.lastSignDay = day;
  d.signedIn = true;
  const slot = (d.streak - 1) % SIGN_REWARDS.length;
  const berries = SIGN_REWARDS[slot];
  data.berries = (data.berries || 0) + berries;
  let item = null;
  if (slot + 1 === SIGN_ITEM.day) {
    item = SIGN_ITEM.item;
    data.inventory[item] = (data.inventory[item] || 0) + 1;
  }
  return { ok: true, streak: d.streak, berries, item };
}

/** Something happened that tasks may count (n times). Returns the tasks that just became complete. */
function progress(data, kind, n = 1) {
  const done = [];
  for (const t of data.daily.tasks || []) {
    if (t.kind !== kind || t.progress >= t.goal) continue;
    t.progress = Math.min(t.goal, t.progress + n);
    if (t.progress >= t.goal) done.push(t);
  }
  return done;
}

/** Collect a finished task's reward; with all four collected, the day's bonus too. */
function claim(data, taskId) {
  const t = (data.daily.tasks || []).find((x) => x.id === taskId);
  if (!t) return { ok: false, reason: 'unknown' };
  if (t.claimed) return { ok: false, reason: 'claimed' };
  if (t.progress < t.goal) return { ok: false, reason: 'notDone' };
  t.claimed = true;
  let berries = t.reward;
  let bonus = false;
  if (!data.daily.bonusClaimed && data.daily.tasks.every((x) => x.claimed)) {
    data.daily.bonusClaimed = true;
    berries += ALL_DONE_BONUS;
    bonus = true;
  }
  data.berries = (data.berries || 0) + berries;
  return { ok: true, berries, bonus };
}

module.exports = { TASKS, PER_DAY, ALL_DONE_BONUS, SIGN_REWARDS, SIGN_ITEM, yesterdayOf, roll, signIn, progress, claim };
