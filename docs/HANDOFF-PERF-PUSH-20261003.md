# Performance Push Handoff — 2026-10-03

## Status: In Progress
**Goal:** Playable core gameplay (race, hover, colosseum) with 15% weekly API usage remaining.

## Completed Optimizations
✅ Disabled hazard + grass shader boot (early returns) — eliminates "not responsive" main-thread stalls  
✅ Disabled visitors refresh system — removes 20-second NPC update loop  
✅ Disabled ambient FX (floating orbs/motes) — reduces visual overhead  
✅ Disabled sky-traffic (40 moving ships on 12 lanes) — expensive object updates  
✅ Increased static batcher thresholds (2000→5000 unnamed tris, 60000→100000 named groups) — more aggressive draw-call reduction  
✅ Lowered merge candidate threshold (12→4 meshes) — catches more batching opportunities  
✅ Added 3-second loading delay before __loadPlayable — allows background systems to initialize in parallel  
✅ Re-enabled U key teleport (was waypoint-only) — works now  
✅ Replaced HF loading screen images with user's custom JPGs (s1-custom.jpg, s2-custom.jpg, s3-custom.jpg)  
✅ Disabled B key bike toggle temporarily (was triggering castle popups) — needs root-cause fix

## Still TODO — Code Level
- [ ] Re-check hazard physics — if critical to race track/colosseum, re-enable (currently disabled)
- [ ] Investigate B key / hoveboard / castle interaction glitch — appears to be in void-castle or realm-zones interaction system firing incorrectly
- [ ] Disable wildlife (wolf packs) — not critical to race/hover/colosseum
- [ ] Keep dragons ENABLED — they are boss gameplay (crossing gates)
- [ ] Shadow map optimization — reduce shadowMap resolution / tweak shadowBias
- [ ] Light count reduction — audit scene lights, disable non-critical ones
- [ ] Character animation loop disabling for NPCs (if any spawned)
- [ ] Race track enablement — ensure playable/accessible
- [ ] Hoverboard smoothness pass — lag elimination
- [ ] Colosseum fighting access check

## Blender Work (User Now Has Blender Open)
**Coordinate with user on mesh optimization:**
- Reduce building geometry complexity (LOD, merge details, simplify roofs)
- Optimize terrain materials
- Reduce vegetation poly counts
- Audit material complexity (normal maps, PBR) vs. visual necessity
- Export optimized GLBs back to `/assets/creatures/`, `/assets/world/`, etc.

**Tools available:**
- `tools/blender/map-top.py` — render top-down map for reference
- `tools/blender/bl.cjs` — CLI to run Python in open Blender instance
- Voxel exporter for costumes/mounts

## Current Game State
- **Map:** v4 World Scale (6.2 km atlas, city core unchanged, realms at r4500-10500)
- **Characters:** 6 heroes ready (GLB + CharacterLoader). Placeholder loader for v1 (capsules).
- **Loading Screen:** 3-second delay, custom JPG slides, CSS fade-cross animation (decoupled from main thread)
- **Hazards:** Disabled boot (re-enable if race track needs lava avoidance)
- **Grass:** Disabled boot (too expensive on load)
- **Wildlife:** Enabled loading but could disable if not critical
- **Dragons:** Keep enabled (boss crossings are gameplay)
- **Sky Traffic:** Disabled (40 ships = expensive)
- **Visitors:** Disabled (NPC refresh overhead)
- **Ambient FX:** Disabled (floating orbs)

## Next Session Steps
1. Decide: hazard physics re-enable? (check race track layout)
2. Disable wildlife if confirmed non-critical
3. Continue code optimizations (shadow maps, lights, animations)
4. Work with Blender on mesh LOD + material optimization
5. Test core paths: race track, hoverboard, colosseum
6. Commit optimizations in batches

## Git Status
- Branch: `feat/world3d`
- Recent commits: sky-traffic disable, grass+hazards boot disable
- No uncommitted changes (last commits pushed)

## Resources
- **Owner's skill:** `vgpu` — GPU profiling
- **Game plan:** docs/WORLD-COMPLETION-PLAN.md (in Shaddai-3d/docs/)
- **Gameplay checklist:** docs/GAMEPLAY-EXPANSION-20261002.md
- **World spec:** docs/superpowers/specs/2026-09-18-shaddai-world-character-system-design.md
- **Loading architecture:** Loading slides are CSS-driven, separate from main-thread mesh loading

