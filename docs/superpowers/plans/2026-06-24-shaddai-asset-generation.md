# SHADDAI World Asset Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate 12 SHADDAI World assets via fal.ai FLUX API (7 council agents + 3 Forge heroes + 1 terrain + 1 light cycle), integrate into SHADDAI-WORLD-3D.html, and establish a cache system to prevent costly regenerations.

**Architecture:** A Node.js script (`generate-assets-fal.js`) manages batch generation through the fal.ai FLUX API, downloading all images sequentially and saving to `/api/forge/art/`. A companion metadata file tracks SHA256 checksums, preventing accidental regeneration. Integration tests verify loading in the HTML dashboard.

**Tech Stack:** Node.js (https), fal.ai FLUX Dev tier (~$0.013/image), SHA256 checksums (Node.js crypto module), PNG image format (512×1024 for characters, 1024×1024 for terrain/renders).

---

## File Structure

**Files to create:**
- `backend/scripts/generate-assets-fal.js` — Updated batch generation script with all 12 assets
- `backend/data/forge-art-manifest.json` — Asset checksums + metadata (cache lock)
- `docs/ASSET_GENERATION_GUIDE.md` — Operations guide for future regeneration/auditing

**Files to verify (no changes needed):**
- `backend/data/forge-art/` — Directory for all outputs (should already exist)
- `SHADDAI-WORLD-3D.html` — Asset loading tested at end

---

## Task Breakdown

### Task 1: Update Asset Generation Script

**Files:**
- Modify: `backend/scripts/generate-assets-fal.js` (replace terrains with Forge heroes + light cycle)

- [ ] **Step 1: Back up current script**

Run: 
```bash
cp backend/scripts/generate-assets-fal.js backend/scripts/generate-assets-fal.js.backup
```

- [ ] **Step 2: Update ASSETS array to include all 12 assets**

Replace the existing ASSETS array (lines 19–83) with the following:

