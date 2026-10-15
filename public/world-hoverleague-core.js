/* world-hoverleague-core.js — HOVER LEAGUE rules (owner 2026-10-15: Rocket-League-style hover game as a Colosseum field mode, like
 * the naval battle; "change the ball to different energy balls and regular you can select, not soccer").
 * Pure (no THREE). Units: METRES in arena-local space (x east, z south, y up; field ellipse A x B). Tested in
 * tools/tests/world-hoverleague-core.test.cjs.
 *
 *   var g = HoverLeagueCore.create(layout, { mode:'league'|'paint', ball:'regular'|'plasma'|'inferno'|'void'|'solar', bots:{cyon:1,magma:2}, seed })
 *   g.setHuman({ team:'cyon' })                               -> the host-driven player (id 'you')
 *   g.step(dt, { you:{ x,y,z, vx,vz, boosting, air } })     -> events [{type, ...}]   (bots + ball are simulated here)
 *   g.heightAt(x,z)   rim quarter-pipe floor height (m)       g.walls()  wall-ride face segments along the rim (m)
 *   g.state           { mode, clock, score{cyon,magma}, paint{cyon,magma,total}, ball{x,y,z,vx,vy,vz,r}, players[], pads[], ups[], over, winner }
 * Events: kickoff | grab | shot | drop | bolt | hit | goal | demo | boost | pickup | power | respawn | overtime | end.
 *   BALL POSSESSION (owner 2026-10-15): touch the loose ball = you HOLD it (carried in front of the board); ATTACK = shoot it along your
 *   heading. Rammed by a rival (>= 8 m/s closing) or hit by a rival's attack bolt = you DROP it (+ short stun). ATTACK without the ball
 *   fires an energy bolt (1.1 s cooldown). Input: you:{ x,y,z, vx,vz, psi (heading, rad: 0 = +z), air, boosting, attack (edge) }.
 *   Boost meter 0..100 per player: small pad +12 (4 s respawn), big orb fills (10 s), rim strips +25. Boosting drains 30/s.
 *   Power-ups (15 s respawn): speed (x1.35, 5 s) | shield (8 s, no demos) | strong (next touch x1.8) | pulse (blast: shoves ball + rivals; paint bomb in paint mode).
 *   Demo: hit a rival at >= 15 m/s (or boosting >= 12) -> rival out 3 s, respawns at own goal (shield blocks).
 *   Paint: every player on the floor paints the 2 m cell under them; paint mode = most cells when the clock ends.
 */
