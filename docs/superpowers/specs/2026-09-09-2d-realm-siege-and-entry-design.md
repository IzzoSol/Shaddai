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

1. **Siege is a ghost system — and there are two candidate modules, not one.** Deeper reading
   (done while writing the implementation plan) found `public/world-siege.js` (632 lines,
   `window.SiegeSystem`) is a **generic** building-capture war-game that could apply to any region
   with generic buildings — it is not Dark-Realm-specific. The actual purpose-built system is
   `public/dark-realm.js` (1086 lines, `window.DarkRealm`) — "Dark Forest / Castle Siege / Dragon
   Boss," phases `forest → moat → gate → chains → final → victory/defeat`, campfire respawns, a
   2-hour scheduled cycle, and a full self-contained UI panel with attack buttons already built.
   Its terrain generator `world-regions/darkforest.js` (**already loaded** in `game.html`) lays out
   campfire clearings and a castle gate at exact coordinates matched by code comments to
   `DarkRealm.S.campfires` — proof the two were built together. `dark-realm.js` also already calls
   `window.Combat.spawnDarkZone(...)`, a function that doesn't exist yet in `combat.js` — the one
   real gap preventing forest-phase enemies from spawning. **This plan wires up `dark-realm.js`**,
   not `world-siege.js`, which stays orphaned (out of scope, may be revisited for a future
   "world domination" feature that spans multiple regions). `index.html`'s City Empire widget
   already has a `⚔️ Siege` stat box (`index.html:5131`, `id="dashSiege"`) that has never had data
   to show — `dark-realm.js` already persists its state to `localStorage['shaddai.darkRealm']`,
   which this stat box can read directly.
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

### 4.1 Siege wiring (`game.html` + `dark-realm.js` + `combat.js`)

- Load `dark-realm.js` as a script in `game.html`, alongside the existing `combat.js` and
  `world-regions/darkforest.js` (already loaded).
- Call `DarkRealm.init()` once at bootstrap (it loads persisted state and seeds campfire
  positions; it does **not** need per-region re-init — `update()`/`render()` self-guard on
  `window.regionSel === 'darkforest'`).
- Keep three `let`-scoped game.html globals mirrored onto `window` each frame while in Dark Realm
  (`dark-realm.js` is a separate `<script>` file — plain top-level `let`/`const` bindings in
  `game.html`'s inline script are **not** visible to it; only `function`-declared globals like
  `toast`/`updateHP`/`walkable` are, since function declarations auto-attach to `window`):
  `enemies`, `playerHP`, `playerMaxHP`, plus a one-time `window.DPR` sync in `fit()` (DarkRealm's
  screen-space overlay math divides by `window.DPR`; game.html's `DPR` is also `let`-scoped).
- Add `combat.js`'s missing piece: a `spawnDarkZone(zoneNum, walkable, GW, GH)` function plus a
  small roster of dark-themed enemy `TYPES` (shade/wraith/bonehound/cultist/shadow_wraith,
  gate_guardian) so forest-phase waves and the dragon's low-HP wraith summon actually spawn and
  render distinctly instead of silently no-op'ing (today `DarkRealm._spawnWave` guards on
  `window.Combat.spawnDarkZone` existing, which it doesn't) or falling back to a wolf sprite.
- Add the `#siegeBtn`/`#siegeTxt` HUD button `dark-realm.js` already expects (it updates that
  element's text/color itself via `_updateHud()`) — clicking it opens `DarkRealm.openPanel()`,
  which is a complete, already-built UI (phase progress, attack-gate/break-chain/strike-dragon
  buttons, contribution stats, siege log, reward history). No new panel UI needs to be authored.
- Read `localStorage['shaddai.darkRealm']` (already written by `dark-realm.js`'s `_savePersist()`)
  from `index.html` to populate the dashboard's `#dashSiege` stat — no new persistence needed.
- **Explicitly deferred, not built in this pass:** the campfire supply-cache mechanic
  (`DarkRealm.searchCampfireCache`) needs a proximity "press E" trigger in `game.html` and has its
  own pre-existing wallet-sync bug (it writes `window.money`, which is a different variable from
  `game.html`'s real `money`) — it's a bonus side-reward, not required for the core
  forest→moat→gate→chains→dragon loop to be playable, so it's left for a follow-up pass.

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

- `node --check` on every edited `.js` file (`combat.js`) for syntax correctness.
- Manual playtest: enter Dark Realm, confirm forest-zone enemies spawn and render with distinct
  dark-themed sprites (not wolves), the `#siegeBtn` HUD shows phase status, and
  `DarkRealm.openPanel()` opens with working attack-gate/break-chain/strike-dragon buttons.
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
