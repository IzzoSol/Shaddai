# The Descent Through Scale — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the cinematic scroll `journey.html` as a hybrid stacked-canvas experience (crisp generated art over WebGL2 shaders) where each beat morphs into the next and everything reacts to the mouse — fixing the muddiness at the architecture level.

**Architecture:** Two stacked full-viewport canvases inside `#stage` — a **WebGL2 `#gl`** layer (interactive shaders, ocean + molecules) *under* a **2D `#art`** layer (crisp generated bases + additive accents) — plus a `#ui` DOM layer (scroll spacer, a11y, progress). A shared eased `pointer` drives every layer. Scenes register on `window.__DESCENT.scenes` via an extended contract with an optional `gl` hook. Hard rule: **crisp art is never tinted; all overlays are additive-over-black.**

**Tech Stack:** Vanilla JS (no bundler, classic `<script>` tags), Canvas 2D + WebGL2 (GLSL ES 3.00), Node/Express backend, `fal-assets/generate.mjs` (FLUX + Seedance), headless puppeteer verification.

**Project reality (replaces TDD/git steps):** No git repo → "commit" steps are **backup + verify checkpoints**. No unit tests → "tests" are **headless puppeteer checks** (0 console errors, FPS sampling, screenshots). Back up any file before a destructive rewrite as `<file>.bak-descent-<timestamp>`. Owner views the deployed site; **nothing is pushed** without explicit ask.

**Reference:** approved spec at `fal-assets/DESCENT-DESIGN-SPEC.md`. Approved beat order:
`molecules → grass/trees → ocean → sun&moon → constellations/universes → esoteric finale → SH arrival`.

---

## File Structure (decomposition)

