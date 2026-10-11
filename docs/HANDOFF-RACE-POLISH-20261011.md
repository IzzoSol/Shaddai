# HANDOFF: race track, items, ships, select screen (2026-10-11)

Repo `C:\Users\Brittany\Shaddai-3d`, branch `feat/world3d`. **Nothing here is committed yet.** Run `git status` first.
Opt-in tracks: `?tracks=meridian-tri` (or `meridian-8,meridian-8b`) `&trackcity=1`. Default page is unchanged.

## What exists now
| Area | Where | State |
|---|---|---|
| Meridian Trefoil circuit (3-fold symmetric, 10.7 km, 3 flyover crossings, 3 gate towers, force-field edges, gold/emerald markings) | `world-race.js` (`meridian-tri`), `world-race-track.js` | built, probe passed (before the markings + gold deck texture; re-probe) |
| Meridian-8 + twin 8 + single-lobe short laps | `world-race.js`, host aliases `__raceTracks` | built, probe passed |
| Edges (wall line) + respawn (race: +3 s, free ride: none) | `track.edgeAt`, `mount-ride setEdgeProvider`, host `__wireEdges`/`_freeKeeper` | probe passed (`tools/_probe-edges.cjs`) |
| Items: 15 total (added Mag Mine, Phase Shift, Chrono Field, Warp Jump) + roulette card + prize boxes | `world-race.js` ITEMS/weights, `world-race-run.js`, `world-race-prizebox.js` | code in, `node --check` ok, **not browser-tested** |
| HUD: km/h, boost bar, rotating minimap, item card | `world-race-run.js` (`buildHud2`) | built; live km/h not seen on track |
| Ships: 5 race ships, 4 light-cycles, six-seat sub (`sub6`), Rimba pod as water craft | `world-hovercars.js` | built, node checks ok; **basic compared to the refs** |
| Ship mechanics: accel/weight real, traits (boostDur, driftRate) | `world-hovercars.js` KARTS, `world-mount-ride.js`, `world-race-run.js` | code in, not tuned in play |
| Select screen: detail panel, groups (ships / cycles / water / cars / boards), emerald+gold | `world-race-select.js` | screenshot checked (thumbnails fixed to 2x + antialias, not re-seen) |

## Not done / open
1. **Vehicle quality.** Code-lofted hulls (about 700-1400 tris) are far from the concept art. Next step is hero models made in Blender (subdivision, bevels, glass, emissive strips) exported to GLB and loaded through the ride `model` path. Blueprints: `docs/race-ships-lineup.blend`.
2. **Browser probes not run after the last edits** (markings, deck texture, thumbnails 2x, hull refine, Phong material): `node tools/_probe-tri.cjs`, `tools/_probe-meridian.cjs`, `tools/_shot-select.cjs`. One at a time (8 GB RAM; one probe was reaped for low memory).
3. **Fork (bypass) and the green secret jump** need item stacking (hold 3) and a ballistic jump in `world-mount-ride.js`. Not built. Shortcut path candidate is in `race-meridian-8-blockout.blend` (Shortcut_Dive).
4. **Street-level short laps** (lobes between buildings) need a re-route along open streets.
5. **Gate towers / tunnels through a real tower**: threading b1057 failed (neighbours 110-115 m); gate towers are purpose-built arches.
6. Perf: unexplained reef draw/triangle increase (3,506 draws, 15.6M tris) is untouched. Race adds about 25 draw objects to a built circuit.
7. Hoverboard riding has no wall line yet (karts only).
8. Multi-rider: `sub6` has `seat0..5` anchors; no passenger logic exists.

## Tools
`tools/_probe-tri.cjs`, `_probe-meridian.cjs`, `_probe-edges.cjs`, `_accept-race.cjs`, `_shot-select.cjs`, `_export-track.cjs`, `_check-ships.mjs`, `_check-groups.mjs`, `_export-ships.mjs`.

