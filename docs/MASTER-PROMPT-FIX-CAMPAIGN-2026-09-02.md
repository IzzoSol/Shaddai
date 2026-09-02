# MASTER PROMPT — FIX CAMPAIGN 2026-09-02 (Canonical)

**Purpose:** One precise prompt per task so nothing is lost and each fix is verifiable.
**Rule:** Edit → verify (read-back + `node --check`) → commit → push to `origin/main` (auto Render deploy). Hard-refresh (`Ctrl+F5`) to confirm on live site.
**Owner:** SHADDAI (orchestrator). Review by PIKADON before deploy.

---

## TASK 1 — Real Router on Landing Page (FIX THE BROKEN CSS)
**Status:** WIP
**Problem:** `public/enter.html` ~line 795 opens `.ver{ margin-left:2px;` and NEVER closes it. The entire `#tryit` CSS (real router styles) is fused inside that unclosed rule → `.ver` is garbage and `#tryit` has zero working styles → the "Ask for something. See who takes it." widget renders raw/broken.
**Requirements:**
- Split into two valid rules: `.ver{ ... }` (Build stamp, keep green pill) and `#tryit{ ... }` + all `#tryit .*` rules (real router styles).
- The real router widget must render styled on `/enter` (or the served landing page): heading, input, **Route it** button, 5 example chips, live result block via `/api/route`.
- The old mock text ("council decided after 6 rounds ", "writing", "spirituality", "→ matched", "try it"/"route it" chips) must be GONE from the page markup.
- Remove leftover `.routex` CSS if any remains.
**Verify:** `Select-String public\enter.html -Pattern 'after 6 rounds'` → 0. `routex` → 0. All `<script>` blocks pass `node --check`. `.ver` rule has its `}` before `#tryit{`.

## TASK 2 — Module Buttons / Layout Selector Never Blocked
**Status:** WIP
**Problem:** `.viewctl` (line ~754) is `position:relative` with no z-index/stacking context. Wheel/orb grid slots use `transform` + grid uses `animation` → they paint OVER the `.viewmenu` dropdown (hidden behind modules).
**Requirements:**
- `.viewctl{ position:relative; z-index:9998; isolation:isolate; }` so the layout dropdown always renders above the grid.
- `.controls` stays `position:fixed; top:0; left:0; right:0; z-index:99999 !important;` (verified correct already).
- `.ctl` stays `z-index:9999 !important; position:relative;` (verified correct already).
**Verify:** Open layout dropdown over wheel/orb → visible & clickable.

## TASK 3 — Fully Fix Wheel & Orb Layouts (kill off-tilt)
**Status:** WIP
**Problem:** Wheel `rimRoll` keyframes rotate the ENTIRE grid `rotateX(±8deg) rotateZ(±3deg)`; slots get per-slot `rotateX(4–7deg)` → whole wheel leans sideways = "off tilt". Orb slots get arbitrary `translateZ/scale` with no rotation → flat grid with front rows scaled up = janky.
**Requirements (recommended: fully flat & stable):**
- Wheel: grid = 2-col upright grid. Remove `rimRoll` animation, remove `preserve-3d`, remove per-slot `rotateX`. Slots: `transform:none`, soft ground shadow, hover = `translateY(-8px)` + glow. Keep 1-col fallback ≤640px.
- Orb: flat upright grid, `transform:none` on slots, remove `translateZ/scale` jitter, hover lift only. Keep 1-col fallback ≤720px.
- No leftover `z-index:100` on `.ctl` anywhere.
**Verify:** Switch Wheel then Orb on live page → every module upright, readable, edges square, no lean. `Select-String -Pattern 'rimRoll|transform:none !important'`.

