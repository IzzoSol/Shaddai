# Removed / switched off for the 2026-10-11 alpha (re-enable later)

| What | Why | Bring back with |
|---|---|---|
| Realm "districts" (street-grid suburb, domes, island spires, outposts, ruin fields) | no doors, biggest triangle cost | `?realmclusters=1` |
| Realm filler buildings `bld-*`, `homes-*`, and `hero-*` models except the Darkrealm keep | no entry, random models | `?realmbuildings=1` |
| Fill waystation huts + floating islands | no entry | `?fillextras=1` |
| City grid fabric thinned to 30% of pieces | far fewer pop-in offices, speed | `?fullcity=1` |
| Sky clouds | white sheet in the way | `?clouds=1` |
| Sky day/night clock + stars (fixed clear late-morning) | not needed right now | `?skyclock=1` |
| Colosseum promenade shop kiosks on the south (door) arc: 6 of 24 | they blocked the lobby door | edit the arc test in `world-colosseum.js` KIOSKS |
| Colosseum forecourt (plaza, lamps, plinths, fountain) | in front of the door | `?forecourt=1` |
| Mount/board Sparks stores (all owned in alpha) | alpha | `?strict=1` |
| Bitmap texture shrink on GLB textures | black characters risk | `?bmdiet=1` |
| Basic operatives hidden | alpha | `?basics=1` |
| Dragon gates not blocking the train | alpha | `?dragongates=1` |
| Run 9.5 / sprint 17 m/s | feel | `?slow=1` = old 6.5 / 9.5 |

Not done yet: terrain look + floors polish (basic), texture audit, Colosseum entrance on the far side, MODES > Colosseum black screen (needs console log).

## Track clearance (final pass)
- 570 of 4,183 city-fabric pieces that overlapped any Meridian / quarter-loop deck are dropped (`public/assets/world/track-clear-v4.json`, generated from `docs/track-*.json`; footprint + 10 m). `?trackclear=0` restores them. Regenerate the JSON after changing a circuit.
- All 7 agent GLBs (SHADDAI, ZEROX, ORACLE, NEXUS, TURTLE, QUILL, PIKADON + VILLAIN) are tracked in git and present in public/assets/agents.
- Colliders for the removed realm models (bld-*, homes-*, hero-* except hero-castle / hero-fortress) are no longer registered either (world-layout.js), so there are no invisible walls where they stood. `?realmbuildings=1` restores both model and collider.
- Checked: all 19 loading-slide images and all 8 operative portraits/GLBs exist.
