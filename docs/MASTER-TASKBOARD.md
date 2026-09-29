# MASTER TASKBOARD (owner goal: finish EVERYTHING to HIGH quality, THEN push; no push before that)
Updated 2026-09-29. Rules: no push to main/beta until the owner declares the game finished · smooth/no-lag (docs: memory `feedback_perf_budgets`) · ~$25 fal left, spend only on approved high-value assets · futuristic only · SPARKS closed-loop · confirm before deleting.
Legend: DONE (committed, tested) · PARTIAL · TODO. "Needs owner" = art/decision required.

## A. Colosseum mastery (match the trailer videos; use docs/COLOSSEUM-AND-DRAGONS-SPEC.md + the plan in `.claude/plans/giggly-marinating-blossom.md`)
| Item | State | Notes |
|---|---|---|
| Real-size classical arena, tiers, crowd, kit layer, agents as vendors | DONE (earlier terminals) | `world-colosseum.js` |
| Interchangeable floors: water/naval battle, lava, void platforms, grass, ice | PARTIAL | `world-colosseum-floors.js`: visual + AI; NOT yet walkable/playable (players on ships/platforms), no player collision on platforms |
| Underground station + elevator + maglev stop | DONE | `world-colosseum-metro.js` |
| Trailer look: dragon PvP arena, spark pit, fighters with powers (slash arc, laser, hammer shockwave, orb, chain lightning, dragon breath) | TODO | reuse `world-weapons.js` (katana/laser/hammer/staff/flail), `world-dragons.js` elements (7), `world-dragon-ride.js`; new `ColosseumBattle` layer: 2-8 fighters, HP, i-frames, cameras (existing spectate cams) |
| Events: signup, brackets, brawls for Sparks/PayBox, wagers later | TODO | client Navi Sparks demo only; server escrow/settle via `economy-service` (docs/CHAIN-READINESS.md order of work) |
| GLB shell (Blender) | TODO (optional) | shell-only, seating stays procedural; plan Phase 1-2 |
| Bots in the pit: owner kit lock, receipts, office stand | TODO | `world-bots.js` rules exist |

## B. Hoverskate + hover ships (memory `project_hoverskate_game`, owner Grok banks)
| Item | State | Notes |
|---|---|---|
| Trick core (flip/roll/spin/varial/grab), battle vs hoverskate modes, combos | DONE | `world-hoverboards.js` 14/14 tests |
| Hoverboard FLIGHT rig + rider pose (grab IK, tuck) | PARTIAL | fly/glide/stall exist; add foil/pad dual mode + energy + ceiling per the tuning bank (single `HOVERSKATE_TUNING`) |
| **Mounts: 4 mecha mounts RIGGED** (bull, mammoth, gorilla, hawk) + mount/board catalog, realm stores, flying costs more, loss + rebuy | DONE (data + rig) | `tools/rig-mount.mjs`, `public/assets/mounts/*.glb`, `world-mounts.js` (5/5 tests). TODO: riding control (seat sockets via `world-riders.js`, hawk flight), mount store NPC/stall in each realm + Navi rows, gorilla deformation polish, hover-car sheet as vehicles |
| Hover SHIPS (vehicles) + cockpit interior + FIRST-PERSON view + boost | TODO | needs owner art (`f30c04bd...jpg` Rimba-style hover car, sketches promised); build in three.js code first, fal only for approved concepts; FPV camera at the cockpit socket, boost FOV punch, cockpit HUD in Navi cyan/gold; rider seat sockets exist in `world-riders.js` |
| Ship flight animations (banking, hover bob, thruster FX) | TODO | procedural; reuse `HoverboardKit` flames/underglow patterns |
| Hover-ship SHOPS in the world + inside homes (hangar/garage) | TODO | dealership stall (Ticket + Sparks), hangar room recipe in interiors v3 (`garage` exists as v2 room `GARAGE`), owned-ship spawn |
| Park (7 rooms), race track around the park, circuits, gates, items, HP/ram | TODO | reference image in memory; map-wide ring race around the maglev ring; ranked rules (no Pad Rush vials) |
| TSL/compute VFX + RenderPipeline bloom | DEFERRED | only after instancing; our ShaderMaterials (lava, water, floors) block WebGPU |

