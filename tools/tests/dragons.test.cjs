/* dragons.test.cjs — pure-math tests for public/world-dragons.js (no THREE, no browser).
 * Run: node tools/tests/dragons.test.cjs
 */
'use strict';
const path = require('path');
const assert = require('assert');
const DR = require(path.join(__dirname, '..', '..', 'public', 'world-dragons.js'));
const U = DR.U, D2R = Math.PI / 180;

let pass = 0, fail = 0;
function test(name, fn) {
  const t0 = Date.now();
  try { const info = fn(); pass++; console.log('  ok  ' + name + (info ? '  — ' + info : '') + '  (' + (Date.now() - t0) + ' ms)'); }
  catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join('\n       ') : e)); }
}

// ── synthetic hilly terrain (units): rolling hills + sharp ridges, up to ~260 m relief ──
function hills(x, z) {
  const m = 1 / U; x *= m; z *= m;   // metres
  const h = 70 * Math.sin(x / 310) * Math.cos(z / 270)
          + 45 * Math.sin((x + z) / 150 + 1.3)
          + 90 * Math.max(0, Math.sin(x / 520 - z / 610)) ** 3     // ridges
          + 20 * Math.sin(x / 47) * Math.sin(z / 53)                  // small bumps
          + 60;
  return h * U;
}
const flat = () => 0;

function tuneWith(over) { const t = JSON.parse(JSON.stringify(DR.TUNE)); return Object.assign(t, over || {}); }
function ringLayout(n, rM) {
  const cols = ['void', 'tan', 'red', 'black', 'green', 'teal', 'dark', 'blue'];
  const st = [{ id: 'central', pos: [0, 1600 * U], dragon: null }];
  for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; st.push({ id: 's' + i, name: 'S' + i, pos: [Math.sin(a) * rM * U, -Math.cos(a) * rM * U], realm: 'r' + i, dragon: cols[i % cols.length] }); }
  return { stations: st };
}
function mkPlayer(x, z, hAt) { const p = { pos: { x, y: hAt(x, z), z }, alive: true }; p.set = (nx, nz) => { p.pos.x = nx; p.pos.z = nz; p.pos.y = hAt(nx, nz); }; return p; }
function record(core) { const ev = []; core.on('*', (name, data) => ev.push(Object.assign({ ev: name }, data))); return ev; }

console.log('world-dragons tests');

// 1) raw flight model: 10 min over hills, random targets — never below terrain + 25 m, bank bounded, no teleport
test('flight: 10 min over hills stays ≥ terrain+25 m, |bank| ≤ 60°, continuous motion', () => {
  const T = DR.TUNE, f = DR.createFlight(0, hills(0, 0) + 60 * U, 0, 0);
  f.mode = 'fly'; f.speed = 26;
  let rnd = 12345; const r = () => (rnd = (rnd * 1103515245 + 12345) % 2147483648) / 2147483648;
  let tgt = { x: 800 * U, z: 0 }, minClr = Infinity, maxBank = 0, maxStepH = 0, steps = 0;
  const dt = 1 / 60;
  for (let i = 0; i < 600 * 60; i++) {
    if (i % 600 === 0) tgt = { x: (r() - 0.5) * 3000 * U, z: (r() - 0.5) * 3000 * U };
    const px = f.x, pz = f.z;
    DR.stepFlight(f, { tx: tgt.x, ty: hills(tgt.x, tgt.z) + 45 * U, tz: tgt.z, speed: 18 + r() * 17, minClear: T.clearPatrolTarget, hardClear: T.clearPatrol }, dt, hills, T);
    minClr = Math.min(minClr, (f.y - hills(f.x, f.z)) / U);
    maxBank = Math.max(maxBank, Math.abs(f.bank));
    maxStepH = Math.max(maxStepH, Math.hypot(f.x - px, f.z - pz) / U / dt);
    steps++;
  }
  assert(minClr >= 25 - 1e-6, 'min clearance ' + minClr.toFixed(2) + ' m');
  assert(maxBank <= 60 * D2R + 1e-9, 'bank ' + (maxBank / D2R).toFixed(1));
  assert(maxStepH <= T.speedDive + 1e-6, 'horizontal speed ' + maxStepH.toFixed(1) + ' m/s (teleport?)');
  const hitRate = f.floorHits / steps;
  assert(hitRate < 0.02, 'safety-floor used on ' + (hitRate * 100).toFixed(2) + '% of steps — look-ahead should do the work');
  return 'min clearance ' + minClr.toFixed(1) + ' m, max bank ' + (maxBank / D2R).toFixed(1) + '°, floor-net ' + (hitRate * 100).toFixed(2) + '% steps, max v ' + maxStepH.toFixed(1) + ' m/s';
});

