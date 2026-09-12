# Forge Character Kits & Cosmetics Store Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the Voxel character kit (portrait art + animated walking rig) and a first accessory batch, wired into a real Sparks-priced cosmetics store on top of existing Forge/operative infrastructure.

**Architecture:** `pixel-people.js` gains a `rig.kit` proportions/palette branch (orthogonal to the existing 100-preset system — every existing preset works with any kit unchanged) and an image-overlay layer for accessories, anchored to the rig's existing animated coordinates so cosmetics move with the walk cycle. `operatives.js` gains one inventory array. Two new HTTP endpoints handle the store loop.

**Tech Stack:** Vanilla JS canvas (`pixel-people.js`), Express (`backend/`), fal.ai flux/dev + HuggingFace FLUX (art generation, one-time), existing Sparks/credit-debit pattern.

**Spec:** `docs/superpowers/specs/2026-09-12-forge-character-kits-and-cosmetics-store-design.md`

## Global Constraints

- `rig.kit` defaults to `'classic'` — every existing preset, saved operative, and rig JSON blob must render identically to today with no field present (zero migration).
- Accessory anchors MUST be expressed in the same per-frame animated coordinate space `guy()` already uses (post-walk-bob), never a static screen offset — an accessory that doesn't track the walk cycle is a bug, not a style choice.
- Palette for the Voxel kit is the site's existing Art Bible set only: obsidian `#06080b`, emerald `#00ff9c`, gold `#e8c45c`, cyan `#5fe0ff` (plus shading derived from these via the existing `shade()` helper) — no new colors invented.
- Real fal spend on this plan must stay under $20 total (per the spec's budget line) — Task 1's generation script runs dry-run first, `--go` only after a visual check of the dry-run's prompt output.
- No new data files for inventory — extend `backend/lib/operatives.js`'s existing `inventory` object, do not create a parallel store.

---

### Task 1: Production art — Voxel portrait + first accessory batch

**Files:**
- Create: `fal-assets/batches/voxel-kit-portrait.json` (manifest, following `fal-assets/generate.mjs`'s existing job schema)
- Create: `fal-assets/batches/voxel-accessories-batch1.json` (manifest, 5 accessory icons: `hat_visor`, `weapon_tablet`, `pet_drone`, `wings_thruster`, `mask_respirator` — one per slot, enough to prove the pipeline end-to-end; more items are a follow-up batch, not blocking this plan)
- Create: `public/assets/kits/voxel-portrait.png` (generation output, background-removed)
- Create: `public/assets/accessories/*.png` (5 generation outputs, background-removed)
- Create: `public/assets/accessories/catalog.json`

**This task is executed directly (not dispatched to a subagent)** — art generation needs visual review of each output before spending on the next step, the same way the spike test earlier in this session did. Do not delegate this task.

- [ ] **Step 1: Write the portrait manifest**

`fal-assets/batches/voxel-kit-portrait.json`:
```json
[
  {
    "id": "voxel-portrait-draft",
    "type": "text2img",
    "register": "pixel",
    "body": "video game character reference sprite, voxel blocky 3D-rendered humanoid character (Minecraft or Crossy Road style), human-shaped AI agent holding a slim glowing data-tablet, obsidian #06080b armor with emerald #00ff9c and gold #e8c45c accents, cyan #5fe0ff glow details, three-quarter elevated camera angle, full body visible, standing ready stance, flat white background, game asset",
    "size": "square_hd",
    "out": "public/assets/kits/voxel-portrait-draft.png"
  }
]
```
Note: this first pass uses fal directly (not the free HF path) because we already have a proven-good reference composition from the spike (`fal-assets/spike/style-voxel-blocky.png`) — this is a refinement of a known-good result, not blind exploration, so skipping the free-draft step here is deliberate, not wasteful.

- [ ] **Step 2: Dry-run, review, then generate**

```bash
node fal-assets/generate.mjs voxel-kit-portrait
node fal-assets/generate.mjs voxel-kit-portrait --go
```
Open `public/assets/kits/voxel-portrait-draft.png` (Read tool) and visually confirm it matches the spike's quality bar. If not, adjust `body` text and re-run — this is real fal spend (~$0.05/attempt), keep iterations to 2-3 max.

- [ ] **Step 3: Remove the background**

The output has a flat background, not transparency. Use a simple chroma-key/edge-detection pass — write a tiny one-off Node script using the `sharp` package if already a dependency (`grep sharp package.json`); if not available, use `fal-ai/imageutils/rembg` (a real fal background-removal model) as a second fal call on the same image (`image_url` = the generated PNG as a data URI, no other params). Save the result as `public/assets/kits/voxel-portrait.png`.

- [ ] **Step 4: Write the accessories manifest**

`fal-assets/batches/voxel-accessories-batch1.json` — 5 jobs, same `register:"pixel"` pattern, each `body` describing ONE flat icon (not a posed character) in the same obsidian/emerald/gold/cyan palette, `size: "square"`, `out: "public/assets/accessories/<id>.png"`. Example job:
```json
{
  "id": "hat_visor",
  "type": "text2img",
  "register": "pixel",
  "body": "single game icon, angular sci-fi visor helmet accessory, obsidian #06080b base with thin gold #e8c45c trim and cyan #5fe0ff lens glow, isolated icon on flat white background, no character, no body, item icon only",
  "size": "square",
  "out": "public/assets/accessories/hat_visor.png"
}
```
Write all 5 (`hat_visor`, `weapon_tablet`, `pet_drone`, `wings_thruster`, `mask_respirator`) following this pattern.

- [ ] **Step 5: Dry-run, generate, background-remove all 5**

Same dry-run → review → `--go` → rembg pass as Steps 2-3, batched. Confirm total fal spend so far with `git log`-free napkin math (job count × ~$0.025-0.05 each) stays under $5.

- [ ] **Step 6: Write the accessory catalog**

`public/assets/accessories/catalog.json`:
```json
[
  { "id": "hat_visor", "slot": "hat", "kit": "any", "anchorOffset": { "x": 0, "y": -38 }, "imageFile": "hat_visor.png", "rarity": "common", "sparksPrice": 40 },
  { "id": "weapon_tablet", "slot": "weapon", "kit": "any", "anchorOffset": { "x": 12, "y": -12 }, "imageFile": "weapon_tablet.png", "rarity": "common", "sparksPrice": 40 },
  { "id": "pet_drone", "slot": "pet", "kit": "any", "anchorOffset": { "x": -22, "y": -8 }, "imageFile": "pet_drone.png", "rarity": "rare", "sparksPrice": 90 },
  { "id": "wings_thruster", "slot": "wings", "kit": "any", "anchorOffset": { "x": 0, "y": -18 }, "imageFile": "wings_thruster.png", "rarity": "epic", "sparksPrice": 160 },
  { "id": "mask_respirator", "slot": "mask", "kit": "any", "anchorOffset": { "x": 0, "y": -30 }, "imageFile": "mask_respirator.png", "rarity": "common", "sparksPrice": 40 }
]
```
`anchorOffset` values here are starting estimates — Task 3's Step 4 visual check is where these get corrected against the real rig, not this step.

- [ ] **Step 7: Commit**

```bash
git add fal-assets/batches/voxel-kit-portrait.json fal-assets/batches/voxel-accessories-batch1.json public/assets/kits/ public/assets/accessories/
git commit -m "Add Voxel kit portrait + first accessory batch (production art)"
```

---

### Task 2: `pixel-people.js` — Voxel rig template

**Files:**
- Modify: `public/pixel-people.js:63-111` (the `guy()` function)

**Interfaces:**
- Consumes: nothing new (reads `rig.kit`, falls back to today's default path when absent/`'classic'`)
- Produces: `rig.kit === 'voxel'` renders a blockier-proportioned, flat-shaded version of the same rig fields every other kit already understands (skin/hair/shirt/pants/shoe/etc all still apply — kit changes geometry/shading only, never field semantics)

- [ ] **Step 1: Add the voxel proportions branch**

In `guy()`, immediately after the existing `const skin=rig.skin||...` line block (public/pixel-people.js:67-69), add:
```javascript
const isVoxel = rig.kit === 'voxel';
const VS = isVoxel ? 1.15 : 1;      // voxel torso/limb width multiplier — blockier silhouette
const voxelFlat = (hex) => isVoxel ? hex : null; // voxel skips gradient shading on box tops when set
```

- [ ] **Step 2: Apply the multiplier to box dimensions**

Every `boxL(...)` call in `guy()` that draws torso/limb/head width (e.g., `boxL(col,row,0.4,0.3,15,top,10+L,E)` for the torso at public/pixel-people.js:75) gets its width/depth args scaled: `0.4*VS,0.3*VS`. Apply this scaling to the torso, arm (`armPart`'s width args), leg, and head `boxL` calls — NOT to position offsets (`col+g[0]`, `L`, `str`), only to the width/depth/height dimension args, so the walk-cycle math (Global Constraint) is untouched.

- [ ] **Step 3: Flatten shading for voxel**

In `box()` (public/pixel-people.js:35-46), the `opts.left`/`opts.right` shading currently defaults to `shade(top,-0.17)`/`shade(top,-0.33)` (soft gradient faces). Voxel wants harder, flatter faces — pass `{ left: isVoxel ? shade(top,-0.25) : undefined, right: isVoxel ? shade(top,-0.4) : undefined, edge:true }` for voxel calls (slightly harsher than classic's default, still using the same `shade()` helper, no new color logic).

- [ ] **Step 4: Manual visual verification**

No JS test framework covers this file (canvas rendering, verified visually per existing project convention). Open `public/pixel-forge.html` locally (or a throwaway HTML harness), draw 3 different existing PRESETS entries with `Object.assign({}, preset.rig, {kit:'voxel'})`, confirm: (a) no thrown exceptions, (b) visibly blockier than the same preset without `kit:'voxel'`, (c) walk animation (`rig.anim='walk'`) still animates correctly — legs/arms swing, nothing frozen.

- [ ] **Step 5: Update the header comment**

Add `kit('classic'|'voxel', default 'classic')` to the documented optional-fields list at the top of the file (public/pixel-people.js:13-19), next to the existing `office`/`jobTint`/`classTint` entries.

- [ ] **Step 6: Commit**

```bash
git add public/pixel-people.js
git commit -m "Add Voxel kit rig template to pixel-people.js"
```

---

### Task 3: `pixel-people.js` — accessory image-overlay layer

**Files:**
- Modify: `public/pixel-people.js` (add image cache + draw call)

**Interfaces:**
- Consumes: `rig.accessories = { hat, weapon, pet, wings, mask }` (each a catalog id or null/undefined), `public/assets/accessories/catalog.json` (loaded once, cached)
- Produces: accessories drawn as image overlays after the procedural rig, at the rig's live animated coordinates

- [ ] **Step 1: Write the failing manual check**

(No unit-test framework for this file — this is the visual-check equivalent of a failing test.) Before implementing, confirm in the browser console that `rig.accessories = {hat:'hat_visor'}` currently does nothing (no overlay appears) — establishes the baseline the next steps change.

- [ ] **Step 2: Add the catalog + image cache**

Near the top of the IIFE (after the `let ctx = null, OX = 0, OY = 0;` line, public/pixel-people.js:24):
```javascript
let _catalog = null, _catalogPromise = null;
const _imgCache = {};
function loadCatalog() {
  if (_catalogPromise) return _catalogPromise;
  _catalogPromise = fetch('/assets/accessories/catalog.json').then(r => r.json())
    .then(list => { _catalog = {}; list.forEach(it => { _catalog[it.id] = it; }); return _catalog; })
    .catch(() => { _catalog = {}; return _catalog; });
  return _catalogPromise;
}
function getImg(file) {
  if (_imgCache[file]) return _imgCache[file];
  const img = new Image();
  img.src = '/assets/accessories/' + file;
  _imgCache[file] = img;
  return img;
}
loadCatalog(); // fire on module load — accessories before the first catalog fetch resolves simply don't draw yet, which is correct (no flash of missing-image icon)
```

- [ ] **Step 3: Draw accessories at the end of `guy()`**

After the existing eyes/glasses block (public/pixel-people.js:110, just before the closing `}` of `guy()`), add:
```javascript
if (rig.accessories && _catalog) {
  const [ax, ay] = iso(0, 0);
  for (const slot in rig.accessories) {
    const id = rig.accessories[slot];
    if (!id) continue;
    const item = _catalog[id];
    if (!item) continue;
    const img = getImg(item.imageFile);
    if (!img.complete || !img.naturalWidth) continue; // not loaded yet — skip this frame, next frame draws it
    const ox = (item.anchorOffset && item.anchorOffset.x) || 0;
    const oy = (item.anchorOffset && item.anchorOffset.y) || 0;
    // ax/ay already include OX/OY + the isometric origin; subtract L so the accessory
    // rides the SAME walk-bob offset as the rest of the rig (Global Constraint).
    ctx.drawImage(img, Math.round(ax + ox - img.naturalWidth / 4), Math.round(ay - (25 + L) + oy - img.naturalHeight / 4), img.naturalWidth / 2, img.naturalHeight / 2);
  }
}
```
(Icon source art is generated at a fixed square resolution; the `/2` halves it to game-sprite scale — tune this divisor in Step 4 against how large the generated icons actually come out.)

- [ ] **Step 4: Visual verification + anchor tuning**

Render a preset with `rig.accessories = {hat:'hat_visor', weapon:'weapon_tablet'}` at `anim:'walk'`. Confirm: (a) both accessories appear, (b) they move with the walk-bob (not static while the body animates), (c) they're plausibly positioned (hat near the head, weapon near the hand) — adjust `anchorOffset` values in `catalog.json` (not code) until they read correctly. This is the step that corrects Task 1's placeholder anchor estimates.

- [ ] **Step 5: Commit**

```bash
git add public/pixel-people.js public/assets/accessories/catalog.json
git commit -m "Add accessory image-overlay layer to pixel-people.js, tune anchors"
```

---

### Task 4: Backend — cosmetics inventory + store endpoints

**Files:**
- Modify: `backend/lib/operatives.js` (add `inventory.cosmetics` default)
- Create: `backend/cosmetics-routes.js`
- Modify: `backend/server-production.js` (mount the new router)
- Test: `backend/test/cosmetics-routes.test.js` (match whatever test runner the repo already uses — check `backend/package.json`'s `test` script before writing; likely Jest per `npm run test:jest` seen earlier)

**Interfaces:**
- Consumes: `backend/lib/operatives.js` exports `{ create, get, all, listByOwner, update, remove, computeStats }` — `load`/`save` are NOT exported, use `get(id)`/`update(id, patch)` only. `update(id, patch)` does a **shallow** `Object.assign(op, patch, ...)` at the top level — passing `{ inventory: {...} }` REPLACES the whole `inventory` object, so a purchase must read the full current `inventory`, clone+extend it, and pass the complete object back, never a partial one.
- Consumes: `backend/billing-service.js` exports `getOrCreateCustomer(userId)` (→ `{creditsRemaining, ...}`), `debit(userId, amount, reason)` (→ `{ok, balance, shortfall}` — does **not** block on insufficient funds itself, clamps to 0; the caller must check `creditsRemaining >= amount` first). `enforceCredits`/`credit-meter.debitForAction` are the WRONG tool here — they charge a fixed cost for a small fixed set of `actionId`s (`image_generate`, `workflow_run`, etc.) from `credit-costs.json`; a catalog with a different price per item needs the lower-level `billing-service.js` primitives directly, not the actionId abstraction.
- Produces: `GET /api/cosmetics/catalog` → the accessory catalog JSON; `POST /api/cosmetics/purchase` → `{ success, operative }` or `{ success:false, error }`

- [ ] **Step 1: Add the inventory field default**

In `backend/lib/operatives.js`'s `create()` function (line 77), change:
```javascript
inventory: rec.inventory || { files: [], collectables: [] },
```
to:
```javascript
inventory: rec.inventory || { files: [], collectables: [], cosmetics: [] },
```
`update()` (line 91) does a shallow merge and needs no code change for this — Task 4's route handler is responsible for reading+cloning the full `inventory` object itself (see Step 4), not `update()`.

- [ ] **Step 2: Write the failing test**

```javascript
// backend/test/cosmetics-routes.test.js
const request = require('supertest'); // check this or an equivalent is already a devDependency first
const express = require('express');
const cosmeticsRoutes = require('../cosmetics-routes');

describe('cosmetics routes', () => {
  test('GET /catalog returns the accessory list', async () => {
    const app = express();
    app.use('/api/cosmetics', cosmeticsRoutes);
    const res = await request(app).get('/api/cosmetics/catalog');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.accessories)).toBe(true);
    expect(res.body.accessories.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 3: Run it, confirm it fails**

`npx jest backend/test/cosmetics-routes.test.js` (or the repo's actual jest invocation from `backend/package.json`) — expect a module-not-found error for `../cosmetics-routes`.

- [ ] **Step 4: Write `backend/cosmetics-routes.js`**

```javascript
const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();
const operatives = require('./lib/operatives');

const CATALOG_PATH = path.join(__dirname, '..', 'public', 'assets', 'accessories', 'catalog.json');
function loadCatalog() {
  try { return JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8')); }
  catch { return []; }
}

router.get('/catalog', (req, res) => {
  res.json({ accessories: loadCatalog() });
});

router.post('/purchase', async (req, res) => {
  const { operativeId, accessoryId } = req.body || {};
  if (!operativeId || !accessoryId) return res.status(400).json({ success: false, error: 'operativeId and accessoryId required' });
  const item = loadCatalog().find(a => a.id === accessoryId);
  if (!item) return res.status(404).json({ success: false, error: 'unknown accessory' });

  const op = operatives.get(operativeId);
  if (!op) return res.status(404).json({ success: false, error: 'unknown operative' });

  const inv = Object.assign({ files: [], collectables: [], cosmetics: [] }, op.inventory);
  inv.cosmetics = inv.cosmetics || [];
  if (inv.cosmetics.includes(accessoryId)) {
    return res.json({ success: true, operative: op, note: 'already owned' }); // idempotent
  }

  // Dynamic per-item price → billing-service's primitives directly, NOT enforceCredits/
  // credit-meter (those are fixed-actionId costs from credit-costs.json, wrong shape for
  // a catalog with a different price per item). The operative's `owner` field is the
  // billing userId, same key billing-service already uses everywhere else.
  const billing = require('./billing-service');
  const userId = op.owner || 'anon';
  const cust = billing.getCustomer(userId) || await billing.getOrCreateCustomer(userId);
  const balance = (cust && cust.creditsRemaining) || 0;
  const price = Number(item.sparksPrice) || 0;
  if (balance < price) {
    return res.status(402).json({ success: false, error: 'insufficient Sparks', needed: price, remaining: balance });
  }
  billing.debit(userId, price, `cosmetics:${accessoryId}`);

  inv.cosmetics.push(accessoryId);
  const updated = operatives.update(operativeId, { inventory: inv });
  res.json({ success: true, operative: updated });
});

module.exports = router;
```

- [ ] **Step 5: Run the test, confirm it passes**

- [ ] **Step 6: Mount the router**

In `backend/server-production.js`, find where other feature routers are mounted (e.g., `app.use('/api/...', someRoutes)`) and add:
```javascript
app.use('/api/cosmetics', require('./cosmetics-routes'));
```

- [ ] **Step 7: Write the purchase-flow tests**

Add to `cosmetics-routes.test.js`: insufficient-balance rejection, duplicate-purchase idempotency, successful purchase appears in `inventory.cosmetics`. These need a way to seed a test operative with a known Sparks balance — check how existing tests in `backend/test/` seed operative/economy state and follow the same pattern.

- [ ] **Step 8: Commit**

```bash
git add backend/lib/operatives.js backend/cosmetics-routes.js backend/server-production.js backend/test/cosmetics-routes.test.js
git commit -m "Add cosmetics store endpoints (catalog + Sparks-priced purchase)"
```

---

### Task 5: `pixel-forge.html` — Kit picker + accessory browser

**Files:**
- Modify: `public/pixel-forge.html`

**Interfaces:**
- Consumes: `GET /api/cosmetics/catalog`, `POST /api/cosmetics/purchase`, `PixelPeople.draw()`, the current operative's `inventory.cosmetics`
- Produces: UI for picking `rig.kit` and per-slot accessories, live preview

- [ ] **Step 1: Add the Kit picker row**

Following the exact pattern of the existing Office picker row (`buildOfficeRow()`/`refreshOfficeRow()`, added 2026-09-10 — read that code first), add a `KITS` array:
```javascript
const KITS = [
  { id: 'classic', label: 'Classic', available: true },
  { id: 'voxel',   label: 'Voxel',   available: true },
  { id: 'sentinel', label: 'Sentinel', available: false },
  { id: 'comic',    label: 'Comic',    available: false },
  { id: 'chibi',    label: 'Chibi',    available: false },
  { id: 'archivist', label: 'Archivist', available: false },
];
```
and a `buildKitRow()`/`refreshKitRow()` pair mirroring the office row's structure — unavailable kits render disabled with a "coming soon" label per the spec, not hidden.

- [ ] **Step 2: Add the accessory browser**

For each slot (`hat`, `weapon`, `pet`, `wings`, `mask`), fetch `/api/cosmetics/catalog`, filter to that slot, render a tile per item showing its icon (`<img src="/assets/accessories/{imageFile}">`), Sparks price, and either an Equip toggle (if `operative.inventory.cosmetics.includes(item.id)`) or a Buy button (if not).

- [ ] **Step 3: Wire the live preview**

The existing Forge preview canvas already calls `PixelPeople.draw()` for the current rig — extend the rig object passed to it with `{ kit: selectedKit, accessories: selectedAccessories }` so the preview updates immediately on any picker change, before any save/purchase round-trip.

- [ ] **Step 4: Wire the Buy button**

On click: `POST /api/cosmetics/purchase` with `{operativeId: current operative's id, accessoryId: item.id}`; on success, update local `inventory.cosmetics` and re-render that tile as owned/equippable; on failure (insufficient Sparks), show the error inline.

- [ ] **Step 5: Manual verification**

Load `pixel-forge.html` locally (static server, matching this session's earlier verification pattern), select Voxel kit + 2 accessories, confirm the preview updates live and matches Task 2/3's rendering. Buy one accessory, confirm the Sparks balance decreases and the tile flips to owned.

- [ ] **Step 6: Commit**

```bash
git add public/pixel-forge.html
git commit -m "Add Kit picker + accessory browser to the Forge UI"
```

---

### Task 6: End-to-end verification in the live 2D world

**Files:** none (verification only)

- [ ] **Step 1: Confirm a Voxel-kitted, accessorized character walks correctly in `game.html`**

However the Forge's saved rig reaches `game.html` today (read that wiring — likely via `operatives.js`'s `look` field or `shaddai.player`, per `pixel-people.js`'s own header comment), confirm a character saved with `kit:'voxel'` and equipped accessories renders and animates correctly there too, not just in the Forge's own preview canvas — this is the plan's actual acceptance bar per the spec's own Testing section.

- [ ] **Step 2: Confirm zero regression on existing (non-voxel) characters**

Load a few existing presets/operatives with no `kit` field and confirm they render pixel-identical to before this plan (Global Constraint's zero-migration requirement).

- [ ] **Step 3: Final review**

Run this plan's equivalent of a whole-branch review (per subagent-driven-development's final review step, if that skill is used for execution) covering all 5 preceding tasks together — the accessory-anchor-tracks-walk-bob requirement and the zero-migration requirement are the two things most likely to silently regress across files.
