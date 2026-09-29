/* world-race-run.js — the RACE RUNTIME (Mario-Kart layer on the Hoverskate rules): item crates you drive through, turbo pads, power-ups and attacks, AI riders,
 * lap/place/item/hp HUD, countdown, results + Sparks prizes. It drives world-race.js (rules) and the host hoverboard (world-hoverboard.js setModifier).
 *
 *   var run = WorldRaceRun.create({ THREE?, scene?, park, hover, sparks?, onEvent?, U? })
 *   run.start(circuitId, { ranked, ais: 3..7, rubber? }) · run.update(dt, pose?) each frame (pose optional: read from hover.state())
 *   run.useItem() (key R)  · run.stop() · run.state()  · run.hud (DOM) · run.playerId
 *   Items: Boost (turbo 1.6 s) · Spark Shell (22 dmg, homing-lite, travels) · Wide Wave (cone knock-back stun) · Ink Veil (blind + FOV mess) · Ward Plate (eats a hit)
 *          Magnet Yank (steal a rival's item within 12 m) · Sway Dust (steer noise 2 s) · Dragon Pinch (1.2 s stall) · Triple Shell · Blue Line (first place; Prime only).
 *   Turbo pads on the track: 1.0 s x1.35. Crates respawn after 8 s. Pocket vials (Pad Rush, Foil Sip) are OFF in ranked heats (run.canUsePocket).
 *   Bots: follow the loop, use items after a readable delay, cannot fire Blue Line unless Prime; rubber-band +-8% only when opts.rubber (12+ fields).
 */
