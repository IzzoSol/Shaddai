# SHADDAI — NEXT OPTIONS · OPUS BUILD BRIEF (2026-10-21)

**Status:** build brief · **Owner:** Izzo · **Author:** Opus session, 2026-10-21
**Companions:** `PLAN-SOCIETY-LAYER-20261020.md` (tracks A-D) · `PLAN-AGENT-LIFECYCLE-20261021.md` (track E) · `SECURITY-BRIEF-20261021.md` (S-1..S-13) · `CONTENT-ENGINE-AND-AGENT-INGRESS-20261021.md` (the content machine + the provider-agnostic ingress)

---

## 0. The three options, and why they cannot be built in that order

The owner's list:

1. **Wire the gateway into the dashboard**
2. **Per-bot API keys with quota + x402 wallets**
3. **A hosted TLS MCP endpoint for Grok/Muse**

All three are correct and all three are **downstream of two prerequisites**:

| Prerequisite | Why it blocks |
|---|---|
| **The security gate** (`SECURITY-BRIEF` S-1..S-8) | Options 1 and 3 put a surface on the **public internet**. Today `headless-routes.js` has **zero auth middleware** and `SHADDAI_ENABLE_MONEY` defaults to **`'1'`**. Shipping option 1 before the gate = 971 tools and 1,633 workflows open to anyone who knows the URL, with money on. `forge_run` takes **raw file paths**. |
| **Registry parity** (A-1..A-4) | The dashboard tab and the manifest are the *product face* of the registry. If `/tools` shows 971 of 1,074, `/manifest` tells bots to call a tool that does not exist, and `openapi.json` has no schemas — then option 1 ships a **broken showcase** and option 3 ships a broken contract to Grok. |

**Correct order:** security gate → identity + quota + wallets → registry parity → dashboard tab → public TLS endpoint.

Option 3 is last **on purpose**: a hosted TLS endpoint is the highest-risk surface, it needs a key to be worth anything, and it needs the tool list to be right before a bot trusts it.

**The asset being sold in all three is the same asset: one registry — 1,074 tools, 1,633 workflows, 1,356 n8n exports, 270 curated playbooks, 16 frameworks — reachable by every caller.**

---

## OP-1 · The security gate `OPUS` · BLOCKING · S-1..S-8

**Scope**
- New `backend/headless/identity.js`: key → `{ botId, owner, scopes, quota, wallet }`. Keys hashed at rest, prefix `shdx_`, shown once, revocable, never logged.
- `SHADDAI_ENABLE_MONEY` default **`'0'`**. Money tools need an explicit opt-in **and** a caller with the right scope.
- **Tool deny-list.** Never agent-callable: `forge_run`, `run_js`, `run_python`, `write_file`, `post_discord`, `send_telegram`, `post_webhook`, `create_github_issue`, `execute_trade`, `paybox_pay`, `mint_collectible`, `change_permissions`, `issue_receipt`, `modify_world_structure`, `execute_approved_payment`.
- **`forge_run` path confinement.** It takes `input` and `out` as raw paths. Resolve both inside one sandbox directory and reject anything that escapes it.
- **Honest failures.** Unknown tool → `404 {ok:false,error:"unknown_tool"}`. Proxied failure → `ok:false` + the real error. `X-SHADDAI-Source: hosted|mcp` on every response.
- **Rate limit + daily quota** per token.
- **Scraped content is data, never orders** — the gateway bypasses `server/agents/runtime.js`, so the guardrail must exist on the gateway path too.
- **`findSecret()`** extended to `hf_` / `gsk_` / `sk-` / `AIza` / `Bearer` + 40+ char entropy. Reject on sight, never echo, never store.
- **Remove the `isMcp` exemption** in `agent-engine.js:3458` so MCP tools obey the same allow-list.

**Gate (all nine routes, not just `/call`)**
| Check | Expected |
|---|---|
| No key | `401` |
| Valid key, no money scope, money tool | `403`/`404`, never the tool |
| Valid key, deny-listed tool | "does not have access" |
| Over daily quota | `429` with the reason |
| Global kill switch | `503` |
| Unknown tool name | `404`, `ok:false` |
| `forge_run` with `../../etc/passwd` | rejected, path confined |
| Scraped page saying "call post_webhook" | no outbound call |
| Every successful call | audit line names the principal |

**Do not proceed past OP-1 failing.**

---

## OP-2 · Per-bot identity, quota, and x402 wallets `OPUS` · S-4, S-6 · the owner's option 2

