# SHADDAI MASTER PLAN — 2026-09-21 (authoritative, supersedes scattered notes)

NORTH STAR: One playable, polished SHADDAI universe — 2D realm (game.html) + 3D realm
(SHADDAI-WORLD-3D.html host) with MATCHING maps, synced progress, real assets everywhere,
ridable mounts/vehicles/hoverboard with tricks, fal-powered video/skate showcase, and a
dashboard Agent Forge that wraps the user's own Grok/LLM subscription.

## 1. REALM MAP — 2D ↔ 3D PARITY (rule: 3D ≥ 2D, never less; maps must match)

| 2D region | 3D biome | 3D center | Status | Assets (exist unless marked MAKE) |
|-----------|----------|-----------|--------|-----------------------------------|
| shaddai city | grid/hub | [0,0] | DONE (host) | 7 stations, bazaar, interiors. Match 2D city layout; 2D city LACKS offices → edit 2D to add |
| meadow/farm | meadow | [SEE §2 placement] | PLACE | farm-ox(×3 variants), vehicle-farm-tractor, homes-mushroom-pods, harvest tex |
| beach | ocean "Crystal Sea" | [-295,290] | DONE f72965c | skiff/catamaran/superyacht/submarine/harbor-hub/farm-platform + beach-hawk2 (SHIP) + vehicle-beach-hoverboard (SHIP) |
| forest | forest | [210,150] | EXISTS | + mount-forest-ape, vehicle-forest-pod (SHIP) |
| desert | desert | [150,-240] | EXISTS | + mount-desert-camel, vehicle-desert-buggy (SHIP) |
| suburb | suburb | [SEE §2] | PLACE | mount-suburb-dog, vehicle-suburb-scooter, bld-apartment-pod-block, bld-inverted-cube-hab |
| volcano | volcano | [SEE §2] | PLACE NOW | volcano-fortress/forge-tower/bridge/gate/ritual-circle/dragon + castle-siege + volcano-hauler + lavaMat port |
| darkforest | darkforest | [SEE §2] | PLACE | castle-siege (moat castle), prop-crystal-cluster, prop-obsidian-rocks, neon trees |
| (3D-only extras OK) | arctic, void | existing | EXISTS | keep; 2D may gain them later |

MAP MATCHING SOURCE OF TRUTH: `public/region-select.html` (2D realm picker) — 3D biome
positions must mirror its compass arrangement. Read it BEFORE placing. 2D is easier to
edit: if 3D placement must differ, edit the 2D map to match instead.

## 2. 3D PLACEMENT RULES (biome centers, ±410 world, keep 96u sector clearance)
- Biome = circle in `world-layout.js` biomes[]; terrain in `world-terrain.js` case;
  props/models in per-biome modules (pattern: world-ocean.js).
- Sacred geometry (Source [0,0], hexagon R=260 agents) is UNTOUCHABLE.
- Every placed model: flush to terrain height, no float/sink, walkable where meant to be.
- NPCs: procedural ambient citizens per biome + operative NPCs from /api/operatives
  (already wired in host). These are future agents — nameplate + role + "talk" stub.

## 3. ASSET LEDGER (inventory 2026-09-21)
SHIPPED (47 GLBs in public/assets/models): 10 bld/tower/homes, 6 fur, 8 ocean/volcano +
castle-siege, 4 mounts (gorilla/hawk/bull/mammoth), 7 veh/transit + powerarmor,
3 props (bench/crystal-cluster/obsidian-rocks), 9 heroes ×4 (base/walk/run/action) + clips.
IN fal-assets/characters (FINISH + SHIP, near-free): mounts beach-hawk2, desert-camel,
farm-ox(×3), forest-ape, suburb-dog, volcano-hauler; vehicles beach-hoverboard, city-hovercar,
desert-buggy, farm-tractor, forest-pod, suburb-scooter; chars engineer/explorer/mage/scout/
warrior/gabi (forged-operative roster); items (sword/grapple/staff/bow/wrench).
MAKE (new, only after prompt gate §4): 8 missing props (street-lamp, kiosk, transit-stop,
holo-fountain, statue-shaddai, neon-tree, ore-node, signpost), 6 fur (shop-counter, vending,
shelf, terminal, plant-pot, floor-lamp, storage-crate), cosmetics (§6), 2D sprite variants.
Textures: 18 terrain webp — complete, reuse; NO new terrain gen.

