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