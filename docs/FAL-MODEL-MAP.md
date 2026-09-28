# fal model map — the owner's 7-item hard-3D list (2026-09-28)

**PLANNING ONLY.** No fal/API calls, no Blender, no browsers, no downloads happened while writing this.
Everything below is read from the repo docs (`MAIN-CHARACTERS-PLAN.md`, `manifest.json`,
`spend-ledger.json`, `FAL-NEEDS-PLAN.md`, `GLB-INVENTORY.md`, `DOWNLOADS-AUDIT.md`, `DRAGONS.md`,
`DRAGON-RIDE.md`, `CITY-MASTER-BRIEF-v2.md`, `REALMS-V1.md`, `VOID-CASTLE.md`) plus a look at the
owner's `MODELS FOR FAL` folder (file listing + a handful of reference images) and the
`shaddai-games`/`Shaddai-Royale` repos for the arcade game roster.

## Budget snapshot

- Hard cap **$100**, reserve **$20** (untouchable), spent so far (43 ledger entries) **$13.19**.
- Usable now, keeping the reserve intact: **≈$66.81**. Total before touching the reserve: **≈$86.81**.
- This list's estimated fal cost (below): **≈$13–16 worst case**, i.e. it fits inside the reserve
  itself with room to spare — leaves **≈$50–53** of the non-reserve budget for everything else
  already tracked in `FAL-NEEDS-PLAN.md` (citizen NPCs, night enemies, items, finisher videos).
- Prices used: concept PNG ≈ $0.003–0.08 (HF is $0 fal; fal flux-pro/kontext concepts already run
  ≈$0.04–0.08 each per the ledger), hunyuan-3d rapid $0.225, hunyuan-3d pro $0.375, Meshy v6
  rig+walk/run (bipeds only) $0.80.

## Summary table

