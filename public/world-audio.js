/**
 * world-audio.js — SHADDAI World 3D Ambient + SFX System
 * NEXUS build — v1.0.0
 *
 * Fully synthesized via Web Audio API. Zero external files, zero network.
 * Degrades gracefully if Web Audio is unavailable.
 *
 * Usage:
 *   const audio = window.buildWorldAudio();
 *   audio.start();                 // call from user-gesture (ENTER click)
 *   audio.playSFX('warp');         // one-shot SFX
 *   audio.setTheme('tron');        // shift ambient character
 *   audio.setVolume(0.5);          // master volume 0..1
 *   audio.setEnabled(false);       // mute + persist to localStorage
 *   audio.isEnabled();             // → boolean
 *   audio.stop();                  // fade out ambient
 *   audio.update();                // no-op, safe to call from animate loop
 */
(function (global) {
  'use strict';

  // ─── Theme parameter table ───────────────────────────────────────────────────
  // Each theme shifts: base drone pitch, low-pass cutoff, detune spread,
  // LFO rate & depth for the filter sweep.
  var THEMES = {
    default: { baseFreq: 55,  filterFreq: 820,  detune: 7,  lfoRate: 0.12, lfoDepth: 190 },
    tron:    { baseFreq: 55,  filterFreq: 1300, detune: 5,  lfoRate: 0.18, lfoDepth: 240 }, // cool, electric
    snow:    { baseFreq: 65,  filterFreq: 1900, detune: 9,  lfoRate: 0.07, lfoDepth: 130 }, // airy, high
    desert:  { baseFreq: 49,  filterFreq: 580,  detune: 6,  lfoRate: 0.10, lfoDepth: 110 }, // warm, low
    ocean:   { baseFreq: 41,  filterFreq: 380,  detune: 8,  lfoRate: 0.06, lfoDepth: 150 }, // deep, slow
    forest:  { baseFreq: 55,  filterFreq: 680,  detune: 11, lfoRate: 0.09, lfoDepth: 145 }, // organic, mid
    neon:    { baseFreq: 58,  filterFreq: 1500, detune: 4,  lfoRate: 0.22, lfoDepth: 270 }, // bright, fast
    void:    { baseFreq: 36,  filterFreq: 320,  detune: 12, lfoRate: 0.05, lfoDepth: 90  }, // dark, minimal
  };

  var STORAGE_KEY = 'shaddai_audio_enabled';
  var DEFAULT_VOLUME = 0.35;

  // ─── Factory ─────────────────────────────────────────────────────────────────
  global.buildWorldAudio = function () {

    var ctx         = null;
    var masterGain  = null;
    var ambient     = null;   // live ambient node cluster
    var running     = false;
    var currentVol  = DEFAULT_VOLUME;
    var currentTheme = 'default';
    var enabled     = (localStorage.getItem(STORAGE_KEY) !== 'false'); // default ON

    // ── AudioContext bootstrap (lazy — must be triggered by user gesture) ──────
    function ensureCtx() {
      if (ctx) return ctx;
      try {
        var AC = global.AudioContext || global.webkitAudioContext;
        if (!AC) return null;
        ctx = new AC();
        masterGain = ctx.createGain();
        masterGain.gain.setValueAtTime(currentVol, ctx.currentTime);
        masterGain.connect(ctx.destination);
        return ctx;
      } catch (e) {
        ctx = null;
        return null;
      }
    }

    function resumeCtx() {
      if (ctx && ctx.state === 'suspended') {
        ctx.resume().catch(function () {});
      }
    }

    function themeParams(name) {
      return THEMES[name] || THEMES['default'];
    }

    // ── White-noise buffer (reused by SFX) ────────────────────────────────────
    function makeNoiseBuf(seconds) {
      if (!ctx) return null;
      try {
        var sr  = ctx.sampleRate;
        var len = Math.ceil(sr * seconds);
        var buf = ctx.createBuffer(1, len, sr);
        var ch  = buf.getChannelData(0);
        for (var i = 0; i < len; i++) ch[i] = Math.random() * 2 - 1;
        return buf;
      } catch (e) { return null; }
    }

    // ── Ambient bed ───────────────────────────────────────────────────────────
    // Three detuned oscillators → lowpass with LFO sweep → gentle amp breath
    // Returns a cluster object so setTheme() can modulate the live nodes.
    function startAmbient(themeName) {
      if (!ctx || !masterGain) return null;
      var t   = themeParams(themeName);
      var now = ctx.currentTime;

      // Output gain — fade in
      var ambGain = ctx.createGain();
      ambGain.gain.setValueAtTime(0, now);
      ambGain.gain.linearRampToValueAtTime(0.24, now + 3.5);
      ambGain.connect(masterGain);

      // Low-pass filter (main timbre shaper)
      var lpf = ctx.createBiquadFilter();
      lpf.type = 'lowpass';
      lpf.frequency.setValueAtTime(t.filterFreq, now);
      lpf.Q.setValueAtTime(1.4, now);
      lpf.connect(ambGain);

      // Filter LFO — slow sweep
      var lfoOsc  = ctx.createOscillator();
      lfoOsc.type = 'sine';
      lfoOsc.frequency.setValueAtTime(t.lfoRate, now);
      var lfoGain = ctx.createGain();
      lfoGain.gain.setValueAtTime(t.lfoDepth, now);
      lfoOsc.connect(lfoGain);
      lfoGain.connect(lpf.frequency);
      lfoOsc.start();

      // Amplitude LFO — gentle breathing (~14-second cycle)
      var ampLfo  = ctx.createOscillator();
      ampLfo.type = 'sine';
      ampLfo.frequency.setValueAtTime(0.072, now);
      var ampLfoGain = ctx.createGain();
      ampLfoGain.gain.setValueAtTime(0.045, now);
      ampLfo.connect(ampLfoGain);
      ampLfoGain.connect(ambGain.gain);
      ampLfo.start();

      // Osc 1 — root (sawtooth, main body)
      var o1 = ctx.createOscillator();
      o1.type = 'sawtooth';
      o1.frequency.setValueAtTime(t.baseFreq, now);
      o1.detune.setValueAtTime(0, now);
      var g1 = ctx.createGain();
      g1.gain.setValueAtTime(0.38, now);

      // Osc 2 — root + detune (sawtooth, chorus effect)
      var o2 = ctx.createOscillator();
      o2.type = 'sawtooth';
      o2.frequency.setValueAtTime(t.baseFreq, now);
      o2.detune.setValueAtTime(t.detune, now);
      var g2 = ctx.createGain();
      g2.gain.setValueAtTime(0.34, now);

      // Osc 3 — perfect 5th above (triangle, soft harmonic)
      var o3 = ctx.createOscillator();
      o3.type = 'triangle';
      o3.frequency.setValueAtTime(t.baseFreq * 1.5, now);
      o3.detune.setValueAtTime(-(t.detune * 0.6), now);
      var g3 = ctx.createGain();
      g3.gain.setValueAtTime(0.18, now);

      o1.connect(g1); g1.connect(lpf);
      o2.connect(g2); g2.connect(lpf);
      o3.connect(g3); g3.connect(lpf);
      o1.start(); o2.start(); o3.start();

      return {
        ambGain : ambGain,
        lpf     : lpf,
        lfoOsc  : lfoOsc,
        lfoGain : lfoGain,
        ampLfo  : ampLfo,
        ampLfoGain: ampLfoGain,
        o1: o1, o2: o2, o3: o3,
        g1: g1, g2: g2, g3: g3,
      };
    }

    function fadeStopAmbient(nodes) {
      if (!nodes || !ctx) return;
      var now = ctx.currentTime;
      try {
        nodes.ambGain.gain.setValueAtTime(nodes.ambGain.gain.value, now);
        nodes.ambGain.gain.linearRampToValueAtTime(0, now + 1.6);
      } catch (e) {}
      setTimeout(function () {
        ['o1','o2','o3','lfoOsc','ampLfo'].forEach(function (k) {
          try { nodes[k].stop(); } catch (e) {}
        });
      }, 1700);
    }

    // ── SFX catalog ──────────────────────────────────────────────────────────
    // Each function is a self-contained one-shot. No return value needed.

    var SFX = {

      /**
       * warp — rising frequency sweep + four shimmer partials
       * Used for: spawn, portal descent, teleport
       * Sounds like: a sci-fi transporter beam — low rumble sweeps up to a bright shimmer
       */
      warp: function () {
        var now = ctx.currentTime;

        // Main sweep: sawtooth through bandpass chasing the sweep
        var g = ctx.createGain();
        g.gain.setValueAtTime(0.46, now);
        g.gain.linearRampToValueAtTime(0, now + 1.9);
        g.connect(masterGain);

        var osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(60, now);
        osc.frequency.exponentialRampToValueAtTime(2600, now + 1.3);

        var bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.setValueAtTime(200, now);
        bp.frequency.exponentialRampToValueAtTime(3200, now + 1.3);
        bp.Q.setValueAtTime(2.5, now);

        osc.connect(bp); bp.connect(g);
        osc.start(now); osc.stop(now + 1.95);

        // Shimmer partials — staggered entry
        var baseFreqs = [1100, 1540, 2090, 2750];
        baseFreqs.forEach(function (freq, i) {
          var delay = i * 0.14;
          var sh  = ctx.createOscillator();
          sh.type = 'sine';
          sh.frequency.setValueAtTime(freq, now + delay);
          sh.frequency.linearRampToValueAtTime(freq * 2.6, now + delay + 0.65);

          var sg = ctx.createGain();
          sg.gain.setValueAtTime(0, now + delay);
          sg.gain.linearRampToValueAtTime(0.11, now + delay + 0.07);
          sg.gain.exponentialRampToValueAtTime(0.001, now + delay + 0.6);

          sh.connect(sg); sg.connect(masterGain);
          sh.start(now + delay); sh.stop(now + delay + 0.7);
        });
      },

      /**
       * enter — broadband noise whoosh
       * Used for: entering a room, zone transition, door open
       * Sounds like: a cinematic air-rush whoosh left-to-right
       */
      enter: function () {
        var now = ctx.currentTime;
        var buf = makeNoiseBuf(0.55);
        if (!buf) return;

        var src = ctx.createBufferSource();
        src.buffer = buf;

        var bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.setValueAtTime(180, now);
        bp.frequency.exponentialRampToValueAtTime(5000, now + 0.32);
        bp.Q.setValueAtTime(0.7, now);

        var g = ctx.createGain();
        g.gain.setValueAtTime(0, now);
        g.gain.linearRampToValueAtTime(0.5, now + 0.04);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.52);

        src.connect(bp); bp.connect(g); g.connect(masterGain);
        src.start(now); src.stop(now + 0.55);
      },

      /**
       * portal — ascending chime arpeggio (C maj pentatonic)
       * Used for: portal hover/interact, objective complete
       * Sounds like: soft bell chimes, crystalline and airy
       */
      portal: function () {
        var now = ctx.currentTime;
        // C5 E5 G5 C6 — pentatonic arpeggio
        var notes = [523.25, 659.25, 783.99, 1046.5];
        notes.forEach(function (freq, i) {
          var t0 = now + i * 0.11;

          // Fundamental (sine)
          var osc = ctx.createOscillator();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, t0);

          // Inharmonic partial (bell-like clang)
          var osc2 = ctx.createOscillator();
          osc2.type = 'sine';
          osc2.frequency.setValueAtTime(freq * 2.756, t0);

          var g1 = ctx.createGain();
          g1.gain.setValueAtTime(0, t0);
          g1.gain.linearRampToValueAtTime(0.18, t0 + 0.012);
          g1.gain.exponentialRampToValueAtTime(0.001, t0 + 1.3);

          var g2 = ctx.createGain();
          g2.gain.setValueAtTime(0, t0);
          g2.gain.linearRampToValueAtTime(0.05, t0 + 0.012);
          g2.gain.exponentialRampToValueAtTime(0.001, t0 + 0.7);

          osc.connect(g1);   g1.connect(masterGain);
          osc2.connect(g2);  g2.connect(masterGain);
          osc.start(t0);  osc.stop(t0 + 1.4);
          osc2.start(t0); osc2.stop(t0 + 1.4);
        });
      },

      /**
       * theme — quick three-note ascending stinger
       * Used for: theme switching, environment change
       * Sounds like: a punchy synth micro-fanfare (triangle + detune)
       */
      theme: function () {
        var now = ctx.currentTime;
        var freqs = [220, 329.63, 440]; // A3 E4 A4
        freqs.forEach(function (freq, i) {
          var t0 = now + i * 0.075;
          var osc = ctx.createOscillator();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(freq, t0);
          osc.detune.setValueAtTime(12, t0);

          var g = ctx.createGain();
          g.gain.setValueAtTime(0, t0);
          g.gain.linearRampToValueAtTime(0.20, t0 + 0.018);
          g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.32);

          osc.connect(g); g.connect(masterGain);
          osc.start(t0); osc.stop(t0 + 0.38);
        });
      },

      /**
       * ui — short frequency-rise blip
       * Used for: button clicks, menu selections, toggles
       * Sounds like: a small digital blip / confirm tone
       */
      ui: function () {
        var now = ctx.currentTime;
        var osc = ctx.createOscillator();
        osc.type = 'square';
        osc.frequency.setValueAtTime(820, now);
        osc.frequency.linearRampToValueAtTime(1080, now + 0.065);

        var lpf = ctx.createBiquadFilter();
        lpf.type = 'lowpass';
        lpf.frequency.setValueAtTime(2200, now);

        var g = ctx.createGain();
        g.gain.setValueAtTime(0.13, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.13);

        osc.connect(lpf); lpf.connect(g); g.connect(masterGain);
        osc.start(now); osc.stop(now + 0.15);
      },

      /**
       * footstep — very short noise tick
       * Used for: player movement (call every N frames from movement handler)
       * Sounds like: a soft muffled thud on a metal grid floor
       */
      footstep: function () {
        var now = ctx.currentTime;
        var buf = makeNoiseBuf(0.07);
        if (!buf) return;

        var src = ctx.createBufferSource();
        src.buffer = buf;

        var hpf = ctx.createBiquadFilter();
        hpf.type = 'highpass';
        hpf.frequency.setValueAtTime(320, now);

        var lpf = ctx.createBiquadFilter();
        lpf.type = 'lowpass';
        lpf.frequency.setValueAtTime(2800, now);

        var g = ctx.createGain();
        g.gain.setValueAtTime(0.075, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.065);

        src.connect(hpf); hpf.connect(lpf); lpf.connect(g); g.connect(masterGain);
        src.start(now); src.stop(now + 0.08);
      },
    };

    // ── Internal SFX dispatch (safe) ─────────────────────────────────────────
    function dispatchSFX(name) {
      var fn = SFX[name];
      if (!fn) return;
      try { fn(); } catch (e) {}
    }

    // ─── Public API ───────────────────────────────────────────────────────────
    return {

      /**
       * start() — initialise/resume AudioContext and begin ambient bed.
       * MUST be called from a user-gesture handler (click/keydown) to satisfy
       * the browser autoplay policy. Safe to call multiple times.
       */
      start: function () {
        if (!enabled) return;
        var c = ensureCtx();
        if (!c) return;
        resumeCtx();
        if (!running) {
          running = true;
          ambient = startAmbient(currentTheme);
        }
      },

      /**
       * stop() — fade out the ambient bed. SFX still work after stop().
       */
      stop: function () {
        if (!running) return;
        running = false;
        fadeStopAmbient(ambient);
        ambient = null;
      },

      /**
       * setEnabled(bool) — mute/unmute globally; persists to localStorage.
       */
      setEnabled: function (b) {
        enabled = !!b;
        localStorage.setItem(STORAGE_KEY, enabled ? 'true' : 'false');
        if (!enabled) this.stop();
      },

      /** isEnabled() → boolean */
      isEnabled: function () { return enabled; },

      /**
       * playSFX(name) — trigger a one-shot synthesized sound effect.
       * Supported names: 'warp' | 'enter' | 'portal' | 'theme' | 'ui' | 'footstep'
       * Safe to call before start() — will create context on first call.
       */
      playSFX: function (name) {
        if (!enabled) return;
        var c = ensureCtx();
        if (!c) return;
        if (ctx.state === 'suspended') {
          ctx.resume().then(function () { dispatchSFX(name); }).catch(function () {});
        } else {
          dispatchSFX(name);
        }
      },

      /**
       * setTheme(name) — smoothly shift the ambient bed's tonal character.
       * Names: 'default' | 'tron' | 'snow' | 'desert' | 'ocean' | 'forest' | 'neon' | 'void'
       * Safe to call before start(); takes effect once ambient is running.
       */
      setTheme: function (name) {
        currentTheme = name || 'default';
        if (!running || !ambient || !ctx) return;
        var t   = themeParams(currentTheme);
        var now = ctx.currentTime;
        var ramp = 2.2; // seconds to morph
        try {
          ambient.lpf.frequency.linearRampToValueAtTime(t.filterFreq, now + ramp);
          ambient.o1.frequency.linearRampToValueAtTime(t.baseFreq,       now + ramp);
          ambient.o2.frequency.linearRampToValueAtTime(t.baseFreq,       now + ramp);
          ambient.o2.detune.linearRampToValueAtTime(t.detune,            now + ramp);
          ambient.o3.frequency.linearRampToValueAtTime(t.baseFreq * 1.5, now + ramp);
          ambient.lfoOsc.frequency.linearRampToValueAtTime(t.lfoRate,    now + ramp);
          ambient.lfoGain.gain.linearRampToValueAtTime(t.lfoDepth,       now + ramp);
        } catch (e) {}
      },

      /**
       * setVolume(v) — master volume 0..1. Default 0.35.
       */
      setVolume: function (v) {
        currentVol = Math.max(0, Math.min(1, +v || 0));
        if (masterGain && ctx) {
          masterGain.gain.linearRampToValueAtTime(currentVol, ctx.currentTime + 0.08);
        }
      },

      /**
       * update() — no-op; safe to call from requestAnimationFrame / animate loop.
       */
      update: function () {},
    };
  };

}(window));
