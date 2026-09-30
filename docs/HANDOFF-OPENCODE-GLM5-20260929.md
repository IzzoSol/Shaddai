# HANDOFF for OpenCode / GLM-5 — SHADDAI 3D World: speed + polish (2026-09-29)

Owner goals: playable + smooth on a weak laptop (Intel HD 620 / 8 GB), long view distance, buildings that look good. Never cap detail permanently: optimize, don't downgrade. No cash-out economy (Sparks closed-loop). Futuristic only.

## Repos / deploy (IMPORTANT)
- Source of truth: `C:\Users\Brittany\Shaddai-3d` (worktree, branch `feat/world3d`), remote `IzzoSol/Shaddai` (private). Main Render service (`shaddai-g81x`) is DOWN for memory until the 1st; do not touch it.
- **BETA = separate repo `IzzoSol/Shaddai-Beta`, branch `master`, static site in `site/`** (Render static, publish dir = site). Deploy = copy changed files from `Shaddai-3d/public/` into `Shaddai-Beta/site/` and push `master`. `.glb` is no longer gitignored there.
  Play URL: `https://shaddai-beta.onrender.com/SHADDAI-WORLD-3D.html` (landing: `/enter.html`, has a "Play the 3D World" button). Static host has no `/world` route.
- `public/beta-api-shim.js` (active only on hostnames containing "beta") forwards `/api/*` to `https://shaddai-g81x.onrender.com`. No env vars are needed for the world itself.
- Tests: `for t in tools/tests/world-*.test.cjs; do node $t; done` (all green at last run). Headless probes: `tools/_net.cjs` (bytes + time to playable), `tools/_tim.cjs` (loader step timings), `tools/_long.cjs` (main-thread long tasks after entry), `tools/_beta.cjs` (probe the live beta). Local server: `python -m http.server 3013 --directory public`. Chrome: `C:/Program Files/Google/Chrome/Application/chrome.exe` with `--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader`.

## What was measured (software renderer, so absolute numbers are pessimistic)
- Startup critical path (serial): terrain ~29 s -> canon ~11 s -> **grid-fabric ~75 s** -> city-v3; then the loader "warm" step (`renderer.compileAsync(scene)`) took **44 s at the "94%" screen**. Total ~95 MB / 745 requests before playable.
- Long main-thread tasks after entry: first-frame render 7-12 s (shader compile), mount-ride step 4 s, several 1-3 s tasks from streaming steps. These are the browser "wait / exit" dialogs.
- Draw calls ~2,000 at spawn, ~4,000 at street level; ~2.3-5 M triangles; 53 lights.

## What was changed for speed (all in `public/SHADDAI-WORLD-3D.html`)
1. Loader wait cap 45 s -> 25 s; shader warm-up capped at 6 s (`Promise.race`), rest compiles lazily.
2. Streaming steps after entry wait for `window.__fpsNow() >= 42` (max 25 s) — `_ldStep`/`_ldFps`.
3. Integrated/software GPUs (`Intel|Mesa|SwiftShader|llvmpipe|Microsoft Basic`, not Arc/Iris Xe) start on tier POTATO and set `window.__lite`.
4. **LITE mode** (`window.__lite`, forced with `?lite=1`, disabled with `?full=1`): skips steps `fill, clusters, dragons, wildlife, void-castle, sky-traffic` (`_LITE_SKIP`). `grid-fabric` is ALSO skipped in lite (this is why buildings look basic). Tried streaming it instead: the world then never became playable in the headless test (75 s main-thread build) — fix grid-fabric by time-slicing/merging it, then remove it from `_LITE_SKIP`.
5. Quality tiers: POTATO/LOW `cullR` raised 75/110 -> 170/230 so you can see further (owner complained "I can't see ahead"). Governor is `_updateGovernor` (fps EMA; steps down <50 fps, up >58 fps).
6. Earlier: fog-aware LOD cutoff in `world-clusters-v4.js` (`?nofogcut=1` to A/B), instanced batching, `terrain.setHeightExtra` hook (hoverpark deck as ground).