## Integration pass (2026-10-11, late) - static only, NOT browser-verified
- **Reef city anchor:** `bootReef` (host, ~line 487) now searches outward from the Crystal Sea dock (then the ocean centre) for an 80 m water patch before falling back to the old map-wide search. Still behind `?reef=1`.
- **Train link:** the underwater tube now ends at the **Harbor Line Station** (ring train stop beside the Crystal Sea) instead of the far Central Station.
- **Lazy circuits:** `window.__ensureRaceTracks([cid])` + wrapped `window.__raceStart`: Meridian circuits build on first start (3-5 s height raster), so default boot pays nothing. The race select lists them without `?tracks=`.
- **Blender map:** `docs/SHADDAI-MAP-OVERVIEW-LIGHT.blend` (light proxies only, 84 objects): realms, train ring, 8 stations, 8 dragons, Grid + 983 buildings, reef city + tube, race tracks (MAIN trefoil, ALT 8, ALT twin), colosseum, hover park, forge markers. Organised into collections 00-05.
- **To verify (one browser run, ~1 GB RAM):** default boot (no flags), `?reef=1` (log `[reef] stations placed` + `tube line`), then start `meridian-tri` from the race select. Compare draw calls / triangles against 3,506 / 15.6M.
- **Static audit:** 114 external scripts = 2.5 MB (not the bottleneck); public holds 242 MB GLB + 123 MB PNG + 51 MB JPG; `public/realms/assets/*.js.map` is 10.8 MB of dead weight. Boot is already progressive (`docs/PERF-LOAD.md`).

## Harbor Ring Canal (2026-10-11, owner approved "ring outside the city") - built, NOT browser-verified
- **Script:** `tools/carve-ring-canal.py [--level 25] [--dry]` reads the original terrain (never edits it) and writes `public/assets/terrain-ww/{height16.bin,terrain.json,color.jpg}`.
- **Route:** DP over angle x radius at a constant 25 m water level: 12.3 km, radius 1850-2100 m (hugs the outside of the Grid, inside the train ring at 2829 m). Channel 44 m wide, bed 4 m deep; trench walls blend over 30 m, low ground raised to a 1.5 m levee. Max cut 46 m (walls), max fill 28 m, ~98k cells touched.
- **Water:** one `river` entry (`id: harbor-ring`, `level_m: 25`) in the patched `terrain.json`; the game's `_buildV4Water` already turns river entries into bodies.
- **Switch:** `?waterways=1` loads `/assets/terrain-ww/` (host terrain build, ~line 951). Default stays on `/assets/terrain/`.
- **Boats:** `world-mount-ride.js` gets `surfY()`: water craft (`kart-sub6`, `kart-pod`, anything with `water: true`) ride the water surface via the host `waterAt` option. Land vehicles are unchanged.
- **Still to do:** the Crystal Sea lift (2 m sea to 25 m canal, 23 m), harbour gates / realm spurs, bridges under the train ring (ring at 2829 m is outside the canal at <= 2100 m, so likely no crossing), per-realm water looks, buoys.
- **Verify:** one headless run with `?waterways=1`: check `[map-v4] water bodies:` includes a 6th `river`, then ride `kart-pod` onto the ring at about (0, 1850..2100 m N) and confirm it floats at 25 m.

## Canal extras + status check (2026-10-11, final) - static only
- **Ring regenerated** (`tools/carve-ring-canal.py`): radius range now starts at 1650 m (just outside the Grid) so the ring never crosses the Crystal Sea as a causeway: **11.1 km**, radius 1650-1950 m, level 25 m, max cut 48 m / fill 32 m.
- **8 realm spurs** (void 975 m, desert 900, volcano 900, suburb 950, forest 950, meadow 925, darkforest 325, arctic 950): outward along each realm's mid-compass until ground rises 35 m above the water or r 2650. Each is a `river` entry (`harbor-spur-<realm>`) in `terrain-ww/terrain.json`.
- **Sea lift:** `terrain.json -> harbor.lift {canal_m, sea_m}` (canal (-1202,-1202) m, sea (-1527,-1527) m, about 460 m apart). Host `bootHarborCanal` draws a gold arch + emerald beam at each end; a water craft (kart-sub6 / kart-pod) held still (< 9 m/s) inside a zone for 1.2 s is placed at the other end (4 s cooldown).
- **Buoys:** 72 (every 250 m on the ring, 200 m on spurs), one InstancedMesh, colour per realm (`harbor.buoys[].realm`).
- **Not done:** per-realm WATER look (water colour is a shader-wide uniform in `world-water.js`; per-body tint needs a shader change). Buoy colours carry the realm identity for now.
- **Dragons:** statically verified. `buildWorldDragons` is fed `WORLD_LAYOUT` (v4 ring stations, one dragon per station, rigged GLB, defeat flags in localStorage); `tools/tests/dragons.test.cjs` 24/24, `world-dragon-ride` 11/11, `world-dragon-elements` 11/11, including the city no-fly keep-out.
- **Academy in Blender:** `docs/SHADDAI-MAP-OVERVIEW-LIGHT.blend` collection `07_ACADEMY_ATHENAEUM` (x = +6000 m): plan-accurate proxy from `athenaeum-layout.js` (rotunda r34, 6 wings, apse, gate, 28 stations) + TURTLE polish (facade fins, gold columns, gate arch, apse pulse beacon). Next: bring the fins/columns/beacon/signature props into `world-athenaeum.js`.
- **Academy exterior in the open world:** the outside is the canon `academy-hall` block at the CLASS_01 marker (about 1018 m E, 802 m N); never seen rendered.

