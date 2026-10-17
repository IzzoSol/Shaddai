# Grid City v4: city blocks for The Grid (Map v4)

The Map v4 centre district, **The Grid** (a flat disc, `grid_r_m` = 1600 m), is filled with futuristic city blocks: glass and steel towers, podium towers, cantilevered terrace stacks, landmark spires, tech halls, plazas, parks, skybridges and street lamps. The game and Blender both build the city from one generated plan file, so the two always match.

| File | Role |
|---|---|
| `tools/grid-city/grid-city-plan.cjs` | Deterministic generator (node, no deps). Reads `public/assets/terrain/terrain.json`. |
| `public/assets/world/grid-city-v4.json` | Generated plan (~353 KB). Do not hand-edit it; regenerate instead. |
| `public/world-grid-city-v4.js` | Game builder (ES5 IIFE): `window.buildGridCityV4(...)`. |
| `tools/blender/grid-city-v4.py` | Blender builder: collection `V4 Grid City`. |

## Layout rules (metres, X = east, Y = north, compass clockwise from north)
- The as-built city core at r < 170 m is left empty.
- 12 radial avenues every 30°. Each is a 10 m road with 8 m sidewalks.
- Ring roads at 0.36·R (576 m) and 0.62·R (992 m), each 12 m wide. The Grid edge is at R = 1600 m.
- 8 transit hubs sit on the edge at the station compasses (0, 27, 61, 104, 142, 221, 296, 332). Each keeps 60 m clear, and a 30 m corridor runs along each station spoke bearing.
- Every footprint keeps a **6 m setback** from every road. This includes cantilevered slabs. Lots that can't meet it are shrunk (up to 4 × 15 %) or dropped.
- Sectors are 30° wedges × 3 ring bands. Each sector is split into rows (radial) and lots (tangential), with lots of about 50–80 m. A 14 m local street runs every 3 rows.
- Heights run taller toward the centre, with +15–35 m along avenues. Towers are 60–220 m. Up to 10 landmark spires (260–320 m) stand next to the 0.36 ring.

## Current plan (seed 5888)
| | count |
|---|---|
| lots | 1433 |
| buildings | **983**: 455 tower, 103 podium+tower, 349 terrace stack, 67 tech hall, 9 spire |
| tiers | 4029 |
| plazas / parks / trees | 84 / 187 / 3241 |
| skybridges | 130 |
| lamps (every 40 m, both sides of avenues and ring roads) | 1305 |
| tallest | 319.8 m |

Known limitation: lots right next to the core are narrow, so a few towers there shrink below the nominal 24 m footprint (to about 17 m).

### Plan format
`buildings[]`: `{ id, kind, x_m, y_m, rot_deg, w_m, d_m, h_m, tiers, accent, skybridgeTo? }`
- `rot_deg` is the rotation about the vertical axis. Use it as-is for Blender `rotation_euler.z` and for three.js `rotation.y`.
- Local x (`w_m`) is tangential and local y (`d_m`) is radial.
- Each entry in `tiers` is `[w, d, z0, h, ox, oy, type]` in local metres. `type`: 0 box · 1 taper (top 0.62) · 2 crown (0.25) · 3 cantilevered slab · 4 needle (0.04, emissive).

Other arrays:
- `plazas[]`: `{ id, x_m, y_m, rot_deg, w_m, d_m, fountain_r_m }`
- `parks[]`: `{ ..., trees: [[x_m, y_m, r_m]] }`
- `lamps[]`: `{ x_m, y_m }`

Game units: `x = X·U`, `z = -Y·U`, where `U = units_per_m` (7/1.8).