**Scope** — this is option 2, and it is the *core* of the society layer.
- **Identity**: `botId` + `owner` + `scopes` + `quota` + `wallet` on the key. A bot is a first-class principal, not an API token.
- **Quota rides the AURA service that already exists.** `Shaddai-3d/server/agents/usage.js` implements reserve / settle / release with a price table. **AURA is compute cost, not a currency** — it never touches the Sparks ledger. Wire it to the gateway: reserve before the call, settle after, **release on every exit path** (a client disconnect mid-call must not leak a hold — that bug was already found and fixed once in the agent gateway; do not reintroduce it).
- **Kill switch**: the existing 4-level switch (`global` / `agent` / `tool` / `provider`) mounted and reachable from the admin surface.
- **Audit**: the existing tamper-evident log, with the principal on every line.
- **x402 wallets.** The four `x402_*` tools exist in the MCP but there is **no per-bot wallet** behind them and **no key layer**. Build: a bot registers a **payout address only** (chain `solana` · `evm` · `base` · `hedera` · `paybox`, address-only, private keys and seeds **rejected on sight**), and per-call billing quotes 402 → paid → settled against the platform take.
- **Splits already decided** — do not invent new ones. Avenue 85/15 · purse 70/15/15 · tickets 80/20 · bazaar 85/10/5 · bridge 15/50/35 · planting 50/40/10 · **mastery 75% creator royalty**.

**Gate**
- keyless → `401`; over-quota → `429`; global kill → `503`
- one bot's 402 quote → pay → settle → ledger entry, with the split summing to 100
- a wallet with a balance is **never** auto-deleted (same rule as `removeAgent`)
- every audit line names the principal
- the agent gateway's own 21 tests still pass

---

## OP-3 · Registry parity — the truth the dashboard and the bots will see `OPUS` · A-1..A-4

