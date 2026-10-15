/* world-interiors-v3.test.cjs — node tools/tests/world-interiors-v3.test.cjs  (add --expose-gc for the allocation check)
 * Real three (tools/ual) + the real city JSON; no browser. */
'use strict';
const path = require('path');
const assert = require('assert');
const ROOT = path.resolve(__dirname, '..', '..');
const THREE = require(path.join(ROOT, 'tools/ual/node_modules/three/build/three.cjs'));
const IV3 = require(path.join(ROOT, 'public/world-interiors-v3.js'));
const P = IV3;
const U = P.U;
const data = {
  fabric: require(path.join(ROOT, 'public/assets/world/grid-fabric-v4.json')),
  canon: require(path.join(ROOT, 'public/assets/world/canon-colliders-v4.json')),
  markers: require(path.join(ROOT, 'public/assets/world/markers-v4.json'))
};

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('  ok   ' + name); }
  catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join('\n       ') : e)); }
}

const B = P.indexBuildings(data);
const byRecipe = {};
B.forEach(b => (byRecipe[b.recipe] = byRecipe[b.recipe] || []).push(b));
// sample: every non-fabric building + the first 25 of each fabric type (enough to hit many yaws/seeds, cheap on RAM)
const SAMPLE = B.filter(b => b.source !== 'fabric').concat(...Object.keys(byRecipe).map(k => byRecipe[k].filter(b => b.source === 'fabric').slice(0, 25)));
const LAYOUTS = new Map(SAMPLE.map(b => [b.id, P.makeLayout(b, null)]));
const markerByName = {};
(Array.isArray(data.markers) ? data.markers : data.markers.markers).forEach(m => { markerByName[m.name] = m; });

console.log('world-interiors-v3');

test('enterable buildings: every storefront/office/market/techlab/civic in the fabric + culture lane, deed office, campus, 6 homes', () => {
  const fabricKeys = ['sc-storefront-s', 'sc-storefront-l', 'sc-office', 'sc-office-mid', 'sc-market', 'sc-techlab', 'sc-civic-tower'];
  const want = data.fabric.items.filter(i => fabricKeys.includes(i.key)).length;
  assert.strictEqual(B.filter(b => b.source === 'fabric').length, want);
  assert.strictEqual(want, 3335);
  assert.ok(!B.some(b => /sc-garden|sc-teleport|sc-ad-pylon/.test(b.key)), 'garden/teleport/pylon stay open');
  ['arcade', 'gallery', 'broadcast', 'deed-office', 'campus'].forEach(r => assert.strictEqual((byRecipe[r] || []).length, 1, r));
  assert.strictEqual(byRecipe.studio.length, 4);
  assert.strictEqual(byRecipe.home.length, 6);
  assert.strictEqual(new Set(B.map(b => b.id)).size, B.length, 'ids unique');
  // every fabric building with a collider type found its canon OBB (sc-market is walk-in, no OBB)
  B.filter(b => b.source === 'fabric' && b.key !== 'sc-market').forEach(b => assert.ok(b.canon, 'canon OBB for ' + b.id));
});

test('deterministic layout per building (same id → identical room; neighbours differ)', () => {
  SAMPLE.slice(0, 60).forEach(b => assert.deepStrictEqual(JSON.stringify(P.makeLayout(b, null)), JSON.stringify(LAYOUTS.get(b.id))));
  const s = byRecipe['storefront-s'].slice(0, 12).map(b => JSON.stringify(P.makeLayout(b, null).items.map(i => [i.kind, i.x.toFixed(2)])));
  assert.ok(new Set(s).size > 1, 'seeded variety across storefronts');
});

test('rooms fit inside w×d×h; ceiling below the roof', () => {
  for (const [id, L] of LAYOUTS) {
    assert.ok(L.ceil <= L.H - 0.29 && L.ceil >= 3.0, id + ' ceil ' + L.ceil + ' H ' + L.H);
    L.items.forEach(it => {
      const r = it.rect;
      assert.ok(r.x - r.hx >= -L.W / 2 - 1e-6 && r.x + r.hx <= L.W / 2 + 1e-6 && r.z - r.hz >= -L.D / 2 - 1e-6 && r.z + r.hz <= L.D / 2 + 1e-6, id + ' ' + it.kind + ' outside footprint');
      assert.ok(it.h <= L.ceil + 1e-6, id + ' ' + it.kind + ' taller than ceiling');
    });
    L.walls.forEach(w => assert.ok(Math.abs(w.x) + w.hx <= L.W / 2 + 1e-6 && Math.abs(w.z) + w.hz <= L.D / 2 + 1e-6, id + ' wall outside'));
  }
});