## Athenaeum close-out (2026-10-11)
- **Classes only:** wings relabelled Observatory Lab / Scriptorium / Co-Creation Studio / Tool Foundry / Music Hall / Safety Bureau; the seven agent halls stay the real city buildings. New **Portal Nexus** station (kind `portal`, rotunda) lists the seven halls as field trips; host exposes `window.__interiorsEnter(code)`.
- **Posters:** six ORIGINAL code-drawn posters (one atlas, one draw call) hung between the rotunda doorways and at the end of each wing (`world-athenaeum.js`, "POSTERS" block). The four owner reference images are third-party art with a website watermark, so they are NOT shipped; they only guided the designs.
- **Tests:** `tools/tests/athenaeum-layout` 11/11, `world-athenaeum` 14/14, `world-academy-client` 15/15.
- **Deferred:** exterior building (Blender proxy + TURTLE brief only), in-game interior props (balconies, globe table, desk arcs, green walls: `docs/SHADDAI-MAP-OVERVIEW-LIGHT.blend` collection `INTERIOR_reference_look`), return pads in the seven halls, billboards/banners.
- **City building variety (NOT applied, owner paused it):** `world-grid-city-v4.js` draws every tower as one stretched box with ONE window texture; the plan has 5 kinds. A ready patch (facade rhythm x3, lit-window hue x3, per-building brightness/dark glass, rooftop masts / roof gardens / crown rings, zero extra draw calls) is in the session scratchpad as `patch_city.py`; to redo: vary `gcUm/gcVm` and the emissive hue from `aAux.z`, and add rooftop `box()` instances keyed on a hash of `b.x_m,b.y_m`.

## Colosseum entry + Athenaeum exterior/interior props (2026-10-11, last pass)
- **Blender:** `docs/SHADDAI-MAP-OVERVIEW-LIGHT.blend` collection `08_COLOSSEUM` (x = +12000 m). Real dimensions from `world-colosseum.js` / `colosseum-dims.json` (floor ellipse 124x88, 100x64 pitch with lines, 4 m podium, 18+18 stepped rows, promenade, 46 m crown, 4 arcade storeys x 96 bays + engaged half-columns). Sub-collection `ENTRY_approach_lobby_metro`: replaces the plain lobby box with a barrel-vaulted hall (60x32x26), an 8-column portico with pediment, 12-step grand stair, three bronze doors with transoms, a 140x70 forecourt (lamp posts, statue plinths, fountain), and the underground metro station (100x24 m hall, platform strip, elevator tower, train tube). The big plain square the owner disliked is gone.
- **Not yet in game:** the Colosseum EXTERIOR at the map spot (0, -3130 m) is still the old building; the entry above is a design proxy to model/export. The interior lobby and the metro hall already exist in code (`world-colosseum.js`, `world-colosseum-metro.js`).
- **Athenaeum interior props (in game code):** balconies (2 levels + gold rails), holo plinth + globe + halo at the skill-tree dais, two arcs of console desks with screens, classroom desk rows per wing, green wall panels; ~10 draw calls, visual only. Tests 14/14, 11/11, 15/15.
- **Athenaeum exterior (in game code, opt-in `?acadext=1`):** `window.buildAthenaeumExterior` (drum, fins, glass dome, 6 wings with gold columns, apse + beacon, gate arch) placed at the CLASS_01 marker at 0.55 scale. Not yet seen on screen; check it does not clash with the canon academy-hall block there.

