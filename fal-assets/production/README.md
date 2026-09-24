# fal production — prep before a single credit is spent

Open `board.html` (double-click; works from disk). It shows every asset we are allowed
to generate, its references, its code slot, the composed prompt, and the $ gates.

## Workflow (MASTER-PLAN §4, enforced by `preflight.mjs`)
1. **Refs** — drop images into `refs/<asset-id>/` (each folder has a `NEED.txt`).
   Re-run `node fal-assets/production/preflight.mjs`; the board picks them up.
2. **Status** — edit `status` in `manifest.json`:
   `needs-ref → ready-concept → concept-approved → mesh-approved → shipped` (or `cut`).
   Only the OWNER moves an asset to `concept-approved` (after seeing the concept image).
3. **Before every paid call**: `node fal-assets/production/preflight.mjs check <id> <step>`
   — exit 1 = do not spend. Blocks: missing refs, skipped gates, non-canary before the
   canary is mesh-approved, family cap, 3rd try of the same step, and the $20 reserve.
4. **After every paid call**: `preflight.mjs log <id> <step> <usd> "note"` with the real $.

## Order of spend
agents (canary SHADDAI) → buildings (canary shop) → vehicles (canary hovercar) →
cosmetics (canary SHADDAI formal) → finisher videos (last, only if reserve intact).
Caps are policy ceilings — confirm live prices on fal.ai/models before `--go`.
