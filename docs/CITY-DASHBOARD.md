# City Dashboard (prototype)

`public/city-dashboard.html` is a standalone, self-contained page: inline CSS and JS, and Google Fonts as the only external request. It renders the seven login tiles from `docs/city-v3/DOC_DASHBOARD.md`, plus a SPARKS ping strip and the "first session" check (one lit window + one SPARKS ping).

- Open `city-dashboard.html?demo=1` to see every tile with deterministic demo data. Add `&seed=<text>` to get a different, still repeatable, demo city.
- Open `city-dashboard.html` with no parameters to try the live routes first. It falls back **per tile**, and a tile that fell back carries a gold **demo data** badge.
- `&agent=NEXUS` picks which agent the agent card shows.
- `&api=https://host` points at another backend. The session token is never sent to a foreign origin.
- Tests: `node tools/tests/city-dashboard.test.cjs` (no browser, no deps).

Theme: obsidian `#06080b`, emerald `#00ff9c`, gold `#e8c45c` (gold = a SPARKS price). Mobile-first grid: 1 column, then 2 at 640 px, then 3 at 1024 px. The ping strip's slide animation and the skeleton shimmer are switched off under `prefers-reduced-motion`.

## The closed-loop rule

SPARKS is closed-loop (`DOC_SPARKS.md`). The page has no withdraw, cash-out, redeem or transfer-out button, form or wording. Every dynamic string passes through `scrub()`, which replaces withdraw / cash out / redeem / payout / APY / yield with a neutral word, so a stray server string such as the race heat's `payouts` field or a reason like `race_prize` can't leak through. The test suite renders demo data, live fixtures, empty responses and a deliberately hostile fixture, and fails if any of those words appear in the output.

## How each source is resolved

The page loads each tile's sources in parallel. Each source ends up as live data, "coming soon" or demo data:

| The route answers | Route marked `isNew` (written, not mounted, or only proposed) | Existing route (mounted today) |
|---|---|---|
| 2xx and `ok !== false` | live | live |
| 404 or 501 | **coming soon**: a short line, never an error dump | demo data + badge |
| other 4xx / 5xx, network error, 5 s timeout | demo data + badge | demo data + badge |

A tile is **coming soon** only when all of its sources are. A mixed tile, such as a live balance with a new transactions route, shows the live part and a one-line "coming soon" for the rest. `?demo=1` sends every source to the demo data source, which returns bodies shaped exactly like the real routes, so the same mappers and renderers run in both modes.

Auth works the way the main dashboard's fetch wrapper does. If `window.SHD_AUTH.token` exists (on this page or on a parent frame), the page sends `Authorization: Bearer <token>`, and `softAuth` resolves the user. User-scoped routes also get `?userId=` from `SHD_AUTH.user.uid` or `localStorage.shd_userid`. That is the dev fallback the routes accept, and `softAuth` overrides it once a user is authenticated.

## Tiles

