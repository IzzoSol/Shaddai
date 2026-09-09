# ZEROX·SIGNALS Design System — Neon Obsidian

Source of truth for tokens: [`design-tokens.json`](./design-tokens.json). This file explains the *rules*, not just the values.

## Where it lives
`public/simple-signals.html` is a single self-contained file (inline `<style>` + `<script>`, no build step). All tokens above are declared as CSS custom properties on `:root`, overridden per-theme via `html[data-theme="light"]`.

## The one rule that matters: reserve the gradient
The brand gradient (`--grad`, cyan → emerald → magenta) and the full glow shadow (`--glow` / `feature_glow`) are signature elements, not defaults. They appear in exactly three places:
1. The active bottom-nav tab.
2. The primary CTA (`Ask ZEROX`, `Hire ZEROX`).
3. The three feature cards on the Wallet tab (Paybox / Ask / Signal Alerts) — there are only a handful of these on screen at once.

Every dense, repeated list item (call rows, DEX cards, heat bubbles, PNL tiles) uses the cheap flat shadow (`elevation.flat`) by default. It only earns a colored glow (`elevation.up` / `elevation.down`) when the underlying data says it's actually live or trending. If you're adding a new repeated card and reach for `--glow`, stop — that's the "every card looks the same" trap. Use `--card-shadow` instead and let data (not decoration) earn the glow.

## Color-blind safety
Up/down state never relies on hue alone:
- Up = **emerald** (teal-shifted, not pure green) + `▲` / `up2` class.
- Down/risk = **red** (magenta-shifted, not pure red) + `▼` / `dn2` class.
- Caution = **amber**, visually distinct from both.

If you add a new state color, keep a redundant non-color cue (icon, label, position) alongside it.

## Type
Two families, clearly split by job, not decoration:
- **Mono** (JetBrains Mono) — every number, ticker, timestamp, label. This is what makes it read as a trading terminal.
- **Sans** (Segoe UI/Inter stack) — prose only (coin names, notes).

Don't introduce a third family. Don't use mono for prose or sans for data.

## Motion
One rule: spend it in one place. Per-tab-switch, the incoming view gets a single 220ms fade + rise (`viewIn` keyframe) — nothing else animates on tab change. Hover lift and press-scale exist on every tappable element for consistency, but hover is gated behind `@media (hover:hover) and (pointer:fine)` so it never sticks on a touch device. All motion respects `prefers-reduced-motion`.

## Accessibility baseline
- Bottom nav uses proper `role="tablist"` / `role="tab"` / `role="tabpanel"` wiring with `aria-selected`, kept in sync in `setTab()`.
- Every filter chip is a real `<button>` with `aria-pressed`, kept in sync by the shared `wireChipGroup()` helper — don't hand-roll a new chip group without it.
- The coin detail sheet is `role="dialog"` with focus moved in on open and returned to the trigger on close; `Escape` closes it.
- Global `:focus-visible` ring uses `--focus` (cyan, offset from `--bg`) — don't suppress focus outlines when adding new interactive elements.
- Inline row actions (Copy/Share) are `<span role="button" tabindex="0">`, **not** nested `<button>` — the row itself is already a button, and browsers can't validly nest interactive controls. Use the `wireRowAction()` helper (stopPropagation + Enter/Space) for any new inline action, don't add a real `<button>`.

## Extending this file
- New repeated card → default to `--card-shadow`, add an `.up`/`.down` variant only if the data has a real live/hot signal to justify it.
- New filter → real backend field only (see `state.source`, sourced from `c.source` values `boosted` / `new_pools` / `bonded` / `pre_bonding` / `trending` — verified live against the production feed, not invented categories like the dropped "sentiment" filter, which had no backing data). If you add a source filter chip, check the live distribution first (`/api/pro-signals/feed`) — `new_pools` was initially missed here because it didn't show up in a code grep, only in live data.
- New icon-only button → always needs `aria-label`.
