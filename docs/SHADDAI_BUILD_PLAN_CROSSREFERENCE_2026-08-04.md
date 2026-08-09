# SHADDAI — Master Build Plan: Cross-Reference Against Actual Codebase
**Date:** 2026-08-04
**Method:** File-by-file verification of every "What exists now" claim in `SHADDAI_MASTER_BUILD_PLAN_2026-08-04.md`, plus live probes of `https://shaddai-g81x.onrender.com`.
**Version under test:** server v62.0.0 (health check 2026-08-04), `npm run gate` green, 135/135 tests.
**Rule:** Corrections here are additive — nothing is torn down. The plan's approved design stays; this doc syncs its factual claims to reality and adds the detail the plan is missing.

---

## Summary of Corrections

| # | Plan claim | Reality (verified) | Impact |
|---|-----------|--------------------|--------|
| 1 | 3×3 map districts named "Nexus Heights / Oracle Sky / Zerox District" | Those regions do NOT exist. Real 8 regions: SHADDAI City, Green Meadow, Sunny Harbor, Downtown, Wildwood, Dust Canyon, Emberfields, The Suburbs | Rewrite Phase B map with real region names |
| 2 | "x402 Integration" listed as a late phase (after MCP) | x402 is **already built and live**: `/api/x402/agent` (hire), `/api/x402/ledger` (balance/credit/debit/history/stats), `/api/x402` mounted, ledger has real agent + bazaar txns | Move x402 from "future" to "exists — extend" |
| 3 | Founders Row described as future world-build | **Backend fully exists**: `office-service.js` (TOTAL_LOTS=30, 6 presets, 3 visibilities, claimOffice, slotCoords mirroring game.html FLOT), live `/api/office/lots` returns 30 lots | Plan should "wire UI to existing backend", not rebuild |
| 4 | "Treasury service (built, uncommitted)" | No `treasury-service.js` exists in backend/ | Remove claim or mark unbuilt |
| 5 | "Referral flywheel (built, uncommitted to main)" | `referral-routes.js` exists (4.9KB) **and is committed**; economy.json contains referral credit txns | Fix "uncommitted" wording |
| 6 | MCP tool catalog = shaddai_research / shaddai_write / ... | Real MCP tools: `list_agents`, `list_rag_docs`, `rag_search`, `rag_ask`, `run_agent` (mcp-server-rag.js) | Correct catalog; sell what exists |
| 7 | "AURA MCP server (shaddai-aura npm package)" | Real MCP server is `backend/mcp-server-rag.js`; `build-mcp-package.js` zips it to `shaddai-mcp-dist.zip` gated behind `/api/mcp/package` (code ASCEND-MCP). `shaddai-aura` is only an HTML doc reference | Correct the identity of the MCP product |
| 8 | "Skills Library with 3,437 skills" | `skills-catalog.json` = 3,022 skill objects (8.4 MB) | Correct count |
| 9 | Tab 2 City "gaps: Signal bar only" | City tab already renders Signal card + Founders Row plot card + Pixel Office buttons, reads `shaddai.city` localStorage | Less greenfield than plan claims |
| 10 | Tab 4 Gallery "may render nothing" | Gallery reads the REAL Operative store `/api/operatives` (unified identity+look+brain+inventory) | Already server-backed |
| 11 | Rooms tab "skeleton only, no backend" | Agent-room backend exists: `agent-room-routes.js` (GET/PATCH `/api/agent-rooms`, `/api/agent-rooms/:id`, `/api/office`) + `agent-rooms.json` | Wire UI to it; don't build backend |
| 12 | Marketplace "basic listing structure exists" | More exists: `skill-market-routes.js` (`/api/market`: create/list/buy), `catalog-seed.js` seeds shop catalog, `portal-plots.json` (rent/buy prices) + `/api/portal-plots` | Layer 2/3 foundations already present |

---

## System-by-System Verification

### System 1 — THE FORGE

**Verified facts:**
- `public/pixel-forge.html` (25 KB) — 2D pixel agent builder. **No** trait/skill/personality system yet (grep found zero `trait|skill|radar|personality` matches). Plan's Lane A additions are genuinely greenfield. ✅
- 3D Forge family is richer than the plan states: `forge.html` (29 KB), `forge-3d.js`, `forge-tab.js`, `forge-gallery.html`, `forge-about.html`, `model-gallery.html` (8.4 KB), `glb-viewer.html`, `motion-lab.html` (45 KB).
- Spec docs exist: `docs/SHADDAI_TOM_ARMOR_BODY_SPEC.md`, `docs/FORGE-3D-PIPELINE.md`. ✅ Plan references these correctly.