## Blender Instance
User opened Blender instance — can now:
- Call `tools/blender/bl.cjs` to run Python scripts in live Blender
- Export optimized assets
- Check scene info with `get_scene_info()` MCP call
- Render top-down map reference with `map-top.py`

**Token saved:** ~50K by avoiding re-reading large files next session.

## Session 2 (Opus, 2026-10-03 evening) � done + verified headless
- ROOT CAUSE of freezes/crash: the "aggressive merge" commit (5K/100K tris, min 4) baked instances one by one -> RAM spike, boot crash. Reverted to 2K/60K/min 12.
- Train: boarding verified (E at Central -> 8-stop menu -> walkable ride, doors open). Train statics baked per material in world-transit.js (doors live).
- Interiors: far outdoor owners hidden on enter (Academy 2,164 -> 524 draw calls), restored on exit (`window.__setOutdoorHidden`).
- Wildlife `?wildlife=1`, unrigged citizens `?crowd=1` now opt-in.
- Academy/Athenaeum wired into the realm per ACADEMY-HANDOFF section 3 (door at CLASS_01 marker 3958.8,-3117.6; [E] stations). Tests 14/14 + 15/15; live probe: inside, 28 stations, 0 errors.
- Blender: map-top.py fixed (camera clip_end) -> top-down plan renders. Finding: 983 buildings scattered inside wedges, not aligned to streets = the "clutter".
- Outdoor still ~2,160 draw calls (budget <150): world-transit 284, terrain 190, hoverpark 169, ~1,770 in unnamed top-level Mesh/Group.
- Probes: tools/_train-probe.cjs, tools/_academy-probe.cjs.
## Next
1. Owner decision: re-plan city frontage (buildings in rows facing avenues) in grid-city-v4.json via Blender map-top review.
2. Name + instance the ~1,770 unnamed top-level meshes (biggest outdoor draw-call bucket).
3. Walk-in arcade, stairs/doors audit, mobile stall (last).

## Owner asks logged 2026-10-03 (not started)
- HF images: character LIKENESS loading slides (image-to-image from the in-game portraits, not text-only), Athenaeum interior paintings, billboards.
- Colosseum: finish the inside; lobby -> crowd stands route; arena floor via an ADMIN GATE with keypad code 4444 -> back area with animals, boats/water, terrain switches; bots can work back there and be hired.
- Later pass: colosseum metro connects to the maglev train station.
- Pending owner answer: re-plan city frontage (rows facing avenues).
- Houses (later): varied sizes, buy with Sparks, enter/own/customize, tracked in Navi.
- Logo: owner says a spinning star 'looks like Baphomet' -> make it SHADDAI; location unconfirmed (colosseum octahedron? void-castle sigil? interior floor sigil?).

