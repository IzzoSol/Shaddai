/* world-hoverboard-moves.js — RAIL GRINDS + MANUALS for the hoverboard (owner 2026-10-02: "hoverskate park tricks and movesets").
 *   GRIND   Hop onto a magnet rail (board at rail height, >= 3 m/s) and you LOCK to it: 50-50 (board along the rail, < 25 deg), CROOKED (25-55 deg), BOARDSLIDE (55-90 deg, board sideways).
 *           You slide along it scoring points per second, slowly losing speed; JUMP to pop off (+score), or ride off the end. Falling below 2 m/s drops you.
 *   MANUAL  On the ground, hold the manual key at speed (>= 3.5 m/s): the nose lifts (tail manual) — or the tail lifts (NOSE manual) — and you balance, scoring per second (cap 9 s).
 *   GRAB variants (named, pure helper): Indy (no key) · Melon (left) · Nose Grab (forward) · Tail Grab (back) · Stalefish (right), each worth a different bonus.
 *
 *   var mv = HoverboardMoves.create(tune?) ; mv.setRails([{x0,z0,x1,z1,y}])  (WORLD units, y = top of the rail)
 *   var out = mv.step(dt, { x, y, z, psi, v (m/s), air, vy (units/s), inp:{manual, manualNose, jump}, U })
 *        -> { lock:{x,y,z,psi,v}|null, pop:bool, pose:{manual:-1..1, grind:0..1, slideYaw}, events:[...] }
 *   Events are trick-core shaped: { name, kind:'grind'|'manual', deg:0, score, clean:true, combo:1, total:0, air:0, points:true }.
 * Pure (no THREE). Tested in tools/tests/world-hoverboard-moves.test.cjs.
 */
