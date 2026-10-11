# Master prompt: water network, realm ships, rooms, underwater train (drafted by QUILL, 2026-10-10)

Paste into the next terminal.

## Goal
Finish the water network and realm integration for the reef city (`public/SHADDAI-WORLD-3D.html`, assets in `public/assets/reef/`). Blender is the layout source of truth; the game matches it.

## Tasks, in order (one system per commit)
1. **Canals.** A canal from the reef hub to each realm biome (lava, void, ice, desert, forest) and to the world train station. Flow follows terrain height. Each biome changes the water: molten flow (lava), clear ice-blue (ice), silt (desert), glowing plasma (void), green current (forest).
2. **Realm ships.** One ship per biome, plus upgrade slots (speed, cargo, armour, biome adaptation) with a small panel. The reef ferry (`reef-ferry.glb`) is the base.
3. **Rooms.** Seating (agents and players can sit), storage (lockers or crates), shops (counter and the existing WorldShops menu). Interiors are placed inside the home, shop and dome buildings. Layout comes from the Blender source; keep existing geometry.
4. **Underwater train.** Finish the tube from the reef tube station to the world station (`WORLD_LAYOUT.stations[0].pos`): tube segments, a station at each end, train car, movement along the line.

## Rules
- After each commit: `node tools/_boot-smoke.cjs "?time=0.5&reef=1"` (0 page errors). Check free RAM first (~1000 MB).
- Screenshot with `tools/_shot.cjs` (`HUBCAM` for hub views); put the path in the commit message.
- Make geometry in Blender first, then export the GLB to `public/assets/reef/`.
- Never lower art quality.
- No push to `main`. Work on the branch (`feat/world3d`) and ask before pushing.
- Ask before deleting any file, asset or Blender object.

## Status when this was written
- Reef hub, sets (66 m), stations (150 m), walkways, doors, dome/home/shop/lounge interiors, elevator, ferry, water shop menu, hub board: built behind `?reef=1`.
- Not yet verified in the game: layout on screen, underwater tube to the world station.
