# Pro Signals

A live feed of crypto calls, and a mobile-first UI with four ways to read it.
All of this runs in production today.

## Files

| File | What it is |
|---|---|
| `signals.html` | The whole UI. One fetch, one filtered array, four renderers. |
| `token-enrich.js` | Adds logos + socials from DexScreener. Batched, cached, never fails the caller. |
| `pro-signals-routes.js` | The Express routes. |
| `SAMPLE-feed.json` | **Real** output of `/api/pro-signals/feed`, trimmed. |
| `SAMPLE-topdex.json` | **Real** output of `/api/pro-signals/top-dex`. Note `image` and `socials`. |

Read the SAMPLE files before writing anything — they are the actual shapes, not
a description of them.

## Endpoints

```
GET  /api/pro-signals/feed          ~300 scanner calls; the main dataset
GET  /api/pro-signals/hot           the current hot list
GET  /api/pro-signals/top-dex?limit=25   most-boosted on DexScreener, WITH logos + socials
POST /api/pro-signals/enrich  {mints:[...]}   logos + typed socials flags for a mint list
```

## The data model

A call carries `mint, symbol, name, source, entryFdv, curFdv, curMult,
peakMult, ts, closed, riskTier, score`.

`source` maps to the categories a trader actually says:

| `source` | shown as | means |
|---|---|---|
| `new_pools` | Pre-bond | pump.fun, still on the bonding curve |
| `bonded` | Post-bond | pump.fun, graduated |
| `boosted` | Boosted | paid promotion running |
| `trending`, `trending_pools` | Trending | |
| `seed`, `test` | *excluded* | not real calls |

**`closed: true` calls are excluded everywhere.** A dead call inside a live feed
is worse than an empty feed, because somebody will act on it.

## The four views — each answers a different question

- **List** — what just happened, newest first
- **Bubbles** — what is big now. Area = market cap, colour = performance, so a
  large red circle reads instantly as a lot of money going the wrong way.
  Canvas, because 300 animated DOM nodes jank on a phone.
- **Heatmap** — the whole field at a glance
- **Ranked** — what is winning, in order

## Design decisions worth keeping

- **The performance ramp is not the brand palette.** Semantic colour is a
  separate system from accent colour; a loss must never render "on brand". The
  ramp turns at **1x** because break-even is the meaningful boundary, not the
  midpoint of whatever happens to be loaded.
- **The window is the frame.** Header and filters are fixed; only the results
  pane scrolls. The document itself never moves.
- **Filters persist** in `localStorage` under `shd_sig_v1`.
- **Enrichment is decoration.** If DexScreener is down, signals still render.
  Every failure path returns "no extra data", never an error.

## Known gaps — good places to build

- No price sparkline or chart anywhere.
- No alerting: you cannot say "tell me when something crosses 5x".
- No sorting control — each view has one fixed sort.
- No search box.
- Bubbles do not animate between refreshes; they re-pack from scratch.
- No holder/liquidity filters, though the data carries both.
