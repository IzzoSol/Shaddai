# BACKEND CONNECTION MAP — Shaddai 3D Realm

**Date:** 2026-11-15 · **Repo:** `~/workspace/shaddai-repo` · **Status:** research only, no code changed.
**Method:** every claim below was verified by reading the route handler or the caller. Line numbers are for the checkout audited on 2026-11-15 (live content = GitHub main `207d30a` for the two realm files; backend files as on disk).
**Full evidence tables** (this map is the synthesis; the parts are the receipts):
- [audit-parts/ENDPOINT_CENSUS.md](audit-parts/ENDPOINT_CENSUS.md) — all ~442 routes, handler-verified
- [audit-parts/FRONTEND_CALL_MAP.md](audit-parts/FRONTEND_CALL_MAP.md) — all 133 frontend (URL, method) pairs, 77 localStorage keys
- [audit-parts/DATA_AUTH_DEPLOY.md](audit-parts/DATA_AUTH_DEPLOY.md) — 27 data stores, auth, deploy
- Cross-checked against [REALM_SYSTEMS_INVENTORY.md](REALM_SYSTEMS_INVENTORY.md) (frontend inventory crew) — disagreements are listed in §2.4 and the handler read always wins.

---

## 0. The one-paragraph answer

The realm's backend is **mostly built and mostly mounted** — bazaar, Sparks ledger, home deeds, portal plots, races, federation portals, agent brains, and even a player-save API (`/api/world/saves`) all exist server-side. The realm feels disconnected for four precise reasons: **(1)** the frontend's money identity defaults to the hardcoded string `'guest'` and is never merged with the real signed-in session, so whole economy flows run against a shared fake user; **(2)** several finished backend modules are never called by the frontend (`/api/world/saves`) or never mounted by the server (`home-routes.js` → all of `/api/home/*` is 404); **(3)** there are **two different money systems** (Sparks in `economy.json`, SHAD-Credits in `x402-ledger.json`) plus a third incompatible writer to the same ledger file, and the bridge between them is off; **(4)** **nothing persists across a Render redeploy** — `backend/data/` is on an ephemeral filesystem, free plan, no persistent disk, so every balance, deed, listing and save reverts to the git-committed JSON on deploy. Multiplayer presence is the one genuinely half-built piece: positions are uploaded every 2.5 s and chat works, but no 3D client renders the other players it receives.

---

## 1. ENDPOINT CENSUS (condensed — full table in ENDPOINT_CENSUS.md)

**Counts:** 138 inline route definitions in `backend/server-production.js` (= 143 distinct paths) + 14 routes on anonymous in-file routers + ~290 routes in mounted realm-relevant routers ≈ **442 routes**, across ~110 `app.use` mounts. Non-realm mounts (telegram, signals, PnL, social, stripe…) are listed mount+module+purpose in the census part.

### 1.1 Realm-critical routes (handler-verified)

