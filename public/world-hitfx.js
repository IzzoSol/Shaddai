/* world-hitfx.js — HIT FEEDBACK (owner 2026-10-01 "hit markers", ORACLE: "crisp ping + 0.2 s hit-marker, readable, never noisy"):
 *   crosshair HIT MARKER (4 ticks; white on hit, gold+bigger on kill, 0.2 s) + a synthesized ping (WebAudio, no assets; kill = two-tone)
 *   floating DAMAGE NUMBERS projected from the world position (pooled DOM, max 20, rise 46 px over 0.7 s; size grows with damage; kills read "KILL")
 *   HURT feedback: red edge vignette scaled by damage + a directional arc pointing at where the hit came from
 *   NEAR-MISS whoosh (soft noise burst, no points) for projectiles that pass close.
 * API: var fx = WorldHitFX.create({ project(x,y,z)->{x,y,on}|null, getYaw()->heading rad, audio? }) ; fx.hit({dmg,x,y,z,killed}) · fx.hurt(dmg, {dx,dz}?) · fx.nearMiss() · fx.update(dt) · fx.dispose()
 * Pure helpers (tested): numberStyle(dmg, killed) · arcAngle(dx, dz, yaw)
 */
(function (root) {
  'use strict';
  function numberStyle(dmg, killed) { var big = Math.min(1, dmg / 60); return { size: Math.round(15 + big * 18), color: killed ? '#ffd24a' : dmg >= 30 ? '#ff8a3a' : '#ffffff', text: killed ? 'KILL ' + dmg : String(dmg) }; }
  /* screen angle (rad, 0 = up/ahead, + = clockwise) of a hit that came from world offset (dx,dz) while facing heading yaw (0 = +z, clockwise; right hand = (-cos, sin)). */
  function arcAngle(dx, dz, yaw) { var fwd = dx * Math.sin(yaw) + dz * Math.cos(yaw), right = -dx * Math.cos(yaw) + dz * Math.sin(yaw); return Math.atan2(right, fwd); }
  function create(o) {
    o = o || {}; var doc = o.document || (typeof document !== 'undefined' ? document : null), pool = [], live = [], MAXN = 20, markT = 0, markKill = false, hurtT = 0, hurtK = 0, arcT = 0, arcA = 0, ac = null, mk = null, vig = null, arc = null, ov = null;
    function mkEl(css) { var e = doc.createElement('div'); e.style.cssText = css; return e; }
    if (doc && doc.body) {
      ov = mkEl('position:fixed;inset:0;pointer-events:none;z-index:7350;overflow:hidden'); doc.body.appendChild(ov);
      mk = mkEl('position:absolute;left:50%;top:50%;width:0;height:0;opacity:0'); ['-1,-1', '1,-1', '-1,1', '1,1'].forEach(function (d) { var s = d.split(','), t = mkEl('position:absolute;width:11px;height:3px;background:#fff;left:' + (s[0] * 11 - 5) + 'px;top:' + (s[1] * 11 - 1) + 'px;transform:rotate(' + (s[0] * s[1] > 0 ? 45 : -45) + 'deg);box-shadow:0 0 4px #000'); mk.appendChild(t); }); ov.appendChild(mk);
      vig = mkEl('position:absolute;inset:0;opacity:0;box-shadow:inset 0 0 140px 40px rgba(255,30,50,.75)'); ov.appendChild(vig);
      arc = mkEl('position:absolute;left:50%;top:50%;width:0;height:0;opacity:0'); arc.appendChild(mkEl('position:absolute;left:-46px;top:-150px;width:92px;height:22px;border-radius:50%;background:radial-gradient(ellipse at center,rgba(255,50,70,.95),transparent 70%)')); ov.appendChild(arc);
    }
    function audio() { if (o.audio === false) return null; try { if (!ac) { var C = root.AudioContext || root.webkitAudioContext; if (C) ac = new C(); } } catch (e) { } return ac; }
    function tone(f0, f1, dur, vol, type) { var a = audio(); if (!a) return; try { var os = a.createOscillator(), g = a.createGain(); os.type = type || 'sine'; os.frequency.setValueAtTime(f0, a.currentTime); os.frequency.exponentialRampToValueAtTime(f1, a.currentTime + dur); g.gain.setValueAtTime(vol, a.currentTime); g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + dur); os.connect(g); g.connect(a.destination); os.start(); os.stop(a.currentTime + dur); } catch (e) { } }
    function numEl() { var e = pool.pop(); if (!e && doc) { e = mkEl('position:absolute;left:0;top:0;font:900 18px Orbitron,sans-serif;text-shadow:0 0 6px #000,0 2px 2px #000;white-space:nowrap;pointer-events:none;will-change:transform,opacity'); ov.appendChild(e); } return e; }
    function hit(h) {
      markT = 0.2; markKill = !!h.killed; tone(h.killed ? 660 : 900, h.killed ? 1200 : 700, h.killed ? 0.16 : 0.07, h.killed ? 0.07 : 0.05, 'triangle'); if (h.killed) setTimeout(function () { tone(990, 1400, 0.1, 0.06, 'triangle'); }, 70);
      if (!doc || !o.project || h.dmg == null) return; if (live.length >= MAXN) { var old = live.shift(); old.el.style.opacity = 0; pool.push(old.el); }
      var st = numberStyle(Math.round(h.dmg), !!h.killed), el = numEl(); if (!el) return; el.textContent = st.text; el.style.fontSize = st.size + 'px'; el.style.color = st.color; el.style.opacity = 1;
      live.push({ el: el, x: h.x, y: h.y, z: h.z, t: 0, dx: (Math.random() - 0.5) * 30 });
    }
    function hurt(dmg, from) { hurtK = Math.min(1, 0.25 + dmg / 45); hurtT = 0.45; tone(130, 70, 0.18, 0.09, 'sawtooth'); if (from && o.getYaw) { arcA = arcAngle(from.dx, from.dz, o.getYaw()); arcT = 0.8; } }
    function nearMiss() { var a = audio(); if (!a) return; try { var len = Math.floor(a.sampleRate * 0.12), b = a.createBuffer(1, len, a.sampleRate), d = b.getChannelData(0); for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len); var s = a.createBufferSource(), g = a.createGain(); s.buffer = b; g.gain.value = 0.05; s.connect(g); g.connect(a.destination); s.start(); } catch (e) { } }
    function update(dt) {
      if (!doc) return;
      if (markT > 0) { markT -= dt; mk.style.opacity = Math.max(0, markT / 0.2); mk.style.transform = 'scale(' + (markKill ? 1.7 : 1) + ')'; Array.prototype.forEach.call(mk.children, function (c) { c.style.background = markKill ? '#ffd24a' : '#fff'; }); } else if (mk) mk.style.opacity = 0;
      if (hurtT > 0) { hurtT -= dt; vig.style.opacity = Math.max(0, hurtT / 0.45) * hurtK; } else if (vig) vig.style.opacity = 0;
      if (arcT > 0) { arcT -= dt; arc.style.opacity = Math.max(0, arcT / 0.8); arc.style.transform = 'rotate(' + arcA + 'rad)'; } else if (arc) arc.style.opacity = 0;
      for (var i = live.length - 1; i >= 0; i--) {
        var n = live[i]; n.t += dt; var p = o.project(n.x, n.y, n.z);
        if (n.t >= 0.7 || !p || !p.on) { n.el.style.opacity = 0; pool.push(n.el); live.splice(i, 1); continue; }
        n.el.style.transform = 'translate(' + Math.round(p.x + n.dx * n.t) + 'px,' + Math.round(p.y - 46 * (n.t / 0.7)) + 'px) translate(-50%,-50%)'; n.el.style.opacity = 1 - Math.pow(n.t / 0.7, 3);
      }
    }
    return { hit: hit, hurt: hurt, nearMiss: nearMiss, update: update, dispose: function () { if (ov && ov.parentNode) ov.parentNode.removeChild(ov); }, _live: function () { return live.length; }, _pool: function () { return pool.length; } };
  }
  root.WorldHitFX = { create: create, numberStyle: numberStyle, arcAngle: arcAngle };
})(typeof window !== 'undefined' ? window : globalThis);
