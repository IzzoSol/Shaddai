/* world-trick-score.js — pure trick-chain scorer (THPS style: points are PENDING until a clean landing banks them, a bail loses them).
 *
 *   var sc = WorldTrickScore.create({ tune? });
 *   sc.event({ kind:'trick'|'grind'|'manual'|'land'|'bail', name, base, clean, sub?, residual?:{spin,flip,tilt} }, t)
 *   sc.tick(t)      expire the chain after tune.window seconds of silence
 *   sc.state()      { banked, pending, mult, chain, lastGrade, feed:[last 3 names] }   (ONE reused object - read, don't keep)
 *   WorldTrickScore.grade(residual, tolerances) -> 'PERFECT'|'CLEAN'|'SLOPPY'|'BAIL'
 *
 * No DOM, no clock: the caller passes t (seconds, any monotonic origin).
 * Per link: round(base x mult x (1 + variety) x repeat x gradeMult)
 *   mult    = min(max, 1 + step*(link-1))           (4 s window, 0.5 step, max 6 - same as Skate Jam)
 *   variety = min(0.5, 0.1 * (distinct kinds in chain - 1))   kind key = e.sub || e.kind
 *   repeat  = 0.5 when the same name appeared in the previous 3 links
 *   grade   = PERFECT x1.25, CLEAN x1, SLOPPY x0.7 (keeps chain), BAIL = bail
 * A land banks pending (x its own grade mult); bail/expired-without-land loses pending. Grind and manual keep the chain alive;
 * a manual within linkWindow (0.6 s) of a landing links, a later one starts a fresh chain.
 */
(function (root) {
  'use strict';
  var DEFAULT_TOL = { spin: 30, flip: 35, tilt: 45 };
  var GRADE_MULT = { PERFECT: 1.25, CLEAN: 1, SLOPPY: 0.7, BAIL: 0 };
  var EPS = 1e-9;

  function grade(residual, tol) {
    tol = tol || DEFAULT_TOL; var worst = 0, k, f;
    if (!residual) return 'CLEAN';
    for (k in tol) {
      if (!(k in residual)) continue;
      var r = Math.abs(residual[k]); if (!isFinite(r)) return 'BAIL';
      f = r / tol[k]; if (r > tol[k] * 1.5 + EPS) return 'BAIL';
      if (r > tol[k] * 1.0 + EPS) worst = Math.max(worst, 2); else if (r > tol[k] * 0.35 + EPS) worst = Math.max(worst, 1);
    }
    return worst === 0 ? 'PERFECT' : worst === 1 ? 'CLEAN' : 'SLOPPY';
  }

  function create(opts) {
    var T = { window: 4.0, step: 0.5, max: 6, linkWindow: 0.6, varietyStep: 0.1, varietyMax: 0.5, repeatMul: 0.5, repeatSpan: 3, tol: DEFAULT_TOL };
    if (opts && opts.tune) for (var k in opts.tune) T[k] = opts.tune[k];
    var banked = 0, pending = 0, links = 0, mult = 1, lastT = 0, landT = -1e9, lastWasLand = false, lastGrade = 'CLEAN';
    var names = [], kinds = [], feed = ['', '', ''], feedN = 0;
    var out = { banked: 0, pending: 0, mult: 1, chain: 0, lastGrade: 'CLEAN', feed: feed };

    function pushFeed(n) { feed[0] = feed[1]; feed[1] = feed[2]; feed[2] = n; feedN++; }
    function resetChain() { links = 0; mult = 1; names.length = 0; kinds.length = 0; }
    function active() { return links > 0; }
    function tick(t) {
      if (!active() || t - lastT <= T.window) return false;
      if (lastWasLand) { banked += Math.round(pending); }   // pending is already 0 after a land; kept for the stated rule
      pending = 0; resetChain(); lastWasLand = false; return true;
    }
    function bail() { pending = 0; resetChain(); lastWasLand = false; lastGrade = 'BAIL'; }

    function event(e, t) {
      if (!e) return;
      tick(t);
      var kind = e.kind, g;
      if (kind === 'bail' || e.clean === false) { bail(); lastT = t; if (e.name) pushFeed(String(e.name)); return; }
      g = e.residual ? grade(e.residual, T.tol) : 'CLEAN';
      if (g === 'BAIL') { bail(); lastT = t; if (e.name) pushFeed(String(e.name)); return; }
      if (kind === 'land') {
        banked += Math.round(pending * GRADE_MULT[g]); pending = 0; lastGrade = g;
        lastWasLand = true; landT = t; lastT = t; if (active()) lastT = t; return;
      }
      if (kind === 'manual' && lastWasLand && t - landT > T.linkWindow) { pending = 0; resetChain(); }   // too late to link: fresh chain
      // link
      var key = e.sub || kind, name = e.name ? String(e.name) : '', i, seen = false, distinct = 0, rep = 1;
      if (name) for (i = Math.max(0, names.length - T.repeatSpan); i < names.length; i++) if (names[i] === name) { rep = T.repeatMul; break; }
      for (i = 0; i < kinds.length; i++) if (kinds[i] === key) { seen = true; break; }
      if (!seen) kinds.push(key); distinct = kinds.length;
      links++; mult = Math.min(T.max, 1 + T.step * (links - 1));
      var variety = Math.min(T.varietyMax, T.varietyStep * (distinct - 1));
      pending += Math.round((e.base || 0) * mult * (1 + variety) * rep * GRADE_MULT[g]);
      names.push(name); lastGrade = g; lastWasLand = false; lastT = t; if (name) pushFeed(name);
    }

    function state() {
      out.banked = banked; out.pending = pending; out.mult = mult; out.chain = links; out.lastGrade = lastGrade; return out;
    }
    return { event: event, tick: tick, state: state, TUNE: T };
  }

  var api = { create: create, grade: grade, GRADE_MULT: GRADE_MULT, DEFAULT_TOL: DEFAULT_TOL };
  root.WorldTrickScore = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