test('door gap sits on the exterior door (fabric: centre of the −Y/front wall; canon: at the anchor marker)', () => {
  const o = new THREE.Object3D(), v = new THREE.Vector3();
  SAMPLE.filter(b => b.source === 'fabric').forEach(b => {
    const it = data.fabric.items.find(i => b.id === 'fab:' + i.key + '@' + Math.round(i.x_m * 10) + ',' + Math.round(i.y_m * 10));
    // exactly what world-clusters-v4.js does to the model: position + rotation.y = −yaw; the GLB front (Blender −Y) is local +z
    o.position.set(it.x_m * U, 0, -it.y_m * U); o.rotation.set(0, -it.yaw * Math.PI / 180, 0); o.scale.setScalar(U); o.updateMatrixWorld(true);
    v.set(0, 0, P.SC_TYPES[it.key].d / 2).applyMatrix4(o.matrixWorld);
    const L = LAYOUTS.get(b.id), d = P.toWorld(b, L.door.x, L.D / 2);
    assert.ok(Math.hypot(d[0] - v.x, d[1] - v.z) < 0.01, b.id + ' door off by ' + Math.hypot(d[0] - v.x, d[1] - v.z));
    assert.strictEqual(L.door.x, 0);
  });
  B.filter(b => b.source === 'canon' && b.recipe !== 'studio').forEach(b => {
    const L = LAYOUTS.get(b.id), d = P.toWorld(b, L.door.x, L.D / 2), m = markerByName[P.CANON_BUILDINGS[b.key].anchor];
    const dist = Math.hypot(d[0] - m.pos_m[0] * U, d[1] + m.pos_m[1] * U) / U;
    assert.ok(b.anchored, b.id + ' anchored');
    assert.ok(dist < 2.0 || (b.recipe === 'gallery' && dist < 4.0), b.id + ' door ' + dist.toFixed(2) + ' m from ' + m.name);
  });
  B.filter(b => b.recipe === 'home' && !b.standalone).forEach(b => {
    const L = LAYOUTS.get(b.id), d = P.toWorld(b, L.door.x, L.D / 2), m = markerByName[b.homeName];
    assert.ok(Math.hypot(d[0] - m.pos_m[0] * U, d[1] + m.pos_m[1] * U) / U < 2.0, b.id + ' home door at its HUB marker');
  });
});

test('colliders form a closed shell except the door (flood fill from outside)', () => {
  for (const [id, L] of LAYOUTS) {
    if (L.open) continue;
    assert.strictEqual(P.reachability(L, { doorClosed: true }).inside, 0, id + ' leaks with the door closed');
    assert.ok(P.reachability(L).inside > 50, id + ' not enterable through the door');
    const front = L.walls.filter(w => w.kind === 'front');
    assert.strictEqual(front.length, 2, id + ' front wall split in two');
    const gapL = Math.max(...front.filter(w => w.x < L.door.x).map(w => w.x + w.hx)), gapR = Math.min(...front.filter(w => w.x > L.door.x).map(w => w.x - w.hx));
    assert.ok(Math.abs(gapR - gapL - L.door.w) < 1e-6 && Math.abs((gapL + gapR) / 2 - L.door.x) < 1e-6, id + ' door gap width/centre');
  }
});

test('furniture footprints never overlap each other or walls', () => {
  for (const [id, L] of LAYOUTS) {
    const solid = L.items.filter(i => !i.overlay);
    for (let a = 0; a < solid.length; a++) {
      for (let b = a + 1; b < solid.length; b++) assert.ok(!P.rectsOverlap(solid[a].rect, solid[b].rect), id + ' ' + solid[a].kind + ' × ' + solid[b].kind);
      L.walls.forEach(w => assert.ok(!P.rectsOverlap(solid[a].rect, w), id + ' ' + solid[a].kind + ' in a wall'));
    }
  }
});

