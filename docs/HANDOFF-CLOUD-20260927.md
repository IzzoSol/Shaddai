# Handoff → cloud session (2026-09-27)

This covers repo `IzzoSol/Shaddai`, branch **`feat/world3d`**, for the 3D world, **City v3**. The owner's laptop (HD 620, 8 GB) ran out of memory, so heavy verification and parallel agents continue in the cloud.

## Read first
- The spec is `docs/CITY-MASTER-BRIEF-v2.md` plus `docs/city-v3/DOC_*.md`. Also see `PRICES.md` (PROPOSED), `PLAYER-GUIDE.md` and `COPY-REVIEW.md`.
- The plan is `docs/superpowers/plans/2026-09-27-city-v3-finish.md`:
  - Task 1 (`?goto=` deep link) is committed in `69d11cef` and **not yet reviewed**.
  - Task 2 (fabric night glow) has **not started**.
  - After that comes the final whole-branch review.
- The host page is `public/SHADDAI-WORLD-3D.html` (`?map=v4`). The new modules are:
  - `world-clusters-v4.js` (grid fabric)
  - `world-city-v3.js`
  - `world-hud-v4.js`
  - `world-void-castle.js`
  - `world-goto.js`
  - `world-city-actions.js`
- Data lives in `public/assets/world/`: `canon-v4.glb`, `canon-colliders-v4.json`, `grid-fabric-v4.json`, `markers-v4.json`, `plots-v4.json`, `art-slots-v4.json` and `city-copy-v4.json`.

## Open work, in order
1. **Re-verify** by running every `tools/tests/*.test.cjs`. `world-city-actions.test.cjs` was never re-run locally.
2. **Wire the city actions** into the host after the HUD step. The snippet is in `docs/CITY-ACTIONS.md`.
3. **Review Task 1** (`world-goto.js` plus its host wiring), then **run Task 2** from the plan.
4. **First real look.** Run a headless browser pass over `SHADDAI-WORLD-3D.html?peek=1&map=v4`, then:
   - check for console errors and 404s;
   - check `window.__w3dDebug` for `gridFabricV4.stats()`, `cityV3.stats()`, `voidCastle.stats()` and `hudV4`;
   - measure frame cost with `?perf=1`;
   - take screenshots of the Commons plaza, the campus, the Perch, the race gate, the Culture Lane and the Void castle;
   - verify the Void castle shaders compile on a real GPU.
5. **Mid-distance LOD.** Lod1 on the fabric stays at about 12k tris per building no matter how far the simplifier is pushed. The planned fix is baked-facade block impostors (Blender, one building type at a time). **This needs the owner's OK.**
6. **Canon re-run.** `tools/blender/canon/city_v3.py` now contains the unstick step and the schema@2 marker fields. The next `build_canon.py step=7 export` has to reproduce the committed `markers-v4.json` (check with `node tools/city/unstick-markers.mjs --check` and `node tools/city/normalize-markers.mjs --check`).

## Owner decisions still pending
- The mid-LOD bake (above).
- SPARKS prices in `docs/city-v3/PRICES.md`.
- SHAD-Credits vs SPARKS for hiring and the Seat: the routes charge SHAD-Credits, while PRICES.md says SPARKS.
- Backend in the main repo (`backend/home-*`, `race-*`, tests 13/13 and 12/12): these files are **not committed and not mounted**. They should go on a branch, not straight onto `main`, because `main` auto-deploys to Render. Lap-time authority: `RACE_RESULTS_REQUIRE_SERVICE`.
- Backend gaps found by the actions agent (`docs/CITY-ACTIONS.md`):
  - signed-out users share one SPARKS balance;
  - academy routes are a USDC lab, not SPARKS classes;
  - stall purchase can charge the wrong account;
  - hire, the Seat and stall purchases can double-charge on retry.

## Hard rules (owner)
- NEVER delete anything without the owner's explicit OK.
- No `git stash`, `reset --hard` or `pull --rebase`. Never push `main` without a milestone OK.
- SPARKS is closed-loop: no cash-out, yield or vault anywhere.
- Designs must be futuristic tech-fusion only.
- **Never print or commit secrets.** An Anthropic API key was pasted in chat on 2026-09-27; the owner has been told to revoke it.
