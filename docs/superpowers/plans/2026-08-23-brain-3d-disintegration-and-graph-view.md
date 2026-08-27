# Brain 3D Disintegration + Knowledge Graph View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give `public/brain.html` a real 3D agent-disintegration effect (GLB body shatters into knowledge-shard particles tagged to real digests) and a literal, navigable knowledge-graph view of the RAG brain's topics/digests, both gated by a ported, reusable performance governor.

**Architecture:** A standalone perf-governor module (Task 1, no three.js dependency, independently testable) ports the FPS-adaptive tier algorithm already proven in `SHADDAI-WORLD-3D.html`. Task 2 adds a three.js scene to `brain.html` (pinned `0.180.0` via importmap, plain `GLTFLoader`, no Draco) that loads an agent's existing GLB and, on click, samples its mesh surface into a `THREE.Points` particle burst tagged to that agent's real digest titles, reusing the existing `openPanel(ci)` detail panel for shard detail. Task 3 adds a second mode in the same scene: a `d3-force`-driven graph of topics/digests, sharing the Task 2 scene/camera/governor instance, also opening `openPanel` on node click.

**Tech Stack:** three.js 0.180.0 (CDN importmap, matches `SHADDAI-WORLD-3D.html`), `d3-force` (CDN), vanilla JS — no build step, matches the rest of `public/`.

**Spec:** `docs/superpowers/specs/2026-08-23-brain-3d-disintegration-and-graph-view-design.md`

## Global Constraints

- Scope is `public/brain.html` only — no changes to `SHADDAI-WORLD-3D.html`, `agents.html`, or any other page.
- three.js pinned to `0.180.0` via `<script type="importmap">`, not npm — matches the existing CDN pattern in this codebase.
- No `DRACOLoader` — confirmed via direct GLB inspection that `public/assets/agents/*.glb` carry no `KHR_draco_mesh_compression` extension.
- No Meshy/fal.ai asset generation in this plan — reuses existing GLBs and procedural (code-generated) particles only.
- The perf governor must be a standalone module with a callback interface (`onTierChange(tierName, tierConfig)`), not hardcoded to specific renderer/composer globals — this is what makes it reusable, unlike the original tangled implementation.
- Both new features (disintegration, graph) must register with the same governor instance so a slow frame in one degrades both.

---

## File Structure

- **Create:** `public/js/perf-governor.js` — the ported, callback-based FPS-adaptive tier algorithm. Pure logic, no DOM/three.js imports.
- **Test:** `public/js/perf-governor.test.js` — Jest-style tests for the governor's pure math (EMA smoothing, hysteresis thresholds, tier clamping).
- **Modify:** `public/brain.html` — adds the three.js scene, GLB disintegration effect, and graph view. Given this file is already very large (2500+ lines), new logic goes in two new sibling files it `<script type="module" src="...">`-includes, keeping `brain.html` itself as thin wiring:
  - **Create:** `public/js/brain-disintegration.js` — three.js scene setup, GLTFLoader, particle-sampling/burst effect.
  - **Create:** `public/js/brain-graph.js` — `d3-force` layout + point/line rendering into the same scene.

---

### Task 1: Perf governor module (parallelizable — no dependency on Tasks 2/3)

**Files:**
- Create: `public/js/perf-governor.js`
- Test: `public/js/perf-governor.test.js`