test('use points and NPC slots are reachable and never inside a collider', () => {
  let uses = 0, npcs = 0;
  for (const [id, L] of LAYOUTS) {
    const reach = P.reachability(L);
    const hit = (x, z) => L.colliders.some(c => Math.abs(x - c.x) < c.hx + P.PLAYER_R - 1e-3 && Math.abs(z - c.z) < c.hz + P.PLAYER_R - 1e-3);
    L.uses.forEach(u => { uses++; assert.ok(!hit(u.x, u.z), id + ' use ' + u.kind + ' in a collider'); assert.ok(reach.ok(u.x, u.z), id + ' use ' + u.kind + ' unreachable'); });
    L.npcs.forEach(n => { npcs++; assert.ok(!hit(n.x, n.z), id + ' npc ' + n.role + ' in a collider'); });
  }
  assert.ok(uses > 300 && npcs > 100, uses + ' uses / ' + npcs + ' npcs checked');
});

test('recipes: arcade has a cabinet per SHADDAI Arcade game + blackjack table with dealer; gallery 8 slots; home kit; deed; campus', () => {
  const A = LAYOUTS.get('canon:culture-bld_arcade');
  const games = A.uses.filter(u => u.type === 'arcade').map(u => u.tag);
  assert.deepStrictEqual(games.slice().sort(), P.ARCADE_GAMES.map(g => g.id).sort());
  const casino = A.items.find(i => i.kind === 'casino-table');
  assert.ok(casino && casino.use && casino.use.type === 'casino' && casino.npcs[0].role === 'dealer');
  const G = LAYOUTS.get('canon:culture-bld_gallery_shop');
  assert.deepStrictEqual(G.uses.filter(u => u.type === 'gallery').map(u => u.tag).sort(), ['01', '02', '03', '04', '05', '06', '07', '08'].map(n => 'SLOT_GALLERY_' + n));
  byRecipe.home.forEach(b => assert.deepStrictEqual(LAYOUTS.get(b.id).uses.map(u => u.type).sort(), ['mail', 'rest', 'stash', 'wardrobe'], b.id));
  assert.strictEqual(LAYOUTS.get('canon:deed-office').uses.filter(u => u.type === 'deed').length >= 3, true);
  const C = LAYOUTS.get('canon:academy-hall');
  assert.strictEqual(C.uses.filter(u => u.type === 'class').length, 3); assert.ok(C.uses.filter(u => u.type === 'seat').length >= 3);
  ['storefront-s', 'storefront-l'].forEach(r => byRecipe[r].slice(0, 25).forEach(b => {
    const L = LAYOUTS.get(b.id); assert.ok(L.uses.some(u => u.type === 'shop') && L.npcs.some(n => n.role === 'shopkeeper'), b.id + ' counter + shopkeeper');
  }));
  byRecipe.market.slice(0, 25).forEach(b => assert.ok(LAYOUTS.get(b.id).uses.filter(u => u.type === 'shop').length >= 12, b.id + ' stall rows'));
  ['office', 'techlab', 'civic-tower', 'office-mid'].forEach(r => byRecipe[r].slice(0, 25).forEach(b => assert.ok(LAYOUTS.get(b.id).uses.length >= 2, b.id)));
});

test('use markers route through city-actions families (name / dashboard_id)', () => {
  const CA = require(path.join(ROOT, 'public/world-city-actions.js'));
  const fam = (CA && CA.family) || (CA.pure && CA.pure.family) || (global.window && null);
  const b = { id: 'x', short: 'x', recipe: 'home', homeId: 'home.a', homeName: 'HUB_HOME_A' };
  const mk = t => P.useMarker(b, { type: t, kind: 'k', tag: t === 'gallery' ? 'SLOT_GALLERY_03' : t === 'arcade' ? 'skate' : null, data: t === 'arcade' ? P.ARCADE_GAMES[1] : null });
  const want = { shop: 'bazaar', hire: 'hire', seat: 'seat', rest: 'home', stash: 'home', gallery: 'bazaar', deed: 'plots', 'class': 'academy', bank: 'kiosk' };
  Object.keys(want).forEach(t => { const m = mk(t); assert.ok(m.interactive && m.dashboard_id, t); if (typeof fam === 'function') assert.strictEqual(fam(m), want[t], t + ' → ' + fam(m)); });
  assert.strictEqual(mk('arcade').name, 'ARCADE_CAB_SKATE'); assert.strictEqual(mk('rest').dashboard_id, 'home.a');
});

