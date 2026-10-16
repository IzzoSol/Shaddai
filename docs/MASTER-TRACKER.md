# SHADDAI WORLD — MASTER TRACKER (start here; one list, owner order)
Started 2026-10-15 from: docs/HANDOFF-20261015.md, docs/WORLD-COMPLETION-PLAN.md, docs/GAMEPLAY-EXPANSION-20261002.md,
docs/WORLD-CONTRACTS-BACKLOG-20261009.md, docs/HANDOFF-GLM5-20261011.md and the owner's chat orders. Those docs keep the detail;
THIS file is the order + status. Tick an item only when it is wired into the game AND tested (node test and/or Blender/browser shot).

**Owner order (2026-10-15):** hover arena → Colosseum finish → train → character rigging + attacks → land/terrain polish →
cities + homes + furniture + interiors + Athenaeum → full-world polish (place + polish the whole world in Blender first, then
check it in the game) → FPS / speed / loading in depth. Agents' fighting/clothing/cosmetics last.
**Rules:** ask before fal spend or deletes · one heavy job at a time (8 GB laptop, C: ~2 GB free) · futuristic only · owner approves
visuals · `*.glb` gitignored (`git add -f`) · bump `?v=` on edited script tags · headless browser OK (owner 2026-10-15), never visible.

Legend: [x] done + tested · [~] partly · [ ] open · (flag) = URL switch to turn it off

## 0a. Done 2026-10-16 (Opus session) — node-tested, NOT yet seen in a browser
**Owner order (2026-10-16):** reefs + race tracks → Colosseum polish (Hover League to concept art) → Navi + mounts wired → hoverskate
park finished → boats/dock at the reef + furniture everywhere → FPS + polish → agent rigging, hoverboard moves, agent fighting.
- [~] REEFS ON BY DEFAULT (?reef=0): Reef A + Reef B at the owner's Blender spots/rotations (REEF_A/REEF_B empties, collection
      30_REEF_CITIES), hub pivots, glass bridge A<->B (walkable), undersea glass tube + shuttle train Reef B -> west islands -> Reef Line
      Shore station (city SW edge); tunnel-line cutscene Shore <-> Colosseum subway, Reef <-> Reef B (?reeftwin=0 ?reeftrain=0)
- [~] Reef B harbour + BOAT HIRE at both harbour houses (E: Aqua Cabin-Glider / Rimba Pod)
- [~] SKYLINE CIRCUIT = the long race ('grand-course', replaces Meridian-8, which is hidden from the menu, kept in code; Blender
      W_race_meridian8 hidden, WORLD_race_skyline added): r1450 sky ring, ground pit at Race HQ with ~1 km climbs, two trochoid
      crossover loops (N -10 deg, S 170 deg, flyovers), deck rises when selected — world-race-skyline 7 tests
- [~] RACE HQ (Blender K27, kits/_src/k27_race_hq.py): showroom + race desk (short race / full course / showroom / upgrades soon)
      beside Dragon Gate — world-race-hq 3 tests. Car ownership is client-side (shd.raceGarage) like the old garage -> server before money.
- [ ] Headless browser pass of all of the above (needs Blender closed: 1.1 GB free with it open)
- [ ] Jump ramps on the deck (K6b race_jump_ramp + ramp physics) · Upgrades shop
- [~] FULL COURSE v2 (owner Blender lines): north + south connectors (X flyover by the HQ) join Dragon Gate to the sky ring; lap =
      connector up, ring + crossovers, connector down, a Dragon Gate figure-8 (13.2 km); Race HQ at the owner's spot, 1.5x + beacon
- [ ] Blender world file is BEHIND the code after the 2026-10-16 crash: re-run k27 (1.5x HQ at 1737,-302.9) and re-import the v2 deck
      (tools/ual/race-kit-export.mjs grand-course) into WORLD_race_skyline; the owner's annotation lines were not saved
- [ ] NEXT (owner 2026-10-16): every realm city finished with its own aesthetic · terrain (snow, trees) · designed roads · collisions
      on buildings/roads · REAL USES for the many buildings (needs a design pass with the owner: shop / job / home / service per building)

