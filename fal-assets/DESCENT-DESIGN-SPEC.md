# THE DESCENT THROUGH SCALE — Design Spec
### Co-authored by TURTLE (art direction) + QUILL (engineering) · 2026-07-17
*"Ancient wisdom rendered in future tech" — one unbroken, mouse-reactive, top-tier cinematic scroll.*

---

## OVERVIEW & LOCKED DECISIONS

**The experience.** A single continuous scroll that falls *inward* through scale while ascending the
Tree of Life ("as above, so below"). **APPROVED BEAT ORDER:** **molecules → grass growing into trees →
the ocean (sunlit, mouse-rippled, fish, dive to the deep) → sun & moon (day↔night) → constellations
resolving into Hebrew, then universes-within-universes → the esoteric finale (Tree of Life, Metatron's
Cube, platonic solids, chakras, frequencies) → the SH portal arrival.** (The molecule→cell→grass morph
carries the "zoom into the universe" feel; the cosmos lives in the constellations beat.) Scenes deep-morph into one another
(2–3 layers always co-present); everything drifts and reacts to the mouse. It ends on **Enter World**:
the SH sigil — a brushed-metal + neon-wire 3D emblem — splits along its seam and **irises open**, and
you pass *through* it into the 3D / pixel world.

**Locked decisions (owner-approved):**
1. **Structure:** one top-tier cinematic journey with *deep morphs* — not seven slides.
2. **Rendering:** **HYBRID** — crisp generated art as each scene's clean base (**never tinted muddy** —
   that was the prior failure), plus a real-time **WebGL shader layer only where interaction sells it**
   (the **ocean surface** and the **molecule field**); light parallax + additive accents elsewhere.
3. **Mouse-reactivity everywhere**, strongest on the sunlit water surface.
4. **Anti-muddiness is a hard rule:** overlays are additive-over-black; the hero plate is never washed.

**Two open items to resolve before spending:**
- **Seedance provider = seedancevideo.art** (confirmed by owner; keys at
  https://seedancevideo.art/dashboard/keys). The `sk-…` key is from that provider, NOT fal → add a small
  `provider` adapter to `generate.mjs` (base URL + auth header + request/poll shape) and run a cheap
  identity/whoami probe before any `--go`. Until wired, video beats are still-only so nothing is blocked.
- **Pixel-world consistency** (buildings, cars, pets, agent bodies/hair/clothing/skin tones) is a
  **separate parked sub-project** — its own spec after this one (foundation = `SHADDAI-WORLD-ART-BIBLE.md`).

---

# PART I — CREATIVE / ART DIRECTION (TURTLE)

## 0 · Palette Lock & the One Rule
Four glows. Nothing else emits light.

| Token | Hex | Role — where it is allowed to glow |
|---|---|---|
| Obsidian void | `#06080b` | The medium. Carries **80% of every frame.** Depth, negative space. |
| Neon-emerald | `#00ff9c` | **Life & matter.** Atoms, chlorophyll, caustics, the SH sigil. |
| Gold-leaf | `#e8c45c` | **Wisdom & structure.** Sacred geometry, glyphs, Tree paths, the Crown. |
| Cold cyan | `#5fe0ff` | **Energy & signal.** Quantum haze, dew, water light, star-fire — used sparingly. |

**Non-negotiable:** each beat's generated hero art is the CLEAN BASE and is **never** tinted or muddied.
Real-time canvas rides *above* (particles, ripples, glyph-bokeh, geometry lines) and *below* (parallax
void), always additive-over-black. Interactivity is *jewelry set into the plate*, not paint smeared over it.

## 1 · The Throughline
We fall inward and climb upward in the same motion — every plunge in scale is a rung up the Tree toward
the Crown. **Three layers are always co-present:** as beat N leaves the top, beat N+1 resolves up from
beneath through 15–20% of shared travel — a deep morph, never a cut. The seam is where the film is most
alive: grain surges, bloom widens, and the hidden **Metatron's-Cube wireframe** (the shared skeleton under
every scene) flashes gold for a single breath before the next world sets.

