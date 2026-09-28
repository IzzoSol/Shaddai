# REALMS v1 — canon STEP 8 (`tools/blender/canon/realms_v1.py`)

`exec()`'d by `build_canon.py` at `STEP >= 8`, same pattern as `city_v3.py` at `STEP >= 7`. Builds the 6
pending frontier realms from the owner's canon order (7 Sand, 8 Darkforest, 9 Crystal, 10 Arctic,
11 Colosseum, 12 dragon lairs), each in its own function and its own collection. Steps 0-7 are
byte-identical to before this change — every edit to `build_canon.py` is gated `if STEP >= 8`.

All positions come from `tools/blender/canon/world-layout.json` (`LAY['stations']`, bearings) — no
eyeballing. Everything is seated on real terrain via `H(x, y)` (or `WL`, the water level, for the
Crystal Sea harbour). Nothing is placed inside the Grid (`r <= GRID_R + 30` = 1630 m) or on the gold
ring deck (`RING_R = 2829 m`, kept clear of the ±40 m band — the closest new geometry is the Sand
walkway, which starts at `RING_R + 45 m`).

Tri counts below are hand-estimated from primitive call counts (`box` = 12 tris; `cyl(seg)` ≈
`2*seg` sides + `seg-2` per capped end; `ribbon` ≈ `2*(n-1)` tris), not a Blender-measured count
(Blender was never launched for this work). All realms are far under the ~150k-tri/realm budget.

## 30_SAND — Desert Terminal print-works habitat cluster

- **Where:** bearing 31.0° (Desert Terminal station), ring `RING_R + 160..420 m` (2989-3249 m),
  within the `desert` sector (14°-45°) from `realm-clusters-v4.json`.
- **What:** 7 "3D-printed sand-glass" habitat pods — each a 5-ring tapered print stack
  (`r-sand-frame` / `r-sandglass` alternating bands) capped by a glass dome that tapers to a point,
  plus an emissive print-seam collar (`r-sand-glow`). A walkway (`RING_R+45` to `RING_R+260`)
  connects toward the station. A gantry arm (tech signature) spans the two nearest pods.
- **Function:** `build_sand()`. **Est. tris:** ~4,050 (7 pods × ~530 + walkway ~320 + gantry 12).
- **Colliders:** 7 circle (`sand-habitat-base`, not walkable — solid pod bases).
- **Doesn't duplicate:** the existing procedural `desert-domes` cluster (`world-clusters-v4.js`) is
  smaller background clutter; this is one hero landmark cluster near the station.

## 31_DARKFOREST — Darkvault gothic bio-tech hex pads

- **Where:** bearing 299.1° (Darkvault Station), `RING_R + 150..620 m`, within the `darkforest`
  sector (262°-318°). The one realm that stays gothic, per owner rule — but gothic **bio-tech**
  (organic stalks + emissive vein trim), not medieval.
- **What:** 8 hexagonal pads on flared bio-mechanical stalks (hex cross-section via `cyl(seg=6)`),
  each rimmed in emissive bio-veins with 3 thorn spires; nearest-neighbour plank bridges (with thin
  glowing rails) chain the pads together; ~140 dark gothic pines scattered through the arc.
- **Function:** `build_darkforest()`. **Est. tris:** ~8,030 (pads ~770 + bridges ~550 + trees ~6,720).
- **Colliders:** 8 circle (`darkforest-hexpad`, `walkableTop: true`).
- **Doesn't duplicate:** existing `dark-ruins` procedural clutter is separate ground-level ruin
  props; these are elevated hex-pad structures.

## 32_CRYSTAL — Crystal Sea harbour, pier, glass-tube segment

- **Where:** bearing 225.0° (Harbor Line Station), `RING_R + 140..460 m`, `ocean`/crystal-sea sector
  (196°-265°).
- **What:** 6 faceted crystal spires (hex-taper frame + inner glass shell + glow bands), on stilts
  where the ground is below water level. A pier (deck ribbon + piling posts) runs from the shore
  (`RING_R + 120`) out to the nearest spire at water level, ending in a **glass-tube segment** — a
  free-standing horizontal glass tube (new `htube()` helper, built directly on the bmesh the same
  way the step-4 hovering tetrahedron is) linking the pier end to the tower base.
- **Function:** `build_crystal()`. **Est. tris:** ~1,150 (towers ~840 + pier/tube ~305).
- **Colliders:** 6 circle (`crystal-spire-base`), 1 obb (`crystal-pier`, `walkableTop: true`).
- **Doesn't duplicate:** existing `spire-islands` + `harbour-town` procedural clusters are the
  background island/town clutter; this is the single hero harbour + pier + tube landmark.

## 33_ARCTIC — Arctic shelf city, cloud-stair walkways, 3 domes

- **Where:** bearing 333.4° (Arctic Outpost Station), `RING_R + 180..390 m`, `arctic` sector
  (314°-346°).
