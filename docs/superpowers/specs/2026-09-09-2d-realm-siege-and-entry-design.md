# 2D Realm — Finish Siege + Forge-Character Entry — Design Spec

**Date:** 2026-09-09
**Status:** Design — awaiting user review before writing implementation plan
**Target files:** `public/game.html`, `public/index.html`, `public/world-siege.js`, `public/pixel-city.html` (removed)

---

## 1. Context (verified by reading the code, not assumed)

There are three "world" surfaces in the repo. Only one is the 2D realm this spec touches:

- **`public/game.html`** (~211KB) — the live, linked 2D game. Reachable from `index.html` in four
  places (`WORLD` launcher tile, `▦ Enter World` button, worlds menu, command terminal). Already
  implements: 9 regions (incl. home "SHADDAI City" + `darkforest`/"Dark Realm"), all 7 council
  agents as playable pixel characters, a full economy (money/credits/quests), weapons + inventory
  + forge-upgradeable gear, loot drops, themed interiors, fishing/gathering, a Signal/HP HUD, and
  FFTA-style combat via `combat.js`. This already matches large parts of the approved
  `2026-08-03-shaddai-utopia-land-economy-design.md` (Signal mechanic, plots) — Phase A of that
  spec shipped; the dashboard tab revamp it also called for did not (see §5).
- **`public/pixel-city.html`** (479 lines) — an earlier isometric tech-demo. Zero pages link to it.
  Superseded by `game.html`. To be retired (§4).
- **`public/SHADDAI-WORLD-3D.html`** — a genuine three.js 3D world, the paid/Pro-tier view per the
  existing free-2D / paid-3D split. **Out of scope**, untouched by this spec.

Two gaps in `game.html` are the actual work:

1. **Siege is a ghost system.** `public/world-siege.js` (632 lines, `window.SiegeSystem`) is a
   complete siege war-game — building capture zones, garrison NPCs, catapults/rams, a 3-minute
   HQ-hold-to-win condition, a 28-day cycle — but it is loaded by zero HTML files. The `darkforest`
   region's "⚠ Siege the Shadow Keep · Dragon awaits" flavor text currently only triggers ordinary
   `combat.js` enemy spawns (`game.html:385`), not this system. `index.html`'s City Empire widget
   already has a `⚔️ Siege` stat box (`index.html:5131`, `id="dashSiege"`) that has never had data
   to show.
2. **Entry is a generic icon tile**, not a character. The `WORLD` launcher tile (`index.html:5052`)
   is a glyph (⊕) with no relationship to the player's own agent or the council.

## 2. Goals

- Wire `world-siege.js` into `game.html` as a real, playable encounter in the Dark Realm.
- Give the dashboard's dead `#dashSiege` stat live data.
- Replace the generic `WORLD` tile with a small live scene: NEXUS + the player's own forged agent,
  as the entry point into `game.html`.
- Retire the orphaned `pixel-city.html` prototype.

## 3. Non-Goals (explicitly out of scope for this spec)

- Any redesign of the dashboard's Worlds section / tab structure (§5 — future spec).
- Any real-money / agent-wallet / marketplace economy work (§5 — future spec).
- Changes to `SHADDAI-WORLD-3D.html` or the free/Pro split.
- Re-litigating district-to-agent mapping choices already locked in the Aug 3 land-economy spec.
- Backend job queue, PayBox/x402 wiring, or any payment rails — captured as forward direction only.

## 4. Design

### 4.1 Siege wiring (`game.html` + `world-siege.js`)

- Load `world-siege.js` as a script in `game.html`, alongside the existing `combat.js`.
- On entering the `darkforest` region, initialize `SiegeSystem` against that region's buildings,
  **replacing** the current bare `Combat.spawnFor` call at `game.html:385` for that region — the
  Shadow Keep becomes an actual capturable HQ with garrisons, not just a monster spawn point.
  `combat.js` itself stays wired for every other region; only Dark Realm's enemy source changes.
- Add the minimal HUD `SiegeSystem` needs: a capture-zone progress ring near the player when
  standing in a zone, an HQ hold-timer bar, and a compact event log (wave incoming / building
  captured / HQ falling) reusing the existing toast/panel patterns already in `game.html`.
