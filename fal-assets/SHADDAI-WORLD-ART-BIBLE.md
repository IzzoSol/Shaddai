# SHADDAI WORLD — Complete Art Bible & Prompt Library (v3 · FULL WORLD)
### "Ancient wisdom rendered in future tech" — one continuous, swappable, isometric MMO universe

**Purpose:** the single top-to-bottom art spec for building the entire SHADDAI Pixel World —
terrain, buildings, citizens/agents, clothing, vehicles, boats, weapons, food, pets, and biomes
(grass/lava/water) — all locked to one palette and one modular production pipeline so nothing
drifts off-style as the world scales. Feed this whole document to Claude/fal as the working spec.

---

## PART 0 — FOUNDATIONS (apply to literally everything)

### 0.1 · THE STYLE SPINE (cinematic register — Descent scenes, hero art, posters)

> *Cinematic occult-almanac sci-fi. Ancient sacred wisdom fused with future technology. Deep
> obsidian-black void `#06080b`, luminous neon-emerald `#00ff9c`, illuminated-manuscript gold-leaf
> `#e8c45c`, and cold cyan `#5fe0ff` as the ONLY accent lights. High-contrast, dark, reverent,
> luminous, precise. Etched sacred geometry (Seed of Life, Flower of Life, Metatron's Cube, Tree of
> Life), faint Hebrew letters and alchemical/planetary glyphs as hairline gold engravings.
> Volumetric god-rays, fine film grain, subtle chromatic aberration at the edges, deep
> depth-of-field, anamorphic bokeh. Museum-grade, no text, no watermark.*

### 0.2 · PIXEL WORLD SUB-SPINE (isometric register — every tile, sprite, building, character)

> *Isometric pixel-art, clean 2:1 tile projection, crisp anti-aliased edges, saturated but
> palette-locked colors (emerald `#00ff9c`, gold `#e8c45c`, cyan `#5fe0ff`, obsidian `#06080b`, plus
> muted stone-grey `#6b7280` and deep teal `#0f3d3e` as neutrals). Single consistent light source
> from upper-left at 45°, soft ambient occlusion in every crevice, no gradient banding, game-ready
> spritesheet quality, transparent background unless a scene composite is explicitly requested.*

### 0.3 · SHARED NEGATIVE (append to absolutely everything)

> *text, watermark, signature, logo, UI, letters, caption, low-res, jpeg artifacts, blurry, muddy,
> oversaturated, garish rainbow, cartoon, childish, clip-art, stock-photo lighting, flat lighting,
> washed out, purple-on-white AI-slop gradient, extra limbs, deformed, inconsistent light direction,
> mismatched palette.*

### 0.4 · THE SEVEN-COLOR AGENT KEY (locks every district-specific asset to one identity)

| Agent | Core color | Metal/accent | Material motif |
|---|---|---|---|
| SHADDAI (Source) | gold `#e8c45c` | obsidian | radiant halo, spire finial |
| NEXUS (Navigator) | cyan `#5fe0ff` | steel-grey | relay mast, dome lattice |
| ZEROX (Markets) | emerald+gold | brass | ticker-ring, coin glyph |
| ORACLE (Esoteric) | deep violet `#8b5cf6` | obsidian | observatory dome, single eye |
| TURTLE (Museum/Design) | emerald `#00ff9c` | copper | gallery skylight, paintbrush |
| QUILL (Library) | gold+cream | brass | scroll awning, quill glyph |
| PIKADON (Aegis) | crimson `#ff3b5c`+black | dark steel | watchtower parapet, shield glyph |

Every building, vehicle, outfit, and weapon reskin below pulls its accent from this table — this is
the master consistency lock across the whole world.

### 0.5 · PRODUCTION PRINCIPLE — "one neutral, many reskins"

Every category below follows the same 3-step economy (matches your fal.ai budget constraints):

