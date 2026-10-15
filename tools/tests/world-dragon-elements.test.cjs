/* world-dragon-elements.test.cjs — elemental dragon attacks (2026-09-28): realm → element, per-element breath volumes,
 * status caps / no stun-lock, lingering hazards + shards through the telegraph-enforced path, bounded FX pools,
 * allocation-free FX + rider breath, and the ridden dragon breathing its own element.
 * Run: node tools/tests/world-dragon-elements.test.cjs < /dev/null
 */
'use strict';
const path = require('path');
const fs = require('fs');
const assert = require('assert');
const DR = require(path.join(__dirname, '..', '..', 'public', 'world-dragons.js'));
const RIDE = require(path.join(__dirname, '..', '..', 'public', 'world-dragon-ride.js'));
const U = DR.U;
const EL7 = ['ice', 'lava', 'thorn', 'sand', 'void', 'crystal', 'lightning'];

let pass = 0, fail = 0;
function test(name, fn) {
  const t0 = Date.now();
  try { const info = fn(); pass++; console.log('  ok  ' + name + (info ? '  — ' + info : '') + '  (' + (Date.now() - t0) + ' ms)'); }
  catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join('\n       ') : e)); }
}
const flat = () => 0;
function record(core) { const ev = []; core.on('*', (name, data) => ev.push(Object.assign({ ev: name }, data))); return ev; }
function station(el) { return { id: 'x-' + el, name: el, pos: [0, -2828 * U], element: el, dragon: el }; }
// one dragon of element `el`, airborne and patrolling around a stationary player ~85 m inside the crossing
function arena(el, over) {
  const st = station(el);
  const P = { pos: { x: st.pos[0] * 0.97, y: 0, z: st.pos[1] * 0.97 }, alive: true };
  const core = DR.createDragonsCore(Object.assign({ heightAt: flat, layout: { stations: [st] }, getPlayer: () => P, seed: 11 }, over || {}));
  const ev = record(core), d = core.dragons[0];
  for (let i = 0; i < 60 * 20 && d.f.mode !== 'fly'; i++) core.update(1 / 60);
  for (let i = 0; i < 60 * 8 && d.state !== 'patrol'; i++) core.update(1 / 60);
  return { core, ev, d, P };
}
function breathRun(A, extraSecs) {
  const { core, d } = A;
  assert(core._forceAttack(d.id, 'breath'), d.element + ': could not start a breath run (state ' + d.state + ')');
  for (let i = 0; i < 60 * 45; i++) { core.update(1 / 60); if (!d.atk || d.atk.kind !== 'breath') break; }
  for (let i = 0; i < 60 * (extraSecs || 0); i++) core.update(1 / 60);
}

console.log('world-dragon-elements tests');

test('mapping: every station realm → one of the 7 elements; all 7 used; regions + legacy names resolve', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', '..', 'public', 'world-layout.js'), 'utf8');
  const rows = [...src.matchAll(/\{ id: '(\w+)',[^}]*realm: '(\w+)',\s*dragon: '(\w+)' \}/g)].map(m => ({ id: m[1], realm: m[2], dragon: m[3] }));
  assert(rows.length >= 8, 'station rows parsed: ' + rows.length);
  const got = {};
  rows.forEach(s => { const e = DR.resolveElement(s); assert(EL7.includes(e), s.id + ' → ' + e); got[s.realm] = e; });
  assert.deepStrictEqual(got, { void: 'void', desert: 'sand', volcano: 'lava', suburb: 'lightning', meadow: 'thorn', ocean: 'crystal', darkforest: 'thorn', arctic: 'ice' });
  EL7.forEach(e => assert(Object.values(got).includes(e), 'element unused: ' + e));
  // realm wins over colour; colour is the fallback; legacy element names alias onto the 7
  assert.strictEqual(DR.resolveElement({ realm: 'arctic', dragon: 'red' }), 'ice');
  assert.strictEqual(DR.resolveElement({ realm: 'nowhere', dragon: 'teal' }), 'crystal');
  assert.deepStrictEqual(['fire', 'poison', 'shadow', 'steel', 'tide'].map(e => DR.resolveElement({ dragon: e })), ['lava', 'thorn', 'void', 'crystal', 'crystal']);
  fs.readdirSync(path.join(__dirname, '..', '..', 'public', 'world-regions')).forEach(f => { const r = f.replace(/\.js$/, ''); if (r !== 'city') assert(EL7.includes(DR.REALM_TO_ELEMENT[r]), 'region without element: ' + r); });
  EL7.forEach(e => { assert(DR.ELEMENTS[e] && DR.ELEMENT_TUNE[e] && DR.FX_STYLE[e], 'tables missing ' + e); });
  return Object.keys(got).map(k => k + '→' + got[k]).join(' ');
});

