# FINAL AUDIT, 2026-10-11 (Shaddai-3d, branch feat/world3d, nothing committed or pushed)

## Verified (node/static only; no headless browser run was approved)
- **Unit suites:** 87 of 87 `tools/tests/*.cjs` suites pass, plus `tests/colosseum/arena.test.mjs` 17/17. Covers dragons (24/11/11), combat core (35), lock-on (21), hoverboards + tricks (14), board moves/grinds (11 + 9), trick scoring (19), hover tilt, mounts, hovercars (21 designs), race rules / run / modes / select / track (25), city v3 / heights, athenaeum (14/11/15).
- **Syntax:** `node --check` clean on every module touched; the host page's main module parses.

## Built this session (code)
Race: Meridian-8 / twin / lobes / Trefoil (3-fold symmetric, gate towers, force-field edges, gold/emerald markings), prize boxes, 15 items + roulette card, HUD2 (km/h, boost, minimap), edges + respawn (race and free ride), 5 race ships + 4 light-cycles + 6-seat sub + pod, plumes / boost ring / traits.
World: Harbor Ring Canal (11.1 km, 8 spurs, sea lift, 72 buoys, surface-riding water craft) behind `?waterways=1`; reef anchored in the Crystal Sea; tube to Harbor Line Station; tunnel-line cutscene travel (J); lazy Meridian circuits.
Places: Athenaeum = classes only + Portal Nexus + posters + interior props + exterior (`?acadext=1`); Colosseum exterior (vaulted lobby, 10-step stair, 3 doors, forecourt, holo crown); hoverskate park keep-out (7 towers culled) + bigger pipes; city facade/rooftop variety.
Data: 26 waterfront plots (13 canal bank + 13 sea shore), `docs/waterfront-plots.json` and `harbor.plots` in `terrain-ww/terrain.json`.

## NOT verified (needs one headless run or a play session)
Everything visual: Colosseum exterior, academy exterior/props, city variety, park proportions, HUD2, prize boxes, plumes, canal water + lift + buoys, tunnel-line menu, cutscenes. Draw calls / triangles / load time after these changes (reef cost 3,506 draws / 15.6M tris still unexplained).

## Open (ordered)
1. One measured boot: `node tools/_boot-smoke.cjs "?time=0.5"`, then `?reef=1`, `?waterways=1`, a Meridian start; then fix the top cost.
2. Per-element dragon look (tint / wing / spike variants from the element sheet); new meshes only if wanted.
3. Waterfront plots: game integration (place buildings / sell through the plot system; markers only so far).
4. Forest + Void realms: no checklist items found open in `WORLD-COMPLETION-PLAN.md` beyond skeleton packs / lava castle; need the owner's list.
5. Colosseum stages 7+ (understage, agent floor, server arena routes); return pads in the seven halls; billboards.
6. Dead weight: `public/realms/assets/*.js.map` 10.8 MB (delete only with confirmation).

## Measured boot (2026-10-11, headless software GL, `?time=0.5`)
playable 146.7 s (software rendering, relative only) | page errors 0 | console errors 0 | **draw calls 3,484 | triangles 14.34 M | textures 436 | geometries 1,642 | heap 245 MB** | quality LOW | FPS not measurable under software GL (2 frames in 6 s).
Budget in memory is < 80 draw calls: the world is ~40x over. Earlier baseline ~3,150 draws, so +334 since then (not attributable to the race/city changes; city rooftop extras are instanced). First fixes to try, in order: per-system draw-call accounting (`?perf=1` / `__loadSummary`), instancing or merging the biggest mesh groups, texture count 436 (atlas / drop unused), triangle budget 14 M (terrain LOD + far-cluster culling already behind `?fcull`).

## Colosseum Host (2026-10-11)
Seventh vendor in `world-colosseum-vendors.js` (every 7th concourse kiosk, E to talk): race the Meridian Trefoil / Figure-8 / short lap / Dragon Gate (leaves the arena, starts the race), Boat mode (tunnel line to the canal lift; naval battle panel), five arena fight modes (`setField`: sand, tactics, team-attack, soccer, party). Stages 7+ (understage, agent floor, server arena routes) listed as "later".

## Draw-call accounting + static batcher (2026-10-11)
`node tools/_drawcall-audit.cjs "?time=0.5"` (`docs/perf-drawcall-audit.json`): 2,336 scene draw submissions at 4 s after playable. Unnamed top-level `Mesh` (916 draws, 595 materials) and `Group` (895 draws, 450 materials) hold 1,811 of them; named groups are small (terrain 190, transit 125, farm-patch 31, building-entrances 26, realm props 22, water 20, air traffic 16, colosseum exterior 15). The anonymous pattern: ~470 unique-geometry BoxGeometry meshes with their own MeshStandardMaterial (111 to 154 distinct), ~150 PlaneGeometry decals, ~110 CylinderGeometry rings, clustered near the spawn / Source Temple area, i.e. `world-buildings.js` hero buildings and props.
**Fix shipped (opt-in):** `public/world-static-batch.js` + `?batch=1` merges FROZEN (`matrixAutoUpdate === false`), unnamed, single-material, opaque meshes with equal material values into one mesh per signature (undo kept). Measured with `?batch=1`: loose `Mesh` 916 -> 421 draws, `Group` 895 -> 390 draws (~1,000 meshes merged). Total comparison is not clean: the batch run waited 14 s (more far groups streamed in: world-fill-v4 225, grid-fabric-v4 166) vs 4 s for the baseline. Screenshot was the character-select overlay, so visual correctness of the merged scene is still UNVERIFIED; default stays OFF.
**Next:** (1) verify `?batch=1` in a real session, then make it default; (2) same-moment A/B (`WAIT_MS=14000` for both); (3) per-material dedupe at the source (`world-buildings.js` creates a material per mesh), so even without the batcher they share one; (4) merge the 190 terrain tiles and 166 fabric meshes; (5) cut 436 textures.

## Game Modes hub + batcher default (2026-10-11, second push)
- `public/world-game-modes.js`: MODES button (top right, under NAVI), one panel: RACE (Trefoil / Figure-8 / short lap / Dragon Gate / pick ride), BOAT (canal run via tunnel line, naval battle), FIGHT (Colosseum arena + tactics / team-attack fields), SKATE (park, skate jam), ACADEMY, TRAVEL. `?modes=0` hides it.
- Static batcher is now DEFAULT ON (`?batch=0` = off). Terrain tiles (190 draws) are NOT merged: the clipmap tiles are named and LOD-driven, so a blind merge risks seams; needs a terrain-module change plus a visual check.