test('flight: bank follows atan(v·yawRate/g) in a steady turn and stays within ±60°', () => {
  const T = DR.TUNE, f = DR.createFlight(0, 200 * U, 0, 0); f.mode = 'fly'; f.speed = 30;
  let worst = 0, maxBank = 0;
  for (let i = 0; i < 60 * 40; i++) {   // chase a point that keeps circling → sustained hard turn
    const a = i / 60 * 0.9;
    DR.stepFlight(f, { tx: f.x + Math.sin(f.yaw + 2.5) * 200 * U, ty: 200 * U, tz: f.z + Math.cos(f.yaw + 2.5) * 200 * U, speed: 30, minClear: 25, hardClear: 25 }, 1 / 60, flat, T);
    if (i > 600) worst = Math.max(worst, Math.abs(f.bank - Math.atan(Math.max(f.speed, 1) * f.yawRate / 9.81)));
    maxBank = Math.max(maxBank, Math.abs(f.bank));
  }
  assert(maxBank <= 60 * D2R + 1e-9, 'bank ' + maxBank / D2R);
  assert(worst < 3 * D2R, 'bank deviates from coordinated-turn formula by ' + (worst / D2R).toFixed(2) + '°');
  return 'steady-turn bank ' + (maxBank / D2R).toFixed(1) + '°, formula error ≤ ' + (worst / D2R).toFixed(2) + '°';
});

test('flight: stall recovery — nose drops and airspeed recovers above min', () => {
  const T = DR.TUNE, f = DR.createFlight(0, 400 * U, 0, 0); f.mode = 'fly'; f.speed = 12; f.pitch = 20 * D2R;
  let stalled = false, recoveredAt = -1;
  for (let i = 0; i < 60 * 20; i++) {
    DR.stepFlight(f, { tx: 0, ty: 1000 * U, tz: 5000 * U, speed: 26, minClear: 25, hardClear: 25 }, 1 / 60, flat, T);
    if (f.stalled) stalled = true;
    if (stalled && !f.stalled && recoveredAt < 0) recoveredAt = i / 60;
  }
  assert(stalled, 'never flagged a stall at 12 m/s');
  assert(recoveredAt > 0 && f.speed >= T.speedMin, 'did not recover (speed ' + f.speed.toFixed(1) + ')');
  return 'recovered after ' + recoveredAt.toFixed(1) + ' s';
});

// 2) full AI: patrolling dragon over hills for 10 min never dips under terrain+25 m while patrolling
test('AI patrol: 10 min orbiting a moving player over hills — clearance ≥ 25 m, bank ≤ 60°', () => {
  const tune = tuneWith({ attackCooldown: [1e9, 1e9] });   // pure patrol (no attacks)
  const L = ringLayout(1, 2828); const st = L.stations[1];
  const P = mkPlayer(st.pos[0], st.pos[1], hills);
  const core = DR.createDragonsCore({ heightAt: hills, layout: L, getPlayer: () => P, tune });
  const d = core.dragons[0];
  let minClr = Infinity, maxBank = 0, patrolSteps = 0, t = 0;
  for (let i = 0; i < 600 * 60; i++) {
    t += 1 / 60;
    const a = t * 0.05;                                   // player walks a 180 m circle around the crossing
    P.set(st.pos[0] + Math.sin(a) * 180 * U, st.pos[1] + Math.cos(a) * 180 * U);
    core.update(1 / 60);
    if (d.state === 'patrol') { patrolSteps++; minClr = Math.min(minClr, (d.f.y - hills(d.f.x, d.f.z)) / U); }
    maxBank = Math.max(maxBank, Math.abs(d.f.bank));
  }
  assert(patrolSteps > 30000, 'only ' + patrolSteps + ' patrol steps (state ' + d.state + ')');
  assert(minClr >= 25 - 1e-6, 'patrol clearance ' + minClr.toFixed(2));
  assert(maxBank <= 60 * D2R + 1e-9);
  return 'patrol ' + (patrolSteps / 60).toFixed(0) + ' s, min clearance ' + minClr.toFixed(1) + ' m, floor-net ' + (d.f.floorHits / patrolSteps * 100).toFixed(2) + '%';
});

