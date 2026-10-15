/* world-combat-music.js — procedural exploration + combat stems (Web Audio, no files). A minor.
 *   var m = WorldCombatMusic.create({ ctx?: AudioContext-like });   // no ctx -> safe no-op mode (state still tracked)
 *   m.engage()    fade combat stem in (idempotent; never more than one combat stem)
 *   m.release()   fade combat stem out over 2 s
 *   m.update(dt)  advance fades + 120 bpm pulse scheduling (call per frame)
 *   m.hitThud()   sine 180 -> 40 Hz over 0.15 s
 *   m.state() -> {engaged, level, stems, beats}      m.dispose()
 */
(function (root) {
  'use strict';
  var BEAT = 0.5, FADE_IN = 0.6, FADE_OUT = 2.0, EXPLORE_GAIN = 0.08;
  var THUD = { f0: 180, f1: 40, dur: 0.15 };
  var A_MINOR = [110, 164.81, 220, 261.63]; // A2 E3 A3 C4
  var PULSE = [110, 110, 130.81, 164.81];   // A2 A2 C3 E3 per beat

  function thudFreq(t) { // frequency envelope value at t seconds into the thud (exponential)
    if (t <= 0) return THUD.f0; if (t >= THUD.dur) return THUD.f1;
    return THUD.f0 * Math.pow(THUD.f1 / THUD.f0, t / THUD.dur);
  }

  function create(opts) {
    opts = opts || {};
    var ctx = opts.ctx || null, master = null, expl = null, combat = null, pulseGain = null, pulseOsc = null;
    var engaged = false, level = 0, stems = 0, beatT = 0, beats = 0, started = false;

    function safe(fn) { try { return fn(); } catch (e) { return undefined; } }
    function startExplore() {
      if (!ctx || started) return; started = true;
      safe(function () {
        master = ctx.createGain(); master.gain.value = EXPLORE_GAIN; master.connect(ctx.destination);
        var lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 600; lp.connect(master);
        [A_MINOR[0], A_MINOR[0] * 1.004, A_MINOR[2]].forEach(function (f, i) {
          var o = ctx.createOscillator(); o.type = i === 2 ? 'sine' : 'sawtooth'; o.frequency.value = f; o.connect(lp); o.start();
        });
        var len = 2 * (ctx.sampleRate || 44100), buf = ctx.createBuffer(1, len, ctx.sampleRate || 44100), d = buf.getChannelData(0);
        for (var i = 0; i < len; i++) d[i] = (((i * 1103515245 + 12345) >>> 8) % 2000) / 1000 - 1; // deterministic noise
        var ns = ctx.createBufferSource(); ns.buffer = buf; ns.loop = true;
        var ng = ctx.createGain(); ng.gain.value = 0.15; var nf = ctx.createBiquadFilter(); nf.type = 'lowpass'; nf.frequency.value = 300;
        ns.connect(nf); nf.connect(ng); ng.connect(master); ns.start();
        expl = lp;
      });
    }
    function startCombatStem() {
      if (!ctx || combat || stems >= 1) return;
      stems = 1;
      safe(function () {
        combat = ctx.createGain(); combat.gain.value = 0; combat.connect(ctx.destination);
        pulseGain = ctx.createGain(); pulseGain.gain.value = 0; pulseGain.connect(combat);
        pulseOsc = ctx.createOscillator(); pulseOsc.type = 'square'; pulseOsc.frequency.value = PULSE[0];
        var lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 500;
        pulseOsc.connect(lp); lp.connect(pulseGain); pulseOsc.start();
      });
    }
    function stopCombatStem() {
      if (!stems) return;
      safe(function () { if (pulseOsc) pulseOsc.stop(); if (combat) combat.disconnect(); });
      combat = pulseGain = pulseOsc = null; stems = 0;
    }
    function setLevel(v) {
      level = v < 0 ? 0 : v > 1 ? 1 : v;
      if (combat) safe(function () { combat.gain.value = level * 0.12; });
    }

    function engage() { startExplore(); if (!engaged) { engaged = true; startCombatStem(); } else if (!stems) startCombatStem(); }
    function release() { engaged = false; }
    function update(dt) {
      if (!(dt > 0)) return;
      if (engaged) setLevel(level + dt / FADE_IN);
      else if (level > 0) { setLevel(level - dt / FADE_OUT); if (level <= 0) stopCombatStem(); }
      if (level > 0) {
        beatT += dt;
        while (beatT >= BEAT) {
          beatT -= BEAT; beats++;
          if (pulseGain && ctx) safe(function () {
            var t = ctx.currentTime || 0;
            pulseOsc.frequency.setValueAtTime(PULSE[beats % PULSE.length], t);
            pulseGain.gain.cancelScheduledValues(t);
            pulseGain.gain.setValueAtTime(1, t);
            pulseGain.gain.linearRampToValueAtTime(0, t + BEAT * 0.45);
          });
        }
      }
    }
    function hitThud() {
      if (!ctx) return THUD;
      safe(function () {
        var t = ctx.currentTime || 0, o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(THUD.f0, t);
        o.frequency.exponentialRampToValueAtTime(THUD.f1, t + THUD.dur);
        g.gain.setValueAtTime(0.3, t); g.gain.linearRampToValueAtTime(0, t + THUD.dur);
        o.connect(g); g.connect(ctx.destination); o.start(t); o.stop(t + THUD.dur + 0.02);
      });
      return THUD;
    }
    function dispose() { engaged = false; level = 0; stopCombatStem(); }
    return {
      engage: engage, release: release, update: update, hitThud: hitThud, dispose: dispose,
      state: function () { return { engaged: engaged, level: level, stems: stems, beats: beats, hasCtx: !!ctx }; }
    };
  }
  var api = { create: create, thudFreq: thudFreq, THUD: THUD, FADE_OUT: FADE_OUT, BPM: 120 };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.WorldCombatMusic = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