**Interfaces:**
- Produces: `createGovernor(options)` → `{ update(dt), getTier(), tiers }`.
  - `options.tiers` — optional override array; defaults to the 5-tier table below (ported verbatim from `SHADDAI-WORLD-3D.html`'s `_Q.tiers`).
  - `options.onTierChange(tierIndex, tier)` — called whenever the governor changes tier (tier = `{name, pr, bloomStr, cullR}`), including once immediately on creation for the starting tier. This replaces the original's hardcoded `renderer.setPixelRatio(...)`/`bloom.strength = ...` calls inside `_applyQualityTier` — callers wire their own renderer/particle-system through this callback instead.
  - `update(dt)` — call once per animation frame with the frame's delta-time in seconds; internally reproduces `_updateGovernor`'s exact thresholds (EMA alpha 0.18, hard-floor 30fps immediate drop, 50fps/0.6s sustained step-down with 2.5s cooldown, 58fps/6.0s sustained step-up with 8.0s cooldown).
  - `getTier()` → `{ index, name, pr, bloomStr, cullR }` — current tier snapshot.
- Consumes: nothing (pure module).

- [ ] **Step 1: Write the failing tests**

```js
// public/js/perf-governor.test.js
const { createGovernor } = require('./perf-governor');

describe('createGovernor', () => {
  test('starts at tier index 1 (LOW) and calls onTierChange once immediately', () => {
    const calls = [];
    const gov = createGovernor({ onTierChange: (i, t) => calls.push({ i, name: t.name }) });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual({ i: 1, name: 'LOW' });
    expect(gov.getTier().name).toBe('LOW');
  });

  test('a single very bad frame (fps < 30) drops a tier immediately, no accumulation needed', () => {
    const calls = [];
    const gov = createGovernor({ onTierChange: (i, t) => calls.push(t.name) });
    // one frame at ~20fps (dt = 0.05s) — EMA seeded at 55, one sample pulls it down but
    // the hard-floor check compares the EMA, so drive several bad frames to cross under 30.
    for (let i = 0; i < 10; i++) gov.update(0.05); // ~20fps repeated
    expect(gov.getTier().name).toBe('POTATO');
  });

  test('sustained fps > 58 for 6+ seconds steps up one tier, then cools down', () => {
    const calls = [];
    const gov = createGovernor({ onTierChange: (i, t) => calls.push(t.name) });
    // Drive at a steady 60fps (dt ~0.0167s) for >6 simulated seconds.
    const dt = 1 / 60;
    const frames = Math.ceil(6.5 / dt);
    for (let i = 0; i < frames; i++) gov.update(dt);
    expect(gov.getTier().name).toBe('MEDIUM');
  });

  test('tier index never goes below 0 or above the last tier', () => {
    const gov = createGovernor({});
    for (let i = 0; i < 200; i++) gov.update(0.2); // sustained terrible fps (5fps)
    expect(gov.getTier().index).toBeGreaterThanOrEqual(0);
    const gov2 = createGovernor({});
    const dt = 1 / 120;
    for (let i = 0; i < 20000; i++) gov2.update(dt); // sustained excellent fps for a long time
    expect(gov2.getTier().index).toBeLessThanOrEqual(gov2.tiers.length - 1);
  });

  test('exposes the 5-tier table with the exact values ported from SHADDAI-WORLD-3D.html', () => {
    const gov = createGovernor({});
    expect(gov.tiers.map(t => t.name)).toEqual(['POTATO', 'LOW', 'MEDIUM', 'HIGH', 'ULTRA']);
    expect(gov.tiers[0]).toEqual({ name: 'POTATO', pr: 0.55, bloomStr: 0, cullR: 75 });
    expect(gov.tiers[4]).toEqual({ name: 'ULTRA', pr: 1.5, bloomStr: 0.28, cullR: 9999 });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run (from `backend/`, using the worktree jest workaround — see note below): copy the test file's require path resolution is fine since it's plain Node/Jest with no worktree-specific issue for files under `public/js/`, but this repo's jest config only scans `backend/tests/**`. Add `public/js/perf-governor.test.js` to jest's `testMatch` for this run, or run directly with Node's built-in test runner instead since no other `public/js/*.test.js` convention exists yet. Simplest: run with plain Node using a tiny inline assertion harness, OR (preferred, matches project convention) run via `backend`'s jest by pointing `--config` at an inline override:

```bash
cd public/js
node -e "
const assert = require('assert');
const { createGovernor } = require('./perf-governor');
assert.throws(() => require('./perf-governor'), /Cannot find module/);
"
```

Expected: FAIL with `Cannot find module './perf-governor'` (or equivalent — the file does not exist yet). If using a real Jest run instead: `npx jest --config "{\"rootDir\":\".\",\"testEnvironment\":\"node\",\"testMatch\":[\"<rootDir>/perf-governor.test.js\"]}"` run from `public/js/` — same "no tests found"/"cannot find module" failure expected.

- [ ] **Step 3: Write minimal implementation**

```js
// public/js/perf-governor.js
'use strict';
// Ported from public/SHADDAI-WORLD-3D.html's _Q/_applyQualityTier/_updateGovernor
// (~lines 3828-3914), made reusable: no hardcoded renderer/composer/bloom globals —
// callers receive tier changes via onTierChange and apply them to their own scene.

const DEFAULT_TIERS = [
  { name: 'POTATO', pr: 0.55, bloomStr: 0,    cullR: 75   },
  { name: 'LOW',    pr: 0.75, bloomStr: 0,    cullR: 110  },
  { name: 'MEDIUM', pr: 1.0,  bloomStr: 0.14, cullR: 220  },
  { name: 'HIGH',   pr: 1.2,  bloomStr: 0.22, cullR: 360  },
  { name: 'ULTRA',  pr: 1.5,  bloomStr: 0.28, cullR: 9999 },
];

function createGovernor(options) {
  const opts = options || {};
  const tiers = opts.tiers || DEFAULT_TIERS;
  const onTierChange = typeof opts.onTierChange === 'function' ? opts.onTierChange : () => {};

  const state = {
    tier: 1,
    fps: 55,
    below45: 0,
    above58: 0,
    cooldown: 0,
  };

  function applyTier(idx) {
    let i = idx;
    if (i < 0) i = 0;
    if (i >= tiers.length) i = tiers.length - 1;
    state.tier = i;
    onTierChange(i, tiers[i]);
  }

  applyTier(state.tier); // fire once immediately, matches original's initial _applyQualityTier(_Q.tier) call

  function update(dt) {
    const instantFps = dt > 0 ? 1 / dt : 60;
    state.fps = state.fps * 0.82 + instantFps * 0.18;

    if (state.cooldown > 0) { state.cooldown -= dt; return; }

    if (state.fps < 30 && state.tier > 0) {
      applyTier(state.tier - 1);
      state.below45 = 0; state.above58 = 0; state.cooldown = 2.5;
      return;
    }
    if (state.fps < 50) {
      state.below45 += dt; state.above58 = 0;
      if (state.below45 > 0.6 && state.tier > 0) {
        applyTier(state.tier - 1);
        state.below45 = 0; state.cooldown = 2.5;
      }
    } else {
      state.below45 = Math.max(0, state.below45 - dt * 0.5);
    }
    if (state.fps > 58) {
      state.above58 += dt; state.below45 = 0;
      if (state.above58 > 6.0 && state.tier < tiers.length - 1) {
        applyTier(state.tier + 1);
        state.above58 = 0; state.cooldown = 8.0;
      }
    } else {
      state.above58 = Math.max(0, state.above58 - dt * 0.3);
    }
  }

  function getTier() {
    return { index: state.tier, ...tiers[state.tier] };
  }

  return { update, getTier, tiers };
}

module.exports = { createGovernor };
// Also usable as a browser <script type="module"> — add an ESM export alongside
// the CJS one so brain-disintegration.js/brain-graph.js can `import` it directly:
if (typeof window !== 'undefined') { window.createGovernor = createGovernor; }
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd public/js
npx jest --config "{\"rootDir\":\".\",\"testEnvironment\":\"node\",\"testMatch\":[\"<rootDir>/perf-governor.test.js\"]}"
```

Expected: PASS, 5/5 tests. (Use this literal-testMatch form, not a bare `npx jest perf-governor` — plain glob-based `npx jest` invocations are confirmed broken from inside this worktree's path; see Task 3 of the sibling corpus-ingestion plan's ledger for the root cause. This same literal-config workaround applies here.)

- [ ] **Step 5: Add a browser-loadable ESM export**

Browser `<script type="module">` code (Tasks 2/3) needs `import { createGovernor } from './perf-governor.js'`, but Step 3's module uses `module.exports` (CommonJS, for Jest under Node). Add a plain ESM named export alongside the CJS one so the same file works in both environments:

```js
// append to the bottom of public/js/perf-governor.js, after the existing module.exports block
export { createGovernor };
```

Note: a file cannot mix `module.exports` and a top-level `export` statement when loaded as a strict ESM module in the browser (Node's CJS loader ignores `export`, but a browser `<script type="module">` would choke on the bare `module.exports =` line, which references a `module` global that doesn't exist in ESM). Resolve this by guarding the CJS line:

```js
if (typeof module !== 'undefined' && module.exports) { module.exports = { createGovernor }; }
export { createGovernor };
```

Re-run Step 4's test command to confirm the guard didn't break the Node/Jest path: expected PASS, 5/5, unchanged.

- [ ] **Step 6: Commit**

```bash
git add public/js/perf-governor.js public/js/perf-governor.test.js
git commit -m "feat: add reusable perf-governor module for brain.html 3D views"
```

---

### Task 2: GLB agent-disintegration effect

**Files:**
- Create: `public/js/brain-disintegration.js`
- Modify: `public/brain.html` — add a `<script type="importmap">` (three.js 0.180.0) and a `<script type="module" src="js/brain-disintegration.js"></script>` include, plus a small wiring call from the existing per-agent click handler.

**Interfaces:**
- Consumes: `createGovernor` from `public/js/perf-governor.js` (Task 1) — **as `window.createGovernor`, NOT an ESM import.** Task 1 established (verified empirically, see its ledger ruling) that `perf-governor.js` cannot carry an ESM `export` statement: Jest's module runtime throws `SyntaxError: Unexpected token 'export'` and its whole suite fails to load. The module therefore uses CJS `module.exports` (for tests) plus a `window.createGovernor` global (for the browser). Load it in `brain.html` with a plain `<script src="js/perf-governor.js"></script>` **before** the module scripts, and reference `window.createGovernor` — do NOT write `import { createGovernor } from './perf-governor.js'`, which will be undefined at runtime. Consumes `AGENTS` (global array already defined in `brain.html`, each entry has `{id, color, role, cat, docs, tools, words, topics: [[topicName, chunkCount], ...], ...}` — confirmed at `public/brain.html:695`) and the existing `openPanel(ci)` function (`public/brain.html:1115`) for detail-panel reuse.
- Produces: `initDisintegration(containerEl, agents)` — mounts a three.js canvas into `containerEl`, returns `{ triggerDisintegrate(agentIndex) }`. Called once at page load; `triggerDisintegrate(ci)` is what the existing agent-cluster click handler calls instead of (or alongside) today's `openPanel(ci)`.

- [ ] **Step 1: Confirm the GLB filenames match `AGENTS[].id`**

```bash
ls public/assets/agents/
```

Expected: `NEXUS.glb ORACLE.glb PIKADON.glb QUILL.glb SHADDAI.glb TURTLE.glb VILLAIN.glb ZEROX.glb` (per prior repo research) — confirm each `AGENTS[].id` value (read `public/brain.html`'s `AGENT_META` definition, near line 695) has a matching `<ID>.glb` file. If any agent id has no matching GLB, note it — `initDisintegration` should fall back to the existing Canvas-2D particle-cluster click (call `openPanel(ci)` directly, skip the 3D effect) for that agent rather than erroring.

- [ ] **Step 2: Add the importmap and module script include to brain.html**

Find `brain.html`'s `<head>` (or wherever other `<script>` tags for this page live) and add, following the exact CDN pattern already used in `public/SHADDAI-WORLD-3D.html`:

```html
<script type="importmap">
{
  "imports": {
    "three": "https://unpkg.com/three@0.180.0/build/three.module.js",
    "three/addons/": "https://unpkg.com/three@0.180.0/examples/jsm/"
  }
}
</script>
<!-- plain script, NOT type="module" — sets window.createGovernor; must come first -->
<script src="js/perf-governor.js"></script>
<script type="module" src="js/brain-disintegration.js"></script>
```

- [ ] **Step 3: Write `brain-disintegration.js`**

```js
// public/js/brain-disintegration.js
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
// perf-governor is loaded as a plain (non-module) script that sets a global —
// it cannot carry an ESM export without breaking its Jest suite. See Task 1.
const createGovernor = window.createGovernor;

const loader = new GLTFLoader(); // no DRACOLoader — confirmed agent GLBs are plain glTF, not Draco-compressed

function samplePointsFromObject(root, maxPoints) {
  // Walk the loaded GLTF scene graph, gather every mesh's vertex positions
  // (in world space), and return a flat array of up to maxPoints [x,y,z] triples.
  const positions = [];
  root.updateMatrixWorld(true);
  root.traverse((node) => {
    if (!node.isMesh || !node.geometry || !node.geometry.attributes.position) return;
    const posAttr = node.geometry.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < posAttr.count; i++) {
      v.fromBufferAttribute(posAttr, i).applyMatrix4(node.matrixWorld);
      positions.push(v.x, v.y, v.z);
    }
  });
  // Downsample evenly if there are more vertices than maxPoints.
  const totalVerts = positions.length / 3;
  if (totalVerts <= maxPoints) return positions;
  const stride = Math.floor(totalVerts / maxPoints);
  const sampled = [];
  for (let i = 0; i < totalVerts; i += stride) {
    sampled.push(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);
  }
  return sampled;
}

export function initDisintegration(containerEl, agents) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, containerEl.clientWidth / containerEl.clientHeight, 0.1, 100);
  camera.position.set(0, 1.4, 4);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(containerEl.clientWidth, containerEl.clientHeight);
  containerEl.appendChild(renderer.domElement);

  const ambient = new THREE.AmbientLight(0xffffff, 0.8);
  const point = new THREE.PointLight(0xe8c45c, 1.2, 10);
  point.position.set(2, 3, 2);
  scene.add(ambient, point);

  const governor = createGovernor({
    onTierChange: (idx, tier) => {
      const pr = Math.min(window.devicePixelRatio || 1, tier.pr);
      renderer.setPixelRatio(pr);
      renderer.setSize(containerEl.clientWidth, containerEl.clientHeight);
    },
  });

  const loadedModels = new Map(); // agentId -> THREE.Group
  let activeBurst = null; // { points: THREE.Points, velocities: Float32Array, life: number }
  let currentModel = null;

  function loadAgentModel(agent) {
    if (loadedModels.has(agent.id)) return Promise.resolve(loadedModels.get(agent.id));
    return new Promise((resolve, reject) => {
      loader.load(
        `assets/agents/${agent.id}.glb`,
        (gltf) => { loadedModels.set(agent.id, gltf.scene); resolve(gltf.scene); },
        undefined,
        (err) => reject(err),
      );
    });
  }

  function clearScene() {
    if (currentModel) { scene.remove(currentModel); currentModel = null; }
    if (activeBurst) { scene.remove(activeBurst.points); activeBurst = null; }
  }

  async function triggerDisintegrate(agentIndex) {
    const agent = agents[agentIndex];
    if (!agent) return;
    clearScene();
    let model;
    try {
      model = await loadAgentModel(agent);
    } catch (e) {
      console.warn(`[brain-disintegration] no GLB for ${agent.id}, falling back to 2D panel`, e);
      if (typeof window.openPanel === 'function') window.openPanel(agentIndex);
      return;
    }
    const positions = samplePointsFromObject(model, 4000);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));

    const color = new THREE.Color(agent.color || '#e8c45c');
    const material = new THREE.PointsMaterial({ color, size: 0.02, transparent: true, opacity: 0.95 });
    const points = new THREE.Points(geometry, material);
    scene.add(points);

    const velocities = new Float32Array(positions.length);
    for (let i = 0; i < positions.length; i += 3) {
      const dir = new THREE.Vector3(positions[i], positions[i + 1], positions[i + 2]).normalize();
      const speed = 0.4 + Math.random() * 0.8;
      velocities[i] = dir.x * speed;
      velocities[i + 1] = dir.y * speed + 0.2; // slight upward bias
      velocities[i + 2] = dir.z * speed;
    }
    activeBurst = { points, velocities, life: 0, maxLife: 2.2 };

    // Reuse the existing 2D detail panel for the actual digest/lesson content —
    // the 3D burst is the visual moment, the panel is still the information surface.
    if (typeof window.openPanel === 'function') window.openPanel(agentIndex);
  }

  const clock = new THREE.Clock();
  function animate() {
    requestAnimationFrame(animate);
    const dt = clock.getDelta();
    governor.update(dt);

    if (activeBurst) {
      const posAttr = activeBurst.points.geometry.attributes.position;
      for (let i = 0; i < posAttr.count; i++) {
        posAttr.array[i * 3] += activeBurst.velocities[i * 3] * dt;
        posAttr.array[i * 3 + 1] += activeBurst.velocities[i * 3 + 1] * dt;
        posAttr.array[i * 3 + 2] += activeBurst.velocities[i * 3 + 2] * dt;
        activeBurst.velocities[i * 3 + 1] -= 0.6 * dt; // gravity
      }
      posAttr.needsUpdate = true;
      activeBurst.life += dt;
      activeBurst.points.material.opacity = Math.max(0, 1 - activeBurst.life / activeBurst.maxLife);
      if (activeBurst.life >= activeBurst.maxLife) { scene.remove(activeBurst.points); activeBurst = null; }
    }

    renderer.render(scene, camera);
  }
  animate();

  window.addEventListener('resize', () => {
    camera.aspect = containerEl.clientWidth / containerEl.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(containerEl.clientWidth, containerEl.clientHeight);
  });

  return { triggerDisintegrate };
}
```

- [ ] **Step 4: Wire it into brain.html's existing agent-click path**

Read `public/brain.html` around its cluster-click handler (search for where `openPanel(ci)` is currently called from a click/raycast handler on the `bc` canvas — likely near the existing pointer/raycaster code that identifies which agent cluster was clicked). Add, near the top-level script section, a mount point and initialization:

```html
<div id="disintegrationStage" style="position:relative;width:100%;height:260px;"></div>
<script type="module">
  import { initDisintegration } from './js/brain-disintegration.js';
  window.__disintegration = initDisintegration(document.getElementById('disintegrationStage'), AGENTS);
</script>
```

Then in the existing click handler that currently calls `openPanel(ci)` directly, call `window.__disintegration.triggerDisintegrate(ci)` instead — `triggerDisintegrate` itself calls `openPanel(ci)` once the burst starts (see Step 3), so the detail panel still opens exactly as before, now with the 3D moment layered in front of it.

- [ ] **Step 5: Manual verification (visual feature — no automated pixel assertions)**

Serve `public/` locally (the project's existing dev-server pattern — check `backend/server-production.js` or `package.json`'s `start`/`dev` script for the actual command) and open `brain.html` in a browser. Click one agent cluster. Expected: the GLB loads (check the Network tab for a 200 on `assets/agents/<ID>.glb`), a particle burst plays for ~2.2s and fades, and the existing detail panel opens as before. Check the browser console for `[SHADDAI quality]`-style governor logs are NOT present (that log line is specific to `SHADDAI-WORLD-3D.html`'s own governor instance, not this one) and for any thrown errors — none expected.

- [ ] **Step 6: Commit**

```bash
git add public/brain.html public/js/brain-disintegration.js
git commit -m "feat: add GLB agent-disintegration effect to brain.html"
```

---

### Task 3: Knowledge-graph view

**Files:**
- Create: `public/js/brain-graph.js`
- Modify: `public/brain.html` — add a mode-toggle control and a `<script type="module" src="js/brain-graph.js">` include; add `d3-force` to the importmap from Task 2.

**Interfaces:**
- Consumes: `createGovernor` (Task 1). Consumes the three.js `scene`/`camera`/`renderer` created in Task 2's `initDisintegration` — **`initDisintegration` must return `{ triggerDisintegrate, scene, camera, renderer }`** (extend Task 2's return value with these three fields; if Task 2 already shipped without them, add them in this task's own small edit to `brain-disintegration.js`'s final `return` statement). Consumes `AGENTS[].topics` (`[[topicName, chunkCount], ...]` per agent, from `public/brain.html:695`/`:1137`) as the graph's node/edge source, and `openPanel(ci)` for node-click detail.
- Produces: `initGraph(sceneCtx, agents)` → `{ show(), hide() }` — `show()`/`hide()` toggle the graph's point/line objects' visibility in the shared scene without tearing down Task 2's disintegration objects.

- [ ] **Step 1: Add `d3-force` to the importmap**

Extend Task 2's importmap block in `brain.html`:

```html
<script type="importmap">
{
  "imports": {
    "three": "https://unpkg.com/three@0.180.0/build/three.module.js",
    "three/addons/": "https://unpkg.com/three@0.180.0/examples/jsm/",
    "d3-force": "https://cdn.jsdelivr.net/npm/d3-force@3/+esm"
  }
}
</script>
```

- [ ] **Step 2: Extend Task 2's `initDisintegration` return value**

In `public/js/brain-disintegration.js`, change the final `return { triggerDisintegrate };` (end of `initDisintegration`) to:

```js
return { triggerDisintegrate, scene, camera, renderer };
```

- [ ] **Step 3: Write `brain-graph.js`**

```js
// public/js/brain-graph.js
import * as THREE from 'three';
import { forceSimulation, forceManyBody, forceLink, forceCenter } from 'd3-force';

export function initGraph(sceneCtx, agents) {
  const { scene } = sceneCtx;
  const nodes = [];
  const links = [];

  // One node per (agent, topic) pair — matches the corpus's real (agent,topic)
  // grouping used elsewhere in the RAG brain (see the sibling ingestion plan).
  agents.forEach((agent, agentIdx) => {
    const topics = agent.topics || [];
    topics.forEach(([topicName, chunkCount], topicIdx) => {
      nodes.push({
        id: `${agent.id}::${topicName}`,
        agentIndex: agentIdx,
        color: agent.color,
        weight: chunkCount,
      });
      if (topicIdx > 0) {
        // Chain topics within the same agent so each agent forms a connected cluster.
        links.push({ source: `${agent.id}::${topics[topicIdx - 1][0]}`, target: `${agent.id}::${topicName}` });
      }
    });
  });

  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(nodes.length * 3);
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  const colors = new Float32Array(nodes.length * 3);
  nodes.forEach((n, i) => {
    const c = new THREE.Color(n.color || '#e8c45c');
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
  });
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const material = new THREE.PointsMaterial({ size: 0.05, vertexColors: true, transparent: true });
  const points = new THREE.Points(geometry, material);
  points.visible = false;
  scene.add(points);

  const lineGeometry = new THREE.BufferGeometry();
  const linePositions = new Float32Array(links.length * 2 * 3);
  lineGeometry.setAttribute('position', new THREE.Float32BufferAttribute(linePositions, 3));
  const lineMaterial = new THREE.LineBasicMaterial({ color: 0x8a90a0, transparent: true, opacity: 0.35 });
  const lines = new THREE.LineSegments(lineGeometry, lineMaterial);
  lines.visible = false;
  scene.add(lines);

  const sim = forceSimulation(nodes)
    .force('charge', forceManyBody().strength(-8))
    .force('link', forceLink(links).id((d) => d.id).distance(0.6))
    .force('center', forceCenter(0, 0))
    .on('tick', () => {
      nodes.forEach((n, i) => {
        positions[i * 3] = n.x || 0;
        positions[i * 3 + 1] = n.y || 0;
        positions[i * 3 + 2] = 0;
      });
      geometry.attributes.position.needsUpdate = true;
      links.forEach((l, i) => {
        linePositions[i * 6] = l.source.x || 0;
        linePositions[i * 6 + 1] = l.source.y || 0;
        linePositions[i * 6 + 2] = 0;
        linePositions[i * 6 + 3] = l.target.x || 0;
        linePositions[i * 6 + 4] = l.target.y || 0;
        linePositions[i * 6 + 5] = 0;
      });
      lineGeometry.attributes.position.needsUpdate = true;
    });

  function show() { points.visible = true; lines.visible = true; }
  function hide() { points.visible = false; lines.visible = false; sim.stop(); }

  return { show, hide };
}
```

- [ ] **Step 4: Wire a mode toggle into brain.html**

Add a simple toggle control (button or tab) near the existing view controls in `brain.html`, and wiring:

```html
<button id="graphToggle" type="button">Knowledge Graph</button>
<script type="module">
  import { initGraph } from './js/brain-graph.js';
  const graphCtl = initGraph(window.__disintegration, AGENTS);
  let graphOpen = false;
  document.getElementById('graphToggle').addEventListener('click', () => {
    graphOpen = !graphOpen;
    if (graphOpen) graphCtl.show(); else graphCtl.hide();
  });
</script>
```

Node-click-to-panel wiring (raycasting against the `points` object to find the clicked node, then calling `openPanel(agentIndex)`) follows the same raycast pattern Task 2 used for the disintegration burst's own click handling — implement it symmetrically: on click while `graphOpen` is true, raycast against `graphCtl`'s points object (expose it via a third return field `{ show, hide, points }` if raycasting needs direct access), find the nearest hit node, call `openPanel(node.agentIndex)`.

- [ ] **Step 5: Manual verification**

With the same local dev server as Task 2, open `brain.html`, click "Knowledge Graph". Expected: nodes settle into a force-directed layout within a few seconds (not still drifting after ~10s — if it never settles, `forceManyBody` strength or `forceLink` distance likely need tuning, adjust and re-check rather than treating settling time as a hard pass/fail number). Click a node — expected: the same detail panel from Task 2/the original 2D view opens for that node's agent.

- [ ] **Step 6: Commit**

```bash
git add public/brain.html public/js/brain-graph.js public/js/brain-disintegration.js
git commit -m "feat: add d3-force knowledge-graph view to brain.html"
```

---

## Self-Review Notes

- **Spec coverage:** perf governor (spec §3) → Task 1. Disintegration effect (spec §1) → Task 2. Graph view (spec §2) → Task 3. Draco/graph-library open items already resolved in the spec itself before this plan was written.
- **Placeholder scan:** no TBD/TODO. Task 2 Step 4 and Task 3 Step 4 describe *finding* the existing click-handler location by search rather than citing a fixed line number, because `brain.html` is a large, frequently-edited file — this is a "look this up first" instruction with a concrete search target, not a vague placeholder.
- **Type consistency:** `initDisintegration`'s return shape grows from `{ triggerDisintegrate }` (Task 2) to `{ triggerDisintegrate, scene, camera, renderer }` (Task 3 Step 2) — the extension is explicit and Task 3 depends on it being applied. `initGraph(sceneCtx, agents)` consumes exactly the extended shape.
- **Task 1 is genuinely parallelizable** with Tasks 2/3 as designed — it has no file or runtime dependency on either, and its `onTierChange(idx, tier)` callback signature is fully specified in Task 1 itself, so Tasks 2/3 can be written against that contract without waiting on Task 1's actual completion (though `subagent-driven-development`'s rule against parallel *implementer* dispatches still applies — see plan execution note below).
