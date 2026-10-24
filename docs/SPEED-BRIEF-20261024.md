1| # SHADDAI World — Speed / FPS brief (2026-10-24, for Copilot or the next session)
2| 
3| Goal: faster load + steady FPS **without lowering visual quality**. Branch `agents/1`. Entry page: `public/SHADDAI-WORLD-3D.html`.
4| Stack: vanilla JS + three@0.180 ES modules, **no bundler**. Local server: `node tools/serve.cjs` (port 3013). Probe: `node tools/_agents-probe.cjs`
5| (headless; prints time-to-playable, draw calls, triangles, geometries, textures, plus agent/world checks).
6| 
7| ## Measured (headless SwiftShader, 8 GB laptop - a real GPU is faster, relative numbers still matter)
8| - Time to playable: **112 s** (probe, 2026-10-24).
9| - Static `<script src>` tags in the HTML: **149** files, **2.85 MB** of JS, loaded before the world starts. Plus **29** dynamic `_loadScript` calls.
10|   Largest: world-buildings.js 283 KB, world-interiors.js 188 KB, world-elevators.js 105 KB, world-colosseum.js 82 KB, world-navi.js 79 KB,
11|   world-athenaeum.js 66 KB, world-biomes.js 58 KB, world-spawn.js 57 KB.
12| - HTML itself: 655 KB (one huge inline module).
13| - GLBs referenced directly in the HTML: 28 files / 9 MB; asset folders: kits 41 MB, agents 49 MB, models 106 MB (most are lazy).
14| - Draw calls: ~1,600 in the city (budget the owner set: 80; realistic target 300-500). Probe line `perf` reports the current number.
15| 
16| ## Where the time goes (known)
17| 1. **149 blocking script tags** - each is a separate request, parsed before boot. Biggest single win.
18| 2. **Inline 655 KB HTML module** parsed on every load.
19| 3. **Many per-model InstancedMeshes**: city clusters (one per model x LOD x part), realm dress (one per GLB primitive per town),
20|    biome scatter (per species per 1200 m chunk), city crowns (12), roads/rivers/rails (~10).
21| 4. **Shadows**: most new meshes `castShadow = true` (titans, scatter except shrubs, crowns, landmarks).
22| 5. **Edge realms / citadel / park / arena GLBs** load after spawn (good) but all at once.
23| 
24| ## Safe wins, ordered (no quality loss)
25| 1. **Bundle the boot scripts**: concatenate the 149 `<script src>` files (in HTML order) into 2-4 bundles with esbuild
26|    (`--bundle=false`, just concat + minify) -> one request each, ~40% smaller. Keep the originals; generate `public/dist/` and switch the tags.
27| 2. **Defer non-boot modules**: anything not needed before the first frame (navi, colosseum, elevators, interiors, arcade, casino, race, skatejam,
28|    hoverleague, athenaeum, academy) -> load on demand or after spawn with the existing `_afterSpawn` hook.
29| 3. **Move the inline module out** to `public/world-main.js` so the browser caches it.
30| 4. **Draw calls**: merge static meshes per material (`world-static-batch.js` / `world-merge.js` already exist - extend them to roads, river banks,
31|    crowns, landmark kits); share one material across crown types; turn chunk-culled scatter into per-chunk merged meshes.
32| 5. **Shadows**: cast shadows only within ~150 m of the player (shadow camera fit) and only on hero meshes; scatter/crowns receive only.
33| 6. **LOD for realm towns + titans**: hide beyond 1.2 km (realm-dress does this; titans freeze beyond 2.5 km but still draw - hide them too).
34| 7. **Compress textures** to KTX2 and pack remaining GLBs with `tools/glb-pack.mjs` (already cut new kits 7.0 -> 4.95 MB).
35| 8. **Service worker cache** for assets (`sw.js` exists - verify it caches GLBs; stale caches have bitten before, version the cache).
36| 
37| ## Rules
38| No paid services; dev tools (esbuild, gltf-transform, Playwright) are pre-approved. Measure before/after every change with the probe.
39| Never push main without the owner. Keep `?param=0` escape hatches for every optimisation.
40| 
41| ## Stop condition / accidental typing note (2026-10-24)
42| A stray trailing `//` was typed during the last handoff attempt, and the work was stopped immediately to avoid corrupting a repo file or generated patch.
43| This is now a hard stop condition for this task: if any generated patch, repo note, prompt, or code block contains an accidental trailing `//` marker, stop, revert to the last clean checkpoint, and continue from there.
44| Do not keep writing after a stray `//` appears in a generated file or prompt. The repo should never contain accidental trailing `//` syntax markers in docs or code.
45| 
46| ## Session handoff / what we confirmed (2026-10-24)
47| - The root bottleneck is startup serialization, not just GPU power. The page blocks on 149 script requests before playable.
48| - The inline 655 KB module in `public/SHADDAI-WORLD-3D.html` is parsed on every load and is a strong cache miss.
49| - The repo already contains the correct optimization primitives: lazy-load hooks (`_loadScript`, `__LD`), batching helpers (`world-static-batch.js`, `world-merge.js`), and speed toggles (`?batch=0`, `?texdiet=0`, etc.).
50| - The measured startup and draw-call problems are consistent with the codebase: huge script waterfall, giant inline module, and excessive draw calls from static meshes and shadows.
51| - Correct order: bundle boot scripts -> lazy-load non-boot modules -> extract inline module -> merge static meshes -> shadow cull -> hide distant towns/titans -> compress textures -> verify model cache.
52| - Use a fresh terminal session for each measurement pass so the agent does not burn context re-explaining the repo.
53| 
54| ## Exact repo command sequence for the next agent
55| 1. `git checkout agents/1`
56| 2. `node tools/serve.cjs`
57| 3. `node tools/_agents-probe.cjs`
58| 4. Change one item only, then re-run the probe.
59| 5. Keep changes small and reversible; do not push to `main` without owner approval.
60| 
61| ## Files most likely to change
62| - `public/SHADDAI-WORLD-3D.html`
63| - `public/world-static-batch.js`
64| - `public/world-merge.js`
65| - `sw.js`
66| - any lazy-load or `_afterSpawn` helpers that gate non-critical modules
67| 
68| ## Safe implementation policy
69| - No bundler rewrite: keep it vanilla JS + concat/minify, not Vite/React/Webpack.
70| - Keep `?param=0` escape hatches for each optimization.
| - Prefer measured, reversible edits over broad refactors.
| - Do not push to `main` without explicit owner approval.
71| 
72| ## Extra repo-side reference stack (for fresh sessions)
73| - `mrdoob/three.js` — official renderer + API behavior for instancing, shadows, culling.
74| - `gkjohnson/three-mesh-bvh` — large-scene culling and expensive traversal reduction.
75| - `KhronosGroup/glTF-Transform` — GLTF optimization / mesh cleanup / asset pipeline.
76| - `KhronosGroup/KTX-Software` — KTX2 texture compression.
77| - `zakky8/web-optimization` — browser startup + performance checklist.
78| - `iniGlowee/threejs-game-optimization` — measured game-world performance tuning.
79| - `ovachiever/threejs-graphics-optimizer` — draw-call reduction + instancing strategy.
80| - `cloudai-x/threejs-skills` — practical performance snippets.
81| 