test('telegraph: every element wind-up ≥ minTelegraph; every live hit (breath, pools, shards, burn, chain) ≥ minTelegraph after its telegraph', () => {
  const T = DR.TUNE, out = [];
  EL7.forEach(el => assert(DR.breathInhale(el) >= T.minTelegraph, el + ' inhale ' + DR.breathInhale(el)));
  assert.strictEqual(DR.breathInhale('ice', Object.assign({}, T, { minTelegraph: 1.5 })), 1.5, 'inhale is clamped UP to minTelegraph');
  EL7.forEach(el => {
    const A = arena(el); breathRun(A, 6);
    const tg = A.ev.filter(e => e.ev === 'telegraph' && e.kind === 'breath');
    assert(tg.length && tg.every(e => e.dur >= T.minTelegraph), el + ': breath telegraph ' + (tg[0] && tg[0].dur));
    const hits = A.ev.filter(e => e.ev === 'hit');
    assert(hits.length > 0, el + ': no hits');
    hits.forEach(h => assert(h.sinceTelegraph >= T.minTelegraph - 1e-9, el + ' ' + h.kind + ' hit ' + h.sinceTelegraph.toFixed(3) + ' s after telegraph'));
    assert.strictEqual(A.core.violations, 0, el + ' violations');
    out.push(el + ':' + [...new Set(hits.map(h => h.kind))].join('+'));
  });
  return out.join(' ');
});

test('shapes: line is a narrow long beam, cone is wide, burst hits once per pulse', () => {
  const apex = { x: 0, y: 0, z: 0 }, axis = { x: 0, y: 0, z: 1 }, E = DR.ELEMENT_TUNE;
  const off = { x: 5 * U, y: 0, z: 20 * U }, far = { x: 0, y: 0, z: 41 * U };
  assert(DR.inCone(apex, axis, off, E.ice.len, E.ice.endR), 'cone should cover 6 m off-axis at 20 m');
  ['thorn', 'crystal', 'lightning'].forEach(el => { assert.strictEqual(E[el].shape, 'line'); assert(!DR.inCone(apex, axis, off, E[el].len, E[el].endR), el + ' line too wide'); });
  assert(DR.inCone(apex, axis, far, E.lightning.len, E.lightning.endR) && !DR.inCone(apex, axis, far, E.ice.len, E.ice.endR), 'line reaches further than the cone');
  const A = arena('sand'); breathRun(A, 0);
  const b = A.ev.filter(e => e.ev === 'hit' && e.kind === 'breath');
  for (let i = 1; i < b.length; i++) assert(b[i].t - b[i - 1].t >= E.sand.pulse - 1e-6, 'burst ticks ' + (b[i].t - b[i - 1].t).toFixed(2) + ' s apart');
  return 'sand burst ticks ' + b.length + ', pulse ' + E.sand.pulse + ' s';
});

