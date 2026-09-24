# ASSET PRODUCTION SPEC — for Claude's HF image pass (2026-09-23)
Every number below is read from the live code. HF images = CONCEPT SHEETS ONLY (turntables);
fal Thursday turns the approved sheets into 3D. NOTHING gets generated that isn't in this doc.

## A. WORLD GROUND TRUTH (the map — memorize these coordinates)
Playable ±714 (half 720), terrain ±750 (plane 1500). Player 1.8m. Spawn [0,2,70].
CITY: sacred center [0,0], 7 agents on hexagon R260 (rings 60/130/200/260), bazaar [-100,100],
garage pad [26,96] (B=shop), plaza. MOUNTAIN RING R380-520, passes at bearings 0.785(meadow),
0.074(suburb), -0.736(volcano), -2.405(darkforest), 2.366(ocean) + colosseum road 1.6.
REALMS (center/radius): meadow [400,400]r170 · suburb [540,40]r150 · volcano [420,-380]r170
(crater shelf y≈6.5, fortress at center) · darkforest [-420,-380]r170 (castle at center,
moat r34) · ocean [-295,290]r150 (basin floor -3.4, waterline 0.05, dock [-193,190]) ·
COLOSSEUM [-14,460] walk-in plateau r46 y1.3 (mecha-arena shell around it) · arctic
[-150,-240]r150 · desert [150,-240]r150 · void [0,-360]r130 · forest [210,150]r150.

## B. STANDARDS (every asset passes or it's rejected)
Scale: doors 2.2×1.2m · shop 12×12m base ×15m tall · hub building 50×50×40m+ · spires
200m+ · props 3-6m · street lamps 5m. Seats: every vehicle/ship needs a named `seat_anchor`
empty (player sits IN, cockpit visible from inside). Budget: GLB ≤1.2MB after
gltf-transform (meshopt+webp@1024); props ≤30k tris, chars ≤80k tris.
STYLE LOCK (every prompt): "SHADDAI brand: obsidian #06080b brushed-metal base, gold #e8c45c
sacred-geometry accents, emerald #00ff9c energy seams, cyan #5fe0ff holographic glow.
Futuristic sci-fi, clean readable silhouette, no medieval, no cartoon."
SHOT LOCK: "single isolated object, full object in frame with 10% margin, 3/4 view, flat
mid-grey studio background, soft even studio light, solid opaque surfaces."
TURNTABLE: ONE 2048×2048 sheet with 4 views — front / 3-quarter / side / back, equal scale.
NEGATIVE LOCK: "no text, no logos, no watermark, no people, no duplicate objects, no
background clutter, no cropped edges, no reflections, no perspective distortion."

## C. MANIFEST — slots, exact positions, dims, and the concept prompt core per asset

### C1. TACTICS COMBAT UNITS (world-tactics.js; chars/<id>.glb slots)
Units already fight; Thursday they get real bodies. Per unit: turntable sheet + one
action pose (attack). Archetypes (stats are CODED — art must read the class):
| Unit | Slot file | Dim | Prompt core (after STYLE+SHOT locks) |
| PILOT | chars/pilot.glb | 1.8m human, sleek flight-suit, cyan visor | "agile pilot, slim armored flightsuit, cyan visor, gold trim seams" |
| SHADDAI (canary FIRST) | upgrade chars/shaddai.glb | 1.85m regal, gold mantle | "commander in obsidian robes with gold sacred-geometry mantle, calm power" |
| ORACLE | chars/oracle.glb | 1.8m hooded mystic | "hooded seer, violet glow eyes, constellation-pattern cloak" |
| HEAVY BOT (enemy) | chars/bot-heavy.glb | 2.6m mech, 2×2 grid footprint | "heavy combat mech, blocky armored plates, red sensor visor, huge fists" |
| SCOUT BOT (enemy) | chars/bot-scout.glb | 1.7m wiry, ranged | "thin fast recon mech, long rifle arm, single cyan optic" |
FATALITY SCENES (2 demos, PRO feature): fal VIDEO from the winner's archetype + loser's
shell. Prompt core: "cinematic finishing move, {winner} defeats {loser}, neon arena, rain,
slow-motion impact, dramatic rim light, 3 seconds". $10 of the Thursday ledger, LAST.

### C2. FISHING (game.html)
2D only: rod icon 48×48 px ("slim carbon rod, gold reel, emerald line glow") · 5 fish +
Void-Pearl icons 32×32 (pearl: "black pearl with violet nebula core, gold rim") · strike
"!" prompt art. One 1024 sheet: "fishing icon set, transparent-look isolated items, flat
mid-grey bg" → slice into sprites.

### C3. ARCADE VENUE (city slot: between garage and plaza, ~[70,60])
BUILDING: 18×14m base ×16m — "holographic arcade palace, gold marquee arch, cyan game-
glyph signage panels, obsidian columns, glowing doorway". Interior (joins C7 system):
cabinet rows ("retro-futuristic arcade cabinets, gold trim, cyan screens").
2D: 4 game thumbnails 512×512 for the arcade modal (skate/basketball/dodgeball/sigil).

