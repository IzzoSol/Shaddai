# SHADDAI World — Speed / FPS brief (2026-10-24, for Copilot or the next session)

Goal: faster load + steady FPS without lowering visual quality. Branch `agents/1`. Entry page: `public/SHADDAI-WORLD-3D.html`.
Stack: vanilla JS + three@0.180 ES modules, no bundler. Local server: `node tools/serve.cjs` (port 3013). Probe: `node tools/_agents-probe.cjs`.

## Measured (headless SwiftShader, 8 GB laptop - a real GPU is faster, but relative numbers still matter)
- Time to playable: 112 s (probe, 2026-10-24).
- Static `<script src>` tags in the HTML: 149 files, 2.85 MB of JS, loaded before the world starts. Plus 29 dynamic `_loadScript` calls.
- Largest startup scripts: `world-buildings.js` 283 KB, `world-interiors.js` 188 KB, `world-elevators.js` 105 KB, `world-colosseum.js` 82 KB, `world-navi.js` 79 KB, `world-athenaeum.js` 66 KB, `world-biomes.js` 58 KB, `world-spawn.js` 57 KB.
- HTML itself: 655 KB (one huge inline module).
- GLBs referenced directly in the HTML: 28 files / 9 MB; asset folders: kits 41 MB, agents 49 MB, models 106 MB (most are lazy).
- Draw calls: ~1,600 in the city (budget the owner set: 80; realistic target 300-500). Probe line `perf` reports the current number.

## Where the time goes (known)
1. 149 blocking script tags — each is a separate request and parse before boot. Biggest single win.
2. Inline 655 KB HTML module parsed on every load.
3. Many per-model InstancedMeshes: city clusters, realm dress, biome scatter, city crowns, roads, rivers, rails.
4. Shadows: most new meshes set `castShadow = true`.
5. Edge realms / citadel / park / arena GLBs load after spawn but all at once.
6. Scene traversals are broad and repeated, especially for far objects and static props.
7. Some model and texture assets are likely being reloaded or reused inefficiently because cache/version behavior is not fully verified.

## Deeper root-cause analysis
This is not primarily a “GPU cannot handle it” situation. The actual slowdown is a chain of startup and render bottlenecks:
- page boot is blocked by a script waterfall before the world is allowed to start
- the browser parses a giant inline module on every load instead of reusing a cached file
- the world then pays CPU cost to build, traverse, and shadow far objects even though the player does not need them at that moment
- city draw calls are so high because static objects are not being grouped by material well enough
- textures and GLBs are likely being loaded in a way that increases memory churn and startup lag

This is exactly the pattern seen in modern Three.js performance work: optimize the startup path, then optimize scene submission, then optimize shadow and asset cost, and only after that do deep texture or asset compression passes.

## Safe wins, ordered (no quality loss)
1. Bundle the boot scripts: concatenate the 149 `<script src>` files (in HTML order) into 2–4 bundles with esbuild, using concat + minify, not a full app rewrite. Generate `public/dist/` and replace the initial blocking tags. Keep originals intact.
2. Defer non-boot modules: anything not required before the first frame — navi, colosseum, elevators, interiors, arcade, casino, race, skatejam, hoverleague, athenaeum, academy — should load on demand or after spawn using the existing lazy-load pattern.
3. Move the inline module out to `public/world-main.js` so the browser can cache it.
4. Draw calls: merge static meshes per material using the existing `world-static-batch.js` and `world-merge.js` utilities; extend them to roads, river banks, crowns, landmark kits, repeated props, chunk scatter, and any other static buckets with a shared material signature.
5. Shadows: cast shadows only within ~150 m of the player; keep the shadow camera tight; only hero meshes should cast; scatter and crowns should receive shadows, not necessarily cast them.
6. LOD for realm towns + titans: hide beyond 1.2 km for towns and 2.5 km for titans unless near the active path; keep the far objects out of the draw submission path.
7. Compress textures to KTX2 and optimize remaining GLBs with `tools/glb-pack.mjs` or a GLTF-transform pipeline; preserve visual quality while reducing memory churn.
8. Service worker cache for assets: verify that large GLBs and model files are cached and versioned; stale cache behavior has bitten the project before.

## Rules
- No paid services; dev tools such as esbuild, gltf-transform, and Playwright are pre-approved.
- Measure before and after every change with the probe.
- Never push main without the owner.
- Keep `?param=0` escape hatches for every optimization.
- Keep change size minimal and reversible.