test('furniture library (stub SHADDAI_FURNITURE) is used when it has the kind; fallback otherwise', () => {
  const lib = { kinds: ['counter', 'display-shelf', 'arcade-cabinet'],
    meta: k => ({ footprint_m: k === 'counter' ? [2.8, 0.7] : [1.8, 0.45], height_m: 1.1, collider: { hx: 0.9, hz: 0.2, h: 1.1 }, usePoint: [0, 1.0], npcSlots: [[0, -0.9]] }),
    build: k => { const g = new THREE.Group(); g.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial())); return g; } };
  assert.strictEqual(P.metaFor('shelf', lib).libKind, 'display-shelf');
  assert.strictEqual(P.metaFor('sofa', lib).libKind, null);
  const b = byRecipe['storefront-s'][0], L = P.makeLayout(b, lib);
  const c = L.items.find(i => i.kind === 'counter');
  assert.ok(c && c.libKind === 'counter' && Math.abs(c.rect.hx - 1.4) < 1e-9);
  assert.strictEqual(P.reachability(L, { doorClosed: true }).inside, 0);
});

// ───────────────────────── runtime ─────────────────────────
function makeWorld() {
  const scene = new THREE.Scene();
  const L = { realmColliders: [] };
  data.canon.obb.forEach(b => { if (!b.walkableTop) L.realmColliders.push({ x: b.x, z: b.z, hx: b.hx, hz: b.hz, rot: b.rot, label: 'canon:' + b.kind }); });
  const win = { WORLD_LAYOUT: L, buildCalls: 0 };
  win.buildWorldCollision = () => { win.buildCalls++; };
  const city = { markers: [] };
  const player = { pos: { x: 0, y: 6 * U, z: 0 } };
  const ev = { use: [], enter: [], exit: [] };
  const iv = IV3.build({ THREE, scene, win, city, data, getPlayer: () => player, heightAt: () => 6 * U,
    onUse: e => ev.use.push(e), onEnter: b => ev.enter.push(b.id), onExit: b => ev.exit.push(b.id) });
  return { scene, L, win, city, player, ev, iv };
}
function put(w, b, a, c) { const p = P.toWorld(b, a, c); w.player.pos.x = p[0]; w.player.pos.z = p[1]; }
function step(w, n, dt) { for (let i = 0; i < (n || 1); i++) w.iv.update(dt == null ? 0.3 : dt); }
const groups = s => s.children.filter(o => /^interior-v3:/.test(o.name));

test('approach → build + collider swap (canon OBB out, shell in); leave → exact restore', () => {
  const w = makeWorld(), b = byRecipe['storefront-s'][0];
  const before = w.L.realmColliders.slice(), canonIdx = before.findIndex(c => Math.abs(c.x - b.canon.x) < 0.01 && Math.abs(c.z - b.canon.z) < 0.01);
  assert.ok(canonIdx >= 0);
  put(w, b, 0, b.d / 2 + 30); step(w, 2);
  assert.strictEqual(w.iv.current() && w.iv.current().id, b.id);
  assert.strictEqual(groups(w.scene).length, 1);
  assert.ok(!w.L.realmColliders.includes(before[canonIdx]), 'solid OBB removed while near');
  const mine = w.L.realmColliders.filter(c => /^int3:/.test(c.label));
  assert.strictEqual(mine.length, w.iv.stats().colliders);
  assert.ok(mine.every(c => c.rot === b.rot && c.top > 6 * U), 'OBBs in the building frame with tops');
  assert.ok(w.win.buildCalls >= 1);
  put(w, b, 0, b.d / 2 + 70); step(w, 2);
  assert.strictEqual(w.iv.current(), null);
  assert.strictEqual(groups(w.scene).length, 0);
  assert.strictEqual(w.L.realmColliders.length, before.length);
  assert.ok(w.L.realmColliders.includes(before[canonIdx]) && !w.L.realmColliders.some(c => /^int3:/.test(c.label)));
  w.iv.dispose();
});

