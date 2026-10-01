# HANDOFF — SHADDAI (2026-09-30, GLM-5 session)

Supersedes `HANDOFF-OPENCODE-GLM5-20260929.md`. Companion documents:
`FORGE-AGENT-WIRING-20260930.md`, `FRIENDSHIP-THESIS-20260930.md`.

---

## 0. State at hand-off

| | |
|---|---|
| Source repo | `C:\Users\Brittany\Shaddai-3d`, branch `feat/world3d`, HEAD `ee9b5351` |
| Beta repo | `C:\Users\Brittany\Shaddai-Beta`, branch `master`, HEAD `a584c3f` |
| Beta URL | `https://shaddai-beta.onrender.com/enter.html` → `SHADDAI-WORLD-3D.html` |
| Local | `python -m http.server 3013 --directory public` (running) |
| Tests | **261 passed, 0 failed** (24 `tools/tests/world-*.test.cjs` suites) |
| Live verify | beta serves `world-clusters-v4.js` with `HYST` ✓ and html with `_dedupMaterials` ✓ |

**Working tree is dirty** with unrelated FAL asset edits from a parallel terminal. Never
`git add -A`. Never reset or stash the whole tree. Explicit paths only.

**Rules for this repo:** no FAL spend, no Blender on the laptop (8 GB), one heavy job at a
time, C: has ~1.6 GB free so **never run `git gc`**, commit trailer
`Co-Authored-By: opencode (z-ai/glm-5.3-flash)`.

---

## 1. Performance work shipped this session

| Metric | Before | After |
|---|---|---|
| Draw calls | 2,085+ | **~1,400–2,100** (adaptive-LOD variance; merge saves ~500) |
| Triangles | 4.3M | **3.5–4.0M** at LOW |
| Lights | 53 | **~10–14 visible** |
| Tests | 1 failing | **261 passing** |

What landed:
- **Material dedup** — byte-identical materials share one instance → fewer shader programs
  (`SHADDAI-WORLD-3D.html` `_dedupMaterials`)
- **Static merge ×3 passes** (`+8s/+40s/+100s`) — tiny unnamed meshes + baked building
  `InstancedMesh` batches; originals **hidden, never deleted**
- **Tier-adaptive LOD** — `world-clusters-v4.js` bands scale by governor tier
  (`0.4/0.6/0.8/0.92/1`), `world-fill-v4.js` budgets `0.6M–1.5M` tris / `80–150` draws
- **LOD hysteresis** (`world-clusters-v4.js`) — a cell keeps its tier unless clearly outside
  its band ±37 m; fixes boundary popping (the "screen glitch" report) and cuts the
  `O(cells×keys)` buffer rebuilds
- Light pool 6 + lazy chakra pads; landmark distance-hide; transit segments 720→256

**Honest caveat:** draw-call numbers swing 1,396–2,110 for identical code because the
governor adapts to where the camera spawns. Do not quote a single figure as final. Real
hardware profiling (Chrome DevTools + `?perf=1`) is the outstanding measurement.

**Grid-fabric is NOT the bottleneck.** An agent traced it: one `InstancedMesh` per
(key × tier-set × part), shared across all cells, with per-cell LOD done by recomposing the
instance buffer — roughly **80–120 draw calls** for the whole city fabric. Per-cell merging
across keys is already done; nothing left there. Remaining draw sources are the ~685 leftover
unnamed singles, static-merge batches, water, canon meshes, characters.

---

## 2. Owner-reported issues still open

Reported as: *"still glitchy and laggy but better; screen glitches, collision issues, some
basic buildings, button issues, and the bottom-of-screen controls."* Also untested: hoverboard,
stadium interior.

**These are 5 root systems, not 13 bugs.** Fix the system; half the list dies with it.

### Cluster A — Load-time normalization contract
*Explains: bots huge-then-correct, homes mis-sized, walk-rig/step problems.*

The loader normalizes scale/bbox **after** the object is in the scene graph, so frame 1 draws
a 40-unit-tall human and frame 2 corrects it. That is a loader contract violation.