## 0. Done 2026-10-15
- [x] Hoverboards v02 detail pass (turbine pods, kicked armour, rim band, fins, chamfered pods) — `_src/k22b_board_details.py`, 11 tests
- [x] HOVER LEAGUE Colosseum field mode: rules core (hold/shoot/drop on ram or bolt, goals, boost, power-ups, demos, paint mode, bots),
      view (rim quarter-pipe, energy barrier, Cyon/Magma floor, K26 goals/pads/dais), 6 balls (SHADDAI default + regular chrome +
      plasma/inferno/void/solar energy shaders), energy-orb bolts, HUD + picker, I > Fight entry — 15 + 11 tests
- [x] Riders on boards: ollie pop/tuck, land, boost tuck, wall hand drag, bail, carry/shoot/bolt/ram/stun; league bots = real rigged
      agents on board rigs — 13 tests + Blender clay sheet
- [x] Colosseum: MODES > Colosseum black screen (fade never lifted after an error) · entrance faces OUTWARD (?colface=city) · arena tests 17/17
- [x] Train: Colosseum metro wears the K9 hall (?metrokit=0) · reef/Harbor line = instanced K9 glass tubes + K9b shore portal (?glasstube=0) · K9 rails fixed
- [x] Merged GitHub main, all suites green except the stale baked-clip test (below); push to main started 2026-10-15 20:25

## 1. Hover arena — needs the in-game look
- [ ] Headless browser pass: Hover League screenshots (ball shaders, rim lanes, barrier, board on the curve), console clean
- [ ] Hover RACES on the real race track: hoverboards as racers + item randomizer + attacks + respawns (owner: not in the arena)

## 2. Colosseum finish
- [ ] Headless check: enter via MODES and via the door (no black screen), walk in through the flipped lobby, nothing clips the terrain/ring
- [x] K13 Blender grand lobby on the exterior (?lobbykit=0) — tools/ual/landmark-kits.test.mjs
- [ ] Stairs + stair-walk proportions (owner list) · colosseum interior polish pass

## 3. Train
- [x] Metro hall + glass tube line (above)
- [ ] Station hubs per realm (heal, rest, shop, NPCs) — plan item 4 · realm connections audit (every realm reachable)

## 4. Characters: rigging + attacks
- [x] Board rider moves (above)
- [ ] Wire `world-combat-core.js` (35 tests, sword combos) into the host after a play-test (behind ?combat=1 first)
- [ ] ORACLE / PIKADON / VILLAIN re-rig (Meshy v6 ~$0.80 each — ASK) · ORACLE toe roll in Lunge_Spin_Kick
- [ ] `tools/tests/agents-not-tpose.test.cjs` 7 FAIL: it checks the GLBs' BAKED idle; since 7bb87b8e the shared library (world-anim.js) owns
      the moves and that half passes for all 7. Decide: retire the baked-clip half or re-bake idles (owner call)