## 2 · The Beats
*(mood · palette & light · camera · mouse-feel · morph-out)*

**1 · QUANTUM LATTICE — Malkuth.** Reverent stillness before creation. Obsidian frame; emerald atoms,
gold Seed-of-Life bonds, cyan probability-clouds breathing; god-rays refract through the crystal;
rim-lit glass nodes; extreme DOF. **Camera:** slow dolly-in → fractal-zoom through a Flower-of-Life
aperture (three nested gates), rack-focus near→infinite. **Mouse:** parallax breathing; hovering a node
swells its cyan cloud — the atom notices you; heavy inertia. **Morph→Grass:** hex-lattice blooms into
cell-structure, bonds become leaf veins, cyan haze condenses into chlorophyll; Metatron flashes.

**2 · GRASS & TREES — Yesod.** First life; awe from below. Worm's-eye up through towering translucent
emerald blades, cyan dew-lenses, gold Flower-of-Life flowers; low raking god-rays; layered DOF.
**Camera:** crane-up through the blades → rack-focus dive *into* a dew droplet. **Mouse:** the cursor is
wind — blades bend away and spring back, pollen swirls in its wake. **Morph→Ocean:** push into the dew
droplet until its meniscus becomes the ocean surface; the meadow drowns as dew-lenses merge.

**3 · THE OCEAN — Hod/Netzach — ★ SHOWSTOPPER.** Emotional summit of act one. Above: clear sunlit
surface, cyan/emerald glints, gold specular sparks, anamorphic sun-streaks. Below: obsidian depth with
caustic **cymatic Flower-of-Life** light-nets, gold bioluminescent motes, god-ray shafts, fish as dim
silhouettes. **Camera:** level with the glinting surface → vertical crane-down dive piercing the water
membrane in slow-mo into the deep. **Mouse:** THE centerpiece — the cursor drags real, slow, sacred
ripples that distort the sun-glints and refract the sky, ringing outward in Flower-of-Life symmetry;
below, the cursor is a current caustics bend toward and fish veer from. **Morph→Sun&Moon:** rise, break
the surface in slow-mo; sun-shafts resolve into a cresting sun; caustics become Earth's horizon-light.

**4 · SUN & MOON / EARTH — Tiferet — day↔night.** The balance-point. Earth's curved horizon; sun with
emerald-gold corona; terminator sweeping into obsidian night glittering cyan city-lights; Moon
gold-rimmed opposite; the Metatron wireframe ghosts over the curvature. **Camera:** high orbital drift →
**passes THROUGH the planet** (dimensional-fold), emerging into cosmos, Earth shrinking to one star.
**Mouse:** the cursor is a gravitational tide — drift nudges the terminator (turn the world day↔night);
corona flares lean toward it. **Morph→Cosmos:** Earth's city-lights detach into a star-field; the planet
slots into the cosmic web.

**5 · CONSTELLATIONS & COSMOS — Chesed/Gevurah/Binah.** Awe at the largest scale, then the turn: the
vastness is *written* and *fractal*. ~80% obsidian, cosmic-web filament chains in emerald+cyan, a ringed
gas-giant with gold rings, nebula god-rays. **Two payoffs:** star-clusters align into astronomically
accurate constellations that resolve into the **22 Hebrew letters** (sky-writing, never type); and the
camera dives into a galaxy core to find **universes within universes** — the Beat-1 lattice hiding at the
heart of a galaxy. **Camera:** fly-through → full fly-AROUND the ringed planet → fractal-zoom into the
core. **Mouse:** cosmic hand — parallaxes nebula depth, coaxes clusters to complete their constellation,
nudges the ring's angle. **Morph→Tree:** the rings straighten into Tree pathways; filaments become the 22
paths; bright galaxies snap into the 10 Sephiroth.

