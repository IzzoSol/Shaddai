# SHADDAI Pixel World — Upgrade Design Spec

**Date:** 2026-07-17
**Status:** Design — awaiting user review before writing implementation plan
**Owner build:** `C:\Users\Brittany\Desktop\SHADDAI MASTER FINAL BUILD` (git `main`)

---

## 1. Goal

Upgrade the pixel world we started in the dashboard into one continuous, bright, dense,
**eBoy-style** isometric MMO region — many cities/biomes in one world — built so it can grow
**exponentially** with zero ongoing cost. Both the embedded dashboard office and the standalone
city page share one engine, so every upgrade written once appears in both.

This is a **plan-only** deliverable. No code is written and nothing is spent until this spec is
reviewed and an implementation plan is approved.

---

## 2. Locked Decisions (do not re-litigate)

These were decided during brainstorming and are the ground truth for the whole build:

1. **Style Spine v2 = Bright eBoy.** Crisp isometric pixel art, 2:1 projection, sharp edges,
   **bright and saturated** (green grass, colorful crowds/vehicles/tents), chunky/boxy geometry
   with dense readable micro-detail, flat cel shading + light ambient occlusion, single
   upper-left 45° light. Reference: eBoy naval-festival pier + eBoy vehicle grid (user Images 1 & 3).
   - This **overrides** the old dark obsidian/emerald art-bible palette *for the pixel world.*
   - The dark cinematic **Descent** scenes (`journey.html`) keep their own moody register and are
     out of scope here. Two registers coexist; they do not mix.
2. **Assets are 100% authored in code.** Every asset is a parametric Canvas-2D draw function or a
   pixel-data sprite, authored by Claude, rendered by the browser, baked-and-cached at load.
   **No fal.ai, no external API, no Blender, no image generation, no spend — anywhere.** The
   art-bible's paid fal pipeline (`fal-assets/generate.mjs`, batches) is **not used** by this plan.
3. **Shared engine.** Extract a new `public/pixel/pixel-core.js` that both the dashboard office
   module and the standalone city page consume (brainstorm approach "A"). Upgrades are written once.
4. **World model = one region, many places/biomes** (Pokémon-region style, user Images 2 & 5), NOT
   7 agent-colored districts. Geography is driven by place + biome, each with its own natural
   palette. The 7 SHADDAI agents live in the world as characters/NPCs with home bases, but do **not**
   own color-coded zones.
5. **Overworld map** is a separate painterly bird's-eye register (Image 2/5) used as the region map /
   fast-travel view — not the walkable tile world.
6. **Scope = full world**, phased, parallel-agent friendly, TURTLE art-direction lead.

---

## 3. Non-Goals (explicitly out of scope)

- Clay / claymation render style (filed as "someday").
- Any dark-obsidian recolor of the walkable pixel world.
- Any paid asset generation (fal, Midjourney, local SD, etc.).
- Blender / external 3D tooling.
- Reworking the cinematic Descent (`journey.html`) scenes.
- Real x402 / on-chain payments (hooks may exist but stay inert).

---

## 4. Architecture

### 4.1 File layout

```
public/pixel/
  pixel-core.js      NEW. The one engine. No DOM ownership, no mount lifecycle.
                     Pure library. Exports:
                       - iso projection (isoToScreen / screenToIso)
                       - camera-fit (fitCamera)
                       - color utils (shade, tint, palette, biome tinting)
                       - TILE atlas + biome definitions
                       - sprite rig: body + clothing-layer + weapon-layer compositor
                       - component library (windows, wheels, awnings, tents, people-parts, ...)
                       - parametric asset factory  asset(kind, skin, params)
                       - pathing (BFS on walkable grid)
                       - day/night + lighting model
                       - particle FX (water ripple, lava bubble, embers, foam)
                       - offscreen bake+cache helper (draw once, blit many)
  pixel-office.js    REFACTORED from existing 2230-line file. Keeps window.PixelOffice public API
                     (mount/unmount/addCollectable/onPay/selectAgent/syncAgents), multiplayer,
                     forged-operative roster, nav-doors. Delegates ALL drawing + math to pixel-core.
                     Represents the small office/city-core map.
  pixel-world.js     NEW module extracted from pixel-city.html's renderer. Large-map "region"
                     mode of the SAME core. Drives the multi-biome walkable region.
pixel-city.html      Thin shell: loads pixel-core + pixel-world, owns only its canvas + page chrome.
```

### 4.2 The asset factory — how "authored in code" scales

`pixel-core` never regenerates a category from scratch. It exposes:

```
asset(kind, skin, params) -> bakedSprite   // e.g. asset('car', {body:'#e33', roof:'#222'}, {type:'van'})
```

- Today `asset()` composes the sprite from **procedural draw functions + the component library**,
  bakes it to an offscreen canvas once, and caches it by a `kind|skin|params` key.
- "One neutral, many reskins" (art-bible §0.5) is realized as **one draw function + a params/skin
  object → unlimited variants for free.** Example: a single `drawCar({body,roof,accent,type})`
  reproduces the entire eBoy vehicle grid (user Image 3).
- **Exponential growth:** adding one component part or one skin param yields dozens of new variants
  with no regeneration and no cost.
- Because output is a cached bitmap, runtime cost matches the perf discipline already in
  `pixel-office.js` (single rAF, offscreen-pause via IntersectionObserver, DPR cap).

