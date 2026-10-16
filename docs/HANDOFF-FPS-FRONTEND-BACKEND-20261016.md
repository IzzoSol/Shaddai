# HANDOFF — FPS baseline → front end → backend wiring (2026-10-16)

Audience: the OTHER terminal (Opus/Sonnet working in `Shaddai-3d`). Order requested by the owner: **front end first, then backend wiring**,
with the FPS baseline instrumented first because it is cheap and gates agent-heavy features. Full spec = the manual, copied here as
`docs/SHADDAI-WORLD-MASTER-BUILD-PROMPT.md` (original: `C:\Users\Brittany\OneDrive\Pictures\Shaddai World Claude Code Master Build Prompt.md`).
Order + gates for everything = `docs/OPUS-MASTER-PLAN-20261015.md`. Game order of work = `docs/MASTER-TRACKER.md`.

## PASTE THIS INTO THE OTHER TERMINAL
> Read `docs/HANDOFF-FPS-FRONTEND-BACKEND-20261016.md` first, then `CLAUDE.md`. Do Part A (FPS baseline, instrumentation only), then Part B
> (front end against `node server/agents/dev-server.js`), then Part C (backend wiring). One phase at a time, report in the manual's format after each,
> stop for owner approval before any merge/push. Do not touch the world/game files you are not working on.

## 0. Read before touching anything
1. **BRANCH INCIDENT (disclose to owner):** the shared worktree was switched to branch `agents/1` by the agents session. Your world commits since
   (`d95e3057`…`b7d32bf7`) are now on `agents/1`, and the gateway files rode in with your commit `a7e5ecf1`. Nothing is lost, nothing was rewritten.
   Original world branch: `feat/world3d` (tip `540ae17a` when `agents/1` was created). **Do not force-move branches.** Ask the owner whether to
   (a) keep `agents/1` as the integration branch, or (b) fast-forward `feat/world3d` to it and give agents work its own worktree
   (`git worktree add ../Shaddai-3d-agents agents/1`). Tags: `pre-wp2` (before), `post-wp2-foundation` (= `a7e5ecf1`).
2. **Disk: C: has ~1.4 GB free of 167 GB.** Playwright browsers, video renders and Blender exports can fail. Do not delete anything to make room
   without asking the owner (standing rule: never delete without confirm).
3. Rules: headless browser only · one heavy job at a time (8 GB laptop, Intel HD 620) · futuristic only · ask before fal spend · no secrets in
   client/logs/git · server authoritative · agents untrusted · **token policy: no staking, token optional (legal review before any issuance)** ·
   ticked items need "wired AND tested".
4. Gateway foundation is DONE and tested: `server/agents/` (`npm run test:agents` → 21 pass). Read its files; do not rewrite them. Extend them.

## 1. What exists (verified)
`server/agents/`: `schema.js` `tool-registry.js` `dispatcher.js` `approvals.js` `kill-switch.js` `audit.js` `usage.js` (AURA = token saver:
caps, reserve/settle/release, safe read cache) `runtime.js` (loop, suspend/resume, abort-safe) `routes.js` (Express router) `ssrf.js`
`providers/{openai-compat,mock,webhook-agent,config}.js` `dev-server.js` `tests/*`. Provider notes: `docs/agents/providers/{xai,muse}.md`.
**Not yet:** mounted in any real server · persistence (approvals, suspended runs, usage, audit are in-memory/JSONL-optional) · real auth ·
real roster · real tools · live provider call (no keys used) · any UI.

