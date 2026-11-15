# MOBILE PASS 2 — PLAN (READ-ONLY diagnosis, nothing applied)

- **Date:** 2026-11-15 · **Status:** PROPOSAL — no code changed, no branch touched, no deploy.
- **Source read:** `realm-fix-for-main-2026-11-15` checkout of `public/world-main.js` (6,688 lines), `public/SHADDAI-WORLD-3D.html`, `public/world-terrain-v4.js`, `public/world-water.js`, `public/world-townsfolk.js`, `public/world-realmprops.js`, `public/world-editor.js`, `public/world-city-v3.js`, `public/world-canon-v4.js`, `public/world-clusters-v4.js` + on-disk asset sizes under `public/assets/`.
- **Trigger:** Israel re-tested LIVE on iPhone 2026-11-15 after mobile-lite pass 1 (FIX-A/B/C/D) — still fails. Failure mode (Jetsam crash page vs loader stall) still pending from him. This plan ranks everything left so the next cut is ready either way.
- **Labels:** LIVE = read directly from code/disk in this pass. ESTIMATE = computed from file sizes / geometry parameters, not measured on a device.

## What pass 1 already removed (do not re-litigate)

- Council agent GLBs (25.2 MB on disk) deferred behind `body.in-world` (FIX-B, `world-main.js` L2359+ `_nextAgentBody`).
- Mobile starts at POTATO, governor clamped ≤ LOW (FIX-A, `_applyQualityTier`).
- Renderer pixel ratio set to `min(dpr, 0.55)` at creation on mobile (FIX-C, L112–114) — so composer/bloom targets are now small (~215×464 px on a 390×844 CSS phone).
- `webglcontextlost` → paused screen on mobile (FIX-D).

## Load order (LIVE, condensed)

HTML parses ~118 classic `<script src>` tags + `public/dist/boot-1/2/3.*.js` (588K + 448K + 430K minified, disk) → `world-main.js` module eval: renderer (L112) → PMREM RoomEnvironment (L130) → synchronous decor IIFEs ~L1290–2876 (Oracle zone, Quill nook, interiors shell, spawn, HUD, minimap, audio shell, chat; 11 `CanvasTexture`s in this region) → hidden ground mesh + 3 ground textures (L2143) → EffectComposer + UnrealBloomPass (L2294) → `placeAgents()` sprite placement (L2712) → sky load starts (L2273). Then the `__LD` critical chain (L846–902): **terrain** → water built inside terrain's `.then` (`_buildV4Water`, L1143) → **`__buildRealmModules()` (L801–828) — called synchronously, step marked done immediately while its async GLB builds keep running** → buildings (`__kickBuildings` L1262, chunked) → canon (GLB, DRACO+meshopt) → grid-fabric (clusters, streams concurrently) → city-v3 (**awaited**; `art-slots-v4.json` = 1.8 MB) → `_ldDeferGate` → warm-up (`_liteLoader`, ~L4888–4914): `compileAsync` over the whole scene (30 s cap) + two quiet `composer.render()` frames behind the loader → `__loadPlayable` → auto-enter → sky-dive (`_spawnBusy`, pixelRatio 0.7 L6330).

## Ranked remaining pre-entry costs on mobile

