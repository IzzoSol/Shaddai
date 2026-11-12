/* world-bot-bodies.js — code-built, fully RIGGED bot bodies from the owner's refs (no fal spend). 2026-09-29.
 *   var b = WorldBotBodies.build(THREE, kind, style?)   kind: 'scrap' | 'lanky' | 'unicycle' | 'analyst' | 'casino'
 *   -> { root, nodes:{name:Object3D}, clips:{idle, walk, run, wave, talk, ...} (THREE.AnimationClip), sockets:{handR, back, head}, height, kind, wheeled }
 *   Rig = a named joint hierarchy (hip > torso > head/antennas/arms > forearms > hands ; hip > legs > shins ; wheeled: root > wheel, lean, torso...). Clips are real
 *   AnimationClips on those named joints, so an AnimationMixer plays them exactly like a GLB agent. Metres, +z = front, y up, feet/tire at y=0.
 *   Refs: scrap = e748c454 (box head, yellow eyes, antennas, orange/red torso, pink sneakers) · lanky = 92815f70 (tall cream/grey, red bands, red sneakers)
 *         unicycle = fc6ed6df (orange single-wheel, cyan eye, red cross) · analyst = 05befa54 (white ball head, red eye, gold rim wheel) · casino = 4a08a35e (slot-machine mech).
 *   Variants: pass a style {body, head, eye, accent} to recolour any kind (the other roster bots reuse these four bodies until new refs arrive).
 */