(function (root) {
  'use strict';
  var U0 = 7 / 1.8;
  var FX = { PICK_M: 3.5, PAD_M: 4.5, GATE_M: 8, SHELL_MS: 34, SHELL_RANGE_M: 60, WAVE_M: 16, YANK_M: 12, CRATE_RESPAWN_S: 8, AI_BASE_MS: 12.5, AI_ITEM_DELAY_S: [1.2, 3.5], PRIZE: [60, 35, 20], PRIZE_RANKED_MUL: 2, PAD_BOOST: { mul: 1.35, dur: 1.0 }, ITEM_BOOST: { mul: 1.6, dur: 1.6 } };
  function create(o) {
    var park = o.park, hover = o.hover, U = o.U || U0, scene = o.scene, THREE = o.THREE, emit = o.onEvent || function () { }, WR = root.WorldRace, R = null, st = null;
    var api = { playerId: 'you', hud: null };
    function ev(type, data) { data = data || {}; data.type = type; try { emit(data); } catch (e) { } }

    /* ── loop geometry (world units): posAt(u) with u in [0,1). Park cups use the park loop; city circuits use WorldRace.TRACKS (set per start) ── */
    var loop = [], cum = [0], LEN = 1;
    function setLoop(pts) { loop = pts; cum = [0]; for (var i = 0; i < loop.length; i++) { var a = loop[i], b = loop[(i + 1) % loop.length]; cum.push(cum[i] + Math.hypot(b.x - a.x, b.z - a.z)); } LEN = cum[cum.length - 1] || 1; }
    setLoop(park.loopWorld());
    function posAt(u) { var d = ((u % 1) + 1) % 1 * LEN, k = 0; while (k < loop.length - 1 && cum[k + 1] < d) k++; var a = loop[k], b = loop[(k + 1) % loop.length], f = (d - cum[k]) / Math.max(1e-6, cum[k + 1] - cum[k]); return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, z: a.z + (b.z - a.z) * f, yaw: Math.atan2(b.x - a.x, b.z - a.z) }; }
    function uOf(x, z) { var best = 0, bd = 1e18, S = 480; for (var s = 0; s < S; s++) { var p = posAt(s / S), d = (p.x - x) * (p.x - x) + (p.z - z) * (p.z - z); if (d < bd) { bd = d; best = s / S; } } return best; }

    function start(cid, opts) {
      opts = opts || {}; var C = WR.CIRCUITS[cid]; if (!C) return null; stop();
      var nAI = Math.max(1, Math.min(7, opts.ais == null ? 5 : opts.ais)), ridersDef = [{ id: api.playerId, name: 'You', deck: 'park' }], names = ['ORION', 'LIRA', 'KAI', 'NOVA', 'ASH', 'RIVET', 'VEGA'];
      for (var i = 0; i < nAI; i++) ridersDef.push({ id: 'ai' + i, name: names[i], deck: i % 3 === 0 ? 'race' : (i % 3 === 1 ? 'street' : 'park') });
      R = WR.create(C, { ranked: !!opts.ranked, riders: ridersDef, rng: opts.rng });
      var tw = WR.trackWorld ? WR.trackWorld(cid, U) : null, gates, crates, pads;
      if (tw && o.heightAt) tw.forEach(function (p) { p.y = o.heightAt(p.x, p.z); });
      if (tw) {   // city-scale circuit: gates every 1/N along the ring, 24 crates (alternating lanes), 16 turbo pads, glowing ribbon
        setLoop(tw); var NG = C.gates.length; gates = C.gates.map(function (g, i) { var q = posAt(i / NG); return { x: q.x, y: q.y, z: q.z, kind: g.kind, verb: g.verb || null, idx: i }; });
        crates = []; for (var ck = 0; ck < 24; ck++) { var qc = posAt((ck + 0.5) / 24), off = (ck % 2 ? 1 : -1) * 3 * U; crates.push({ x: qc.x + Math.cos(qc.yaw) * off, y: qc.y, z: qc.z - Math.sin(qc.yaw) * off, on: true, t: 0, u: (ck + 0.5) / 24, i: ck, track: true }); }
        pads = []; for (var pk = 0; pk < 16; pk++) { var qp = posAt((pk + 0.25) / 16); pads.push({ x: qp.x, y: qp.y, z: qp.z, yaw: qp.yaw }); }
      } else { setLoop(park.loopWorld()); gates = park.gates(cid); crates = park.cratesWorld().map(function (c, i) { return { x: c.x, y: c.y, z: c.z, on: true, t: 0, u: uOf(c.x, c.z), i: i }; }); pads = park.padsWorld(); }
      var ais = ridersDef.slice(1).map(function (r, i) { var lane = ((i % 4) - 1.5) * 2.2 * U; return { id: r.id, u: 0.985 - i * 0.004, tot: -(0.015 + i * 0.004), lane: lane, speedMul: 1, stun: 0, noise: 0, ink: 0, gateU: 0, itemT: 0, spawned: true, x: 0, y: 0, z: 0, yaw: 0, mesh: null }; });
      st = { cid: cid, C: C, gates: gates, crates: crates, pads: pads, ais: ais, phase: 'count', count: 3.4, t: 0, P: { gate: 0, cool: 0, inkT: 0, lastCheckpoint: 0, done: false }, result: null, ranked: !!opts.ranked, rubber: !!opts.rubber, shells: [], prime: !!C.prime, padCool: 0 };
      ais.forEach(function (a) { var p = posAt(a.u); place(a, p); a.mesh = mkMesh(a); });
      if (tw && THREE && scene && WR.ribbon) { var rp = tw.map(function (p) { return { x: p.x, y: p.y + 0.3 * U, z: p.z }; }); st.ribMesh = WR.ribbon(THREE, rp, 9 * U, true); scene.add(st.ribMesh); }
      buildHud(); ev('start', { circuit: cid, ranked: !!opts.ranked, scale: C.scale || 'park', lengthM: C.lengthM || null }); return api;
    }
    function place(a, p) { var sy = Math.sin(p.yaw), cy = Math.cos(p.yaw); a.x = p.x + cy * a.lane; a.z = p.z - sy * a.lane; a.y = p.y; a.yaw = p.yaw; }
    function mkMesh(a) { if (!THREE || !scene) return null; var m = new THREE.Mesh(new THREE.BoxGeometry(0.7 * U, 0.16 * U, 1.7 * U), new THREE.MeshStandardMaterial({ color: 0x0B1020, emissive: [0x00D4FF, 0xD4AF37, 0xff4aa8, 0x9d6bff][a.id.charCodeAt(2) % 4], emissiveIntensity: 1.4, metalness: 0.6, roughness: 0.3 })); scene.add(m); return m; }
    function stop() { if (st) { if (st.ribMesh && scene) scene.remove(st.ribMesh); st.ais.forEach(function (a) { if (a.mesh && scene) scene.remove(a.mesh); }); st.shells.forEach(function (s) { if (s.mesh && scene) scene.remove(s.mesh); }); } st = null; R = null; if (api.hud && api.hud.parentNode) api.hud.parentNode.removeChild(api.hud); api.hud = null; if (hover && hover.setModifier) hover.setModifier({ mul: 1, dur: 0, stun: 0, noise: 0 }); }

    /* ── HUD (Navi cyan/gold) ── */
    function buildHud() {
      if (typeof document === 'undefined') return; var h = document.createElement('div'); h.id = 'raceHud'; h.style.cssText = 'position:fixed;left:50%;bottom:64px;transform:translateX(-50%);z-index:7500;pointer-events:none;font:700 15px Rajdhani,Segoe UI,sans-serif;color:#E8F6FF;display:flex;gap:14px;align-items:center;padding:8px 16px;background:rgba(5,10,24,.78);border:1px solid #00D4FF;clip-path:polygon(10px 0,100% 0,calc(100% - 10px) 100%,0 100%)';
      h.innerHTML = '<span id="rhLap"></span><span id="rhPlace" style="color:#D4AF37;font-size:22px"></span><span id="rhItem" style="min-width:110px"></span><span style="display:inline-block;width:110px;height:8px;border:1px solid #00D4FF"><i id="rhHp" style="display:block;height:100%;width:100%;background:#00D4FF"></i></span><span id="rhTime"></span>';
      var big = document.createElement('div'); big.id = 'rhBig'; big.style.cssText = 'position:fixed;left:50%;top:32%;transform:translate(-50%,-50%);z-index:7600;pointer-events:none;font:900 120px Georgia,serif;color:#D4AF37;text-shadow:0 0 30px #00D4FF';
      var ink = document.createElement('div'); ink.id = 'rhInk'; ink.style.cssText = 'position:fixed;inset:0;z-index:7450;pointer-events:none;opacity:0;transition:opacity .2s;background:radial-gradient(circle at 30% 40%,#000 0 14%,transparent 15%),radial-gradient(circle at 70% 55%,#000 0 18%,transparent 19%),radial-gradient(circle at 50% 30%,#000 0 12%,transparent 13%)';
      h.appendChild(big); h.appendChild(ink); document.body.appendChild(h); api.hud = h;
    }
    var ICON = { boost: '▲ BOOST', shell: '● SHELL', wave: '◗ WAVE', ink: '◍ INK', ward: '◈ WARD', yank: '⬍ YANK', sway: '≈ SWAY', pinch: '✦ PINCH', triple: '●●● TRIPLE', blue: '◆ BLUE LINE' };
    function hudUpdate() {
      if (!api.hud || !R) return; var me = R.rider(api.playerId), s = R.standings(), mine = s.filter(function (x) { return x.id === api.playerId; })[0], q = function (id) { return api.hud.querySelector(id); };
      q('#rhLap').textContent = 'LAP ' + Math.min(R.circuit.laps, me.lap + 1) + '/' + R.circuit.laps; q('#rhPlace').textContent = 'P' + (mine ? mine.place : '-') + '/' + s.length; q('#rhItem').textContent = me.item ? ICON[me.item] : (me.ward ? '◈ WARD ON' : '— no item —');
      q('#rhHp').style.width = me.hp + '%'; q('#rhTime').textContent = (st.phase === 'race' ? st.t : 0).toFixed(1) + 's'; var big = q('#rhBig'); big.textContent = st.phase === 'count' ? (st.count > 0.4 ? String(Math.ceil(st.count - 0.4)) : 'GO!') : ''; q('#rhInk').style.opacity = st.P.inkT > 0 ? '0.92' : '0';
    }

    /* ── helpers ── */
    function riderPos(id, pose) { if (id === api.playerId) return pose; var a = st.ais.filter(function (x) { return x.id === id; })[0]; return a ? { x: a.x, z: a.z, yaw: a.yaw } : null; }
    function dist(a, b) { return Math.hypot(a.x - b.x, a.z - b.z); }
    function firstPlaceId(exceptId) { var s = R.standings().filter(function (x) { return x.id !== exceptId && !x.dnf; }); return s.length ? s[0].id : null; }
    function nearestAhead(srcId, pose, maxM) {
      var me = riderPos(srcId, pose), best = null, bd = maxM * U, fx = Math.sin(me.yaw), fz = Math.cos(me.yaw);
      R.standings().forEach(function (r) { if (r.id === srcId || r.dnf) return; var p = riderPos(r.id, pose); if (!p) return; var d = dist(me, p), dot = ((p.x - me.x) * fx + (p.z - me.z) * fz) / (d || 1); if (d < bd && dot > 0.2) { bd = d; best = r.id; } }); return best;
    }
    function hitRider(targetId, dmg, stunS, why) {
      var res = R.hit(targetId, dmg), isMe = targetId === api.playerId; if (!res) return res;
      if (isMe) { if (!res.blocked) { if (stunS && hover && hover.setModifier) hover.setModifier({ stun: stunS }); } } else { var a = st.ais.filter(function (x) { return x.id === targetId; })[0]; if (a && !res.blocked && stunS) a.stun = Math.max(a.stun, stunS); }
      if (res.respawned) { if (isMe) { var g = st.gates[Math.max(0, R.rider(targetId).gate - 1)] || st.gates[0]; ev('respawn', { id: targetId, x: g.x, z: g.z, y: g.y }); if (hover && hover.setModifier) hover.setModifier({ stun: 1.4 }); } else { var a2 = st.ais.filter(function (x) { return x.id === targetId; })[0]; if (a2) a2.stun = 1.4; } }
      ev('hit', { id: targetId, dmg: dmg, why: why || '', blocked: !!res.blocked, respawned: !!res.respawned }); return res;
    }
    function spawnShell(srcId, targetId, dmg) { var sp = riderPos(srcId, st.lastPose); if (!sp || !targetId) return; var sh = { from: srcId, to: targetId, x: sp.x, z: sp.z, y: (sp.y || 0) + 1.2 * U, dmg: dmg, life: 4, mesh: null }; if (THREE && scene) { sh.mesh = new THREE.Mesh(new THREE.SphereGeometry(0.5 * U, 10, 8), new THREE.MeshBasicMaterial({ color: 0x00D4FF })); scene.add(sh.mesh); } st.shells.push(sh); ev('shell', { from: srcId, to: targetId }); }
    function useFor(id, pose) {
      var r = R.rider(id); if (!r || !r.item || r.freeze > 0) return null; var item = r.item, me = riderPos(id, pose);
      if (item === 'ward' || item === 'boost') { var out = R.useItem(id); if (item === 'boost') { if (id === api.playerId) { if (hover && hover.setModifier) hover.setModifier({ mul: FX.ITEM_BOOST.mul, dur: FX.ITEM_BOOST.dur }); } else { var a = st.ais.filter(function (x) { return x.id === id; })[0]; if (a) a.boostT = FX.ITEM_BOOST.dur; } r.boosting = false; ev('boost', { id: id }); } else ev('ward', { id: id }); return out; }
      r.item = null;
      if (item === 'shell') { var t1 = nearestAhead(id, pose, FX.SHELL_RANGE_M); if (t1) spawnShell(id, t1, 22); else ev('fizzle', { id: id }); }
      else if (item === 'triple') { var t2 = nearestAhead(id, pose, FX.SHELL_RANGE_M); if (t2) { [0, 0.25, 0.5].forEach(function (d, k) { setTimeout(function () { if (R && st) spawnShell(id, t2, 22); }, d * 1000); }); } else ev('fizzle', { id: id }); }
      else if (item === 'blue') { var f = firstPlaceId(id); if (f) spawnShell(id, f, 30); }
      else if (item === 'wave') { R.standings().forEach(function (s) { if (s.id === id) return; var p = riderPos(s.id, pose); if (p && dist(me, p) < FX.WAVE_M * U) hitRider(s.id, 4, 0.6, 'wave'); }); ev('wave', { id: id }); }
      else if (item === 'ink') { var t3 = nearestAhead(id, pose, 60) || firstPlaceId(id); if (t3) { if (t3 === api.playerId) st.P.inkT = 2.5; else { var a3 = st.ais.filter(function (x) { return x.id === t3; })[0]; if (a3) a3.ink = 2.5; } ev('ink', { id: id, to: t3 }); } }
      else if (item === 'yank') { var near = null, bd = FX.YANK_M * U; R.standings().forEach(function (s) { if (s.id === id) return; var p = riderPos(s.id, pose), rr = R.rider(s.id); if (p && rr.item && dist(me, p) < bd) { bd = dist(me, p); near = s.id; } }); if (near) { var stolen = R.rider(near).item; R.rider(near).item = null; r.item = stolen; ev('yank', { id: id, from: near, item: stolen }); } }
      else if (item === 'sway') { var t4 = nearestAhead(id, pose, 50); if (t4) { if (t4 === api.playerId) { if (hover && hover.setModifier) hover.setModifier({ noise: 0.9, noiseDur: 2 }); } else { var a4 = st.ais.filter(function (x) { return x.id === t4; })[0]; if (a4) a4.noise = 2; } ev('sway', { id: id, to: t4 }); } }
      else if (item === 'pinch') { var t5 = nearestAhead(id, pose, 40); if (t5) hitRider(t5, 0, 1.2, 'pinch'); }
      return { item: item };
    }
    api.useItem = function () { if (!st || !R || st.phase !== 'race') return null; return useFor(api.playerId, st.lastPose); };
    api.canUsePocket = function (v) { return R ? R.canUsePocket(v) : true; };
    api.state = function () { return st ? { phase: st.phase, t: st.t, standings: R.standings(), result: st.result, item: R.rider(api.playerId).item, hp: R.rider(api.playerId).hp } : null; };
    api.race = function () { return R; }; api._st = function () { return st; };

    /* ── per frame ── */
    api.update = function (dt, pose) {
      if (!st || !R) return; dt = Math.min(dt, 0.1);
      if (!pose && hover && hover.state) { var hs = hover.state(); pose = { x: hs.x, y: hs.y, z: hs.z, yaw: hs.psi, mode: hover.isFlying && hover.isFlying() ? 'foil' : 'pad', altM: hover.altitudeM ? hover.altitudeM() : 0 }; }
      pose = pose || { x: 0, y: 0, z: 0, yaw: 0, mode: 'pad', altM: 0 }; st.lastPose = pose;
      if (st.phase === 'count') { st.count -= dt; if (st.count <= 0) { st.phase = 'race'; R.start(); ev('go'); } hudUpdate(); return; }
      if (st.phase === 'done') { hudUpdate(); return; }
      st.t += dt; R.update(dt); if (st.P.inkT > 0) st.P.inkT -= dt;
      // player gates
      var me = R.rider(api.playerId);
      if (!me.finished && !me.dnf) { var g = st.gates[me.gate]; if (g && Math.hypot(pose.x - g.x, pose.z - g.z) < FX.GATE_M * U) { var res = R.passGate(api.playerId, me.gate, { mode: pose.mode || 'pad', altM: pose.altM || 0, kissed: pose.kissed !== false, trick: pose.trick || null }); if (res.ok) ev('gate', { gate: me.gate, note: res.note }); } }
      // crates + pads (player)
      st.crates.forEach(function (c) { if (!c.on) { c.t -= dt; if (c.t <= 0) { c.on = true; if (!c.track && park.setCrateVisible) park.setCrateVisible(c.i, true); } return; } if (Math.hypot(pose.x - c.x, pose.z - c.z) < FX.PICK_M * U && !me.item) { var it = R.grabCrate(api.playerId, st.prime); if (it) { c.on = false; c.t = FX.CRATE_RESPAWN_S; if (!c.track && park.setCrateVisible) park.setCrateVisible(c.i, false); ev('crate', { id: api.playerId, item: it.id }); } } });
      st.padCool -= dt; if (st.padCool <= 0) st.pads.forEach(function (p) { if (Math.hypot(pose.x - p.x, pose.z - p.z) < FX.PAD_M * U) { st.padCool = 0.6; if (hover && hover.setModifier) hover.setModifier({ mul: FX.PAD_BOOST.mul, dur: FX.PAD_BOOST.dur }); ev('pad', {}); } });
      // AIs
      var playerProg = me.lap + uOf(pose.x, pose.z);
      st.ais.forEach(function (a) {
        var r = R.rider(a.id); if (r.finished || r.dnf) return; if (a.stun > 0) { a.stun -= dt; } if (a.ink > 0) a.ink -= dt; if (a.noise > 0) a.noise -= dt; if (a.boostT > 0) a.boostT -= dt;
        var mul = a.speedMul * (a.stun > 0 ? 0.15 : 1) * (a.ink > 0 ? 0.8 : 1) * (a.boostT > 0 ? 1.5 : 1) * (a.noise > 0 ? 0.9 : 1); if (st.rubber) { var gap = playerProg - (r.lap + a.u); mul *= 1 + Math.max(-1, Math.min(1, gap / 0.5)) * 0.08; }
        var deckK = { race: 1.0, park: 1.0, street: 0.97 }[r.deck] || 1, du = (FX.AI_BASE_MS * U * deckK * mul * dt) / LEN, N = st.gates.length; a.tot += du; a.u = ((a.tot % 1) + 1) % 1;
        var guard = 6; while (guard-- > 0 && !r.finished && a.tot >= r.lap + r.gate / N) { var gk = st.gates[r.gate]; R.passGate(a.id, r.gate, { mode: gk.kind === 'foil' ? 'foil' : 'pad', altM: gk.kind === 'foil' ? 6 : 0.2, kissed: true }); }
        var p = posAt(a.u); place(a, p); if (a.mesh) { a.mesh.position.set(a.x, a.y + 0.6 * U, a.z); a.mesh.rotation.y = a.yaw; }
        // crates for AI (by path proximity), items used after a readable delay
        st.crates.forEach(function (c) { if (c.on && !r.item && Math.abs(((a.u - c.u + 1.5) % 1) - 0.5) < 0.006) { var it = R.grabCrate(a.id, false); if (it) { c.on = false; c.t = FX.CRATE_RESPAWN_S; if (!c.track && park.setCrateVisible) park.setCrateVisible(c.i, false); a.itemT = FX.AI_ITEM_DELAY_S[0] + (FX.AI_ITEM_DELAY_S[1] - FX.AI_ITEM_DELAY_S[0]) * Math.random(); } } });
        if (r.item) { a.itemT -= dt; if (a.itemT <= 0) { if (r.item === 'blue' && !st.prime) r.item = null; else useFor(a.id, pose); a.itemT = 0; } }
      });
      // shells travel + hit
      for (var si = st.shells.length - 1; si >= 0; si--) { var sh = st.shells[si], tp = riderPos(sh.to, pose); sh.life -= dt; if (!tp || sh.life <= 0) { if (sh.mesh && scene) scene.remove(sh.mesh); st.shells.splice(si, 1); continue; } var dx = tp.x - sh.x, dz = tp.z - sh.z, dd = Math.hypot(dx, dz), stepM = FX.SHELL_MS * U * dt; if (dd <= stepM + 1.2 * U) { hitRider(sh.to, sh.dmg, 0.7, 'shell'); if (sh.mesh && scene) scene.remove(sh.mesh); st.shells.splice(si, 1); } else { sh.x += dx / dd * stepM; sh.z += dz / dd * stepM; if (sh.mesh) sh.mesh.position.set(sh.x, sh.y, sh.z); } }
      // finish
      if (R.finished() || (me.finished && !st.result)) { if (R.finished() || me.finished) { st.phase = 'done'; var s2 = R.standings(), mine = s2.filter(function (x) { return x.id === api.playerId; })[0]; var prize = (FX.PRIZE[mine.place - 1] || 0) * (st.ranked ? FX.PRIZE_RANKED_MUL : 1); st.result = { place: mine.place, of: s2.length, timeS: me.finalS != null ? me.finalS : R.score(api.playerId), prize: prize, standings: s2 }; if (prize && o.sparks && o.sparks.add) o.sparks.add(prize, 'race-prize', st.cid); ev('finish', st.result); } }
      hudUpdate();
    };
    api.startPose = function (cid) { var tw = WR.trackWorld ? WR.trackWorld(cid, U) : null; if (tw) { if (o.heightAt) tw.forEach(function (p) { p.y = o.heightAt(p.x, p.z); }); setLoop(tw); } else setLoop(park.loopWorld()); var p0 = posAt(0.99); return { x: p0.x, y: p0.y, z: p0.z, yaw: p0.yaw }; };
    api.start = start; api.stop = stop; api.FX = FX; api.posAt = posAt; api.loopLength = LEN;
    return api;
  }
  root.WorldRaceRun = { create: create };
})(typeof window !== 'undefined' ? window : globalThis);
