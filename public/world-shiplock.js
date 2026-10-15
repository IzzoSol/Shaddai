/* world-shiplock.js — SHIP LOCK-ON + SPEED FEEL while riding a hover ship / kart / flying mount (2026-10-15, owner ref videos).
 * (world-lockon.js is the older on-foot PvP/mob lock; this one is for the saddle/cockpit. Different module, different global.)
 *   LOCK-ON  thin cyan centre reticle; red corner-bracket boxes on live dragons in range + view cone; the one nearest screen-centre is
 *            "held"; after holdS a magenta ring tightens + spins, then LOCKED + distance. Fire (left mouse, host-wired) damages the locked
 *            dragon through the dragons damage API (cooldown). Lock drops when the target dies, leaves range or leaves the wide cone.
 *   SPEED    big italic km/h readout bottom-right (skipped in a race: the race HUD2 already has one), FOV widening (host reads fovAdd()),
 *            camera pull-back + subtle boost shake (applyCamera, after the chase cam is placed), BOOST flash, edge streaks (reuses the
 *            WorldSpeedFX line layer with a dummy camera, so there is no second FOV owner). prefers-reduced-motion: no shake, no streaks.
 *   var sl = WorldShipLock.create({ camera, U, getRide()->bool, speedMS()->m/s, boosting()->bool, inRace()->bool,
 *             getTargets()->[{id,defeated,...}], posOf(t,out)->out{x,y,z} game units, camState(out)->out{x,y,z,dx,dy,dz} (dir unit),
 *             project(x,y,z,out)->out{x,y,on} px, streaks()->bool (false when another layer, e.g. hoverboard speed lines, already draws them), damage(id,amt,pos,type)->bool, topMS, boostMS, doc })
 *   sl.update(dt)  once a frame, after the chase cam is placed, before render     sl.fire() -> bool     sl.target() -> id|null
 *   sl.fovAdd()    extra degrees to add onto the host FOV        sl.applyCamera() pull-back + shake (call right after update)
 * Per-frame allocation-free after the first overlay build. ?lockon=0 disables. Pure helpers in WorldShipLock.pure (node tests). */
