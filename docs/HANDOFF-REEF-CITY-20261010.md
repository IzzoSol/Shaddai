# HANDOFF: reef city (2026-10-10) — saved, resume later

Repo: `C:\Users\Brittany\Shaddai-3d`, branch `feat/world3d`, local (not pushed). Last commit: `283e164a`.
Everything reef-related is behind `?reef=1`. Default page is unchanged.

## What is built (game, `public/SHADDAI-WORLD-3D.html`, bootReef block)
- **Hub (centre):** `reef-city-hub.glb` (floating-city design: tiered spire with garden rings, two glass domes, ring plaza), 1.0x, plaza at deck height (+4 m). `reef-atrium.glb` placed inside the hub.
- **Four sets at 92 m** (bearings 0/90/180/270): each = home M (-12 m), water shop (0), dome (+12) along a row. Dome interior (`reef-interior.glb`) inside each dome. Doors (`reef-door.glb`) 8 m in front on the hub side.
- **Walkways (rebuilt last):** one continuous glass bridge per connection (`reefSpan`): hub to each set, row walkway per set, set-to-set ring, hub to each station. Built to exact length. Old chained-segment loops are switched off (`k < 0`).
- **Four reef stations at 200 m** (`reef-station.glb` clones, 5 domed pods on piles).
- **Station 0 (bearing 0):** dock (one dock only), submersible (`reef-sub.glb`, 1.8x), elevator, interior, underwater tube + tube station (`reef-tube.glb`, `reef-tube-station.glb`), connector walkways (`reef-walkways.glb`).
- **Walkability registry:** every bridge/segment (names `spoke`, `row`, `set-ring`, `span-`, `hub-spoke`) is registered as a walkable surface at its deck top via `_v4T.addRideExtra`. Length read from `userData.len`.
- **Underwater tint** (water step 1): full-screen teal overlay when the camera is below the water surface.
- **Underwater train line code** (commit e70a8633): tube segments from the reef tube station to `WORLD_LAYOUT.stations[0].pos`, 6 m under water (under ground on land). Not verified in-game.

## Blender
- Source GLBs in `public/assets/reef/`: pod, station, interior, elevator, dock, sub, tube, tube-station, walkways, deck-segment, glass-bridge, home-S/M/L, shop, dome, door, atrium, city-hub, tower (tower is NOT placed), hub (old black-dome hub, NOT used).
- Blender scene: `REEF_CITY_VIEW` shows the compact layout (copies of the GLB pieces). Old collections are hidden, not deleted.

## NOT verified / known problems
- **Visual check is outstanding.** Screenshots need ~1,000 MB free RAM; the screenshot tool (`tools/_shot.cjs`, `HUBCAM=dx,dy,dz`) was blocked by RAM for most of the session. Last screenshot showed the chained walkways broken; the continuous-bridge rebuild has NOT been looked at.
- Door facing (rotation) not checked on screen.
- Walkability not walk-tested. Ramps from water to deck are NOT built.
- Smoke numbers are noisy: playable 85–182 s across runs. Draw/tri counts for some builds were identical to earlier builds (suspicious, check the placed objects in game).
- Underwater train line not verified (code only).
- Interiors missing for homes, shop, station pods. Activities (shop menu, hub mission board) not built.
- Ferries (boats between hub and stations) not built.

## Next steps (reef city, in order)
1. Screenshot the hub (`HUBCAM="-160,80,-160" node tools/_shot.cjs <out.png> "?time=0.5&reef=1"`) when RAM allows; compare with the floating-city and archipelago references. Fix the most visible gap.
2. Confirm bridges join and doors face the hub. Fix rotations if not.
3. Ramps from the water-level ground to the decks (registry hook already exists).
4. Walk test (headless): walk hub to a set, set ring, hub to a station; height stays on deck.
5. Interiors: home M, water shop, station pod lounge (Blender, from `docs/REEF-CITY-DESIGN.md`).
6. Shop menu (Sparks spend) and hub mission board.
7. Underwater train line: verify placement and the tube-to-world-station join.

## Race track (next system, after this)
- Track: `public/world-race-track.js` (`buildRaceTrack`), host bootRaceTrack (~line 5225), `window.__raceTracks`. Deck height via `groundAt` max over footprint and city clearance via `obstacleAt: CH.topAt` (12 m) are already in the code.
- Acceptance: `tools/_accept-race.cjs` (fixed the unit bug: `trackWorld` needs `U = 7/1.8`). It has NOT been rerun.
- Remaining race plan (from `jiggly-wishing-pretzel.md` S2): 11 AI racers and two-column grid; HUD km/h, boost bar, minimap (`?racehud=2`); racer ships via the `aiMesh` hook (`?racerships=1`); gate arches; speed lines; acceptance run.
- Visual target: racer clip (`O_7gfEIlmAVFXImV.mp4`): banked elevated track, red/white kerbs, cyan thruster glow, bloom, speed blur, HUD.

## Water terrain (after race, or in parallel)
- Done: underwater tint (step 1).
- Next: crest spray (GPUComputationRenderer), lens drops, underwater caustics and fish. Plan in `jiggly-wishing-pretzel.md` S3.

## How to start the next terminal
- `cd C:\Users\Brittany\Shaddai-3d && git status`
- Static server: `cd public && python -m http.server 3013`
- Probes: `node tools/_boot-smoke.cjs "?time=0.5&reef=1"`, `node tools/_accept-race.cjs`, screenshot as above. Check free RAM first (need ~1,000 MB).
- Blender is connected (5.2.2) via the MCP.