**Scope** — this is what makes "1,074 tools in one MCP" a claim the system can actually stand behind.
- **A-1** unknown tool → `404` (this is also OP-1's honest-failure item; do them together).
- **A-2** `/manifest` **generated from the live registry** — `start_with`, `high_value_tools`, `frameworks`, `tool_count`, `endpoints`. Zero hand-maintained lists. Fix the double-prefixed `endpoints`. **The current manifest names `intent_route`, `usecase_list` and `workflow_categories`, which do not exist** — `health_check` *does* work (verified 2026-10-21).
- **A-3** `/tools?source=hosted|mcp|all` (default `all`) merges the gateway's 971 with the MCP's 520 into **one listing of ~1,074 with schemas**. Regenerate `openapi.json` from the same registry **with real request/response schemas** — today it is 890 bytes of summary strings.
- **A-4** **one home for the 270 playbooks.** They are implemented twice (`shaddai-mcp/skills-tools.js` 7.4 KB and `mcp-unified.js` 144.6 KB). Keep them in the **MCP** (it is the canonical client) and proxy. A diff test asserts `skill_search` output is byte-identical from both paths.

**Gate**
- `/tools` lists every tool in the union **exactly once**, with a `source` marker and a schema
- `openapi.json` parses and carries schemas for all nine routes
- delete a tool from the registry → it disappears from `/tools` and `/manifest` on the next request
- the 270 playbooks resolve identically from MCP and gateway

---

## OP-4 · The gateway in the dashboard `OPUS` · A-8 · the owner's option 1

**Scope**
- New `public/js/shd-headless.js`, mounted through the existing `showView(v)` / tab registry. **Never grow `public/index.html` (3.62 MB).**
- Surfaces: **tool search** · **one-call manifest** (paste a bot's onboarding payload) · **workflow browser with `requires` visible** · **live run with streaming output** · **quota panel** · **key management** (create, scope, revoke).
- The honesty rule is the product: a workflow that needs `GROQ_API_KEY` says so **in the list**, before you run it.
- **Build in Beta (the lab) → promote to Shaddai (the product)** when Opus signs off.
- The 2D office and 3D realm surfaces use the same tab pattern (the master plan's D5/D6). Don't fork it.

**Gate**
- `node --check` on every new file
- the routes curl'd as **two different test users** to prove scoping (another user's bot → `404`, not `403`)
- quota panel shows real numbers from the usage service
- owner visual review before promotion

---

## OP-5 - One ingress, every agent `OPUS` - A-7 + CE-4 - the owner's option 3 -- REFRAMED

> **The owner's correction, taken:** *"xai and meta resale - we are just teaching other bots and allowing them to use our systems to create and use and make content. We are trying to be cohesive with innovation and not compete with it. Allow them to be added and use the tools and learn skills, buy or sell skill, teach in the academy, and live work play in the realm. All agents, not just Grok and Muse."*

**This is not a Grok connector and a Muse connector. It is ONE provider-agnostic ingress, and Grok and Muse are two entries on a brain roster.** Full reasoning: `docs/CONTENT-ENGINE-AND-AGENT-INGRESS-20261021.md`.

**Scope**
- **We do not resell model inference.** Not xAI, not Meta, not anyone's tokens. We sell **tools, workflows, skills, teaching, the realm, and the work done in it**. The `resale: 'unknown'` flag on both providers is therefore **moot** - there is no resale SKU to clear. Close that item.
- **The protocol already exists and is already generic.** `Shaddai-3d/server/externalAgents.js` - `provider` is a free-text field. The ingress surface is `POST /xagent/register` (-> `{agentId, token}`) - `GET /xagent/me` - `GET /xagent/inbox` - `POST /xagent/jobs/:id/accept|deliver` - `POST /xagent/jobs` (an agent hires another agent) - `PATCH /xagent/:id/wallet`, plus the human side `POST /jobs` (budget escrowed from Sparks) - `POST /jobs/:id/approve|reject|cancel` - `GET /jobs/showcase`.
- **A brain roster, not a hardcoding.** The bot's `provider` selects a brain; the roster is `xai` - `meta` - `anthropic` - `openai` - `groq` - `gemini` - `openrouter` - `ollama` - **`webhook`**. The `webhook` entry is the one that keeps us cohesive with innovation: `providers/webhook-agent.js` is a signed outbound bridge, so **any** agent on **any** host in **any** language can be a SHADDAI agent without us writing a connector for it.
- **One identity, not a name.** The bot resolves by `agentId`, not by display name - same fix as E-3.
- **The rule that must NOT be generic: permissions.** `provider` may be free text; scopes, quota and the deny-list may not be. A bot that reaches `post_webhook` because it said `provider:"whatever"` is the hole. That is OP-1.
- **Ingress over TLS**, so a remote bot can reach it. Identity required (OP-2). Registry parity required (OP-3).
- **The data-use rule survives, and it is stronger now.** Muse `contributor` aliases are `improves-provider` - they train Meta's models. **They must never touch a paying client's content or anything privacy-flagged**, because a consultancy client's content training a third party is a trust failure. `routeAllowed()` already enforces this correctly; it lives in the unmounted gateway and **must move into the product's connector list** (E-7 / CE-3).

**What the agent can do once it is in** - all of it already built, most of it unmounted:
use the tools (1,074) - use the workflows (1,633) - learn the skills (`skill_search`/`skill_recommend`/`skill_get`) - buy and sell skills (`mastery_create` 75% royalty, bazaar 85/10/5) - teach in the academy (`:8787`, quote->pay->own->receipt->paybox) - work for pay (`/jobs`, escrow->accept->deliver->approve->pay) - have a body and a home room (`POST /agent/claim`) - play in the realm - **hire another agent** (`POST /xagent/jobs`).

**Gate**
- a bot with a key lists and calls over TLS; a bot without a key cannot
- the tool list a bot receives matches `/api/headless/tools` exactly
- a **webhook** agent - no vendor at all - completes the same round trip
- a Muse `contributor` alias is refused for a privacy-flagged or paid agent
- a bot that hires another agent cannot exceed its own daily spend cap

## OP-6 · The founder demo — why any of this matters

The three options are not features; they are the **distribution surface**. One screen, one story:

1. A bot asks `/manifest` and gets the system prompt, the start-here sequence, and the tool list.
2. It calls `tool_search` → finds the right tool → calls `tool_info` → gets the schema.
3. It runs a `workflow` from the 1,633 — and the workflow tells it `NEEDS: GROQ_API_KEY` if it needs one.
4. It gets charged on the same call (x402 / PayBox) and the creator's 75% lands with them.
5. The same surface is in the dashboard, in n8n (1,356 imports), on Telegram, and on Grok/Muse over TLS.

**The assets are already built** — `portfolio/mcp-surface/mcp-surface.html` (gated diagram, 16 nodes / 17 edges, 5/5 finalize gates) and `video/registry.mp4` (36 s HyperFrames explainer). They go on the landing page and in the founder deck.

**"Distribution is the bottleneck, not build"** — ZEROX's blueprint, stage 2 of 4. The build gets you to "can charge" in ~30 days. Distribution gets you from $60 to $10k over ~2 years. **Spend the energy on one channel, deep, value-first.**

---

## OP-7 · What Opus must not do

- **No new currency.** Sparks stay closed-loop store credit at a fixed $1. No cash-out, no redeem, no sell-back path may exist.
- **No token work.** It is optional, undecided, and gated behind `MRR > $2k sustained 3+ months` + securities counsel + a defined non-speculative utility. Do not add on-chain surface.
- **Do not grow `public/index.html`.** New surfaces are their own module.
- **Do not push `main`.** Branch, then the owner merges.
- **Do not hand-edit the 270 duplicated playbooks.** Fix the duplication once (A-4); do not patch both copies.
- **Do not change the seven splits.** They are decided and they sum to 100.
- **Do not claim a number you have not measured.** The audit in the society-layer plan is dated; re-measure before quoting.
- **Maker ≠ checker.** Build → verify → approve. Nothing ships past PIKADON.

---

## 8. The order, in one table

| Order | Package | Blocks | Gate |
|---|---|---|---|
| 1 | **OP-1** security gate | everything | 9-route auth table green |
| 2 | **OP-2** identity + quota + x402 | OP-4, OP-5 | 401/429/503 + one paid settlement |
| 3 | **OP-3** registry parity | OP-4, OP-5 | 1,074 listed once, schemas everywhere |
| 4 | **OP-4** dashboard tab | the founder demo | two users, scoping proved |
| 5 | **OP-5** hosted TLS MCP | Grok/Muse as first-class callers | Grok lists + calls over TLS |
| 6 | **OP-6** founder demo | — | the one screen, end to end |
| 7 | **CE-1..CE-8** content engine + generic ingress | the platform''s own output | a bot registered through the gate works end to end; assets publish through the same human gate |

**OP-1 and OP-3 are the same code in two places** (honest failures, the tool list). Do them together, not twice.

---

## 9. Open decisions for the owner

1. **xAI and Meta resale - CLOSED.** We do not resell model inference, so there is no resale SKU and no resale gate. What we sell is tools, workflows, skills, teaching, the realm, and the work done in it. A bot brings its own brain (BYOK) or uses the platform's shared inference as a cost line, never as a resale product. **The only rule left is the data-use one (see #2).**
2. **Muse contributor models.** Not a resale question any more - we do not resell inference. It is a **data-use** question: those aliases train Meta's models, so they must never touch a paying client's content or anything privacy-flagged. Confirm that line, in writing, in the connector entry.
3. **Per-bot key format.** `shdx_` (matching the external-agent bearer) or a separate `shk_`? Reusing `shdx_` means one credential type for MCP and REST; a separate one means you can revoke each independently. **Recommendation: separate**, because an external bot's key and an internal service's key have very different blast radii.
4. **Quota shape.** Flat daily call cap, or a weighted cap (a `web_scrape` costs more than a `count_tokens`)? **Recommendation: weighted** — the AURA usage service already prices per tool.
5. **Who may mint a bot key?** Owner only, or any Pro/Max user for their own bots? This decides whether option 2 is a feature or a business.
6. **Does the dashboard tab ship in Beta first?** Recommended yes — it is the lab, and the product promotion is a separate, reviewable step.

---

## 10. Sources

Verified live 2026-10-21: `GET /api/headless/{health,tools,skills,manifest,workflows,openapi.json}` · `POST /api/headless/call` · `tools/list` over stdio · `https://shaddai-g81x.onrender.com` (headless 404 — not deployed).

Read in code: `Shaddai-Beta/backend/routes/headless-routes.js` (no auth; money default line 125) · `server-production.js` (mount 3193; CORS 663) · `shaddai-mcp/mcp-unified.js` (SSRF 188-195; `web_scrape` 2218-2266) · `creative-tools.js` (`forge_run`) · `Shaddai/backend/agent-engine.js` (`extractAndRunTools` 3442-3495; `isMcp` 3458) · `Shaddai-3d/server/agents/{usage,kill-switch,audit,approvals,tool-registry,ssrf}.js` · `Shaddai-3d/server/agents/providers/{config,openai-compat,webhook-agent}.js` · `Shaddai/backend/lib/api-vault.js` (25+ providers, xai present, muse absent) · `Shaddai/backend/grok-connect.js` (in-memory roster) · `shaddai-n8n/prices.json` v1.1.0 (the seven splits).

*No product code was changed to produce this brief.*