1. **Generate ONE neutral master sheet** (grey/stone-toned, no district color) at high detail.
2. **Slice/rig it once** (tile atlas, body rig, vehicle grid, weapon rack, etc.).
3. **Run cheap image→image "livery passes"** (strength 0.35–0.55) per district/agent/biome instead
   of regenerating from scratch. This is the same swap logic your `roster.js` already uses for
   avatar bodies — one rig, many skins.

---

## PART 1 — TERRAIN & BIOMES (grass, lava, water, stone, sand)

### 1.1 · Master terrain tile atlas (one generation, sliced into ~30 tiles)

> *[PIXEL SUB-SPINE] A clean isometric tile reference sheet on transparent checkerboard, tidy rows
> of 128×128 diamond tiles: emerald sacred-grass (with faint gold Seed-of-Life etching), obsidian
> cracked-earth with glowing cyan veins, pale-gold sand with hairline glyphs, amethyst crystal-stone,
> luminous cyan water with soft ripple highlights, and a fifth **molten-lava tile**: deep obsidian
> rock crust cracked by rivers of glowing gold-orange magma with tiny emerald mineral flecks. Include
> matching corner/edge transition tiles for grass→water, grass→stone, stone→lava. Each tile is a
> perfect isometric diamond, single top face + two side faces, subtle AO at edges, upper-left light.
> Game-ready spritesheet, no drop-shadow outside tile bounds. [NEGATIVE]*

### 1.2 · Biome variant passes (image→image on the base sheet, strength ~0.4)

- **Grass biome (Source Plaza / hero-plaza mat):** brighten emerald, add scattered gold-glow
  six-petal flowers, two sacred-shrub clusters.
- **Desert biome (Agora/Markets outskirts):** shift sand tile warmer gold, add faint brass coin
  glyphs pressed into dunes.
- **Frost biome (Aegis/PIKADON district):** recolor water tile to pale cyan-white ice, add crimson
  warning-glyph cracks.
- **Volcanic biome (Esoteric/ORACLE ritual grounds):** intensify lava-tile glow, add violet smoke
  wisps rising from cracks.
- **Deep-water biome (harbor/boats zone, Part 6):** darken water tile toward obsidian-teal, add
  bioluminescent emerald plankton streaks and soft cyan foam caps.

### 1.3 · Water & lava FX sprites (looping, for shaders or Seedance loops)

> *[PIXEL SUB-SPINE] A small sheet of 4-frame looping animation strips: (A) water ripple ring
> expanding outward in cyan-white, (B) lava bubble rising and popping in gold-orange, (C) shoreline
> foam lapping in pale cyan, (D) ember/spark particles drifting up from lava. Each strip reads
> left-to-right as a seamless loop, transparent background, consistent pixel density with the
> terrain tiles above. [NEGATIVE]*

### 1.4 · Prop cluster set (rocks, shrubs, driftwood, obsidian spires)

> *[PIXEL SUB-SPINE] An isometric prop sheet: small & large amethyst-crystal rock clusters, a
> glowing cyan water-droplet cluster, an emerald sacred-shrub with gold-glow berries, a charred
> driftwood log for shorelines, a jagged obsidian mini-spire for volcanic ground, and a mini
> SH-sigil obelisk. Each on its own baseline shadow, drop-ready onto any terrain tile. [NEGATIVE]*

---

## PART 2 — SWAPPABLE BODIES: CITIZENS, AGENTS, PETS

### 2.1 · Base humanoid rig (one neutral master — mirrors `roster.js` shared-rig logic)

> *[PIXEL SUB-SPINE] A neutral isometric humanoid base body, voxel-blocky proportions, shown in
> four rotations (front/back/left/right) plus a T-pose reference. Plain light-grey mannequin, no
> clothing, clearly divided into swappable regions: head, torso, legs, back-accessory slot, hand
> slot (for weapon/tool). Reference sheet only, flat clean lighting, transparent background. [NEGATIVE]*

### 2.2 · Seven council agent skins (one pass per agent, using the Agent Key in 0.4)

