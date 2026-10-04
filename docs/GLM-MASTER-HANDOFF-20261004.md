# GLM MASTER HANDOFF — SPEED FIRST, BREAK NOTHING (2026-10-04)

Claude (Opus) audits and merges this Thursday. **Game speed and freezes are the #1 problem**: the owner reports the game still freezes and feels slow.

## 0. Ground rules (non-negotiable)
1. **Branch:** `glm5/speed`, off `feat/world3d`. Never push to `main`. One fix per commit, with the before/after numbers in the commit message.
2. **Never delete files or features.** Gate risky changes behind a URL flag (`?flag=1` / `?flag=0`) so either version can be tested.
3. **Measure before and after every change** with the same command. No measurement means no commit.
   - Static server: `cd public && python -m http.server 3013` (make sure nothing else is listening on 3013; the dashboard was there once). Or use 3020.
   - `node tools/_boot-smoke.cjs "?time=0.5"`: page errors, time to playable, draw calls, triangles. It needs 0 page errors.
   - `node tools/_draw-profile.cjs "?time=0.5"`: draw calls per owner group.
   - `node tools/_train-probe.cjs`, `node tools/_academy-probe.cjs`, `node tools/_rig-probe.cjs <dir> FORGE-PSIONIC`: regression checks (train boards, Academy opens, no T-pose).
   - Tests: `node tools/tests/world-hover*.test.cjs` and the other `world-*.test.cjs` must stay green.
   - These tools refuse to run below 1 GB of free RAM. Close Blender before running them (the laptop has 8 GB and an HD 620 GPU).
4. **Never lower art quality** (owner rule). Get speed from batching, instancing, culling, LOD, fewer lights, fewer per-frame jobs and async loading.
5. **"No blind merging" (owner):** only bake a group you've proven is static. Use the shared helper `public/world-merge.js` (`WorldMerge.bake(group, THREE, { skip })`) and skip anything animated.

## 1. FREEZES: find and kill the long frames (do this first)
Suspects, in order:
1. **`_staticMerge()` in `SHADDAI-WORLD-3D.html`** runs 3 passes at about +8 s, +40 s and +100 s. Each pass clones and merges geometry on the main thread, which gives a freeze every time. Fix: run it in small chunks with `requestIdleCallback` (merge one material bucket per idle slice), or run it once at load behind the loading screen. Time each pass with `performance.now()` and log it.
2. **Streaming steps** (`_ldStep(...)` chain, realm props, clusters): spread the heavy builders across frames and yield between steps (`await new Promise(r => setTimeout(r))`).
3. **Shader compile stalls** the first time you see something: call `renderer.compileAsync(scene, camera)` once after load, and pre-warm the materials of interiors and vehicles.
4. **Per-frame loops:** find work that runs every frame but doesn't need to (2 Hz is enough for culling, crowd and markets), and anything that allocates inside `animate()`.
- **Measuring freezes:** add a long-frame logger (`frame > 50 ms` → `console.warn` with the systems that ran), and record the worst frame in `_boot-smoke` output.

## 2. Draw calls: currently about 2,200 outdoors; budget under 150
- Already done: train 397 → 126, hoverpark 169 → 44, landmarks 71 → 15, entrances 66 → 26, Colosseum exterior baked, indoor city hidden (2,164 → 524).
- Next owners (from `_draw-profile`): `static-merge` 235, `world-terrain-v4` 190 (merge terrain chunks per LOD ring), `world-fill-v4` 147+78, `grid-fabric-v4` 76 (never culled, 1.3M tris: add chunked culling), `world-nature` (824k tris: LOD, or impostors far away), `sky-dock` 38, `farm-patch` 31 (crops animate, so skip the growing parts), `realm-homes` (never culled: enable culling per chunk).
- Lights: about 14 dynamic lights. Each one costs every lit material. Remove decorative PointLights that have emissive stand-ins (see `world-elevators.js`, `world-landmarks.js`, `world-buildings.js` ~4389). Keep the sun and the few lights that are critical to gameplay.
- Triangles: about 7.3M in view. Biggest are grid-fabric, nature, canon, realm-props and fal-props. Use distance LOD and fog-aware hiding (`world-clusters-v4.js` has a fog cut to copy).

## 3. Load time
- The flat 3 s wait after 100% was cut to 0.35 s. Next: preload the selected character body during the intro, lazy-load realm assets when you approach them, and turn large PNG/JPG textures into WebP (see `.claude/skills/vgpu/blender/references/asset-delivery.md`).

## 4. Hoverskate park + race (safe side tasks)
- `public/world-hoverpark-v2.js` (owner plan: ring bowl, half-pipes, rails, kickers, drop tower + lift + spiral). Polish needs **zero extra draws**: zone sign plates (canvas), edge glow lines, a brighter gold ring.
- `public/world-hoverboard.js` feel numbers (`swooshMS`, `hopMS`, `glideSinkMS`, `slopeGravity`, `RAMP LAUNCH`, `HANGTIME`): tune only by playing, and keep the tests green.
- Petal race course (owner drawing: 4 petals around the city) in `public/world-race.js` `CIRCUITS`/`TRACKS`. Ask which city layout has the open wedges.
- The race-track jump links (`?goto=TOWER_RACE`, `PLAZA_SKATE`) didn't move the player in headless tests. Check `world-goto.js` waits for the spawn to finish.

## 5. Owner notes
- Access code **4444** (key button, bottom right) unlocks all agents locally.
- The Blender preview's grey spindles (spoke/ring pylons, "outcrops") are **Blender-only** artifacts from `tools/blender/place-world-v4.py`. They're hidden in the scene and aren't in the game. If you rerun that script, fix the negative-height pylons and the mountain-kit scatter scale.
- Other lists: `docs/HANDOFF-PERF-PUSH-20261003.md` (full owner asks queue + Blender audit) and `docs/HANDOFF-GLM5-20261003.md` (arcade screen, gear catalog, NAVI polish, trike, car/road upgrade).

## Deliver
`docs/wip/GLM-SPEED-REPORT.md`: every change with its before/after numbers (draws, triangles, worst frame, time to playable) and the regression results.
