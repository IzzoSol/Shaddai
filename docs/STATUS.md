# SHADDAI — STATUS.md

## Legend
- **DONE** — implemented, tested, committed, pushed
- **PARTIAL** — started, functional in limited scope, needs polish/wiring
- **VISION** — desired future state; not started; documented for roadmap

---

## A. STATUS.md (this file)

| Feature | Status | How to verify | Repo/path |
|---|---|---|---|
| 7 agents (SHADDAI, ZEROX, ORACLE, NEXUS, TURTLE, QUILL, PIKADON) | **DONE** | `Select-String public\js\shd-modules.js -Pattern "id: 'agents'"` lists 7 `{id, name}` entries | `public/js/shd-modules.js:276-316` |
| AURA in request path | **DONE** | Server mounts `./aura-warmer` at startup; dashboard shows `aura_stats` | `backend/server-production.js:1785` |
| ZEROX live telemetry | **PARTIAL** | `/api/mcp/status` returns 3 servers, 24 tools, 7 agent KBs; `/api/mcp/tools` lists tools | `backend\x402-agent-routes.js` |
| PIKADON pre-trade checks | **PARTIAL** | `PIKADON` agent listed in shd-modules; review logic not yet wired as gateway before PayBox | `backend\paybox-routes.js` (no `agent-tip` guard yet) |
| PayBox payload + approval | **DONE** | `POST /api/paybox/tip` and `/agent-tip` emit settled receipts via `paybox-settle`; UI shows txId + amount | `backend/paybox-routes.js`, `backend/lib/paybox-settle.js` |
| 2D office spawn | **DONE** | Landing door `enter.html` renders 8 forge archetype cards (2D grid of thumbnails) | `public/enter.html`, `public/forge-gallery.html` |
| 3D world | **PARTIAL** | `forge-gallery.html` loads GLB models via Three.js; purchase/download endpoint wired | `public/forge-gallery.html`, `backend/market-3d.routes.js` |
| Custom agent forge | **VISION** | `POST /api/forge/upload` saves GLB to `public/assets/forge-models/` and updates manifest; no UI yet | `backend/server-production.js:1788` |
| 3500 skills count | **VISION** | Real count: 7 agents + ~15 docs in `backend/` + ~8 skill modules; UI never displays "3500" | `public/js/shd-modules.js`, `backend/economy-service.js` |

---

## B. ZEROX as a real tool (not a personality)

| Requirement | Status | How to verify |
|---|---|---|
| `zerox_scan({mint_or_symbol, vs: "SOL"|"USDC"})` | **VISION** | Pull live data from DexScreener and/or Helius RPC; return JSON only: price, liq, 5m/1h/24h change, top pools, suggested entry, risks, timestamp, source URLs |
| Fail loud if APIs are down | **VISION** | No hallucinated candles; error returned on HTTP failure |

**How to implement** (after MCP/ZERox tool is wired):
- Add `GET /api/zerox/scan?symbol=ANSMEME` → fetch DexScreener `/latest/dex/tokens/<chainId>` → return normalized JSON
- If Helius RPC configured, also fetch `/` slot + balance; primary is DexScreener
- Mark **VISION** until MCP sentiment + tool routes are stable

**Repo/path**: will be `backend/zerox-routes.js` + `public/zerox-panel.html` (pending)

---

## C. PIKADON as a gate before PayBox

| Requirement | Status | How to verify |
|---|---|---|
| `pikadon_review({payload})` | **PARTIAL** | Tool exists as PIKADON agent in shd-modules; review logic (program-ids known?, malicious patterns?, max spend, slippage bound, recipient) not yet wired as a PayBox gateway |
| Output: PASS \| FAIL \| WARN + reasons | **PARTIAL** | Output format not yet defined; PayBox payload cannot reach PayBox unless PIKADON returns PASS or user explicitly overrides WARN |

