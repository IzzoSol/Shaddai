# OPUS FINAL AUDIT + UPGRADE: brief (hand this to Opus when the "ready" list below is green)

You are doing a one-time deep audit and upgrade pass on the SHADDAI 3D game (repo `C:\Users\Brittany\Shaddai-3d`, branch `feat/world3d`, deploys via `main`). Read first, in order: `docs/MASTER-PROMPT.md`, `docs/GAMEPLAY-EXPANSION-20261002.md` (the live checklist), `docs/QA-PROCESS.md`, `docs/RIG-AUDIT.md`, `docs/JOURNEY-LOG.md`, `docs/RACE-REFERENCES.md`, `docs/UNIFIED-BRAIN-DESIGN.md`.

## Rules (from the owner)
Quality over speed, no janky or half-built output, never delete files without asking, one heavy job at a time (laptop 8 GB; close Blender while the browser runs), screenshot-review every visual change with `node tools/_qa.cjs run|compare|bless`, add a node test for every rule, push `feat/world3d` + `main` (plumbing helper) + beta, log lessons in `docs/JOURNEY-LOG.md`. Everything the owner said is in the checklist; do not drop items. The race is original agentic hover-laser racing (not Mario Kart). Revenue streams must stay alive in every design (see MASTER-PROMPT).

## What to audit and upgrade (priority order)
1. **Cross-system regressions.** Stairs, realm hazards (strict wedge membership), passive/Void fight mode, riders seated in cars (rider tilt sign), hover-car slope tilt, race modes + difficulty + hit immunity, districts, footprints, loading slideshow. Read the diffs, run all tests, take the QA shots, compare against the baseline, fix anything worse.
2. **Collision and geometry.** `canon-colliders-v4.json` data is clean (6189 boxes, no deep overlaps); probe in-game for invisible walls and walk-through (collider vs visual mismatch) at each realm hub, building entrances, stairs, castle, Colosseum, bridges, and fix.
3. **Performance.** Profile draw calls, triangles, texture memory, GLB load sizes (7 council GLBs ~9 MB, lazy-load), three.js from CDN (self-host with a fallback), quality ladder, FPS in the city and on the race track. Budgets: 60 fps, < 80 draw calls where possible (see memory perf budgets). Keep the boot fast.
4. **Rigging and mechanics.** Use the owner's open Blender for small per-asset work: shared humanoid combat/dodge/hit/sit/mount clips, mount sockets (bull, gorilla, mammoth, hawk), dragons for Siege Day, boat/sub hulls, car pivots, castle doors. Verify with the loader tests and QA shots.
5. **Gameplay completion.** Colosseum lobby, vending, dynamic terrain, seating, spectating, modes; Navi controls and MODES toggles; NPCs, missions and quest chains; friend bots with gifts; fishing/farm/crafting loop; taming wired to the Academy; gear UI for masks and clothing; castle valley with skeleton homes and purple lava; Siege Day scaffold.
6. **Look.** Street and building organization by district role, signs, lighting day/dusk/night, terrain blending between realms, homes and villages per realm, atmosphere (fireflies, smoke, wolves, fires; real not overdone).
7. **Unified Brain** (main Shaddai repo, sparse copy at `C:\Users\Brittany\Shaddai-brain`, branch `feat/unified-brain`): provider chain fix (Groq model 404, HF routing), citations, then merge the 3D and Classic views into one scene with agent faces that open to tools/skills.
8. **Economy and legal safety.** Plots, Sparks, staking, rent accrual, NFT deeds: the owner has open decisions (see the V101.3 handoff). Do not decide; flag risks (securities/gambling/MLM) and propose options.

## Definition of done for the audit
All tests green; QA baseline blessed after Opus reviews every changed shot; no console errors on load; a short report in `docs/OPUS-AUDIT-REPORT.md` listing what changed, what was verified (how), what is still open, and the next 10 items.

