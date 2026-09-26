# Map v4 Realm Fill (`public/world-fill-v4.js`)

This module fills the Map v4 world (about 10 km across, only active with `?map=v4`). It follows `docs/REALM-FILL-PLAN.md` and uses only models already in `public/assets/models/**`, so it spends nothing on fal.

- **What it places:** per-realm vegetation and rocks, wilderness cover, 9 waystations, 5 floating islands and 4 river bridges.
- **Placement is deterministic.** It is seeded per realm, so changing one realm's spec does not reshuffle the others.
- **Placement is pure JS.** The planner runs in node (`module.exports`) and in the browser (`window.__fillV4Core`).

```js
const fill = window.buildWorldFillV4({ THREE, scene, loader, heightAt, isWater /*optional*/, terrainMeta, camera, fill: { /*knobs*/ } });
fill.update(t, dt, camPos);   // every frame (the cell pass is throttled to 5 Hz internally)
fill.stats();                 // counts, cells, visible draw calls/tris, near/far distances, waystation sites
fill.dispose();
```

## Coordinates
- `terrain.json` uses metres, with X = east and Y = north.
- Compass angles are measured clockwise from north, so X = r·sinθ and Y = r·cosθ.
- Game coordinates: x = X·U and z = −Y·U, where U = `units_per_m` (7/1.8 ≈ 3.889).
- `heightAt(x, z)` takes and returns game units.

## What goes where (counts from the real `height16.bin` with density 1)

| Realm | Content | Count | Size |
|---|---|---|---|
| darkforest | Dead trees (deadtree 5/6/7/9/10, steel-violet tint) plus dark teal-tinted maples (mapletree 1/4/5) | 2,500 (1,500 + 1,000) | 9–18 m tall |
| forest (Quill) | Maple (mostly the low-poly mapletree-4) plus birch (mostly birchtree-4) | 1,500 (900 + 600) | 10–16 m |
| meadow | Birch (1/4/5, faint blossom tint) | 1,200 | 10–16 m |
| meadow | Flower clumps and flowering bushes, in clusters of 5–12 | 2,000 | 0.5–1.6 m |
| suburb | Sparse maple street trees (18 m spacing) | 300 | 8–12 m |
| ocean | `kit/palm-tree03` on island ground only (more than 2 m above water) | 400 | 9–13 m |
| arctic | Frost-tinted dead trees plus `mountain01`/`mountain05` ice outcrops | 240 (200 + 40) | Trees 7–14 m; rocks 40–120 m wide, sunk 18% |
| volcano | Burnt (near-black) dead trees plus dark `mountain05` outcrops | 230 (200 + 30) | Trees 7–14 m; rocks 40–110 m wide |
| desert | `sand-mount` dunes | 60 | 30–90 m wide, sunk 5% |
| void | `portal-effect02` rift sparks, floating 3–9 m up | 6 | 10–16 m |
| colo | Nothing (it stays lawn) | 0 | — |
| wilderness (everywhere outside a realm core) | Bushes and grass in clusters, plus scattered maple-1/4 and birch-4 | 2,000 (1,300 + 700) | Small 0.6–1.8 m; trees 9–14 m |
| **Total** | | **10,436 instances** | |

