# QA PROCESS — never make good things worse

Rule: **nothing visual ships unreviewed.** Tests prove logic; screenshots prove it looks right. We compare against a blessed baseline so a regression is caught the same day.

## The gate (every pass that touches visuals, rigging, lighting, terrain, UI)
1. **Tests**: `node tools/tests/*.test.cjs` all green (logic never regresses).
2. **Screenshots** (headless, 900x520, one browser at a time):
   - start the static server: `cd public && python -m http.server 3013`
   - `node tools/_qa.cjs run` (refuses if free RAM < 1300 MB; close Blender/Chrome first, or set `QA_MIN_MB`)
   - `node tools/_qa.cjs compare` -> per-image % change; changed images get a **side-by-side sheet** (left baseline, right current) next to the run folder
3. **Look at every flagged sheet** (open with the image viewer / Read). Ask: is it better, same, or worse? Worse -> fix before pushing.
4. **Bless** only when the change is intended and better: `node tools/_qa.cjs bless`. The baseline moves forward; old good states stay in `eye/qa/<sha>/`.
5. Push, then add a line to `docs/JOURNEY-LOG.md`.

Shot list lives in `tools/qa/shots.json` (environment sky/horizon, 4 Grid districts, Sky Dock, rides: sedan, pod, board). Add a shot whenever we add a feature we care about (stairs, castle valley, Colosseum arena states, homes per realm, rigged characters). Each shot reuses a `tools/_eye.cjs` mode, so what the gate sees is what we look at by hand.

## Review checklist (read the sheet with these questions)
- Clutter: is anything overlapping, floating, z-fighting, or samey?
- Readability: can you tell where you are (district colours, signs facing the right way, lights)?
- Scale: do people, doors, stairs, cars and boards have believable proportions? Riders sit IN cars, stand ON boards, feet touching.
- Lighting: day, dusk, night all fine; no blown-out or black areas.
- Motion (when we can capture): hoverboard sway/lights, cars float and bank, no popping.
- Performance: draw calls / triangles did not jump (`__w3dDebug.renderer.info`).

## Rigging audit with Blender (owner can open it)
Keep the full-city .blend closed (it crashed the laptop before). Use small per-asset files. For each rigged character/mount:
1. Bind pose is a clean T/A pose; bone names match the shared skeleton (retarget clips work across all rigs).
2. Weight check: raise arms, bend knees, twist spine; no collapsing shoulders, no stretched hands.
3. Riding sockets present: `seat`, `seat2`, `stand`, `saddle`; feet land on the deck / pedals.
4. Export GLB, run the game's character loader test, then a QA shot of the character on its ride.
Findings go in `docs/RIG-AUDIT.md` (one line per asset: ok / needs fix / what).

## Machine rules
One heavy job at a time (browser OR Blender). If the OS reaps a job for memory, do not auto-retry; free memory first. Keep screenshots small. Never delete files without asking.
