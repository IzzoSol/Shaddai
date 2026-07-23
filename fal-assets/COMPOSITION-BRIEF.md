# DRONE JOURNEY — Composition Brief (TURTLE)
### Atom to Crown · one continuous drone · one breath · one pattern of light

**Flow:** molecule → water → (bird from water into sky) → (past pyramid → desert → night) → constellation dome.
Source scenes (self-contained WebGL2, locked palette obsidian/emerald/gold/cyan, 4-pass HDR→bloom→ACES):
`lab-molecules.html` (molecule→water, the loved anchor + bloom REFERENCE), `lab-bird.html`, `lab-desert.html`, `lab-dome.html`.

## THE UNIFYING MOTIF
**"The sacred water reflects the stars that become the crown."** The SAME gold sacred-geometry pattern
appears 4×: molecule lattice → water cymatic caustics → pyramid apex → constellation crown (Kether).
Water is the pivot/mirror; the bird is the soul rising from the water to become a star.

## THE 3 BLEND SEAMS (never fade to black — carry a shared element across every seam)
- **A · WATER→BIRD:** ONE shared ripple buffer (water caustics + bird splash = same buffer). A bird point-of-light
  pre-echoes as a reflection in the water BEFORE it dives; the dive injects a big ripple; water layer stays alpha 1
  across the seam; mouse ripples never stop.
- **B · BIRD→DESERT:** ONE shared star buffer (bird-sky stars = desert-night stars). Bird climbs, shrinks to a
  star-glint; the gold pyramid APEX rises from frame-bottom pointing at the ascended bird; camera pulls back+up,
  desert unrolls; pyramid rim-light matches the bird's glow temperature.
- **C · DESERT→DOME:** same shared star buffer. Camera tilts to vertical; star projection lerps planar→spherical
  (same star positions, new curvature); gold constellation lines draw on (echo the molecule lattice); mouse-steer
  becomes mouse-rotate-dome; end on a gold Kether crown at zenith.

## CAMERA THROUGHLINE + PACING
One drone: descent (atom→water, LINGER) → ascent (bird up past pyramid, FAST) → rest (under the dome, LINGER).
Linger: molecule, water, dome. Fast: bird ascent, desert reveal. Matched sacred-geometry lingers bookend the film.

## GLOBAL COHESION (enforce across all 4)
One light direction (upper-frame-left rim-lights all). One bloom intensity (molecule = reference). One
mouse-effect vocabulary — EVERYTHING ripples (water, splash, sand, dome-rotate). One shared star buffer across
bird-sky/desert-night/dome. ~80% obsidian discipline (hardest in the desert — FORBID warm ambient; sand is
obsidian sculpted by cold moonlight, gold only as crest rim-light). Gold = sacred-geometry + rim-light only, never fill.

## STITCH ORDER (safest merge)
0. Shared harness: one canvas, one 4-pass pipeline (molecule's), one eased scroll `p` split into per-scene
   sub-ranges, one eased mouse, ONE ripple buffer + ONE star buffer + ONE light-dir uniform, `window.__forceP`.
1. Land molecule→water alone (anchor, bloom reference) — protect its loved feel.
2. SEAM A (water→bird) FIRST — forces the shared ripple buffer; proves the architecture.
3. SEAM B (bird→desert) — shared star buffer; pyramid rises / bird→star.
4. SEAM C (desert→dome) — planar→spherical star lerp; gold constellation lines; mouse-rotate; Kether crown.
5. Cohesion pass: equalize bloom, one light dir, mouse ripples everywhere, continuous star buffer, ~80% obsidian,
   place the 4× sacred-geometry motif deliberately.