// 3) strafing run passes within the cone of a stationary player (every element / every dragon)
test('breath strafe: run hits a stationary player inside the cone (all 8 dragons)', () => {
  const L = ringLayout(8, 2828); const out = [];
  for (let k = 0; k < 8; k++) {
    const st = L.stations[k + 1];
    const P = mkPlayer(st.pos[0] * 0.97, st.pos[1] * 0.97, hills);   // ~85 m inside the crossing
    const core = DR.createDragonsCore({ heightAt: hills, layout: { stations: [st] }, getPlayer: () => P, seed: k + 7 });
    const ev = record(core), d = core.dragons[0];
    for (let i = 0; i < 60 * 20 && d.f.mode !== 'fly'; i++) core.update(1 / 60);    // alert → roar → take-off
    for (let i = 0; i < 60 * 8 && !(d.state === 'patrol'); i++) core.update(1 / 60);
    assert(core._forceAttack(d.id, 'breath'), 'could not start a strafe (state ' + d.state + ', mode ' + d.f.mode + ')');
    let breathHits = 0, inConeSeen = false;
    for (let i = 0; i < 60 * 45; i++) {
      core.update(1 / 60);
      if (d.breathing && d.coneAxis && DR.inCone(d.mouth, d.coneAxis, { x: P.pos.x, y: P.pos.y + 1.2 * U, z: P.pos.z }, DR.TUNE.breath.len, DR.TUNE.breath.endRadius)) inConeSeen = true;
      if (!d.atk || d.atk.kind !== 'breath') break;
    }
    breathHits = ev.filter(e => e.ev === 'hit' && e.kind === 'breath').length;
    assert(inConeSeen && breathHits > 0, d.element + ': strafe missed (inCone ' + inConeSeen + ', hits ' + breathHits + ')');
    out.push(d.element + ':' + breathHits);
  }
  return 'breath ticks landed — ' + out.join(' ');
});

test('breath strafe: a player who rolls 25 m sideways during the inhale is not hit', () => {
  const L = ringLayout(1, 2828); const st = L.stations[1];
  const P = mkPlayer(st.pos[0] * 0.97, st.pos[1] * 0.97, flat);
  const core = DR.createDragonsCore({ heightAt: flat, layout: L, getPlayer: () => P, seed: 3 });
  const ev = record(core), d = core.dragons[0];
  for (let i = 0; i < 60 * 25 && d.state !== 'patrol'; i++) core.update(1 / 60);
  core._forceAttack(d.id, 'breath');
  let dodged = false;
  for (let i = 0; i < 60 * 45 && d.atk; i++) {
    core.update(1 / 60);
    if (!dodged && d.atk && d.atk.phase === 'inhale') {   // roll perpendicular to the run line
      dodged = true; P.set(P.pos.x + d.atk.dirz * 25 * U, P.pos.z - d.atk.dirx * 25 * U);
    }
  }
  assert(dodged, 'never reached inhale');
  const hits = ev.filter(e => e.ev === 'hit' && e.kind === 'breath').length;
  assert.strictEqual(hits, 0, 'dodging player still took ' + hits + ' breath ticks');
  return 'dodge works (0 ticks)';
});

// 4) swoop: hits a stationary player, misses one who moves away during the telegraph
function swoopRun(dodge) {
  const L = ringLayout(1, 2828); const st = L.stations[1];
  const P = mkPlayer(st.pos[0] * 0.97, st.pos[1] * 0.97, hills);
  const core = DR.createDragonsCore({ heightAt: hills, layout: L, getPlayer: () => P, seed: 11 });
  const ev = record(core), d = core.dragons[0];
  for (let i = 0; i < 60 * 25 && d.state !== 'patrol'; i++) core.update(1 / 60);
  core._forceAttack(d.id, 'swoop');
  let moved = false, minClr = Infinity;
  for (let i = 0; i < 60 * 40 && d.atk; i++) {
    core.update(1 / 60);
    if (dodge && !moved && d.atk && d.atk.phase === 'telegraph' && core.time() - d.atk.telegraphAt > 0.5) { moved = true; P.set(P.pos.x + 20 * U, P.pos.z + 5 * U); }
    minClr = Math.min(minClr, (d.f.y - hills(d.f.x, d.f.z)) / U);
  }
  return { hits: ev.filter(e => e.ev === 'hit' && e.kind === 'swoop'), tele: ev.filter(e => e.ev === 'telegraph' && e.kind === 'swoop'), minClr, core };
}
test('dive swoop: telegraphed ≥1.2 s, passes ~3 m over a stationary player and hits with knockback', () => {
  const r = swoopRun(false);
  assert(r.tele.length === 1, 'telegraphs ' + r.tele.length);
  assert(r.hits.length === 1, 'swoop hits ' + r.hits.length);
  assert(r.hits[0].sinceTelegraph >= 1.2 - 1e-9 && r.hits[0].knockback, 'telegraph lead ' + r.hits[0].sinceTelegraph);
  assert(r.minClr >= DR.TUNE.clearDive - 1e-6, 'dive went under the terrain floor: ' + r.minClr);
  return 'hit ' + r.hits[0].sinceTelegraph.toFixed(2) + ' s after the screech, lowest pass ' + r.minClr.toFixed(1) + ' m';
});
test('dive swoop: a player who runs 20 m during the telegraph is missed', () => {
  const r = swoopRun(true);
  assert.strictEqual(r.hits.length, 0);
  return 'missed as intended';
});

