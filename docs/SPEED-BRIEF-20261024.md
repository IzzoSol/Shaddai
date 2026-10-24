# SHADDAI World — Speed / FPS brief (2026-10-24, for Copilot or the next session)

Goal: faster load + steady FPS **without lowering visual quality**. Branch `agents/1`. Entry page: `public/SHADDAI-WORLD-3D.html`.
Stack: vanilla JS + three@0.180 ES modules, **no bundler**. Local server: `node tools/serve.cjs` (port 3013). Probe: `node tools/_agents-probe.cjs`
(headless; prints time-to-playable, draw calls, triangles, geometries, textures, plus agent/world checks).

## Measured (headless SwiftShader, 8 GB laptop - a real GPU is faster, relative numbers still matter)
- Time to playable: **112 s** (probe, 2026-10-24).
- Static `<script src>` tags in the HTML: **149** files, **2.85 MB** of JS, loaded before the world starts. Plus **29** dynamic `_loadScript` calls.
  Largest: world-buildings.js 283 KB, world-interiors.js 188 KB, world-elevators.js 105 KB, world-colosseum.js 82 KB, world-navi.js 79 KB,
  world-athenaeum.js 66 KB, world-biomes.js 58 KB, world-spawn.js 57 KB.
- HTML itself: 655 KB (one huge inline module).
- GLBs referenced directly in the HTML: 28 files / 9 MB; asset folders: kits 41 MB, agents 49 MB, models 106 MB (most are lazy).
- Draw calls: ~1,600 in the city (budget the owner set: 80; realistic target 300-500). Probe line `perf` reports the current number.

## Where the time goes (known)
1. **149 blocking script tags** - each is a separate request, parsed before boot. Biggest single win.
2. **Inline 655 KB HTML module** parsed on every load.
3. **Many per-model InstancedMeshes**: city clusters (one per model x LOD x part), realm dress (one per GLB primitive per town),
   biome scatter (per species per 1200 m chunk), city crowns (12), roads/rivers/rails (~10).
4. **Shadows**: most new meshes `castShadow = true` (titans, scatter except shrubs, crowns, landmarks).
5. **Edge realms / citadel / park / arena GLBs** load after spawn (good) but all at once.

## Safe wins, ordered (no quality loss)
1. **Bundle the boot scripts**: concatenate the 149 `<script src>` files (in HTML order) into 2-4 bundles with esbuild
   (`--bundle=false`, just concat + minify) -> one request each, ~40% smaller. Keep the originals; generate `public/dist/` and switch the tags.
2. **Defer non-boot modules**: anything not needed before the first frame (navi, colosseum, elevators, interiors, arcade, casino, race, skatejam,
   hoverleague, athenaeum, academy) -> load on demand or after spawn with the existing `_afterSpawn` hook.
3. **Move the inline module out** to `public/world-main.js` so the browser caches it.
4. **Draw calls**: merge static meshes per material (`world-static-batch.js` / `world-merge.js` already exist - extend them to roads, river banks,
   crowns, landmark kits); share one material across crown types; turn chunk-culled scatter into per-chunk merged meshes.
5. **Shadows**: cast shadows only within ~150 m of the player (shadow camera fit) and only on hero meshes; scatter/crowns receive only.
6. **LOD for realm towns + titans**: hide beyond 1.2 km (realm-dress does this; titans freeze beyond 2.5 km but still draw - hide them too).
7. **Compress textures** to KTX2 and pack remaining GLBs with `tools/glb-pack.mjs` (already cut new kits 7.0 -> 4.95 MB).
8. **Service worker cache** for assets (`sw.js` exists - verify it caches GLBs; stale caches have bitten before, version the cache).

## Rules
No paid services; dev tools (esbuild, gltf-transform, Playwright) are pre-approved. Measure before/after every change with the probe.
Never push main without the owner. Keep `?param=0` escape hatches for every optimisation.
