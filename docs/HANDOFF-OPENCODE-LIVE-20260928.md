# HANDOFF for OpenCode: push SHADDAI 3D live on Render, no lag (2026-09-28)

**Repo:** `C:\Users\Brittany\Shaddai-3d` (worktree of IzzoSol/Shaddai), branch `feat/world3d`, pushed at commit 37af4402. 73+ commits ahead of `origin/main`, 0 behind (as of last fetch).
**Owner:** new to code, wants it FAST and playable, low on usage. Work lean. Laptop = Intel HD 620 / 8 GB: ONE heavy job at a time, no Blender, no visible browser.
**Rules:** never delete (move aside); no fal spend; run node tests with `< /dev/null`; commit files by explicit path (many unrelated dirty files in tree: leave them). Commit trailer: `Co-Authored-By: <model>`.

## Deploy facts
- `main` = production Render (auto-deploy). Landing page -> "3D world" button -> gate code **4444** -> `SHADDAI-WORLD-3D.html`.
- Beta service `shaddai-beta`: owner sets Render Branch to `feat/world3d` (URL `https://shaddai-beta.onrender.com/SHADDAI-WORLD-3D.html?map=v4`).
- To go live: owner must OK it, then merge `origin/main` into `feat/world3d`, run tests, `git push origin feat/world3d:main`. Confirm the gate 4444 flow still reaches the world after deploy.

## What is in the branch (verified)
Light loader + progressive startup (docs/PERF-LOAD.md), Interiors v3 (3,349 enterable), 7 Meshy-v6 rigged agents never in T-pose (test exists), Colosseum GLB kit layer (lazy Meshopt/Draco, instanced kiosks/VIP, agents as vendors/ushers, code fallbacks), Shaddai city v3 + canon + grid fabric + train + Colosseum exterior all build (headless, no page errors), shadow pass OFF by default (`?shadows` re-enables).

## NOT verified / not done
- Dragons, wildlife, void castle did not appear within 40 s in a slow software-rendered run (they load last, after landing). Verify by flying around.
- Train animation never watched running.
- Not wired: weapons (7), hoverboards/riders (check RIDERS.md), animation-library heap test `update() allocates nothing` (public/world-anim.js, do not loosen test).
- Unfinished economy WIP saved as `docs/wip/colosseum-economy-wip.patch` (NOT applied; files still modified in tree: public/sparks-ledger.js, server/*). Finish + test before merging any of it.
- Colosseum stages 7+ (floor swap, understage, agent floor, server arena routes); realm cities; agent phone.

## LAG: measured numbers (headless, world entered, all modules on)
Per frame at spawn: ~5.9M triangles, ~2,221 draw calls, **53 lights**, ~18,500 meshes (11,175 visible), 138 shader programs, 3,579 transparent. (Before shadows off: 7.8M tris, 2,525 calls.) Quality governor exists (`_Q` tiers POTATO..ULTRA, starts LOW pr 0.75) but its `cullR` only culls agent sprites (host ~line 5139), NOT world geometry.

## Next fixes, in order of expected FPS gain
1. **Triangles (5.9M is far too high for HD 620; target <1.5M):** find the top contributors (traverse scene, sum triangles per named group/top-level module; canon, grid-fabric, clusters, fill, terrain, buildings). Add distance LOD / cull by `camera.position` distance for far groups; lower far plane at LOW/POTATO; merge or instance repeats.
2. **Lights (53):** every PointLight counts in every material's shader. Colosseum torches are created at intensity 0 but still counted (world-colosseum.js ~424); interiors/landmarks/buildings add more. Keep a fixed small set; set `visible=false` on lights of rooms/arena not being entered (change only at room entry to avoid recompile hitches); never toggle per-frame.
3. **Transparent overdraw (3,579):** auras/crowns/particles/glass; hide at LOW (POTATO already hides auras).
4. Verify with `tools`-style headless probe: static server + puppeteer with Chrome `C:/Program Files/Google/Chrome/Application/chrome.exe`, args `--no-sandbox --use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader`, URL `?map=v4&nodefer`, wait ~70 s, then read `renderer.info` (`window.__w3dDebug.renderer`). Software render time is meaningless; use calls/tris/lights/programs. Real check: owner opens beta, F12 console: `__quality`, `__loadSummary`.

## Paste this into OpenCode
> Continue SHADDAI 3D at C:\Users\Brittany\Shaddai-3d (branch feat/world3d). Read docs/HANDOFF-OPENCODE-LIVE-20260928.md. Goal: get it live on Render (landing page -> 3D world, gate 4444) with no lag. Do the LAG fixes in order (triangles, lights, transparency), verify with the headless probe numbers, commit + push feat/world3d, and ask the owner before merging/pushing to main. Work lean.