**6 · THE ESOTERIC FINALE — the ascent revealed.** Revelation; everything hidden in bokeh/seams now
stands fully lit. The **Tree of Life** in obsidian space — 10 chakra-mapped Sephiroth on 22 gold paths;
the **Metatron's Cube** now fully visible (payoff: it was always there); the five **platonic solids**
rotating at its vertices; the full **chakra spectrum** as a vertical ladder up the central pillar;
**cymatic** standing-wave rings at the base; a Jacob's-ladder shaft to the Crown; densest glyph-rain.
**Camera:** slow reverent vertical dolly-up the central pillar, god-rays streaming down past us.
**Mouse:** hovering a Sephira ignites its chakra-node and sends light along the gold paths — you wire the
Tree alive. **Morph→Arrival:** paths converge; beneath the Kether halo the emerald SH sigil resolves.

**7 · ARRIVAL — Kether, the Crown & the SH sigil.** Triumph held in reverence — an enthronement, not an
explosion. Emerald SH sigil with glitch-scan energy, blazing gold Kether halo, cyan Seed-of-Life aura
rings, hairline Metatron/Hebrew frame, god-rays from above — the one frame where all four colors glow at
full because the darkness earned it. **Camera:** slow push-in to a held, breathing hero frame. **Mouse:**
the sigil is alive — aura rings and glitch-scan chase the cursor; a single emerald **Enter World** CTA
pulses (the only UI in the piece). **Morph→THE WORLD:** the SH Portal (§4 below).

## 3 · The Accumulating Esoteric Overlay
"Everything at once" happens by *clean accumulation*, never by muddying the art. Three additive-over-black
channels build across the journey:
- **A · Chakra Ignition Ladder:** one chakra ignites per beat (root→crown) as a faint bloom deep in the
  bokeh (never an accent light), assembling into the vertical ladder by Beat 6, collapsing to Crown-white
  at arrival. The viewer never notices it igniting — only feels the spectrum has arrived.
- **B · Metatron Skeleton at the Seams:** invisible within a beat, flashes gold for one frame at each
  morph, fully visible only at the Tree finale — its reveal reads as *recognition*.
- **C · Bokeh Glyph-Rain:** hairline gold Hebrew/alchemical glyphs drift in the out-of-focus background,
  density rising monotonically — sparse at the lattice, torrential at arrival. Every frame falls through a
  living grimoire, adding richness without competing with the hero subject.

## 4 · The SH Portal Climax
The SH sigil is an **agentic emblem** of brushed gunmetal + neon wire, in real space, catching light.
- **Materials:** anisotropic brushed obsidian-steel body (vertical brushing → streaking highlights);
  SH letterforms in emerald neon tubing set *into* machined channels, casting real emissive spill; a
  hairline **gold seam** down the center (invisible until it becomes a door); cyan Seed-of-Life aura +
  gold Kether halo.
- **Iris animation on Enter World:** (1) Charge 0–400ms — neon brightens, glitch-scan accelerates, aura
  contracts inward (inhale). (2) Split 400–700ms — gold seam ignites, sigil splits into two brushed-metal
  halves parting like temple doors, revealing hollow channels of light. (3) Iris-open/flood 700–1200ms —
  volumetric emerald-gold god-ray beam widens front-to-camera; halves slide past frame edges, highlights
  streaking; screen consumed by threshold light. (4) Arrival 1200ms+ — whites-through and resolves *into*
  the world beyond; the portal's light *is* the next world's sky. No cut.

## 5 · TURTLE's Discipline
Darkness carries 80% of every frame; only four colors ever glow. Esoterica lives in the bokeh and the
seams — it whispers. Vows: never tint the hero art; reveal don't decorate (accumulate toward payoffs);
one camera move per beat; let it breathe (slow eases, held finals). If a frame ever looks busy, the fix is
*more darkness*, not less light.

---

# PART II — TECHNICAL DESIGN (QUILL)

## 0 · Constraints
Vanilla JS, Node/Express, **no bundler, no React**; self-contained pages; plain `<script>` scene modules.
The existing `journey.html` shell + `scene-*.js` contract stays and is *extended*, not replaced. Owner
views the deployed site (work is local/unpushed) — nothing is "done" until it survives headless verify AND
is deliberately pushed. Shaders/motion can't be judged headless — final feel needs a real GPU browser.

