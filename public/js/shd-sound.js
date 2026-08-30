/* ══════════════════════════════════════════════════════════════════════════
   SHD SOUND — clicks and swooshes, OFF until asked for.

   OFF BY DEFAULT, deliberately and permanently. A site that makes noise on
   arrival is a site people close. The toggle is opt-in, the choice persists,
   and nothing plays before the first real gesture — browsers block audio
   before interaction anyway, so a "sound on" state that fires nothing would
   look broken.

   SYNTHESISED, not sampled. Two oscillators through a gain envelope cost
   nothing to load, never 404, and retune with one number — where a set of mp3s
   would be several requests that can fail on a phone signal.
   ══════════════════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';
  var KEY = 'shd_sound';
  var on = false;
  try { on = localStorage.getItem(KEY) === '1'; } catch (e) {}

  var ctx = null;
  function audio() {
    if (ctx) return ctx;
    var C = root.AudioContext || root.webkitAudioContext;
    if (!C) return null;
    try { ctx = new C(); } catch (e) { ctx = null; }
    return ctx;
  }

  /* One voice: a frequency sweep under a short envelope. `type` shapes it —
     a click is fast and high, a swoosh falls and lasts. */
  function tone(f0, f1, ms, type, vol) {
    if (!on) return;
    var a = audio(); if (!a) return;
    if (a.state === 'suspended') { try { a.resume(); } catch (e) {} }
    var t = a.currentTime, dur = ms / 1000;
    var o = a.createOscillator(), g = a.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t + dur);
    // exponential release — a linear fade reads as a cut, not a decay
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol || 0.05, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(a.destination);
    o.start(t); o.stop(t + dur + 0.02);
  }

  var S = {
    click:  function () { tone(880, 620, 55, 'triangle', 0.045); },
    swoosh: function () { tone(240, 1150, 260, 'sine', 0.035); },
    back:   function () { tone(620, 300, 120, 'sine', 0.04); },
    enter:  function () { tone(320, 900, 300, 'triangle', 0.05); },
    isOn:   function () { return on; },
    set:    function (v) {
      on = !!v;
      try { localStorage.setItem(KEY, on ? '1' : '0'); } catch (e) {}
      if (on) S.click();          // confirm the choice audibly
      document.documentElement.setAttribute('data-sound', on ? 'on' : 'off');
      return on;
    },
    toggle: function () { return S.set(!on); },
  };
  document.documentElement.setAttribute('data-sound', on ? 'on' : 'off');

  /* Wire the whole page once. Delegated so anything added later is covered,
     and passive so it can never delay a tap. */
  document.addEventListener('pointerdown', function (e) {
    if (!on) return;
    var t = e.target.closest('a, button, .slot, .chip, .cell, .row');
    if (!t) return;
    if (t.classList.contains('slot')) S.enter();
    else if (t.matches('a[href^="/"]')) S.swoosh();
    else S.click();
  }, { passive: true });

  root.SHDSound = S;
})(window);
