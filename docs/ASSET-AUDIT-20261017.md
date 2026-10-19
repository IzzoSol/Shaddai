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

## 4. ASSET PLACEMENT MAP — WHERE EVERYTHING GOES IN THE WORLD

### THE WORLD (Seed of Life geometry)
```
                 [ARCTIC] (N-NW)
              ·   ·   ·   ·
           [VOID]     [MEADOW]
            ·    THE GRID    ·
         [DARKFOREST]  [OCEAN/HARBOR]
              ·   ·   ·   ·
           [VOLCANO/FORGE]  [SUBURB]
                 [DESERT] (S-SW)
```
Center: SHADDAI (The Source) at [0,0]. 6 agents on a hexagon at r=260.
10 realm stations on the maglev ring. 4 districts on the diagonals at r~800m.

### A. THE GRID — CENTER CITY

| Asset | Where |
|-------|-------|
| 7 council agents | Plaza hexagon: center + 6 at r=260, 60° apart |
| shaddai_race_hq_v01.glb | [1737, -303] beside Dragon Gate |
| 5 race ships | Race HQ showroom + on the circuits |
| shaddai_hoverboards_v02.glb | Mount stores (10 board designs) |
| shaddai_colosseum_lobby_v01.glb | Colosseum entrance |
| shaddai_hover_league_v01.glb | Colosseum arena (Hover League mode) |
| shaddai_athenaeum_rotunda_v01.glb | Athenaeum district NW [-512, 709] |
| shaddai_furniture_kit_v01.glb | All building interiors |
| shaddai_bot_grok/muse_v01.glb | Shop counters, offices |
| shaddai_maglev_kit_v01.glb | Ring stations at r=2829m |
| shaddai_sign_kit_v01.glb | District signs throughout |
| shaddai_race_kit_v01.glb | Track dressing (gates, barriers) |
| Tower kits (spire/slab/setback) | 24 landmark towers from grid-city-v4.json |

### B. THE 4 DISTRICTS (diagonals, r ~800m)

| District | Direction | Uses |
|----------|-----------|------|
| ACADEMY | NW | Athenaeum rotunda, tech labs, library interiors |
| FORGE | SW | Workshops, upgrade stations, forge fires |
| TRADE | NE | Markets, shops, auction house |
| RESIDENTIAL | SE | Homes, gardens, parks |

### C. THE 10 REALM STATIONS (maglev ring, r ~2829m)

| Realm | Station GLB | Town GLB | Extra assets |
|-------|-------------|-----------|--------------|
| grid | station_grid_v01 | town_grid_v01 | — |
| void | station_void_v01 | town_void_v01 | rift gate |
| desert | station_desert_v01 | town_desert_v01 | desert_homes_v01, sand arches |
| volcano | station_volcano_v01 | town_volcano_v01 | ember vents, lava rocks, **VOLCANO DRAGON** |
| forest | station_forest_v01 | town_forest_v01 | forest_homes_v01, moss, mushrooms |
| suburb | station_suburb_v01 | town_suburb_v01 | — |
| meadow | station_meadow_v01 | town_meadow_v01 | rune arches, reed clumps |
| ocean | station_ocean_v01 | town_ocean_v01 | naval_v01, water_link_v01, coral |
| darkforest | station_darkforest_v01 | town_darkforest_v01 | dead trees, **CASTLE SIEGE** |
| arctic | station_arctic_v01 | town_arctic_v01 | ice formations |

Shared: shaddai_realm_props_v01.glb (universal props) + shaddai_transit_kit_v01.glb (gates).

### D. REEF CITIES (bays southwest)

27 reef GLBs (hub, atrium, harbor, station, sets, homes, shops, elevator, tube) distributed between Reef A and Reef B, connected by the glass tube train to the shore station.

### E. MOUNTS

| Mount | GLB | Where to get it |
|-------|-----|----------------|
| Sky Hawk | hawk.glb | Harbor realm (free) |
| Glacier Mammoth | mammoth.glb | Arctic realm |
| Forge Bull | bull.glb | Volcano forge, meadow |
| Canopy Gorilla | gorilla.glb | Darkforest, suburb |

### F. VEHICLES

| Vehicle | GLB | Where |
|---------|-----|-------|
| 5 race ships | shaddai_ship_*_v01.glb | Race HQ + circuits |
| 10 hoverboard designs | shaddai_hoverboards_v02.glb | Mount stores |
| Catamaran | veh-ocean-catamaran.glb | circling the reef |
| Superyacht | veh-ocean-superyacht.glb | docked near reef |
| Submarine | veh-ocean-submarine.glb | half-sunk near reef |
| Skiff | veh-skiff.glb | ocean realm |
| Mining powerarmor | vehicle-mining-powerarmor | volcano (fal source) |
| Monowheel mech | veh-monowheel-mech | city (fal source) |

### G. CHARACTERS — WHO GOES WHERE

| Character | Source | Game role |
|-----------|--------|-----------|
| SHADDAI | _m6/shaddai-rigged.glb | The Source at [0,0] |
| ZEROX | _m6/zerox-rigged.glb | Plaza agent |
| NEXUS | _m6/nexus-rigged.glb | Plaza agent |
| ORACLE | oracle-council-rigged.glb | Plaza agent |
| TURTLE | _m6/turtle-rigged.glb | Plaza agent |
| QUILL | _m6/quill-rigged.glb | Plaza agent |
| PIKADON | pikadon-rigged.glb | Plaza agent |
| VILLAIN | VILLAIN.glb | Antagonist |
| Gabi | gabi-rigged.glb | NPC: suburb/meadow towns |
| Engineer | engineer-rigged.glb | NPC: Race HQ mechanic, forge |
| Mage | mage-rigged.glb | NPC: Athenaeum, void realm |
| Scout | scout-rigged.glb | NPC: darkforest, desert camps |
| Warrior | warrior-rigged.glb | NPC: colosseum, arenas |
| Leadr | leadr-rigged.glb | NPC: district leader |
| Shaddai v2 | shaddai-v2-rigged.glb | Alt player character |

### H. SPECIAL / SET PIECES

| Asset | Where |
|-------|-------|
| volcano-dragon-mesh.glb | Volcano realm — the dragon |
| castle-siege-mesh.glb | Darkforest realm — castle |
| shaddai_hoverskate_kit_v01.glb | Hoverskate park at [-880, 0] |
| shaddai_park_dress_v01.glb | Park dressing at the plaza |
| shaddai_weapons_v01.glb | Weapon displays in shops |
| iodine-mesh.glb | Void realm creature |

## 5. FOR THE OPUS SESSION (Blender + rigging)

1. Load: `docs/blender/shaddai_world_20261015.blend`
2. The placement map above IS the world — every coordinate and realm assignment
3. Use the viewer (`localhost:3014/public/__viewer.html`) to inspect any GLB
4. For new buildings: fal-assets world/assets/*-mesh.glb → compress → place at the coordinates above
5. For new characters: fal-assets _m6/*-rigged.glb → retarget with agent-clips.glb
6. For rigging fixes: the shared animation library (75 clips) already works on all council rigs — verify with the agents-not-tpose test

## 6. RESULT AFTER CLEANUP

| Metric | Before | After |
|---------|--------|-------|
| Files | 958 | ~518 |
| Size | 3.8 GB | ~1.2 GB |
| Unused | 861 (3.7 GB) | ~421 kept as sources (1.1 GB) |
| Game-used | 97 (111 MB) | 97 (111 MB) |