test('status caps: refresh never stacks, dur/mag capped; root refused in i-frames, while rooted and during immunity', () => {
  const C = DR.TUNE.status, S = DR.newStatus();
  assert.strictEqual(DR.applyStatus(S, 'slow', 99, 5, 0, C, -1), C.slow.dur);
  assert.strictEqual(S.slow.mag, C.slow.mag);
  for (let t = 0; t < 10; t += 0.25) DR.applyStatus(S, 'slow', 2, 0.3, t, C, -1);
  assert(S.slow.until - 9.75 <= C.slow.dur + 1e-9, 'slow stacked past the cap');
  assert.strictEqual(DR.applyStatus(S, 'burn', 10, 50, 0, C, -1), C.burn.dur); assert.strictEqual(S.burn.mag, C.burn.mag);
  assert.strictEqual(DR.applyStatus(S, 'root', 0.8, 1, 5, C, 5.3), 0, 'root inside player i-frames');
  assert.strictEqual(DR.applyStatus(S, 'root', 5, 1, 6, C, -1), C.root.dur, 'root capped');
  assert.strictEqual(DR.applyStatus(S, 'root', 0.8, 1, 6.5, C, -1), 0, 'root while rooted');
  assert.strictEqual(DR.applyStatus(S, 'root', 0.8, 1, 6 + C.root.dur + 1, C, -1), 0, 'root during immunity');
  assert(DR.applyStatus(S, 'root', 0.8, 1, 6 + C.root.dur + C.root.immune + 0.01, C, -1) > 0, 'root after immunity');
  const m = DR.statusMods(S, 6 + C.root.dur + C.root.immune + 0.2, {});
  assert(m.rooted && m.speedMul === 0);
  // worst case: a root attempt every 0.1 s for 120 s → uptime ≤ dur / (dur + immune), longest root ≤ cap
  const R = DR.newStatus(); let rooted = 0, run = 0, maxRun = 0;
  for (let t = 0; t < 120; t += 0.1) { DR.applyStatus(R, 'root', 0.8, 1, t, C, -1); const r = t < R.root.until; rooted += r ? 0.1 : 0; run = r ? run + 0.1 : 0; maxRun = Math.max(maxRun, run); }
  const up = rooted / 120, capUp = C.root.dur / (C.root.dur + C.root.immune);
  assert(up <= capUp + 0.02, 'root uptime ' + up.toFixed(3));
  assert(maxRun <= C.root.dur + 0.1 + 1e-9, 'longest root ' + maxRun.toFixed(2));
  return 'root uptime ' + (up * 100).toFixed(1) + '% (cap ' + (capUp * 100).toFixed(1) + '%), longest ' + maxRun.toFixed(1) + ' s';
});

test('no stun-lock live: thorn roots only outside player i-frames; dodge roll blocks roots; knockback i-frames block roots', () => {
  const A = arena('thorn'), C = DR.TUNE.status; let rolls = 0;
  const roots = [];
  A.core.on('status', e => { if (e.kind === 'root') roots.push({ t: e.t, block: Math.max(A.core.playerInvulnUntil, A.core.rollUntil) }); });
  for (let k = 0; k < 6; k++) { breathRun(A, 0.5); A.d.cooldown = 0; }
  assert(roots.length >= 1, 'thorn never rooted');
  roots.forEach(r => assert(r.t >= r.block - 1e-9, 'root applied inside i-frames'));
  for (let i = 1; i < roots.length; i++) assert(roots[i].t - roots[i - 1].t >= C.root.dur + C.root.immune - 1e-6, 'roots too close: ' + (roots[i].t - roots[i - 1].t).toFixed(2));
  // same fight but the player dodge-rolls through every breath → nothing lands, nothing roots
  const B = arena('thorn'); let bRoots = 0; B.core.on('status', e => { if (e.kind === 'root') bRoots++; });
  B.core._forceAttack(B.d.id, 'breath');
  for (let i = 0; i < 60 * 45; i++) { if (B.d.inhaling || B.d.breathing) { B.core.setPlayerInvulnerable(0.2); rolls++; } B.core.update(1 / 60); if (!B.d.atk) break; }
  assert.strictEqual(bRoots, 0, 'rooted through a dodge roll');
  assert.strictEqual(B.ev.filter(e => e.ev === 'hit').length, 0);
  return roots.length + ' roots over 6 lashes, all outside i-frames; rolling frames ' + rolls + ' → 0 roots';
});