test('walk in through the door: inside → exterior hidden, uses injected into city-v3, onEnter; use → onUse; walk out → onExit', () => {
  const w = makeWorld(), b = byRecipe['storefront-s'][1];
  // a fake grid-fabric group holding this building's instance (what world-clusters-v4 builds)
  const fg = new THREE.Group(); fg.name = 'grid-fabric-v4'; w.scene.add(fg);
  const im = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial(), 2); im.name = 'cluster:sc-storefront-s';
  const m0 = new THREE.Matrix4().makeTranslation(b.cx, 6 * U, b.cz), m1 = new THREE.Matrix4().makeTranslation(b.cx + 500, 0, b.cz);
  im.setMatrixAt(0, m0); im.setMatrixAt(1, m1); fg.add(im);
  put(w, b, 0, b.d / 2 + 3); step(w, 2);
  const L = w.iv.active().L;
  assert.strictEqual(w.iv.isInside(), false);
  put(w, b, L.door.x, b.d / 2 + 1.0); step(w, 5, 0.1);
  assert.ok(w.iv.active().door > 0.9, 'door slid open');
  put(w, b, L.door.x, b.d / 2 - 1.5); step(w, 1, 0.1);
  assert.strictEqual(w.iv.isInside(), true); assert.deepStrictEqual(w.ev.enter, [b.id]);
  const t = new THREE.Matrix4(); im.getMatrixAt(0, t); assert.strictEqual(t.elements[0], 0, 'own exterior instance hidden');
  im.getMatrixAt(1, t); assert.strictEqual(t.elements[0], 1, 'other instances untouched');
  const inj = w.city.markers.filter(m => m.interior && m.interior.building === b.id);
  assert.strictEqual(inj.length, L.uses.length);
  const shop = inj.find(m => m.interior.type === 'shop');
  assert.ok(Math.abs(shop.pos.y - 6 * U) < 1e-9 && /^STALL_/.test(shop.name));
  assert.strictEqual(w.iv.handleInteract(shop), true);
  assert.strictEqual(w.ev.use.length, 1); assert.strictEqual(w.ev.use[0].kind, 'counter'); assert.strictEqual(w.ev.use[0].building.id, b.id);
  assert.strictEqual(w.iv.handleInteract({ name: 'OBJ_SPARKS_KIOSK' }), false, 'foreign markers are left to city-actions');
  put(w, b, L.door.x, b.d / 2 + 2.5); step(w, 1, 0.1);
  assert.strictEqual(w.iv.isInside(), false); assert.deepStrictEqual(w.ev.exit, [b.id]);
  im.getMatrixAt(0, t); assert.ok(t.elements.every((e, i) => Math.abs(e - m0.elements[i]) < 1e-3), 'exterior restored (float32 instance buffer)');
  assert.strictEqual(w.city.markers.length, 0);
  w.iv.dispose();
});

test('only one interior exists in the scene; last 3 cached, older ones disposed; NPCs ≤ 12, lights ≤ 4', () => {
  const w = makeWorld(), list = byRecipe.market.slice(0, 6);
  list.forEach(b => { put(w, b, 0, 0); step(w, 2); assert.strictEqual(groups(w.scene).length, 1); assert.strictEqual(w.iv.current().id, b.id);
    const s = w.iv.stats(); assert.ok(s.npcs <= P.MAX_NPCS && s.lights <= P.MAX_LIGHTS, JSON.stringify(s)); });
  const s = w.iv.stats();
  assert.strictEqual(s.cached.length, 3); assert.ok(s.disposed >= 2, 'evicted interiors disposed');
  assert.strictEqual(w.scene.children.filter(o => o.isPointLight).length, P.MAX_LIGHTS, 'fixed light pool: light count never changes');
  const built = s.built; put(w, list[4], 0, 0); step(w, 2); assert.strictEqual(w.iv.stats().built, built, 'cache hit, no rebuild');
  w.iv.dispose();
});

test('enter(id) / exit() give spawn points inside / outside the door; arcade + homes + deed office build', () => {
  const w = makeWorld();
  ['canon:culture-bld_arcade', 'home:HUB_HOME_A', 'home:HUB_HOME_E', 'canon:deed-office', 'canon:academy-hall'].forEach(id => {
    const p = w.iv.enter(id); assert.ok(p, id);
    w.player.pos.x = p.x; w.player.pos.z = p.z; step(w, 1, 0.1);
    assert.strictEqual(w.iv.isInside(), true, id + ' inside after enter()');
    const o = w.iv.exit(); w.player.pos.x = o.x; w.player.pos.z = o.z; step(w, 1, 0.1);
    assert.strictEqual(w.iv.isInside(), false, id + ' outside after exit()');
  });
  const home = w.iv.building('home:HUB_HOME_A');
  assert.ok(home.canon && home.solids.length >= 2, 'home carved into its block: rest of the block stays solid');
  w.iv.dispose();
});

