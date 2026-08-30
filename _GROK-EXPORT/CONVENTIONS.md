# House rules

Anything written for this codebase has to hold to these, or it cannot ship.

## Hard constraints

- **No build step.** Vanilla JS only. No JSX, no TS, no imports that need
  bundling. `<script src="...">` and plain functions.
- **No new dependencies** without a strong reason. Node built-ins first.
- **Mobile is the target, not an afterthought.** 390px wide. Inputs must be
  ≥16px font or iOS zooms the whole page on focus. Touch targets ≥44px.
- **`prefers-reduced-motion` must be respected** by anything that animates.

## Failure modes this codebase has actually hit

Check for these specifically — each one shipped at least once:

- **CSS specificity.** An ID selector (`#thing{...}`, 1-0-0) silently beats a
  class rule (0-1-0). If a style "isn't applying", check for an ID rule before
  reaching for `!important`.
- **`\b` inside a template literal is a BACKSPACE character**, not a regex word
  boundary. `` new RegExp(`\b${x}\b`) `` matches nothing. Double-escape it.
- **Flex/grid children default to `min-width:auto`** and refuse to shrink below
  their content. This is the single most common reason a horizontal scroller
  "does nothing" — the child inherits full content width and pushes the page
  instead. Set `min-width:0` on every ancestor.
- **`overflow-x:hidden` on `body` alone is not enough** — `html` stays
  `visible` and the page still scrolls. Both need it.
- **CSS cannot give a `<table>` a scroll parent.** `table{display:block}`
  relocates the overflow onto `TBODY` and destroys column layout. Wrap the
  table in a real `div` with `overflow-x:auto`.
- **Silent catch blocks hide real errors.** A `catch` that returns an empty
  result makes a ReferenceError indistinguishable from a valid "nothing here"
  state. Log the reason.
- **Removing markup means auditing what binds to it.** Deleting a button while
  leaving `querySelector('#it').addEventListener(...)` throws and can kill an
  entire init silently.

## Style

- Comment the **why**, especially the non-obvious constraint that forced a
  decision. The what is readable from the code.
- **Degrade gracefully.** A missing API key falls back; it does not 500.
- **Never claim something works without measuring it.** Headless Chrome for
  layout, real HTTP calls for endpoints.
- **Never invent a capability.** If a feature is not built, say so in the code
  rather than describing it as if it were.

## Security

- Never commit `runtime-keys.json` or any `hf_` / `sk-` / `gsk_` / `AIza` /
  `whsec_` string.
- Identity comes from the verified session, **never** from the request body.
- Someone else's resource returns **404, not 403** — confirming an id exists is
  itself a leak.
