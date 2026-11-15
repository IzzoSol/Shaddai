# REALM SYSTEMS INVENTORY — everything that exists, what's wired, what's missing

- **Date:** 2026-11-15 · **Scope:** MAIN 3D realm only — `public/SHADDAI-WORLD-3D.html` + `public/world-main.js` + all `public/world-*.js`, on branch `realm-fix-for-main-2026-11-15` (the code live on GitHub main as commit `207d30a`). The lightweight `world3d.html` realm and the 2D `game.html` world are covered only where they share systems.
- **Method:** file census from disk + the HTML boot template + `world-main.js`'s dynamic loader; header/API read of all 180 modules; targeted greps for consumers, endpoints, storage keys, WebSocket/presence, collision and audio; cross-checked against the four diagnosis docs in this folder (AUDIT.md, VIDEO_ISSUES.md, ZEROX_AND_LOAD_DIAGNOSIS.md, BUTTONS_FOG_CITY_DIAGNOSIS.md, MOBILE_PASS2_PLAN.md). Research only — no code was edited.
- **Labels:** FACT = read from files in this pass. INFERENCE = deduced from those facts. States: **LIVE** = loaded and invoked on a default load · **PARTIAL** = loaded/invoked but a major piece is gated, dead, stubbed or deferred · **ORPHANED** = not loaded by this page and no consumer · **SUPERSEDED** = loaded but replaced by a newer module in the default path.
- **Branch note:** the working tree was on `realm-fix-wave1-2026-11-15` during this pass; that branch differs from the target branch in only 4 realm files (`world-main.js`, `world-perf-guard.js`, `world-survival.js`, `world-colosseum.js` — the wave-1 fixes). Census and wiring facts are identical on both; where a wave-1 fix changes a "today" behaviour it is flagged.

## TL;DR counts

| | Count |
|---|---|
| `world-*.js` files on disk | **180** |
| Referenced by the MAIN realm (HTML boot template + world-main dynamic loads) | **172** |
| — loaded via the HTML boot template (or the dist bundles built from it) | 142 |
| — loaded dynamically by `world-main.js` (`_loadScript` chain / ES import) | 30 |
| Not loaded by MAIN at all | 8 |
| State: LIVE | **156** |
| State: PARTIAL | **11** |
| State: ORPHANED | **7** |
| State: SUPERSEDED | **6** |

The realm is not short of systems — it is short of *finish*: the biggest gaps are a city that exists only as data, multiplayer presence that flows but is never rendered, and a set of finished pure-rules modules (combat core, fishing, castle siege, weapons, agent gear) with no consumer wired to them.

---

# 1. MODULE CENSUS

How loading actually works (FACT): `SHADDAI-WORLD-3D.html` carries a `<template id="boot-scripts">` listing **142 classic scripts** in load order. `tools/boot-dist-guard.cjs` serves the 3 prebuilt `public/dist/boot-*.js` bundles instead when they are fresh (same order/globals, minified); if stale/missing, the page falls back to the 142 individual files. `world-main.js` (ES module, content-hash `?v=`) then dynamically loads **30 more** modules through its `_loadScript` chain during the loader steps. **172 of 180** files are therefore referenced; the 8 never referenced are `world-agent-gear.js`, `world-castle-siege.js`, `world-combat-core.js`, `world-fishing.js`, `world-gate.js`, `world-grid-city-v4.js`, `world-siege.js`, `world-weapons.js`.

Also in the boot but outside the `world-*.js` census: `sparks-ledger.js` (the Sparks wallet, §3), `world-layout.js` (counted above; the shared map data), `athenaeum-layout.js`, `academy-code.js`, `portals/portals-registry.js`, `portals/portal-plots.js`, `portals/portal-dome.js`, `beta-api-shim.js`, `sw-heal.js`, and the vendored three.js r180 (`public/vendor/three/`).

**Default-map fact that drives many states:** `MAP_V4` defaults to **true** (`world-main.js:556` — v4 is the default; `?map=v3`/`?map=legacy` opts back). Under v4, the HTML still *loads* the v3 terrain/biome/ocean/trails/landmarks modules, but `world-main.js` never builds them — they are SUPERSEDED, not orphans: they are the live path again under `?map=v3`.

### Boot, core & performance (16 files)