// 5) telegraph always precedes damage by ≥ 0.8 s — long mixed fight, player wandering near the crossing
test('fairness: 10 min fight — every hit follows its attack telegraph by ≥ 0.8 s; max 1 attacker', () => {
  const L = ringLayout(2, 2828);
  // pull the two crossings close together so both dragons engage the same player
  L.stations[2].pos = [L.stations[1].pos[0] + 220 * U, L.stations[1].pos[1]];
  const st = L.stations[1];
  const P = mkPlayer(st.pos[0], st.pos[1], hills);
  const core = DR.createDragonsCore({ heightAt: hills, layout: L, getPlayer: () => P, seed: 99 });
  const ev = record(core);
  let t = 0, maxAttackers = 0, rnd = 7, maxRate = 0, maxBank = 0;
  const prev = core.dragons.map(d => ({ x: d.f.x, y: d.f.y, z: d.f.z }));
  const r = () => (rnd = (rnd * 1103515245 + 12345) % 2147483648) / 2147483648;
  let gx = st.pos[0], gz = st.pos[1];
  for (let i = 0; i < 600 * 60; i++) {
    t += 1 / 60;
    if (i % 240 === 0) { gx = st.pos[0] + (r() - 0.3) * 200 * U; gz = st.pos[1] + (r() - 0.5) * 200 * U; }
    const dx = gx - P.pos.x, dz = gz - P.pos.z, dl = Math.hypot(dx, dz) || 1, sp = Math.min(dl, 5 * U / 60);
    P.set(P.pos.x + dx / dl * sp, P.pos.z + dz / dl * sp);          // walks at 5 m/s
    core.update(1 / 60);
    core.dragons.forEach((d, j) => { const p = prev[j]; maxRate = Math.max(maxRate, Math.hypot(d.f.x - p.x, d.f.y - p.y, d.f.z - p.z) / U * 60); p.x = d.f.x; p.y = d.f.y; p.z = d.f.z; maxBank = Math.max(maxBank, Math.abs(d.f.bank)); });
    const attackers = core.dragons.filter(d => d.state === 'attack' || (d.state === 'alert' && d.telegraph)).length;
    maxAttackers = Math.max(maxAttackers, attackers);
  }
  const hits = ev.filter(e => e.ev === 'hit'), tele = ev.filter(e => e.ev === 'telegraph');
  assert(hits.length > 5, 'fight produced only ' + hits.length + ' hits');
  for (const h of hits) {
    const prior = tele.filter(tl => tl.id === h.id && tl.attackId === h.attackId && tl.t <= h.t);
    assert(prior.length, 'hit without a telegraph: ' + JSON.stringify(h));
    const last = prior[prior.length - 1];
    assert(h.t - last.t >= 0.8 - 1e-9, h.kind + ' hit only ' + (h.t - last.t).toFixed(3) + ' s after its telegraph');
  }
  assert.strictEqual(core.violations, 0, 'guard refused ' + core.violations + ' illegal hits');
  assert(maxAttackers <= 1, maxAttackers + ' simultaneous attackers');
  assert(maxRate <= 50, 'a dragon moved ' + maxRate.toFixed(1) + ' m/s in one step (teleport)');
  assert(maxBank <= 60 * D2R + 1e-9, 'bank ' + maxBank / D2R);
  const kindsStarted = {}; ev.filter(e => e.ev === 'attack').forEach(e => kindsStarted[e.kind] = (kindsStarted[e.kind] || 0) + 1);
  const kinds = {}; hits.forEach(h => kinds[h.kind] = (kinds[h.kind] || 0) + 1);
  const minLead = Math.min.apply(null, hits.map(h => h.sinceTelegraph));
  return hits.length + ' hits ' + JSON.stringify(kinds) + ', min telegraph lead ' + minLead.toFixed(2) + ' s, max attackers ' + maxAttackers + ', attacks ' + JSON.stringify(kindsStarted) + ', max 3D speed ' + maxRate.toFixed(1) + ' m/s';
});

// 6) defeated dragons never attack
test('defeated at load: dragons perch/fly ambient loops and never telegraph or hit (5 min, player at crossing)', () => {
  const L = ringLayout(8, 2828);
  const st = L.stations[1];
  const P = mkPlayer(st.pos[0], st.pos[1], hills);
  const core = DR.createDragonsCore({ heightAt: hills, layout: L, getPlayer: () => P, isDefeated: () => true });
  const ev = record(core);
  const states = new Set();
  for (let i = 0; i < 300 * 60; i++) { core.update(1 / 60); core.dragons.forEach(d => states.add(d.state)); }
  const bad = ev.filter(e => e.ev === 'hit' || e.ev === 'telegraph' || e.ev === 'breath' || e.ev === 'swoop' || e.ev === 'attack');
  assert.strictEqual(bad.length, 0, bad.length + ' hostile events from defeated dragons');
  assert(states.has('ambient'), 'no ambient flight seen: ' + [...states].join(','));
  return 'states seen: ' + [...states].join(', ');
});