- **What:** 4 flat shelf platforms stepping upward (+10 m, +14 m per step) over the terrain, each on
  6 support pylons down to grade; consecutive shelves are linked by ribbon "cloud-stair" walkways
  (with thin glow rails); the first 3 shelves each get a tapered glass dome (4-ring stack, same
  taper technique as the Sand print-caps).
- **Function:** `build_arctic()`. **Est. tris:** ~3,670 (shelves ~1,540 + stairs ~270 + domes ~1,860).
- **Colliders:** 4 circle (`arctic-shelf`, `walkableTop: true`).
- **Doesn't duplicate:** existing `arctic-outposts` procedural clutter is smaller ground props; this
  is the elevated shelf-city landmark.

## 34_COLOSSEUM — south-spoke colosseum

- **Where:** bearing 180.0° (one of the 16 Grid spokes, continued past the ring), `RING_R + 400 m`
  (3229 m), matching the `southern-colosseum` region (bearing 180°, `r_m` 3200).
- **What:** a full colosseum: plaza floor (`r` 70), 9 concentric tiered-seating rings up to `r` 120,
  an outer tapered drum wall 46 m tall, 8 entrance arches with glowing lintels every 45°, 16 crown
  pylons on the rim.
- **Function:** `build_colosseum()`. **Est. tris:** ~3,160.
- **Colliders:** 1 circle (`colosseum-floor`, `walkableTop: true`), 1 circle (`colosseum-wall`, not
  walkable).

## 35_LAIRS — dragon lairs

- **Where:** 5 lairs, one near each new frontier realm plus the Colosseum (Emberfall already has its
  own `DRAGON_Emberfall_perch` empty from step 5 — not duplicated here): Darkforest
  (`RING_R + 340`), Arctic (`RING_R + 420`), Crystal (`RING_R + 300`), Sand (`RING_R + 500`),
  Colosseum (bearing 180°, `RING_R + 560`).
- **What:** each lair is a small rock-outcrop mound (5 tapered boxes) with a dark cave-mouth recess
  and 2 small glowing "eyes" in the dark, plus a `DRAGON_<Realm>_Lair` empty marker (same convention
  as the existing Emberfall perch empty) for the game/animation side to hook into.
- **Function:** `build_lairs()`. **Est. tris:** ~640 (5 lairs × ~128).
- **Colliders:** 5 circle (`dragon-lair`, not walkable).

## Totals

- **Collections added:** `30_SAND`, `31_DARKFOREST`, `32_CRYSTAL`, `33_ARCTIC`, `34_COLOSSEUM`, `35_LAIRS`.
- **Est. tris, all 6 realms combined:** ~20,700 — well under the ~150k/realm budget (and under
  150k total).
- **Colliders added:** 31 total (30 circle + 1 obb) — see per-realm breakdown above.
- **`build_canon.py` changes:** all additive and gated `if STEP >= 8` (the STEP-8 `exec()` hook, the
  `EXP` export-list addition, the `only=` shot-name-prefix gating extended to accept `v8-*`, and the
  6 `v8-<realm>` `shoot()` calls at the end of the RENDER section). Steps ≤ 7 behaviour is unchanged.

## Commands to run later (NOT run in this session — no Blender, no browsers)

Full step-8 build, no render (fast, for iterating on the Python):

```
blender -b --factory-startup --python tools/blender/canon/build_canon.py -- C:/Users/Brittany/Shaddai-3d step=8 norender
```

Full step-8 build with all approval renders (`v3-*` + `v8-*` shots — expect this to be slow on the
owner's laptop, same caveat as the v3 run):

```
blender -b --factory-startup --python tools/blender/canon/build_canon.py -- C:/Users/Brittany/Shaddai-3d step=8
```

One render at a time (repeat with a different realm each time to keep memory/time down):

```
blender -b --factory-startup --python tools/blender/canon/build_canon.py -- C:/Users/Brittany/Shaddai-3d step=8 only=v8-sand
blender -b --factory-startup --python tools/blender/canon/build_canon.py -- C:/Users/Brittany/Shaddai-3d step=8 only=v8-darkforest
blender -b --factory-startup --python tools/blender/canon/build_canon.py -- C:/Users/Brittany/Shaddai-3d step=8 only=v8-crystal
blender -b --factory-startup --python tools/blender/canon/build_canon.py -- C:/Users/Brittany/Shaddai-3d step=8 only=v8-arctic
blender -b --factory-startup --python tools/blender/canon/build_canon.py -- C:/Users/Brittany/Shaddai-3d step=8 only=v8-colosseum
blender -b --factory-startup --python tools/blender/canon/build_canon.py -- C:/Users/Brittany/Shaddai-3d step=8 only=v8-lairs
```

Export to the game (GLB + collider JSON), once the renders are approved:

```
blender -b --factory-startup --python tools/blender/canon/build_canon.py -- C:/Users/Brittany/Shaddai-3d step=8 norender export
```