- Persist/report live siege state (active or not, time-to-next-cycle, current HQ owner) so
  `index.html`'s `#dashSiege` stat box can read it — reuse the existing `localStorage`
  (`shaddai.econ`-style) pattern `game.html` already uses for economy state, rather than inventing
  a new sync mechanism.

### 4.2 Forge-character landing entry (`index.html`)

Replace the `WORLD` launcher tile (`index.html:5052`) with a small canvas scene using
`pixel-people.js` (158 lines, `window.PixelPeople` — already a standalone character-drawing
module, not the full game engine, so this stays cheap to render on the dashboard):

- NEXUS stands at a small forge, idle-animated, with one rotating line of static flavor text
  (no LLM call — a short hardcoded pool: "The city's waiting.", "Siege reports coming in from the
  Dark Realm.", etc.).
- The player's own forged agent (their saved `rig` from `shaddai.player` / gallery, the same data
  `game.html` already reads at line ~257-258) stands beside NEXUS, idle-animated, as a live preview
  of "you" in the world.
- If the player hasn't forged a character yet, NEXUS stands alone with a "Forge your agent first"
  prompt linking to Pixel Forge.
- Clicking the tile (or the existing `▦ Enter World` button at `index.html:5137`) still routes to
  `game.html` exactly as today — this is a visual upgrade of an existing working link, not new
  routing logic.

### 4.3 Cleanup

- Delete `public/pixel-city.html`. No other file references it, so this is a zero-risk deletion
  from a routing standpoint; git history preserves it if it's ever wanted again.

## 5. Testing / Verification

- Manual playtest: enter Dark Realm, confirm capture zones/garrisons/catapults spawn and the HQ
  hold-timer actually resolves a win/loss.
- Confirm `#dashSiege` on the dashboard updates to reflect real state (not "—") after a siege
  starts.
- Confirm the new dashboard entry tile renders correctly with (a) a forged character present and
  (b) no character forged yet.
- Confirm no remaining references to `pixel-city.html` after removal (`grep -r "pixel-city"`).

## 6. Council forward-look — NOT in scope for this build

Captured per the user's request so it isn't lost, to seed a **separate future brainstorming/spec
pass**. Nothing here is approved or scheduled.

**TURTLE (UI/UX):** The dashboard's Worlds section (currently a sprawling set of tabs, previously
flagged in memory as "12→~8 tabs, unfinished") should go further — 4-5 tabs organized by verb
(Play / Earn / Build / Compete), not by feature, so it mirrors the in-game structure 1:1 and never
makes the player translate dashboard-language into game-language. Keep the locked "bright eBoy"
style spine (`2026-07-17` spec) for all-ages appeal — Dark Realm/siege content should read
stylized and cartoonish, not grim, so it doesn't alienate younger or more casual players.

**ZEROX (revenue/ROI):** Today's in-game economy (Sparks/Credits from fishing, quests, siege loot)
is closed-loop fun money with no bridge to real revenue — fine for engagement, not yet a reason to
log in daily at scale. The real lever raised in this conversation: **agent-owned PayBox wallets**
(the PayBox and x402 MCP connectors already exist in this environment — `mcp__claude_ai_PayBox__*`,
`mcp__shaddai__x402_*`) — a forged agent could complete real tasks/workflows, sell templates or
skills on a marketplace, and earn into a real wallet, with SHADDAI taking a commission (this
extends the existing 4-pipe referral flywheel design, which already separates play-money rewards
from real-money settlement). Recommend piloting with hard spend/earn caps on a small cohort before
any wider rollout — real payouts change the risk profile substantially.

**NEXUS (architecture):** That future needs (1) a job/task queue backend agents claim and complete
work against, (2) wallet binding per forged agent reusing the existing PayBox/x402 connectors
rather than new payment rails, and (3) a templates/skills marketplace (listing, licensing,
commission split) that likely extends the existing Forge/skills system (350+ skills already
catalogued) rather than inventing a parallel one. This is backend-heavy, touches real money, and
needs its own spec and its own security review before any code is written.

**SHADDAI (sequencing):** Order of operations — (1) ship this 2D-realm fix, (2) the dashboard
Worlds-tab revamp as its own spec, (3) the agent-economy/PayBox idea as a separate, higher-risk
initiative that PIKADON reviews for security/compliance before implementation planning even
starts. Not folding real-money mechanics into the current pass.
