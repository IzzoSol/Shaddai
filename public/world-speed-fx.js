/* world-speed-fx.js — RACING FEEL (2026-10-08, owner race references): FOV kick with speed, speed lines at the screen edges,
 * boost pads on the race track. Zero 3D draws: speed lines are a half-resolution 2D canvas overlay that is hidden below
 * cruise speed. Only acts while a rider is moving fast; the camera FOV is restored exactly when riding stops.
 *
 *   var fx = WorldSpeedFX.create({ camera, getSpeed()->m/s|0, getRiding()->bool, topMS, boostMS, getPos()->{x,z},
 *                                  tracks()->[{boostAt(x,z)}], onBoost()->void })
 *   fx.update(dt)   // call once per frame, after the camera is placed, before render
 * Pure (node tests): WorldSpeedFX.pure = { fovFor, lineAlpha }.  ?speedfx=0 = off.
 */
(function (root) {
  'use strict';
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  // speed fraction above cruise → extra FOV degrees (max +14 at boost speed, +6 more during a pad/boost kick)
  function fovFor(base, speed, topMS, boostMS, kick) {
    var f = clamp((speed - topMS * 0.55) / Math.max(1, boostMS - topMS * 0.55), 0, 1);
    return base + 14 * f * f * (3 - 2 * f) + 6 * clamp(kick, 0, 1);
  }
  function lineAlpha(speed, topMS, boostMS, kick) { return clamp((speed - topMS * 0.8) / Math.max(1, boostMS - topMS * 0.8), 0, 1) * 0.55 + 0.35 * clamp(kick, 0, 1); }

  function create(o) {
    var cam = o.camera, base = null, cur = 0, kick = 0, padCd = 0, cv = null, g = null, lines = [], t = 0, drawAcc = 0, shown = false;
    var off = typeof location !== 'undefined' && /[?&]speedfx=0\b/.test(location.search);
    function overlay() {
      if (cv || typeof document === 'undefined') return;
      cv = document.createElement('canvas'); cv.id = 'speedLines';
      cv.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:40;opacity:0;transition:opacity .18s;mix-blend-mode:screen';
      document.body.appendChild(cv); g = cv.getContext('2d');
      for (var i = 0; i < 70; i++) lines.push({ a: Math.random() * Math.PI * 2, r: Math.random(), v: 0.6 + Math.random() * 0.9, w: 0.6 + Math.random() * 1.6 });
    }
    function draw(alpha, dt) {
      var W = Math.round(innerWidth / 2), H = Math.round(innerHeight / 2);
      if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
      g.clearRect(0, 0, W, H);
      var cx = W / 2, cy = H / 2, R = Math.hypot(cx, cy);
      for (var i = 0; i < lines.length; i++) {
        var L = lines[i]; L.r += L.v * dt * (1.2 + 2.5 * alpha); if (L.r > 1) { L.r = 0.35 + Math.random() * 0.1; L.a = Math.random() * Math.PI * 2; }
        var r0 = R * L.r, r1 = R * Math.min(1.05, L.r + 0.12 + 0.18 * alpha), ca = Math.cos(L.a), sa = Math.sin(L.a);
        var gr = g.createLinearGradient(cx + ca * r0, cy + sa * r0, cx + ca * r1, cy + sa * r1);
        gr.addColorStop(0, 'rgba(200,245,255,0)'); gr.addColorStop(1, 'rgba(200,245,255,' + (0.9 * L.r) + ')');
        g.strokeStyle = gr; g.lineWidth = L.w; g.beginPath(); g.moveTo(cx + ca * r0, cy + sa * r0); g.lineTo(cx + ca * r1, cy + sa * r1); g.stroke();
      }
    }
    function update(dt) {
      if (off || !cam) return;
      t += dt; if (padCd > 0) padCd -= dt; kick = Math.max(0, kick - dt * 1.4);
      var riding = !!(o.getRiding && o.getRiding()), sp = riding ? Math.abs(o.getSpeed ? o.getSpeed() : 0) : 0;
      // boost pads
      if (riding && padCd <= 0 && o.tracks && o.getPos) {
        var P = o.getPos(), T = o.tracks() || [];
        for (var i = 0; i < T.length; i++) if (T[i] && T[i].boostAt && T[i].boostAt(P.x, P.z)) { padCd = 1.2; kick = 1; if (o.onBoost) o.onBoost(); break; }
      }
      // FOV: remember the resting FOV when we start acting, ease toward the target, hand it back exactly when done
      var acting = riding && (sp > o.topMS * 0.55 || kick > 0);
      if (acting && base === null) { base = cam.fov; cur = cam.fov; }
      if (base !== null) {
        var want = acting ? fovFor(base, sp, o.topMS, o.boostMS, kick) : base;
        cur += (want - cur) * (1 - Math.exp(-6 * dt));
        if (!acting && Math.abs(cur - base) < 0.05) { cam.fov = base; cam.updateProjectionMatrix(); base = null; }
        else { cam.fov = cur; cam.updateProjectionMatrix(); }
      }
      // speed lines (30 Hz redraw is plenty for a blur effect)
      var a = riding ? lineAlpha(sp, o.topMS, o.boostMS, kick) : 0;
      if (a > 0.02) overlay();
      if (!cv) return;   // no DOM (tests / workers): FOV + pads still work
      if (a > 0.02) { if (!shown) { cv.style.opacity = '1'; shown = true; } drawAcc += dt; if (drawAcc > 1 / 30) { cv.style.opacity = String(a.toFixed(2)); draw(a, drawAcc); drawAcc = 0; } }
      else if (shown) { cv.style.opacity = '0'; shown = false; }
    }
    return { update: update, kick: function () { kick = 1; }, state: function () { return { base: base, fov: cam && cam.fov, kick: kick, lines: shown }; } };
  }
  var api = { create: create, pure: { fovFor: fovFor, lineAlpha: lineAlpha } };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.WorldSpeedFX = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
