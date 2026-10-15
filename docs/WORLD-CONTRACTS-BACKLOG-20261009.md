# World build contracts: backlog and mapping to the existing world (2026-10-09)

Source: the owner's build contracts (Shikhar combat, Sael night city, Apek reef, Aman light-fix, cannons, race, water, lava, sand, stream) plus the reference videos below. The plan that tracks them is `C:\Users\Brittany\.claude\plans\jiggly-wishing-pretzel.md` (S0–S9, T, H, C, L, K). This doc is the owner's contract text mapped onto that plan. Nothing here is a second plan.

## Reference videos (quality bar, not pipelines)
- `Pictures\trTyAXyaV33NrDp0.mp4`: Megacity. Budget lesson: ~400–500 draws at 37–58 fps, 3–10M tris. Batch draws hard; triangles are affordable.
- `Pictures\1de8a209d504153cb63931242b5fbe38.mp4`: flying, desert, PvP lock-on.
- `Pictures\d93016253fc63a8322e3969d02fe0d5d.mp4`: water, interiors, underwater homes.
- `Pictures\O_7gfEIlmAVFXImV.mp4`: anti-grav racer. The race-track bar (banked elevated track, kerbs, boost pads, gantries, HUD, speed blur).
- `Pictures\ssstwitter.com_1791510361565.mp4`: boat and water battles.
- Earlier: `Downloads\025706F7…(1).mp4` (racer), `Downloads\F081C7FB…jpg` (night city), Tesana, jet forests. See memory `reference_world_quality_refs_20261008.md`.

Extract contact sheets with ffmpeg (`fps=12/dur,scale=420:-2,tile=4x3`) before each system, and turn the look into numeric acceptance checks (reference-to-acceptance).

## Rules that carry over from the contracts
- One system per commit. Commit before starting each system, with before/after numbers.
- Stop when that system's acceptance log passes. Don't pull in the next system.
- Never replace the scene, camera or renderer. Attach to what exists.
- **Forbidden:** `sort(() => rng() - 0.5)`. Use Fisher-Yates only. Seeded RNG via `mulberry32`, logged at boot.
- Never delete existing materials to "clean up".
- Normal sanitizer on every GLTF (already planned as S0a: `sanitizeNormals` on `GLTFLoader.prototype.parse`).
- `KeyP` freezes time, `KeyO` toggles the suspect pass. Never debug a moving frame.
- Draw budget: under 400 outside the city core, under 800 inside (plan S1).
- Never lower art quality. Get speed from instancing, billboards and culling.
- Futuristic only.

## Where the contracts conflict with this project (owner decisions needed)
1. **Disc world vs our map.** The contracts assume a 4000 m disc with an 8-wedge biome belt. Our world is map v4: city core, ring at r≈2875, realm wedges r4500–10500. Mapping below uses our realms; the disc geometry is not rebuilt.
2. **Stack.** The contract asks for npm installs (three, postprocessing, lil-gui, simplex-noise, three-mesh-bvh, meshoptimizer). The plan decided to keep vendored three r180 (`public/vendor/three`) and not adopt pmndrs. Keep that unless you say otherwise.
3. **File layout.** The contract lists `src/...` files. Our modules are `public/world-*.js` with a `create(o)` API. Keep ours.
4. **Scene and asset reuse.** The contract says "build a new city" in places. Forbidden here: the owner said the city already exists, so systems operate on existing groups.

