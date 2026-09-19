# SKATE — Art Bible (v1, Gate A)
> Companion to the main `fal-assets/SHADDAI-WORLD-ART-BIBLE.md` — SKATE is a
> deliberately SEPARATE visual register from the obsidian/emerald/gold world
> spine and the neon-streetwear City-hub spine. Read `docs/SKATE-MASTER-PLAN.md`
> (or the memory file `SHADDAI_ARCADE_SKATE_REAL_VISION_20260918.md`) for the
> product/mechanic context this bible serves.

---

## §0 · THE SPINE (locked, coded)

Lives in `fal-assets/generate.mjs` as `SPINE_SKATE`, auto-prepended to every
job with `"register": "skate"` (never write it out by hand in a batch file —
that's exactly the bug that broke every early duotone-icon attempt this
session: a hand-typed style instruction fighting a hard-coded spine the
script prepends anyway).

> *Tron-grid neon street style fused with Samurai Jack graphic minimalism.
> Vibrant, saturated full-color palette (hot magenta, electric cyan, acid
> lime, deep violet, gold) glowing against near-black `#0a0612` negative
> space. Bold, uniform-width black outlines on every shape. Flat cel-shaded
> coloring in exactly three tonal bands per surface (base, mid-shadow,
> dark-shadow) — no soft gradients, no photorealistic rendering, no painterly
> blending. Clean vector-poster composition, dynamic action silhouettes, no
* text, no watermark.*

**Why this palette, not the world's obsidian/emerald/gold:** SKATE is its
own product inside the Hall, not a City-hub district — per
[[shaddai-realm-art-direction-20260918]], borrowed identities between
registers are exactly the kind of drift this bible exists to prevent.

**Reference inputs held (not yet acted on as of Gate A):** GABI neon-tech
streetwear sheet (hot-pink/lime, holding a chunky device, full body, cel
shade), a cyan/teal "@ 12" branded skater-jacket character with a
snowboard-shaped board, a magenta/gold stained-glass-textured cargo-pants
character with a matching swatch strip (the stained-glass FILL TECHNIQUE is
a specific rendering motif the owner has flagged twice, not just a color
choice), a Tony Hawk's Pro Skater in-game 3D render (trick-pose/skatepark
staging reference), a fisheye neon-signage night-city photo (map/mood
reference, tone TBD — see §3). The `C:\Users\Brittany\OneDrive\Pictures\LF2\`
folder was offered as a reference and then explicitly marked NOT NEEDED by
the owner — do not re-open it, do not block on it.

**Negative (shared, appended to every SKATE job via the same `NEG` constant
every other register uses):** text, watermark, signature, logo, low-res,
jpeg artifacts, blurry, muddy, oversaturated, garish rainbow, childish,
clip-art, stock-photo lighting, flat lighting, washed out,
purple-on-white AI-slop gradient, extra limbs, deformed, inconsistent light
direction, mismatched palette, soft gradient shading (SKATE is 3-band flat
only), photorealism, painterly brushwork.

## §1 · SLOT REGISTRY

Full machine-readable registry: `fal-assets/skate/skate-slots.json`. Every
asset SKATE needs (cast full-body + T-pose + board, environment plates,
crowd/fx silhouettes) is a named slot with a fixed spec and a `src: null`
placeholder until Gate B fills it. **Reference-static**: the registry's
shape doesn't change when the owner drops in a reference sheet — only the
`src` and generation prompt for that slot change. This is what lets "owner
images drop in later, game unchanged" (Master Plan §2.9) actually hold.

## §2 · ATMOSPHERE SHEETS

Full machine-readable vocabulary: `fal-assets/skate/atmosphere.json` — the
locked weather/accent/voice/camera-verb/model-tier vocabulary the Cinematic
Compositor (Master Plan §4) draws from. One weather seed per MATCH (same sky
across all 9 rounds), accents/voice may vary per clip. This vocabulary is
closed — the rewriter (`backend/lib/lens-rewriter.js`) accepts zero freeform
text per Master Plan §2.8, so every value a clip prompt can use has to exist
in this file first.

## §3 · MAP

Full machine-readable layout: `fal-assets/skate/map-layout.json` — 9 zones
(00 HUB through 08 ROOFTOPS), each mapped to one match spot/trick-round,
with adjacency for the future open-roam layer (Master Plan §0, §2.5: open-
roam is the long-term target, not Gate A/B scope). The fisheye neon-canyon
photo reference is mood/lighting inspiration for the HUB and ROOFTOPS zones
specifically (dense vertical signage, looking-up compositions) — the "sexy
at times" tone comment attached to that reference is an OPEN content-rating
decision, not yet resolved either direction; do not bake mature content into
any generated asset until that's explicitly decided.

## §4 · COPY LEDGER

All player-facing strings live in `fal-assets/skate/copy-bible.json` (Gate A
task A6) — every UI string referenced by slot id, never a literal in
`games/skate.html`. QUILL owns tone-lock (encouraging, no hype-slogan
language) and is the final writer of every gate report per Master Plan §7.
