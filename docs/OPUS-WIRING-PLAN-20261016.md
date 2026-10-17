# OPUS WIRING PLAN — dashboard + realm + landing + wizard + diagrams (2026-10-16)

Paste into Opus terminal first:
> Read `docs/OPUS-WIRING-PLAN-20261016.md`, then `CLAUDE.md`, then
> `docs/HANDOFF-FPS-FRONTEND-BACKEND-20261016.md` (Parts A-D are still the law),
> then `C:\Users\Brittany\shaddai-n8n\SHADDAI-MASTER-HANDOFF.md` (backend state).
> Work ONE package at a time, branch per package, report per Master Prompt §17.1,
> stop for owner approval before merge/push. Open folder: `C:\Users\Brittany\shaddai-n8n`.

## 0. Sources (read, don't duplicate)
- Master Prompt (Pictures/*.md): M0-M15 roadmap §17, report template §17.1. Gateway
  foundation DONE (`server/agents/`, 21 tests). Blocked: xAI/Muse resale ToS,
  PayBox (mock only), Postgres-vs-JSONL, usage surfaces. Token OPTIONAL, no staking.
- `shaddai-n8n/`: `final-shell.html` (33.8KB dashboard shell), `SHADDAI-FINAL.html`
  (405KB landing source), `shaddai-economy-realm.html` (3D realm),
  `shaddai-economy-dossier.html` + `thinking-graphs.html` +
  `revenue-flow-animation.html` (diagrams), 4 workflow JSONs, `prices.json` v1.1.0.
- Rules: NEVER hand-edit `public/index.html` broadly (59.8k lines) — add modules like
  `public/dashboard-agents.js`. `portfolio.mjs` regenerates gallery — custom cards in
  `portfolio/extras.json`; hub copies live in `portfolio/hub/` (re-copy from shaddai-n8n
  on edit). No creds in git (Telegram/Sheets/X_USER_ID are n8n-side TODOs).

## Packages (in order)
### WP-0 Blockers (nothing boots without these)
1. Build `sparksRoutes.js` + `sparksCore.js` (spec:
   `Shaddai-consultancy/docs/wip/colosseum-economy-wip.patch`; caps 72 plots/day,
   max 3 plots, 24h bank). MMO :3001 cannot boot without them.
2. Move game-forge MCP bridge off :3001 (clash with MMO) → :3002.
Gate: MMO boots, health endpoints respond.

### WP-1 FPS baseline (Part A verbatim — measure only, no gameplay change)
`__GAME_PROFILE` in `world-perf-hud.js`, `tools/perf/bench.cjs` + `diff.cjs`,
3 heaviest scenes, classifier (pixelRatio 0.5 / shadows off / post off).
Gate: baseline JSON + bottleneck named. (Master Prompt M1; gates agent-heavy work.)

### WP-2 Dashboard tabs + modules (Part B.1-3, skin from final-shell.html)
New files only: `dash-agent-chat.js` (roster + SSE + approval card + `/resume`),
`dash-aura.js` (AURA Control Center: usage/caps/kill), `dash-approvals.js`
(inbox, 10s poll). After each: `node backend/audit-dashboard.js` clean.
Gate: approval round-trip works against `node server/agents/dev-server.js` (:8788).

### WP-3 Onboarding wizard (Part B.4)
Write `docs/FORGE_UI_PLAN.md` FIRST, get owner approval, then build in
`public/forge-tab.js` + `agent-forge.html` (avatar canvas only in `forge-3d.*`):
template → persona (live tokens) → power (hosted/BYOK/endpoint/external + honesty
notes) → grants (least privilege) → budgets → avatar → Playground → publish
(immutable versions, rollback).
Gate: new user builds + tests an agent without code (Master Prompt M8).

### WP-4 Landing page update (from SHADDAI-FINAL.html — EXTRACT, don't paste)
405KB is too big to drop in. Opus: diff it against the live landing, extract
sections (hero, offices, pricing from `prices.json`, diagrams), wire as components.
Gate: screenshots vs SHADDAI-FINAL, no console errors, owner approves visuals.

### WP-5 Realm + dossier + diagrams (portfolio/hub copies)
Copy `shaddai-economy-realm.html` (needs three.js CDN + WebGL; orbit bug already
fixed 2026-10-15), `shaddai-economy-dossier.html`, `thinking-graphs.html`,
`revenue-flow-animation.html` → `portfolio/hub/`; PNGs (`view-*.png`) → gallery
via `extras.json`; re-run `portfolio.mjs` + `gallery-check.mjs`.
Gate: gallery regenerates clean, hub pages 0 errors headless.

### WP-6 Backend wiring (Part C verbatim) + n8n imports
Mount gateway in `backend/server-production.js` (~line 2112 pattern in Part C),
auth adapter (guests 401 in prod), price table from `prices.json`, Grok+Muse
BYOK-first, vault reuse, JSONL persistence, `GET /usage/by-agent|by-provider`,
`POST /usage/budget`, MCP `usage_summary`/`budget_set`, Telegram read+pause,
`shaddai-usage-alerts` workflow into `~/shaddai-n8n`, signed-webhook externals,
full red-team suite (Part C.11). Import 4 workflow JSONs (Workflows → Import),
set ACADEMY_BASE/MMO_BASE/X_USER_ID creds in n8n UI only.
Gate: Nova vertical slice incl. negative tests; no frame-time regression (M6-M10).

## Standing gates (every package)
Branch `dash/<n>` etc., tags pre/post. Report: summary · files · commands ·
before/after table · tests · red-team · risks (plainly) · [HUMAN] items · next action.
Never: push main without owner OK · delete files · fal/Meshy spend · secrets in
client/logs/git · server-truth violations · token issuance (legal review first).
