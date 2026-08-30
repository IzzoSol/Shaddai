/* world-biomes.js — SHADDAI World 3D: BIOME PROPS + WATER + ATMOSPHERE module.
 *
 * Enhanced v2: richer per-biome props, InstancedMesh everywhere possible,
 * allocation-free update(), modest emissive to avoid white-blowout.
 *
 * Public interface (unchanged):
 *   const biomes = window.buildWorldBiomes(THREE, scene, window.WORLD_LAYOUT);
 *   biomes.update(elapsedSeconds);   // call each frame
 *   biomes.dispose();                // cleanup
 *
 * Per-biome additions
 *   forest  — instanced mushrooms, instanced ferns (X-cross), animated fireflies
 *   arctic  — instanced ice spires, instanced snow drifts, dual aurora shimmer planes
 *   desert  — instanced cacti (body+arms), instanced bleached bones, blowing sand motes
 *   void    — instanced floating debris, portal rift rings, towers now instanced
 *   grid    — pylons now instanced, instanced holo-panels, instanced data nodes
 */
window.buildWorldBiomes = function (THREE, scene, layout) {
  var _t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
  layout = layout || window.WORLD_LAYOUT;

  // ── seeded PRNG (mulberry32) — stable scatter across reloads ──
  let _seed = 0x5ADDA1;
  function rand() {
    _seed |= 0; _seed = (_seed + 0x6D2B79F5) | 0;
    let t = Math.imul(_seed ^ (_seed >>> 15), 1 | _seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  const rrange = (a, b) => a + (b - a) * rand();

  const group = new THREE.Group();
  group.name = 'world-biomes';
  scene.add(group);

  const disposables = [];
  const track = (o) => { disposables.push(o); return o; };

  // animation buckets (filled during build, consumed in update — no allocations)
  const pulsers       = [];  // { mat, base, amp, speed }  — emissiveIntensity
  const auroraPlanes  = [];  // { mat, base, amp, speed, phase } — opacity
  const voidFloaters  = [];  // { m, y0, ph, sp }
  const forestFireflies = []; // { attr, base, offsets }
  const desertSandMotes = []; // { attr, base }
  // ── AMBIENT LIFE FX (2026-07-05) — cheap, characterless motion over the map ──
  const ambientMotes  = [];  // { attr, base, offsets, cx, cz, r2 } — plaza drift Points
  const godRays       = [];  // { mat, base, amp, speed, phase, x, z, r2 } — light-shaft opacity
  let   ambientDrones = null; // { mesh, bases:[{x,y0,z,ph,sp,s}], obj } — floating orbs

  let water = null;  // { geo, base:Float32Array, update(t) }

  const biome = (id) => layout.biomes.find((b) => b.id === id);

  // ── clearance: skip sectors + world centre so props don't bury buildings ──
  // (2026-07-05) The old 25u ring was far smaller than a building's footprint
  // (half-widths ~62-78u) and its ground lounge, so cacti/rocks/bones scattered
  // straight INTO TURTLE's lounge and the like. Widened: SECTOR_CLEAR keeps every
  // prop well outside each building + its walk-through lounge, and a bigger
  // world-centre ring keeps the plaza/temple approach clear of terrain clutter.
  const CLEAR        = 60;   // world centre (temple + inner plaza rings)
