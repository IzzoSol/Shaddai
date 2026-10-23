---
title: SHADDAI World Finish - Handoff 2026-10-24
date: 2026-10-24
area: shaddai/world
tags: [shaddai, shaddai/world, handoff, session-log, blender, agents, speed]
---

# SHADDAI World Finish - Handoff 2026-10-24

**Repo:** `C:\Users\Brittany\Shaddai-3d` (git worktree), branch **agents/1**, pushed to `github.com/IzzoSol/Shaddai` - last commit `c6c6f3ba`.
**Never push main** (Render auto-deploys it). Owner merges.
**Blender scene:** `Shaddai-3d/docs/blender/realm-scenes-20261022.blend`, scene **REALM_VIEW** (world) + **AGENTS_VIEW** (agents). Last save 17:12, `.blend1` = previous.
Drive Blender with `python tools/_bl.py <script.py>` (socket 9876). All mirror scripts: `Shaddai-3d/tools/blender/`.
**Disk C: ~300 MB free** - one Blender save at a time; do NOT delete backups without the owner's OK.
**Local test server:** `cd public && python -m http.server 3013` (drops requests under load - loaders now retry).

## Start here next session (owner order)
1. **Agents live check** - `node tools/_agents-probe.cjs` (Blender closed, server up). Last good run: all 7 agents load, 36 clips, attack1/heavy/combo/kick/block/roll fire, 0 page errors.
   Last run failed with `setPlayerCharacter is not a function` - main module syntax checked OK, most likely the server dropped files; re-run.
   Confirm: dragons `state=sleep` (lair fix `d20d7a7e`), roads / park / citadel / edge realms loaded (after-spawn 30 s fallback), skeleton camp present.
2. **Crystal Sea town redo** - owner: round wood deck is "not water based, ugly". Rebuild as **Aquaterra eco-islands**
   (ref `OneDrive/Pictures/LF2/1288980754db8ce52159783aa0a606b3.jpg`): hexagon green islands, glass domes, glowing blue canals, eco bridges, tower blocks,
   hero = giant ring-arc tower over a transit hub (`LF2/bae95567849cad9daa3007d282fe56f2.jpg`), underwater room sections (`LF2/96e64349944b10e49e58930edbc12cba.jpg`).
   Current pieces: `tools/k37_landmarks_arctic.py oceanplat()` + `public/world-edge-realms.js` (platform GLB) + `realm-towns-v2.json` town2-ocean.
3. **Building insides everywhere** (realm kits have `hook_interior_*`; landmarks + citadel registered via `__realmDressInteriors`).
4. **Blender terrain water** - city river is carved in-game (`world-terrain-v4.js carveRivers`); Blender terrain not yet (needs a backup save = disk).
5. **Grok/Muse bots rig** (static), NEXUS brighter silver, furniture futuristic trim.
6. **SPEED / FPS pass** (draw calls ~1600 vs budget 80; boot 143 scripts; pack remaining GLBs).

## Done this session (all on agents/1)
- **Agents:** PIKADON rebuilt as the red knight (portrait) on the shared 24-bone rig, all 23 clips (`tools/k42_pikadon.py`; old body `PIKADON_old_model.glb`). Roster checked: QUILL cloak, ORACLE purple, ZEROX black/blue, TURTLE green, PIKADON red, NEXUS (teal-grey, wants silver), SHADDAI green/gold.
  AGENTS_VIEW: moves row + hoverboard trick row (`tools/blender/agents_moves_boards.py`).
- **Dragons:** element colourways on the rigged GLB; sleep at realm lairs (Void dragon at the citadel gate); shard missions (`world-dragon-shards.js`, client-only, server must own before value).
- **Titans:** K41 rigged 40 m titan (idle/walk/slam), one per land realm, fightable (`tools/k41_titan.py`, `world-titans.js`).
- **Void:** huge Evil Citadel across the back (keep ~420 m + brain dome, fortress sections, curtain walls), goo pools/channels, torch causeway, throne/fort halls + dungeon interiors (`castle-hall`, `dungeon` recipes), secret dungeon train stop (unlocks when found), 6 skeleton guards (aggro 10 m).
- **Roads:** realm roads beside the rail spokes (no doubles), edge skirts, light posts, gates, lake/river bridges with rails; Skyline Spur rail; Blender ground = displayed triangulation.
- **Realm towns:** realm-heart towns (TURTLE patterns) + realm crowns; biome scatter (forests/desert/mountains) + Meadow tree maze.
- **City:** district landmarks (Anvil / Exchange Spire / Hearth) + per-district roof crowns (Blender + game).
- **Sky cluster** on one axis past the island edge; cloud bank +2.6 km; arctic peak city (walkable bridges, doors, lifts, skyway to the Arch, ice dock).
- **Hover-skate:** K40 park at PLAZA_SKATE (walls, drop tower + elevator, bowl, electric launch ramps, speed pads) + Neon Sakura arena by the Colosseum; Hover League field already matches.
- **Water:** reef cities + sea/lakes/rivers in Blender; city river 40 m + carved channel in game; waterway links; Crystal Sea platform + glass bridge to Reef B (to be redone, see 2).
- **Blender:** race tracks (Skyline Circuit + Dragon Gate), dragons at lairs, citadel/skeletons/park/arena/titans/agents all in REALM_VIEW / AGENTS_VIEW.
- **Speed:** new kit GLBs packed 7.0 -> 4.95 MB (unpacked copies in `Shaddai/fal-assets/backups/glb-prepack/`, used by the Blender scripts); loaders retry dropped fetches.

## Not in Blender yet (code-built in game)
Void Castle at the pit, Colosseum exterior/lobby, 7 council halls, Athenaeum exterior, Bazaar interior, station details, moving creatures.
Needs `node tools/_export-world-glb.cjs <R_M> "<group regex>"` with Blender closed (full-map export stalls - use a filter).

## Rules to keep
Branch only, owner approves visuals, one heavy job at a time (8 GB), headless browser only, no paid services without approval, ask before deleting,
futuristic only, NPCs are bots, back up before touching the owner's Blender scene, bump `?v=` on edited scripts, no `//` comments in one-line python edits of JS.
