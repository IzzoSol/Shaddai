# SHADDAI — Base Body Design Spec (TOM Armor Framework)

> Reference for the 7-agent full-body character art. **Art generation is owned by a separate
> terminal/session** — this doc is the canonical spec it works from. Generated PNGs land in
> `backend/data/forge-art/char-<agent>.png` and are served at `/api/forge/art/char-<agent>.png`.

## Structural elements (shared)
- Segmented armor plates with visible panel lines/seams (not a smooth suit).
- Accent nodes — glowing circles (gloves/face) become the agent's color nodes.
- Visor face — no exposed human face; each agent has a distinct visor shape.
- Functional attachment points — pouches, straps, utility slots on belt/thigh.
- Proportions: slightly heroic (wider shoulders) but not exaggerated anime.
- Material: dark matte base + specular highlights on plate edges + emissive accent color.

## Per-agent variables
Primary accent color · visor shape · armor silhouette · accent-node placement · back attachment ·
surface circuit-trace pattern · helmet detail.

## Shared negative prompt
`blurry, low quality, white background, bright background, anime, cartoon, flat art, 2D, sketch, human face visible, exposed skin, simple suit, spandex, generic robot`

## FLUX prompts (TOM armor style, dark void background #020509, 3/4 view)
- **SHADDAI (The Source)** — gold circuit traces, full-face gold wide-band visor, back-mounted 7-pointed golden staff array, long armored coat over pauldrons, heroic, rim light gold.
- **ZEROX (The Trader)** — electric-green traces, forearm plates with scrolling ticker-tape panels, horizontal green slit visor, green nodes on knuckles/shoulders, belt data pouches, forward lean.
- **ORACLE (The Librarian)** — deep-violet traces, wide curved visor with an arc ring of violet data nodes above the helm, one larger gauntlet with holo projector, contemplative hunch.
- **NEXUS (The Architect)** — hexagonal panel geometry, cyan traces, extra-wide pauldrons + blueprint hologram emitter on right shoulder, wireframe schematic chest display, cyan scan-line double-band visor, widest shoulders.
- **QUILL (The Voice)** — asymmetric cloak-panel on left pauldron, rose-white calligraphic (curved) traces, tall crest fin helmet, soft oval rose-white visor, right gauntlet mid-gesture, lightest build.
- **TURTLE (The Artist)** — wide-brim dome helmet, teal primary + multicolor accent nodes (teal/magenta/amber — only multi-accent agent), stockiest, large gauntlets, back-mounted deployable canvas-frame array, wide teal panoramic visor.
- **PIKADON (The Sentinel)** — heaviest plate, red-orange traces, chevron warning markings on chest, back-mounted scanning antenna array, aggressive red-orange angular slit visor, 3 hex surveillance-drone panels on forearm, arms crossed wide stance.