| # | Cost (line refs) | Size — LIVE facts / ESTIMATE | Critical for spawn view? | Existing defer hook |
|---|---|---|---|---|
| 1 | **Realm-dressing GLB wave** — `__buildRealmModules` L805–815 starts ALL of these pre-entry: RealmProps (direct `loader.load` per model, ~14 models from `assets/models/` 36 MB tree), Colosseum exterior, FalProps + Nature (via `__queueLoad`, max 4 in flight, `world-editor.js` L36–48), TransitKit.dress, RealmKits.build, **Townsfolk** (rigged NPCs; `assets/npcs/` = 31 MB tree, files 2.0–2.6 MB each; proximity-gated at 420 m from `playerPos`, which is already at spawn pre-entry), **RealmDress.build** (`assets/kits/` = 45 MB tree) | LIVE: tree sizes above; step "ends" instantly (L846–902) so the wave is still parsing when warm-up fires. ESTIMATE: decoded VRAM+RAM 60–120 MB across the wave — GLB-embedded textures bypass the 1024 texture diet (diet's ImageBitmap half is opt-in `?bmdiet=1`, L45–71) and iOS decodes everything to uncompressed RGBA | **No** — spawn view is terrain + towers + sky; dressing is realm landmarks/NPCs, mostly far from spawn | `_afterSpawn` IIFE **already inside the same function** (L818) already defers edge-realms / bazaar / biome-scatter / roads / city-screens on exactly this pattern (`body.in-world && __spawnBusy===false`, 30 s fallback) |
| 2 | **Terrain texture set** — `world-terrain-v4.js` L264–281: `color.jpg` 2048×2048 (437 KB file) + 8 layer textures + 2 ripple, all measured 1024×1024, anisotropy 8 | LIVE: dimensions via file headers. ESTIMATE: color ≈ 16.8 MB RGBA + mips ≈ 22 MB VRAM; 10 × 1024² layers ≈ 5.3 MB each ≈ 53 MB VRAM; **total ≈ 75 MB VRAM** that warm-up uploads in one spike | Ground itself yes; full-res layers no (spawn is one biome) | Texture diet cap (L58–71, `?tex=`) already rewrites TextureLoader images — a mobile-only 512 cap quarters this to ≈ 19 MB |
| 3 | **Warm-up spike** — `_liteLoader` ~L4900–4914: `renderer.compileAsync(scene, camera)` (30,000 ms cap; code comment LIVE: past the cap, remaining programs compile synchronously on the first in-world frame) + `_introWarming` two full `composer.render()` frames = **every texture built so far uploads at once**, while rank-1 GLBs are still parsing. `bgCompile` interval (L536–537) re-runs compileAsync every 2.5 s post-entry (×36) | LIVE: mechanism + caps. ESTIMATE: transient peak = sum of ranks 1+2+5 VRAM arriving simultaneously + program-compile CPU — this is the moment the tab dies if it dies during load | No — it is a smoothness optimisation, not content | `?warmcap=` / `?precompile=0` (6 s) already exist as URL overrides; `_MOBILE_LITE` (L109) can change the defaults |
| 4 | **Water depth bakes** — `world-water.js` `bakeDepth` L375, called per polygon body from `_buildV4Water` (world-main.js L1143): 1 ocean (res up to **1024**) + 5 lakes (≤256); rivers use section geometry, no bake | LIVE: res caps, 10 bodies (1 ocean / 4 rivers / 5 lakes from terrain.json). ESTIMATE per ocean bake: `dep`+`msk` Float32Arrays 8 MB **retained** (CPU mirror for `waterHeightAt`) + half-float texture 4 MB VRAM + ~1M `heightAt` calls on the main thread (~0.2–0.8 s CPU); lakes ≈ 0.5 MB each | Ocean bake feeds shore/water height at spawn coast — partially; 1024 res is not needed for it | `opts.depthRes` already parameterised at the `_buildV4Water` call site (L1143–1162) |
| 5 | **City stack** — canon GLB 4.5 MB (`canon-v4.glb`, LIVE disk) + colliders JSON 715 KB; grid-fabric clusters: 4,183 instances (grid-fabric counts LIVE from JSON: 1833+1132+1218) + 1,863 commons + 179 realm-cluster instances, per-cell InstancedMesh (`world-clusters-v4.js` L215–227); buildings (`world-buildings.js`, chunked scheduler, instanced greebles; facade textures only at done-callback); city-v3 JSON: art-slots 1.8 MB + plots 323 KB + markers 52 KB → ~7,900 slot records, registry only, meshes lazy (LIVE, file header + L193) | ESTIMATE aggregate 20–40 MB RAM/VRAM | Towers + Grid yes (spawn is in the city); canon/cluster detail streams fine | Clusters already stream (not awaited); buildings already chunked; city-v3 `ready` is the only awaited one |
| 6 | **Terrain geometry + height data** — `world-terrain-v4.js`: `height16.bin` 8.0 MB retained as Uint16Array (no float copy — deliberate); **`carveRivers` L151–153 allocates `cut = new Float32Array(N*N)` = 2048² × 4 B = 16 MB transient** + touched list; patch geometry 1,221 verts/patch ≈ 48.8 KB, pool `CACHE_MAX = 320` | LIVE: N=2048 (terrain.json `size_px`), allocation line, pool cap. ESTIMATE: pool saturation ≈ 15.6 MB CPU + GPU copies; near-spawn patches only pre-entry, so real pre-entry figure is lower | Yes — the ground under spawn | Builds already capped per frame (`MAX_BUILDS`, `BUILD_MS` 2.5 ms) |
| 7 | **Boot JS parse/heap** — dist bundles 1.47 MB minified + world-main.js 598 KB + ~118 classic scripts + vendored three (3.4 MB tree) | ESTIMATE 30–60 MB JS heap on iOS; also pure CPU time before first frame | Yes (it IS the app) | None in-file; would need bundle splitting (out of scope for a cut) |
| 8 | **Canvas textures, eval region** — 11 `CanvasTexture`s L1304–1971 (signs, screens, glows) + agent portrait sprites (L2686) | ESTIMATE 10–20 MB VRAM worst case (≤1024² each) | Signs at spawn partially | None; small |
| 9 | **PMREM environment** — L130: `PMREMGenerator.fromScene(new RoomEnvironment(), 0.03)` before any content | ESTIMATE 2–5 MB VRAM (CubeUV chain) + one env render | No (lighting polish) | None; trivial to defer but tiny win |
| 10 | **Hidden-ground textures** — L2143–2147: 3 × `/api/forge/art/tex-*.png` loaded for a ground mesh that is `visible=false` | LIVE: loads fire at eval. Size UNMEASURED (server-generated; not on disk) — flag for one `curl -I` during implementation | No — the mesh is never shown in v4 mode | None; could skip on `MAP_V4` entirely |
| — | **Cleared — NOT pre-entry costs** (checked, do not chase): shadow maps (sky called with `shadows:` only when `?shadows` present, L2273–2276 — no shadow-map allocation by default); audio decode (lazy, gesture-gated, `world-audio.js` L50–54); reef GLBs (gated on `__loadPlayable`, L141+); interiors-v3 (in `_LD_LIGHT`, deferred); agent-clips GLB (only via `_agentAnimLib()` from body fill, post-body); player operative GLB (picker click, `_pcPreload` L2327); composer/bloom targets post-FIX-C (≈1–2 MB at pr 0.55) | | | |

## iOS-Safari-specific traps (LIVE unless noted)

1. **No compressed-texture path anywhere in this stack.** ASTC exists on Apple GPUs, but nothing here serves KTX2/ASTC — every PNG/JPG/WebP and every GLB-embedded image decodes to full RGBA32 in VRAM, +33% for mipmaps. This is the structural multiplier behind ranks 1, 2, 5.
2. **The failure signature matches Jetsam, not a JS error:** Safari's "A problem repeatedly occurred" page is the OS killing the tab; no JS handler can catch it (pass 1, FIX-D note). Peak — not steady-state — memory is what matters, which is why the warm-up coincidence (rank 3) is dangerous even though each individual system "fits".
3. **Texture diet gap:** the 1024 cap (L58–71) covers TextureLoader; GLB textures ride ImageBitmapLoader whose diet half is opt-in (`?bmdiet=1`). The header comment at L45 claims both are covered — implementation should re-verify this one line before relying on it.
4. **Canvas memory is shared:** the WebGL canvas + all 2D canvases (minimap, HUD, loading slides) draw from the same per-tab pool Safari budgets; at pr 0.55 the WebGL side is now small, so content (textures/geometry) is the remaining lever.
5. **Audio is NOT a trap here** — verified lazy/gesture-gated; do not spend a cut on it.

## Single most likely remaining Jetsam cause

**The superposition peak at warm-up (ESTIMATE, mechanism LIVE):** `__buildRealmModules` fires the entire realm-dressing GLB wave (rank 1) and its loader step reports done immediately, so when the critical chain finishes, `_liteLoader` runs `compileAsync` over the whole scene and does two full renders that force-upload every texture present (ranks 2 + 5 + whatever of rank 1 has landed) **while the rest of the dressing wave is still fetching/parsing/decoding**. Pass 1 removed the council bodies and capped resolution, but it did not touch this overlap — peak RAM/VRAM at the warm-up moment is essentially unchanged in kind, only smaller in degree. If Israel's pending evidence says "crash page", this is the cause to cut first; if it says "stalls at a %", the same cut still helps (less parse contention) and rank 3's 30 s cap becomes the prime suspect.

## CUT 1 (ready to implement — smallest, removes rank 1) — P-M2 completed

Defer the four promise-based dressing builders inside `__buildRealmModules` (world-main.js L812–815) into the `_afterSpawn` IIFE that already exists **in the same function** (L818), mobile only. Desktop path byte-identical; `?mobilelite=0` restores today's behaviour.

```diff
   function __buildRealmModules(){
       ...
-      if(window.__worldTransitApi && window.WorldTransitKit && !/[?&]transitkit=0/.test(location.search)) window.WorldTransitKit.dress({...}).catch(...);
-      if(window.__worldTransitApi && window.WorldRealmKits && !/[?&]realmkits=0/.test(location.search)) window.WorldRealmKits.build({...}).then(...).catch(...);
-      if(window.__worldTransitApi && window.buildWorldTownsfolk) try{ window.__townsfolk = window.buildWorldTownsfolk({...}); }catch(e){ ... }
-      if(window.__worldTransitApi && window.WorldRealmDress) window.WorldRealmDress.build({...}).then(...).catch(...);
+      var _dress = function(){
+        if(window.__worldTransitApi && window.WorldTransitKit && !/[?&]transitkit=0/.test(location.search)) window.WorldTransitKit.dress({...}).catch(...);
+        if(window.__worldTransitApi && window.WorldRealmKits && !/[?&]realmkits=0/.test(location.search)) window.WorldRealmKits.build({...}).then(...).catch(...);
+        if(window.__worldTransitApi && window.buildWorldTownsfolk) try{ window.__townsfolk = window.buildWorldTownsfolk({...}); }catch(e){ ... }
+        if(window.__worldTransitApi && window.WorldRealmDress) window.WorldRealmDress.build({...}).then(...).catch(...);
+      };
+      if(_MOBILE_LITE) window.__mobileDress = _dress; else _dress();
       (function _afterSpawn(){ ...
+        if(window.__mobileDress){ var d = window.__mobileDress; window.__mobileDress = null; try{ d(); }catch(e){ console.warn('[mobile-dress]', e && e.message); } }
         if(window.WorldBiomeScatter) ...
       })();
```

Notes for the implementer: Townsfolk spawn is proximity-gated from `playerPos`, so post-spawn start loses nothing visible; RealmDress/RealmKits/TransitKit are all far-field dressing. Follow-on if the peak persists: also move the RealmProps call (L805) behind the same gate — its models are biome landmarks, none at spawn — but that is a second step, not part of this cut. FalProps/Nature ride `__queueLoad` (max 4 in flight) and are left alone.

## CUT 2 (ready to implement — removes rank 3, the trigger) — P-M3 dieted

Mobile-only warm-up diet in `_liteLoader` (~L4900–4914): shorten the compile cap to the already-proven 6 s setting and skip the two all-texture-upload renders; textures then upload lazily during the sky-dive, which already runs in low-res spawn mode (`_spawnBusy`, bloom off, pr 0.7), and `bgCompile` (L536–537) keeps warming programs post-entry.

```diff
-      var _wc = /[?&]warmcap=(\d+)/.exec(location.search), _capMs = _wc ? +_wc[1] : (/[?&]precompile=0\b/.test(location.search) ? 6000 : 30000);
+      var _wc = /[?&]warmcap=(\d+)/.exec(location.search), _capMs = _wc ? +_wc[1] : ((/[?&]precompile=0\b/.test(location.search) || _MOBILE_LITE) ? 6000 : 30000);
       ...
       p.catch(function(e){ console.warn('warmup', e && e.message); }).then(function(){
+        if(_MOBILE_LITE){ _ldEnd('warm'); set(100); try{ if(window.__liteSlides) window.__liteSlides.stop(); }catch(_){ } setTimeout(function(){ window.__loadPlayable = true; document.getElementById('enterBtn').click(); }, 350); return; }
         _introWarming = true;
         requestAnimationFrame(function(){ requestAnimationFrame(function(){ _ldEnd('warm'); ...
```

**Rider (optional, same commit, one line):** cap the ocean depth bake on mobile at the `_buildV4Water` call site (L1143–1162): `depthRes: _MOBILE_LITE ? 512 : 1024` — quarters rank 4's bake CPU and its retained CPU mirror (8 MB → 2 MB) + texture (4 MB → 1 MB); shore shape at spawn is unchanged at 512 over the ocean bounds (ESTIMATE).

## Still proposals, not cuts

- **P-M1 terrain half-res** (from pass 1): halving `height16.bin`/`color.jpg` changes `heightAt` sampling world-wide — needs asset regeneration + a height-equivalence check; do NOT fold into pass 2.
- **Mobile texture-diet 512** for terrain layers (rank 2, via the L58–71 cap): promising and small, but verify the terrain loader actually routes through the patched `TextureLoader.prototype.load` first, and A/B the visual hit on desktop-class phones before defaulting it.
- **`?bmdiet=1` by default on mobile** (rank 1/5 texture halves): same verification caveat as trap #3.

## Evidence that would confirm the diagnosis (from Israel's pending video/detail)

- Crash page again → Jetsam peak → Cut 1 + Cut 2 as above.
- Loader stalls at a step label → read the label against the `_liteLoader` LABEL map (~L4892): `warm` stall = rank 3 cap behaviour; `realm-modules`/`buildings` stall = parse contention from rank 1.
- Gets in but dies during the sky-dive → spawn-mode realloc + first in-world compile of the remainder (code comment at warm-up, LIVE) → Cut 2 becomes the primary fix.