> *[PIXEL SUB-SPINE] Seven isometric character skins on the identical base rig from 2.1, one per
> SHADDAI agent, each using its Agent Key color + material motif exactly:*
> - *SHADDAI: obsidian robe, gold trim, faint halo above head*
> - *NEXUS: cyan tech-vest, circuit-line seams, steel shoulder plate*
> - *ZEROX: sharp emerald-and-brass suit, small holographic coin icon on chest*
> - *ORACLE: deep violet hooded cloak, single glowing eye visible under hood*
> - *TURTLE: emerald jacket, copper tool-belt, paintbrush clipped at hip*
> - *QUILL: gold-trimmed cream scholar coat, faint quill-glyph on shoulder*
> - *PIKADON: crimson-black armored vest, dark-steel shoulder guard, shield-glyph on chest*
> *All seven share identical proportions and pose — only palette/silhouette differs. Isolated on
> transparent background, four-direction turnaround each. [NEGATIVE]*

### 2.3 · Citizen/NPC swap pool (12–15 generic bodies, same rig)

> *[PIXEL SUB-SPINE] A grid of 14 generic isometric NPC bodies on the base rig from 2.1 — varied
> silhouettes (robe, jacket, jumpsuit, cloak, work uniform, courier pack, merchant apron) restricted
> to the emerald/gold/cyan/obsidian palette plus muted stone-grey. No two adjacent bodies share the
> same silhouette. Each on its own transparent tile, consistent light direction. [NEGATIVE]*

### 2.4 · Pets & companions (small swappable creature rig)

> *[PIXEL SUB-SPINE] A small quadruped/companion base rig (fox-sized) in four rotations, neutral
> grey, same swap-region logic as the humanoid rig (body, head, tail, back-accessory slot for a
> tiny glowing rune-collar). Then six palette variants on that rig: emerald sprite-fox, gold
> sun-hare, cyan wave-otter, violet shadow-cat, crimson ember-hound, obsidian void-owl (perched
> variant). Each pet has one small glowing accent matching its palette (eyes, tail-tip, or chest
> mark). Isolated, transparent background, consistent scale relative to the humanoid rig. [NEGATIVE]*

### 2.5 · Forged-agent starter kit (for user-created operatives)

> *[PIXEL SUB-SPINE] Three "blank slate" isometric skins on the base rig from 2.1, designed as
> starting templates for forged/custom agents: (1) plain traveler cloak in neutral stone-grey with
> one empty glyph-slot on the chest for a future custom sigil, (2) plain tech-suit in neutral teal
> with an empty shoulder-patch slot, (3) plain scholar robe in neutral cream with an empty back-cape
> slot. Each is deliberately unfinished/customizable, transparent background. [NEGATIVE]*

---

## PART 3 — CLOTHING & GEAR LAYERS (separable from bodies for true swap-ability)

> Instead of baking clothing into every body skin, generate a **separable clothing layer sheet**
> that overlays cleanly on the base rig — this is what lets a citizen "equip" gear like an MMO.

### 3.1 · Layered clothing sheet (torso layer, isolated, transparent, matches rig proportions)

> *[PIXEL SUB-SPINE] A grid of 10 isometric torso/clothing overlays sized to fit the base humanoid
> rig exactly (2.1), shown floating on transparent background as if already cut out for layering:
> merchant apron, scholar coat, armored vest, tech-vest with cabling, hooded cloak, courier pack
> harness, ceremonial robe with gold trim, worker jumpsuit, ritual sash, formal council mantle. Each
> rendered at the identical angle/scale as the base rig's four-direction turnaround, no body
> visible underneath — pure clothing silhouette only. [NEGATIVE]*

### 3.2 · Headwear/accessory sheet

> *[PIXEL SUB-SPINE] A grid of 10 isometric headwear/accessory overlays sized for the base rig:
> hooded cowl, scholar cap, tech-visor with cyan glow-strip, crown-circlet with gold sigil, ritual
> mask, courier goggles, no-headwear bare-head reference, backpack, cape/mantle, belt-pouch set.
> Transparent background, same scale/angle as clothing layer. [NEGATIVE]*

