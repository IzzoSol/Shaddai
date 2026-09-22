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
A. 2D mobile pad fix — out of screen, compact, collapsible, RUN toggle, correct wiring  ~$3  [NOW]
B. Volcano realm placement in 3D (all models EXIST — zero fal)                        ~$5  [NOW]
C. Darkforest + suburb + meadow biome placements                                        ~$6
D. Rideables: seat-anchor system + hoverboard TRICKS in 3D realm (ollie/flip/grind HUD)~$7
E. NPCs: ambient citizens + operative avatars per biome                                  ~$3
F. Skate ARCADE (C:\Users\Brittany\Shaddai-Royale): tasks 1-7 per handoff §SKATE       ~$8
G. Cross-realm sync: shared cloud profile (sparks/inv) + 2D↔3D portals                 ~$5
H. Dashboard AGENT FORGE (§8)                                                          ~$9
I. Ship/finish ledger §3 fal-assets + MAKE list via gates                               ~$6 fal
J. Pollinations → fal image swap (all placeholder art) + cache by prompt-hash           ~$3
K. Merge feat/world3d → main after owner walk + screenshot pack                         ~$4
L. ONE PIKADON audit at the very end (§9) — not before                                  ~$2
≈ $61 + reserve. Agent calls: plan ONCE (this doc), execute ME, audit ONCE (L).

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
