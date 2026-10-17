# Downloads audit → 3D world (2026-09-27)

Source: `C:\Users\Brittany\OneDrive\Desktop\New folder\Downloads`. This audit is **read-only**. Nothing there was moved, renamed or deleted; the owner is organizing it.

"Done" means the asset is already converted into `public/assets/` and listed in `manifest-downloads.json`.

## Deep Void: castle aesthetic (owner ref, image #64, 2026-09-27)

This is the look the owner wants for the Void gate. It is a tech-fusion take, not a plain medieval castle.

- **Castle:** a dark indigo spired castle on a rise. A glowing, **brain-shaped nebula dome** crowns its central tower, and a lit portcullis gate sits at the front.
- **Causeway:** a **glowing cellular energy path**: black cells with violet/magenta light veins, animated like caustics. It is walled by cobble parapets with **fire braziers** (warm orange: the only warm light in the scene).
- **Beside the path:** magenta/crimson glowing beds.
- **Sky:** a spiral-galaxy vortex with a bright core over a starfield, with aurora-blue haze.
- **Build plan (Blender/code first, $0):**
  - Replace the Void greybox gate with a spired castle kit.
  - Build the causeway from the pit overlook to the gate with a custom emissive Voronoi shader. This is code, not texture.
  - Add braziers every ~12 m, a nebula dome with a fresnel shader, and a vortex skydome region used only inside the Void wedge.
  - A fal concept PNG is optional, and only with owner approval.
- **Useful downloads for it:** `Spooky_Bridge_Fragment_01_Art.glb`, `TempleFloor01/03/04`, `TempleEmbelisher01-03`, `StandArc01`, `PortalEffect02`, `Ancient Cosmic Portal` (portal rings/arch/stairs), `Ancient Temple`, `Floating_Island_01_Art`, and `ElevatorTeleport01_Art`.