test('element effects: lava pools burn + linger, ice patches slow, void heals, lightning chains, crystal shards bounce (all pooled)', () => {
  const T = DR.TUNE, info = [];
  // lava: pools spawn, burn DoT ticks, pools expire; never more than hazardMax alive
  const L = arena('lava'); let maxHz = 0;
  L.core._forceAttack(L.d.id, 'breath');
  for (let i = 0; i < 60 * 45; i++) { L.core.update(1 / 60); maxHz = Math.max(maxHz, L.core.effectsLive().hazards); if (!L.d.atk) break; }
  const lavaPools = L.ev.filter(e => e.ev === 'hazard' && e.kind === 'lava').length, burns = L.ev.filter(e => e.ev === 'hit' && e.kind === 'burn').length;
  assert(lavaPools > 0 && burns > 0, 'lava pools ' + lavaPools + ', burn ticks ' + burns);
  assert(maxHz <= T.hazardMax);
  for (let i = 0; i < 60 * 6; i++) L.core.update(1 / 60);
  assert.strictEqual(L.core.effectsLive().hazards, 0, 'pools must expire');
  info.push('lava pools ' + lavaPools + ' (max alive ' + maxHz + '), burn ticks ' + burns);
  // ice: the player standing in a frost patch is slowed, takes no damage from it
  const I = arena('ice'); breathRun(I, 0);
  assert(I.ev.some(e => e.ev === 'status' && e.kind === 'slow'), 'ice never slowed');
  assert(I.ev.filter(e => e.ev === 'hit' && e.kind === 'ice').every(e => e.dmg === 0), 'frost patch dealt damage');
  // void: breath ticks heal the dragon
  const V = arena('void'); V.d.hp = 300; breathRun(V, 0);
  assert(V.d.hp > 300, 'void did not drain-heal (hp ' + V.d.hp + ')');
  info.push('void healed +' + (V.d.hp - 300).toFixed(0));
  // lightning: a player 6 m off the locked line is not in the beam but the arc jumps to him
  const G = arena('lightning');
  G.core._forceAttack(G.d.id, 'breath'); let moved = false;
  for (let i = 0; i < 60 * 45; i++) {
    G.core.update(1 / 60);
    if (!moved && G.d.atk && G.d.atk.phase === 'inhale') { moved = true; const a = G.d.atk; G.P.pos.x += a.dirz * 6 * U; G.P.pos.z -= a.dirx * 6 * U; }
    if (!G.d.atk) break;
  }
  const chains = G.ev.filter(e => e.ev === 'hit' && e.kind === 'chain').length, arcs = G.ev.filter(e => e.ev === 'arc').length;
  assert(chains > 0 && arcs === chains, 'chain hits ' + chains + ', arcs ' + arcs);
  info.push('lightning chain hits ' + chains);
  // crystal: shards bounce off the ground, pool bounded, some hit the player
  const K = arena('crystal'); let maxSh = 0, bounced = 0;
  K.core._forceAttack(K.d.id, 'breath');
  for (let i = 0; i < 60 * 50; i++) { K.core.update(1 / 60); const l = K.core.effectsLive(); maxSh = Math.max(maxSh, l.shards); K.core.shards.forEach(s => { if (s.on && s.bounces > 0) bounced++; }); if (!K.d.atk && l.shards === 0) break; }
  assert(maxSh > 0 && maxSh <= T.shardMax, 'shards alive ' + maxSh);
  assert(bounced > 0, 'no shard ever bounced');
  info.push('crystal shards max ' + maxSh + '/' + T.shardMax + ', shard hits ' + K.ev.filter(e => e.ev === 'hit' && e.kind === 'shard').length);
  return info.join('; ');
});

test('defeated never attacks: killing a lava dragon clears its pools and the burn DoT', () => {
  const A = arena('lava');
  A.core._forceAttack(A.d.id, 'breath');
  for (let i = 0; i < 60 * 45; i++) { A.core.update(1 / 60); if (A.core.effectsLive().hazards > 0 && A.core.statusMods().burning) break; }
  assert(A.core.effectsLive().hazards > 0, 'no pool to clear');
  A.d.invulnUntil = -1; A.core.damage(A.d.id, 1e6);
  const at = A.core.time();
  for (let i = 0; i < 60 * 20; i++) A.core.update(1 / 60);
  assert.strictEqual(A.core.effectsLive().hazards, 0);
  assert.strictEqual(A.ev.filter(e => e.ev === 'hit' && e.t > at).length, 0, 'hit after defeat');
  assert(!A.core.statusMods().burning);
  return 'pools + burn cleared on the killing blow';
});

