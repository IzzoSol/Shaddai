# Market Intelligence Engine — Design (2026-10-02)

## Goal
Make the dashboard Markets tab and Pro terminal useful beyond memecoins: stocks, crypto, memes and prediction markets with ranked, explainable, cross-asset-aware signals. The same signals feed TG calls, MiroFish and ZEROX (MCP). Built incrementally as the owner supplies more repos.

## Principles (owner)
- Sleek, easy, organized tabs. Value first.
- Cheap to set up and maintain: free keyless data, no new servers, no brokers.
- Paper trading only. Commissions/PayBox/real execution are parked (regulatory review needed first; see FOUNDER-PASS-DRAFT.md).
- Recreate repo ideas natively in JS (all source repos are MIT; credit in file headers):
  stock-strategy-dashboard (screener, risk alerts), Vibe-Trading (agent strategies), lesson-book (past-mistake warnings), midas-core (propose/validate pattern, light version only).

## Architecture
`backend/markets/`
- `adapters/` — yahoo (stocks), coingecko, dexscreener, polymarket. Cached, with fallback; each returns a common `Quote` shape.
- `modules/` — one file per strategy: `{ id, source, assetClasses, run(universe) -> Signal[] }`.
  Slice 1 modules: `stock-screener`, `crypto-momentum`, `prediction-edge`.
  Later: `lesson-book` (flags setups resembling past losers), `vibe-agents`.
- `correlation.js` — rolling cross-asset correlation (e.g. BTC vs SPY/QQQ, memes vs SOL); raises/lowers a signal's confidence when related assets confirm/diverge.
- `paper.js` — simple ledger: open/close paper trades, P&L per module, basic size/exposure caps. No broker layer.
- `routes.js` — `/api/markets/signals`, `/quotes`, `/correlations`, `/paper/*`.

Signal: `{ symbol, assetClass, side, confidence, entry, target, stop, rationale, moduleId, ts }`.

## UI
- Markets tab sub-tabs: **Signals** (ranked, filter by asset class, "why" drawer) · **Stocks** · **Crypto** · **Correlations** (heatmap) · **Paper** (take-trade button, P&L by module).
- Pro terminal: watchlist, chart and signal feed read the same endpoints.
- Theme: obsidian #06080b / emerald #00ff9c / gold #e8c45c.

## Consumers (slice 3)
- TG bot: posts signals above a confidence threshold with cooldown.
- MiroFish: new data adapter reading `/api/markets/signals`.
- ZEROX MCP: add read-only `zerox_signals`, `zerox_correlation` beside existing `zerox_market_scan` / `zerox_paper_*`.

## Build order
1. Adapters + module registry + stock-screener + crypto-momentum + `/signals` + Markets tab Signals/Stocks/Crypto.
2. Correlation engine + Correlations tab; paper ledger + Paper tab + Pro terminal wiring.
3. TG, MiroFish, MCP wiring; then new modules as repos are dropped.

## Testing
Unit tests per module on fixed price fixtures; correlation on known series; paper ledger cap/P&L math; API smoke test. No live network calls in tests.

## Out of scope
Real-money execution, commissions on trades, PayBox trading, paid data keys, Python services.
