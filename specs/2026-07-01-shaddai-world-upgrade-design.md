# SHADDAI World — Upgrade Spec (2026-07-01)

**Owner terminal:** the one that owns the 3D world (`public/SHADDAI-WORLD-3D.html`, `public/world-*.js`).
**Do NOT touch:** `public/index.html` (owned by the other terminal), backend billing/dashboard.
**Master (working) dir:** `Desktop\SHADDAI MASTER FINAL BUILD`  ·  **Backup:** `OneDrive\...\SHADDAI-MASTER-BACKUP-20260630`.

---

## 1. Goal

Turn SHADDAI World into a **Tron-like simulation** with:

- Solid, correctly-seated, detailed buildings (no floating temple/bazaar, no glowing blobs).
- Photoreal + stylized ground textures.
- A **GTA-style sky-dive spawn** with a **spawn portal in every area** (start inside the SHADDAI temple).
- A **one-button hybrid theme engine** — a single press morphs the WHOLE world (Tron / Snow / Desert / Ocean, extensible), while each agent zone keeps its accent color.
- Everything placed by **exact sacred geometry** (degrees + radii), not by hand.
- Remove the ambient flying ship / jet / cars.
- New themes/terrains are **drop-in data objects** so the world grows as SHADDAI grows.

## 2. Non-goals (YAGNI)

- No engine migration (stays browser Three.js — Godot/Unity MCPs are out of scope; wrong engine).
- No multiplayer, no new gameplay systems, no dashboard/billing changes.
- No World Labs Gaussian-splat integration in this pass (kept for future Marble portal world).

---

## 3. Current architecture (as-found)

Single page `public/SHADDAI-WORLD-3D.html` loads classic scripts, then a `<script type="module">`:

- `world-layout.js` — **single source of truth**. Seed-of-Life: SHADDAI at `[0,0]`, 6 agents on a regular hexagon R=260 at 30/90/150/210/270/330° (mirrored across Z). Exposes `WORLD_LAYOUT` with `biomes`, `sectors`, `roads`, `spawn`, `biomeAt`, `sector`.
- `world-terrain.js` — one merged 820×820 procedural ground; `heightAt(x,z)`; procedural detail + normal maps; exposes `window.WORLD_HEIGHT_AT`.
- `world-biomes.js` — props/water/atmosphere per biome; `update(t)`.
- `world-vehicles.js` — **ambient** flying ship + jet + snow rover (TO BE REMOVED).
- `world-buildings.js` — loads per-sector GLBs from `/assets/buildings/*.glb`, seats via bounding box, adds ground ring + name label; falls back to a box.
- `world-rideables.js` — player-boardable Slipstream/Rover (press G). Grid bike is inline in the HTML.
- `world-npcs.js`, `world-markets-screen.js` — NPCs + market screen (leave as-is).

**Problems confirmed:**
1. **Triple ground** — `world-terrain.js` ground + an inline flat `ground` plane (HTML ~L319-327) + two `GridHelper`s (`g1`,`g2`) + a `squarescape.glb` floor all coexist → z-fighting / muddy look.
2. **Half-built theme switch** — the ⚙ panel calls `applyTerrain(k)` (HTML ~L262-282). It only changes bg/fog/lights and toggles the inline `ground`; it does NOT drive the real terrain, props, or buildings. This is the seed for the theme engine.
3. **Ambient vehicles** circle on their own = the "flying thing + cars" to remove.
4. **Floating buildings** — `placeGLB` seats by `gy(x,z) - b2.min.y` but off-pivot models (source-spire, bazaar) still lift; bazaar is hand-placed at `[0,60]` off the geometry.
5. **Over-glow** — building emissive + `UnrealBloomPass` make structures read as glowing blobs.

**Image/texture pipeline available:** `backend/lib/hf-keys.js` `generate(prompt)` (4-token HF pool, auto-rotate) served at `/api/forge/art/*`; also fal.ai, Meshy, World Labs. Keys live server-side in `backend/data/runtime-keys.json` (gitignored) — **never inline keys in client code or this repo.**

---

## 4. Workstreams

Build order (locked): **A → E → B → F → C → D.**