test('defeat mid-fight: glide → land → bow → setDefeated + "defeated"; no hostile events after downed', () => {
  const L = ringLayout(1, 2828); const st = L.stations[1];
  const P = mkPlayer(st.pos[0] * 0.97, st.pos[1] * 0.97, hills);
  const saved = [];
  const core = DR.createDragonsCore({ heightAt: hills, layout: L, getPlayer: () => P, setDefeated: id => saved.push(id), seed: 5 });
  const ev = record(core), d = core.dragons[0];
  for (let i = 0; i < 60 * 40; i++) core.update(1 / 60);
  // whittle it down (respecting i-frames) while it is airborne
  let tries = 0;
  while (!d.defeated && tries < 5000) { core.damage(d.id, 40, null, 'physical'); core.update(1 / 60); tries++; }
  assert(d.defeated, 'not defeated');
  const downedAt = core.time();
  for (let i = 0; i < 60 * 60; i++) core.update(1 / 60);
  const after = ev.filter(e => e.t > downedAt && (e.ev === 'hit' || e.ev === 'telegraph' || e.ev === 'breath' || e.ev === 'swoop'));
  assert.strictEqual(after.length, 0, 'hostile after defeat: ' + JSON.stringify(after[0]));
  assert.deepStrictEqual(saved, [d.id]);
  const dEv = ev.find(e => e.ev === 'defeated'), landEv = ev.find(e => e.ev === 'land' && e.kind === 'defeat' && e.t > downedAt);
  assert(dEv && (landEv || d.f.mode === 'ground'), 'no defeated/land sequence');
  assert(core.damage(d.id, 50) === false, 'damage accepted after defeat');
  return 'defeated ' + (dEv.t - downedAt).toFixed(1) + ' s after the killing blow; state ' + d.state;
});

// 7) i-frames + resistances
test('combat: dragon i-frames block same-frame multi-hits; fire dragon resists fire', () => {
  const L = { stations: [{ id: 'f', pos: [0, 0], dragon: 'red' }] };
  const core = DR.createDragonsCore({ heightAt: flat, layout: L, getPlayer: () => null });
  const d = core.dragons[0], hp0 = d.hp;
  assert(core.damage('f', 10, null, 'fire'));
  assert(!core.damage('f', 10, null, 'fire'), 'second hit inside i-frames accepted');
  assert(Math.abs(hp0 - d.hp - 4) < 1e-9, 'fire resist: took ' + (hp0 - d.hp));
  core.update(0.1); core.update(0.1);   // update() clamps dt to 0.1 s
  assert(core.damage('f', 10, null, 'ice'));
  assert(Math.abs(hp0 - d.hp - 16.5) < 1e-9, 'ice weakness: total ' + (hp0 - d.hp));
  return 'fire 10→4, ice 10→12.5';
});

// 8) far LOD ticks at 5 Hz
test('perf: dragons > 1500 m away update at 5 Hz', () => {
  const L = ringLayout(1, 2828);
  const P = mkPlayer(0, 0, flat);   // 2.8 km away
  const core = DR.createDragonsCore({ heightAt: flat, layout: L, getPlayer: () => P });
  const d = core.dragons[0]; let ticks = 0, last = d.stateT;
  for (let i = 0; i < 60 * 10; i++) { core.update(1 / 60); if (d.stateT !== last) { ticks++; last = d.stateT; } }
  assert.strictEqual(d.lod, 'far');
  assert(ticks >= 45 && ticks <= 52, 'far ticks in 10 s: ' + ticks);
  return ticks + ' brain ticks in 10 s';
});

// ───────────── 2026-09-27 additions: wind-ups, cooldowns, hit volumes, player→dragon, city rule, night, perf, clips ─────────────
test('wind-ups: every attack kind telegraphs ≥ 0.6 s (enforced minTelegraph ≥ minWindup), ≥ 3 kinds in a live fight', () => {
  const T = DR.TUNE;
  assert(T.minTelegraph >= T.minWindup && T.minWindup >= 0.6);
  const winds = { breath: T.breath.inhale, swoop: T.swoop.telegraph, stomp: T.stomp.telegraph, tail: T.tail.telegraph, roar: T.roar.telegraph };
  for (const k in winds) assert(winds[k] >= 0.6, k + ' wind-up ' + winds[k]);
  const L = ringLayout(1, 2828), st = L.stations[1], P = mkPlayer(st.pos[0] * 0.97, st.pos[1] * 0.97, flat);
  const core = DR.createDragonsCore({ heightAt: flat, layout: L, getPlayer: () => P, seed: 21, nightFactor: () => 1 });
  const ev = record(core);
  for (let i = 0; i < 300 * 60; i++) core.update(1 / 60);
  const tele = ev.filter(e => e.ev === 'telegraph');
  const kinds = new Set(tele.map(e => e.kind));
  assert(kinds.size >= 3, 'fewer than 3 attack kinds telegraphed: ' + [...kinds]);
  assert(Math.min(...tele.map(e => e.dur)) >= 0.6);
  return Object.entries(winds).map(([k, v]) => k + ' ' + v + ' s').join(', ') + '; live kinds ' + [...kinds].join('/');
});

