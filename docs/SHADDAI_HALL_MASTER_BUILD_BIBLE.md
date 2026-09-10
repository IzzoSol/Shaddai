# SHADDAI HALL — MASTER BUILD BIBLE (v2, grounded against codebase reality)

**Paste this first on every coding task for this initiative.**
**Product > clip. Fuel > 20 art files. Build on what's live — don't rebuild it.**

Reviewed and organized by SHADDAI (sequencing) and ZEROX (money/rules), 2026-09-10, against a
direct read of the current `C:\Users\Brittany\Shaddai` codebase. Original bible from the owner is
preserved in spirit; every section below is marked **DONE** / **PARTIAL** / **VISION** so nothing
gets rebuilt from scratch by mistake.

---

## ONE LINE

SHADDAI is the hall (account, offices, pay, receipts). ZEROX is the markets desk inside the hall.
Grok/Claude/Fable are brains we plug in. We are not a better chatbot.

---

## REALITY CHECK — read this before touching code

| Piece | Bible assumes | Actual state | Status |
|---|---|---|---|
| 7 agents as backend entities | needs building | `backend/agent-engine.js` (`runAgentLoop`, `routeTask`, `AGENTS`, `TOOLS`) is live; `tools-nexus.js`, `tools-turtle.js`, `tools-pikadon.js`, `zerox-scan.js`, `turtle-video-endpoints.js`, `turtle-music-bot.js`, `pikadon-middleware.js` all exist and are wired to real user traffic today | **DONE** |
| x402 payment rail | build it | `x402-routes.js`, `x402-agent-routes.js`, `x402-ledger-routes.js`, `x402-security.js`, `x402-ledger.js`, `data/x402-escrow.json`, `data/x402-ledger.json`, real `@x402/core` package, `backend/tests/x402.test.js` — a full ledger+escrow+security payment system already exists | **DONE** (needs wiring to new flows, not building from zero) |
| PayBox | build it | `paybox-routes.js` + `paybox-guard.js` exist | **DONE** (same — wire, don't build) |
| Resale marketplace / Bazaar | build it | `backend/bazaar-routes.js` already has `GET /api/bazaar/list`, `POST /list-item`, `POST /buy`, `POST /order-external`, `POST /purchase`, `GET /purchase/:reference` — plus a dashboard tile (index.html "BAZAAR", currently pointed at `/forge-3d.html`) | **PARTIAL** — endpoints exist, but not yet the "hall 15% / instance owner 85%" split logic, and the dashboard tile currently means something narrower (3D agent models) than "resale tools" |
| 7 dashboard "office rooms," one per agent, each with that desk's tools | build it | Today there is ONE unified "Office" view (`showView('office')`) with sub-tabs (`city`/`treasury`/`rooms`) — the City Empire land-economy system from an earlier build, not per-agent rooms | **VISION** — genuinely new UI/routing work |
| One master sprite/rig + palette recolor | assumed PNG atlas | **DECIDED 2026-09-10**: extending `pixel-people.js` (existing code-drawn rig) instead of a new PNG master-sheet — see Recommendation below for the test evidence that ruled out the fal-generated-atlas route | **VISION** (the extension work itself), approach **DECIDED** |
| `turtle_image` / `turtle_recolor` / `turtle_office_portrait` fal-backed tools + meter + 402 paywall | build it | Zero references anywhere in the repo. `fal-assets/generate.mjs` exists (a fal.ai image-gen script used previously for Dreamers Climb art) — that's the closest existing foundation, but no metering, no tool wrapper, no 402 integration yet | **VISION** |
| ZEROX rules (scan/paper-sim only, never autonomous buy, never Kelly on live size) | needs enforcing | `zerox-scan.js` exists; paper-trading MCP tools (`zerox_paper_open/close/portfolio/weekly`) are available in this session's toolset, confirming a paper-sim layer exists at some level | **PARTIAL** — the rule needs to be verified as actually enforced in `zerox-scan.js`/`agent-engine.js`, not just assumed |
| PIKADON caps/allowlist before any PayBox intent | needs building | `pikadon-middleware.js` is live middleware; `admin-routes.js`, `api-proxy-routes.js`, `auth-guard.js`, `billing-routes.js`, `federation-routes.js` all reference allowlist/spend-policy concepts; `shaddai_set_spend_policy` exists as an agent tool | **PARTIAL** — infrastructure exists, needs to be confirmed as the actual gate in front of the new PayBox intent flow this bible wants, not assumed |

**The headline correction:** this is not a greenfield build. The money rails (x402, PayBox),
the agent brains, and a marketplace skeleton (Bazaar) are already live in production. The real
gap is entirely on the **product surface** — office-room UI, the pixel creator/forge, and one new
metered image tool. Scope the work there; don't re-architect payments.

---

## WHO DOES WHAT (unchanged from the original bible — confirmed accurate)

- **SHADDAI** — commander: route, jobs, ledger, office rooms
- **ZEROX** — scans, prices, paper only, alerts, PayBox INTENT never hot-key trade
- **ORACLE** — research, charts, AURA boxes
- **NEXUS** — plans, OpenAPI→tools, wiring
- **TURTLE** — fal images, recolor, fuel meter
- **QUILL** — tone, TG copy
- **PIKADON** — caps, allowlist, no "buy our token," no spend from arena

AURA is an organ (boxes + search), not an 8th face.

---

## DASHBOARD — 7 office rooms (VISION, the real build target)

Each office room = a dashboard tab/room with that desk's tools:

1. SHADDAI — route, jobs, receipts
2. ZEROX — scans, markets
3. ORACLE — research, charts
4. NEXUS — plans, wiring
5. TURTLE — image/sprite/fuel ← fal lives here
6. QUILL — rewrite
7. PIKADON — policy, keys, caps

Office UI: room chrome (desk, sign, agent portrait), tool list, last receipt, "Forge this seat."

**Do not build 7 separate office backends.** Each room's "tools" are thin UI wrappers around the
agent-engine calls that already work today (the same `runAgentLoop`/`routeTask` machinery behind
the existing chat interface) — the room is a themed front door to an existing brain, not a new
brain.

## 20 PRESETS (roster, one rig) — VISION

Master pixel body + 7 office colorways + job/class tints. Presets people choose in Forge (ids,
not new art files):
- 7 office leads (shaddai, zerox, oracle, nexus, turtle, quill, pikadon)
- 7 job tints (coder, designer, writer, researcher, trader, coach, builder)
- 6 game tints (warrior, mage, rogue, cleric, ranger, bard)

Each preset: `{ id, displayName, office, palette, tint, bio }`

**DECIDED (2026-09-10, tested):** extend `pixel-people.js` — a code-drawn parametric rig with
palette-driven cosmetics and zero art files, currently producing the 100 `PRESETS` used as
playable characters. Add office/job/tint fields to its preset shape. This was tested against the
fal master-sheet alternative first: two `fal-ai/flux/dev` generations were attempted (bright
palette override + explicit isometric-camera/chroma-key prompting) and both converged on the same
failure — a front-facing smooth "cute mascot portrait," not an isometric transparent game sprite,
regardless of prompt wording. `flux/dev` is not the right tool for isometric pixel-art sprite
sheets without much more specialized tooling (a pixel-art-tuned model, ControlNet references, or
hand art) than a same-day prompt-engineering pass can reach. `pixel-people.js` is canvas-drawn, so
it's isometric and transparent by construction, matches the existing game exactly, and costs zero
fal spend. The "optional paid fal portrait still" idea (one shot per instance, spent from TURTLE
fuel) stays on the table separately — a front-facing portrait is exactly the shape `flux/dev`
already produces well, so it's a good fit for that narrower use, just not for the master sheet.

## PIXEL CREATOR / FORGE revamp — VISION

1. Pick office (room they work in)
2. Pick preset or sliders: palette, tint, name, bio
3. Preview (idle + walk)
4. Save instance → appears in that office on the dashboard AND in the 2D world

Do not generate a new fal sheet per picker change — recolor only, whichever underlying rendering
approach is chosen (PNG atlas or code-drawn rig). Optional: one paid fal "portrait still" per
instance, spent from TURTLE fuel, not a new atlas per pick.

## FAL / FUEL — VISION, real money, needs a security pass before building

- `FAL_KEY` server-side only (already vaulted per prior memory — never in client code, never in chat).
- Tools to build: `turtle_image`, `turtle_recolor`, `turtle_office_portrait` (a still, one shot).
- Meter: 1 free gen/day/user, then a paid pack via **x402 or PayBox** (both already live rails) —
  $2 / $5 / $10 packs.
- **COGS discipline (owner's own rule, keep it):** leave most of the $250 fal budget unspent
  until a real, non-owner user buys a pack. Fuel tool must be live and metered *before* any
  additional art generation happens.

This is the one piece of this bible that is genuinely new AND touches real payment flows. Per
this session's working norms, wiring a live paywall (even against already-built x402/PayBox
rails) is a security-sensitive change and should get a PIKADON-style pass — confirming the
existing spend-cap/allowlist middleware actually gates it — before it goes live, not after.

## WORLD / ARCADE — mostly VISION, builds on what exists

Load the master atlas (or `pixel-people.js` rig, pending the decision above) + instance palette
only — the 2D world (`game.html`) already renders characters this way for its existing 7-agent
cast, so an instance system is additive, not a rebuild. Fish/forge/siege (all three already exist
and, as of this session, the siege is fully wired) become the minigame/VFX-tile layer described
here — one fal batch, capped under $20, only if new VFX art is actually needed beyond what the
existing code-drawn rendering already provides.

## FORBIDDEN (unchanged — keep exactly as the owner wrote it)

- Celebrity / living-person likeness
- 24/7 Director
- 20 unique character bibles
- Spending the grant on art before `turtle_image` + meter work
- New MCP backend per preset

## MONEY (ZEROX's section, reconciled against real endpoints)

- **Humans:** PayBox (≥$1 or swap intent) and x402 USDC (tools + fuel) — both real, both live.
- **Hall split 15% / instance owner 85%** on resale tools — this is new *logic* on top of the
  already-existing `bazaar-routes.js` `list-item`/`buy`/`purchase` endpoints, not a new payment
  system.
- Fuel packs $2/$5/$10 → fal units on TURTLE, as above.
- Virtuals ACP = **optional** extra door for other agents to hire ZEROX (one offering: MarketScan
  — `zerox-scan.js` already exists as the underlying capability). Not a second checkout, not 7
  Virtuals agents, not a SOL-tip jar until PayBox+ACP are each billed at least once for real.
- Virtuals card = vendor APIs only. **User money never touches an agent's hot wallet.**
- TG = one hall/ZEROX loudspeaker for paid receipts. Users bind `chat_id`. Not 20 bots.

### ZEROX rules (enforce, don't just state)

- `zerox_scan` / `alert_draft` / `paper_sim` only.
- Never autonomous buy of any ticker, including SHADDAI's own.
- Never Kelly-sizing on live capital.
- Copy is data + tooling, never investment advice.
- **PIKADON gates every PayBox intent** — before this bible's new fuel-paywall flow goes live,
  confirm this gate is real in code (`pikadon-middleware.js` + the spend-policy tool), not assumed.

## LOOPS THAT MATTER (unchanged)

- watchlist cron → optional TG
- `aura_ingest` / `aura_search` (Jina then Firecrawl; Libretto Nexus-only, no Chromium on TG)
- importer: one OpenAPI or `x402.json` → tools
- scheduler + ledger + quota

## OUT / LOCKED (unchanged)

Celebrity likeness, 24/7 Director, token launch, FOMO self-buy, cash-prize tournaments, treating
350+ skills as if they were live APIs, 3D MMO, 20 MCP backends, Hyperliquid soul.md.

---

## BUILD ORDER (SHADDAI's sequencing, reconciled)

1. **Office rooms + spawn preset + master sprite slot** — pure product/UI work, zero new backend,
   zero payment risk. Confirm the `pixel-people.js`-vs-new-atlas decision first (see
   Recommendation above) since it changes this task's shape.
2. **`turtle_image` + meter + 402** — the one genuinely new, money-touching piece. Gate behind a
   PIKADON confirmation pass before it can actually charge anyone.
3. **`zerox_scan` + PIKADON + receipt + optional TG** — mostly wiring existing `zerox-scan.js` and
   `pikadon-middleware.js` to the new office-room UI, plus a receipt view.
4. **`aura_search` / `aura_ask`** — already exists as MCP tooling; wire into the ORACLE office room.
5. **Grok plugin.json + `.mcp.json`** pointing at the same MCP — infra/config task.
6. **World minigames / one original office clip** — last, and only after 1-5 are live and stable.

## ACCEPTANCE

- [ ] 7 office rooms open on dashboard with correct tools
- [ ] Forge: pick office + preset, preview recolor, save instance
- [ ] Instance portrait shows in that office and in the 2D world
- [ ] `turtle_image` metered; unpaid after free quota returns 402
- [ ] Only one master sprite file/rig system in the repo (no duplicate art pipeline)
- [ ] Credits/spend used: tests + one master sheet (or rig extension) + optional VFX only

## STATUS.md convention (keep, as instructed)

Print office list, preset list, fuel prices, and how much fal $ was actually spent, at the end of
each work session on this initiative. Mark every line **DONE** / **PARTIAL** / **VISION** honestly
— this document's Reality Check table above is the seed for that habit.