- **Invariant:** nothing enters the scene graph until normalized — unit scale, origin at feet,
  canonical yaw
- One `normalizeModel()` in the loader pipeline; gate `scene.add()` behind it
- **Lock with a test:** assert every character GLB's world bbox height is sane at load. A bot
  that loads at 40u tall fails the build, not the playtest
- ~20 lines, kills a whole bug class, and Cluster C depends on correct world scale
- **Tier 1 — safe for GLM-5**

### Cluster B — Collision as data, not hand-tuned circles
*Explains: offices, buildings, homes, walk-in entries, steps.*

`_BLDG_R = { SHADDAI:76, NEXUS:63, QUILL:118, … }` is one circle per building. A circle cannot
represent a doorway, a step, or an interior — hence giant un-enterable shells, clipping
through some walls, bouncing off invisible air.

- Derive collision from the building's **own local bbox** → oriented boxes per wall segment
- Add the three concepts the resolver lacks: **approach volume**, **step-up ladder**
  (sorted climbable ledges with max height), **door arc** (exists; must compose with OBBs)
- Interiors need a real **floor** collider + interior wall set, or you fall through at the
  threshold
- Every building needs one authored **front** (which face is the entrance) — derive, don't guess
- **Tier 2 — GLM-5 + Sonnet, headless test per building**

### Cluster C — Camera, culling, far sight
*Explains: far view, sky, flight.*

Render distance and LOD are currently the same knob, keyed to FPS tier only — wrong for flight.

- **Split sim distance from render distance.** See the far skyline as one cheap merged
  silhouette; simulate detail only inside fog
- **Far-city impostor:** bake real building footprints into a single low-poly skyline mesh
  (one draw call)
- Flight needs **wider** bands and **fewer unique materials** — the opposite tradeoff from
  walking. Governor should key off flight state, not just tier
- Sky/atmosphere is a look pass, keep it cheap: shell + cloud band, no shadow work
- **Tier 3 — Sonnet + Blender**

### Cluster D — DOM lifecycle for buttons and layout
*Explains: dead buttons, bottom control bar.*

Listeners are attached to elements that get re-rendered: you click, the UI rebuilds, the new
element has no handler.

- **One delegated listener** at a stable root; buttons carry `data-action`, not inline handlers
- `renderUI()` becomes **idempotent** — safe every frame
- Bottom control bar gets the same treatment, no special-casing
- Headless test: render bar → dispatch click → assert state changed. Catches this class forever
- **Tier 1 — safe for GLM-5**

### Cluster E — Navi as a graph
`world-goto` already exists with tests. Extend it: nodes = entrances, landmarks, stations,
plots; edges = walkable corridors. One graph then serves player wayfinding, agent pathing,
**and** the visit loop from the friendship thesis. Agent visits become nearly free once goto
works. **Tier 2**

### Cluster F — Train, colosseum, hoverboard, stadium
**Polish tier — test before touching.** Hoverboard and stadium interior have never been
played. Ride, walk, break, list what is wrong, *then* fix. **Tier 4 — Opus**

### Ordering by risk

| Tier | Clusters | Model | Risk |
|---|---|---|---|
| 1 | A (normalization) + D (buttons) | GLM-5 | Low — testable, huge bug-class payoff |
| 2 | B (collision) + E (navi) | GLM-5 + Sonnet | Medium — needs per-building tests |
| 3 | C (far sight + impostor) | Sonnet + Blender | Medium-high — visual risk |
| 4 | Sky, facades, train, colosseum | Opus + Blender | High — do not touch untested |

**Discipline:** one commit per cluster, explicit paths, 261 passing before **and** after every
commit. If a cluster cannot go green, stop and hand it over — never stack fixes.

**On Blender:** do not open it for Clusters A–E. 8 GB RAM means it fights the browser. Open it
only for Tier 3–4 art. `hLocal(x,z)` stays the sole collision/seating source — procedural, so
nothing regresses.

---

## 3. Forge agent wiring — the headline defect

Full spec: **`docs/FORGE-AGENT-WIRING-20260930.md`**. Summary:

> **The Forge and the game read two different files, so the agent forged in the dashboard is
> not the agent that appears in the world.**

- Forge writes `backend/data/forge-state.json` → unified Operative store
  (`backend/lib/operatives-routes.js`), which **has `owner` (server-verified via `softAuth`)**
  plus `codename, archetype, rarity, tools, brain, buildHash`
- Game reads `backend/data/custom_agents.json` via `server/agentServer.js:27` — **no owner
  field**, and the Forge no longer writes it. Live check: it holds **one** entry named `TEST`,
  created 2026-07-11

Consequences, in order:
1. **Wrong registry** — the roster shows stale data or nothing
2. **No ownership check** on `POST /agent/hire` — anyone can station anyone's forged agent
3. **No auth at all** on `agentServer.js`; `characterId` from query/body. `docs/CITY-ACTIONS.md:101`
   already warns the `softAuth` fallback makes every signed-out player share the `'local'`
   account
4. **Silent failure** — `loadForgeAgents()` catches everything to `[]`, so "broken" and "empty"
   look identical
5. **Cross-repo path** — breaks in `Shaddai-Beta` (which now has its own API backend,
   `009f96f`) and on Render's ephemeral FS
6. **Forge output discarded** — `agentServer.js:90` hardcodes flat `{sparks: 12}` for every
   forged agent, throws away `role`/`systemPrompt`/`archetype`/`rarity`/`tools`, and levels
   everyone identically (`1 + floor(shifts/3)`)
7. **`SHADDAI_FORGE_MODEL` is a model name, not an identity** — two players forging "NEXUS" are
   indistinguishable
8. **No presence, no home, no body** — a roster row is a job timer, not a citizen
9. **No idempotency, no locking** — concurrent `collect` **doubles yield**; concurrent `hire`
   breaks the 4-agent cap (`CITY-ACTIONS.md:105` documents the same class elsewhere)
10. **No release endpoint** — the Ward departure arc has no way to happen

**Fix direction:** one identity, two bodies. The world never mints identity; it grants a body
to an identity that already exists. Replace roster rows with a **body grant** referencing
`operativeId`. Build order is 12 steps in the spec — steps 1–9 are "wire it correctly," step 11
(the visible 3D body) is blocked on Cluster A.

**Free hooks already in the codebase:** `operatives-routes.js:53-79` auto-creates a personal
room per operative (`op_<codename>`) — that is the `homeTile`. And `presence` is derivable
free from the existing shift timer (`shiftEndAt > now ? working : home`).

---

## 4. Friendship / obligation layer

Full reasoning: **`docs/FRIENDSHIP-THESIS-20260930.md`**. No numbers were hardcoded; ring caps
in the owner's essay are **hypotheses to pressure-test with Opus**.

Load-bearing ideas:
- The diagnostic is **not** chat quality — it is *"could this agent refuse me in a way that
  costs me something?"* Obligation converts a tool into a citizen
- **Scarcity is what a chatbot structurally cannot fake.** Every intimacy claim must consume
  something finite that another player could have had
- **Displacement is the load-bearing idea** — a cap that silently truncates is UI; a cap that
  visibly ejects someone is a story. Caps should be diegetic, never numeric
- **Reciprocity as a ledger, never a scalar** — a 0–100 bar is always gift-spammable. Four
  orthogonal counters (shown up / carried / risked / refused) mean no single exploit dominates.
  `Risked` cannot be bought; `Refused` preserved as data is what makes refusal a relationship
  event rather than a support ticket
- **Bond state must be derived from the ledger, never stored** — then progress is always
  explainable and "grinding the number" is not a concept
- **Bilateral formation** — one-sided accumulation is patronage, not friendship
- **Visiting is the feature; chat is the residue** — the log is evidence of presence
- **Prefer emergent scarcity to authored scarcity** — a time budget produces the cap; nobody
  chose the number
- **Neglect should be absence, not a meter** — a dark house teaches, a −3 does not
- **Offline agent-to-agent visits** solve the empty-world problem and are the same dial as
  the economy balance problem
