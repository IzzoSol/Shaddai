# HANDOFF: race track (for the other terminal), 2026-10-10

Repo: `C:\Users\Brittany\Shaddai-3d`, branch `feat/world3d` (local, not pushed). Last commit: `22dc6d82`.
Reef city is saved behind `?reef=1`. Do not touch the reef code from the race terminal.

## Start here
1. `git status` and `git log --oneline -5`.
2. Check free RAM (browser probes need ~1,000 MB). Close Chrome windows if needed (ask first).
3. Static server: `cd public && python -m http.server 3013`.

## Race track: where it is
- Track builder: `public/world-race-track.js` (`buildRaceTrack`). Host boot: `bootRaceTrack` (~line 5225 of `SHADDAI-WORLD-3D.html`), stored at `window.__raceTracks`.
- Deck height is already computed as the max ground height under the deck footprint (`groundAt`), and the deck clears city towers by 12 m (`obstacleAt: CH.topAt`).
- Race run: `window.__raceRun` (`world-race-run.js`), start hook `window.__raceStart(cid, opts)`.
- Acceptance script: `tools/_accept-race.cjs`. Its unit bug is fixed (use `U = 7/1.8`). It has NOT been rerun since the fix.

## Race steps left (from `jiggly-wishing-pretzel.md`, S2)
1. Run `node tools/_accept-race.cjs` and record the result.
2. 11 AI racers and a two-column staggered grid.
3. HUD: km/h, boost bar, minimap (`?racehud=2`).
4. Racer ships through the `aiMesh` hook (`?racerships=1`): capsule hull, twin nacelles, about 4k triangles.
5. Gate arches and boost pads on the track.
6. Speed lines (2,000 GPU points).
7. Acceptance run again and screenshots.

Visual target: the racer reference (`Pictures\O_7gfEIlmAVFXImV.mp4`): banked elevated track, red and white kerbs, cyan thruster glow, bloom, speed blur, HUD.

## Check first
- Track deck and city towers: confirm the acceptance log shows the deck above the footprint everywhere.
- The reef build's last smoke showed draws 3,506 and triangles 15.6M (up from about 3,150 and 2.9M). Not explained yet. If the race work also raises those counts, check it against this number.

## Known open items outside the race (not for this terminal)
- Reef city: visual confirmation in game; the underwater train line to the world station; interior rooms for seating, storage and shops (see `docs/MASTER-PROMPT-WATER-REALMS.md`).
- Water: crest spray, lens drops, caustics. Underwater tint is in.