### 3.3 · District uniform passes (image→image on 3.1, one per agent, strength ~0.45)

Reskin the neutral clothing sheet with each Agent Key color/material — gives every district a
recognizable "uniform" without new geometry.

---

## PART 4 — WEAPONS & TOOLS (for arcade games + world flavor)

### 4.1 · Master weapon/tool rack (one neutral generation)

> *[PIXEL SUB-SPINE] An isometric weapon-and-tool rack sheet, neutral stone-grey/steel base
> materials, one item per cell: short energy-blade, long ceremonial staff, throwing-disc (for
> Dodgeball-style games), research scanner-wand, quill-pen that writes in light, security shield-
> baton, market ticker-hammer, bow with glowing string, twin daggers, heavy warhammer. Each isolated
> on transparent background, consistent scale and 3/4 isometric angle matching the humanoid rig's
> hand-slot. [NEGATIVE]*

### 4.2 · Agent-signature weapon passes (image→image, one per agent, strength ~0.4)

Reskin the rack per Agent Key: e.g. PIKADON's shield-baton gets crimson/dark-steel glow; ORACLE's
staff gets violet crystal tip; ZEROX's ticker-hammer gets brass/emerald coin-glyph inlay; this
feeds directly into your existing skillplay ability catalog (Cannon Arm, Lockdown, Sniper, etc.) so
weapon art can visually match in-game abilities.

### 4.3 · Sports/arcade equipment set (game-specific props)

> *[PIXEL SUB-SPINE] A small isometric sports-prop sheet matching SHADDAI Games: a glowing
> dodgeball (emerald core, cyan seam-lines), a football/gridiron ball with faint gold laces, a
> basketball-style orb with circuit-line seams, a starfall blaster pistol, a soccer ball with hex-
> panel glyphs. Transparent background, consistent scale. [NEGATIVE]*

---

## PART 5 — VEHICLES & BOATS

### 5.1 · Master vehicle grid (one neutral generation, catalog-grid layout)

> *[PIXEL SUB-SPINE] A tidy grid of 24 isometric vehicles, one per cell, muted neutral base colors
> (charcoal, slate, bone-white): compact car, delivery van, hover-scooter, armored transport, sleek
> two-seater, cargo truck, motorcycle, plus repeated silhouettes with slight variation. Identical
> scale and angle across the grid, dark neutral background for contrast, no logos or text. [NEGATIVE]*

### 5.2 · Agent-livery overlay pass (image→image, strength ~0.4)

> *[PIXEL SUB-SPINE] Apply thin glowing livery stripes to each vehicle in the grid, matched to its
> assigned district via the Agent Key (0.4): emerald stripe for Source-fleet vehicles, gold for
> Agora/Markets, cyan for Research/Nexus fleet, crimson for Aegis patrol vehicles. Add a faint
> Hebrew-glyph decal on doors instead of a logo, plus a soft under-glow beneath each vehicle. Keep
> base shapes identical to input. [NEGATIVE]*

### 5.3 · Boats & harbor vessels

> *[PIXEL SUB-SPINE] A grid of 8 isometric watercraft in the same neutral-then-livery pipeline:
> small fishing skiff, cargo barge, sleek patrol cutter, ceremonial temple-barge with a glowing
> gold canopy, twin-hulled catamaran, harbor tugboat, a large council flagship with sail-shaped
> solar panels, a tiny one-person hover-jet-ski. Neutral stone/steel base materials, consistent
> scale and 3/4 isometric angle, dark water-adjacent background for contrast. [NEGATIVE]*

> **Livery pass:** same treatment as 5.2 — glowing district-color trim along the hull, glyph-sail
> or glyph-flag replacing any text signage. Deploy on the deep-water biome tiles from 1.2.

### 5.4 · Street & harbor density plates (final composites)

- **Street density:** liveried vehicles (5.2) arranged along a dark asphalt grid with glowing
  cyan lane-lines.
