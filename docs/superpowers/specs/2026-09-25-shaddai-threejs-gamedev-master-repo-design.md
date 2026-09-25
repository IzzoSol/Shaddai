# SHADDAI Three.js Game Development Master Repo — Design Spec

**Date:** 2026-09-25  
**Author:** Claude Haiku 4.5  
**Project:** SHADDAI v58.88 — Comprehensive Game Dev Framework  
**Status:** Design Phase — Ready for Implementation Planning

---

## Executive Summary

Create a **unified private GitHub repository** (`IzzoSol/shaddai-threejs-gamedev-master`) that consolidates all best practices, patterns, and tooling from 5 leading Three.js + game-dev repos into ONE comprehensive, masterfully-organized system.

**Three coexisting organizational layers:**
1. **Flat Library** — Raw reference organized by discipline (Three.js core, physics, shaders, ECS, QA)
2. **Skills Hub** — Invokable Claude skills + npm library for code reuse
3. **Genre Templates** — Start-a-game scaffolds for 6 game types (2D platformer, 3D action, puzzle, VR, isometric RPG, arcade)

**Integration:** Wired into SHADDAI's MCP so TURTLE agent can invoke game scaffolds and patterns directly.

---

## Goals & Success Criteria

| Goal | Success Metric |
|------|---|
| **Own all best practices** | All content from 5 source repos extracted and curated into master repo |
| **Multiple discovery paths** | Flat library (search), skills (invocation), genres (scaffolds) all working independently |
| **Agent-native** | TURTLE can invoke skills and genre templates via MCP bridge |
| **Production-ready** | Every pattern tested, linked to examples, documented with real games |
| **Maintainable** | Clear ownership of each section, version control, deprecation policy |

---

## Architecture

### System Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│          SHADDAI Three.js Gamedev Master Repo                   │
└─────────────────────────────────────────────────────────────────┘
                              ↓
            ┌─────────────────┼─────────────────┐
            ↓                 ↓                 ↓
    ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
    │ FLAT LIBRARY │  │ SKILLS HUB   │  │ GENRE        │
    │ (Reference)  │  │ (Invokable)  │  │ TEMPLATES    │
    └──────────────┘  └──────────────┘  └──────────────┘
            ↓                 ↓                 ↓
      [search via]   [Claude invokes]  [copy scaffold]
        grep/index     /threejs-*          → customize
                                      
            └─────────────────┼─────────────────┘
                              ↓
                    ┌──────────────────────┐
                    │  MCP BRIDGE          │
                    │  (TURTLE interface)  │
                    └──────────────────────┘
                              ↓
                    ┌──────────────────────┐
                    │  SHADDAI (MCP)       │
                    │  TURTLE agent pulls  │
                    └──────────────────────┘
