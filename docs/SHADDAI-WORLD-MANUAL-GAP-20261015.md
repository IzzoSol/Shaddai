# Shaddai World manual vs. the repo — discovery + gap report (2026-10-15)

> **Superseded in detail by `docs/OPUS-MASTER-PLAN-20261015.md`** (verified file reads; corrects rows below: a BYOK vault `backend/lib/api-vault.js`,
> a function-calling runner `backend/lib/agent-tool-run.js`, `backend/lib/agent-forge.js` and a Postgres-capable `backend/economy-service.js` DO exist).

Source: owner's "Shaddai World Claude Code Master Build Prompt" (milestones M0–M15). Method: read-only discovery of this repo
(branch `feat/world3d`). **Confidence tags:** `read` = file opened, `grep` = name/pattern found only, `none` = searched, not found.

## 1. Real stack (manual §6)
| Area | Found |
|---|---|
| Frontend | vanilla JS + `three@0.180.0` ES modules, ~226 `public/*.js`, no bundler, no TypeScript (`read`) |
| Backend | Node 20, Express 4, ws, helmet, express-rate-limit, JWT; file stores (JSON / JSONL) (`read`) |
| Realtime | `mp-server.js` (ws relay) (`grep`) |
| DB | none in `package.json` (no Postgres/Redis); firebase-admin + Stripe + @solana libs present (`read`) |
| Agents | `backend/agent-engine.js` (4k lines), `server/agentBodies.js`, `server/externalAgents.js`, `gateway/pikadon-kernel.js` (`read` headers) |
| Tests | `tools/tests` ~100 scripts + `server/tests`; `npm test` is a stub `echo` (`read`) |
| Perf | `public/world-perf-hud.js` (`?perf=1`, `window.__perf`), `tools/perf-street.cjs`, `_drawcall-audit`, `_boot-timings` (`read`) |

## 2. Milestone status
| Manual | State | Gap |
|---|---|---|
| M0 Project control | **was missing** — `CLAUDE.md` now added (untracked, not committed) | subagent/command files still absent |
| M1 Baseline | partial | no `window.__GAME_PROFILE.snapshot/compare/memoryReport`, no committed `/performance-reports/*.json`, no visual-diff script, no bottleneck classifier |
| M2 Audit/plan | partial | `docs/PERF-LOAD.md`, `HANDOFF-PERF-PUSH-20261003.md` exist; not in manual's ranked-plan format |
| M3 Leaks/lifecycle | unknown | no repeated-scene-transition leak test found (`none`) |
| M6 Gateway | **partial, strong** | PIKADON kernel: deny on secret / amount / payee / skill / budget, one JSONL audit line per call, `needs_approval` queue (`read`). Missing: single tool registry with permission classes (READ_PUBLIC…ADMIN), zod/JSON-schema validation, approval records with args hash + expiry, per-agent kill-switch (`grep` only, verify) |
| M7 Providers/BYOK | early | external agents register provider label + wallet **address** + sha256-stored bearer token (`read`). No provider adapters, no encrypted BYOK vault, no custom-endpoint SSRF guard found (`none`) |
| M8 Agent Forge | exists | Forge ↔ dashboard ↔ game wiring documented in `docs/AGENT-PLATFORM-20261001.md`; sandbox/versioned rollout not found |
| M9 Presence | exists (game) | interest management / compact delta not verified |
| M10 Economy | partial | `server/sparksCore.js` + `server/lib/ledger.js` = **single-entry JSONL**, idempotent collect, per-character mutex; `backend/economy-service.js` for prod. Not double-entry; invariants/replay test not found |
| M11 Learning | exists (content) | Academy built; memory caps/provenance/export-delete not verified |
| M12 Battles | partial | `world-combat-core.js` (35 tests), hover-league rules core with optional deterministic seed; replay/ratings not found |
| M13 World systems | partial | jobs board, quests, plots exist (`server/*Server.js`); moderation/reporting not found |
| M14 Paid tiers | out of scope until legal review | |
| M15 Hardening | not started | |

## 3. Conflict to resolve
Manual §7: *no agent-heavy features before a perf baseline.* Owner tracker (`docs/MASTER-TRACKER.md`) puts FPS/loading **last** (§8)
after hover arena → Colosseum → train → rigging → land → cities → polish. Both can hold if "baseline only" (instrumentation, no
optimization work) is done first; the optimization passes stay last.

## 4. Options for the next phase (pick one; I wait for approval)
- **A. Baseline harness (M1, instrumentation only).** `__GAME_PROFILE` + 3-scene deterministic benchmark (60 s warm-up / 60 s measured / 3 runs,
  median) writing `/performance-reports/<label>.json` + `diff` script + fixed-camera screenshots. No game behaviour change. *Recommended first.*
- **B. Tool registry over the PIKADON kernel (M6 hardening).** One registry (name, schema, permission class, approval, rate limit, cost, audit),
  approval records (args hash, expiry, single use), kill-switch, red-team tests. Wraps existing kernel; no provider calls.
- **C. Ledger design note (M10, design only).** Double-entry spec + invariants + migration plan from the JSONL ledger; no code until reviewed.
- **D. Usage control plane (owner request 2026-10-15: "manage all usage from other places").** One server-side usage service that every
  metered thing reports into (agent/provider calls, tool calls, MCP quota, Sparks sinks, fal/media spend) with per-user / per-agent / per-key
  budgets, caps, a kill-switch and one read API. Then thin clients over it: in-game I-panel, dashboard tab, MCP tool (`quota_status` already
  exists), Telegram command, n8n workflow. Builds on manual §8 (cost meter, spend caps) and §10 (per-key budgets); no new provider calls.
  Existing pieces to reuse: MCP `quota_status`, `aura_savings`, kernel `max_usd/max_steps` budget check, `x402` quotes, `hyperframes usage`.

## 5. Flags needing human review
- Token: **no staking; optional token** (owner 2026-10-15). Issuance, custody, USDC/x402 payouts, 5% burn on jobs, revenue-share "founders
  passes", and any wagering → human legal review before build.
- Dependency hygiene: the manual forbids new prod deps without approval; Playwright/stats/gltf-transform are pre-approved dev tools.

## 6. Opus final-polish brief (what to hand Opus after the build slices)
1. Review `CLAUDE.md` against owner rules in `docs/MASTER-TRACKER.md` (no conflicts).
2. Verify every `grep`-tagged gap above by reading the files, then rewrite this table with `read` confidence.
3. Hub (`~/shaddai-n8n/SHADDAI-FINAL.html`): visual QA of all 16 tabs, legal wording on token/"revenue-share perk"/"founders passes",
   confirm revenue split labels (reserve / treasury ops / founders+community share / sinks / farms+trees / giveaways).
4. Audience pages + videos: copy, claims accuracy (every price/limit traced to `prices.json`), regenerate after any price change.
5. Red-team pass per manual §19 on the gateway (prompt injection, cross-user access, tool-grant bypass, SSRF, key leak).
