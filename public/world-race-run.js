/* world-race-run.js — the RACE RUNTIME (agentic arcade-racing layer on the Hoverskate rules): item crates you drive through, turbo pads, power-ups and attacks, AI riders,
 * lap/place/item/hp HUD, countdown, results + Sparks prizes. It drives world-race.js (rules) and the host hoverboard (world-hoverboard.js setModifier).
 *
 *   var run = WorldRaceRun.create({ THREE?, scene?, park, hover, sparks?, onEvent?, U? })
 *   run.start(circuitId, { ranked, ais: 0..7, rubber?, level?: 'rookie'|'pro'|'elite' }) · run.update(dt, pose?) each frame (pose optional: read from hover.state())
 *   run.useItem() (key R)  · run.stop() · run.state()  · run.hud (DOM) · run.playerId
 *   Items: Boost (turbo 1.6 s) · Laser Bolt (22 dmg, homing-lite, travels) · EMP Pulse (cone knock-back stun) · Static Veil (blind + FOV mess) · Aegis Field (eats a hit)
 *          Data Siphon (steal a rival's item within 12 m) · Jam Signal (steer noise 2 s) · Gravity Snare (1.2 s stall) · Triple Laser · Orbital Lance (first place; Prime only).
 *   Turbo pads on the track: 1.0 s x1.35. Crates respawn after 8 s. Pocket vials (Pad Rush, Foil Sip) are OFF in ranked heats (run.canUsePocket).
 *   Bots: follow the loop, use items after a readable delay, cannot fire Orbital Lance unless Prime; rubber-band +-8% only when opts.rubber (12+ fields).
 */
