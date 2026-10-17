# OPUS MASTER PLAN — wire Shaddai World end to end (2026-10-15)

For: Opus (final polish + wiring). Source of truth for the *what*: owner's manual
`C:\Users\Brittany\OneDrive\Pictures\Shaddai World Claude Code Master Build Prompt.md` (1,342 lines, Parts 1–20; read Parts 19–20 first,
they hold the defect tables). This file is the *order, files and gates* mapped onto THIS repo. Status order of the game itself stays in
`docs/MASTER-TRACKER.md`; repo gap table in `docs/SHADDAI-WORLD-MANUAL-GAP-20261015.md`.

## 0. Non-negotiables (owner)
- **Token policy: no token staking; a token is OPTIONAL** (only if the owner decides). Any issuance/custody/payout → human legal review first.
- Server authoritative · agents untrusted, tool-gated · secrets server-side only · one branch + tags per phase · never merge/push without approval.
- Futuristic only · owner approves visuals · one heavy job at a time (8 GB laptop) · headless browser only · ask before fal spend or deletes.
- Prices/splits are "subject to change"; hub numbers come from `~/shaddai-n8n/prices.json` (single source) — keep it in sync.
- Report every phase in the manual's format (§18.3): summary, files, commands, before/after table, tests, red-team, risks, open questions, next action.

## 1. Verified reality (read from files, not guessed)
| Area | Exists | Notes |
|---|---|---|
| Gateway kernel | `gateway/pikadon-kernel.js` (413 l) | deny on secret / amount / payee / skill / budget; JSONL audit; `needs_approval` queue |
| Agent runner | `backend/lib/agent-tool-run.js` (294 l) | function-calling loop, denylist, step cap; uses `backend/lib/llm-router` (Groq primary, OpenAI/DeepSeek/OpenRouter fallback) |
| Agent forge | `backend/lib/agent-forge.js` (431 l), `backend/agent-forge-routes.js`, `public/forge-tab.js`, `agent-forge.html`, `forge-3d.*`, `backend/forge/*` | `forgeAgent()` writes 4 stores (custom_agents, persona md, wallet, portrait). No versioned AgentSpec / sandbox / disclosure |
| BYOK vault | `backend/lib/api-vault.js` (669 l) | AES-256-GCM, key derived from the **user's password** via scrypt (not envelope/KMS); no SSRF-guarded custom endpoints found |
| At-rest | `backend/lib/at-rest.js` | field encryption, no-op when `DATA_ENCRYPTION_KEY` unset |
| Economy | `backend/economy-service.js` (638 l), `economy-schema.sql`, `economy-routes.js`; `server/sparksCore.js` + `server/lib/ledger.js` (JSONL) | Postgres store with `SELECT … FOR UPDATE` when `DATABASE_URL`; closed-loop, no cash-out. Single-entry ledger + balance, NOT double-entry |
| Usage | MCP `quota_status` (`shaddai-mcp/mcp-unified.js`, free 5/day), `ecoQuota`, kernel `max_usd/max_steps`, `aura_savings` | no unified budget/usage service, no reserve/settle |
| Dashboard | `public/index.html` (~59,800 lines, monolith), `public/dashboard-agents.js` (85 l), `city-dashboard.html`, `admin-dashboard.html` | world HUD: `public/world-agents-ui.js` |
| Perf | `public/world-perf-hud.js` (`?perf=1`, `window.__perf`), `tools/perf-street.cjs`, `_drawcall-audit.cjs`, `_boot-timings.cjs` | no `__GAME_PROFILE`, no committed reports, no visual diff |
| Tests | ~100 `tools/tests` scripts, `server/tests`, `tests/economy`, `backend/economy-service.test.js`; root `npm test` is `echo` | wire a real runner |

## 2. Decisions needed from the owner (manual §18.2 + new)
1. **AURA = what?** compute credit, in-game currency, or tradable token (manual 19.4). Default if unanswered: **compute credit only**, kept out of the Sparks ledger.
2. **"Jev"** — what is it (API / model / internal agent)? Do not build until answered.
3. Provider access held today (xAI, Meta Muse, a Hermes host, Ollama local?) and whether Shaddai may proxy/resell (verify each ToS).
4. Usage surfaces wanted for D: dashboard · in-game panel · MCP · Telegram · n8n (default: all five, read-only first).
5. PayBox: confirm terms reviewed before any code (manual 20.6). Default: BLOCKED, mock only.
6. Persistence: keep file/JSONL for dev and use Postgres (`DATABASE_URL`) for ledger/usage in prod? (economy-service already supports it.)
7. Launch audience/regions; real-money in scope? (default: in-game currency + BYOK only, no fiat).

