# SHADDAI World — Character System & Full-World Spec

Status: DRAFT for owner approval. Nothing here spends money until a gate is approved.
Builds on: `2026-09-18-realm-art-direction-neon-city-and-tech-fusion-regions-design.md` (realm themes, 2D/3D parity §4.10).
References: `fal-assets/refs/agents/` (owner-supplied, 2026-09-18).

## 1. Principle: nothing already built is wasted

The ~$70 spent produced reusable rigs, not throwaway images. This spec adds layers on top; it does not replace them.

| Already built | Fate |
|---|---|
| 12 rigged chibi characters × classic/voxel, with walk/run/action + 2D sprites | Stay as **Citizens** (playable presets + NPCs). Not redone. |
| Leadr, Gaeli (tall, painted, rigged + sprites) | Stay as **Citizens**; matches owner's Ready-Player-One bar. |
| 7 mounts, 6 vehicles (static meshes) | Stay as **Tier-1 (basic) mounts/vehicles**. Premium tier redone from the new mecha refs (§5). |
| 6 weapon items + bone-attach + procedural fallback | Reused as-is by every new character. |
| `forge.mjs` / sprite capture / gotchas | The production line for everything below. |
| Voxel `rig.kit` + Vault/cosmetics store (`pixel-forge.html`, `/api/cosmetics`) | **Becomes the swappable-feature creator (§3). Costs $0.** |

## 2. Two character tiers

**Tier A — The Council (7 agents).** Hero characters, painted-realistic per the owner's agent portraits. Fully rigged 3D + 2D sprites via `forge.mjs`. One canonical look each; customization is layered gear/tint, not body swaps (see §3.3).

**Tier B — Citizens.** What players create and what fills the world. Modular voxel, swappable per part (§3). Existing 12 + Leadr/Gaeli ship as presets.

### 2.1 Council look sheet (from owner references)

| Agent | Reference | Palette | Signature | Notes |
|---|---|---|---|---|
| ZEROX | `ZEROX-council.png` | black latex-look suit, electric cyan piping | twin hair buns w/ silver bands, glowing blade, crystal earrings | Replaces the rejected bald-chibi. Full-body ref = the black/cyan katana woman. |
| ORACLE | `ORACLE-council.png` | black + violet glow | high ponytail, violet eyes, glowing seams | |
| QUILL | `QUILL-council.png` + `quill-tpose-ref.png` | violet robe → dark coat w/ copper filigree | goatee, blue feather quill, scrolls, potion belt, arrow-quill quiver | `quill-tpose-ref.png` is already a **rig-ready T-pose** — no concept step needed. |
| NEXUS | `agent-nexus.png` | teal + orange | cyber helmet, headphones, API-labelled collar | |
| PIKADON | `agent-pikadon.png` | black + crimson + amber | horned red-eyed helm, shield-crest chestplate | |
| TURTLE | `agent-turtle.png` | green + orange on black | green hair, visor helmet + orange headphones | |
| SHADDAI | **none supplied** | — | — | Owner to point at a ref (§8 Q1). Existing SHADDAI (crown/wings/scepter) is placeholder. |

`899183c3-…jpg` (teal-haired ninja-suit sheet with katana + plush pet + drone bugs) and the green latex flail character are **not assigned to an agent** — treated as extra Citizens/hero-tier characters and a weapon ref (§8 Q2). The spiked flail is a ready weapon-item ref.

### 2.2 Sizes (fixing "make sure sizes are correct")

Single canonical scale, enforced in the forge (not eyeballed per model):
- Adult human characters: **1.80 m tall = 7.5 heads**, normalized on load by bounding box height.
- Citizens (voxel): **1.50 m** (blockier, ~5 heads) — reads as a distinct, intentionally stylized class.
- Mounts: shoulder height 1.2–1.6 m (bull/ox), rider seat point authored per mount.
- Vehicles: 2–3 m long; hoverboard 1.4 m.
- Doors/hub interiors sized against the **1.80 m** unit. A size table lives in `fal-assets/characters/roster.json` and the viewer normalizes to it — any asset outside ±10% fails `forge.mjs check`.

## 3. Swappable features

### 3.1 Reference
The voxel "Create character" screen: **Race · Gender · Class · Face · Haircut**, then per-part color (Hair, Highlights, Skin, Outfit, Accent, Head, Chest, Legs, Boots, Cloak) with a palette + any-color picker.

### 3.2 Citizens (fully swappable, $0)
Extend the existing voxel `rig.kit` in `public/assets/pixel-people.js`:
- Data-driven part catalog: `race` (human, goblin, elf, …), `gender`, `class` (sets default outfit + weapon), `face`, `haircut` — each a set of box-part recipes, plus 10 color slots stored as hex.
- Reuses the accessory overlay already anchored to walk-bob coords (hat/mask/pet/weapon/wings).
- Character = JSON `{race,gender,class,face,haircut,colors{…},equipped{…}}`. This is the single record both the 2D world and the 3D realm read → satisfies 2D/3D parity by construction.
- 3D realm renders the same JSON with voxel boxes; 2D renders it through the existing path. No paid generation.

