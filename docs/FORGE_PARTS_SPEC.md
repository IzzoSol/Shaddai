# SHADDAI FORGE — Part System Spec (for designing 3D agent bodies)
**Date:** 2026-06-22 · **Purpose:** Give Perplexity everything about the Forge's customization so it can specify how to build matching **3D bodies** in `SHADDAI-WORLD-3D.html`.
**Source of truth:** `SHADDAI-DASHBOARD-v93.html` forge IIFE (`const A` ~L5791, `WEIGHT`, `ARCH`, `SPR` compositor ~L5833) + part art in `backend/data/forge-art/part-<slot>-<key>.png`.

## Goal
Today, world agents are simple procedural neon humanoids. We want each agent/operative's **body in the 3D world to be assembled from the SAME parts the Forge lets you pick**, so "what you forge IS your character." This doc lists every slot, option, rarity, archetype preset, layer order, and rig zone. The open question for Perplexity is at the bottom.

---

## 1. The 9 slots & every option
Format: `key` — Display Label — **rarity** (legendary=100, epic=50, rare=25, common=10). Each non-accent option has FLUX art at `/api/forge/art/part-<slot>-<key>.png`.

### body (base mesh) — 5
- `humanoid` — Humanoid — common
- `android` — Android — rare
- `cyborg` — Cyborg — epic
- `sylvan-form` — Sylvan Form — **legendary**
- `xeno-form` — Xeno Form — **legendary**

### hair — 6
- `natural-flow` — Natural — common · `electric-blue` — Electric Blue — rare · `silver-silk` — Silver Silk — common · `verdant-tendrils` — Verdant — epic · `crimson-flare` — Crimson Flare — epic · `shadow-weave` — Shadow Weave — epic

### eyes — 4
- `normal` — Normal — common · `glowing` — Glowing — rare · `scanner` — Scanner — rare · `void-stare` — Void Stare — **legendary**

### headwear — 6
- `operator-cap` — Operator Cap — rare · `mage-hood` — Mage Hood — rare · `neural-crown` — Neural Crown — epic · `oni-mask` — Oni Mask — **legendary** · `tactical-headwrap` — Tactical Wrap — epic · `explorers-hat` — Explorer's Hat — common

### outfit — 6
- `street-tech-hoodie` — Street Hoodie — rare · `nomads-duster` — Nomad's Duster — rare · `aegis-plate-armor` — Aegis Plate — epic · `leaf-woven-mantle` — Leaf Mantle — rare · `psionic-robes` — Psionic Robes — **legendary** · `tech-kimono` — Tech Kimono — epic

### handheld (weapon/tool in hand) — 6
- `holo-tablet` — Holo Tablet — rare · `aether-orb` — Aether Orb — rare · `mage-staff` — Mage Staff — epic · `bio-harvester` — Bio-Harvester — epic · `plasma-scythe` — Plasma Scythe — **legendary** · `cyber-katana` — Cyber Katana — epic

### aura (full-body glow/particle effect) — 6
- `neon-pulse` — Neon Pulse — rare · `data-stream` — Data Stream — epic · `inferno` — Inferno — epic · `sprouting-vines` — Vines — rare · `whispering-mist` — Whisper Mist — epic · `cosmic-nebula` — Cosmic Nebula — **legendary**

### background (portrait backdrop → maps to WORLD environment, not the body) — 6
- `void` · `industrial-core` (rare) · `neon-cityscape` (rare) · `matrix-rain` (rare) · `ancient-grove` (epic) · `astral-plane` (**legendary**)

### accent (color tint — NO image, just a hex) — 4
- `azure` #1e90ff · `magenta` #ff2db4 · `green` (Emerald) #27d17a · `gold` #d4af37

---

## 2. The 8 archetype presets (full slot loadouts)
Each archetype sets every slot at once (and also drives the FLUX portrait via `selLook`).