| File | Size | Lines | Loaded by HTML? | State | Purpose (from file header) |
|---|---|---|---|---|---|
| `world-auto-merge.js` | 6KB | 82L | No — loaded dynamically by world-main.js | LIVE | STATIC MESH MERGE for draw calls (owner 2026-10-16: "fix draw calls ... SPEED ... no lag"). * The draw profile showed ~2,000 draw calls at spawn, most |
| `world-batch.js` | 8KB | 82L | Yes (boot template) | LIVE | STATIC BATCHER: merge thousands of tiny static meshes into a few draw calls (the biggest FPS lever on integrated GPUs; profile: ~2000 calls, most from |
| `world-copy.js` | 7KB | 48L | Yes (boot template) | LIVE | the SHADDAI copy bank: citizen chatter, council-agent greetings, vendor lines, toast variants, idle tips (owner 2026-10-01: QUILL writes the popups an |
| `world-devkit.js` | 6KB | 95L | Yes (boot template) | PARTIAL | DEBUG HARNESS (2026-10-08, plan S0a). Never debug a moving frame. * ?devkit=1 enables the keys: F8 = freeze/thaw the sim clock (dt = 0, render keeps r **Note:** Debug harness, ?devkit=1 only. |
| `world-editor.js` | 10KB | 142L | Yes (boot template) | PARTIAL | in-game PLACEMENT EDITOR (admin), 2026-09-25. * * Always-on core (tiny): modules call window.__registerPlaceable(key, object3D, info) for every placed **Note:** Admin placement editor (?edit=1); always-on registry core is tiny. |
| `world-gate.js` | 8KB | 120L | No | ORPHANED | ══════════════════════════════════════════════════════════════════ SHADDAI — WORLD ACCESS GATE (world-gate.js) Entering the 2D world requires SIGN-IN  **Note:** Live for the 2D realm (game.html) — never loaded by the 3D page, by design. |
| `world-hud-clean.js` | 9KB | 113L | Yes (boot template) | LIVE | CLEAN SCREEN while playing (2026-10-23, owner: "the game buttons and camera angle movements in settings in the navi, * better clear screen when playin |
| `world-layout.js` | 25KB | 330L | Yes (boot template) | LIVE | SHADDAI World shared map layout (single source of truth). * Loaded as a classic script BEFORE the world module. Modules (terrain/biomes/vehicles) * an |
| `world-light-budget.js` | 3KB | 46L | Yes (boot template) | LIVE | LIGHT BUDGET (2026-11-05, owner: "get the textures and speed and fps down"). Measured: 40 lights in the scene. three.js * shades every lit pixel again |
| `world-loading-slides.js` | 5KB | 56L | Yes (boot template) | LIVE | the loading-screen SLIDESHOW (owner 2026-10-02): full-bleed art of the agents + the world behind the progress bar. * COMPOSITOR-DRIVEN (2026-10-03 fix |
| `world-main.js` | 602KB | 6715L | Yes (boot template) | LIVE | the world boot module, moved out of SHADDAI-WORLD-3D.html so the browser can cache it (2026-10-24, docs/SPEED-BRIEF-20261024.md). * The HTML loads it  **Note:** Boot module (ES module, content-hash ?v=). Owns renderer, loader chain __LD, governor _Q, agent bodies, combat surface, Bazaar. |
| `world-merge.js` | 4KB | 42L | Yes (boot template) | LIVE | ONE shared static-bake helper (2026-10-04). Replaces the per-module copies going forward. * WorldMerge.bake(root, THREE, { skip?: Set<Object3D>, name? |
| `world-perf-guard.js` | 7KB | 86L | Yes (boot template) | LIVE | keep the world smooth without lowering quality (2026-10-23, owner: "keep high quality while improving fps"). * * 1) SPECK CULL: every 0.25 s, any mesh |
| `world-perf-hud.js` | 3KB | 47L | Yes (boot template) | LIVE | in-game performance profiler (?perf=1), 2026-09-26. * Pattern from our gamedev repo: shaddai-threejs-gamedev-master/SKILLS-HUB/.claude/skills/game-qa- |
| `world-rng.js` | 1KB | 34L | Yes (boot template) | LIVE | seedable deterministic RNG (mulberry32) for gameplay that must be reproducible/testable. * * var r = WorldRNG.create(WorldRNG.hashSeed('daily-2026-10- |
| `world-static-batch.js` | 4KB | 59L | Yes (boot template) | PARTIAL | STATIC DRAW-CALL BATCHER (2026-10-11, opt-in `?batch=1`). * The measured boot (docs/perf-drawcall-audit.json) showed ~1,800 of 2,300 scene draw submis **Note:** Opt-in ?batch=1 only; off by default (owner-safety note in main). |

### Terrain & nature (13 files)

| File | Size | Lines | Loaded by HTML? | State | Purpose (from file header) |
|---|---|---|---|---|---|
| `world-biome-scatter.js` | 7KB | 68L | Yes (boot template) | LIVE | forests, desert and mountain dress for the realms (owner 2026-10-23: "there should be a forest in the green and * desert in the sand mountains and ter |
| `world-biomes.js` | 56KB | 1190L | Yes (boot template) | SUPERSEDED | SHADDAI World 3D: BIOME PROPS + WATER + ATMOSPHERE module. * * Enhanced v2: richer per-biome props, InstancedMesh everywhere possible, * allocation-fr **Note:** Built only under ?map=v3; v4 uses terrain-v4 + fill-v4 + biome-scatter. |
| `world-campfire.js` | 13KB | 90L | Yes (boot template) | LIVE | FIRE BUILDING (owner 2026-10-01: "cosmetics for fire building ... lighting a fire at night and the visual of it"). * Buy a CAMP KIT (80) -> press the  |
| `world-falprops.js` | 6KB | 85L | Yes (boot template) | LIVE | the fal-generated models, placed at REAL size (2026-09-24). * * SCALE LAW (owner decision): characters are 7 units tall, so 1 real metre = 7/1.8 ≈ 3.8 |
| `world-fill-v4.js` | 37KB | 551L | No — loaded dynamically by world-main.js | LIVE | MAP v4 (?map=v4) realm FILL: vegetation, rocks, waystations, floating islands, river bridges. * 2026-09-26. Follows docs/REALM-FILL-PLAN.md using ONLY |
| `world-footprints.js` | 4KB | 54L | Yes (boot template) | LIVE | FOOTPRINTS in snow and sand (owner 2026-10-02: "snow steps ... the small stuff that makes a game look amazing", real not overdone). * One InstancedMes |
| `world-grass.js` | 15KB | 138L | Yes (boot template) | LIVE | REAL GRASS (owner 2026-10-01: "real grass and movement"): ONE InstancedMesh of 3-blade tufts around the player, swaying in the wind and bending away f |
| `world-nature.js` | 6KB | 98L | Yes (boot template) | LIVE | Quaternius "Ultimate Stylized Nature" (CC0) scattered through the realms (2026-09-24). * * window.buildWorldNature({ THREE, scene, loader, heightAt, l |
| `world-realmprops.js` | 8KB | 142L | Yes (boot template) | LIVE | FULL MAP (2026-09-21): the three remaining outer realms, * built from EXISTING shipped models — zero fal spend (realer props Thursday). * * DARKFOREST |
| `world-rivers.js` | 8KB | 77L | No — loaded dynamically by world-main.js | LIVE | the owner's small RIVER loop (drawn in Blender 2026-10-16, assets/world/city-zones-v1.json `rivers`): boats travel round the city. * var R = WorldRive |
| `world-terrain-v4.js` | 43KB | 602L | No — loaded dynamically by world-main.js | LIVE | (no header comment) |
| `world-terrain.js` | 43KB | 967L | Yes (boot template) | SUPERSEDED | SHADDAI World 3D procedural terrain (classic script, no imports). * * Usage (after world-layout.js has set window.WORLD_LAYOUT): * const t = window.bu **Note:** Built only under ?map=v3; v4 terrain replaces it. Still loaded on every boot. |
| `world-trails.js` | 3KB | 75L | Yes (boot template) | SUPERSEDED | FULL MAP roads (2026-09-21): glowing light-trails from the plaza * through each mountain pass to its realm gate. Futuristic SHADDAI roads are TRAILS O **Note:** Skipped under v4 (main comment); realm-roads replaces it. |

### Water & naval (8 files)

| File | Size | Lines | Loaded by HTML? | State | Purpose (from file header) |
|---|---|---|---|---|---|
| `world-broadside.js` | 10KB | 119L | Yes (boot template) | LIVE | BROADSIDE FX for the naval galleon: 8 muzzles (4 per side), muzzle flash, tracers, smoke puffs, water columns, synthesized boom. * Pure visuals, every |
| `world-naval-view.js` | 27KB | 185L | Yes (boot template) | LIVE | NAVAL BATTLE you can PLAY (owner 2026-10-01): first-person boat combat in the Colosseum water field. Draws world-naval.js (the rules) with code-built  |
| `world-naval.js` | 19KB | 173L | Yes (boot template) | LIVE | NAVAL BATTLE: the rules + simulation for the Colosseum water field (owner 2026-10-01): first-person boat combat with cannons / energy cannons / torped |
| `world-ocean.js` | 13KB | 259L | Yes (boot template) | SUPERSEDED | CRYSTAL SEA: shader ocean + gold harbor + moored boats (handoff step 2). * * Mirrors the 2D world's beach realm (deep water at far SW) as an animated  **Note:** Built only under !MAP_V4; world-water.js is the v4 water. |
| `world-reef.js` | 6KB | 102L | Yes (boot template) | LIVE | the REEF STATION (reference: reef clip d93016…): white clearcoat pods, glass band, wooden deck, * gold rail, pier piles. Built in code, attached to th |
| `world-shiplock.js` | 14KB | 168L | Yes (boot template) | LIVE | SHIP LOCK-ON + SPEED FEEL while riding a hover ship / kart / flying mount (2026-10-15, owner ref videos). * (world-lockon.js is the older on-foot PvP/ |
| `world-ships.js` | 5KB | 73L | Yes (boot template) | LIVE | NAVAL SHIP TIERS: 3 classes x 3 tiers, ownership, upgrades (engine / handling / hull), loss + rebuy. Sparks are closed-loop: this module only SPENDS.  |
| `world-water.js` | 58KB | 910L | No — loaded dynamically by world-main.js | LIVE | (no header comment) |

### Sky, weather & themes (5 files)

| File | Size | Lines | Loaded by HTML? | State | Purpose (from file header) |
|---|---|---|---|---|---|
| `world-edge-realms.js` | 23KB | 227L | Yes (boot template) | LIVE | the EDGE REALMS beyond the island rim (2026-10-23, owner: "the edge of the realms is blocked off but we can * make it visually stunning and a sky real |
| `world-nightsky-extras.js` | 13KB | 99L | Yes (boot template) | LIVE | SHOOTING STARS, a SECOND MOON and STRANGE PLANETS on top of world-sky-v4's starfield + moon (owner 2026-10-01: "stars in the sky and shooting stars mo |
| `world-sky-v4.js` | 30KB | 496L | No — loaded dynamically by world-main.js | PARTIAL | * world-sky-v4.js — SHADDAI Map v4 sky + day/night cycle (three.js r160+, no build step, classic <script>). * * ONE sky mesh (1 draw call): analytic R **Note:** Runs as the light rig + day/night clock (paused by default), but its sky dome is hidden unless ?skyfx=1 — the visible sky is a flat scene.background colour. |
| `world-themes.js` | 22KB | 558L | Yes (boot template) | LIVE | (no header comment) |
| `world-volcano.js` | 9KB | 174L | Yes (boot template) | LIVE | EMBERFALL: the volcano realm (2D world-regions/volcano parity). * * FULL MAP (2026-09-21): outer-realm build in the NE. Everything here is EXISTING *  |

### City, buildings & transit (26 files)

| File | Size | Lines | Loaded by HTML? | State | Purpose (from file header) |
|---|---|---|---|---|---|
| `world-buildings.js` | 283KB | 5268L | Yes (boot template) | LIVE | Procedural buildings for SHADDAI World. * window.buildWorldBuildings(THREE, scene, layout, heightAt, loader) → { update(t), markers } * * TURTLE pass  |
| `world-canon-v4.js` | 9KB | 96L | No — loaded dynamically by world-main.js | PARTIAL | the CANON city from Blender, in the game (Map v4, ?map=v4), 2026-09-26. * * tools/blender/canon/build_canon.py builds the owner's canonical layout (at **Note:** Loads and builds streets/plazas/landmarks, but dense blocks are triangle-clipped to 4 zone loops by default and the consolidated replacement city is dead code behind if(false). |
| `world-city-actions.js` | 48KB | 819L | No — loaded dynamically by world-main.js | LIVE | (no header comment) |
| `world-city-crowns.js` | 8KB | 65L | Yes (boot template) | LIVE | per-district rooftop architecture for the Grid (owner 2026-10-23: "you just added the tower on the top of the square * building ... add cool design ar |
| `world-city-heights.js` | 5KB | 74L | No — loaded dynamically by world-main.js | LIVE | O(1) "what is the tallest building top at (x,z)?" lookup for the race track (plan step S2.2, 2026-10-09). * * var H = WorldCityHeights.build({ plan, f |
| `world-city-layout.js` | 4KB | 45L | No — loaded dynamically by world-main.js | LIVE | ROADS + PLOTS of the designed district layout (owner 2026-10-16, ref image 66 / 34). * WorldCityLayout.build({ THREE, scene, heightAt, U, layout }) la |
| `world-city-screens.js` | 7KB | 86L | Yes (boot template) | LIVE | LIVE SCREENS in SHADDAI City (2026-10-23, owner: "the screens in zerox shaddai city and news screen"). * ZEROX MARKET WALL — in front of ZEROX's Marke |
| `world-city-v3.js` | 18KB | 312L | No — loaded dynamically by world-main.js | PARTIAL | SHADDAI City v3 RUNTIME (Map v4, ?map=v4), 2026-09-27. * * Reads the three Blender-exported city files (Blender == game == dashboard): * /assets/world **Note:** Registry/interaction layer only (markers, plots, ~7,900 art slots) — builds no city geometry. |
| `world-clusters-v4.js` | 31KB | 320L | No — loaded dynamically by world-main.js | LIVE | (no header comment) |
| `world-district-signs.js` | 3KB | 39L | No — loaded dynamically by world-main.js | LIVE | district identity signs in the Grid (owner 2026-10-16, districts authored in Blender -> assets/world/districts-v1.json). * WorldDistrictSigns.build({  |
| `world-districts.js` | 3KB | 38L | Yes (boot template) | LIVE | DISTRICT IDENTITY for The Grid (pure data + lookups; the plan file stays untouched). * City Brief v2: Campus NE · Commons SE · Plots SW · Race NW. Eac |
| `world-elevators.js` | 102KB | 1951L | Yes (boot template) | LIVE | (no header comment) |
| `world-facade-details.js` | 7KB | 62L | Yes (boot template) | LIVE | EXTERIOR DETAIL PASS for the repeated city buildings (owner 2026-10-01: "the repeated buildings are decent but basic on the outside"; * art direction  |
| `world-grid-city-v4.js` | 22KB | 317L | No | SUPERSEDED | (no header comment) **Note:** Builder never called; its plan JSON is consumed by city-heights/clusters/race only. Wiring it would double-build the city. |
| `world-hovercars.js` | 42KB | 287L | Yes (boot template) | LIVE | HOVER CAR KIT + AIR TRAFFIC (owner refs 2026-10-01: retro hover cars/vans/trucks sheet + Rimba Racer pod car). * * WorldHoverCars.TYPES [{id, name, le |
| `world-landmarks.js` | 4KB | 82L | Yes (boot template) | SUPERSEDED | arena (walk-in colosseum platform) + castle moat glow + garage beacon. * All procedural + EXISTING shipped models. Real fal assets land Thursday in th **Note:** Skipped under v4 (no heightAt on v4 ground). |
| `world-realm-dress.js` | 13KB | 130L | Yes (boot template) | LIVE | realm DRESSING authored in Blender, placed around every ring station (2026-10-22). * * window.WorldRealmDress.build({ THREE, GLTFLoader, scene, transi |
| `world-realm-homes.js` | 26KB | 259L | No — loaded dynamically by world-main.js | PARTIAL | realm home kits built from the owner's refs (fal-assets/refs/world/*), all CODE ($0), instanced, lazy. * * var rh = window.buildWorldRealmHomes({ THRE **Note:** Lazy/instanced home kits; homes pair with world-home-deeds.js server deeds. |
| `world-realm-kits.js` | 12KB | 144L | Yes (boot template) | LIVE | realm towns around every maglev ring station (Blender kits K10 buildings + K19 props), 2026-10-15. * * WorldRealmKits.build({ THREE, GLTFLoader, scene |
| `world-realm-roads.js` | 16KB | 157L | Yes (boot template) | LIVE | roads out to every realm + the Skyline Spur rail (owner 2026-10-23: "there is no roads that lead to the outer realm * or train"). Map v4 never loaded  |
| `world-sky-traffic.js` | 11KB | 250L | No — loaded dynamically by world-main.js | LIVE | (no header comment) |
| `world-skydock.js` | 15KB | 117L | Yes (boot template) | LIVE | THE SKY DOCK (owner 2026-10-01): the top floor of the city connects to a launch deck where you take off on a hover ship, with a vendor who sells radar |
| `world-train-v2.js` | 17KB | 256L | Yes (boot template) | LIVE | SHADDAI's own maglev trainset, built in code (no download, no licence strings). * Double-ended bullet maglev: 2 nose cars + 2 mid cars + gangways, ≈95 |
| `world-transit-kit.js` | 4KB | 72L | Yes (boot template) | LIVE | dresses the maglev (world-transit.js) with the Blender kits: * K7 shaddai_maglev_kit_v01.glb → instanced pylon foot / unit shaft / hammerhead cap (rep |
| `world-transit.js` | 36KB | 407L | Yes (boot template) | LIVE | the Ringed Realm maglev (owner atlas + transit refs, 2026-09-25). * * The golden ring on the atlas is a real elevated MAGLEV LINE: a double-track viad |
| `world-void-castle.js` | 46KB | 638L | No — loaded dynamically by world-main.js | LIVE | (no header comment) |

### Interiors & venues (18 files)

| File | Size | Lines | Loaded by HTML? | State | Purpose (from file header) |
|---|---|---|---|---|---|
| `world-athenaeum-lifts.js` | 4KB | 64L | Yes (boot template) | LIVE | the Athenaeum's SECOND FLOOR + GLASS CAPSULE ELEVATORS (2026-10-23, owner: "I want the atheneum two floors * with an elevator"; ref: chrome-capped gla |
| `world-athenaeum.js` | 66KB | 659L | Yes (boot template) | LIVE | the Athenaeum Campus, built in Three.js from athenaeum-layout.js. * * var campus = window.buildAthenaeumCampus(THREE, { scene, originX?, originZ? }) / |
| `world-binary-vision.js` | 7KB | 81L | Yes (boot template) | LIVE | TURTLE studio BINARY VISION (2026-10-23, owner refs: OCEAN DOUBLE GLITCH, mono byte glitch, the * binary-visualization repo on the owner's desktop). S |
| `world-colosseum-floors.js` | 23KB | 220L | Yes (boot template) | LIVE | interchangeable Colosseum floors (docs/COLOSSEUM-PLAN, phases 3+4). * window.ColosseumFloors.attach(THREE, arena) (called by world-colosseum.js once t |
| `world-colosseum-hoverleague.js` | 39KB | 372L | Yes (boot template) | LIVE | HOVER LEAGUE in the Colosseum (owner 2026-10-15): a field mode like the naval battle. Rules live in * world-hoverleague-core.js (pure, tested); this f |
| `world-colosseum-intro.js` | 5KB | 71L | Yes (boot template) | LIVE | the COLOSSEUM INTRO (2026-10-23, owner: "finish the colosseum intro"). * * When the player enters the arena (interiors open + window.__colosseumArena. |
| `world-colosseum-metro.js` | 13KB | 127L | Yes (boot template) | LIVE | Colosseum UNDERGROUND STATION (plan phase 5), connects the arena to the maglev ring. * * ColosseumMetro.attach(THREE, arena) (called by world-colosseu |
| `world-colosseum-vendors.js` | 9KB | 73L | Yes (boot template) | LIVE | the Colosseum concourse comes alive (2026-09-29): walk the promenade ring (inside the stadium, outside the arena), * step up to any of the 24 kiosks,  |
| `world-colosseum.js` | 88KB | 845L | Yes (boot template) | LIVE | the Colosseum interior at REAL size (docs/COLOSSEUM-AND-DRAGONS-SPEC.md, 2026-09-25). * * var arena = window.buildColosseumArena(THREE, { scene }) → r |
| `world-furniture.js` | 2KB | 40L | No — loaded dynamically by world-main.js | LIVE | SHADDAI furniture library for world-interiors-v3 (Blender kit K12, owner refs: chunky sci-fi set). * * window.SHADDAI_FURNITURE = { kinds, meta(kind), |
| `world-interior-agents.js` | 3KB | 41L | No — loaded dynamically by world-main.js | LIVE | BOTS staff the buildings (owner 2026-10-16: "we dont need agents in the buildings we need BOTS and those bots can be * peoples agents later and they c |
| `world-interior-levels.js` | 6KB | 89L | No — loaded dynamically by world-main.js | LIVE | BUILDING LEVELS for walk-in interiors (2026-10-23, owner: "all of the insides of the buildings and * levels all of that"). Interiors v3 builds the gro |
| `world-interiors-v3.js` | 85KB | 1131L | No — loaded dynamically by world-main.js | PARTIAL | SHADDAI INTERIOR ENGINE v3 (Map v4, ?map=v4), 2026-09-28. * * Real walk-in interiors for the city: the door slides open as you approach, you walk stra **Note:** Deferred (not in the critical loader chain); walk-in city interiors + levels. |
| `world-interiors.js` | 188KB | 3631L | Yes (boot template) | LIVE | SHADDAI World 3D (TURTLE cinematic v2, 2026-07-02) * * Classic script — no import/export. Requires THREE + scene loaded first. * * Exposes ONE global  **Note:** v1 council-office interiors — built unconditionally by main (~L3656) alongside v3 city interiors. |
| `world-listening-room.js` | 18KB | 192L | Yes (boot template) | LIVE | TURTLE studio LISTENING ROOM (owner ref 2026-10-23: "Listening Room — each user hears the room differently"). * * A circular jam: every participant (y |
| `world-offices.js` | 12KB | 78L | Yes (boot template) | LIVE | OFFICE SERVICES: every council office has ONE unique verb so no two offices do the same job (owner 2026-10-01: "organize the offices so it's not just  |
| `world-realm-interiors.js` | 2KB | 43L | Yes (boot template) | LIVE | every realm-town building and Blender landmark becomes a walk-in interior (2026-10-22). * * Owner: "make the buildings functional with insides so we d |
| `world-underground-bazaar.js` | 40KB | 414L | Yes (boot template) | LIVE | (no header comment) |

### Agents, NPCs & creatures (15 files)

| File | Size | Lines | Loaded by HTML? | State | Purpose (from file header) |
|---|---|---|---|---|---|
| `world-agent-gear.js` | 4KB | 75L | No | ORPHANED | agent accessories (Blender kit K16): caps, visors, halos, headphones, chains, cowls, capes, * backpacks, bangles, holo wrist bands, utility belts. Rig **Note:** No consumer and no loadout data source exists to equip from. |
| `world-agents-ui.js` | 15KB | 96L | Yes (boot template) | LIVE | AGENTS & JOBS panel for the world (I panel > Agents & Jobs). * Talks to the agent layer (server/agentBodies.js + externalAgents.js) at window.SHD_MMO_ |
| `world-bot-bodies.js` | 23KB | 160L | Yes (boot template) | LIVE | code-built, fully RIGGED bot bodies from the owner's refs (no fal spend). 2026-09-29. * var b = WorldBotBodies.build(THREE, kind, style?) kind: 'scrap |
| `world-bots.js` | 21KB | 189L | Yes (boot template) | LIVE | AGENT BOTS: roster of 10 (5 humanoid + 5 wheeled), ownership, rules, follower AI, code-built bodies. * * WorldBots.ROSTER 10 bot definitions (kind 'hu |
| `world-crowd.js` | 9KB | 81L | Yes (boot template) | LIVE | CITIZENS: ~90 pedestrians who walk the city so it feels lived-in (owner 2026-10-01: "more NPCs walking around"). * * var crowd = window.buildWorldCrow |
| `world-dialogue.js` | 23KB | 504L | Yes (boot template) | LIVE | SHADDAI World in-world agent dialogue system * Key: T — "Talk to <NAME>" (E is already taken by building ENTER / EXIT) * * API (set by the lead after  |
| `world-dragon-shards.js` | 5KB | 52L | Yes (boot template) | LIVE | the seven dragon missions (owner 2026-10-23: "dragons sleeping in each terrain ... we can make it a mission to defeat * each and obtain the shard"). E |
| `world-dragons.js` | 123KB | 1694L | No — loaded dynamically by world-main.js | LIVE | SHADDAI Map v4 crossing dragons (one per transit-ring station). * * Classic script (no build step). Two layers: * 1. CORE (pure JS, no THREE): 3D flig |
| `world-mobs.js` | 21KB | 171L | No — loaded dynamically by world-main.js | LIVE | WILDERNESS MOBS with CAMPS, loot and a RESPAWN TIMER (owner 2026-10-01: "mobs in the wilderness that we can defeat, and a timer for them to come back" |
| `world-npcs.js` | 35KB | 736L | Yes (boot template) | LIVE | (no header comment) |
| `world-operatives.js` | 5KB | 49L | Yes (boot template) | LIVE | WHO YOU CAN PLAY AS (owner 2026-10-01): the 8 FORGE archetypes (3D rigged models from the Forge) are the free BASE operatives you start with; * the SH |
| `world-tame.js` | 2KB | 37L | Yes (boot template) | LIVE | DRAGON TAMING by crafting (dragons are fought in the wild; a tamed one is earned, not found). * WorldTame.RECIPES potions + the items they eat * World |
| `world-titans.js` | 7KB | 69L | Yes (boot template) | LIVE | REALM TITANS (owner 2026-10-23 refs: ornate armoured samurai-aztec giants "to fight in the terrains"). One 40 m titan per land * realm (K41 rigged GLB |
| `world-townsfolk.js` | 8KB | 113L | Yes (boot template) | LIVE | the rigged NPCs at their posts (2026-10-22, owner: "place every keeper where it belongs"). * * window.buildWorldTownsfolk({ THREE, GLTFLoader, cloneSk |
| `world-wildlife-v4.js` | 11KB | 154L | No — loaded dynamically by world-main.js | LIVE | WOLF PACKS in the wilderness (Map v4, ?map=v4), 2026-09-27. * * Owner: "wolves should be in the wilderness — and more at night". * • WHERE: only wilde |

### Player, movement & mounts (22 files)

| File | Size | Lines | Loaded by HTML? | State | Purpose (from file header) |
|---|---|---|---|---|---|
| `world-actions.js` | 52KB | 881L | Yes (boot template) | LIVE | HOVERBOARD + TRICKS + SPARKS (2026-09-21). * * The playability layer: ride the hoverboard (E near it), SPACE = ollie, * SHIFT mid-air = kickflip, spin |
| `world-anim.js` | 21KB | 332L | Yes (boot template) | LIVE | (no header comment) |
| `world-buffs.js` | 2KB | 27L | Yes (boot template) | LIVE | timed BUFFS from food, drink and vendors (so vending actually matters). * WorldBuffs.DEFS id -> { name, dur_s, resist?:{fire|cold|poison|void: 0..}, d |
| `world-collision.js` | 17KB | 344L | Yes (boot template) | LIVE | * * world-collision.js — SHADDAI World 3D * NEXUS | SOLID building colliders (footprint-accurate, XZ plane) * * SINGLE SOURCE OF TRUTH for outdoor bui **Note:** Outdoor building colliders (footprint XZ) + canon/cluster registrations; consumed by the player controller. No vehicle or camera collision. |
| `world-dodge.js` | 1KB | 15L | Yes (boot template) | LIVE | ON-FOOT DODGE ROLL with i-frames (pure rules). Z on foot (touch: ROLL). Not available while riding (Z/C are the board's barrel roll there). * WorldDod |
| `world-dragon-ride.js` | 28KB | 442L | No — loaded dynamically by world-main.js | LIVE | (no header comment) |
| `world-gadgets.js` | 14KB | 143L | Yes (boot template) | LIVE | GADGETS (owner 2026-10-01: "radars, jet packs, binoculars, scent away for wolves"): bought with Sparks, used from an on-screen quickbar (also works on |
| `world-gear-wear.js` | 6KB | 74L | Yes (boot template) | LIVE | realm protective gear you can SEE on the character (2026-10-22, owner: "void gas mask, desert wraps on head and * feet so it doesn't burn you, gear to |
| `world-gear.js` | 14KB | 122L | Yes (boot template) | LIVE | THE ARMORY (owner 2026-10-01: "items upgrades and cosmetics shields etc"): shields that really reduce/absorb damage, upgrade levels, and cosmetics. Bo |
| `world-hoverboard-moves.js` | 6KB | 64L | Yes (boot template) | LIVE | RAIL GRINDS + MANUALS for the hoverboard (owner 2026-10-02: "hoverskate park tricks and movesets"). * GRIND Hop onto a magnet rail (board at rail heig |
| `world-hoverboard-wallride.js` | 5KB | 65L | Yes (boot template) | LIVE | WALL RIDES for the hoverboard (owner 2026-10-15: "glide on walls and add spark effects", walls = the * K25b Matrix code walls of the hoverskate park). |
| `world-hoverboard.js` | 44KB | 667L | Yes (boot template) | LIVE | (no header comment) |
| `world-hoverboards.js` | 37KB | 577L | Yes (boot template) | LIVE | (no header comment) |
| `world-mount-ride.js` | 32KB | 257L | No — loaded dynamically by world-main.js | LIVE | ride your rigged MOUNTS (bull, mammoth, gorilla, hawk) in the SHADDAI world (2026-09-29). * * Classic script. Same shape the host already drives for t |
| `world-mounts.js` | 9KB | 63L | No — loaded dynamically by world-main.js | LIVE | MOUNT + HOVERBOARD catalog, per-realm STORES, ownership and LOSS rules (owner 2026-09-29). * WorldMounts.CATALOG mounts + boards: { id, name, kind:'mo |
| `world-player-controller.js` | 38KB | 735L | Yes (boot template) | LIVE | * * world-player-controller.js — SHADDAI World 3D * NEXUS | Kinematic capsule player controller (ground snap, slopes, steps, collision, * run / sprint |
| `world-rideables.js` | 16KB | 352L | No — loaded dynamically by world-main.js | PARTIAL | RIDEABLE Meshy voyager vehicles for SHADDAI World (ES module) — v2 polished CRAFT (Slipstream) → flies: WASD horizontal, Space up, Shift down; banks o **Note:** ES-module craft (Slipstream); loaded via import, separate from the classic-script boot. |
| `world-riders.js` | 22KB | 395L | Yes (boot template) | LIVE | (no header comment) |
| `world-sit.js` | 5KB | 77L | Yes (boot template) | LIVE | SITTING. E next to a seat (sofa, bench, stool, chair) sits you down; E or any move key stands you up. * * WorldSit.register({ id, x, y?, z, yaw, r? }) |
| `world-spawn.js` | 55KB | 1117L | Yes (boot template) | LIVE | (no header comment) |
| `world-survival.js` | 8KB | 112L | Yes (boot template) | LIVE | diving + breath meter, drowning, death and RESPAWN SPOTS (all settable from the Navi > Plots). * * window.WorldSurvival * .state { hp, breath (0..1),  **Note:** HP/breath/death/respawn spots. Respawn bug: spots carry no Y (see diagnosis). |
| `world-vehicles.js` | 5KB | 80L | No — loaded dynamically by world-main.js | PARTIAL | proper procedural vehicles for SHADDAI World (classic script). * window.buildWorldVehicles(THREE, scene, layout) -> { update(dt, t) } * A flying SHIP  **Note:** Dynamically loaded by main but buildWorldVehicles has no caller anywhere — dead load. |

### Combat & hazards (13 files)

| File | Size | Lines | Loaded by HTML? | State | Purpose (from file header) |
|---|---|---|---|---|---|
| `world-castle-siege.js` | 6KB | 63L | No | ORPHANED | CASTLE SIEGE DAY rules (pure, no DOM): the whole server storms the castle and fights all 5 dragons at once. * Schedule: WorldSiege.nextStart(nowMs, {d **Note:** No consumer. Pure rules (export WorldCastleSiege); needs an event driver. |
| `world-combat-core.js` | 11KB | 234L | No | ORPHANED | COMBAT CORE v2 (pure rules, no THREE/DOM). Deterministic: no Math.random. * var f = WorldCombatCore.create({ cfg?, dodge?: WorldDodge, rng?, stamina?: **Note:** No consumer. Pure deterministic rules; intended plug-in for main’s ad-hoc combat behind ?combat=1. |
| `world-combat-mode.js` | 1KB | 24L | Yes (boot template) | LIVE | PASSIVE vs FIGHT mode. * Passive: you cannot damage or be damaged by players, and mobs ignore you. * Fight: normal combat. Toggle with WorldCombatMode |
| `world-hazards.js` | 6KB | 59L | Yes (boot template) | LIVE | LAVA THAT HURTS (owner 2026-10-02: "lava and health"). Environmental damage with a readable burn, on the overworld AND in the Colosseum lava field. *  |
| `world-hitfx.js` | 6KB | 48L | Yes (boot template) | LIVE | HIT FEEDBACK (owner 2026-10-01 "hit markers", ORACLE: "crisp ping + 0.2 s hit-marker, readable, never noisy"): * crosshair HIT MARKER (4 ticks; white  |
| `world-lockon.js` | 7KB | 145L | Yes (boot template) | LIVE | lock-on targeting for PvP/fights. Pure logic + optional DOM overlay. No THREE. * var lk = WorldLockOn.create({ getPlayer()->{x,z,yaw}, getTargets()->[ |
| `world-realm-hazards.js` | 3KB | 39L | Yes (boot template) | LIVE | REALM HAZARDS + PROTECTIVE GEAR (pure rules, no DOM). * Each realm has hazard zones (poison gas, purple lava, cold, heat). Gear lowers the damage / st |
| `world-realm-zones.js` | 4KB | 59L | Yes (boot template) | LIVE | runtime that applies realm hazards + passive/fight mode to the player. * WorldRealmZones.create({ layout, getPos, getHP, setHP, perk, onHurt, toast, m |
| `world-siege.js` | 26KB | 632L | No | ORPHANED | ============================================================================ * SHADDAI · world-siege.js — Full Siege Game Mechanics * Monthly cycle: b **Note:** 2D-canvas siege system; game.html does not load it either. No consumer anywhere. |
| `world-speed-fx.js` | 5KB | 73L | Yes (boot template) | LIVE | RACING FEEL (2026-10-08, owner race references): FOV kick with speed, speed lines at the screen edges, * boost pads on the race track. Zero 3D draws:  |
| `world-tactics.js` | 14KB | 282L | Yes (boot template) | LIVE | SHADDAI TACTICS v1 (2026-09-23): FFT-style grid battles for the * Colosseum. CT turn order by AGI, STR/AGI/INT/HP, move+act per turn, archetype skills |
| `world-vfx.js` | 25KB | 392L | Yes (boot template) | LIVE | GPU-analytic VFX core: soft round points (fixes "little squares"), 2 ring-buffered particle systems (additive + normal), ribbon trails, instanced deca |
| `world-weapons.js` | 43KB | 601L | No | ORPHANED | the 7 agent weapons, built in code (no textures, no downloads, $0). Metres. * const w = window.buildAgentWeapon({ THREE, agent: 'zerox', palette? });  **Note:** No consumer anywhere. Closest to wireable (attach at body seating, needs visual bone check). |

### Economy, quests & activities (11 files)

| File | Size | Lines | Loaded by HTML? | State | Purpose (from file header) |
|---|---|---|---|---|---|
| `world-academy-client.js` | 26KB | 269L | Yes (boot template) | LIVE | station panels for the Athenaeum Campus, talking to /api/school. * * var A = WorldAcademy.create({ toast?, getAgents?, request?, fetch?, storage?, bas |
| `world-arcade.js` | 11KB | 69L | Yes (boot template) | LIVE | THE ARCADE (owner 2026-10-01: "we need the arcade made"): three cabinets paid in Sparks, with a real house edge (a Sparks SINK) and a daily win cap. * |
| `world-economy.js` | 3KB | 59L | Yes (boot template) | LIVE | PURE settlement math for Sparks wagers (closed loop: no minting, no cash-out). * * Never calls ShdSparks; callers move the Sparks. Everything is integ |
| `world-farm.js` | 8KB | 51L | Yes (boot template) | LIVE | FARM BEDS (owner 2026-10-01: "farm stuff"): six beds, three crops that grow in REAL time (even while you are away), water to speed up, harvest into th |
| `world-farm3d.js` | 4KB | 58L | Yes (boot template) | LIVE | the community FARM PATCH in the 3D world: six raised beds (matching WorldFarm's six beds) at the edge of the SW plot district. * Each bed shows its re |
| `world-fishing.js` | 8KB | 69L | No | ORPHANED | FISHING rules (pure, no DOM). Species table and length-weight / value model adapted from "Tidewater" (MIT, (c) 2026 DRG Software Solutions LLC; see do **Note:** No consumer in 3D (2D game.html has its own unrelated fishing). Pure rules. |
| `world-home-deeds.js` | 4KB | 53L | Yes (boot template) | LIVE | buy a realm-town home with Sparks (owner 2026-10-16). Client only renders + asks; the SERVER decides * (backend/home-deed-routes.js: one owner per hom |
| `world-inventory.js` | 1KB | 14L | Yes (boot template) | LIVE | tiny shared INVENTORY + PERKS store used by the offices, farm, arcade and vendors (localStorage 'shd_inv_v1'; production = economy-service inventory). |
| `world-quests.js` | 6KB | 85L | Yes (boot template) | LIVE | QUEST BOARD (QUILL's Library): three daily quests drawn from a pool, tracked automatically; claim pays Sparks. * Sources: 'race' (finish a race), 'pod |
| `world-shops.js` | 12KB | 198L | Yes (boot template) | LIVE | SHOP STOCK + BUY/SELL (plan S6.1-S6.2). Real store menus for the city's shop interiors. * * WorldShops.catalog(type, seed) -> deterministic stock list |
| `world-showcase.js` | 8KB | 72L | Yes (boot template) | LIVE | SHOWCASE + AD SPACE + CHAIN ADAPTER (Gallery / Library / Observatory uses, Navi Market). * * WorldShowcase.KINDS { art: TURTLE Museum, book: QUILL Lib |

### Races & park games (19 files)

| File | Size | Lines | Loaded by HTML? | State | Purpose (from file header) |
|---|---|---|---|---|---|
| `world-cutscene-travel.js` | 10KB | 89L | Yes (boot template) | LIVE | TUNNEL LINE cutscene travel (2026-10-11, owner: "underground connection to the train can be a cutscene ... or a cutscene through the water tunnel"). * |
| `world-cutscene.js` | 21KB | 449L | Yes (boot template) | LIVE | (no header comment) |
| `world-game-modes.js` | 7KB | 68L | Yes (boot template) | LIVE | GAME MODES hub (2026-10-11, owner: "all game mode screens and buttons: colosseum, race, etc"). * One MODES button (top right, under NAVI) opens one pa |
| `world-hoverleague-core.js` | 23KB | 304L | Yes (boot template) | LIVE | (no header comment) |
| `world-hoverpark-k40.js` | 6KB | 74L | Yes (boot template) | LIVE | the K40 HOVERSKATE PARK (owner 2026-10-23, refs image 58-64) replaces the v2 park's look and ride surfaces at the * PLAZA_SKATE spot: high wall-ride w |
| `world-hoverpark-v2.js` | 21KB | 171L | Yes (boot template) | LIVE | HOVERSKATE PARK v2, laid out to the owner's plan (2026-10-04 "Circular City Hub · Hover-Skate Park"): * centre: the GOLD-RING BOWL (4 lane gaps) · nor |
| `world-hoverpark.js` | 21KB | 146L | Yes (boot template) | LIVE | the HOVERSKATE PARK: one realm park with 7 tagged rooms (Pad, Banks, Spine, Plaza, Mirror Pool, Rift Gallery, Forum), a SHADDAI torii entrance, * a ra |
| `world-park-dress.js` | 8KB | 117L | Yes (boot template) | LIVE | HOVERSKATE PARK v2 dressing from the Blender kit K25 (2026-10-15, owner skate-park ref: gold-lantern torii gate, * stands round the bowl, lane lights, |
| `world-race-challenge.js` | 21KB | 177L | Yes (boot template) | LIVE | CHALLENGE RACES with Sparks wagers (owner 2026-10-01): * "challenge people to mount races in game, races and wager Sparks, picking spots on the map".  |
| `world-race-hq.js` | 9KB | 95L | Yes (boot template) | LIVE | RACE HQ (owner 2026-10-16: "a building for the one on the ground and a shop center in it to buy a car, later car upgrades ... * that could be the star |
| `world-race-kit.js` | 12KB | 137L | Yes (boot template) | LIVE | dresses a built race circuit (world-race-track.js) with the Blender race kits (K6 + K6b), 2026-10-15. * * WorldRaceKit.dress({ THREE, GLTFLoader, trac |
| `world-race-landmarks.js` | 10KB | 87L | Yes (boot template) | LIVE | permanent scenery for the Dragon Gate Circuit (owner refs 2026-10-01): a gold TORII start gate with a SHADDAI plaque and hanging lanterns, * lantern p |
| `world-race-prizebox.js` | 4KB | 67L | Yes (boot template) | LIVE | PRIZE BOXES for city circuits (2026-10-10, owner ref: black armoured sci-fi crate with green neon bands, Mario-Kart-style item box). * The race runtim |
| `world-race-run.js` | 37KB | 268L | Yes (boot template) | LIVE | the RACE RUNTIME (agentic arcade-racing layer on the Hoverskate rules): item crates you drive through, turbo pads, power-ups and attacks, AI riders, * |
| `world-race-select.js` | 27KB | 135L | Yes (boot template) | LIVE | RACE SELECT SCREEN (owner 2026-10-01): pick the cup / circuit, pick your ride (11 hover cars with 3D thumbnails + stat bars, or a hoverboard), pick th |
| `world-race-track.js` | 36KB | 403L | Yes (boot template) | LIVE | ANTI-GRAV RACE TRACK geometry for a WorldRace circuit (2026-10-08, owner race reference: WipEout/Redout * style city racer). Turns the circuit polylin |
| `world-race.js` | 27KB | 201L | Yes (boot template) | LIVE | HOVERSKATE RACE RULES (circuits, gates, laps, timing/penalties, capped trick bonus, ram damage, item crates, ranked rules). * Pure logic (no THREE) +  |
| `world-skatejam.js` | 18KB | 158L | Yes (boot template) | LIVE | SKATE JAM: the Hoverskate park trick game (owner 2026-10-01: "skate park game tricks mechanics ... fully complete the hoverboard mechanics ... effects |
| `world-trick-score.js` | 4KB | 85L | Yes (boot template) | LIVE | pure trick-chain scorer (THPS style: points are PENDING until a clean landing banks them, a bail loses them). * * var sc = WorldTrickScore.create({ tu |

### UI, Navi, chat & feeds (10 files)

| File | Size | Lines | Loaded by HTML? | State | Purpose (from file header) |
|---|---|---|---|---|---|
| `world-chat.js` | 27KB | 763L | Yes (boot template) | PARTIAL | * * world-chat.js — SHADDAI World In-World Chat Panel * NEXUS build · neon/cyber aesthetic · polling-based (Render-safe) * * Usage (called by the worl **Note:** Older standalone chat panel; coexists with the Navi CHAT module (world-navi-chat.js) — two chat surfaces, both polling. |
| `world-dashboard-link.js` | 9KB | 143L | Yes (boot template) | LIVE | the WORLD side of the World <-> Dashboard link (2026-11-06, owner: "connect the 3D world to the dashboard"). * Contract: docs/HANDOFF-20261106c-DASHBO |
| `world-goto.js` | 8KB | 159L | No — loaded dynamically by world-main.js | LIVE | (no header comment) |
| `world-hud-v4.js` | 17KB | 277L | No — loaded dynamically by world-main.js | LIVE | small DOM HUD for the 3D world (Map v4), 2026-09-27. * * • VITALS (bottom-left): thin HP bar (emerald → gold < 35 → red < 15) + slimmer stamina bar; a |
| `world-live-feeds.js` | 2KB | 32L | Yes (boot template) | LIVE | one client for the FREE market + news feeds (2026-10-23, owner: "wiring the free apis into the navi for * markets and the screens in zerox shaddai cit |
| `world-markets-screen.js` | 6KB | 107L | Yes (boot template) | LIVE | ZEROX MARKET SENTINEL STATUE. * (Formerly a big live candlestick chart panel — replaced by a bronze statue now that the real * market terminal lives i |
| `world-minimap.js` | 24KB | 593L | Yes (boot template) | LIVE | SHADDAI World corner minimap (pure DOM + 2D canvas, no WebGL). * TURTLE — exposes window.buildWorldMinimap({ THREE?, layout, getPlayer }) → { update,  |
| `world-navi-chat.js` | 4KB | 70L | Yes (boot template) | LIVE | real multiplayer chat for the Navi CHAT module (2026-10-15). * * Relays through the existing poll-based relay in backend/multiplayer.js (POST /api/mp/ |
| `world-navi.js` | 91KB | 810L | Yes (boot template) | LIVE | SHADDAI NAVI: in-world holographic command center (shell + 12 modules). * Open with Y or ` (backquote) or the NAVI button. The world keeps running beh **Note:** Navi shell + 15 modules; every interaction full-rebuilds both plates via render(). |
| `world-touch-buttons.js` | 8KB | 73L | Yes (boot template) | LIVE | PHONE CONTROLS: thumb-sized action buttons that drive the game's normal keyboard handling (every existing mechanic works from touch). * The move stick |

### Audio (4 files)

| File | Size | Lines | Loaded by HTML? | State | Purpose (from file header) |
|---|---|---|---|---|---|
| `world-audio.js` | 17KB | 487L | Yes (boot template) | LIVE | * * world-audio.js — SHADDAI World 3D Ambient + SFX System * NEXUS build — v1.0.0 * * Fully synthesized via Web Audio API. Zero external files, zero n |
| `world-combat-music.js` | 5KB | 105L | Yes (boot template) | LIVE | procedural exploration + combat stems (Web Audio, no files). A minor. * var m = WorldCombatMusic.create({ ctx?: AudioContext-like }); // no ctx -> saf |
| `world-lounge.js` | 35KB | 685L | Yes (boot template) | LIVE | ============================================================================= * world-lounge.js — ZEROX LOUNGE · COMMUNITY RADIO * ------------------- **Note:** ZEROX Lounge community radio; default track list is SoundHelix demo MP3s with in-world titles (placeholder content). |
| `world-radio.js` | 26KB | 539L | Yes (boot template) | LIVE | * * world-radio.js — SHADDAI RADIO + City Bulletin * ZEROX + NEXUS build — v1.0.0 * * Usage (the world binds the key and calls these): * const radio = **Note:** Shaddai Radio + City Bulletin; talks to /api/radio + /api/radio/queue. |
---

# 2. SYSTEMS MAP

For each system: entry points → data consumed → what a default load actually does today → known gaps (video/diagnosis evidence).

## 2.1 Boot, loader & performance
- **Entry:** `SHADDAI-WORLD-3D.html` head (mobile probe, WebGL gate, importmap → vendored three r180) → boot template / dist bundles → `world-main.js` module → lite loader (`_LD` critical steps: terrain → realm-modules → buildings → canon → grid-fabric → city-v3 → sky → warm) → auto-ENTER → sky-dive → spawn picker.
- **Data:** `public/dist/boot-1..3.*.js` (1.47 MB minified total); `world-main.js` 598 KB.
- **Today:** quality governor `_Q` (5 tiers POTATO→ULTRA, EMA FPS, starts LOW; mobile pass-1 live: phones start POTATO, capped at LOW, council bodies deferred until after ENTER). Perf guard speck-culls sub-2px meshes and pins bad skins; light budget keeps nearest 8 point + 2 spot lights live of ~40; static auto-merge runs by default (`?smerge=0` off), the older static batcher is opt-in `?batch=1` only.
- **Gaps:** warm-up step can hang the loader at 100% ("WARMING UP THE RENDERER", VIDEO_ISSUES V16) — whole-scene `compileAsync` against a 30 s cap + two full renders force-uploading ~250 MB of textures while the dressing GLB wave is still parsing (MOBILE_PASS2_PLAN ranks 1–3; the same overlap is the leading iPhone Jetsam suspect). Error overlay has no dedupe/throttle — one per-frame error floods the screen (V1). *(Wave-1 branch, not live: warm cap 6 s, error dedupe, hero-chain fix.)*

## 2.2 Terrain & nature
- **Entry:** loader step 'terrain' → `_loadScript('/world-terrain-v4.js')` → `window.__mapV4Ready`; legacy path `buildWorldTerrain` only under `?map=v3`.
- **Data:** `assets/terrain/height16.bin` (8 MB, 2048² heightmap; a duplicate set sits in `assets/terrain-ww/`) + `assets/terrain/terrain.json`; colour/layer textures (~75 MB VRAM decoded: 2048² colour + 10× 1024² layers).
- **Today:** v4 heightmap island (~10 km), patch-streamed geometry (per-frame build budget), rivers carved into the height data. Dressing: `world-fill-v4.js` (vegetation/rocks/waystations/floating islands/bridges), `world-biome-scatter.js`, `world-grass.js` (instanced tufts around the player), `world-nature.js` (CC0 nature pack), `world-falprops.js`.
- **Gaps:** terrain textures visibly stretch on slopes and black patches appear (V9/V10 — splat/shadow layer reading as black where data is missing, GUESS in VIDEO_ISSUES); the realm-dressing wave (realmprops/townsfolk/kits, §2.6) starts pre-entry and contends with terrain during load.

## 2.3 Water & naval
- **Entry:** `_buildV4Water` inside the terrain step → `world-water.js`; legacy `world-ocean.js` (Crystal Sea cove) only under v3.
- **Data:** water bodies derived from terrain data — 1 ocean + 4 rivers + 5 lakes (FACT, MOBILE_PASS2_PLAN); ocean depth bake at up to 1024².
- **Today:** shader water with baked shore depth; `world-rivers.js` runs boats around the city river loop from `city-zones-v1.json`; the Reef Station (`world-reef.js`) attaches to the ocean; naval battle (rules `world-naval.js` + playable view `world-naval-view.js` + `world-broadside.js` FX + `world-ships.js` tiers) lives in the Colosseum water field.
- **Gaps:** no fishing interaction anywhere on this water (§2.11). Ocean bake is a measurable pre-entry CPU/memory cost on mobile.

## 2.4 Sky, lighting & themes
- **Entry:** loader step 'sky' → `world-sky-v4.js` (dynamic); `world-themes.js` auto-applies a persisted theme ~80 ms after boot; `world-nightsky-extras.js` adds shooting stars / second moon / planets.
- **Data:** none (all procedural); theme choice persists in `localStorage shaddai_world_theme`.
- **Today:** sky-v4 runs the light rig (one shadow-casting sun/moon directional, ±60 m shadow frustum following the player) but **its sky dome is hidden unless `?skyfx=1`** and its day/night clock is **paused by default** (`?skyclock=1` to run it) at a fixed day palette (sun 2.4, pale hemi). Fog is **hard-off** on a default load (density forced to 0; only `?fog=1` re-enables). The theme engine locks `scene.background` to a flat colour (`_themeLocked`), so the visible sky is one flat colour while day-strength light plays over night-built art.
- **Gaps:** this split-brain ownership *is* the "white fog" of the videos (BUTTONS_FOG_CITY_DIAGNOSIS Symptom 2): pale themes wash everything white against a frozen near-black background. No single system owns background + fog + lighting together.

## 2.5 City & buildings
- **Entry:** loader steps 'buildings' (`__kickBuildings` → `world-buildings.js`), 'canon' (`world-canon-v4.js`), 'grid-fabric' (`world-clusters-v4.js`), 'city-v3' (`world-city-v3.js`, awaited); `bootCityLayout` builds roads+plots.
- **Data:** `assets/world/grid-city-v4.json` (**318 buildings, 199 plazas, 302 parks, 1,301 lamps**, grid radius 1,600 m, centred on origin) · `grid-fabric-v4.json` (**4,183 items** in 3 districts) · `grid-commons-v4.json` (231 KB — **no consumer anywhere**, FACT from grep) · `canon-v4.glb` (4.66 MB) + `canon-colliders-v4.json` (1,686 colliders) · `markers-v4.json` (108 named markers) · `plots-v4.json` (330 KB) · `art-slots-v4.json` (1.87 MB, ~7,900 slot records) · `grid-fabric-districts-v1.json` · `districts-v1.json` · `city-zones-v1.json` · `realm-clusters-v4.json` (179 items, 7 realm clusters at 2.0–4.4 km).
- **Today:** a default load builds **only the 7 council sector towers** around the spawn plaza (`world-buildings.js`). Canon contributes streets/plazas/landmarks, but its dense filler blocks are triangle-clipped to 4 zone loops by default and its consolidated replacement city (120 + 240 buildings) is **dead code behind `if (false)`**. The grid fabric builds, but its districts sit ~1 km from spawn and are LOD-banded (near 250 m / far 900 m / hide 2,600 m), so from the plaza they read as horizon silhouettes. City-v3 is a registry/interaction layer (markers, plots, art slots) — it builds no geometry.
- **Gaps:** **the designed city is never instantiated** — `grid-city-v4.json`'s only runtime consumer is `WorldCityHeights.build`, a height raster used when a city race circuit is requested (BUTTONS_FOG_CITY_DIAGNOSIS Symptom 3, FACT). The empty grey plain in the videos *is* the plan's footprint. The Help Desk map draws only the 7 sectors on a ±2,600 scale, so it always looks empty. FPS collapses to ~4–5 among the buildings that do exist (unbatched geometry + error flood, VIDEO_ISSUES #11).

## 2.6 Transit & realm towns
- **Entry:** `world-transit.js` (HTML-loaded) builds the maglev; realm-modules step starts kits/townsfolk/dress builders.
- **Data:** `WORLD_LAYOUT.transit` ring R 1150 u, 9 stations; Blender kits under `assets/kits/` (45 MB tree); NPC GLBs under `assets/npcs/` (31 MB tree).
- **Today:** a golden elevated maglev ring with a code-built trainset (`world-train-v2.js`), kit dressing (`world-transit-kit.js`), towns at every station (`world-realm-kits.js`), rigged NPC keepers at posts (`world-townsfolk.js`), Blender realm dressing (`world-realm-dress.js`), roads + Skyline Spur rail (`world-realm-roads.js`), tunnel-line cutscene travel (`world-cutscene-travel.js`), air traffic (`world-hovercars.js` + `world-sky-traffic.js`).
- **Gaps:** the dressing builders all start **pre-entry** and report "done" instantly while their GLBs keep parsing — mobile rank-1 load cost (MOBILE_PASS2_PLAN). `world-vehicles.js` is loaded by main but its factory has **no caller anywhere** (dead load). Station interiors read as flat untextured grey in the videos (V7).

## 2.7 Interiors & venues
- **Entry:** `world-interiors.js` (v1) built unconditionally by main (~L3656); `world-interiors-v3.js` + levels/furniture/agents loaded deferred in the v4 chain; Athenaeum exterior attaches after `__loadPlayable`; Colosseum via `world-colosseum.js` + add-ons.
- **Data:** `athenaeum-layout.js`; furniture kit K12 (`world-furniture.js`); interior staff bots K14 (`world-interior-agents.js`); academy talks to `/api/school` (§3).
- **Today:** two interior engines run side by side — v1 for the council offices (Library, Navigator Core, Museum…) and v3 for walk-in city buildings (sliding doors, no loading screen, multi-level via `world-interior-levels.js`). Plus: Athenaeum campus (2 floors, glass capsule lifts, academy stations), the Colosseum (real-size arena, interchangeable floors, underground metro station, 24 vendor kiosks, intro cutscene, hover-league and tactics modes), the Underground Bazaar (K32), realm-town interiors (`world-realm-interiors.js`), the Listening Room and Binary Vision studio pieces.
- **Gaps:** on camera the v1 interiors are **black voids with floating UI cards** (V2/V3) — the room environment/lighting does not land; the resident agent inside renders as an emissive-blown ghost in a pod (§2.8). Interiors-v3 is deferred past the loader, so early entries can race it (INFERENCE).

## 2.8 Agents, NPCs & creatures
- **Entry:** `placeAgents()` in main (sprite standees + rings/beams at the 7 sectors) → `_nextAgentBody()` streams the real GLBs sequentially after spawn/heightmap; interiors attach resident bodies separately.
- **Data:** `assets/agents/<CODE>.glb` ×7 council bodies + portraits (sprite texture swaps to `/api/forge/art/char-<code>.png` when it loads); `assets/npcs/` (townsfolk); `assets/models/` (106 MB tree — realm props, mounts, kits); enemy portrait PNGs + `enemy-manifest.json` in `assets/world/`.
- **Today:** council bodies seat at 7.0 u on the sector hexagon, portrait sprites stand in until each GLB lands; ~90 citizen pedestrians (`world-crowd.js`); 10-roster agent bots with follower AI (`world-bots.js` + code-built rigged bodies `world-bot-bodies.js`); wilderness mobs with camps/loot/respawn timers (`world-mobs.js`); wolf packs (`world-wildlife-v4.js`); 7 station dragons + dragon-shard missions (`world-dragons.js`, `world-dragon-shards.js`); one 40 m titan per land realm (`world-titans.js`); T-key dialogue (`world-dialogue.js`) with the QUILL copy bank (`world-copy.js`); agent jobs/bodies panel talks to `/api/mmo` (`world-agents-ui.js`).
- **Gaps (ZEROX_AND_LOAD_DIAGNOSIS, FACT):** ZEROX's GLB carries an un-repacked **8.72 MB PNG** texture (siblings: ~0.25 MB WebP) — it loads last/heaviest everywhere and costs ~22 MB VRAM; a parse-time wrapper forces `emissiveIntensity ≥ 3.0` on every agent GLB and only the outdoor council path re-clamps it to 0.3, so the player-body and interior-display paths render agents as flat pale ghosts; cloned skinned bodies can tear into a **shard mass** under animation (live `matrixWorld` TypeError flood in V1) and the four flagship rigs are exempt from the perf-guard's bad-skin protection via their `__skinClean` tag. Agent **weapons and gear exist as finished modules but are never attached** (§2.11).

## 2.9 Player, movement & mounts
- **Entry:** `world-player-controller.js` (kinematic capsule) driven by main's movement chain; `world-spawn.js` (sky-dive entry + spawn portals); `world-survival.js` (HP/breath/death/respawn).
- **Data:** operative definitions in `world-operatives.js` (8 Forge archetypes + council agents as playable bodies); mount/board catalogues in `world-mounts.js`; hero persists in `localStorage shd.hero3d`.
- **Today:** walk/run/sprint/jump/roll/ledge-climb with ground snap and building collision (§2.13 note); hoverboard family (board + moves + wallrides + tricks), rigged mounts (bull/mammoth/gorilla/hawk), dragon riding, a bike, hover ships/karts (`world-rideables.js`, ES module), sitting, dodge roll with i-frames, protective gear that renders on the body (`world-gear-wear.js`), gadgets (radar/jetpack/binoculars), food/vendor buffs.
- **Gaps (diagnosed, FACT mechanisms):** **dismount teleport** — the controller's internal `pos` freezes at the mount point for the whole ride and the unlocked/cursor movement branch has no resync, so after a cursor-mode dismount it stamps the frozen position back into `playerPos` every frame (same latent bug threatens Navi MAP travel and any unlocked teleport). **Sky respawn** — respawn spots are `{id, kind, name, x, z}` with **no Y anywhere in the data model**, so respawn keeps the death-moment Y and drops the player over the Bazaar at altitude. Boot hero chain tries two GLBs that don't exist in `assets/player/` (guaranteed 404s) before the real body. *(Both bugs have fixes on the wave-1 branch, not in live code.)*

## 2.10 Combat & hazards
- **Entry:** main's own combat surface (attack timers, projectiles) + `world-combat-mode.js` (Passive/Fight toggle, persists `shd_cmode_v1`), `world-lockon.js`, `world-hitfx.js`, `world-vfx.js`.
- **Today:** on-foot and mounted combat against mobs/dragons/titans; environmental hazards with gear mitigation (`world-hazards.js`, `world-realm-hazards.js`, `world-realm-zones.js`); Colosseum tactics battles (`world-tactics.js`); naval combat (§2.3); hover-league (`world-hoverleague-core.js` rules + Colosseum build).
- **Gaps:** the designed combat system is **not** the one running — `world-combat-core.js` (deterministic combo/stamina/hit-stop core, built to plug into the existing `WorldDodge` + clip names) has **no consumer**; combat in main is ad-hoc. The 7 agents' procedural weapons (`world-weapons.js`, 601 lines, $0 code-built) are never attached to any body. Castle Siege Day rules (`world-castle-siege.js`) have no event driver.

## 2.11 Economy, quests & activities
- **Entry:** `sparks-ledger.js` (`ShdSparks`, §3); in-world Bazaar stalls built by main at `BAZAAR.pos (-100, 0, 100)`; Navi SHOP/SPARKS/WALLET modules; `world-quests.js` quest board.
- **Today:** Bazaar stalls fetch `/api/bazaar/list` and buy via `/api/bazaar/buy` (402 = insufficient Sparks); shops with deterministic stock (`world-shops.js`); the Armory (`world-gear.js`) and gadgets as Sparks sinks; the Arcade (3 cabinets, house edge, daily win cap — a deliberate sink); farming (6 beds, real-time growth, harvest → inventory → sell); daily quests (3 drawn from a pool, claim pays Sparks); race wagers (`world-race-challenge.js`) settled by the pure conservation math in `world-economy.js`; home deeds bought with Sparks **server-side** (`world-home-deeds.js` → `/api/home-deeds/buy`, one owner per home); showcase/ad space (`world-showcase.js`).
- **Gaps:** the Shop UI can hang on "Loading the shelves…" for a full clip (V14 — fetch with no visible timeout/error state). **Fishing is rules-only**: `world-fishing.js` (species, bite rolls, fight, rewards) has no 3D interaction — no rod, no water prompt — and the 2D world's fishing doesn't use its table either.

## 2.12 Races & park games
- **Entry:** Navi MODES hub (`world-game-modes.js`) → race select (`world-race-select.js`) → runtime (`world-race-run.js`) on `world-race.js` rules + `world-race-track.js` geometry dressed by `world-race-kit.js`.
- **Today:** anti-grav circuit racing with item crates/turbo pads/AI riders, prize boxes, a Race HQ building with car shop, challenge races with wagers (§2.11), three generations of hoverskate park (v1, v2, K40 — K40 replaces v2's look at the same spot) with Skate Jam trick game and THPS-style trick scoring.
- **Gaps:** starting a city race synchronously builds the `WorldCityHeights` raster from the 318-building plan — an in-code-admitted **2–4 s main-thread block**, one of the "Page Unresponsive" sources (BUTTONS_FOG_CITY_DIAGNOSIS Symptom 1).

## 2.13 UI, Navi & comms
- **Entry:** `world-navi.js` shell (Y / backquote / NAVI button) with 15 modules: MAP, MODES, JOBS, ITEMS, SHOP, HOMES, WALLET, SPARKS, AGENTS, ACADEMY, CHAT, MARKETS, NEWS, RADIO, SETTINGS; `world-minimap.js`; `world-hud-v4.js` vitals; `world-live-feeds.js` (one client for the free market/news feeds, 30 s poll); `world-dashboard-link.js` (World ↔ Dashboard contract).
- **Today:** everything above renders and functions; MARKETS/NEWS screens also exist in-world (`world-city-screens.js` ZEROX market wall + news screen; `world-markets-screen.js` is now a statue — the real terminal lives inside the ZEROX temple).
- **Gaps (diagnosed):** **every Navi interaction full-rebuilds both plates via `innerHTML`** and re-scans live world state (`render()`, world-navi.js:719) — plus a full render per mouse-wheel tick, background re-renders from feeds/chat timers, and an open/close **quality-tier round-trip** that reallocates every composer target and recreates the shadow map. Together these are the filmed "buttons hang the page" (V15/V17/V18). The Help Desk map's data source is only the 7 sectors (§2.5). Two chat surfaces coexist (§4).
- **Collision note (cross-system):** `world-collision.js` is the single source of truth for **outdoor building colliders** (footprint-accurate XZ; canon's 1,686 colliders and cluster fabric register into it) and the player controller consumes it — on-foot building collision exists. **Vehicles/hoverboards/dragons do not collide with buildings** (V12 drives through them) and **the camera has no collision at all** (V7/V10/V15 camera inside walls/geometry). FACT from code + video.

---

# 3. ECONOMY & PERSISTENCE WIRING

## 3.1 Sparks — one wallet, two modes (FACT, from `sparks-ledger.js`)
- API: `ShdSparks.get() / .add(n, kind, note) / .spend(n, kind, note)` (synchronous, optimistic) + `.sync()` + `.buy(vendorId, itemId)`; a `shd-sparks` window event fires on every change. One balance is shared by the 2D realm, the 3D realm, the arcade and the dashboard.
- **Server mode (signed-in players):** the truth is `char.currency.sparks` on the economy server (`/sparks/*` on `window.SHD_MMO_API`; in production, same-origin via `backend/sparks-adapter-routes.js` over the single economy-service ledger). Every earn/spend is validated server-side and the local number is a **read-through cache** — editing `localStorage` no longer mints anything for a signed-in player; a refused mutation rolls the cache back to the server's number with a toast.
- **Local mode (guests / server unreachable):** the old behaviour — balance lives only in `localStorage` (`shaddai.sparks`, mirrored to `shd_sparks`; legacy `shd.sparks3d` is folded in once; a 200-entry log is kept in `shaddai.sparklog`). Balances carry cents (100 ledger units = 1 Spark).
- In-world HUD showed "100 SPARKS" in the videos — consistent with a guest/local wallet or a synced balance; which mode a given session is in depends on sign-in state (INFERENCE).

## 3.2 Bazaar buy flow (FACT)
- The walkable Bazaar (main, `BAZAAR.pos = (-100, 0, 100)` — matches `WORLD_LAYOUT` landmark `bazaar`): 8 stalls in a ring, each bound to a listing from `GET /api/bazaar/list` (refreshed every 30 s); walking near a stall + the buy key posts `POST /api/bazaar/buy {id, buyer}` — `402` → "Not enough SHAD-Credits" alert; success → receipt alert + wallet refresh. Listings persist server-side (`backend/bazaar-routes.js`, `backend/data/bazaar.json`). The Underground Bazaar (`world-underground-bazaar.js`) is a second, larger venue on the same economy.
- Other server-priced flows: home deeds (`/api/home-deeds`, `/api/home-deeds/buy` — server debits once, one owner per home, `backend/data/home-deeds.json`), portal plots (`/api/portal-plots`, `/api/grid/portals`, `/api/grid/visitors` — `backend/data/portal-plots.json`), academy (`/api/school/*`, `/api/achievements/*` — progress/unlocks server-side), race heats/challenges and skate scores (`/api/race/*`, `/api/skate/score`).

## 3.3 Inventory & per-system state (FACT)
- The shared bag is **local**: `world-inventory.js` — `ShdInv` over `localStorage shd_inv_v1`, used by offices, farm, arcade and vendors (its own header notes "production = economy-service inventory" — i.e. the server-backed version is aspirational, not wired).
- Almost every gameplay system keeps its own `localStorage` key (full enumeration in §3.5): gear, gadgets, buffs, mounts, ships, quests, farm, camp, arcade, vendors, tame, mob kills, showcase, respawn spots. These persist **per browser, per device** — nothing syncs them to the server or across devices.

## 3.4 Hero save (FACT)
- `world-actions.js` hero switch (H key cycles the 7 council codes) → `setPlayerCharacter(code)` in main; the choice persists to **`localStorage shd.hero3d`** and a 6 s timer **restores the saved hero at the start of every session** — this is why Israel's player body is ZEROX on every visit (he picked it once). The toast on switch/restore reads **"NOW PLAYING: \<CODE\>"** (not a music indicator — see §5). Boot default for a brand-new player is SHADDAI (`world-operatives.js defaultCode()`); the boot chain `hero-walk.glb → robot.glb → operative GLB` starts with two files that don't exist in `assets/player/` (only PNGs are there), so every fresh boot pays two guaranteed 404s.

## 3.5 localStorage key census (FACT — every key written/read by the realm client)
- **Identity & access:** `shd_token`, `shd_userid`, `shd_uid`, `shd_access`, `shd_world_pass`, `shd_display_name`, `shd_player_code`, `shd_mp_id` (multiplayer id), `shd_party` (party code), `shdWorldGate` (2D gate state).
- **Sparks:** `shaddai.sparks`, `shd_sparks`, `shd.sparks3d` (legacy), `shaddai.sparklog`, `shd_max_sparks`, `shd_sparks_grant`.
- **Body & bots:** `shd.hero3d`, `shd_bot_body_pref`, `shd_bots_v1`.
- **Gameplay state:** `shd_inv_v1`, `shd_gear_v1`, `shd_gadgets_v1`, `shd_buffs_v1`, `shd_mounts_v1`, `shd_ships_v1`, `shd_quests_v1`, `shd_farm_v1`, `shd_camp_v1`, `shd_arcade_v1`, `shd_dock_v1`, `shd_vend_v1`, `shd_tame_v1`, `shd_ops_v1`, `shd_mobkills_v1`, `shd_naval_day_v1`, `shd_jam_cap_v1`, `shd_jam_lb_v1`, `shd_showcase_v1`, `shd_spots_v1` (respawn spots), `shd_cmode_v1` (combat mode), `shd_checkin_v1`, `shd_checkin_office`, `shd_dist_seen`, `shd_dist_visited`, `shd_pb_v1`, `shd.garage3d`, `shd.raceGarage`, `shd.colo.signup`, `shd.tourney`.
- **Prefs & UI:** `shaddai_world_theme`, `shd_quality`, `shd_navi_v1`, `shd_navi_style`, `shd_navi_swivel`, `shd_hud_prefs_v1`, `shd_listening_fx_v1`, `shd_listening_mix_v1`, `shd_welcome_v3`, `shd_world_return`, `shaddai_terrain3d`.
- **World edits & link:** `shd.placementEdits`, `shd.placementEdits.v4` (in-game editor's saved placements — local only), `shd_world_snapshot_v1` (dashboard-link snapshot), `w3d_citadel_secret`, `shaddai.city`, `shaddai.siege` (2D leftovers).

## 3.6 Server API surface the realm calls (FACT — endpoint → client callers)
| Endpoint(s) | Called from | Purpose |
|---|---|---|
| `/sparks/*` (earn/spend/balance/buy) | `sparks-ledger.js` | Server-authoritative wallet (signed-in) |
| `/api/bazaar/list`, `/api/bazaar/buy` | `world-main.js`, `world-city-actions.js`, `world-interiors-v3.js` | Bazaar listings + purchase |
| `/api/mp/sync`, `/api/mp/chat` | `world-navi-chat.js` | Presence + chat relay (§4) |
| `/api/mmo` | `world-agents-ui.js` | Agent bodies/jobs panel (server/agentBodies + externalAgents) |
| `/api/school/*`, `/api/achievements/*` | `world-academy-client.js`, `world-dashboard-link.js` | Athenaeum academy: faculty/classes/skills/progress/review |
| `/api/home-deeds`, `/api/home-deeds/buy`, `/api/home/status|rent|checkin|inhabit` | `world-home-deeds.js`, `world-main.js`, realm-homes | Server-owned homes |
| `/api/portal-plots`, `/api/grid/portals`, `/api/grid/visitors` | `portals/portal-plots.js`, `world-main.js` | Claimable portal plots |
| `/api/markets/ohlc|tickers|trending|fear-greed`, `/api/news/crypto` | `world-live-feeds.js`, `world-city-screens.js`, `world-navi.js` | Free market/news feeds for Navi + city screens |
| `/api/radio`, `/api/radio/queue` | `world-radio.js` | Shaddai Radio queue (§5) |
| `/api/lounge/tracks` | `world-lounge.js` | Lounge playlist feed (optional; defaults are local) |
| `/api/operatives`, `/api/world/agents`, `/api/world/redeem` | `world-main.js`, `world-academy-client.js` | Operative/agent state |
| `/api/skills/stats`, `/api/skills/market/*` | `world-city-actions.js`, `world-main.js` | Skill market surfaces in-world |
| `/api/navi/*` (incl. signals) | `world-navi.js`, `world-main.js` | Navi module data |
| `/api/shaddai/chat`, `/api/chat` | `world-navi-chat.js`, chat surfaces | Agent chat |
| `/api/tools/run`, `/api/agent/tools`, `/api/agent/run` | `world-city-actions.js`, `world-interiors-v3.js` | Agent tool execution from inside the world |
| `/api/forge/art/char-<code>.png`, `/api/forge/art/tex-*.png` | `world-main.js` | Generated agent portraits; ground textures (3 load for a `visible=false` mesh in v4 — dead weight, MOBILE_PASS2_PLAN rank 10) |
| `/api/race/challenge|heats|track`, `/api/skate/score` | race/skate modules | Heats, challenges, leaderboards |
| `/api/economy/catalog`, `/api/economy/balance`, `/api/economy/catalog/purchase` | shop surfaces | Server economy catalog |
| `/api/x402/charge` | economy surfaces | x402 payment hook (2 call sites) |
| `/api/image/generate` | 1 call site | In-world image generation |

## 3.7 What persists vs what resets (FACT unless noted)
- **Persists across sessions (server):** Sparks balance (signed-in), bazaar listings, home deeds/ownership, portal-plot claims, academy progress/unlocks, achievements.
- **Persists across sessions (this browser only):** everything in §3.5 — hero, inventory, gear/gadgets/buffs, mounts/ships ownership, quest state, farm growth state, respawn spots, theme/quality/Navi prefs, editor placements.
- **Resets / ephemeral:** multiplayer presence + chat history (in-memory on the server — gone on restart, §4); guest Sparks (local mode); mob camps and world dressing state (rebuilt every load); the saved *position* — there is no position persistence: every session starts at spawn via the sky-dive, wherever you logged off (FACT: no position key exists in §3.5).

---

# 4. MULTIPLAYER / PRESENCE

**Verdict: presence data is LIVE, chat is LIVE, visible co-presence does not exist.**

- **Transport (FACT):** no WebSocket is used by the 3D realm at all (the only `WebSocket` mention in the client tree is a comment in `beta-api-shim.js` noting it isn't needed). The production server *does* run a WS server, but it is grafted for the **2D pixel-world** multiplayer (`backend/server-production.js` ~L748) — the 3D realm never connects to it.
- **The relay (FACT):** `backend/multiplayer.js`, mounted at `/api/mp` (`server-production.js:2178`, "multiplayer presence + chat relay (poll-based, in-memory)"). Rooms hold `players: Map<id, {id, name, agent, x, y, lastSeen}>` + chat; presence expires by TTL; the sync response returns **other active players + online count**.
- **The client (FACT):** `world-navi-chat.js` — every **2.5 s** it POSTs `/api/mp/sync` with your room, id (`shd_mp_id`), name and rounded x/z, and POSTs chat to `/api/mp/chat`. Rooms derive from a 600 u grid cell + party code (`shd_party`). It starts when the Navi CHAT module is used. A second, older chat surface (`world-chat.js`, its own polling panel) coexists with it.
- **What's missing (FACT from grep):** **no client code renders the other players the server returns** — nothing in `world-navi-chat.js`, `world-main.js` or `world-minimap.js` consumes the `players` array to draw an avatar, a name tag, or even a map dot. You can chat with people in your cell and see an online count; you cannot *see* anyone. There is no remote-player avatar system, no interpolation, no shared world state (mobs, vehicles, doors are all per-client).
- **Also stubbed:** the "MMO" the agents panel talks to (`/api/mmo`, `SHD_MMO_API`) is about **agent bodies/jobs**, not player presence; `world-agents-ui.js` lists agent bodies "stationed in the world" from the server — server-side agent workers, not other humans.

---

# 5. AUDIO

**Verdict: all ambience/SFX/music is synthesized or streamed — there are zero audio files in the repo's assets (FACT: `find public/assets -iname '*.mp3|ogg|wav|m4a'` returns nothing).**

- **`world-audio.js` (LIVE):** the ambient + SFX system — fully synthesized Web Audio (no files, no network), degrades silently if Web Audio is unavailable. **Gesture-gated by design:** the AudioContext is created/resumed lazily and `audio.start()` is called from the ENTER click handler; `resumeCtx()` re-runs on later gestures.
- **`world-combat-music.js` (LIVE):** procedural exploration/combat music stems (Web Audio, A minor), created with an injectable context; no-ops safely without one.
- **`world-radio.js` (LIVE):** SHADDAI RADIO + City Bulletin panel — talks to `/api/radio` + `/api/radio/queue` (server queue), and its UI accepts a **direct audio URL** (mp3/ogg/stream) for user-added tracks, played through an audio element. This is the "NOW PLAYING" that means music.
- **`world-lounge.js` (LIVE, content is placeholder):** ZEROX LOUNGE community radio. It *can* be fed by `GET /api/lounge/tracks → [{title, artist, url}]`, but the built-in default playlist is **16 SoundHelix demo MP3s** (soundhelix.com) wearing in-world titles/artists ("Bull Market Sunrise — The Order Book", "Volatility Dreams — ZEROX & The Pit", …). Israel's own music is not in this list (FACT from the file).
- **`world-listening-room.js` (LIVE):** TURTLE's generative Listening Room — a circular jam where each participant hears the room differently; per-user mix/FX persist in `shd_listening_mix_v1` / `shd_listening_fx_v1`.
- **The other "NOW PLAYING" (FACT):** the `NOW PLAYING: ZEROX / TURTLE / …` text in Israel's videos is **not radio** — it is the hero-switch toast in `world-actions.js` (H key + the 6 s saved-hero restore, §3.4). Two unrelated systems share one phrase.
- **Load behaviour:** audio decode is **not** a load cost — everything is lazy and gesture-gated (verified in MOBILE_PASS2_PLAN's cleared list). Synthesized audio costs CPU only after entry.

---

# 6. MISSING LIST — what a coherent realm needs that has no code or no assets today

Checked against disk before declaring anything missing. "Missing" = no code path, no data consumer, or no asset exists.

1. **A city mesh builder for the designed Grid.** `grid-city-v4.json` (318 buildings / 199 plazas / 302 parks / 1,301 lamps, centred on origin) has exactly one consumer — a race height raster. No code instantiates it. The orphaned `world-grid-city-v4.js` builder must **not** simply be wired (it would double-build over canon/clusters); a new, LOD-banded, batched consumer is what's missing. (§2.5)
2. **Visible multiplayer co-presence.** The server returns other players' positions every 2.5 s; no avatar/name-tag/map-dot rendering exists anywhere on the client. (§4)
3. **Vehicle & camera collision.** On-foot building collision exists (`world-collision.js` + controller). Mounts, boards, vehicles and dragons pass through buildings; the camera clips into any geometry. No vehicle-collider or camera-collision code exists. (§2.13)
4. **A Y in the respawn data model.** Spots are `{id, kind, name, x, z}` end to end — the height field the fix needs does not exist in the data, and `world-survival.js` is never given a `heightAt`. (Diagnosed; fix on wave-1 branch.) (§2.9)
5. **Controller resync in cursor mode.** The unlocked movement branch lacks the divergence resync the locked branch has — one missing guard causes the dismount teleport and threatens every unlocked teleport (Navi MAP travel, race warps). (Diagnosed; fix on wave-1 branch.) (§2.9)
6. **A single sky owner.** Fog is hard-off, both sky domes are hidden by default, the day/night clock is paused by default, and a persisted theme locks the background independently of the light rig. No code reconciles background + fog + lighting into one sky. (§2.4)
7. **Interior environment completion.** The v1 office interiors render as black voids on camera — the room shell/lighting path does not land, and the resident-agent display path never re-clamps the parse-time emissive force, so the agent inside is a blown-out ghost. The pieces exist; the finished room does not. (§2.7, §2.8)
8. **Loadouts: agent weapons + agent gear.** `world-weapons.js` (7 procedural weapons, attach-to-hand-bone API) and `world-agent-gear.js` (Blender accessory kits K16/K17) are finished modules with **no consumer and no loadout data source** — there is nothing anywhere that says which agent wears what. (§2.8, §2.10)
9. **A combat core integration.** The deterministic `world-combat-core.js` (combos/stamina/hit-stop) was built to replace main's ad-hoc attack timers and was never plugged in; same for the Castle Siege Day driver (`world-castle-siege.js` rules exist, no scheduler/driver) and 3D fishing (`world-fishing.js` rules exist, no rod/water interaction). (§2.10, §2.11)
10. **Compressed textures (KTX2/ASTC).** None anywhere in the stack — every image and every GLB-embedded texture decodes to full RGBA32 + mips in VRAM. This is the structural multiplier behind the mobile memory peak and much of the desktop texture-upload stall. (§2.1, MOBILE_PASS2_PLAN)
11. **WebP re-pack for ZEROX (and VILLAIN).** An asset task, not code: ZEROX's 8.72 MB embedded PNG (vs ~0.25 MB WebP siblings) is the single largest avoidable download/VRAM cost in the agent set. (§2.8)
12. **A consumer for `grid-commons-v4.json`.** 231 KB of authored commons data (1,863 items per the plan counts) with **zero** references in any client file — orphaned data, sibling to the orphaned city plan. (FACT from grep.)
13. **A real map.** The Help Desk/Navi map data source is the 7 sector points on a ±2,600 scale; stations, districts, fabric, buildings and other players are never drawn. The data to draw them all exists (§2.5, §4); the map layer does not.
14. **Server persistence for gameplay state.** Quests, inventory, gear, mounts, ships, farm, buffs and editor placements are `localStorage`-only — a player switching browser/device loses everything except Sparks, deeds, plots and academy progress. `world-inventory.js`'s own header names the economy-service inventory as the intended production path; it is not wired. (§3.3)
15. **Position persistence.** No saved position exists — every session restarts at spawn regardless of where you left the world. (§3.7)
16. **Navi render architecture.** No caching/diffing exists in the Navi shell — every interaction, wheel tick and background poll rebuilds both plates from live state, on top of a quality-tier round-trip per open/close. The fix is architectural (cache + throttle + no tier change for a UI overlay), not a missing file. (§2.13)
17. **A designed pond.** The founder's layout calls for a pond (§7); no pond feature exists in `WORLD_LAYOUT` or the v4 terrain data — v4 water is 1 ocean + 4 rivers + 5 lakes placed by the Blender-baked terrain. A central pond is genuinely new content (terrain re-bake or a placed water body), not a wiring job. (§7)
18. **Israel's music in the radio.** The Lounge's default playlist is third-party demo tracks with fictional titles; no file or feed wires his own catalogue (IzzoSOL) into `/api/lounge/tracks` or the radio queue. (§5)

---

# 7. FOUNDER'S LAYOUT CHECK

**His design (2026-11-12): "Central circle, rings of plots around it, buildings, the pond, water round the edge."** Measured against what exists:

| Design piece | Status | Evidence |
|---|---|---|
| **Central circle** | ✅ EXISTS and is what he sees at spawn | `WORLD_LAYOUT` is built on it: SHADDAI "The Source" at `[0,0]`, `sacred.rings [60, 130, 200, 260]`, spawn `[0, 2, 70]`, the other 6 agents on a Seed-of-Life hexagon at R 260 with their 7 hero towers built around the plaza. The gold gazebo + towers in the videos are this circle. |
| **Rings of plots around it** | 🟡 DATA EXISTS, wrong place, no buildings on them | Plot data is real and server-backed: `plots-v4.json` (330 KB) consumed by `world-city-v3.js` + `world-city-actions.js` (claimable plots), `world-city-layout.js` builds roads + claimable plots from the district fabric, and portal plots run through `/api/portal-plots`. But the plots live in the fabric districts ~1 km out — **not in concentric rings around the plaza** — and city-v3 is a registry: a claimed plot shows no building. The *ring* arrangement around the centre exists only in `sacred.rings` (plaza geometry) and the maglev ring at R 1150. |
| **Buildings** | ❌ THE missing piece | The building plan for exactly this spot exists — `grid-city-v4.json` is centred on origin with a 170 m core — but nothing builds it (§6.1). Canon's dense blocks are clipped away and its consolidated city is dead code. Today the centre has 7 towers and streets; the city that should stand on the rings is data only. |
| **The pond** | ❌ DOES NOT EXIST | No pond in `WORLD_LAYOUT`, no pond in the v4 terrain/water data (1 ocean, 4 rivers, 5 lakes, none central). This is the one piece that needs new content, not wiring: a Blender heightmap re-bake, or a placed water disc + depression at a chosen ring. (INFERENCE on the two build options.) |
| **Water round the edge** | ✅ EFFECTIVELY EXISTS in v4 | The v4 world is a round island: the ocean body surrounds it and main clamps the player to the island's round edge (`world-main.js:6083`). Under the legacy v3 layout, water was a single SW wedge (Crystal Sea biome) — the founder's "water round the edge" matches the **v4** world he actually plays. |

**Shortest path from today's spawn plaza to his layout (INFERENCE, ordered by dependency):**
1. **Build the city where the plan already sits.** One new batched/LOD consumer for `grid-city-v4.json` at origin turns the empty plain inside the rings into the designed Grid — no new data needed, and it also gives the race raster, the map and the collision set a real city to reference.
2. **Pull the plots onto the rings.** Re-seat (or mirror) the existing plots-v4/city-layout plot rings onto the `sacred.rings` radii around the plaza so "rings of plots" is literally what a new player sees; claims already work server-side.
3. **Give the sky one owner** (§6.6) so the finished centre reads as one place at one time of day — cheapest visual coherence win in the whole list.
4. **Add the pond as the single new build** — one water body inside the rings (re-bake or placed), after 1–2 decide where it sits.
5. **Then wire the finished orphans** — weapons/gear onto the agents who stand in that city, combat core under the fights that happen there, fishing onto the pond/rivers/ocean that now exist — each already has its rules written; they were waiting for a world to attach to.

---

## Appendix — evidence base

- Census: `ls public/world-*.js` (180) × boot template `src=` list (142) × `world-main.js` reference scan (81 refs, 30 unique to main) — computed 2026-11-15 in this pass; matches AUDIT.md §5/§6 (172 referenced, 8 not).
- Diagnoses relied on: AUDIT.md (loader/governors/orphan verdicts), ZEROX_AND_LOAD_DIAGNOSIS.md (GLB forensics parsed from the binaries), BUTTONS_FOG_CITY_DIAGNOSIS.md (Navi/fog/city/dismount/respawn, line-referenced), VIDEO_ISSUES.md (18 clips, 385 frames), MOBILE_PASS2_PLAN.md (ranked load costs, iOS traps).
- Direct greps in this pass: localStorage keys (69 distinct), `/api/*` endpoints (~55), WebSocket (none in the 3D client), audio files in assets (none), data-file consumers (grid-city/plots/fabric/commons/markers/colliders/districts/zones/towns/track-clear/art-slots), `buildWorldVehicles` callers (none), `MAP_V4` default (true, `world-main.js:556`).
- Anything labelled INFERENCE was not directly observed in code or on disk.