test('update() is allocation-free in steady state', () => {
  const w = makeWorld(), b = byRecipe.office[0];
  put(w, b, 0, 0); step(w, 5, 0.1);
  w.player.pos.y = 6 * U;
  for (let i = 0; i < 2000; i++) w.iv.update(0.016);
  if (!global.gc) { console.log('       (run with --expose-gc for the heap check; skipped)'); w.iv.dispose(); return; }
  global.gc(); const h0 = process.memoryUsage().heapUsed;
  for (let i = 0; i < 20000; i++) { w.player.pos.x += (i & 1 ? 0.01 : -0.01); w.iv.update(0.016); }
  global.gc(); const h1 = process.memoryUsage().heapUsed;
  assert.ok(h1 - h0 < 64 * 1024, 'heap grew ' + (h1 - h0) + ' bytes over 20k updates');
  w.iv.dispose();
});

// ───────────────────────── sand houses + growth-farm tower (owner scope 2026-09-28) ─────────────────────────
const SAND_SPECS = [{ key: 'sand-house-01', x: 900, z: 400 }, { key: 'sand-house-02', x: 1100, z: 400 }, { key: 'sand-house-03', x: 1300, z: 400, rot: 0.7 },
  { key: 'sand-house-04', x: 1500, z: 400, rot: -1.2 }, { key: 'sand-house-02', x: 1700, z: 400, r: 9 * U }, { key: 'sand-house-02', x: 1900, z: 500, r: 7 * U }];

test('sand houses (4 archetypes + round realm habitats): door gap, closed shell, sleep/cook/craft/comms, 1–2 NPC slots, reachable', () => {
  SAND_SPECS.forEach(s => {
    const b = P.registerBoard(s), L = P.makeLayout(b, null), id = b.recipe + '@' + s.x;
    assert.strictEqual(L.style, 'sand', id);
    assert.strictEqual(P.reachability(L, { doorClosed: true }).inside, 0, id + ' leaks');
    const reach = P.reachability(L);
    const types = L.uses.map(u => u.type);
    ['respawn', 'cook', 'craft', 'comms'].forEach(t => assert.ok(types.includes(t), id + ' has ' + t));
    assert.ok(L.npcs.length >= 1 && L.npcs.length <= 2, id + ' npcs ' + L.npcs.length);
    const hit = (x, z) => L.colliders.some(c => Math.abs(x - c.x) < c.hx + P.PLAYER_R - 1e-3 && Math.abs(z - c.z) < c.hz + P.PLAYER_R - 1e-3);
    L.uses.forEach(u => assert.ok(reach.ok(u.x, u.z) && !hit(u.x, u.z), id + ' use ' + u.type));
    L.npcs.forEach(n => assert.ok(!hit(n.x, n.z), id + ' npc ' + n.role));
    const solid = L.items.filter(i => !i.overlay);
    for (let a = 0; a < solid.length; a++) for (let c = a + 1; c < solid.length; c++) assert.ok(!P.rectsOverlap(solid[a].rect, solid[c].rect), id + ' overlap');
    if (s.r) {   // round habitat: square room inside the circle, ring caps solid, door on the circle edge facing the centre
      assert.ok(L.W <= s.r / U * Math.SQRT2 + 1e-6 && L.solids.length === 5, id + ' inscribed + 5 caps');
      const d = P.toWorld(b, L.door.x, s.r / U), toC = Math.hypot(d[0], d[1]), fromC = Math.hypot(s.x, s.z);
      assert.ok(toC < fromC, 'door faces the city centre');
    }
  });
  const C = P.makeLayout(P.registerBoard(SAND_SPECS[3]), null);
  assert.ok(C.uses.some(u => u.type === 'trade') && C.uses.some(u => u.type === 'quest'), 'courtyard trader + quest-giver');
  assert.ok(P.makeLayout(P.registerBoard(SAND_SPECS[2]), null).uses.some(u => u.type === 'roof'), 'stepped block: stairs to the roof');
});

