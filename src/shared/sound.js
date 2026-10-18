/* Tiny 8-bit sound effects generated with WebAudio (no audio files needed). */
(function (root) {
  let ctx = null;
  let enabled = true;

  // [frequency Hz, start s, duration s, wave?, volume?]
  const SONGS = {
    // ---- Pomodoro phase changes: four clearly different sounds
    // focus start: energetic rising arpeggio with a punchy end – "let's go!"
    focusStart: [[392, 0, 0.07], [523, 0.07, 0.07], [659, 0.14, 0.07], [784, 0.21, 0.07],
      [1047, 0.3, 0.1], [1047, 0.42, 0.22]],
    // focus end: victory jingle
    focusEnd: [[523, 0, 0.1], [659, 0.11, 0.1], [784, 0.22, 0.14], [698, 0.4, 0.1],
      [880, 0.51, 0.14], [988, 0.68, 0.1], [1047, 0.8, 0.45],
      [262, 0, 0.36, 'triangle', 0.08], [349, 0.4, 0.26, 'triangle', 0.08], [392, 0.68, 0.1, 'triangle', 0.08],
      [523, 0.8, 0.45, 'triangle', 0.08]],
    // break start: soft, slow and descending – "breathe out"
    breakStart: [[784, 0, 0.32, 'triangle', 0.09], [659, 0.3, 0.32, 'triangle', 0.09],
      [523, 0.6, 0.32, 'triangle', 0.09], [392, 0.9, 0.7, 'sine', 0.11],
      [262, 0.9, 0.7, 'sine', 0.07]],
    // break end: a bell calling you back – ding-dong, ding-dong
    breakEnd: [[1319, 0, 0.35, 'sine', 0.12], [1047, 0.32, 0.45, 'sine', 0.12],
      [1319, 0.8, 0.35, 'sine', 0.12], [1047, 1.12, 0.6, 'sine', 0.12],
      [2637, 0, 0.12, 'sine', 0.03], [2637, 0.8, 0.12, 'sine', 0.03]],
    // pooping: a low, slightly embarrassing "plop"
    poop: [[196, 0, 0.12, 'triangle', 0.12], [147, 0.14, 0.16, 'triangle', 0.12], [110, 0.34, 0.22, 'sine', 0.14]],
    // bath: bubbly blips
    bath: [[1568, 0, 0.04, 'sine', 0.08], [1976, 0.06, 0.04, 'sine', 0.08], [1760, 0.13, 0.04, 'sine', 0.08],
      [2349, 0.2, 0.05, 'sine', 0.08], [2093, 0.3, 0.06, 'sine', 0.08]],

    pat: [[988, 0, 0.06], [1319, 0.07, 0.09]],
    blip: [[784, 0, 0.05], [1047, 0.06, 0.07]],
    start: [[523, 0, 0.08], [659, 0.09, 0.08], [784, 0.18, 0.08], [1047, 0.27, 0.16]],
    fanfare: [[784, 0, 0.1], [784, 0.12, 0.1], [784, 0.24, 0.1], [1047, 0.36, 0.35],
      [932, 0.75, 0.12], [1047, 0.9, 0.12], [1175, 1.05, 0.12], [1319, 1.2, 0.45]],
    chime: [[1319, 0, 0.12], [1047, 0.14, 0.12], [1319, 0.28, 0.25]],
    eat: [[392, 0, 0.05], [523, 0.07, 0.05], [392, 0.14, 0.05], [659, 0.21, 0.12]],
    levelup: [[523, 0, 0.07], [659, 0.08, 0.07], [784, 0.16, 0.07], [1047, 0.24, 0.07],
      [1319, 0.32, 0.07], [1568, 0.4, 0.3]],
    alarm: [[1568, 0, 0.08], [0, 0.09, 0.05], [1568, 0.15, 0.08], [0, 0.24, 0.05], [1568, 0.3, 0.08]],
    sleep: [[392, 0, 0.2, 'triangle'], [330, 0.22, 0.3, 'triangle']],
    switch: [[440, 0, 0.06], [660, 0.06, 0.06], [880, 0.12, 0.06], [1320, 0.18, 0.12]],
    // Chatot Echo pads: the four notes of an A major chord, like the classic Simon
    padFire: [[330, 0, 0.3, 'triangle', 0.12]], padWater: [[440, 0, 0.3, 'triangle', 0.12]],
    padGrass: [[554, 0, 0.3, 'triangle', 0.12]], padElectric: [[659, 0, 0.3, 'triangle', 0.12]],
    buzz: [[110, 0, 0.35, 'sawtooth', 0.06]]
  };

  function play(name) {
    if (!enabled || !SONGS[name]) return;
    try {
      ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
      const t0 = ctx.currentTime + 0.01;
      for (const [f, start, dur, wave, vol] of SONGS[name]) {
        if (!f) continue;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = wave || 'square';
        osc.frequency.value = f;
        gain.gain.setValueAtTime(0.0001, t0 + start);
        gain.gain.exponentialRampToValueAtTime(vol || 0.045, t0 + start + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + start + dur);
        osc.connect(gain).connect(ctx.destination);
        osc.start(t0 + start);
        osc.stop(t0 + start + dur + 0.02);
      }
    } catch { /* audio unavailable */ }
  }

  /** Play even when sound effects are switched off (used for previews in the settings). */
  function preview(name) {
    const was = enabled;
    enabled = true;
    play(name);
    enabled = was;
  }

  root.PokeSound = { play, preview, setEnabled(v) { enabled = !!v; } };
})(typeof self !== 'undefined' ? self : this);