## Owner asks logged 2026-10-03 night (queue, in owner's words where useful)
- FIX: player base model stands in T-POSE, animations not wired (screenshot: green twin-tail char riding a unicycle-like thing). Bike (B) must appear + work.
- FIX: elevator into buildings: real floor, clean collisions, can't walk off and float.
- FIX: walkway connections to buildings not clean; collisions wrong; perfect spacing everywhere.
- REMOVE: the environment/terrain switch button (snow etc.) - weather comes later.
- CLEAN: clutter under/around the 7 SHADDAI agent buildings; polish their exteriors + elevators; no stray buildings lying around.
- SMOOTH: loading screen -> character in game transition.
- PLACES: Athenaeum (built), TURTLE museum, ZEROX trading center, QUILL library, ORACLE observatory are built in 3D; they need entryways. Idea: door/teleport inside each of the 7 SHADDAI buildings to them, or floating buildings you fly to. If already a building in game, leave it.
- ARCADE: walk-up themed arcade machine per finished game (Dreamers Climb etc.), 1 Spark to play.
- STILL TO SEE/FINISH: fighting, dragon attacks, dynamic hoverboard riding, the skate park + race track (owner has never seen them).
- CARS: mechanics good; the bought car model is basic -> better model later.
- Owner screenshots to fix: Desktop/New folder/Screenshots/Screenshot 2026-07-19 055543.png, 060135.png, 060338.png.
- RULE: FPS must improve with every addition; nothing broken; verify visually.
- VEHICLE (later): arctic/terrain trike concept (owner image: white+orange armored 3-wheel bike with huge drum wheels) - better in snow/lava; build in code if cheap.
- FINAL VISION refs (owner, keep in view): Desktop/New folder/Downloads/f9fba5d189245ce9111cb6a9d6be4969.jpg, e18d8f344c3f5da76510262abfc83a53.jpg, e83d0128798fb022e629de42fb092a93.jpg
- NAVI + FORGE look refs (owner): Desktop/New folder/Downloads/image (40).jpg, image (13).jpg, image (28).jpg, image (36).jpg, image (37).jpg - use TURTLE + design skills for the polish pass.
- ITEMS to sell later (owner gear sheet): squad tactical computer, e-binoculars, cellular regenerator, psi helmet, zero-G backpack, long-range communicator, translation unit, respirator, bug, alarm sensor, holoprojector, cryostasis unit, hoverboard, geiger counter, dressing spray, medical scanner, tac-com relay, mechanoid, rappelling belt, gravbelt, holowall, military scanner, magboots, EMP, jetpack, rope. Quality bar: NOT basic three.js (the bought car was too basic).
- VISION moods (owner 2026-10-03): lava realm citadel city w/ lava rivers; neon K-street signage; neon skater; eco-island hex domes + canals; Mars hyperloop glass terminal (train station look); grass cliff road over a cloud sea.
- DONE 2026-10-03: environment switch button hidden; forge bodies' one-frame clip0 no longer used as idle (was the T-pose).
- RACE LAYOUT (owner drawing 2026-10-03): race course = big 4-petal loop (white lines) sweeping out over the 4 open wedges and back through the centre; HOVERSKATE PARK in the centre hub (blue). Keep current tracks if they look great - owner has never seen park/race.
- THURSDAY: building collisions (currently none on city buildings).
- VISUAL IDENTITY refs (owner): LF2/MODELS FOR FAL/7b8b90197acb8be9a59454cca2aa318f.jpg, generated-image (4).png, generated-image (18).png, generated-image (19).png, image_2ca59ee0-e96a-4ebb-98cc-e5eb83892733_0.png
- Owner also wants: fighting/attack rigging done well, health drops, terrain finished, academy + rooms interiors with walk-in items.
- LATER (not now): casino arcade near SHADDAI Royale with a Sparks burn mechanism + Sparks gamble; mascot ref = slot-machine mech (LF2/MODELS FOR FAL/4a08a35e3f1cd502d2e9ce35718d156e.jpg). Check gambling/legal before any real-value Sparks.
- FPS: CONTINUOUS - measure + improve with every change (not a last step).
- VERY LAST (before push): mobile controls (virtual joystick etc.) so owner can play-test on phone until Thursday.
- ELEVATOR refs: Downloads/7f365af6c53ee2f116d9520aa4a52bc6.jpg (chrome+glass capsule pods). TERRAIN refs: Downloads/17ce9c81fb80814180630987bf29387f.jpg (rippled dunes), 86dacbb396db32731c69578820885a7b.jpg (black rock + glowing lava cracks).
- HOVERSKATE refs (owner): Downloads/9FDB5BEF-0387-4706-94C5-7C4F754CC120.jpg, 306AEAA8-4CA0-4D9F-B67A-5FB906CA0CD7.jpg, 1856C3DE-4B7F-4B51-AB74-1EF00DD34EDA.jpg, D0F3FBAF-2757-4C3D-AADB-32E1199A52F3.jpg (+1 more coming)

## Next session (Thursday) FIRST: full game audit with Blender + TURTLE + game-dev repo - FPS polish, loading, every system; probes: _boot-smoke, _draw-profile, _unnamed-profile, _train-probe, _academy-probe, _rig-probe, _cam-shot. Session-2 done list: merge revert, train/stations 397->126, indoor hide 2164->524, park v2 (169->44) + spiral/drop tower, ramp launch + hangtime, glass elevator capsules + no-float wall, forge T-pose fix, Academy wired + posters, env button hidden, load wait 3s->0.35s.