- **Harbor density:** liveried boats (5.3) docked along a pier with the deep-water biome tile,
  small NPC crowd (2.3) walking the boardwalk, no banners/text.

---

## PART 6 — FOOD & MARKET GOODS (for the Bazaar/Agora district)

### 6.1 · Master food/goods sheet (one neutral generation)

> *[PIXEL SUB-SPINE] An isometric market-goods sheet, one item per cell: a stack of glowing
> gold-fruit, a bundle of emerald leaf-greens, a steaming bowl of broth with cyan steam wisps, a
> loaf of bread with a faint sigil branded on top, a jar of luminous honey, a rack of skewered
> meat with ember glow, a crate of violet crystal-berries, a stack of scroll-wrapped pastries, a
> jug of shimmering water, a wheel of pale cheese with gold rind. Each isolated, transparent
> background, warm inviting lighting but still locked to the palette. [NEGATIVE]*

### 6.2 · Market stall composite (Bazaar hero asset)

> *[PIXEL SUB-SPINE] An isometric market stall in the ZEROX/Agora district style (brass + emerald +
> gold), roof made of layered fabric with faint coin-glyph patterns, the food/goods sheet items
> (6.1) displayed on tiered shelves and baskets, a small NPC merchant (2.3 body + 3.1 apron) behind
> the counter, warm lantern glow from within. [NEGATIVE]*

---

## PART 7 — BUILDINGS (all districts, cutaway + exterior)

### 7.1 · Master neutral building grid (one generation)

> *[PIXEL SUB-SPINE] A grid of 24 isometric building icons in flat style: small shop, two-story
> townhouse, mid-rise apartment, tower with antenna, domed hall, warehouse, plaza pavilion, control
> tower, market stall row, harbor warehouse. Neutral stone/obsidian material, no signage, no text,
> consistent light direction, each on its own tile. [NEGATIVE]*

### 7.2 · District reskin passes (7 passes, one per agent, strength ~0.5)

Reskin using Agent Key palette + rooftop motif (see 0.4 table) — golden spire finial for SHADDAI,
relay mast for NEXUS, ticker-ring roof for ZEROX, observatory dome for ORACLE, gallery skylight for
TURTLE, scroll-awning for QUILL, watchtower parapet for PIKADON.

### 7.3 · Hero cutaway agent tower (flagship asset)

> *[PIXEL SUB-SPINE] Isometric cutaway tower at night, seven floors stacked, each floor themed to
> one SHADDAI agent district exactly per the Agent Key, fully see-through interiors with tiny
> swappable citizen/agent bodies (Part 2) wearing their district's clothing layer (Part 3), working,
> trading, training, socializing. Visible staircases, glass railings, floor-to-floor sightlines. All
> signage is abstract glyphs, never legible text. Exterior street shows the liveried vehicle set
> (Part 5). Nighttime neon atmosphere, palette-locked. [NEGATIVE]*

### 7.4 · Central plaza hub

> *[PIXEL SUB-SPINE] A grand circular isometric plaza: at the center, a glowing SH-sigil monument
> on a raised dais; radiating outward, seven zones matching each district's Agent Key color,
> connected by glowing-tile paths. Crowds of citizen bodies (Part 2) mill about; one agent-skin
> character stands as greeter near each district entrance, wearing their district uniform (Part 3).
> No text signage, only glyph-icons per zone. [NEGATIVE]*

---

## PART 8 — MASTER OVERWORLD MAP (poster-grade, cinematic register)

> *[STYLE SPINE] A single painterly top-down regional map of the SHADDAI world: a central
> plaza/town at the crossroads, seven outlying districts arranged on a hexagonal Seed-of-Life road
> pattern matching `WORLD_LAYOUT.sacred` (rings at 60/130/200/260), each district in its Agent Key
> accent color within the overall emerald/gold/cyan/obsidian palette. Include a volcanic ridge (lava
> biome, Part 1) at one edge, a harbor with boats (Part 5) at another, forests fading into black void
> with faint stars at the perimeter. Roads glow faintly cyan; landmarks (spire, relay-dome, exchange,
> observatory, gallery, library, fortress) are iconic silhouettes, not overly detailed. Museum-grade
> poster illustration, bird's-eye vantage, no text labels. [NEGATIVE]*