(function (root) {
  'use strict';
  var U0 = 7 / 1.8;
  /* AI difficulty (owner 2026-10-02, reference: 50/100/150cc classes + rubber-band strength per level): rookie slower but catches up harder, elite faster with a light leash */
  var LEVELS = { rookie: { mul: 0.88, rubber: 0.12 }, pro: { mul: 1.0, rubber: 0.08 }, elite: { mul: 1.1, rubber: 0.05 } };
  var FX = { OOB_M: 38, WARN_M: 22, OOB_GRACE_S: 2.2, FALL_M: 30, RESET_PENALTY_S: 3, RESET_COOLDOWN_S: 4, WRONG_WAY_S: 1.6, PICK_M: 3.5, PAD_M: 4.5, GATE_M: 8, SHELL_MS: 34, SHELL_RANGE_M: 60, WAVE_M: 16, YANK_M: 12, CRATE_RESPAWN_S: 8, AI_BASE_MS: 12.5, AI_ITEM_DELAY_S: [1.2, 3.5], PRIZE: [60, 35, 20], PRIZE_RANKED_MUL: 2, PAD_BOOST: { mul: 1.35, dur: 1.0 }, ITEM_BOOST: { mul: 1.6, dur: 1.6 } };
  function create(o) {
    var park = o.park, hover = o.hover, U = o.U || U0, scene = o.scene, THREE = o.THREE, emit = o.onEvent || function () { }, WR = root.WorldRace, R = null, st = null;
    var api = { playerId: 'you', hud: null, setVehicle: function (v) { hover = v || o.hover; } };   // setVehicle(adapter): any ride exposing setModifier/state/isFlying/altitudeM (hoverboard or a hover car via world-mount-ride raceAdapter)
    function tr(k) { var HC = root.WorldHoverCars, kk = HC && HC.KARTS && api.shipId ? HC.KARTS[api.shipId] : null; return (kk && kk.trait && kk.trait[k]) || 1; }   // ship traits (world-hovercars KARTS[].trait)
    function ev(type, data) {
      data = data || {}; data.type = type;
      if (st && st.P) {   // player boost timer for the HUD boost bar (own boosts only)
        if (type === 'boost' && data.id === api.playerId) st.P.boostT = FX.ITEM_BOOST.dur; else if (type === 'driftboost') st.P.boostT = data.dur || 1; else if (type === 'pad') st.P.boostT = FX.PAD_BOOST.dur;
      }
      try { emit(data); } catch (e) { }
    }

    /* ── loop geometry (world units): posAt(u) with u in [0,1). Park cups use the park loop; city circuits use WorldRace.TRACKS (set per start) ── */
    var loop = [], cum = [0], LEN = 1;
    function setLoop(pts) { loop = pts; cum = [0]; for (var i = 0; i < loop.length; i++) { var a = loop[i], b = loop[(i + 1) % loop.length]; cum.push(cum[i] + Math.hypot(b.x - a.x, b.z - a.z)); } LEN = cum[cum.length - 1] || 1; }
    setLoop(park.loopWorld());
    function posAt(u) { var d = ((u % 1) + 1) % 1 * LEN, k = 0; while (k < loop.length - 1 && cum[k + 1] < d) k++; var a = loop[k], b = loop[(k + 1) % loop.length], f = (d - cum[k]) / Math.max(1e-6, cum[k + 1] - cum[k]); return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, z: a.z + (b.z - a.z) * f, yaw: Math.atan2(b.x - a.x, b.z - a.z) }; }
    function uOf(x, z) { var best = 0, bd = 1e18, S = 480; for (var s = 0; s < S; s++) { var p = posAt(s / S), d = (p.x - x) * (p.x - x) + (p.z - z) * (p.z - z); if (d < bd) { bd = d; best = s / S; } } return best; }

    function start(cid, opts) {
      opts = opts || {}; var C = WR.CIRCUITS[cid]; if (!C) return null; stop();
      var nAI = Math.max(0, Math.min(7, opts.ais == null ? 5 : opts.ais))   /* 0 = TIME TRIAL (solo) */, ridersDef = [{ id: api.playerId, name: 'You', deck: 'park' }], names = ['ORION', 'LIRA', 'KAI', 'NOVA', 'ASH', 'RIVET', 'VEGA'];
      for (var i = 0; i < nAI; i++) ridersDef.push({ id: 'ai' + i, name: names[i], deck: i % 3 === 0 ? 'race' : (i % 3 === 1 ? 'street' : 'park') });
      R = WR.create(C, { ranked: !!opts.ranked, riders: ridersDef, rng: opts.rng });
      var tw = WR.trackWorld ? WR.trackWorld(cid, U) : null, gates, crates, pads;
      if (tw && o.heightAt) tw.forEach(function (p) { p.y = o.heightAt(p.x, p.z); });
      if (tw) {   // city-scale circuit: gates every 1/N along the ring, 24 crates (alternating lanes), 16 turbo pads, glowing ribbon
        setLoop(tw); var NG = C.gates.length; gates = C.gates.map(function (g, i) { var q = posAt(i / NG); return { x: q.x, y: q.y, z: q.z, kind: g.kind, verb: g.verb || null, idx: i }; });
        crates = []; for (var ck = 0; ck < 24; ck++) { var qc = posAt((ck + 0.5) / 24), off = (ck % 2 ? 1 : -1) * 3 * U; crates.push({ x: qc.x + Math.cos(qc.yaw) * off, y: qc.y, z: qc.z - Math.sin(qc.yaw) * off, on: true, t: 0, u: (ck + 0.5) / 24, i: ck, track: true }); }
        pads = []; for (var pk = 0; pk < 16; pk++) { var qp = posAt((pk + 0.25) / 16); pads.push({ x: qp.x, y: qp.y, z: qp.z, yaw: qp.yaw }); }
      } else { setLoop(park.loopWorld()); gates = park.gates(cid); crates = park.cratesWorld().map(function (c, i) { return { x: c.x, y: c.y, z: c.z, on: true, t: 0, u: uOf(c.x, c.z), i: i }; }); pads = park.padsWorld(); }
      var LV = LEVELS[opts.level] || LEVELS.pro; var ais = ridersDef.slice(1).map(function (r, i) { var lane = ((i % 4) - 1.5) * 2.2 * U; return { id: r.id, u: 0.985 - i * 0.004, tot: -(0.015 + i * 0.004), lane: lane, speedMul: LV.mul, stun: 0, noise: 0, ink: 0, gateU: 0, itemT: 0, spawned: true, x: 0, y: 0, z: 0, yaw: 0, mesh: null }; });
      st = { cid: cid, C: C, gates: gates, crates: crates, pads: pads, ais: ais, phase: 'count', count: 3.4, t: 0, P: { gate: 0, cool: 0, inkT: 0, lastCheckpoint: 0, done: false, oobT: 0, wrongT: 0, resetCd: 0, lat: 0, warnCd: 0, drift: { active: false, dir: 0, charge: 0, level: 0 }, slipT: 0, slipOn: false, lx: null, lz: null, lyaw: null, speed: 0, yawRate: 0, lapSeen: 0, lapStart: 0, lapTimes: [], early: false, rocket: false }, result: null, ranked: !!opts.ranked, rubber: opts.rubber != null ? !!opts.rubber : !!opts.level, rubberK: (LEVELS[opts.level] || LEVELS.pro).rubber, level: LEVELS[opts.level] ? opts.level : 'pro', shells: [], prime: !!C.prime, padCool: 0 };
      ais.forEach(function (a) { var p = posAt(a.u); place(a, p); a.mesh = mkMesh(a); });
      if (tw && THREE && scene && WR.ribbon) { var rp = tw.map(function (p) { return { x: p.x, y: p.y + 0.3 * U, z: p.z }; }); st.ribMesh = WR.ribbon(THREE, rp, 9 * U, true); scene.add(st.ribMesh); }
      buildHud(); ev('start', { circuit: cid, ranked: !!opts.ranked, scale: C.scale || 'park', lengthM: C.lengthM || null }); return api;
    }
    function place(a, p) { var sy = Math.sin(p.yaw), cy = Math.cos(p.yaw); a.x = p.x + cy * a.lane; a.z = p.z - sy * a.lane; a.y = p.y; a.yaw = p.yaw; }
    function mkMesh(a) { if (!THREE || !scene) return null; if (o.aiMesh) { var cm = null; try { cm = o.aiMesh(a); } catch (e) { } if (cm) { scene.add(cm); return cm; } } var m = new THREE.Mesh(new THREE.BoxGeometry(0.7 * U, 0.16 * U, 1.7 * U), new THREE.MeshStandardMaterial({ color: 0x0B1020, emissive: [0x00D4FF, 0xD4AF37, 0xff4aa8, 0x9d6bff][a.id.charCodeAt(2) % 4], emissiveIntensity: 1.4, metalness: 0.6, roughness: 0.3 })); scene.add(m); return m; }
    function stop() { if (st) { if (st.ribMesh && scene) scene.remove(st.ribMesh); st.ais.forEach(function (a) { if (a.mesh && scene) scene.remove(a.mesh); }); st.shells.forEach(function (s) { if (s.mesh && scene) scene.remove(s.mesh); }); } st = null; R = null; if (api.hud && api.hud.parentNode) api.hud.parentNode.removeChild(api.hud); api.hud = null; if (api.hud2 && api.hud2.parentNode) api.hud2.parentNode.removeChild(api.hud2); api.hud2 = null; if (hover && hover.setModifier) hover.setModifier({ mul: 1, dur: 0, stun: 0, noise: 0 }); }

    /* ── HUD (Navi cyan/gold) ── */
    function buildHud() {
      if (typeof document === 'undefined') return; var h = document.createElement('div'); h.id = 'raceHud'; h.style.cssText = 'position:fixed;left:50%;bottom:64px;transform:translateX(-50%);z-index:7500;pointer-events:none;font:700 15px Rajdhani,Segoe UI,sans-serif;color:#E8F6FF;display:flex;gap:14px;align-items:center;padding:8px 16px;background:rgba(5,10,24,.78);border:1px solid #2bff88;clip-path:polygon(10px 0,100% 0,calc(100% - 10px) 100%,0 100%)';
      h.innerHTML = '<span id="rhLap"></span><span id="rhPlace" style="color:#D4AF37;font-size:22px"></span><span id="rhItem" style="min-width:110px"></span><span style="display:inline-block;width:110px;height:8px;border:1px solid #2bff88"><i id="rhHp" style="display:block;height:100%;width:100%;background:#2bff88"></i></span><span id="rhTime"></span>';
      var big = document.createElement('div'); big.id = 'rhBig'; big.style.cssText = 'position:fixed;left:50%;top:32%;transform:translate(-50%,-50%);z-index:7600;pointer-events:none;font:900 120px Georgia,serif;color:#D4AF37;text-shadow:0 0 30px #2bff88';
      var ink = document.createElement('div'); ink.id = 'rhInk'; ink.style.cssText = 'position:fixed;inset:0;z-index:7450;pointer-events:none;opacity:0;transition:opacity .2s;background:radial-gradient(circle at 30% 40%,#000 0 14%,transparent 15%),radial-gradient(circle at 70% 55%,#000 0 18%,transparent 19%),radial-gradient(circle at 50% 30%,#000 0 12%,transparent 13%)';
      h.appendChild(big); h.appendChild(ink); document.body.appendChild(h); api.hud = h;
      buildHud2();
    }
    // HUD 2 (2026-10-11): km/h, segmented boost bar, rotating minimap. DOM + one 2D canvas, no WebGL. `?racehud=0` hides it.
    function buildHud2() {
      if (/[?&]racehud=0\b/.test(location.search)) return;
      var w = document.createElement('div'); w.id = 'raceHud2'; w.style.cssText = 'position:fixed;inset:0;z-index:7490;pointer-events:none;font-family:Rajdhani,"Segoe UI",sans-serif;color:#E8F6FF';
      var segs = ''; for (var i = 0; i < 12; i++) segs += '<i style="display:inline-block;width:14px;height:8px;margin-right:3px;background:#1a2a3a;transform:skewX(-20deg)"></i>';
      w.innerHTML = '<canvas id="rh2Map" width="240" height="240" style="position:absolute;left:18px;bottom:18px;width:120px;height:120px;border-radius:50%;background:rgba(5,10,24,.62);border:1px solid #2bff88"></canvas>'
        + '<div style="position:absolute;right:26px;bottom:20px;text-align:right"><div><span id="rh2Speed" style="font:900 64px Orbitron,Rajdhani,sans-serif;letter-spacing:.02em;text-shadow:0 0 14px rgba(43,255,136,.55)">0</span><span style="font:700 14px Rajdhani;opacity:.7;margin-left:6px">KM/H</span></div>'
        + '<div id="rh2Boost" style="margin-top:4px">' + segs + '</div><div id="rh2Lbl" style="font:800 12px Rajdhani;letter-spacing:.3em;color:#39ff8a;height:14px"></div></div>'
        + '<div id="rh2Item" style="position:absolute;left:50%;bottom:132px;transform:translateX(-50%);min-width:260px;text-align:center;padding:10px 22px;font:900 24px Orbitron,Rajdhani,sans-serif;letter-spacing:.08em;color:#E8F6FF;background:rgba(5,10,24,.78);border:2px solid #2bff88;clip-path:polygon(14px 0,100% 0,calc(100% - 14px) 100%,0 100%);opacity:0;transition:opacity .15s,transform .12s"></div>';
      document.body.appendChild(w); api.hud2 = w;
      var pts = (WR.trackWorld ? WR.trackWorld(st.cid, U) : null) || (park && park.loopWorld ? park.loopWorld() : []) || [], mx = 1;
      st.map = { pts: pts.map(function (p) { return [p.x, p.z]; }), r: 120, t: 0 };
      pts.forEach(function (p) { mx = Math.max(mx, Math.abs(p.x), Math.abs(p.z)); });
      var cx = 0, cz = 0; if (pts.length) { var x0 = 1e18, x1 = -1e18, z0 = 1e18, z1 = -1e18; pts.forEach(function (p) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z); }); st.map.r = Math.min(450, Math.max(100, Math.max(x1 - x0, z1 - z0) / U * 0.55)); }
    }
    function hud2Update(dt) {
      if (!api.hud2 || !st || !st.map) return; var P = st.P, kmh = Math.round((P.speed || 0) * 3.6);
      var sp = api.hud2.querySelector('#rh2Speed'); sp.textContent = kmh;
      var boosting = (P.boostT || 0) > 0, frac = boosting ? Math.min(1, P.boostT / 1.8) : (P.drift && P.drift.active ? Math.min(1, P.drift.charge / 2.8) : 0), on = Math.round(frac * 12), segs = api.hud2.querySelector('#rh2Boost').children;
      for (var i = 0; i < 12; i++) segs[i].style.background = i < on ? (boosting ? '#39ff8a' : '#2bff88') : '#1a2a3a';
      api.hud2.querySelector('#rh2Lbl').textContent = boosting ? 'BOOST' : (P.drift && P.drift.active ? 'DRIFT' : '');
      var me2 = R && R.rider(api.playerId), card = api.hud2.querySelector('#rh2Item');   // PRIZE BOX card: a roulette cycles for ~1.1 s, then the item locks in until you use it (R)
      if (P.rouletteT > 0) { var ks = Object.keys(ICON); card.textContent = ICON[ks[Math.floor(performance.now() / 85) % ks.length]]; card.style.opacity = '1'; card.style.borderColor = '#E8C45C'; card.style.transform = 'translateX(-50%) scale(1.08)'; }
      else if (me2 && me2.item) { card.textContent = ICON[me2.item] + '   [R]'; card.style.opacity = '1'; card.style.borderColor = '#2bff88'; card.style.transform = 'translateX(-50%) scale(1)'; }
      else card.style.opacity = '0';
      st.map.t -= dt; if (st.map.t > 0) return; st.map.t = 1 / 20;   // minimap at 20 Hz
      var cv = api.hud2.querySelector('#rh2Map'), c = cv.getContext('2d'), pose = st.lastPose || { x: 0, z: 0, yaw: 0 }, R = st.map.r * U, k = 120 / R;   // canvas px per world unit (240 px canvas, radius 120)
      c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, 240, 240); c.save(); c.beginPath(); c.arc(120, 120, 118, 0, Math.PI * 2); c.clip();
      var yaw = pose.yaw || 0, a = -Math.PI / 2 - Math.atan2(Math.cos(yaw), Math.sin(yaw));
      c.translate(120, 120); c.rotate(a); c.translate(-pose.x * k, -pose.z * k);
      c.strokeStyle = '#2bff88'; c.globalAlpha = 0.85; c.lineWidth = 4 / k * 0.5; c.beginPath();
      var pp = st.map.pts; for (var j = 0; j <= pp.length; j++) { var q = pp[j % pp.length]; if (!q) break; if (j) c.lineTo(q[0] * 1, q[1] * 1); else c.moveTo(q[0], q[1]); } c.lineWidth = 3 / k; c.stroke(); c.globalAlpha = 1;
      c.fillStyle = '#ff7a1a'; st.ais.forEach(function (ai) { c.beginPath(); c.arc(ai.x, ai.z, 4 / k, 0, Math.PI * 2); c.fill(); });
      c.restore();
      c.fillStyle = '#ffffff'; c.beginPath(); c.moveTo(120, 106); c.lineTo(129, 128); c.lineTo(120, 123); c.lineTo(111, 128); c.closePath(); c.fill();   // player, always facing up
    }
    var ICON = { seeker: '➤ LOCK-ON DRONE', boost: '▲ OVERCLOCK', shell: '▬ LASER BOLT', wave: '◗ EMP PULSE', ink: '◍ STATIC VEIL', ward: '◈ AEGIS FIELD', yank: '⬍ DATA SIPHON', sway: '≈ JAM SIGNAL', pinch: '✦ GRAVITY SNARE', triple: '▬▬▬ TRIPLE LASER', blue: '◆ ORBITAL LANCE', mine: '✸ MAG MINE', phase: '◌ PHASE SHIFT', chrono: '⌛ CHRONO FIELD', warp: '⇢ WARP JUMP' };
    function hudUpdate() {
      if (api.hud2 && st && st.lastPose) hud2Update(1 / 60);
      if (!api.hud || !R) return; var me = R.rider(api.playerId), s = R.standings(), mine = s.filter(function (x) { return x.id === api.playerId; })[0], q = function (id) { return api.hud.querySelector(id); };
      var lt = st.P.lapTimes, fmt = function (x) { var m = Math.floor(x / 60); return m + ':' + ('0' + (x - m * 60).toFixed(1)).slice(-4); }; q('#rhLap').textContent = 'LAP ' + Math.min(R.circuit.laps, me.lap + 1) + '/' + R.circuit.laps + (lt.length ? '  last ' + fmt(lt[lt.length - 1]) + '  best ' + fmt(Math.min.apply(null, lt)) : '') + (st.P.drift.active ? '  DRIFT ' + ['', 'BLUE', 'ORANGE', 'PURPLE'][st.P.drift.level] : '') + (st.P.slipOn ? '  DRAFT' : ''); q('#rhPlace').textContent = 'P' + (mine ? mine.place : '-') + '/' + s.length; q('#rhItem').textContent = me.item ? ICON[me.item] : (me.ward ? '◈ WARD ON' : '— no item —');
      q('#rhHp').style.width = me.hp + '%'; q('#rhTime').textContent = fmt(st.phase === 'race' ? st.t : 0); var big = q('#rhBig'); big.textContent = st.phase === 'count' ? (st.count > 0.4 ? String(Math.ceil(st.count - 0.4)) : 'GO!') : ''; q('#rhInk').style.opacity = st.P.inkT > 0 ? '0.92' : '0';
    }

    /* ── helpers ── */
    function itemsTick(dt, pose) {
      var P = st.P; if (P.rouletteT > 0) P.rouletteT -= dt;
      if (st.phaseT) Object.keys(st.phaseT).forEach(function (k) { if (st.phaseT[k] > 0) st.phaseT[k] -= dt; });
      if (!st.mines) return;
      for (var i = st.mines.length - 1; i >= 0; i--) {
        var m = st.mines[i], hit = null; m.life -= dt; m.arm -= dt;
        if (m.arm <= 0) { var ids = [{ id: api.playerId, p: pose }].concat(st.ais.map(function (a) { return { id: a.id, p: { x: a.x, z: a.z } }; }));
          for (var k = 0; k < ids.length && !hit; k++) { var rr = R.rider(ids[k].id); if (rr && !rr.finished && !rr.dnf && ids[k].p && Math.hypot(ids[k].p.x - m.x, ids[k].p.z - m.z) < 4.5 * U) hit = ids[k].id; } }
        if (m.mesh) { m.mesh.rotation.y += dt * 2; m.mesh.position.y = m.y + U + Math.sin(st.t * 4 + i) * 0.15 * U; }
        if (hit || m.life <= 0) { if (m.mesh && scene) scene.remove(m.mesh); st.mines.splice(i, 1); if (hit) { hitRider(hit, 14, 1.1, 'mine'); ev('mine', { id: hit, from: m.owner }); } }
      }
    }
    function riderPos(id, pose) { if (id === api.playerId) return pose; var a = st.ais.filter(function (x) { return x.id === id; })[0]; return a ? { x: a.x, z: a.z, yaw: a.yaw } : null; }
    function dist(a, b) { return Math.hypot(a.x - b.x, a.z - b.z); }
    function firstPlaceId(exceptId) { var s = R.standings().filter(function (x) { return x.id !== exceptId && !x.dnf; }); return s.length ? s[0].id : null; }
    function nearestAhead(srcId, pose, maxM) {
      var me = riderPos(srcId, pose), best = null, bd = maxM * U, fx = Math.sin(me.yaw), fz = Math.cos(me.yaw);
      R.standings().forEach(function (r) { if (r.id === srcId || r.dnf) return; var p = riderPos(r.id, pose); if (!p) return; var d = dist(me, p), dot = ((p.x - me.x) * fx + (p.z - me.z) * fz) / (d || 1); if (d < bd && dot > 0.2) { bd = d; best = r.id; } }); return best;
    }
    function hitRider(targetId, dmg, stunS, why) {
      if (st.phaseT && st.phaseT[targetId] > 0) { ev('hit', { id: targetId, dmg: 0, why: why || '', blocked: true, respawned: false }); return { blocked: true }; }   // Phase Shift: untouchable
      var isMe0 = targetId === api.playerId; if (isMe0 && root.WorldSkyDock && root.WorldSkyDock.mult) dmg = Math.max(1, Math.round(dmg * 100 / (100 + root.WorldSkyDock.mult().hull)));   // hull plating upgrade
      var res = R.hit(targetId, dmg), isMe = targetId === api.playerId; if (!res) return res;
      if (isMe) { if (!res.blocked) { if (stunS && hover && hover.setModifier) hover.setModifier({ stun: stunS }); } } else { var a = st.ais.filter(function (x) { return x.id === targetId; })[0]; if (a && !res.blocked && stunS) a.stun = Math.max(a.stun, stunS); }
      if (res.respawned) { if (isMe) { var g = st.gates[Math.max(0, R.rider(targetId).gate - 1)] || st.gates[0]; ev('respawn', { id: targetId, x: g.x, z: g.z, y: g.y }); if (hover && hover.setModifier) hover.setModifier({ stun: 1.4 }); } else { var a2 = st.ais.filter(function (x) { return x.id === targetId; })[0]; if (a2) a2.stun = 1.4; } }
      ev('hit', { id: targetId, dmg: dmg, why: why || '', blocked: !!res.blocked, respawned: !!res.respawned }); return res;
    }
    function spawnShell(srcId, targetId, dmg, kind) { var sp = riderPos(srcId, st.lastPose); if (!sp || !targetId) return; var seek = kind === 'seeker', sh = { from: srcId, to: targetId, x: sp.x, z: sp.z, y: (sp.y || 0) + 1.2 * U, dmg: dmg, life: seek ? 9 : 4, kind: kind || 'shell', mesh: null }; if (THREE && scene) { sh.mesh = seek ? new THREE.Mesh(new THREE.OctahedronGeometry(0.55 * U, 0), new THREE.MeshBasicMaterial({ color: 0xff3a3a })) : new THREE.Mesh(new THREE.BoxGeometry(0.16 * U, 0.16 * U, 2.4 * U), new THREE.MeshBasicMaterial({ color: 0x39ffcf, toneMapped: false })); sh.mesh.rotation.order = 'YXZ'; scene.add(sh.mesh);   /* laser bolt = long emissive streak that points where it flies; drone = red octahedron */ } st.shells.push(sh); ev(seek ? 'seeker' : 'shell', { from: srcId, to: targetId }); if (seek && targetId === api.playerId) ev('warn', { kind: 'incoming' }); }
    function useFor(id, pose) {
      var r = R.rider(id); if (!r || !r.item || r.freeze > 0) return null; var item = r.item, me = riderPos(id, pose);
      if (item === 'ward' || item === 'boost') { var out = R.useItem(id); if (item === 'boost') { if (id === api.playerId) { if (hover && hover.setModifier) hover.setModifier({ mul: FX.ITEM_BOOST.mul * (1 + ((root.ShdInv && root.ShdInv.perk('boostBonus')) || 0)), dur: FX.ITEM_BOOST.dur * tr('boostDur') }); } else { var a = st.ais.filter(function (x) { return x.id === id; })[0]; if (a) a.boostT = FX.ITEM_BOOST.dur; } r.boosting = false; ev('boost', { id: id }); } else ev('ward', { id: id }); return out; }
      r.item = null;
      if (item === 'shell') { var t1 = nearestAhead(id, pose, FX.SHELL_RANGE_M); if (t1) spawnShell(id, t1, 22); else ev('fizzle', { id: id }); }
      else if (item === 'triple') { var t2 = nearestAhead(id, pose, FX.SHELL_RANGE_M); if (t2) { [0, 0.25, 0.5].forEach(function (d, k) { setTimeout(function () { if (R && st) spawnShell(id, t2, 22); }, d * 1000); }); } else ev('fizzle', { id: id }); }
      else if (item === 'seeker') { var f2 = firstPlaceId(id); if (f2) spawnShell(id, f2, 30, 'seeker'); else ev('fizzle', { id: id }); }
      else if (item === 'blue') { var f = firstPlaceId(id); if (f) spawnShell(id, f, 30); }
      else if (item === 'wave') { R.standings().forEach(function (s) { if (s.id === id) return; var p = riderPos(s.id, pose); if (p && dist(me, p) < FX.WAVE_M * U) hitRider(s.id, 4, 0.6, 'wave'); }); ev('wave', { id: id }); }
      else if (item === 'ink') { var t3 = nearestAhead(id, pose, 60) || firstPlaceId(id); if (t3) { if (t3 === api.playerId) st.P.inkT = 2.5; else { var a3 = st.ais.filter(function (x) { return x.id === t3; })[0]; if (a3) a3.ink = 2.5; } ev('ink', { id: id, to: t3 }); } }
      else if (item === 'yank') { var near = null, bd = FX.YANK_M * U; R.standings().forEach(function (s) { if (s.id === id) return; var p = riderPos(s.id, pose), rr = R.rider(s.id); if (p && rr.item && dist(me, p) < bd) { bd = dist(me, p); near = s.id; } }); if (near) { var stolen = R.rider(near).item; R.rider(near).item = null; r.item = stolen; ev('yank', { id: id, from: near, item: stolen }); } }
      else if (item === 'sway') { var t4 = nearestAhead(id, pose, 50); if (t4) { if (t4 === api.playerId) { if (hover && hover.setModifier) hover.setModifier({ noise: 0.9, noiseDur: 2 }); } else { var a4 = st.ais.filter(function (x) { return x.id === t4; })[0]; if (a4) a4.noise = 2; } ev('sway', { id: id, to: t4 }); } }
      else if (item === 'pinch') { var t5 = nearestAhead(id, pose, 40); if (t5) hitRider(t5, 0, 1.2, 'pinch'); }
      else if (item === 'mine') { var mp = riderPos(id, pose); if (mp) { st.mines = st.mines || []; var mm = { x: mp.x - Math.sin(mp.yaw || 0) * 5 * U, z: mp.z - Math.cos(mp.yaw || 0) * 5 * U, y: mp.y || 0, owner: id, life: 40, arm: 1.2, mesh: null };
          if (THREE && scene) { mm.mesh = new THREE.Mesh(new THREE.OctahedronGeometry(0.9 * U, 0), new THREE.MeshBasicMaterial({ color: 0xff2a55, toneMapped: false })); mm.mesh.position.set(mm.x, mm.y + U, mm.z); scene.add(mm.mesh); }
          st.mines.push(mm); ev('mine-drop', { id: id }); } }
      else if (item === 'phase') { st.phaseT = st.phaseT || {}; st.phaseT[id] = 3; ev('phase', { id: id }); }
      else if (item === 'chrono') {
        R.standings().forEach(function (s2) { if (s2.id === id) return; var p2 = riderPos(s2.id, pose); if (!p2 || dist(me, p2) > 140 * U) return;
          if (s2.id === api.playerId) { if (hover && hover.setModifier) hover.setModifier({ mul: 0.7, dur: 3 }); } else { var ac = st.ais.filter(function (x) { return x.id === s2.id; })[0]; if (ac) ac.slowT = 3.5; } });
        ev('chrono', { id: id }); }
      else if (item === 'warp') {
        var u0 = id === api.playerId ? uOf(pose.x, pose.z) : (st.ais.filter(function (x) { return x.id === id; })[0] || {}).u;
        if (u0 != null) { var du = 110 * U / LEN, g2 = st.gates[R.rider(id).gate]; if (g2) { var dg = (((uOf(g2.x, g2.z) - u0) % 1) + 1) % 1; du = Math.min(du, Math.max(0, dg - 0.004)); }   // never skip the next gate
          var pw = posAt(u0 + du);
          if (id === api.playerId) ev('warp', { id: id, x: pw.x, y: pw.y, z: pw.z, yaw: pw.yaw });
          else { var aw = st.ais.filter(function (x) { return x.id === id; })[0]; if (aw) { aw.u += du; place(aw, posAt(aw.u)); } ev('warp', { id: id }); } } }
      return { item: item };
    }

    /* PERSONAL BESTS (time trial + races): best total time and best lap per circuit, saved in localStorage 'shd_pb_v1' */
    var PBK = 'shd_pb_v1';
    function pbLoad() { try { return JSON.parse((root.localStorage && root.localStorage.getItem(PBK)) || '{}') || {}; } catch (e) { return {}; } }
    function pbSave(cid, timeS, lapS) {
      var all = pbLoad(), b = all[cid] || {}, res = { newTotal: false, newLap: false, prevTotal: b.total == null ? null : b.total, prevLap: b.lap == null ? null : b.lap };
      if (timeS != null && isFinite(timeS) && (b.total == null || timeS < b.total)) { b.total = +timeS.toFixed(2); res.newTotal = true; }
      if (lapS != null && isFinite(lapS) && (b.lap == null || lapS < b.lap)) { b.lap = +lapS.toFixed(2); res.newLap = true; }
      if (res.newTotal || res.newLap) { all[cid] = b; try { root.localStorage.setItem(PBK, JSON.stringify(all)); } catch (e) { } }
      return res;
    }
    api.pb = function (cid) { return pbLoad()[cid] || null; };
    api.input = { drift: false, accel: false };   // host sets these each frame: drift (key X), accel (W) for the rocket start
    api.setInput = function (i) { api.input.drift = !!(i && i.drift); api.input.accel = !!(i && i.accel); };
    api.useItem = function () { if (!st || !R || st.phase !== 'race') return null; if (st.P.rouletteT > 0) return null; return useFor(api.playerId, st.lastPose); };
    api.canUsePocket = function (v) { return R ? R.canUsePocket(v) : true; };
    function resetPlayer(why, pose) {
      var me = R.rider(api.playerId), c = posAt(uOf(pose.x, pose.z)); st.P.oobT = 0; st.P.wrongT = 0; st.P.resetCd = FX.RESET_COOLDOWN_S;
      me.penaltyS += FX.RESET_PENALTY_S; me.resets = (me.resets || 0) + 1; me.freeze = Math.max(me.freeze || 0, 0.9);
      if (hover && hover.setModifier) hover.setModifier({ stun: 0.9 });
      ev('respawn', { id: api.playerId, x: c.x, y: c.y, z: c.z, yaw: c.yaw, why: why, penaltyS: FX.RESET_PENALTY_S });
    }
    api.manualReset = function () { if (!st || !R || st.phase !== 'race' || st.P.resetCd > 0) return false; var me = R.rider(api.playerId); if (me.finished || me.dnf) return false; resetPlayer('reset', st.lastPose || { x: 0, z: 0 }); return true; };
    api.trackInfo = function () { return st ? { lat: Math.round(st.P.lat), oob: +st.P.oobT.toFixed(1), wrongWay: st.P.wrongT >= FX.WRONG_WAY_S, resetCd: +st.P.resetCd.toFixed(1) } : null; };
    api.crates = function () { return st ? st.crates : []; };   // track crates (city circuits) have no mesh of their own: the host draws them (world-race-prizebox.js) and listens on api.onCrate(i, visible)
    api.state = function () { return st ? { phase: st.phase, t: st.t, standings: R.standings(), result: st.result, item: R.rider(api.playerId).item, hp: R.rider(api.playerId).hp } : null; };
    api.race = function () { return R; }; api._st = function () { return st; };

    /* ── per frame ── */
    api.update = function (dt, pose) {
      if (!st || !R) return; dt = Math.min(dt, 0.1);
      if (!pose && hover && hover.state) { var hs = hover.state(); pose = { x: hs.x, y: hs.y, z: hs.z, yaw: hs.psi, mode: hover.isFlying && hover.isFlying() ? 'foil' : 'pad', altM: hover.altitudeM ? hover.altitudeM() : 0 }; }
      pose = pose || { x: 0, y: 0, z: 0, yaw: 0, mode: 'pad', altM: 0 }; st.lastPose = pose;
      if (st.phase === 'count') {
        st.count -= dt; var Pc = st.P; if (api.input.accel && st.count > 1.5) Pc.early = true;   /* mashing the throttle too early = no rocket start */
        if (api.input.accel && st.count <= 0.7 && !Pc.early) Pc.rocket = true;
        if (st.count <= 0) { st.phase = 'race'; R.start(); ev('go'); if (Pc.rocket && hover && hover.setModifier) { hover.setModifier({ mul: 1.3, dur: 1.2 }); ev('rocket', {}); } else if (Pc.early) ev('warn', { kind: 'earlystart' }); Pc.lapStart = 0; }
        hudUpdate(); return;
      }
      if (st.phase === 'done') { hudUpdate(); return; }
      st.t += dt; R.update(dt); if (st.P.inkT > 0) st.P.inkT -= dt; itemsTick(dt, pose);
      // player gates
      var me = R.rider(api.playerId);
      if (!me.finished && !me.dnf) { var g = st.gates[me.gate]; if (g && Math.hypot(pose.x - g.x, pose.z - g.z) < FX.GATE_M * U) { var res = R.passGate(api.playerId, me.gate, { mode: pose.mode || 'pad', altM: pose.altM || 0, kissed: pose.kissed !== false, trick: pose.trick || null }); if (res.ok) ev('gate', { gate: me.gate, note: res.note }); } }
      // crates + pads (player)
      st.crates.forEach(function (c) { if (!c.on) { c.t -= dt; if (c.t <= 0) { c.on = true; if (!c.track && park.setCrateVisible) park.setCrateVisible(c.i, true); else if (c.track && api.onCrate) api.onCrate(c.i, true); } return; } if (Math.hypot(pose.x - c.x, pose.z - c.z) < FX.PICK_M * U && !me.item) { var it = R.grabCrate(api.playerId, st.prime); if (it) { c.on = false; c.t = FX.CRATE_RESPAWN_S; if (!c.track && park.setCrateVisible) park.setCrateVisible(c.i, false); else if (c.track && api.onCrate) api.onCrate(c.i, false); st.P.rouletteT = 1.15; ev('crate', { id: api.playerId, item: it.id }); } } });
      st.padCool -= dt; if (st.padCool <= 0) st.pads.forEach(function (p) { if (Math.hypot(pose.x - p.x, pose.z - p.z) < FX.PAD_M * U) { st.padCool = 0.6; if (hover && hover.setModifier) hover.setModifier({ mul: FX.PAD_BOOST.mul * (1 + ((root.ShdInv && root.ShdInv.perk('boostBonus')) || 0)), dur: FX.PAD_BOOST.dur * tr('boostDur') }); ev('pad', {}); } });
      /* TRACK KEEPER (owner 2026-10-01, Mario-Kart style): off-course > OOB_M (or falling) for OOB_GRACE_S -> put back on the centre line facing forward (+3 s); wrong way warning; T = manual reset (4 s cooldown). */
      if (!me.finished && !me.dnf && me.freeze <= 0) {
        var ku = uOf(pose.x, pose.z), kc = posAt(ku), lat = Math.hypot(pose.x - kc.x, pose.z - kc.z) / U, P = st.P;
        P.lat = lat; P.resetCd = Math.max(0, P.resetCd - dt); P.warnCd = Math.max(0, P.warnCd - dt);
        var fell = pose.y != null && kc.y != null && pose.y < kc.y - FX.FALL_M * U, off = lat > FX.OOB_M || fell;
        P.oobT = fell ? FX.OOB_GRACE_S : (off ? P.oobT + dt : Math.max(0, P.oobT - dt * 2));   // a fall is an instant respawn, off-course keeps the grace
        if (lat > FX.WARN_M && P.warnCd <= 0 && !off) { P.warnCd = 3; ev('warn', { kind: 'offtrack', lat: Math.round(lat) }); }
        if (off && P.warnCd <= 0) { P.warnCd = 1.2; ev('warn', { kind: 'oob', left: Math.max(0, +(FX.OOB_GRACE_S - P.oobT).toFixed(1)) }); }
        if (P.oobT >= FX.OOB_GRACE_S) resetPlayer('out of bounds', pose);
        else if (pose.yaw != null && (Math.hypot(pose.vx || 0, pose.vz || 0) > 0.5 * U || pose.moving !== false)) {
          var dy = Math.abs(((pose.yaw - kc.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI);   // 0 = same direction as the course, PI = opposite
          P.wrongT = dy > 2.3 && lat < FX.WARN_M ? P.wrongT + dt : Math.max(0, P.wrongT - dt * 2);
          if (P.wrongT >= FX.WRONG_WAY_S && P.warnCd <= 0) { P.warnCd = 3; ev('warn', { kind: 'wrongway' }); }
        }
      }
      /* DRIFT + SLIPSTREAM + LAP SPLITS (owner 2026-10-02: drift + slipstream mechanics, original agentic racing) */
      { var P2 = st.P, spd = 0, yr = 0; if (P2.lx != null) { spd = Math.hypot(pose.x - P2.lx, pose.z - P2.lz) / U / Math.max(dt, 1e-4); var dyw = pose.yaw != null && P2.lyaw != null ? ((pose.yaw - P2.lyaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI : 0; yr = dyw / Math.max(dt, 1e-4); } P2.lx = pose.x; P2.lz = pose.z; P2.lyaw = pose.yaw; P2.speed = spd; P2.yawRate = yr;
        if (!me.finished && !me.dnf && me.freeze <= 0) {
          var dr = WR.driftStep(P2.drift, dt * tr('driftRate'), { drift: api.input.drift, speed: spd, yawRate: yr });
          if (dr.level !== P2.dLevel) { P2.dLevel = dr.level; if (dr.level) ev('drift', { level: dr.level }); }
          if (dr.active && hover && hover.setModifier) hover.setModifier({ turn: yr * P2.drift.dir > 0 ? WR.DRIFT.turnIn : WR.DRIFT.turnOut, turnDur: 0.12 });
          if (dr.released) { if (hover && hover.setModifier) hover.setModifier({ mul: dr.released.mul, dur: dr.released.dur * tr('boostDur') }); ev('driftboost', { level: dr.released.level, mul: dr.released.mul, dur: dr.released.dur }); }
          var others = st.ais.filter(function (a) { var rr = R.rider(a.id); return !rr.finished && !rr.dnf; }).map(function (a) { return { id: a.id, x: a.x, z: a.z, yaw: a.yaw }; });
          var sl = pose.yaw != null ? WR.slipstream({ x: pose.x, z: pose.z, yaw: pose.yaw }, others, U) : null;
          P2.slipT = sl ? P2.slipT + dt : Math.max(0, P2.slipT - dt * WR.SLIP.decayK);
          var on = P2.slipT >= WR.SLIP.afterS; if (on) { if (hover && hover.setModifier) hover.setModifier({ mul: WR.SLIP.mul, dur: 0.2 }); } if (on !== P2.slipOn) { P2.slipOn = on; ev('slipstream', { on: on, behind: sl && sl.id }); }
        }
        if (me.lap > P2.lapSeen) { var lt = +(st.t - P2.lapStart).toFixed(2); P2.lapTimes.push(lt); P2.lapStart = st.t; P2.lapSeen = me.lap; ev('lap', { lap: me.lap, timeS: lt, bestS: Math.min.apply(null, P2.lapTimes) }); } }
      // AIs
      var playerProg = me.lap + uOf(pose.x, pose.z);
      st.ais.forEach(function (a) {
        var r = R.rider(a.id); if (r.finished || r.dnf) return; if (a.stun > 0) { a.stun -= dt; } if (a.ink > 0) a.ink -= dt; if (a.noise > 0) a.noise -= dt; if (a.boostT > 0) a.boostT -= dt; if (a.slowT > 0) a.slowT -= dt;
        var mul = a.speedMul * (a.stun > 0 ? 0.15 : 1) * (a.ink > 0 ? 0.8 : 1) * (a.boostT > 0 ? 1.5 : 1) * (a.noise > 0 ? 0.9 : 1) * (a.slowT > 0 ? 0.68 : 1); if (st.rubber) { var gap = playerProg - (r.lap + a.u); mul *= 1 + Math.max(-1, Math.min(1, gap / 0.5)) * (st.rubberK || 0.08); }
        var deckK = { race: 1.0, park: 1.0, street: 0.97 }[r.deck] || 1, du = (FX.AI_BASE_MS * U * deckK * mul * dt) / LEN, N = st.gates.length; a.tot += du; a.u = ((a.tot % 1) + 1) % 1;
        var guard = 6; while (guard-- > 0 && !r.finished && a.tot >= r.lap + r.gate / N) { var gk = st.gates[r.gate]; R.passGate(a.id, r.gate, { mode: gk.kind === 'foil' ? 'foil' : 'pad', altM: gk.kind === 'foil' ? 6 : 0.2, kissed: true }); }
        var p = posAt(a.u); place(a, p); if (a.mesh) { a.mesh.position.set(a.x, a.y + 0.6 * U, a.z); a.mesh.rotation.y = a.yaw; }
        // crates for AI (by path proximity), items used after a readable delay
        st.crates.forEach(function (c) { if (c.on && !r.item && Math.abs(((a.u - c.u + 1.5) % 1) - 0.5) < 0.006) { var it = R.grabCrate(a.id, false); if (it) { c.on = false; c.t = FX.CRATE_RESPAWN_S; if (!c.track && park.setCrateVisible) park.setCrateVisible(c.i, false); else if (c.track && api.onCrate) api.onCrate(c.i, false); a.itemT = FX.AI_ITEM_DELAY_S[0] + (FX.AI_ITEM_DELAY_S[1] - FX.AI_ITEM_DELAY_S[0]) * Math.random(); } } });
        if (r.item) { a.itemT -= dt; if (a.itemT <= 0) { if (r.item === 'blue' && !st.prime) r.item = null; else useFor(a.id, pose); a.itemT = 0; } }
      });
      // shells travel + hit
      for (var si = st.shells.length - 1; si >= 0; si--) { var sh = st.shells[si], tp = riderPos(sh.to, pose); sh.life -= dt; if (!tp || sh.life <= 0) { if (sh.mesh && scene) scene.remove(sh.mesh); st.shells.splice(si, 1); continue; } var dx = tp.x - sh.x, dz = tp.z - sh.z, dd = Math.hypot(dx, dz), stepM = FX.SHELL_MS * (sh.kind === 'seeker' ? 1.5 : 1) * U * dt; if (dd <= stepM + 1.2 * U) { hitRider(sh.to, sh.dmg, sh.kind === 'seeker' ? 2.0 : 0.7, sh.kind === 'seeker' ? 'seeker' : 'shell'); if (sh.mesh && scene) scene.remove(sh.mesh); st.shells.splice(si, 1); } else { sh.x += dx / dd * stepM; sh.z += dz / dd * stepM; if (sh.mesh) { sh.mesh.position.set(sh.x, sh.y, sh.z); if (sh.kind === 'seeker') { sh.mesh.rotation.y += dt * 6; } else sh.mesh.rotation.y = Math.atan2(dx, dz); } } }
      // finish
      if (R.finished() || (me.finished && !st.result)) { if (R.finished() || me.finished) { st.phase = 'done'; var s2 = R.standings(), mine = s2.filter(function (x) { return x.id === api.playerId; })[0]; var prize = (FX.PRIZE[mine.place - 1] || 0) * (st.ranked ? FX.PRIZE_RANKED_MUL : 1); st.result = { place: mine.place, of: s2.length, timeS: me.finalS != null ? me.finalS : R.score(api.playerId), prize: prize, standings: s2 }; try { st.result.pb = pbSave(st.cid, st.result.timeS, st.P.lapTimes.length ? Math.min.apply(null, st.P.lapTimes) : null); } catch (e) { } if (prize && o.sparks && o.sparks.add) o.sparks.add(prize, 'race-prize', st.cid); ev('finish', st.result); } }
      hudUpdate();
    };
    api.startPose = function (cid) { var tw = WR.trackWorld ? WR.trackWorld(cid, U) : null; if (tw) { if (o.heightAt) tw.forEach(function (p) { p.y = o.heightAt(p.x, p.z); }); setLoop(tw); } else setLoop(park.loopWorld()); var p0 = posAt(0.99); return { x: p0.x, y: p0.y, z: p0.z, yaw: p0.yaw }; };
    api.start = start; api.stop = stop; api.FX = FX; api.posAt = posAt; api.loopLength = LEN;
    return api;
  }
  root.WorldRaceRun = { create: create };
})(typeof window !== 'undefined' ? window : globalThis);