## Owner complaint now: "world looks basic, buildings basic, can't see ahead"
Cause: LITE mode skips the far/optional builds and POTATO tier used a 75 m cull radius + pixelRatio 0.55. Fix direction (do in this order, measure each with the probes above):
1. **Distance without cost**: keep low tiers but render far city as ONE merged/impostor mesh (baked low-poly skyline / billboard ring) instead of culling to nothing; tune fog far so the cull edge hides in fog; keep `cullR` as a soft LOD switch (real mesh near, impostor far).
2. **Draw calls** (biggest CPU cost on HD 620): ~2,000 unnamed meshes -> merge static geometry per district (`BufferGeometryUtils.mergeGeometries`) or `InstancedMesh`; target < 800 calls at street level. Terrain chunks and 53 lights are next hotspots — bake/limit lights (no per-light shadows; cap ~8 active), share materials.
3. **Startup bytes**: 95 MB. Lazy-load the 7 council agent GLBs (~9 MB, only the selected hero + on approach), defer `sc-*.glb` city kit until near, KTX2/WebP textures, meshopt everywhere, `height16.bin` (8.4 MB) -> quantize/gzip. Ensure Cloudflare/Render compress `.bin/.json` and set long `Cache-Control` for versioned assets.
4. **Long tasks**: move JSON parse + geometry building to a worker / chunk with `scheduler.yield`; split `first-frame` compile by pre-warming per-material with `compileAsync` during the loader; reduce unique shader programs (fewer material variants).
5. Then restore visual quality per tier: normal maps on hero buildings, better facade textures, emissive windows via a single atlas, SHADDAI palette (obsidian `#06080b` / emerald `#00ff9c` / gold `#e8c45c`).

## Features shipped this session (all committed)
- Hoverskate park (`world-hoverpark.js`, 7 rooms) + race runtime (`world-race-run.js`, Mario-Kart style items/pads) + rules (`world-race.js`, tests). Park deck/banks are real ground (verified deck 28 vs terrain 23.3, apron ramps).
- Rigged bots (Meshy v6): SCRAP, LANKY (humanoid), UNI9, ANALYST (wheel bots, procedural rig via `tools/rig-mount.mjs` kind `wheelbot`, no tire spin), casino dealer (static, 1.3 MB) in `public/assets/bots/`. Bot logic `world-bots.js` (10 bots, rules).
- Rideable mounts `world-mount-ride.js` + `world-mounts.js`: bull, mammoth, gorilla, hawk (flies), Aero Skiff hover ship (code-built, flies 40/78 m/s). **M** = Mount Store, **E** = mount/dismount. Riders seated via `world-riders.js`. Store is not location-gated yet.
- Colosseum concourse vendors `world-colosseum-vendors.js`: **E** at any of 24 kiosks (snacks/drinks/gear/mount dealer/cosmetics/wagers), Sparks only.
- Landing page: `enter.html` Play button. Map v4 is the default (`?map=v3` = legacy).

