# ZEROX TERMINAL → SIMPLE SIGNALS — Master Plan

Status: DRAFT for owner approval · Build: C:\Users\Brittany\Shaddai

---

## 0. Goal in one line

Two surfaces for the same live call feed — a **ZEROX Terminal (full, desktop)** and a
**Simple Signals (mobile, one-thumb)** — both driven by the SHADDAI MCP + live API,
with Paybox + Virtuals commerce baked in. Nothing existing breaks.

---

## 1. What already works (verified live — do NOT rebuild)

| Layer | Endpoint / tool | Status |
|---|---|---|
| Live calls | `/api/signals/calls` | ✅ `ok:true total calls` (pro-signals.html already uses this via `CLOUD`) |
| Filtered feed | `/api/pro-signals/feed` | ✅ 350 calls, strictness/risk filters |
| Top 25 DEX | `/api/pro-signals/top-dex?limit=25` | ✅ logos (`icon`) + socials (`links`) attached (token-enrich.js) |
| Bubble/heatmap | `/api/intel/wallets`, `/api/intel/holders` | ✅ perCoin bubble source + smart-money wallets + watchlist (wallet-intel.js) |
| Tokenomics | each call's `topHolders[]` (bundles, bought/sold) | ✅ captured at call time from RugCheck |
| Telegram posts | `telegram-signals.js` → `@ShaddaiSignals` | ✅ polls DexScreener every 5m on Render |
| MCP ZEROX | `zerox_price`, `zerox_sentiment`, `zerox_market_scan`, paper-trading, commissions | ✅ live |
| RAG brain | `rag_search`, `rag_ask` | ✅ 166 sources |
| Paybox wallets | `/api/paybox/wallets` | ✅ ZEROX Solana + Robinhood + FOMO referral |

**Conclusion:** the "heatmap build" was never lost — it's alive on the backend
(`wallet-intel.js`) and simply not surfaced in a good UI. This plan restores + upgrades it.

---

## 2. The two versions

### A. ZEROX TERMINAL (`signals.html` + `pro-signals.html` — desktop, full)
- Complete terminal styling, dense, keyboard/desktop-first.
- Tabs, upgraded:
  1. **Calls** — live `/api/signals/calls` (already wired).
  2. **Heatmap / Bubblemaps** — render `/api/intel/wallets` `perCoin` + `wallets`
     as a real treemap/force-bubble of smart money (restore the lost build).
  3. **Top 25 DEX** — `/api/pro-signals/top-dex` with token logos, biggest & boldest.
  4. **Tokenomics** — per-coin topHolders: bundles, bought/sold, insider flags, LP lock.
  5. **Markets** — keep the good Markets tab, just more organized.
  6. **Connect / Hire ZEROX** (NEW) — how to connect ZEROX via MCP, its tools,
     Virtuals ACP identity, Paybox wallet, and the ZEROX FOMO referral.
- Paybox wallet card embedded (public receiving addresses + FOMO referral link).

### B. SIMPLE SIGNALS (mobile, one-thumb — the button in Simple Mode + landing)
Huge, bold, swipeable. A user: taps a coin → swipes to read → scrolls → selects new.
- **Heatmap** (big bubbles, tap to focus).
- **Recent calls** (scored, timestamped, huge tap targets).
- **Simple filters** (risk tier / sort).
- **Top 25 DEX with images**.
- **Tokenomics row**: bundles, bought/sold, holders — one glance.
- **Paybox showcase**: the ZEROX wallet + "hire ZEROX" CTA.

---

## 3. Routing changes (the "buttons" work)

| Where | Now | Change to |
|---|---|---|
| Simple Mode wheel `SIGNALS` → `PRO SIGNALS` | `/pro-signals.html` (stale) | **new Simple Signals** (the one-thumb view) |
| Simple Mode wheel `SIGNALS` → `SHADDAI TG` | `/m-signals.html` | keep or fold into Simple Signals |
| Landing page SIGNALS CTA | `/pro-signals.html` | **Simple Signals (mobile) / ZEROX Terminal (desktop)** via auto-detect |
| Main dashboard Markets tab | already good, embedded via `sigIframe` (PIN 4444) | **leave as-is**, only reorganize inside |
| `shd-modules.js` WHEEL | `signals` category links | repoint to the new terminal |

---

## 4. Build order (safe, incremental, nothing breaks)

1. **Create `simple-signals.html`** — the mobile one-thumb view (Simple Signals),
   consuming existing live endpoints only (no backend changes).
2. **Upgrade `signals.html` / `pro-signals.html`** — add Heatmap+Bubblemap,
   Top-25-with-images, Tokenomics tabs (all from existing APIs).
3. **Add Connect/Hire ZEROX tab** — MCP tools list, Virtuals identity,
   Paybox wallet + FOMO referral.
4. **Rewire the buttons** — Simple Mode wheel + landing page point at the new
   views (one-line edits in `shd-modules.js`, `enter.html`, `home.html`).
5. **Optional backend**: add an MCP `web_scrape` tool (you asked for it; it's the
   only missing MCP capability) so ZEROX can pull live external data into the terminal.

---

## 5. MCP additions requested
- `web_scrape` / `search_web` tool (currently missing — only `rag_search`/`rag_ask` exist).
- Confirm the **RIGHT bot** is wired: `@ShaddaiSignalsBot` (trading), token
  `8067611075:...` (already in Render env — no local secret changes needed).

---

## 6. Post-build (your next drop)
- Virtuals token + contract address shown inside the terminal.
- Virtuals ACP: enable hiring ZEROX via the terminal (currently 404 = not registered).
- n8n automation workflows (none defined yet).