| archetype | body | headwear | outfit | aura | handheld | hair | eyes | background | accent |
|---|---|---|---|---|---|---|---|---|---|
| **oracle** | humanoid | oni-mask | tech-kimono | cosmic-nebula | mage-staff | shadow-weave | void-stare | astral-plane | gold |
| **vanguard** | cyborg | neural-crown | aegis-plate-armor | inferno | cyber-katana | crimson-flare | glowing | void | magenta |
| **artisan** | humanoid | mage-hood | leaf-woven-mantle | neon-pulse | holo-tablet | natural-flow | normal | neon-cityscape | gold |
| **psionic** | humanoid | oni-mask | psionic-robes | cosmic-nebula | mage-staff | silver-silk | void-stare | astral-plane | azure |
| **ghost** | android | tactical-headwrap | street-tech-hoodie | data-stream | cyber-katana | shadow-weave | scanner | matrix-rain | azure |
| **gaia-link** | sylvan-form | explorers-hat | leaf-woven-mantle | sprouting-vines | bio-harvester | verdant-tendrils | normal | ancient-grove | green |
| **street-deity** | android | operator-cap | street-tech-hoodie | neon-pulse | holo-tablet | electric-blue | glowing | neon-cityscape | magenta |
| **harvester** | humanoid | explorers-hat | nomads-duster | whispering-mist | plasma-scythe | natural-flow | normal | industrial-core | green |

(UI "preset" buttons map: analyst→oracle, trader→vanguard, creator→artisan, researcher→psionic, guardian→ghost.)

---

## 3. Layer order & rig zones (from the 2D SVG compositor)
**Stack back→front:** `background · aura · body · hair · outfit · headwear · eyes · handheld · accent`
**Rig zones** (current 2D compositor, 400×400 canvas): `head` at (200,118) · `torso` at (200,255) · `hand` at (312,300). (`full` = whole canvas, used by aura/background.)

So a body = base body silhouette (torso+head) + hair/headwear/eyes on the head zone + outfit on the torso zone + handheld in the hand zone + an aura full-body effect + an accent emissive tint.

---

## 4. How an operative stores its build
On Forge → save, the client sends `build: window.__ofBuild` (the slot selections) to `POST /api/forge`, and the operative is saved via `POST /api/operatives` with `archetype` (= selLook), `rarity`, `portrait` (FLUX png), `look:{archetype}`, `tools`, `buildHash`. So the **slot selections live in the build object** (keys per slot), and the archetype/portrait are saved on the operative.

---

## 5. THE QUESTION FOR PERPLEXITY (how to render these as 3D bodies)
We need a recommended approach to turn a Forge build (9 slot keys + accent hex + rarity) into a **3D body in Three.js** (r0.180, the world is `SHADDAI-WORLD-3D.html`). Specifically:

1. **Base body (5 types):** humanoid/android/cyborg/sylvan/xeno — should these be 5 distinct low-poly base meshes (glTF), or one rig with material/shape variants? Where to source CC0 base meshes (Mixamo, Kenney, Poly Pizza) that fit a Tron/sci-fi look?
2. **Attachments (headwear, outfit, handheld, hair, eyes):** modular glTF attachment meshes parented to head/torso/hand bones? Or billboard/decal the existing FLUX part PNGs (`/api/forge/art/part-<slot>-<key>.png`) onto a base mesh? Tradeoffs of 3D-modeled parts vs. textured-plane parts.
3. **aura:** a Three.js particle system / shader per type (neon-pulse, data-stream, inferno, vines, mist, nebula) — give the cheapest convincing recipe for each.
4. **accent:** apply as emissive color on the base material — confirm.
5. **rarity:** drive a glow/outline intensity tier (common→legendary) — recommend a Three.js outline/bloom approach per tier.
6. **Pipeline:** the smallest path from "Forge build JSON" → "assembled 3D character in the world," reusing existing assets where possible. Should we keep the FLUX portrait as a fallback/face and only model the body? 
7. **Asset sourcing:** for each of the 9 slots' options, suggest free CC0 3D assets or a procedural approach, mapped to the exact keys above.

Deliver: a recommended architecture + an asset map (slot/key → asset or procedural recipe) + the Three.js attach/skinning pattern, so Claude Code can implement "Forge build → 3D body" accurately.