## Creatures & enemies
| Item | What | License | Realm / use | Status |
|---|---|---|---|---|
| Wolf-Rigged-and-Game-Ready.zip / Wolf-Blender-2.82a.zip | rigged wolf, 9 clips | readme in `public/licenses/wolf-3dhaupt-readme.txt` | wilderness packs | **done**: in game, night hunts |
| Dragon_Baked_Actions.blend / BGE_Dragon / .unitypackage | rigged dragon | per earlier import | skies, all realms | **done**: `dragon-rigged.glb` |
| Huge_Red_Flying_drago_…obj | static red dragon (AI mesh) | unknown, owner to confirm | Emberfall boss variant | todo |
| Bestiary - Dungeon Monsters Kit (Imp, Puglin) | rigged monsters, GLB included | Quaternius QAL v1.0 (free) | **Void / night enemies** | todo: easy (GLB ready) |
| skeleton_animated.FBX / skeleton_static.FBX | skeleton enemy | unknown | Void/Darkforest night enemy | todo |
| monster+insects (.fbx/.obj/.dae/.stl + texures.zip) | insect monster, PBR | unknown | Void/Darkforest night enemy | todo |
| Iguana.zip | rigged iguana | unknown | Sand Sea | todo |
| TunaFish.fbx / Tuna.blend / TUNAOBJ / TunaSTL | tuna | unknown | Crystal Sea schools | todo |
| Retro_UnderWaterAssets_Freebies (FBX zip; HDRP/Unreal dupes) | coral, rocks, wrecks | unknown | Crystal Sea seabed | todo (use FBX zip only) |
| Meshy_AI_Emerald_Enforcer / Neon_Valkyrie (biped + merged anims) | AI characters, rigged | Meshy (owner's) | possible citizens/NPCs, but the owner is making new 7 agent bodies | hold |

## Vehicles
| Superconductor train (fbx/blend/usdz/zips) | maglev | per readme | gold ring | **done**: `maglev-train.glb` |
| Gun Bike, Chopper, Tracer, PyramidShip (.obj + .vox) | voxel vehicles | unknown (voxel packs) | Grid traffic / Sand Sea (pyramid ship) | todo |
| Meshy_AI_Slipstream_Voyager, Cosmic_Skater | AI vehicle/skater | Meshy | SKATE / Grid | hold (20–79 MB, needs decimation) |

## Buildings, kits, props
| Modular SciFi MegaKit (extracted) | modular sci-fi walls/floors | Quaternius QAL | **Grid interiors (useful buildings: shops/agent offices)** | todo: high value |
| Downtown City MegaKit (zip, 697 files, glTF) | city kit (brick-heavy) | Quaternius QAL | Grid street dressing; skip plain brick (futuristic rule) | select pieces |
| FreeSample (BuildingBlock, Advertising, SateliteDish, Road/Sidewalk chunks) | stylized city blocks + ad boards | unknown | Grid billboards/rooftops | todo |
| BlockChain_Tower_Art, BlockChain_CodeBush_Art, Colony_Planet_Art, VIP* (Bridge/Wall/Barrier/Domes), Iron_Structure_01 | sci-fi set pieces | unknown | Grid / City plaza | todo |
| Japanese_Arch, Japanese_Sign_03/12/15/16 | neon signage | unknown | Grid neon streets | todo |
| Stage_Structure_Backstage, Top_Beam, Floor_Ring, StandArc01 | stage / arena | unknown | Colosseum | todo |
| RetroComputerBooth, InformationStand01, InformativePanel01 | kiosks | unknown | Grid shops / stations | todo (12–40 MB, decimate) |
| Table/Seat/Sofa/Bench/Pot/Stairs/SciFi_Stairs_32/SciFi_Bridge/Platform_03/Wall_01/Wall_Module_04/07 | furniture + modules | unknown | interiors / stations | todo |
| Ancient * packs (Temple, Reliques, Artifacts, Treasure, Rock Statues, Crash Site, Cosmic Portal) | voxel ruins (.obj + .vox) | unknown (voxel packs) | Void (portal/temple), Sand Sea (crash site, statues) | todo |
| dungeon_freebies | weapons, potions, key, ghost, projectiles | public domain / unlicense | loot + combat props | todo: easy |
| Farm Buildings (zip) | farm | — | **skip**: futuristic rule | skip |

## Nature & terrain
| Ultimate Stylized Nature (zip, glTF) | trees/rocks/plants | Quaternius (License.txt) | Meadow/Darkforest/wilderness | partly used in fill |
| Vegetation.zip, Trees/, TREEGENS.zip, Tree01-04, PalmTree03, Plant_02, Grass03/04 | trees/grass | unknown | wilderness fill (Palm → Crystal Sea shore) | todo, LOD needed (Tree01-04 are 19–27 MB) |
| Mountain01/05, SandMount_Art, Terrain*/TerrainFloor, WaterfallFoam01, Path_01-04 | terrain pieces | unknown | backdrop/realm edges; Waterfall → Arctic/Meadow | todo |
| Snow014/015, Grass005, Terrain005 (PBR texture zips) | ambientCG textures | CC0 | ground materials (Arctic snow, meadow grass) | todo |
| Terrain005_2K.obj (501 MB) | scanned terrain | CC0 | not needed (our heightmap covers it) | skip |

## Not 3D-world assets
These are ebooks, videos, Grok/Pinterest page saves, repos (cobalt, MiroFish, OpenCut, tactics-rpg, tidewater, img2threejs), rental agreement, `base*.glb` / UUID folders (older 50–100 MB AI scans; owner to say what they are) and `Meshy_AI_Dreamers_*` / Fortune_Retriever / Midnight_Mech / Neon_Covenant / Storm_Ladder / Crystal_Eden (120–194 MB each, Dreamers project).

## Duplicates spotted (owner's call; nothing removed)
`* (1).*` copies: Tree01, Tree03, monster+insects.obj, texures.zip, Unity5_*_Texs.rar, Retro_UnderWater FBX zip, 26bc7a…jpg, 5de709…jpg, Meshy_AI_Dreamers_Good_People. The .rar texture packs (Unity4/5, UE4, NormalMap) are the same texture sets in engine flavours; we only need one.

## Suggested order (highest world value first)
1. Void castle + energy causeway (code/Blender, owner ref above).
2. Bestiary Imp/Puglin + skeleton as night Void/Darkforest enemies (GLB/FBX ready).
3. Modular SciFi MegaKit → first enterable Grid shop/agent office (the "useful buildings" goal).
4. Iguana (Sand Sea), tuna + underwater props (Crystal Sea).
5. Voxel vehicles as Grid traffic; neon signs/billboards on Grid streets.

## Visual survey + fit test (2026-09-27, later)
- **Survey:** `node tools/ual/survey-models.mjs` counted 368 GLB/glTF files by header only (low RAM). `tools/blender/assets/thumbs.py` rendered 477 thumbnails, and `tools/ual/contact-sheet.mjs` built labelled contact sheets in `.bl-cache/survey/sheets/*.jpg`.
- **Kit textures live in a shared `Textures/` folder.** The thumbnailer and the fit script relink them automatically.
- **Fit test:** `tools/blender/assets/city-block-fit.py` renders to `.bl-cache/renders/cityfit-street-eye.png` / `cityfit-aerial.png`, and the scene opens in Blender from `.bl-cache/city-block-fit.blend`. It builds one Shaddai City corner:
  - Downtown streets, sidewalks, bollards and planters
  - a Sci-Fi MegaKit storefront (16×12 m, 2 floors + crown) with its red strips swapped for **emerald**
  - the owner's SHADDAI banner as the rooftop billboard and the Agent Collective emblem over the door
  - plaza props: crypto kiosk, hologram teleport, floor ring with a planet hologram, code-bush planters, neon blade sign, glitch ad screen
  - a 1.8 m citizen for scale
- **Verdicts:**
  - **Sci-Fi MegaKit = the Shaddai building kit.** It covers storefronts, offices, interiors, ramps, stairs, rails, terminals and crates.
  - **Downtown = streets/street furniture only.**
  - **Voxel packs** (dark stone + emerald glow) fit the palette → wilderness points of interest, Void/Sand ruins, and ships as traffic.
  - **Creatures:** fix scale and textures on conversion. Source sizes are wrong: iguana 27 m, mech 11 m, insect monster 16 m, tuna 4.8 m.
  - **Downloads\"MODELS FOR FAL"\BILLBOARDS and ART:** billboard content (SHADDAI banner, Agent Collective emblem, Dreamers clock, 5 glitch tiles) plus 2 building style refs (blue reactor complex, floating sky-station).
- **Fit-test polish still needed:** corner pieces, a door leaf, interior lighting, and roof edge trims.