### 3.3 Council (limited swap — honest constraint)
Painted rigged meshes cannot swap heads/bodies. Swappable = **gear layers** (weapons via hand bone, back items, hats via head bone), **tint variants** (material hue shift), and a **pet slot**. A full per-part swap for Council would need re-generating per combination — out of scope.

## 4. Style registers (three, kept separate on purpose)

1. **Council** — painted-realistic, glossy, per §2.1.
2. **Citizens** — flat-shaded voxel (modular, §3).
3. **Realm-themed art** — per the realm art-direction spec.

Mixing registers inside one scene is a deliberate look (a stylized crowd of Citizens around a few realistic Council figures) but needs one scene-level test before we commit at scale.

Content note: several references are strongly sexualized full-body poses. I will keep the silhouettes, suits and color language and tone exposure to a general-audience level unless the owner says otherwise.

## 5. Mounts & vehicles (premium tier)
Owner refs: mecha hawk (blue/white/orange), mecha bull (red/grey, cyan lines), casino-slot mecha (dice, roulette, jackpot), "Every Type of Mecha" chart.
- Premium mounts are static full-detail meshes (Meshy rigging is humanoid-only — standing decision).
- Casino-slot mecha → **Hall/casino realm** guardian or premium mount (owner to confirm role, §8 Q3).
- Each mount gets a rider seat anchor and a size per §2.2.

## 6. World & realms
Per the realm art-direction spec: 8 regions (city, meadow, beach, forest, desert, suburb, volcano, darkforest), each with its own tech-fusion theme; neon-streetwear only in the City hub. This spec adds:
- Hub interiors sized to the 1.80 m unit.
- Council members as **realm anchors** (e.g. ZEROX → market/billing plaza, QUILL → library/scriptorium, NEXUS → server-farm district, PIKADON → gate/keep, ORACLE → observatory, TURTLE → design studio, SHADDAI → central hall) — placeholder mapping, owner to correct.
- Grok-bot, PayBox, lots/siege stay deferred; PayBox needs the owner's own `/mcp` auth.

## 7. Phases & cost gates (each ends with the owner seeing output)

| Gate | Work | Est. spend | Owner sees |
|---|---|---|---|
| 0 | This spec approved; assign SHADDAI ref | $0 | — |
| 1 | QUILL from `quill-tpose-ref.png` (rig-ready): mesh + rig + sprites | ~$0.80 | 3D model + sprites |
| 2 | ZEROX, ORACLE, NEXUS, PIKADON, TURTLE: concept image → **approve** → T-pose fix (~$0.05 edit) → mesh/rig. Nothing 3D before approval. | ~$0.85 each, ~$4.25 | concept, then model |
| 3 | Modular voxel creator (code only) | $0 (fal) | live creator page |
| 4 | Premium mounts from mecha refs (concept → approve → mesh) | ~$0.50 each | concepts first |
| 5 | Realm maps + hub interiors, one realm at a time | TBD per realm | concept per realm |
| 6 | Extra hero characters (teal ninja, green flail) | ~$0.75 each | concept first |

Total for gates 1–2 + 4 (3 mounts): under **$10**, plus the animation library ($9.60 or $0 via a free clip pack).

## 8. Open questions for the owner
1. Which reference is **SHADDAI**?
2. The teal-haired ninja-suit character and the green-haired flail character: extra Citizens, or should they become council members?
3. Casino-slot mecha: Hall guardian, premium mount, or boss?
4. Content level for full-body Council art (§4 note).

---

## 9. Relationship to the existing world master prompt

The world master prompt is `fal-assets/SHADDAI-WORLD-ART-BIBLE.md` (v3 "FULL WORLD", 14 parts: terrain, swappable bodies, clothing layers, weapons, vehicles, food, buildings, overworld map, crowds, budget, consistency rules). It targets the **isometric 2D pixel world**. This spec is its **3D-rig counterpart**; both must stay locked to the same identity, so:

| Art Bible part | 3D-side equivalent (this spec) |
|---|---|
| 0.4 Seven-color agent key | §9.1 below (updated — owner refs override 2 rows) |
| 2 Swappable bodies / 2.2 agent skins | Council (Tier A) + Citizens (Tier B), §2–3 |
| 3 Clothing & gear layers, 3.2 headwear | Cosmetic slots + catalog, §11 |
| 4 Weapons, 4.2 signature weapons | Bone-attached weapons + Council signature set, §11 |
| 5 Vehicles/boats, 7 Buildings, 8 Overworld map | Realm art-direction spec + §5–6 |
| 11 Consistency rules | Applies unchanged; read before any batch |

### 9.1 Agent color key — reconciled with owner references

