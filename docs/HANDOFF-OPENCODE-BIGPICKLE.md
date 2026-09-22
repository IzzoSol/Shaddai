# Handoff for OpenCode / "Big Pickle" (written 2026-09-20)

Paste this to Big Pickle: **"Read docs/HANDOFF-OPENCODE-BIGPICKLE.md in C:\Users\Brittany\Shaddai, then do the tasks in order, ONE per turn. After each: run the check listed, commit, and stop for review. Never spend fal credit or commit secrets. Never run `git pull --rebase` or `git stash`."**

Repo `C:\Users\Brittany\Shaddai`. Two branches matter: `feat/world3d` (the 3D world; use the worktree `C:\Users\Brittany\Shaddai-3d`) and `main` (Render deploys from it — do NOT push main without asking).

## Setup
- Serve: `cd C:\Users\Brittany\Shaddai-3d` then `python -m http.server 8790 --directory public`, open http://localhost:8790/world3d.html
- Syntax check after every edit: extract the `<script type="module">` body of `public/world3d.html` to a `.mjs` file and run `node --check`.
- Read `docs/HANDOFF-3D-WORLD-2026-09-20.md` for architecture and known bugs.
- Rule: futuristic only. No ordinary houses/roads. Gold #e8c45c, obsidian #06080b, emerald #00ff9c, cyan #5fe0ff.

## SMALL TASKS (safe for a smaller model; each is independent)
1. **Mount seat heights.** In `public/world3d.html` find `addMount(...)` calls in `boot`. For Canopy Gorilla, Sky Hawk, Hover Pod, Hover Pod II add `seatY` (fraction of model height, try 0.9-1.1) until the rider is visibly on top or in the cockpit. Verify with a screenshot (`node tools/w3d-mount.cjs 8790 zerox` writes `fal-assets/spike/mount-sheet.png`; needs `NODE_PATH=C:/Users/Brittany/Shaddai/node_modules`).
2. **Rider scale** on mounts feels small: after `mount()` you may scale nothing; instead raise `seatY`. Do not scale characters.
3. **Terrain use.** Tiles exist in `public/assets/terrain/*.webp` (road, sidewalk, snow, rock, dunes, river, meadow, ocean-deep, plus grass, sand, lava, obsidian, water, harvest, frost, root-moss). Use `tex('name', repeat)` in `buildTerrain()`: put `neon-road` on the four avenues (replace the cobble roads), `sidewalk-tiles` as 3 m borders, `dunes` around the desert, `snow` and `mountain-rock` for a new north tundra area at z<-400.
4. **Rocks, trees, street props.** Models exist in `public/assets/models/`: `prop-street-lamp, prop-bench, prop-kiosk, prop-transit-stop, prop-holo-fountain, prop-statue-shaddai, prop-neon-tree, prop-crystal-cluster, prop-ore-node, prop-obsidian-rocks, prop-signpost`. Scatter them with `place(name,{x,z,h:...})` along the ring road (radius ~104) and avenues. Keep total added objects under 80.
5. **Pause menu.** Add an Esc overlay (`#pause`) with tabs Resume / Map / Inventory / Controls / Graphics (graphics calls `applyTier`). Reuse existing CSS variables. No new libraries.
6. **Inventory screen.** Show `save.inv` (array of names) and `save.sparks` in a grid, key `I`.
7. **Interior template.** `buildInterior()` builds one shop. Use models `fur-shop-counter, fur-vending, fur-shelf, fur-terminal, fur-plant-pot, fur-floor-lamp` (in public/assets/models) to furnish it.
8. **Building interiors for more buildings.** Add a second interior (forge): `fur-forge-station, fur-workbench, fur-storage-crate`. Entry via `nearest()` 'enter' kind + `enterInterior(id)`.

## BIG TASKS (need a stronger model or the owner)
- **Deformed characters.** Meshy rigs limit motion. Test: regenerate one hero via `M6_POLY=80000 OUTDIR=fal-assets/characters/<n>-hq node fal-assets/character-pipeline.mjs <n>-hq fal-assets/spike/char-<n>-council-tpose.png 0 --meshy6 --height 1.8 --guide-texture` (four `*-hq` versions were started 2026-09-20; check `fal-assets/characters/*-hq/`). Compare `headshot.mjs`, walk/run frames. fal credit is fine but do NOT generate 8 unverified ones.
- **Merge the old 3D world** `public/SHADDAI-WORLD-3D.html` (365 KB, standalone) into the City hub as a district (port its scene, not a link). Owner wants it IN the world with the new characters.
- Illustrated map screen, real construction stages (foundation/frame/shell with costs and timers), forge crafting UI, planned avenues + districts, dragon/siege boss, city↔realm highways.

## Prompts and pipeline
Model pipeline: concept image with `fal-assets/generate.mjs <batch> --go` (batches in `fal-assets/batches/`), 3D with `node fal-assets/character-pipeline.mjs <name> <img> --meshy6 --static`, compress with `npx @gltf-transform/cli optimize in.glb out.glb --compress meshopt --texture-compress webp --texture-size 1024`. Prompts: isolated single object, flat grey bg, soft light, solid opaque, 3/4 view, no text. Owner reference images go in `fal-assets/refs/world/`.

## SKATE ARCADE (written by QUILL)
Repo IzzoSol/Shaddai-Arcade, local `C:\Users\Brittany\Shaddai-Royale`, branch `feat/hall-platform-phase1`. Also see memory notes SHADDAI_SKATE_GATE_A_COMPLETE_20260918 and SHADDAI_ARCADE_SKATE_REAL_VISION_20260918.
State: Gate A complete (9dd1883); `hall/packs/skate.js` is a zero-RNG hidden-simultaneous RPS trick mechanic (flip/air/grind counters), 8/8 tests green. Owner rejected the text/CSS beta ("no visuals, a simulator, not a game"). Wants full-body characters, a real fal video per trick attempt (~18 per match), play-while-it-generates, later open-roam. Board-select screen (3 cosmetic boards) exists. Owner must rotate FAL_KEY before Gate C. Rules: small steps, `npm test` after every change, never commit secrets, ask before spending fal.
Tasks (each one turn):
1. Placeholder full-body sprite sheet (idle/flip/air/grind) in assets/characters, drawn per trick state. Check: each trick shows its frame.
2. `utils/falVideo.js` `generateTrickVideo(trickId): Promise<string>` returning a mock URL; 2 unit tests.
3. `TrickVideoPlayer` overlay: spinner while the promise resolves, then plays; must not block the game loop.
4. Wire the real fal call behind flag `ENABLE_FAL` (default off, fallback to mock on error). Ask the owner before enabling.
5. Cache generated URLs in `cache/videoMap.json` keyed `<matchId>_<trickIndex>`.
6. Board-select thumbnails + persist choice in localStorage and apply to the arena.
7. Play-while-generate queue: max 2 concurrent fal calls, videos shown in order.
8. Docs: README/handoff with how to rotate FAL_KEY, enable the flag, run the tests.
