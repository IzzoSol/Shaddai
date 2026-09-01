# SHADDAI — Public Try-It Path (/demo.md)

## Real Flow (60-second screen capture demo)

### Step 1: Analyze a SOL token
**Prompt typed:** `zerox_scan({mint_or_symbol: "So11111111111111111111111111111111111111112", vs: "SOL"})`

**What the user sees:**
```
{
  "price": 99.46,
  "liq": 24622394.36,
  "change": {},
  "top_pools": ["SOL"],
  "suggested_entry": 99.46,
  "risks": [],
  "timestamp": "2026-09-01T18:56:54.366Z",
  "source_url": "https://dexscreener.com/solana/Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE"
}
```

**Verification:** Price and liquidity are real (sourced from DexScreener, no hallucination). If APIs are down, the tool fails loud with a clear error message.

---

### Step 2: PIKADON pre-trade review (gateway before PayBox)
**Prompt:** The user clicks "Tip ZEROX" on the front door. Behind the scenes, `POST /api/paybox/tip` runs PIKADON review first.

**Scenario A — PASS (valid payload):**
- Payload has all required fields + no malicious patterns + valid recipient
- PIKADON returns `'PASS'`
- MoonPay checkout URL generates instantly
- User sees: "Tip confirmed — proceeds to payment"

**Scenario B — WARN (cautionary but allowed):**
- Payload passes most checks but has a mild warning (e.g., slightly high slippage)
- PIKADON returns `'WARN'` + reasons
- Console logs: `[PIKADON-WARN] ...`
- User sees: "Proceed anyway?" — can override or cancel

**Scenario C — FAIL (blocked):**
- Payload missing required fields (e.g., no `amount`, no `mint`)
- OR malicious patterns detected (e.g., HTML tags in memo)
- OR recipient address is not a valid Solana address/mint
- PIKADON returns `'FAIL'` + reasons array
- User sees: "Cannot execute — PIKADON review failed. Reasons: ..."
- **Disconnect PayBox:** UI says "cannot execute, can still analyze"

**Verification:** Payload schema rejects missing `amount`, missing `mint`, unbounded `slippage_bps`.

---

### Step 3: Get analysis / images made with Turtle
**After PIKADON PASS, the user can:**

**A. Get live market analysis:**
- The analysis uses `GET /api/zerox/scan` data + MCP sentiment (`/api/mcp-sentiment/status`)
- User sees: "SOL at $99.46, 24h liquidity $24.6M, top sentiment: neutral"

**B. Get an image made with Turtle:**
- The Turtle agent handles frontend/design tasks. While there isn't a standalone "text-to-image" API wire, Turtle can:
  - Generate CSS/visual designs
  - Create SVG/Canvas code
  - Layout agent cards and UI components
  - The existing `forge-gallery.html` already displays 3D GLB models that Turtle's backend helps forge (`POST /api/forge/upload`)

**C. Get a lesson:**
- `GET /api/lesson-plan?topic=paybox-ledger` returns a structured lesson:
  - Title: "PayBox Internal Ledger"
  - Body: "Shaddai uses a non-custodial x402 credit ledger..."
  - Action: "explain the difference between custodial and non-custodial in 2 sentences"

---

### Step 4: Approve or cancel
**The user sees a modal with:**
- "Tip confirmed — proceeds to payment" (if PIKADON PASS)
- "Cannot execute — PIKADON review failed. Reasons: ..." (if FAIL)
- "Cannot execute, can still analyze" (if PayBox disconnected)

**User decisions:**
- **Approve:** Proceedes to MoonPay checkout or internal ledger settle
- **Cancel:** Returns to analysis screen, can adjust payload and retry

---

### What's Still VISION (not yet green)
- Full "drop task → agent scans → PayBox → done" end-to-end flow
- 3D office room with agent task-drop
- Custom agent forge UI (backend at `POST /api/forge/upload` already works)
- 3,500-skill catalogue (real count: 1,135 documented across 7 agents)
- 3D world / MMO / plots

---

### Acceptance Tests (must pass)
1. **npm/test or scripted flow:** mock prompt → ZEROX JSON → PIKADON PASS → PayBox payload schema valid
2. **Payload schema rejects** missing amount, missing mint, unbounded slippage
3. **Disconnect PayBox** → UI says cannot execute, can still analyze
4. **Printed skill/doc count** matches filesystem (7 agents + 15 docs + 8 skill modules ≠ 3,500)
5. **No string "3500"** in UI unless that many files exist

### MCP GitHub & Backend Status
- `/api/mcp/status` — 3 servers, 24 tools, 7 agent KBs (2326 chunks/166 docs/5.8MB) ✅
- `/api/mcp-tools` — full tool list ✅
- `/api/mcp-sentiment/status` — compact summary ✅
- `/api/lesson-plan` — grok-style lessons ✅
- `/api/zerox/scan` — live market data from DexScreener + Helius RPC ✅
- `/api/paybox/tip` — PIKADON-gated MoonPay link ✅
- `/api/paybox/agent-tip` — non-custodial settlement ✅
- `/api/market-3d/models` + `/api/market-3d/purchase` + `/api/market/file` ✅
- `/api/market-3d/purchase` — settle via paybox-settle (5% fee, non-custodial) ✅

**No bugs found in MCP routes.** All endpoints return structured JSON. No private keys or seed phrases are ever exposed.

### One-Line Install for Claude Desktop / Claude Code / Cursor / Grok
```bash
# Add SHADDAI MCP server to your agent context
# Then use: "SHADDAI, analyze SOL set-up and prep a small swap with ZEROX"
# Or: "NEXUS, wire the tool registry to call the backend API safely"
# Or: "PIKADON, review this API endpoint for injection and missing auth checks"
```

### What Works TODAY
- ✅ ZEROX live market data (price/liq/change via DexScreener)
- ✅ PIKADON pre-trade review (FAIL/WARN/PASS gate)
- ✅ PayBox tip flow (MoonPay link + non-custodial settle)
- ✅ MCP sentiment + tool summary
- ✅ Lesson retrieval (factual, no 3D world lore)
- ✅ Marketplace purchase & GLB download (4444-gated)
- ✅ Art always loads (pruned artVary pools)
- ✅ Simple Mode 4444 gates (2D/3D realm, bazaar, marketplace)
- ✅ Landing page UI fixes (tilt removed, sign-in removed, tabs centered)

### Owner-Only / Not for Public UI (yet)
- Full "drop task → agent scans → PayBox → done" flow (roadmap VISION)
- 3D office room + agent task-drop (roadmap VISION)
- 3,500-skill display (removed — real count is 1,135)
- Autonomous trading without PayBox policy caps (roadmap)