---

## PART 9 — CROWD & EVENT SCENES

> *[PIXEL SUB-SPINE] A dense isometric SHADDAI world-event scene at the central plaza: hundreds of
> citizen bodies (Part 2) in varied clothing layers (Part 3) gathered for a "council address," small
> stages, banner poles with glyph-sigils instead of flags, floating lantern-drones with soft gold
> glow, a giant holographic SH sigil projected above the crowd, pets (2.4) weaving through the
> crowd. Matches festival-scene density, restrained to palette. [NEGATIVE]*

---

## PART 10 — BUILD ORDER & BUDGET MAP (fal balance ≈ $8.75)

| Step | Asset | Type | Est. cost |
|---|---|---|---|
| 1 | Terrain tile atlas (1.1) | still | ~$0.025 |
| 2 | Biome passes ×5 (1.2) | img2img | ~$0.15 |
| 3 | Water/lava FX strip (1.3) | still | ~$0.025 |
| 4 | Prop cluster (1.4) | still | ~$0.025 |
| 5 | Base humanoid rig (2.1) | still | ~$0.025 |
| 6 | 7 agent skins (2.2) | still ×7 | ~$0.18 |
| 7 | 14 citizen skins (2.3) | still | ~$0.04 |
| 8 | Pet rig + 6 variants (2.4) | still ×2 | ~$0.05 |
| 9 | Forged-agent blanks (2.5) | still | ~$0.025 |
| 10 | Clothing layer sheet (3.1) | still | ~$0.025 |
| 11 | Headwear sheet (3.2) | still | ~$0.025 |
| 12 | 7 uniform passes (3.3) | img2img ×7 | ~$0.18 |
| 13 | Weapon rack (4.1) | still | ~$0.025 |
| 14 | 7 signature-weapon passes (4.2) | img2img ×7 | ~$0.18 |
| 15 | Sports props (4.3) | still | ~$0.025 |
| 16 | Vehicle grid (5.1) | still | ~$0.025 |
| 17 | Vehicle livery pass (5.2) | img2img | ~$0.04 |
| 18 | Boat grid (5.3) | still | ~$0.025 |
| 19 | Boat livery pass (5.3b) | img2img | ~$0.04 |
| 20 | Street + harbor density (5.4) | still ×2 | ~$0.05 |
| 21 | Food/goods sheet (6.1) | still | ~$0.025 |
| 22 | Market stall composite (6.2) | still | ~$0.025 |
| 23 | Building grid (7.1) | still | ~$0.025 |
| 24 | 7 district reskins (7.2) | img2img ×7 | ~$0.18 |
| 25 | Hero cutaway tower (7.3) | still, high-detail | ~$0.05 |
| 26 | Central plaza hub (7.4) | still, high-detail | ~$0.05 |
| 27 | Master overworld map (Part 8) | still, flagship | ~$0.05 |
| 28 | Crowd/event scene (Part 9) | still, stretch | ~$0.05 |

**Running total ≈ $1.55–$1.85** for the entire base world kit (stills only). This leaves comfortable
budget headroom for 2–3 Seedance loops (water ripple, lava bubble, plaza sigil pulse) at
~$0.18–$0.55 each, and reserve for redo passes on anything that misfires.

---

## PART 11 — CONSISTENCY RULES (read before generating anything)

1. **Never break the Agent Key (0.4).** Every district-tagged asset — building, uniform, vehicle,
   weapon — pulls its accent color from the same table. This is the single rule that makes a
   sprawling asset library feel like one world instead of a mismatched pile.
2. **Never bake clothing into a body skin when a layer will do.** Bodies (Part 2) and clothing
   (Part 3) stay separate wherever possible — this is what makes "gear" swappable like a real MMO
   inventory, not a fixed costume.