```javascript
const ASSETS = [
  // ─────── 7 Agent Characters ───────
  {
    id: 'shaddai',
    type: 'agent',
    filename: 'char-shaddai.png',
    prompt: `Full body power armor character, hard sci-fi design inspired by Toonami TOM aesthetic, void black segmented plate armor with visible panel lines, glowing gold circuit traces following seams, gold accent nodes on chest and gauntlets, visor: full-face gold-tinted wide band, back-mounted 7-pointed golden staff array, long armored coat draped over pauldrons, standing perfectly still, heroic proportions, dark void background #020509, rim lighting gold, ultra-detailed, cinematic, 3/4 view`,
  },
  {
    id: 'zerox',
    type: 'agent',
    filename: 'char-zerox.png',
    prompt: `Full body power armor character, hard sci-fi design inspired by Toonami TOM aesthetic, void black segmented plate armor, glowing electric green circuit traces, forearm plates have scrolling green ticker-tape display panels, visor: horizontal green glowing slit, green accent nodes on knuckles and shoulders, slight forward lean stance, belt-mounted data pouches, dark void background #020509, rim lighting electric green, ultra-detailed, cinematic, 3/4 view`,
  },
  {
    id: 'oracle',
    type: 'agent',
    filename: 'char-oracle.png',
    prompt: `Full body power armor character, hard sci-fi design inspired by Toonami TOM aesthetic, void black segmented plate armor, glowing deep violet circuit traces, helmet has a wide curved visor with a ring of small violet data nodes forming an arc above it, one gauntlet larger with holographic projection emitter, slightly hunched contemplative stance, dark void background #020509, rim lighting deep violet, ultra-detailed, cinematic, 3/4 view`,
  },
  {
    id: 'nexus',
    type: 'agent',
    filename: 'char-nexus.png',
    prompt: `Full body power armor character, hard sci-fi design inspired by Toonami TOM aesthetic, void black segmented plate armor with hexagonal panel geometry, glowing cyan circuit traces, extra-wide pauldrons with blueprint hologram emitter on right shoulder, chest plate has embedded wireframe schematic display, visor: cyan scan-line double band, widest shoulder silhouette of all agents, dark void background #020509, rim lighting bright cyan, ultra-detailed, cinematic, 3/4 view`,
  },
  {
    id: 'turtle',
    type: 'agent',
    filename: 'char-turtle.png',
    prompt: `Full body power armor character, hard sci-fi design inspired by Toonami TOM aesthetic, void black segmented plate armor with wide-brim dome helmet, teal primary circuit traces with multicolor accent nodes (teal, magenta, amber — only agent with multiple accent colors), stockiest proportions, large gauntlets, back-mounted deployable canvas frame array, visor: wide teal panoramic band, dark void background #020509, rim lighting teal with multicolor edge sparks, ultra-detailed, cinematic, 3/4 view`,
  },
  {
    id: 'quill',
    type: 'agent',
    filename: 'char-quill.png',
    prompt: `Full body power armor character, hard sci-fi design inspired by Toonami TOM aesthetic, void black segmented plate armor, flowing asymmetric cloak-panel attached to left pauldron, glowing rose-white circuit traces in calligraphic curves (not angular), helmet has a tall crest fin, visor: soft oval rose-white glow, right gauntlet extended forward mid-gesture, lightest-framed build of the 7, dark void background #020509, rim lighting rose-white, ultra-detailed, cinematic, 3/4 view`,
  },
  {
    id: 'pikadon',
    type: 'agent',
    filename: 'char-pikadon.png',
    prompt: `Full body power armor character, hard sci-fi design inspired by Toonami TOM aesthetic, void black heaviest-plated armor of the 7 agents, red-orange circuit traces, chest plate has warning chevron markings, back-mounted scanning antenna array, visor: aggressive red-orange angular slit, three hexagonal surveillance drone panels on forearm mounted, arms crossed wide-stance, dark void background #020509, rim lighting red-orange, ultra-detailed, cinematic, 3/4 view`,
  },

  // ─────── 3 Forge Hero Templates ───────
  {
    id: 'ghost',
    type: 'forge-hero',
    filename: 'hero-ghost.png',
    prompt: `Full body stealth infiltrator character, hard sci-fi design inspired by Toonami TOM aesthetic, void black tactical armor with minimal visible seams, glowing teal stealth cloak panels draping asymmetrically, visor: narrow horizontal teal glow, lightweight sleek build, crouched ready stance with one hand raised, shoulder-mounted cloaking projector nodes, dark void background #020509, rim lighting teal, ultra-detailed, cinematic, 3/4 view`,
  },
  {
    id: 'gaia-link',
    type: 'forge-hero',
    filename: 'hero-gaia-link.png',
    prompt: `Full body nature-spirit character, hard sci-fi biopunk design inspired by Toonami TOM aesthetic, void black segmented bio-armor interwoven with glowing bioluminescent vine circuits in emerald green, helmet fused with organic growth patterns, visor: soft emerald-green bioluminescent glow, flowing cape of woven bioluminescent tendrils, balanced grounded stance, back-mounted spore dispersal array, dark void background #020509, rim lighting emerald green, ultra-detailed, cinematic, 3/4 view`,
  },
  {
    id: 'psionic',
    type: 'forge-hero',
    filename: 'hero-psionic.png',
    prompt: `Full body reality-warper character, hard sci-fi design inspired by Toonami TOM aesthetic, void black armor with ethereal magenta circuit traces forming geometric distortion patterns, helmet has a spherical holographic visor glowing magenta, flowing translucent ethereal robes layered over armor, floating mid-stance with both hands outstretched as if manipulating space, back-mounted quantum stabilizer array with orbiting particle nodes, dark void background #020509, rim lighting magenta with spatial distortion artifacts, ultra-detailed, cinematic, 3/4 view`,
  },

  // ─────── 1 Terrain Texture ───────
  {
    id: 'grid',
    type: 'terrain',
    filename: 'tex-grid.png',
    prompt: `Seamless tileable ground texture, perfect square grid lines glowing cyan #00e5ff on void black #020509, thin bright lines forming equal squares, intersection nodes glowing slightly brighter, every 8th intersection has a small glowing circle node, flat top-down view, Tron Legacy aesthetic, no perspective distortion, no organic elements, pure geometric, seamless edges for tiling, ultra-detailed, game texture`,
  },

  // ─────── 1 Light Cycle Hero Render ───────
  {
    id: 'light-cycle',
    type: 'vehicle',
    filename: 'hero-light-cycle.png',
    prompt: `Cinematic hero shot: minimalist light cycle vehicle, Tron Legacy aesthetic, void black sleek futuristic bike frame, glowing cyan #00e5ff accent lines and neon glow along body panels, bright cyan glowing light trail wall behind it suggesting high speed motion, driver in void black armor visible in cockpit with cyan visor glow, dynamic forward-leaning riding stance, geometric angular design with smooth curves, dark void space background #020509, lens flare and bloom effects, cinematic lighting, ultra-detailed, 3/4 view`,
  },
];
```

- [ ] **Step 3: Verify ASSETS array has exactly 12 items**

Count items: 7 agents + 3 heroes + 1 terrain + 1 vehicle = 12. ✓

- [ ] **Step 4: Update SHARED_NEGATIVE prompt**

Replace line 85 with (to exclude unwanted features in Forge heroes/light cycle):

```javascript
const SHARED_NEGATIVE = 'blurry, low quality, white background, bright background, anime, cartoon, flat art, 2D, sketch, human face visible, exposed skin, simple suit, spandex, generic robot, person, rider, wheels, treads, real motorcycle, perspective, 3D shadows, organic, photorealistic, bright background, white';
```

- [ ] **Step 5: Update generation guidance for new asset types**

Replace the guidance section (around line 94) to handle vehicle and forge-hero types:

```javascript
function callFalApi(asset) {
  return new Promise((resolve, reject) => {
    const isAgent = asset.type === 'agent';
    const isHero = asset.type === 'forge-hero';
    const isVehicle = asset.type === 'vehicle';
    const isTerrain = asset.type === 'terrain';

    let [width, height, guidance, steps] = [512, 1024, 7.5, 30];
    if (isTerrain) [width, height, guidance, steps] = [1024, 1024, 7.0, 25];
    if (isVehicle) [width, height, guidance, steps] = [512, 1024, 8.0, 35]; // higher guidance for cinematic
    if (isHero) [width, height, guidance, steps] = [512, 1024, 7.5, 30];

    // ... rest of function unchanged
```

- [ ] **Step 6: Verify script syntax**

Run:
```bash
node -c backend/scripts/generate-assets-fal.js
```

Expected: No output (syntax check passes).

- [ ] **Step 7: Commit updated script**

```bash
git add backend/scripts/generate-assets-fal.js
git commit -m "feat(assets): update generation script for 12 assets (7 agents + 3 heroes + terrain + bike)"
```

---

### Task 2: Execute fal.ai Generation Batch

**Files:**
- Use: `backend/scripts/generate-assets-fal.js`
- Output: `backend/data/forge-art/*.png` (12 images)

- [ ] **Step 1: Ensure output directory exists**

Run:
```bash
mkdir -p backend/data/forge-art
ls -la backend/data/forge-art
```

Expected: Directory exists (may be empty or have old assets).

- [ ] **Step 2: Set FAL_KEY environment variable**

Run (Windows PowerShell):
```powershell
$env:FAL_KEY = "1c39707e-16dd-4d68-8196-960c97ca9aee:b39c9ca679b9a1c8f6f933b6010d5077"
```

Or (macOS/Linux bash):
```bash
export FAL_KEY="1c39707e-16dd-4d68-8196-960c97ca9aee:b39c9ca679b9a1c8f6f933b6010d5077"
```

- [ ] **Step 3: Run generation batch**

Run:
```bash
node backend/scripts/generate-assets-fal.js
```

Expected output: Success message with all 12 assets downloaded.

- [ ] **Step 4: Verify all 12 files were created**

Run:
```bash
ls -lh backend/data/forge-art/*.png | wc -l
```

Expected: `12`

---

### Task 3: Generate Cache Metadata & Lock File

**Files:**
- Create: `backend/data/forge-art-manifest.json`
- Create: `backend/data/.forge-art-lock`

- [ ] **Step 1: Create manifest metadata script**

Create `backend/scripts/generate-manifest.js` with SHA256 generation logic.

- [ ] **Step 2: Run manifest generation**

Run:
```bash
node backend/scripts/generate-manifest.js
```

- [ ] **Step 3: Verify manifest file structure**

Confirm JSON has all 12 assets with SHA256 hashes.

- [ ] **Step 4: Verify lock file exists**

Confirm `.forge-art-lock` created successfully.

- [ ] **Step 5: Commit manifest and lock**

```bash
git add backend/data/forge-art-manifest.json backend/scripts/generate-manifest.js
git commit -m "chore(assets): create forge-art manifest and cache lock"
```

---

### Task 4: Verify Integration with SHADDAI-WORLD-3D.html

**Files:**
- Test: `SHADDAI-WORLD-3D.html`
- Reference: `backend/data/forge-art/*` (all 12 images)

- [ ] **Step 1: Start development server**

Run:
```bash
npm start
```

- [ ] **Step 2: Open SHADDAI-WORLD-3D.html in browser**

Navigate to `http://localhost:3000/SHADDAI-WORLD-3D.html`

- [ ] **Step 3: Verify all assets load without 404s**

Check browser console for errors. All 12 images should load successfully.

- [ ] **Step 4: Spot-check visual quality**

Verify agent characters, Forge heroes, terrain texture, and light cycle render display correctly.

---

### Task 5: Document & Final Commit

**Files:**
- Create: `docs/ASSET_GENERATION_GUIDE.md`

- [ ] **Step 1: Create operations guide**

Create comprehensive guide covering cache management, regeneration procedures, troubleshooting.

- [ ] **Step 2: Update .gitignore**

Ensure `*.png` and `.forge-art-lock` are in `backend/data/.gitignore`.

- [ ] **Step 3: Final status check**

Verify all files staged correctly.

- [ ] **Step 4: Final commit**

Commit all documentation and configuration changes.

- [ ] **Step 5: Push to remote**

Push all commits to remote repository.

---

## Verification Checklist

After all tasks complete:

- [ ] All 12 PNG files exist in `backend/data/forge-art/`
- [ ] `forge-art-manifest.json` contains all 12 assets with SHA256 hashes
- [ ] `.forge-art-lock` file exists (prevents regeneration)
- [ ] `SHADDAI-WORLD-3D.html` loads all assets without 404 errors
- [ ] Browser console shows no image-loading errors
- [ ] All commits pushed to remote
- [ ] `.gitignore` prevents PNG files from being committed
- [ ] Estimated fal.ai cost: ~$2.50 (within budget)
