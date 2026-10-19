# SHADDAI ASSET AUDIT & ORGANIZATION PLAN — 2026-10-17

**Numbers:** 958 GLB files, 3.8 GB total. Game references **97 files (111 MB)**. The other **861 files (3.7 GB)** are unused raw exports, old attempts, and duplicates.

## 1. GAME-USED (97 files, 111 MB) — KEEP ALL, don't touch

| Category | Files | Size | Used by |
|----------|-------|------|---------|
| Council agents | 7 + VILLAIN | 41 MB | world plaza agents, player hero |
| Animation library | agent-clips.glb | 2 MB | 75 retargeted clips |
| Realm kits | 8 buildings + 10 town | 4 MB | world-realm-kits.js |
| Realm stations | 8 | 4 MB | world-transit-kit.js |
| Race ships | 5 | 2 MB | world-hovercars.js |
| Race HQ | 1 | 0.5 MB | world-race-hq.js |
| Hoverboards | v01 + v02 | 2 MB | world-mounts.js |
| Naval/Water/Transit | 3 kits | 3 MB | boats, reef tube, maglev |
| Reef city | 27 | 1 MB | reef cities |
| Mounts | 4 | 4 MB | world-mounts.js |
| Bots | 2 | 2 MB | interior agents |
| VFX/misc | ~15 | ~10 MB | effects |
| Furniture kit | (in kits) | in kits | world-furniture.js |
| Terrain/props | ~15 | ~10 MB | various |

## 2. FAL-ASSETS (861 files, 3.7 GB) — THE BIG CLEANUP

### fal-assets/characters/ (401 files, 2.0 GB)
Every character exported 5-7 ways: -mesh, -rigged, -walking, -running, -action, -armature.

**KEEP (~50 files):**
- `_m6/{zerox,turtle,nexus,quill,shaddai}/*-rigged.glb` — council source rigs
- `pikadon/pikadon-rigged.glb` — PIKADON source
- `{zerox,turtle,quill,oracle}-council/*-rigged.glb` — council variants
- `oracle-c2/oracle-c2-rigged.glb` — alt oracle
- NPC types: `gabi`, `engineer`, `mage`, `scout`, `warrior`, `leadr` rigged
- Mounts: `mount-*` rigged variants
- Vehicles: `veh-*` rigged variants
- `shaddai-v2/shaddai-v2-rigged.glb`
- Voxel rigged versions (for LODs?)

**DELETE (~350 files, ~1.4 GB):**
- ALL `-mesh.glb` (redundant — the rigged has the same mesh)
- ALL `-walking.glb`, `-running.glb`, `-action.glb` (anims in shared library)
- ALL `*_armature.glb` (useless standalone bone data)
- ALL `_attempt-*/` folders (old failed batches)
- ALL `_old-public-agents-*/` (replaced)
- ALL `spike/` (debug artifacts)
- ALL `.fbx` files (GLBs exist)
- ALL `.txt` debug dumps

### fal-assets/production/ (71 files, 1.0 GB)

**KEEP:** `ship/*.glb` (29 compressed versions, ~5 MB total) + `models/veh-*` compressed

**DELETE:** `models/*.glb` originals (40-60 MB each, ~950 MB) + `agents/*-raw.glb`

### fal-assets/world/ (34 files, 414 MB)

**KEEP ALL** — these are unique source models (dragon, castle, transit, ocean, mounts, buildings)

### fal-assets/skate/ (7 files, 99 MB)

**KEEP ALL** — hoverboard design sources + skate park props

### fal-assets/creatures/ (1 file)

**KEEP** — `iodine-mesh.glb` (3 MB creature)

## 3. ACTION PLAN

### Phase 1: Safe deletions (~440 files, ~2.6 GB saved, zero risk)
- Delete all -mesh/-walking/-running/-action/-armature variants
- Delete _attempt-* and _old-* folders
- Delete production/models originals (keep ship/)
- Delete spike/ and .fbx and .txt debug files

### Phase 2: Move game-ready models into public/assets/
- Council rigged variants → `public/assets/council/`
- NPC types (gabi, engineer, mage, scout, warrior, leadr) → `public/assets/npcs/`
- Already-compressed vehicles → `public/assets/models/`

### Phase 3: Clean unused public/assets
- `public/assets/models/fal/` — raw copies (compressed in production/ship/)
- `public/assets/forge-models/` — old forge art (superseded)
- `public/assets/council/` — old council (superseded by agents/)

## 4. FOR THE OPUS SESSION (Blender rigging prep)

- **Player + council**: `_m6/*-rigged.glb` or `*council/*-rigged.glb`
- **NPC types**: gabi, engineer, mage, scout, warrior, leadr
- **Mounts**: already in `public/assets/mounts/`
- **Race ships**: in `public/assets/kits/shaddai_ship_*_v01.glb`
- **Hoverboards**: in `public/assets/kits/shaddai_hoverboards_v02.glb`
- **World landmarks**: `fal-assets/production/ship/*.glb`
- **Dragon**: `fal-assets/world/assets/volcano-dragon/volcano-dragon-mesh.glb`
- **Viewer**: `localhost:3014/public/__viewer.html` to inspect any model

## 5. RESULT AFTER CLEANUP

| Metric | Before | After |
|---------|--------|-------|
| Files | 958 | ~518 |
| Size | 3.8 GB | ~1.2 GB |
| Unused | 861 (3.7 GB) | ~421 kept as sources (1.1 GB) |
| Game-used | 97 (111 MB) | 97 (111 MB) |