## Game builder: draw calls
- **Box family:** every solid is an instance of one unit box: tiers, accent strips, corner fins, skybridges, lamp poles and heads, plaza and park pads, fountains and trunks. They share one patched `MeshStandardMaterial`. A per-instance `aAux = (taper, kind, seed)` attribute controls the top taper, the shading kind (glass with windows / emissive accent / matte) and the window UV offset.
- **Window texture:** one procedural canvas pair (a steel and glass `map`, plus an `emissiveMap` with about 42 % of windows lit). UVs are rebuilt in the vertex shader from each instance's real size, read back from `instanceMatrix`, at 24 m × 28 m per tile (3 m bays, 3.5 m floors).
- **Tree canopies:** low dome instances, the only other geometry.
- **Chunks:** 16 spatial chunks (8 × 45° wedges × r < 900 / r ≥ 900 m). Each chunk has its own bounding sphere, so three.js frustum-culls the whole chunk.
- **Totals:** 17,915 instances in **32 meshes**. That is at most 32 draw calls with the whole city in view, and typically 8–14 at street level. Shadows are off unless you pass `shadows: true`, which doubles the draw calls.
- **Colliders:** 1,117 circles are pushed to `WORLD_LAYOUT.realmColliders` with `label: 'grid-city'`: 1 per building, or 3–4 along a long hall. `world-collision.js` copies colliders only when it builds, so the builder calls `window.buildWorldCollision(L)` once afterward. Pass `rebuildCollision: false` to skip that. `dispose()` removes the colliders and rebuilds collision again.
- **Night:** `uNight` scales the window glow. Pass `night` (0–1, default 0.6) or `getNight(t)`, or call `city.setNight(k)`. The accent strips pulse slowly.

## Host integration (`public/SHADDAI-WORLD-3D.html`, only under `?map=v4`)
1. Next to the other v4 handles, add `_v4City`:
   ```js
   let _v4T = null, _v4Water = null, _v4Meta = null, _v4Fill = null, _v4City = null;
   ```
2. Chain one more `.then` onto `window.__mapV4Ready`, directly after the `world-fill-v4.js` step:
   ```js
       .then(function(api){   // MAP v4 GRID CITY (world-grid-city-v4.js): ~1000 instanced towers/terraces/spires in The Grid
         if(!api || !_v4Meta) return api;
         return Promise.all([
           _loadScript('/world-grid-city-v4.js?v=20260926a'),
           fetch('/assets/world/grid-city-v4.json?v=20260926a').then(function(r){ if(!r.ok) throw new Error('plan ' + r.status); return r.json(); })
         ]).then(function(res){
           _v4City = window.buildGridCityV4({ THREE, scene, camera, heightAt: api.heightAt, plan: res[1] });
           window.__w3dDebug.gridCityV4 = _v4City;
         }).catch(function(e){ console.warn('[map-v4] grid city failed:', e && e.message); }).then(function(){ return api; });
       });
   ```
3. In the render loop (the `if(MAP_V4){ ... }` line):
   ```js
   if(_v4City) _v4City.update(t, dt, camera.position);
   ```

## Regenerate
```
node tools/grid-city/grid-city-plan.cjs                 # default seed 5888 → public/assets/world/grid-city-v4.json
node tools/grid-city/grid-city-plan.cjs --seed 42       # different city, same rules
```
The generator prints the stats. Keep the JSON under 400 KB; lot sizes are the `BANDS[].lot` ranges. After regenerating, bump the `?v=` on the fetch.

Blender:
- Headless: `blender -b --factory-startup --python tools/blender/grid-city-v4.py -- <repo>`
- Over the socket: set `bpy.app.driver_namespace['SHD_REPO']` first.

Building tiers are linked duplicates of 5 archetype meshes (`GC-box/taper/crown/slab/needle`, about 4000 objects), and `Object.color` carries the facade tint. Accents, lamps, pads, bridges and trees are merged into one mesh per material (10 objects). The glass material builds windows from world position (3 m × 3.5 m) and lights about 40 % of them with white noise.

## Verification done
- `node --check` passes on both JS files.
- The generator runs.
- A node smoke test of the builder with a mocked THREE (three is not installed locally) gives 983 buildings, 17,915 instances, 32 meshes and 1,117 colliders, and `dispose()` removes the colliders.
- `python -m py_compile` passes on the Blender script.
- **Not yet verified in a real WebGL or Blender run:**
  - the shader patch targets `#include <uv_vertex>`, `<begin_vertex>`, `<map_fragment>`, `<color_fragment>`, `<metalnessmap_fragment>` and `<emissivemap_fragment>`, plus the r152+ `vMapUv` / `vEmissiveMapUv` varyings (three r180 in the host);
  - the Blender node graph.
