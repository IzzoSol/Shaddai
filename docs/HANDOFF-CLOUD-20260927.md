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

## UPDATE — end of session (2026-09-27, late)
**Done and committed:**
- City v3 plan (both tasks reviewed clean): the `?goto=` deep link (e2860b39) and fabric night glow (98ea4bef, host wiring c257bf3b).
- City action panels wired (a759997a). All 146 tests passed at the last full run.
- Dashboard (1859a1f0).
- Main characters plan: `docs/MAIN-CHARACTERS-PLAN.md` (3736e986). Estimated fal cost is about $5–11 for 6 agents.

**Backend:** branch `feat/city-backend` in worktree `C:\Users\Brittany\Shaddai-city-backend` (d6a2d3e9). It is NOT pushed. It mounts home and race, and hardens payments (auth-derived user, idempotency, bazaar identity bug fixed). Tests: 13, 12, 12 and 16, all green.

**Helpers still running at session end.** Check `git log`; if a helper's work isn't committed, re-run it from the prompt idea below:
- **Realm steps:** `tools/blender/canon/realms_v1.py` + build_canon step 8. Written only, not run. Next: run `blender -b ... build_canon.py -- <repo> step=8 norender`, one render at a time with `only=v8-<realm>`.
- **Dragons:** flight/attacks upgrade + `public/world-dragon-ride.js`. Host snippet: `docs/DRAGON-RIDE.md`.
- **Sky traffic:** voxel ships → `public/assets/vehicles/ships/*.glb` + `public/world-sky-traffic.js`. Host snippet: `docs/SKY-TRAFFIC.md`.
- **Final review:** `.superpowers/sdd/2026-09-27-city-v3-finish/final-review.md` (local only).

**Owner answers pending:**
- TURTLE reference
- ZEROX katana
- NEXUS full-body
- QUILL tpose file
- Prices
- SPARKS vs SHAD-Credits
- Mid-LOD bake OK
- The gamedev repo: owner wants it shared; the unlicensed-source parts get rewritten in our own words first

**Cleanup:** 51 files (403 MB) recycled in Downloads and 9 files (422 MB) in MODELS FOR FAL. They are in the Recycle Bin, not emptied. The SHADDAI API MCP returned 503 all day; OpenCode is fixing it on the beta site.