| Item | Route | Ref status | $ | Difficulty | Order |
|---|---|---|---|---|---|
| PIKADON body | fal meshy v6 (mesh+rig+walk/run) | have (concept-approved) | $0.80 | low | 1 |
| PIKADON hammer | done (shipped) | have | $0 | — | done |
| QUILL pen | done (shipped) | have | $0 | — | done |
| QUILL body | fal meshy v6 | have (quill-tpose-ref.png) | $0.80 | low | 3 |
| ORACLE body | verify 2 existing mesh calls first, re-mesh only if missing | have (concept-approved) | $0–0.80 | low | 2 |
| TURTLE body | fal meshy v6 | have (agent-turtle.png confirmed in refs/agents/) | $0.80 | low | 4 |
| ZEROX body | fal meshy v6, after owner approves T-pose | have (2 fal concepts already run) | $0.80 | low-med | 5 |
| ZEROX katana | fal hunyuan-3d rapid (separate hand-bone prop) | have (zerox-katana-ref.png) | $0.225 | low | 2b |
| PIKADON's status re: "cut" vs spent | **owner decision needed** — see §6 | — | $0 | — | 0 |
| NEXUS laser blaster | fal hunyuan-3d rapid (separate prop) | need (no image found this pass) | $0.225 | low | 6b |
| NEXUS body | fal meshy v6, after owner approves invented full T-pose | have (portrait only; body invented) | $0.80–1.60 | med-high | 8 |
| TURTLE flail | fal hunyuan-3d rapid (separate prop) | have (flail-weapon-ref.png, turtle-flail-ref.png) | $0.225 | low | 4b |
| ORACLE wand-staff | fal hunyuan-3d rapid (separate prop) | maybe (purple orb VFX ref found; not confirmed as the staff itself) | $0.225 | low | 2c |
| QUILL quill-dart weapon | VFX only, no mesh | n/a | $0 | low | — |
| Dragon base meshes (steel + void) | fal hunyuan-3d pro ×2, then Blender makes all 7 element variants (materials) | have (tpose-steel.jpg, tpose-void.jpg, tpose-shadow.jpg, dragons-7-elements-sheet.jpg) | $0.75 | med | 7 |
| Dragon attack animations (breath/bite/claw/tail/roar) | Blender hand-key on the existing procedural bone rig — fal/Meshy can't rig quadrupeds | n/a (code-driven already for breath/swoop/stomp/tail/roar) | $0 | med | 9 |
| Huge Red Flying Dragon OBJ | Blender import/rig once owner confirms license | have (file exists) | $0 | low | 10 |
| Tron/light bike + rider | code (`applySeat()`/`seatV`, already exists) | have (bike already in build) | $0 | low | 11 |
| Dragon mounts + rider | code (`world-dragon-ride.js`, fully speced, not yet wired into host) | have (dragon-rigged.glb) | $0 | med (wiring) | 12 |
| Other mounts (forge bull, glacier mammoth, canopy gorilla) | already generated; rig in Blender | have | $0 | med | 13 |
| Casino dealer bot | reuse an existing NPC-robot ref/mesh, or new fal meshy v6 if none fits | have (several NPC robot refs) | $0–0.80 | low | 14 |
| Arcade cabinet (1 generic mesh, reskinned per game in code) | fal hunyuan-3d rapid | none yet (concept-approved, no image logged) | $0.225 | low | 15 |
| SHADDAI Hall / ZEROX lounge building | fal hunyuan-3d pro | none yet (concept-approved) | $0.375 | low | 16 |
| Creatures: Iodine ice monster, skeleton, insect monster, iguana, tuna, mech | Blender conversion, all free CC0/unknown-license downloads already on disk | have (all 6 located) | $0 | med (scale/rig fixes per file) | 17 |
| Remaining concept-approved hero buildings (11: megatower, castle, void-rift-gate, colosseum, sky-dome, desert-terminal, forest-amphitheater, beach-market-dome, farm-sky-structure, mushroom-pods, arctic-outpost) | fal hunyuan-3d (mix pro/rapid) | have (all concept-approved already) | ≈$3.23 | low-med | 18 |
| Floating sky-station + blue reactor complex (new hero building refs) | fal hunyuan-3d pro, once ref located | **blocked — ref not found by filename this pass** | ≈$0.76 | med | 19 |
| Void castle hero GLB pass | fal hunyuan-3d pro, optional/deferred — castle is currently $0 procedural and already ships | n/a | ≈$0.75 (optional) | med | 20 (optional, last) |
| Building interiors (all) | code + existing Modular SciFi MegaKit pieces (image-to-3D can't make usable interiors) | have (kit confirmed as "the Shaddai building kit" by the fit-test) | $0 | med | ongoing |

**Fal total (excluding the optional Void castle pass): ≈$13.66–14.46 best/worst case for the items
still needing spend.** Add the optional Void castle pass and it's ≈$14.4–15.2. Everything else in
the table above is $0 (Blender/code/already shipped).

---

## 1. Council agents

Status per `MAIN-CHARACTERS-PLAN.md` + a fresh read of `manifest.json`/`spend-ledger.json`:

| Agent | Manifest status | Spend so far | Remaining |
|---|---|---|---|
| ORACLE | mesh-approved | 2× meshy mesh calls, $1.60 logged | **Verify** the resulting GLB actually landed under `public/assets/agents/` before spending a 3rd time. If missing, 1 retry ($0.80). |
| PIKADON | mesh-approved | $0 | 1 mesh call, $0.80. Concept already approved — this is the safest first spend. |
| ZEROX | ready-concept | 2 fal concept calls already run ($0.04 + $0.08 = $0.12, per the ledger 2026-09-28) | Owner approves the resulting T-pose (katana removed, symmetric pose), then 1 mesh call, $0.80. |
| NEXUS | ready-concept | 2 fal concept calls already run ($0.04 × 2 = $0.08) | Highest risk — the concept invents a full body from a portrait-only ref. Owner must approve the T-pose before any mesh spend. Budget 1 retry: $0.80–1.60. |
| QUILL | ready-concept | 1 fal concept call already run ($0.04) | `quill-tpose-ref.png` is already a clean, owner-approved T-pose — skip straight to mesh, $0.80. |
| TURTLE | ready-concept | $0 | `agent-turtle.png` **is present** in `fal-assets/refs/agents/` (resolves the "reference missing" blocker `MAIN-CHARACTERS-PLAN.md` flagged) — proceed to mesh, $0.80. |
| SHADDAI | manifest says `concept-approved`; `MAIN-CHARACTERS-PLAN.md` says owner cut SHADDAI on 2026-09-24 | **The ledger shows an `agent-shaddai` mesh call already ran on 2026-09-25 ($0.80)**, a day after the cut decision. | **Contradiction — flag for the owner** (§6). Don't spend more until resolved; the mesh may already exist and just need a status-field fix, or the cut decision needs re-confirming. |

Remaining agent mesh spend: PIKADON $0.80 + ZEROX $0.80 + NEXUS $0.80–1.60 + QUILL $0.80 + TURTLE
$0.80 + ORACLE $0–0.80 = **$4.00–5.60**, plus whatever the SHADDAI question resolves to (already
spent, likely $0 more).

---

## 2. Weapons

| Weapon | Owner | Ref | Route | $ |
|---|---|---|---|---|
| Teal katana | ZEROX | have — `fal-assets/refs/characters/zerox-katana-ref.png` (sheathed, drawn on attack per owner decisions 2026-09-28) | fal hunyuan-3d rapid, separate hand-bone prop | $0.225 |
| Laser blaster/emitter | NEXUS | **need** — no full-body or weapon-only laser image found in `refs/` or `MODELS FOR FAL` this pass | fal hunyuan-3d rapid | $0.225 |
| War hammer, iron head + glowing red runes | PIKADON | done — `item-rune-hammer` **shipped** | — | $0 (already spent) |
| Purple wand-staff | ORACLE | maybe — a purple crackling energy-orb image exists at `MODELS FOR FAL/generated-image (17).png`; it reads as an orb/VFX effect, not confirmed as the physical staff mesh itself | fal hunyuan-3d rapid, once confirmed as the staff (or as a hand-VFX orb instead — cheaper: $0 code shader) | $0–0.225 |
| Electric spiked flail | TURTLE | have — `fal-assets/refs/agents/flail-weapon-ref.png` and `fal-assets/refs/characters/turtle-flail-ref.png` (chrome spiked ball on a chain, cylindrical grip, per owner decisions) | fal hunyuan-3d rapid | $0.225 |
| Quill darts | QUILL | n/a — thrown-volley VFX, "likely no mesh" per the owner's own framing | code/shader VFX only, no fal mesh | $0 |
| Glowing quill pen (melee/utility weapon) | QUILL | done — `item-quill-pen` **shipped** | — | $0 (already spent) |

Remaining weapon spend: **$0.675–0.90** (katana + laser + flail, + wand if it needs its own mesh).
None of these need a manifest row for the 2 already-shipped items; ZEROX/NEXUS/TURTLE/ORACLE weapons
need new manifest rows added at `mesh-approved` before any `preflight.mjs --go`.

---

## 3. Dragons

The live dragon system (`public/world-dragons.js`) is a **procedural bone rig with code-driven
attacks already** (breath strafe, swoop, stomp, tail, roar — see `DRAGONS.md` §"Attacks at a
glance"). It is not a Meshy-rigged biped, so none of this needs Meshy's per-clip rigging (which
can't handle quadrupeds anyway).

- **7 element variants**: `FAL-NEEDS-PLAN.md`'s plan holds — **one** hunyuan-3d **pro** base mesh
  each from the steel and void T-pose refs (`fal-assets/refs/dragons/tpose-steel.jpg`,
  `tpose-void.jpg`; `tpose-shadow.jpg` and `dragons-7-elements-sheet.jpg` also present), then
  Blender builds the other 5 element looks as material/horn/spine swaps on the same base geometry.
  **$0.375 × 2 = $0.75.**
- **Attack animations** (breath, bite, claw, tail, roar): **Blender hand-key** on the existing rig
  bones (`DRAGONS.md` §"Swapping in a rigged fal/Blender dragon later" gives the exact bone-name
  contract: `Tail_1..5`, wing/neck chains, etc.). **$0**, no fal route exists for this at all —
  Meshy doesn't rig quadrupeds and there's no other fal quadruped-animation product.
- **Element variants beyond the base 2**: pure Blender material work once the 2 base meshes exist.
  **$0.**
- **The static "Huge Red Flying Dragon" OBJ** (`Downloads\Huge_Red_Flying_drago_…obj`, per
  `DOWNLOADS-AUDIT.md`): license unknown, owner flagged to confirm. Once confirmed, it's a free
  Blender import/rig pass (likely an Emberfall boss variant). **$0**, blocked on a license answer,
  not a spend question.

---

## 4. Mounts with agents riding

Everything here is **already built or fully speced in code** — none of it needs new fal spend.

- **Tron/light bike + rider**: the bike is already in the build (`FAL-NEEDS-PLAN.md`: "Bike...
  Already have them; polish in Blender"). Seat placement uses the existing `applySeat()` /
  per-mount `seatV` solver referenced in `HANDOFF-3D-WORLD-2026-09-20.md`. **$0**, Blender polish
  only.
- **Dragon mounts + rider**: fully speced in `docs/DRAGON-RIDE.md` — `public/world-dragon-ride.js`
  is written and tested (`node tools/tests/world-dragon-ride.test.cjs`), uses the existing
  `dragon-rigged.glb`, and has an explicit "tame a defeated wild dragon" hand-off
  (`core.setRidden`). **Not yet wired into `SHADDAI-WORLD-3D.html`** — the doc gives the exact host
  snippets to paste in. **$0 fal**, this is integration work (medium difficulty, no spend).
- **Other mounts** (forge bull, glacier mammoth, canopy gorilla): per `FAL-NEEDS-PLAN.md`, "already
  generated; rig in Blender (quadrupeds)". **$0**, Blender rigging only — Meshy can't rig these
  either.

---

## 5. Casino dealer bot + arcade interior

- **The Hall (casino) does not get a standalone casino building.** `CITY-MASTER-BRIEF-v2.md` is
  explicit: *"The Hall lives inside an existing agent building (ZEROX lounge), never as a new
  casino building."* That building is `bld-shaddai-hall` in the manifest — **concept-approved**,
  no mesh spend yet: fal hunyuan-3d **pro**, **$0.375**.
- **Dealer bot**: no dedicated reference or manifest row exists for a dealer character. Cheapest
  correct route: reuse one of the existing NPC-robot refs already in
  `fal-assets/refs/characters/` (`npc-robot-sketch-sheet.jpg`, `npc-scrap-robot-orange/tan.jpg`,
  `npc-unicycle-robot-*.jpg`) or one of the downloaded Meshy biped bundles flagged "hold... possible
  citizens/NPCs" in `GLB-INVENTORY.md` (Neon Valkyrie / Emerald Enforcer) — **$0** if the owner
  approves reskinning an existing asset as the dealer, or **$0.80** (1 Meshy v6 mesh+rig call) if a
  new one is wanted. **Owner decision needed** (§6).
- **Arcade cabinets, one per SHADDAI Arcade game.** The game roster, from `shaddai-games/README.md`
  and `Shaddai-Royale/hall/packs/`: **Gridiron** (football), **Neon Hoops** (basketball),
  **Starfall** (space shooter), **Dodgeball** — playable now; plus **SKATE** and **blackjack**
  (Royale) already live inside the Hall's own seat/pack engine, not as standalone cabinets. The
  manifest already has a single `arcade-cabinet` prop, **concept-approved**, no ref/mesh logged
  yet: **1** fal hunyuan-3d **rapid** mesh, **$0.225**, then **code** re-skins the cabinet's screen
  texture per game (cheapest correct route — do not generate 4–6 separate cabinet meshes).

---

## 6. Owner decisions needed before spend

1. **SHADDAI contradiction**: `MAIN-CHARACTERS-PLAN.md` records the owner cutting SHADDAI on
   2026-09-24, but `spend-ledger.json` shows an `agent-shaddai` meshy mesh call ($0.80) on
   2026-09-25, and `manifest.json` still lists `agent-shaddai` as `concept-approved`. Was SHADDAI
   un-cut, or was that mesh call a mistake? Resolve before touching the SHADDAI row again.
2. **Casino dealer bot**: reuse an existing NPC-robot/held Meshy bundle ($0) or generate a new one
   ($0.80)?
3. **ORACLE's wand-staff**: is the purple energy-orb image (`generated-image (17).png`) meant to be
   the physical staff mesh, or a hand-cast VFX effect (which would need no mesh at all, just a
   shader)?
4. **NEXUS laser blaster**: no reference image was found in `refs/` or `MODELS FOR FAL` this pass —
   needs a fresh owner-supplied ref (or approval to design one from the "electric attacks" brief
   already in the manifest).
5. **Void castle hero GLB pass**: currently $0 and already shipping procedurally
   (`world-void-castle.js`, 28k tris, 115 colliders, tested). A fal hero pass is optional future
   work per `VOID-CASTLE.md`'s own "what a later pass would replace" section — confirm whether it's
   wanted at all before scheduling it.
6. **Huge Red Flying Dragon OBJ license**: unknown source, owner flagged to confirm before use as
   an Emberfall boss variant.
7. **Several creature/prop downloads have "unknown" license** (skeleton FBX, insect-monster
   obj/fbx, Iguana.zip, tuna files, several kit pieces) — fine to use as-is, or does the owner want
   these swapped for confirmed-CC0 sources first?

---

## Refs the owner must supply/confirm

- **Floating sky-station** and **blue reactor complex** building-style refs: `DOWNLOADS-AUDIT.md`
  says these 2 building-style refs exist in `MODELS FOR FAL\BILLBOARDS and ART`, but this pass
  could not positively identify them by filename among that folder's contents (checked
  `9qugWEsesKgavefP7p_41U.png`, `G_N3VvRWgAAP1TP.jpg`, `Gemini_Generated_Image_2zqlp...png`, none
  of which matched — they turned out to be a glitch texture, a "DREAMERS" clock, and a gold
  matrix-collage image respectively). **Owner needs to point to the exact 2 files** before a
  manifest row or concept spend can happen for these.
- **NEXUS laser weapon** reference image (none found).
- **ORACLE wand-staff** — confirm whether the purple-orb image is the staff or a VFX-only effect.
- **Casino dealer bot** — confirm reuse-vs-new decision (§6.2).
- **Huge Red Flying Dragon OBJ** — confirm license/source before use.
- Confirm/clarify the **SHADDAI cut-vs-spent contradiction** (§6.1) so the manifest status can be
  corrected either way.

---

## Owner batch 2026-09-28 — vehicles, boards, sand houses, grok bots (PLAN ONLY, $0 spent)

Refs (all in `OneDrive\Pictures\LF2\MODELS FOR FAL\`):
- `4131ef92….jpg` — 10 retro-futurist hover cars (sedan, taxi pod, van, box truck, cargo pickup, wagon)
- `29f7a77a….jpg` — 9 hoverboards (WildStar sheet)
- `7b8b9019….jpg` — 4 sand-house archetypes (01 twin dome · 02 tower + solar wing · 03 stepped block + roof stairs · 04 arched courtyard)
- `9ff6d8b1….jpg` — solar vertical-farm tower (community ground floor + living pods)
- Grok bots: `fc6ed6df`, `f30c04bd`, `e748c454`, `92815f70` + unicycle blueprint (chat image #72)

**Rule:** anything people or agents walk INTO is built procedurally (Blender/three.js) with real door gaps and interiors, never as a fal mesh. fal/hunyuan output is a closed 40k-tri shell: no doors, no rooms.

| Item | Route | Why | Cost |
|---|---|---|---|
| Sand houses ×4 archetypes + interiors | Procedural: Blender `build_sand` + interiors-v3 recipes (agent briefed) | must be enterable; shells + seats + NPC slots | $0 |
| Vertical-farm tower | Procedural (stacked pod rings + canopy) | enterable, repeatable | $0 |
| Hover cars ×10 | Procedural three.js kit (body box + cabin glass + hover pads + palette), seats for driver/agent | 10 variants from 1 kit; drivable + NPC traffic | $0 |
| Hero cars ×3 (taxi pod, box truck, wagon) | optional fal image→3D, then decimate to ≤8k tris | only if the kit looks too plain | 3 × $0.375 = $1.13 |
| Hoverboards ×9 | Procedural three.js (deck + 2–4 thruster pods + emissive trim), rider stands on deck | flat shapes suit code; recolor = free skins | $0 |
| Grok bots, wheel style A + B (unicycle) × 4 tiers | T1–T2 procedural (task drones); T3–T4 fal mesh + Blender rig by hand (not the humanoid auto-rigger) | tiers = SPARKS/level unlocks; T4 humanoid fights beside you | ~4 × $0.375 = $1.50 |

**Batch total if every optional item runs: ≈ $2.63.** The procedural kits come first. fal runs only on the owner's OK after seeing the free version.

Grok bot tiers (both wheel styles): T1 Courier (fetch/deliver tasks) → T2 Worker (gather/craft) → T3 Guardian (defends, ranged) → T4 Humanoid (melee, fights beside you, agent pilots it). Unlock by SPARKS or level; SPARKS is a closed loop and pay-in only.

---

## Sources consulted (read-only)

`docs/MAIN-CHARACTERS-PLAN.md`, `docs/FAL-NEEDS-PLAN.md`, `docs/GLB-INVENTORY.md`,
`docs/DOWNLOADS-AUDIT.md`, `docs/DRAGONS.md`, `docs/DRAGON-RIDE.md`, `docs/CITY-MASTER-BRIEF-v2.md`,
`docs/REALMS-V1.md`, `docs/VOID-CASTLE.md`, `docs/HANDOFF-3D-WORLD-2026-09-20.md`,
`fal-assets/production/manifest.json`, `fal-assets/production/spend-ledger.json`,
`fal-assets/production/README.md`, `public/assets/manifest-downloads.json`,
`fal-assets/refs/agents/*`, `fal-assets/refs/characters/*`, `fal-assets/refs/dragons/*`,
`C:\Users\Brittany\OneDrive\Pictures\LF2\MODELS FOR FAL\` (file listing + 7 images viewed: 3
`generated-image (17/18/19).png` = ORACLE orb / PIKADON hammer / QUILL feather refs, plus 4 images
in `BILLBOARDS and ART` that turned out not to be the sky-station/reactor refs),
`C:\Users\Brittany\Desktop\shaddai-games\README.md`, `C:\Users\Brittany\Shaddai-Royale\README.md`
and `hall/packs/` listing.

### Growth-farm towers: ownable, regenerative (owner 2026-09-28, ref = vertical-farm tower)

- **Build:** procedural tower, $0. Layers:
  - solar canopy + rain pool on top;
  - food-wall rings that grow visibly (leaf density/emissive rises with each harvest cycle);
  - living-pod spine;
  - ground-floor community market + micro-farm plots around it.
  Enterable by humans and agents.
- **Own:** claimed like a land plot (ties to the existing `plot_buy` / plot economy). One owner per tower. Co-op seats rent pods to other players and agents.
- **Rewards:** each real-time cycle produces regenerative items: food, seeds, bio-fuel cells, med-herbs, rare bloom cosmetics. An agent assigned as farmer boosts the yield.
- **Use / trade / sell:** consume items (heal, stamina, mount feed, dragon treats, crafting inputs); trade player↔player; sell at the tower market or city vendors **for SPARKS only**.
- **Hard rule:** SPARKS stays closed-loop. Items and SPARKS never cash out to money, and there is no yield-on-deposit or vault. Rewards come from active play (tending, harvesting, agent labor), never passive financial returns.
- **Utopia tie-in:** each tower's output raises the district's "regen" meter (greener terrain, cleaner air/fog, unlocks). This is a shared-progress goal, not a payout.
