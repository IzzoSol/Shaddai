# FIX GUIDE — DEEP RESEARCH COMPANION

**Companion to** [FIX_GUIDE_FOR_SMALL_MODELS.md](FIX_GUIDE_FOR_SMALL_MODELS.md) — the
step-by-step fix instructions live there. This file holds the research those steps rest on:
§3 asset inventory, §4 texture pipeline, §5 city-builder deep-dive, §6 performance budget,
plus the what's-missing evidence base.

**Sources & labels.** Repo facts were measured/read directly on branch
`realm-fix-for-main-2026-11-15` (= GitHub main `207d30a`) on 2026-11-15. Claims from the web
research report (`~/workspace/research_notes/threejs-realm-completion-research-20261115-1850/report.md`,
primary sources: three.js docs/manual, Khronos, MDN — checked 2026-11-15) are marked **[WEB]**
and were NOT re-verified against the repo. Estimates are marked **ESTIMATE**. Internal audit
docs: `REALM_SYSTEMS_INVENTORY.md`, `BACKEND_CONNECTION_MAP.md` (same folder).

---

## §3 ASSET INVENTORY — public/assets (584 MB measured by `du`, 2026-11-15)

(The founder's brief said 599 MB; the measured tree total is 584 MB. Trust the measurement.)

### 3.1 The big trees

| Tree | Size | What it is | Live load path? |
|---|---|---|---|
| `assets/models/` | 106 MB | Realm props, mounts, nature, LOD models | YES — RealmProps/FalProps/Nature/LOD builders |
| `assets/forge-models/` | 74 MB | Forge archetype bodies (vanguard, oracle, …) | YES — WorldOperatives.glbFor (player bodies) |
| `assets/agents/` | 50 MB | 7 council GLBs + portraits | YES — council queue + operative preload |
| `assets/kits/` | 45 MB | Blender kits: halls, bots, bazaar city, maglev | YES — RealmKits/halls/interior bots/bazaar |
| `assets/npcs/` | 31 MB | Townsfolk rigs | YES — Townsfolk builder |
| `assets/terrain/` | 27 MB | height16.bin (8 MB), color.jpg, layer textures, terrain.json | YES — terrain-v4 |
| `assets/textures/` | 23 MB | Facades, marble, library art, theme grounds | YES |
| `assets/world/` | 9.8 MB | canon-v4.glb, plan JSONs (grid-city, plots, fabric…) | YES (plans + canon) |
| everything else | ~258 MB | bot/ videos, vfx, journey, audio-adjacent, misc | MIXED — see 3.3 |

### 3.2 Top 20 largest files (measured)

| File | Size | Realm? |
|---|---|---|
| `assets/bot/video/win-1.mp4` | 17.50 MB | NO — bot promo video, not a realm asset |
| `assets/agents/ZEROX.glb` | 12.31 MB | YES — Fix 2A target (8.72 MB PNG inside) |
| `assets/bot/video/win-2.mp4` | 10.49 MB | NO |
| `assets/terrain/height16.bin` | 8.00 MB | YES — heightmap |
| `assets/terrain-ww/height16.bin` | 8.00 MB | ONLY with `?waterways=1` — duplicate of the above |
| `assets/vfx/gate-travel.mp4` | 7.91 MB | YES — gate travel video |
| `assets/journey/planet-saturn-spin.mp4` | 6.01 MB | Journey feature |
| `assets/agents/PIKADON_old_model.glb` | 5.35 MB | **DEAD — see 3.3** |
| `assets/vfx/oracle-glow.glb` | 5.18 MB | YES — vfx |
| `assets/agents/TURTLE.glb` | 4.82 MB | YES |
| `assets/agents/ZEROX_packed_old.glb` | 4.76 MB | **DEAD — see 3.3** |
| `assets/kits/shaddai_bazaar_city_v02.glb` | 4.68 MB | YES |
| `assets/vfx/shaddai-blast.glb` | 4.58 MB | YES |
| `assets/world/canon-v4.glb` | 4.45 MB | YES |
| `assets/agents/VILLAIN.glb` | 4.36 MB | YES — Fix 2A target (2.63 MB PNG inside) |
| `assets/forge-models/vanguard-walk.glb` | 3.91 MB | YES |
| `assets/forge-models/vanguard.glb` | 3.89 MB | YES |
| `assets/agents/SHADDAI.glb` | 3.88 MB | YES |
| `assets/agents/SHADDAI_gold_static.glb` | 3.67 MB | **DEAD — see 3.3** |
| `assets/forge-models/oracle-walk.glb` | 3.49 MB | YES |

### 3.3 Dead weight (verified by repo-wide grep of `public/*.js` — ZERO references)

- `assets/agents/ZEROX_packed_old.glb` (4.76 MB), `assets/agents/PIKADON_old_model.glb`
  (5.35 MB), `assets/agents/SHADDAI_gold_static.glb` (3.67 MB) — **13.8 MB of deploy weight
  nothing loads.** Deleting them is a founder decision (the guide lists them as candidates
  only; no fix in the main guide touches them).
- `assets/terrain-ww/` duplicates the 8 MB heightmap for the opt-in `?waterways=1` path.
- The two `assets/bot/video/*.mp4` (28 MB combined) are not realm assets at all — they ride
  along in the same deploy.

### 3.4 Compression candidates (savings are ESTIMATE unless a fix already proved them)

| Candidate | Action | Saving |
|---|---|---|
| ZEROX.glb PNG → WebP (Fix 2A) | glTF-Transform `webp` | ~8.4 MB file, texture VRAM unchanged (still RGBA) |
| VILLAIN.glb PNG → WebP (Fix 2A) | same | ~2.3 MB file |
| Terrain color.jpg + 10 layer textures → KTX2 (§4) | KTX-Software / gltf-transform | ~75 MB VRAM → ~10–19 MB VRAM [WEB ratio 4–8×] |
| Council/kit/npc GLB textures → KTX2 (§4 phase 2) | `gltf-transform optimize --texture-compress ktx2` (statics) / per-slot etc1s+uastc | VRAM 4–8× on converted textures [WEB] |
| *_old / gold_static deletion | founder-approved delete | 13.8 MB deploy |
| height16.bin cache policy | backend cache-headers task (main guide, Backend section) | repeat-visit download, not size |

---

## §4 TEXTURE PIPELINE — from PNG-everywhere to KTX2 (phased, fallbacks kept)

### 4.1 The problem in one paragraph
Every image in the realm — loose textures and GLB-embedded alike — is PNG/JPEG/WebP, and ALL
of those decode to full RGBA8 in VRAM: `width × height × 4 × 1.33` with mipmaps (three.js
manual [WEB]: 1024² = 5.3 MB, **2048² = 21.3 MB**, 4096² = 85.3 MB). File size is a download
metric; VRAM is a DIMENSIONS metric. Block-compressed formats (BC on desktop, ASTC/ETC2 on
mobile) stay compressed in VRAM at roughly ¼ to ⅛ the bytes [WEB]. KTX2 + Basis Universal is
the one container that ships a single file and transcodes at load, in a worker, to the best
format each device supports.

### 4.2 What three r180 supports (repo-verified + [WEB])
- **KTX2Loader is NOT vendored in this repo.** `public/vendor/three/addons/loaders/` contains
  only `DRACOLoader.js` + `GLTFLoader.js`; `addons/libs/` has draco + meshopt only.
  (SkeletonUtils, BufferGeometryUtils etc. ARE vendored under `addons/utils/`.)
- `BasisTextureLoader` was deprecated in r137 and **REMOVED in r150** [WEB] — any tutorial
  importing it is dead on r180. The only path is `KTX2Loader` + the Basis transcoder.
- Wiring pattern [WEB]: `new KTX2Loader().setTranscoderPath('/libs/basis/').detectSupport(renderer)`
  then `gltfLoader.setKTX2Loader(ktx2Loader)`. `detectSupport(renderer)` is REQUIRED before
  any load, and it must be the SYNC call on r180 (the async variant's deprecation is r181+).
  The transcoder files (`basis_transcoder.js` + `.wasm`) live in the three package at
  `examples/jsm/libs/basis/` and must be self-hosted, pinned to the same three version (r180).
- iOS: ASTC is supported on all Apple devices since A8 (2014) and exposed via
  `WEBGL_compressed_texture_astc`; ETC2 is WebGL2 core [WEB]. BC formats are NOT available
  on Apple silicon [WEB] — which is exactly why the transcode-to-device model matters.
- Format choice [WEB, Khronos artist guidance]: ETC1S for colour maps (smallest), UASTC for
  normal/detail/ORM maps (near-lossless). KTX2 files must embed their mipmaps; `flipY` stays
  false for compressed textures.
- **Failure mode that dictates the phasing:** a GLB using `KHR_texture_basisu` THROWS on any
  load path whose GLTFLoader lacks the KTX2Loader — it does not degrade. The realm constructs
  GLTFLoaders in several places (agentBodyLoader, the canon/clusters loader, operative
  loaders…); every one must be wired, or that path breaks.

### 4.3 Exact conversion commands [WEB — research report §2, checked 2026-11-15]
```bash
# One-shot (STATIC props only — join/flatten defaults can destroy rigged characters):
gltf-transform optimize in.glb out.glb --compress meshopt --texture-compress ktx2 --texture-size 2048
# Per-slot KTX2 (what optimize does internally; needs the KTX-Software `ktx` binary ≥ 4.4):
gltf-transform uastc in.glb tmp.glb --slots "{normalTexture,occlusionTexture,metallicRoughnessTexture}" --level 4 --rdo --rdo-lambda 4 --zstd 18
gltf-transform etc1s tmp.glb out.glb --quality 255
# WebP (download only):  gltf-transform webp in.glb out.glb --quality 80
# gltfpack (NATIVE binary only — the npm build cannot compress textures; -kn is mandatory here):
gltfpack -i in.glb -o out.glb -cc -tc -kn
```
Neither `gltfpack` nor `ktx`/`toktx` is installed on this VM (checked 2026-11-15); node
v24 is available, and the repo already carries GLB tooling in `tools/ual/`
(`inspect-glb.mjs`, `raw-skin-check.mjs`, `measure-agents.mjs`) for before/after proof.

### 4.4 Migration path (keeps fallbacks at every phase)
- **Phase 0 — vendor only (zero risk).** Copy `examples/jsm/loaders/KTX2Loader.js` +
  `examples/jsm/libs/basis/` from the three r180 npm package into
  `public/vendor/three/addons/`. Nothing references .ktx2 yet, so nothing can break.
- **Phase 1 — terrain textures behind a flag.** Convert `assets/terrain/color.jpg` + the 10
  splat layer textures to .ktx2 (UASTC for normal-ish layers, ETC1S for colour). In
  world-terrain-v4.js, swap URLs only when a new `?ktx2=1` flag is present (default OFF);
  the PNG/JPG/WebP path remains the fallback. Verify VRAM via `renderer.info.memory`.
- **Phase 2 — big GLBs.** After Fix 2A's WebP step, convert ZEROX/VILLAIN, then kits/npcs,
  keeping the original GLBs reachable under `?ktx2=0` fallback URLs. Wire ONE shared
  KTX2Loader into EVERY GLTFLoader the realm creates before the first converted GLB ships.
- **Never convert:** DataTextures, canvas textures, the heightmap (`height16.bin` is data,
  not an image).

### 4.5 Why this is LAST in the bring-it-together sequence
It multiplies every earlier win (load peak, VRAM, phone survival) but touches every loader
in the game. Doing it before the load path is stable (Fixes 1–3, Mobile Cuts) would make
every failure ambiguous: asset, loader, or transcode? Sequence discipline is the safety.

---

## §5 CITY BUILDER DEEP-DIVE — grid-city-v4.json

### 5.1 The file
`public/assets/world/grid-city-v4.json` (253,483 bytes), produced deterministically by
`tools/grid-city/grid-city-plan.cjs` (seed 5888). Blender reads the same file — plan, game
and dashboard share one source. Top-level keys (read directly):
`version: 1, seed: 5888, units_per_m: 3.888888888888889 (= 7/1.8), grid_r_m: 1600,
core_r_m: 170, rings_m: [576, 992], setback_m: 6,
tier_format: "[w,d,z0,h,ox,oy,type] local metres; type 0 box, 1 taper, 2 crown, 3 slab, 4 needle",
buildings, plazas, parks, lamps, stats`.

### 5.2 Schema (per record type)
- **building** `{id:"b0", kind, x_m, y_m, rot_deg, w_m, d_m, h_m, tiers:[[w,d,z0,h,ox,oy,type],…], accent}`
  — 318 buildings. kinds: tower 140, terrace 103, podium 37, hall 30, spire 8.
  1,262 tiers total (≈3.97/building); max height 305.9 m. `accent:"gold"` on showcase pieces.
- **plaza** `{id:"pz2", x_m, y_m, rot_deg, w_m, d_m, fountain_r_m}` — 199.
- **park** `{id:"pk3", x_m, y_m, rot_deg, w_m, d_m, trees:[[x,y,r],…]}` — 302 parks,
  5,137 trees in stats (tree coords are park-local — see Fix 6's [VERIFY] note).
- **lamp** `{x_m, y_m}` — 1,301.
- **stats** also records: lots 1,433, skybridges 20 (skybridges are counted in stats but
  have no per-item records a builder can consume in v1 — phase-2 question for the generator).

### 5.3 Coordinates — the contract (verified from world-city-heights.js, which flies races over this data)
- Plan space is METRES: `x_m` = east, `y_m` = north. World: `x = x_m · U`, `z = −y_m · U`,
  `U = units_per_m ≈ 3.889`. Heights in the plan are metres → multiply by U.
- Building rotation `rot_deg` (CCW) → three.js `rotation.y = rot_deg · π/180`.
- Tier transform (copy exactly; this is the rasteriser's own math):
  `e = x_m + ox·cosρ − oy·sinρ`, `nth = y_m + ox·sinρ + oy·cosρ`, centre `(e·U, −nth·U)`,
  tier box size `(w·U, h·U, d·U)`, centre height `ground + (z0 + h/2)·U`,
  top `(z0 + h)·U`. Ground at build time = `heightAt(worldX, worldZ)` (game units).
- Buildings without `tiers` fall back to one `w_m × d_m × h_m` box (the rasteriser's rule).

### 5.4 Founder layout vs the JSON — do they agree?
His layout (2026-11-12): *"Central circle, rings of plots around it, buildings, the pond,
water round the edge."*

| Piece | In the JSON / world data? | Verdict |
|---|---|---|
| Central circle | Plan `core_r_m: 170` — first building (b0) sits at r ≈ 207 m, OUTSIDE the core. world-layout.js `sacred.rings [60,130,200,260]`, city radius 650 u ≈ 167 m ≈ the same core. | ✅ AGREE — the plan deliberately keeps the centre open; the circle he stands in is the plan's core. |
| Rings of plots | Plan `rings_m: [576, 992]` (→ 2,240 u / 3,858 u). Claimable plot DATA is a different file, `plots-v4.json` (city deed plots, rendered by world-city-v3 as beacons; claims not wired — backend G-7), currently a SW district + fabric districts, not full rings. Portal plots (`/api/portal-plots`) are a separate feature — do not conflate (backend map §2.3). | 🟡 PARTIAL — ring STRUCTURE exists in the plan; the claimable-plot layer doesn't follow it yet. Reconciliation = re-seat/mirror plot records onto the ring radii; no transform of the building plan needed. |
| Buildings | 318 in the plan, centred on origin. | ✅ IN DATA — never instantiated (Fix 6). |
| The pond | NOT in the plan, NOT in terrain.json water (1 ocean + 4 rivers + 5 lakes, none central). Nearest equivalents: 199 plaza fountains + the 5 lakes. | ❌ GENUINELY NEW — terrain heightmap carve + water entry = Blender/terrain-pipeline task. No code transform reconciles this; it is new content. |
| Water round the edge | terrain.json: ocean is an annular sector, r 1850 m → rim 4800 m, water level 2.0 m; the realm is a round island and the player is clamped to its edge. | ✅ EXISTS in v4. |

**Bottom line:** the JSON ENCODES the founder's layout (open core + radial city + edge sea).
The mismatch is not geometric — it is that (a) the plan was never rendered and (b) "pond"
exists only as fountains/lakes. No reconciliation transform is needed beyond
`x = X·U, z = −Y·U, ground = heightAt`.

### 5.5 The superseded module is the design reference — not the code to wire
`world-grid-city-v4.js` (orphaned/superseded, do NOT load) already solved this once: ONE unit
box InstancedMesh for all tiers with a per-instance attribute (taper, kind, seed) feeding a
patched MeshStandardMaterial whose vertex shader rebuilds a procedural window texture from
instance size; tree canopies the only other geometry; 16 spatial chunks (8 wedges ×
inner/outer) for frustum culling → **≤32 draw calls for the entire city, typically 8–14 at
street level**. Fix 6's new consumer (per-tier-type InstancedMesh, 9 draw calls, no chunking
in phase 1) is the simpler first landing; the chunked/shader version is the phase-2 upgrade
path if a richer look is wanted. Its API shape
(`buildGridCityV4({THREE, scene, heightAt, plan, camera, night, rebuildCollision})`) is a
good contract to mirror.

### 5.6 Instancing options in r180 [WEB — research report §5]
- **InstancedMesh** (identical geometry+material): 1 draw call per mesh. Realm's choice for
  tiers/plazas/parks/trees/lamps.
- **mergeGeometries** (`three/addons/utils/BufferGeometryUtils.js` — note: the pre-r151 name
  `mergeBufferGeometries` is dead): frozen statics per chunk, 1 call per material; all
  geometries must share attributes or it returns `null`.
- **BatchedMesh** (varied geometry, ONE material): good for a chunk of different archetypes
  on one atlas. **r180 caveat: since r165, `addInstance()` is REQUIRED after `addGeometry()`
  or nothing renders** [WEB].
- **THREE.LOD does NOT combine with InstancedMesh** [WEB] — the production pattern is one
  InstancedMesh per LOD tier with periodic re-bucketing. three.js has **no HLOD** [WEB]:
  chunk-level far impostors (one merged low-poly mesh per chunk, toggled by distance) are
  custom work — that's the phase-3 lever for "whole city from a hill" views.
- Interaction/raycast should run against the JSON/spatial data, never against merged
  geometry (identity is lost in a merge).

### 5.7 Draw-call math
| Approach | Draw calls for the plan |
|---|---|
| Naive (one mesh per part) | 1,262 tiers + 199 plazas + 302 park pads + 5,137 trees + 1,301 lamps ≈ **8,201** |
| Fix 6 phase 1 (InstancedMesh per type) | 5 tier types + plaza + park + tree + lamp = **9** |
| Superseded module's chunked design | ≤ 32 total, 8–14 visible at street level |
| Context | the CURRENT realm already collapses to FPS 4–5 among its few existing buildings; a code comment cites ~1,250 draw calls pre-static-merge on an HD 620. Naive building is not an option at any quality tier. |

### 5.8 Adjacent city data with no consumer
- `grid-commons-v4.json` — 1,863 items, ZERO client references (systems inventory, FACT).
  Same new-consumer pattern as Fix 6 once the main plan renders; founder decision.
- `canon-consolidated-v1.glb` — **does not exist on disk**. The `if (false)` block in
  world-canon-v4.js (120 academy blocks + 240 culture-lane buildings per its comment) cannot
  be revived by flipping the flag; reviving = Blender re-export from `tools/blender/canon/`
  (**Blender: YES**, optional alternative — NOT required; Fix 6's plan consumer supersedes it).

---

## §6 PERFORMANCE BUDGET

### 6.1 What the governor already enforces (repo-verified)
Quality tiers `_Q` in world-main.js (realm starts LOW; phones start POTATO and clamp ≤ LOW
under pass-1 mobile-lite):

| Tier | Pixel ratio | Bloom | Cull radius | Shadow map |
|---|---|---|---|---|
| POTATO | 0.55 | 0 | 170 | 1024, every 3rd frame |
| LOW | 0.75 | 0 | 230 | — |
| MEDIUM | 1.0 | 0.14 | 220 | 2048 |
| HIGH | 1.2 | 0.22 | 360 | — |
| ULTRA | 1.5 | 0.28 | 9999 | — |

Far-cut: `camera.far` {POTATO 4000 m, LOW 6000 m} × U when `?farcut` is on (default on for
those tiers). `camera.far` is otherwise 6000 u at all tiers — culling is done by the cull
radius + cluster LOD bands, not by fog (fog density is 0 by default).

### 6.2 Measured reality (founder's videos, 2026-11-15)
FPS: **102–144** open terrain → **28–38** desert driving → **14 → 4** among buildings.
Warm-up texture upload ≈ 250 MB (Nov-11 baseline); terrain textures alone ≈ 75 MB VRAM
(color.jpg 2048² ≈ 21.3 MB [WEB formula] + 10 × 1024² layers ≈ 53 MB). Dressing-wave decode
ESTIMATE 60–120 MB. Boot JS: dist bundles ≈ 1.47 MB + world-main ≈ 0.6 MB + ~142 classic
scripts; JS heap ESTIMATE 30–60 MB on iOS.

### 6.3 The iPhone number that does not exist [WEB]
Apple publishes NO official per-tab memory (Jetsam) limit. Secondary sources conflict
wildly (≈350–400 MB for WebGL-heavy pages on older devices up to ~1–1.5 GB on recent
flagships — research report §3). **Therefore the iPhone column below is a WORKING BUDGET —
a design target chosen conservatively — not a spec, and must never be quoted as an Apple
limit.** The only safe engineering rule: minimise the simultaneous peak (that's what Mobile
Cuts 1+2 do) and test on a real device.

### 6.4 Target budget table (targets are ESTIMATE/WORKING BUDGET unless marked measured)

| Metric | Desktop LOW (governor tier) | iPhone (working budget) | Source |
|---|---|---|---|
| Draw calls (in view) | ≤ 300 | ≤ 150 | [WEB] heuristic allocation: city ≤40, avatars/NPCs ≤30, terrain/sky/water ≤20, props ≤20, rest shadows/UI — tune from `renderer.info.render.calls`, not vibes |
| Texture VRAM | ≤ 400 MB | ≤ 150 MB | ESTIMATE — today terrain alone is ~75 MB and warm-up uploads ~250 MB total; KTX2 (§4) is the lever that makes the iPhone column reachable |
| Largest single texture | 2048² (21.3 MB) | 1024² (5.3 MB) | [WEB] three.js manual formula w×h×4×1.33 |
| JS heap | ≤ 150 MB | ≤ 96 MB | ESTIMATE (one published phone-tier budget [WEB]: ≤192 MB textures / ≤96 MB geometry — a project's tiering, not a platform number) |
| Pixel ratio | 0.75 (LOW) | 0.55 (POTATO, pass-1) | governor, repo-verified |
| Entry peak rule | warm-up may pre-upload | NO superposition: dressing ∥ warm-up forbidden | Mobile Cuts 1+2 — the peak, not the total, is what kills the tab |
| FPS floor | 30 in city | 30 in city | founder-measured today: 4–5 in city (the gap this whole wave closes) |

### 6.5 How to measure (do not guess)
`?perf=1` shows the in-game HUD; `renderer.info.render.calls` / `renderer.info.memory`
give live draw calls and texture/geometry counts; `window.__bootTimings` records loader
step timings incl. the warm cap; `WorldPerfGuard.stats()` reports speck-cull and bad-skin
state. Every budget claim in a report should cite one of these, with the date and tier.

---

## Cross-references
- Fix steps: [FIX_GUIDE_FOR_SMALL_MODELS.md](FIX_GUIDE_FOR_SMALL_MODELS.md) (Fix 2A ↔ §4,
  Fix 6 ↔ §5, Mobile Cuts ↔ §6, Backend section ↔ `BACKEND_CONNECTION_MAP.md`).
- Module census & systems evidence: `REALM_SYSTEMS_INVENTORY.md`.
- Backend gaps G-1…G-14: `BACKEND_CONNECTION_MAP.md` + `audit-parts/`.
- Web research (primary sources, 2026-11-15):
  `~/workspace/research_notes/threejs-realm-completion-research-20261115-1850/report.md`.

*Compiled 2026-11-15. Repo facts measured on `realm-fix-for-main-2026-11-15` (= main
207d30a); [WEB] claims are from the cited research report and were not re-verified against
the repo; ESTIMATEs are labelled and must stay labelled when quoted onward.*