## Mapping and status
| Contract | Our plan item | Status (2026-10-09) | Next concrete step |
|---|---|---|---|
| **1. Combat, animation, music** (Shikhar): katana trail, lock-on, roll, collapse, ENEMY FELLED card, combat music stem | C1 `world-combat-core.js` + S4.4 lock-on + C-music | Modules exist and are tested (`ecda0e91`, `world-combat-core.js`, `world-lockon.js`, `world-combat-music.js`). **Not wired.** Blocked on the black-sky probe only for visual checks. | Wire behind `?combat=1`: add 3 `<script>` tags near HTML line 335, create the fighter and lock-on, hook the loop, bind keys (lock, attack, roll). Acceptance: 15 s scripted approach, lock acquired, 3 hits, HP 0, title fired once, trail vertex count stays 16. One wraith on the existing path, no second enemy. |
| **2. Night city, rain, windows** (Sael) | S7 City night (`?citynight=1`) | Not started | Seeded window emissive map, road roughness at rain > 0.4, 200 instanced cars on existing splines, brake lights, turbo red trail 1.5 s. Acceptance: night toggle lights windows; 200 cars move; draws rise ≤ 40. Slider uniforms only (no geometry rebuild on drag). |
| **3. Reef station** (Apek) | S3 water + reef (`world-reef.js`, `?reef=1`) | Not started | Reef pods, glass band, gold rail, underwater fog swap (#0b4c6b, density 0.035), 80 coral + 40 fish instanced, culled above water. Parented to the existing ocean (no second ocean). Acceptance: deck→underwater without hitch; fog swaps once each way. |
| **4. Lighting quality** (Aman): 4 real lights, shadow 2048, LOD box swap past 600 m, ACES, bloom threshold 0.85 | L Lighting + S9 | Not started. Note: OutputPass is missing (plan L step 0 probe). | Probe tone mapping first (grey patch readback), then `?outpass=1` A/B. Count lights; log LOD pop distance. Acceptance: exposure change does not white out the hub. |
| **5. Cannons and smoke** (cryptomanavan): broadside, 0.35 s cooldown, smoke 1→8 over 1.4 s, kill at 1.6 s, water column | S5 broadside | **Done behind `?broadside=1`** (`c2abe3a3`, `world-broadside.js`). | Acceptance check: 6 shots, no smoke older than 1.6 s, no new meshes left in the scene graph after 3 s. Confirm against the contract numbers. |
| **6. Race ring, hover, ship** (Vector, Galactic Racer) | S2 race in the city | v1 done (`74a1b196`, `1acd517d`, flyover). Racer ships are S2 step 5 (not started). | Deck-height fix → clear towers (`topAt`) → 11 AI → HUD km/h + boost + minimap → racer ships (procedural capsule + nacelles, 4k tris, InstancedMesh for AI) → gate arches → speed lines (2000 GPU points). Acceptance: `tools/_accept-race.cjs`, 10 s, rank/speed/rival sampled once a second. |
| **7. Ocean, spray, lens drops, river mirror** (Aman, pod-racer water) | S3 `world-water-spray.js`, lens drops, underwater look | Not started | Gerstner waves + Jacobian foam on the ocean wedge only; GPUComputationRenderer spray at 128² (drop to 64² if frame > 16 ms); half-res river mirror (billboards + sky only); lens drops ≤ 24 uniform array; rain 9000 streaks off outside water/storm. GUI: wind, chop, foam threshold, spray. Fish/birds only after 60 fps. |
| **8. Lava wedge** (volcano clip) | S8 lava (`?lava2=1`, `world-volcano.js`) | Not started; audit existing lava shader and embers first | Crack emission in creases (ridged FBM displacement), scrolling flow ribbon at 0.15 m/s, plume billboards, 200 pooled bombs with emissive (no real lights), fissure toggle. Acceptance: cone reads at 800 m and 40 m; fly-by with light count unchanged. |
| **9. Sand boss and resistance** (LUTA) | S4 dunes + worm (`?worm=1`, `world-desert.js`) | Not started | Dune FBM with the same height function in JS and GLSL (acceptance: JS vs GPU within 1 cm at 100 points). Resistance `thrust *= smoothstep(80,25,dist)`, camera shake, dust curtain. **No invisible wall, no position clamp.** Closest approach > 22 m. |
| **10. Disc streaming, cloud-island loop** (Megacity budget, Nedi loop) | S1 perf (frustum cull, cell merge) + T2 forests (`world-conifer.js`) + stream | S1 culling plan exists, not done. Stream: load < 1400 m, unload > 1800 m. | Frustum culling in `world-clusters-v4.js` first (plan S1 step 1), then forest impostors past 80 m. Rim mist fades 3800→4000 is not needed: our world has a world-edge wall at 4650 m (`b0dafe5a`). Log resident draw calls. |

## Where things stand right now
- **Black sky at noon** is still unresolved (probe crashed three times; the last two failures are probe bugs, not sky findings). `window.__w3dDebug` now exports `THREE` (uncommitted, `SHADDAI-WORLD-3D.html` line 481). The probe is `%TEMP%\opencode\_sky-occl.cjs`.
- Stray `world-hoverpark-v2.js` (0 bytes) at repo root is still untracked. Not deleted: owner has not approved.

## Order I recommend (owner can change it)
1. Wire combat + lock-on behind `?combat=1` (system 1). Playable, no sky dependency.
2. Black sky probe, then S0 harness (`world-devkit.js`, `sanitizeNormals`, `?gui=1`).
3. Race v2 items (system 6), since it's the owner's first-chosen visual system.
4. City night (system 2) and lighting pass (system 4), since they change every shot.
5. Water + reef (system 7, then 3), lava (8), sand boss (9), stream (10).