```

### Three Organizational Systems

#### System 1: FLAT-LIBRARY/ (Approach 1 — Raw Reference)

**Purpose:** Single authoritative source for all patterns, organized by discipline.

**Structure:**
```
FLAT-LIBRARY/
├── three-core/
│   ├── 01-fundamentals/          (scene, camera, renderer, lights)
│   ├── 02-geometry-materials/    (meshes, textures, PBR)
│   ├── 03-loaders/               (GLTF, FBX, collada, etc.)
│   ├── 04-animation/             (skeletal, morph targets, blending)
│   ├── 05-advanced-shaders/      (custom GLSL, post-processing)
│   ├── 06-performance/           (LOD, culling, instancing, optimization)
│   ├── 07-lighting-advanced/     (baked, dynamic, volumetric)
│   ├── 08-camera-systems/        (orbit, FPS, third-person, rail)
│   ├── 09-post-processing/       (bloom, motion blur, depth of field)
│   └── THREEJS-FLAT-INDEX.md     (master index all 24 skills)
│
├── physics-engines/
│   ├── cannon-js/                (rigidbody, constraints, vehicles)
│   ├── rapier-wasm/              (performance physics)
│   ├── custom-collision/         (grid-based, raycasting)
│   └── PHYSICS-FLAT-INDEX.md
│
├── shaders-advanced/
│   ├── glsl-patterns/            (common techniques)
│   ├── pbr-materials/            (physically-based rendering)
│   ├── vfx-particles/            (custom particle systems)
│   ├── water-procedural/         (ocean, lakes, rivers)
│   └── SHADERS-FLAT-INDEX.md
│
├── ecs-architecture/
│   ├── entity-component-patterns/ (base architecture)
│   ├── system-design/            (update loops, queries)
│   ├── networking-state/         (multiplayer sync)
│   └── ECS-FLAT-INDEX.md
│
├── game-qa-audit/
│   ├── performance-profiling/    (FPS, memory, GPU monitoring)
│   ├── testing-strategies/       (unit, integration, e2e)
│   ├── accessibility/            (colorblind, motor, audio)
│   ├── mobile-optimization/      (touch, small screens, battery)
│   └── QA-FLAT-INDEX.md
│
└── FLAT-LIBRARY-README.md        (how to search/reference everything)
```

**Usage:** Developers grep/search for specific patterns. Example:
```bash
grep -r "instancing" FLAT-LIBRARY/three-core/06-performance/
# Returns all instancing techniques with examples
```

---

#### System 2: SKILLS-HUB/ (Approach 2 — Claude Invokable)

**Purpose:** Patterns packaged as invokable Claude skills + reusable npm library.

**Structure:**
```
SKILLS-HUB/
├── .claude/skills/
│   ├── threejs-scene-setup/
│   │   ├── SKILL.md              (skill definition)
│   │   ├── index.js              (core logic)
│   │   └── examples/             (working examples)
│   ├── threejs-physics/
│   ├── threejs-shaders/
│   ├── threejs-animation/
│   ├── threejs-camera-systems/
│   ├── ecs-framework/
│   ├── game-qa-performance/
│   ├── game-qa-mobile/
│   └── SKILL-REGISTRY.md         (all invokable skills listed)
│
├── lib/                          (reusable JavaScript patterns)
│   ├── three-utils.js            (wrappers, helpers)
│   ├── physics-wrapper.js        (cannon.js / rapier abstractions)
│   ├── ecs-engine.js             (base ECS framework)
│   ├── shader-compiler.js        (GLSL tools)
│   └── qa-profiler.js            (performance monitoring)
│
├── package.json                  (npm: shaddai-gamedev)
│   └── exports: skills/ + lib/
│
└── SKILLS-HUB-README.md
```

**Usage:** TURTLE invokes skills:
```
TURTLE, use /threejs-physics to set up a Cannon.js rigidbody world
→ Claude loads SKILLS-HUB/.claude/skills/threejs-physics/SKILL.md
→ Returns working physics scaffold
```

---

#### System 3: GENRE-TEMPLATES/ (Approach 3 — Start-a-Game)

**Purpose:** Complete, copy-paste scaffolds for 6 game types. Each includes architecture, assets, ECS setup, physics config, QA suite.

**Structure:**
```
GENRE-TEMPLATES/
├── 2d-platformer/
│   ├── scaffold/                 (starter project structure)
│   │   ├── index.html
│   │   ├── main.js
│   │   ├── scenes/
│   │   ├── systems/              (ECS systems)
│   │   ├── assets/
│   │   └── qa/                   (performance benchmarks)
│   ├── examples/
│   │   ├── complete-game-v1/     (fully playable example)
│   │   └── quick-prototype/
│   ├── docs/
│   │   ├── architecture.md
│   │   ├── physics-tuning.md
│   │   └── performance-targets.md
│   └── TEST-CHECKLIST.md
│
├── 3d-action/
│   ├── scaffold/                 (camera, combat, rigging)
│   ├── examples/
│   ├── docs/
│   └── TEST-CHECKLIST.md
│
├── puzzle-game/
├── vr-experience/
├── isometric-rpg/
├── arcade-game/                  (← SHADDAI SKATE fits here)
│   ├── scaffold/
│   ├── examples/
│   │   ├── shaddai-skate-v1/    (reference implementation)
│   │   └── quick-arcade-setup/
│   ├── docs/
│   │   ├── real-time-mechanics.md
│   │   ├── scoring-systems.md
│   │   └── video-generation.md
│   └── TEST-CHECKLIST.md
│
└── START-HERE.md                 (flow chart: pick game type → copy scaffold)
```

**Usage:** Developer picks game type:
```
1. Read START-HERE.md
2. Choose "arcade-game"
3. Copy arcade-game/scaffold/ → my-project/
4. Follow docs/
5. Customize systems/
```

---

### System 4: SHADDAI-MCP-BRIDGE/ (Integration Layer)

**Purpose:** Wire all 3 systems into SHADDAI's MPC so TURTLE agent can invoke them.

**Structure:**
```
SHADDAI-MCP-BRIDGE/
├── mcp.js                        (MCP resource server)
│   └── Exposes:
│       - /skills/list            (all invokable skills)
│       - /genres/list            (all templates)
│       - /flat/search?query=X    (search flat library)
│       - /flat/get?path=X        (fetch specific pattern)
│
├── turtle-interface.js           (TURTLE-specific commands)
│   └── Actions:
│       - "Build me a [genre] scaffold"
│       - "Show me how to do [skill]"
│       - "Search flat library for [pattern]"
│
├── registry.json                 (master index)
│   └── Maps:
│       - Skills → flat library entries
│       - Genres → skill dependencies
│       - Patterns → examples
│
└── INTEGRATION-README.md
```

**Integration with SHADDAI:**
- Wire into existing `mcp/` folder in SHADDAI repo
- TURTLE config includes: `resource: "shaddai-threejs-gamedev-master"`
- TURTLE can say: "Build a 3D action game scaffold"
- MCP fetches from private repo, returns working starter project

---

## Cross-System Linking (CROSS-LINKS.md)

Every piece references the others:

```
FLAT-LIBRARY/three-core/08-camera-systems/
  ↓ (links to)