## Still TODO (priority for polish)
1. Perf/visibility per the section above (owner's #1).
2. Casino dealer bot not placed in the arcade interior (v3 arcade recipe NPC slot).
3. Hoverboard foil/pad dual mode (fly mode exists; needs energy + ceiling per `HOVERSKATE_TUNING`).
4. Mount Store gating to realm store locations (`WorldMounts.storesAt(station)` exists).
5. Colosseum lobby: outer concourse connecting all around + ramps to seats; playable floors; events/wagers server settle.
6. Agent buildings art/ad pylons; economy-service routes; Hedera/Solana adapters (docs/CHAIN-READINESS.md).
7. SHADDAI intro (fal, ~$30 left, spend only on approved items) — last.
- Docs to read first: `docs/MASTER-TASKBOARD.md`, `docs/PERF-LOAD.md`, `docs/NAVI.md`, `docs/REALM-HOMES.md`, `docs/CHAIN-READINESS.md`.

## Addendum (late 2026-09-29): light + program findings
- Headless probe `tools/_prog.cjs` at street level: **38-40 visible lights** (31 PointLights unnamed at scene root near the city core x~37..260, 4 volcano PointLights I=400, plus key/gold/camFill), 83 shader programs, 8,878 meshes (6,334 instanced), 1,564 unique materials (7,475 MeshStandard), 2,097 draw calls, 4.3 M tris, shadows off.
- Every MeshStandard fragment loops all visible lights -> big cost on Intel HD 620 and big shader compile. Turning off all city-core point lights (`?fewlights=1`, opt-in flag added) did NOT shorten the headless first frame (still ~28 s) — but the headless renderer is software (SwiftShader), so it is rasterizer-bound and cannot show real-GPU compile/fill cost. **Profile on the real laptop** (Chrome DevTools Performance + `?perf=1`) before optimizing further.
- Added `window.__lightSweep` (host, per-frame): lights on the far room island are off outside, world lights off inside rooms; re-checked every 4 s. `?fewlights=1` also disables city point lights outside.
- Best candidates (do these on real hardware): replace the ~31 per-room/legacy PointLights with baked lightmaps or emissive-only materials; cap to ~8 real lights; merge static meshes per district; KTX2 textures; lower `sc-*` building triangle counts / LOD.
- Lite mode is opt-in only (`?lite=1`). City fabric now loads in the background (no longer blocks the loading screen).

## Addendum 2 (latest): what is DONE for speed, and the owner's perf rules to apply (paste these to GLM-5)
DONE and verified headless (software renderer; ratios trustworthy, absolute fps not):
- **Light pool** (`window.__lightSweep`, host per-frame): all accent PointLights registered + hidden; a FIXED pool of 6 real lights follows the nearest (copies pos/colour/intensity/range live). Visible lights 40 -> 14, ~+35% fps in the same test, no shader recompiles (count constant).
- Heavy models simplified with `tools/simplify-heavy.mjs` (meshopt, originals in git): `shaddai-city/sc-*` 211k -> 130k tris, `fal/hero-*`/`bld-*` 880k -> 560k. Re-run with lower `maxTris` for more (e.g. `node tools/simplify-heavy.mjs public/assets/models/shaddai-city 12000`). Still heavy: `world-realm-props` (~750k tris), `world-fal-props` (437k), `sc-techlab` cluster (479k), `ACADEMY_HALL_1` (353k, single mesh in canon-v4.glb), volcano (142k), water (2x92k), char1 (321k).
- Loader: 25 s wait cap, 6 s shader warm-up cap, fabric loads in background, streaming steps fps-gated, `?lite=1` opt-in only.
- Probes (all in `tools/`): `_net.cjs` (bytes+time to playable), `_tim.cjs` (loader steps), `_long.cjs` (long tasks + errors), `_prog.cjs` (lights/programs/materials), `_tris.cjs` (top triangle owners), `_fps.cjs` (relative fps), `_cpu.cjs` (CDP JS profile: JS is only ~10% of time; GPU-bound), `_lchg.cjs` (material version churn: ~300 transparent materials get needsUpdate every few s).

### Owner's performance budgets + rules (from Grok; memory `feedback_perf_budgets`) — apply ALL
60 fps desktop / 30-60 mobile; draw calls < 80 desktop (< 50 mobile, panic > 150) — we are at ~2,100; 200k-800k tris — we are at ~4.5M; pixelRatio = min(DPR, 1.5) (1.25 mobile); shadows = sun + few heroes only; 0-1 post passes on Low. Quality ladder lives in ONE object (low/med/high) read by every system (`_Q.tiers`). Instance/merge/BatchedMesh repeated props (never clone meshes as a "fix"). Water = second camera (reflection 256-512, skip offscreen/far; lava = cheap shader, no reflection). Stream realms: BOOT / REALM / HOT 40 m bubble / COLD markers / UI only when open / BRAIN on request. Tick budgets: skate+camera 60 Hz, far agents 4-10 Hz, crops/shop 1 Hz, MCP/ZEROX event-only. Navi DOM `display:none` when closed, no backdrop-blur on Low. `compileAsync` before first frame (done, capped). Dispose targets on realm exit. `matrixAutoUpdate=false` on statics (NOT done - likely big CPU/GPU-prep win for ~9k meshes). Decided NOT to migrate to WebGPU/TSL (custom ShaderMaterials: lava, water, floors, sky). Owner laptop = Intel HD 620 / 8 GB: one heavy job at a time; never permanently cap art detail — optimize instead.

### The 4 reference repos the owner gave (use them)
1. `https://github.com/IzzoSol/shaddai-gamedev-tools` (MIT): `FLAT-LIBRARY/three-core` (instancing, LOD, culling), `FLAT-LIBRARY/shaders-advanced` (KTX2), `FLAT-LIBRARY/game-qa-audit` (perf/mobile audit), `FLAT-LIBRARY/ecs-architecture`, `SKILLS-HUB/SKILL-REGISTRY.md`, `GENRE-TEMPLATES/`.
2. `https://github.com/majidmanzarpour/threejs-game-skills`: `skills/threejs-debug-profiler` (measure draw calls/tris/texture memory), `threejs-aaa-graphics-builder` (technical art budgets, KTX2, LOD, shadow res), `threejs-qa-release` (render-budget rows), `threejs-gameplay-systems` (batching, culling).
3. `https://github.com/heygen-com/hyperframes` (video/HTML-to-video; for trailers/intro, not runtime perf).
4. `https://github.com/Friedrich-M/UniMate` (MIT code): text-to-motion for arbitrary skeletons -> use later to author mount/bot animations offline; not a perf tool.

### Best next steps for GLM-5 (in order, measure each with the probes; profile the REAL laptop with DevTools Performance)
1. `matrixAutoUpdate=false` + `updateMatrixWorld` once for all static meshes (city fabric, canon, props). 2. Merge/instance `world-realm-props`, `world-fal-props`, unnamed `Mesh`/`Group` (~1,400 meshes) per district; target < 800 calls first. 3. Impostor/billboard skyline + fog-hidden LOD for far city (already: fog cutoff `?nofogcut=1`). 4. Decimate remaining heavy assets (techlab, ACADEMY_HALL_1, realm/fal props) with `simplify-heavy.mjs`; KTX2/WebP textures; cut 1,564 unique materials by atlasing. 5. Stop the ~300 transparent-material `needsUpdate` churn (find who toggles `transparent`/`needsUpdate` every few seconds). 6. Water: skip transmit pass on Low. 7. Then restore visual polish per tier (owner: buildings look basic - fix with Blender: bevels, normal maps, emissive window atlas; keep tris low).

## Addendum 3 (final): budgets from majidmanzarpour/threejs-game-skills (`skills/threejs-aaa-graphics-builder/references/technical-art.md`) vs OUR numbers
| Metric | Their desktop budget | Ours now (street level) |
|---|---|---|
| draw calls | <= 300 | ~2,085 |
| triangles | <= 750k | ~3.48M |
| geometries | <= 300 | ~1,511 |
| textures | <= 60 | ~267 |
| unique materials | share roles aggressively | ~1,564 |
| shadow-casting lights | <= 2 | 0 (shadows off) |
| DPR cap | 2 | 0.55-1.5 by tier |
Rules from that repo: instance/material-merge repeats; triangles only for near silhouettes, LOD/impostors behind (with hysteresis); shared material kit (bodyPrimary/trim/glass/emissiveSignal...) instead of one-off materials; trim sheets + decal meshes for detail instead of unique textures; fixed pools for VFX; report calls/tris/geoms/textures after each pass. Profiler skill: `skills/threejs-debug-profiler`.
- A/B knobs added to the city fabric (`world-clusters-v4.js`): `?cell=500`, `?hide=1400`, `?near=`, `?far=` (metres). Headless test showed no clear win (0.47 default vs 0.40 cell=500 vs 0.33 hide=1400&far=600; noisy, software renderer) - re-test on the real laptop.
- `tools/simplify-heavy.mjs`: `ALLOW_SKIN=1` (skinned ok), `ERR=0.15 NOLOCK=1` (aggressive). Voxel ship meshes do not simplify - reduce instance counts instead (done: 40 -> 20).

## Addendum 4: OWNER-REPORTED BLOCKERS (playtest 2026-09-30) - fix these FIRST (gameplay > perf)
1. **No entry into the Colosseum / stadium and no train (maglev) entry.** Check interior portals + `E` prompts: `world-interiors*.js`, `world-colosseum.js` (`inLobby`, outer door), `world-colosseum-metro.js` (elevator + station), `window.__worldTransitApi`, city-v3 markers/E-prompts (`world-city-v3.js`). Player can't reach other realms (they are far) -> maglev ring + hover/mounts are the only travel.
2. **B key (bike) teleports the player to a castle.** B handlers: host `SHADDAI-WORLD-3D.html` (~L3987-3991 bikeMode toggle), `world-actions.js:512` (garage/arena panels when near garage or inside COLOSSEUM/GARAGE), `veh.bike` (Grid Bike V2 in `world-actions.js` ~L540+), hoverboard B, and my mount-ride key handler (`world-mount-ride.js`, only stops B while mounted). Find what moves `playerPos` (suspect the bike spawn/pad position or `__worldLandmarks`).
3. **No shop for hoverboards or vehicles.** Data exists: `world-mounts.js` CATALOG (boards `board-street`, `board-foil`, Aero Skiff `skiff`), Mount Store panel (key **M**, `world-mount-ride.js`) now also sells helper bots. Needs in-world shop buildings/kiosks + Navi entry, gated to realm stores via `WorldMounts.storesAt(station)`. Garage shop exists as v2 room `GARAGE` (`openGarage` in `world-actions.js`).
4. **Park/bridge pillars must sit under the bridge more** (owner: fix later).
5. Done just now: bots no longer giants (re-measure + rescale), fog halved (`scene.fog.density` 0.000026 + sky clamp 1.5), bot shop (wheeled 150 / humanoid 600 Sparks) in the M panel, starter Sparks (+500 welcome, +100 daily). Owner wants WHEELED bots as the base/cheap ones and HUMANOIDS premium (done for prices; starters are still SCRAP + UNI-9 free pick). Bot art refs: `C:\Users\Brittany\OneDrive\Pictures\LF2\MODELS FOR FAL\29f7a77a2a3f758289c82ed20c2c04c6.jpg`, `44238f643ed288c022caa7cf735e7589.jpg`, `c15ee38b9c34da66b40cd161b57a9f74.jpg` (not yet used).

## Addendum 5 (owner playtest): Colosseum + park + race gaps
- **Colosseum**: entering gives only the LOBBY and the METRO hall. There is NO way from the lobby into the actual arena/bowl (no concourse doors, no stairs to the seats/pit) and the terrain/floor modes (`world-colosseum-floors.js`: water/lava/void/grass/ice) are visual only, not reachable or playable. TODO: open the lobby's inner doors to the promenade ring + tunnels to the pit (`hLocal`, `inTunnel`, `inStairGap`, `KIOSKS` in `world-colosseum.js`), add a floor-mode switcher + spawn players on the floor.
- **Hoverskate park / race**: the park exists (`window.__hoverPark`, `world-hoverpark.js`, NW race quarter at the PLAZA_SKATE marker) but has NO door or signage and no beacon; reach it with **I** > Travel > Hoverskate park. Races start from Navi (**Y**) > Sparks > race board (`NaviHooks.onRaceEnter`), which teleports to the start and mounts a board. Needs: a visible gate/beacon at the park, a "Race" E-prompt at the start line, and a clear path in from the city.
- Panel key is now **I** (M is the map key); B/V castle teleport glitch still unresolved (see Addendum 4).
