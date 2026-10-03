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
