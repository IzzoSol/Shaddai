/* world-race-challenge.js — CHALLENGE RACES with Sparks wagers (owner 2026-10-01):
 * "challenge people to mount races in game, races and wager Sparks, picking spots on the map".
 *
 *   var rc = window.buildRaceChallenge({ THREE, scene, heightAt, playerPos, getRider, spend, add, toast, spots })
 *   rc.openBuilder()      the race builder (vehicle auto-detected, START / FINISH from map spots or your position, rivals, difficulty, wager)
 *   rc.openBoard()        challenge board: open challenges posted by other racers (NPC agents now; a server board later)
 *   rc.update(dt)         every frame (countdown, rival movement, checkpoints, finish)
 *   rc.state()            { phase, place, elapsed, checkpoint, ... }
 *
 * Rules (Sparks are closed loop - no cash-out): every racer stakes the same amount; the pot goes to the winner minus a 5% BURN (a sink).
 * Mount races: ground mounts, flyers (hawk / hover skiff), hoverboards and on foot all work; rival speed scales to YOUR vehicle (difficulty 0.7 .. 1.05 of its top run speed).
 * Real PvP later: the board shape (id, owner, vehicle, stake, spots[]) is what /api/race/challenge should store; escrow = server-side spend/hold, settle = payout. See docs.
 * Units: world units on XZ, U = 7/1.8 per metre.
 */