(function (root) {
  'use strict';
  var D2R = Math.PI / 180;
  var CFG = { rangeM: 450, coneDeg: 28, holdDeg: 5, holdS: 0.6, keepDeg: 40, cooldown: 0.35, dmg: 18, max: 8, pullM: 1.6, shakeM: 0.05 };
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  // angle (rad) between camera forward (cam.dx..) and the direction to (x,y,z); also distance. out = { ang, d, ok } (ok = in front)
  function aim(cam, x, y, z, out) {
    var dx = x - cam.x, dy = y - cam.y, dz = z - cam.z, d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
    var c = (dx * cam.dx + dy * cam.dy + dz * cam.dz) / d; out.d = d; out.ang = Math.acos(clamp(c, -1, 1)); out.ok = c > 0; return out;
  }
  // candidate test: in front, within range (game units) and inside the view cone (rad)
  function inView(a, rangeU, coneRad) { return a.ok && a.d <= rangeU && a.ang <= coneRad; }
  // FOV widen, EXTRA degrees: same smoothstep shape as WorldSpeedFX.fovFor: +12 at boost speed, up to +16 during a boost kick
  function fovAdd(speed, topMS, boostMS, kick) {
    var f = clamp((speed - topMS * 0.55) / Math.max(1, boostMS - topMS * 0.55), 0, 1);
    return 12 * f * f * (3 - 2 * f) + 4 * clamp(kick, 0, 1);
  }
  function kmh(ms) { return Math.round(Math.abs(ms) * 3.6); }

  function create(o) {
    var cam = o.camera, doc = o.doc || (typeof document !== 'undefined' ? document : null), U = o.U || 7 / 1.8;
    var off = typeof location !== 'undefined' && /[?&]lockon=0\b/.test(location.search);
    var calm = typeof matchMedia === 'function' && (function () { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } })();
    var topMS = o.topMS || 30, boostMS = o.boostMS || 60;
    var cs = { x: 0, y: 0, z: 0, dx: 0, dy: 0, dz: -1 }, pp = { x: 0, y: 0, z: 0 }, sc = { x: 0, y: 0, on: false }, am = { ang: 0, d: 0, ok: false };
    var lockId = null, holdId = null, holdT = 0, locked = false, cd = 0, kick = 0, wasBoost = false, boostFlash = 0, add = 0, pull = 0, tt = 0, riding = false, spd = 0, sOn = false;
    var els = null, fxLines = null, dummyCam = { fov: 0, updateProjectionMatrix: function () { } };
    var near = [];   // pooled best-candidate slots, sorted by angle (no per-frame allocation)
    for (var i = 0; i < CFG.max; i++) near.push({ t: null, ang: 9, d: 0, id: null });

    function build() {
      if (els || !doc || !doc.body) return;
      var h = doc.createElement('div'); h.id = 'shipLock'; h.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:41;display:none;font:700 11px Rajdhani,"Segoe UI",sans-serif;letter-spacing:.08em';
      var css = doc.createElement('style');
      css.textContent = '#shipLock .sl-ret{position:absolute;left:50%;top:50%;width:46px;height:46px;margin:-23px 0 0 -23px;border:1.5px solid rgba(80,230,255,.75);border-radius:50%}'
        + '#shipLock .sl-box{position:absolute;left:0;top:0;width:44px;height:44px;margin:-22px 0 0 -22px;display:none;will-change:transform;color:#ff3b3b}'
        + '#shipLock .sl-box i{position:absolute;width:10px;height:10px;border:0 solid currentColor}'
        + '#shipLock .sl-box i:nth-child(1){left:0;top:0;border-width:2px 0 0 2px}#shipLock .sl-box i:nth-child(2){right:0;top:0;border-width:2px 2px 0 0}'
        + '#shipLock .sl-box i:nth-child(3){left:0;bottom:0;border-width:0 0 2px 2px}#shipLock .sl-box i:nth-child(4){right:0;bottom:0;border-width:0 2px 2px 0}'
        + '#shipLock .sl-box b{position:absolute;left:50%;top:100%;transform:translateX(-50%);margin-top:3px;white-space:nowrap;color:#ffb4b4;font-weight:600;text-shadow:0 0 4px #000}'
        + '#shipLock .sl-ring{position:absolute;inset:-14px;border:2px solid #ff3fd0;border-radius:50%;opacity:0;box-shadow:0 0 12px #ff3fd0}'
        + '#shipLock .sl-box.hold{color:#ff6ad8}#shipLock .sl-box.lock{color:#ff3fd0}#shipLock .sl-box.lock .sl-ring{animation:slspin .9s linear infinite}'
        + '#shipLock .sl-box.lock b{color:#ff9aea}@keyframes slspin{from{rotate:0deg}to{rotate:360deg}}'
        + '#shipSpd{position:fixed;right:26px;bottom:22px;z-index:41;pointer-events:none;display:none;text-align:right;color:#fff;text-shadow:0 0 10px rgba(80,230,255,.7)}'
        + '#shipSpd .n{font:italic 900 64px Orbitron,Rajdhani,sans-serif;line-height:1}#shipSpd .u{font:600 12px Rajdhani,sans-serif;letter-spacing:.2em;opacity:.7}'
        + '#shipSpd .bar{height:3px;margin-top:4px;background:rgba(255,255,255,.18)}#shipSpd .bar>div{height:100%;width:0;background:#4be6ff}'
        + '#shipBoost{position:fixed;left:50%;top:30%;transform:translateX(-50%) skewX(-10deg);z-index:41;pointer-events:none;opacity:0;font:italic 900 46px Orbitron,Rajdhani,sans-serif;color:#9ff;letter-spacing:.16em;text-shadow:0 0 18px #4be6ff}';
      doc.head.appendChild(css); h.innerHTML = '<div class="sl-ret"></div>';
      var boxes = [];
      for (var i = 0; i < CFG.max; i++) {
        var b = doc.createElement('div'); b.className = 'sl-box'; b.innerHTML = '<i></i><i></i><i></i><i></i><div class="sl-ring"></div><b></b>';
        h.appendChild(b); boxes.push({ el: b, ring: b.children[4], tag: b.children[5], key: '', txt: '' });
      }
      var s = doc.createElement('div'); s.id = 'shipSpd'; s.innerHTML = '<div class="n">0</div><div class="u">KM/H</div><div class="bar"><div></div></div>';
      var bt = doc.createElement('div'); bt.id = 'shipBoost'; bt.textContent = 'BOOST';
      doc.body.appendChild(h); doc.body.appendChild(s); doc.body.appendChild(bt);
      els = { root: h, boxes: boxes, spd: s, num: s.children[0], bar: s.children[2].firstChild, boost: bt, lastN: -1, shown: false, rootOn: false };
    }
    function reset() { lockId = null; holdId = null; holdT = 0; locked = false; }
    function findT(list, id) { if (list) for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i]; return null; }

    function update(dt) {
      if (off) return;
      riding = !!(o.getRide && o.getRide());
      if (!riding) {   // dismounted: drop everything (FOV add -> 0 so the host restores the camera exactly)
        if (lockId !== null || holdId !== null || add !== 0 || pull !== 0 || (els && (els.rootOn || els.shown))) { reset(); add = 0; pull = 0; kick = 0; wasBoost = false; hide(); }
        return;
      }
      tt += dt; if (cd > 0) cd -= dt; kick = Math.max(0, kick - dt * 1.4); if (boostFlash > 0) boostFlash -= dt;
      spd = Math.abs(o.speedMS ? o.speedMS() : 0);
      var b = !!(o.boosting && o.boosting()); if (b && !wasBoost) { kick = 1; boostFlash = 0.9; } wasBoost = b;
      var k = clamp((spd - topMS * 0.55) / Math.max(1, boostMS - topMS * 0.55), 0, 1);
      var wantAdd = fovAdd(spd, topMS, boostMS, kick), wantPull = (k * 0.8 + (b ? 0.2 : 0)) * CFG.pullM * U;
      var e = 1 - Math.exp(-6 * dt); add += (wantAdd - add) * e; pull += (wantPull - pull) * e;
      build();
      // ---- lock-on scan ----
      o.camState(cs);
      var list = o.getTargets ? o.getTargets() : null, n = 0, rU = CFG.rangeM * U, coneR = CFG.coneDeg * D2R, keepR = CFG.keepDeg * D2R;
      if (list) for (var i = 0; i < list.length; i++) {
        var t = list[i]; if (!t || t.defeated) continue;
        o.posOf(t, pp); aim(cs, pp.x, pp.y, pp.z, am);
        if (!inView(am, rU, t.id === lockId ? keepR : coneR)) continue;   // a held lock survives out to the wide cone
        var s = n < CFG.max ? n : CFG.max - 1; if (n >= CFG.max && am.ang >= near[s].ang) continue;
        near[s].t = t; near[s].id = t.id; near[s].ang = am.ang; near[s].d = am.d; if (n < CFG.max) n++;
        while (s > 0 && near[s].ang < near[s - 1].ang) { var tmp = near[s]; near[s] = near[s - 1]; near[s - 1] = tmp; s--; }
      }
      if (lockId !== null) { var still = false; for (var j = 0; j < n; j++) if (near[j].id === lockId) { still = true; break; } if (!still) reset(); }
      if (lockId === null) {   // hold candidate = nearest the screen centre, only if inside the tight hold cone
        if (n > 0 && near[0].ang <= CFG.holdDeg * D2R) {
          if (holdId === near[0].id) { holdT += dt; if (holdT >= CFG.holdS) { lockId = holdId; locked = true; } } else { holdId = near[0].id; holdT = 0; }
        } else { holdId = null; holdT = 0; }
      }
      if (els) {
        draw(n);
        var showSpd = !(o.inRace && o.inRace());   // the race HUD2 already has a km/h block
        if (els.shown !== showSpd) { els.spd.style.display = showSpd ? 'block' : 'none'; els.shown = showSpd; }
        if (showSpd) { var kk = kmh(spd); if (kk !== els.lastN) { els.lastN = kk; els.num.textContent = kk; els.bar.style.width = (clamp(spd / boostMS, 0, 1) * 100).toFixed(0) + '%'; } }
        els.boost.style.opacity = boostFlash > 0 ? Math.min(1, boostFlash * 2).toFixed(2) : '0';
      }
      sOn = !calm && !(o.streaks && !o.streaks()); if (fxLines || sOn) streaks(dt);
    }
    function streaks(dt) {
      if (!fxLines && root.WorldSpeedFX && root.WorldSpeedFX.create) fxLines = root.WorldSpeedFX.create({ camera: dummyCam, topMS: topMS, boostMS: boostMS, getRiding: function () { return riding && sOn; }, getSpeed: function () { return spd; } });
      if (fxLines) { if (kick > 0.97) fxLines.kick(); fxLines.update(dt); }
    }
    function draw(n) {
      var bx = els.boxes;
      if (!els.rootOn) { els.root.style.display = 'block'; els.rootOn = true; }
      for (var i = 0; i < CFG.max; i++) {
        var B = bx[i];
        if (i >= n) { if (B.key !== '') { B.el.style.display = 'none'; B.key = ''; } continue; }
        var c = near[i]; o.posOf(c.t, pp); o.project(pp.x, pp.y, pp.z, sc);
        if (!sc.on) { if (B.key !== '') { B.el.style.display = 'none'; B.key = ''; } continue; }
        var isL = c.id === lockId, isH = !isL && c.id === holdId, key = isL ? 'lock' : (isH ? 'hold' : 'idle');
        if (key !== B.key) { B.el.className = 'sl-box ' + (key === 'idle' ? '' : key); B.el.style.display = 'block'; B.key = key; }
        B.el.style.transform = 'translate(' + sc.x.toFixed(1) + 'px,' + sc.y.toFixed(1) + 'px) scale(' + clamp(1500 * U / c.d / 22, 0.7, 2.2).toFixed(2) + ')';   // box shrinks with distance
        if (isH) { B.ring.style.opacity = '1'; B.ring.style.transform = 'scale(' + (1.9 - 0.9 * clamp(holdT / CFG.holdS, 0, 1)).toFixed(2) + ')'; }   // ring tightens while held
        else if (isL) { B.ring.style.opacity = '1'; B.ring.style.transform = 'scale(1)'; }
        else B.ring.style.opacity = '0';
        var txt = (isL ? 'LOCKED ' : '') + Math.round(c.d / U) + ' m';
        if (txt !== B.txt) { B.tag.textContent = txt; B.txt = txt; }
      }
    }
    function hide() {
      if (!els) return; els.root.style.display = 'none'; els.rootOn = false; els.spd.style.display = 'none'; els.shown = false; els.boost.style.opacity = '0';
      for (var i = 0; i < els.boxes.length; i++) { els.boxes[i].el.style.display = 'none'; els.boxes[i].key = ''; }
      if (fxLines) fxLines.update(0.016);   // riding=false -> fades the streak layer
    }
    // camera pull-back (along the view axis) + boost shake; the chase cam re-places the camera every frame so nothing accumulates
    function applyCamera() {
      if (off || !riding || !cam || !cam.position) return;
      var p = cam.position; o.camState(cs);
      if (pull > 0.001) { p.x -= cs.dx * pull; p.y -= cs.dy * pull; p.z -= cs.dz * pull; }
      if (!calm && (kick > 0.05 || (wasBoost && spd > topMS * 0.8))) {
        var a = CFG.shakeM * U * (kick * 0.6 + (wasBoost ? 0.4 : 0.1));
        p.x += Math.sin(tt * 53) * a; p.y += Math.sin(tt * 67 + 1.3) * a;
      }
    }
    function flash(i) { var el = els.boxes[i].el; el.style.filter = 'brightness(2.5)'; setTimeout(function () { el.style.filter = ''; }, 70); }
    function fire() {
      if (off || !riding || !locked || lockId === null || cd > 0) return false;
      var t = findT(o.getTargets ? o.getTargets() : null, lockId); if (!t || t.defeated) { reset(); return false; }
      cd = CFG.cooldown; o.posOf(t, pp);
      var ok = !!(o.damage && o.damage(lockId, CFG.dmg, pp, 'physical'));
      if (els) for (var i = 0; i < els.boxes.length; i++) if (els.boxes[i].key === 'lock') flash(i);
      return ok;
    }
    return { update: update, applyCamera: applyCamera, fire: fire, fovAdd: function () { return off ? 0 : add; }, target: function () { return lockId; },
      isLocked: function () { return locked && lockId !== null; }, state: function () { return { lockId: lockId, holdId: holdId, holdT: holdT, add: add, pull: pull, kick: kick, riding: riding, cd: cd }; } };
  }
  var api = { create: create, CFG: CFG, pure: { aim: aim, inView: inView, fovAdd: fovAdd, kmh: kmh } };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.WorldShipLock = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
