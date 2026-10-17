/* world-hoverboard-wallride.js — WALL RIDES for the hoverboard (owner 2026-10-15: "glide on walls and add spark effects", walls = the
 * K25b Matrix code walls of the hoverskate park).
 *   Hit a wall face fast (>= 6 m/s) and nearly parallel (<= 35 deg off the face) at a height the face covers and you LOCK to it: the board
 *   banks ~70 deg into the wall and glides along it, scoring per second, slowly sinking (low gravity) and losing speed; sparks stream from
 *   the contact edge. JUMP pops you off (+score, nose turned away from the wall); the end of the face, the floor of the face or < 4 m/s drops you.
 *
 *   var wr = HoverboardWallRide.create(tune?) ; wr.setWalls([{x0,z0,x1,z1,y0,y1}])   (WORLD units: face segment + face height range)
 *   var out = wr.step(dt, { x, y, z, psi, v (m/s), air, vy (units/s), inp:{ jump }, U })
 *     -> { lock:{x,y,z,psi,v,roll,ended}|null, pop:bool, spark:{x,y,z,nx,nz}|null, events:[...] }
 *   roll: radians for the board's YXZ euler z (positive/negative = which side the wall is on); the host eases its pose to it.
 *   Events are trick-core shaped like world-hoverboard-moves.js: { name, kind:'wall', score, clean, combo, total, air, points }.
 * Pure (no THREE). Tested in tools/tests/world-hoverboard-wallride.test.cjs.
 */
(function (root) {
  'use strict';
  var TUNE = { snapM: 1.6, standM: 0.55, minMS: 6, dropMS: 4, maxDeg: 35, decayMS2: 0.9, sinkMS2: 2.4, upMaxMS: 3.5, bankDeg: 70, perS: 70, popBonus: 40, popTurn: 0.35, cooldown: 0.45, minRideS: 0.15 };
  function create(tune) {
    var T = {}, k; for (k in TUNE) T[k] = TUNE[k]; if (tune) for (k in tune) T[k] = tune[k];
    var walls = [], W = null, cool = 0;
    function ev(name, score) { return { name: name, kind: 'wall', deg: 0, score: Math.round(score), clean: true, combo: 1, total: 0, air: 0, points: true }; }
    function closest(w, x, z) {
      var dx = w.x1 - w.x0, dz = w.z1 - w.z0, len = Math.hypot(dx, dz) || 1e-6, t = ((x - w.x0) * dx + (z - w.z0) * dz) / (len * len);
      var tc = Math.max(0, Math.min(1, t)), px = w.x0 + dx * tc, pz = w.z0 + dz * tc;
      return { t: t, px: px, pz: pz, d: Math.hypot(x - px, z - pz), len: len, ux: dx / len, uz: dz / len };
    }
    function step(dt, c) {
      var U = c.U || 7 / 1.8, inp = c.inp || {}, events = [], out = { lock: null, pop: false, spark: null, events: events };
      cool = Math.max(0, cool - dt);
      if (W) {
        var w = W.w; W.time += dt;
        W.v = Math.max(0, W.v - T.decayMS2 * dt); W.vy -= T.sinkMS2 * dt; W.y += W.vy * U * dt;
        W.t += W.dir * W.v * U * dt / W.len;
        var px = w.x0 + (w.x1 - w.x0) * W.t, pz = w.z0 + (w.z1 - w.z0) * W.t;
        var bx = px + W.nx * T.standM * U, bz = pz + W.nz * T.standM * U, psi = Math.atan2(W.dir * W.ux, W.dir * W.uz);
        W.score += T.perS * (1 + Math.min(1.5, W.time / 3)) * dt;
        var floor = w.y0 + 0.35 * U, over = false;
        if (W.y > w.y1 - 0.4 * U) { W.y = w.y1 - 0.4 * U; W.vy = Math.min(0, W.vy); }
        out.lock = { x: bx, y: W.y, z: bz, psi: psi, v: W.v, roll: W.roll, ended: false };
        out.spark = { x: px + W.nx * 0.08 * U, y: W.y + 0.1 * U, z: pz + W.nz * 0.08 * U, nx: W.nx, nz: W.nz };
        if (inp.jump && W.time > T.minRideS) { out.pop = true; out.lock.psi = psi - W.side * T.popTurn; events.push(ev('Wall Ride + Pop', W.score + T.popBonus)); over = true; }
        else if (W.t <= 0 || W.t >= 1 || W.y <= floor || W.v < T.dropMS) { out.lock.ended = true; events.push(ev('Wall Ride', W.score)); over = true; }
        if (over) { W = null; cool = T.cooldown; out.spark = out.pop ? out.spark : null; }
        return out;
      }
      if (cool > 0 || Math.abs(c.v) < T.minMS || !walls.length) return out;
      var hx = Math.sin(c.psi), hz = Math.cos(c.psi), cosMax = Math.cos(T.maxDeg * Math.PI / 180), best = null, bestD = T.snapM * U;
      for (var i = 0; i < walls.length; i++) {
        var w2 = walls[i]; if (c.y < w2.y0 + 0.5 * U || c.y > w2.y1 - 0.3 * U) continue;
        var q = closest(w2, c.x, c.z); if (q.t < 0.02 || q.t > 0.98 || q.d >= bestD) continue;
        var par = hx * q.ux + hz * q.uz; if (Math.abs(par) < cosMax) continue;
        best = { w: w2, q: q, par: par }; bestD = q.d;
      }
      if (!best) return out;
      var qq = best.q, nx = (c.x - qq.px) / (qq.d || 1e-6), nz = (c.z - qq.pz) / (qq.d || 1e-6);           // wall -> board normal
      if (qq.d < 1e-4) { nx = -qq.uz; nz = qq.ux; }
      var dir = best.par >= 0 ? 1 : -1, side = (dir * qq.ux) * nz - (dir * qq.uz) * nx;                      // > 0: wall on the board's left
      W = { w: best.w, t: qq.t, len: qq.len, ux: qq.ux, uz: qq.uz, nx: nx, nz: nz, dir: dir, v: Math.abs(c.v), y: c.y,
            vy: Math.max(-1, Math.min(T.upMaxMS, (c.vy || 0) / U)), time: 0, score: 0, side: side >= 0 ? 1 : -1 };
      W.roll = W.side * T.bankDeg * Math.PI / 180;                                                              // YXZ roll about the nose: + tips the underside to +x of the rider frame
      return step(0, c);
    }
    return { step: step, setWalls: function (w) { walls = w || []; }, walls: function () { return walls; }, riding: function () { return !!W; }, reset: function () { W = null; cool = 0; } };
  }
  root.HoverboardWallRide = { create: create, TUNE: TUNE };
})(typeof window !== 'undefined' ? window : globalThis);