| Agent | Art Bible key | Owner reference | Decision |
|---|---|---|---|
| SHADDAI | gold / obsidian | none supplied | keep gold/obsidian until a ref arrives |
| NEXUS | cyan / steel | teal + orange | **cyan primary, orange accent** |
| ZEROX | emerald + gold / brass | black + electric cyan | **ref wins: black + cyan, gold accents** (this is also what roster.json already said) |
| ORACLE | violet / obsidian | black + violet | matches |
| TURTLE | emerald / copper | green hair + orange headset | matches (orange = copper family) |
| QUILL | gold + cream / brass | violet robe, copper filigree, blue feather | **ref wins: violet + copper, cream vest** |
| PIKADON | crimson + black / dark steel | black + crimson + amber | matches |

Building liveries, vehicle passes and weapon passes for ZEROX and QUILL follow the new rows. Flagged for owner confirmation (§8 Q5).

## 10. Animation — "attack, move and everything"

### 10.1 Key finding (verified, free)
All Meshy rigs share one identical 26-bone skeleton with identical names. A clip made on **one** character plays on **every** character by bone name. Tested 2026-09-18: mage's Charged_Spell_Cast played on Leadr's much taller body. Raw copy squashed the legs (Meshy clips bake per-bone translations in the donor's limb lengths); **rotations-only + hips translation rescaled by hips-height ratio** produced a clean pose. That logic now lives in `sprite-capture.html` (`retargetClip`) and must be reused by the 3D realm runtime.

Consequence: the animation library is built **once** (~a dozen rig calls on one donor) and applies to all ~40 characters, present and future, including every new Council member. No per-character animation spend.

### 10.2 Required clip set
| Clip | Status |
|---|---|
| walk, run | owned (every rig) |
| combat stance / ready | owned (Combat_Stance) |
| melee attack | owned (Left_Slash); add a second variant + heavy finisher |
| spell cast | owned (Charged_Spell_Cast) |
| ranged shot | owned (Archery_Shot) |
| relaxed idle (looping, non-combat) | **needed** |
| jump / land | **needed** |
| hit reaction | **needed** (Meshy id 178 known) |
| death / knockdown | **needed** |
| dodge / roll | **needed** |
| victory + 2 emotes (wave, dance) | **needed** |
| interact / gather / craft | **needed** |
| mounted (seated) idle + ride | **needed** — plus seat anchor per mount |

Ids for the missing clips are looked up in the Meshy animation library before any spend. **CORRECTION (verified against fal pricing API 2026-09-19):** `fal-ai/meshy/rigging` is **$0.80 per call**, not ~$0.15–0.20. Hunyuan v2 mesh is $0.16, so a Hunyuan+rig character is $0.96, not ~$0.60. Meshy v6 image-to-3d with rigging+animation is **$0.80 all-in** and sharper — now the default engine (`character-pipeline.mjs --meshy6`). At $0.80/clip, 12 new clips ≈ **$9.60, once**. Cheaper option: the owner downloads a free clip pack (e.g. Mixamo, needs the owner's login) and I retarget it by bone name (Mixamo's `mixamorig` prefix is a trivial rename) — $0 and hundreds of clips.

### 10.3 Citizens (voxel) animation
Code-authored on the box rig (arm/leg swing, weapon swing arcs, hit flash, death tip-over) — $0, and it lives in the same `pixel-people.js` walk math already shipped.

### 10.4 "Perfect" gate
`forge.mjs check` will render a contact sheet of **every** required clip per character; I look at it and reject anything with squashed limbs, foot-sliding, clipping through gear, or wrong scale before the character counts as done. No character ships on "the file exists".

## 11. Accessories & cosmetics that match

Matching is a rule, not a hope — every item carries data the renderer enforces:

- **One catalog** (`public/assets/accessories/catalog.json`, already shipping in the Vault) drives 2D **and** 3D. An item = `{id, slot, agentAffinity[], palette, anchor, imgScale, model3d}`. Same id → same look in both worlds (parity §4.10).
- **Slots:** hat/head, mask/face, back, wings, weapon (main), weapon (off), pet, aura, footwear-glow. Council members own a **signature set** styled to their key (§9.1): ZEROX cyan-glow blade + coin-sigil clasp; QUILL feather-quill + scroll satchel; PIKADON crest shield + horned helm variant; NEXUS relay-antenna headset; ORACLE violet halo/eye aura; TURTLE orange headphones + visor.
- **Tint-to-wearer:** universal items pull hue from the wearer's accent color so they never clash; Council signature items are locked to the agent key.
- **Pets:** owner refs include a plush companion (teal-haired sheet) and drone-bugs — first pets.
- **Weapons:** existing 6 items + spiked flail (owner ref, green-latex character) + ZEROX's glowing blade; all through the existing bone-attach + compensation fix, with procedural fallback for thin blades.
- **Citizens:** every catalog item is also a voxel-box recipe, so the same item exists at both fidelities.

## 12. Revised open questions
5. Confirm the two color-key overrides (ZEROX → black/cyan/gold, QUILL → violet/copper/cream).
6. Which weapons/pets from the reference set do you want first?
