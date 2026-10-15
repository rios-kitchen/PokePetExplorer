/* PokePet Explorer – pet window: which PMD animation (or pixel-art frame) shows what the pet is doing. */
(() => {
  const P = window.Pet;
  const { pet, input } = P;

  // Animations that belong to a state (shown automatically) – everything else is an "action".
  const STATE_ANIMS = new Set(['Idle', 'Walk', 'Sleep', 'EventSleep', 'Faint', 'Laying', 'Eat', 'Hurt']);

  const CELEBRATE = ['Attack', 'Shock', 'Shoot', 'QuickStrike', 'Swing', 'Double', 'Kick', 'Strike', 'Special', 'Charge', 'Hop'];

  const hasPmd = () => !!(P.sprite && P.sprite.kind === 'pmd');

  /** Play the first available PMD animation of `names` once (or `times` times). */
  function playAnim(names, { times = 1, minMs = 0 } = {}) {
    if (!hasPmd()) return false;
    const name = names.find((n) => P.sprite.anims[n]);
    if (!name) return false;
    const now = Date.now();
    pet.action = { name, start: now, until: now + Math.max(minMs, P.sprite.anims[name].total * times) };
    return true;
  }

  function playRandom(names, opts) {
    const avail = names.filter((n) => hasPmd() && P.sprite.anims[n]);
    if (!avail.length) return false;
    return playAnim([avail[Math.floor(Math.random() * avail.length)]], opts);
  }

  /** Every non-state animation of this Pokémon (used for random idle fun). */
  const funAnims = () => (hasPmd() ? Object.keys(P.sprite.anims).filter((n) => !STATE_ANIMS.has(n)) : []);

  function eyesClosed(now) {
    if (pet.mode === 'sleep' || pet.held || P.isFainted() || pet.pooping || now < pet.happyUntil || now < pet.dizzyUntil || now < pet.bathUntil) return true;
    if (P.isSick() && Math.sin(now / 1500) > 0.3) return true;   // tired, droopy eyes
    return now < pet.blinkUntil;
  }

  /** PMD: choose the animation matching what the pet is doing. */
  function pmdPose(now) {
    const A = P.sprite.anims;
    const pick = (...names) => names.find((n) => A[n]) || 'Idle';
    if (P.isFainted()) return { name: pick('Faint', 'Laying', 'Sleep'), once: !!A.Faint };
    if (pet.held) return { name: pick('Hurt', 'Idle') };
    if (pet.action && now < pet.action.until) return { name: pet.action.name, start: pet.action.start };
    pet.action = null;
    if (pet.mode === 'sleep') return { name: pick('Sleep', 'EventSleep', 'Laying') };
    if (pet.pooping) return { name: pick('Sit', 'Charge', 'DeepBreath', 'Idle') };
    if (now < pet.dizzyUntil) return { name: pick('LostBalance', 'Tumble', 'Hurt') };
    if (now < pet.bathUntil) return { name: pick('Rotate', 'DeepBreath', 'Idle') };
    if (now < pet.eatUntil || pet.eating) return { name: pick('Eat', 'Nod') };
    if (now < pet.happyUntil) return { name: pick('Pose', 'Idle') };
    if (pet.mode === 'walk') return { name: pick('Walk') };
    if (P.showTyping(now)) return { name: pick('Sit', 'Nod', 'Idle') };
    if (P.isSick()) return { name: pick('Laying', 'Pain', 'Idle') };
    return { name: 'Idle' };
  }

  // PMD sheet rows: 0 down, 1 down-right, 2 right, 3 up-right, 4 up, 5 up-left, 6 left, 7 down-left
  function pmdFrame(now) {
    const pose = pmdPose(now);
    const anims = P.sprite.anims;
    const a = anims[pose.name] || anims.Idle || Object.values(anims)[0];
    if (pose.start) { pet.anim = pose.name; pet.animStart = pose.start; }
    else if (pet.anim !== pose.name) { pet.anim = pose.name; pet.animStart = now; }
    let row = 0;
    if (pet.mode === 'walk' && pose.name === 'Walk') row = pet.dir > 0 ? 2 : 6;
    else if (input.look) row = input.look > 0 ? 1 : 7;
    else if (pose.start) row = pet.dir > 0 ? 1 : 7;   // actions face the way the pet last looked
    row = Math.min(row, a.dirs.length - 1);
    let t = now - pet.animStart;
    let i = a.durs.length - 1;
    if (!pose.once) t %= a.total;
    for (let k = 0; k < a.durs.length; k++) {
      if (t < a.durs[k]) { i = k; break; }
      t -= a.durs[k];
    }
    const frames = a.dirs[row];
    return { img: frames[Math.min(i, frames.length - 1)], w: a.w, h: a.h, cx: a.cx, cy: a.cy };
  }

  /** The image to draw now: { img, w, h, cx?, cy? } (cx/cy = PMD anchor). */
  function currentImage(now) {
    const sprite = P.sprite;
    if (sprite.kind === 'pmd') return pmdFrame(now);
    const flip = pet.dir > 0;
    const closed = eyesClosed(now);
    const look = !closed && input.look ? (flip ? -input.look : input.look) : 0;
    const v = closed ? sprite.img.closed : look ? sprite.img[look] : sprite.img.open;
    return { img: flip ? v.f : v.n, w: sprite.w, h: sprite.h };
  }

  Object.assign(P, { CELEBRATE, playAnim, playRandom, funAnims, currentImage });
})();