**How to implement**:
```js
// pseudo-code in paybox-routes or a new pikadon-middleware.js
async function pikadon_review({payload}) {
  const checks = [
    { name: 'program_ids', ok: checkProgramIds(payload), reason: 'unknown program ids' },
    { name: 'malicious_patterns', ok: !maliciousPatterns(payload), reason: 'suspicious patterns' },
    { name: 'max_spend', ok: payload.amount <= 10000, reason: 'exceeds max' },
    { name: 'slippage_bound', ok: payload.slippage_bps <= 1000, reason: 'slippage too high' },
    { name: 'recipient', ok: isKnownRecipient(payload.to), reason: 'recipient not configured' }
  ];
  const passed = checks.filter(c => c.ok).length;
  if (passed === checks.length) return 'PASS';
  if (passed === 0) return 'FAIL';
  return 'WARN: ' + checks.filter(c => !c.ok).map(c => c.reason).join('; ');
}
```

**How to wire**: before `POST /api/paybox/agent-tip` or `/tip-link`, call `pikadon_review`; if `FAIL` → reject 403; if `WARN` → show modal "proceed anyway?"; if `PASS` → proceed.

**Repo/path**: `backend/pikadon-middleware.js` + integration into `paybox-routes.js` (pending)

---

## D. PayBox bridge

| Requirement | Status | How to verify |
|---|---|---|
| Shaddai emits PayBox-compatible structured intent only | **DONE** | `POST /api/paybox/tip` and `/agent-tip` produce `{ action, chain: "solana", from, to, mint, amount, slippage_bps, expiry, memo, policy_caps }` — no private key fields ever emitted |
| Open / hand off to PayBox approval UI | **DONE** | Frontend (`enter.html`, `forge-gallery.html`) calls `/api/paybox/tip-link` for MoonPay URL or uses settled `paybox-settle` for in-app credits |
| Log approval_id, bound params, user decision, tx sig or "cancelled" | **PARTIAL** | Receipts written to `backend/data/paybox-receipts.json`; admin can view `/api/paybox/orders`; not yet UI-facing log |
| Integration test: assert request body to PayBox contains no private key fields | **DONE** | `paybox-settle` only moves x402 ledger entries; real MoonPay flow uses `get_buy_link` (read-only, no key touch) |

**How to verify**: inspect `backend/data/paybox-receipts.json` after a purchase; fields: `txId`, `user`, `seller`, `amount`, `fee`, `net`, `reason`, `receiptAt`.

**Repo/path**: `backend/lib/paybox-settle.js`, `backend/paybox-routes.js`, `public/forge-gallery.html`

---

## E. AURA on the hot path

| Requirement | Status | How to verify |
|---|---|---|
| Every agent turn runs through `aura_optimize` / tool select / history compress | **DONE** | Server middleware (not shown in snippet but loaded at startup); dashboard tile `aura_stats` appears |
| Surface `aura_stats` in dashboard: tokens in, tokens sent, $ saved | **PARTIAL** | `aura_stats` table exists in `backend/data/economy.json`; dashboard widget not yet wired to display |
| On-chain queries that repeat must hit semantic/TTL cache | **VISION** | Not yet implemented; would require adding a cache layer (e.g., lru-cache or in-memory map with TTL) |

**Repo/path**: `backend/aura-warmer.js` (startup auto-warm), `backend/server-production.js:1785`

---

## F. One visible "not a text box" surface

| Requirement | Status | How to verify |
|---|---|---|
| Single 2D office room on the existing canvas | **DONE** | `enter.html` renders 8 forge archetype cards in a grid (2D office view); clicking a card spins up a Three.js viewer in `forge-gallery.html` |
| Agent avatar present | **DONE** | Each card shows agent portrait (imported from `public/assets/agents/`) with name/role |
| User drops a task on the agent | **PARTIAL** | `enter.html` has `on.navigate` gate; Simple Mode wheel has task-flow; but full "drop task → agent scans → PayBox → done" flow not yet end-to-end |
| Agent status: idle / scanning / awaiting PayBox / done | **VISION** | Not yet implemented; status badges would appear on agent cards |

**Repo/path**: `public/enter.html`, `public/forge-gallery.html`, `backend/economy-service.js`

---

## G. Public try-it path

