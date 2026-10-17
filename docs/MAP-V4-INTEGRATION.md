# Map v4 integration (behind `?map=v4`)

Status 2026-09-25: wired in `public/SHADDAI-WORLD-3D.html`, checked with `node --check` and by reading the code. **Not yet run in a browser.** Nothing changes without the flag.

Open with `/SHADDAI-WORLD-3D.html?map=v4`.

## What's wired

| Piece | How |
|---|---|
| Flag | `const MAP_V4 = /[?&]map=v4/.test(location.search)`, also exposed as `window.__MAP_V4`. |
| Scripts | `world-terrain-v4.js` and `world-water.js` are loaded dynamically (`?v=20260925v4a`) and only when the flag is on. |
| Terrain | `buildWorldTerrainV4({THREE, scene, camera, base:'/assets/terrain/'})`. `worldTerrain` becomes a proxy (`{v4:true, heightAt, update(){}, api}`), so **every existing `worldTerrain.heightAt` call site reads the v4 heightmap** with no other edits. That covers player groundY, the climb limit, the elevated-deck guard, agent-body seating, elevators `getGroundY`, buildings, volcano, realm props, colosseum exterior, fal props, nature and transit. `window.WORLD_HEIGHT_AT` is set by the module (used by world-spawn and world-interiors). |
| Build order | Every builder that samples heightAt *at build time* waits on `window.__mapV4Ready`: the realm modules, `buildWorldBuildings` (so `__worldBuilt` and the ENTER gate wait for it too) and the agent-body queue. If v4 fails, `window.__mapV4Failed = true` and everything builds on flat y=0 so the gate can't trap. |
| LOD / water tick | `_v4T.update(t,dt)` and `_v4Water.update(t,dt)` run every frame, **including during the sky-dive**, so the landing zone is already refined when you touch down. |
| Water | Bodies come from `terrain.json.water`, converted from metres to units: `x = X·U`, `z = −Y·U`, `level = level_m·U`, with U = `units_per_m`. The ocean is the `ocean` realm's annular sector (compass c0−2°..c1+2°, r0_m..r1_m; compass 0 = +Y, x = r·sinθ, y = r·cosθ). There are 5 lakes (center/radius) and 4 rivers (path/width, at the given level). `sun` is passed, so the water follows the day/night light. |
| Swim law | Under v4 you float on `_v4Water.waterHeightAt(x,z)` wherever the ground is more than 1u below the water surface. The old "ground < −0.45 → float at y≈0" rule is off under v4. |
| Camera / fog | `near 0.5`, `far 48000`. FogExp2 density is `0.000055`: about 7% haze at 5k units, 50% at about 15k, 95% at about 31k. |
| World edge | A round clamp at `rim_m·U − 6` (≈ 18 660u). Beyond the rim the heightmap drops to the −420 m cloud-sea floor. |
| Spawn | `onArrive` puts the player at the Grid centre `(0, −100)` (−100 clears the Source spire, same offset world-spawn uses) on v4 ground. |

## Skipped under the flag

| Module | Why |
|---|---|
| `buildWorldTerrain` (world-terrain.js) | Replaced by v4. The script tag still loads, but it only defines the builder. |
| `buildWorldBiomes` | Map v3 biome ground patches and water discs would float or clash. |
| `buildWorldOcean` (Crystal Sea) | Replaced by world-water. Note that `window.__worldOcean` is null under v4. |
| `buildWorldTrails` | Map v3 mountain-pass light-roads. |
| `buildWorldLandmarks` | Takes no heightAt, so it would float or be buried on v4 ground. |
| Tron `GridHelper`s g1/g2 | Flat y=0 planes. Hidden at boot, but themes can re-show them. |

## Open issues

1. **Realm model positions are still Map v3.** Volcano, realm props, colosseum exterior, fal props, nature, transit, buildings and council agents sit on v4 ground, but at v3 XZ (half 2600). They will be re-laid from Blender next, using `terrain.json` realms and stations.
2. **Host-page decor at fixed Y.** The central monument, ORACLE/QUILL zone decor, the grid bike trail (y 0.35), portal markers and other items in SHADDAI-WORLD-3D.html use absolute y≈0. The Grid centre is about 6 m (≈23u) high on v4, so these get buried. Each one needs a `heightAt` seat.
3. **Interiors "island" at x≈6000.** Rooms used to be off-map; under v4 they fall *inside* the terrain footprint (about 1.5 km east of centre), where hills could poke through room floors or be visible from rooms. world-interiors.js belongs to another agent. Options are to move `ROOM_ISLAND_X` beyond the rim (> 19 500) or hide the terrain group while inside.
4. **Themes** (`world-themes.js`) set fog densities tuned for the small world (0.004–0.019). Applying a theme under v4 fogs out the world. Themes need a v4 scale factor.
5. **Loading gate 9 s fallback.** If the 8 MB heightmap plus colour map takes longer than the gate's fallback timer, ENTER may unlock before the ground exists. The player then lands on y=0 until it arrives; the groundY ease snaps on jumps larger than 4u.
6. **Collision / minimap / world-editor** still read `WORLD_LAYOUT` (v3). The minimap scale and the sector colliders are v3.
7. **River level.** The rivers use terrain.json `level_m` (2 m). One sampled point along river 1 is at 2.2 m, so there may be short dry or overflowing stretches. Passing no level (world-water "auto" mode) is the alternative if that shows.
8. **Unverified at runtime:** z-precision at near 0.5 / far 48k, water build time (the ocean depth bake is 1024² heightAt samples), and v4 LOD cost during the dive.
