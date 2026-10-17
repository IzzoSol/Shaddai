# HANDOFF: water realms, canals, Colosseum, academy, agentic race (2026-10-10)

Repo: `C:\Users\Brittany\Shaddai-3d`, branch `feat/world3d`, local (not pushed). Last commit `15879002`.
Reef city is behind `?reef=1`. The default page is unchanged.

## Where the reef city belongs on the map
- The atlas (`Downloads\image (34).jpg`) puts the water on the southwest side: the **Crystal** region, beside the **Harbor Line Station**.
- In code: realm `ocean` ("Crystal Sea"), `public/world-layout.js` line ~57 (centre P(2.70,1900), radius 620, water, dock P(2.62,1250)). Station `harbor` at compass 225 (line ~73).
- Plan: move the reef city's centre into the Crystal Sea realm, centred on the Harbor Line Station, instead of its current spot near the spawn. The hub, sets, stations, harbour and walkways stay as they are; only the anchor changes.

## Reef city: state
- Built: hub (floating-city asset) with atrium; four sets (homes M, water shop, dome with interior), 66 m out; four stations at 150 m (wood decks removed); front walkways and set ring; harbour office (212 m) and pier (235 m) with walkways; ferry; elevator with underwater stop; underwater tube to the world station (code only).
- Blender is the layout source of truth (`REEF_CITY_VIEW`). The game matches it.
- Not yet verified in game. Layout and walkways need a screenshot pass.

## Next steps, in order
1. **Reef into the Crystal realm.** Anchor the reef on the Harbor Line Station's water (compass 225). Check the Crystal Sea realm's water, islands and props clear the reef footprint.
2. **Water canals** from the reef and harbour out to each realm and the world train: Arctic (ice canal), Emberfall (lava channel), Deep Void (void channel), Sand Sea (silt canal), Darkforest and Meadowfields (river canal). Flow follows terrain; the water material changes per biome (ice-blue, molten, plasma, silt, green).
3. **Realm ships** per biome, upgrade slots (speed, cargo, armour, biome adaptation). The base is `reef-ferry.glb`.
4. **Rooms** for seating, storage and shops in the reef buildings (see `docs/MASTER-PROMPT-WATER-REALMS.md`).
5. **Underwater train** finished: tube to the world station, train car, movement.
6. **Colosseum** (Southern Colosseum on the atlas): stages 7+ in `docs/COLOSSEUM-AND-DRAGONS-SPEC.md`.
7. **Agent academy:** `docs/ACADEMY-HANDOFF-20261003.md`, `docs/ACADEMY-AGENT-GUIDE.md`.
8. **Agentic race** (next big system): see the race handoff below.

## Race (next after the water work, or in another terminal)
- Full state: `docs/HANDOFF-RACE-TRACK-20261010.md`.
- Track builder: `public/world-race-track.js`; host boot `bootRaceTrack` (~line 5225); `window.__raceRun`; `window.__raceStart`.
- Acceptance: `tools/_accept-race.cjs`. Fixed, not yet rerun.
- Steps left: acceptance run, 11 AI racers and grid, HUD, racer ships, gates and boost pads, speed lines, acceptance and screenshots.
- Agentic element: AI racers should be the agents (use the Academy agents).

## Checks before any push
- Free RAM about 1,000 MB for probes. Ask before closing Chrome.
- Smoke: `node tools/_boot-smoke.cjs "?time=0.5&reef=1"` (0 page errors).
- Watch the draw and triangle count: the last reef smoke showed 3,506 draws and 15.6M triangles, up from about 3,150 and 2.9M. Not yet explained.
- No push to `main` without owner approval.
