# HANDOFF — OPUS WORLD-FINISH SESSION · 2026-10-20

**Mission:** finish the SHADDAI world. Place every keeper asset where it belongs, fix the ones marked FIX, verify in-game. The owner has audited 811 files and deleted 369 redundant variants — what's left is the curated set.

## READ THESE FILES FIRST (in this order)

1. **`public/__opus-placement-queue.json`** — THE worklist. Queues: `deployed` (151 — already in the game, don't touch), `keep` (74 — place these), `fix` (123 — repair first, see each entry's `note`), `unrated` (242 — lowest priority, place by tier). Every entry carries `path`, `realm`, `where` (the world placement), `tier`, `decision`, `rank`, `note`.
2. **`public/__asset-notes.json`** — the owner's full audit (ranks, decisions, notes per file). Entries keyed by path; `deleted:true` = already purged, never look for those files.
3. **`docs/ASSET-AUDIT-20261017.md`** — the placement map. §4 has every coordinate: realms, districts, plaza hexagon, reef, race, mounts, NPCs, set pieces.
4. **`docs/BLENDER-TOOLKIT.md`** + **`tools/blender_toolkit.py`** — import/export at game coordinates, model info, scale checks, hexagon placement.
5. **`docs/QUALITY_SCALING_PLAYBOOK.md`** + **`docs/PERF-LOAD.md`** — performance budgets.

## CURRENT STATE (2026-10-20)

- **590 live GLBs** (`public/__glb-scan.json` — includes tier, size, date, rigged, realm)
- **151 deployed** (97 referenced by code + 52 LOD meshes + 2 dynamic loads — protected, never delete)
- **74 keepers** not yet in world · **123 fix-pile** · **242 unrated**
- **97 non-deployed files already have a realm home** — start there; assign realms to the rest as you place
- Quality tiers: S=in-game · A=rigged ready · B=unique source · C=other · D/F purged
- Owner decisions: 122 keep · 165 fix · 369 deleted · 155 unrated

## TOOLS

- **Audit station / viewer:** `http://localhost:3014/public/__inspector.html` — start with `node tools/audit-server.mjs` (from repo root). The **By Realm** view is the placement queue; **Audit** view shows decisions; arrow keys walk files, N = next unrated.
- **Game:** `http://localhost:3013` (python http.server 3013) — `public/SHADDAI-WORLD-3D.html`
- **Regenerate the queue** after any changes: `node tools/build-opus-handoff.mjs`

## HARD RULES

1. **NO GIT** unless the owner explicitly says so. All work stays local.
2. **Scale contract:** `U = 7/1.8` world units per metre. Agents are 7 units tall (~1.8 m).
3. **Rigged models MUST be measured by bone-union** (`_safeBox` in the game, `shaddai_model_info` in Blender). Raw geometry bounds LIE on Meshy rigs (read 0.018 m instead of 1.75 m — this caused the giant-agent bug before).
4. **Never delete or move** anything in the `deployed` queue or any `-lod1/-lod2` mesh — the game loads LODs by constructed names.
5. Council agents stand at the plaza hexagon, r=260, 60° apart; SHADDAI is THE SOURCE at [0,0].
6. Export rules (NEXUS): GLB < 15 MB, metres, bone names match the shared animation library (`public/assets/anim/agent-clips.glb`, 75 clips).
7. Verify after each placement: agents-not-tpose test, walk the realm, FPS check.

## WORKFLOW PER FILE

1. Find it in the queue by `path` (or in the viewer's By Realm view)
2. Inspect: viewer for a quick look, or `shaddai_import_glb(path, game_x, game_z)` in Blender via MCP
3. If it's in the `fix` queue: repair per its `note` (rig / scale / material), re-export
4. Place at its `where` coordinate / realm (map in ASSET-AUDIT §4)
5. Update the notes file (`decision: place` → after placing, mark it done) and regenerate the queue
6. Sweep: once `keep` and `fix` queues are placed, walk every realm and finish dressing

## WHERE THINGS GO (quick reference — full map in ASSET-AUDIT §4)

- **The Grid (center):** race HQ [1737,-303], athenaeum [-512,709], colosseum, interiors, bots, mechs
- **10 realms on the maglev ring (r=2829):** grid, void, desert, volcano (dragon), forest, suburb, meadow, ocean (harbor), darkforest (castle siege), arctic — each has station + town + props
- **Reef cities A/B** (SW bays, glass tube to shore) · **Hoverskate park [-880,0]** · **Race circuits**
- **Mounts:** hawk→ocean, mammoth→arctic, bull→volcano, gorilla→darkforest
- **NPCs:** gabi→suburb/meadow, engineer→race HQ/forge, mage→athenaeum/void, scout→darkforest/desert, warrior→colosseum
- **Set pieces:** volcano-dragon→volcano, castle-siege→darkforest, iodine→void

## WHAT WAS DELETED (don't hunt for these)

369 redundant exports: all `-mesh/-walking/-running/-action/-armature` variants with keepers, old `_attempt-*` batches, plus 71 owner-marked files. Every one is logged in the notes with `deleted:true`. The game references none of them.