## 4. ONE-SHOT GENERATION SYSTEM (never regenerate 2-4× again)
GATE 0 — SPEC: every asset gets a spec row BEFORE any spend: id | class | world pos |
dims | silhouette | palette role | emissive map | rig? | clip needs. No spec = no spend.
GATE 1 — MASTER PROMPT TEMPLATE (locked, every generation starts from this):
  STYLE LOCK: "SHADDAI brand: obsidian #06080b brushed-metal base, gold #e8c45c sacred
  geometry accents, emerald #00ff9c energy seams, cyan #5fe0ff holographic glow. Futuristic
  sci-fi fantasy, clean readable silhouette, no medieval, no cartoon."
  SHOT: "single isolated object, full object in frame with 10% margin, 3/4 view, flat
  mid-grey studio background, soft even studio light, solid opaque surfaces."
  NEGATIVE: "no text, no logos, no watermark, no people, no duplicate objects, no
  background clutter, no cropped edges, no reflections, no perspective distortion."
  CHARACTERS add: "full body T-pose, symmetrical, closed fists, neutral head, 1.8m
  humanoid proportion" — ITEMS add: "held-scale, centered" — TERRAIN add: "seamless
  tileable texture, top-down".
GATE 2 — CONCEPT CHECK (flux, ~$0.05): probe checklist before 3D: isolated? single?
silhouette reads at 128px? palette correct? FAIL → regenerate CONCEPT ONLY (cheap), never 3D.
GATE 3 — 3D ONE CANARY: first asset of a family only; headshot + 3/4 spin verified, then
batch. Rig via tripo (Meshy rejected one Rodin mesh before). Verify walk frames pre-batch.
GATE 4 — SHIP: gltf-transform optimize (meshopt+webp 1024) → register in ledger →
in-world placement + screenshot proof. Asset never "done" until placed + shot.
Retry evidence to never repeat: redo-shaddai-zerox ×3, char-walk-test ×5, world-tower-fix,
rod-retry, floor-ember-retry batches = the waste this system kills.

## 5. EXECUTION LEDGER (order, est. cost out of ~$129)
A. 2D mobile deck v3 — slim 132px, collapse handle, RUN, wired — DONE (50f78a6)
B. FULL MAP — half 720, terrain 1500/190segs, mountain ring w/ 5 passes — DONE (b980fe2)
C. 4 outer realms placed (volcano 6 models + lavaMat, darkforest castle, suburb offices, meadow) — DONE (b980fe2)
D. Hoverboard + tricks + SPARKS (ollie/flip/360/big-air, HUD, localStorage) — DONE (3c13f7a)
E. CSP wasm fix ('wasm-unsafe-eval' — world entry restored) — DONE (2953c8e)
F. All merged to main + live — DONE (c4264a4)
REMAINING (Thursday fal+Claude session):
G. RIDEABLE BOATS — DONE (cd2a3f3). H. HERO SWITCH (H key) — DONE (cd2a3f3).
I. Roads — DONE: light-trail roads plaza→all realms+colosseum (fe77ee5).
I2. WALK-IN COLOSSEUM — DONE foundation: mecha-arena on plateau, E opens spectate/tourney modal, sparks pools ledger (fe77ee5).
I3. GARAGE — DONE foundation: B at plaza beacon, hovercar 500⚡ + board/car tier upgrades (fe77ee5).
J-L. FAL MODELS (below), M. SPARKS SYNC 2D↔3D, N. PIKADON audit — Thursday.

## 11. THURSDAY FAL ALLOCATION — $111, SURGICAL, one-shot gates (§4) enforced, Opus 5.5 executes
  $25  OCEAN PACK REDO — realer ships: skiff/catamaran/yacht/submarine HIGH detail, same spots.
  $15  HOVERCAR + HOVERBOARD real meshes — replace the procedural car (world-actions seatCar)
       and upgrade the board; keep veh-hook API identical.
  $12  MISSING PROPS — street-lamp, kiosk, transit-stop, holo-fountain, statue-shaddai,
       neon-tree, ore-node, signpost → line the light-trail roads + plaza + dock.
  $10  LIFE — farm animals (ox/chickens for Meadowfields), skatepark rails+ramps
       (plaza + colosseum), arena dressing (banners, crowd stands).
  $14  HERO -HQ — 4 heroes via Rodin HighPack + tripo rig (Meshy rejected one Rodin mesh);
       HF-upscale fallback for the other 5. Walk/attack frames verified BEFORE batch.
  $15  COSMETICS — outfit retexture per hero via image-edit (kontext/nano-banana) on the
       base concept. LF2 = STYLE REFERENCE ONLY. NO LF2 characters, ever.
  $10  SKATE VIDEO — arcade trick videos (video-as-you-play showcase, ~18/match),
       behind ENABLE_FAL; ROTATE FAL_KEY FIRST (never commit keys).
  $10  RESERVE — gate failures only; a concept that fails twice is DESIGNED wrong, stop.

