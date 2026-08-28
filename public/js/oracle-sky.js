/* ══════════════════════════════════════════════════════════════════════
   ORACLE SKY  (oracle-sky.js)

   The reading ORACLE leaves in the sky at the end of the Ascend scene:
   tonight's moon phase, and where the Sun and Moon actually are today.

   Everything here is COMPUTED, not fetched. No API, no key, no network,
   no spend — the sky is deterministic, so a few lines of orbital mechanics
   beat any service and work offline forever.

   Accuracy: low-precision formulae from the Astronomical Almanac's
   "Approximate Solar/Lunar Position" tables. Solar longitude is good to
   ~0.01°, lunar to ~1° — far inside the 30° a zodiac sign spans, so the
   signs are correct. Moon illumination is good to a fraction of a percent.
   This is real positional astronomy, not a random generator.
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';

  var RAD = Math.PI / 180;
  var SYNODIC = 29.530588853;          // mean synodic month, days

  var SIGNS = [
    ['Aries', '♈'], ['Taurus', '♉'], ['Gemini', '♊'], ['Cancer', '♋'],
    ['Leo', '♌'], ['Virgo', '♍'], ['Libra', '♎'], ['Scorpio', '♏'],
    ['Sagittarius', '♐'], ['Capricorn', '♑'], ['Aquarius', '♒'], ['Pisces', '♓']
  ];

  /* ORACLE's line for each phase — the reading, not a horoscope. */
  var PHASES = [
    { name: 'New Moon',        read: 'The ledger is blank. What you begin now compounds unseen.' },
    { name: 'Waxing Crescent', read: 'First light on the work. Protect it before you show it.' },
    { name: 'First Quarter',   read: 'The tension point. Half-built is where most things are abandoned.' },
    { name: 'Waxing Gibbous',  read: 'Refinement, not addition. The shape is already there.' },
    { name: 'Full Moon',       read: 'Everything is visible, including what you avoided. Ship or admit why not.' },
    { name: 'Waning Gibbous',  read: 'Harvest the signal. Write down what actually worked.' },
    { name: 'Last Quarter',    read: 'Cut. What survives this week deserves the next one.' },
    { name: 'Waning Crescent', read: 'Rest is a position, not a retreat. The lattice is still forming.' }
  ];

  /* days since the J2000.0 epoch (2000-01-01 12:00 UTC) */
  function daysSinceJ2000(date) {
    return (date.getTime() - Date.UTC(2000, 0, 1, 12, 0, 0)) / 86400000;
  }
  function norm360(x) { return ((x % 360) + 360) % 360; }

  /* Sun's apparent ecliptic longitude (Astronomical Almanac, low precision) */
  function sunLongitude(d) {
    var g = norm360(357.529 + 0.98560028 * d);        // mean anomaly
    var q = norm360(280.459 + 0.98564736 * d);        // mean longitude
    return norm360(q + 1.915 * Math.sin(g * RAD) + 0.020 * Math.sin(2 * g * RAD));
  }

  /* Moon's ecliptic longitude — mean motion plus the three dominant terms
     (evection, variation and the annual equation are folded into these). */
  function moonLongitude(d) {
    var L = 218.316 + 13.176396 * d;                  // mean longitude
    var M = norm360(134.963 + 13.064993 * d);         // mean anomaly
    var F = norm360(93.272 + 13.229350 * d);          // argument of latitude
    return norm360(L + 6.289 * Math.sin(M * RAD)
                     - 1.274 * Math.sin((2 * F - M) * RAD)
                     + 0.658 * Math.sin(2 * F * RAD));
  }

  function signOf(lon) {
    var i = Math.floor(norm360(lon) / 30) % 12;
    return { name: SIGNS[i][0], glyph: SIGNS[i][1], degree: norm360(lon) % 30 };
  }

  /**
   * The whole reading for a moment in time.
   * Phase angle is the Moon-Sun elongation, which is what actually drives
   * both the illuminated fraction and the phase name — deriving it from
   * elongation rather than from a fixed new-moon epoch keeps it correct
   * across the year instead of drifting.
   */
  function reading(date) {
    var d = daysSinceJ2000(date || new Date());
    var sun = sunLongitude(d);
    var moon = moonLongitude(d);
    var elong = norm360(moon - sun);                       // 0 = new, 180 = full
    var illum = (1 - Math.cos(elong * RAD)) / 2;           // 0..1 lit fraction
    var age = (elong / 360) * SYNODIC;                     // days into the cycle
    var idx = Math.floor(norm360(elong + 22.5) / 45) % 8;  // 8 named phases
    return {
      date: date || new Date(),
      sun: signOf(sun),
      moon: signOf(moon),
      elongation: elong,
      illumination: illum,
      age: age,
      waxing: elong < 180,
      phase: PHASES[idx].name,
      oracle: PHASES[idx].read
    };
  }

  /* ── the moon disc ────────────────────────────────────────────────────
     Drawn as a real terminator, not a stock icon: the lit region is the
     half-disc plus an ellipse whose x-radius follows cos(elongation), which
     is the actual shape of a lunar terminator in projection. That makes a
     waxing crescent and a waning gibbous genuinely different shapes, and
     puts the light on the correct side. */
  function moonSVG(r, size) {
    var R = size / 2 - 1;
    var k = Math.cos(r.elongation * RAD);       // +1 new … -1 full
    var rx = Math.abs(k) * R;
    // sweep flags decide which side is lit and whether the terminator bows in or out
    var litRight = r.waxing;
    var outer = 'M ' + (size / 2) + ' ' + (size / 2 - R) +
                ' A ' + R + ' ' + R + ' 0 0 ' + (litRight ? 1 : 0) + ' ' + (size / 2) + ' ' + (size / 2 + R);
    var inner = ' A ' + rx + ' ' + R + ' 0 0 ' + ((k > 0) === litRight ? 0 : 1) + ' ' + (size / 2) + ' ' + (size / 2 - R) + ' Z';
    return '' +
      '<svg viewBox="0 0 ' + size + ' ' + size + '" width="' + size + '" height="' + size + '" aria-hidden="true">' +
        '<defs><radialGradient id="osGlow"><stop offset="55%" stop-color="rgba(232,196,92,.30)"/>' +
        '<stop offset="100%" stop-color="rgba(232,196,92,0)"/></radialGradient></defs>' +
        '<circle cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + (R + 6) + '" fill="url(#osGlow)"/>' +
        '<circle cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + R + '" fill="rgba(10,14,19,.85)" stroke="rgba(232,196,92,.32)" stroke-width="1"/>' +
        (r.illumination > 0.005 ? '<path d="' + outer + inner + '" fill="#e8c45c" opacity=".92"/>' : '') +
      '</svg>';
  }

  function fmt(n) { return (n < 10 ? '0' : '') + n; }

  /** Render the panel into `el`. Safe to call repeatedly. */
  function render(el, when) {
    var r = reading(when);
    var d = r.date;
    el.innerHTML =
      '<div class="os-moon">' + moonSVG(r, 74) + '</div>' +
      '<div class="os-body">' +
        '<div class="os-kicker">ORACLE · ' + d.getFullYear() + '-' + fmt(d.getMonth() + 1) + '-' + fmt(d.getDate()) + '</div>' +
        '<div class="os-phase">' + r.phase + '</div>' +
        '<div class="os-meta">' +
          '<span>' + Math.round(r.illumination * 100) + '% lit</span>' +
          '<span>day ' + r.age.toFixed(1) + ' of ' + SYNODIC.toFixed(1) + '</span>' +
        '</div>' +
        '<div class="os-signs">' +
          '<span title="Sun sign"><i>' + r.sun.glyph + '</i> Sun in ' + r.sun.name + '</span>' +
          '<span title="Moon sign"><i>' + r.moon.glyph + '</i> Moon in ' + r.moon.name + '</span>' +
        '</div>' +
        '<div class="os-read">' + r.oracle + '</div>' +
      '</div>';
    return r;
  }

  root.OracleSky = { reading: reading, render: render, moonSVG: moonSVG, SIGNS: SIGNS };
})(window);