3. **Reuse neutrals aggressively.** Every category starts from ONE neutral master and branches via
   cheap image→image passes — never regenerate a whole category from a blank prompt if a livery
   pass will do.
4. **Lock the light direction.** Every sprite/tile uses the same upper-left 45° light — mixing light
   directions is the fastest way to make a hand-made asset library look inconsistent.
5. **Cinematic vs. Pixel registers stay separate but color-matched.** The Descent scenes (Style
   Spine, photoreal) and the Pixel World (Sub-Spine, iso pixel-art) never mix rendering styles
   within one asset, but always share the same four-color palette so scrolling from one register to
   the other feels seamless.
6. **No legible text, ever.** Every prompt in this document ends in the shared negative that bans
   text/logos/UI — signage is glyphs and icons only, everywhere, including boats, buildings, and
   banners.

---

## PART 12 — CROSS-REFERENCE TO YOUR EXISTING BUILD

- Body-swap logic mirrors `roster.js`'s `rig:'shared'` vs `rig:'embedded'` system — one skeleton,
  many skins, `DEFAULT_SHARED_CLIPS` reused across every citizen/agent/pet.
- Terrain/biome tiling mirrors `world-biomes.js`'s InstancedMesh reuse — one texture atlas driving
  every prop instance without per-object generation cost.
- District layout (Part 8 map, Part 7 hero tower) mirrors the real `WORLD_LAYOUT.sacred` Seed-of-
  Life geometry already defining your 3D world (SHADDAI center, 6-agent hexagon, rings 60/130/
  200/260).
- Weapon/ability art (Part 4) is the visual skin for the existing `skillplay.js` + `affinity.js`
  ability-matching engine, so game abilities and their art stay in sync.
- Budget discipline (Part 10) matches the constraints already logged in `PROMPTS.md` (fal balance,
  per-gen cost estimates).

---

## PART 13 — REFERENCE IMAGE INDEX (your Pinterest/Downloads drops)
Path root: `C:\Users\Brittany\OneDrive\Desktop\New folder\Downloads\`

| File | What it is | Anchors |
|---|---|---|
| `0b8792d9…jpg` | ⭐ neon isometric night-city (central roundabout) | master vibe for Parts 7–9 (pixel city look) |
| `7becf8d1…jpg` | neon cutaway office tower | Part 7.3 hero cutaway tower |
| `a53b5fd5…jpg` | Digimon-World hub plaza | Part 7.4 central plaza hub |
| `c96c1e2c…jpg` | iso themed-room complex | Part 7 interiors / command-deck floors |
| `df417229…jpg` | eBoy iso naval festival | Part 5.4 harbor density + Part 9 crowds |
| `78482905…jpg`, `f761a83…jpg` | iso pixel car sheets | Part 5.1 vehicle grid |
| `8070a336…jpg` | "AI Productivity Universe" floating platforms | Codex universe poster (see PROMPTS.md §4.1) |
| `8bad26d7…jpg` | retro cutaway island + rainbow-grid + data panels | Codex landscape card + HUD panels |
| `149cd936…jpg` | "Map of the Human Soul" diagram | almanac density / Tree overlays |
| *(new 11 attachments)* | drop remaining Pinterest refs here | tag each to its Part before generating |

> **Note:** the 11 newest attachments referenced in chat aren't yet saved with stable filenames.
> Drop them into `Downloads\` (or `public/assets/refs/`) and I'll tag each row above to its Part.

---

## PART 14 — EXECUTION (how Claude runs this)
`fal-assets/generate.mjs` reads `fal-assets/batches/*.json` manifests, calls fal with `FAL_KEY`
from `.env`, writes PN/JPGs to `public/assets/world/` (pixel) or `public/assets/journey/` (descent),
and each output is verified headless before it goes live. **Nothing spends until you say
"generate <batch>".** Companion doc for the Descent (cinematic register) = `fal-assets/PROMPTS.md`.
