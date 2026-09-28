# WORLD COMPLETION PLAN (start here, 2026-09-28)
Branch `feat/world3d` (not pushed). The owner is low on usage, so work ONE item at a time and tick it off here.

## STATUS 2026-09-28 evening (read first)
- **Done + committed:**
  - all 7 agents: Meshy v6, T-pose, 50k, rigged; ORACLE and PIKADON had been approved earlier;
  - weapons (a739cae4);
  - train v2 + walkable ride (98216ea3);
  - dragon elements (7aae7643) + slow/root wiring;
  - GAME-SYSTEMS-PLAN.md.
- **Helpers running at usage cut-off** (check git log; resume unfinished ones by re-dispatching with the same brief):
  1. Animation library (world-anim.js, agent-clips.glb/json, ANIMATION-LIBRARY.md).
  2. Hoverboards + tricks + riders (world-hoverboards.js, world-riders.js, RIDERS.md).
  3. Load speed + light loading screen (PERF-LOAD.md; old intro behind `?intro=cinematic`). The owner reported a 5-min load and freezes; this is TOP priority.
  4. Realm cities from refs (realm_cities_v1.py STEP 8b, public/assets/world/realms/*, REALM-CITIES.md), one realm per headless run.
- **Next:** Blender placement board: a LAYOUT collection in the owner's Shaddai3D.blend ↔ export JSON the game reads, so Blender decides "where goes where". Then import the realm cities into the owner's Blender.
- The owner's Blender has a "TODAY 2026-09-28" collection (agents, train, weapons).
- Local preview: `python -m http.server 3013` in public/. Render deploys main only, so nothing is pushed yet.

## Running at session end (older): check git log + outputs first
- 5-character fal build (ZEROX new owner T-pose, NEXUS, TURTLE, QUILL, SHADDAI no-horns) → `fal-assets/characters/<name>/`. Backup of the old models: `fal-assets/characters/_prev-20260928b/`. The script is in the session scratchpad (batch.sh); if it didn't finish, rerun `node fal-assets/character-pipeline.mjs <name> <png>` with FAL_KEY taken from ../Shaddai/.env. Refs are in `fal-assets/production/refs/agent-*/`.
- Helper "walkable train" → `tools/tests/world-train-ride.test.cjs`: seat classes, map/phone/inventory usable while riding.
- Helper "dragon elements" → `docs/DRAGON-ELEMENTS.md`: 7 elements (void, crystal, lightning, ice, lava, thorn, sand).

## Done today
Interiors v3 (3,349 enterable buildings, sand houses, farm tower) · train v2 built in code (8c823f92) · SHADDAI no-horns · TURTLE/NEXUS/ZEROX final T-poses · villain + katana refs saved.

## Remaining, in order
1. **Characters in game:** render-check the 5 new rigs → wire into the game (CharacterLoader) + UAL clips (jump, roll, attack) + riding seat.
2. **Weapons in code, $0:** `world-weapons.js` with katana (ref `refs/agent-zerox/zerox-katana-weapon.jpg`), NEXUS laser, PIKADON hammer, ORACLE wand-staff, TURTLE electric flail; attach to the hand bone; draw/attack.
3. **Host wiring:** interiors v3 (snippet in `docs/INTERIORS-V3.md`), train-ride, dragon elements. Then ONE real browser look by the owner.
4. **Station hubs:** each realm station becomes a themed hub (heal, rest, shop, NPCs, commerce). Refs are the Downloads jpgs fd342854 (eco maglev), b091904a (arch megacity), be2014a5 (glass arches), bedc1fbe (underwater tube); be creative. Also the **Colosseum underground station**: walkway + elevator down to the train. The Colosseum itself is being built in another terminal (`docs/COLOSSEUM-AND-DRAGONS-SPEC.md`), so build only the station side.
5. **Roads + castle entryways** between realms (gates, ramps).
6. **Realms:** run Blender canon step 8 (`realms_v1.py`), one job at a time; cut sand-habitat doors first (see INTERIORS-V3.md).
7. **Enemies:** skeleton packs in Void + lava (`public/assets/creatures/skeleton.glb`, night like wolves); Iodine creature boss. **Lava castle villain:** ref saved, DO NOT build until the owner says.
8. **Vehicles in code, $0:** hover cars ×10, hoverboards ×9, rider seat sockets + rider-gear tiers (see FAL-MODEL-MAP.md). Grok bots: 2 wheel styles × 4 tiers.
9. **Furniture library in code:** agentic style, from the owner's furniture sheet; interiors pick it up automatically.
10. **Arcade + casino bot:** already in the interiors recipes; wire the cabinets to the real SHADDAI Arcade games.
11. **Agentic world layer:**
    - agents live in the realms with jobs (farm, shop clerk, courier, guard, dealer);
    - SPARKS earn/spend loop (closed-loop);
    - world chat + agent chat bubbles;
    - the agent phone works everywhere, including on the train and at hubs;
    - hire Grok bots/agents to run shops.
    Wire these to the existing backend (`/api/agents`, SPARKS ledger, MCP on the beta site).
12. **Day/night lighting pass** + final whole-branch review → owner OK → push.

## Later (owner 2026-09-28)
- **Hover skate park:** a futuristic hoverboard park in one region/building. Trick events from `world-hoverboards.js` feed the SKATE hidden-RPS versus mode, and the fal video cutscene is generated from the trick/prompt picked. It runs on the fal budget, so build it later.
- **Outfits on the fal bodies:** clothing swaps = code-built gear layers on bone sockets + material tint/decal swaps. Separate a body's clothing regions in Blender only if a full swap is needed.

## Fastest way through (owner wants it done today)
After the usage reset, run items 1–12 back-to-back with ONE helper at a time, each with its own tests + commit. Items 2, 5, 8 and 9 are pure code and can run while the owner reviews visuals from items 1 and 3.

## Rules
Ask before any fal spend or delete · one heavy job at a time (8 GB laptop) · SPARKS closed-loop · futuristic only · the owner approves visuals.