| # | Tile | Reads | Status today | Links to (`dashboard_id`) |
|---|---|---|---|---|
| 1 | Agent card: name, role, frame, skill chips, energy, "on shift" | `GET /api/agents` (roster), `GET /api/work/active`, **`GET /api/city/agent`** → `{agent:{name, frame, skills[], energy, energy_max}}` | Roster and on-shift are **live**. Frame, skills and energy are **proposed**, so they show "coming soon". | `forge.install` |
| 2 | Home & plot: lit / rent due / lapsed, rent, stall sold N, check-in; plots with their light, pending SPARKS, boost lock | **`GET /api/home/status`** (written in `backend/home-routes.js`, not mounted); **`GET /api/plots/mine`** → `{plots:[deed rows]}` | **Coming soon** until `/api/home` is mounted. Plots: **proposed**. Today the deed data lives only in MCP `plot_status`, not in HTTP. | `home.<x>` from the status (default `home.a`) |
| 3 | Training queue: class, tier, progress; "Take it to the Forge" when done | **`GET /api/academy/queue`** → `{queue:[{class_id,title,skill,tier,progress,state}]}` | **Proposed**. `/api/academy/*` today is the x402 provider-catalog academy, with no per-user class queue. | `academy.board`; done → `forge.install` |
| 4 | Race invites: next open heat, entry price in gold, pool, pits free | **`GET /api/race/heats?state=open`** (written in `backend/race-routes.js`, not mounted) | **Coming soon** until `/api/race` is mounted | `race.gate` |
| 5 | SPARKS: balance + last 5 transactions, signed (`+3`, `−5`) | `GET /api/economy/balance`, **`GET /api/economy/transactions?limit=5`** → `{transactions:[{id,amount,reason,ref_id,created_at}]}` (rows of `spark_transactions`) | Balance is **live**. Transactions are **proposed**: the ledger table exists, but no read route does. | `sparks` |
| 6 | Hiring offers: offers for your agent + going rates | `GET /api/hire/rates`, **`GET /api/hire/offers`** → `{offers:[{offer_id,from,agent,task,sparks,site}]}` | Rates are **live**. Offers are **proposed**. | `hiring` |
| 7 | Perch & courier jobs: agents on shift + the job board | `GET /api/work/active`, **`GET /api/work/jobs?kinds=perch,courier`** → `{jobs:[{job_id,kind,title,from,to,sparks}]}` | On-shift is **live**. The board is **proposed**. | `perch.main` |

Bold routes don't exist on the server yet. The shapes above are what the page expects, and the demo source is the reference implementation of each one.

Every tile's world link is `SHADDAI-WORLD-3D.html?map=v4&goto=<dashboard_id>`. The test checks that each id exists in `public/assets/world/markers-v4.json`. The world side doesn't read `goto` yet.

### Ping strip and first session

Events come from the transactions list and from `home/status.last_pings`, with events of amount 0 skipped. They're shown newest first, one at a time, using the `sparks:mint` / `sparks:sink` templates from `city-copy-v4.json`. On first load only the newest event is shown, and new ones queue up after that. Live mode refreshes every 30 s while the tab is visible. Demo mode posts a synthetic ping every 9 s. The first-session row ticks "One lit window" when the home is lit, rent is due but still lit, or a plot is built or listed. It ticks "One SPARKS ping" once any event exists.

## Notes for NEXUS / ZEROX

- `/api/hire/rates` labels its numbers `SHAD-Credits`, while `PRICES.md` prices hire contracts in SPARKS. The tile shows whichever unit the route returns. Decide which one is right.
- `/api/work/summary` is **not** used, because reading it advances the user's "last seen" marker.
- Prices shown in demo mode come from `PRICES.md`, which is **PROPOSED**.

## Folding it into the main SHADDAI dashboard later

1. **Lift the core as-is.** Move the `<script id="dash-core">` block into a file such as `public/js/city-dash-core.js`. It exposes `window.DashCore` and doesn't touch the DOM, and the test only needs its path changed.
2. **Mount the new routes** in `server-production.js` next to the economy mount, with `softAuth`: `app.use('/api/home', softAuth, homeRoutes())` and `app.use('/api/race', softAuth, raceRoutes())` (see `backend/HOME-RACE-SERVICES.md`). The home and race tiles go live without a page change.
3. **Add the proposed read routes** in the table above, all read-only: transactions, academy queue, hire offers, work jobs, city agent, plots/mine. Each one flips its section from "coming soon" to live.
4. **Mount the tiles** into a dashboard tab: call `DashCore.loadTile(def, liveSource, demoSource)` and inject `DashCore.renderTile(...)` into a container. The main dashboard's fetch wrapper already adds the bearer token, so pass its `fetch` and leave `token` empty. Scope the CSS by prefixing it with the tab's container class, and keep the theme tokens.
5. **Turn off the demo fallback in production** so real users never see fake numbers. `loadTile` has no "unavailable" state yet: a failed existing route always takes the demo body. Add a third result (for example `from: 'down'`, rendered as "Can't reach the city right now") and use it in production. Keep `?demo=1` for previews and marketing shots.
6. **Hook the pings to the real event bus** once it exists (every mint and sink should ping). Until then, polling the transactions route is enough.