## 2b. Decisions recorded (owner, 2026-10-15)
- **AURA = the token saver** (cost/quota middleware: budgets, reserve/settle, safe cache, routing). Not a currency, not a token.
- **Jev** = just another external agent type; handled by the generic bridges (signed webhook / WS SDK / MCP). Nothing Jev-specific is built.
- **Grok (xAI) and Meta Muse are the priority providers** (BYOK-first until resale terms are verified).
- **No token staking; token optional.**

## 2c. Build status (branch `agents/1`, tag `pre-wp2`)
Foundation landed in `server/agents/` with 20 passing tests (`npm run test:agents`): schema validator, tool registry (never-callable list,
risky tools need approval), dispatcher, approvals (args-hash, single-use, expiry, owner-only), 4-level kill switches, hash-chained audit with
redaction, AURA usage (caps, reserve/settle/release, idempotency, cache scoping), provider layer (one OpenAI-compatible streaming adapter for
xAI/Muse/Ollama, mock adapter, config with contributor-mode data-use rule), SSRF guard, signed webhook-agent bridge, Express router
(session identity, fail-closed CORS, SSE + abort, approvals, usage, kill). NOT yet mounted in `server/index.js` or backend; no live provider call made.
Docs: `docs/agents/providers/xai.md`, `muse.md`.

## 3. Work packages (one branch each, in this order)
Branch naming: `perf/<n>`, `agents/<n>`, `econ/<n>`, `forge/<n>`, `dash/<n>`. Tag `pre-<wp>` and `post-<wp>`.

### WP0 — Control files (M0) — DONE as drafts
`CLAUDE.md` (root), `.claude/agents/*.md` (7 subagents), `.claude/commands/*.md` (phase prompts). Owner reviews, then commit.

### WP1 — A: Baseline harness (M1, instrumentation only)
- Extend `public/world-perf-hud.js`: `window.__GAME_PROFILE.snapshot(label) / compare(a,b) / memoryReport()`; frame sampler 600–1000 frames
  (p50/p90/p95/p99, 1% low, >16.7/33.3 ms, CPU ms per frame); `renderer.info` names for three@0.180 (state it in the report).
- `tools/perf/bench.cjs`: Playwright, fixed viewport/DPR, seeded RNG, scripted camera through 3 heaviest scenes, 60 s warm + 60 s measure, 3 runs,
  median → `/performance-reports/<label>.json`; `tools/perf/diff.cjs` prints before/after table; 10 fixed-camera screenshots + diff script.
- Classifier: rerun at pixelRatio 0.5 / shadows off / post off; report the biggest mover.
- Gate: baseline JSON saved + bottleneck named. **No game behaviour change.** Note: owner's tracker puts FPS last — this is baseline only.

### WP2 — B: Gateway hardening + tool registry (M6)
Apply the manual's defect table (19.2/20.2) to the real code (`agent-tool-run.js`, kernel, agent routes):
1. Identity from verified session, never request body (userId/agentId/sessionId); CORS fails closed without `ALLOWED_ORIGINS`.
2. **One registry** `server/agents/tool-registry.js`: name, zod/JSON-schema, permission class (READ_PUBLIC…ADMIN), approval policy, rate limit,
   cost class, audit flag, handler. Per-agent grants enforced both when listing tools to the model and when executing.
3. **One dispatcher** (manual 19.3): grants → schema → limits → budget → approval → audited handler; results wrapped as UNTRUSTED, size-capped.
4. **Approvals**: persisted record `{id, agentId, userId, toolName, argsHash, preview, expiresAt, singleUse, status}`; suspend/resume run;
   owner-only decision route; expired → auto-deny; idempotency key on every spend/transfer.
5. Abort wiring (`req.on('close')` → AbortController into provider + tools; release budget holds). Kill switches: tool / agent / provider / global,
   runtime-configurable. Anomaly auto-pause (spend spike, repeated denials).
6. Never agent-callable: `change_permissions`, `issue_receipt`, `modify_world_structure`, `update_spending_policy`. Platform-only: mint/issue,
   transfer, reward, complete_quest, complete_job (agents *propose*, server verifies).
- Tests first (failing → fix): body impersonation, ungranted tool, bad args, tool call actually executes, approval create→resume, hash mismatch,
  expired approval, replayed approval, client disconnect aborts spend, empty CORS refuses start, cross-user session read.