**Realm core.** A point is inside a realm's core when both of these hold:
- its compass angle is between `c0+6°` and `c1−6°` (the terrain's borders use a 3.2° inset plus about ±9° of noise warp);
- its radius is between `r0_m+30` and `r1_m`.

Forest is nested inside the suburb arc, so it is treated as a radial sub-realm, not a border. Everything outside a realm core counts as wilderness. That covers:
- the belt from 1,680 m to 1,900 m;
- the corridors around each border compass;
- the gap between the forest and the suburb.

**Every instance skips these:**
- Heights below `water_level_m·U + 0.5u`.
- Anything `isWater` flags.
- River corridors (half-width plus 6 m) and lake discs (radius plus 6 m), taken from `terrain.json`. This check is pure, so it works without `isWater`.
- Slopes steeper than 35°, sampled at 4 neighbours ±4 m away (rocks allow up to 42°).
- Radii inside `grid_r_m + 80`.
- Radii within 60 m of `ring_r_m`.
- Points within 60 m of a station.
- The rim, from `rim_m − 60` outward.
- Existing `WORLD_LAYOUT.realmColliders` (radius plus 4 m).
- A 30 m disc around each waystation, and the bridge span plus 15 m.

Trees also keep a minimum spacing from each other.

**Tints** are set with `InstancedMesh.setColorAt`, so they cost no extra draw calls.

## Waystations (9)
There is one waystation per border compass. Borders are computed from the realm table (clockwise, with nested realms skipped). Each one is placed at r = 0.62 × rim on the flattest spot within ±200 m, found by sampling a 20 m grid and scoring the height spread of 9 points on a 16 m circle.

| # | Border | Compass | Relief |
|---|---|---|---|
| 1 | desert–volcano | 45° | 0.69 m |
| 2 | volcano–suburb | 80° | 0.21 m |
| 3 | suburb–meadow | 122° | 0.41 m |
| 4 | meadow–colo | 172° | 0.14 m |
| 5 | colo–ocean | 196° | 0.48 m |
| 6 | ocean–darkforest | 263.5° | 2.43 m |
| 7 | darkforest–arctic | 316° | 1.17 m |
| 8 | arctic–void | 345° | 0.44 m |
| 9 | void–desert | 15° | 0.21 m |

**Plaza layout.** Local +Z faces the Grid (the origin).

| Piece | Size | Position |
|---|---|---|
| `kit/platform-03` | 12 m wide | Bottom on the low side of its footprint, sunk `platformSink` = 0.3 m |
| `information-stand01` | 2.5 m | On the platform top, at (−3.2, 1.6) m |
| `elevator-teleport01` | 4 m wide | On the platform top, at (3.0, −1.8) m |
| `japanese-arch` | 12 m wide | 10.5 m toward the Grid |
| 2 × `fal/prop-street-lamp` | 6 m tall | At (±7.5, 7.5) m |

- The arch, the lamps and the platform are each seated on `heightAt` at their own position.
- Each waystation is registered as `fill:waystation-<n>` (`source: 'world-fill-v4.js'`).
- Each pushes the collider `{x, z, r: 6.5 m, label: 'waystation'}` into `WORLD_LAYOUT.realmColliders`. `dispose()` removes them again.

**Deviation: the arch is 12 m, not 8 m.** The arch GLB is about 3.5× wider than it is tall. At 8 m wide it would only be 2.3 m tall, which is too low to walk through at 1.8 m; 12 m wide gives about 3.4 m.

## Floating islands (5)
- One `kit/floating-island-01` hovers above each `terrain.json` lake centre, 40–70 m wide and 60–120 m above water.
- `update()` bobs each island ±2 m on a 14 s period and turns it slowly (0.01 rad/s).
- Saved placement-editor edits are respected: the bob runs around the edited pose. Animation is frozen under `?edit=1`.
- Each island is registered as `fill:island-<n>`.

## River bridges (4)
- A `kit/sci-fi-bridge` is placed where each river path crosses r = 0.55 × rim (2,640 m).
- The bridge's long axis is measured with Box3 and turned across the river's local direction.
- Length is the river width plus 20 m, which is 64 m.
- The deck sits 0.5 m below the lower dry bank (banks under water are ignored) and never less than 1 m above water.
- Each bridge is registered as `fill:bridge-<n>`. Bridges have no collider.

## Performance (budget: under 150 draw calls and under 1.5M instanced triangles visible)

**LOD scheme:**
- **Near:** full Quaternius models are split into fine 900 u cells. A cell is visible while its nearest point is within `nearDist` (900 u, about 230 m).
- **Far:** procedural proxy trees at 17–30 triangles each (leafy, dead or palm, vertex-coloured and tinted per realm) are split into coarse 3,600 u cells. A cell is visible while its nearest point is within `farDist` (9,000 u).
- **Swapping:** the proxy shader discards any instance whose origin is within `nearDist` of the camera. The swap to the full model is therefore per tree, not per cell, and leaves no gaps.

**Why proxies:** the lowest-poly Quaternius tree is still 700–1,100 triangles. With real models as the far LOD, the visible count measured 2–6M triangles.

**Other cell rules:**
- Small props use the fine grid, visible within `smallDist` (1,800 u).
- Rocks, dunes and portals use the coarse grid, visible within `bigDist` (16,000 u).
- Only near tree cells cast shadows, and only within `shadowDist` (2,500 u), toggled per cell.

**Adaptive budget.** Five times a second the module counts, in the frustum, the draw calls and triangles of every visible InstancedMesh:
- If triangles are over budget, it shrinks `nearDist` (when near cells account for more than half the triangles, down to a floor of 450 u) or `farDist` (down to a floor of 4,500 u).
- If draw calls are over budget, it shrinks `farDist`.
- Below 70% of budget, both distances grow back toward their defaults.

**Offline estimate.** This is the worst case for each position over 4 view directions, using a 110° cone, real GLB triangle counts and the default distances.

| Position | Draw calls | Triangles |
|---|---|---|
| Darkvault station | ≤ 84 | ≤ 243k |
| Deep darkforest | ≤ 87 | ≤ 319k |
| Forest (densest) | ≤ 102 | ≤ 1.32M |
| Meadow | ≤ 123 | ≤ 396k |
| Grid edge | ≤ 54 | ≤ 37k |
| Ocean | ≤ 31 | ≤ 19k |

**Knobs** (`opts.fill`, in game units unless noted):

| Knob | Default |
|---|---|
| `cellNear` | 900 |
| `cellFar` | 3600 |
| `nearDist` | 900 |
| `nearMin` | 450 |
| `farDist` | 9000 |
| `farMin` | 4500 |
| `smallDist` | 1800 |
| `bigDist` | 16000 |
| `shadowDist` | 2500 |
| `budgetTris` | 1.5e6 |
| `budgetDraws` | 150 |
| `density` (multiplies every count) | 1 |
| `tick` (seconds between cell passes) | 0.2 |
| `platformSink` (metres) | 0.3 |

For a quick perf fallback on weak GPUs, use `density: 0.6` or `nearDist: 600`.

**Build cost:**
- Planning takes about 160–320 ms in node, doing about 150k `heightAt` calls.
- It creates about 6,400 InstancedMeshes in total, but only the visible ones are drawn.
- It loads 28 unique GLBs for instancing plus 7 for the singles, all through `window.__queueLoad` (4 in flight, with retries).
- The meshopt GLBs need the host loader with `setMeshoptDecoder`.

## Host integration (`public/SHADDAI-WORLD-3D.html`, `?map=v4` only)

1. Next to `let _v4T = null, _v4Water = null, _v4Meta = null;` (around line 345), add:
```js
let _v4Fill = null;   // world-fill-v4.js api (vegetation, waystations, islands, bridges)
```

2. In the `window.__mapV4Ready` chain, after the last `.then` (the one that calls `__buildRealmModules()`, around line 455), chain one more step. It runs after the realm modules, so their `realmColliders` (colosseum, fal props) are already in place to be avoided:
```js
    .then(function(api){
      if(!api || !_v4Meta) return api;
      return _loadScript('/world-fill-v4.js?v=20260926a').then(function(){
        // own loader, NOT __loadMgr: the fill streams in after entry instead of gating the boot bar
        const fl = new GLTFLoader(); fl.setDRACOLoader(dracoLoader); fl.setMeshoptDecoder(MeshoptDecoder);
        _v4Fill = window.buildWorldFillV4({ THREE, scene, camera, loader: fl, heightAt: api.heightAt,
          isWater: (_v4Water && _v4Water.isWater) ? (x, z)=> _v4Water.isWater(x, z) : null,
          terrainMeta: _v4Meta });
        window.__w3dDebug.fillV4 = _v4Fill;
      }).catch(function(e){ console.warn('[map-v4] fill failed:', e && e.message); }).then(function(){ return api; });
    });
```
Replace the `;` that currently ends the chain. `isWater` is optional: drop it if `fill.stats().planMs` is high, because the planner already masks rivers and lakes from `terrain.json` and anything below water level.

3. In the render loop, extend the line `if(MAP_V4){ if(_v4T) _v4T.update(t, dt); if(_v4Water) _v4Water.update(t, dt); }` (around line 4545):
```js
  if(MAP_V4){ if(_v4T) _v4T.update(t, dt); if(_v4Water) _v4Water.update(t, dt); if(_v4Fill) _v4Fill.update(t, dt, camera.position); }
```

**Browser check:** open `?map=v4`, then in the console:
- Run `__w3dDebug.fillV4.stats()` and expect 10,436 planned, `failed: 0` and `drawCalls` under 150.
- Look for `[fill-v4] planned …` in the log.

## Tests (node, no npm)
- `node --check public/world-fill-v4.js`
- **Planner test** against the real heightmap, which checks:
  - borders (9) and the nested forest;
  - arc wrap and compass maths;
  - determinism;
  - that no placed instance breaks a constraint (grid, ring, stations, water, realm arc inset, ocean islands);
  - that every referenced GLB file exists;
  - the visibility and triangle simulation.
- **Runtime smoke test** with three r185 from a sibling repo's `node_modules` and a stub loader, which checks:
  - every batch is built (17,436 = items plus the far proxies of trees);
  - 9 colliders are pushed, and `dispose()` removes all of them and every scene child;
  - waystation pieces are seated at −0.1 m relative to the ground;
  - trees sit at −0.3 m relative to the ground;
  - the bridge measures exactly 64.0 m along the across-river vector, with its deck at 7.1 m.

## Not verified yet (needs the one browser run)
- The real look of `platform-03` seated at ground level. The GLB is about 12 m wide and 5 m tall; if it reads as a plinth, raise `platformSink` to bury it.
- The proxy shader patch compiling on three r180. It uses the `begin_vertex` and `clipping_planes_fragment` include hooks, which both exist in r180.
- The portal-effect02 material, which may want additive blending.