test('cooldowns: a new attack never starts before the previous cooldown elapsed (day + night)', () => {
  const out = [];
  for (const night of [0, 1]) {
    const L = ringLayout(1, 2828), st = L.stations[1], P = mkPlayer(st.pos[0] * 0.97, st.pos[1] * 0.97, hills);
    const core = DR.createDragonsCore({ heightAt: hills, layout: L, getPlayer: () => P, seed: 4, nightFactor: () => night });
    const ev = record(core);
    for (let i = 0; i < 400 * 60; i++) core.update(1 / 60);
    const atk = ev.filter(e => e.ev === 'attack' && e.sinceLast < 1e8);
    assert(atk.length >= 4, 'only ' + atk.length + ' attacks');
    for (const a of atk) assert(a.sinceLast >= a.cooldown - 1e-9, 'attack ' + a.kind + ' after ' + a.sinceLast.toFixed(2) + ' s < cooldown ' + a.cooldown.toFixed(2));
    out.push((night ? 'night ' : 'day ') + atk.length + ' attacks, min gap ' + Math.min(...atk.map(a => a.sinceLast)).toFixed(2) + ' s');
  }
  return out.join('; ');
});

function landedDragon(seed) {   // a dragon landed for its ground-attack loop on flat ground
  const L = ringLayout(1, 2828), st = L.stations[1];
  const P = mkPlayer(st.pos[0] * 0.97, st.pos[1] * 0.97, flat);
  const core = DR.createDragonsCore({ heightAt: flat, layout: L, getPlayer: () => P, seed });
  const ev = record(core), d = core.dragons[0];
  for (let i = 0; i < 60 * 25 && d.state !== 'patrol'; i++) core.update(1 / 60);
  assert(core._forceAttack(d.id, 'land'));
  for (let i = 0; i < 60 * 40 && !(d.atk && d.atk.phase === 'ground'); i++) core.update(1 / 60);
  assert(d.atk && d.atk.phase === 'ground', 'never landed');
  d.atk.groundUntil = core.time() + 30;
  const inFront = m => P.set(d.f.x + Math.sin(d.f.yaw) * m * U, d.f.z + Math.cos(d.f.yaw) * m * U);
  const n0 = ev.length;
  return { core, ev, d, P, inFront, n0 };
}
test('hit volume: stomp hits inside 18 m; a player who steps to 25 m during the wind-up takes nothing', () => {
  const A = landedDragon(8); A.inFront(10);
  for (let i = 0; i < 60 * 3; i++) A.core.update(1 / 60);
  const hitIn = A.ev.filter(e => e.ev === 'hit' && e.kind === 'stomp').length;
  assert(hitIn >= 1, 'stationary player inside the stomp was not hit');
  const B = landedDragon(8); B.inFront(10);
  let moved = false;
  for (let i = 0; i < 60 * 6; i++) { B.core.update(1 / 60); if (!moved && B.d.atk && B.d.atk.sub === 'stomp') { moved = true; B.inFront(25); } }
  assert(moved, 'no stomp wind-up');
  const hitsOut = B.ev.slice(B.n0).filter(e => e.ev === 'hit');
  assert.strictEqual(hitsOut.length, 0, 'hit outside the volume: ' + JSON.stringify(hitsOut[0]));
  return 'inside: ' + hitIn + ' stomp hit(s); stepped out: 0 hits';
});

test('player → dragon: hitTest/meleeHit drain HP → hurt → downed → defeated (HUD boss events)', () => {
  const L = { stations: [{ id: 'm', pos: [2828 * U, 0], dragon: 'black' }] };
  const core = DR.createDragonsCore({ heightAt: flat, layout: L, getPlayer: () => null });
  const ev = record(core), d = core.dragons[0];
  const fx = Math.sin(d.f.yaw), fz = Math.cos(d.f.yaw);
  assert.strictEqual(core.hitTest({ x: d.f.x, y: d.f.y, z: d.f.z }, 1), 'm', 'bolt at the body missed');
  assert.strictEqual(core.hitTest({ x: d.f.x + 60 * U, y: d.f.y, z: d.f.z }, 1), null, 'bolt 60 m away hit');
  assert.strictEqual(core.meleeHit({ x: d.f.x - fx * 8 * U, y: d.f.y, z: d.f.z - fz * 8 * U }, { x: -fx, z: -fz }, 6 * U, 12), null, 'swing facing away hit');
  let n = 0;
  while (!d.defeated && n < 2000) { core.meleeHit({ x: d.f.x - fx * 8 * U, y: d.f.y, z: d.f.z - fz * 8 * U }, { x: fx, z: fz }, 6 * U, 30); core.update(1 / 60); n++; }
  assert(d.defeated, 'not defeated after ' + n + ' swings');
  for (let i = 0; i < 60 * 60; i++) core.update(1 / 60);   // (it may have woken and taken off → glide, land, bow)
  const hurt = ev.filter(e => e.ev === 'hurt'), downed = ev.filter(e => e.ev === 'downed'), def = ev.filter(e => e.ev === 'defeated');
  assert(hurt.length > 5 && hurt.every(e => e.hpMax === d.hpMax && e.hp >= 0), 'hurt payloads');
  assert.strictEqual(downed.length, 1); assert.strictEqual(def.length, 1);
  assert(def[0].t > downed[0].t, 'defeated before downed');
  assert.strictEqual(core.hitTest({ x: d.f.x, y: d.f.y, z: d.f.z }, 1), null, 'defeated dragon still hittable');
  return hurt.length + ' hurt → downed @' + downed[0].t.toFixed(1) + ' s → defeated @' + def[0].t.toFixed(1) + ' s';
});