## C. Rigs / animation
PIKADON + ORACLE rebuilt (done). Player UAL library (43+ clips) wired. TODO: swim animation + underwater pose, sit pose polish (Sit_Chair_Loop is used), bot walk cycles are procedural placeholders, remaining 7 bot bodies need owner refs, agent rigs for user-made models (vet -> approve -> rig -> implement pipeline, tiered).

## D. Worlds
| Item | State |
|---|---|
| Realm homes (5 kits), enterable, themed interiors, sit/rest/arcade/trade/craft | DONE first pass (`world-realm-homes.js`); polish: textures/normal maps, less boxy silhouettes, per-realm villages from the atlas, castles, crystal/ember/void homes, customization slots |
| Agent buildings (Library/Esoteric Wing/Museum) | PARTIAL: portals + interiors exist; showcase/ad/chain layer DONE (`world-showcase.js`); TODO: draw approved art on frames + ad pylons, exterior polish, main-site pages (`library.html`, `oracle-sky.html`, `turtle-studio.html`, `museum-3d.html`, `athenaeum.html`, `library-panel.js` in the Shaddai repo) folded in as in-game versions |
| Shops in the world + inside homes | TODO (Ticket object, Price Book floor, Stash sell=true) |
| Farm / kitchen / items / cosmetics / furniture (ITEMS table) | TODO (memory `reference_home_kit_items_ideas`) |
| Water/lava/underwater polish, dragon fights, night fire, juice (trauma shake, hitstop, FOV punch) | TODO (plan in HANDOFF-CLAUDE) |
| Navi: real inventory/chat/pins, Academy tabs (Grok's better skills list pending), Forge dashboard revamp (Bind/Body/License/Labor -> PayBox) | PARTIAL |

## E. Performance (owner: no lag, smooth)
Measured: ~2,190 calls / 4.9M tris (aerial), ~4,000-6,000 calls at street level on LOW (headless). Done: fog-aware LOD cutoff (`?nofogcut=1` A/B), Navi caps tier + blur only HIGH+, HUD keys 1-5/0. DONE (verify visually): batched cluster instancing in `world-clusters-v4.js`: the city fabric went from 9,787 instanced meshes (~1,200-2,000 drawn) to 181 (76 drawn), headless, no errors; total calls still ~4,100 at street level on LOW, so the NEXT hot spots are the ~2,000 unnamed meshes + terrain chunks + lights (probe: `node tools/perf-street.cjs`, needs a local server on :3013). TODO: merge/instance the ~2,000 unnamed meshes, terrain chunk merge, 46 lights -> budget, shadow cadence, texture KTX2 audit, dispose on realm exit, frustum/back-cull check for pop-in.

## F. Economy / backend / chain
Client done: Navi Market showcase/ads, `WorldChain` dry-run adapter, bots/showcase/sit/survival tests. TODO server: mount `chain-routes` (Hedera HCS receipts, HTS NFT, Solana memo/Metaplex), moderation queue (PIKADON), economy-service escrow/settle + burn/referral, event/wager routes, PayBox policy caps, ITEMS table, ad-slot render.

## G. Fal ($25) plan - needs owner approval per item
1. Hover ship concepts -> Meshy v6 (about $0.80 per model) for 3 approved designs. 2. Remaining 7 bot bodies (about $0.80 each) once refs exist. 3. **SHADDAI intro** (6-shot board in the owner's paste; minimum set = shot 2 gate + shot 4 ride + shot 6 title). Do the intro LAST; keep the loader light.

## H. Release checklist (only when the owner says finished)
All node tests green (`tools/tests/*.test.cjs`) · headless smoke (`__realmHomes`, `WorldBots`, `WorldSit`, metro station registered) · one human browser pass (Navi, homes, colosseum, hoverskate) · perf HUD `?perf=1` numbers on the owner's laptop · then: push `feat/world3d`, sync Shaddai-Beta `site/` (diff shows ~315 changed + 166 new files vs public/), merge to main (fast-forward possible, 91+ commits). Render auto-deploys main and Beta master.
