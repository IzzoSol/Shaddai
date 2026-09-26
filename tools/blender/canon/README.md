# Canon world layout (Master Build Prompt, 2026-09-26)

- **The canonical map is** `fal-assets/refs/world/ATLAS-CANON-image37.jpg`, the owner's "Word of Shaddai" atlas (image 37).
  - All Blender renders (`tour-*`, `v4-*`) are interpretations, not authority.
- **Axis (fixed; don't change it):**
  - Metres. Blender +X = EAST, +Y = NORTH (Deep Void), Z = up.
  - Game units: x = X·U, z = −Y·U, where U = 7/1.8.
- **Percent system (the prompt's table):**
  - x runs 0 (west) to 100 (east); y runs 0 (north) to 100 (south). Both are measured on the disc.
  - `pos_m = ((x−50)/50·R, (50−y)/50·R)`, with R = 5000 m.
- **Source of truth:** `world-layout.json`. Every placement is derived from it.
  - Its `resolvedConflicts` records where the table contradicted the atlas or the locked disc, and why.
- **Build:** `blender -b --factory-startup --python tools/blender/canon/build_canon.py -- <repo> [step=3]`
  - Collections are named 00_ to 16_, as the prompt specifies.
  - The DEBUG view layer holds the atlas overlay (opacity 0.35), a 10×10 grid and station empties.