## 2. PART A — FPS baseline (WP1, instrumentation only; no gameplay change; branch `perf/1`)
Existing: `public/world-perf-hud.js` (`?perf=1`, `window.__perf`, keys 1-5 force quality tier, 0 = auto), `tools/perf-street.cjs`,
`tools/_drawcall-audit.cjs`, `tools/_boot-timings.cjs`, `tools/_draw-profile.cjs`, `docs/PERF-LOAD.md`, `docs/HANDOFF-PERF-PUSH-20261003.md`.
Build (manual Part 3):
1. `window.__GAME_PROFILE = { snapshot(label), compare(a,b), memoryReport() }` in `world-perf-hud.js` (zero cost when `?perf` absent). Frame sampler
   600–1000 frames → p50/p90/p95/p99, 1% low, count >16.7 ms and >33.3 ms, longest frame, CPU ms/frame (performance.now around update+render).
   Use three@**0.180.0** `renderer.info` names (`render.calls`, `render.triangles`, `memory.geometries/textures`, `programs.length`); `info.autoReset=false` already set.
2. `tools/perf/bench.cjs` (Playwright **headless** per owner rule; note headless may use software GL — record `UNMASKED_RENDERER` in the report and
   label results `swgl` vs real GPU; the owner's real-GPU numbers come from `?perf=1` in their browser). Fixed viewport/DPR, seeded RNG, scripted camera
   through the 3 heaviest scenes (find them with `_draw-profile.cjs`), 60 s warm-up + 60 s measure, 3 runs, median → `/performance-reports/<label>.json`.
3. `tools/perf/diff.cjs a.json b.json` prints a before/after table. 10 fixed-camera screenshots (`/performance-reports/screenshots`, gitignored) + a pixel-diff script.
4. Bottleneck classifier: rerun with pixelRatio 0.5 / shadows off / post-processing off; report which moves p95 most.
5. Gate: baseline JSON + classification saved, **stop for owner approval**. Optimization passes are Part D (after B and C), per the owner's order.

## 3. PART B — Front end (against the dev server)
Run `node server/agents/dev-server.js` (port 8788, fake auth header `x-test-user: alice`, scripted model: search → asks to buy → approval).
**Do NOT hand-edit the ~59.8k-line `public/index.html` broadly.** Add modules loaded by it (pattern: `public/dashboard-agents.js`, 85 lines).
Before/after each change run `node backend/audit-dashboard.js` (dead handlers, duplicate IDs).

### API contract (`/api/agents/*`, all authenticated; identity from session, never from body)
| Call | Result |
|---|---|
| `GET /roster` | `{ agents:[{id,name,role,grants,provider}] }` |
| `POST /chat` `{agentId,message,alias?}` | **SSE** (`data: {json}\n\n`): `text_delta{text}` · `tool_result{tool,status,code}` · `usage{inputTokens,outputTokens,provider,alias}` · `approval_required{approvalId,preview,expiresAt}` (stream ends; run is suspended server-side) · `done` · `error{code,retryable?}` |
| `GET /approvals` | `{ pending:[{id,agentId,toolName,preview,expiresAt,status}] }` |
| `POST /approvals/:id/decision` `{decision:'approve'|'deny'}` | `{ok,status}` / 404 (also for other users' ids) |
| `POST /approvals/:id/resume` | SSE continuing the run (409 if not approved; single use) |
| `GET /usage` | `{day,userUsd,globalUsd,heldUsd,limits}` |
| `POST /kill` `{level:'agent'|'tool'|'provider'|'global', id, on?}` | owner may pause own agent only; resume/tool/provider/global = admin |
Error codes to render plainly: `kill_agent|kill_global|kill_tool|kill_provider` `over_request_cap|over_user_day_cap|over_agent_day_cap|over_global_day_cap`
`emergency_stop` `provider_data_use_blocked|consent_required|unverified_data_terms` `no_price_entry` `aborted|deadline|max_steps` `unknown_or_ungranted|bad_args|rate_limited|approval_*`.
Rules: no keys in the client; render agent output as TEXT only (never HTML, never auto-follow links); agents always labelled "agent";
optimistic UI only for safe reads; every write shows pending → approved/denied and links to its audit entry; mobile-responsive; basic a11y.

### Modules to build (new files, loaded by `index.html`)
1. `public/dash-agent-chat.js` — roster list + streaming chat (SSE via `fetch` + reader; abort button = `AbortController`), tool-status chips, **inline approval card**
   (exact preview, Approve/Deny → then call `/resume` and keep streaming), cost-so-far from `usage` events, model selector (alias) with estimate.
2. `public/dash-aura.js` — **AURA Control Center**: balance/caps from `/usage`, usage by agent/provider/task (needs backend `GET /usage/by-agent|by-provider`, add in Part C),
   routing/fallback table (read-only first), emergency stop + per-agent Pause/Kill buttons (`/kill`). Show data-use badge per model
   (**Muse "contributor" = used to improve Meta's products → never default, consent text required**).
3. `public/dash-approvals.js` — approvals inbox (poll `/approvals` every 10 s + badge); expired items grey out.
4. Forge wizard upgrade (WP6) in `public/forge-tab.js` + `agent-forge.html` (+ `forge-3d.*` only for the avatar preview canvas): template → persona (live token count) →
   power source (hosted / BYOK / endpoint / external, with the four honesty notes from manual 20.10) → tool grants (least privilege, class + approval default shown) →
   budgets/allowances/zones → avatar from the approved catalog → **Playground** (deterministic checks must pass; behavioural checks shown as pass-rate) → publish
   (immutable versions, rollback). Write `docs/FORGE_UI_PLAN.md` FIRST (manual 20.11 D) and get owner approval before building the wizard.
5. In-game: a tab in `public/world-agents-ui.js` (I panel): My agents + usage + pause/kill (read-only budgets). Keep per-frame cost ~0 (no polling in the render loop).
Acceptance: all modules work against the dev server incl. the approval round trip; `audit-dashboard.js` clean; screenshots via headless browser (`tools/_qa.cjs` style); no console errors.

## 4. PART C — Backend wiring (branch `agents/2`)
Mount in `backend/server-production.js` next to the other `softAuth` routes (e.g. after `/api/economy` ~line 2112):
```js
const { createGateway, createOpenAICompat, PROVIDERS } = require('../server/agents');
const { makeRouter } = require('../server/agents/routes');
const operatives = require('./lib/operatives');          // get(id), listByOwner(owner)
const gateway = createGateway({ auditFile: path.join(__dirname,'data','agent-audit.jsonl'), priceEntries: require('./data/ai-price-table.json').entries, priceVersion: ... });
// register REAL tools here (read tools first; SPEND tools only with approval:'required')
app.use('/api/agents', makeRouter({
  gateway, production: process.env.NODE_ENV === 'production', allowedOrigins: (process.env.ALLOWED_ORIGINS||'').split(',').filter(Boolean), adminIds: (process.env.ADMIN_IDS||'').split(','),
  auth: (req,res,next) => softAuth(req,res,() => { if (req.userId && req.userId !== 'local' && !String(req.userId).startsWith('guest-')) req.user = { id: req.userId }; next(); }),
  resolveAgent: async (uid,id) => { const o = operatives.get(id); return o && o.owner === uid ? toAgentSpec(o) : null; },
  listAgents: async uid => operatives.listByOwner(uid).map(toRosterRow),
  adapterFor: agent => buildAdapter(agent),               // OpenAI-compat from PROVIDERS + key from vault/env; never from the request
}));
```
Checklist (each with tests; keep the 21 gateway tests green):
1. **Auth adapter** as above; guests/`local` get 401 on every route in production.
2. **`toAgentSpec(operative)`**: grants default to READ tools only; risky tools OFF; `defaultAlias`/`allowedAliases` from provider config; `byok` from vault presence.
3. **Price table** `backend/data/ai-price-table.json` (versioned, effective-dated; edit without deploy). Seed from official Meta page (2026-10-15): `muse/fast`=muse-spark-1.3 in 1.25 out 4.25;
   `muse/advanced`=muse-wonder-1.0 in 4.00 out 20.00; `muse/contributor`=-contributor in 0.10 out 0.20 (`dataUse:'improves-provider'`). **xAI prices unverified → leave empty until read from docs.x.ai**
   (no entry ⇒ platform routes are refused; BYOK still works).
4. **Providers (priority: Grok + Muse)**: build adapters from `PROVIDERS` + server-side keys (`XAI_API_KEY`, `META_MODEL_API_KEY`, optional `*_BASE_URL`, model aliases via env).
   Run `adapter.validateConfig()` + a model-list call at startup/saving a key; **VERIFY** the xAI Chat-Completions-vs-Responses question and Muse base URL with a live key;
   record results in `docs/agents/providers/*.md`. Both stay **BYOK-only** until resale/proxy terms are confirmed. Ollama first for local tests.
5. **Vault**: reuse `backend/lib/api-vault.js` (AES-GCM, password-derived) for now; plan envelope encryption (`VAULT_MASTER_KEY`) per manual 7.2. Keys never reach logs (audit redacts known shapes).
6. **Persistence**: approvals, suspended run state (`suspended` map in `routes.js`), usage holds/spend, audit → JSONL files or Postgres via existing `DATABASE_URL` pattern in `backend/economy-service.js`.
   Restart must not lose a pending approval or double-charge a settled one.
7. **Endpoints to add**: `GET /usage/by-agent`, `GET /usage/by-provider`, `POST /usage/budget` (owner raises own caps only with step-up; agents never), usage export.
8. **MCP** (`shaddai-mcp/mcp-unified.js`): extend `quota_status`; add owner-scoped `usage_summary`, `budget_set` (audited). Keep the hub's "23 tools" claim accurate.
9. **Telegram**: `/usage`, `/pause <agent>`, `/kill` (read + pause only). **n8n**: `shaddai-usage-alerts` workflow into `~/shaddai-n8n` (alert at 80% / cap) + hub Workflows tab (`assemble-final.ps1`).
10. **External agents (Jev or any)**: expose registration for signed-webhook agents (`providers/webhook-agent.js`; per-agent secret, HMAC, replay window, SSRF re-validation each call;
    intents limited to say/move_to/use_tool — never money). Reuse `server/externalAgents.js` identity (`shdx_` bearer).
11. **Red-team suite** (qa-red-team subagent): prompt injection via chat/item/catalog/MCP, approval bypass/replay, cross-user session/agent/key access (IDOR), budget abuse, SSRF set, key-leak scan
    of logs+errors+bundle, kill-switch latency (must stop within seconds), cost-abuse loops, provider outage fallback (no cost increase, no data-boundary change).
12. Gate: Nova vertical slice (manual 19.9 C) incl. negative tests; benchmark shows no frame-time regression with an agent visible.

## 5. PART D — FPS optimization passes (after B and C; measured order from Part A's classifier)
Candidates already on the tracker (§8) and old handoff: park dressing 41 draws → BatchedMesh per material (~10); terrain tile merge (~190 draws); shared building materials;
shadow map size/bias; light count audit; static-batcher thresholds already raised (see `HANDOFF-PERF-PUSH-20261003.md`); disabled systems (hazard/grass shaders, visitors, ambient FX, sky
traffic) must be re-evaluated **with numbers**, not re-enabled blindly. One category per branch, tags, before/after table, visual diff within threshold, 20-scene-transition leak check
(heap after forced GC + `renderer.info.memory` flat). Revert anything that did not help. Dispose only what you own (shared GLTF/materials need ref counts).

## 6. Report format (after every part)
Summary · files changed · commands run · before/after table · tests added + results · red-team cases + results · risks/regressions (plainly) · open questions / [HUMAN] items · next best action.

## 7. Open owner decisions
Branch plan (§0.1) · whether xAI/Muse may be hosted/resold (verify ToS) · usage surfaces beyond dashboard/in-game/MCP/Telegram/n8n · Postgres in prod for usage/approvals · PayBox (blocked until the
owner confirms terms) · token stays optional/undecided (no staking).