## 1 · Architecture — the layer stack
```
#stage (fixed; inset:0)
 ├─ <canvas id="gl">   z1  WebGL2  — interactive shader layer (ocean, molecules)
 ├─ <canvas id="art">  z2  2D      — crisp generated bases + parallax + additive accents
 └─ <div    id="ui">   z3  DOM     — scroll spacer, a11y, progress, reduced-motion
```
**Decision: two stacked canvases** (2D art *over* WebGL), composited by the browser. Zero build tooling;
the crisp-art layer can't be muddied by a shader (the prior failure); GPU-composited; layers resize/DPR
independently; shader layer created lazily + survives context-loss without touching the art. *Rejected:*
single-WebGL (forces all art + text through GLSL, re-introduces the tint-muddy risk for only 2 shader
beats) and OffscreenCanvas/worker (Safari/iOS friction; not currently main-thread-bound).

**Extended scene contract** — additive `gl` hook; scenes without it behave as today:
```js
{ id, label, init, resize, draw,             // 2D layer, unchanged
  gl:{ init(glenv), resize(glenv), draw(glenv,p,mouse,t), dispose(glenv) } }  // OPTIONAL
```
One shared WebGL2 context; scenes allocate their own programs/FBOs in `gl.init`, free in `gl.dispose`
(lazy on entering the morph window, disposed on leaving, with hysteresis). `webglcontextlost/restored`
handled → `GL_OK=false` flips every shader scene to its 2D fallback, no throw.

## 2 · Morph Engine
Scroll scalar `s∈[0,1]`; scenes occupy overlapping windows. **Active set = ≤3 scenes** (outgoing,
incoming, shared connective). Per scene: `p.local` (in-scene camera), `p.gt` (global), `p.alpha` (fade
weight). **Anti-muddy cross-dissolve:** eased *complementary* alpha ramps (outgoing holds near-full until
~60% then drops; incoming stays subtle until ready) so the midpoint is never "both at 50%"; plus
**geometric seam masks** (iris, horizon wipe, radial zoom-through for the fractal beat, caustic dissolve).
**Hard z/alpha rules:** exactly one opaque hero base at a time; all overlays additive (`lighter`/`screen`),
never semi-opaque `source-over` slabs; alpha reset to 1.0 each scene; shader gets no tint slab either.

## 3 · Mouse-Interaction Model
One shell-owned `pointer` passed to every layer: `{x,y, nx,ny(-1..1), vx,vy, speed, gaze{gx,gy}, down,
active}`, with a **fast ease** (position/velocity → ripples) and a **slow ease** (`gaze` → parallax depth,
no jitter), all dt-normalized. Parallax: each layer has depth `d∈[0,1]`, `offset = nx * PARALLAX_MAX * d`
(backgrounds barely move, foreground most; scales down on lowfx, ~0 on reduced). Water shader consumes the
pointer as a **force injector** (`u_pointer, u_pointerVel, u_pointerSpeed, u_down`) into a ping-ponged
ripple field so ripples propagate + decay, not snap.

## 4 · Shader Plan (two shaders only)
**Ocean (WebGL2):** (1) ripple sim FBO ping-pong (~256², pointer injects impulses → height→normal); (2)
surface shading — scrolling noise normals for idle swell, sun-glint specular + threshold bloom, refraction
sampling a "below/fish" texture via surface normals, Fresnel reflect↔refract mix; (3) `u_dive` (p.local)
lowers the camera through the surface → deep. **Molecule (WebGL2):** GPU particle field (transform-
feedback), curl-noise drift + cursor attraction/orbit, additive soft bloomable points; N scales with
`env.q`. **Fallbacks:** each shader scene ships a complete 2D version in its normal `draw` (ocean = crisp
art + additive ripple sprite + caustic sprites + glints; molecules = a few thousand 2D additive dots with
inverse-square pull) used when `GL_OK=false` or `lowfx`. The shader is enhancement; no scene hard-depends
on GL.