test('The Grid: no dragon ever on the ground at r < 1630 m (even a station inside); city overflights stay high', () => {
  const R = DR.TUNE.cityR;
  const L = { stations: [{ id: 'edge', pos: [0, -1900 * U], dragon: 'red' }, { id: 'inside', pos: [1500 * U, 0], dragon: 'blue' }] };
  const P = mkPlayer(0, -1750 * U, hills);
  const core = DR.createDragonsCore({ heightAt: hills, layout: L, getPlayer: () => P, seed: 13, nightFactor: () => 1 });
  for (const d of core.dragons) assert(Math.hypot(d.f.x, d.f.z) / U >= R, d.id + ' spawned at r ' + (Math.hypot(d.f.x, d.f.z) / U).toFixed(0));
  let groundIn = 0, minOver = Infinity, overSteps = 0, t = 0;
  for (let i = 0; i < 480 * 60; i++) {
    t += 1 / 60;
    const r = 1615 + 165 * Math.sin(t * 0.03), a = 0.25 * Math.sin(t * 0.011);   // player wanders across the city edge
    P.set(Math.sin(a) * r * U, -Math.cos(a) * r * U);
    core.update(1 / 60);
    for (const d of core.dragons) {
      if (Math.hypot(d.f.x, d.f.z) / U >= R) continue;
      if (d.f.mode !== 'fly') groundIn++; else { overSteps++; minOver = Math.min(minOver, (d.f.y - hills(d.f.x, d.f.z)) / U); }
    }
  }
  assert.strictEqual(groundIn, 0, groundIn + ' ground/hover steps inside The Grid');
  if (overSteps) assert(minOver >= 90, 'overflew the city only ' + minOver.toFixed(1) + ' m up');
  return 'overfly steps ' + overSteps + (overSteps ? ', min clearance over the city ' + minOver.toFixed(0) + ' m' : '');
});

test('The Grid: a player inside the city is never damaged (attacks abort, guard refuses)', () => {
  const L = { stations: [{ id: 'edge', pos: [0, -1800 * U], dragon: 'red' }] };
  const P = mkPlayer(0, -1700 * U, flat);
  const core = DR.createDragonsCore({ heightAt: flat, layout: L, getPlayer: () => P, seed: 2, nightFactor: () => 1 });
  const ev = record(core), d = core.dragons[0];
  for (let i = 0; i < 60 * 25 && d.state !== 'patrol'; i++) core.update(1 / 60);
  P.set(0, -1500 * U);
  const t0 = core.time();
  let minOver = Infinity;
  for (let i = 0; i < 180 * 60; i++) { core.update(1 / 60); if (Math.hypot(d.f.x, d.f.z) / U < DR.TUNE.cityR - 50) minOver = Math.min(minOver, d.f.y / U); }
  assert.strictEqual(ev.filter(e => e.ev === 'hit' && e.t > t0).length, 0, 'player hit inside the city');
  assert.strictEqual(core.violations, 0);
  if (isFinite(minOver)) assert(minOver >= 90, 'dragon only ' + minOver.toFixed(0) + ' m over the city');
  return 'no hits in 180 s; min altitude deep over the city ' + (isFinite(minOver) ? minOver.toFixed(0) + ' m' : 'n/a');
});