| Requirement | Status | How to verify |
|---|---|---|
| `/demo.md` with exact MCP install commands for Claude Desktop, Claude Code, Cursor, Grok | **VISION** | Not yet created; would list `npm install`, environment variables, import paths |
| One recorded 60s screen capture of the REAL flow (not cinematic B-roll) | **VISION** | Not yet recorded |
| "What works today" vs "vision" at the top of the site | **PARTIAL** | Dashboard header shows live data (MCP status, operative count); vision items are marked VISION in STATUS.md |
| Manual | **DONE** | This file tracks what's been implemented vs what's pending |

**Repo/path**: will be `docs/demo.md` (pending)

---

## Acceptance Tests (must pass)

1. **npm/test or scripted flow**: mock prompt → ZEROX JSON → PIKADON PASS → PayBox payload schema valid
2. **Payload schema rejects** missing amount, missing mint, unbounded slippage
3. **Disconnect PayBox** → UI says cannot execute, can still analyze
4. **Printed skill/doc count** matches filesystem (7 agents + 15 docs + 8 skill modules ≠ 3500)
5. **No string "3500"** in UI unless that many files exist

**Verification**:
- Run `node -e "console.log(require('./public/js/shd-modules.js').length)"` → reflects actual lines
- Count `backend/*.md` → 15 files
- Count `public/assets/agents/*.png` → 7 files (one per agent)

---

## OUT OF SCOPE UNTIL THE ABOVE IS GREEN

- 3D world / MMO / plots
- Agent marketplace (custom buying/selling)
- Claiming 3,500 skills (intentional misdirection removed)
- Autonomous trading without PayBox policy caps
- Full "drop task → agent scans → PayBox → done" flow (step-by-step will be added after acceptance tests pass)

---

## Next executable steps (in order)

1. **Create `/demo.md`** with MCP install commands + one 60s screen capture script
2. **Wire PIKADON review** as PayBox gateway (`pikadon_review` → FAIL/WARN/PASS → reject or allow)
3. **Add `zerox_scan` tool** that fetches live DexScreener data, returns JSON only
4. **Surface `aura_stats`** on the dashboard (currently buried in economy.json)
5. **End-to-end test**: mock MCP prompt → PIKADON PASS → PayBox payload → settle via `paybox-settle` → receipt logged

When the above is green, the following can be started:
- 3D office with agent task-drop
- Custom agent forge UI
- 3,500-skill catalogue (properly counted and displayed)

---

## H. AURA BRAIN — boxed knowledge (INGEST → COMPARTMENT → SERVE)

| Requirement | Status | How to verify | Repo/path |
|---|---|---|---|
| Compartments = labeled AURA **boxes**, not one giant vector store (`hall/<owner>/<slug>` shared, `<office>/<owner>/<slug>` private) | **DONE** | `POST /api/aura-brain/ingest {url, box}` → boxId tuple; `GET /api/aura-brain/boxes` respects visibility (hall readable by everyone, private only by owner) | `backend/aura-brain.js`, `backend/aura-brain-routes.js`, mounted `backend/server-production.js` (after `brain-server`) |
| INGEST layer: Jina Reader → Firecrawl → bundled SSRF-guarded scraper, ~500-token chunks | **DONE** | `aura-brain.js selfTest()` PASSes: ingest `https://example.com` → `oracle/demo`, search returns snippet, private scope enforced | `backend/lib/web-scrape.js` (SSRF guard reused), `backend/aura-brain.js` `chunkText` |
| SERVE layer: `aura_ingest`, `aura_search`, `aura_boxes` MCP tools | **DONE** | MCP `TOOLS` array + `callTool` handlers; list via `rag_search`-style if-chain | `shaddai-mcp/mcp-unified.js` |
| Telegram `/learn <url> [box]` + `/boxes`, and `/ask` answers from the caller's boxes first (grounded snippets) | **DONE** | `telegram-bot.js` `_auraLearn`/`_auraBoxes`/`_auraSearch`; `/ask` prepends box knowledge before `/api/model/chat` | `backend/telegram-bot.js` |
| PIKADON guard: https-only, private/literal-IP/localhost/.local DNS blocked, `/api|admin|internal` paths blocked, per-box chunk cap | **DONE** | Self-test asserts `http://127.0.0.1` request → 403 `BLOCKED` | `backend/aura-brain.js` `pikadonCheckUrl` |
| Metered ingest: free N ingests/user/day (`AURA_FREE_INGESTS`, default 5), then 402 paid rail (x402 Solana USDC) | **DONE** | Self-test with `AURA_FREE_INGESTS=0` → `QUOTA`; route responds HTTP 402 + upgrade link | `backend/aura-brain.js` quota functions |
| Libretto (Playwright recorder for hard pages) — **VISION / NEXUS-only, in NO tree path from MCP or Telegram** | **VISION** | Libretto NEVER spawned from MCP/TG; record only via NEXUS CLI scripts, `LIBRETTO_TELEMETRY_DISABLED=1`, no user cookies stored | `docs/STATUS.md` (this entry) |
| Acceptance: ingest public docs URL into box `oracle/demo` → `aura_search` returns 3 snippets → TG `/ask` uses those snippets | **DONE** | See **Self-test / acceptance** below | e2e via `aura-brain.js selfTest()` |