## Stop condition / accidental typing note (2026-10-24)
A stray trailing `//` was typed during a previous handoff attempt and the work was stopped immediately to avoid corrupting a repo file or generated patch.
This is now a hard stop condition for this task: if any generated patch, repo note, prompt, or code block contains an accidental trailing `//` marker, stop, revert to the last clean checkpoint, and continue from there.
Do not keep writing after a stray `//` appears in a generated file or prompt. The repo should never contain accidental trailing `//` syntax markers in docs or code.

## Session handoff / what we confirmed (2026-10-24)
- The root bottleneck is startup serialization, not just GPU power. The page blocks on 149 script requests before playable.
- The inline 655 KB module in `public/SHADDAI-WORLD-3D.html` is parsed on every load and is a strong cache miss.
- The repo already contains the correct optimization primitives: lazy-load hooks (`_loadScript`, `__LD`), batching helpers (`world-static-batch.js`, `world-merge.js`), and runtime toggles (`?batch=0`, `?texdiet=0`, etc.).
- The measured startup and draw-call problems are consistent with the codebase: huge script waterfall, giant inline module, broad scene traversal, too many shadow casters, and excessive draw calls from static meshes.
- Correct order: bundle boot scripts -> lazy-load non-boot modules -> extract inline module -> merge static meshes -> shadow cull -> hide distant towns/titans -> compress textures -> verify model cache.
- Use a fresh terminal session for each measurement pass so the agent does not burn context re-explaining the repo.

## Exact repo command sequence for the next agent
1. `git checkout agents/1`
2. `node tools/serve.cjs`
3. `node tools/_agents-probe.cjs`
4. Change one item only, then re-run the probe.
5. Keep changes small and reversible; do not push to `main` without owner approval.

## Files most likely to change
- `public/SHADDAI-WORLD-3D.html`
- `public/world-static-batch.js`
- `public/world-merge.js`
- `sw.js`
- any lazy-load or `_afterSpawn` helpers that gate non-critical modules
- `tools/glb-pack.mjs` if that path is used for model compression
- any world spawn or LOD logic for towns, titans, or far props

## Safe implementation policy
- No bundler rewrite: keep it vanilla JS + concat/minify, not Vite/React/Webpack.
- Keep `?param=0` escape hatches for each optimization.
- Prefer measured, reversible edits over broad refactors.
- Do not push to `main` without explicit owner approval.

## Very detailed operational guide for the next agent

### Phase 1: Startup script bundling
Goal: remove the 149-request startup tax.
- Inspect `public/SHADDAI-WORLD-3D.html` around the script list at lines roughly 317–429.
- Group scripts into 2–4 bundle files in the same sequence they currently appear.
- Keep the files under `public/dist/` and preserve the original script order in the bundle.
- Replace the first 149 blocking tags with 2–4 bundle tags instead of a huge serial chain.
- Keep the old code untouched for rollback.
- Measure after every bundle split, not only once at the end.

Safe implementation pattern:
- copy the list into a local bundle file in order
- concatenate the files into a single asset in the same order
- minify without changing the code structure
- avoid a full app bundler; this is not a framework conversion

### Phase 2: Defer non-critical modules
Goal: keep only the first-frame-critical code in the boot path.
- Focus on modules known not to be required before the first frame: navi, colosseum, elevators, interiors, arcade, casino, race, skatejam, hoverleague, athenaeum, academy.
- Use the existing lazy-load mechanism and `_loadScript` helper rather than starting a new loader system.
- Keep the initial path minimal and deterministic.

Relevant code to inspect:
- `_loadScript(src)` in the inline module
- `_ldBegin(name)`, `_ldEnd(name)`, `__LD`, and `_ldIdle()` in the startup chain
- any `_afterSpawn` or post-entry gating that already exists

### Phase 3: Extract the large inline module
Goal: let the browser cache the big runtime file.
- Move the giant inline module out of `public/SHADDAI-WORLD-3D.html` into a file like `public/world-main.js`.
- Replace the inline script block with a single external module or script load.
- Keep behavior the same.
- Make sure anything imported by the module remains resolvable.

Why this matters:
- large inline JS is reparsed every load
- external JS files benefit from browser caching and reduced HTML size
- this is a direct fix for the 655 KB inline parse cost

### Phase 4: Batch static draw calls
Goal: reduce draw submissions without changing visual quality.
- Inspect `public/world-static-batch.js` and `public/world-merge.js`.
- Extend the static batching pass to include:
  - roads
  - river banks
  - crowns
  - landmark kits
  - repeated props with the same material
  - chunk scatter pieces
- Merge only objects that are static after build and share a material signature.
- Skip anything that is animated, interactive, transparent, or custom per-frame.
- Keep a `?batch=0` escape hatch.