test('WALKABLE STAIRS: the stepped sand house has a run of ascending step colliders the controller can climb (riser <= 0.45 m, head clear of the ceiling)', () => {
  const L = P.makeLayout(P.registerBoard(SAND_SPECS[2]), null), steps = L.colliders.filter(c => c.kind === 'step');
  assert.ok(steps.length >= 6, 'steps: ' + steps.length); assert.strictEqual(steps.length, L.steps.length);
  const hs = steps.map(c => c.h); for (let i = 0; i < hs.length; i++) assert.ok(Math.abs(hs[i] - (i + 1) * 0.2) < 1e-9, 'rises 0.2 m per step');
  for (let i = 1; i < steps.length; i++) assert.ok(hs[i] - hs[i - 1] <= 0.45, 'each riser is steppable');
  assert.ok(L.ceil - hs[hs.length - 1] >= 1.8, 'the top tread leaves 1.8 m of headroom: ceil ' + L.ceil + ' top ' + hs[hs.length - 1]);
  // consecutive treads are contiguous along the ascent and share the same width
  const dz = steps.slice(1).map((c, i) => Math.hypot(c.x - steps[i].x, c.z - steps[i].z)); dz.forEach(d => assert.ok(d > 0.3 && d < 0.6, 'tread spacing ' + d));
  assert.ok(steps.every(c => Math.abs(c.hx - steps[0].hx) < 1e-9 || Math.abs(c.hz - steps[0].hz) < 1e-9));
  assert.ok(steps.every(c => Math.abs(c.x) < L.W / 2 && Math.abs(c.z) < L.D / 2), 'inside the room');
});

test('growth-farm tower: ownerId slot, farmer slot, harvest stations, SPARKS market counter, rentable pods (data hooks only)', () => {
  const b = P.registerBoard({ key: 'farm-tower', x: 2000, z: -300 }), L = P.makeLayout(b, null);
  assert.strictEqual(L.style, 'farm');
  assert.ok(L.farm && L.farm.ownerId === null && L.farm.currency === 'SPARKS');
  assert.ok(L.farm.farmerSlot && L.farm.farmerSlot.role === 'farmer', 'farmer-agent slot');
  assert.ok(L.farm.harvest.length >= 6 && L.farm.harvest.every(u => u.type === 'harvest'));
  assert.ok(L.farm.market && L.farm.market.type === 'farm-market');
  assert.ok(L.uses.filter(u => u.type === 'pod').length >= 2 && L.farm.levels.length >= 4 && L.farm.levels.every(l => l.pods.length === 4 && l.harvest.length === 3));
  assert.strictEqual(P.reachability(L, { doorClosed: true }).inside, 0);
  const mk = P.useMarker(Object.assign({}, b, { ownerId: 'u1' }), L.farm.market);
  assert.strictEqual(mk.props.currency, 'SPARKS'); assert.strictEqual(mk.props.owner_id, 'u1');
  const src = require('fs').readFileSync(path.join(ROOT, 'public/world-interiors-v3.js'), 'utf8');
  const code = src.split('\n').filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).map(l => l.replace(/\/\/.*$/, '')).join('\n');
  assert.ok(!/withdraw|cash[\s-]?out|redeem|payout/i.test(code), 'no value-out vocabulary in code');
});

test('runtime: register a farm tower + a round sand habitat; owner hook; slots for agents; circle collider swapped and restored', () => {
  const w = makeWorld();
  const farm = w.iv.register({ key: 'farm-tower', id: 'farm:test', x: 3000, z: 3000, rot: 0.3 });
  const circ = { x: 3400, z: 3000, r: 9 * U, kind: 'sand-habitat-base' };
  w.L.realmColliders.push(circ);
  const sand = w.iv.register({ key: 'sand-house-02', id: 'sand:test', x: circ.x, z: circ.z, r: circ.r, canon: circ });
  assert.ok(w.iv.setOwner('farm:test', 'player-7'));
  const sl = w.iv.slots('farm:test');
  assert.ok(sl.npcs.some(n => n.role === 'farmer') && sl.uses.some(u => u.type === 'harvest') && sl.door, 'agents get world slots');
  put(w, farm, 0, 0); step(w, 2);
  assert.strictEqual(w.iv.current().id, 'farm:test');
  put(w, farm, w.iv.active().L.door.x, farm.d / 2 - 1.5); step(w, 1, 0.1);
  const fm = w.city.markers.find(m => m.interior && m.interior.type === 'farm-market');
  assert.ok(fm && fm.props.owner_id === 'player-7' && fm.props.currency === 'SPARKS');
  assert.strictEqual(w.iv.active().L.farm.ownerId, 'player-7');
  put(w, sand, 0, 0); step(w, 2);
  assert.strictEqual(w.iv.current().id, 'sand:test');
  assert.ok(!w.L.realmColliders.includes(circ), 'solid habitat circle swapped out');
  put(w, sand, 0, 200); step(w, 2);
  assert.ok(w.L.realmColliders.includes(circ), 'restored');
  w.iv.dispose();
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
