# Handoff — Market Intelligence work (2026-10-02)

For the next terminal/session. Read this first, then `docs/superpowers/specs/2026-10-02-market-intelligence-engine-design.md` and the plan next to it if you need the detail of what was built.

## 1. Where we landed (the pivot)

Owner started with: "improve the Markets tab and trading terminal beyond memecoins; recreate ideas from dropped repos (stock-strategy-dashboard, lesson-book, Vibe-Trading, midas-core); wire into MiroFish/TG/ZEROX; keep dropping repos."

I built a standalone "Market Intel" engine + hub page. Owner reviewed the hub visually and rejected it: **too basic, janky buttons (fixed $250/$1000/$5000 paper sizes), not a real interface, too much upkeep/data scope.**

**Agreed new direction (owner's words, paraphrased):** do NOT build a new terminal. Instead **improve the existing Pro Signals interface and the existing Markets tab** (the DEX images/cards in Markets already look better; Pro Signals data looks janky). Position Pro Signals for other uses (MiroFish, real charts, better DEX images, less memecoin-biased: all markets + news). Make the dashboard more customizable: **combine tabs, windows/views, user-arranged layouts, and fight clutter** (show more things per tab, only what belongs). Real-time updating is NOT required for now (saves memory); owner will find UI repos to borrow from.

## 2. What was done (all on branch `feat/market-intel`, pushed to `IzzoSol/Shaddai`, NOT merged to main, not deployed)

9 commits, 32 passing tests (`npm run test:markets`, uses `node:test`; jest/supertest are NOT installed in this repo):

| Piece | Files | Notes |
|---|---|---|
| Fetch cache (stale-on-error), indicators, signal shape | `backend/markets/http.js`, `indicators.js`, `signal.js` | |
| Adapters (keyless): Yahoo v8 chart (stocks), CoinGecko (crypto), Polymarket gamma (predictions), 6-symbol daily basket | `backend/markets/adapters/*` | live-verified 2026-10-02 |
| Strategy modules: stock-screener (RSI/SMA20), crypto-momentum, prediction-watch | `backend/markets/modules/*` | add a repo's idea = one file + register in `modules/index.js` |
| Correlation matrix + risk-on/off regime nudge (±0.05 confidence) | `backend/markets/correlation.js` | |
| Engine (60s snapshot cache, partial-failure tolerant) | `backend/markets/engine.js` | |
| Paper ledger (JSON file `data/markets-paper.json`, git-ignored, per-module P&L, null-prototype owner keys) | `backend/markets/paper.js` | resets on Render deploy (ephemeral disk) |
| Routes `/api/intel/{signals,quotes,correlations,modules,paper,paper/open,paper/close}` | `backend/markets/routes.js`, `index.js`, 1-line mount in `backend/server-production.js` (before `/api/cosmetics`) | reads public; paper needs `req.userId` (softAuth) |
| Hub UI + "Intel" station | `public/markets-hub.html`, `public/index.html` (+`intelCard` before `proSignalsCard`, first entry in `STATIONS`, default station fallback `'intel'`) | **owner rejected the look** |

Also: spec + plan docs committed (they live on local `main` too — local `main` is 2 doc-only commits ahead of origin; the branch contains them. Don't push `main` without owner say-so).

Self-review (reviewer subagent stalled, so author self-review only) found/fixed: close-at-entry free-exit bug, `__proto__` owner ids. Deferred minors: ledger keyed by symbol only (ticker collisions across classes), all-adapters-down snapshot cached 60s.

## 2b. Decision needed first thing: what to do with the Intel station

Given the pivot, the Intel station (first in the MK rail, default for new users) is a basic page the owner doesn't want shown. Options: (a) remove the `intel` STATIONS entry + `intelCard` + default change from `public/index.html` before anything merges; (b) keep the branch unmerged and cherry-pick only what's reused. **Recommended: (a), and keep `backend/markets/` only if something below reuses it** (signals/correlation could feed Pro Signals/MiroFish later; otherwise it's optional). Ask the owner — don't merge as-is.

## 3. What was NOT done

- Nothing from slice 3: TG bot posting from engine signals, MiroFish data adapter, ZEROX MCP tools (`zerox_signals`, `zerox_correlation`; existing MCP already has `zerox_market_scan`, `zerox_paper_*`, `zerox_commissions`), DexScreener/meme adapter in the new engine.
- No work yet on the NEW direction (improving Pro Signals / Markets tab / customizable windows). That is the next job.
- Never visually verified the Intel station *inside* the dashboard (only the standalone hub page, owner viewed it). No phone-width check.
- Paper desk with arbitrary sizes in USD/SOL: not built (placeholder sizes only).
- Repos not actually integrated; only inspected (see §4).
- Commissions / PayBox trading / real execution: parked on purpose (regulatory risk; see `Shaddai-3d/docs/FOUNDER-PASS-DRAFT.md`). Owner said broker/PayBox setup is "too much tech" for now.

## 4. The dropped repos — what they really are (all MIT)

| Repo | Reality | Use as |
|---|---|---|
| HKUDS/Vibe-Trading | Python FastAPI + React 19 web UI, LLM agent, 18 brokers; needs its Python backend | idea source (factors, grounding/"every number shows its source", run cards). README warns fake tokens impersonate it. |
| zc6503204-collab/stock-strategy-dashboard | local Python app (127.0.0.1:8765), A-share focused, Chinese docs | idea source: screeners, risk alerts |
| w2ur/midas-core | Python paper-trading framework (agents propose, broker validates), no UI | pattern: propose/validate + order rejection reasons |
| holdout-labs/lesson-book | Python lib: logs trade mistakes, warns on similar setups | idea: "similar to a past loser" flag on calls |

None are drop-in UIs. Owner will find UI repos separately — expect them to drop more links.

## 5. Map of what already exists (for the new direction)

- Markets view = `#pipelineView` in `public/index.html`. A station rail object `MK` (~line 6879+): `STATIONS` array (dex, chart, council, prosig, tufish; plus my `intel`), `focus/lazy/setMode` (immersive vs classic), localStorage keys `shaddai_mk_station`, `shaddai_mk_layout`. Stations "re-house" existing cards by id/inner id.
- Markets data: `/api/markets/*` inline routes in `backend/server-production.js` (~lines 1310–1420: crypto, global, trending, fear-greed, forex, stocks (Yahoo **v7** — fragile), dex-hot, jupiter, boosted-and-top ~399), plus `backend/markets-routes.js` (CoinGecko ohlc/tickers, 60s cache) and `public/js/market.js`.
- Pro Signals: `#proSignalsCard` in index.html embeds `public/signals.html` (2054 lines: "SHADDAI Master Terminal — Signals, Markets, MiroFish Swarm", app tabs, image tabs). That is the "janky data" surface the owner wants fixed. Not yet read in depth.
- TG calls: `backend/telegram-signals.js`, `tg-signals-standalone.js`, `tg-watchdog.js`; `backend/zerox-scan.js` (DexScreener/Helius). MiroFish v8 = single file `C:\Users\Brittany\AppData\Local\Temp\opencode\TuFish\index.html` (adapters for PM/CRYPTO/SOL/MEME/EQTY, 7-agent swarm, lightweight-charts 4.0.1).
- Free embeds worth testing (unverified): TradingView widgets (stocks/majors), DexScreener/GeckoTerminal `?embed=1` chart iframes (any Solana token), `lightweight-charts` (open source, already in MiroFish).

## 6. Suggested next steps (owner to confirm; one at a time, brainstorm first)

1. Resolve §2b (remove/hide Intel station).
2. Read `public/signals.html` + the Markets stations; list what's janky (data formatting, missing images, clutter) with owner. Use the DEX card styling from the Markets tab as the visual reference.
3. Design the **customizable workspace**: draggable/resizable windows or panel presets, combine tabs, per-user saved layout (localStorage first), clutter rules ("what belongs in a tab"). This is the owner's headline ask — treat as architectural (spec before code). Wait for the UI repos the owner is collecting.
4. Make Pro Signals source-agnostic (not meme-biased): stocks, crypto, memes, predictions, news; real charts (lightweight-charts or embeds); better DEX token images.
5. Then, optional: reuse `backend/markets/` signals/correlation inside Pro Signals/MiroFish/TG/MCP (slice 3).
6. Paper desk later: any amount, USD or SOL.

## 7. Owner rules to respect (from memory + this session)

- No push to `main`/beta until the owner says everything is finished; this work is on a feature branch only.
- Low-spec laptop (Intel HD 620, 8 GB): one heavy job at a time, don't boot the full production server needlessly, kill any servers you start. Repo is ~4 GB packed; I used an in-place branch instead of a worktree for that reason.
- Don't open browser tabs for routine verification (owner asked to *see* the hub this once). Prefer headless checks; say plainly when something wasn't visually verified.
- Confirm before ANY delete. A git-ignored scratch dir `.superpowers/sdd/2026-10-02-market-intelligence-engine/` (ledger `progress.md`, review diff) was left in place for that reason.
- Token discipline: work lean, no agent fleets; the one subagent reviewer I tried stalled (memory already says subagents are flaky in this codebase).
- Owner wants sleek, easy, organized tabs; value over tech; no brokers/PayBox plumbing for now; commissions parked.
- `server-production.js` and `public/index.html` carry unrelated uncommitted edits from other sessions — stage hunks surgically (`git apply --cached` of just your hunk) and never `git add` those files whole.

## 8. Handy commands

- Tests: `npm run test:markets` (30+ node:test tests, no network).
- Quick API check without booting the full server: a tiny express script mounting `require('./backend/markets').createDefault()` at `/api/intel` and `express.static('public')` (this is how the hub was viewed; the viewer script was deleted and the server stopped).
- Spec: `docs/superpowers/specs/2026-10-02-market-intelligence-engine-design.md`; plan: `docs/superpowers/plans/2026-10-02-market-intelligence-engine.md`.
- Memory note: `project_market_intel_engine_20261002.md` (update it with the pivot; it still describes the Intel station as the current UI).
