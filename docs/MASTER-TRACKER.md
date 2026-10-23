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

## 0b. END OF 2026-10-16 (late) — state for the next session (owner at ~10% weekly usage)
- CITY = owner-driven: Blender 37_LAYOUT_PREVIEW (owner-placed 223 district buildings) + owner drawing (assets/world/city-zones-v1.json:
  4 C loops = original city restored, plot ring line, river loop) -> tools/city-fill.cjs -> assets/world/grid-fabric-districts-v1.json (v5: 886
  items, 118 plots, roads). Rendered by world-clusters-v4 (fabric), world-city-layout.js (roads/plots), world-canon-v4 (canon strips clipped to the
  loops), world-rivers.js (boats ride via _v4Water). Interiors + facade details read the same layout. DO NOT run tools/city-layout-gen.cjs --force.
- Hoverskate park MOVED to (-1382, 1647) m (PLAZA_SKATE marker + all keep-outs). Interiors staffed by K14 bots. Navi: modes + Mounts & Travel inside.
- ROOT CAUSE fixed (5c0dc9c8): three r180 skinned Box3 threw -> agents never loaded, player = capsule, board riderless. NEEDS OWNER BROWSER TEST.
- 2026-10-17 fix-up: _safeBox measures SKINNED meshes from bone world positions now - the raw bind-pose geometry measured 0.018 m
  (scale lives in the armature) -> auto-scale 389x = GIANT agents. Repro/numbers: `node tools/ual/measure-agents.mjs` (bone union 1.748 m, scale 4.0 = correct).
