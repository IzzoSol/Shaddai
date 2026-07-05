# 🧪 SHADDAI World — v94.44 Test Checklist

**Server:** `node backend/server-production.js` (PORT 8099) — running.
**Open from dashboard:** the dashboard "Enter Shaddai World" portal loads `/world` in-frame (same origin).

## Entry points
| What | URL |
|---|---|
| 🌍 3D World | http://localhost:8099/world |
| 🖥️ Dashboard | http://localhost:8099/ (or index.html) |
| ⚒️ Forge models (8 textured archetypes) | http://localhost:8099/forge-models-test.html |
| 🛒 Marketplace | http://localhost:8099/marketplace-shop.html |
| 🐍 Tron Snake | http://localhost:8099/tron-snake.html |

## ✅ Fixed / done in this pass
- **Sacred geometry layout** — Seed of Life: SHADDAI at center [0,0]; 6 agents on a perfect hexagon (R=260), mirror-symmetric across Z so they align in depth (front/side/back pairs). `public/world-layout.js`.
- **All 7 agent bodies textured + colored** (HF intricate portrait → Meshy image→3D, PBR) and **optimized −75%** (98→24.5MB total). Cache `v7`.
- **8 forge archetypes** textured + animated, **optimized −54%** (214→99MB). Forge **▣ 3D VIEW** button spins the selected base form.
- **Water** — single animated reflective plane auto-centered on the Arctic biome (removed orphan plane).
- **Walking** — world-edge clamp (no falling into the void); player/agents foot-aligned to terrain `heightAt`.
- **Backend↔dashboard** — `/world` opens in-frame; all `/api` routes 200 from both.
- **Dead `/world-*` routes** now redirect to `/world` (no 500s); **grid-runner portal** fixed.
- **AURA verified saving tokens** (`/api/aura/stats` hitRate ~0.78).

## In the 3D World — test these
- [ ] Loads with **no red error bar**, click → ENTER
- [ ] **Sky shifts color** between biomes (cyan grid → green forest → blue arctic → amber desert → violet void)
- [ ] **Squarescape floor + SH emblem** centered under the Source
- [ ] **7 agents** stand in front of their **buildings** — all **colored/textured**, none in a pole, on a clean hexagon
- [ ] **WASD** walk, **Shift** run; can't walk off the world edge
- [ ] **V** = 3rd-person → character walk/run faces forward
- [ ] Click an **agent** → dossier (HIRE / 🏛 ENTER)
- [ ] **NEXUS** directory → click a sector → teleport
- [ ] **QUILL/ORACLE** → Library panel (books; esoteric wing gated)
- [ ] **ZEROX** → live markets chart
- [ ] **Arctic** biome shows animated **water**; vehicles moving (ship, snow rover, jet)

## Forge (dashboard)
- [ ] Pick an archetype → **▣ 3D VIEW** spins the animated base form
- [ ] Equip skills/tools → **⬡ FORGE** → appears in gallery

## ⏳ In progress
- **Intricate inscribed building regen** (grand monumental architecture + Oracle observatory) running; will be optimized + cache-bumped (`v2`) when done.

## Backups
- `public/assets/**/_orig_backup/` (pre-optimization GLBs) · `_grey_backup`/`_basic_backup` (pre-regen) · `SHADDAI-WORLD-BUILD-BACKUP.zip`
