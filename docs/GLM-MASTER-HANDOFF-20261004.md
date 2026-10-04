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

## 6. Open owner bugs (2026-10-04, late) � fix safely, flag-gated
- **White "cloud layer" + white floating dots when flying (Arctic side):** likely the arctic theme fog/sky tint plus a snow particle system. Theme particles in `world-themes.js` are now off (`?themefx=1`). Check the `world-biomes.js` PointsMaterial systems (~lines 423, 440, 717, 992) and the arctic fog values; make particles round (sprite map) or off, and keep the fog subtle.
- **NAVI map doesn't work** (`world-navi.js`): reproduce, fix, and keep the DOM hidden when closed.
- **Can't see far:** the fog/draw distance is very short. Raise it gently per quality tier without dropping FPS (fog-aware LOD in `world-clusters-v4.js`).
- **Sky Hawk left/right feels inverted "randomly"** (`world-mount-ride.js`: steering `turn = left - right`, camera at about line 152). Probably the camera swings in front of the hawk. Lock the chase camera behind the mount's yaw while flying.
- **Buttons that ignore real clicks:** the train menu is fixed (it picks on pointerdown in the capture phase, plus keys 1-8). Apply the same pattern to the mount panel (I) and any in-world menu, or fix the root cause in the host's play-mode mouse re-grab (`_safeLock` / `controls.lock` in `SHADDAI-WORLD-3D.html`): don't re-lock when the mousedown target is inside a UI element.
- **Floating clutter:** the sky dock is off (`?skydock=1`). Air traffic (`WorldHoverCars.buildTraffic`, about line 5044 in the HTML) is still on; gate it with `?traffic=1` if the owner agrees.
- **Stray empty file** `world-hoverpark-v2.js` at the repo root (an accident). Ask the owner before deleting it.

## 7. Done in the final push (verify in play) + what's left
- DONE: realm themes no longer override fog (that was the black/white wall: densities tuned for the old small map). World-edge wall at 4,650 m for the player and mounts. Grey theme flakes off. Sky dock off. I works while riding. Train menu: real clicks + keys 1-8. Static merge runs once (freeze fix).
- LEFT (owner, in order): **NAVI map not working**; **offices show as plain boxes until you get close** (LOD/impostor swap distance too short: find the building LOD switch in `world-clusters-v4.js` / `world-fill-v4.js` and raise it per quality tier, measuring draws); **planets/sky objects may cost FPS** (`world-sky-v4.js` and the planet meshes: lower segments, merge, or cull below the horizon); **water looks basic** (`world-water.js`: keep one reflection or none, add a cheap normal-map ripple and a shoreline fade, no extra passes); **collisions** near roads and buildings feel wrong.

## 8. Owner's FINAL loading/intro art + glitch follow-up (2026-10-04)
- **Use ONLY these images for the intro, loading screen and room-entry cutscenes** (convert to WebP about 1600 px wide, about 150 KB each, into `public/assets/loading/owner/`; replace every other loading slide; the slideshow list is `public/assets/loading/slides.json` plus the lite slideshow in `SHADDAI-WORLD-3D.html`; also the backdrop of `world-cutscene.js`): Downloads/image (37).jpg, image (40).jpg, image (14).jpg, image (15).jpg, image (16).jpg, image (17).jpg, image (18).jpg, image (20).jpg, image (22).jpg, 9c607f325e287e52b27fcf10f4b2b491.jpg, image (13).jpg.
- **Owner dislikes the cutscene graphic:** the spinning six-point star in the "ENTERING � <ROOM>" overlay (`world-cutscene.js`, canvas-drawn). Replace it with a clean SHADDAI mark (gold ring + emerald "S", or the owner's loading art as the backdrop). This star is also the "Baphomet-looking spinning star" from the earlier notes.
- **NaN position bug:** a guard is now in the frame loop (`[nan-guard]` in the console). Reproduce it (ride foil / hoverboard, then press keys), read the logged mode, and fix the source in `world-mount-ride.js` / `world-hoverboard.js` (look for division by zero, `Math.atan2` of a zero vector, missing tune fields, `NaN` from `heightAt` returning null).

## 9. Still open after the final push
- NaN source: NOT the park (terrain ignores non-finite extras: world-terrain-v4.js:174 `ex > hb`). Repro with the `[nan-guard]` console log (foil board / hoverboard / keys) and fix the source; the guard keeps it playable meanwhile.
- MOBILE freezes and stops (owner 2026-10-04): phones can't hold the full world. Add a mobile quality tier: halve draw distance, skip nature + realm props beyond 600 m, no static merge pass, pixelRatio 1, no shadows, theme FX off; check memory in Chrome remote debugging. Touch controls: world-touch-buttons.js.

## Loop log (Opus, 2026-10-04)
- iter 1: board/camera NaN guard (hoverboard + Space black screen); floating-square sweep (untextured outdoor Points hidden every 4 s; keeps board trail + interiors; ?fx=1 keeps all). Next: NAVI look/flow, then FPS items in section 2.
- iter 2 (stopped at owner's usage limit): NAVI left as-is (owner: don't break it). NEXT for GLM: decorative PointLights in world-landmarks.js (~26, ~38) and world-buildings.js (~4389-4391) -> emissive stand-ins, measure before/after.
- OWNER (final, 2026-10-04): owner loading slides now show (it was cache). STILL FREEZES at the start while loading into the game -> top GLM priority. Profile the first 30 s after __loadPlayable (long-frame logger, section 1): static merge pass, streaming steps, shader compiles. Fix one at a time behind flags, measure each, break nothing.
- OWNER (final): **fog still too heavy.** Realm themes no longer touch fog; what remains is `world-sky-v4.js` line ~369 (`fog.density = baseFogDensity * Math.min(pal.fog, 1.5)`) plus the base densities in `SHADDAI-WORLD-3D.html` (~466, ~2027-2030). Add `?fog=0` (density 0, but keep the fog-aware far cut so FPS holds), then lower the default (for example �0.4) and cap `pal.fog` at 1.0. Measure draws before and after: less fog means more is visible, so pair it with distance culling.
- OWNER (final): **clutter in the middle of the map: a random bridge and an old dragon/building.** Find them in-game: walk there, then in the console list the scene's top-level children within 300 units, with their names. Likely candidates: an old `bridges` set in `SHADDAI-WORLD-3D.html` (`addSub(b.grp)` in `_mergeSkipSet`), the legacy dragon landmark in `world-landmarks.js`, or `__registerPlaceable` landmarks. Hide them behind a flag (`?legacy=1` to show), don't delete, and ask the owner before removing any file.
