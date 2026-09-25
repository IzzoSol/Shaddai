# ASSET INBOX — everything the owner has handed over, and where it goes (never drop an item)

Status: ✅ in the game · 🔧 in progress · 📋 filed, queued · ⚠️ needs the owner (usually: the file itself)
All reference images live in `fal-assets/refs/` (world/, characters/, agents/, vfx/).

## Free asset packs (CC0 — ship freely)
| Pack | Local source (owner's Downloads) | Use | Status |
|---|---|---|---|
| Universal Animation Library 2 (Quaternius) | `Universal Animation Library 2[Standard]` | 43 moves on every rigged body (combat, farming, carry, climb) — `public/ual-retarget.js`, viewer `/ual-lab.html` | ✅ |
| Ultimate Stylized Nature (Quaternius) | `Ultimate Stylized Nature - May 2022…` | 36 trees/bushes/flowers/grass → `public/assets/models/nature/` | 🔧 scatter into realms |
| Downtown City MegaKit (Quaternius) | `Downtown City MegaKit[Standard]` | STREETS: 2/4-lane, intersections, curves, sidewalks, bollards, planters. (Skip brick facades — futuristic-only rule) | 📋 roads pass |
| Modular SciFi MegaKit (Quaternius) | `Modular SciFi MegaKit[Standard]` | INTERIORS: modular walls/doors/floors/platforms + props (computers, crates, lights, vents); 3 aliens = enemies | 📋 interiors pass |
| Tidewater (MIT, WebGPU game) | `tidewater-main` | Mine: line-tension fishing, zone-based bites, fish-stand economy; FFT ocean ideas (can't embed — WebGPU engine) | 📋 fishing v2 |
| Godot-MCP plugin | `Godot-MCP-…` | Not used — game ships on the web; unknown-author automation plugin (security) | — |

## Characters & bots
| Ref | Use | Status |
|---|---|---|
| agents/ ORACLE purple T-pose (owner) | ORACLE v2 — rigged, walk/run, UAL moves | ✅ |
| agents/ PIKADON red knight T-pose (owner) | PIKADON v2 — rigged, walk/run, UAL moves | ✅ |
| agents/ ZEROX blue buns + katana, TURTLE green + flail | agent upgrades (T-pose → rig) | 📋 |
| concepts/unit-shaddai (horned hood), unit-pilot, unit-bot-heavy, unit-bot-scout T-poses | tactics fighters | ⚠️ owner approval → rig |
| characters/npc-unicycle-robot-blueprint | BASE worker bot (rolls) — see docs/BOT-WORKFORCE-SPEC.md | 📋 |
| characters/npc-scrap-robot-tan/orange, npc-robot-variety-sheet, npc-robot-sketch-sheet | HUMANOID upgrade bots (walk + fight) + variety | 📋 |
| characters/hero-goggles-magenta-sheet, hero-goggles-green-sheet | playable heroes / side characters (multi-view sheets = good 3D input) | 📋 |
| characters/crystal-sea-mecha-shark | water TRANSPORT SHIP (rideable) | 📋 |
| items: rune hammer (PIKADON), glowing quill pen (QUILL) | weapons → hand bone | ✅ 3D shipped, attach 📋 |
| vfx/ orbs violet (ORACLE) · cyan (NEXUS) · gold (SHADDAI) | projectile sprites | 📋 |

## World
| Ref | Realm / use | Status |
|---|---|---|
| world/emberfall-lava-citadel | Emberfall: spire citadel ring-city, lava rivers + falls | 📋 |
| world/crystal-sea-farm-platforms | ocean farm field (rows of platforms) | 📋 |
| world/crystal-sea-floating-garden-market | harbor market | 📋 |
| world/suburb-giant-tree-road | Suburbs: giant canopy road (futuristic homes) | 📋 |
| world/meadow-vertical-farm-tower | COMMUNAL farm building | 📋 |
| world/meadow-walking-terrarium-pods | mini inventory plants you own + grow | 📋 |
| world/meadow-round-grass-tussocks | meadow ground cover style | 📋 |
| world/terraced-hills | meadow/forest terraces | 📋 |
| world/pass-stone-ring-arches | gateways over the 6 mountain passes | 📋 |
| world/sky-skate-showcase | hoverboard sky-skate showcase | 📋 |
| world/hub-and-8-realms-floating, realm-map-city-network, fantasy-biomes-grid | map layout + world-map screen | ✅ planner |
| inline only: emerald sparkling water (2026-09-24) | Crystal Sea shader colour/sparkle target | ⚠️ save the file |
| inline only: 3 outfit sheets (Starry / stained-glass / ember) + cyber fight-pit arena | cosmetics + colosseum interior | ⚠️ save the files |
| characters/cosmetic-hooded-gold-glyph | cosmetic outfit | 📋 |

## Decisions logged
- Scale: characters are 7 world units → **1 real metre = 3.89 units**; buildings are placed at real size (owner, 2026-09-24).
- Robots: base = unicycle workers; humanoids = paid upgrades that fight (owner, 2026-09-24).
- SHADDAI council agent left out for now; tactics SHADDAI = horned hood (pending approval).
- Buildings are futuristic only — no normal houses/roofs/barns.
