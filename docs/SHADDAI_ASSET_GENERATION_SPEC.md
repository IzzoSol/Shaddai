# SHADDAI World Asset Generation Specification

**Generated:** 2026-06-25  
**Status:** Pre-generated, cached forever  
**Budget:** One batch session (~10 FLUX calls), never regenerate unless explicitly instructed  
**Aesthetic Framework:** Toonami TOM Armor — hard sci-fi design with segmented plate armor, visor-based agents (no exposed faces), functional attachment points

---

## Design Framework: TOM Armor

### What Makes This Work

**Structural Elements:**
- Segmented armor plates with visible panel lines and seams (not smooth)
- Accent nodes — glowing circles in agent color (visor, gloves, chest)
- Visor face (no exposed human face) — distinct visor shape per agent
- Functional attachment points — pouches, straps, utility slots
- Proportions: slightly heroic scale (wider shoulders) but not exaggerated
- Material: dark matte base + specular highlights on plate edges + emissive accent color

### Variables Per Agent (The 7 Differentiators)

1. **Primary accent color** — glowing nodes, visor, circuit traces
2. **Visor shape** — ORACLE = wide band, PIKADON = angular slit, QUILL = soft oval, etc.
3. **Armor silhouette** — SHADDAI = longest coat, NEXUS = widest shoulders, TURTLE = stockiest
4. **Accent node placement** — ZEROX = forearm ticker nodes, ORACLE = arc above helmet
5. **Back attachment** — SHADDAI = 7-pointed staff, PIKADON = scanning array, NEXUS = blueprint emitter
6. **Surface pattern** — circuit traces in agent color following armor seams
7. **Helmet detail** — QUILL = feather crest, TURTLE = wide-brim dome, ZEROX = scrolling ticker

---

## Agent Characters (7 total)

### Shared Negative Prompt
```
blurry, low quality, white background, bright background, anime, cartoon, flat art, 2D, 
sketch, human face visible, exposed skin, simple suit, spandex, generic robot
```

---

### 1. SHADDAI — The Source

**Color:** Gold #ffad2e  
**Rarity:** LEGENDARY  
**Dimensions:** 512×1024  
**Parameters:**
- guidance_scale: 7.5
- num_inference_steps: 30

**FLUX Prompt:**
```
Full body power armor character, hard sci-fi design inspired by Toonami TOM aesthetic, 
void black segmented plate armor with visible panel lines, glowing gold circuit traces 
following seams, gold accent nodes on chest and gauntlets, visor: full-face gold-tinted 
wide band, back-mounted 7-pointed golden staff array, long armored coat draped over 
pauldrons, standing perfectly still, heroic proportions, dark void background #020509, 
rim lighting gold, ultra-detailed, cinematic, 3/4 view
```

**Output:** `/api/forge/art/char-shaddai.png`

---

### 2. ZEROX — The Trader

**Color:** Electric green #00ff88  
**Rarity:** EPIC  
**Dimensions:** 512×1024  
**Parameters:**
- guidance_scale: 7.5
- num_inference_steps: 30

**FLUX Prompt:**
```
Full body power armor character, hard sci-fi design inspired by Toonami TOM aesthetic,
void black segmented plate armor, glowing electric green circuit traces, forearm plates 
have scrolling green ticker-tape display panels, visor: horizontal green glowing slit, 
green accent nodes on knuckles and shoulders, slight forward lean stance, belt-mounted 
data pouches, dark void background #020509, rim lighting electric green, ultra-detailed, 
cinematic, 3/4 view
```

**Output:** `/api/forge/art/char-zerox.png`

---

### 3. ORACLE — The Librarian

**Color:** Deep violet #9b59f5  
**Rarity:** LEGENDARY  
**Dimensions:** 512×1024  
**Parameters:**
- guidance_scale: 7.5
- num_inference_steps: 30

**FLUX Prompt:**
```
Full body power armor character, hard sci-fi design inspired by Toonami TOM aesthetic,
void black segmented plate armor, glowing deep violet circuit traces, helmet has a wide 
curved visor with a ring of small violet data nodes forming an arc above it, one gauntlet 
larger with holographic projection emitter, slightly hunched contemplative stance, 
dark void background #020509, rim lighting deep violet, ultra-detailed, cinematic, 3/4 view
```

**Output:** `/api/forge/art/char-oracle.png`

---

### 4. NEXUS — The Architect

**Color:** Cyan #00e5ff  
**Rarity:** EPIC  
**Dimensions:** 512×1024  
**Parameters:**
- guidance_scale: 7.5
- num_inference_steps: 30

**FLUX Prompt:**
```
Full body power armor character, hard sci-fi design inspired by Toonami TOM aesthetic,
void black segmented plate armor with hexagonal panel geometry, glowing cyan circuit traces, 
extra-wide pauldrons with blueprint hologram emitter on right shoulder, chest plate has 
embedded wireframe schematic display, visor: cyan scan-line double band, widest shoulder 
silhouette of all agents, dark void background #020509, rim lighting bright cyan, 
ultra-detailed, cinematic, 3/4 view
```

**Output:** `/api/forge/art/char-nexus.png`

