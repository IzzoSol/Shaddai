# SHADDAI — fal.ai Asset Prompt Library
### "Ancient wisdom rendered in future tech" · one continuous cinematic universe
**Review-first.** Nothing generates until you say "generate batch 1." fal balance ≈ **$8.75**.

---

## 0 · USAGE & GLOBAL RULES  (for Claude / fal / any image model)
- Always **prepend the STYLE SPINE** (§0.1) to every asset prompt.
- Always **append the SHARED NEGATIVE** (§0.2) to every asset prompt.
- When a prompt references an input image (e.g. `grass.jpg`, `7becf8d1…jpg`), use **image→image with strength 0.5–0.7** so composition is preserved but style + detail are upgraded.
- Respect the **base composition** of each reference; change lighting, detail, palette, atmosphere — **not the core layout**.
- **Output stills by default.** Only use video when a prompt explicitly says "Seedance loop" / "image→video."
- Keep every prompt **declarative**: camera, composition, count of main elements.

### 0.1 · STYLE SPINE (high-signal)
> *Cinematic occult-almanac sci-fi. Ancient sacred wisdom fused with future technology. Deep
> obsidian-black void `#06080b`, luminous neon emerald `#00ff9c`, illuminated-manuscript gold leaf
> `#e8c45c`, and cold cyan `#5fe0ff` as the ONLY accent lights. High-contrast, reverent, precise.
> Etched sacred geometry (Seed of Life, Flower of Life, Metatron's Cube, Tree of Life), faint Hebrew
> letters and alchemical glyphs as hairline gold engravings. Volumetric light rays, fine film grain,
> subtle chromatic aberration on the edges, deep depth of field, anamorphic bokeh. Museum-grade, no
> readable text, no watermark.*

### 0.2 · SHARED NEGATIVE
> *text, watermark, signature, logo, UI, letters, caption, low-res, jpeg artifacts, blurry, muddy,
> oversaturated, garish rainbow, cartoon, childish, clip-art, stock-photo lighting, flat lighting,
> washed-out, purple-on-white AI gradient, extra limbs, deformed.*

---

## 1 · REFERENCE-IMAGE INDEX
Path root: `C:\Users\Brittany\OneDrive\Desktop\New folder\Downloads\`

| File | What it is | Use as reference for (literal) |
|---|---|---|
| `0b8792d9…jpg` | **neon isometric night-city** (SimCity-style, central roundabout, pink/cyan/yellow towers) | **⭐ master vibe anchor for Pixel World** — pixel-city.html look: vibrant neon iso at night |
| `7becf8d1…jpg` | neon cutaway office tower at night | Pixel World "Agent Tower" — stacked floors, see-inside interiors, night city backdrop |
| `a53b5fd5…jpg` | Digimon-World hub plaza | Pixel World "Central Plaza" — circular hub, center statue/hologram, ring of shops, overhead signage |
| `c96c1e2c…jpg` | iso complex of themed rooms (bank/gym/arcade) | Pixel World "Building Interiors / command-deck floors" |
| `df417229…jpg` | eBoy iso naval festival | Pixel World crowd/density plates + codex banners |
| `78482905…jpg`, `f761a83…jpg` | iso pixel car sheets | Pixel World vehicles (varied silhouettes, 2–3 neon highlights each, no logos) |
| `8070a336…jpg` | **"AI Productivity Universe"** floating iso platforms in space | Codex "Agent Universe" poster — nested shells + vertical hierarchy + central core |
| `8bad26d7…jpg` | retro cutaway floating-island + rainbow-grid + data panels | Codex "Landscape Cross-Section" card + HUD data-panel motif |
| `149cd936…jpg` | "Map of the Human Soul" esoteric diagram | Codex almanac density; hairline-glyph overlays on Tree scene |
| *(prior)* chakra/frequency collage · SH-shield · ladder-to-Crown · cosmic agent portraits | theme sigils | Tree colors, agent auras, Arrival Crown/shield |

> **Method:** Descent scenes already have approved plates in
> `public/assets/journey/{molecules,grass,water,earth,cosmos,tree}.jpg`. Feed each into
> **nano-banana image→image** (strength 0.5–0.7) to re-grade onto the Style Spine + add detail,
> then optionally **Seedance image→video** for a slow living loop. Keeps your compositions, makes
> them real + cinematic + moving.

---

## 2 · THE DESCENT  (molecule → grass → water → earth → cosmos → Tree → arrival)

### I · MOLECULES  *(already "looks great" — optional upgrade)*
Input: `molecules.jpg` image→image, strength 0.6
> *[SPINE] Extreme macro of a quantum lattice: glowing emerald atoms and cyan electron orbits forming
> hexagonal benzene rings and lattice grids. Background is a dark, blurred cross-section of circuitry
> and biological tissue. Microscopic scale, straight-on, shallow DoF but the main lattice razor-sharp.
> Electron paths trace subtle Flower-of-Life patterns. [NEG]*

### II · GRASS & FLOWERS  → `grass-hd.jpg`  ·  input `grass.jpg` i2i 0.6
> *[SPINE] Extreme macro of a living meadow at golden-blue hour, camera at ground level looking
> slightly upward. Foreground: thousands of individual blades of grass razor-sharp, each catching thin
> emerald + gold rim-light. Scattered small six-petal wildflowers echoing the Seed of Life, centers
> glowing faint cyan. Dew droplets as tiny lenses. Background falls to deep black-green with gold
> "firefly" bokeh. One faint circular sacred-geometry sigil etched in the haze behind, very subtle.
> Photoreal macro, f/1.4, volumetric rays. [NEG]*
> **Seedance loop:** slow left→right wind through the blades, fireflies drifting up, cyan centers pulsing. 5s seamless.

### III · WATER  → `water-hd.jpg`  ·  input `water.jpg` i2i 0.6
> *[SPINE] Close-up of a black mirror-lake at night from slightly above, cropping only the water
> surface, no horizon. Emerald bioluminescent plankton trace concentric Flower-of-Life ripples where
> unseen drops fall. Gold reflections of a hidden constellation and the SH sigil shimmer in broken
> highlights. Low cyan mist barely visible. Ultra-glossy reflective surface, deep DoF: foreground
> ripples sharp, background soft. [NEG]*
> **Seedance loop:** slow concentric ripples, plankton pulses, mist drift. 6s seamless.

### IV · EARTH (day→night)  → `earth-hd.jpg`  ·  input `earth.jpg` i2i 0.6
> *[SPINE] Wide valley from a ridge at dusk, camera chest-height, wide lens. Left half in warm gold
> twilight; right half deep obsidian night dotted with emerald star clusters. A cyan river of light
> threads the valley floor, its path subtly tracing the Tree-of-Life diagram. Mountains + trees are
> silhouettes, not detailed — focus is the light-river and the day→night split. Volumetric rays at
> the horizon, high cinematic contrast. [NEG]*
> **Seedance loop:** slow sweep dusk→night on the right, stars ignite, river brightens. 8s.

### V · COSMOS & PLANETS  → `planet-1..3.png` (isolated on black)
> *[SPINE] Single hero planet centered, ~half the frame height, seen from space at three-quarter
> angle. Bands woven from luminous circuit-traces and data-rivers in emerald + gold; storms look like
> swirling sacred geometry. A thin glyph-ring of faint Hebrew/alchemical symbols orbits it. Background
> pure black void with subtle cyan/gold nebula haze; NO other planets in frame. Rim-lit by a cold cyan
> star off-frame. Photoreal 3D render, telephoto feel, deep shadows. [NEG]*
> Variants: (1) emerald circuit gas-giant; (2) obsidian world with gold Flower-of-Life continents +
> cyan seas; (3) molten world with gold Metatron's-Cube fissures.
> **Seedance loops:** slow axial rotation + drifting glyph ring + gentle lens-flare sweep, per planet.
> **Hero fly-through** (`cosmos-flythrough.mp4`, 8s): camera drifts forward past 3 planets through
> gold-dust nebula + cyan starfield toward one bright point (the Crown).

### VI · THE TREE OF LIFE  → `tree-hd.jpg`  ·  inputs `tree.jpg` + `149cd936…` i2i 0.5
> *[SPINE] The Kabbalistic Tree of Life as a colossal cosmic structure in the void: 10 radiant
> sephiroth as glowing orbs on 3 pillars, 22 luminous connecting paths, orbs colored by chakra (violet
> Crown top → gold Kingdom base) but unified under emerald. Hairline gold Hebrew letters etched along
> every path. Faint Metatron's Cube behind. A ladder of light ascending toward a brilliant Crown at the
> apex. Awe-inspiring, symmetrical, sacred. [NEG]*
> **Seedance loop:** a pulse of light travels base→Crown, each sephira igniting in turn, Crown blooms. 8s.

### VII · ARRIVAL — THE CROWN & THE SHIELD
Refs: **your dropped SH sigil** (brushed-gunmetal disc, silver S+H, vivid LIME-neon tubes brighter
than `#00ff9c`, circuit filigree ring) + ladder-to-Crown.
> **⚑ USE THE REAL SIGIL — DO NOT REGENERATE.** Save it to `public/assets/brand/sh-sigil.png`.
> Arrival = feed it into **Seedance image→video**: neon tubes flicker on, circuit traces light up
> trace-by-trace, a gold Crown (Kether) flares above it, light rays burst outward. 5s. For
> `home.html` / `scene-arrival.js` we composite the PNG directly with a bloom. The sigil keeps its
> vivid green so it "pops" as the climax; the rest of the universe stays emerald.

---

## 2b · ⚙ THE SH MACHINE-CIRCLE — interactive portal (procedural, no fal)
The SH sigil at the top of `home.html` is a **living machine iris**. On click it **opens like a
vault / camera aperture / stargate** and launches the Descent.
1. **Idle:** outer circuit-filigree ring slowly rotates; nodes pulse; faint breathing bloom.
2. **Hover:** ring speeds up, neon tubes brighten, a low hum + "READY" glyph-ring fades in.
3. **Click → OPEN:** ring counter-rotates + locks; disc splits into 6–8 iris blades retracting
   outward (Seed-of-Life segmentation); emerald/gold light floods from behind; camera pushes
   *through* → cross-fades into `journey.html`.
4. Optional Seedance `sh-open.mp4` fallback for low-end devices.

---

## 3 · PIXEL WORLD  (Phase 2 — after front-end ships)
Master vibe anchor = `0b8792d9…` (neon iso night city). Isometric 2:1, eBoy/Pixorama density, SHADDAI palette.

**3.1 Agent Tower — cutaway building** · inputs `7becf8d1…`, `f761a83…`
> *[SPINE] Isometric cutaway tower rising from a neon city at night; each floor a SHADDAI agent
> district: Source (SHADDAI), Navigator (NEXUS), Agora/Markets (ZEROX), Research (ORACLE), Design/3D
> (TURTLE), Writing (QUILL), Aegis (PIKADON). Composition of the reference tower: stacked floors, open
> interiors, tiny pixel characters working/relaxing/gaming. Replace all real-world logos + words with
> abstract glyph signage + sacred-geometry symbols in emerald/gold/cyan. Streets below packed with
> pixel cars from the car sheets, each lit by 2–3 neon highlights, no logos. Three-quarter iso, crisp
> pixel edges, dense detail, night atmosphere. [NEG]*

**3.2 Central Plaza — hub** · input `a53b5fd5…`
> *[SPINE] Grand pixel central plaza inside a circular atrium: central holographic statue = abstract
> SH sigil as light; directory pillars; multiple levels of shops + lounges around the ring. Signage =
> short glyph blocks + agent icons (Source, Agora, Library, Aegis…) in emerald/gold/cyan. Crowds of
> tiny pixel people, some gazing up at the sigil. Dark checkered tile floor with subtle reflections.
> Neon everywhere but palette-constrained. Overhead beams/banners show iconography, no text. [NEG]*

**3.3 Interiors — command-deck floors** · input `c96c1e2c…`
> *[SPINE] Isometric interior complex of themed rooms: trading floor, code lab, media studio, gym,
> arcade, library, security ops. Multiple rooms visible at once, stairs + corridors connecting. Tiny
> pixel furniture/devices, screens showing abstract geometries (no UI). Warm gold light inside rooms,
> cool cyan in circulation spaces, obsidian void outside. [NEG]*

**3.4 Crowds & density — festival plate** · input `df417229…`
> *[SPINE] Dense pixel festival by a harbor of virtual ships (eBoy density): crowds, tents, platforms,
> ships at dock reinterpreted as SHADDAI agent "vessels" (Source ship, Agora ship…) with abstract
> sigils instead of flags. Palette restricted to emerald/gold/cyan accents over deeper base colors.
> Background plate / codex banner. [NEG]*

---

## 4 · CODEX & UNIVERSE
**4.1 Agent Universe poster** · inputs `8070a336…` + chakra collage
> *[SPINE] Vertical tapestry — the "SHADDAI Agent Universe" in nested layers: outer cosmic shells,
> inner rings for Artificial Intelligence → Machine Learning → Neural Nets → Deep Learning → Generative
> AI → Agents → Agentic AI, as abstract stacks around a central SH core. Radial layering from the AI
> Universe ref + vertical hierarchy; replace all text with tiny glyph icons + diagrams. Color bands
> inspired by the chakra collage but limited to emerald/gold/cyan on obsidian. Fine diagrammatic lines,
> small tool/ability icons, luminous SH sigil at center. Poster-grade, extremely detailed. [NEG]*

**4.2 Landscape cross-section card** · input `8bad26d7…`  · 3:4
> *[SPINE] A landscape cross-section card: top = sky + cloud in sacred-cube wireframe; middle =
> Tree-of-Life paths as glowing lines over a grid; bottom = crystalline ocean floor / water + rock as
> neon data. Side columns filled with abstract numeric glyphs + small diagrams (no readable text).
> Clean vertical framing, black background outside the card edges. [NEG]*

---

## 5 · MISC / COLLAGE & GLITCH (ambient art)
**5.1 Glitch garden collage**
> *[SPINE] Layered collage of garden scenes, windows, film strips, halftone blocks — overlapping
> rectangular frames at different scales, each a slightly different view of trees/water/light.
> Controlled pixelated glitches + halftone dots ONLY at frame edges; central areas stay soft +
> photographic. Emerald/gold with cyan highlights. Feels like fragmented memory of the SHADDAI world. [NEG]*

**5.2 Shimmering water sigil plate** · input glossy-water close-up
> *[SPINE] Close-up of shimmering emerald water with sunlight sparks, camera almost touching the
> surface. Ripples form subtle Seed-of-Life rings + a faint SH sigil distorted in reflections.
> Highlights pure gold, shadows deep teal, slight chromatic aberration at bright edges. No sky/shore,
> pure abstract surface. [NEG]*

---

## 6 · GENERATION PLAN (budget-safe) + refinement loop
1. **Batch 1 — Descent stills (~$0.35):** grass-hd, planet-1/2/3, water-hd, earth-hd, tree-hd,
   arrival, hero-space. Review → drop winners into scenes.
2. **Batch 2 — Descent motion (~$1.50):** grass-loop, planet loops, cosmos fly-through, tree-pulse,
   SH glitch-on. Review.
3. **Phase 2 — Pixel World + Codex:** after the front-end ships.
Total Descent ≈ **$1.85** of $8.75 → margin for re-rolls.

**Refinement:** after each batch, mark wins/misses **inline in this file** (e.g. "planet too busy →
reduce nebula, increase black space"), add DO/DON'T bullets under any prompt that misfires.

> **Gate:** approve → I wire `fal-assets/generate.mjs` (reads these prompts, uses `FAL_KEY` from
> `.env`, writes to `public/assets/journey/`), verify each headless before it goes live. **No spend
> until you say "generate batch 1."**
