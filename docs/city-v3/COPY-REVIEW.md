# City v3 copy review (markers-v4.json)

These are display-name suggestions only. The data names don't change, and `city-copy-v4.json` already uses the suggested names as titles.

## Names that read badly to a player

| Marker(s) | Problem | Suggested display name |
|---|---|---|
| `HUB_HOME_A…F` | "Hub Home" says the same thing twice and sounds like infrastructure | **Home A…F** |
| `STALL_001…012` | The zero padding is a database habit | **Stall 1…12** |
| `NODE_MAIL` | "Node" is an engineering word | **Mail Post** |
| `BLD_BROADCAST` | Prefix, and it's missing a noun | **Broadcast Booth** |
| `OBJ_RADIO_QUEUE` | Fine once the prefix goes; "Radio" alone is vague | **City Radio Queue** |
| `SLOT_GALLERY_01…08` | "Slot" reads like a machine | **Gallery Wall 1…8** |
| `OBJ_EXHIBIT_INTAKE` | "Intake" sounds like a clinic | **The TURTLE Door** (or *Museum Submissions*) |
| `BLD_ARCADE` | It's a nook in a lane, not a building | **Arcade Alcove** |
| `ARCADE_CAB_03` (`game: prediction`) | "Prediction" next to a prize can read as betting | **Oracle's Call**, and keep the "score only, no wagers" line |
| `SPAWN_TRAINEE / TEACHER / HIRE` | "Spawn" is dev jargon, and "spawn hire" reads grim | **Arrivals** (if ever surfaced) |
| `BAY_01…06` | Bay of what? | **Forge Bay 1…6** |
| `FRAME_01…03` | A frame is the body; this marker is the station | **Frame Cradle 1–2**, **Winged Cradle** |
| `NODE_SKILL_INSTALL` | Sounds like a software installer, and players will use it a lot | **The Seat** |
| `NODE_REPAIR` | Node jargon | **Repair Bench** |
| `CLASS_01…04` | "Class 01" could mean a course or a room | **Classroom 1…4** |
| `CLASS_ART`, `CLASS_MUSIC` | Can be confused with `STUDIO_*`, which also does art and music | **Art Class**, **Music Class** (studios stay *Studio 1–4*) |
| `DECK_OBSERVE` | The words are in the wrong order | **Observation Deck** |
| `OBJ_CLASS_BOARD`, `OBJ_HIRING_BOARD`, `OBJ_SPARKS_KIOSK`, `OBJ_GRADUATION_DAIS` | Only the prefix is the problem | **Class Board**, **Hiring Board**, **SPARKS Kiosk**, **Graduation Dais** |
| `PERCH_A…D` | Reads like a list | **Perch Pad A…D** |
| `PERCH_MAIN` | "Main" wastes the most mythic spot in the city | **The Crown** |
| `CP_00…07` | Players count from 1, and "CP" means nothing to them | `CP_00` = **Start / Finish**, `CP_01…07` = **Checkpoint 1…7** |
| `GATE_START` | Words in the wrong order | **Start Gate** |
| `TOWER_RACE`, `PLAZA_SKATE` | Words in the wrong order | **Race Tower**, **Skate Plaza** |
| `PAD_VEHICLE_SHOP` | "Pad" plus "shop" is clunky | **The Garage** |
| `VEH_*` | Prefix only; the names themselves are good | **Ground Runner**, **Hover Slide**, **Rail Needle**, **Hauler**, **Sky Skiff**, **Dragon Harness** |
| `BUILDER_YARD` | Missing the possessive | **Builder's Yard** |
| `AGENT_PROXY_01…08` | "Proxy" is a technical word and makes residents sound fake | Show the agent's own name; fall back to **Resident Agent** |
| `TRACK_MAIN` (in the docs, not a marker) | Players need a name for the loop | **The Ring** |

## Consistency notes (data, not naming)
- `ARCADE_CAB_01…04` have `game`/`prize` props but no `endpoint` or `dashboard_id`. The runtime therefore treats them as non-interactive, so their copy only shows once they're wired.
- In `BUILDER_YARD`, `catalogue` lists 10 ids (`sc-*`), but DOC_PLOTS says "9-type library". The ids need display names before players see them, for example *Small Storefront*, *Large Storefront*, *Office*, *Mid Office*, *Market Hall*, *Tech Lab*, *Garden Court*, *Teleport Plaza*, *Civic Tower* and *Ad Pylon*.
- Several props carry prose where a player-facing value belongs (`sparks_price: "per skill (DOC_SKILLS)"`, `"claim fee (DOC_PLOTS)"`, `"set by seller"`). The runtime prompt prints these as-is, so a player would see "SPARKS · claim fee (DOC_PLOTS)". Show a real number, or hide the price, until the backend prices it.
- "The Hall" (inside ZEROX's lounge) is also the name of the Telegram hub. The guide mentions it only once.
- Some homes (`HUB_HOME_E`, `HUB_HOME_F`) have `vendor_enabled: false`. The shared home prompt mentions "set your stall", so those two have exact-key overrides in `city-copy-v4.json` without it.