**Shell + core (new/rebuilt):**
- `public/journey.html` — REBUILT: `#gl`/`#art`/`#ui` stacked layers, boot + resize/DPR, load order, inline shell (render loop, active-set, morph weights, progress/UI). Keep it the single entry page.
- `public/js/descent/core-pointer.js` — NEW: shared eased `pointer` state (fast + slow ease, velocity, gaze, parallax helper).
- `public/js/descent/core-shell.js` — NEW: the render engine — active-set computation, `p` derivation, per-frame 2D draw orchestration, alpha discipline, FPS governor, layer cl/reset. (Extracted from inline so it's testable/focused.)
- `public/js/descent/core-gl.js` — NEW: WebGL2 context manager — one shared context, program/FBO helpers, `GL_OK` flag, context-loss/restore, per-scene `gl.init/dispose` lifecycle with hysteresis. (P1 = manager + lifecycle only; shaders arrive P2/P3.)
- `public/js/descent/core-assets.js` — NEW: image/video loader with palette-gradient placeholder fallback (never blank/throw) + a manifest-of-record mapping beat→asset paths.
- `public/js/descent/core-morph.js` — NEW (P3): morph engine — complementary alpha ramps + geometric seam masks.

**Scenes (rebuilt to the extended contract, one file each):**
- `public/js/descent/scene-molecules.js`, `scene-grass.js`, `scene-ocean.js`, `scene-sun-moon.js`, `scene-cosmos.js`, `scene-esoteric.js`, `scene-arrival.js`

**Shaders (P2/P3):**
- `public/js/descent/gl/ocean.glsl.js` — ocean vertex+fragment sources + JS wiring (ripple sim FBO, glint/bloom, refraction, Fresnel, `u_dive`).
- `public/js/descent/gl/molecules.glsl.js` — GPU particle field (transform-feedback).

**Assets + generation:**
- `fal-assets/manifests/descent-<beat>.json` — per-beat generation manifests (FLUX stills; Seedance later).
- `fal-assets/generate.mjs` — MODIFY (P4): add a `provider` adapter (fal default + seedancevideo.art).
- `public/assets/descent/<beat>/` — generated outputs.

**Verification:**
- `scripts/verify-descent.mjs` — headless harness: 0-error gate, per-scene/seam FPS, WebGL-absent run, asset-missing run, reduced-motion run, screenshots.

---

## PHASE 1 — Shell + hybrid layers + crisp art bases (no shaders, no video)
*Independently shippable: a complete crisp-art scroll journey that reads finished.*

### Task 1: Back up + scaffold the stacked-layer shell

**Files:**
- Backup then Modify: `public/journey.html`

- [ ] **Step 1: Back up the current shell**

Run:
```bash
cp "public/journey.html" "public/journey.html.bak-descent-$(date +%Y%m%d-%H%M%S)"
```
Expected: a `.bak-descent-*` copy exists.

- [ ] **Step 2: Replace the stage markup with three stacked layers**

In `public/journey.html` `<body>`, the stage becomes:
```html
<div id="stage">
  <canvas id="gl"  aria-hidden="true"></canvas>
  <canvas id="art" aria-hidden="true"></canvas>
</div>
<div id="ui">
  <div id="scroll"></div>            <!-- tall spacer drives scroll -->
  <div id="progress"><i></i></div>
  <div id="label" aria-live="polite"></div>
  <a id="enter" href="#" hidden>Enter World</a>
</div>
```
CSS: `#stage{position:fixed;inset:0;overflow:hidden;background:#06080b} #gl,#art{position:absolute;inset:0;width:100%;height:100%} #gl{z-index:1} #art{z-index:2} #ui{position:relative;z-index:3}` and `#scroll{height: calc(var(--beats,7) * 140vh)}` (pacing factor 1.4 like today).

- [ ] **Step 3: Boot + DPR-aware sizing for BOTH canvases**

Add an inline boot script that sizes each canvas to `innerWidth*dpr × innerHeight*dpr` (dpr clamped to a cap that the governor can lower), sets the 2D transform on `#art`, sets the GL viewport on `#gl`, and re-runs on resize. Store shared `env = {w,h,dpr,reduced,PAL,lowfx:false,q:1,glOk:false}`.

- [ ] **Step 4: Load order**

Before the scene scripts, load in order: `core-pointer.js`, `core-gl.js`, `core-assets.js`, `core-shell.js`, then `scene-*.js` (7), then an inline `boot()` that calls `Shell.start()`.

- [ ] **Step 5: Verify checkpoint (empty shell)**

Run: `node scripts/verify-descent.mjs --smoke` (created in Task 9; for now just load the page headless and assert 0 console errors + both canvases present).
Expected: page loads, 0 errors, `#gl` and `#art` sized > 0. Screenshot = solid obsidian.

---

### Task 2: Shared pointer state (`core-pointer.js`)

**Files:**
- Create: `public/js/descent/core-pointer.js`

- [ ] **Step 1: Implement the eased pointer**

```js
(function(){
  var P = { x:innerWidth/2, y:innerHeight/2, tx:innerWidth/2, ty:innerHeight/2,
    nx:0, ny:0, vx:0, vy:0, speed:0, gx:innerWidth/2, gy:innerHeight/2, down:false, active:false, _idle:0 };
  function onMove(x,y){ P.tx=x; P.ty=y; P.active=true; P._idle=0; }
  addEventListener('pointermove', function(e){ onMove(e.clientX,e.clientY); }, {passive:true});
  addEventListener('pointerdown', function(){ P.down=true; }, {passive:true});
  addEventListener('pointerup',   function(){ P.down=false; }, {passive:true});
  addEventListener('touchmove', function(e){ if(e.touches[0]) onMove(e.touches[0].clientX,e.touches[0].clientY); }, {passive:true});
  // dt-normalized update; call once per frame from the shell
  window.Pointer = {
    state: P,
    update: function(dt, reduced){
      var fe = 1-Math.pow(0.001, dt/1000);       // fast ease
      var se = 1-Math.pow(0.02,  dt/1000);       // slow ease (gaze)
      var px=P.x, py=P.y;
      P.x += (P.tx-P.x)*fe; P.y += (P.ty-P.y)*fe;
      P.vx = (P.x-px); P.vy = (P.y-py); P.speed = Math.hypot(P.vx,P.vy);
      P.gx += (P.x-P.gx)*se; P.gy += (P.y-P.gy)*se;
      P.nx = (P.x/innerWidth*2-1); P.ny = (P.y/innerHeight*2-1);
      P._idle += dt; if(P._idle>1500) P.active=false;
      if(reduced){ P.vx=P.vy=0; P.speed=0; }
    },
    parallax: function(d, max){ return { x: P.nx*max*d, y: P.ny*max*d }; }
  };
})();
```

- [ ] **Step 2: Verify checkpoint**

Headless: move the mouse via `page.mouse.move`, assert `window.Pointer.state.nx` changes and `speed>0`, then settles to `active=false` after idle. 0 errors.

---

### Task 3: Render shell + extended scene contract (`core-shell.js`)

**Files:**
- Create: `public/js/descent/core-shell.js`

- [ ] **Step 1: Implement the shell render loop**

Responsibilities: read scroll → `s∈[0,1]`; compute **active set** (≤3 scenes whose windows overlap `s`); derive `p={local,gt,alpha}` per active scene using eased complementary ramps (outgoing holds to ~0.6 then drops fast; incoming eases in late) so the midpoint is never both-at-0.5; run the FPS governor (EMA frame time → `env.q`, `env.lowfx`, DPR step-down); each frame: `Pointer.update(dt)`, clear `#art`, for each active scene call `scene.gl && Shell.gl.run(scene, p)` then `ctx.globalAlpha=p.alpha; scene.draw(ctx, env, p, Pointer.state, t)`; **reset `ctx.globalAlpha=1` and composite op after each scene** (named anti-muddy rule); update `#progress` + `#label`; show `#enter` when `s>0.985`.

- [ ] **Step 2: Define + document the extended contract**

At top of file, comment the contract exactly as in spec §1.3 (2D `draw` required; optional `gl:{init,resize,draw,dispose}`). Expose `window.Shell = { start, scenes:()=>window.__DESCENT.scenes, gl:<from core-gl>, env }`.

- [ ] **Step 3: Verify checkpoint**

Headless: with 1 stub scene registered, scroll 0→1 in 10 steps; assert `label` updates, `progress` width grows, 0 errors, alpha never leaks (add a dev assert: after each scene draw, `ctx.globalAlpha===1`).

---

### Task 4: WebGL2 context manager + lifecycle (`core-gl.js`)

**Files:**
- Create: `public/js/descent/core-gl.js`

- [ ] **Step 1: Implement the manager (no shaders yet)**

Create the shared WebGL2 context on `#gl` (`{alpha:true, premultipliedAlpha:false, antialias:false}`). If null → `env.glOk=false`, log once. Provide helpers: `compile(vs,fs)`, `makeFBO(w,h)`, `clear()`. Handle `webglcontextlost` (preventDefault, set `glOk=false`) and `webglcontextrestored` (re-init active scenes' `gl.init`). Lifecycle: `run(scene,p)` lazily calls `scene.gl.init(glenv)` when a scene enters the morph window and `scene.gl.dispose(glenv)` when it leaves (with ~1-scene hysteresis). Per frame clear the GL canvas to transparent; scenes with no `gl` contribute nothing.

- [ ] **Step 2: Verify checkpoint**

Headless: assert `env.glOk===true` on a WebGL2-capable browser; force `webglcontextlost` and assert `glOk` flips to false with 0 thrown errors. Also run once with `--disable-webgl`-style flag and assert `glOk===false` + page still renders.

---

### Task 5: Asset loader with placeholder fallback (`core-assets.js`)

**Files:**
- Create: `public/js/descent/core-assets.js`

- [ ] **Step 1: Implement the loader**

```js
window.Assets = (function(){
  var cache = {};
  function placeholder(){ /* returns a tiny canvas: obsidian→faint-emerald radial gradient */ }
  return {
    img: function(src){
      if(cache[src]) return cache[src];
      var rec = { el:new Image(), ok:false, ph:placeholder() };
      rec.el.onload = function(){ if(rec.el.naturalWidth>0) rec.ok=true; };
      rec.el.onerror = function(){ rec.ok=false; };   // keep placeholder, never throw
      rec.el.src = src; cache[src]=rec; return rec;
    },
    // draw helper: cover-fit a rec (or its placeholder) into (x,y,w,h) with ken-burns
    cover: function(ctx, rec, w, h, kb, drift){ /* Math.max(w/iw,h/ih)*kb; center + drift; if !ok draw ph */ }
  };
})();
```
Manifest-of-record: `Assets.base('ocean') → '/assets/descent/ocean/base-<seed>.webp'` (a small map object; scenes never hard-code raw paths).

- [ ] **Step 2: Verify checkpoint**

Headless: point one beat at a bad URL; assert `.ok===false`, the placeholder canvas renders (screenshot not blank), 0 errors.

---

### Task 6: Generate the crisp FLUX base plates (manifests → generate.mjs)

**Files:**
- Create: `fal-assets/manifests/descent-<beat>.json` (7 files)
- Use: `fal-assets/generate.mjs`

- [ ] **Step 1: Author 7 manifests from the spec's per-beat art direction**

Each entry: FLUX still, palette-locked prompt (obsidian/emerald/gold/cyan named), plate role (single or fg/mg/bg for parallax), `size`, negatives (`no text, no watermark, no muddy desaturation`), a fixed `seed`. Prompts come from TURTLE's per-beat direction in the spec (§Part I beats). For ocean, also a **`below/fish` plate** and match lighting direction to a documented sun vector.

- [ ] **Step 2: Dry-run every manifest (no spend)**

Run: `node fal-assets/generate.mjs descent-ocean` (repeat per beat)
Expected: prints the built request + est. cost, `DRY-RUN COMPLETE`, 0 fail.

- [ ] **Step 3: Generate (spend gate — requires owner "go")**

Run (only after owner confirms): `node fal-assets/generate.mjs descent-ocean --go` per beat.
Expected: `✔ … → public/assets/descent/<beat>/…`, verify each file decodes + dimensions correct.

- [ ] **Step 4: Verify checkpoint**

Headless: assert every referenced base returns 200 + decodes; visually eyeball each plate is crisp + on-palette (not muddy). If a plate misses, regenerate by seed with a tightened prompt.

---

### Task 7: Rebuild the 7 scenes as crisp-art 2D (parallax + additive accents)
*Parallelizable: one agent per scene file. Each scene = crisp base (Assets.cover) + light additive accents + its beat's camera via `p.local`. NO shader yet (ocean/molecules use their 2D form here). NEVER tint the base.*

**Files (per scene):** Create/rebuild `public/js/descent/scene-<beat>.js`

- [ ] **Step 1 (per scene): Implement the 2D scene**

Contract: `init` requests its base via `Assets.img`; `draw` first `Assets.cover(ctx, base, w, h, kb(p.local), Pointer.parallax(0.15, PAR))` (crisp base, gentle ken-burns + background parallax), then draws **additive-only** accents (`ctx.globalCompositeOperation='lighter'`) — particles/glyph-bokeh/geometry lines in the four palette colors, parallaxed by depth — then resets composite op. Camera per beat from spec (dolly/crane/dive/orbit via scaling+translating the base + accents). Respect `env.lowfx` (fewer accents). Molecule + ocean scenes implement their **2D fallback** here (ocean = base + additive ripple sprite at pointer + caustic sprites + glints; molecules = ~3k additive dots pulled toward pointer).

- [ ] **Step 2 (per scene): Verify checkpoint**

Headless: force-render the scene at `p.local` 0/0.5/1; assert 0 errors, base visible + crisp (screenshot), accents additive (no grey slab). Microbench draw cost < budget.

---

### Task 8: UI, progress, a11y, reduced-motion

**Files:** Modify `public/journey.html` (inline UI script) + `core-shell.js`

- [ ] **Step 1:** Wire `#progress i` width to `s`; `#label` to the active scene's `label`; `#enter` becomes visible + focusable at journey end and links to `/SHADDAI-WORLD-3D.html` (placeholder until the P4 portal). Honor `prefers-reduced-motion` → set `env.reduced`, damp velocity effects, disable auto-drift, simplify seams to quick fades.
- [ ] **Step 2: Verify checkpoint** — headless with `reduced-motion` emulated: assert drift off, still scrolls clean, `#enter` reachable, 0 errors.

---

### Task 9: Headless verification harness (`scripts/verify-descent.mjs`)

**Files:** Create `scripts/verify-descent.mjs`

- [ ] **Step 1: Implement the gates** — (a) 0-console-error across a scripted 0→1 scroll; (b) per-scene + per-seam FPS/draw-cost microbench at high `q` and `lowfx`; (c) WebGL-absent run (glOk=false, fallbacks render); (d) asset-missing run (placeholder, journey completes); (e) reduced-motion run; screenshots at each scene core + seam midpoint. Print a report ending with the honest caveat: *headless green ≠ validated motion/feel — needs a real GPU browser.*
- [ ] **Step 2: Run the full harness** — `node scripts/verify-descent.mjs` → all gates green.

### ✅ Phase 1 Ship Checkpoint
Full scroll, 0 errors, budget met hi+lo, every beat reads as a finished crisp still with additive accents + mouse parallax; WebGL-absent + asset-missing + reduced-motion all pass. This is a complete, shippable experience with no shaders or video. **Owner visual review on a real browser.**

---

## PHASE 2 — Ocean shader (task map; expanded at phase start)
*Depends on: P1 shell + `core-gl` + ocean base/fish plates.*
1. `gl/ocean.glsl.js`: ripple-sim FBO ping-pong (~256²), pointer impulse injection, height→normal.
2. Surface pass: scrolling noise normals (idle swell) + sun-glint specular + threshold bloom (separable blur) + refraction sampling the fish plate via normals + Fresnel reflect↔refract.
3. `u_dive` (from `p.local`) lowers camera through the surface → deep; cross-fade horizon art out, fish/deep hero in.
4. Wire `scene-ocean.gl = {init,resize,draw,dispose}`; keep the P1 2D ocean as certified fallback.
5. Verify: ripples propagate from pointer, dive works, WebGL-absent gate still green; **human GPU feel review**.

## PHASE 3 — Morph engine + esoteric overlay + molecule shader (task map)
*Depends on: P1 + P2.*
1. `core-morph.js`: complementary eased alpha ramps + per-seam geometric masks (iris, horizon wipe, radial zoom-through for the fractal beat, caustic dissolve) + connective-layer pattern. Shell calls it for active-set compositing.
2. `gl/molecules.glsl.js`: transform-feedback particle field, curl-noise drift + cursor attraction/orbit, additive bloomable points; N scales with `env.q`; 2D fallback stays.
3. Esoteric overlay system (spec Part I §3): Channel A chakra-ignition (per-beat bokeh bloom), Channel B Metatron seam-flash, Channel C monotonic glyph-rain — all additive, shell-driven across all scenes.
4. Verify: seam screenshots show one clear hero + clean additive overlays (no grey soup); molecule field reacts; overlay accumulates without muddying any base.

## PHASE 4 — Seedance video + SH 3D portal (task map)
*Depends on: P1–P3 + seedancevideo.art API confirmation.*
1. `generate.mjs`: add a `provider` field + adapter — default `fal` (unchanged) + `seedancevideo.art` (base URL + `Authorization` header for the `sk-…` key + its request/poll shape). **Identity/whoami probe first; no `--go` until the probe confirms auth + response shape.** Store key in `.env` (never printed/committed).
2. Generate moving beats where a static plate reads dead (fractal zoom-through, ambient loops) + poster fallbacks (reduced-motion + load-fail).
3. Wire video textures via the existing `video-tex.js` pattern into the relevant scenes' bases.
4. SH 3D portal: a Three.js emblem (brushed-metal + emerald-neon-wire) that splits along its gold seam and irises open (spec Part I §4), transitioning into the 3D/pixel world; 2D fallback for no-WebGL.
5. Verify: video loads with posters, portal lands, all Phase-1 §7 gates still green, spend audited via dry-run logs.

---

## Self-Review Notes
- **Spec coverage:** architecture (T1–T5), morph engine (P3.1), pointer model (T2), shaders (P2, P3.2), asset+prompt pipeline (T6, P4.1), performance/fallbacks (T4/T5/T8 + governor in T3), verification (T9), phased order (P1–P4), esoteric overlay (P3.3), SH portal (P4.4). ✔ all mapped.
- **Placeholders:** none in Phase 1 (full code/paths/verify given). Phases 2–4 are deliberately task-maps, not fake bite-sized steps, because their concrete steps depend on P1 artifacts + generated assets + the API probe — they are expanded at each phase's start (honest, not a placeholder-dump).
- **Naming consistency:** `env.glOk` (not `GL_OK` global — corrected to live on `env`); `Pointer.state`, `Assets.img/cover/base`, `Shell.start`, scene `gl:{init,resize,draw,dispose}` used consistently across tasks.