**Improvement detail to add:**
- Lane B credits: plan says "1 3D agent = 50 Sparks or 1 Pro credit". The real economy is integer Sparks via `economy-service.js` — a 50-Sparks burn is feasible as a `spend()` call; the Meshy API cost should be a `catalog-seed` item, not a bespoke route.
- Forge → Gallery handoff already has a real target: `/api/operatives` (POST creates operative with identity+look). Plan's "Export to Gallery" should be "POST /api/operatives", not localStorage.

### System 2 — AGENTS

**Verified facts:**
- 7 council agent ports confirmed in `backend/multi-agent-server.js`:
  - SHADDAI:8000 (L81), ZEROX:8001 (L94), ORACLE:8002 (L107), NEXUS:8003 (L120), TURTLE:8004 (L133), QUILL:8005 (L146), PIKADON:8008 (L159).
- `backend/data/agent-memory.json` exists but is only 585 bytes (test data). Plan's episodic/semantic memory work is real greenfield. ✅
- `/api/agent-memory` router already mounted (learn/grow per-customer memory).

**Improvement detail to add:**
- Memory store: `agent-memory.json` currently holds `{ "NEXUS:audit-test": {...} }` and `"__userMemory__"`. Episodic `.jsonl` per agent (plan's L94) should live under `backend/data/agent-{name}-memory.jsonl` — matches existing file layout.
- Missions: plan says council auto-assign by domain. `multi-agent-server.js` already routes by role on ports — a mission loop can POST to each port. But note: **agent ports are not reachable on Render** — they bind localhost. Missions must go through the API server, not the ports.

### System 3 — THE WORLD (UTOPIA LAND)

**Verified facts — the big one:**
- `game.html` calls its economy **"UTOPIA LAND ECONOMY — Phase A"** (game.html:1290). The 2D world IS the utopia build.
- Real regions (game.html REGIONS array, L281-288 + `SIGNAL_DRAIN` L280):
  - `agentcity` → **SHADDAI City** (drain 0, rail, city)
  - `meadow` → **Green Meadow** (drain 0.8)
  - `beach` → **Sunny Harbor** (drain 1.5, air)
  - `city` → **Downtown** (drain 1.2)
  - `forest` → **Wildwood** (drain 0.8)
  - `desert` → **Dust Canyon** (drain 3.0, air)
  - `volcano` → **Emberfields** (drain 3.0, air)
  - `suburb` → **The Suburbs** (drain 0)
- Region files: `public/world-regions/{beach,city,desert,forest,meadow,suburb,volcano}.js` (7 files; agentcity defined inline).
- Signal drain is already **region-scaled and movement-gated**: `(SIGNAL_DRAIN[regionSel]||1.2) * (moving?1:0)` (game.html:994). The plan's "drain starts when you cross a border" already has per-region rates to reuse.
- Deeds: `CITY_PLOTS[30]`, `CITY_RESERVE`, `accrue()` (game.html:1291-1315). ✅
- **Founders Row backend fully exists**: `office-service.js` — TOTAL_LOTS=30 (L15), 6 presets `command-loft/obsidian-hq/neon-studio/gold-atrium/terminal-bay/crimson-forge` (L18-25), 3 visibilities `private/public-showroom/hireable-studio`, `slotCoords(i) = {col:6+(i%10)*5, row:4+...}` mirroring game.html FLOT(), `claimOffice`, `updateOffice`, persistence to `backend/data/offices.json`.
- Live probe: `GET /api/office/lots` → `{"ok":true,"total":30,"lots":[slot0 taken, slot1 taken, slot2 open, ...]}`. **The office API is live on Render.**

**Plan corrections:**
1. **Phase B 3×3 map must use real region names**, not invented ones. Recommended layout:
   ```
   [ Wildwood (TURTLE) ]  [ Green Meadow  ]  [ Sunny Harbor (ORACLE) ]
   [ Downtown        ]   [ SHADDAI CITY  ]  [ Emberfields          ]
   [ The Suburbs     ]   [ Dust Canyon   ]  [ (rail ring around)    ]
   ```
   Only 7 of 8 fit cleanly in a ring — Emberfields (volcano) and Dust Canyon (desert) are the two "wild" south districts.
2. **Founders Row is not a world-build task** — it's a dashboard wiring task. `/api/office`, `/api/office/lots`, `/api/office/presets` already exist. The City tab and game.html just need to call them.
3. Transit types already exist per region (`transit:'rail' | 'air'`). Ring Train = the 5 rail regions (agentcity, meadow, city, forest, suburb); air = beach, desert, volcano.

**3D world:** `public/SHADDAI-WORLD-3D.html` exists (per playbook L1.2, AnimationMixer crossfade, combat) and `index.html` has `enter3DWorld()`. Plan's 3D upgrades (Founders Row exterior, Pixel Office bridge, x402 kiosk) are valid greenfield.

### System 4 — MARKETPLACE

**Verified facts:**
- Bazaar clients: `marketplace-shop.html` (98 KB), `marketplace-shop-v2.html` (45 KB), `shop-client.js` (30 KB), `bazaar-buy.css/js`. ✅
- **Server-side marketplace already mounted:**
  - `/api/market` → `skill-market-routes.js` (skill + agent marketplace: create/list/buy)
  - `/api/portal-plots` → `portal-plots-routes.js`; data `portal-plots.json` has real prices (`nexus-world`: rentPrice 29, buyPrice 299)
  - `/api/operatives` → unified Operative store (identity+look+brain+inventory+economy)
- `x402-ledger.json` contains real marketplace txns (bazaar + agent). ✅

**Improvement detail to add:**
- Plan Layer 2 (creator cosmetics, 85% creator): route through the existing `/api/market` (listings) + `economy-service` purchase rail rather than a new `/api/marketplace` router.
- Plan Layer 3 (plot/room AMM): `portal-plots.json` already models rentPrice/buyPrice/expiresAt/status — extend this store for Founders Row deeds; it's the natural AMM substrate.

### System 5 — ECONOMY

**Verified facts:**
- `economy-service.js` (integer Sparks, BigInt, `spend(userId, amount, reason, key)`) mounted at `/api/economy` (balance/inventory/catalog/purchase/grant). ✅
- `catalog-seed.js` seeds the shop catalog idempotently. ✅
- **Referral is committed**, not pending: `referral-routes.js` exists and economy.json contains referral credit transactions. ✏️
- **Treasury service does NOT exist** — no `treasury-service.js` in backend/. The plan's "Treasury service (built, uncommitted)" claim is **false**. ✏️

**Improvement detail to add:**
- Six-vault allocation (play/daily/referral/boost/staking/reserve) maps cleanly onto the existing economy ledger: each vault is an `economy_account` with its own balance, spending via `spend(key)` idempotency.
- Inflation monitor: log to `backend/data/economy-health.json` as planned — file location matches convention. The weekly cron can reuse the existing scheduler pattern in server-production.js.

### System 6 — MCP MONETIZATION

**Verified facts — significant correction:**
- The real MCP server is `backend/mcp-server-rag.js`. Its tools are:
  - `list_agents` — 7 agents, roles, KB doc counts, tool counts
  - `list_rag_docs` — list docs in one agent's RAG KB
  - `rag_search` — ranked chunks w/ scores + sources
  - `rag_ask` — grounded answer via local Ollama + sources
  - `run_agent` — full agent run (RAG-injected + skills + MCP tools), auto-routes by goal, maxIter 1-8
- `build-mcp-package.js` walks the require-graph closure (48 backend files) → `shaddai-mcp-dist/` → zips to `shaddai-mcp-dist.zip`.
- Live mount: `GET /api/mcp/status` (server-production.js:641), `GET /api/mcp/package` (L714) gated by `MCP_PACKAGE_CODE || 'ASCEND-MCP'` (L719).
- `mcp-servers.json` configures connected servers (filesystem, fetch).

**Plan correction — MCP tool catalog must be:**
```
list_agents()        → the 7 agents + stats (already built)
list_rag_docs(agent) → KB inventory per agent (already built)
rag_search(agent, query, limit) → ranked chunks (already built)
rag_ask(agent, question)        → grounded answer + sources (already built)
run_agent(agent?, goal, maxIter) → full task loop (already built)
```
The plan's `shaddai_research / shaddai_write / shaddai_audit_security / shaddai_build_api / shaddai_price_model / shaddai_design_ux / shaddai_decide` catalog is a **wrapper layer** to build on top of `rag_ask`/`run_agent` — keep them as the phase-A v1 tool set, not new names.

### System 7 — DASHBOARD TAB UPGRADES

**Verified facts:**
- Tab 2 City (index.html:6457-6492) **already has**: Signal status card (`citySignalFill`/`citySignalTxt`), Founders Row plot card (`cityPlotStatus` reads `shaddai.city` localStorage, L27613), Pixel Office buttons, "ENTER 2D WORLD" button. Plan's "gaps: Signal bar only" is stale.
- Tab 4 Gallery reads the REAL store: index.html:6846 "/api/operatives — the single source". Not dead.
- Tab 5 Economy: `officeTreasury` is an empty `shdterm-scope` div (index.html:6455). ✅ Plan correct here.
- Tab 1 Command: `officeCommandProp` placeholder exists (index.html:6222). ✅
- Rooms backend exists (`agent-room-routes.js`) but index.html does **not** call `/api/office` or `/api/agent-rooms` yet (grep: zero matches) — this is the actual gap the Rooms/Command tabs should close.

**Improvement detail to add:**
- Command tab "Your Property" should fetch `GET /api/office` (returns `{office, rooms}` via `office.officeWithRooms(userId)`), not localStorage.
- Rooms tab should use `GET/PATCH /api/agent-rooms` + `GET /api/office` — all built and mounted on Render.
- City tab plot card should upgrade from `shaddai.city` localStorage to `GET /api/office/lots` + `GET /api/portal-plots` for truth.

---

## Additional Infrastructure the Plan Never Mentions (all live)

| Route / file | What it is | Relevance to plan |
|--------------|-----------|-------------------|
| `/api/operatives` (lib/operatives-routes.js) | Unified Operative store: identity+look+brain+inventory+economy | Forge export target; Gallery source; marketplace listings |
| `/api/portal-plots` + portal-plots.json | Rentable/buyable portal-world plots (rent 29 / buy 299) | Layer 3 plot exchange substrate |
| `/api/market` (skill-market-routes.js) | Skill + agent marketplace create/list/buy | Marketplace Layers 1-2 already server-backed |
| `/api/x402`, `/api/x402/agent`, `/api/x402/ledger` | HTTP 402 micropayments: hire, balance, credit/debit/history/stats | Agent payments + marketplace settlement ALREADY LIVE |
| `/api/agent-memory` (lib/agent-memory) | Per-customer memory learn/grow | Agent System 2 semantic memory |
| `/api/work` (work-sessions) | Agent work loop → Sparks payout + while-away summary + live feed | Mission reward rail (System 2) |
| `/api/security` (lib/security-scan + security-routes) | PIKADON real scans (url/code/skill) + review queue | MCP `shaddai_audit_security` wrapper target |
| `/api/collectibles/rewards` + `/api/collectables` | AURA token-saver; collectible rewards | Layer 2 collectible items |
| `/api/mp`, `/api/leaderboard`, `/api/chat` | Multiplayer presence, leaderboards, realm chat | Social layer for the world |
| `/api/sub-billing`, `/api/billing`, `/api/stripe` | Stripe subscriptions + per-deliverable unlock | Pro gates (3D Forge, MCP Pro tier) |
| `/api/tufish` | Free-API market data proxy (Polymarket + CoinGecko) | District yield data feeds |
| `/api/rooms` (rooms-routes) | Personal operative habitat: HF scene-gen + wearables | Rooms tab depth |
| `/api/vault` | BYOK API key vault (password-locked) | MCP BYOK tier |
| `/api/brains` | Custom brains router | Agent specialization |

---

## Revised Phase Order (based on what actually exists)

1. **Phase B — Connected UTOPIA LAND map** (game.html): use real region names; rail ring = 5 rail regions; reuse existing `SIGNAL_DRAIN` values. Still the biggest game task. ✅ unchanged
2. **Dashboard wiring pass** (index.html only, no new backend): City tab → `GET /api/office/lots`; Command "Your Property" → `GET /api/office`; Rooms tab → `GET/PATCH /api/agent-rooms`; Gallery already works. **This is pure UI-to-existing-API work — fastest win.**
3. **Phase C — Transit**: ring train across the 5 rail regions; air across beach/desert/volcano. Fare deducts via `economy-service.spend()`.
4. **Phase D — Boost vaults**: `/api/economy` grant/spend rail already exists; add lock-to-earn as a new vault account.
5. **Phase E — Rooms/tenants**: extend `agent-rooms.json` + `portal-plots.json`; tenant archetypes new.
6. **Marketplace depth**: extend `/api/market` + `/api/portal-plots`; add creator-cosmetics + deed listings (Phase F).
7. **MCP wrapper layer**: build the 7 `shaddai_*` tools ON TOP of the existing `rag_ask`/`run_agent` tools; ship via existing `build-mcp-package.js` + `/api/mcp/package`.
8. **x402 agent payments**: already live — polish, don't build.

---

## Open Questions for SHADDAI Council

1. **Region naming:** approve the real-region 3×3 layout above (replacing invented district names)? The 8th region means one cell is either empty (center-hub only) or the map is 3×3 with one district doubling as the city gate.
2. **Treasury:** no treasury service exists. Do we (a) implement it as a new `treasury-service.js`, or (b) fold treasury into the existing 6-vault `economy-service` accounts? Recommend (b).
3. **MCP naming:** ship the existing 5 tools as v1 and add `shaddai_*` wrappers in a later pass — or alias now? Recommend: ship existing 5, wrapper pass later.
4. **Skills count:** catalog shows 3,022 objects vs plan's 3,437. Verify whether the catalog was regenerated or the plan number was aspirational.
5. **Agent ports vs Render:** ports 8000-8008 are localhost-only; `run_agent` on the API server is the reliable mission path. Confirm missions route through `/api/work` + `run_agent`, not the ports.