## "Ready for Opus" checklist (owner/Sonnet tick these)
- [ ] All tests green (`for f in tools/tests/*.test.cjs`).
- [ ] QA run `r2` reviewed and a first baseline blessed (daylight shots).
- [ ] Collision probe tool exists (invisible-wall / walk-through checker) or the owner has a list of problem spots.
- [ ] Colosseum lobby + vending built to first version.
- [ ] Gear UI + crafting bench + material drops wired (taming/hazards usable).
- [ ] Castle valley + purple lava first pass, Siege Day scaffold.
- [ ] Friend bots with gifts, fishing first pass.
- [ ] Blender rigging session done for the shared humanoid clips and mounts (RIG-AUDIT updated).
- [ ] Unified Brain provider fix + citations done on `feat/unified-brain`.

## Parked references and ideas for Thursday (owner 2026-10-03, not enough usage now)
- `C:/Users/Brittany/OneDrive/Desktop/New folder/Downloads/three-geospatial-main` (MIT, monorepo for geospatial/atmosphere rendering in three.js) and `.../three-grass-demo-main` (grass demo; wrapper folder is "three-grass-demo-main shaddai"): study for sky/atmosphere, aerial perspective, clouds and better grass. **AR idea: see your bot in your room** (phone/WebXR view of your agent in your real space; ties to the mobile mode and later VR). Do after the core game audit; add license notes to `docs/CREDITS-THIRD-PARTY.md`.
- `.../Downloads/tidewater-main` (MIT): fishing + ocean demo. Its fish table and fight model are already adapted into `public/world-fishing.js`. Its WebGPU water/whale rendering needs a capable GPU, so port the ideas to three.js shaders later (see its docs/PORTING.md).
- Fishing still needs: rod + cast + bite + tension UI in the 3D world, fish stand (sell for Sparks), tackle shop, catch card and fish log, lure items feeding taming and friend-bot gifts, realm water types mapped to `rollBite` (coast / arctic / river / void).
- Loading slideshow art is generic role art made with Hugging Face FLUX; replace with the owner's reference-correct agent art when available.
- Performance done: three.js r180 + addons + Draco self-hosted (no unpkg), modulepreload hints, favicon. Still to measure on the owner's real GPU with `?perf=1`: boot-to-playable time and FPS in city / track / Colosseum. The agent GLBs are 31k-52k polys each (7 council + villain), so LODs are the next big FPS win. The headless QA browser is software-rendered, so its timings are not representative.
- Rig audit facts (Blender, 2026-10-03): all 7 council agents have 24-bone skeletons with standard names (Hips/Spine/Head/Arms/Legs/Hands/Feet) and only 3 clips (idle, run, walk). No combat, dodge, hit, sit or mount clips, and no ride sockets in the GLBs (sockets are procedural). Script: `tools/blender/audit-rigs.py` run through `tools/blender/bl.cjs` (Blender add-on socket on port 9876, works even when the Blender MCP server fails to connect).

## STATUS SNAPSHOT 2026-10-03 (end of the Sonnet 5.5 build stretch; read this first)
**Built, tested (all node tests green), pushed to feat/world3d + main + beta:**
race modes (race / time trial / free ride) + AI levels + hit immunity + agentic items (laser bolt, EMP, lock-on drone...) + drift/slipstream/track keeper; hoverboard idle sway + lights + trick flashes + Obsidian Gold board; seated riders in cars + glass cabins + hover-car slope tilt; interior stairs (walkable); Grid districts (Campus/Commons/Plots/Race) + named streets; realm hazards (castle gas, pit lava, arctic, volcano) + passive/fight mode + Void forced fight + Navi MODES tab; taming + crafting rules; Castle Siege Day rules (dormant until 50 players); food/drink buffs; footprints (snow/sand); textured grass clumps; fishing rules (realm fish, tension fight); loading slideshow + new intro motion + 7 agent slides; **perf**: self-hosted three.js + Draco, static batcher (-15% draw calls, ?batch=0 to disable), profilers; **phone controls**: touch action buttons (jump, interact, attack, kick, flip, run, ride, map, view, passive, tray) + existing stick/look; QA gate + boot/touch/draw-call smoke tools.

**Verified live (headless, software GL):** boots with 0 page errors; touch buttons build and fire real key events; batcher merged 641 meshes into 154 with no errors. **Not verified by eye:** most new visuals (grass clumps, footprints, buffs UI, MODES tab, new item look, seated rider in cars), and anything on a real GPU or a real phone. The first QA baseline was never blessed (the QA run hung; use tools/_qa.cjs again).

