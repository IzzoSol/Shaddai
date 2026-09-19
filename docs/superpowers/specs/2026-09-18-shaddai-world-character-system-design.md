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
| 1 | QUILL from `quill-tpose-ref.png` (rig-ready): mesh + rig + sprites | ~$0.65 | 3D model + sprites |
| 2 | ZEROX, ORACLE, NEXUS, PIKADON, TURTLE: concept image → **approve** → T-pose fix (~$0.05 edit) → mesh/rig. Nothing 3D before approval. | ~$0.75 each, ~$3.75 | concept, then model |
| 3 | Modular voxel creator (code only) | $0 (fal) | live creator page |
| 4 | Premium mounts from mecha refs (concept → approve → mesh) | ~$0.50 each | concepts first |
| 5 | Realm maps + hub interiors, one realm at a time | TBD per realm | concept per realm |
| 6 | Extra hero characters (teal ninja, green flail) | ~$0.75 each | concept first |

Total for gates 1–2 + 4 (3 mounts): under **$8**. Well inside the remaining budget.

## 8. Open questions for the owner
1. Which reference is **SHADDAI**?
2. The teal-haired ninja-suit character and the green-haired flail character: extra Citizens, or should they become council members?
3. Casino-slot mecha: Hall guardian, premium mount, or boss?
4. Content level for full-body Council art (§4 note).