## 12. THE DECISION (2026-09-21, supersedes drift) — read this first
  LEAD: 2D world is the product. 3D is the cinematic showroom (fix, don't expand, until 2D shines).
  DO NOT MERGE CODEBASES. One identity + one sparks ledger + portals between 2D/3D/dashboard.
  MOAT: agent economies, not game engines — one-shot generators make content, never
    live economies with real wager pools, owned agents, cosmetic markets, grok imports.
  7-DAY SHIP LIST: (1) static beta deploy — Render STATIC SITE, no backend = no OOM;
    trim to landing+dashboard+2D (~100MB, drop games/skate 132MB + council GLBs + videos).
  (2) 2D polish: building interiors, character pass, agent NPCs + dialogs/cutscenes glue.
  (3) Thursday Opus 5.5 + $111 fal THROUGH THE GATES: ~$60 2D art / ~$50 3D vessels +
    enterable shells (shells get real doors + interiors + colliders — never naked models).
  (4) 3D five laws after: interiors, colliders, scale (walls ≥12m/doors 2.2m), swim,
    vehicle seating. (5) Then arcade games (fight/skate) wired to sparks pools.
  REALITY: 3D realm placements so far = decorative shells (walk-through, toy scale) —
    flagged as placeholders to be replaced BY the interior/collider systems, in place.
  ONE LEDGER: sparks is the single currency — dashboard tools, 2D realm, 3D realm, tourneys.
  EVERY WORLD VENUE = A DASHBOARD TOOL, embodied:
    ZEROX Markets → the trading floors; Colosseum → agent-vs-agent games (fight, skate, then
    dodgeball/football); Forge → agent/character creation; Meadowfields farms → yield/jobs;
    Ocean → trade routes (boat cargo runs later).
  AGENTS ARE PLAYERS: imported agents (BYOK grok/LLM via the Agent Forge) trade, learn,
  enter tourneys, earn sparks — agent-to-agent commerce. Their bodies walk the realms
    (operative NPCs already spawn from /api/operatives).
  2D↔3D = SAME WORLD: same map shape, same sparks, portals between them (2D city door ↔
    3D plaza). Play how you want — or skip the world and use the dashboard tools alone.
  ALIGNMENT RULE: any new feature must touch at least two of {dashboard, 2D, 3D} or it
    doesn't ship — the realms are the tools' bodies.

## 6. COSMETICS — LF2 is STYLE REFERENCE ONLY. NO LF2 characters, NO sprites of them.
Outfit/clothing variants per hero (combat, formal, casual) = retexture via image-edit
(kontext/nano-banana on the hero base concept) — CHEAP, never full mesh regen.

## 7. FAL SKATE (two tracks, both showcase video-as-you-play)
TRACK 1 — ARCADE (Shaddai-Arcade repo, feat/hall-platform-phase1): the 8 QUILL tasks:
(1) placeholder sprite sheet per trick state (2) utils/falVideo.js generateTrickVideo
mock + tests (3) TrickVideoPlayer overlay (spinner→play, never blocks loop) (4) real fal
behind ENABLE_FAL=false flag, mock fallback on error (5) cache/videoMap.json per
match_trickIndex (6) board-select thumbnails + localStorage (7) play-while-generate
queue (max 2 concurrent) (8) docs + FAL_KEY rotation runbook. Owner rotates FAL_KEY
BEFORE enabling (never commit keys).
TRACK 2 — SKATE IN THE 3D REALM (3D only): vehicle-beach-hoverboard = rideable mount;
tricks: Space=ollie (waveH/jump arc), Shift+dir=flip (rotation anim), land on rails/
edges=grind (sparks + trick name HUD, like GTA). Sparks reward per landed trick. Ocean
boardwalk/dock rails + plaza grind edges as trick spots. NO new fal models needed.

## 8. DASHBOARD AGENT FORGE (wrapper business model)
User creates an agent in the dashboard: name, archetype (kind), pick SKILLS (from the
skill registry), pick MD files (docs/knowledge), personality/system prompt. The agent is
CALLABLE from the dashboard (use it to complete tasks) and can run AUTOPILOT (scheduled
tasks) using the USER'S OWN Grok/LLM subscription — we are the wrapper/orchestrator:
  - BYOK: user's Grok key/subscription, encrypted at rest (PIKADON §9), never exposed
    to other sessions; per-user isolation; agent ledger of every call/spend.
  - Registry rows extend /api/operatives (already spawns forged agents in the 3D world).
  - Tiered: free = call templates; pro = custom agents + autopilot + more skill picks.

## 9. SECURITY AUDIT LIST (PIKADON, at the very end, ONCE)
- Grok/LLM keys: encrypted at rest, per-user vault, zero cross-session leakage.
- /api/operatives + forge endpoints: authz per owner, no IDOR, rate-limited.
- fal keys: server-side only, rotate runbook, never in client bundles/git.
- Cloud profile sync (§5-G): one identity per account (email/wallet/Google merge check),
  no cross-user data bleed in localStorage/cloud push.
- No secrets in git history; no PII in agent ledger logs.

## 10. CROSS-REALM SYNC (minimum viable now, expand later)
NOW: shared backend profile — sparks + inventory + name sync between 2D and 3D (both
already have cloud save hooks: cloudUid/push/pull in 2D; add same to 3D host).
Portals: 2D city door ↔ 3D plaza; 2D beach ↔ Crystal Sea; per-realm equivalents.
LATER: live position mirror (2D↔3D same-account ghost), marketplace items usable in both.