(function (root) {
  'use strict';
  function build(THREE, kind, style) {
    var st = Object.assign({}, DEF[kind] || DEF.scrap, style || {});
    var N = {}, sock = {}, R = new THREE.Group(); R.name = 'bot-' + kind; N.root = R;
    var mats = {};
    function M(c, o) { var k = c + JSON.stringify(o || {}); return mats[k] || (mats[k] = new THREE.MeshStandardMaterial(Object.assign({ color: c, roughness: 0.55, metalness: 0.35 }, o || {}))); }
    function J(name, parent, x, y, z) { var g = new THREE.Group(); g.name = name; g.position.set(x || 0, y || 0, z || 0); (parent || R).add(g); N[name] = g; return g; }
    function P(parent, geo, mat, x, y, z, rx, ry, rz, sx, sy, sz) { var m = new THREE.Mesh(geo, mat); m.position.set(x || 0, y || 0, z || 0); if (rx || ry || rz) m.rotation.set(rx || 0, ry || 0, rz || 0); if (sx != null) m.scale.set(sx, sy == null ? sx : sy, sz == null ? sx : sz); parent.add(m); return m; }
    var Bx = function (w, h, d) { return new THREE.BoxGeometry(w, h, d); }, Cy = function (rt, rb, h, s) { return new THREE.CylinderGeometry(rt, rb, h, s || 16); }, Sp = function (r, a, b) { return new THREE.SphereGeometry(r, a || 20, b || 14); }, To = function (R1, r, s) { return new THREE.TorusGeometry(R1, r, 10, s || 28); };
    var body = M(st.body), head = M(st.head), acc = M(st.accent), dark = M(0x2a2f36, { metalness: 0.5 }), steel = M(0x8a929b, { metalness: 0.8, roughness: 0.35 }), eye = M(0x111111, { emissive: st.eye, emissiveIntensity: 1.6 }), wire = M(0x15171b, { roughness: 0.9, metalness: 0.1 });
    var H = 1.8, wheeled = false;

    function hand(parent, side, big) { var s = big ? 1.5 : 1, g = J('hand' + side, parent, 0, -0.04 * s, 0); P(g, Bx(0.09 * s, 0.09 * s, 0.05 * s), dark, 0, -0.05 * s, 0); for (var f = -1; f <= 1; f++) P(g, Bx(0.022 * s, 0.07 * s, 0.03 * s), dark, f * 0.03 * s, -0.115 * s, 0.005); sock['hand' + side] = g; return g; }
    function arm(parent, side, sx, y, len, thick, upperMat, foreMat, big) {
      var u = J('arm' + side, parent, sx, y, 0); P(u, Cy(thick * 1.15, thick * 1.15, thick * 1.5, 14), acc, 0, 0, 0, 0, 0, Math.PI / 2);   // shoulder joint disc
      P(u, Bx(thick * 1.6, len, thick * 1.6), upperMat, 0, -len / 2, 0); var f = J('fore' + side, u, 0, -len, 0); P(f, Sp(thick * 0.9, 12, 10), dark, 0, 0, 0); P(f, Bx(thick * 1.5, len * 0.9, thick * 1.5), foreMat, 0, -len * 0.45, 0); hand(f, side, big); return u;
    }
    function leg(parent, side, sx, y, thigh, shin, thick, boot) {
      var u = J('leg' + side, parent, sx, y, 0); P(u, Sp(thick * 1.3, 12, 10), acc, 0, 0, 0); P(u, Cy(thick, thick * 0.9, thigh, 12), dark, 0, -thigh / 2, 0);
      var s = J('shin' + side, u, 0, -thigh, 0); P(s, Cy(thick * 1.25, thick * 1.25, thick * 1.4, 14), acc, 0, 0, 0, 0, 0, Math.PI / 2); P(s, Cy(thick * 0.9, thick * 0.8, shin, 12), dark, 0, -shin / 2, 0);
      var foot = P(s, Bx(0.2, 0.1, 0.34), M(boot.toe), 0, -shin - 0.03, 0.06); P(s, Bx(0.2, 0.06, 0.34), M(boot.sole), 0, -shin - 0.1, 0.06); P(s, Bx(0.2, 0.08, 0.12), M(boot.toe), 0, -shin - 0.03, 0.2); return u;
    }
    function antenna(parent, name, x, y, tilt, len, ball) { var a = J(name, parent, x, y, 0); a.rotation.z = tilt; P(a, Cy(0.008, 0.012, len, 6), dark, 0, len / 2, 0); if (ball) P(a, Sp(0.024, 8, 6), acc, 0, len, 0); return a; }
    function neckCoil(parent, y, h) { var n = J('neck', parent, 0, y, 0); P(n, Cy(0.05, 0.05, h, 10), wire, 0, h / 2, 0); for (var i = 0; i < 4; i++) P(n, To(0.055, 0.012, 14), steel, 0, h * (i + 0.5) / 4, 0, Math.PI / 2); return n; }

    if (kind === 'scrap' || kind === 'lanky') {
      var L = kind === 'lanky' ? 1.22 : 1, legT = 0.46 * L, legS = 0.5 * L, hipY = legT + legS + 0.12, torsoH = 0.5 * L, thick = kind === 'lanky' ? 0.045 : 0.06;
      var boot = kind === 'lanky' ? { toe: 0xe8e2d0, sole: 0xd94a4a } : { toe: 0xe86a72, sole: 0xf1ece4 };
      var hip = J('hip', R, 0, hipY, 0); P(hip, kind === 'lanky' ? Sp(0.2, 18, 12) : Bx(0.36, 0.2, 0.26), kind === 'lanky' ? M(0xd8cfb8) : M(st.accent), 0, 0, 0, 0, 0, 0, kind === 'lanky' ? 1.15 : 1, 0.8, 0.9); P(hip, To(0.06, 0.016, 12), M(0xffb060, { emissive: 0xff6a3a, emissiveIntensity: 0.9 }), 0.15, 0.02, 0.16, 0, 0, 0);
      for (var w = 0; w < 5; w++) P(hip, Cy(0.008, 0.008, 0.3, 5), wire, -0.12 + w * 0.06, 0.12, 0.05, 0.3 * (w % 2 ? 1 : -1), 0, 0.2 * (w - 2));
      leg(hip, 'L', 0.12, -0.08, legT, legS, thick, boot); leg(hip, 'R', -0.12, -0.08, legT, legS, thick, boot);
      var torso = J('torso', hip, 0, 0.08, 0); P(torso, Cy(0.3 * (kind === 'lanky' ? 0.9 : 1), 0.25, torsoH, 16), body, 0, torsoH / 2 + 0.04, 0);
      if (kind === 'lanky') { P(torso, Cy(0.11, 0.11, 0.02, 20), M(0xd94a4a, { emissive: 0xd94a4a, emissiveIntensity: 0.4 }), 0, torsoH * 0.62, 0.235, Math.PI / 2); P(torso, Cy(0.3, 0.3, 0.04, 16), M(0xd94a4a), 0, torsoH * 0.98, 0); }
      else { P(torso, To(0.29, 0.03, 16), dark, 0, torsoH + 0.02, 0, Math.PI / 2); P(torso, Bx(0.12, 0.09, 0.02), M(0xf0ece4), 0.1, torsoH * 0.6, 0.255); P(torso, Bx(0.1, 0.1, 0.02), M(0xf0ece4), -0.1, torsoH * 0.35, 0.24, 0, 0, 0.3); }
      arm(torso, 'L', 0.36 * (kind === 'lanky' ? 0.95 : 1), torsoH, (kind === 'lanky' ? 0.56 : 0.44), thick * 0.85, acc, kind === 'lanky' ? M(0x7a8794) : M(0xd4504a), false);
      arm(torso, 'R', -0.36 * (kind === 'lanky' ? 0.95 : 1), torsoH, (kind === 'lanky' ? 0.56 : 0.44), thick * 0.85, acc, kind === 'lanky' ? M(0x7a8794) : M(0xd4504a), false);
      var neck = neckCoil(torso, torsoH + 0.06, 0.14), hd = J('head', neck, 0, 0.14, 0);
      if (kind === 'scrap') { P(hd, Bx(0.44, 0.36, 0.34), head, 0, 0.2, 0); P(hd, Cy(0.075, 0.075, 0.03, 20), eye, -0.1, 0.22, 0.175, Math.PI / 2); P(hd, Cy(0.075, 0.075, 0.03, 20), eye, 0.1, 0.22, 0.175, Math.PI / 2); P(hd, Cy(0.08, 0.08, 0.05, 16), M(0xc9403a), -0.25, 0.2, 0, 0, 0, Math.PI / 2); P(hd, Bx(0.1, 0.03, 0.02), dark, 0, 0.06, 0.175); antenna(hd, 'antL', -0.17, 0.38, 0.25, 0.28, true); antenna(hd, 'antR', 0.17, 0.38, -0.25, 0.3, false); antenna(hd, 'antM', 0, 0.38, 0, 0.16, false); }
      else { P(hd, Sp(0.16, 20, 14), head, 0, 0.16, 0, 0, 0, 0, 1, 0.95, 0.95); P(hd, To(0.06, 0.02, 16), M(0xe8c45c), -0.07, 0.2, 0.135); P(hd, To(0.06, 0.02, 16), M(0xe8c45c), 0.07, 0.2, 0.135); P(hd, Cy(0.045, 0.045, 0.02, 16), eye, -0.07, 0.2, 0.148, Math.PI / 2); P(hd, Cy(0.045, 0.045, 0.02, 16), eye, 0.07, 0.2, 0.148, Math.PI / 2); antenna(hd, 'antL', -0.1, 0.3, 0.3, 0.16, true); antenna(hd, 'antR', 0.1, 0.3, -0.3, 0.16, false); }
      sock.head = hd; sock.back = J('backSock', torso, 0, torsoH * 0.7, -0.28); H = hipY + torsoH + 0.55;
    } else if (kind === 'unicycle' || kind === 'analyst') {
      wheeled = true; var white = kind === 'analyst', tireR = 0.4, tireW = 0.15;
      var lean = J('lean', R, 0, tireR, 0), wheel = J('wheel', lean, 0, 0, 0);
      P(wheel, new THREE.TorusGeometry(tireR - 0.09, 0.09, 14, 36), M(0x1b1c20, { roughness: 0.9, metalness: 0.1 }), 0, 0, 0, 0, Math.PI / 2, 0, 1, 1, 1.6);
      for (var t = 0; t < 12; t++) { var ta = t / 12 * Math.PI * 2; P(wheel, Bx(0.02, 0.03, 0.14), dark, 0, Math.sin(ta) * (tireR + 0.005), Math.cos(ta) * (tireR + 0.005), -ta, 0, 0); }
      P(wheel, Cy(tireR - 0.13, tireR - 0.13, 0.12, 24), white ? M(0xc9a24a, { metalness: 0.9 }) : M(0xe08a2a), 0, 0, 0, 0, 0, Math.PI / 2); P(wheel, Cy(0.11, 0.11, 0.16, 16), dark, 0, 0, 0, 0, 0, Math.PI / 2); for (var sp = 0; sp < 6; sp++) P(wheel, Bx(0.03, 0.3, 0.14), steel, 0, 0, 0, sp / 6 * Math.PI, 0, 0);
      var fork = J('fork', lean, 0, 0, 0); P(fork, Bx(0.3, 0.06, 0.14), dark, 0, tireR * 0.98, 0); P(fork, Bx(0.02, 0.44, 0.2), dark, 0.11, 0.2, 0); P(fork, Bx(0.02, 0.44, 0.2), dark, -0.11, 0.2, 0);
      var shell = P(lean, Sp(0.3, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), body, 0, tireR * 0.86, -0.02, 0, 0, 0, 1, 0.75, 1.15); P(lean, Cy(0.22, 0.28, 0.3, 16), body, 0, tireR + 0.25, 0);
      if (!white) { P(lean, Bx(0.07, 0.4, 0.02), acc, 0.03, tireR + 0.28, 0.285, 0, 0, 0.5); P(lean, Bx(0.07, 0.3, 0.02), acc, -0.05, tireR + 0.3, 0.285, 0, 0, -0.5); }
      var torso = J('torso', lean, 0, tireR + 0.35, 0); P(torso, Sp(0.28, 20, 14), body, 0, 0.15, 0, 0, 0, 0, 1, 1.05, 0.95); P(torso, Cy(0.09, 0.09, 0.12, 14), dark, 0, -0.02, 0);
      if (white) { P(torso, Sp(0.05, 10, 8), M(0xe8a02a, { emissive: 0xe8a02a, emissiveIntensity: 0.5 }), 0.24, 0.1, 0.12); P(torso, Sp(0.05, 10, 8), M(0xe8a02a, { emissive: 0xe8a02a, emissiveIntensity: 0.5 }), -0.24, 0.1, 0.12); }
      var hd = J('head', torso, 0, 0.36, 0.02); if (white) { P(hd, Sp(0.24, 24, 16), head, 0, 0.14, 0); P(hd, Cy(0.06, 0.06, 0.05, 18), eye, 0, 0.16, 0.225, Math.PI / 2); P(hd, To(0.07, 0.016, 18), M(0xe8a02a), 0, 0.16, 0.222); P(hd, Sp(0.045, 10, 8), M(0xe8a02a), -0.2, 0.14, 0.1); P(hd, Sp(0.045, 10, 8), M(0xe8a02a), 0.2, 0.14, 0.1); }
      else { P(hd, Sp(0.25, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.62), head, 0, 0.1, 0, 0, 0, 0, 1, 0.9, 1); P(hd, Cy(0.075, 0.075, 0.04, 18), eye, 0.06, 0.16, 0.235, Math.PI / 2); P(hd, To(0.085, 0.014, 18), M(0xd4302a), 0.06, 0.16, 0.238); P(hd, Bx(0.32, 0.05, 0.02), acc, 0, 0.26, 0.19, -0.3); P(hd, Bx(0.05, 0.34, 0.02), acc, 0, 0.22, 0.2, -0.3); }
      arm(torso, 'L', 0.34, 0.2, white ? 0.4 : 0.36, white ? 0.045 : 0.075, white ? M(0xe8e4dc) : acc, white ? M(0xd8d2c4) : dark, !white); arm(torso, 'R', -0.34, 0.2, white ? 0.4 : 0.36, white ? 0.045 : 0.075, white ? M(0xe8e4dc) : acc, white ? M(0xd8d2c4) : dark, !white);
      sock.head = hd; sock.back = J('backSock', torso, 0, 0.3, -0.26); H = tireR + 0.35 + 0.6;
    } else {   // casino: slot-machine mech (arcade-building dealer). stationary, rocks + blinks
      var slot = M(0x6a3b1a, { metalness: 0.6, roughness: 0.4 }), gold = M(0xe8b43c, { metalness: 0.9, roughness: 0.3 }), glow = function (c) { return M(0x222222, { emissive: c, emissiveIntensity: 1.4 }); };
      var hip = J('hip', R, 0, 0.95, 0); P(hip, Bx(0.7, 0.3, 0.45), slot, 0, 0, 0); leg(hip, 'L', 0.22, -0.1, 0.42, 0.42, 0.11, { toe: 0x6a3b1a, sole: 0x2a1a0e }); leg(hip, 'R', -0.22, -0.1, 0.42, 0.42, 0.11, { toe: 0x6a3b1a, sole: 0x2a1a0e });
      var torso = J('torso', hip, 0, 0.15, 0); P(torso, Bx(0.95, 0.85, 0.55), slot, 0, 0.45, 0); P(torso, Bx(0.6, 0.36, 0.05), glow(0xff3fa4), 0, 0.62, 0.29); P(torso, Bx(0.62, 0.38, 0.03), gold, 0, 0.62, 0.275);
      var cv = document.createElement('canvas'); cv.width = 256; cv.height = 96; var cx = cv.getContext('2d'); cx.fillStyle = '#120a1a'; cx.fillRect(0, 0, 256, 96); cx.fillStyle = '#ff3fa4'; cx.font = '700 78px Georgia,serif'; cx.textAlign = 'center'; cx.textBaseline = 'middle'; cx.fillText('7 7 7', 128, 52); var tx = new THREE.CanvasTexture(cv); tx.colorSpace = THREE.SRGBColorSpace; P(torso, new THREE.PlaneGeometry(0.56, 0.32), new THREE.MeshBasicMaterial({ map: tx }), 0, 0.62, 0.3);
      var bulbs = []; for (var bI = 0; bI < 12; bI++) { var b = P(torso, Sp(0.03, 8, 6), glow(bI % 2 ? 0xffdd55 : 0xff5599), -0.33 + (bI % 6) * 0.132, bI < 6 ? 0.84 : 0.4, 0.3); bulbs.push(b); } N.bulbs = bulbs;
      P(torso, Bx(0.13, 0.13, 0.13), M(0xf6f0e6), -0.5, 0.95, 0, 0.4, 0.6, 0.2); P(torso, Bx(0.13, 0.13, 0.13), M(0xf6f0e6), 0.5, 0.95, 0, 0.2, 0.4, 0.5); P(torso, Sp(0.09, 12, 8), glow(0xff2a3a), 0, 1.03, -0.1, 0, 0, 0, 1, 0.9, 0.6);
      arm(torso, 'L', 0.62, 0.8, 0.5, 0.11, gold, slot, true); arm(torso, 'R', -0.62, 0.8, 0.5, 0.11, gold, slot, true);
      var hd = J('head', torso, 0, 0.95, 0.02); P(hd, Bx(0.4, 0.3, 0.32), slot, 0, 0.15, 0); P(hd, Bx(0.28, 0.06, 0.02), glow(0xffdd55), 0, 0.17, 0.17); P(hd, Cy(0.05, 0.05, 0.03, 12), glow(0xff5599), -0.09, 0.08, 0.17, Math.PI / 2); P(hd, Cy(0.05, 0.05, 0.03, 12), glow(0xff5599), 0.09, 0.08, 0.17, Math.PI / 2);
      sock.head = hd; sock.back = J('backSock', torso, 0, 0.7, -0.3); H = 2.3;
    }
    R.userData.nodes = N; R.userData.sockets = sock;

    /* ── clips (real AnimationClips on the named joints) ── */
    var T = Math.PI * 2, clips = {}, eu = new THREE.Euler(), qq = new THREE.Quaternion();
    function clip(name, dur, spec, steps) {   // spec: { joint: fn(t01) -> [rx, ry, rz] (rotation) } ; '$pos:joint': fn -> [x,y,z] offset ; '$loop:joint:axis': continuous spin
      steps = steps || Math.max(12, Math.round(dur * 16)); var tracks = [], times = []; for (var i = 0; i <= steps; i++) times.push(dur * i / steps);
      Object.keys(spec).forEach(function (k) {
        if (k.indexOf('$pos:') === 0) { var nd = N[k.slice(5)]; if (!nd) return; var v = []; for (var i = 0; i <= steps; i++) { var o = spec[k](i / steps); v.push(nd.position.x + o[0], nd.position.y + o[1], nd.position.z + o[2]); } tracks.push(new THREE.VectorKeyframeTrack(nd.name + '.position', times, v)); return; }
        var nd2 = N[k]; if (!nd2) return; var vals = []; for (var j = 0; j <= steps; j++) { var e = spec[k](j / steps); eu.set(nd2.rotation.x + e[0], nd2.rotation.y + e[1], nd2.rotation.z + e[2]); qq.setFromEuler(eu); vals.push(qq.x, qq.y, qq.z, qq.w); }
        tracks.push(new THREE.QuaternionKeyframeTrack(nd2.name + '.quaternion', times, vals));
      });
      var c = new THREE.AnimationClip(name, dur, tracks); clips[name] = c; return c;
    }
    var s = function (t, ph) { return Math.sin(t * T + (ph || 0)); };
    if (!wheeled && kind !== 'casino') {
      var gait = function (dur, a, bob) { return { hip: t => [0, s(t) * 0.05, 0], torso: t => [0.04, s(t) * 0.12, 0], head: t => [s(t * 2) * 0.03, -s(t) * 0.1, 0], legL: t => [-s(t) * a, 0, 0], legR: t => [s(t) * a, 0, 0], shinL: t => [Math.max(0, s(t, -0.9)) * a * 1.2, 0, 0], shinR: t => [Math.max(0, -s(t, -0.9)) * a * 1.2, 0, 0], armL: t => [s(t) * a * 0.9, 0, 0.04], armR: t => [-s(t) * a * 0.9, 0, -0.04], foreL: t => [-0.25 - Math.max(0, s(t)) * 0.4, 0, 0], foreR: t => [-0.25 - Math.max(0, -s(t)) * 0.4, 0, 0], antL: t => [0, 0, s(t * 2, 0.4) * 0.12], antR: t => [0, 0, -s(t * 2) * 0.12], '$pos:hip': t => [0, Math.abs(s(t)) * bob, 0] }; };
      clip('walk', 1.0, gait(1, 0.6, 0.035)); clip('run', 0.6, gait(1, 0.95, 0.07));
      clip('idle', 3.2, { torso: t => [s(t) * 0.02, s(t) * 0.05, 0], head: t => [0, s(t, 1) * 0.25, s(t) * 0.04], armL: t => [s(t, 1) * 0.05, 0, 0.06], armR: t => [s(t, 2) * 0.05, 0, -0.06], antL: t => [0, 0, s(t, 0.5) * 0.15], antR: t => [0, 0, -s(t, 1.5) * 0.15], '$pos:hip': t => [0, s(t) * 0.006, 0] });
      clip('wave', 1.6, { armR: t => [0, 0, -2.4 - Math.max(0, s(t * 2)) * 0.2], foreR: t => [-0.2 + s(t * 3) * 0.6, 0, 0], head: t => [0, 0.2, 0], torso: t => [0, 0.1, 0] });
      clip('talk', 1.2, { head: t => [s(t * 2) * 0.06, s(t) * 0.12, 0], torso: t => [s(t * 2) * 0.02, 0, 0], armL: t => [s(t * 2, 1) * 0.25, 0, 0.15], armR: t => [s(t * 2) * 0.25, 0, -0.15], antL: t => [0, 0, s(t * 3) * 0.2] });
    } else if (wheeled) {
      var roll = function (dur, lean, arms) { return { lean: t => [lean, 0, 0], torso: t => [s(t * 2) * 0.03, s(t) * 0.06, 0], head: t => [0, s(t) * 0.12, 0], armL: t => [-0.5 + s(t * 2) * arms, 0, 0.3], armR: t => [-0.5 - s(t * 2) * arms, 0, -0.3], wheel: t => [t * T, 0, 0] }; };
      clip('walk', 1.0, roll(1, 0.1, 0.1)); clip('run', 0.6, roll(1, 0.2, 0.18));
      clip('idle', 3.2, { torso: t => [s(t) * 0.02, s(t) * 0.05, 0], head: t => [0, s(t, 1) * 0.3, s(t) * 0.05], armL: t => [-0.15 + s(t, 1) * 0.06, 0, 0.35], armR: t => [-0.15 + s(t, 2) * 0.06, 0, -0.35], lean: t => [s(t) * 0.015, 0, 0] });
      clip('wave', 1.6, { armR: t => [0, 0, -2.3], foreR: t => [-0.3 + s(t * 3) * 0.6, 0, 0], head: t => [0, 0.25, 0] }); clip('talk', 1.2, { head: t => [s(t * 2) * 0.06, s(t) * 0.14, 0], armL: t => [-0.5 + s(t * 2, 1) * 0.3, 0, 0.3], armR: t => [-0.5 + s(t * 2) * 0.3, 0, -0.3] });
    } else {
      clip('idle', 3.0, { torso: t => [s(t) * 0.02, s(t) * 0.08, 0], head: t => [0, s(t, 1) * 0.2, 0], armL: t => [s(t) * 0.12, 0, 0.18], armR: t => [-s(t) * 0.12, 0, -0.18], '$pos:hip': t => [0, s(t) * 0.01, 0] });
      clip('talk', 1.2, { head: t => [s(t * 2) * 0.06, s(t) * 0.14, 0], armL: t => [s(t * 2) * 0.4, 0, 0.2], armR: t => [-s(t * 2) * 0.4, 0, -0.2], torso: t => [0, s(t) * 0.1, 0] }); clip('wave', 1.6, { armR: t => [0, 0, -2.4], foreR: t => [-0.2 + s(t * 3) * 0.6, 0, 0] });
    }
    return { root: R, nodes: N, sockets: sock, clips: clips, height: H, kind: kind, wheeled: wheeled, blink: function (t) { if (N.bulbs) N.bulbs.forEach(function (b, i) { b.material.emissiveIntensity = 0.3 + 1.4 * (0.5 + 0.5 * Math.sin(t * 5 + i)); }); } };
  }
  var DEF = {
    scrap: { body: 0xd9772a, head: 0x4a5566, eye: 0xffc933, accent: 0xd4504a }, lanky: { body: 0xd8cfb8, head: 0xe0d6bd, eye: 0xffd35a, accent: 0x7a8794 },
    unicycle: { body: 0xf08a1c, head: 0xf08a1c, eye: 0x33d6ff, accent: 0xd4302a }, analyst: { body: 0xece8de, head: 0xf1eee6, eye: 0xff3a30, accent: 0xc9a24a }, casino: { body: 0x6a3b1a, head: 0x6a3b1a, eye: 0xff3fa4, accent: 0xe8b43c }
  };
  /* ── setBody: Forge operative → glow-bot visuals (fix/world-gaps 2026-11-11) ──
   * setBody(THREE, agentId, operative) — operative = { slots:{body,headwear,outfit,aura,handheld,hair,eyes,background,accent}, buildHash, archetype } (backend/forge/forge-core.js).
   * Slot map (finalize plan §7): body → base kind/mesh, outfit → torso colour, aura → glow colour (point light on the bot; bloom colour stays the caller's composer setting), eyes → eye emissive, accent → accent colour, handheld → mesh in the right-hand socket, headwear → mesh on the head socket, hair → hair-cap colour, background → returned as `backdrop` data (office / Realm spawn backdrop — the caller applies it, this file owns no scene).
   * Unknown/missing slot values fall back to the kind default and never throw; an operative with no slots renders the plain procedural glow bot with forged:false. */
  var BODY_KIND = { humanoid: 'scrap', android: 'analyst', cyborg: 'unicycle', 'sylvan-form': 'lanky' };
  var AURA_COLOUR = { neon: 0x33d6ff, flames: 0xff6a3a, 'sprouting-vines': 0x39d353, 'cosmic-nebula': 0x9b59ff };
  var EYE_COLOUR = { glowing: 0xffe066, scanner: 0x33d6ff, 'third-eye': 0x9b59ff };
  var OUTFIT_BODY = { hoodie: 0x2a2f36, 'plate-armor': 0x8a929b, 'leaf-woven-mantle': 0x3f7a4a, 'tech-kimono': 0x4a3a6a };
  var ACCENT_COLOUR = { azure: 0x33aaff, magenta: 0xff3fa4, green: 0x39d353, gold: 0xe8b43c };
  var HAIR_COLOUR = { natural: 0x2a2018, silver: 0xd8d8d8, green: 0x39d353, violet: 0x9b59ff };
  function setBody(THREE, agentId, operative) {
    var slots = (operative && operative.slots) || null;
    if (!slots) { var plain = build(THREE, 'scrap'); plain.forged = false; plain.agentId = agentId || null; plain.operative = operative || null; return plain; }
    var kind = BODY_KIND[slots.body] || 'scrap';
    var def = DEF[kind] || DEF.scrap;
    var style = {
      body: OUTFIT_BODY[slots.outfit] != null ? OUTFIT_BODY[slots.outfit] : def.body,
      head: def.head,
      eye: EYE_COLOUR[slots.eyes] != null ? EYE_COLOUR[slots.eyes] : def.eye,
      accent: ACCENT_COLOUR[slots.accent] != null ? ACCENT_COLOUR[slots.accent] : def.accent
    };
    var out = build(THREE, kind, style);
    out.forged = true; out.agentId = agentId || null; out.operative = operative;
    out.buildHash = operative.buildHash || null; out.archetype = operative.archetype || null;
    out.aura = slots.aura || null; out.backdrop = slots.background || null;
    var auraC = AURA_COLOUR[slots.aura];
    if (auraC != null) { var li = new THREE.PointLight(auraC, 0.6, 2.5); li.position.set(0, 1.2, 0); out.root.add(li); out.auraLight = li; }
    var hand = out.sockets && out.sockets.handR;
    if (hand) {
      var hm = null, acc = style.accent;
      if (slots.handheld === 'cyber-katana') { hm = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.7, 0.08), new THREE.MeshStandardMaterial({ color: 0x8a929b, metalness: 0.85, roughness: 0.3, emissive: acc, emissiveIntensity: 0.7 })); hm.position.set(0, -0.35, 0); }
      else if (slots.handheld === 'mage-staff') { hm = new THREE.Group(); var st = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.9, 8), new THREE.MeshStandardMaterial({ color: 0x6a4a2a, roughness: 0.8 })); st.position.y = -0.3; var orb = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 8), new THREE.MeshStandardMaterial({ color: 0x111111, emissive: auraC != null ? auraC : acc, emissiveIntensity: 1.6 })); orb.position.y = 0.18; hm.add(st); hm.add(orb); }
      else if (slots.handheld === 'wooden-scythe') { hm = new THREE.Group(); var hf = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.8, 8), new THREE.MeshStandardMaterial({ color: 0x6a4a2a, roughness: 0.8 })); hf.position.y = -0.25; var bl = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.04, 0.02), new THREE.MeshStandardMaterial({ color: 0x8a929b, metalness: 0.8, roughness: 0.35 })); bl.position.set(0.14, 0.16, 0); bl.rotation.z = 0.5; hm.add(hf); hm.add(bl); }
      else if (slots.handheld === 'coffee-cup') { hm = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.04, 0.1, 12), new THREE.MeshStandardMaterial({ color: 0xf1ece4, roughness: 0.6 })); hm.position.set(0, -0.12, 0); }
      if (hm) { hand.add(hm); out.handheldMesh = hm; }
    }
    var hd = out.sockets && out.sockets.head;
    if (hd) {
      if (slots.headwear === 'neural-crown') { var cr = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.02, 8, 24), new THREE.MeshStandardMaterial({ color: 0xc9a24a, metalness: 0.9, roughness: 0.3, emissive: style.accent, emissiveIntensity: 0.5 })); cr.position.y = 0.32; cr.rotation.x = Math.PI / 2; hd.add(cr); out.headwearMesh = cr; }
      else if (slots.headwear === 'mage-hood') { var ho = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.42, 12, 1, true), new THREE.MeshStandardMaterial({ color: 0x2a2f36, roughness: 0.9, side: THREE.DoubleSide })); ho.position.y = 0.3; hd.add(ho); out.headwearMesh = ho; }
      else if (slots.headwear === 'antlers') { var an = new THREE.Group(); [-1, 1].forEach(function (s) { var br = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.025, 0.3, 6), new THREE.MeshStandardMaterial({ color: 0x6a4a2a, roughness: 0.85 })); br.position.set(0.14 * s, 0.42, 0); br.rotation.z = -0.5 * s; an.add(br); }); hd.add(an); out.headwearMesh = an; }
      else if (slots.headwear === 'oni-mask') { var om = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.22, 0.06), new THREE.MeshStandardMaterial({ color: 0xc9403a, roughness: 0.6, emissive: 0x7a1010, emissiveIntensity: 0.4 })); om.position.set(0, 0.18, 0.2); hd.add(om); out.headwearMesh = om; }
      var hairC = HAIR_COLOUR[slots.hair];
      if (hairC != null) { var hr = new THREE.Mesh(new THREE.SphereGeometry(0.2, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), new THREE.MeshStandardMaterial({ color: hairC, roughness: 0.85 })); hr.position.y = 0.3; hr.scale.set(1, 0.8, 1); hd.add(hr); out.hairMesh = hr; }
    }
    return out;
  }
  root.WorldBotBodies = { build: build, setBody: setBody, KINDS: Object.keys(DEF), DEFAULTS: DEF };
})(typeof window !== 'undefined' ? window : globalThis);
