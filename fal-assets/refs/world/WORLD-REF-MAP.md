# World reference map (owner-supplied aesthetics → where they go)

Process (owner's rule, 2026-09-19): I describe the image → QUILL tightens the description → TURTLE turns it into a generation prompt + workflow → **SHADDAI decides what it correlates to and where** (`shaddai_run_agent`, agent=SHADDAI) until each is built out. Images were pasted in chat (not files); descriptions below are the durable record. **Drop the originals in `fal-assets/refs/world/` if you want img2img fidelity** — text-only prompts can't match them exactly.

Placements below are SHADDAI's calls, with my flags where I disagree.

## Batch 1 — world / architecture

| # | Reference (my description) | Anchor | In-world use | Assets driven | Pri |
|---|---|---|---|---|---|
| W1 | Transparent ribbed dome over lush mountainside, giant planet in sky, tiered lit building, bullet-train viaduct, floodlit stadium; night blue/emerald | Sky Station (cross-realm) | Observation/transit hub under the dome; stadium = arena | buildings, interior, sky, vehicles, terrain | 2 |
| W2 | Curving black glass sea-wall, stepped cliff plateaus with spire towers + circular garden plazas over ocean | Beach cliff (links to City) | Cliffside megacity; cliff elevators to City hub (spec §6.5) | terrain, buildings, props, sky, elevators | 3 |
| W3 | Painterly colossal columnar trees arching over a straight suburban road; terracotta-roof white houses, poles, small cars | Suburb | Main road corridor; house interiors | terrain, props, vehicles, sky, interiors | 5 |
| W4 | Upside-down wooden-box city hanging overhead, golden wheat fields, orange-roof farmhouses, golden hour | Meadow/Farm (farm-tech) | Farm-tech sky structure over fields | terrain, buildings, sky, farm props | 4 |
| W5 | Glass-domed Mars hyperloop concourse, planters, lounge seating, gold light strips, chrome capsule, red desert + rovers | Desert (Grand Forge area) | Transit terminal + rover/Air-Pad staging | interior, vehicles, terrain, props | **1** |
| W6 | Pale steel-glass crescent megatower with cantilevered truss terraces on a disc transit podium, skybridges | City hub | Flagship landmark / transit podium | buildings, props, vehicles, plaza | 6 |

| W7 | Glossy candy-red mushroom-cap pod houses on curved stalks, stacked tiers, thick rooftop gardens, round windows with green polka-dot decals, sweeping red ramps/slides through greenery, sunny | Suburb "Eco-Haven" + PayBox starter lots | Player homes; shops tucked into pod bases; ramps = side-cutaway silhouette | residential pack | 2 |
| W1 (resent) | Same space-station dome — owner re-sent it, so treat W1 as emphasized | | | | ↑ |

Palette W7: candy-red `#FF4D4D`, moss-green `#7CFC00` accents.

## Batch 2 — cutaways (walk-in interiors + PayBox lots; the 2D side-view IS the cutaway)

| # | Reference | Anchor | Use | Pri |
|---|---|---|---|---|
| C1 | Domed round house half-sunk in water, rooftop palms, dry upper rooms, flooded turquoise lower rooms, blueprint callouts | Beach cliffside | Hub interior "Ocean-Breeze Marketplace" (shops, health packs, upgrades) | 1 |
| C2 | Isometric forest amphitheater: conical black timber-lattice pavilion, circular stage, terraced steps, round pond + fountain, island platform | Forest (Kether Keep) | Landmark "Sylvan Arena" (siege-ready) | 2 |
| C3 | Huge underground bunker: barn on top, elevator shaft, ~25 room types (kitchen, cinema, spa, hydroponics, clinic, armory, generators…) | Suburb | Deep PayBox lot template, modular rooms | 3 |
| C4 | Small underground home: solar cabin + wind turbine, dome vault door, 4 levels, office, gym, pantry, generator | Meadow/Farm | Starter "Eco-Home" lot | 4 |

Shared-layout rule (all cutaways): one floor-plan JSON drives BOTH the 2D side-view cutaway and the 3D walk-in, so 2D and 3D always match (parity §4.10).

## Batch 3 — siege

| # | Reference | Anchor | Use | Pri |
|---|---|---|---|---|
| S1 | Blacklight-neon gothic castle at night: indigo towers/spires, glowing portcullis, giant brain-shaped orb atop tower, galaxy-swirl moon, cobbled causeway with glowing magenta cracks, braziers, pink-red lava fields | Darkforest | The siege castle | 1 |
| S2 | Low-angle stair up a grassy hill to a lone lit gabled house; violent indigo cosmic sky, twisted starry vortex tower, giant eye in the clouds | Volcano-adjacent / Kether approach | "Lands during siege" | 2 |
| S3 | Black-turtleneck silhouette, face fully black, head a roaring mane of red/orange/yellow fire with rainbow sparks, deep-blue backdrop | Darkforest | Siege villain who rides the dragon | 1 |

**Palette lock (SHADDAI):** Indigo-Night `#1E0A3C`, Violet-Gloom `#5B2C6F`, Magenta-Lava `#C71585`, Neon-Blue `#0A84FF`, Fire-Orange `#FF4500`, Rainbow-Spark `#FF69B4` (sparingly).

**Villain (SHADDAI's proposal — owner to confirm):** "Nyx Vesper", dragon-rider-lord, ex-guardian of Kether Keep. ~2.2 m tall; bonded to the dragon (shared roar/breath). Kit: Abyssal Flare (dash + fire trail), Vortex Gaze (gravity pull toward the eye), Neon Shroud (untargetable 1.5 s), Dragon's Bond (synchronized breath). Face stays a black void — that IS the design; fire hair = particle/emissive layer, not geometry.

## Flags / decisions for the owner
1. **Siege map = ONE map, two states** (S1 castle + S2 lands): SHADDAI split them across Darkforest and Volcano; you said they "tie", so I recommend a single Darkforest siege map whose approach road runs into a volcanic border. Confirm.
2. SHADDAI called ref W1's stadium lighting a "neon conflict." It isn't — that rule is about streetwear-neon *characters/art register*; sci-fi lighting is fine. Ignoring that flag unless you say otherwise.
3. Villain name/lore is a suggestion, not canon.
4. Dragon: no reference yet. Send one and it becomes the siege boss mount.

## Batch 4 (2026-09-19, owner refs pasted inline) — RULE: futuristic only, no normal housing
| # | Reference | Use |
|---|---|---|
| M1 | Armored mecha bison + rider (orange/blue-grey, cyan rings, horns) | Mount → built `mount-forge-bull` |
| M2 | Armored mecha mammoth + rider (cream/blue/amber, tusks, ice) | Mount → `mount-glacier-mammoth` |
| M3 | Mecha gorilla w/ trees growing on back (bronze, teal lens hubs) | Mount → `mount-canopy-gorilla` |
| M4 | "Dune Wheel" monowheel mech, yellow armor, 4-rocket pods (stat-card format) | TODO: desert vehicle + stat card UI style |
| M5 | "Power Armor 07" mining exosuit, drill arm | Vehicle → `vehicle-mining-powerarmor` |
| V1 | Rimba Racer: hover pod-car, colorway variants, spherical thruster wheels | TODO: hover-car vehicle set (6 liveries) |
| O1 | Floating modular ocean farm platforms w/ hab decks + walkways, drones, big blue sea | TODO: OCEAN realm (owner: big real ocean, boats, submarines, yachts, later buyable/parties) |
| R1 | Volcano fortress city: obsidian spire castle ringed by terraces, lava rivers/falls, arched bridges, sunset | TODO: VOLCANO realm + dragon lair |
| R2 | Digimon-style mall atrium hub (interactive directory, shops, hologram fountain) | City hub atrium interior style |
| R3 | Moebius-style root city under giant tree | Forest realm |
| T1 | Classified Technology Encyclopedia (15 items) | Shop items → `public/assets/items` (12 in shop) |
| U1 | Art cheat sheet: 6 color harmonies | Lighting presets in world3d.html use these |

## Batch 5 (2026-09-24, owner pasted inline — "clothing ideas etc") — COSMETICS DIRECTION
Theme = **ART-PRINT TECHWEAR**: a famous-art-movement print on oversized streetwear/cargo
silhouettes, gold hardware, chunky high-top sneakers. Pasted in chat only — originals NOT on
disk; drop them in `fal-assets/production/refs/cos-*/` for image-edit fidelity.
| # | Reference | Palette | Proposed use |
|---|---|---|---|
| O1 | Starry-Night hoodie + cargo joggers: navy/sky-blue fabric, gold swirl embroidery, gold drawcords/zips, blue-gold high-tops, swatch board | navy #1f3a78, sky #8fb0e0, gold #e8c45c | "STARRY" outfit (gold = brand gold — fits QUILL or ORACLE) |
| O2 | Stained-glass cargo pants (magenta/violet/amber glass panels), mauve crop mock-neck, cream high-tops | magenta #d6259a, violet #7a2c8f, amber #f7b267 | "CATHEDRAL" outfit (fits ORACLE violet / TURTLE) |
| O3 | Flame-gradient hooded drape/cape over white tee, red tactical cargo w/ straps, red high-tops, gold bangles | red #d7261e, orange #ff7a1a | "EMBER" outfit (fits PIKADON red) |
| A1 | Underground cyber fight-pit: roped ring w/ glowing red floor sigil, tiered steel balconies packed with crowd, neon holo billboards (pink/cyan), graffiti, cables, haze + top-down spotlight | cyan #29c6ff, pink #ff3fa4, sigil red #ff4a2a | COLOSSEUM Tourney Hall interior + tactics battle backdrop — build in CODE ($0 fal; interior law) |

## Batch 6 (2026-09-24, files on disk) — MAP / BIOME DIRECTION
| File | What | Use |
|---|---|---|
| fantasy-biomes-grid.jpg | 28 isometric biome tiles (Firelands, Icebound, Crystal Forest, Voidscar, Mushroom Forest, Underwater…) | 2D realm tile palette + future realm ideas |
| realm-map-city-network.jpg | "Map of Nestria cities": central crystal hub, ~12 colored cities linked by light roads, legend panel | Region-select / world-map screen UI |
| hub-and-8-realms-floating.jpg | Floating central city with 8 themed floating islands linked by light bridges, radial | Matches our layout (City hub + 8 realms + light-trail roads) — world-map + 3D overview reference |
