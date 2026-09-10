# The Hall — 7 Office Rooms + Forge Revamp — Design Spec

**Date:** 2026-09-10
**Status:** Design — awaiting user review before writing implementation plan
**Parent doc:** `docs/SHADDAI_HALL_MASTER_BUILD_BIBLE.md` (Phase 1 of its build order)

## 1. Context

Two decisions were made and tested before this spec:

1. **New separate dashboard section**, not merged into the existing "Office" view (`showView('office')`,
   which is the land-economy system — city/treasury/rooms/plots — and stays untouched). The new
   section is called **"The Hall"**.
2. **Character system: extend `pixel-people.js`**, not a new fal-generated sprite sheet. Tested
   directly: two `flux/dev` generations both produced front-facing smooth-cartoon portraits, not
   isometric transparent game sprites, regardless of prompt engineering. `pixel-people.js` is
   canvas-drawn (isometric and transparent by construction) and already renders every character in
   `game.html` — extending it costs no fal spend and guarantees visual consistency.

Grounding facts (from `MASTER_BUILD_BIBLE.md`'s reality check, still true):
- Every agent is already invokable from the frontend via `POST /api/agents/route` with
  `{agent: 'NEXUS', agentName: 'NEXUS', message: '...'}` — used dozens of times already across
  `index.html`. No new backend is needed for "talk to this agent."
- `showView(v)` is the dashboard's view router: it looks up `document.getElementById(v + 'View')`
  and toggles a `.active` class. A `worlds`-style view can be PIN-gated the same way if ever
  needed (not needed here — the Hall is not gated).
- `pixel-people.js` exposes `PixelPeople.draw(ctx, rig, sx, sy, scale, t)` and a `PRESETS` array of
  `{name, rig}` — no office/job/tint concept yet.
- The player's saved character lives at `localStorage['shaddai.player']` as `{name, rig, source}`
  (written by `game.html`, already read by the dashboard's WORLD entry tile from an earlier task).

## 2. Goals

- A new "The Hall" dashboard section with 7 rooms, one per council agent, each a themed front door
  to that agent's existing `/api/agents/route` capability.
- Extend `pixel-people.js`'s preset/rig shape with office/job/class-tint fields (additive, backward
  compatible — the existing 100 `PRESETS` keep working unchanged).
- Revamp the Forge/character creator to: pick an office → pick a preset or tune sliders → preview
  → save an instance. The saved instance shows in its office room AND in the 2D world (reusing the
  existing `shaddai.player` localStorage read path already wired into `game.html` and the
  dashboard's WORLD entry tile).

## 3. Non-Goals

- No new backend routes for agent chat — reuse `/api/agents/route` as-is.
- No fal/image-generation spend in this phase (per the resolved sprite decision).
- No changes to the existing "Office" (land economy) view.
- No PayBox/x402/turtle_image fuel-meter work — that's Phase 2 of the master bible, separately
  scoped and gated on a security pass before it touches real payments.
- No per-room bespoke backends — each room's "tools" are UI wrappers around existing agent/tool
  endpoints (e.g. ZEROX's room can surface `zerox-scan.js`'s existing capability; it does not get
  a new trading engine).

## 4. Design

### 4.1 `pixel-people.js` preset extension

Add three optional fields to the rig/preset shape, non-breaking for existing 100 presets:
- `office`: one of `shaddai|zerox|oracle|nexus|turtle|quill|pikadon` (or `null` for a
  non-office-affiliated preset — the existing 100 presets default to `null`).
- `jobTint`: one of `coder|designer|writer|researcher|trader|coach|builder|null`.
- `classTint`: one of `warrior|mage|rogue|cleric|ranger|bard|null`.

Add 7 new named presets (one per office lead), each with a palette recognizably related to that
agent's existing brand color (already defined in `game.html`'s `AGENTS` array — reuse those exact
accent colors so the Hall and the 2D world read as the same character). `jobTint`/`classTint`
presets can be built by palette-shifting the existing generic `ARCH` archetypes already in
`pixel-people.js` — no new rendering code needed, only new preset data entries.

### 4.2 The Hall — dashboard section

- New nav entry, placed next to the existing "Office" nav button (same nav row/pattern, same
  `.nav-btn` styling) → `showView('hall')`.
- `#hallView`: a corridor/grid of 7 room cards, one per agent, each showing that agent's accent
  color, name, role, and a small idle-animated portrait (via `PixelPeople.draw`, reusing the same
  canvas-tile pattern already built for the dashboard's WORLD entry tile).
- Clicking a room opens that agent's panel (either inline expansion or a dedicated sub-view,
  matching whichever existing Office-sub-tab pattern `switchOfficeTab` already establishes — follow
  that convention rather than inventing a new one).
- Room panel contents (MVP): agent portrait, one-line flavor text, a message box that calls
  `/api/agents/route` with that room's fixed `agent` field (reusing the exact fetch pattern already
  used at `index.html:22811`/`23025`/etc.), and the response rendered inline. A "last receipt" line
  can reuse whatever ledger read (`ledger_summary`) is already surfaced elsewhere in the dashboard,
  if one exists in this exact shape — confirm during implementation rather than assuming.
- If the visiting player has a saved character (`localStorage['shaddai.player']`) whose `office`
  matches this room, show their forged agent standing in the room too, alongside the fixed agent
  lead — this is the "instance appears in that office" requirement from the bible.

### 4.3 Forge revamp

Extend the existing character creator flow (the `create` state in `game.html`, and/or a
dashboard-embedded version — confirm which surface during implementation, since the bible wants
saves visible on both the dashboard and in `game.html`):
1. Pick office (7 choices, using the new preset field).
2. Pick a preset for that office, or tune palette/tint sliders.
3. Preview idle + walk (reuse `PixelPeople.draw` with `rig.anim` toggling, same as `game.html`'s
   existing character-create preview).
4. Save → writes `localStorage['shaddai.player']` with the new `office`/`jobTint`/`classTint`
   fields added to the existing `{name, rig, source}` shape (additive, doesn't break `game.html`'s
   existing reader).

## 5. Testing / Verification

- Manual check: the existing "Office" (land economy) view is completely unaffected — no shared
  DOM ids, no shared functions renamed.
- Manual check: all 100 existing `pixel-people.js` presets still render identically (new fields
  are optional/additive, not required).
- Manual playtest: pick an office + preset in the revamped Forge, save, confirm the instance shows
  in both the matching Hall room and the 2D world.
- Confirm `/api/agents/route` calls from each room panel actually reach that agent (not
  accidentally hardcoded to one agent across all 7 rooms — an easy copy-paste mistake given they're
  near-identical templates).

## 6. Open items for implementation time (not blocking this spec)

- Exact nav placement for "The Hall" entry point.
- Whether room panels are inline-expand or a sub-view, following whatever `switchOfficeTab`
  establishes as the existing convention.
- Whether a "last receipt" element is realistic to wire in this pass or deferred.