### C4. SPARKS LEDGER
Icon set 64px: spark bolt (gold), pot (gold bowl), entry chip, win banner — "energy
lightning rune in a gold hexagon" family, one 1024 sheet. Used by BOTH realms (2D UI + 3D HUD).

### C5. SWIM / WATER FX
Splash sprite ring (128×128, 4 frames), waterline foam decal (512 tile), swim vignette
gradient. 3D: none needed — the shader ocean handles the surface.

### C6. SHIPS + VEHICLES (replace placeholders IN PLACE at the ocean dock)
| Asset | Slot | Dim (L×W×H) | Placed at | Prompt core |
| hover skiff | models/ocean-skiff.glb | 12×5×4m | [-242→scaled, 255] | "sleek hover-skiff, open cockpit, seat_anchor at helm, gold hull trim" |
| catamaran | models/ocean-catamaran.glb | 19×11×7m | [-248,235] | "twin-hull luxury catamaran, twin seat_anchors, emerald glass canopy" |
| super-yacht | models/ocean-superyacht.glb | 30×11×9m | [-273,241] | "futuristic mega-yacht, wraparound cockpit, 2 deck levels, gold accents, captain seat_anchor" |
| submarine | models/ocean-submarine.glb | 14×6×6m | [-250,279] | "research sub, viewport dome cockpit, cyan running lights, interior seat_anchor" |
| hovercar | models/hovercar.glb | 4.6×2.4×1.6m | garage [35,105] | "two-seat hover coupe, glass canopy, gold trim, cyan underglow, 2 seat_anchors" |
| hoverboard v2 | models/hoverboard.glb upgrade | 3.4×1×0.4m | plaza+dock | "hover deck, emerald underglow strip, gold rails" (real model replaces compressed v1) |

### C7. INTERIOR HALL KITS (world-interiors.js THEMES propFn slots — one kit each)
Room box is code (walls/trim/floor); each kit = 6-10 props ≤30k tris each, ≤1.2MB:
TOURNEY HALL (COLOSSEUM): betting holo-board, champion banners ×3, weapon rack, trophy
pedestal, tier gate arch — gold/emerald. HOVER WORKS (GARAGE): vehicle pedestal (rotating),
holo spec bench, parts shelf, tool wall — emerald/gold. WAR ROOM (FORTRESS): tactical map
table with holo realm-map, obsidian throne, lava hearth, weapon wall — ember orange/obsidian.
SIEGE KEEP (CASTLE): dark throne, moat-facing arched window frame, siege plan table,
banner of the dragon — violet/black. Prompt each: STYLE lock + "dungeon-scale room prop".

### C8. COLLIDER + SCALE GATES (no images — the checklist each model must pass)
Measured footprint (minX..maxX/minZ..maxZ) → collider radius = max(half-width, half-depth);
must match layout.realmColliders entry ±20%. Door planes must fit 2.2×1.2m player. Verify
in-world: walk all sides, no clip-through, E-prompt fires at 50u for fortress/castle.

### C9. CITY + WORLD FILL (the $12 props batch from §14.1, + roads dressing)
Props (each: 3-6m, ≤30k tris, line the light-trails + plaza + dock):
street-lamp 5m · kiosk 3m · transit-stop 4m · holo-fountain 6m · statue-shaddai 5m
("obsidian monolith statue of a hooded figure holding a gold sphere, sacred geometry") ·
neon-tree 6m · ore-node 2m · signpost 3m.
REALM HERO UPGRADES (replace placeholder shells IN PLACE — same coords, bigger scale):
FORTRESS real: 80×60m base ×45m tall at [420,-380] on the crater shelf — "obsidian
volcanic citadel, three tiers, lava-fall edges, gold command spire, gate on the SW face".
CASTLE real: 70×70×55m at [-420,-380] — "dark crystal castle, floating rune-shard towers,
violet energy moat glow, drawbridge on SE face". Watch: keep the SE/SW faces OPEN (doors).
2D exteriors pass: multi-tile facades + signage + night windows per region (art pass,
Claude renders variants from this same style lock — 2D sprite sheets 512×512).

## D. PIPELINE (strict order)
1. Claude: HF concept sheets (this doc, §B locks) → SAVE to fal-assets/concepts/<id>.png.
2. Owner review: isolation? single object? palette? silhouette at 128px? (fail → regen
   concept ONLY, ~free). 3. THURSDAY fal: canary FIRST (SHADDAI unit + 1 building), verify
   headshot+scale gates, THEN batches per §14.1 ledger ($111, $100 budget).
4. Ship: gltf-transform compress → place in slot → collider table sync → in-world probe →
   commit → merge main.
