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
