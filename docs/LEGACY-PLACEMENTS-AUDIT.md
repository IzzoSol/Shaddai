# Legacy placements audit — "old models near the city centre"

Date: 2026-09-26 · Branch: `feat/world3d` (working copy, including other agents' uncommitted `SHADDAI-WORLD-3D.html` MAP_V4 edits) · Read-only audit, verified with `node` against `world-layout.js` and `assets/terrain/terrain.json`. No browser run.

## What the owner reports

These models stand around world (x≈391, z≈-292), inside the city: rock spires with lava cracks, a gothic fortress with a big red dragon, a white spiral pagoda tower, a black/purple lighthouse tower, red mushroom homes, a floating wooden crate with black claws, an arcade-machine cluster on a platform, a teal glass tower and a lavender building.

## Headline

1. **No module on the default map (MAP v3) hard-codes a realm model near the city.** Every realm or hero model gets its position from `WORLD_LAYOUT` (`realmModels`, `biomes`, `landmarks`), and all of them sit 1 080–2 400 u from the centre, outside the city (radius 650). The table below lists each one.
2. **Under `?map=v4` (the uncommitted MAP_V4 wiring in `SHADDAI-WORLD-3D.html`), the v3 realm modules still run with v3 coordinates.** The v4 terrain is about 39 000 u wide. Its Grid district has `grid_r_m` 1 600 m, which is about 6 222 u, and realms start at `r0_m` 1 900 m. The v3 realm models land 278–619 m from the centre, which puts **all of them inside the v4 city**. This matches the owner's list almost exactly:
   - volcano shelf and lava channels are the rock spires with lava cracks
   - `hero-fortress` plus `volcano-dragon` are the gothic fortress with the red dragon
   - `hero-mushroom-pods` and `homes-mushroom-pods` are the red mushroom homes
   - `hero-farm-sky-structure` is the floating "crate" (it floats 120 u up)
   - `hero-city-megatower`, `bld-sea-terrace-spire`, `bld-neon-observatory` and `bld-inverted-cube-hab` are the towers and the lavender building
   - `hero-arctic-outpost` and `hero-desert-terminal` are the likely "lighthouse"

   In v4 metres, the volcano cluster sits at about (276…452 m, −120…−207 m), and the desert terminal at (228 m, −305 m). The desert terminal is the object closest to the reported (391, −292).
3. **The same cluster also matches the pre-MAP-v2 layout (v1).** v1 had volcano `[420,-380]` r170, suburb `[540,40]` and meadow `[400,400]`. The v1 forge tower sat at `[332,-329]` and the fortress at `[420,-380]`, both within about 90 u of (391, −292). A browser that still runs a pre-`2eee2706` build (a stale cached HTML, or an old tab) shows exactly this. Commit `de4314e9` already replaced the caching SW with a kill-switch, so a hard reload should clear it.
4. **Two more sources can pin models in the wrong place:**
   - saved editor edits in `localStorage['shd.placementEdits']` (`world-editor.js`)
   - the legacy standalone page `public/world3d.html`, which has hard-coded city placements

## Module-by-module table

| # | File | What it places | Position source | Where (v3 units) | Matches owner's list? |
|---|------|----------------|-----------------|------------------|------------------------|
| 1 | `public/world-layout.js` (L47 biomes, L64 stations, L117 colosseum, L139 `realmModels`, L184–195 resolver) | Nothing directly. It is the source of truth and derives `realmColliders` | — | Realms 1 080–2 400 u. Transit ring R 1 150. Colosseum `[0,1660]` | It is where the positions come from. v3 numbers only; there is no v4 variant |
| 2 | `public/world-volcano.js` (L18–21 centre; L52–95 shelf, lava channels, embers; L96–104 models; L143 load) | Crater shelf, 4 lava channels + lights, embers, then `realmModelsFor('volcano')`: hero-fortress, forge-tower, ritual-circle, dragon, bridge, gate | Layout-derived (biome centre and `realmModels`) | Centre `[1477,-642]` r480. Models at 1 169–1 923 u | **YES**: lava spires/cracks, fortress, red dragon. Inside the city under v4 |
| 3 | `public/world-realmprops.js` (L41–44 manifests from layout; L45–64 v1 fallback literal; L94 load) | darkforest castle, rocks, crystals; suburb pod-block, cube-hab, observatory, terrace-spire, holo-market, megatower; meadow mushroom pods, floating farm; forest amphitheater; arctic dome, outpost; desert terminal; void rift gate; ocean market dome | Layout-derived. The v1 fallback literal is used only if `realmModelsFor` is missing | 1 080–2 407 u (see `node` dump in the appendix) | **YES**: mushroom homes, floating "crate", teal/lavender/white towers, "lighthouse". Inside the city under v4 |
| 4 | `public/world-falprops.js` (L32–39 ITEMS; L56 load) | bld-shop `[-40,-85]`, bld-arcade `[62,-55]`, 6 neon trees (ring 130 and near centre), roadside signs at r84, 4 crates `[36,110]`, `[44,118]`, `[30,122]`, `[-86,124]` | **Hard-coded**, but intended city props (fal "World Planner") | All within 140 u of the centre | Partly. `bld-arcade` is probably the "arcade-machine cluster on a platform". `prop-crate` is a 1.2 m crate, so not the giant floating one. These are current city props, not legacy |
| 5 | `public/world-landmarks.js` (L12–28 arena, L30–39 moat, L41–51 garage pad, L54–63 mecha-arena GLB) | Placeholder arena floor/rim + `bld-mecha-arena.glb`, darkforest moat torus, garage pad `[26,96]` | Arena and moat are layout-derived. Garage is hard-coded `[26,96]` | Arena `[0,1660]`, skipped when `buildColosseumExterior` exists. Moat at the darkforest centre | Not near. In v1 builds `bld-mecha-arena` stood at `[-14,460]` (another arcade-like platform). Already skipped in v3 and v4 |
| 6 | `public/world-colosseum.js` (L14 `X0=12000`; L62 landmark; L75 exterior; L125 arena instance) | Real-size colosseum exterior at the layout landmark, plus the interior instance on the x=12000 island | Layout-derived / island | `[0,1660]` (427 m) | Not in the list. Under v4 it sits inside the city (v4 `colo` realm r0 = 1 800 m) |
| 7 | `public/world-nature.js` (L38 scatter; L56–68 per-biome; L69 city belt; L76 load) | Instanced CC0 trees, bushes, grass, flowers, dead trees | Layout-derived (biome centre/radius). City belt ring 250–368 u | Per biome | No. Under v4 the forest/meadow/darkforest scatter lands in the city |
| 8 | `public/world-ocean.js` (L26–28 centre and dock; L162–164 fleet; L212 load) | Harbor dock, beacon, 4+ boats | Layout-derived | Ocean `P(2.70,1900)` | No. Already gated `!MAP_V4` |
| 9 | `public/world-biomes.js` (L149 forest, L451 arctic, L648 desert, L730 void, L829 grid, L935 boulders) | Procedural instanced mushrooms, ferns, ice, dunes, void shards, grid dressing, boulders | Layout-derived | Per biome | No (procedural). Already gated `!MAP_V4` |
| 10 | `public/world-transit.js` (L42 group; stations from `layout.stations`) | Ring stations, trains, maglev | Layout-derived, R 1 150 u | 1 150 u (296 m) | No. Under v4 the ring sits inside the city (v4 `ring_r_m` = 2 828 m) |
| 11 | `public/world-trails.js` | Light-trail spokes | Layout-derived | — | No. Gated `!MAP_V4` |
| 12 | `public/world-buildings.js` (agent buildings; bazaar L3961–4311) | Agent buildings at hexagon R 260, bazaar at `[-100,100]`, procedural props | Layout sectors | ≤ 300 u | No. This is the current city |
| 13 | `public/world-rideables.js` (L18–24) | rover `[34,18]`, craft `[-34,22]` | Hard-coded parking spots | Plaza | No |
| 14 | `public/portals/portal-plots.js`, `portal-dome.js` | Portal plots and dome | Registry | Hexagon | No. Disabled (`WORLD_PORTALS_ON=false`) |
| 15 | `public/world-editor.js` (L13 load edits; L16–21 `apply`; L23–29 `__registerPlaceable`) | Nothing of its own. It **re-applies saved absolute position/rotation/scale/hidden** to every registered model | `localStorage['shd.placementEdits']` in the owner's browser | Anything | **Possible.** Edits saved under an older layout pin models at their old absolute spots. Duplicate ids get keys `id~2` / `id~3` in *async load order*, so an edit can land on a different copy of the same model |
| 16 | `public/world3d.html` (legacy standalone page; L184 `V0=[-900,-160]`; L757–803 placements) | City: `bld-neon-observatory [-90,-76]`, `bld-sky-dome-v2 [90,-76]`, `bld-sea-terrace-spire [-134,24]`, `bld-inverted-cube-hab [130,23]`, `tower-crescent2 [0,-190]`, `castle-siege [-190,-160]`, 6× `homes-mushroom-pods` at `[60,-130]…[-150,-120]`, 4× `bld-apartment-pod-block`, obsidian rocks, volcano fortress and dragon at V0 | **Hard-coded** | All within 200 u of the centre except the volcano | **YES** if the owner opened `/world3d.html` (static file). The `/world3d` route serves the new page (`backend/server-production.js:3101`) |

## Concrete disable/fix list (not applied — these files belong to other owners)

Line numbers refer to the current working copy.

1. **`public/SHADDAI-WORLD-3D.html:420`**: `buildWorldVolcano(...)`. Change it to `if(!MAP_V4 && L && window.buildWorldVolcano)`. Better: pass a v4-mapped layout (see 7). Reason: under v4 it drops the v3 volcano (shelf, lava channels, fortress, dragon) at 300–490 m, inside the 1 600 m Grid.
2. **`public/SHADDAI-WORLD-3D.html:421`**: `buildWorldRealmProps(...)`. Gate it with `!MAP_V4` until the layout is v4-aware. Reason: it puts every realm and hero model (mushroom homes, floating farm, megatower, terrace spire, observatory, cube-hab, desert terminal, arctic outpost, sky dome, rift gate, castle) inside the v4 city.
3. **`public/SHADDAI-WORLD-3D.html:423`**: `buildColosseumExterior(...)`. Gate it with `!MAP_V4`, or move it to the v4 `colo` realm (bearing 172–196°, r ≥ 1 800 m). Reason: the exterior sits at 427 m, in the v4 city.
4. **`public/SHADDAI-WORLD-3D.html:425`**: `buildWorldNature(...)`. Gate it with `!MAP_V4` (per-biome scatter uses v3 centres). The city-belt scatter is fine to keep.
5. **`public/SHADDAI-WORLD-3D.html:426`**: `buildWorldTransit(...)`. Under v4, use `terrain.json` `ring_r_m × units_per_m` (about 11 000 u) instead of `layout.transit.radius` 1 150. Otherwise gate it with `!MAP_V4`.
6. **`public/SHADDAI-WORLD-3D.html:424`**: `buildWorldFalProps(...)`. **Keep it.** These are intended city props within 140 u. Only its colliders (it appends to `realmColliders` at parse time) need to stay in sync.
7. **Single root fix, `public/world-layout.js:47` (biomes), L64 (stations), L117 (colosseum), L184–195 (resolver)**: when `window.__MAP_V4` is set, derive each realm's `center` and `radius` from `terrain.json` `realms[]`:
   - centre at bearing `(c0+c1)/2`, radius `(r0_m+r1_m)/2 × U`
   - biome radius `(r1_m-r0_m)/2 × U`
   - stations from `terrain.json.stations`

   The existing resolver, colliders, volcano/realmprops/nature and interiors doors then follow automatically. Note: `world-layout.js` loads before the HTML sets `__MAP_V4`, so the flag must be read from `location.search` inside `world-layout.js` itself.
8. **`public/world-editor.js:13-21`**: saved edits apply with no layout-version check. Suggested change: store `{v: <layout version>}` with each edit, and skip or flag edits whose version differs from `WORLD_LAYOUT.version` (add a version field, for example `'v3'` / `'v4'`). Also key duplicates by their manifest index instead of the `~n` registration order (L25). Owner-side quick check: open the world with `?edit=1` and use "Reset all", or run `localStorage.removeItem('shd.placementEdits')` in the console.
9. **`public/world3d.html:757-803`** (the whole legacy page): delete the page, or replace its body with `location.replace('/world3d')`. It hard-codes realm and city models (mushroom pods at `[60,-130]` etc., `castle-siege [-190,-160]`, `tower-crescent2 [0,-190]`, terrace spire, observatory, cube-hab) inside the city radius and duplicates realm content.
10. **`public/world-landmarks.js:41-51`**: the hard-coded garage pad `[26,96]` is intended, so keep it. L15–28 and L54–63 are already skipped when the real colosseum exists. No change needed.
11. **`public/world-interiors.js:94-117`** (the interiors owner, i.e. this audit's author): the FORTRESS/CASTLE door positions come from `realmColliders`, so under v4 they follow the v3 coordinates into the city, like everything else. Fix 7 fixes these too. There is also a stale comment (`[420,-380]` etc., L42–46) left from MAP v1/v2.

## Appendix — v3 realm model positions (`node`, from `world-layout.js`)

r_m is the distance from the centre in metres (U = 3.889 u/m). The v4 Grid district ends at 1 600 m, so **every row below is inside the v4 city**.

| realm | id | x | z | r_m |
|---|---|---|---|---|
| volcano | hero-fortress | 1477 | -642 | 414 |
| volcano | volcano-forge-tower | 1227 | -498 | 341 |
| volcano | volcano-ritual-circle | 1746 | -805 | 494 |
| volcano | volcano-dragon | 1563 | -594 | 430 |
| volcano | volcano-bridge | 1775 | -344 | 465 |
| volcano | volcano-gate | 1072 | -466 | 301 |
| darkforest | hero-castle | -1970 | -635 | 532 |
| suburb | bld-apartment-pod-block / cube-hab / observatory / terrace-spire / holo-market / megatower | 1588…2092 | 74…578 | 427…541 |
| meadow | hero-mushroom-pods / farm-sky-structure / 2× homes-mushroom-pods | 770…1264 | 993…1419 | 409…467 |
| forest | hero-forest-amphitheater | 1078 | 65 | 278 |
| arctic | hero-sky-dome / hero-arctic-outpost | -920 / -704 | -1291 / -1123 | 408 / 341 |
| desert | hero-desert-terminal | 885 | -1186 | 381 |
| void | hero-void-rift-gate | 0 | -1340 | 345 |
| ocean | hero-beach-market-dome | -1334 | 595 | 376 |