SKILLS-HUB/.claude/skills/threejs-camera-systems/
  ↓ (used by)
GENRE-TEMPLATES/3d-action/scaffold/systems/camera.js
  ↓ (tested in)
GENRE-TEMPLATES/3d-action/examples/complete-game-v1/
  ↓ (performance profile in)
GAME-QA-AUDIT/performance-profiling/camera-overhead.md
```

**Cross-links file:** `CROSS-LINKS.md` maintains this graph, making it easy to:
- Follow a pattern from reference → skill → example → QA
- Understand dependencies
- Keep everything in sync when patterns evolve

---

## Source Repo Extraction Map

**5 Source Repos → 3 Systems:**

| Source | Extracts To | Priority |
|--------|---|---|
| **PlayableIntelligence/game-creator** | Arcade genre template, QA framework | 1 |
| **Impertio-Studio/Three.js-Claude-Skill-Package** | Skills hub (24 skills), flat-library/three-core | 1 |
| **CloudAI-X/threejs-skills** | Flat-library (fundamentals, GLTF, animation) | 1 |
| **Nice-Wolf-Studio/claude-skills-threejs-ecs-ts** | ECS architecture + skills hub | 2 |
| **mike007jd/game-superpowers** | QA audit + polish checklist | 2 |

**Extraction workflow:**
1. Clone each repo locally (non-destructive)
2. Audit content (code, docs, examples)
3. Categorize by system (flat/skills/genre)
4. Refactor for consolidation (remove duplicates, merge similar patterns)
5. Cross-link everything
6. Test each skill & scaffold
7. Commit to master repo

---

## Data Flow: TURTLE Workflow

**Scenario:** Owner says "TURTLE, build me a 3D action game scaffold"

```
1. TURTLE receives request
   ↓
2. TURTLE queries MCP Bridge: /genres/list
   ↓
3. MCP returns: [2d-platformer, 3d-action, puzzle, vr, isometric, arcade]
   ↓
4. TURTLE selects 3d-action
   ↓
5. TURTLE queries MCP: /genres/3d-action/scaffold
   ↓
6. MCP reads GENRE-TEMPLATES/3d-action/scaffold/
   ↓
7. Returns: index.html, main.js, systems/, assets/
   ↓
8. TURTLE generates HTML artifact showing scaffold
   ↓
9. Owner can download or clone into project
```

**For skill invocation:**

```
Owner: "TURTLE, show me advanced shaders"
   ↓
TURTLE queries MCP: /skills/list
   ↓
MCP returns all skills with tags: physics, shaders, animation, etc.
   ↓
TURTLE selects /threejs-shaders
   ↓