test('night: more aggressive (wider alert, more attacks); telegraphs never shorten', () => {
  function run(night) {
    const L = ringLayout(1, 2828), st = L.stations[1], P = mkPlayer(st.pos[0] * 0.97, st.pos[1] * 0.97, hills);
    const core = DR.createDragonsCore({ heightAt: hills, layout: L, getPlayer: () => P, seed: 17, nightFactor: () => night });
    const ev = record(core);
    for (let i = 0; i < 400 * 60; i++) core.update(1 / 60);
    return { attacks: ev.filter(e => e.ev === 'attack').length, tele: ev.filter(e => e.ev === 'telegraph') };
  }
  const day = run(0), night = run(1);
  assert(night.attacks > day.attacks, 'night ' + night.attacks + ' vs day ' + day.attacks);
  assert(Math.min(...night.tele.map(e => e.dur)) >= DR.TUNE.minTelegraph);
  function alerted(night) {
    const L = ringLayout(1, 2828), st = L.stations[1], k = 1 - 300 / 2828, P = mkPlayer(st.pos[0] * k, st.pos[1] * k, flat);
    const core = DR.createDragonsCore({ heightAt: flat, layout: L, getPlayer: () => P, nightFactor: () => night });
    for (let i = 0; i < 60 * 2; i++) core.update(1 / 60);
    return core.dragons[0].state !== 'perch';
  }
  assert(!alerted(0) && alerted(1), 'alert radius not night-scaled');
  return 'attacks in 400 s: day ' + day.attacks + ' / night ' + night.attacks + '; 300 m out wakes it only at night';
});

// Allocation probe. Runs in a FRESH node process (earlier tests make hot functions polymorphic, which changes what V8
// boxes). Flat terrain returns the small integer 0, so any bytes left come from the module itself. We take the minimum
// new-space growth over several 2000-update bursts (a burst with a scavenge is discarded). A per-frame object literal
// such as the old per-tick cmd object, the look-ahead dirs array or the player() copy costs well over 100 B/update. What
// remains is V8 boxing doubles returned from non-inlined functions (~16 B each), which the budget allows.
function probeAlloc(setupSrc, budgetB) {
  const cp = require('child_process');
  const src = "const v8=require('v8');const ns=()=>v8.getHeapSpaceStatistics().find(s=>s.space_name==='new_space').space_used_size;" +
    setupSrc + ";for(let i=0;i<30000;i++)STEP();let best=Infinity;for(let k=0;k<12;k++){const a=ns();for(let i=0;i<2000;i++)STEP();const b=ns();if(b>=a)best=Math.min(best,(b-a)/2000);}process.stdout.write(JSON.stringify({best,info:typeof INFO==='function'?INFO():''}));";
  const out = JSON.parse(cp.execFileSync(process.execPath, ['-e', src], { encoding: 'utf8', timeout: 60000 }));
  assert(out.best < budgetB, 'allocated ' + out.best.toFixed(1) + ' B/update (budget ' + budgetB + ')');
  return out;
}
test('perf: patrol + perched core updates allocate no objects per frame (fresh-process probe)', () => {
  const file = JSON.stringify(path.join(__dirname, '..', '..', 'public', 'world-dragons.js'));
  const r = probeAlloc("const DR=require(" + file + "),U=DR.U;const t=JSON.parse(JSON.stringify(DR.TUNE));t.attackCooldown=[1e9,1e9];" +
    "const P={pos:{x:2750*U,y:0,z:0},alive:true};const core=DR.createDragonsCore({heightAt:()=>0,layout:{stations:[{id:'a',pos:[2828*U,0],dragon:'red'}]},getPlayer:()=>P,tune:t});" +
    "const STEP=()=>core.update(1/60);const INFO=()=>core.dragons[0].state", 120);
  assert.strictEqual(r.info, 'patrol');
  return r.best.toFixed(1) + ' B/update in patrol (only V8 double boxing, no object literals)';
});

test('clips: fly/idle/walk/run weights sum to 1; air = fly, standing = idle, take-off crossfades', () => {
  const W = {};
  const cases = [[{ fold: 0, glide: 0, flapEffort: 0.5 }, 'fly'], [{ fold: 1, glide: 0, groundMove: 0 }, 'idle'], [{ fold: 1, groundMove: 0.4 }, 'walk'], [{ fold: 1, groundMove: 1 }, 'run']];
  for (const [p, top] of cases) {
    DR.clipWeights(p, W, false, true, true, true);
    const sum = W.fly + W.glide + W.idle + W.walk + W.run;
    assert(Math.abs(sum - 1) < 1e-9, 'sum ' + sum);
    const best = ['fly', 'idle', 'walk', 'run'].reduce((a, b) => (W[b] > W[a] ? b : a));
    assert.strictEqual(best, top, JSON.stringify(p));
  }
  DR.clipWeights({ fold: 0.5, glide: 0 }, W, false, true, true, true);
  assert(Math.abs(W.fly - 0.5) < 1e-9 && Math.abs(W.idle - 0.5) < 1e-9, 'mid take-off not a 50/50 crossfade');
  DR.clipWeights({ fold: 0, glide: 1, flapEffort: 0 }, W, false, true, true, true);
  assert(W.flyScale < 0.4, 'glide should slow the fly clip, got ' + W.flyScale);
  return 'ok';
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