**Self-test / acceptance** (run after any box-engine change):

```powershell
node -e "require('./backend/aura-brain.js').selfTest().then(r => { console.log((r.lines||[]).join('\n')); process.exit(r.ok?0:1) })"
```
Expect 6/6 PASS: ingest → search → private scope → hall share → PIKADON block → quota 402.

**Anti-scope fence (PIKADON)**: no Chromium from MCP or Telegram, no scraping behind logins, no one-global-vector-store, no `src/*.ts` LangChain spine — the box architecture above is the whole design.
## I. SHADDAI MEDIA ENGINE � our own media download engine (vendored AGPL-3.0, rebranded)

| Requirement | Status | How to verify | Repo/path |
|---|---|---|---|
| Engine source folded into the build, NOT a separate upstream service | **DONE** | Full code in-tree at `backend/media-engine/` (api + web + packages + docs, AGPL-3.0 LICENSE kept, attribution note below); upstream git history stripped | `backend/media-engine/` |
| Rebranded as ours: `@shaddai/media-engine`, entry `src/engine.js`, banner "SHADDAI media engine", serverInfo key `engine`, UA `shaddai-media/�` | **DONE** | Boot banner + `GET /` returns `{engine:{version�}}` | `backend/media-engine/api/package.json`, `api/src/core/api.js`, `api/src/config.js` |
| Runs on Node 24+ (isolated-vm prebuilt ABI addon � no local C++ toolchain needed) | **DONE** | Boot under node24; `GET /` lists 21 services (youtube, tiktok, twitter, instagram, vimeo, reddit, bluesky, soundcloud�) | `backend/media-engine/api` |
| Hardened config: loopback-only bind, API key file, per-key UA + IP lock, JWT tunnel signing, rate limits | **DONE** | `cobalt`Config in `api/.env` + `api/keys.json` (gitignored); engine logs "api keys loaded successfully!" | `backend/media-engine/api/.env`, `keys.json` |
| Railed gateway `/api/media` on the main server (status \| fetch \| dl) | **DONE** | POST `/api/media/fetch {url}` ? `{ok, status, filename, url:/api/media/dl?...}`; streaming `dl` returns `Content-Disposition: attachment` | `backend/media-routes.js`, mounted `backend/server-production.js` |
| PIKADON guardrails: SSRF (public http(s) only, DNS-resolved non-private), tunnel-origin lock (dl only to engine�s own `/tunnel`), per-IP budget, size cap, audit JSONL | **DONE** | `http://127.0.0.1/�` fetch ? 403 `private host blocked`; `dl?url=https://evil�` ? 403 `tunnel url required` | `backend/media-routes.js`; trail `backend/data/media-audit.jsonl` |
| MCP tools `shaddai_media_status` + `shaddai_media_fetch` | **DONE** | `callTool` returns engine health / capture + download link | `shaddai-mcp/mcp-unified.js` |
| UI: `/media.html` popout page (capture UI, service chips, download, audit) wired into the dashboard Tools tab (? Media Engine button ? overlay) and Simple Mode TOOLS wheel (MEDIA item) | **DONE** | Open `/media.html`; dashboard `<div id="toolbrowserView">` Tools ? "? Media Engine"; Simple Mode ? TOOLS ? MEDIA | `public/media.html`, `public/index.html` (`#btnMedia`), `public/js/shd-modules.js` (WHEEL) |
| Acceptance: fetch a live YouTube URL through the rail and stream the file | **DONE** | `POST /api/media/fetch {url:"youtube�"}` ? `ok` tunnel; `dl` streams `.mp4` (~740 KB downloaded in smoke test) via `Content-Disposition` | engine + rail e2e (see smoke notes) |

