# Brain 3D Disintegration + Knowledge Graph View

**Date:** 2026-08-23
**Status:** Draft for review
**Scope:** `public/brain.html` only — not the 3D world, not any other dashboard tab.

## Context

Following the "The Seven Orbs" visual-concept proposal (Canvas-2D-only states: idle orb, HUD-dissect overlay, chunk-burst, sacred-geometry backdrop), the owner asked for something bigger for the agent-reveal moment specifically: a real 3D agent body that shatters into glowing knowledge-shard particles on click, each shard addressable to a digest/chunk. They also want a literal, navigable knowledge-graph view of the RAG brain's topics/digests/routes — Obsidian's own graph view as the reference point, not the app's visual theme. Both are explicitly scoped to `brain.html` only.

This upgrades the previous Canvas-2D-only proposal's "Reveal" state (and adds an entirely new view) from a lightweight overlay into a real three.js render pipeline.

## What's reusable vs. what's new

- **three.js**: not an npm dependency anywhere in the project — loaded via CDN `<script type="importmap">` in the two existing 3D pages, but with **version drift** (`SHADDAI-WORLD-3D.html` pins `0.180.0`, `agents.html` pins `0.160.0`). This build pins its own version independently (`0.180.0`, matching the newer file) rather than trying to unify the whole project's three.js version — that unification is out of scope here.
- **Agent GLB bodies**: all 7 agents + a villain body already exist at `public/assets/agents/<AGENT>.glb`. Two existing loading patterns disagree on Draco compression (`SHADDAI-WORLD-3D.html` assumes Draco-compressed GLBs and loads a `DRACOLoader`; `agents.html` loads the same-named files with a plain `GLTFLoader`, no Draco). Before wiring the loader, this build verifies which pattern actually matches these specific files (checking for a `KHR_draco_mesh_compression` extension in one GLB's JSON header) rather than guessing — see Task 1 of the eventual implementation plan.
- **Perf-tier governor ("POTATO" tier system)**: exists only inside `SHADDAI-WORLD-3D.html` (~lines 3828-3914) as an FPS-EMA-driven 5-tier quality governor (POTATO/LOW/MEDIUM/HIGH/ULTRA) with asymmetric hysteresis (fast drop, slow recover). It is **not a standalone module** — it's wired directly to that file's own renderer/composer/bloom/sprite globals. `brain.html` needs its own copy of the governor logic (the EMA/tier-threshold algorithm), re-wired to whatever renderer/particle-system objects this build actually creates — porting the *algorithm*, not importing a file.
- **Knowledge-graph visualization**: nothing reusable exists in-repo (no d3, force-graph, vis-network, or cytoscape dependency; the one existing "graph-like" page, `wallet-network-viz.html`, hand-rolls a force-directed layout on legacy three.js r128 and isn't a library). This build adds a graph layout from scratch or via a fresh CDN dependency (candidate: `d3-force` for pure physics, rendered through the same three.js scene rather than SVG, so it shares the render loop and perf governor with the disintegration effect).

## Decision

Two new capabilities, both gated behind the perf governor from day one (not bolted on after):

### 1. Agent disintegration effect
- Idle state: the agent's existing GLB, subtle idle animation (reuse whatever idle clip already exists in the GLB per `SHADDAI_AGENT_MODEL_MAP.md`-era rigging — no new animation authored).
- On click: the body's mesh is sampled into a point cloud (surface-sampled positions, not literally exploding the existing mesh geometry), each point promoted to a `THREE.Points` particle that flies outward with per-particle velocity/rotation, fading in behind a bloom pass. This is a shader/particle effect over the *existing* GLB, not a new asset.
- Each particle batch is tagged to the agent's actual digests/chunks (from the already-ingested `kb_<agent>` store — see the sibling ingestion plan) so a subset of shards can be highlighted/labeled with real digest titles on hover, not decorative-only.
- Camera does a push-in during the disintegration (a few hundred ms, not a long cutscene) — this is the "orchestrated moment," per the design skill's guidance to spend boldness in one place rather than animating everything.

### 2. Knowledge-graph view
- A second view/mode within `brain.html` (not a new page) — nodes are topics/digests/routes from the already-ingested corpus, edges are shared topic tags or a route's cited digests. Force-directed layout (physics via `d3-force` or an equivalent minimal library), rendered as three.js points/lines so it shares the same scene, camera, and perf governor as the disintegration effect rather than being a separate SVG overlay.
- Clicking a node opens the same detail panel the 2D particle-swarm view already uses — this reuses existing UI, not a new panel.

### 3. Perf governor (ported, not shared)
- Port the POTATO-tier algorithm (EMA FPS smoothing, asymmetric hysteresis thresholds) as a small standalone function in a new file, `public/js/perf-governor.js`, parameterized by callbacks (`onTierChange(tier)`) instead of hardcoded globals — this is the one piece of `SHADDAI-WORLD-3D.html`'s tangled implementation worth actually extracting into a reusable module, since both `brain.html` and any future 3D page benefit from a callback-based version instead of each hand-rolling their own.
- Both the disintegration effect and the graph view register with the same governor instance so a low-FPS moment (e.g. a huge digest count in the graph view) degrades both proportionally.

## Testing
- Verify the actual GLB Draco status (Task 1) before writing loader code — this determines whether `DRACOLoader` is needed at all.
- Dry-run the particle-sampling/disintegration effect on one agent's GLB first, confirm frame time stays acceptable at MEDIUM tier on a representative machine before wiring all 7.
- Graph view: dry-run with one agent's topic/digest count first (smallest: PIKADON per earlier corpus sizing), confirm layout settles and stays interactive before wiring the full 7-agent graph.
- Perf governor: unit-testable in isolation (pure EMA/threshold math, no DOM/three.js needed for the core algorithm) — write it with tests before wiring it to any renderer.

## Resolved before implementation
- **Draco compression: confirmed absent.** Checked `public/assets/agents/NEXUS.glb`'s JSON chunk directly (no `KHR_draco_mesh_compression` in `extensionsUsed`/`extensionsRequired`) — the GLBs are plain glTF. Loader uses plain `GLTFLoader`, no `DRACOLoader`, matching `agents.html`'s existing pattern.
- **Graph layout: `d3-force` (CDN, MIT)** — approved by owner via "let's get this done" direction, proceeding with the recommended choice rather than blocking on a re-ask.
- This spec deliberately excludes any Meshy/fal.ai asset generation — the disintegration effect reuses existing GLBs and procedural particles, spending no image/3D-generation credits. Generated textures on top of this remain an additive follow-up, not required for this build to work.
