/* world-naval.js — NAVAL BATTLE: the rules + simulation for the Colosseum water field (owner 2026-10-01): first-person boat combat with cannons / energy cannons / torpedoes,
 * pickups in the water (ammo, repair, shield, speed), sea monsters that attack ANY boat, boat classes (armor vs speed vs submersible), and three game modes.
 * PURE SIM (no THREE, no DOM): world-naval-view.js draws it. Metres, x east, z south; heading psi 0 = +z (south), clockwise like the rest of the world.
 *
 *   var g = WorldNaval.create({ mode:'fleet'|'hunt'|'salvage', A:62, B:44, seed, boats:[{id, cls, team, ai?, name?}], monsters?:bool, timeLimitS? })
 *   g.step(dt, inputs)  inputs[id] = { thr:-1..1, turn:-1..1, fire:bool (primary), alt:bool (secondary: opposite broadside / torpedo), special:bool (boost / dive toggle) }
 *   g.state() -> { t, mode, boats[], shots[], pickups[], monsters[], wave, over, winner, score }      g.drain() -> events since last drain
 *   Boat classes:  galleon (retro: heavy armor, broadsides, slow)  ·  skimmer (energy cannon, boost, fast, fragile)  ·  nautilus (submarine: dive = immune to cannons/energy, torpedoes)
 *   Modes: FLEET two teams until one is sunk (monsters optional)  ·  HUNT co-op waves of serpents + a kraken every 3rd wave (win wave 5)  ·  SALVAGE collect crates, first to 12 wins, monsters roam
 */
