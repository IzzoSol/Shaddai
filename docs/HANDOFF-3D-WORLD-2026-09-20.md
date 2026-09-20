# SHADDAI 3D World — Handoff (2026-09-20)

Worktree `C:\Users\Brittany\Shaddai-3d`, branch `feat/world3d` (based on 1855ded). Main checkout `C:\Users\Brittany\Shaddai` is on `main` and was pushed with a signals heatmap fix (9e7bbe6).
Serve: `python -m http.server 8790 --directory public` then open `/world3d.html`. Headless tests: `tools/w3d-*.cjs` (set `NODE_PATH=C:/Users/Brittany/Shaddai/node_modules`).

## Done
- Hero clips are per-body (`assets/models/chars/<id>-walk|run|action.glb`); no cross-body retargeting (that deformed them).
- Seated-pose solver `applySeat()` + per-mount `seatV`; vehicle steering/throttle/chase camera; boats ride the wave function.
- Perf governor + culling; parallel model preloading; progressive boot; save/load; map; build mode (placeholder).
- Models: 40 new concept plates -> Meshy v6 static GLBs in `fal-assets/world/assets/*` (furniture kit, props, buildings, hover taxi/bus/sky-car). Compressed into `public/assets/models` by `finish.sh` (verify count).
- Terrain: 8 extra fal tiles (road, sidewalk, snow, rock, dunes, river, meadow, deep ocean) -> `public/assets/terrain/*.webp`.

## OPEN BUGS (owner-reported, top priority)
1. **Rider not visible on mount** (probe `tools/w3d-probe.cjs`: data is right — hips at seat height, no NaN, visible=true — but screenshot shows no rider). Suspects: `mount()` does `m.grp.add(player.root)` while `place()` wrapped the model in a scaled group; rider inherits a tiny/huge scale, or `world` culling (`cullPass` sets `o.visible=false` for far `userData.cull` groups, riders are children). Check `player.root.getWorldScale()` and the mount group's scale first.
2. Riders must be SEATED (solver exists, unverified visually) and vehicles must face/steer correctly (`align` in place() guesses long axis; verify per model, use `flip`).
3. Characters deform: Meshy rigs are limited. Options: regenerate with `pose_mode:'t-pose'` + `--guide-texture`; try `fal-ai/hunyuan3d/v2` + humanoid retopo; or Tripo/Rodin via fal; or author low-poly voxel/modular characters in code. Each hero must keep own clips. Test with `tools/w3d-mount.cjs`/`headshot.mjs` close-ups.
4. Map/UI still basic: needs illustrated map, pause menu, inventory, forge UI, real construction stages (foundation->frame->shell with costs/timers).
5. City hub needs a planned layout (radial ring roads, districts) instead of random placement; add interiors (fade-in interior templates using the furniture kit), roads/streetlamps/trees between realms, biomes (snow/sand/mountains/rivers), real grass.
6. Integrate old 2D city (`public/game.html`, 2D sprites already wired) as a district/portal. `game.html` has pre-existing script errors from the embedded tactics iframe (`export` token, `CLAN_NAMES`).
7. Never run bare `git pull --rebase` on the main checkout while 3D work is uncommitted (that reverted world3d.html once).

## Pipeline
`tools/gen-models.sh <batch> <concept-dir> <list> <out-dir> [parallel]`; images via `fal-assets/generate.mjs`; 3D via `fal-assets/character-pipeline.mjs <name> <img> --meshy6 --static`; compress with `npx @gltf-transform/cli optimize in out --compress meshopt --texture-compress webp --texture-size 1024`. QUILL writes prompts, TURTLE checks 3D-readiness, SHADDAI places (MCP tools `shaddai_quill/turtle/run_agent`). Rules: futuristic only (no ordinary houses), isolated single object on flat grey bg, look at every output.