**Owner's latest asks to carry into the audit (nothing dropped):**
- **Streets organized, different home themes per realm/neighbourhood, furniture and insides, entry ways, sitting.** Plan: one `WorldHomeThemes` table (per realm/district: palette, wall/floor materials, furniture set, lighting mood, door style, sign style) consumed by `world-interiors-v3.js` (`style` + recipes) and the exterior builders; streets: use the district + avenue names already in `public/world-districts.js` and add street signs facing the walkway, consistent lamp/bench/planter rhythm per district, building slots by role (home / shop / office / arcade / hall) so rows don't repeat.
- **Complete rigging:** missing clips (death, directional hit reactions, swim, crouch walk, spell cast, fishing cast/reel, mount/dismount, emotes) and a Zombie set for skeleton enemies; dodge-roll with i-frames (the Roll clip exists; no on-foot dodge is bound); hit markers per ride type; mount sockets; dragons.
- **Colosseum**: lobby/vending dynamics (kiosks exist; food buffs now work), dynamic terrain, seating, spectating, modes, battles.
- **FPS (keep full quality, no lowering detail)**: next levers are instancing the ~556 loose scene meshes (need owner modules to stop toggling per-mesh visibility), batching world-transit statics (trains must stay separate), instancing repeated GLB props, distance culling of tiny props, lazy-loading the 7 council GLBs, texture atlasing, shadow budget, and measuring on the owner's real GPU with ?perf=1.
- **Mobile**: phone buttons done; still to do: look-sensitivity setting, a haptic/UI scale option, landscape layout check on a real phone, mobile quality default (LOW) and a "performance" toggle, PWA install, then WebXR/AR later.
- **Brain / dashboard** (main Shaddai repo, branch feat/unified-brain sparse copy at C:/Users/Brittany/Shaddai-brain): provider fix + citations + merge the two brain views + opening faces; dashboard visual audit items.
- **Revenue streams** and the books/courses angle: keep docs/JOURNEY-LOG.md current.

**Machine notes:** 8 GB laptop; keep Blender and the headless browser from running at once; the Blender add-on socket (port 9876) works via tools/blender/bl.cjs even when the Blender MCP server does not connect; never delete without asking.

## HOME THEME COVERAGE BY REALM (measured from code 2026-10-03; owner: "different home themes, streets organized")
Existing: `public/world-realm-homes.js` (instanced, 5 types, all enterable + furnished through world-interiors-v3 recipes: bed = respawn rest point, stash, wardrobe, mail, arcade cabinets, trade counter, workbench, hydration, comms) and `world-interiors-v3.js` sand houses 01-04 (desert), farm tower, HUB_HOME units (Grid).
| Realm | Home themes today | Gap / next |
|---|---|---|
| Meadow | earth-burrow, cave-home | ok; add a village street layout (rh.village exists) |
| Forest | leaf-tree-home, pod-home | ok |
| Arctic | arctic-dome | add an ice-lodge / snowboard hut (snowboarding perk) |
| Desert | sand houses 01-04 (stepped block, courtyard...) | ok; roof access for the stepped block (stairs now walkable; landing + roof still open) |
| Suburb | mushroom-pods model exists | wire as an enterable theme + street rows |
| Volcano / Forge | **forge-home (built 2026-10-03: obsidian lodge, lava seams, anvil, chimney; village at the forge station)** | add more variety: forge halls, smelter towers; lava-forge homes (obsidian + glowing seams, forge bench; "forging with lava is cheaper" perk) |
| Ocean / Harbor | none | stilt homes + houseboats; fishing dock (fishing rules exist) |
| Darkforest / Castle | none | skeleton-valley homes under the bridge near the purple lava; guild halls for clans / Siege Day |
| Void | none | crystal / floating homes (forced-fight area: safe rooms need rules) |
| Grid (city) | HUB_HOME units, apartments | district-themed interiors by building role (WorldDistricts.roleFor) |
Streets: use `WorldDistricts` avenue/ring names; add per-district street furniture rhythm (lamps, benches, planters, signs facing the walkway) and a village street generator for realm homes so rows never repeat identically. All of it must stay instanced/batched (see FPS levers above).
