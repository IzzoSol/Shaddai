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