## Final push (2026-10-11): Colosseum exterior, city variety, tunnel lines
- **Colosseum exterior (in game, `world-colosseum.js` `buildColosseumExterior`):** plain lobby box replaced by a barrel-vaulted hall; 10-step wide grand stair; three bronze doors with emerald transoms; forecourt (140x70 plaza, 16 lamp posts, statue plinths, fountain); arch recesses glow warm; 56-figure additive holographic statue crown (one instanced draw). Opt-out: none (replaces the old lobby); visual check pending.
- **City building variety (APPLIED):** `world-grid-city-v4.js` facade rhythm x3, lit-window hue x3, brightness / dark glass per building, rooftop masts / roof gardens / crown rings (zero extra draw calls). `world-city-v3` 11/11, `world-city-heights` 18/18. Shader cache key `grid-city-v4-facade-var1`.
- **Tunnel-line cutscene travel:** `public/world-cutscene-travel.js` (J at Colosseum metro platform / Central / Harbor Line / Reef / canal lift). `?cutscene=0` off.
- **Still open:** hoverskate fix (owner has not said what is broken), FPS / loading / texture pass (needs one headless boot measurement: `node tools/_boot-smoke.cjs "?time=0.5"`, then `?waterways=1`, `?reef=1`, and a Meridian start), Colosseum stages 7+, academy exterior verification (`?acadext=1`), return pads in the seven halls.

## Physics + park pass (2026-10-11, node-only; browser runs were declined three times)
- **Unit tests, all green:** dragons 24, dragon-ride 11, dragon-elements 11, combat-core 35, lockon 21, hoverboards 14, hoverboard-moves 11, grind-integration 9, hover-tilt 3, hovercars 3, mounts 5, race 9, race-run 14, race-modes 5, race-mariokart 10, race-select 4, race-track 25, trick-score 19, skatejam-economy 6, race-landmarks 9, colosseum arena 17, city-v3 11, city-heights 18, athenaeum 14/11/15.
- **Stale tests fixed:** `world-hovercars` (21 designs now, tris < 1700) and `world-race-track` (draw budget <= 24 meshes; a built Dragon Gate deck is 21 meshes after force field, markings, gates).
- **Hoverskate park:** (1) 7 city towers (4 within 120 m, one 86 m tall) stood inside the park disc: `world-grid-city-v4.js` now skips buildings touching a 172 m keep-out at PLAZA_SKATE (-694.5, 1039.3); (2) the half-pipes/kickers were undersized next to the owner's plan renders, so `world-hoverpark-v2.js` now uses HP 40 x 56 m, R 9 m, pipes at x = +-34, kickers 18 x 11 x 4.4 m. Both are unverified on screen: check that `heightAt` / the race loop (r 104 m) still clear the pipes.
- **Blender:** `docs/SHADDAI-MAP-OVERVIEW-LIGHT.blend` collection `09_HOVERSKATE_PARK` rebuilt at x = +18000 m (obsidian plinth with gold edge, emerald rings, gold-ring bowl dish, U-pipes, rails with posts, kickers, drop tower + curved drop-in, emerald lanes) at the OLD pipe dimensions; the new colosseum is placed at its map spot (0, -3129 m) facing the Grid; the odd slab + pole were the metro platform strip / train tube and are now in the hidden `UNDERGROUND_metro_hidden` collection.
- **Loading speed (not done):** needs a measured boot. Static facts: 114 scripts = 2.5 MB; public holds 242 MB GLB + 123 MB PNG + 51 MB JPG; startup is already progressive (`docs/PERF-LOAD.md`); a built Meridian circuit costs ~21 meshes; the unexplained reef cost (3,506 draws / 15.6M tris) is untouched. Next: `node tools/_boot-smoke.cjs "?time=0.5"`, then with `?reef=1`, then `?waterways=1`.