## TASK 4 — MCP Button with Image + Page (all entry surfaces)
**Status:** WIP
**Problem:** `mcp.html` page EXISTS (24KB, complete). `enter.html` `btnMcp` is text-only (no image). Dashboard `index.html` #topBar and `simple.html` nav have NO MCP button.
**Requirements:**
- `enter.html` `btnMcp`: put `<img class="mcpico" src="/assets/nav/apis.jpg">` inside the button next to "MCP". CSS `.ctl .mcpico{ width:16px; height:16px; border-radius:3px; object-fit:cover; border:1px solid emerald; }`.
- Add MCP button/icon to dashboard `#topBar` → `/mcp.html`.
- Add MCP button to `simple.html` header tools/nav → `/mcp.html`.
**Verify:** All 3 pages show an MCP button with small APIS image; clicks land on `/mcp.html`.

## TASK 5 — Simple Mode → RAG Brain 3D (NOT both)
**Status:** TO INVESTIGATE & FIX
**Problem:** "Simple mode should lead to the rag brain 3D and simple — not both."
**Requirement:** Trace the SIMPLE entry (landing `simplebtn`, module `id:'simple'` → `/simple.html`) and the RAG brain (3D) entry. Make Simple Mode route to ONE destination (RAG brain 3D view) instead of linking to both brain and simple. Confirm intended target with SHADDAI before finalizing.

## TASK 6 — Massively Upgrade the 2D & 3D Buttons
**Status:** PENDING
**Targets:** The "2D REALM" (`id:'world2d'` → SHADDAI-WORLD.html) and "3D REALM" (`id:'world3d'` → /world3d, locked) module tiles — OR the RAG brain "3D BRAIN"/"CLASSIC BRAIN" toggles in brain.html — confirm with SHADDAI.
**Requirements:** Polished + complete. Neon edges (`box-shadow` glow, `border-color` accent), in-depth shading (gradient bevel/inset shadows, ambient tint), consistent hover/focus/touched states, disabled/locked state for 3D if gated.
**Verify:** Visual read on live page; hover states animate; neon edges visible in dark theme.

## TASK 7 — RAG Brain Models, Textures & "Grids Poking Out of Heads"
**Status:** PENDING
**Targets:** `rag-cockpit.html` (Neural Cockpit), `brain.html` (3D BRAIN / CLASSIC BRAIN), `brain-head.html`. Head GLBs in `public/assets/council/*-head.glb` (+ SKULL fallback).
**Problem:** Models/textures look wrong; extra "grids" geometry pokes out of the character heads.
**Requirements:**
- Inspect GLB loader in rag-cockpit `assets/council/${agentId}-head.glb` + fallback logic.
- Identify geometry/mesh/material causing the protruding grid (likely stray wireframe meshes or untextured clay tint pass). Remove/hide stray geometry; apply correct color/emissive per agent.
- Heads must read as the 7 agents, no stray wireframe grids.
- TASK 8 (knowledge base/corpus) is DELIBERATELY LAST — do not touch RAG corpus ingestion yet.

## TASK 8 — Image-Bug Audit All Pages (deferred/as-you-go)
**Status:** ONGOING
**Requirement:** While touching any page, check all `<img>`/CSS `background-image`/art refs resolve to real files. Fix broken refs. No dead images.

## TASK 9 — Page Load Pass
**Status:** ONGOING
**Requirement:** Every page touched must be served without JS errors. Validate inline/external JS with `node --check` after each edit.

## TASK 10 — Knowledgebase / RAG Corpus (LAST, by design)
**Status:** DEFERRED — explicitly LAST. Do not begin until Tasks 1–7 verified live.

---

## DEPLOY LOOP (after each task)
```
git add <files>; git commit -m "task: <what>"; git push origin main
```
Render auto-deploys every push. User hard-refreshes `Ctrl+F5`.

## CURRENT GROUND-TRUTH TO NOT BREAK
- 7 agents: SHADDAI, ZEROX, ORACLE, NEXUS, TURTLE, QUILL, PIKADON (only these).
- Forge worlds + 2D/3D doors gated with code `4444`.
- `.ctl` z-index 9999 !important, `.controls` 99999 !important.
- `mcp.html`, `brain.html`, `rag-cockpit.html`, `simple.html`, `home.html` (real router source) exist.
- `/api/route` lives in `brain-server.js:361`, mounted at `/api` in `server-production.js:1615`.
- Real router widget source of truth: `public/home.html` `#tryit` block (+ its CSS + JS).