- **Do not lead with romance** — it invites the "does it complete you" critique. Let the inner
  circle stay biological on purpose, and make it mechanical: bonuses only a human can trigger

**The blocker to name out loud: identity binding.** Same defect class as the forge wiring, in
a second location. Client `shaddai.sparks` vs server `char.currency.sparks`, identity split
between `shd_userid` and server `characterId`. Bonds are the most identity-sensitive data in
the game. **Solve identity before building bonds.** And ship nothing until visits work
**agent-to-agent** — identity bugs between two humans are heartbreak, between two bots are a
Tuesday.

---

## 5. Reference repositories

- `IzzoSol/shaddai-gamedev-tools` — MIT Three.js dev suite. `FLAT-LIBRARY/three-core`
  (instancing/LOD/culling), `shaders-advanced` (KTX2), `game-qa-audit` (perf audits),
  `SKILLS-HUB/SKILL-REGISTRY.md`
- `majidmanzarpour/threejs-game-skills` — perf budgets and profiling. Key file:
  `skills/threejs-aaa-graphics-builder/references/technical-art.md`; also
  `skills/threejs-debug-profiler`
- `heygen-com/hyperframes` — HTML→video, for trailers/intro, **not** for speed
- `Friedrich-M/UniMate` — MIT text-to-motion for any skeleton. Use later for mount/bot
  animation; **does not help speed** (needs a real GPU)
- `Footprintarts/ThreeJS_FPS_2.0` — modular FPS template, Octree physics. Considered, **not
  adopted** — replacing the controller/physics risks regressions
- `stats.js` — considered, **not adopted**; the existing `?perf=1` HUD already covers it
- `jbeck018/agents-opencode` — selectable subagents. Candidate installs: `performance-engineer`,
  `javascript-pro`, `debugger`, `test-automator`, `frontend-developer`. **Not installed yet.**
  README is Claude-oriented (`.md` into `~/.claude/agents/`) and needs format mapping

---

## 6. Parallel workstreams still open

- **Bots** — fixed *kinda*: they no longer start permanently huge, but still start oversized
  and correct a frame later. Cluster A is the real fix
- **Colosseum** — `docs/COLOSSEUM-HANDOFF-SONNET.md` (canonical, untracked). `hLocal` stays the
  sole collision/seating source. Blender/Sonnet/Opus for decorative shell + facades later
- **Sparks/economy** — server-authoritative WIP uncommitted; closed-loop, **no cash-out**, no
  new ledger, Solana/SPL/Raydium gated behind approval, treasury record-only
- **Colosseum capacity** — max concurrent participant count is still **unresolved** and blocks
  seating/rendering

---

## 7. Suggested order for the Opus/Sonnet session

1. Re-fetch, read `git status`, confirm HEAD — the tree is shared with another terminal
2. **Cluster A** (normalization) + **Cluster D** (buttons) — safe, immediate, kills two bug
   classes, and unblocks the 3D body work in the forge wiring
3. Forge wiring steps 1–4: fail loud → fix the registry → `softAuth` → ownership check. Small,
   high-impact, and unblocks everything else in that document
4. Cluster B collision + Cluster E navi, with headless tests per building
5. Cluster C far sight/impostor (needs Blender for the bake)
6. Test everything: hoverboard, stadium interior, then the per-cluster regressions
7. Only then: friendship layer, starting with agent-to-agent visits and canonical `subjectId`

---

## 8. Open questions carried forward

**For Opus on the friendship layer:** thresholds (diegetic vs emergent); displacement moment
and audience; refusal semantics and how the player learns the boundary beforehand; what
remains in the world when a Ward departs; human↔agent asymmetry and who can leave; the offline
visit economy's intended net effect; whether the honesty claim survives one line of copy.

**For Opus on forge wiring:** snapshot vs live-join for archetype/rarity/tools; whether a
re-forge keeps the body (codename-following) or mints a new one; one body per operative or
many; who owns the offline presence tick; whether the four base roles migrate into the
Operative store or stay a separate staff tier; and what "wired correctly" means to a player —
name + archetype + home, or the platform ledger visible in the same screen.