## 5 · Asset & Prompt Pipeline
Crisp **FLUX stills** are each beat's base (layered fg/mg/bg plates for parallax where needed); **Seedance
video** only for moving beats (fractal zoom-through, portal, ambient loops where a static plate reads
dead). Prompts are **deep, reference-grounded, stored in batch manifests** (not ad-hoc), versioned with a
seed, palette-locked in-prompt, lighting matched to the ocean's `u_sunDir`, negatives ban text/watermark/
muddy-desaturation. Flow: `fal-assets/manifests/descent-<beat>.json → generate.mjs (dry-run → --go) →
public/assets/descent/<beat>/ → headless verify (loads, decodes, dims, wired)`. **NEW Seedance key:** `sk-…`
≠ fal → **confirm provider + add a `provider` adapter to generate.mjs before any --go**; do a cheap
identity/whoami probe first; until confirmed, all beats are still-only. **Budget/phasing:** stills before
video; spend order = ocean plates (horizon+fish) → other beat bases → fractal-zoom + portal → ambient loops
last; every dry-run plan kept for audit; regenerate by seed.

## 6 · Performance & Fallbacks
DPR clamp + existing FPS governor (buffer size steps 2→1.5→1 on FPS drop); `env.q`/`lowfx` tiers scale
particle counts, shader features (bloom, caustic octaves, sim res), parallax, and video-vs-poster;
active-set culling frees off-window GPU resources; WebGL-absent → 2D fallbacks everywhere (logged once);
asset 404/decode-fail → **palette-gradient placeholder, never blank/throw**; `prefers-reduced-motion` →
drift off, velocity damped, video→static, seams→quick fades; `gl.dispose` frees GPU on exit, no unbounded
texture growth.

## 7 · Verification Plan
**Honest framing:** headless proves *no errors + budget*, not *feel*. Automated gates (puppeteer):
(1) 0-console-errors across a scripted 0→1 scroll — the hard gate; (2) per-scene + per-seam FPS/draw-cost
microbenchmark at high `q` and `lowfx`; (3) WebGL-disabled run (fallbacks render, no throw); (4)
asset-missing run (placeholder, journey completes); (5) reduced-motion run. **Visual:** screenshots at each
scene core AND each seam midpoint (seams are where muddiness appeared — reviewed for a clear hero + clean
additive overlays), golden-diff on re-runs. **Every report states:** headless green ≠ validated motion/feel
— that needs a real GPU browser + moving the mouse.

## 8 · Phased Build Order (each phase independently shippable + verifiable)
- **Phase 1 — Shell + hybrid layer + crisp bases.** Stacked `#gl/#art/#ui`, pointer state, extended
  contract + GL lifecycle/context-loss, all beats as crisp-art-only 2D scenes (molecule/ocean use their 2D
  fallbacks for now), FLUX still bases via manifest + placeholder loader. *Ship:* full scroll, 0 errors,
  budget met hi+lo, all beats read finished. A complete experience on its own.
- **Phase 2 — Ocean shader.** Add the ocean `gl` (ripple sim, glint+bloom, refraction to fish, Fresnel,
  `u_dive`), pointer force; keep the Phase-1 2D ocean as certified fallback. *Ship:* ripples work, dive
  works, WebGL-absent gate still passes; human GPU feel review.
- **Phase 3 — Morph engine + esoteric overlay + molecule shader.** Complementary ramps, geometric seam
  masks, connective-layer, radial zoom-through; molecule shader; esoteric finale art + additive glow.
  *Ship:* seams read clean (verified on seam screenshots), 2–3 layers co-present without greying.
- **Phase 4 — Seedance video + SH 3D portal.** Gate on Seedance provider confirm + adapter + identity
  probe; wire moving beats with poster fallbacks; build the SH portal arrival (3D/video) with 2D fallback.
  *Ship:* video loads with posters, portal lands, all §7 gates pass, spend audited via dry-run logs.

## 9 · Key Tradeoffs (honest)
Stacked canvases > single-WebGL (simpler, protects crisp art; loses cross-layer post — fine for 2 shader
beats). Shaders as enhancement not foundation (never blank/broken; costs building 2 beats twice). Stills-
first, video-last (looks finished before spend; never blocked on the unconfirmed provider). Headless verify
is a floor not a ceiling (catches errors/budget cheaply; motion/feel still needs a real browser pass).
