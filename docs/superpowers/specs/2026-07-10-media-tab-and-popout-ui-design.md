# Media Tab + Automation Pop-out UI — Design Spec

Date: 2026-07-10
Owner ask: "Optimize the media tab to be more useful — free + paid + BYOK video, a real
gallery that saves when signed in. Improve the media tab UI and the Automation pop-out
panels: thick agentic borders, bold visible close button, draggable, good spacing,
readable wording."

## Goals

1. A **genuinely free video path** that works today at $0 to the owner.
2. Keep **BYOK** (user's own key) and a **paid/funded** path, dormant until a key exists.
3. Media tab shows a **real per-user gallery** — saves when signed in, browser-only when not.
4. **Agentic-HUD** restyle of every pop-out module (Media + Automation) — thick neon
   borders, corner brackets, bold close, draggable, correct spacing, legible type.

## Non-goals

- No paid provider spend now (owner has no funds until subscription revenue).
- No new gallery backend — `/api/gallery/*` already does per-user save/list/delete.
- No React/rewrite. Incremental edits to `public/index.html` + existing backend files.

---

## Part A — Free video that actually works

There is no reliable free unlimited text-to-video API. So the free path is a hybrid:

### A1. Primary free path — client-side image→motion clip ($0, 100% reliable)
- Reuse the existing **free FLUX image** generation.
- Animate the generated image (cinematic pan / zoom / parallax) on a `<canvas>`.
- Record the canvas with **`MediaRecorder`** → export a real downloadable `.webm` (3–5s).
- Entirely client-side: no backend load, no key, always works.
- Honest label: "Free motion clip — animated from a generated image."

### A2. Secondary free path — real AI video (beta, best-effort)
- Button: "Try real AI video (beta — may be busy)".
- Calls HF LTX-Video / Wan on the free serverless tier via a new backend route.
- Fails honestly (`{ ok:false, error:'AI video model busy on free tier' }`) — never fakes.

### A3. BYOK (works today)
- Existing `/api/media-gen/video` (user's own fal.ai key). Unchanged.

### A4. Funded/paid (dormant now, revenue-ready)
- Unified `/api/video/generate` priority: **user key → owner funded key (if env set) → 503
  "unlocks soon"**.
- Per-user daily free counter in `backend/data/video-quota.json`, counts only against the
  owner-funded key (never BYOK, never A1). Flip one env var (`FAL_KEY`) to go live.
- Honest states: `needsKey`, `quotaExhausted`, `unlocksSoon`.

---

## Part B — Real gallery wiring

- On Media tab open: `GET /api/gallery?user=<currentUser>` → render grid.
- Every generated image / clip:
  - **Signed in** → `POST /api/media/save` (persist blob to disk) then
    `POST /api/gallery/save` with `{ user, agent:'OPERATOR', type, title, url }`.
  - **Anonymous** → browser `localStorage` only (existing `S.media`), with a subtle
    "Sign in to save to your gallery" hint.
- `/api/media/save` writes into a per-user subfolder; returns the stable local path used as
  the gallery `url`.
- Gallery items keep existing Copy / → Notes / Delete controls; add Download.

---

## Part C — Agentic-HUD pop-out restyle (one function, all panels)

All pop-outs route through `expandModule(cfg)` at `public/index.html:47970`. Upgrade it once:

- **Thick agent-colored border**: 2–3px solid `accentColor` + outer glow.
- **Corner brackets**: four L-shaped neon corner accents on the panel.
- **Bold close button**: large high-contrast `✕` circle top-right, hover glow (keep Esc +
  click-outside).
- **Draggable**: grab the header bar to move the panel; clamp to viewport; `cursor:grab`.
- **Spacing & legibility**: consistent header/body padding, min font sizes for labels,
  raise low-contrast muted text, aligned grids so wording is fully visible.
- Backwards compatible: same `cfg` shape (`title, content, accentColor, icon`), so every
  existing caller (agent chat, video studio, music, writer, etc.) inherits the new look.

### Media tab layout (when opened)
- Sectioned: **Generate row** (image / video / music, clear labels) → **live gallery grid**
  → empty/loading/lock states. Fix cramped rows and alignment; agentic accent header.

---

## Files touched

- `public/index.html` — `expandModule` restyle + drag; Media tab render + gallery fetch;
  free motion-clip generator; video panel states; tool-row trim.
- `backend/video-routes.js` — unify priority (user key → funded key → 503); daily quota.
- `backend/media-gen.js` — add HF AI-video beta route (A2).
- `backend/media-save.js` — per-user subfolder.
- `backend/data/video-quota.json` — new (created at runtime).

## Testing / verification

- Free motion clip: generate → confirm a playable `.webm` downloads (no network).
- Signed-in gallery: generate → reload tab → item persists via `/api/gallery`.
- Anonymous: generate → item in localStorage only, not in `/api/gallery`.
- Pop-out: open any module → thick border + brackets, drag it, bold close, Esc closes.
- Video funded path with no key → 503 "unlocks soon" (not a dead button).