### A · Cleanup foundation  (owner: NEXUS)
**Files:** `SHADDAI-WORLD-3D.html`
- Remove `world-vehicles.js` `<script>` include + the `buildWorldVehicles` call + `worldVehicles` refs in `animate()`.
- Remove the two ambient `load('slipstream-voyager.glb')` / `load('arctic-voyager.glb')` lines.
- Keep: `world-rideables.js` (player G-board) and the inline Tron grid-bike.
- Ground consolidation: `world-terrain.js` is the ONLY real walkable ground. The inline `ground` plane, `g1`/`g2` grids, and `squarescape.glb` become **theme-owned overlays** — created but hidden, shown only when a theme requests them. No two ground surfaces visible at once.
**Accept:** no auto-moving vehicles anywhere; exactly one visible ground surface at any time; no console errors; FPS unchanged.

### E · Sacred geometry constants  (owner: ORACLE → applied by NEXUS)
**Files:** `world-layout.js` (extend; keep back-compat).
- Add `spawnPortals`: 7 entries — `SHADDAI` at `[0,0]`, 6 agents at exact hexagon vertices (reuse existing `vtx(deg)`), each `{ code, pos, color }`.
- Add `rings` usage: plaza concentric rings at exact radii `[60,130,200,260]` (already in `sacred.rings`).
- Snap the **bazaar** to a named position on the geometry (e.g. front-center ring point at `[0, 130]` on ring R=130, or a dedicated `landmarks` entry) — no more `[0,60]` magic number.
- Add `landmarks` array for non-agent structures (bazaar, emblem) with exact coords so every module reads one source.
**Accept:** all portal/bazaar/emblem coords come from `WORLD_LAYOUT`; no hand-typed positions remain in `world-buildings.js` or the HTML for these.

### B · Buildings  (owner: TURTLE visuals + NEXUS seating)
**Files:** `world-buildings.js` (+ optional new concept art via pipeline).
- **Seat flush:** recenter each GLB on its own bounding box in X AND Z (not only Y), then set `y = heightAt(x,z) - box.min.y`. Verify per model (source-spire, bazaar are the known offenders). No building hovers.
- **Kill blob-glow:** cap building material `emissiveIntensity` (≤0.15) and raise `UnrealBloomPass` threshold (in HTML) so only thin trim blooms, not whole facades. Buildings read as solid architecture.
- **Detail + accent:** add a thin emissive trim ring + a colored uplight per building keyed to `sector.color`; keep the pulsing ground ring + roof-anchored name label.
- Bazaar uses the geometry position from E.
**Accept:** every building sits on the ground; facades are solid with glowing trim only; each has its accent color; labels sit on real roofs.

### F · Ground textures  (owner: ORACLE source + NEXUS wire)
**Files:** `world-terrain.js` (material hookup), `public/assets/textures/<name>/`, theme data (D).
- **Photoreal:** download Poly Haven CC0 PBR sets (grass, snow, sand, rock) → `/assets/textures/`; wire albedo + normal + roughness (+ optional displacement) into the terrain material, selected by theme.
- **Tron/neon floor:** generate via the HF FLUX pipeline (`/api/forge/art/*` or a new script following `generate-ui-art.js`), stored once under `/assets/textures/tron/`.
- Textures are declared per-theme (see D) so switching themes swaps the ground material maps.
**Accept:** each theme shows its correct high-res ground; textures tile without visible seams; load is lazy (no first-paint stall).

### C · Spawn system  (owner: TURTLE visuals + NEXUS logic)
**Files:** new `world-spawn.js`; HTML wiring (intro + `playerPos`).
- On ENTER: camera starts high (~y=380) looking down (sky-dive framing).
- **Portal picker overlay:** lists the 7 spawn portals (Source + 6 agents) from `WORLD_LAYOUT.spawnPortals`; default highlighted = SHADDAI temple.
- On pick: 2s eased descent from sky to the chosen portal, then hand off to `PointerLockControls` and set `playerPos` to that portal (inside the SHADDAI temple for the default).
- Render a portal marker in-world at each portal: glowing vertical ring + soft light column at exact sector coords; portals are re-usable teleport targets later.
**Accept:** ENTER → sky view → pick → smooth descend → control handoff with player standing in the chosen area; default lands inside the SHADDAI temple; no fall-through-floor.