test('FX pools are bounded: 10 000 frames of constant breath per element never grow any buffer', () => {
  const C = DR.FX_CAPS, out = [];
  EL7.forEach(el => {
    const sim = DR.createFxSim(el, flat), bufs = [sim.pos, sim.size, sim.sPos, sim.arcPts], lens = bufs.map(b => b.length);
    let maxLive = 0, maxS = 0, maxA = 0, grounds = 0; sim.onGround = () => grounds++;
    for (let i = 0; i < 10000; i++) {
      sim.io[0] = 1 / 60; sim.io[1] = 0; sim.io[2] = 20 * U; sim.io[3] = 0; sim.io[4] = 0; sim.io[5] = -0.5; sim.io[6] = 0.866; sim.io[7] = 35; sim.io[8] = i / 60;
      sim.emit(); sim.step();
      maxLive = Math.max(maxLive, sim.live); maxS = Math.max(maxS, sim.sLive); maxA = Math.max(maxA, sim.aLive);
    }
    assert(maxLive > 0 && maxLive <= C.particles, el + ' particles ' + maxLive);
    assert(maxS <= C.shards && maxA <= C.arcs);
    assert.deepStrictEqual([sim.pos, sim.size, sim.sPos, sim.arcPts].map(b => b.length), lens);
    [sim.pos, sim.size, sim.sPos, sim.arcPts].forEach((b, i) => assert.strictEqual(b, bufs[i], 'buffer replaced'));
    out.push(el + ' ' + maxLive + (maxS ? '/' + maxS : '') + (maxA ? '/arcs ' + maxA : ''));
  });
  return out.join(', ') + ' (caps ' + C.particles + ' pts / ' + C.shards + ' shards / ' + C.arcs + ' arcs)';
});

// fresh-process allocation probes (same method as world-dragon-ride.test.cjs): min new-space growth over bursts
function probe(body) {
  const cp = require('child_process');
  const src = "const v8=require('v8');const ns=()=>v8.getHeapSpaceStatistics().find(s=>s.space_name==='new_space').space_used_size;" + body +
    "for(let i=0;i<30000;i++)STEP();let best=Infinity;for(let k=0;k<12;k++){const x=ns();for(let i=0;i<2000;i++)STEP();const y=ns();if(y>=x)best=Math.min(best,y-x);}" +
    "process.stdout.write(JSON.stringify({best,extra:typeof EXTRA==='function'?EXTRA():null}));";
  return JSON.parse(cp.execFileSync(process.execPath, ['-e', src], { encoding: 'utf8', timeout: 90000 }));
}
test('no per-frame allocation: all 7 element FX sims emitting + stepping every frame', () => {
  const file = JSON.stringify(path.join(__dirname, '..', '..', 'public', 'world-dragons.js'));
  const out = probe("const D=require(" + file + "),U=D.U;const S=" + JSON.stringify(EL7) + ".map(e=>D.createFxSim(e,()=>0));let n=0;" +
    "const STEP=()=>{n++;for(let j=0;j<S.length;j++){const s=S[j],io=s.io;io[0]=1/60;io[1]=0;io[2]=80;io[3]=0;io[4]=0;io[5]=-0.5;io[6]=0.866;io[7]=35;io[8]=n/60;s.emit();s.step();}};" +
    "const EXTRA=()=>S.map(s=>s.live).join(',');");
  // budget per sim-step: < 24 B (any per-frame object literal / array is ≥ 28 B). What remains is the odd boxed argument
  // into the shared (non-inlined) heightAt closure, not buffers.
  const per = out.best / 2000 / EL7.length;
  assert(per < 24, per.toFixed(1) + ' B per sim-step');
  return out.best + ' B over 2000 frames × 7 sims (' + per.toFixed(2) + ' B per sim-step), live ' + out.extra;
});
test('no per-frame allocation: rider breathing (element breath held, flying circles)', () => {
  const file = JSON.stringify(path.join(__dirname, '..', '..', 'public', 'world-dragon-ride.js')), dfile = JSON.stringify(path.join(__dirname, '..', '..', 'public', 'world-dragons.js'));
  const out = probe("require(" + dfile + ");const R=require(" + file + ");const pp={x:0,y:0,z:0};" +
    "const r=R.createRideCore({heightAt:()=>0,playerPos:pp,markers:[{name:'VEH_DRAGON_HARNESS',pos_m:[0,0,0]}],tune:{arriveTime:0,breathDrain:0,boostDrain:0},element:'lightning'});" +
    "r.mount('tamed');const a={fwd:true,back:false,left:true,right:false,climb:true,dive:false,breath:true},b={fwd:true,back:false,left:false,right:true,climb:false,dive:false,breath:true};" +
    "let n=0;const STEP=()=>{n++;r.update(1/60,(n>>7)&1?a:b);};const EXTRA=()=>[r.state(),r.breath().on,r.element()].join(',');");
  assert.strictEqual(out.extra, 'fly,true,lightning');
  assert(out.best / 2000 < 24, (out.best / 2000).toFixed(1) + ' B/update');
  return out.best + ' B over 2000 updates (' + (out.best / 2000).toFixed(2) + ' B/update)';
});

