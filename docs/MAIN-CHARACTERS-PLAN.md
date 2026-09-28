# Main Characters Plan — SHADDAI 3D World (planning only, no spend)

Status: PLANNING ONLY. No fal/HF calls, no Blender, no mesh generation happened while writing this.
Scope: the 7 Council agents (SHADDAI, ZEROX, ORACLE, NEXUS, TURTLE, QUILL, PIKADON) — the "MAIN characters"
the owner wants "made with all the animations we downloaded, wired with render so they can jump, roll,
attack... and look EXACTLY like the images." The 5 Lantern Order roster members (Warrior/Mage/Explorer/
Engineer/Scout) are a **separate**, already-rigged Citizens set (`fal-assets/characters/{warrior,mage,
explorer,engineer,scout}/`) and are out of scope here except as a template for pipeline mechanics.

Budget at time of writing: `fal-assets/production/manifest.json` hard cap **$100**, reserve **$20**,
spend-ledger total already spent **$12.95** (38 entries, mostly props/buildings/vehicles + 2 ORACLE mesh
attempts) → **≈$87 left overall, ≈$67 left outside the untouchable $20 reserve**. Agent family itself has
its own **$20 cap** in the manifest (separate from the other families) — plenty for 7 characters at the
per-character costs in §5.

---

## 1. Roster table