## 5. Land / terrain polish
- [ ] Screenshot-led terrain pass (old handoff #6): realm terrain blending, detail normals, floors that look basic
- [ ] Water: wakes behind boats/ships, shallows + glare (owner ref ssstwitter.com_1791510361565.mp4) — owner order #2 earlier
- [ ] Lava (Emberfall: ring city round a spired citadel, lava rivers/falls, rune pads) — old handoff #8
- [ ] Realm palettes per owner refs (desert + water videos) · plots design (owner will send look) + cut the ~1275 SW plots

## 6. Cities + homes + furniture + interiors + Athenaeum
Kits BUILT in Blender but NOT in the game (copy to public/assets/kits + wire):
- [x] K1 towers: 24 in the LIVE city (grid fabric sc-tower-*, Blender LODs, survive the game's fabric filters) — tools/grid-city/k1-*.{cjs,mjs}, fabric test
- [ ] K2 sign kit (8 signs) → districts
- [x] K15 Athenaeum rotunda replaces the code rotunda shell + balconies (?athkit=0) · [ ] Athenaeum rooms + cowork hall
- [ ] K18 desert homes · K21 forest pod homes → realm towns
- [ ] K11 hoverskate kit · K14 Grok/Muse wheel-bots
- [ ] 7 SHADDAI buildings in + out · doors on every enterable building · futuristic furniture kit v2 (owner home-inventory refs)
- [ ] Quill floating-shelf library · Navi 3D holo-ring command centre (owner refs) · Forge flow (Bind/Body/License/Labor + PayBox vault)
- [ ] Realm city buildings per realm (K10 is wired via world-realm-kits.js — check look) · floating billboards (fixed ad slots, approval queue)

## 7. Full-world polish (Blender first, then the game)
- [x] Blender file organised: 00_WORLD (visible) / 10_KIT_LIBRARY / 20_STUDIO (hidden); world collections un-hidden; .blend1 backups off
- [x] Blender city = the GAME city: canon-v4.glb + the 827 live grid-fabric buildings (same filters as the game) as library instances; old 318-plan city kept hidden in 20_STUDIO
- [ ] Bring the Blender world file (docs/blender/shaddai_world_20261015.blend) in line with the game: every wired kit placed at its
      game position, every unwired kit above placed, then compare against the game layout (WORLD_LAYOUT) and fix gaps
- [ ] Headless walk-through: city, each realm, Athenaeum, Colosseum, park, race, reef, harbor — screenshots + console
- [ ] Clutter pass (owner: less clutter) · night city (contract 2) · lighting quality (contract 4)

## 8. FPS / speed / loading (last, in depth)
- [ ] Measure first (?perf=1 HUD + headless timings): load time, draw calls, tris per area
- [ ] Park dressing 41 draws → BatchedMesh per material (~10) · terrain tile merge (~190 draws) · shared building materials
- [ ] Streaming: load < 1400 m, unload > 1800 m (contract 10) · light loading screen


## 2026-10-16 progress (Blender-first pass)
- [x] GAME FIXES found through the Blender world: layout v4 default (stations ~2.5 km off, Colosseum inside the city) · ~2400 ghost walls
      (canon colliders of thinned fabric lots) · 18 fabric buildings inside the park · K1 towers picked from lots the game really shows
- [x] Homes: K21 forest pods (suburb + harbor) + K18 desert village (desert station) — enterable · Bots: K14 Grok/Muse on PORTER/CLERK
- [x] Blender world matches the game: game city (canon + live fabric + K1), park at PLAZA_SKATE, 15 Blender homes, Dragon Gate race + race kit
      (tools/ual/race-kit-export.mjs), the REAL Colosseum exterior + K13 lobby (tools/ual/scene-export.mjs) with the Hover League field inside,
      coloured viewport (terrain colour map, sea), v3/v4 check markers (hidden)
- [ ] Reef City + glass-tube line only load with ?reef=1 (decide in the FPS pass) · district signs (place in the browser pass) · Meridian-8 is
      not the default circuit (?tracks=meridian-8) · realm code homes not in Blender (code-built)
- Branch: the other terminal moved the shared checkout to agents/1; world commits continue there (feat/world3d is an ancestor). Owner picks (a)/(b).
- NEXT: FPS pass from docs/HANDOFF-FPS-FRONTEND-BACKEND-20261016.md + the owner's FPS file, then the browser walk-through.

## Notes
- PUSH: main push stopped at branch slice 40/102 (system low on memory with Blender open). Restart only when the owner says (branch slices first, then main).
- Disk C: was 432 MB free on 2026-10-16; world .blend1 deleted (owner OK). Owner wants unused GLB/zip files found and removed - list first, owner picks.
- The game city = canon-v4.glb + grid-fabric-v4.json (world-clusters-v4.js keeps ~30% by hash and drops offices); world-grid-city-v4.js is NOT loaded.

## Owner decisions waiting
- agents-not-tpose: retire baked-clip checks or re-bake (section 4) · re-rig spend for ORACLE/PIKADON/VILLAIN
