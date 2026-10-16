# HANDOFF 2026-10-16 — SHADDAI World (for the next model, e.g. Muse 1.3)

Read first: `CLAUDE.md` (repo rules), `docs/MASTER-TRACKER.md` (owner order + status), then this file.
FPS/front-end/backend plan from the other terminal: `docs/HANDOFF-FPS-FRONTEND-BACKEND-20261016.md`.

## 0. State of git (check before anything)
- Shared checkout `C:\Users\Brittany\Shaddai-3d` is on branch **agents/1** (the agents terminal switched it). All world work since
  2026-10-15 is there, linear; `feat/world3d` is an ancestor. Owner still has to pick: (a) keep agents/1 as shared, or (b) fast-forward
  feat/world3d and give agents its own worktree.
- A push to `main` was started 2026-10-16 (owner OK): branch slices to `origin/feat/world3d`, then `HEAD:main`. Verify:
  `git fetch origin && git rev-list --count origin/main..HEAD` (0 = pushed). If not: GitHub 500s on big packs -> push
  `--first-parent` slices of ~8 commits to feat/world3d first, then main (see MASTER-TRACKER notes). Close Blender first (8 GB RAM).
- Never push to main without the owner's OK. `*.glb` is gitignored -> `git add -f`. Bump `?v=` on every edited script tag in
  `public/SHADDAI-WORLD-3D.html`. Disk C: is nearly full (0.4-4 GB) — don't create worktrees; don't hunt/delete files (owner rule).

## 1. How to test locally
- Static: `cd public && python -m http.server 3013` -> http://localhost:3013/SHADDAI-WORLD-3D.html (v4 world is the default).
  Full app: `node backend/server-production.js` -> /world. Headless browser is allowed (never visible); repo has probes: `tools/_boot-smoke.cjs`,
  `tools/_cam-shot.cjs`, `tools/_fps.cjs`, `tools/_load-audit.cjs`, `tools/_drawcall-audit.cjs`.
- Node tests (all should pass): `tools/tests/*.test.*`, `tools/ual/*.test.mjs`, `tests/colosseum/arena.test.mjs` (17/17).
  Known stale: `tools/tests/agents-not-tpose.test.cjs` 7 fail (checks baked GLB idles; the shared animator half passes) — owner decision.
- Every change below has a URL switch to turn it OFF if it misbehaves in the browser.

## 2. What went in 2026-10-15/16 (NONE of it has been looked at in a real browser yet)
| Area | What | Off switch | Tests |
|---|---|---|---|
| Layout | world-layout.js defaults to v4 like the host (was v4 terrain + v3 positions: stations ~2.5 km off, Colosseum in the city) | `?map=v3` | dragon-elements |
| City | ~2400 ghost colliders removed (canon solids of thinned fabric lots) | `?ghostwalls=1` | clusters-fabric 11 |
| City | fabric halved (keep 0.15; 311 buildings), Atlas sign stripped from storefront/office, 24 K1 towers (sc-tower-*, Blender LODs) | `?fullcity=1` | clusters-fabric |
| City | 208 garden lots -> for-sale plots PLOT-CITY-0001.. in plots-v4.json (beacons; NO server buy flow; NFT = legal review) | — | city-v3 |
| Park | fabric + CULTURE_LANE kiosks cleared from the hoverskate park | `?parkclear=0` | clusters-fabric |
| Colosseum | entrance/lobby faces outward; K13 Blender lobby; MODES black-screen fix (fade always lifts) | `?colface=city` `?lobbykit=0` | arena 17, landmark-kits |
| Hover League | Colosseum field mode (I > Fight): hold/shoot/drop, goals, boost, power-ups, paint mode, 6 balls, rigged agent bots | `?hl=0` | hoverleague-core 15, hoverleague-view 11 |
| Riders | full board move set (pop/land/boost tuck/wall hand/bail + carry/shoot/bolt/ram/stun) | — | hoverboard-rider-moves 13 |
| Boards | hoverboards v02 (turbine pods, kicked armour, fins) | `?boardglb=0` | hoverboard-glb 11 |
| Athenaeum | K15 Blender rotunda replaces the code rotunda shell + balconies | `?athkit=0` | landmark-kits, athenaeum 14 |
| Train | Colosseum metro = K9 hall; reef line = K9 glass tubes + K9b shore portal (**reef only loads with `?reef=1`**) | `?metrokit=0` `?glasstube=0` | transit-kit-glb |
| Homes | K21 forest pods (suburb + harbor), K18 desert village (desert station), enterable | `?homekits=0` | realm-homes-glb |
| Bots | K14 Grok/Muse bodies on PORTER/CLERK; fix: GLB bot bodies had no parts (threw) | — | bots-k14, world-bots 9 |
| Race | NEON style (deck/kerbs/sponsor walls/rails), K6b boost pad placed on every pad | `?racestyle=gold` `?racekit=0` | race-track 25, race-kit 6 |