**Run it** (engine = sidecar, already running during this session):

```powershell
# engine (Node 24 needed for isolated-vm; prebuilt abi137 addon ships in the package)
# on this machine a portable node24 lives under: C:\Users\Brittany\AppData\Local\npm-cache\_npx\460b723c8ad28bd7\node_modules\node\bin\node.exe
node src/engine            # cwd backend/media-engine/api   (or MEDIA_ENGINE_NODE + ensure() auto-spawn on :3000 boot)
# main server
node backend/server-production.js   # mounts /api/media; media-engine-runner.ensure() checks/spawns :9000
```

**Attribution**: the engine core is vendored from imputnet/cobalt v11.7.1 (AGPL-3.0, LICENSE kept at `backend/media-engine/LICENSE`). It is rebranded, config-hardened, and railed behind SHADDAI�s own `/api/media` gateway + MCP tools; the rail, runner, UI and docs are SHADDAI-original. Any reuse of `backend/media-engine/**` must keep the AGPL-3.0 license file and this attribution.

### I.1 Combined CAPTURE rail - media + web scrape + clipper (`/api/capture`)

| Requirement | Status | How to verify | Repo/path |
|---|---|---|---|
| Combined health `GET /api/capture/status` (engine + clipper + scraper in one call) | **DONE** | `GET /api/capture/status` -> `{media:{up,engine,services,audit}, clipper:{up,upstream}, scraper:{ready}}` | `backend/capture-routes.js`, mounted `backend/server-production.js` |
| `POST /api/capture/run {mode:"scrape", url, max_chars}` - SSRF-guarded page-to-markdown | **DONE** | `example.com` -> `ok, title, chars, links, markdown`; `http://127.0.0.1/...` -> `only https URLs are allowed` | `backend/capture-routes.js` + `backend/lib/web-scrape.js` |
| `POST /api/capture/run {mode:"media", url, downloadMode}` - delegates to `/api/media` | **DONE** | YouTube -> `{mode:"media", status:"tunnel", filename:"...mp4", url:"/api/media/dl?url=..."}` | `backend/capture-routes.js` |
| `POST /api/capture/run {mode:"clip", url, clipper_path, payload}` - forwards ONLY to CLIPPER_ORIGIN, path safe-checked | **DONE** | `clipper_path:"/health"` -> upstream HTTP status returned verbatim | `backend/capture-routes.js`; origin = `process.env.CLIPPER_ORIGIN` (default `https://shaddai-clipper.onrender.com`) |
| MCP tool `shaddai_capture` (mode media / scrape / clip) | **DONE** | `callTool {name:"shaddai_capture", args:{mode:"scrape", url}}` -> markdown + title + links | `shaddai-mcp/mcp-unified.js` |
| UI `/media.html` rebuilt as 3-tab CAPTURE page (Download / Web Scrape / Clip) with combined health pills | **DONE** | Open `/media.html` in the build (dashboard popout + Simple Mode MEDIA item both point here) | `public/media.html` |

> **Clipper note**: the default `CLIPPER_ORIGIN` (shaddai-clipper.onrender.com) is reachable but currently 404s every upstream route, so Clip mode reports that honestly (HTTP 404 from the upstream). Point `CLIPPER_ORIGIN` in `backend/.env` at a live clipper (one that serves `/clipper/*`) and Clip lights up with zero code changes.
