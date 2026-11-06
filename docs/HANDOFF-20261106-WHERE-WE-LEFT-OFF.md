# HANDOFF — where we left off (2026-11-06)

Point a new Claude Code terminal at `C:\Users\Brittany\Shaddai-3d` and say: **"read docs/HANDOFF-20261106-WHERE-WE-LEFT-OFF.md and continue"**.
Full detail lives in the master plan repo: `C:\Users\Brittany\shaddai-master-plan\SHADDAI_MASTER_PLAN_OPUS55.md` → section 6, **Phase W** (items 1–17).

## Target
- **Main repo** `IzzoSol/Shaddai` (this folder's `origin`), live at **https://shaddai-g81x.onrender.com/** (Render auto-deploys `main`). NOT the beta.
- Repo rules: `CLAUDE.md` (measure before/after, one branch per phase, never push `main` without the owner).

## ⚠ Read first (state of git)
1. **All of this work is UNCOMMITTED** in this folder's working tree.
2. **Another Claude session shares this folder.** It switched the folder from `polish/world-finish-p1` to `feat/sap-treasury` and committed two treasury commits (`b05ff00a`, `01871f18`, backend/x402 + docs only; it did not take these files).
3. First step next session: commit THIS work to its own branch **without checking out** (so the other session's branch is not disturbed), e.g. build a commit from a temp index on top of `polish/world-finish-p1`, then ask the owner before merging to `main`.
4. File backup of every changed file: `C:\Users\Brittany\AppData\Local\Temp\claude\C--Users-Brittany\b2c459e3-d79f-42b5-88b6-021e6543b6c9\scratchpad\backup-20261105` (35 files + `public/dist` + the K32 kit source).
5. The bazaar kit source lives in the OTHER repo: `C:\Users\Brittany\Shaddai\public\assets\kits\_src\k32_underground_bazaar.py` (uncommitted there too).

## ⚠ Machine limits
- **Disk C: ~0.6 GB free.** A worktree checkout already failed with "No space left on device". Free space before builds/exports.
- **RAM:** headless world tests need ~1.2–1.5 GB free; below that Chrome dies ("Target closed"). Close Edge / opencode / other Claude windows.
- How to test headless: see memory `reference_shaddai_world_headless_probe.md` (custom-camera renders after `window.__loadPlayable`, no spawn; spawn takes ~12 min under SwiftShader).
- Local server is usually already on :3013 (`node tools/serve.cjs 3013`). After editing any boot script: bump its `?v=` and run `node tools/build-dist.cjs` then `--check`.

## Done (uncommitted, tested)
- Shader fix (instanced decals), F2 hide-all UI, `\` vs Shift+`\` (fight mode / campfire), Dragon Shards chip.
- One dragon per realm: dark forest = **Blight** dragon (dragon suites 50/50).
- Forge demo: real council bodies + skin repair + "Enter Shaddai World" registers via `POST /api/operatives` (route hardened, red-team 9/9).
- **Underground Bazaar v02** (`shaddai_bazaar_city_v02.glb`): capstone flush with the street + shrine, 14 m gap with 4 bridges + rails, 6 glass oculi, incline-rail cinematic elevator, **station rebuilt** (island platform, sunken tracks, stairs, closed hall), **tunnel trains** (Colosseum / Undersea lines, ~9 s cinematic). Bazaar ON by default (`?bazaar=0` off).
- Colosseum spectate moved from C to `]` (C is the dodge roll).
- Test sweep: 101/102 (only real failure: `canon:academy-hall` marker vs building — owner decision).
- **Athenaeum class foundation**: `public/athenaeum-class.html` + `public/academy-code.js` + Navi → ACADEMY code. Fees / PayBox / server codes / live sync = later.
- **Bot bodies**: humanoid vs wheel choice on claim (`server/agentBodies.js`), no wheel bots in ATHENAEUM/COLOSSEUM (`WorldBots.frameAllowed`, race-mode switch), `/bot-bodies.html`. Owner approved the current bodies.
- Intro: green scan line removed, smooth title, **bigger loading bar**. Navi: world redraw 1-in-4 while open, compositor-only animations. Picker cards bigger.
- **Light budget** `public/world-light-budget.js` (nearest 8 point + 2 spot lights; `?lightbudget=0` off).

## NEXT (owner order, 2026-11-05/06)
1. **Measure the light budget** (baseline: street 1,708 calls / 2.9 M tris, aerial 3,485 / 3.4 M, realm edge 3,781 / 4.0 M; 40 lights, 660 shadow casters, 248 programs). Two "after" runs ran out of memory. Script idea: render the same 3 viewpoints, compare `renderer.info` + ms.
2. **Textures / speed / FPS**: texture compression (KTX2 / gltf-transform, pre-approved dev tools), shadow casters (660), draw calls (static merges), hide far realm towns / titans.
3. **Hoverboard** feel pass (needs an in-game session).
4. **Intro slides**: the owner will send replacement images → `public/assets/loading/owner/NN.webp` (+ `world-loading-slides.js` SLIDES list).
5. Commit to a branch → owner approval → deploy to `main`.
- Later (owner): cosmetics, lock-on, side missions, teacher fees / PayBox, rarity server-side on `/api/operatives`.

## Open owner decisions
- `CLASS_01` academy marker vs the Athenaeum building position.
- Cavern lighting (surface sun washes out the bazaar), bridges/cinematic art direction.
- ZEROX.glb 12.9 MB compression (an older packed version was set aside once).