- Gate: Demo agent (MockAdapter) answers, inspects world, opens a shop, requests an approval; all denial paths tested.

### WP3 — D: Usage control plane (AURA middleware) (M6–M7)
One server service `server/usage/` (or `backend/usage-service.js`) that **every metered call reports into**:
- Pipeline (manual 19.4): authorize → route → **reserve** (idempotency = requestId) → provider call → **settle** with reported usage / **release** on
  error or abort → usage ledger. Budgets stack: request · task · agent · user · day/month · global emergency stop. Hard stops, clear reasons.
- Separate **compute credits** from Sparks; never convert implicitly. Versioned **price table** (provider cost + infra), margin floor at reserve.
- Policy as data: plan × task-class table (routes, max tokens, confirm-above, allowed tools); client `provider/model/tier/maxCost` are hints only.
- Routing heuristics (no LLM call): trivial→local Ollama, tool-heavy→stronger hosted, premium only on explicit confirm with cost shown;
  privacy-flagged never leaves local/BYOK; fallback never raises cost or leaves the data boundary without consent.
- **Surfaces over one read API** (`GET /api/usage/summary|by-agent|by-provider`, `POST /api/usage/budget`, `POST /api/usage/kill`):
  1. Dashboard **AURA Control Center** panel (balance, quotas, usage by agent/provider/task, routing rules, fallback chain, kill switch).
  2. In-game I-panel tab (read-only + pause/kill own agents).
  3. MCP tools: extend `quota_status`; add `usage_summary`, `budget_set` (owner-scoped, audited).
  4. Telegram: `/usage`, `/pause <agent>`, `/kill` via existing bot token handler (read + pause only; budget raises need dashboard step-up).
  5. n8n: workflow `shaddai-usage-alerts` (poll summary → alert at 80% / cap hit) added to `~/shaddai-n8n` and the hub Workflows tab.
- Tests: quota exceeded; concurrent requests never overspend; retry never double-charges; abort releases hold; premium needs confirmation;
  cache never leaks across users; agent cannot raise own budget.

### WP4 — C: Ledger spec + invariants (M10 part 1)
- Write `docs/LEDGER-SPEC.md`: accounts (user wallet, agent allowance sub-account, escrow, treasury, fee sink, faucet), double-entry rules,
  idempotency unique key, currencies separated (sparks / compute credits / any future real-money), order state machine, receipts.
- Migration plan from `sparks-ledger.jsonl` + `economy-service` balances (no in-place balance edits; balances derived/cached from entries).
- **Fix split arithmetic**: every transaction type's split (seller, creator, platform, referrer, burn/sink) must sum to 100% — assert in code and
  tests (manual 20.8 flags the 10%+70% example). Use `prices.json` `splits` as inputs; mirror to hub.
- Property tests (fast-check or node:test loops): entries sum to zero; no negative unless allowed; supply = faucets − sinks; replay reproduces
  balances; concurrent spends never double-spend. Gate: green before ANY shop UI or agent commerce tool.

### WP5 — Providers + keys (M7)
- Types + `MockAdapter` + conformance suite (manual 6.3) first; then **one OpenAI-compatible streaming adapter** (config: baseUrl, auth,
  aliases, capabilities) covering Ollama (first, tool-call conformance per model), OpenRouter, Muse (if verified), Grok (if compatible).
- Fix streaming tool-call accumulation by `index`, tool loop, per-format tool schemas, tolerant SSE; model aliases from verified config.
- `[VERIFY]` each provider's docs → `docs/agents/providers/<name>.md` (BLOCKED if unconfirmed). Never hardcode model IDs.
- Vault upgrade: envelope encryption (per-user data key + master `VAULT_MASTER_KEY`), write-only UI (last 4 shown), rotate/revoke/delete,
  per-key budget/expiry/allowed models, redaction in all loggers. Custom endpoints: HTTPS only, resolve+pin IP, block private/metadata ranges,
  no redirects, port allowlist, timeouts, size caps, concurrency cap. Tests: key-leak scan, rotation without downtime, revoked key stops calls, SSRF set.

### WP6 — Forge upgrade (M8) → `docs/FORGE_UI_PLAN.md` first, then build
- Data: versioned **AgentSpec** (manual 8.1) replacing the 4-store write in `agent-forge.js` (keep it as the compatibility writer); immutable
  versions, rollback, import (risky tools OFF), export; immutable guardrail prefix; agents always disclosed as agents.