### D · Hybrid theme engine  (owner: TURTLE look + NEXUS engine)
**Files:** new `world-themes.js`; HTML absorbs `applyTerrain`; reads from terrain/biomes/lights.
- Export `THEMES` = pure data objects, one per theme:
  ```
  THEMES.tron   = { sky:{top,mid,horizon,glow}, fog:{color,density}, lights:{key,gold,sun},
                    ground:{ type:'tron', maps:{...}|null, color }, grids:true, particles:'grid', accent:true }
  THEMES.snow   = { ..., ground:{ type:'pbr', dir:'/assets/textures/snow' }, water:true }
  THEMES.desert = { ..., ground:{ type:'pbr', dir:'/assets/textures/sand' } }
  THEMES.ocean  = { ..., ground:{ type:'pbr', dir:'/assets/textures/water' }, water:true }
  ```
- `applyTheme(name)` drives EVERY subsystem in one call: sky uniforms, fog, light colors/intensities, terrain material maps + tint, grid visibility, biome prop tints, particle preset. **Whole-world snap.**
- **Hybrid:** after the global theme applies, each agent zone re-applies its `sector.color` accent (trim/uplight/aura) so zones keep identity.
- **Extensible:** adding a theme = adding one object to `THEMES` + (optionally) one texture folder. No engine edits. This is how "themes grow as SHADDAI grows."
- Persist choice to `localStorage` + `?theme=` query (like the current `applyTerrain`).
**Accept:** one button/press changes the entire world look instantly and coherently; ≥4 themes; adding a 5th needs only a data object; agent accents survive the swap; choice persists on reload.

---

## 5. Coordination & isolation

- Each agent works on its **own new/owned file** (`world-themes.js`, `world-spawn.js`, `world-layout.js` additions, `/assets/textures/`) — conflict-free, parallel-safe.
- The **shared `SHADDAI-WORLD-3D.html` is edited by the lead terminal only** (wires each finished module in). Agents propose HTML changes as diffs/snippets, they do not write the HTML directly.
- Back up before risky edits: `SHADDAI-WORLD-3D.html.bak-YYYYMMDD-HHMMSS`.

## 6. Audit gate (before merge)  (PIKADON + SHADDAI)

Each returned module is checked against this list before it lands:
- [ ] Correct file(s) only; no edits to `index.html` or backend billing.
- [ ] All positions read from `WORLD_LAYOUT` (no magic coords).
- [ ] No secrets in client code; textures served from `/assets` or `/api/forge/art/*`.
- [ ] No per-frame allocations in `update()`; instancing used for repeated props.
- [ ] No regressions: world boots, no console errors, FPS ≈ baseline.
- [ ] Dead code removed (old `applyTerrain`, vehicle refs, duplicate grounds).
- [ ] Buildings seated; one ground; theme swap coherent; spawn handoff clean.
Then **SHADDAI** gives go/no-go → **polish pass** (bloom threshold, color balance, portal feel, texture tiling).

## 7. Acceptance (whole feature)

1. No ambient vehicles; one ground surface; no floating buildings.
2. Buildings = solid + accent + trim-glow, labels on roofs.
3. Sky-dive spawn with per-area portals; default inside SHADDAI temple.
4. One-button whole-world theme swap, ≥4 themes, hybrid accents, persisted.
5. Everything on exact sacred-geometry coords from `WORLD_LAYOUT`.
6. Photoreal + Tron ground textures per theme.
7. Boots clean, FPS ≈ baseline, no console errors.

## 8. File change map

| File | Change | Workstream |
|---|---|---|
| `public/world-layout.js` | + spawnPortals, landmarks, bazaar coords | E |
| `public/world-vehicles.js` | removed from load | A |
| `public/SHADDAI-WORLD-3D.html` | remove vehicles/voyagers; consolidate ground; wire spawn+themes; bloom tune | A,B,C,D |
| `public/world-buildings.js` | flush seating, accent+trim, less glow, bazaar from layout | B |
| `public/world-terrain.js` | PBR texture hookup per theme | F |
| `public/world-themes.js` | NEW — THEMES data + applyTheme() | D |
| `public/world-spawn.js` | NEW — sky-dive + portal picker + portal markers | C |
| `public/assets/textures/*` | NEW — Poly Haven CC0 + FLUX Tron | F |