test('ridden dragon: breath uses its own element (wild = its element, tamed = opts.element) and damages wild dragons with that damage type', () => {
  const out = [];
  EL7.forEach((el, k) => {
    const other = EL7[(k + 1) % EL7.length];
    const stA = { id: 'mine', pos: [0, -2828 * U], element: el, dragon: el }, stB = { id: 'foe', pos: [60 * U, -2828 * U], element: other, dragon: other };
    const core = DR.createDragonsCore({ heightAt: flat, layout: { stations: [stA, stB] }, getPlayer: () => null, isDefeated: id => id === 'mine' });
    const mine = core.byId('mine'), foe = core.byId('foe');
    const pp = { x: mine.f.x, y: 0, z: mine.f.z };
    const r = RIDE.createRideCore({ heightAt: flat, playerPos: pp, markers: [], dragons: { core }, tune: { arriveTime: 0 } });
    assert(r.mount('mine'), el + ': mount refused ' + r.lastRefusal());
    assert.strictEqual(r.element(), el);
    const hurts = []; core.on('hurt', e => hurts.push(e));
    // aim straight at the foe standing 60 m east, from the ground
    r.dragon.yaw = Math.atan2(foe.f.x - r.dragon.x, foe.f.z - r.dragon.z); r.dragon.x = foe.f.x - Math.sin(r.dragon.yaw) * 22 * U; r.dragon.z = foe.f.z - Math.cos(r.dragon.yaw) * 22 * U;
    r.dragon.y = foe.f.y + 4 * U;
    for (let i = 0; i < 60; i++) r.update(1 / 60, { breath: true });
    const B = r.breath(), E = DR.ELEMENT_TUNE[el];
    assert(B.on && B.shape === E.shape && B.len === E.len && B.endR === E.endR, el + ': breath profile ' + JSON.stringify([B.shape, B.len, B.endR]));
    assert(hurts.length > 0 && hurts.every(h => h.id === 'foe' && h.type === E.dmgType), el + ': hurts ' + JSON.stringify(hurts.slice(0, 2)));
    out.push(el + '→' + E.dmgType + '×' + hurts.length);
  });
  const t = RIDE.createRideCore({ heightAt: flat, playerPos: { x: 0, y: 0, z: 0 }, markers: [{ name: 'VEH_DRAGON_HARNESS', pos_m: [0, 0, 0] }], tune: { arriveTime: 0 }, element: 'frost' });
  t.mount('tamed'); t.update(1 / 60, { breath: true });
  assert.strictEqual(t.element(), 'ice', 'tamed element alias');
  return out.join(' ');
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