MCP returns: SKILL.md + examples/
   ↓
TURTLE renders interactive skill guide
```

---

## Repository Setup

**Repository Details:**
- **Name:** `IzzoSol/shaddai-threejs-gamedev-master` (PRIVATE)
- **Visibility:** Private (owner's proprietary system)
- **Default branch:** `main`
- **Initial structure:** As described above
- **README:** `README-MASTER.md` (entry point explaining all 3 systems)
- **npm package:** `shaddai-gamedev` (publishable or internal)

**Directory at:** `C:\Users\Brittany\shaddai-threejs-gamedev-master` (local working copy)

---

## Testing & Validation

Each component must pass:

| Component | Test | Evidence |
|-----------|------|---|
| **Flat Library patterns** | Copy-paste example works standalone | Working example project |
| **Skills** | Claude invokes skill → produces valid scaffold | Generated project runs |
| **Genre templates** | Download scaffold → follow docs → run game | Playable game boots |
| **MCP bridge** | TURTLE can invoke all skills + genres | MCP server responds correctly |
| **Cross-links** | All references resolve | Link checker script passes |

---

## Success Checklist (Post-Implementation)

- [ ] All 5 source repos fully extracted
- [ ] Flat-library organized and indexed (FLAT-INDEX.md complete)
- [ ] All skills packaged and documented (SKILL-REGISTRY.md complete)
- [ ] 6 genre scaffolds complete with docs + examples
- [ ] MCP bridge wired into SHADDAI
- [ ] TURTLE can invoke 5+ skills via MCP
- [ ] TURTLE can generate 3+ genre scaffolds
- [ ] Cross-links graph fully mapped (CROSS-LINKS.md)
- [ ] npm package publishable (or locked to private install)
- [ ] Entire system tested end-to-end

---

## Future Extensibility

**Potential additions post-launch:**
- AI-generated character rigs (via Fal or HuggingFace)
- Multiplayer networking layer (WebSocket, Agones)
- Monetization patterns (shop, battle pass, cosmetics)
- Custom Blender → Three.js pipeline
- Real-time collaborative editing (CRDT sync)

Each would add to appropriate system (e.g., new skill, new genre template, new flat-library section).

---

## Timeline & Effort Estimate

| Phase | Task | Effort |
|-------|------|--------|
| **P1: Extraction** | Clone 5 repos, audit content, categorize | 4-6 hours |
| **P1: Structure** | Set up master repo, folder hierarchy, READMEs | 2-3 hours |
| **P2: Consolidation** | Remove duplicates, refactor for clarity, test | 6-8 hours |
| **P2: MCP Integration** | Wire bridge, test TURTLE invocation | 3-4 hours |
| **P3: Documentation** | Fill docs, examples, cross-links | 4-6 hours |
| **P3: Validation** | Test every skill, every genre, end-to-end | 3-4 hours |
| **Total** | | ~23-31 hours |

**Suggested breakdown:**
- **Week 1:** P1 (extraction + structure)
- **Week 2:** P2 (consolidation + MCP bridge)
- **Week 3:** P3 (docs + validation + launch)

---

## Rollout Plan

1. **Create private repo** on GitHub (`IzzoSol/shaddai-threejs-gamedev-master`)
2. **Phase 1:** Extract + structure all 5 repos into systems
3. **Phase 2:** Build MCP bridge, wire TURTLE
4. **Phase 3:** Full documentation + testing + launch
5. **Go-live:** TURTLE available with full game-dev capabilities
6. **Future:** Integrate into SHADDAI CLI (`shaddai-gamedev` command)

---

## Notes for Implementation

- **Clone strategy:** Clone source repos non-destructively; don't modify originals
- **Attribution:** Credit source repos in each extracted section (e.g., "Extracted from PlayableIntelligence/game-creator")
- **Version pinning:** Lock Three.js, Cannon.js, Rapier versions per genre
- **Maintenance:** Assign one agent (NEXUS or TURTLE) as owner per system
- **Deprecation:** Mark old patterns with `[DEPRECATED]` rather than deleting

---

## Approval Gate

✅ **Design approved by:** Owner (2026-09-25)

Ready for implementation planning via `/superpowers:writing-plans`.

