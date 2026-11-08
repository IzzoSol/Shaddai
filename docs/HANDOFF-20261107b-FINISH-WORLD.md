# HANDOFF — FINISH the Shaddai World: agent meshes + FPS/load first (2026-11-07)

Open a Claude Code terminal and say: **"read docs/HANDOFF-20261107b-FINISH-WORLD.md on origin/polish/world-finish-p2 and finish the world"**.

## Owner priorities, in this order (owner's words: "fps speed and the agent meshes are the most important thing")
1. **Agents must never look spiky/torn.** The owner still sees it on the live site (2026-11-07). Top priority.
2. **Lag and load:** the live world took about 5 minutes and froze on the owner's laptop.
3. Only if usage remains: the hoverboard works (unverified), the Navi parallax swivel goes (owner doesn't like it, so make it off by default), and no emoji anywhere in the world UI (line icons only, no "basic or Claude emojis").

## Git + machine
- Live = `main` on Render (https://shaddai-g81x.onrender.com). **Never push or merge `main` without the owner saying so.**
- Ready to merge, owner approval pending (both merge cleanly onto `main` 5582da28):
  - `origin/polish/world-finish-p2`: Navi styles, hoverboard hand-chain fix, world side of the dashboard link, corner tray, capture tools.
  - `origin/feat/bot-forge-link-v2`: bot/Forge regression repair rebased on main; all academy/bridge/world-agents/forge tests pass.
  Start your branch from `origin/polish/world-finish-p2` (e.g. `feat/world-finish-final`) so you test what will ship.
- `C:\Users\Brittany\Shaddai-3d` is shared (on `feat/sap-treasury`): never switch branches there. Use a worktree; the disk is nearly full, so make it
  sparse (see `docs/HANDOFF-20261107-REALM-TUTORIAL-VIDEO.md` for the exact commands, incl. `export MSYS_NO_PATHCONV=1`), and junction
  `node_modules`, `backend/node_modules`, `tools/ual/node_modules` and `public/assets` from Shaddai-3d.
- 8 GB laptop: one heavy job at a time, headless only. A world boot needs about 1.5 GB free. Spawn under SwiftShader takes about 20–25 min; avoid it.
  Claude Code reaps background jobs when RAM gets low; if that happens, don't loop, tell the owner.
- Tests touching the world: `node tools/tests/<name>.test.cjs` (world-rider-chain, world-riders, world-hoverboard*, world-navi-*, world-dashboard-link).
  After editing any boot script: bump its `?v=` and run `node tools/build-dist.cjs` then `--check`; commit the new `public/dist/boot-*` and drop the old.

## 1. Agent meshes (spikes): what is known
- **Agent GLBs are fine and identical everywhere**: `public/assets/agents/{SHADDAI,ZEROX,ORACLE,NEXUS,TURTLE,QUILL,PIKADON}.glb`, the same bytes locally, on
  `main` and live (checked with content-length).
- **Standalone** (three + world-actions + world-hoverboard + each GLB + its own baked clips): all 8 render clean standing, idle, walk, run and riding.
- **Live world, headless, right after `__loadPlayable` (+45 s):** 4 council bodies near spawn photographed clean (≈7 u tall). One run also found **skinned
  objects measuring 78, 271, 297 and 447 units**: either dragons (expected, big) or **exploded agent skins** (the spike look). Not identified yet. Do this
  first:
  ```js
  // in page.evaluate after __loadPlayable: list every skinned root, its size, its bones, missing bones
  const D=__w3dDebug,T=D.THREE,roots=new Set(); D.scene.traverse(o=>{ if(o.isSkinnedMesh){ let r=o; while(r.parent&&r.parent!==D.scene) r=r.parent; roots.add(r);} });
  [...roots].map(r=>{ const b=new T.Box3().setFromObject(r,true).getSize(new T.Vector3()); const s=[]; r.traverse(o=>{ if(o.isSkinnedMesh) s.push(o.name+':'+o.skeleton.bones.length+(o.skeleton.bones.some(x=>!x)?':MISSING':'')); }); return [r.name, b.toArray().map(Math.round), s.join(',')]; })
  ```
  Then photograph each one alone (hide the other scene children, own camera, `renderer.domElement.toDataURL('image/jpeg')`, **one object per
  `page.evaluate`**: rendering them all in one call crashed the tab). Working script: the scratchpad `agents.cjs` pattern, re-created in `tools/_agent-shots.cjs`.
- **Code paths an agent body goes through** (`public/world-main.js`):
  - Load: `agentBodyLoader` → `cloneSkinned()` (line ~21: SkeletonUtils name re-link, falls back to a position re-link; logs `[cloneSkinned]`).
  - Clips: GLB baked set (`entry._bakedSet`) else `_fillAgentClipsFromLibrary` → `window.buildAgentAnimator` (`world-anim.js`) retargets the shared
    75-clip library onto the rig. The tracker notes this retarget **bends wrists about 90° and splays arms on Forge operatives and bots LANKY/SCRAP**.
  - Player only: `attachUAL` (`ual-retarget.js`) plus a procedural bone overlay (`_applyPlayerProceduralBones`) for non-rigged bodies; riding adds `WorldRiderPose` (`world-actions.js`).
  - Materials: `setPlayerCharacter` sets textured bodies to emissive ×3 / color ×3 (bodies look washed white). Separate bug, owner-visible.
  - Known console error class: `matrixWorld of undefined` (SkinnedMesh with a missing bone → three skins those vertices at the origin = **spikes**).
    `cloneSkinned` guards the player and agents; check **every other** skinned path: `world-riders.js` (cloneSkinned passed in), `world-bots.js`
    (`ctx.clone || src.clone(true)`: plain clone if no ctx.clone), `world-interior-agents.js` (`src.clone(true)` plain), `world-townsfolk.js`, the agent-lib retarget.
- **Likely fixes to try, measured before/after:** (a) route every skinned clone through `cloneSkinned`; (b) for bodies with a baked set, never run the
  library retarget; (c) if a body still spikes, drop the offending clip (fall back to the baked one) rather than ship it; (d) set
  `frustumCulled=false` only where needed.
- **Proof:** the real GPU look matters (the owner sees it on a laptop GPU, SwiftShader may not). Ask the owner for a screenshot of which agent spikes
  and when (standing, walking, fighting?), then fix and get the owner to confirm on the live site after deploy.

## 2. Lag and load: measured on the live site (headless, 2026-11-07)
- Time to playable **≈ 78–120 s headless**, about 5 min on the owner's laptop with freezing. 237 requests, **35 MB** transferred; biggest is
  `/assets/terrain/height16.bin` 4.2 MB.
- `[BENCH] world-terrain-v4 ready in 15,671 ms` (2048², 190 patches, 437,760 tris) and `[map-v4] water ... build 20,626 ms`: **about 36 s of
  main-thread build**, which is the freeze. Move terrain decode/patch build and water build into a Worker or split them across frames (time-sliced),
  and show the world before the water finishes.
- **Draw calls:** about 1,365–1,650 per frame everywhere (budget < 80), about 4.3 M tris, far plane 4 km (`tools/_perf-breakdown.cjs`). Top: unnamed
  Mesh/Group about 590 in view, static-merge 160, world-fill 70. Plan (needs the owner's OK before big changes; small safe ones are fine):
  merge static meshes per material, `InstancedMesh` for repeated props, view-distance tiers (hide beyond 600–1,200 m by category), cut the far plane.
  Report before/after numbers (draw calls, tris, load s, FPS) per change.
- The headless world also logs `/api/markets/ohlc?symbol=btc` → 502 (dashboard API; harmless to the world but noisy).
- `/api/school/progress` doesn't exist on main → the Navi Academy rings say "offline" (fine, no crash).

## 3. If usage remains
- **Hoverboard:** in headless, `O` does nothing inside the Source Temple (intended), and a scripted `__hover.mount(__w3dDebug.playerAvatar)` after
  `__interiorsExit()` still left `isRiding()` false, so find why (vehicle guards in `world-main.js` around the `KeyO` handler, `__vehicleActionAt`, the board build).
- **Navi parallax:** `public/world-navi.js` `root.addEventListener('mousemove', ...)` sets `--nvSw/--nvTilt`. Make it **off by default** with a
  Settings toggle (keep the HOLO ARC look static).
- **No emoji:** `world-navi.js` MODULES `ic:` fields and several row titles (🏁, ＋, ✦, ⚡ in `world-actions.js` HUD) → use the existing line icons (`IC`).
- The Sparks chip in `world-actions.js` uses ⚡: swap it for an icon.

## Report at the end
Summary · files · commands · before/after (load s, draw calls, FPS, spike check per agent) · tests · risks · what's left. Ask the owner before merging to `main`.