- OPEN: owner browser test (agent appears, O = board + rider, city look, river, park); district/realm aesthetic polish (glow per district,
  hero building looks); loading screen + agent select (ask owner what is wrong); dragons spawn check; Colosseum/Hover League final pass;
  push to main (Render autodeploys main; ~120 commits on agents/1 incl. the agents terminal's work) ONLY on owner "push".
- [x] PUSHED 2026-10-17: main = d954aad1 (merge of agents/1; tip tree byte-identical to agents/1). The 136-commit agents/1 history IS main's ancestry.
      NOTE: main's history also carries 6 "chore(push): staging chunk" commits + 2 seed rounds (`seedblobs/`, `seedblobs2/` carriers) - they were the only way past GitHub's 2GB/push limit
      (~2.6GB of fal-assets/docs-video binaries landed in one eaac7fde commit). Do NOT revert them; the merge after them is the deploy point. Render auto-deploys main.

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
- [x] Blender world file re-synced after the 2026-10-16 crash (1.5x HQ at 1737,-302.9 + v2 full-course deck), saved
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

## 2026-10-22 progress (world-finish pass: agents + NPCs)
- [x] **Council agents fixed (owner: "main agents dont appear correctly")** — all 7 GLBs shipped a T-pose bind clip (or deforming Meshy walk) after the 10-17 swap; two runtime retargeters (library + UAL) raced on load and UAL (roll-less bone aiming) twisted hands. Now the library set is BAKED into each file (`tools/ual/bake-agent-clips.mjs`, 23 clips, rotation + Hips only); bodies with the baked set skip both runtime passes; GLB ?v=14. Evidence: agents-not-tpose 7/14 -> 14/14, world-anim-agents 11/11, model-bounds 20/20; in-game probe (`tools/_council-probe.cjs`): all 7 present, 1.67-1.78 m, arms 28-45 deg down, forearm/hand stretch 1.000. Originals: `fal-assets/backups/agents-pre-bake-20261022/`.
- [x] **6 NPCs finalized** -> `public/assets/npcs/` (engineer, engineer-voxel, mage, scout, warrior, nexus-voxel): baked clips, textures WebP full-res (`tools/glb-webp.mjs`, 56 -> 21 MB incl. bots), Blender-checked.
- [ ] bot-lanky / bot-scrap: baked files exist but NOT placed — idle retarget holds forearms out through the torso on their long-arm rigs; needs a rig/retarget fix.
- [~] **`world-townsfolk.js`** (new, ?townsfolk=0 off): 9 posts — station towns (void x2, volcano forge, darkforest inn, desert hall, grid shop; checked vs realm-kit SOLID_R, all >= 4 m clear), Race HQ mechanic (8 m outside the GLB hook_door), 2 Colosseum sentries (from COLOSSEUM_WORLD door/front; lobby faces outward). In-game screenshot pass NOT run yet (RAM < 1 GB): `node tools/_townsfolk-probe.cjs`.
- [x] **Pose gate** in the baker (idle hands within 1.35x shoulder half-width, arm >= 15 deg down, feet, NaN) — calibrated: council + NPCs pass, bot-lanky fails. **+8 NPCs** (explorer, explorer-voxel, scout-voxel, warrior-voxel, mage-voxel, gabi, gaeli, harvester) -> 14 finalized in public/assets/npcs (36 MB), Blender-checked.
- [ ] **Forge operatives (realistic bodies) NOT finalized**: library retarget bends wrists back ~90 deg (fold idle) and splays arms ~2x out (arms-down idles). Tried: twist-only, full hand offset, rest hands, world-space (--world, experimental, wrong). Their *-final.glb files exist but are NOT wired; live game still uses *-walk.glb. Needs Meshy-native animations or a proper retarget. Bots (lanky/scrap) same class -> fal-assets/backups/npc-qa-fail-20261022/.
- [x] **Kit vertex colours fixed (owner-approved)**: shared builder MB.finish stored linear colours in a byte (sRGB) layer -> every shipped Blender kit ~13x too dark. Runtime fix public/kit-color-fix.js (GLTFLoader.load hook, /assets/kits/ only, ?kitcolorfix=0 = old); review page public/__kit-colors.html. New kits fix at source (fix_vertex_colors + vc_linear_ok extra, ACTIVE colour export).
- [x] **Realm scenes**: docs/blender/realm-scenes-20261022.blend — 10 REALM_<id> scenes built from world-realm-kits layout + K28_BUILD. Pipeline: tools/blender_dress.py (dress_add/dress_export) -> public/assets/world/realm-dress-v1.json -> public/world-realm-dress.js (instanced, normalized, colliders). Preview: public/__realm-preview.html (runs the real modules per realm).
- [x] **K28 realm landmarks** (Shaddai/public/assets/kits/_src/k28_realm_landmarks.py + k28b): Emberfall forge, Desert terminal, Arctic vault, Void station, Harbor Line — exported shaddai_realm_landmarks_<realm>_v01.glb, placed (DRESS_<realm>). Harbor position (behind station, piers away from city) NOT yet checked against open water.
- [x] **Walk-in interiors for every realm building**: public/world-realm-interiors.js registers realm-town hall/shop/tower/inn/workshop (+ landmark hook_interior_* with interior_recipe) with world-interiors-v3 (recipes: shaddai-hall, storefront-s, office, home, techlab/forge, market, bank, storefront-l). NOT yet walked in-game.
- [ ] Group B landmarks: suburb transit hub, meadow training yard, forest, darkforest, grid. Furniture kit (owner: needs more work). Realm gear cosmetics (owner idea: ice cleats/forge suit, void gas mask, desert head+feet wraps) via world-gear.js + world-realm-hazards.js, TURTLE design.
- [~] **K29 realm districts** (k29_realm_districts.py): every realm east district = 4 walk-in buildings + 2 homes + 1 claimable farm plot (hook_plot_* for deeds later; no economy wiring yet). Darkvault per owner ref #83 (guardian lodge, wooden lookout, cabins, fence).
- [ ] **OWNER IDEAS 2026-10-23 (next passes, not started):**
  - TERRAIN TITANS: large enemies on the land approach to each realm (refs CNCRONIN1, CNCJACK3/4, 02e10632): health bars, respawn timers, minion packs / smaller hostile agents; fights on foot.
  - REALM FORGE KEY: beat the realm's dragon + its titan -> earn that realm's forge key -> lets you bypass the realm battle (server-authoritative item).
  - ORACLE observatory: cosmic-web sky / real star systems; live moon-cycle API (phase, rise/set).
  - TURTLE studio: chakra / frequency / colour-wavelength / platonic-solid chart (ref download (2).png) as Listening Room modes.
  - FL Studio repo -> agent music tools in the Listening Room "Add".
- [!] **NEXT SESSION ORDER (owner 2026-10-22, after the laptop is reopened):**
  1. [x] 2026-10-23 K29 districts DONE: realm flair (_flair in k29_realm_districts.py), 70 GLBs exported HEADLESS (tools/k29_export_bg.py: blender -b --factory-startup; UI Blender exports froze/crashed) and verified 70/70 clean (only their own nodes); placed in realm-dress-v1.json (east districts, yaw -90, colliders). In-game walk not yet done.
  2. [~] 2026-10-23 viewer models: triaged 440 -> placeable static set; placed (batch 'viewer-20261023' in realm-dress-v1.json): transit stop + benches every realm, holo fountain (suburb), SHADDAI statue + retro booth (grid), trees by realm (orange: forest/meadow/suburb; dead: darkforest; crystal/alien: void), plants/grass, forge workbench + armor stand. REJECTED: wooden signpost (not futuristic), stage box. HELD (fix queue, owner said fix first): bio-pod tower, holo market, neon observatory, security keep, block-chain tower. Found + fixed: realm-dress/townsfolk loaders had no meshopt decoder (all viewer GLBs are meshopt). Preview race fixed; tools/_realm-preview-shot.cjs = headless realm screenshots.
  2b. [x] 2026-10-23 FIX QUEUE resolved: placed 12 (batch fixq-20261023: monowheel mech, holo market, ring arch, hover pods, sky dome, gold ring gate, crescent monument, ocean farm platform, harbor hub, block-chain tower UPRIGHT via tools/glb_fix_bg.py -> assets/models/fixed/); rejected bio-pod tower, security keep (+ signpost, stage); held neon observatory for ORACLE; 30 realm kits = fixed by kit-color-fix; hero-desert-terminal / hero-fortress / volcano-fortress are NOT live (dropped by default / ?volcano=1) so their 'needs inside' is moot; hero-castle already has a v2 interior. 37 characters -> rig track (step 4). Decisions written to public/__asset-notes.json (status field) for the viewer.
  3. Agents in game (deeper look + behaviour) and the city/Athenaeum work above.
     - [x] 2026-10-23 townsfolk = code-built BOTS (world-bot-bodies: scrap/lanky/unicycle/analyst, realm colourways, wave on approach), 2 per station + race-HQ unicycle + 2 colosseum lankies; no council agents/lookalikes (owner rule).
     - [x] ORACLE room -> 'observatory' (triple-lens telescope array, chairs, holo star-map, starfield; arcane room kept); QUILL -> 'library' (+Quill Tree); TURTLE -> 'museum' (+Genesis sculpture). world-interiors.js v=20261023b. Not yet seen in game.
     - [x] City fill LAYER tools/city-fill-plots.cjs (on top of city-polar.cjs output, tagged fill-20261023, --undo): every other ring plot = pre-built themed property (80), other 79 stay open claimable pads; +28 Athenaeum district buildings. Backup fal-assets/backups/grid-fabric-districts-v1.pre-fill-20261023.json. (I overwrote tools/city-fill.cjs by mistake — restored from git HEAD, identical.)
     - [x] 2026-10-23 MODEL PLACEMENT COMPLETE: every viewer-queue file has a status in __asset-notes.json (placed / fixed / held / rejected / skipped / in-game). Only characters remain (rig track, step 4).
     - [x] Listening Room (TURTLE studio, L at the ring) + 432 Hz / note colours / cymatics / sacred geometry; Athenaeum exterior facade pass; NAVI holo-arc swivel; QUILL floating swivel bookcases; Colosseum intro (world-colosseum-intro.js); ORACLE portal renamed The Observatory.
     - [x] Runtime error 'matrixWorld of undefined' GONE (status probe: 0 errors) after townsfolk -> bots.
     - Dashboard/backend wiring handoff: docs/HANDOFF-DASHBOARD-WIRING-20261023.md
     - [ ] (old note) OPEN: in-game runtime error 'matrixWorld of undefined' in SkinnedMesh bounding sphere (x4) — bisect with tools/_error-probe.cjs + kill switches (likely old townsfolk GLB clones; townsfolk now bots).
  4. Finalize NAVI, buttons and controls, then the rigging (Forge operatives + bots retarget).
  5. Make sure Grok bots (any external agent) can be added in: they join through the provider-agnostic ingress (gateway webhook entry, provider = free text), get a body in the world and appear in-game.
- [!] **HANDOFF 2026-10-22 (session out of budget) — read first next session:**
  - Realm gear DONE in code + tests (desert-sun hazard, Desert Wrap, Frost Kit, Void Respirator counters void; world-gear-wear.js draws it, 6/6 test). Gear ART is placeholder primitives -> needs a K30 Blender gear kit fitted per head size.
  - K29 districts: script ready (k29_realm_districts.py, 70 pieces) but every shaddai_dist_*_v01.glb on disk is CONTAMINATED (contains the void landmark) — they were pulled from realm-dress-v1.json (game is clean: 5 landmarks + Emberfall props only). Exporters were rewritten to export_isolated() (temp scene, no selection) but that path is UNTESTED: Blender crashed on the first run. Next: set window scene in one call, build+export ONE realm per call, verify each GLB node list = only its piece, then dress_add + dress_export + save.
  - Blender crashes under load on 8 GB: one realm per call, save after each, close other apps.
  - Owner feedback: agents/NPCs look basic; wants deeper agent + city work (themed buildings, Athenaeum rooms/classes/studio, TURTLE museum, QUILL library, ORACLE observatory telescopes, arcade, streets, property buildings). Not started — needs the in-game audit first (~1 GB RAM).
- [ ] **OWNER ORDER 2026-10-22 (one full pass each, in this order):**
  1. Realm gear: wearable 3D masks/suits/cleats/wraps (rules already in world-realm-hazards.js) + NEW desert sun/heat hazard + head-and-feet wrap.
  2. Fill the SHADDAI Grid circle (centre city ring).
  3. Finish each inner city's themed buildings.
  4. SHADDAI City buildings: elevators, insides, platform tops, hover-ship take-off/landing pads.
  5. Hoverskate: proportions so you can really hover + skate the features (maybe indoors).
  6. Ground polish: no terrain poking through / overlaps in realms; train seats; water; desert sand; SHADDAI City + grid ground.
  Later: polish void + harbor landmarks; furniture kit; Forge rig retarget; bots rig fix; townsfolk probe.
- [ ] Next: run the townsfolk probe; props batch (world-placements module, keepers measured in Blender); wilderness fighters (council-lookalike rigs); doors on buildings; fix-pile.

## 2026-10-23 progress (edge realms + studio)
- [x] Pushed agents/1: 708665bb (code) + 25ac17d1 (105 GLBs). Not main.
- [~] **EDGE REALMS (owner: beyond the rim, not on map, foot only + unreleased cosmetic)** — Blender kit K31 (`Shaddai/.../k31_edge_realms.py`,
  headless `tools/k31_export_bg.py`): Cloud Harbor (ocean side), Ascension Arch (arctic), Scripture Veil (desert, glyph ribbons),
  Ringworld Rise (meadow; ring-arch city + crest RING ROAD with ambient ring cars), cloud sea ring + world-edge monolith curtain,
  SKYWARD PORTAL floating off the Sky Nexus deck (sealed). Runtime `world-edge-realms.js` (?edgerealms=0): gate toasts "foot only" /
  "sealed — Skyward Pilgrim Veil (not yet released)". NOT built: actually crossing (needs server-side cosmetic check + rim-clamp
  exception + deck ground height), boarding ring cars, walkable portal stair. Sky realm = later.
- [x] TURTLE studio **Binary Vision** (`world-binary-vision.js`, button in the Listening Room): live mix or a dropped local file as
  glitch byte-grid / digraph (method: binary-visualization, BSD-2, Mitja Felicijan). Owner glitch refs = the target look.
- [ ] Owner refs to use: elevator pods (Athenaeum + academy lifts: glass capsule cars on chrome rails), NAVI (central emblem + module
  ring + hex bar + side panels; holo command-centre rings), furniture sheet (furniture kit pass), agent art (cymatics / pixel glitch / chakra chart).
- [ ] PERF (measured 2026-10-23, `tools/_perf-breakdown.cjs`): ~1,365-1,650 draw calls everywhere (budget < 80), ~4.3M tris, far plane 4 km.
  Top: unnamed Mesh/Group ~590 in view, static-merge 160, world-fill 70. Needs an owner-approved plan (merge/instancing + view-distance tiers).
- [ ] Skinned-mesh `matrixWorld of undefined` x4 (three frustum test computeBoundingSphere on a SkinnedMesh with a missing bone) — find + fix.
- [ ] 276 tracked GLB deletions: 275 referenced only by QA lists (__asset-notes / __glb-scan / __opus-placement-queue); 1 in realm-dress-v1.json — identify before committing deletions.

## 2026-10-23 finish pass - DONE on agents/1 (not main)
- [x] Underground Bazaar under the Grid centre circle (neon cavern, pyramid tip in the circle, 3-stop Grid lift bazaar/grid/Sky Nexus, Colosseum + Undersea lines)
- [x] Hidden fight pit INSIDE the pyramid (south-face keypad, code 0777 via window.SHADDAI_PIT_CODE - move server-side before prizes)
- [x] Athenaeum K33 (white/gold, 2 floors, capsule lifts, vaulted roofs) + all 7 council halls K34 (colonnades, seating, centrepieces)
- [x] Colosseum walk-in lobby, mode screen at the inner doors (spectate / hover league / naval / practice / tournament coming soon)
- [x] Clean HUD + NAVI Settings (toggles, look speed, invert Y, controls list, F1); live MARKETS + NEWS (NAVI + ZEROX wall + news screen)
- [x] Race flow: Race HQ lobby + start elevator open the car select, car-only tracks, walkers returned to the lobby
- [x] Edge sky cluster off the east rim: Aurelia Sky City over the Suburb, Veil, Ringworld Rise, Cloud Harbor below, sky bridges; Ascension Arch NW
- [x] Suburb garden star city K35 (TURTLE design: hexagram terraces, 12 themed gardens, <=50 domes, lifts/ladders to the sky city)
- [x] District heroes = sci-fi towers (spire 300 / setback 240 / slab 220 m); floating pennants removed; forest + grid realm towns placed
- [x] Emerald sparkle water tune; perf guard (speck cull, bad-skin bounds) - 0 runtime errors; new kit GLBs packed (tools/glb-pack.mjs)
- [ ] NEXT: load-timing boot + load-speed pass (needs RAM - restart Blender first); draw calls ~1600 vs 80 budget (merge/instancing)
- [ ] LATER: building look polish (roofs/accents/cluster variety), realm wilderness fill, garden-city roads, hover-skate park rework, affiliate mall, agent arcade

## 2026-10-23 (late) realm finish pass - agents/1, Blender REALM_VIEW mirrored (collection FINISH_20261023; backup realm-view-20261023-before-finish.blend)
- [x] Dragons: the rigged dragon GLB now takes each element's colourway (BoneRig tints cloned materials) - 7 distinct dragons; dragon tests 46/46
- [x] ROADS to every realm (world-realm-roads.js <- realm-roads-v1.json <- tools/gen-realm-roads.cjs): city edge -> under the rail spoke -> station -> realm-heart town; bridges over river/sea; accent glow strips
- [x] SKYLINE SPUR rail: Suburb station -> Star City stop (on the ring train menu) -> Cloud Harbor gate (sealed); shuttle runs it
- [x] REALM-HEART TOWNS (realm-towns-v2.json <- tools/gen-realm-towns.cjs, TURTLE patterns): 8 towns, 137 kit buildings; Emberfall town INSIDE the terrace ring; Crystal Sea town on a floating deck
- [x] BIOME SCATTER (world-biome-scatter.js <- biome-scatter-v1.json <- tools/gen-biome-scatter.cjs): 6701 code-built pines/broadleaf/snow pines/boulders/hoodoos/crystals/lava rocks/shrubs + 3 sand arches, chunked 1200 m + culled
- [x] SKY CLUSTER re-layout on one axis (compass 97): Star City -> bridge -> Cloud Harbor (-20 m) -> ramp -> Sky City (+60 m), Veil north + Rise south flanking with 150 m gaps; TURTLE bridges 30/20 m, amber->teal edge light
- [x] Cloud bank under the sky cluster: +2600 m outward, 1.7x billows (k31 cloudsea re-exported)
- [x] Blender: maglev ring + spokes + station platforms, joined river ribbons (old flat city_rivers hidden, not deleted)
- [ ] Owner look: Emberfall terrace town + sky layout in Blender; then the speed/FPS pass

## Notes
- PUSH: main push stopped at branch slice 40/102 (system low on memory with Blender open). Restart only when the owner says (branch slices first, then main).
- Disk C: was 432 MB free on 2026-10-16; world .blend1 deleted (owner OK). Owner wants unused GLB/zip files found and removed - list first, owner picks.
- The game city = canon-v4.glb + grid-fabric-v4.json (world-clusters-v4.js keeps ~30% by hash and drops offices); world-grid-city-v4.js is NOT loaded.

## Owner decisions waiting
- agents-not-tpose: retire baked-clip checks or re-bake (section 4) · re-rig spend for ORACLE/PIKADON/VILLAIN