- UI flow (wizard): template → persona (live token count) → power source (hosted/BYOK/endpoint/external) → tool grants (least privilege,
  permission class + approval default shown) → budgets/allowances/zones/schedule → avatar from approved catalog → **Playground** → publish.
- **Honest sandbox**: deterministic checks (permissions, budgets, schema, loop limits, kill switch) on MockAdapter must pass; behavioural checks
  statistical with pass rate; sandbox never replaces moderation; system prompts are not secrets.
- Owner dashboard: activity feed, cost to date, **approvals inbox** (exact preview), audit viewer, health, Pause/Kill, analytics.
- Listing = spec + assets + license; forks strip keys/wallets/memory; **deployer pays**; disclosure panel; splits sum to 100%; anti-farming.
- Authorization matrix + IDOR tests on every `:id` route (agents, sessions, keys, approvals, streams, listings).
- Wire to existing: `backend/agent-forge-routes.js`, `public/forge-tab.js`, `agent-forge.html`, `forge-3d.html/.js`, `world-agents-ui.js`.

### WP7 — Dashboard upgrade (M8 surface)
`public/index.html` is a ~59.8k-line monolith: **do not hand-edit it broadly.** Add panels as separate modules loaded by it
(pattern of `dashboard-agents.js`), each with its own state, SSE for chat, no keys in client, optimistic UI only for safe reads.
Panels (manual 19.8): Agent Roster · Agent Chat (stream, tool status, inline approvals, model selector + cost estimate) · Academy ·
Commerce Center · Live Work · Play · **AURA Control Center** · Provider Status. Every write shows pending/approved/denied and links to its
audit entry; mobile-responsive; basic accessibility. Run `backend/audit-dashboard.js` (dead handlers, duplicate IDs) before and after.

### WP8 — Presence + 3D bodies (M9) — gated by WP1 numbers
Server-built compact observation; intents only; interest management grid; delta/quantized state; shared rig + clip set; pooled sprites for
nameplates/bubbles; per-preset cap on fully rendered agents; synthetic-swarm benchmark (100/1k/10k idle) within frame + bandwidth budget.

### WP9 — Learning, battles, world systems (M11–M13)
Reuse what exists (Academy content, `world-combat-core.js`, hover-league seeded rules, jobs/quests/plots). Add: memory caps + provenance + export/
delete; sandbox-scored playbooks (no learned content changes grants/budgets); battle sim as pure package + replay verifier + ratings; moderation
console. Each module ships schema, tools, permissions, audit events, tests, benchmark check.

### WP10 — PayBox (M10b, optional, BLOCKED until owner confirms)
Interface + MockPayBox first; read-only tools; request-approval flow only (agents never execute money movement or edit policy); webhook with raw-body
signature + timestamp window + replay store; autonomous limits default 0; step-up above threshold. Trading: legal review, off by default.

### WP11 — Hardening + launch (M15)
Full red-team (prompt injection via chat/item/catalog/MCP, approval bypass, cross-user data, budget abuse, SSRF, key leak, poisoned playbook),
load + chaos, secret/bundle scan in CI, runbooks, privacy/age-gating checklist, owner sign-off.

## 4. Cross-repo wiring (do not forget)
- Hub `~/shaddai-n8n`: `prices.json`, money map (`svg/revenue2.svg`), simulator, content pages and videos regenerate from it
  (`powershell -File assemble-final.ps1`, `python content/build.py`, `python video/build.py`). Add usage/AURA numbers there once WP3 fixes them.
- MCP (`shaddai-mcp/mcp-unified.js`): new usage tools must be owner-scoped and audited; keep tool count claims ("23 tools") accurate in hub copy.
- Portfolio diagrams: update `portfolio/mcp`, `portfolio/shaddai`, `portfolio/aura` JSON and re-run `finalize` (5 gates) when gateway/usage land.

## 5. Opus polish checklist (final pass)
1. Re-verify every "exists" row in §1 by reading the files; fix this table. 2. Run all suites + `backend/audit-dashboard.js`; record numbers.
3. Red-team matrix from WP2/WP3/WP5/WP6 passes. 4. Perf: no regression vs WP1 baseline with agents visible. 5. No secrets in bundle/history.
6. Hub, pages, videos regenerated and numerically consistent with `prices.json`. 7. Docs updated; owner decisions in §2 recorded.
8. Hand the owner one report in the §0 format and stop for approval before any merge/push.
