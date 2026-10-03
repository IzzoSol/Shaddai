# City v3 — finish (light tasks) — plan

**Spec:** `docs/CITY-MASTER-BRIEF-v2.md` + `docs/city-v3/DOC_*.md` (the owner's v3 brief as curated). Worktree `C:\Users\Brittany\Shaddai-3d`, branch `feat/world3d`.

## Global Constraints
- **Owner's laptop is weak** (Intel HD 620, 8 GB). No Blender, no headless or visible browser, and no long-running processes. Verify with node tests and `node --check` only.
- **NEVER delete anything.** No `git stash`, `reset`, `clean` or `pull --rebase`. Commit only the files your task names, and end commit messages with `Co-Authored-By: <model> <noreply@anthropic.com>`.
- **SPARKS is closed-loop.** No cash-out, withdraw, redeem or yield wording or UI anywhere.
- **Units:** U = 7/1.8 game units per metre. Blender metres are X east, Y north. Game coords are x = X·U, y = Z·U, z = −Y·U.
- **Classic-script module style:** `window.buildX = function (opts) {...}`, ES5-ish, like `public/world-wildlife-v4.js`.
- **Host page:** `public/SHADDAI-WORLD-3D.html`. Integrations go into the `window.__mapV4Ready` promise chain; each step `.catch`es and returns `api`.
- **Parallel work:** two other agents are writing new files in this worktree right now (`public/world-city-actions.js`, `public/city-dashboard.html` and their tests/docs). Do not touch or commit those files.

## Task 1: `?goto=` deep link into the world
The dashboard (`public/city-dashboard.html`, being written in parallel) links each tile to `SHADDAI-WORLD-3D.html?map=v4&goto=<dashboard_id>`. Some links may use a marker `name` instead of an id.

**Behaviour:**
- When the page loads with `goto`, resolve the target once `window.__cityV3.ready` resolves:
  - look up a marker whose `dashboard_id` equals it, else whose `name` equals it (case-insensitive);
  - see `public/world-city-v3.js` `marker()`/`markers` and `public/assets/world/markers-v4.json`.
- After the player has entered the world, move the player 3 m in front of the marker at street level and face the marker.
  - Entering means the intro/loading gate is passed and the sky-dive/spawn (`_spawnBusy`) has finished.
  - Move via the `playerPos` handle, the same way `public/world-transit.js` fast travel does. Keep the controller/avatar consistent: read how fast travel updates `_pctl`/avatar.
- **Unknown target:** show a toast (`window.__toast` if present) saying "Couldn't find that place", and spawn normally.
- **Don't** break any existing URL params (`overhead`, `room`, `terrain`, `peek`, `time`, `perf`).

**Implementation:**
- Put the logic in a new classic script `public/world-goto.js`: `window.buildWorldGoto({ city, getPlayerHandle, isReady, onDone })` → `{ target, resolve(), apply() }`. Keep it pure where possible.
- Wire it in the host after the city v3 step.

**Tests:** `tools/tests/world-goto.test.cjs`, a vm context loading the real `markers-v4.json` via `city.marker`-like stubs. Cover:
- id match, name match, case-insensitivity;
- the 3 m offset lands outside every solid box in `public/assets/world/canon-colliders-v4.json` (use the collision convention from `public/world-collision.js` `_pushOut`);
- unknown target → onDone(false).

**Files:** `public/world-goto.js` (new), `tools/tests/world-goto.test.cjs` (new), `public/SHADDAI-WORLD-3D.html` (wire-in only).

## Task 2: Night glow for the grid-fabric buildings
The fabric buildings are loaded by `public/world-clusters-v4.js` (fabric call in the host: `url: '/assets/world/grid-fabric-v4.json', name: 'grid-fabric-v4'`; api on `window.__w3dDebug.gridFabricV4`). Their materials come from the building library GLBs in `public/assets/models/shaddai-city/`:
- smoked glass `M_Glass`, emission 0.25 warm;
- emerald trim emission;
- `artslot-*` panels;
- lod2 `block-skylight` / `block-emerald`.

At night the city should read as a warm inhabited disk; by day the emission should be subtle.

**Behaviour:** after the fabric resolves, register each UNIQUE emissive material once with the sky: `_v4Sky.addEmissive(mat, { dayMul, nightMul })` from `public/world-sky-v4.js` (see `addNightRamp` / `addEmissive`).
- glass: dayMul 0.2, nightMul 2.4
- trim: 0.6 / 1.8
- skylight blocks: 0.3 / 2.0
- artslots: 0.8 / 1.4
- Materials may be shared across instances and cells, so dedupe by `material.uuid`.
- Materials loaded later (lod1/lod2 swapped in per cell) must also be registered. Either expose a hook in `world-clusters-v4.js` (e.g. `opts.onMaterial(mat)` called once per unique material as parts are built), or walk the group when new cells appear. Prefer the hook, and keep realm-cluster behaviour unchanged.

**Tests:**
- extend `tools/tests/world-clusters-fabric.test.cjs` (or add `tools/tests/world-fabric-night.test.cjs`) with a fake sky recording `addEmissive` calls;
- each unique material is registered once, with the right multipliers by material-name pattern;
- non-emissive materials are skipped;
- the realm call registers nothing unless given the hook;
- keep the existing 10 clusters tests green.

**Files:** `public/world-clusters-v4.js` (hook), `public/SHADDAI-WORLD-3D.html` (pass the hook in the fabric step), test file.