| Method & path | Handler (file:line) | Backing store / notes |
|---|---|---|
| GET `/api/bazaar/list` | `backend/bazaar-routes.js:150`, mounted server:3373 | `data/bazaar.json` listings |
| POST `/api/bazaar/buy` | `bazaar-routes.js:169` | charges via x402 (SHAD-Credits), 5% fee, writes `bazaar.json` + `bazaar-purchases.json` |
| POST `/api/bazaar/list-item` · DELETE `/api/bazaar/:id` · POST `/api/bazaar/order-external` | `bazaar-routes.js:158/190/201` | same store; **no auth on any bazaar route** |
| GET `/sparks/balance` · POST `/sparks/earn` · POST `/sparks/spend` · POST `/sparks/vendor/buy` · GET `/sparks/vendor/catalog` · GET `/sparks/ledger` | `backend/sparks-adapter-routes.js:107/127/115/144/143/157`, mounted server:2183 | adapter over **economy-service** (the realm's real Sparks path — see §4) |
| GET `/api/economy/balance` · GET `/api/economy/inventory` · GET `/api/economy/catalog` · POST `/api/economy/catalog/purchase` · POST `/api/economy/grant` · POST `/api/economy/spend` | `backend/economy-routes.js:92/109/124/156/240/275`, mounted server:2181 with `softAuth` | `data/economy.json` (or Postgres if `DATABASE_URL` set — it is not) |
| POST `/api/x402/charge` · GET `/api/x402/balance?user=` · POST `/api/x402/grant` | `backend/x402-routes.js` + `lib/paybox-settle.js` (via x402 mounts, server ~L1935–1955) | **SHAD-Credits** in `data/x402-ledger.json` — a *different currency* from Sparks (§4.2) |
| GET `/api/world/saves` · PUT `/api/world/saves` | `backend/agent-room-routes.js:162/176`, `softAuth` | `data/world-saves/<uid>.json` — **exists, works, frontend never calls it** (§5 G-1) |
| POST `/api/world/redeem` | `agent-room-routes.js:134` | beta/world pass codes → session identity (`data/player-codes.json`, `world-beta-codes.json`) |
| GET `/api/home-deeds` · GET `/api/home-deeds/mine` · POST `/api/home-deeds/buy` | `backend/home-deed-routes.js:34/40/45` (r.get/r.post), mounted server:2180 with `softAuth` | `data/home-deeds.json` via JsonStore; price in Sparks via economy-service |
| GET `/api/home/status` · `/homes` · POST `/inhabit` · `/rent` · `/checkin` · `/vacate` · `/stall-sale` | `backend/home-routes.js:66–138` | **MODULE NEVER MOUNTED** — only its test requires it. All `/api/home/*` = 404 in production (§5 G-3) |
| GET/POST `/api/portal-plots…` | `backend/lib/portal-plots-routes.js`, mounted server:2160 | `data/portal-plots.json`; separate from the city deed plots (§2.3) |
| GET `/api/grid/visitors` · GET `/api/grid/portals` · POST `/api/grid/portals/register` | `backend/federation-routes.js:138/207/216`, mounted server:3311 | portal ring + visitor counts |
| POST `/api/mp/sync` · POST `/api/mp/chat` | `backend/multiplayer.js:60/114`, mounted server:2178 | **in-memory only** rooms, 8 s presence TTL, prune interval L142 (§5 G-6) |
| POST `/api/shaddai/chat` | `backend/api-proxy-routes.js:479` (under `/api` mount, server:1872) | Navi "Agent" channel; LLM via backend providers |
| POST `/api/ask` · POST `/api/council` (+ overview/search/summary/synthesize/crosstalk/books/gallery/rooms) | `backend/brain-server.js:573/546`, mounted server:1878 | RAG brain (local index in `backend/data/rag/`) |
| POST `/api/model/chat` · POST `/api/agent/run` · GET `/api/agent/tools` · POST `/api/tools/run` · GET `/api/skills/stats` | `api-proxy-routes.js` (tools/run L6994, agent/run L6864, skills/stats L7399) + inline model routes | council chat + agent dialogue + interiors tool calls |
| GET `/api/news/crypto` | `backend/news-routes.js:56` | external news APIs, cached |
| GET `/api/markets/ohlc` | `backend/markets-routes.js:27` (**only** there; inline `/api/markets/*` in server-production shadows sibling paths — census §dup) | external market data |
| GET/POST `/api/chat/<chan>` | `backend/lib/chat-routes.js`, mounted server:2177 | room chat, PIKADON-scanned |
| POST `/api/games/score` | `backend/games-routes.js:32` | `data/games-scores.json`; **grants 5 Sparks units/day to any named body `user`** (§4.3) |
| `/api/race/*` (challenge etc.) | `backend/race-routes.js`, mounted server:3352 | `data/leaderboards.json` + race state |
| `/api/operatives` (+`/:id`) | `backend/lib/operatives-routes.js`, mounted server:2148 | `data/operatives.json` |
| `/api/navi/signals` | **inline** server:1608 (wins) + duplicate in `navi-routes.js` (mounted server:2179 under `/api/navi`, `softAuth`) | tier decided from verified Firebase identity only |
| `/api/forge/*`, `/api/agent-forge/*`, `/api/collectables/*`, `/api/rooms/*`, `/api/market` (skill market), `/api/cosmetics/*`, `/api/radio/*`, `/api/museum/item`, `/api/school/*` (academy), `/api/mmo/*` | respective modules, mounts server:1924–2162 | see census part for per-route tables |

### 1.2 Duplicates / shadows found (cleanup, not gaps)
- `/api/navi/signals` defined twice (inline server:1608 wins over navi-routes).
- Inline `/api/markets/*` shadows `markets-routes.js` for sibling paths; `/api/markets/ohlc` exists only in the router.
- Duplicate mounts: `/.well-known/mcp.json`, `/api/news/analyze`, `/api/security`, `/api/media`.
- `server-production.js:850` calls `economy-service.getInstance()` — **that export does not exist** (the module exports `getDefault`); the city signal-drop Sparks charge at that call site is dead code (DATA_AUTH_DEPLOY §bonus). It currently also neutralises a raw `x-user-id` spend path that would otherwise be unsafe.

### 1.3 WebSocket reality
One path-less `new WebSocket.Server({server})` (server:439) multiplexes two protocols by message shape: the app protocol (`{action:'subscribe'|'ping'}` → ack only, no fan-out, server:804) and a game relay grafted from `mp-server.js` (`{t:'hello'|'move'|'region'|'chat'}` broadcast among `__isGame` clients, in-memory `mpPlayers`, server:748–761). `mp-server.js` itself is **standalone** (own server, port 8790) and is **not** run in production. `academy-socket.js` defines `/ws/academy` + SSE but no mount was found in server-production.js [UNVERIFIED wiring — census part]. **The 3D realm frontend opens zero WebSockets** (§2) — its realtime is the `/api/mp` poll relay.

---

## 2. FRONTEND CALL MAP (condensed — full table in FRONTEND_CALL_MAP.md)

**Counts:** 133 distinct (URL, method) pairs — 96 same-origin `/api/*` in strict realm scope, 4 `/sparks/*`, 5 `/api/library/*`, 1 portal-plots, 25 asset/config GETs, 2 browser-direct external (CoinGecko + DexScreener search, `world-lounge.js`). **Zero WebSocket / EventSource / sendBeacon in the entire frontend.** One synchronous XHR (terrain.json, `world-layout.js:213-216`). `window.SHADDAI_API_BASE` is never assigned anywhere in `public/` — every call is same-origin.

### 2.1 Polling (all realtime is polling)
| Call | Interval | Caller |
|---|---|---|
| POST `/api/mp/sync` (+`/api/mp/chat` on send) | 2,500 ms | `world-navi-chat.js:36/55` |
| GET/POST `/api/chat/<chan>` | 2,500 ms | `world-chat.js` |
| world/agents refresh | 10,000 ms | world-main |
| GET `/api/bazaar/list` | 30,000 ms | world-main (Bazaar stalls) |
| `/sparks` sync | 30,000 ms | `sparks-ledger.js` |
| GET `/api/markets/ohlc` | 60,000 ms ×2 drivers | world-main |
| home-deeds refresh | 60,000 ms | `world-home-deeds.js` |
| GET `/api/news/crypto` | 300,000 ms | world-main |
| GET `/api/grid/visitors` | **disabled** (commented out, world-main.js:3184) | — |

### 2.2 Match verdicts (frontend call ↔ backend route)
- **Every live `/api/*` call in the realm has a matching backend handler** — with three exceptions, all verified by handler search:
  1. **GET `/api/home/status`** (`world-city-actions.js:520`) → home-routes.js exists but is **never mounted** → 404 (§5 G-3).
  2. `/api/agentmail/messages` and `/api/radio/queue` appear in `world-interiors-v3.js:583-606` as **metadata declarations with no live fetch caller** — not real calls today [per FRONTEND_CALL_MAP].
  3. Three dormant `/api/chain/<chain>/*` pairs in `world-showcase.js` — adapter never enabled by any caller.
- **Backend routes nobody in the realm calls** (the bigger problem): `/api/world/saves` GET/PUT (§5 G-1), most of `/api/economy/*` (the realm uses the `/sparks` adapter instead), `/api/bazaar/list-item` + DELETE + order-external (realm only lists + buys), `/api/home-deeds/mine` [UNVERIFIED whether any panel calls it], `/api/mp` is called but its `players` payload is discarded (§5 G-6).

### 2.3 Plots — three different things with similar names (do not conflate)
1. **City deed plots** — rendered client-side from the static asset `public/assets/world/plots-v4.json` (~1,275 plots; `world-city-v3.js:231`, `world-city-actions.js:34`). Claims are **not** wired to any backend endpoint in the 3D city UI — `world-city-actions.js:13` says so in its own header: "plots → counts from plots-v4.json, claim soon (MCP-only today)".
2. **Portal plots** — server-backed: `/api/portal-plots` (`lib/portal-plots-routes.js`, `data/portal-plots.json`), client `public/portals/portal-plots.js` (loaded by the realm HTML:458). Rentable/buyable portal-world plots — a different feature from city deeds.
3. **SAP plots** — `data/sap-plots.json`, read-only seed consumed by treegens-service, no write-back (DATA_AUTH_DEPLOY).

### 2.4 Reconciliation with REALM_SYSTEMS_INVENTORY.md (disagreements — handler read wins)
| Inventory claim | Verdict after handler read |
|---|---|
| ~55 `/api/*` endpoints | **Undercount.** Frontend actually calls 96 same-origin `/api/*` pairs in strict scope + `/sparks/*` ×4 (FRONTEND_CALL_MAP). Inventory counted only the ones its crew surfaced per-system. |
| `/api/mp` poll presence; positions sync via world-navi-chat.js every 2.5 s; no client renders other players | **Confirmed exactly.** `multiplayer.js:60/114` mounted server:2178; `world-navi-chat.js:36` sends `{room,id,name,agent:'',x,y}` and its `.then` reads **only `d.chat`** — `d.players` is discarded. (Census part had marked /api/mp [UNVERIFIED] because `multiplayer.js` trips binary detection in grep — it is plain JS with a non-UTF8 byte; routes verified by direct read for this map.) |
| Server-backed plots via `/api/portal-plots` + `plots-v4.json` | **Half right, conflated.** `/api/portal-plots` is real and server-backed but is the *portal* plot system; `plots-v4.json` is a *static client asset* for city deeds with no backend claim path (§2.3). |
| Sparks via sparks-ledger.js | **Confirmed and refined.** `public/sparks-ledger.js` is loaded by the realm (HTML:416) and talks to the `/sparks` adapter (mounted server:2183) over economy-service — but only in "server mode" when a real uid exists; otherwise it silently runs a localStorage-only wallet (§4.1). |
| `/api/skate/score`, `/api/lounge/tracks` listed as endpoints | **Not endpoints and not live calls.** Both strings exist only in frontend *comments* describing future hooks (`world-skatejam.js:18` "POST /api/skate/score later"; `world-lounge.js:29` "e.g. GET /api/lounge/tracks"). No backend handler exists (searched all of `backend/**/*.js`). They are gap items G-9/G-10, not census entries. |
| `/api/home/status` implied working | **Broken.** Caller exists (`world-city-actions.js:520`), handler module exists (`home-routes.js:73`), but the module is never mounted → 404 (G-3). |

---

## 3. DATA STORES (condensed — full census in DATA_AUTH_DEPLOY.md)

27 realm/economy-relevant files in `backend/data/` + `world-saves/` (2 save files). **Durable across a Render redeploy: 0** (§6).

| Store | Schema (top level) | Writer → persistence |
|---|---|---|
| `economy.json` | accounts keyed by user-id; integer units (100 = 1 Spark); append-only `spark_transactions[]` | economy-service → JsonStore atomic tmp+fsync+rename on every mutation; promise-chain lock (race-safe in-process) |
| `x402-ledger.json` | SHAD-Credit accounts, float balances | `x402-routes.js`/`lib/paybox-settle.js` → plain `writeFileSync`, **no lock**; **plus** `lib/x402-ledger.js` writes an incompatible `{accounts}` schema to the *same filename* (§4.2) |
| `bazaar.json` (+`bazaar-purchases.json`) | `{listings[], orders[]}` | bazaar-routes → plain non-atomic `writeFileSync` per mutation |
| `home-deeds.json` | `{deeds{}}` keyed by home id → owner | home-deed-routes → JsonStore atomic |
| `navi-state.json` | per-user Navi state (name, signups, enrolments) | navi-routes → JsonStore atomic |
| `portal-plots.json` | plot records w/ owner/rent state | portal-plots-routes → atomic per mutation |
| `world-saves/<uid>.json` | `{uid, at, save:{namespaced keys}}` | agent-room-routes PUT → atomic; only 2 files exist (`second@shaddai.dev`, `tester1@shaddai.dev`) — i.e. only test accounts have ever saved |
| `leaderboards.json`, `games-scores.json`, `arcade-scores.json`, `battle-results.json` | score arrays/objects | per-mutation writes (games-scores non-atomic); battle-results also mirrored to Firestore [if configured] |
| `achievements.json` | per-user achievement state | 800 ms write-behind debounce + shutdown flush + Firestore mirror [if configured] |
| `operatives.json`, `custom_agents.json`, `chat.json`, `sessions.json`, `treasury.json`, `city-boosts.json`, `player-codes.json` | various | per-mutation (collectibles/custom_agents have multi-writer lock-free races — DATA_AUTH_DEPLOY) |
| `agent-market.json` | — | **Orphan: no backend reader or writer found.** The live market is `/api/market` → `skill-market.json` + `agent-market` data inside economy/market modules [see DATA_AUTH_DEPLOY] |
| `sap-plots.json`, `paybox-wallets.json`, `world-beta-codes.json` | seeds/config | read-only or config; no realm write path |

**Who writes `backend/data/` on the live server also matters for §6:** all of it lives inside the deployed container's filesystem.

---

## 4. IDENTITY / AUTH — how the realm knows who you are

### 4.1 The identity split (the realm's #1 connection defect)
- `window.SHADDAI_USER` — the value every money call in world-main/HTML keys off (bazaar buy, x402 charge/grant/balance, games score, museum, portal register) — is set in exactly two places: `SHADDAI-WORLD-3D.html:728` → `'guest'`, and `world-main.js:4551` → `'owner'` (comment: "this is the owner's own world"). The HTML inline script runs first during parsing; world-main.js is a deferred module — **so the effective identity for the entire realm session is the literal string `'guest'`**, shared by every visitor on earth. It is never set from a URL param, localStorage, or a server response (searched all of `public/`).
- The *real* session identity exists in parallel and is never merged into `SHADDAI_USER`: `Authorization: Bearer <localStorage shd_token>` + `x-user-id` from `shd_userid` (set by `world-gate.js:97` from the `/api/world/redeem` response) or `shd_uid` / `shd_player_code` — used by agents-ui, academy, home-deeds and city-actions, i.e. only by the newer modules.
- `sparks-ledger.js` has its own uid rule (SHD_AUTH.user.uid, else `shd_userid` if not `guest-*`/`'local'`, else null → **local mode**). A guest therefore has a purely localStorage Sparks wallet that any `localStorage.setItem('shaddai.sparks', …)` can inflate; a signed-in player's wallet is server-validated through the `/sparks` adapter.

### 4.2 Two currencies, three ledgers
1. **Sparks** — `economy-service.js` → `economy.json`. Integer units (100 = 1 Spark). `grant/spend/grantSparks/spendSparks`, append-only transaction log in the same file, idempotency-key replay protection, in-process promise-chain lock, optional Postgres path (`DATABASE_URL` — unset in render.yaml). Identity hardening exists: `lib/economy-identity.js` rejects `'local'` and bare body `userId` (401); `/grant`+`/spend` require a service-token header.
2. **SHAD-Credits** — `x402-routes.js` + `lib/paybox-settle.js` → `x402-ledger.json`. Floats, **+100 free on first sight of any user string**, no lock. Bazaar settles in this currency.
3. **The collision** — `lib/x402-ledger.js` writes an incompatible `{accounts}` schema to the same `x402-ledger.json` filename.
- Bridge `lib/economy-x402-bridge.js` (SHAD-Credits ↔ Sparks) is **OFF** unless `X402_SPARKS_BRIDGE=true` — not set in render.yaml — and is additive-only.
- **Consequence:** buying a Bazaar item does not touch your Sparks; the Sparks balance in the HUD and the Bazaar balance are different wallets with different integrity rules. The Bazaar wallet credits 100 free units to any new user string — including `'guest'`.

### 4.3 Auth posture (deployed config)
- `softAuth` (`backend/auth-guard.js:145`) verifies a Firebase ID token (only if the service-account env is set) or the app's own JWT (including signed `guest:<uuid>` tokens), sets `req.userId`/`req.isAuthenticated` (never `req.user`), and only hard-401s when `REQUIRE_AUTH=true`. **render.yaml sets `REQUIRE_AUTH="false"`**, `NODE_ENV=production` (so the dev `x-user-id` header shortcut is ignored in prod).
- Canonical Sparks routes are safe against id-spoofing (economy-identity rules above). **Adjacent routes are not:** bazaar has **no softAuth at all** and charges/transfers using body-supplied `buyer`; `/api/games/score` grants 5 Sparks units/day to any named body `user`; portal-plots, chat, leaderboards writes are unauthenticated.
- ⚠️ Ordering warning from DATA_AUTH_DEPLOY: enabling the x402↔Sparks bridge before fixing bazaar identity converts the SHAD-Credit spoof into a Sparks drain.

### 4.4 What this means for "is the economy real?"
For a **signed-in** player: Sparks are real (server ledger, idempotent, logged) but **evaporate on redeploy** (§6). For a **guest** (the realm's default state): the economy is cosmetic — local wallet, shared `'guest'` server identity, free 100 SHAD-Credits on first sight. Home deeds are the most "real" flow: softAuth + server-side deed + Sparks price — but only reachable by modules that use the real session identity.

---

## 5. THE CONNECTION GAP LIST — what must be built to finish the realm

Sizes: **S** = one sitting for a small model (single file/route, clear verify), **M** = a few files + tests, **L** = design + multiple systems. Every item: frontend today / backend today / the exact connection / verify.

### G-1 — Player save is built server-side and never called by the realm ★ highest value
- **Frontend:** hero persists only in `localStorage shd.hero3d` (`world-actions.js:411/417`); position only inside `shd_world_snapshot_v1` / `shd_navi_v1`; inventory in `shd_inv_v1`; ~77 localStorage keys total, zero server save calls.
- **Backend:** DONE — `GET /api/world/saves` + `PUT /api/world/saves` (`agent-room-routes.js:162/176`, softAuth) → `data/world-saves/<uid>.json`, schema `{uid, at, save:{namespaced keys}}`. Only 2 test-account files exist.
- **Build (frontend only):** on login/identity-ready and every 30 s + on `beforeunload`: `PUT /api/world/saves` with header `x-user-id: <shd_userid>` (or Bearer `shd_token`), body `{save:{"hero": <shd.hero3d>, "navi": <shd_navi_v1>, "inv": <shd_inv_v1>, "snapshot": <shd_world_snapshot_v1>}}`; on load: `GET /api/world/saves` → hydrate localStorage before world-main reads it. Response shape already matches (handler returns the stored object).
- **Size: M** (one new frontend module + load-order care). **Verify:** sign in, change hero, clear localStorage, reload → hero/inventory restored; a new file appears in `backend/data/world-saves/`.

### G-2 — One identity for money: merge session identity into `SHADDAI_USER`
- **Frontend:** `SHADDAI_USER` = `'guest'` always (§4.1); newer modules use `shd_userid` separately.
- **Backend:** identity exists (`/api/world/redeem` response sets `shd_userid` via world-gate; softAuth verifies tokens).
- **Build:** in the realm HTML bootstrap (before world-main.js), set `window.SHADDAI_USER = localStorage.getItem('shd_userid') || window.SHADDAI_USER` and refresh it after redeem; delete the `'owner'` fallback in world-main.js:4551 or make it read the same source. No backend change.
- **Size: S. Verify:** signed-in session → bazaar buy body shows the real uid, not `"guest"`; guest session still works in local mode.

### G-3 — Mount `home-routes.js` (all of `/api/home/*` is 404)
- **Frontend:** `world-city-actions.js:520` calls `GET /api/home/status` (with user) today and gets 404; home panel features (inhabit/rent/checkin) have no live path.
- **Backend:** module complete (`home-routes.js`: `/homes`, `/status`, `/inhabit`, `/agents`, `/rent`, `/checkin`, `/vacate`, `/stall-sale`) + passing tests — just never mounted.
- **Build:** one line in server-production.js near L2180: `app.use('/api/home', softAuth, require('./home-routes')());` — confirm the factory/service wiring from `home-service.test.js:251` (`require('./home-routes')(svc)`).
- **Size: S. Verify:** `GET /api/home/status?user=<uid>` returns 200 JSON instead of 404; city-actions home panel populates.

### G-4 — Unify the money: one wallet for Bazaar + HUD Sparks
- **Frontend:** Bazaar UI settles via `/api/bazaar/buy` (SHAD-Credits); HUD Sparks via `/sparks` (Sparks). Two balances, two names.
- **Backend:** bazaar charges through x402/paybox-settle; economy-service is the hardened ledger; bridge exists but OFF and additive-only; third writer (`lib/x402-ledger.js`) collides on the same file.
- **Build (pick one, in this order):** (a) make `bazaar-routes.js` buy path call economy-service `spend/grant` (Sparks) instead of paybox-settle — request/response to the frontend unchanged (`{ok, price, balance}`-style body already returned by the handler [see census part for exact shape]); (b) retire or rename `lib/x402-ledger.js`'s file to `x402-agent-ledger.json` so only one writer owns `x402-ledger.json`; (c) only then consider `X402_SPARKS_BRIDGE=true` for legacy SHAD-Credit balances. **Do (a)+(b) before ever enabling the bridge (§4.3 warning).**
- **Size: M. Verify:** buy a listing → Sparks balance (GET `/sparks/balance`) drops by price, seller's rises by price−5%, `spark_transactions[]` gains both entries; SHAD-Credit balance unchanged.

### G-5 — Bazaar identity + write integrity
- **Frontend:** sends `buyer: window.SHADDAI_USER` (today `'guest'`).
- **Backend:** bazaar routes have **no softAuth**; buyer/seller taken from the request body; store written with non-atomic `writeFileSync`, no lock.
- **Build:** mount bazaar with `softAuth` (as home-deeds is), derive buyer from `req.userId` when authenticated and reject body/param mismatch; move `bazaar.json` writes onto the JsonStore atomic pattern used by home-deeds. Endpoints/shapes unchanged: `POST /api/bazaar/buy {id}` (buyer no longer trusted from body), `POST /api/bazaar/list-item {name,kind,price,desc,image}` (seller from session), `DELETE /api/bazaar/:id`.
- **Size: M. Verify:** buy with a forged `buyer` field for another uid → 401/ignored; concurrent buys of the last unit → exactly one succeeds, file stays valid JSON.

### G-6 — Multiplayer presence: render the players the server already sends ★
- **Frontend:** `world-navi-chat.js` uploads `{x, y:z}` every 2.5 s and **discards `d.players`**; chat works. No remote-player meshes exist in the 3D scene. (The 2D pixel-office client *does* render others from the same endpoint — proof of shape.)
- **Backend:** DONE for MVP — `POST /api/mp/sync` returns `{ok, online, players:[{id,name,agent,x,y}], chat:[…]}` (multiplayer.js:93–107), rooms, 8 s TTL, in-memory. WS game relay also exists but the realm doesn't use it.
- **Build (frontend only):** consume `d.players` in world-navi-chat.js → hand to a new `world-presence.js` that keeps one lightweight avatar (capsule + name sprite, or the agent portrait billboard) per remote id, lerps to (x, y→z), removes ids absent for >8 s. No backend change for MVP. Later upgrade path: move sync to the existing WS relay (`{t:'move'}`) — spec only, not needed to finish.
- **Size: M** (L if hero GLB bodies per player are wanted — start with billboards). **Verify:** two browsers signed in → each sees the other's avatar moving in the plaza within ~3 s; closing one removes its avatar within ~10 s.

### G-7 — City deed plots: give plots-v4 claims a backend
- **Frontend:** plots render from static `plots-v4.json`; claim is explicitly unimplemented ("claim soon (MCP-only today)", world-city-actions.js:13).
- **Backend:** no city-deed store or routes exist. (`/api/portal-plots` is a different feature — §2.3. `home-deeds.json` is the pattern to copy.)
- **Build:** new `backend/city-deed-routes.js` + `data/city-deeds.json` (JsonStore): 
  - `GET /api/city-deeds` → `{deeds: {<plotId>: {owner, price, at}}}`
  - `POST /api/city-deeds/buy {plotId}` (softAuth; price from plots-v4 server copy or a prices map) → economy `spend` → `{ok, plotId, owner, balance}` / 402 `{error:'insufficient_sparks'}`.
  Frontend: world-city-actions claim button calls buy, then re-renders plot colour from GET state merged over plots-v4 geometry.
- **Size: M. Verify:** buy plot → deed persists in city-deeds.json, second buyer gets 409/owned error, Sparks drop matches price.

### G-8 — Dynamic city state (only if the city becomes dynamic)
- **Frontend:** city is static JSON + local edits in `shd.placementEdits(.v4)`, `shaddai.city` localStorage.
- **Backend:** `city-boosts.json` exists (writer in DATA_AUTH_DEPLOY) but there is no general city-state route [UNVERIFIED full coverage — census part].
- **Build:** fold into G-1's save (placement edits are per-player) — no new endpoint needed for single-player city edits. A shared/public city state (boosts, screens content) needs `GET/POST /api/city/state` over a JsonStore — **defer until the city builder (wave 2) lands**; building it now would spec against a city that doesn't render yet.
- **Size: L, deferred. Verify:** n/a until wave 2.

### G-9 — Skate leaderboard backend (hook exists in comments only)
- **Frontend:** `world-skatejam.js` keeps LB in localStorage; comment promises `POST /api/skate/score`.
- **Backend:** nothing (hall/skate.js is a card-game pack, unrelated).
- **Build:** mirror games-routes pattern: `POST /api/skate/score {user, score, tier}` → append to `games-scores.json` under a `skate` bucket (or `data/skate-scores.json`); `GET /api/skate/leaderboard` → top 50 `{user, score, tier, ts}`. Add the same daily-grant guard games-score has, or none — but not an unauthenticated Sparks grant.
- **Size: S. Verify:** post a score → appears in GET leaderboard; survives server restart (file write).

### G-10 — Lounge tracks endpoint (hook exists in comments only)
- **Frontend:** `world-lounge.js:29` describes `GET /api/lounge/tracks -> [{title, artist, url}]`; today tracks are hardcoded/local.
- **Backend:** `/api/radio/*` exists (radio-routes, community tracks + bulletin) — check overlap before building new.
- **Build:** prefer wiring world-lounge to the existing radio catalog if its shape fits; else `GET /api/lounge/tracks` reading `data/lounge-tracks.json`. Response exactly `[{title, artist, url}]` per the frontend comment.
- **Size: S. Verify:** lounge UI lists tracks served by the endpoint (disable local fallback to prove it).

### G-11 — Agent brains: keys, models, and the Navi tier path
- **Frontend:** three chat surfaces — Navi Agent channel `POST /api/shaddai/chat {message}` → reads `d.response||d.output`; council panels `POST /api/model/chat {message, agent}`; dialogue `POST /api/agent/run {agent, prompt}` (8 s canned fallback); RAG brain `POST /api/ask` / `/api/council`.
- **Backend:** all mounted (§1.1). Providers are server-side only — **the browser makes zero direct AI calls** (FRONTEND_CALL_MAP). Model access is via backend provider modules (Groq first per render.yaml comment; OpenRouter optional fallback; llm-proxy-routes at server ~L1501; brain-server uses the local RAG index + provider chain).
- **Env var NAMES required (values never printed):** `GROQ_API_KEY` (primary), `OPENROUTER_API_KEY` (optional fallback), `FIREBASE_SERVICE_ACCOUNT` (enables token verify + the paid Navi signals tier), `ADMIN_TOKEN` (admin/service-token routes incl. economy grant/spend service path), `HELIUS_API_KEY`/`HELIUS_RPC_URL` (signals), `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHANNEL` (signal pollers), `STRIPE_SECRET_KEY`, `SUNO_API_KEY`, `FAL_KEY` (optional creation features).
- **Gap:** none structural — the connection exists. The *product* gap is that with `REQUIRE_AUTH=false` and no Firebase configured, the paid Navi tier can never verify anyone, so `/api/navi/signals` serves everyone the free delayed preview. **Build:** none for launch; document as a config decision (set `FIREBASE_SERVICE_ACCOUNT` + flip `REQUIRE_AUTH` when identity (G-2) lands).
- **Size: S (config/docs). Verify:** with keys set, `/api/model/health` (Render healthCheckPath) reports provider ok; Navi Agent channel answers in-realm.

### G-12 — Races & leaderboards: mostly connected, one integrity hole
- **Frontend:** race flows call `/api/race/*`; scores via `/api/games/score`.
- **Backend:** race-routes mounted (server:3352), leaderboards in `leaderboards.json`; games-score grants 5 Sparks units/day to **any named body user** (unauthenticated).
- **Build:** put `/api/games/score` behind the same identity rule as G-5 (session-derived user; keep the daily cap). No shape change.
- **Size: S. Verify:** forged-user score post no longer grants Sparks to the victim/attacker account.

### G-13 — Settings & profile: local-only today
- **Frontend:** quality/theme/audio/HUD prefs in localStorage (`shd_quality`, `shaddai_world_theme`, `shd_hud_prefs_v1`, …); display name in `shd_display_name` + navi-state server-side via navi-routes.
- **Backend:** navi-state covers name/signups/enrolments; no general profile/settings route.
- **Build:** fold settings into G-1's world-save payload (`"prefs": {...}` namespace) — no new endpoint.
- **Size: S (rides on G-1). Verify:** change theme on laptop → phone session (same login) loads with it after save lands.

### G-14 — Persistence itself (the floor under G-1…G-13) ★ launch blocker for any real economy
- **Frontend:** n/a. **Backend:** all stores are files in the container (§3, §6).
- **Build (choose one):** (a) Render persistent disk mounted at `backend/data` (plan change — free tier has none); (b) move the hot stores (economy, bazaar, deeds, saves) to the already-coded Postgres path (`DATABASE_URL` — economy-service supports it; others would need ports); (c) extend the Firestore mirror pattern already used by achievements/battle-results to the hot stores.
- **Size: M–L depending on choice. Verify:** redeploy the service → balances, listings, deeds and world-saves are unchanged afterwards. **Until this is done, every other gap item is building on sand: any redeploy resets the economy to the git-committed seed.**

### Gap summary & total size
| # | Item | Size | Type |
|---|---|---|---|
| G-1 | Wire `/api/world/saves` into the realm | M | frontend only |
| G-2 | One identity (`SHADDAI_USER` ← session) | S | frontend only |
| G-3 | Mount home-routes | S | backend, 1 line + wiring |
| G-4 | Unify Bazaar onto Sparks; end ledger-file collision | M | backend |
| G-5 | Bazaar auth + atomic store | M | backend |
| G-6 | Render remote players (presence) | M | frontend only |
| G-7 | City-deed claim backend | M | new routes + frontend |
| G-8 | Dynamic city state | L | deferred to wave 2 |
| G-9 | Skate leaderboard | S | backend mirror |
| G-10 | Lounge tracks | S | wire-or-build |
| G-11 | Agent-brain config (keys/tier) | S | config/docs |
| G-12 | Games-score identity | S | backend |
| G-13 | Settings sync | S | rides G-1 |
| G-14 | Durable persistence (disk/Postgres/Firestore) | M–L | infra decision |
**Total: ≈ 4 S + 5 M + 1 deferred L + 1 infra M–L.** The striking fact: **only G-7 and G-14 require genuinely new backend systems** — everything else is mounting, wiring, or identity plumbing on code that already exists.

---

## 6. DEPLOY REALITY

- **Service:** Render web service `shaddai`, `plan: free`, `runtime: node`, build `npm install`, start `npm start` → `node backend/server-production.js` (package.json). Port: `process.env.PORT || 3000` (server:3517). autoDeploy: true. Health check: `/api/model/health`. (render.yaml, package.json — DATA_AUTH_DEPLOY.)
- **Static serving:** `express.static(public/)` at server:513–535. Exact cache behaviour (verbatim in census part): **no `maxAge`/`etag` options passed** (Express defaults; weak ETag on). `setHeaders`: `.html`/`sw.js` → `no-cache, no-store, must-revalidate`; hashed `dist/boot-<n>.<hex>.js` → `public, max-age=31536000, immutable`; **`assets/**` (glb/webp/png/jpg/jpeg/avif) → `public, max-age=86400` — one day, explicitly NOT immutable**; `.bin` (terrain height16) and everything else → **no explicit Cache-Control**. Global middleware (server:476) also forces no-cache on all GET `*.html`. `/SHADDAI-WORLD-3D.html` has a special handler (server:486) serving `tools/boot-dist-guard.cjs worldHtml()` with static fallback. Compression is on but skips `.glb`/`.webp`/SSE.
  - **Implication for the 599 MB asset tree:** repeat visits revalidate/re-download textures and models after 24 h and `.bin` terrain has no cache policy at all — this is a real, fixable contributor to repeat-visit load time (raise assets to a long immutable-style policy only for content-hashed or versioned URLs — the realm already version-busts with `?v=`; a `max-age=31536000` on `assets/` *with* the existing `?v=` busting is the safe form. Changing headers is a server edit — listed here as a finding, not done.)
- **Sleep/keep-alive:** free tier spins down (~15 min idle); code self-pings every 10 min when `RENDER_EXTERNAL_URL`/`SELF_PING_URL` is set (server:3563) + optional UptimeRobot (`npm run uptime`). Presence/chat in-memory state (G-6) dies on every spin-down/restart regardless.
- **Env vars the realm features read (NAMES ONLY):** `PORT`, `NODE_ENV`, `REQUIRE_AUTH`, `ADMIN_TOKEN`, `FIREBASE_SERVICE_ACCOUNT`, `GROQ_API_KEY`, `OPENROUTER_API_KEY`, `DATABASE_URL` (unset), `X402_SPARKS_BRIDGE` (unset), `HELIUS_API_KEY`, `HELIUS_RPC_URL`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHANNEL`, `STRIPE_SECRET_KEY`, `SUNO_API_KEY`, `FAL_KEY`, `RENDER_EXTERNAL_URL`, `SELF_PING_URL`.
- **Restart verdict (repeat of §3 because it governs everything):** on redeploy — and on any container replacement — `bazaar/economy/home-deeds/portal-plots/navi-state/chat/scores/world-saves` revert to whatever JSON is committed in git or are lost. Achievements and battle-results alone have a Firestore escape hatch, and only if Firebase was hand-configured outside render.yaml.

---

## 7. What "finished" looks like (acceptance, in dependency order)
1. G-14 decision made (else nothing below survives a deploy).
2. G-2 + G-3 + G-12 (one afternoon of S items) → identity is real, home panel works, score grant is safe.
3. G-1 (+G-13 riding) → a player's hero, inventory, position and prefs follow their login across devices.
4. G-5 → G-4 (auth before unification; never bridge first) → one Sparks wallet everywhere, Bazaar included.
5. G-6 → the realm is visibly multiplayer; G-7 → plots can actually be owned; G-9/G-10 close the two comment-promised hooks.
6. G-8/G-11 config when wave 2 (city) and the identity rollout land.