(function (root) {
  'use strict';
  var CLASSES = {
    galleon: { name: 'Galleon', style: 'retro', hp: 240, armor: 6, speed: 7, accel: 3, turn: 0.9, r: 4.2, ammo: 28, reload: 2.1, dmg: 30, note: 'Retro sailing ship: thick hull, two broadsides.' },
    skimmer: { name: 'Skimmer', style: 'energy', hp: 110, armor: 2, speed: 14, accel: 8, turn: 2.0, r: 2.3, heatPer: 17, heatCool: 26, dmg: 13, boostMul: 1.8, boostS: 1.5, boostCd: 8, note: 'Energy hull: fast, fragile, never runs out of ammo (it overheats).' },
    nautilus: { name: 'Nautilus', style: 'sub', hp: 160, armor: 4, speed: 9, subSpeed: 6, accel: 4, turn: 1.3, r: 3.2, torp: 7, reload: 3.2, dmg: 62, diveS: 12, diveRecharge: 4, note: 'Submarine: dive to dodge cannons and energy, hit hard with torpedoes.' }
  };
  var SHOT = { cannon: { v: 42, life: 1.8, r: 1.2 }, energy: { v: 60, life: 1.2, r: 1.0 }, torpedo: { v: 19, life: 7, r: 1.6 } };
  var PICK = { ammo: 1, repair: 1, shield: 1, speed: 1, crate: 1 };
  var MON = { serpent: { hp: 130, speed: 8.5, r: 2.4, bite: 22, cd: 1.8 }, kraken: { hp: 520, r: 6, slam: 48, slamR: 7, tele: 1.3, cd: 4.5, reach: 34 } };
  function rng(seed) { var s = (seed >>> 0) || 1; return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
  function wrapPi(a) { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; }
  function hyp(a, b) { return Math.sqrt(a * a + b * b); }

  function create(o) {
    var A = o.A || 62, B = o.B || 44, rand = rng(o.seed || 1), mode = o.mode || 'fleet', t = 0, events = [], boats = [], shots = [], pickups = [], monsters = [], nextId = 1;
    var G = { over: false, winner: null, wave: 0, score: {}, timeLimitS: o.timeLimitS || (mode === 'fleet' ? 180 : mode === 'salvage' ? 120 : 600), monstersOn: o.monsters != null ? !!o.monsters : mode !== 'fleet' };
    var pickCd = 3, monCd = mode === 'fleet' ? 60 : 8;
    function ev(type, d) { d = d || {}; d.type = type; d.t = +t.toFixed(2); events.push(d); }
    function inside(x, z, k) { k = k || 1; return (x * x) / ((A * k) * (A * k)) + (z * z) / ((B * k) * (B * k)) <= 1; }
    function randIn(k) { var a = rand() * Math.PI * 2, r = Math.sqrt(rand()) * (k || 0.8); return { x: Math.cos(a) * A * r, z: Math.sin(a) * B * r }; }
    function mkBoat(d, i, n) {
      var C = CLASSES[d.cls] || CLASSES.skimmer, side = d.team === 'B' ? 1 : -1, y = (i - (n - 1) / 2) * 12;
      var b = { id: d.id, cls: d.cls in CLASSES ? d.cls : 'skimmer', name: d.name || d.id, team: d.team || d.id, ai: !!d.ai, x: mode === 'fleet' ? side * A * 0.7 : (i - (n - 1) / 2) * 10, z: mode === 'fleet' ? y : B * 0.55, psi: mode === 'fleet' ? (side < 0 ? Math.PI / 2 : -Math.PI / 2) : Math.PI,
        v: 0, hp: C.hp, hpMax: C.hp, alive: true, respawn: 0, sunk: 0, kills: 0, shield: 0, speedT: 0, cd: 0, cdAlt: 0, heat: 0, locked: false, ammo: C.ammo != null ? C.ammo : null, torp: C.torp != null ? C.torp : null,
        sub: false, subLeft: C.diveS || 0, boostT: 0, boostCd: 0, crates: 0, last: { fire: false, special: false } };
      return b;
    }
    var counts = {}; (o.boats || []).forEach(function (d) { counts[d.team || d.id] = (counts[d.team || d.id] || 0) + 1; });
    var seen = {}; (o.boats || []).forEach(function (d) { var k = d.team || d.id; seen[k] = (seen[k] || 0); boats.push(mkBoat(d, seen[k]++, counts[k])); G.score[d.team || d.id] = 0; });
    function boat(id) { for (var i = 0; i < boats.length; i++) if (boats[i].id === id) return boats[i]; return null; }
    function hostile(a, b) { return mode === 'fleet' ? a.team !== b.team : false; }   // hunt/salvage: boats never shoot each other (salvage ramming only)

    function spawnShot(b, kind, ang, dmg) {
      var S = SHOT[kind], C = CLASSES[b.cls]; shots.push({ id: nextId++, kind: kind, owner: b.id, team: b.team, x: b.x + Math.sin(ang) * C.r, z: b.z + Math.cos(ang) * C.r, vx: Math.sin(ang) * S.v + Math.sin(b.psi) * b.v * 0.3, vz: Math.cos(ang) * S.v + Math.cos(b.psi) * b.v * 0.3, life: S.life, dmg: dmg, r: S.r, ang: ang });
      ev('fire', { id: b.id, kind: kind, x: b.x, z: b.z, ang: ang });
    }
    function fire(b, inp) {
      var C = CLASSES[b.cls];
      if (b.cls === 'galleon') {   // broadsides: fire = starboard (+90 deg), alt = port (-90). each side has its own reload so you can alternate
        if (inp.fire && b.cd <= 0 && b.ammo > 0) { b.cd = C.reload; b.ammo--; [-0.12, 0, 0.12].forEach(function (s) { spawnShot(b, 'cannon', b.psi + Math.PI / 2 + s, C.dmg); }); }
        if (inp.alt && b.cdAlt <= 0 && b.ammo > 0) { b.cdAlt = C.reload; b.ammo--; [-0.12, 0, 0.12].forEach(function (s) { spawnShot(b, 'cannon', b.psi - Math.PI / 2 + s, C.dmg); }); }
      } else if (b.cls === 'skimmer') {
        if (b.locked && b.heat <= 25) b.locked = false;
        if (inp.fire && b.cd <= 0 && !b.locked) { b.cd = 0.3; b.heat += C.heatPer; spawnShot(b, 'energy', b.psi, C.dmg); if (b.heat >= 100) { b.heat = 100; b.locked = true; ev('overheat', { id: b.id }); } }
      } else if (b.cls === 'nautilus') {
        if ((inp.fire || inp.alt) && b.cd <= 0 && b.torp > 0) { b.cd = C.reload; b.torp--; spawnShot(b, 'torpedo', b.psi, C.dmg); }
      }
    }
    function damage(b, amount, kind, srcId, pierce) {
      if (!b.alive) return 0;
      if (b.sub && (kind === 'cannon' || kind === 'energy')) { ev('miss', { id: b.id, why: 'submerged' }); return 0; }
      var C = CLASSES[b.cls], armor = C.armor * (pierce ? 0.5 : 1), d = Math.max(1, Math.round(amount - armor));
      if (b.shield > 0) { b.shield -= d; ev('hit', { id: b.id, dmg: 0, shield: true, src: srcId }); if (b.shield < 0) { d = -b.shield; b.shield = 0; } else return 0; }
      b.hp -= d; ev('hit', { id: b.id, dmg: d, kind: kind, src: srcId, hp: Math.max(0, b.hp) });
      if (b.hp <= 0) sink(b, srcId); return d;
    }
    function sink(b, srcId) {
      b.alive = false; b.hp = 0; b.sunk++; b.sub = false; b.respawn = mode === 'fleet' ? 0 : 6; ev('sunk', { id: b.id, by: srcId || null, x: b.x, z: b.z });
      var k = srcId && boat(srcId); if (k && k !== b) { k.kills++; if (mode === 'fleet') G.score[k.team] = (G.score[k.team] || 0) + 1; }
    }
    function move(b, dt, inp) {
      var C = CLASSES[b.cls], thr = Math.max(-1, Math.min(1, inp.thr || 0)), turn = Math.max(-1, Math.min(1, inp.turn || 0));
      var top = b.cls === 'nautilus' ? (b.sub ? C.subSpeed : C.speed) : C.speed, boost = b.boostT > 0 ? C.boostMul : 1, spd = (b.speedT > 0 ? 1.35 : 1) * boost;
      var target = thr * top * spd; b.v += Math.max(-C.accel * dt * 2, Math.min(C.accel * dt * 2, target - b.v)); b.v *= (1 - Math.min(1, 0.25 * dt));
      b.psi = wrapPi(b.psi + turn * C.turn * dt * (0.45 + 0.55 * Math.min(1, Math.abs(b.v) / (top * 0.6 + 0.01))));
      b.x += Math.sin(b.psi) * b.v * dt; b.z += Math.cos(b.psi) * b.v * dt;
      if (!inside(b.x, b.z, 0.97)) { var k = Math.sqrt((b.x * b.x) / (A * A) + (b.z * b.z) / (B * B)); b.x *= 0.97 / k; b.z *= 0.97 / k; b.v *= 0.5; ev('wall', { id: b.id }); }
    }
    function special(b, inp, dt) {
      var C = CLASSES[b.cls], edge = inp.special && !b.last.special;
      if (b.cls === 'skimmer') { b.boostCd = Math.max(0, b.boostCd - dt); if (b.boostT > 0) b.boostT -= dt; if (edge && b.boostCd <= 0) { b.boostT = C.boostS; b.boostCd = C.boostCd; ev('boost', { id: b.id }); } }
      if (b.cls === 'nautilus') {
        if (edge) { if (b.sub) { b.sub = false; ev('surface', { id: b.id }); } else if (b.subLeft > 1.5) { b.sub = true; ev('dive', { id: b.id }); } }
        if (b.sub) { b.subLeft -= dt; if (b.subLeft <= 0) { b.subLeft = 0; b.sub = false; ev('surface', { id: b.id, forced: true }); } } else b.subLeft = Math.min(C.diveS, b.subLeft + C.diveRecharge * dt);
      }
      b.last.special = !!inp.special;
    }
    // ----- AI -----
    function aiInput(b) {
      var inp = { thr: 0.9, turn: 0, fire: false, alt: false, special: false }, tgt = null, bd = 1e9, i, x, d;
      for (i = 0; i < boats.length; i++) { x = boats[i]; if (x !== b && x.alive && hostile(b, x)) { d = hyp(x.x - b.x, x.z - b.z); if (d < bd) { bd = d; tgt = x; } } }
      for (i = 0; i < monsters.length; i++) { x = monsters[i]; if (x.alive && x.state !== 'dive') { d = hyp(x.x - b.x, x.z - b.z) * (mode === 'hunt' ? 0.8 : 1.4); if (d < bd) { bd = d; tgt = x; } } }
      var want = null;
      if (b.hp < b.hpMax * 0.4 || (b.ammo !== null && b.ammo < 4) || mode === 'salvage') { var pd = 1e9; pickups.forEach(function (p) { if (mode === 'salvage' && p.kind !== 'crate') return; var dd = hyp(p.x - b.x, p.z - b.z); if (dd < pd) { pd = dd; want = p; } }); }
      var dest = want || tgt; if (!dest) return inp;
      var ang = Math.atan2(dest.x - b.x, dest.z - b.z), diff = wrapPi(ang - b.psi);
      if (b.cls === 'galleon' && !want) {   // want a broadside: keep the target 90 deg off the bow
        var side = diff > 0 ? Math.PI / 2 : -Math.PI / 2; diff = wrapPi(ang - side - b.psi); inp.turn = Math.max(-1, Math.min(1, diff * 2));
        var off = Math.abs(wrapPi(ang - b.psi)); inp.fire = bd < 55 && diff < 0.25 && diff > -0.25 && wrapPi(ang - b.psi) > 0; inp.alt = bd < 55 && Math.abs(diff) < 0.25 && wrapPi(ang - b.psi) < 0; inp.thr = bd < 28 ? 0.2 : 0.8;
      } else {
        inp.turn = Math.max(-1, Math.min(1, diff * 2.2)); inp.fire = !want && Math.abs(diff) < 0.18 && bd < (b.cls === 'nautilus' ? 60 : 50); inp.thr = want ? 1 : (bd < 18 ? 0.25 : 0.9);
        if (b.cls === 'skimmer' && bd > 30 && Math.abs(diff) < 0.3) inp.special = !b.last.special; if (b.cls === 'nautilus') inp.special = (b.hp < b.hpMax * 0.35 && !b.sub && b.subLeft > 3) ? !b.last.special : (b.sub && b.hp > b.hpMax * 0.6 ? !b.last.special : false);
      }
      return inp;
    }
    // ----- pickups -----
    function spawnPickup(kind) { var p = randIn(0.82); kind = kind || ['ammo', 'repair', 'shield', 'speed'][Math.floor(rand() * 4)]; pickups.push({ id: nextId++, kind: kind, x: p.x, z: p.z, life: 40 }); ev('pickup-spawn', { kind: kind, x: p.x, z: p.z }); }
    function collect(b, p) {
      var C = CLASSES[b.cls]; ev('pickup', { id: b.id, kind: p.kind });
      if (p.kind === 'ammo') { if (b.ammo !== null) b.ammo = Math.min(C.ammo * 1.5, b.ammo + 10); if (b.torp !== null) b.torp = Math.min(C.torp * 1.5, b.torp + 3); b.heat = 0; b.locked = false; }
      else if (p.kind === 'repair') b.hp = Math.min(b.hpMax, b.hp + 45); else if (p.kind === 'shield') b.shield = 45; else if (p.kind === 'speed') b.speedT = 8;
      else if (p.kind === 'crate') { b.crates++; G.score[b.team] = (G.score[b.team] || 0) + 1; }
    }
    // ----- monsters -----
    function spawnMonster(kind) {
      var p = randIn(0.7), M = MON[kind]; monsters.push({ id: nextId++, kind: kind, x: p.x, z: p.z, psi: 0, hp: M.hp, hpMax: M.hp, alive: true, state: 'surface', t: 0, cd: 2, target: null, tx: 0, tz: 0 }); ev('monster', { kind: kind, x: p.x, z: p.z });
    }
    function nearestBoat(x, z, maxD, includeSub) { var best = null, bd = maxD || 1e9; boats.forEach(function (b) { if (!b.alive || (b.sub && !includeSub)) return; var d = hyp(b.x - x, b.z - z); if (d < bd) { bd = d; best = b; } }); return best; }
    function monsterStep(m, dt) {
      if (!m.alive) return; var M = MON[m.kind]; m.t += dt; m.cd -= dt;
      if (m.kind === 'serpent') {
        var tg = nearestBoat(m.x, m.z, 1e9, true); if (!tg) return; var ang = Math.atan2(tg.x - m.x, tg.z - m.z); m.psi += wrapPi(ang - m.psi) * Math.min(1, dt * 3);
        var d = hyp(tg.x - m.x, tg.z - m.z); if (d > CLASSES[tg.cls].r + M.r) { m.x += Math.sin(m.psi) * M.speed * dt; m.z += Math.cos(m.psi) * M.speed * dt; } else if (m.cd <= 0) { m.cd = M.cd; damage(tg, M.bite, 'bite', 'serpent' + m.id); ev('monster-attack', { id: m.id, kind: 'serpent', x: tg.x, z: tg.z }); }
      } else {   // kraken: picks the nearest boat in reach, telegraphs, slams an area (hits submerged boats too), then rests
        if (m.state === 'surface') { var tb = nearestBoat(m.x, m.z, M.reach, true); if (tb && m.cd <= 0) { m.state = 'wind'; m.t = 0; m.tx = tb.x; m.tz = tb.z; ev('kraken-wind', { id: m.id, x: m.tx, z: m.tz }); } }
        else if (m.state === 'wind' && m.t >= M.tele) { boats.forEach(function (b) { if (b.alive && hyp(b.x - m.tx, b.z - m.tz) <= M.slamR + CLASSES[b.cls].r) damage(b, M.slam, 'tentacle', 'kraken' + m.id); }); ev('kraken-slam', { id: m.id, x: m.tx, z: m.tz, r: M.slamR }); m.state = 'surface'; m.cd = M.cd; m.t = 0; }
      }
    }
    // ----- shots -----
    function shotStep(s, dt) {
      s.x += s.vx * dt; s.z += s.vz * dt; s.life -= dt; if (s.kind === 'torpedo') { var tg = null, bd = 28; boats.forEach(function (b) { if (b.alive && b.team !== s.team && hostileTo(s, b)) { var d = hyp(b.x - s.x, b.z - s.z); if (d < bd) { bd = d; tg = b; } } }); monsters.forEach(function (m) { if (m.alive) { var d = hyp(m.x - s.x, m.z - s.z); if (d < bd) { bd = d; tg = m; } } }); if (tg) { var want = Math.atan2(tg.x - s.x, tg.z - s.z), cur = Math.atan2(s.vx, s.vz), na = cur + wrapPi(want - cur) * Math.min(1, dt * 1.2); s.vx = Math.sin(na) * SHOT.torpedo.v; s.vz = Math.cos(na) * SHOT.torpedo.v; } }
      if (!inside(s.x, s.z, 1.02)) { s.life = 0; return; }
      for (var i = 0; i < boats.length; i++) { var b = boats[i]; if (!b.alive || b.id === s.owner || !hostileTo(s, b)) continue; if (b.sub && s.kind !== 'torpedo') continue; if (hyp(b.x - s.x, b.z - s.z) <= CLASSES[b.cls].r + s.r) { damage(b, s.dmg, s.kind, s.owner, s.kind === 'torpedo'); s.life = 0; return; } }
      for (var j = 0; j < monsters.length; j++) { var m = monsters[j]; if (!m.alive) continue; if (hyp(m.x - s.x, m.z - s.z) <= MON[m.kind].r + s.r) { m.hp -= s.kind === 'torpedo' ? s.dmg * 1.3 : s.dmg; ev('monster-hit', { id: m.id, hp: Math.max(0, m.hp), by: s.owner }); s.life = 0; if (m.hp <= 0) { m.alive = false; ev('monster-dead', { id: m.id, kind: m.kind, by: s.owner }); var ow = boat(s.owner); if (ow) { ow.kills++; G.score[ow.team] = (G.score[ow.team] || 0) + (m.kind === 'kraken' ? 5 : 1); } } return; } }
    }
    function hostileTo(s, b) { return mode === 'fleet' ? b.team !== s.team : false; }

    function checkEnd() {
      if (G.over) return;
      if (mode === 'fleet') { var alive = {}; boats.forEach(function (b) { if (b.alive) alive[b.team] = 1; }); var teams = Object.keys(alive); if (teams.length <= 1) return end(teams[0] || null, 'sunk'); }
      else if (mode === 'salvage') { var top = null; Object.keys(G.score).forEach(function (k) { if (G.score[k] >= 12 && (!top || G.score[k] > G.score[top])) top = k; }); if (top) return end(top, 'crates'); }
      else if (mode === 'hunt') { if (boats.every(function (b) { return !b.alive && b.respawn <= 0; })) return end(null, 'defeat'); if (G.wave >= 5 && !monsters.some(function (m) { return m.alive; }) && monCd <= 0) return end('crew', 'cleared'); }
      if (t >= G.timeLimitS) { var best = null, bs = -1; if (mode === 'fleet') { var hp = {}; boats.forEach(function (b) { hp[b.team] = (hp[b.team] || 0) + Math.max(0, b.hp); }); Object.keys(hp).forEach(function (k) { if (hp[k] > bs) { bs = hp[k]; best = k; } }); } else Object.keys(G.score).forEach(function (k) { if (G.score[k] > bs) { bs = G.score[k]; best = k; } }); end(best, 'time'); }
    }
    function end(winner, why) { G.over = true; G.winner = winner; ev('end', { winner: winner, why: why }); }

    function step(dt, inputs) {
      if (G.over) return; dt = Math.min(dt, 0.1); t += dt; inputs = inputs || {};
      boats.forEach(function (b) {
        if (!b.alive) { if (b.respawn > 0) { b.respawn -= dt; if (b.respawn <= 0) { var p = randIn(0.6); b.x = p.x; b.z = p.z; b.hp = Math.round(b.hpMax * 0.6); b.alive = true; b.v = 0; b.shield = 8; ev('respawn', { id: b.id }); } } return; }
        var inp = b.ai ? aiInput(b) : (inputs[b.id] || {}); b.cd = Math.max(0, b.cd - dt); b.cdAlt = Math.max(0, b.cdAlt - dt); b.speedT = Math.max(0, b.speedT - dt); b.shield = Math.max(0, b.shield - dt * 0.5);
        if (b.cls === 'skimmer') { b.heat = Math.max(0, b.heat - CLASSES.skimmer.heatCool * dt); }
        special(b, inp, dt); move(b, dt, inp); fire(b, inp);
        for (var i = pickups.length - 1; i >= 0; i--) { var p = pickups[i]; if (hyp(p.x - b.x, p.z - b.z) <= CLASSES[b.cls].r + 2.2) { collect(b, p); pickups.splice(i, 1); } }
      });
      if (mode === 'salvage') boats.forEach(function (a) { boats.forEach(function (c) { if (a.id < c.id && a.alive && c.alive && hyp(a.x - c.x, a.z - c.z) < CLASSES[a.cls].r + CLASSES[c.cls].r) { var nx = a.x - c.x, nz = a.z - c.z, L = hyp(nx, nz) || 1; a.x += nx / L * 0.4; a.z += nz / L * 0.4; c.x -= nx / L * 0.4; c.z -= nz / L * 0.4; } }); });
      for (var si = shots.length - 1; si >= 0; si--) { shotStep(shots[si], dt); if (shots[si].life <= 0) shots.splice(si, 1); }
      pickCd -= dt; if (pickCd <= 0) { pickCd = 6; var cap = mode === 'salvage' ? 9 : 6; if (pickups.length < cap) spawnPickup(mode === 'salvage' && rand() < 0.7 ? 'crate' : null); }
      for (var pi = pickups.length - 1; pi >= 0; pi--) { pickups[pi].life -= dt; if (pickups[pi].life <= 0) pickups.splice(pi, 1); }
      if (G.monstersOn) {
        monCd -= dt;
        if (mode === 'hunt') { if (monCd <= 0 && !monsters.some(function (m) { return m.alive; }) && G.wave < 5) { G.wave++; ev('wave', { n: G.wave }); for (var w = 0; w < G.wave + 1; w++) spawnMonster('serpent'); if (G.wave % 3 === 0) spawnMonster('kraken'); monCd = 5; } else if (monCd <= 0 && monsters.some(function (m) { return m.alive; })) monCd = 1; }
        else if (monCd <= 0) { var living = monsters.filter(function (m) { return m.alive; }).length; if (living < (mode === 'salvage' ? 2 : 1)) spawnMonster(mode === 'fleet' || rand() < 0.35 ? 'kraken' : 'serpent'); monCd = mode === 'fleet' ? 45 : 14; }
        monsters.forEach(function (m) { monsterStep(m, dt); });
      }
      checkEnd();
    }
    function state() { return { t: +t.toFixed(2), mode: mode, boats: boats, shots: shots, pickups: pickups, monsters: monsters, wave: G.wave, over: G.over, winner: G.winner, score: G.score, timeLeft: Math.max(0, G.timeLimitS - t) }; }
    return { step: step, state: state, boat: boat, drain: function () { var e = events; events = []; return e; }, A: A, B: B, _spawnPickup: spawnPickup, _spawnMonster: spawnMonster, _setT: function (v) { t = v; } };
  }
  root.WorldNaval = { CLASSES: CLASSES, SHOT: SHOT, MON: MON, create: create };
})(typeof window !== 'undefined' ? window : globalThis);