### 4.3 Shared constant surface

Palette, tile atlas, biome table, and the sprite-rig region map are exported from `pixel-core` so
office and world read one source of truth. No duplicated `shade()` / iso math / person-draw code
(the current duplication between `pixel-office.js` and `pixel-city.html` is eliminated).

---

## 5. World Structure — one region, many places

Bright eBoy walkable locales, connected by roads/rail, each with its own biome palette:

| Locale | Biome / palette | Signature content |
|---|---|---|
| **City core** | urban / vivid | skyscrapers, plaza, crowds, tents, festival (eBoy pier energy) |
| **Suburbs** | grass / pastel | houses, winding streets, yards |
| **Beach & harbor** | sand + cyan water | docks, piers, **boats**, boardwalk crowds |
| **Airport** | tarmac / grey-blue | runways, terminal, planes, hangars, control tower — **with its own dock + boats beside it** |
| **Volcano / lava fields** | obsidian + magma glow | lava tiles, ember FX, obsidian spires |
| **Desert canyon** | warm sand / mesa | canyons, rock arches, dunes |
| **Industrial zone** | grey / smokestack | power-plant, tanks, pipes, cranes |
| **Dome / observatory** | white + glass | science dome, telescope, labs |
| **Wilderness / park** | green forest | trails, trees, water, fading to map edges |

- **Airport detail (user request):** the airport includes a **waterside dock with boats** adjacent
  to the runways/terminal — seaplane/harbor tie-in between the airport locale and the water.
- **Region map:** a painterly bird's-eye overworld (Image 2/5 style) provides the whole-region view
  and fast-travel between locales. Separate register from the walkable tiles.
- **Agents:** each of the 7 has a home base / building somewhere in the region as an NPC you can meet
  and chat (reusing existing `window.PixelOffice` chat + forged-roster wiring), but they do not
  brand or recolor the geography.

---

## 6. Phase Roadmap (all free — no money gate)

Phases 1–9 are independently verifiable in the browser. There is **no paid phase**; the former
"ART / fal" gate is deleted.

| Phase | What | Depends on | Lead |
|---|---|---|---|
| **0** | Extract `pixel-core` from office; office delegates to it. **Invisible refactor** — parity gate: office looks/behaves identically. | — | NEXUS |
| **1** | Terrain & biomes tile atlas (grass/lava/water/stone/sand/tarmac) + transitions + water/lava/ember FX + prop clusters. Authored in code. | 0 | TURTLE + NEXUS |
| **2** | Body rig: neutral humanoid + 7 agent skins + citizen pool + pets + forged blanks. Parametric. | 0 | TURTLE |
| **3** | Separable clothing/gear layers + headwear (equip overlays). | 2 | TURTLE + NEXUS |
| **4** | Weapons/tools + sports props (wire to existing `skillplay.js` / `affinity.js`). | 2 | NEXUS |
| **5** | Vehicles (the `drawVehicle` factory → full eBoy grid) + boats + **airport planes** + harbor/street density. | 1 | TURTLE |
| **6** | Food/market goods + Bazaar stall composite. | 1,2,3 | TURTLE + QUILL |
| **7** | Buildings: per-locale building factory + hero cutaway building (Image 4 content) + city-core plaza. | 1 | TURTLE |
| **8** | `pixel-world.js`: large multi-biome region map + locale layout + **airport & dock** + roads + region/fast-travel map; standalone `pixel-city.html` adopts the shared core. | 0,1,5,7 | NEXUS |
| **9** | Crowd/event scenes + ambient life (festival density, lantern-drones, pets weaving). | 2,3 | TURTLE |

Phases 1–7 are largely independent slices of the core and can run as **parallel agents** after
Phase 0 lands, with TURTLE owning cross-phase style coherence and SHADDAI signing off.

---

## 7. Verification & Safety

- **Phase 0 parity gate (hard):** after extraction, the dashboard office must render and behave
  identically (screenshot before/after; every `window.PixelOffice` hook intact; `?v=` bump). Any
  regression = fail.
- **Every phase:** headless load with **0 console errors**; perf budget held (single rAF,
  offscreen-pause, DPR cap); before/after screenshot captured.
- **Backups:** `.bak-*` copy of `pixel-office.js` and `pixel-city.html` before edits (standing
  practice in this repo).
- **No-spend guardrail:** the plan contains no call to `fal-assets/generate.mjs --go`, no API keys,
  no network asset fetch. Assets are code only.
- **No legible text rule** (art-bible §11.6) still applies to authored assets: signage = glyphs/icons.

---

## 8. Cross-reference to existing build

- **Body-swap** mirrors `roster.js` `rig:'shared'` (one skeleton, many skins).
- **Terrain tiling** mirrors `world-biomes.js` atlas-reuse (one atlas drives all instances).
- **Region layout** generalizes the existing walkable-world idea beyond `WORLD_LAYOUT.sacred`; the
  Seed-of-Life geometry is no longer the organizing constraint for the pixel region.
- **Weapon/ability art** is the visual skin for `skillplay.js` + `affinity.js`.
- **Mount/perf contract** preserved exactly from the current `pixel-office.js` header.

---

## 9. Open questions

None blocking. Implementation-plan-level details (exact tile dimensions, locale adjacency, region
map projection) are deferred to the writing-plans step.
