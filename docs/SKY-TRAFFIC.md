# Sky Traffic — flying ships over The Grid

`public/world-sky-traffic.js` adds background flying-ship traffic to the Map v4 three.js city:
5 voxel ship types looping fixed lanes in the sky over The Grid and out to the 8 ring stations.
Same "classic script + `window.build...`" shape as `world-wildlife-v4.js` / `world-dragons.js`, so
it plugs into the existing `window.__mapV4Ready` promise chain the same way.

## Assets

Converted from the owner's MagicaVoxel OBJ downloads by `tools/city/obj-to-glb.mjs` into
`public/assets/vehicles/ships/<id>.glb` (entries appended to `public/assets/manifest-downloads.json`,
license `unknown — owner to confirm` for all 5). No Draco/meshopt compression — this repo's
`tools/ual/node_modules` has `@gltf-transform/core`, `@gltf-transform/extensions` and
`meshoptimizer` as *libraries* but no `@gltf-transform/cli` package and no `.bin/` — so there is no
`gltf-transform` (or standalone meshopt) command to invoke via `npx` without installing something
new, which the task ruled out. Output is left uncompressed; each GLB is small (300-620 KB, single
palette texture, no skinning) so this is a non-issue on a modern connection, but worth revisiting if
`@gltf-transform/cli` is ever added to `tools/ual`.

| ship | source | tris | size | real (m) | sky-traffic scale |
|---|---|---|---|---|---|
| chopper | Chopper-0-Chopper.obj | 11,108 | 608.6 KB | 7.7 × 5 × 3.8 | ×2.0 |
| cross | Cross-0-Cross.obj | 7,162 | 401.9 KB | 6.6 × 3.3 × 2.6 | ×2.0 |
| gunbike | GunBike-0-GunBike.obj | 6,734 | 371.8 KB | 8.0 × 3.9 × 3.2 | ×2.0 |
| tracer | Tracer-0-Tracer.obj | 5,580 | 308.8 KB | 8.0 × 2.6 × 3.0 | ×1.5 |
| pyramidship | PyramidShips.obj | 7,450 | 438.9 KB | 4.0 × 4.9 × 4.0 | ×3.0 |

(real size = x-width × y-height × z-depth, metres, matches the survey in the task exactly — the
source voxel units already equal metres, confirmed by re-measuring each OBJ's bounding box.)

The visibility scale is applied only inside `world-sky-traffic.js` (an `InstancedMesh` per-instance
scale), never baked into the GLB, so the files stay "real size in metres" as delivered. Smallest
source ship (pyramidship, 4 m) gets the biggest boost (×3); the two biggest (tracer, gunbike/chopper)
get less (×1.5-2) — the goal is that all 5 read as roughly similar apparent size against the skyline
at 60-140 m altitude, not that they keep their real relative proportions.

## API

```js
window.buildWorldSkyTraffic({
  THREE,                  // the three.js namespace
  scene,                  // THREE.Scene (or scene-like: needs .add()/.remove())
  loader,                 // GLTFLoader-like: loader.load(url, onLoad, onProgress, onError)
  heightAt,                // (x, z) -> ground height in game units, same convention as other world-*.js
  nightFactor,             // optional: () -> 0..1, ramps running-light emissiveIntensity
  getPlayer,               // optional: () -> { pos: {x,y,z} }, enables the >2.5km 2Hz throttle
})
// -> { update(dt), stats(), dispose(), group }
```

`stats()` → `{ lanes, shipsTotal, shipsReady, types: { <id>: { ready, count } } }`.

Ships fly 12 closed analytic lanes (no waypoint lists, no per-frame allocation):
- 4 concentric ring lanes over the Grid disc (r ≤ 1600 m), altitudes 65/85/110/135 m, alternating
  direction.
- 8 "commuter" stadium-loop lanes, one per ring-station bearing (0°, 31°, 54°, 90°, 142.1°, 225°,
  299.1°, 333.4°), running from just outside the Grid edge (r≈1650 m) out to just inside the
  station ring (r≈2800 m) and back, altitudes cycling 70/95/120 m.

5 ship types × instance counts (10/8/8/8/6 = 40 total, one `InstancedMesh` per type, the hard cap
in the brief). Heading follows the lane tangent; bank angle is derived from smoothed turn rate and
applied as roll around each ship's local forward axis, so the commuter lanes' end-cap curves and
the ring lanes both show visible banking. Ships farther than 2.5 km from the player only advance at
2 Hz (accumulate dt, flush every 0.5 s) instead of every frame.

## Host snippet (NOT applied — the coordinator wires this into `public/SHADDAI-WORLD-3D.html`)

Same shape as the existing wildlife step in the `window.__mapV4Ready` chain (`GLTFLoader` +
`MeshoptDecoder`, `_loadScript`, guarded by `api`/`_v4Meta`, `window.__w3dDebug` hook, `.catch` so a
load failure never breaks the rest of the chain):

```js
.then(function(api){   // MAP v4 SKY TRAFFIC (world-sky-traffic.js): flying ship lanes over The Grid
  if(!api) return api;
  return _loadScript('/world-sky-traffic.js?v=20260928a').then(function(){
    const sl = new GLTFLoader(); sl.setMeshoptDecoder(MeshoptDecoder);
    window.__skyTraffic = window.buildWorldSkyTraffic({ THREE, scene, loader: sl, heightAt: api.heightAt,
      getPlayer: ()=> ({ pos: playerPos }),
      nightFactor: ()=> (_v4Sky && _v4Sky.nightFactor != null ? (typeof _v4Sky.nightFactor === 'function' ? _v4Sky.nightFactor() : _v4Sky.nightFactor) : 0) });
    window.__w3dDebug.skyTraffic = window.__skyTraffic;
  }).catch(function(e){ console.warn('[map-v4] sky traffic failed:', e && e.message); }).then(function(){ return api; });
})
```

Insert it as its own `.then()` step in the `window.__mapV4Ready` chain (e.g. right after the
wildlife step, before or after CITY v3 — order doesn't matter, it has no dependency on either),
and call `window.__skyTraffic.update(dt)` alongside the other per-frame `.update(dt)` calls
(wildlife, dragons, city v3) in the main render/animate loop.

## Tests

`node tools/tests/world-sky-traffic.test.cjs` — vm-loads the real script against the real
`tools/ual/node_modules/three/build/three.cjs` build (not a stub) with a fake synchronous
`GLTFLoader` (still using real `THREE.Mesh`/`BufferGeometry`/`Material`). Covers: 40 ships / 12
lanes build correctly, lanes close (t=0 ≡ t=1, no seam jump), positions stay finite and inside the
60-140 m altitude band over a simulated 5 minutes, `update()` constructs zero new
`Vector3`/`Quaternion`/`Matrix4`/`Color` after the initial build (checked via a counting `Proxy`
around those constructors), night factor ramps `emissiveIntensity`, far ships (>2.5 km) throttle to
2 Hz while near ships update every frame, and `dispose()` removes the group from the scene.

`node --check public/world-sky-traffic.js` — syntax check, passes.
