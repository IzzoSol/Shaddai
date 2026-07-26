# SHADDAI — Master Build Architecture (single source of truth)
_Date: 2026-07-24 · Status: APPROVED, building Phase 0_

## The unifying model
**One identity · One agent (2D + 3D bodies) · One world (3 views) · One property.**

- **You** = one signed-in account (Firebase = the only gate).
- **Your Agent** = a forged operative with an identity (name/persona/tools), a **2D pixel body**, and a **3D body (GLB)**. Same agent, two forms.
- **The World** = ONE SHADDAI City at three fidelities (not three worlds):
  - **Dashboard** — command view (agents-as-tools, workflows, markets, wallet)
  - **2D World** (game.html) — walk the pixel city (Founders' Row, offices, economy, rooms)
  - **3D World** (grid) — same city, immersive
- **Your Property** = your office/lot on Founders' Row, consistent across all three views.

## Piece → job
| Piece | Job |
|-------|-----|
| Sign in | The only gate — unlocks everything |
| Pixel Forge (2D) | Agent's pixel body + identity + tools → Save to Gallery |
| 3D Forge | Same agent's 3D body (GLB/Meshy/image-to-model) → Gallery |
| Gallery | Roster: use agent as dashboard tool / 2D char / 3D avatar / embed |
| Dashboard | Command agents + see world + property |
| 2D World | Walk the city as your agent; your lot; economy; rooms |
| 3D World | Same city + agent's 3D body + your 3D office |
| Founders' Row / Office | Your property across dashboard, 2D, 3D |
| Marketplace | Sell agents / 3D models / skills |

## Jank being removed
- ❌ All access/beta codes (incl. the 3D passcode added 2026-07-24 — reverting).
- ❌ Guest mode / skip-sign-in.
- ✅ Gating = sign-in + plan tier only. 2D = free. 3D = Pro (a plan, not a code).

## Build phases
- **Phase 0 — Foundation:** real sign-in gate everywhere (dashboard, command hub, world) with a localhost dev-bypass; remove all codes + guest; unify identity (account ↔ Firebase uid ↔ `shd_userid`).
- **Phase 1 — Forge → Gallery → 2D World:** Forge gets Save-to-Gallery + Enter-World; world loads that agent and restores last session (character, position, money, rooms). Character customization lives only in the Forge.
- **Phase 2 — Property:** Office/Rooms tab shows your office; Founders' Row lot → reserve → pick preset → walk → customize Sims-style (themes + furniture) → brand it; same office everywhere.
- **Phase 3 — 3D integration:** 3D Forge adds GLB body to the same agent; 3D World loads it + your 3D office; 2D & 3D share identity + property. 3D = Pro (no passcode).
- **Phase 4 — Value/economy:** agents-as-tools do real work; marketplace; shared progression across views.

## Origin
Extends the existing `docs/FORGE_WORLD_MARKETPLACE_FLOW_SPEC_2026-07-22.md` (5 sub-projects) and the Agent Economy "one world, three views" master plan. This doc connects those islands and cuts friction.

## Working rules (learned the hard way)
- Owner views the **backend-served dashboard at http://localhost:3000/** — NOT bare static servers. All `/api` images/data need the backend.
- Any gate change ships with a **localhost dev-bypass** so the owner is never locked out while testing.
- Verify each change (headless smoke test) before claiming done. Small, verified increments.