Key code patterns to keep:
- `WorldStaticBatch.run({ THREE, scene, mergeGeometries, minGroup, log })`
- `WorldMerge.bake(root, THREE, { skip, name })`
- Keep `eligible()` and `sig()` logic strict so only safe objects are merged

### Phase 5: Shadow culling
Goal: render far-away objects without shadow cost.
- Search for `castShadow = true` assignments.
- Limit shadow casting to objects within roughly 150 m of the player.
- Keep `receiveShadow` enabled only where it matters visually.
- Hero meshes can still cast near the player; distant scatter and crowns should mostly receive only.
- Tighten the shadow camera / shadow map fit so it mirrors the player influence radius.

### Phase 6: Distance culling and LOD
Goal: stop drawing distant content entirely.
- Hide towns farther than ~1.2 km.
- Hide titans farther than ~2.5 km or whichever current world logic already uses.
- Add a simple distance check and `visible = false` when the player is beyond the threshold.
- Use the existing world dress and titan logic as the starting point instead of creating a brand-new culling system.

### Phase 7: Asset optimization
Goal: lower memory churn and reduce first-load pain.
- Check texture loading code already present in the inline module: there are texture-diet patches and `?tex` options.
- Convert larger textures to KTX2 if feasible.
- Optimize repeated GLBs by pruning attributes and reducing duplicate data.
- Run `tools/glb-pack.mjs` or a GLTF-Transform pipeline on the world assets that are still heavy.
- Keep visual fidelity stable; do not “optimize” by removing recognizable materials or features.

### Phase 8: Service worker and cache validation
Goal: stop repeated asset churn and stale assets.
- Inspect `sw.js`.
- Ensure it caches GLBs and large world assets.
- Add or verify versioned cache keys for any asset that is likely to change across builds.
- Fix stale or wrong-model cache behavior that caused repeated page issues before.

## Extra repo-side reference stack (for fresh sessions)
- `mrdoob/three.js` — official renderer + API behavior for instancing, shadows, culling.
- `gkjohnson/three-mesh-bvh` — large-scene culling and expensive traversal reduction.
- `KhronosGroup/glTF-Transform` — GLTF optimization / mesh cleanup / asset pipeline.
- `KhronosGroup/KTX-Software` — KTX2 texture compression.
- `zakky8/web-optimization` — browser startup + performance checklist.
- `iniGlowee/threejs-game-optimization` — measured game-world performance tuning.
- `ovachiever/threejs-graphics-optimizer` — draw-call reduction + instancing strategy.
- `cloudai-x/threejs-skills` — practical performance snippets.
- `GoogleChrome/lighthouse` — startup and blocking-resource diagnostics.
- `GoogleChrome/workbox` — service worker + cache strategy.
- `GoogleChrome/web-vitals` — browser-side timing and runtime diagnostics.

## What to borrow from those repo patterns

### From Three.js official repo
- The correct semantics of `InstancedMesh`, `castShadow`, `receiveShadow`, frustum culling, and static scene batching.
- The idea that if it is static and material-shared, it can become a merged draw call.

### From three-mesh-bvh
- Use acceleration and culling logic when scene traversal is expensive.
- Do not do expensive per-frame whole-scene scans if the world can be grouped or bounded.

### From glTF-Transform and KTX
- Optimize assets before runtime, not after the fact.
- Compression is not a magic button, but it can materially reduce memory and startup churn.

### From Lighthouse and Web Vitals
- Use browser tooling to find render-blocking scripts and startup issues outside the in-repo tooling.

### From ovachiever and iniGlowee
- The process is benchmark → one fix → benchmark again.
- This repo already has measurement hooks; use them.

## Exact prompt for a fresh agent
Read `docs/SPEED-BRIEF-20261024.md` and `docs/PERF-REPO-STACK-20261024.md` first, then make the smallest safe next optimization in the correct order. Do only one change at a time. Measure before and after with `node tools/serve.cjs` and `node tools/_agents-probe.cjs`.

Do this in order:
1. Bundle the startup-critical scripts into 2–4 files under `public/dist/` while keeping the originals.
2. Defer non-critical modules from the startup chain using the existing lazy-load pattern.
3. Extract the giant inline module in `public/SHADDAI-WORLD-3D.html` into a cached file.
4. Extend `public/world-static-batch.js` and `public/world-merge.js` to merge repeated static meshes by material.
5. Reduce `castShadow` to near-player radius and keep only hero meshes as shadow casters.
6. Hide distant towns and titans beyond the configured LOD thresholds.
7. Compress textures and optimize GLBs.
8. Verify the service worker cache and versioning in `sw.js`.
9. Do not push to `main`.
10. Keep changes reversible; keep `?batch=0`, `?texdiet=0`, `?shadow=0`, or equivalent fallback flags.