(function (root) {
  'use strict';
  var U = 7 / 1.8, FEE = 0.05, REACH_M = 16;
  // top run speed (m/s) per vehicle id - rival speed is a fraction of this
  var TOP = { foot: 9, board: 26, bull: 18, mammoth: 12, gorilla: 20, hawk: 30, skiff: 44 };
  var NAMES = ['ZEROX', 'PIKADON', 'NEXUS', 'TURTLE', 'QUILL', 'ORACLE'], COLS = [0x27e0ff, 0xff5a6e, 0x34e5b0, 0xe8c45c, 0xc084fc, 0x5fa8ff];

  root.buildRaceChallenge = function (o) {
    var THREE = o.THREE, scene = o.scene, heightAt = o.heightAt || function () { return 0; }, P = o.playerPos;
    var S = { phase: 'idle', spots: [], rivals: [], stake: 100, diff: 1, n: 2, t: 0, elapsed: 0, cp: 0, place: 0, pot: 0, vehicle: 'foot', cd: 0, log: [] };
    var group = new THREE.Group(); group.name = 'race-challenge'; scene.add(group);
    var panel = null, hud = null;

    function toast(m) { if (o.toast) o.toast(m); else if (root.Navi && root.Navi.toast) root.Navi.toast(m); }
    function rider() { try { return o.getRider ? o.getRider() : { id: 'foot', kind: 'foot' }; } catch (e) { return { id: 'foot', kind: 'foot' }; } }
    function spendF(n, why) { return o.spend ? o.spend(n, 'race-wager', why) : (root.ShdSparks ? root.ShdSparks.spend(n, 'race-wager', why) : false); }
    function addF(n, why) { if (o.add) o.add(n, 'race-win', why); else if (root.ShdSparks) root.ShdSparks.add(n, 'race-win', why); }
    function bal() { return root.ShdSparks && root.ShdSparks.get ? root.ShdSparks.get() : 0; }
    function dist(a, b) { return Math.hypot(a.x - b.x, a.z - b.z); }
    function pathLen() { var L = 0; for (var i = 1; i < S.spots.length; i++) L += dist(S.spots[i - 1], S.spots[i]); return L; }

    // ---------- map spots ----------
    function mapSpots() {
      var out = [], push = function (label, x, z) { if (isFinite(x) && isFinite(z)) out.push({ label: label, x: x, z: z }); };
      push('The Grid centre', 0, 200);
      try { if (root.__hoverPark && root.__hoverPark.entrance) push('Hoverskate park gate', root.__hoverPark.entrance.x, root.__hoverPark.entrance.z); } catch (e) { }
      try { if (root.COLOSSEUM_WORLD) push('Colosseum door', root.COLOSSEUM_WORLD.door[0], root.COLOSSEUM_WORLD.door[1]); } catch (e) { }
      try { (root.__entrances || []).forEach(function (e) { push(e.code + ' entrance', e.x + e.nx * 30, e.z + e.nz * 30); }); } catch (e) { }
      try { var T = root.__worldTransitApi; if (T && T.stations) T.stations.forEach(function (s) { push('Maglev: ' + s.name, s.x, s.z); }); } catch (e) { }
      if (o.spots) { try { o.spots().forEach(function (s) { push(s.label, s.x, s.z); }); } catch (e) { } }
      return out;
    }

    // ---------- visuals ----------
    var beamG = new THREE.CylinderGeometry(3, 5, 1, 12, 1, true), ringG = new THREE.TorusGeometry(14, 1.1, 8, 28);
    var markers = [];
    function clearMarkers() { markers.forEach(function (m) { group.remove(m.g); }); markers = []; }
    function buildMarkers() {
      clearMarkers();
      S.spots.forEach(function (sp, i) {
        var last = i === S.spots.length - 1, first = i === 0, col = first ? 0x34e5b0 : last ? 0xe8c45c : 0x27e0ff;
        var g = new THREE.Group(), beam = new THREE.Mesh(beamG, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
        beam.scale.set(1, 360, 1); beam.position.y = 180; g.add(beam);
        var ring = new THREE.Mesh(ringG, new THREE.MeshBasicMaterial({ color: col, fog: false })); ring.rotation.x = Math.PI / 2; ring.position.y = 4; g.add(ring);
        g.position.set(sp.x, heightAt(sp.x, sp.z), sp.z); group.add(g); markers.push({ g: g, ring: ring, i: i });
      });
    }
    function rivalMesh(col) {
      var m = new THREE.Mesh(new THREE.OctahedronGeometry(1, 0), new THREE.MeshBasicMaterial({ color: col })); m.scale.set(2.2, 3.4, 2.2);
      var halo = new THREE.Mesh(new THREE.TorusGeometry(2.8, 0.25, 6, 20), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.7 })); halo.rotation.x = Math.PI / 2; m.add(halo);
      var g = new THREE.Group(); g.add(m); g.userData.core = m; group.add(g); return g;
    }

    // ---------- HUD ----------
    function hudEl() {
      if (hud) return hud; hud = document.createElement('div'); hud.id = 'raceChallengeHud';
      hud.style.cssText = 'position:fixed;top:58px;left:50%;transform:translateX(-50%);z-index:9000;min-width:260px;text-align:center;padding:8px 16px;border-radius:12px;background:linear-gradient(180deg,rgba(12,18,30,.92),rgba(5,8,15,.96));border:1px solid rgba(232,196,92,.5);color:#e9f4ee;font:700 13px "Chakra Petch",Rajdhani,sans-serif;letter-spacing:.08em;box-shadow:0 8px 22px rgba(0,0,0,.5);display:none';
      document.body.appendChild(hud); return hud;
    }
    function drawHud() {
      var h = hudEl(); if (S.phase === 'idle') { h.style.display = 'none'; return; } h.style.display = 'block';
      if (S.phase === 'grid') { var far = dist(P, S.spots[0]) >= 45 * U; h.innerHTML = far ? '<div style="color:#e8c45c">RIDE TO THE START</div><div style="font-size:20px;color:#00ff9c">' + Math.round(dist(P, S.spots[0]) / U) + ' m</div><div style="opacity:.7;font-weight:600">follow the green beam &middot; wager ' + S.stake + '&#9889; locked</div>' : '<div style="color:#e8c45c">RACE STARTING</div><div style="font-size:30px;color:#00ff9c">' + Math.max(1, Math.ceil(S.cd)) + '</div><div style="opacity:.7;font-weight:600">stay on your ' + S.vehicle + '</div>'; return; }
      var nxt = S.spots[Math.min(S.cp + 1, S.spots.length - 1)], d = nxt ? Math.round(dist(P, nxt) / U) : 0;
      var pos = 1; S.rivals.forEach(function (r) { if (r.finished || r.s > S.prog) pos++; });
      if (S.phase === 'race') { S.prog = progressOf(); pos = 1; S.rivals.forEach(function (r) { if (r.finished || r.s > S.prog) pos++; }); }
      h.innerHTML = '<div style="color:#e8c45c">' + (S.phase === 'done' ? (S.place === 1 ? 'YOU WIN  +' + Math.round(S.pot * (1 - FEE)) + ' SPARKS' : 'FINISHED  P' + S.place + '/' + (S.rivals.length + 1)) : 'P' + pos + '/' + (S.rivals.length + 1) + '  &middot;  CP ' + S.cp + '/' + (S.spots.length - 1)) + '</div><div style="font-size:12px;opacity:.85;font-weight:600">' + (S.phase === 'done' ? 'time ' + S.elapsed.toFixed(1) + 's' : 'next ' + d + ' m  &middot;  ' + S.elapsed.toFixed(1) + 's  &middot;  pot ' + S.pot + '&#9889;') + '</div>';
    }

    // ---------- race logic ----------
    function progressOf() { // metres along the course (nearest segment projection, monotone with checkpoints)
      var s = 0, i; for (i = 1; i <= S.cp && i < S.spots.length; i++) s += dist(S.spots[i - 1], S.spots[i]);
      var nx = S.spots[Math.min(S.cp + 1, S.spots.length - 1)], pv = S.spots[S.cp]; if (nx && pv) { var seg = dist(pv, nx) || 1, t = ((P.x - pv.x) * (nx.x - pv.x) + (P.z - pv.z) * (nx.z - pv.z)) / (seg * seg); s += Math.max(0, Math.min(1, t)) * seg; }
      return s;
    }
    function pointAt(s) { var rem = s; for (var i = 1; i < S.spots.length; i++) { var seg = dist(S.spots[i - 1], S.spots[i]); if (rem <= seg || i === S.spots.length - 1) { var t = seg ? Math.min(1, rem / seg) : 1; return { x: S.spots[i - 1].x + (S.spots[i].x - S.spots[i - 1].x) * t, z: S.spots[i - 1].z + (S.spots[i].z - S.spots[i - 1].z) * t }; } rem -= seg; } var l = S.spots[S.spots.length - 1]; return { x: l.x, z: l.z }; }
    function begin(cfg) {
      if (S.phase !== 'idle' && S.phase !== 'done') return { ok: false, why: 'a race is already running' };
      var sp = cfg.spots; if (!sp || sp.length < 2) return { ok: false, why: 'pick a START and a FINISH' };
      var len = 0; for (var i = 1; i < sp.length; i++) len += Math.hypot(sp[i].x - sp[i - 1].x, sp[i].z - sp[i - 1].z) / U; if (len < 120) return { ok: false, why: 'course too short (min 120 m)' };
      var stake = Math.max(10, Math.min(5000, Math.round(cfg.stake || 100)));
      if (bal() < stake) return { ok: false, why: 'not enough Sparks for the wager (' + stake + ')' };
      if (!spendF(stake, 'challenge')) return { ok: false, why: 'wager refused' };
      var r = rider(); S.vehicle = r.id || 'foot'; S.spots = sp.map(function (q) { return { x: q.x, z: q.z, label: q.label }; });
      S.stake = stake; S.diff = cfg.diff || 1; S.n = Math.max(1, Math.min(3, cfg.n || 2)); S.t = 0; S.elapsed = 0; S.cp = 0; S.place = 0; S.prog = 0; S.pot = stake * (S.n + 1);
      S.rivals.forEach(function (rv) { group.remove(rv.g); }); S.rivals = [];
      var top = (TOP[S.vehicle] || 9) * U, names = cfg.names || [];
      for (var k = 0; k < S.n; k++) { var sp0 = S.spots[0], c = COLS[(k + 1) % COLS.length]; S.rivals.push({ name: names[k] || NAMES[k % NAMES.length], g: rivalMesh(c), s: 0, v: top * (0.7 + 0.12 * k) * S.diff * (0.55 + 0.45 * Math.random() * 0 + 0.45), finished: false, t: 0, weave: Math.random() * 6 }); S.rivals[k].v = top * S.diff * (0.62 + 0.1 * k + Math.random() * 0.08); S.rivals[k].g.position.set(sp0.x + (k - 1) * 12, heightAt(sp0.x, sp0.z), sp0.z); }
      buildMarkers(); S.phase = 'grid'; S.cd = 5;
      toast('Wager ' + stake + ' Sparks - pot ' + S.pot + '. Ride to the green START beam; the countdown begins when you are there.'); return { ok: true };
    }
    function finish(playerWon) {
      S.phase = 'done';
      if (playerWon) { var pay = Math.round(S.pot * (1 - FEE)); addF(pay, 'challenge win'); flash('rgba(232,196,92,.55)'); toast('YOU WIN! +' + pay + ' Sparks (5% burned)'); }
      else { flash('rgba(255,90,110,.4)'); toast('You finished P' + S.place + ' - the wager is lost'); }
      setTimeout(function () { if (S.phase === 'done') { S.phase = 'idle'; clearMarkers(); S.rivals.forEach(function (rv) { group.remove(rv.g); }); S.rivals = []; drawHud(); } }, 9000);
    }
    function update(dt) {
      if (S.phase === 'idle') { return; }
      if (S.phase === 'grid') { var atStart = dist(P, S.spots[0]) < 45 * U; if (atStart) S.cd -= dt; else S.cd = 5; if (S.cd <= 0) { S.phase = 'race'; S.t = 0; toast('GO!'); } drawHud(); animMarkers(dt); return; }
      if (S.phase === 'race') {
        S.t += dt; S.elapsed = S.t; var total = pathLen();
        // checkpoints in order
        var tgt = S.spots[S.cp + 1]; if (tgt && dist(P, tgt) < REACH_M * U) { S.cp++; if (S.cp >= S.spots.length - 1) { var place = 1; S.rivals.forEach(function (r) { if (r.finished) place++; }); S.place = place; finish(place === 1); } else { flash('rgba(0,212,255,.25)'); toast('Checkpoint ' + S.cp + ' / ' + (S.spots.length - 2)); } }
        // rivals
        S.rivals.forEach(function (r) { if (r.finished) return; r.s += r.v * dt * (0.96 + 0.08 * Math.sin(S.t * 1.7 + r.weave)); var pt = pointAt(r.s), fly = S.vehicle === 'hawk' || S.vehicle === 'skiff';
          r.g.position.set(pt.x + Math.sin(S.t * 0.8 + r.weave) * 6, heightAt(pt.x, pt.z) + (fly ? 30 * U / 4 : 3), pt.z + Math.cos(S.t * 0.8 + r.weave) * 6); r.g.userData.core.rotation.y += dt * 2;
          if (r.s >= total) { r.finished = true; r.t = S.t; } });
        if (S.phase === 'race') { var fin = 0; S.rivals.forEach(function (r) { if (r.finished) fin++; }); if (fin > 0) { S.place = fin + 1; toast((S.rivals.filter(function (r) { return r.finished; })[0] || {}).name + ' wins the race'); finish(false); } }
        if (S.phase === 'race' && S.t > 60 * 20) { S.place = S.rivals.length + 1; finish(false); }
        drawHud(); animMarkers(dt);
      } else if (S.phase === 'done') drawHud();
    }
    function animMarkers(dt) { markers.forEach(function (m) { m.ring.rotation.z += dt * 1.2; var next = (m.i === Math.min(S.cp + 1, S.spots.length - 1)), passed = m.i <= S.cp && S.phase === 'race' && m.i > 0;
      m.ring.position.y = 4 + Math.sin(S.t * 2 + m.i) * 1.5; var k = next ? 1.25 + 0.2 * Math.sin(S.t * 6) : (passed ? 0.6 : 1); m.ring.scale.set(k, k, k); m.g.children[0].material.opacity = passed ? 0.08 : (next ? 0.4 : 0.22); }); }
    function flash(col) { if (typeof document === 'undefined') return; var f = document.createElement('div'); f.style.cssText = 'position:fixed;inset:0;z-index:8999;pointer-events:none;background:radial-gradient(circle,transparent 40%,' + col + ' 100%);opacity:.9;transition:opacity .9s'; document.body.appendChild(f); requestAnimationFrame(function () { f.style.opacity = '0'; }); setTimeout(function () { f.remove(); }, 1100); }

    // ---------- UI: builder + board ----------
    function closePanel() { if (panel) { panel.remove(); panel = null; } }
    var draft = { start: null, finish: null, extra: [], n: 2, diff: 1, stake: 100 };
    function opt(list, sel) { return list.map(function (s, i) { return '<option value="' + i + '"' + (sel === i ? ' selected' : '') + '>' + s.label + '</option>'; }).join(''); }
    function openBuilder() {
      closePanel(); var spots = mapSpots(), r = rider(); spots.unshift({ label: 'My position now', x: P.x, z: P.z });
      panel = document.createElement('div'); panel.id = 'raceBuilder';
      panel.style.cssText = 'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:9500;width:min(92vw,420px);padding:16px;border-radius:14px;background:linear-gradient(180deg,rgba(14,20,34,.97),rgba(5,8,15,.98));border:1px solid rgba(232,196,92,.5);color:#e9f4ee;font:600 13px "Chakra Petch",Rajdhani,sans-serif;box-shadow:0 20px 50px rgba(0,0,0,.65)';
      var sel = 'width:100%;margin:4px 0 10px;padding:6px;background:#0b1422;color:#e9f4ee;border:1px solid rgba(0,255,156,.35);border-radius:7px;font:inherit';
      panel.innerHTML = '<div style="display:flex;justify-content:space-between;color:#e8c45c;font-size:16px;letter-spacing:.12em"><span>RACE CHALLENGE</span><span data-act="close" style="cursor:pointer">&#10005;</span></div>' +
        '<div style="opacity:.75;margin:4px 0 10px">Your ride: <b style="color:#00ff9c">' + (r.id || 'foot') + '</b> &middot; rivals match it &middot; Sparks balance <b style="color:#e8c45c">' + bal() + '</b></div>' +
        '<label>START</label><select id="rcStart" style="' + sel + '">' + opt(spots, 0) + '</select>' +
        '<label>FINISH</label><select id="rcFinish" style="' + sel + '">' + opt(spots, Math.min(2, spots.length - 1)) + '</select>' +
        '<label>CHECKPOINT (optional)</label><select id="rcMid" style="' + sel + '"><option value="-1">none</option>' + opt(spots, -1) + '</select>' +
        '<div style="display:flex;gap:10px"><div style="flex:1"><label>RIVALS</label><select id="rcN" style="' + sel + '"><option>1</option><option selected>2</option><option>3</option></select></div>' +
        '<div style="flex:1"><label>DIFFICULTY</label><select id="rcD" style="' + sel + '"><option value="0.75">Easy</option><option value="0.92" selected>Normal</option><option value="1.05">Hard</option></select></div>' +
        '<div style="flex:1"><label>WAGER &#9889;</label><input id="rcS" type="number" min="10" max="5000" value="' + draft.stake + '" style="' + sel + '"></div></div>' +
        '<div id="rcInfo" style="opacity:.8;margin-bottom:8px;font-weight:600"></div>' +
        '<div style="display:flex;gap:8px"><button data-act="go" style="flex:1;padding:10px;border-radius:9px;cursor:pointer;background:linear-gradient(180deg,rgba(0,255,156,.35),rgba(0,120,80,.4));border:1px solid #00ff9c;border-bottom-width:3px;color:#eafff6;font:700 14px inherit;letter-spacing:.1em">START RACE</button>' +
        '<button data-act="board" style="padding:10px 14px;border-radius:9px;cursor:pointer;background:linear-gradient(180deg,rgba(232,196,92,.3),rgba(120,80,10,.4));border:1px solid #e8c45c;border-bottom-width:3px;color:#ffe9b0;font:700 13px inherit">BOARD</button></div>' +
        '<div style="opacity:.55;font-size:11px;margin-top:8px">Pot = wagers of every racer; winner takes it minus a 5% burn. Sparks never cash out.</div>';
      document.body.appendChild(panel);
      function info() { var a = spots[+panel.querySelector('#rcStart').value], b = spots[+panel.querySelector('#rcFinish').value], m = +panel.querySelector('#rcMid').value, L = 0, pts = [a]; if (m >= 0) pts.push(spots[m]); pts.push(b); for (var i = 1; i < pts.length; i++) L += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z) / U; var n = +panel.querySelector('#rcN').value, st = +panel.querySelector('#rcS').value || 0; panel.querySelector('#rcInfo').textContent = 'Course ' + Math.round(L) + ' m  |  pot ' + (st * (n + 1)) + ' Sparks (win ' + Math.round(st * (n + 1) * (1 - FEE)) + ')'; return pts; }
      panel.addEventListener('input', info); info();
      panel.addEventListener('click', function (e) { var t = e.target.closest('[data-act]'); if (!t) return; var act = t.getAttribute('data-act');
        if (act === 'close') closePanel(); else if (act === 'board') openBoard();
        else if (act === 'go') { var pts = info(), n = +panel.querySelector('#rcN').value, d = +panel.querySelector('#rcD').value, st = +panel.querySelector('#rcS').value; draft.stake = st; var res = begin({ spots: pts, n: n, diff: d, stake: st }); if (res.ok) closePanel(); else toast(res.why); } });
    }
    function openBoard() {
      closePanel(); var spots = mapSpots(), r = rider(), id = r.id || 'foot';
      // NPC challengers post open challenges (a server board replaces this later: POST /api/race/challenge)
      var seed = Math.floor(Date.now() / 600000), rnd = function (k) { var x = Math.sin(seed * 12.9898 + k * 78.233) * 43758.5453; return x - Math.floor(x); };
      var list = []; for (var i = 0; i < 4; i++) { var a = spots[Math.floor(rnd(i * 3) * spots.length)], b = spots[Math.floor(rnd(i * 3 + 1) * spots.length)]; if (a === b) b = spots[(spots.indexOf(a) + 3) % spots.length]; list.push({ who: NAMES[Math.floor(rnd(i * 3 + 2) * NAMES.length)], stake: [50, 100, 250, 500][Math.floor(rnd(i + 9) * 4)], a: a, b: b, d: [0.8, 0.92, 1.0, 1.05][Math.floor(rnd(i + 17) * 4)] }); }
      panel = document.createElement('div'); panel.id = 'raceBoard';
      panel.style.cssText = 'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:9500;width:min(94vw,470px);padding:16px;border-radius:14px;background:linear-gradient(180deg,rgba(14,20,34,.97),rgba(5,8,15,.98));border:1px solid rgba(232,196,92,.5);color:#e9f4ee;font:600 13px "Chakra Petch",Rajdhani,sans-serif;box-shadow:0 20px 50px rgba(0,0,0,.65)';
      panel.innerHTML = '<div style="display:flex;justify-content:space-between;color:#e8c45c;font-size:16px;letter-spacing:.12em"><span>CHALLENGE BOARD</span><span data-act="close" style="cursor:pointer">&#10005;</span></div><div style="opacity:.7;margin:4px 0 8px">Open challenges for a <b style="color:#00ff9c">' + id + '</b> race. Accept to stake the wager and race from the start spot.</div>' +
        list.map(function (c, i) { var L = Math.round(Math.hypot(c.b.x - c.a.x, c.b.z - c.a.z) / U); return '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;padding:8px 0;border-top:1px solid rgba(255,255,255,.08)"><span><b style="color:#e8c45c">' + c.who + '</b> challenges you<br><small style="opacity:.75">' + c.a.label + ' &rarr; ' + c.b.label + ' &middot; ' + L + ' m &middot; ' + (c.d >= 1 ? 'hard' : c.d >= 0.9 ? 'normal' : 'easy') + '</small></span><button data-act="acc" data-i="' + i + '" style="padding:7px 12px;border-radius:8px;cursor:pointer;background:linear-gradient(180deg,rgba(232,196,92,.3),rgba(120,80,10,.4));border:1px solid #e8c45c;border-bottom-width:3px;color:#ffe9b0;font:700 12px inherit">' + c.stake + '&#9889; ACCEPT</button></div>'; }).join('') +
        '<div style="margin-top:10px"><button data-act="build" style="padding:8px 12px;border-radius:8px;cursor:pointer;background:rgba(0,255,156,.12);border:1px solid #00ff9c;color:#eafff6;font:700 12px inherit">Build my own race</button></div>';
      document.body.appendChild(panel);
      panel.addEventListener('click', function (e) { var t = e.target.closest('[data-act]'); if (!t) return; var act = t.getAttribute('data-act');
        if (act === 'close') closePanel(); else if (act === 'build') openBuilder();
        else if (act === 'acc') { var c = list[+t.getAttribute('data-i')], res = begin({ spots: [c.a, c.b], n: 1, diff: c.d, stake: c.stake, names: [c.who] }); if (res.ok) closePanel(); else toast(res.why); } });
    }
    function stop() { if (S.phase === 'grid' && S.stake) { if (o.add) o.add(S.stake, 'race-refund', 'cancelled before GO'); else if (root.ShdSparks) root.ShdSparks.add(S.stake, 'race-refund', 'cancelled before GO'); toast('Race cancelled - wager refunded'); } S.phase = 'idle'; clearMarkers(); S.rivals.forEach(function (rv) { group.remove(rv.g); }); S.rivals = []; drawHud(); closePanel(); }
    return { openBuilder: openBuilder, openBoard: openBoard, update: update, stop: stop, begin: begin, state: function () { return { phase: S.phase, place: S.place, elapsed: S.elapsed, cp: S.cp, pot: S.pot, vehicle: S.vehicle, rivals: S.rivals.length, spots: S.spots.length }; }, mapSpots: mapSpots, TOP: TOP };
  };
})(typeof window !== 'undefined' ? window : globalThis);