| Character | Reference image(s) | Current state | Gaps |
|---|---|---|---|
| **ORACLE** | `fal-assets/production/refs/agent-oracle/oracle-tpose-owner.jpg` (full-body T-pose, owner-supplied) → cleaned concept `fal-assets/production/concepts/agent-oracle/agent-oracle-tpose-noweapon.png` | **mesh-approved** in manifest; 2 mesh attempts already logged in spend-ledger ($0.80 each = $1.60 spent) but no `.glb` result confirmed present under `public/assets/agents/` (only old `ORACLE.glb` from the June council-portrait pipeline exists, ~57.9MB) | Confirm whether the 2 meshy-v6 calls actually produced a usable GLB (check meshy job status / re-download) before spending again; if not, re-run once more (3rd-try guard in preflight.mjs will need review) |
| **PIKADON** | `fal-assets/production/refs/agent-pikadon/pikadon-knight-tpose-owner.png` → cleaned concept `agent-pikadon-tpose-noweapon.png` | **mesh-approved**, same situation as ORACLE — meshy step not yet logged in spend-ledger for pikadon at all | Run meshy v6 image-to-3d on the approved concept; nothing spent yet for this character |
| **ZEROX** | `ZEROX-council.png` (portrait) + `fal-assets/production/refs/agent-zerox/zerox-fullbody-katana.png` (full body, weapon in hand) | **ready-concept** (owner flagged "note issues") | Full-body ref holds a glowing katana — needs the weapon-removal image-edit step before it's a clean T-pose (mesh step requires open empty hands per `family_rules.agent`). No concept-approved yet |
| **NEXUS** | `agent-nexus.png` (portrait/helmet only, no body) | **ready-concept**, manifest explicitly flags: "portrait-only ref — the HF concept step invents the body — owner MUST approve the T-pose before any fal mesh spend" | No full-body ref exists at all. Highest-risk character for "look EXACTLY like the images" since the body silhouette (mech proportions) has to be invented, only the head/shoulders are anchored |
| **QUILL** | `QUILL-council.png` (portrait) + `quill-tpose-ref.png` (already a clean rig-ready T-pose per spec doc) | **ready-concept**; per the character-system spec, QUILL can skip the concept-generation step entirely and go straight from `quill-tpose-ref.png` to mesh | Confirm `quill-tpose-ref.png` still exists in refs/concepts (not found in current `refs/agent-quill/` listing — only `NEED.txt` there; verify location before assuming it's ready) |
| **TURTLE** | `agent-turtle.png` (per spec doc; not directly re-viewed this session) | **ready-concept** (owner flagged "note issues") | No full-body T-pose ref confirmed in `refs/agent-turtle/` (folder only has `NEED.txt` currently) — needs owner to supply/approve a full-body pose before mesh |
| **SHADDAI** | none in `MODELS FOR FAL` currently; concept exists at `fal-assets/production/concepts/unit-shaddai/unit-shaddai-tpose-clean.png` ("Hooded SHADDAI commander", horned hood, green/gold cape) | **CUT** — owner explicitly said "leave out SHADDAI" on 2026-09-24; concept-approved status is stale/pre-cut | Owner decision needed: revisit design or leave SHADDAI as the placeholder (old `SHADDAI.glb`, June council-portrait pipeline) indefinitely |

Existing 3D assets for all 7 already in the repo (from an earlier, different pipeline — June council-portrait
generation, not the current T-pose/meshy pipeline): `public/assets/agents/{NEXUS,ORACLE,PIKADON,QUILL,
SHADDAI,TURTLE,ZEROX}.glb`, each 50–63 MB (see `_GLB_SOURCE_MAP.txt`), each with a matching
`-portrait.png`/`-action.png`/`-council.png`. These are **not rigged to the UAL2 skeleton** and are far over
any reasonable tri/texture budget for a real-time world — they are the "look but don't touch" placeholders
the owner is asking to replace, not something to build on. 2D sprite sheets for walk/run/action already
exist per-character in `public/assets/characters/*/` (from `roster.json`'s "3D rig + matching 2D sprite" line)
and are separate, working, low-cost assets — keep those.

---

## 2. Per-character visual spec, fal route, budget

Shared reference-led rule (owner mandate): every character below uses the *existing* owner-supplied image
as ground truth. The only new generation per character is (a) a clean neutral-background T-pose if the ref
holds a weapon or isn't already T-posed, and (b) the image→3D mesh call. No new "concept from scratch" —
we are not designing new looks, only cleaning existing ones for the rig pipeline.

### ORACLE — Seer
- **Silhouette**: adult female, ponytail, slim build, arms-out T-pose already in ref.
- **Palette**: violet/magenta glow `#b83dff`-ish on black tactical bodysuit, bronze/leather utility belt with potion vials, black knee-high boots with violet trim.
- **Materials**: matte black latex/tac-suit body, glowing violet energy lines (emissive), leather/bronze belt hardware (metallic-rough), glass potion vials.
- **Signature features**: floating violet energy orb/blade motif near the hands, high ponytail, dagger strapped to thigh, cybernetic-looking gloved hands.
- **fal prompt** (T-pose cleanup — REMOVE the floating energy dagger/orb, keep everything else): *"same character, same exact pose and outfit, full body T-pose facing camera, arms straight out at shoulder height, open empty hands, no weapon, no floating objects, legs shoulder-width, flat mid-grey studio background, soft even studio light, solid opaque surfaces, no text, no watermark"* — image-edit (flux-pro/kontext) from `oracle-tpose-owner.jpg`. **Already done** → `agent-oracle-tpose-noweapon.png` is exactly this. Ready to mesh.
- **Route**: fal-ai/meshy/v6/image-to-3d (mesh + auto-rig + walk/run bundled), ~$0.80.
- **Tri budget**: 30–35k (detailed belt/hair geometry).
- **Texture**: 2048×2048 base+normal (down-sample to 1024 for in-world LOD1).

### PIKADON — Guardian
- **Silhouette**: broad armored knight, horned red-eyed helm, spiked pauldron, holding a warhammer in the ref (needs removal).
- **Palette**: crimson `#8a1414`/black plate armor, glowing orange-amber rune accents `#ff9a2e`, dark red cloth tabard with a small bear-charm detail.
- **Materials**: brushed dark-metal armor plates (metallic 0.8/rough 0.4), emissive rune inlays, worn leather straps/chains.
- **Signature features**: horned helmet with glowing red eye-slits, single oversized spike pauldron (asymmetric — left vs right shoulder reads differently), chain-and-tassel belt, teddy-bear trinket (a humor/loyalty detail worth keeping — it's small and won't affect the rig).
- **fal prompt** (T-pose cleanup — REMOVE the warhammer): same template as above, applied to `pikadon-knight-tpose-owner.png`. **Already done** → `agent-pikadon-tpose-noweapon.png`. Ready to mesh.
- **Route**: fal-ai/meshy/v6/image-to-3d, ~$0.80.
- **Tri budget**: 35–40k (heaviest character — spikes, chains, layered plate).
- **Texture**: 2048×2048, may need a second 1024 normal pass for the armor edge-wear detail.

### ZEROX — Trader
- **Silhouette**: adult female, twin space-buns with hair extensions, tall/slim, standing confidently, one hand holding a glowing katana.
- **Palette**: glossy black latex suit with cyan/teal `#5fe0ff` piping and seams, silver hair-band accents, teal-glow blade.
- **Materials**: high-gloss black latex (clearcoat), cyan emissive line-work, small gold/silver hardware (belt buckle, bear charms), glowing teal blade (separate weapon prop, not baked into the body mesh).
- **Signature features**: double hair-buns with wavy loose strands, dangling crystal/diamond earrings, zip-front suit collar, teddy-bear charms on hip and boots (brand-consistency detail shared with PIKADON's bear charm — a nice found throughline, worth keeping across characters), chunky boot soles with teal trim.
- **fal prompt** (T-pose cleanup — REMOVE the katana AND lower the current confident/hip-cocked pose to a strict symmetric T-pose): *"same character, same exact outfit and hair, full body T-pose facing camera dead-on, arms straight out at shoulder height, open empty hands, no weapon, no glow effects except the existing suit piping, symmetric standing pose, legs shoulder-width apart, flat mid-grey studio background, soft even studio light, solid opaque surfaces, no text, no watermark"* — NOT yet generated, this is the next real step for ZEROX.
- **Route**: HF flux-pro/kontext for the concept cleanup (billed to HF, $0 fal) → owner approval gate → fal-ai/meshy/v6/image-to-3d, ~$0.80.
- **Tri budget**: 28–32k (latex suit is simple-shaded, hair is the geometry cost).
- **Texture**: 2048×2048 (glossy clearcoat needs a clean roughness map).

### NEXUS — Architect
- **Silhouette**: unknown below the shoulders — only a portrait/helmet-and-collar shot exists. Cyber-helmet with vents/plating, headphone-style ear unit, high tech collar with labeled panels ("APFL", "NEXOX" etc. stylized tech-greeble text).
- **Palette**: teal/cyan `#5fe0ff` glow + burnt-orange `#ff7a1f` accent panels on a dark gunmetal base — matches `family_rules`/manifest palette note ("cyan + orange accents on teal/black armor").
- **Materials**: brushed dark-metal helmet plates, glossy cyan visor/screen inlays, orange emissive strip lighting, mesh/vent grille texture on the ear unit.
- **Signature features**: asymmetric mohawk-like helmet ridge, large circular ear-piece with orange ring light, panel-labeled collar (reads as "the architect who documents everything").
- **fal prompt** (full-body invention — this is the one character where we're extending, not just cleaning): *"same character design, same helmet, same color palette (teal/cyan glow, burnt orange accent panels, dark gunmetal armor), extend to a full-body heavy mech/armored humanoid, full body T-pose facing camera, arms straight out at shoulder height, open empty hands, legs shoulder-width, wide heavy-set shoulders and torso reading as 'built like it looks — heavy, load-bearing' per the character's engineer role, flat mid-grey studio background, soft even studio light, solid opaque surfaces, no text, no watermark"* — matches roster.json's "full-size heavy mech, NOT chibi" note. **Gate**: owner must explicitly approve this invented body before ANY mesh spend (manifest already flags this).
- **Route**: HF flux-pro/kontext or flux-dev for the body-extension concept, $0 fal → owner approval gate (hard stop) → fal-ai/meshy/v6/image-to-3d, ~$0.80.
- **Tri budget**: 35–40k (heaviest silhouette after PIKADON).
- **Texture**: 2048×2048.

### QUILL — Scribe
- **Silhouette**: adult male, medium build, dark coat over a violet/dark undershirt, one hand holds a paper/book, a large blue quill-pen strapped diagonally across the back like a weapon.
- **Palette**: deep violet `#5a3a8f`-ish cloak/coat over black under-layer, gold sacred-geometry medallion motif behind the head (likely a background halo, not part of the body), sky-blue quill accent, copper/bronze filigree per the spec doc's coat description.
- **Materials**: matte cloth coat, small metallic clasp/pin details, feather texture on the quill, paper prop.
- **Signature features**: neat beard/moustache, side-swept dark hair, quill pen holstered like a weapon, holding paper/scroll (needs removing for T-pose), potion-style belt per the spec doc ("scrolls, potion belt, arrow-quill quiver").
- **fal prompt**: if `quill-tpose-ref.png` (mentioned in the character-system spec as already rig-ready) is located, **no generation needed** — approve directly. If it cannot be found, fall back to: *"same character, same coat and quill-pen back accessory, full body T-pose facing camera, arms straight out at shoulder height, open empty hands, no paper/book in hands, legs shoulder-width, flat mid-grey studio background, soft even studio light, solid opaque surfaces, no text, no watermark"* from `QUILL-council.png`.
- **Route**: fal-ai/meshy/v6/image-to-3d, ~$0.80 (concept step likely $0 if the T-pose ref is reused).
- **Tri budget**: 25–30k.
- **Texture**: 2048×2048.

### TURTLE — Designer
- **Silhouette**: per spec doc, "chibi tech-ranger, goggles, vines" in roster.json but the character-system spec's look-sheet instead describes `agent-turtle.png` as "green hair, visor helmet + orange headphones" (adult proportions) — **these two descriptions conflict** and `agent-turtle.png` was not re-viewed this session (not present in the folder listing under that exact name at top level; needs to be located).
- **Palette**: green `#00ff9c`-family + orange accents on black, per both docs.
- **Materials/signature features**: TBD pending locating and viewing the actual reference image.
- **fal prompt**: cannot be finalized until the reference is confirmed and viewed.
- **Route**: same T-pose-cleanup → meshy v6 pattern as the others once the ref is confirmed, ~$0.80.
- **Tri budget**: 25–30k (assume similar to QUILL/ZEROX pending ref).
- **Blocker**: **locate `agent-turtle.png` (or equivalent) and resolve the chibi-vs-adult-proportions conflict with the owner before spending anything on TURTLE.**

### SHADDAI — The Source (CUT, informational only)
- Owner explicitly cut this character on 2026-09-24 ("leave out SHADDAI"). A concept exists
  (`unit-shaddai-tpose-clean.png`, hooded commander, horned hood, green/gold cape) but manifest status is
  stale (`concept-approved` while `defects` says CUT). **No spend planned** unless the owner reopens it.

---

## 3. Rigging + animation route

**Shared skeleton problem (important, currently unresolved in the codebase):** the repo has *two different*
animation sources that are not on the same skeleton today:

1. **UAL2 (Universal Animation Library 2, Quaternius, CC0)** — `C:\Users\Brittany\OneDrive\Desktop\New folder\Downloads\Universal Animation Library 2[Standard]\Universal Animation Library 2[Standard]\` (Male Mannequin + Female Mannequin rigs, Unity FBX `UAL2_Standard.fbx`). This is the combat/traversal library: 43 clips baked into `public/assets/anims/ual2-dirs.json` (`A_TPose`, `Sword_Regular_A/B/C` + combo, `Sword_Heavy_Combo`, `Melee_Hook`, `Shield_Dash`/`Shield_OneShot`, `NinjaJump_Start/Idle_Loop/Land`, `Slide_Start/Loop/Exit` (roll stand-in), `ClimbUp_1m`, `Hit_Knockback`, `Zombie_*`, `Farm_*`, `TreeChopping_Loop`, `Idle_FoldArms_Loop`, `Idle_Lantern_Loop`, etc.). Retargeted at runtime via `public/ual-retarget.js` and baked with `tools/ual/bake-ual.mjs` / `build-agent.mjs`.
2. **Meshy v6 auto-rig** — the *locomotion* clips (idle/walk/run/sprint) actually used in-game come from a **separate** Meshy-generated rig/skeleton entirely: `public/SHADDAI-WORLD-3D.html` loads `hero-walk.glb` → falls back to `hero-run.glb`/`hero-rigged.glb` (all gitignored, local-machine-only) → falls back to `robot.glb` → falls back to `SHADDAI.glb`. `_updatePlayerLoco()` (line ~3334) drives this blend. This is **not** the UAL2 skeleton.

This means "wired with render so they can jump, roll, attack — all of that cleanly" requires the new
council meshes to retarget to **both** rigs, or (better) the Meshy v6 mesh step should produce its own
walk/run pair per character (the `agent` pipeline's `rig+clips` step already claims this: "auto-rig +
walk/run/attack clips ... included in meshy v6") and UAL2 supplies everything Meshy doesn't generate
(jump, roll/slide, climb, sword combos, hit reactions). That is the existing, working pattern for ORACLE/
PIKADON already (2 of their pipeline steps are meshy-included idle/walk/run, then UAL2 retarget on top) —
just extend it to ZEROX/NEXUS/QUILL/TURTLE once their meshes exist.

### Clip-set mapping (controller states → source)

| Controller state (`world-player-controller.js`) | UAL2 clip used today | Missing / notes |
|---|---|---|
| idle / walk / run / sprint | *(none — comes from Meshy-included walk/run + host's own loco blend, not UAL2)* | Need confirmation that Meshy v6 will bake usable idle/walk/run for each of the 5 new/pending characters, since UAL2 has no plain idle/walk/run loop (`Idle_FoldArms_Loop`, `Idle_Lantern_Loop`, `Walk_Carry_Loop`, `Zombie_Walk_Fwd_Loop` are all themed variants, not neutral locomotion) |
| jump / doubleJump | `NinjaJump_Start` (timeScale 1.4) | present |
| airborne (loop) | `NinjaJump_Idle_Loop` | present |
| land | `NinjaJump_Land` | present |
| hardLand | `Hit_Knockback` | present |
| roll | `Slide_Start` → `Slide_Exit` | **explicitly a stand-in** per docs — UAL2 has no real barrel-roll/combat-roll clip |
| slide (loop) | `Slide_Loop` | present |
| climb | `ClimbUp_1m` | present, only handles ≤1.2m ledges |
| crouch | *(none)* | camera-dip only, no clip |
| swim | *(none)* | loco blend only, no clip |
| attack light | `Sword_Regular_A/B/C` + `_Rec` recovery variants, `Sword_Regular_Combo` | present, weapon-agnostic naming (works for sword-carrying characters; PIKADON's hammer and ZEROX's katana would reuse these visually close enough, QUILL's quill-pen is the odd one out) |
| attack heavy | `Sword_Heavy_Combo` | present |
| attack (unarmed/melee) | `Melee_Hook` / `Melee_Hook_Rec` | present |
| block/guard | `Sword_Block`, `Shield_Block_Loop`/`Shield_OneShot`/`Shield_Break` (loop present as `Idle_Shield_Loop`/`Idle_Shield_Break`) | present, partial |
| dash | `Sword_Dash`, `Shield_Dash` | present |
| hit reaction | `Hit_Knockback` | present |
| death | *(none)* | **missing entirely** — no death/knockdown clip in the 43-clip set |
| emote | `Yes`, `Chest_Open`, `Consume`, `Idle_TalkingPhone_Loop`, `Idle_Rail_Call`/`Idle_Rail_Loop` | present, grab-bag of flavor emotes |

Bottom line: UAL2 covers combat/traversal well but has **zero neutral idle/walk/run/sprint and zero death
clip** — both real gaps. Locomotion must keep coming from the Meshy per-character auto-rig output (as it
already does for the existing hero), and a death animation is either sourced elsewhere (Mixamo has one,
same skeleton family) or scripted as a ragdoll/fade fallback.

---

## 4. Game wiring checklist

- **GLB spec**: meshopt-compressed geometry, webp textures (2048 concept-source → export at 1024 for
  world use, 2048 only for close-up cutscenes/portraits), clip names matching the table in §3 exactly
  (case-sensitive — `ual-retarget.js` and `bake-ual.mjs` key off these strings).
- **Loading path**: mirror the existing `_loadHero()` fallback chain in `public/SHADDAI-WORLD-3D.html`
  (~line 3400): try the new per-character rigged GLB first, fall back through the chain, log a console
  warning (not a silent failure) so a missing character is visible in testing.
- **Per-character scale**: player unit is **1.8 m = 7/1.8 world-units-per-metre** conversion already defined
  in `PLAYER-CONTROLLER.md` ("1 m = 3.889 u"). All 7 council characters are adult humans/mechs at the same
  1.8 m reference height (NEXUS's mech bulk changes silhouette width, not height) — normalize on import by
  bounding-box height per the character-system spec's §2.2 rule ("normalized on load by bounding box
  height... any asset outside ±10% fails `forge.mjs check`").
- **LODs**: `tools/ual/make-block-lods.mjs` already exists in the toolchain — reuse it. Target LOD0 (close,
  full tri budget), LOD1 (~40% tris, world-normal viewing distance), LOD2 (silhouette-only, far/crowd).
  Given the weak laptop (Intel HD 620 / 8 GB per memory notes), LOD1 should be the *default* render distance
  in-editor, not LOD0 — test this locally before assuming full-detail is playable.
- **Existing tooling to reuse, not rebuild**: `tools/ual/build-agent.mjs` (agent GLB assembly),
  `tools/ual/bake-ual.mjs` (clip baking), `tools/ual/count-tris.mjs` (verify tri budget before shipping),
  `tools/ual/contact-sheet.mjs` (visual QA sheet), `fal-assets/production/preflight.mjs` (spend gate —
  MUST run before and after every paid call, no exceptions).

---

## 5. Cost table (fal only — HF concept steps are $0 fal, billed separately to HF credits)

| Character | Concept (HF, $0 fal) | Mesh (meshy v6) | Retries budget (×1 extra) | Fal subtotal |
|---|---|---|---|---|
| ORACLE | done | $0.80 (×2 already spent = $1.60 logged; verify output before a 3rd) | $0.80 | $0.80–$2.40 |
| PIKADON | done | $0.80 (not yet spent) | $0.80 | $0.80–$1.60 |
| ZEROX | $0 (HF, pending) | $0.80 | $0.80 | $0.80–$1.60 |
| NEXUS | $0 (HF, pending, higher risk of redo since body is invented) | $0.80 | $0.80 ×2 (budget 2 retries — highest uncertainty) | $0.80–$2.40 |
| QUILL | $0 (reuse existing T-pose, likely) | $0.80 | $0.80 | $0.80–$1.60 |
| TURTLE | $0 (blocked on ref) | $0.80 | $0.80 | $0.80–$1.60 |
| SHADDAI | CUT | — | — | $0 |
| **Total (6 active characters)** | | | | **≈$5.00 best case / ≈$11.20 worst case** |

Against the manifest's **$20 agent-family cap** and the **≈$67 usable overall** (outside the $20 reserve),
this comfortably fits even in the worst case, with room left for the building/vehicle/prop families and a
finisher video later. The real constraint is not dollars — it's the **manual owner-approval gates** (each
T-pose concept needs a human look before a single mesh dollar is spent) and the **missing full-body refs**
for TURTLE (located) and the invented body for NEXUS.

**Recommended order** (least risk / most already-done first):
1. **PIKADON** — concept already approved, zero spend yet, straight to mesh.
2. **ORACLE** — concept already approved; first verify the 2 existing $0.80 mesh calls actually produced
   a usable GLB before spending a 3rd time (don't re-spend blind).
3. **QUILL** — likely a $0-concept skip straight to mesh, once `quill-tpose-ref.png` is located.
4. **ZEROX** — needs one HF weapon-removal edit, then mesh.
5. **TURTLE** — blocked until the reference image is located/clarified with the owner.
6. **NEXUS** — highest uncertainty (inventing a body), do last so the other 4 establish a proven mesh
   pipeline before spending on the riskiest one.
7. **SHADDAI** — stays cut.

---

## 6. Blockers / questions for the owner

1. **TURTLE's reference is missing/ambiguous.** `roster.json` says "chibi tech-ranger, goggles, vines";
   the character-system spec says "green hair, visor helmet + orange headphones" (adult). `agent-turtle.png`
   was not found at the top level of the reviewed folders this session — please confirm the correct image
   and which description is current.
2. **ZEROX's full-body ref holds a weapon and a non-symmetric pose** (hip-cocked, katana in hand) — do you
   want the T-pose cleanup to keep the katana as a separate equippable weapon-prop (bone-attach, like the
   existing 6 weapon items) or drop it from the base mesh entirely?
3. **NEXUS has no full-body reference at all** — only the helmet/collar portrait. Before any mesh spend,
   do you want to see the invented full-body T-pose concept (heavy mech, per roster.json) for approval, or
   would you rather supply/generate a real full-body NEXUS reference first so nothing is invented?

---

## Sources consulted (read-only, nothing modified)

`fal-assets/production/manifest.json`, `spend-ledger.json`, `README.md`; `fal-assets/production/refs/agent-*`
and `concepts/agent-*`; `fal-assets/characters/roster.json`; `public/assets/agents/_GLB_SOURCE_MAP.txt`;
`public/assets/characters/index.json`; `public/assets/anims/ual2-dirs.json`; `docs/PLAYER-CONTROLLER.md`;
`public/SHADDAI-WORLD-3D.html` (`_loadHero`/`_updatePlayerLoco` region only); `tools/ual/` script listing;
`docs/superpowers/specs/2026-09-18-shaddai-world-character-system-design.md`; owner images
`agent-nexus.png`, `agent-pikadon.png`, `QUILL-council.png`, `ZEROX-council.png` (top-level LF2 folder) and
`oracle-tpose-owner.jpg`, `pikadon-knight-tpose-owner.png`, `zerox-fullbody-katana.png`,
`agent-oracle-tpose-noweapon.png`, `agent-pikadon-tpose-noweapon.png` (in-repo refs/concepts).
