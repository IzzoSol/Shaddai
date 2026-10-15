# Realm Fill Plan — Map v4 (~10 km)

Written 2026-09-25 in TURTLE's design role; the TURTLE MCP was down (503).

**Sources:**
- Ground and terrain: `fal-assets/refs/world/ATLAS-ringed-realm.jpg`, with the terrain from `tools/blender/terrain-v4.py`.
- Reference images: the owner's refs in `fal-assets/refs/world/*`.

**Rules:**
- Futuristic tech-fusion only. No plain houses, barns or roads.
- Real sizes (1 m = 3.889 u).
- Each realm keeps its own palette.
- Wilderness between realms is never empty.

**Legend for the tables:**
- **HAVE** means the asset is already in `public/assets/models/**`.
- **GEN** means it needs a concept PNG (HF, about $0.003) approved by the owner, then a fal 3D model (hunyuan rapid at $0.225 or pro at $0.375).
- **CODE** means it's procedural, at $0.

## Radii (metres from the centre of the Grid)
| Band | Radius (m) | What's there |
|---|---|---|
| Shaddai City core (as built) | 0–170 | Council hexagon, bazaar, shop, arcade |
| The Grid district | 170–1600 | 12 radial avenues, 2 inner ring roads, 8 hubs on the edge |
| Wilderness belt + maglev ring | 1600–~3000 | Ring at 2829, stations at the atlas bearings, dragon crossings |
| Realms | ~1900/3000–4800 | Wedges at the atlas bearings, with ~500 m wilderness corridors between them |
| World edge | 4880–5000 | Grass cliffs into the cloud sea (ref `world-edge-cloud-sea-drop-limit`) |

## 1. The Grid (city district)
| Cluster | Ref | Size | Where | Asset |
|---|---|---|---|---|
| Crescent megatower on a transit podium (flagship) | grid-crescent-megatower-podium | 180 m tall, 120 m podium | North avenue, 600 m out | GEN (pro) |
| Glass elevator towers ×6 | city-glass-elevator-tower | 90–140 m | Along the inner ring road | GEN ×1 (rapid), instanced 6× with tints |
| Sky terrace block ×4 | city-shaddai-sky-terrace | 60 m | Between avenues | GEN ×1 |
| Existing mega/market towers | — | 40 m | Scattered | HAVE `hero-city-megatower`, `bld-holo-market-v2` |
| Holo fountain, kiosks, lamps, transit stops | — | 2–6 m | Along every avenue | HAVE `prop-holo-fountain`, `prop-kiosk`, `prop-street-lamp`, `prop-transit-stop` |
| Avenue light-trails + ring roads | — | 8 m wide | 12 avenues | CODE |