(function (root) {
  'use strict';
  var TUNE = { snapM: 0.8, topBelowM: 0.35, topAboveM: 0.95, maxVyUp: 2.5, minSpeed: 3, dropSpeed: 2, decayMS2: 0.35, popMS: 5.2, popBonus: 25,
    perS: { g5050: 55, crooked: 80, boardslide: 95 }, crookedDeg: 25, slideDeg: 55, manualMin: 3.5, manualEnd: 2.5, manualMaxS: 9, manualMinS: 0.6, manualPerS: 22, noseManualPerS: 32, cooldown: 0.35, ease: 9 };
  var GRABS = { indy: { name: 'Indy Grab', bonus: 0 }, melon: { name: 'Melon Grab', bonus: 20 }, nose: { name: 'Nose Grab', bonus: 30 }, tail: { name: 'Tail Grab', bonus: 30 }, stale: { name: 'Stalefish', bonus: 45 } };
  function grabKind(inp) { inp = inp || {}; if (inp.left) return 'melon'; if (inp.fwd) return 'nose'; if (inp.back) return 'tail'; if (inp.right) return 'stale'; return 'indy'; }
  function seg(r, x, z) {   // closest point on the rail segment: {t 0..1, px, pz, d, len, ux, uz}
    var dx = r.x1 - r.x0, dz = r.z1 - r.z0, len = Math.hypot(dx, dz) || 1e-6, t = Math.max(0, Math.min(1, ((x - r.x0) * dx + (z - r.z0) * dz) / (len * len)));
    var px = r.x0 + dx * t, pz = r.z0 + dz * t; return { t: t, px: px, pz: pz, d: Math.hypot(x - px, z - pz), len: len, ux: dx / len, uz: dz / len };
  }
  function create(tune) {
    var T = {}, k; for (k in TUNE) T[k] = TUNE[k]; if (tune) for (k in tune) T[k] = tune[k];
    var rails = [], G = null, man = null, cool = 0, pose = { manual: 0, grind: 0, slideYaw: 0 }, slideTarget = 0;
    function ev(name, kind, score) { return { name: name, kind: kind, deg: 0, score: Math.round(score), clean: true, combo: 1, total: 0, air: 0, points: true }; }
    function step(dt, c) {
      var U = c.U || 7 / 1.8, events = [], inp = c.inp || {}, out = { lock: null, pop: false, pose: pose, events: events }; cool = Math.max(0, cool - dt);
      var e = Math.min(1, dt * T.ease);
      if (G) {   // ---- riding a rail ----
        var r = G.rail; G.time += dt; G.v = Math.max(0, G.v - T.decayMS2 * 3 * dt); G.t += G.dir * G.v * U * dt / G.len; var ended = G.t >= 1 || G.t <= 0; G.t = Math.max(0, Math.min(1, G.t));
        G.score += T.perS[G.key] * (1 + Math.min(1.5, G.time / 4)) * dt;
        var px = r.x0 + (r.x1 - r.x0) * G.t, pz = r.z0 + (r.z1 - r.z0) * G.t, over = false;
        if (inp.jump && G.time > 0.2) { out.pop = true; events.push(ev(G.name + ' + Pop', 'grind', G.score + T.popBonus)); over = true; }
        else if (ended) { events.push(ev(G.name, 'grind', G.score)); over = true; }
        else if (G.v < T.dropSpeed) { events.push(ev(G.name, 'grind', G.score * 0.7)); over = true; }
        out.lock = { x: px, y: r.y, z: pz, psi: Math.atan2(G.dir * G.ux, G.dir * G.uz), v: G.v, ended: ended, pop: out.pop };
        slideTarget = G.key === 'boardslide' ? G.slide : 0; pose.grind += (1 - pose.grind) * e;
        if (over) { cool = T.cooldown; if (!out.pop) out.lock.ended = true; var last = out.lock; G = null; out.exit = last; if (!out.pop) { /* ride off the end / drop: keep the lock for one frame so the host can place the board */ } }
      } else {
        pose.grind += (0 - pose.grind) * e; slideTarget = 0;
        // ---- manuals (ground only) ----
        var wantMan = (inp.manual || inp.manualNose) && !c.air && c.v >= (man ? T.manualEnd : T.manualMin);
        if (wantMan) { if (!man) man = { t: 0, nose: !!inp.manualNose }; man.t += dt; if (man.t >= T.manualMaxS) { events.push(ev('Long ' + (man.nose ? 'Nose Manual' : 'Manual'), 'manual', man.t * (man.nose ? T.noseManualPerS : T.manualPerS) * (1 + c.v / 25) + 40)); man = null; } }
        else if (man) { if (man.t >= T.manualMinS) events.push(ev(man.nose ? 'Nose Manual' : 'Manual', 'manual', man.t * (man.nose ? T.noseManualPerS : T.manualPerS) * (1 + c.v / 25))); man = null; }
        pose.manual += ((man ? (man.nose ? -1 : 1) : 0) - pose.manual) * e;
        // ---- rail entry ----
        if (!G && cool <= 0 && !man && c.v >= T.minSpeed && c.vy <= T.maxVyUp * U) {
          var best = null, bd = 1e12, i;
          for (i = 0; i < rails.length; i++) { var s = seg(rails[i], c.x, c.z); if (s.d > T.snapM * U) continue; var dy = c.y - rails[i].y; if (dy < -T.topBelowM * U || dy > T.topAboveM * U) continue; if (s.d < bd) { bd = s.d; best = { rail: rails[i], s: s }; } }
          if (best) {
            var fx = Math.sin(c.psi), fz = Math.cos(c.psi), dot = fx * best.s.ux + fz * best.s.uz, ang = Math.acos(Math.min(1, Math.abs(dot))) * 180 / Math.PI, key = ang < T.crookedDeg ? 'g5050' : (ang < T.slideDeg ? 'crooked' : 'boardslide');
            var dir = dot >= 0 ? 1 : -1, name = key === 'g5050' ? '50-50 Grind' : (key === 'crooked' ? 'Crooked Grind' : 'Boardslide'), side = (fx * best.s.uz - fz * best.s.ux) > 0 ? 1 : -1;   // which side the nose points to decides the slide direction
            G = { rail: best.rail, t: best.s.t, dir: dir, len: best.s.len, ux: best.s.ux, uz: best.s.uz, key: key, name: name, v: c.v, score: 0, time: 0, slide: side * Math.PI / 2 };
            out.lock = { x: best.s.px, y: best.rail.y, z: best.s.pz, psi: Math.atan2(dir * best.s.ux, dir * best.s.uz), v: c.v, entered: true, name: name };
          }
        }
      }
      pose.slideYaw += (slideTarget - pose.slideYaw) * e; return out;
    }
    return { step: step, setRails: function (r) { rails = r || []; }, rails: function () { return rails; }, state: function () { return { grinding: !!G, grind: G && G.name, manual: !!man, manualT: man ? man.t : 0 }; }, reset: function () { G = null; man = null; cool = 0; pose.manual = pose.grind = pose.slideYaw = 0; }, tune: T };
  }
  root.HoverboardMoves = { create: create, grabKind: grabKind, GRABS: GRABS, TUNE: TUNE, seg: seg };
})(typeof window !== 'undefined' ? window : globalThis);
