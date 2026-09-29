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