## 2. Realms
| Realm (station) | Signature clusters (ref → asset) | Vegetation | Water |
|---|---|---|---|
| **Deep Void** (Rift Gate) | Rift gate at the mouth (HAVE `hero-void-rift-gate`, 50 m); golden-ring pyramid city (void-golden-ring-pyramid-city, GEN pro, 150 m); fire-portal corridor (void-fire-portal-corridor, GEN, 60 m); Ancient Cosmic Portal (kit2, 15 m) | None; crystal clusters (HAVE) on the ridges | Rift pool in the crater (terrain) |
| **Sand Sea** (Desert Terminal) | Desert terminal at the station (HAVE, 60 m); dome village (desert-dome-village, GEN, 8–20 m domes ×12 instanced); Mars greenhouse domes (desert-mars-greenhouse-domes, GEN); Dune Wheel patrols (refs/vehicles, GEN vehicle); crash site (kit2, 25 m) | Sparse dune grass (CODE) | Oasis lake at 47° (terrain) |
| **Emberfall** (Forge Station) | Obsidian fortress on the crater shelf (HAVE `hero-fortress`, 80 m); forge tower, ritual circle, bridge, gate (HAVE); lava citadel (emberfall-lava-citadel, GEN pro, 140 m) on the volcano flank; the dragon (HAVE volcano-dragon until the dragon rig is done) | Dead trees (HAVE nature deadtree) | Lava channels (terrain colour + CODE emissive) |
| **Quill Forest** (Suburb Transit Hub side) | Quill's library in a world tree (forest-world-tree + quills-library ref, GEN pro, 90 m); pod village (forest-pod-village, GEN); walkway bridges between trees (forest-walkway-bridges, GEN, 40 m spans) | Dense maple + birch (HAVE nature) | Stepping-stone river (forest-river-stepping-stones) on the 122° river |
| **The Suburbs** | Green-tower boulevard (suburb-green-tower-boulevard, GEN, 70 m ×8 instanced); giant-tree road corridor (suburb-giant-tree-road, CODE trees plus GEN arch tree); mushroom pod homes (HAVE `homes-mushroom-pods`, W7 Eco-Haven); apartment pods / cube habs / observatory / terrace spire (HAVE) | Street trees (HAVE maple) | — |
| **Meadowfields** (Halt) | Amphitheater ruin (HAVE `hero-forest-amphitheater`, 50 m, placed where the atlas draws it); terraced farms plus the farm train (meadow-terraced-farms-train, GEN); vertical farm tower (meadow-vertical-farm-tower, GEN, 80 m); walking terrarium pods (meadow-walking-terrarium-pods, GEN, animated later); hillside earth homes (meadow-hillside-earth-homes, GEN); farm-sky structure (HAVE, floats at 31 m) | Birch, flower clumps, bushes, pink blossom trees (HAVE; tint) | Lake at 172° |
| **Southern Colosseum** | Real-size colosseum (CODE, `world-colosseum.js`); plaza, banners, spectator stands | Lawns | — |
| **Crystal Sea** (Harbor Line) | Beach market dome (HAVE, 40 m) at the harbor; coastal cliff city (crystal-sea-coastal-cliff-city, GEN pro); spire islands (crystal-sea-spire-islands, GEN ×1 instanced on islands); floating garden market + farm platforms (crystal-sea-floating-garden-market / farm-platforms, GEN); dome park (crystal-sea-dome-park, GEN); underwater tube train (crystal-sea-underwater-train, CODE glass tube + existing train); boats (HAVE catamaran, superyacht, submarine, skiff) | Palms on the islands (HAVE kit palm) | The ocean (world-water.js, Tidewater look) |
| **Darkforest** (Darkvault) | Siege castle (HAVE `hero-castle`, 70 m; ref S1 neon-gothic); green/teal cathedral forest groves (darkforest-*-cathedral-forest → CODE giant trunks plus HAVE trees); neon swamp (darkforest-neon-swamp, CODE glow water plus GEN swamp huts); ruin arch stairs (darkforest-ruin-arch-stairs, GEN); obsidian rocks + crystal clusters (HAVE) | Very dense dead trees + dark maples (HAVE) | Swamp pools (terrain lakes) |
| **Arctic Vault** (Outpost) | Arctic outpost at the station (HAVE); sky dome (HAVE, 120 m); ringed ice city (arctic-ringed-ice-city, GEN pro); spiral ice city (arctic-spiral-ice-city, GEN); mountain tech station on a peak (arctic-mountain-tech-station, GEN); **cloud-stair towers + sky walkways** linking the ice city (arctic-cloud-stair-walkways — owner 2026-09-26: this ref is ARCTIC city buildings/walkways, not the Void); white dome village (arctic-white-dome-village, GEN instanced) | Sparse dead trees | Glacier river at 330° |

## 3. Between realms (the ~500 m wilderness corridors)
| Border | Contents |
|---|---|
| Void ↔ Sand | Stone ring arches (pass-stone-ring-arches, GEN); Ancient Rock Statues (kit2); waystation |
| Sand ↔ Ember | River crossing: sci-fi bridge (HAVE kit `sci-fi-bridge`); lava-cooled basalt steps; overgrown tank (wild-overgrown-tank, GEN) |
| Ember ↔ Quill/Suburbs | Floating broken arches (pass-floating-broken-arches, GEN); floating island over the lake (HAVE kit `floating-island-01`) |
| Suburbs ↔ Meadow | Coastal ring highway flyover (pass-coastal-ring-highway, CODE road ribbon); farm-drone outpost |
| Meadow ↔ Colosseum | Processional avenue with statues (HAVE `prop-statue-shaddai`); tournament camp tents (CODE) |
| Colosseum ↔ Crystal | Lighthouse headland (GEN); boat ramp + skiffs (HAVE) |
| Crystal ↔ Darkforest | Crystal cave with a waterfall (wild-crystal-cave-waterfall, GEN); river mouth |
| Darkforest ↔ Arctic | Giant stone face in the cliff (wild-giant-stone-face, GEN pro); glow cave (wild-green-glow-cave, GEN) |
| Arctic ↔ Void | Ring-portal garden (wild-ring-portal-garden-city, GEN); Ancient Temple (kit2) |

**Every corridor also gets:**
- a waystation (HAVE kit: `platform-03` + `information-stand01` + `elevator-teleport01` + `japanese-arch`);
- a dragon-gate marker where it meets the ring (dragon refs in `fal-assets/refs/dragons/`);
- night enemy spawn zones (Bestiary Imp/Puglin while the monster set grows).

## 4. The world edge
- **Cliff:** a continuous grass cliff about 120 m tall, dropping into a cloud sea at −160 m (CODE: cloud layer shader).
- **Lookouts:** "DROP LIMIT" sign lookouts every 30° (GEN sign prop, $0.003 PNG plus CODE plane).
- **Sky lanes:** light-trail sky lanes start at 4 lookouts for the hoverboard, per the sky-lane skateboard ref (CODE ribbons).

## 5. Spend estimate (all GEN rows need owner approval of the PNG first)
- About 26 GEN models: 8 pro at $0.375 = $3.00, plus 18 rapid at $0.225 = $4.05, plus concept PNGs at about $0.10 — **about $7.15 in total**.
- The fal budget has $86.50 left, so this fits with room for dragons and vehicles.