---

### 5. QUILL — The Voice

**Color:** Rose white #f0c8d8  
**Rarity:** RARE  
**Dimensions:** 512×1024  
**Parameters:**
- guidance_scale: 7.5
- num_inference_steps: 30

**FLUX Prompt:**
```
Full body power armor character, hard sci-fi design inspired by Toonami TOM aesthetic,
void black segmented plate armor, flowing asymmetric cloak-panel attached to left pauldron, 
glowing rose-white circuit traces in calligraphic curves (not angular), helmet has a tall 
crest fin, visor: soft oval rose-white glow, right gauntlet extended forward mid-gesture, 
lightest-framed build of the 7, dark void background #020509, rim lighting rose-white, 
ultra-detailed, cinematic, 3/4 view
```

**Output:** `/api/forge/art/char-quill.png`

---

### 6. TURTLE — The Artist

**Color:** Teal #18cae6  
**Rarity:** RARE  
**Dimensions:** 512×1024  
**Parameters:**
- guidance_scale: 7.5
- num_inference_steps: 30

**FLUX Prompt:**
```
Full body power armor character, hard sci-fi design inspired by Toonami TOM aesthetic,
void black segmented plate armor with wide-brim dome helmet, teal primary circuit traces 
with multicolor accent nodes (teal, magenta, amber — only agent with multiple accent colors), 
stockiest proportions, large gauntlets, back-mounted deployable canvas frame array, 
visor: wide teal panoramic band, dark void background #020509, rim lighting teal with 
multicolor edge sparks, ultra-detailed, cinematic, 3/4 view
```

**Output:** `/api/forge/art/char-turtle.png`

---

### 7. PIKADON — The Sentinel

**Color:** Red-orange #ff4400  
**Rarity:** EPIC  
**Dimensions:** 512×1024  
**Parameters:**
- guidance_scale: 7.5
- num_inference_steps: 30

**FLUX Prompt:**
```
Full body power armor character, hard sci-fi design inspired by Toonami TOM aesthetic,
void black heaviest-plated armor of the 7 agents, red-orange circuit traces, chest plate 
has warning chevron markings, back-mounted scanning antenna array, visor: aggressive 
red-orange angular slit, three hexagonal surveillance drone panels on forearm mounted, 
arms crossed wide-stance, dark void background #020509, rim lighting red-orange, 
ultra-detailed, cinematic, 3/4 view
```

**Output:** `/api/forge/art/char-pikadon.png`

---

## Terrain Biomes (3 total)

### Terrain Negative Prompt
```
perspective, 3D, shadows, organic, photorealistic, bright background, white, people, objects
```

---

### 1. Tron Grid

**Color:** Cyan #00e5ff  
**Dimensions:** 1024×1024  
**Parameters:**
- guidance_scale: 7.0
- num_inference_steps: 25

**FLUX Prompt:**
```
Seamless tileable ground texture, perfect square grid lines glowing cyan #00e5ff on void 
black #020509, thin bright lines forming equal squares, intersection nodes glowing slightly 
brighter, every 8th intersection has a small glowing circle node, flat top-down view, 
Tron Legacy aesthetic, no perspective distortion, no organic elements, pure geometric, 
seamless edges for tiling, ultra-detailed, game texture
```

**Output:** `/api/forge/art/tex-grid.png`

---

### 2. Arctic Snow

**Color:** Ice blue-white #aaddff  
**Dimensions:** 1024×1024  
**Parameters:**
- guidance_scale: 7.0
- num_inference_steps: 25

**FLUX Prompt:**
```
Seamless tileable ground texture, cracked ice polygon shard geometry with glowing ice-blue 
#aaddff edges on near-black #030810, geometric angular cracked plate pattern, faint 
hexagonal frost crystal details inside each polygon shard, flat top-down view, 
digital frozen tundra, Tron Legacy aesthetic, no organic snowflakes, 
purely geometric crystalline, seamless edges for tiling, ultra-detailed, game texture
```

**Output:** `/api/forge/art/tex-arctic.png`

---

### 3. Sand Sea (Desert)

**Color:** Amber #ff7a18  
**Dimensions:** 1024×1024  
**Parameters:**
- guidance_scale: 7.0
- num_inference_steps: 25

**FLUX Prompt:**
```
Seamless tileable ground texture, flowing parallel sine-wave lines in amber #ff7a18 on 
void black #020509, mathematical dune wave pattern with smooth curves, faint perpendicular 
circuit line traces suggesting buried infrastructure, flat top-down view, digital desert 
wasteland, Tron Legacy aesthetic, geometric not organic, no sand grains or particles, 
pure mathematical wave forms, seamless edges for tiling, ultra-detailed, game texture
```

**Output:** `/api/forge/art/tex-desert.png`

---

## Caching & Regeneration Policy

**NEVER regenerate these assets.** They are pre-generated once and cached forever.

If an asset needs adjustment:
1. Document the change in this spec
2. Manually regenerate only that asset (not the entire batch)
3. Update the timestamp and mark which asset(s) were re-generated

**Budget:** ~10 FLUX calls for initial generation. Future sessions cost $0 for these assets.