(function (root) {
  'use strict';
  var BALLS = {
    regular: { name: 'Regular', grav: 9.0, bounce: 0.62, hit: 1.0, drag: 0.12, color: '#EEF3F7', glow: '#9FD8FF' },
    plasma: { name: 'Plasma Orb', grav: 9.0, bounce: 0.82, hit: 1.0, drag: 0.10, color: '#27E0FF', glow: '#7DF4FF' },
    inferno: { name: 'Inferno Core', grav: 11.5, bounce: 0.5, hit: 1.25, drag: 0.14, color: '#FF6A1A', glow: '#FFB15A' },
    void: { name: 'Void Sphere', grav: 5.2, bounce: 0.66, hit: 0.95, drag: 0.08, color: '#8A4BFF', glow: '#C79BFF' },
    solar: { name: 'Solar Flare', grav: 9.0, bounce: 0.6, hit: 1.15, drag: 0.11, color: '#FFC53D', glow: '#FFE89A' }
  };
  var TUNE = { holdFwd: 1.9, holdUp: 1.5, shotV: 30, shotLift: 5, shotCD: 0.6, regrab: 0.5, ramV: 8, ramStun: 0.6, boltV: 42, boltLife: 1.1, boltR: 1.7, boltCD: 1.1, boltStun: 0.8, botShootRange: 24,
    boardR: 1.1, maxV: 17, boostV: 24, boostDrain: 30, demoV: 15, demoBoostV: 12, demoOut: 3, kickoffWait: 2.5,
    leagueTime: 300, paintTime: 180, padR: 1.6, bigR: 2.4, upR: 2.2, padRespawn: 4, bigRespawn: 10, upRespawn: 15, ceiling: 26 };
  var POWERS = ['speed', 'shield', 'strong', 'pulse'];

  function rng(seed) { var s = (seed >>> 0) || 1; return function () { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 100000) / 100000; }; }

  function create(L, opts) {
    opts = opts || {};
    var A = L.A, B = L.B, QW = L.QP_W, QH = L.QP_H, BAR = L.BAR_H, rand = rng(opts.seed || 7);
    var mode = opts.mode === 'paint' ? 'paint' : 'league';
    var BK = BALLS[opts.ball] ? opts.ball : 'regular', BP = BALLS[BK];
    var cell = (L.paint && L.paint.cell) || 2, GX = Math.ceil(2 * A / cell), GZ = Math.ceil(2 * B / cell);
    var grid = new Int8Array(GX * GZ), floorCells = 0;   // 0 none · 1 cyon · -1 magma · 99 off-field
    for (var gi = 0; gi < GX; gi++) for (var gj = 0; gj < GZ; gj++) { var cx = -A + (gi + 0.5) * cell, cz = -B + (gj + 0.5) * cell; if (innerOffset(cx, cz) >= QW) floorCells++; else grid[gj * GX + gi] = 99; }

    function innerOffset(x, z) {   // metres inward from the ellipse edge (0 on/outside the edge)
      if ((x * x) / (A * A) + (z * z) / (B * B) >= 1) return 0;
      var lo = 0, hi = Math.min(A, B);
      for (var i = 0; i < 26; i++) { var m = (lo + hi) / 2, q = (x * x) / ((A - m) * (A - m)) + (z * z) / ((B - m) * (B - m)); if (q < 1) lo = m; else hi = m; }
      return (lo + hi) / 2;
    }
    function rimH(d) { if (d >= QW) return 0; var u = (QW - d) / QW; return QH * (1 - Math.sqrt(Math.max(0, 1 - u * u))); }
    function inTunnel(x, z) { return L.tunnelHalf && Math.abs(x) < L.tunnelHalf && z > 0; }
    function heightAt(x, z) { return inTunnel(x, z) ? 0 : rimH(innerOffset(x, z)); }
    function walls() {   // rim faces for world-hoverboard-wallride (the steep upper half of the quarter-pipe + barrier)
      var out = [], S = 48, d = QW * 0.12, y0 = rimH(d) * 0.55;
      for (var i = 0; i < S; i++) {
        var a0 = 2 * Math.PI * i / S, a1 = 2 * Math.PI * (i + 1) / S;
        var x0 = (A - d) * Math.cos(a0), z0 = (B - d) * Math.sin(a0), x1 = (A - d) * Math.cos(a1), z1 = (B - d) * Math.sin(a1);
        if (inTunnel((x0 + x1) / 2, (z0 + z1) / 2)) continue;
        out.push({ x0: x0, z0: z0, x1: x1, z1: z1, y0: y0, y1: QH + BAR });
      }
      return out;
    }

    var st = { mode: mode, ballKind: BK, clock: mode === 'paint' ? TUNE.paintTime : TUNE.leagueTime, score: { cyon: 0, magma: 0 }, paint: { cyon: 0, magma: 0, total: floorCells },
      ball: { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, r: (L.ball && L.ball.r) || 1.3, last: null, holder: null }, bolts: [], players: [], pads: [], ups: [], wait: 0, over: false, winner: null, t: 0 };
    (L.boostSmall || []).forEach(function (p) { st.pads.push({ x: p[0], z: p[1], big: false, t: 0 }); });
    (L.boostBig || []).forEach(function (p) { st.pads.push({ x: p[0], z: p[1], big: true, t: 0 }); });
    (L.powerups || []).forEach(function (p) { st.ups.push({ x: p[0], z: p[1], t: 0, kind: POWERS[Math.floor(rand() * POWERS.length)] }); });
    var goals = L.goals || [];
    function goalOf(team) { for (var i = 0; i < goals.length; i++) if (goals[i].team === team) return goals[i]; return null; }
    function other(t) { return t === 'cyon' ? 'magma' : 'cyon'; }

    function addPlayer(id, team, bot) {
      var p = { id: id, team: team, bot: !!bot, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, psi: 0, stun: 0, atkCD: 0, grabCD: 0, boost: 34, boosting: false, air: false, out: 0, power: null, powerT: 0, strong: false, aiT: 0, tx: 0, tz: 0 };
      st.players.push(p); return p;
    }
    var bots = opts.bots || { cyon: 1, magma: 2 }, human = null;
    function setHuman(o) { human = addPlayer('you', (o && o.team) || 'cyon', false); return human; }
    ['cyon', 'magma'].forEach(function (t) { for (var i = 0; i < (bots[t] || 0); i++) addPlayer(t + '-bot' + (i + 1), t, true); });

    function spawnAt(p, k) {   // in front of own goal, spread across z
      var g = goalOf(p.team), side = g ? Math.sign(g.x) : (p.team === 'cyon' ? 1 : -1);
      p.x = side * (A - QW - 10); p.z = (k % 3 - 1) * 9; p.y = 0; p.vx = p.vz = p.vy = 0; p.out = 0;
    }
    function kickoff() {
      var b = st.ball; b.x = (L.ball && L.ball.x) || 0; b.z = (L.ball && L.ball.z) || 0; b.y = ((L.ball && L.ball.y) || 3) + b.r; b.vx = b.vz = 0; b.vy = 0; b.last = null; b.holder = null; st.bolts.length = 0;
      var k = { cyon: 0, magma: 0 }; st.players.forEach(function (p) { if (p.bot) spawnAt(p, k[p.team]++); p.boost = Math.max(p.boost, 34); });
      st.wait = TUNE.kickoffWait; return { type: 'kickoff', ball: BK };
    }

    function byId(id) { for (var i = 0; i < st.players.length; i++) if (st.players[i].id === id) return st.players[i]; return null; }
    function holdPos(p) { return { x: p.x + Math.sin(p.psi) * TUNE.holdFwd, y: p.y + TUNE.holdUp, z: p.z + Math.cos(p.psi) * TUNE.holdFwd }; }
    function grab(p, ev) {   // loose ball within reach -> held
      var b = st.ball; if (b.holder || p.grabCD > 0 || p.stun > 0 || p.out > 0) return;
      if (Math.hypot(b.x - p.x, b.y - (p.y + 0.8), b.z - p.z) > b.r + TUNE.boardR + 0.4) return;
      b.holder = p.id; b.last = p.id; b.vx = b.vy = b.vz = 0; ev.push({ type: 'grab', id: p.id, team: p.team });
    }
    function release(p, vx, vy, vz) { var b = st.ball, h = holdPos(p); b.holder = null; b.x = h.x; b.y = Math.max(h.y, heightAt(h.x, h.z) + b.r); b.z = h.z; b.vx = vx; b.vy = vy; b.vz = vz; p.grabCD = TUNE.regrab; }
    function shoot(p, ev) {
      var mul = BP.hit * (p.strong ? 1.8 : 1), v = TUNE.shotV * mul + Math.hypot(p.vx, p.vz) * 0.4;
      release(p, Math.sin(p.psi) * v, TUNE.shotLift * mul + (p.air ? 2 : 0), Math.cos(p.psi) * v);
      if (p.strong) { p.strong = false; ev.push({ type: 'power', id: p.id, kind: 'strong-hit' }); }
      p.atkCD = TUNE.shotCD; ev.push({ type: 'shot', id: p.id, team: p.team, speed: Math.round(v) });
    }
    function drop(p, by, ev, why) {
      if (st.ball.holder !== p.id) return; var q = by ? byId(by) : null;
      release(p, (q ? q.vx * 0.7 : p.vx * 0.3) + (rand() - 0.5) * 4, 6, (q ? q.vz * 0.7 : p.vz * 0.3) + (rand() - 0.5) * 4);
      p.stun = why === 'bolt' ? TUNE.boltStun : TUNE.ramStun; ev.push({ type: 'drop', id: p.id, by: by || null, why: why });
    }
    function attack(p, ev) {
      if (p.atkCD > 0 || p.stun > 0 || p.out > 0) return;
      if (st.ball.holder === p.id) return shoot(p, ev);
      var s_ = Math.sin(p.psi), c_ = Math.cos(p.psi);
      st.bolts.push({ x: p.x + s_ * 1.4, y: p.y + 1.2, z: p.z + c_ * 1.4, vx: s_ * TUNE.boltV + p.vx * 0.5, vz: c_ * TUNE.boltV + p.vz * 0.5, team: p.team, owner: p.id, t: TUNE.boltLife });
      p.atkCD = TUNE.boltCD; ev.push({ type: 'bolt', id: p.id, team: p.team });
    }
    function boltsStep(dt, ev) {
      for (var i = st.bolts.length - 1; i >= 0; i--) {
        var bo = st.bolts[i]; bo.t -= dt; bo.x += bo.vx * dt; bo.z += bo.vz * dt;
        var hit = null;
        for (var j = 0; j < st.players.length; j++) { var q = st.players[j]; if (q.team === bo.team || q.out > 0) continue; if (Math.hypot(q.x - bo.x, q.z - bo.z, q.y + 1 - bo.y) < TUNE.boltR) { hit = q; break; } }
        if (hit) {
          if (hit.power === 'shield') ev.push({ type: 'hit', id: hit.id, by: bo.owner, blocked: true });
          else { ev.push({ type: 'hit', id: hit.id, by: bo.owner, x: hit.x, y: hit.y, z: hit.z }); if (st.ball.holder === hit.id) drop(hit, bo.owner, ev, 'bolt'); else hit.stun = Math.max(hit.stun, TUNE.boltStun * 0.6); }
          st.bolts.splice(i, 1); continue;
        }
        if (bo.t <= 0 || (bo.x * bo.x) / (A * A) + (bo.z * bo.z) / (B * B) > 1) st.bolts.splice(i, 1);
      }
    }
    function rams(ev) {
      var b = st.ball; if (!b.holder) return; var c = byId(b.holder); if (!c || c.power === 'shield') return;
      for (var j = 0; j < st.players.length; j++) {
        var q = st.players[j]; if (q.team === c.team || q.out > 0 || q.stun > 0) continue;
        var dx = c.x - q.x, dz = c.z - q.z, d = Math.hypot(dx, dz, c.y - q.y); if (d > TUNE.boardR * 2.2) continue;
        var closing = ((q.vx - c.vx) * dx + (q.vz - c.vz) * dz) / (Math.hypot(dx, dz) || 1);
        if (closing >= TUNE.ramV) { drop(c, q.id, ev, 'ram'); return; }
      }
    }
    function goalCheck(px, ev) {   // ball crossed a hoop plane inside the ring (thrown OR carried through)
      var b = st.ball;
      for (var gi2 = 0; gi2 < goals.length; gi2++) {
        var g = goals[gi2], side = Math.sign(g.x);
        if ((px - g.x) * side < 0 && (b.x - g.x) * side >= 0 && Math.hypot(b.y - g.y, b.z - g.z) < g.r - b.r * 0.4) {
          var scorer = other(g.team); st.score[scorer]++; ev.push({ type: 'goal', team: scorer, by: b.last, carried: !!b.holder, score: { cyon: st.score.cyon, magma: st.score.magma } });
          ev.push(kickoff()); return true;
        }
      }
      return false;
    }
    function heldStep(ev) { var b = st.ball, c = byId(b.holder); if (!c || c.out > 0) { b.holder = null; return; } var px = b.x, h = holdPos(c); b.x = h.x; b.y = h.y; b.z = h.z; b.vx = c.vx; b.vz = c.vz; b.vy = 0; goalCheck(px, ev); }

    function ballStep(dt, ev) {
      var b = st.ball, sub = 4, h = dt / sub;
      for (var s = 0; s < sub; s++) {
        b.vy -= BP.grav * h; var dr = Math.max(0, 1 - BP.drag * h); b.vx *= dr; b.vz *= dr;
        var px = b.x; b.x += b.vx * h; b.y += b.vy * h; b.z += b.vz * h;
        if (goalCheck(px, ev)) return;
        // floor + quarter-pipe
        var d = innerOffset(b.x, b.z), gH = inTunnel(b.x, b.z) ? 0 : rimH(d);
        if (b.y - b.r < gH) {
          var e = 0.25, hx = heightAt(b.x + e, b.z) - heightAt(b.x - e, b.z), hz = heightAt(b.x, b.z + e) - heightAt(b.x, b.z - e);
          var nx = -hx / (2 * e), nz = -hz / (2 * e), ny = 1, nl = Math.hypot(nx, ny, nz); nx /= nl; ny /= nl; nz /= nl;
          var vn = b.vx * nx + b.vy * ny + b.vz * nz;
          if (vn < 0) { b.vx -= (1 + BP.bounce) * vn * nx; b.vy -= (1 + BP.bounce) * vn * ny; b.vz -= (1 + BP.bounce) * vn * nz; var fr = 1 - 0.5 * h; b.vx *= fr; b.vz *= fr; }
          b.y = gH + b.r;
        }
        // barrier (ellipse edge) + ceiling
        if ((b.x * b.x) / (A * A) + (b.z * b.z) / (B * B) > 1 && !inTunnel(b.x, b.z)) {
          var ex = b.x / (A * A), ez = b.z / (B * B), el = Math.hypot(ex, ez); ex /= el; ez /= el;
          var k = 1 / Math.sqrt((b.x * b.x) / (A * A) + (b.z * b.z) / (B * B)); b.x *= k * 0.999; b.z *= k * 0.999;
          var vr = b.vx * ex + b.vz * ez; if (vr > 0) { b.vx -= (1 + BP.bounce) * vr * ex; b.vz -= (1 + BP.bounce) * vr * ez; }
        }
        if (inTunnel(b.x, b.z) && b.z > B - 2) { b.z = B - 2; b.vz = -Math.abs(b.vz) * BP.bounce; }
        if (b.y + b.r > TUNE.ceiling) { b.y = TUNE.ceiling - b.r; b.vy = -Math.abs(b.vy) * BP.bounce; }
      }
    }

    var botEv = [];
    function botStep(p, dt) {
      if (p.out > 0) return;
      if (p.stun > 0) { p.vx *= 0.9; p.vz *= 0.9; p.x += p.vx * dt; p.z += p.vz * dt; return; }
      var b = st.ball, tx, tz;
      p.aiT -= dt;
      if (mode === 'paint') {
        if (p.aiT <= 0) { var best = null; for (var k = 0; k < 14; k++) { var a = rand() * 6.283, r = Math.sqrt(rand()) * 0.8; var cx = Math.cos(a) * (A - QW) * r, cz = Math.sin(a) * (B - QW) * r; var c = cellAt(cx, cz); var own = c >= 0 && grid[c] === (p.team === 'cyon' ? 1 : -1); if (!own) { best = [cx, cz]; break; } } best = best || [0, 0]; p.tx = best[0]; p.tz = best[1]; p.aiT = 2.5 + rand() * 2; }
        tx = p.tx; tz = p.tz;
      } else {
        var eg = goalOf(other(p.team)) || { x: 0, z: 0, y: 5.5 }, own = goalOf(p.team), holder = b.holder ? byId(b.holder) : null;
        if (holder === p) {                                                     // carry to the rival hoop, shoot when in range
          tx = eg.x * 0.8; tz = eg.z;
          if (Math.hypot(eg.x - p.x, eg.z - p.z) < TUNE.botShootRange && p.atkCD <= 0) { p.psi = Math.atan2(eg.x - p.x, eg.z - p.z); attack(p, botEv); }
        } else if (holder && holder.team !== p.team) {                          // chase the carrier: ram, or bolt from range
          tx = holder.x + holder.vx * 0.3; tz = holder.z + holder.vz * 0.3;
          var hd = Math.hypot(holder.x - p.x, holder.z - p.z);
          if (hd < 22 && hd > 6 && p.atkCD <= 0 && rand() < 0.04) { p.psi = Math.atan2(holder.x - p.x, holder.z - p.z); attack(p, botEv); }
        } else if (holder) { tx = (holder.x + eg.x) / 2; tz = holder.z > 0 ? -12 : 12; }   // team-mate has it: support lane
        else { tx = b.x; tz = b.z; }                                                       // loose ball: go get it
        if (own && p.id.slice(-1) === '2' && holder !== p) { var od = Math.hypot(b.x - own.x, b.z - own.z); if (od > 30) { tx = own.x * 0.78; tz = b.z * 0.3; } }   // 2nd bot keeps goal
      }
      var dx = tx - p.x, dz = tz - p.z, dl = Math.hypot(dx, dz) || 1;
      p.boosting = p.boost > 10 && dl > 18; var vmax = (p.boosting ? TUNE.boostV : TUNE.maxV) * (p.power === 'speed' ? 1.35 : 1) * 0.92;
      var ax = dx / dl * vmax - p.vx, az = dz / dl * vmax - p.vz, al = Math.hypot(ax, az), acc = 26 * dt;
      if (al > acc) { ax = ax / al * acc; az = az / al * acc; }
      p.vx += ax; p.vz += az; p.x += p.vx * dt; p.z += p.vz * dt;
      if (b.holder === p.id) p.psi = Math.atan2(dx, dz); else if (Math.hypot(p.vx, p.vz) > 0.5) p.psi = Math.atan2(p.vx, p.vz);
      if (mode === 'league' && !p.air && !b.holder && b.y > 3.2 && Math.hypot(b.x - p.x, b.z - p.z) < 6) { p.vy = 9; p.air = true; }
      if (p.air) { p.vy -= 18 * dt; p.y += p.vy * dt; }
      var gH = heightAt(p.x, p.z); if (p.y <= gH) { p.y = gH; p.vy = 0; p.air = false; }
      if ((p.x * p.x) / (A * A) + (p.z * p.z) / (B * B) > 0.97) { var k2 = Math.sqrt(0.97 / ((p.x * p.x) / (A * A) + (p.z * p.z) / (B * B))); p.x *= k2; p.z *= k2; p.vx *= 0.5; p.vz *= 0.5; }
    }

    function cellAt(x, z) { var i = Math.floor((x + A) / cell), j = Math.floor((z + B) / cell); if (i < 0 || j < 0 || i >= GX || j >= GZ) return -1; var c = j * GX + i; return grid[c] === 99 ? -1 : c; }
    var dirty = [];
    function paintAt(x, z, team) { var c = cellAt(x, z); if (c < 0) return; var v = team === 'cyon' ? 1 : -1; if (grid[c] === v) return; if (grid[c] === -v) st.paint[other(team)]--; grid[c] = v; st.paint[team]++; dirty.push(c); }
    function paintBlast(x, z, team, r) { for (var dx = -r; dx <= r; dx += cell) for (var dz = -r; dz <= r; dz += cell) if (dx * dx + dz * dz <= r * r) paintAt(x + dx, z + dz, team); }

    function pickups(p, ev) {
      st.pads.forEach(function (pd) {
        if (pd.t > 0) return; if (Math.hypot(p.x - pd.x, p.z - pd.z) > (pd.big ? TUNE.bigR : TUNE.padR) || p.y > 3) return;
        if (!pd.big && p.boost >= 100) return;
        p.boost = pd.big ? 100 : Math.min(100, p.boost + 12); pd.t = pd.big ? TUNE.bigRespawn : TUNE.padRespawn; ev.push({ type: 'boost', id: p.id, big: pd.big });
      });
      (L.wallBoost || []).forEach(function (wb, i) {
        var a = wb[0] * Math.PI / 180, d = wb[1], x = (A - d) * Math.cos(a), z = (B - d) * Math.sin(a);
        if (Math.hypot(p.x - x, p.z - z) < 3 && (p.wbT = p.wbT || {})[i] === undefined) { p.boost = Math.min(100, p.boost + 25); p.wbT[i] = 3; ev.push({ type: 'boost', id: p.id, wall: true }); }
      });
      st.ups.forEach(function (u) {
        if (u.t > 0 || p.y > 3.5 || Math.hypot(p.x - u.x, p.z - u.z) > TUNE.upR) return;
        u.t = TUNE.upRespawn; var kind = u.kind; u.kind = POWERS[Math.floor(rand() * POWERS.length)];
        if (kind === 'strong') p.strong = true;
        else if (kind === 'pulse') pulse(p, ev);
        else { p.power = kind; p.powerT = kind === 'speed' ? 5 : 8; }
        ev.push({ type: 'pickup', id: p.id, kind: kind });
      });
    }
    function pulse(p, ev) {
      var b = st.ball, R = 12;
      if (mode === 'paint') paintBlast(p.x, p.z, p.team, 8);
      var d = Math.hypot(b.x - p.x, b.z - p.z); if (d < R) { var k = (R - d) / R * 22; b.vx += (b.x - p.x) / (d || 1) * k; b.vz += (b.z - p.z) / (d || 1) * k; b.vy += k * 0.5; }
      st.players.forEach(function (q) { if (q.team === p.team || q.out > 0) return; var dq = Math.hypot(q.x - p.x, q.z - p.z); if (dq < R) { var kq = (R - dq) / R * 18; q.vx += (q.x - p.x) / (dq || 1) * kq; q.vz += (q.z - p.z) / (dq || 1) * kq; } });
      ev.push({ type: 'power', id: p.id, kind: 'pulse', x: p.x, z: p.z });
    }
    function demos(ev) {
      for (var i = 0; i < st.players.length; i++) {
        var p = st.players[i]; if (p.out > 0) continue; var v = Math.hypot(p.vx, p.vz);
        if (v < (p.boosting ? TUNE.demoBoostV : TUNE.demoV)) continue;
        for (var j = 0; j < st.players.length; j++) {
          var q = st.players[j]; if (q.team === p.team || q.out > 0 || q.power === 'shield') continue;
          if (Math.hypot(q.x - p.x, q.z - p.z, q.y - p.y) < TUNE.boardR * 2) {
            if (st.ball.holder === q.id) drop(q, p.id, ev, 'demo');
            q.out = TUNE.demoOut; ev.push({ type: 'demo', by: p.id, victim: q.id, x: q.x, y: q.y, z: q.z });
          }
        }
      }
    }

    function step(dt, input, evOut) {
      var ev = evOut || []; dt = Math.min(0.05, Math.max(0, dt)); st.t += dt; dirty.length = 0;
      if (st.over) return ev;
      if (st.t === dt) ev.push(kickoff());
      if (human && input && input.you) { var u = input.you; human.x = u.x; human.y = u.y || 0; human.z = u.z; human.vx = u.vx || 0; human.vz = u.vz || 0; human.air = !!u.air; human.boosting = !!u.boosting && human.boost > 0; if (u.psi != null) human.psi = u.psi; }
      st.pads.forEach(function (pd) { if (pd.t > 0) pd.t = Math.max(0, pd.t - dt); }); st.ups.forEach(function (u2) { if (u2.t > 0) u2.t = Math.max(0, u2.t - dt); });
      st.players.forEach(function (p) {
        if (p.wbT) for (var k in p.wbT) { p.wbT[k] -= dt; if (p.wbT[k] <= 0) delete p.wbT[k]; }
        if (p.atkCD > 0) p.atkCD -= dt; if (p.grabCD > 0) p.grabCD -= dt; if (p.stun > 0) p.stun = Math.max(0, p.stun - dt);
        if (p.powerT > 0) { p.powerT -= dt; if (p.powerT <= 0) { p.power = null; p.powerT = 0; } }
        if (p.out > 0) { p.out -= dt; if (p.out <= 0) { p.out = 0; if (p.bot) spawnAt(p, 1); ev.push({ type: 'respawn', id: p.id }); } return; }
        if (p.boosting) p.boost = Math.max(0, p.boost - TUNE.boostDrain * dt);
      });
      if (st.wait > 0) { st.wait -= dt; st.players.forEach(function (p) { if (p.bot) { p.vx *= 0.8; p.vz *= 0.8; } }); }
      else {
        botEv.length = 0; st.players.forEach(function (p) { if (p.bot) botStep(p, dt); }); for (var be = 0; be < botEv.length; be++) ev.push(botEv[be]);
        if (human && input && input.you && input.you.attack) attack(human, ev);
        boltsStep(dt, ev);
        if (mode === 'league') {
          rams(ev);
          if (st.ball.holder) heldStep(ev); else { ballStep(dt, ev); if (!st.ball.holder && st.wait <= 0) st.players.forEach(function (p) { if (p.out <= 0) grab(p, ev); }); }
        }
        st.players.forEach(function (p) { if (p.out > 0) return; pickups(p, ev); if (!p.air && p.y < 1.5) paintAt(p.x, p.z, p.team); });
        demos(ev);
        st.clock -= dt;
      }
      if (st.clock <= 0 && !st.over) {
        st.clock = 0; var a = mode === 'paint' ? st.paint.cyon : st.score.cyon, b2 = mode === 'paint' ? st.paint.magma : st.score.magma;
        if (mode === 'league' && a === b2 && !st.overtime) { st.overtime = true; st.clock = 60; ev.push({ type: 'overtime' }); }
        else { st.over = true; st.winner = a === b2 ? 'draw' : (a > b2 ? 'cyon' : 'magma'); ev.push({ type: 'end', winner: st.winner, score: st.score, paint: st.paint }); }
      }
      return ev;
    }

    return {
      state: st, step: step, setHuman: setHuman, heightAt: heightAt, innerOffset: innerOffset, walls: walls, kickoff: kickoff,
      paintGrid: function () { return { grid: grid, GX: GX, GZ: GZ, cell: cell, A: A, B: B }; }, dirtyCells: function () { return dirty; },
      attack: function (id, evOut) { var p = byId(id); if (p) attack(p, evOut || []); return evOut; }, holder: function () { return st.ball.holder; },
      ballInfo: function () { return Object.assign({ id: BK }, BP); }, pulse: function (id, evOut) { var p = st.players.filter(function (q) { return q.id === id; })[0]; if (p) pulse(p, evOut || []); }
    };
  }

  var API = { create: create, BALLS: BALLS, TUNE: TUNE, POWERS: POWERS };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  root.HoverLeagueCore = API;
})(typeof window !== 'undefined' ? window : globalThis);
