# SHADDAI — Forge → Gallery → World → Marketplace Flow (Master Spec)
_Date: 2026-07-22 · Owner: SHADDAI · Status: DESIGN (approved-in-principle, awaiting build-order sign-off)_

## 0. Why this doc
The forge / gallery / world-entry / marketplace pieces mostly **already exist** but are
wired inconsistently, so the user experience is confusing (redundant "create profile",
"enter world" saves too early, no gallery pick, 3D forge ungated, offices ungated, preset
models free). This spec unifies them into one coherent flow and **decomposes the work into
5 shippable sub-projects** with a recommended build order. Nothing here is built by this doc.

---

## 1. Unified entity model (the shared vocabulary)

| Entity | What it is | Where it lives today |
|---|---|---|
| **Agent / Operative** | A forged AI character. Has: identity (name/archetype), persona, **tools/skills**, a body (2D pixel rig and/or 3D GLB). | `backend/data/operatives.json`, `/api/operatives` |
| **Gallery** | Your collection of forged agents. Reuse them as (a) dashboard tools, (b) website embeds, (c) world characters. | `/api/operatives?owner=` (no UI page yet) |
| **Player Code** | A portable ID/save-key for your agent+player. Lets you enter the world on any device without a full account. | `POST /api/player/new` → `shd_userid` |
| **Office** | Your persistent lot in SHADDAI City (2D world). **Account/dashboard feature only.** | `office-service.js`, `/api/office/*` |
| **Access Code** | Grants **3D-world** entry and/or **3D-forged-agent-in-world**. Giveaway=one-time; Pro-issued=reusable. | `shd_world_pass`, `/api/world/redeem` |
| **Plan** | Free (beta) / Builder / Pro / Alpha. Currently all free (beta). Gates 3D forge + preset models + world office richness. | pricing not enforced yet |

**Core rule:** *A forged agent goes to your Gallery. From the Gallery you use it as a dashboard
tool, embed it on a site, or drop it into the 2D world. Forging does NOT auto-place it in any
world.*

---

## 2. The two forges (roles + gating)

### 2A. Pixel Forge (2D) — open / low-friction
- **Makes:** a 2D pixel agent **with tools** (today it only makes a cosmetic rig — **gap:
  bind tools/persona like the 3D forge does**).
- **Output → Gallery.** Usable as: dashboard tool, website embed, 2D-world character.
- **Gate:** free tier (N free forges/browser via `free-use-tracker.js`), then sign-in.

### 2B. 3D Forge — approved / paid access only
- **Access:** **paid plan OR admin approval OR access code.** (Free users see it locked with
  a "request access / upgrade" CTA.)
- **Makes:** a 3D agent (GLB) **with tools**, plus the ability to **create 3D models anytime**
  using our tech / APIs — three.ws + **image-to-model** (the Codex GitHub pipeline) + existing
  Meshy lane. Models are credit-metered.
- **Output → Gallery + Dashboard.** A 3D-forged agent lands in the **dashboard** (as a tool),
  **NOT** the 3D world — **unless it carries an access code**.
- **Marketplace:** from the 3D forge you can **list 3D models for sale** in the marketplace.
- **Preset models:** the ready-made preset models are **paid-plan only**; a paid user who
  doesn't build their own can use presets as dashboard agents.

---

## 3. The corrected flows (what changes)

### 3A. Forge flow (fix the friction)
1. Enter forge → build agent. **"Enter world" previews your Player Code but lets you back out
   ("nvm").** Nothing is saved yet.
2. **Save happens only when you hit "Forge."**
3. On Forge: agent is created → **added to your Gallery**. If you're already signed in and just
   forged, **do NOT show "create profile"** (redundant — you have an identity).
4. From Gallery you can: run it as a dashboard tool · copy an **embed snippet** for websites ·
   **send it into the 2D world**.

### 3B. 2D World entry (organize account vs guest)
- **Signed-in / dashboard user:** enter via **Player Code** or **pick an agent from Gallery**,
  drop it in as your character. Gets an **office** (persistent lot).
- **Guest (came straight from main page, no dashboard):** can **PLAY** the 2D world (pick from
  the preset characters, or forge a quick pixel agent) but **cannot claim an office** — office
  is gated to accounts. Guest identity persists via a localStorage guest Player Code, with an
  "upgrade to save everything" hook.
- **Rooms:** clicking **Rooms** shows **Create room / View room**; room presets are **walkable**
  pixel spaces.

### 3C. Marketplace
- 3D models built in the 3D forge can be **listed for sale** (reuses `bazaar-routes.js`).
- Preset models are **paid-plan only** (not listed as free).

---

## 4. Decomposition — 5 shippable sub-projects (each = own spec→plan→build)

1. **SP-1 · Forge→Gallery→Dashboard-tool pipeline + friction fixes**
   Pixel forge binds tools/persona (parity with 3D). Add a **Gallery UI** (list your agents,
   run as tool, copy embed). Fix: back-out of "enter world", save-only-on-Forge, kill redundant
   "create profile" when already signed in. _Foundational — everything else references Gallery._

2. **SP-2 · World entry & guest-play model**
   Enter world via Player Code OR Gallery pick. Guest play from main page (no office). Office
   gated to accounts. Rooms Create/View + walkable presets.

3. **SP-3 · 3D Forge access-gating + model creation**
   Lock 3D forge behind paid/admin/access-code. Wire image-to-model (Codex pipeline) + three.ws.
   3D agents → dashboard only unless access code. Preset models = paid-only.

4. **SP-4 · Marketplace for 3D models**
   List/sell forge-made 3D models; buyer flow; preset-model paid gating.

5. **SP-5 · Plan enforcement**
   Actual Free/Builder/Pro/Alpha gates that SP-2/3/4 hang off of. (Can stay stubbed "beta =
   everything free" until you're ready to charge, but the gate hooks get placed now.)

### Recommended build order
**SP-1 → SP-2 → SP-3 → SP-4**, with SP-5's gate-hooks stubbed from the start (so we don't
rewire later). SP-1 first because Gallery is the hub every other piece plugs into.

---

## 5. Open decisions (need owner sign-off before SP-1 starts)
1. **Build order** — confirm SP-1 first, or reprioritize.
2. **Guest identity** — persist guests with a localStorage guest Player Code + "upgrade to
   save" hook (recommended), or require sign-in to play at all?
3. **3D forge access** — which combination unlocks it: paid plan, admin approval, access code,
   or all three (recommended: any-of, so giveaways + Pro both work)?

---

## 6. Reuse map (don't rebuild these)
- Gallery data: `/api/operatives` (+ `syncFromForgeState`).
- Access codes: `/api/world/redeem`, `shd_world_pass`.
- Free caps: `free-use-tracker.js`.
- Marketplace: `bazaar-routes.js` (`/api/bazaar/list|list-item|buy`).
- Office: `office-service.js`, `/api/office/*`.
- Player Code: `/api/player/new`, `world-gate.js` (injects `x-user-id`).
