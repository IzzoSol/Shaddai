# Reef city: interiors and walkability design (2026-10-10)

Scope: the reef city around the central hub. Layout is compact: hub at the centre, four sets at 62 m, four reef stations at 170 m, walkways joining them.
Visual references: the floating-city and archipelago images (centre hub, round platforms, bridges, ferries); the underwater living-room images (glass walls, light rings, sunken sofa, skylight); the spiral-stair dome (surface dome down to an underwater room).
Style rules (from the art-direction pass): white shell, glass with thin gold light rings, teal glow behind glass, teak decks and furniture, navy piles, gold trim as thin continuous lines.

## 1. Walkability (the decks you can stand on)
- Every walkway piece (hub spokes, set ring, station spokes, the 40 m deck segments, the walkway connectors) is one walkable surface at deck height: 4 m above the water surface.
- Implementation: one registry module `public/world-reef-walk.js`. Each deck piece is recorded as {x, z, rotY, length 40 m, width 4 m, topY}. `surfaceAt(x, z)` returns topY when the point is inside a deck rectangle, else null. It is registered with the terrain's ride extras (the same hook the race deck uses: `addRideExtra(surfaceAt)`), so the player and the characters ride the decks without any new physics.
- Stairs: where a walkway meets a dome or a pod floor, a 2 m ramp (a short sloped deck piece) lifts the player from water-level ground to deck height. Ramps are added at the hub plaza edge and at each set's dome door.
- Railings: the gold rail on each deck segment is the edge. Walking off the deck edge drops the player into the water; the underwater look (step 1 of water) then applies.
- Test: a headless walk along the set ring and from the hub to each station; the player's height stays on deck top (no sinking below 4 m) and no step falls through a gap.

## 2. Interiors per building
Each building gets one interior that matches its exterior footprint. Interiors are separate GLBs placed at the building, with a door on its walkway side.

| Building | Interior | Contents | Size |
|---|---|---|---|
| Set dome (x4) | Living room (done: reef-interior.glb) | Skylight with gold ribs, sunken sofa tiers, teal cushions, glass wall band | 12 m radius |
| Home M (x4) | Living room, smaller | Curved sofa, low teak table, a glass wall to the sea, a gold light ring on the ceiling, a palm | 8 m radius |
| Water shop (x4) | Shop counter room | Glass front, curved counter, shelves of coral-coloured stock, gold light strip, a seat for the shopkeeper | 6 m by 9 m |
| Station pod (x5 per station) | Lounge / transit room | Ring of teak benches, glass floor panel showing the reef, gold ring light | 8 m radius |
| Central hub | Atrium (agent hall) | Round glass atrium, a central info pillar, space for agent missions and activities later | 20 m radius |

Interiors are built in Blender from the same parts (glass walls, gold rings, teak, white shell). Each interior is at most ~3,000 triangles, joined per material (five or fewer draws).

## 3. Activities (later, the hub and shops)
- Shops: the water shop interior holds a shopkeeper and a buy menu (uses the existing Sparks ledger).
- Hub atrium: agent mission board and the agent-activity spots. Not built yet; the space is reserved.
- Ferries: boats run between the hub and the stations along the spokes (later).

## 4. Build order
1. Walkability registry (`world-reef-walk.js`) and the deck ramps.
2. Walkability test (headless walk, height stays on deck).
3. Home M interior and shop interior (Blender), placed in the sets.
4. Station pod lounge interior (Blender), placed in one station to start.
5. Central hub atrium interior (Blender).
6. Activities (shop buy menu, hub mission board) after the interiors are in.

## 5. What is not in this doc
- The underwater train line to the main station (its own plan; comes after the city).
- The race track (after the water terrain).