## 3. NOT done / known gaps (owner asked "did we add everything?" — this is the honest list)
1. **K11 hoverskate kit** (banks/kicker/magnet rail/stairs) was built for the OLD park v1 and is not wired; live park is v2 (bowl, U-pipes,
   rail yard, kickers, drop tower). Needs a design call: re-author K11 to v2 dimensions, or leave the v2 code + K25 dressing.
2. **K2 district signs** not placed (needs facades — do it in the browser pass). **Agent gear** (K16 accessories + K17 weapons,
   `world-agent-gear.js`) is not loaded by any page — agents phase (owner: agents last).
3. **Reef City** + the upgraded glass-tube line are off by default (`?reef=1`). Decide in the FPS pass whether to turn it on.
4. **Two race circuits:** the game runs **Dragon Gate**; **Meridian-8** (figure-8 through the city) only with `?tracks=meridian-8`
   (the Blender world shows both). Owner to pick a main circuit. Jump ramps (K6b `race_jump_ramp`) not placed: needs ramp physics on the deck.
5. **SW plot district** (~1275 plots, the big grid of dark lots with posts) — owner wants ~half hidden. Plots render from plots-v4.json in
   world-city-v3.js (beacons) and the canon ground; filter half by a stable hash like the fabric (keep the PLOT-CITY ones).
6. Combat core (`world-combat-core.js`, 35 tests) still unwired; ORACLE/PIKADON/VILLAIN re-rig needs owner OK (~$0.80 each).

## 4. FPS (next job) — can a smaller model do it? Yes, IF it follows this order
1. **Measure only first** (no fixes): headless `tools/_fps.cjs` + `tools/_drawcall-audit.cjs` at fixed camera spots (spawn, Grid centre,
   park, race start, Colosseum lobby, a realm town). Record fps / draw calls / triangles / load time in a table.
2. Known heavy hitters to look at, biggest first: canon `ACADEMY_HALL` mesh **396k triangles**; terrain ~190 draws (tile merge);
   park dressing ~41 draws (BatchedMesh per material); 24 K1 towers 11-16k tris each (LOD1/LOD2 exist); Hover League energy-ball
   shaders (only in a match); city-v3 plot beacons (1483 instances).
3. One change per commit, each behind a flag, re-measure after each; if a number gets worse, revert. Run the node suites listed above.
4. Never: delete files, replace renderer/scene/camera, change art direction, spend on fal/Meshy, push without the owner.

## 5. Blender
`docs/blender/shaddai_world_20261015.blend` mirrors the game (00_WORLD visible; 10_KIT_LIBRARY + 20_STUDIO hidden; old 318-plan city hidden).
Export tools: `tools/ual/race-kit-export.mjs`, `tools/ual/scene-export.mjs`. Drive Blender via its socket (127.0.0.1:9876); keep queries
light (a per-polygon scan of the city crashed Blender for memory). Kit generators live in `C:\Users\Brittany\Shaddai\public\assets\kits\_src`.

## 6. Owner reference images to compare against (2026-10-16)
`OneDrive\Desktop\New folder\Downloads\image (57).jpg`-`(60)` = Hover League concepts (energy ball + goal, colosseum crowd/banners, concept map, mayhem team fight).
`image (61)`-`(65)` = sent last, NOT yet reviewed. Owner asked "didn't we upgrade to this?" -> what is built: the Hover League FIELD mode (rim, goals,
pads, dais, energy balls, bots) inside the existing Colosseum; the hoverskate PARK was kept as the skate park (owner 2026-10-15). The concept-art
level (stadium crowds, banners, holo goal frames, neon floor art) is NOT matched yet -> next model: open these images, list the gaps, upgrade.