## Hard stop rule for the next agent
If any generated patch, file edit, or prompt contains an accidental trailing `//` marker, stop immediately, revert to the last clean checkpoint, and continue only after the file is clean. Do not continue writing after a stray `//` appears. The repo should never contain accidental trailing `//` syntax markers in docs or code.

## Very low-context / high-signal agent flow
- Read only:
  - `docs/SPEED-BRIEF-20261024.md`
  - `docs/PERF-REPO-STACK-20261024.md`
  - the exact file implicated by the current optimization
  - `tools/_agents-probe.cjs`
- Do not read the whole repo.
- Do not re-explain the architecture unless a file is directly causing the current issue.
- One optimization pass at a time.
- One measurement pass at a time.
- No broad exploratory coding.

## Minimal operational loop
1. Read the brief.
2. Read the specific file implicated by the next optimization.
3. Run:
   - `node tools/serve.cjs`
   - `node tools/_agents-probe.cjs`
4. Make one small, reversible change.
5. Run the probe again.
6. Stop and summarize.
7. Move to the next item only if the previous one is clearly stable.

## Performance rule for this project
We are not removing visual quality. We are removing unnecessary work.
- fewer blocking script requests
- less startup parsing
- fewer draw submissions
- less shadow cost
- less distant-object render cost
- fewer redundant asset fetches
- same gameplay, same quality, faster world

This is the central rule for every optimization pass. The project must preserve the same gameplay feel and visual fidelity while reducing wasted work. No broad refactor, no feature stripping, and no “performance at any cost” changes. Every optimization must be measured, reversible, and quality-neutral.

## Quality-first optimization law
- Do not reduce visual fidelity.
- Do not degrade gameplay feel.
- Measure before and after.
- Keep `?param=0` escape hatches.
- Keep changes small and reversible.
- If the visual result is worse, revert and fix the optimization in a more targeted way.

## Final summary
The winning strategy is:
- fix startup serialization first
- then reduce draw calls across static world content
- then reduce shadow cost and cull distant world objects
- then compress assets and verify caches
- and only then continue to reduce incremental cost

This matches the real bottleneck in SHADDAI and matches the strongest external repo guidance for large 3D worlds.

## Results 2026-10-24 (Claude, branch agents/1)
Probe baseline (`node tools/_agents-probe.cjs`): playable 96.8 s, draw calls 1527, tris 5.03 M, 0 page errors, 7/7 agents OK.
After phases 1+3 + titan culling: playable 109.2 s (noise, see A/B), draw calls **1422**, tris 4.96 M, 0 page errors, 7/7 agents OK.
Boot A/B (`node tools/_boot-ab.cjs "?bundle=0" "?bundle=1"`, headless): unbundled 105.6 s / 118.2 s (176-180 JS requests), bundled 101.6 s (39 JS requests).
Headless boot is dominated by world build in software GL and varies by about 13 s run to run, so the bundle win shows up mainly on the real network (144 requests -> 3, 2.7 MB -> 1.4 MB before gzip).
- Phase 1 DONE: `node tools/build-dist.cjs` -> public/dist/boot-1..3.<hash>.js (rerun after editing any boot script; `--check` exits 1 if stale). `?bundle=0` = original files.
  Production serves dist/boot-* as immutable (content-hashed names).
- Phase 3 DONE: inline module -> public/world-main.js (HTML 655 KB -> 78 KB), cache-busted by hash via build-dist.
- Phase 4 BUILT, OPT-IN: `WorldStaticBatch.runSafe` (siblings only, stable materials, sliced, self-reverting watchdog) via `?batch=safe`.
  Verify with `node tools/_batch-ab.cjs` (draw calls + pixel diff, shots in tools/_out/), then make it default in world-main.js bootStaticBatch.
- Phase 5: shadows were already near-player (60 m box following the player). Titans no longer cast unless within 200 m.
- Phase 6: titans are view-culled (`?titancull=0` = old). NOT hidden by distance: fog is off by owner choice, so distant titans are visible on the horizon.
- Phase 2 (deferring modules) NOT done: script load is not the measured bottleneck; deferring risks breaking boot coupling.
- Phase 7 TODO: `node tools/glb-pack.mjs` on unquantized kits (naval 1.09 MB, hover_league, race_hq, forest_homes, colosseum_lobby, transit, desert_homes, station_ocean, water_link).
- Phase 8: sw.js is a deliberate passthrough (old cache-first SW caused stale builds); caching is HTTP-header based. Left as is.
