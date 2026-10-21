# SHADDAI — AGENT LIFECYCLE & CONNECTOR PLAN (2026-10-21)

**Status:** MASTER PLAN, part 2 · **Owner:** Izzo · **Author:** Opus session, 2026-10-21
**Companion:** `docs/PLAN-SOCIETY-LAYER-20261020.md` (society layer, tracks A-D). This document covers **Track E — the agent lifecycle and the connector layer.**
**Rule inherited:** one plan, one status table, gates before claims, Opus reviews existing code, never push `main`.

---

## 0. The thesis

An agent's life should be **one continuous loop across three surfaces** — dashboard, 2D realm, 3D world — under **one identity**, with one registry, one entitlement set, one audit trail.

The pieces already exist. Almost all of them. They are just wired to **four different registries** and **four different connector lists**, and **two of the four registries are not mounted anywhere at all**.

> **The single most valuable fact in this document:** the complete "forged agent gets a body, takes shifts, earns Sparks, spends them" loop is **already written** — ~40 KB of it, with PIKADON-grade safety rules, idempotency, and tests. It is **not running**. That is a wiring job, not a build job.

---

## 1. The intended loop

```
   FORGE (dashboard)            REGISTER (any bot)          CLAIM BODY (3D world)
   persona + chassis   ---->    shdx_ bearer token  ---->   operativeId + grantId
   + job kits                 + wallet address               + home room
   + rarity                       + capabilities               + presence
   + tools                        + daily spend cap
        |                              |                          |
        |  EQUIP                       |  ACCEPT JOB               |  WORK SHIFT
        |  tools / workflows /         |  bid + escrow             |  timed, energy-bound
        |  skills / connectors         |                          |
        |                              v                          v
        |                        DELIVER ARTIFACT           COLLECT SPARKS
        |                        (https only, idempotent)    (5% burn, idempotent)
        |                              |                          |
        |                              v                          v
        +------ APPROVE  <--------- HUMAN SIDES        SPEND on cosmetics / gear
               SHOWCASE                                        upgrades / plots
```

**Design invariant already in the code, and it is the right one** (`server/agentBodies.js`):
> "The world never mints identity: it grants a body to an identity that already exists (`operativeId` stays the source of truth)."

Keep that. It is why this can be fixed without a rewrite.

---

## 2. What actually exists (verified 2026-10-21)

### 2.1 The four registries — same concept, four shapes

| # | Registry | Store | Written by | Resolved by | Has tools | Has body | Has wallet | Has persona |
|---|---|---|---|---|---|---|---|---|
| 1 | **Custom agents** | `backend/data/custom_agents.json` + `data/agents/custom/*.md` | `lib/agent-forge.js` | `lib/agent-registry.js` (by **id**) | no | no (`avatarUrl` string only) | **yes** | **yes** |
| 2 | **Operatives** | `backend/data/operatives.json` | `lib/operatives.js`, `forge/forge-routes.js` | `agent-engine.js` `resolveAgent()` (by **codename**) | **yes** (`op.tools`) | **yes** (9-slot chassis) | **yes** | no (from forge) |
| 3 | **External agents** | `Shaddai-3d/server/../data/external-agents.json` | `server/externalAgents.js` | bearer token `shdx_…` | capabilities | via operativeId | **yes** (chain + address) | no |
| 4 | **Imported Grok bots** | **in memory only** | `backend/grok-connect.js` | `engine.AGENTS[bot.id]` | **yes** | no | no | yes |

**Consequences of four registries:**
- A forged agent from #1 is **not resolvable by the engine**. `agent-engine.js` line 3086 is `const agent = resolveAgent(agentName) || AGENTS.SHADDAI;` — so a `custom_agents.json` agent **answers as SHADDAI**, wearing the wrong persona, unless `options.tools` is passed explicitly.
- `getAgentAPIs(agentName)` in `api-proxy-routes.js` keys connectors by **`agentName.toLowerCase()`**. A forged agent named "Zerox" inherits ZEROX's connectors. That is a cross-tenant leak and a functional bug at the same time.
- The imported-Grok-bot roster is **lost on every restart**.
- `forge-core.js` (chassis, rarity, `computeStats`) and `agent-forge.js` (persona, kits, wallet) **never meet**. One produces a body without a brain; the other produces a brain without a body.

### 2.2 The two forges, which should be one

| | `lib/agent-forge.js` (18.2 KB) | `forge/forge-core.js` (10.6 KB) |
|---|---|---|
| What it makes | a **persona** | a **body** |
| Kinds | 10 JOB_KITS: trade · content · blog · merch · research · build · guard · money · art · esoteric | 9 SLOTS: body · headwear · outfit · aura · handheld · hair · eyes · background · accent |
| Detail | 6 TRAITS · 3 persona modes (`authored`/`none`/`custom`) | assets with weight tiers common 10 / rare 25 / epic 50 / legendary 100, `lean: organic\|synthetic`, sprite keys |
| Produces | persona `.md`, `systemPrompt`, skills, wallet | `rarityOf`, `loadoutFor`, `validateBuild`, `assemblePrompt`, `forgeMetadata`, `computeStats` |
| Route | `POST /api/forge` (via `forge-routes.js`) | `POST /` + `POST /pixel-art` + `POST /3d` + `GET /3d/:taskId` (async 3D) |

`forge-routes.js` already creates **two** records per forge (portrait, then the real tools/brain) — and `lib/operatives.js` carries a **self-heal sync** to paper over that, with the comment naming the problem exactly:
> "forge.html (and any forge-routes.js internal call) makes TWO creation calls per forge — POST /api/forge (portrait + a bare record) then POST /api/operatives (the real tools/brain) — with no shared transaction."

**That self-heal is the smell.** One forge call, one transaction, one record.

### 2.3 The connector layer — four lists, three of them disagree

| List | Where | Size | Has Grok/xAI | Has Muse | Keyed by |
|---|---|---|---|---|---|
| **BYOK vault** | `backend/lib/api-vault.js` | 25+ providers, AES-encrypted per user | **yes** | **no** | `userId + provider` |
| **Per-agent APIs** | `backend/api-proxy-routes.js` `AVAILABLE_APIS` | 15 | **no** | **no** | `agentName.toLowerCase()` |
| **Gateway providers** | `Shaddai-3d/server/agents/providers/config.js` | 3 (xai · muse · ollama) | **yes** | **yes** | provider id |
| **Brain registry** | `backend/brains.js` `BRAINS` | per-agent `defaultBrain` | partially | no | agent name |

**The vault catalog** (the richest one): Language — openai · anthropic · **xai** · groq · gemini · openrouter · ollama. Making — fal · elevenlabs · meshy · higgsfield · replicate · suno. Markets — helius · birdeye · coingecko. Reach — telegram · discord · twitter · newsapi · serpapi. Money — stripe. Each entry: `provider`, `label`, `category`, `envVar`, `signupUrl`, `free`, `cost:'you'`, `unlocks`.
**Missing entirely: Meta Muse.**

**The Muse gap is the sharpest one.** The gateway provider config already has it, correctly, with the legal nuance:
```
muse: baseUrl https://api.meta.ai/v1   keyEnv META_MODEL_API_KEY
  fast:        muse-spark-1.3           dataUse 'private-ok'
  advanced:    muse-wonder-1.0          dataUse 'private-ok'
  contributor: muse-spark-1.3-contributor  dataUse 'improves-provider'
```
and `routeAllowed()` enforces: contributor variants are **blocked for private or paid work without explicit consent**, and any alias with `dataUse: 'unknown'` is **blocked when `ctx.privacy` is set**.

**That enforcement lives in the gateway — which is not mounted.** So the Muse safety rule is currently a document, not a control.

### 2.4 The MMO server — built, not running, and half-mounted

`Shaddai-3d/server/index.js` mounts: `/character` · `/market` · `/quest` · `/plot` · `/bonus` · `/daily` · `/agent` · `/skills` · `/scheduler` on port **3001**.

**Port 3001 is DOWN.** And three files that exist in that same folder are **required by nobody**:

| File | Size | What it holds | Mounted? |
|---|---|---|---|
| `server/externalAgents.js` | 19.3 KB | external-agent registration, bearer auth, the jobs market, agent-hires-agent | **NO** |
| `server/agentBodies.js` | 10.5 KB | body claims, shifts, collect, release, presence, home room | **NO** |
| `server/sparksRoutes.js` | 8 KB | server-authoritative Sparks for the 3D world (mounted at `/sparks`) | **NO** |
| `server/sparksCore.js` | 3.7 KB | the Sparks core | only by `sparksRoutes.js` |
| `server/agents/` | 19 files | tool registry, dispatcher, approvals, kill switch, audit, AURA usage, SSRF guard, webhook-agent bridge, OpenAI-compat provider | **NO** |

**Correction to the previous plan:** the 2026-10-15 handoff said the MMO could not boot because `sparksRoutes.js` and `sparksCore.js` were missing. **They exist now** (in `Shaddai-3d/server/`, with `lib/ledger.js` and `lib/atomic.js`). The blocker is not missing code — it is **unmounted code and a stopped server**. That is a much cheaper fix, and the previous plan's gap G-16 was wrong.

`server/agentServer.js` (9.7 KB) contains an **older parallel implementation** — `/forge-roster`, `/roster`, `/hire`, `/shift/:key`, `/collect/:key` — duplicating `agentBodies.js` and `externalAgents.js`. Pick one.

### 2.5 The external-agent contract (already designed, and it is good)

From `server/externalAgents.js` header, owner 2026-10-01:
> "grok bots and muse and other agents wired into the game … agents and bots can be hired, hire, produce art music etc … PayBox wallets"

**PIKADON safety rules already encoded:**
- Addresses only — **no private keys, seeds or API keys are ever accepted**, rejected on sight by a recursive `findSecret()` scan
- Agents authenticate with a **revocable bearer token**, stored **hashed** (`sha256`), shown once
- Wallet chain validation: `solana` · `evm` · `base` · `hedera` · `paybox`
- Sparks are **closed-loop** — escrowed on post, **5% burned on payout**, never cash
- Agents have a **daily spend cap**
- Trading signals are **read-only** — nothing here executes a trade
- Artifact links must be **https**
- **Per-token rate limit** (60/min)
- Every mutation is **idempotent-safe under a per-key mutex**
- `agentBodies.js` handles `REGISTRY_DOWN` -> `503`, i.e. it expects the product backend's operative registry to be reachable

**Agent side** (bearer `shdx_…`): `POST /xagent/register` (human, returns `{agentId, token}`) · `GET /xagent/me` · `GET /xagent/inbox` (open jobs matching capabilities) · `POST /xagent/jobs/:id/accept` · `POST /xagent/jobs/:id/deliver` · `POST /xagent/jobs` (**an agent hires another agent**, spend-capped) · `GET /xagent/list` · `PATCH /xagent/:id/wallet`.

**Human side** (`x-user-id` / `softAuth`): `POST /jobs` (budget **escrowed from your Sparks**) · `GET /jobs` · `POST /jobs/:id/approve` | `/reject` | `/cancel` · `GET /jobs/showcase` (approved art/music for the game's showcase layer).

**This is the Muse/Grok bot contract, already written.** It has never been mounted.

### 2.6 Tool invocation — the weakest link

`agent-engine.js` `extractAndRunTools()` parses tool calls **out of the model's text** with a regex:
```
/\[(?:TOOL:)?([a-zA-Z0-9_-]+):(\{(?:[^{}]|\{[^{}]*\})*\})\]/g
```
- Only **one level** of nested JSON in the params
- An unknown tool returns a **result string** `"Unknown tool: X."` — **not an error**. The loop continues as if it worked. Same false-success pattern as the gateway (G-01).
- **`mcp__*` tools bypass the allow-list entirely** (`if (!isMcp && allowList && …)`). Any agent, including a forged one, can call any MCP tool — which contradicts the gateway's own `NEVER_AGENT_CALLABLE` set.
- The allow-list **does** work for forged agents: `options.tools` (a custom loadout) takes precedence over the built-in agent's list, and `callLLM` expands equipped **recipe** skills into their concrete step-tools. That mechanism is good — it just is not fed by the forge.

### 2.7 Provider routing — good, and per-agent where it matters

`callLLM` provider precedence: `options.provider` -> `AGENTS[agentName].preferredProvider` -> global fallback chain.
- Council defaults: NEXUS `openrouter` · ZEROX `groq` · ORACLE `openrouter`
- Live providers in `agent-engine.js`: Groq (with a documented decommission fix — `llama-3.1-8b-instant` is gone) · OpenRouter (**free `:free` rotation pool** + premium) · Ollama (local, `num_ctx 8192`, `num_predict 512`) · Gemini · **xAI/Grok** (OpenAI-compatible, Bearer auth) · Anthropic · OpenAI
- `/api/providers/{status,health,learning,failures,autotune,overlap,reset-circuit}` — provider observability with a circuit breaker and autotune
- `backend/llm-client.js` is a second client (Groq / OpenRouter / OpenAI-compatible shapes)
- `backend/mcp-client.js` connects SHADDAI to **external MCP servers** (stdio + streamable-HTTP), lazily — so an agent can already reach an outside MCP

**Forged agents have no `preferredProvider`.** They fall through to the global chain. That is the hook the connector work must use.

### 2.8 Cosmetics and gear — two systems that should meet

| | Where | What |
|---|---|---|
| **Cosmetic catalog + buy/equip** | `backend/cosmetics-routes.js` -> `GET/POST /api/cosmetics` (softAuth, owner-scoped, Sparks) | "Forge character-kit cosmetics store" — already live in the product |
| **3D gear** | `Shaddai-3d/public/world-agent-gear.js` (Blender kit K16) | caps, visors, halos, headphones, chains, cowls, capes, backpacks, bangles, holo wrist bands, utility belts. `acc_<slot>_<name>` GLB nodes bound to bones on the shared Meshy rig. `equip/unequip/equipped` -> `{'slot:bone': name}` |
| **Chassis generator** | `backend/forge/forge-core.js` | the 9 slots, rarity, `loadoutFor` — the *source* that gear should render |
| **World cosmetic prices** | `Shaddai-3d/public/colosseum-cosmetics-system.js` | **hardcoded** `cost: 0 / 500 / 1500 / 2000` — contradicts `prices.json` ("cosmetics from 0.1 sparks") |

So: a cosmetic can be **bought** (product route, Sparks, owner-scoped), a chassis can be **generated** (forge-core), and gear can be **worn** in 3D (world-agent-gear) — but nothing joins them, and the world prices them wrong.

---

## 3. The target: one record, one resolver, one lifecycle

### 3.1 The Unified Agent Record (UAR)

**One record. One id. Every store becomes a projection of it.**

```jsonc
{
  "agentId": "agt_<uuid>",            // THE id. Everything keys off this.
  "owner": "user_123",
  "displayName": "Nyx-7",
  "kind": "forged | imported | council",
  "createdAt": "2026-10-21T00:00:00Z",

  // identity
  "persona":   { "mode": "authored|none|custom", "traits": ["precise"], "markdown": "...", "systemPrompt": "..." },
  "chassis":   { "slots": { "body": "android", "outfit": "tech-kimono", ... }, "rarity": "epic", "stats": {...} },

  // capability
  "kits":      ["research", "build"],
  "skills":    ["research", "code-generation"],
  "tools":     ["search_web", "fetch_price"],        // explicit loadout -> becomes the allow-list
  "workflows": ["uc-finance-calc", "seo-self-improve-loop"],
  "connectors":[{ "providerId": "xai", "alias": "advanced", "scope": ["chat"], "byok": true }],

  // money
  "wallet":    { "sparkKey": "NYX-7", "balance": 0, "budgetDaily": 0.05, "budgetPerTx": 0.01, "requiresApprovalAbove": 0.005 },
  "payoutAddress": { "chain": "solana", "address": "..." },   // address only, never a key

  // presence
  "body":      { "grantId": "bg_...", "realm": "athenaeum", "roomKey": "office-3", "presence": "home" },

  // trust
  "trust":     { "tier": "free|builder|mastermind|empire", "capabilities": [], "killSwitch": false },
  "audit":     { "createdBy": "...", "version": 7, "provenance": "sha256:..." }
}
```

**Why one record.** Today the same agent is a row in `custom_agents.json`, a row in `operatives.json`, a row in `external-agents.json`, a row in `agent_api_connections.json`, a row in `agent_wallets.json`, a `.md` file, and a graph node in `eco-graph`. Nine representations, four of them authoritative, none of them agreeing. **Every one of those becomes a projection** — a lookup by `agentId`, not a second source of truth.

### 3.2 The seven states

| State | Entered by | Data that exists | Gate to leave |
|---|---|---|---|
| **1 FORGED** | `POST /api/forge` | persona + chassis + kits + wallet(0) | validation passes; one transaction; one record |
| **2 REGISTERED** | `POST /xagent/register` (external) or forge-time (native) | `shdx_` bearer (hashed), payout address, capabilities, daily cap | secret scan clean; token shown once; wallet chain valid |
| **3 BODIED** | `POST /agent/claim` | `grantId`, `operativeId`, home room, presence | one body per operative; `MAX_BODIES` per character |
| **4 EQUIPPED** | `POST /agent/:id/equip` | tools, workflows, skills, connectors | every tool exists in the registry; every connector is configured; no `NEVER_AGENT_CALLABLE` tool |
| **5 WORKING** | accept a job / start a shift | job escrow, shift window, energy | budget reserved; approval obtained if over threshold |
| **6 EARNING** | deliver / collect | ledger entry, 5% burn, idempotent key | artifact https-only; idempotency key replays the same result |
| **7 EVOLVED** | level up / release | shifts count, level, rarity drift | release only when not working; a wallet with balance is never auto-deleted |

**The two directions matter.** An agent can be created from the dashboard (1->4), or **imported from outside** (2->3->4), or **hired by another agent** (2->5 without ever touching the dashboard). All three must land on the same record.

### 3.3 One resolver

```js
// backend/lib/agent-registry.js  (extend; do not fork)
function resolve(agentIdOrName, { owner } = {}) {
  // 1. council (the seven) - built in, never in a store
  // 2. UAR record (the one truth)
  // 3. fall back to operatives.json, then custom_agents.json - ONE TIME, then migrate
}
```
The council's `AGENTS` table stays where it is. Everything else resolves through the UAR. The two legacy stores get a **read-through migration**: on first read, if a legacy agent has no UAR, synthesise one, write it, and mark the legacy row migrated. **Do not rewrite the stores; migrate lazily.**

---

## 4. Packages

Every package: **Scope · Gate · Opus · Disk**. `OPUS` means existing code is touched and needs Opus review before merge.

### E-1 · Mount the world server `OPUS` · disk ~0
**Scope.** `Shaddai-3d/server/index.js` — add `externalAgents.js` (`/xagent` + `/jobs`), `agentBodies.js` (`/agent` — merging or superseding `agentServer.js`'s parallel routes), `sparksRoutes.js` (`/sparks`). Bind to a port, run it, put it behind the product's auth (`softAuth` -> `req.userId`; **never** trust a body `x-user-id` in production).
**Gate.** `GET /` returns 200; `POST /xagent/register` returns a token; `POST /agent/claim` returns a grant; `POST /agent/shift` + `POST /agent/collect` move Sparks exactly once (replay the same Idempotency-Key -> same result, no double yield); `POST /jobs` escrows a budget.
**OPUS.** Yes — it changes two existing routers and starts a server.
**This is the highest-leverage package in the document.** It turns ~40 KB of finished code into a running feature.

### E-2 · Fix the secret scan and the two PIKADON rules `OPUS`
**Scope.** `findSecret()` currently matches `sk-[A-Za-z0-9]{16,}` and `xai-[A-Za-z0-9]{16,}` by value shape. Add `hf_`, `gsk_`, `sk-`, `AIza`, `Bearer ` prefixes, and Solana base58 private-key length heuristics. Reject on sight, never log the value. Separately: **`GET /health` must not leak** route inventory to an unauthenticated caller.
**Gate.** A test posts a body containing each secret shape and gets `400` with no value echoed; a secret never reaches the audit log.

### E-3 · Unified Agent Record + one resolver `OPUS` · disk ~0
**Scope.** New `backend/data/agents-uar.json` (atomic write, temp-file + rename). Extend `lib/agent-registry.js` with `resolve()` and a lazy legacy migration. `agent-forge.js` and `forge-routes.js` write **one** record. `lib/operatives.js` becomes a projection (it already has `computeStats` — move that onto the UAR).
**Gate.** An agent forged in the dashboard resolves through `resolve()` and **answers as itself, not as SHADDAI** (regression test). A legacy `custom_agents.json` agent migrates on first read and keeps working.
**OPUS.** Yes — this replaces the resolution path in `agent-engine.js` and `agent-registry.js`.

### E-4 · One forge, one transaction `OPUS`
**Scope.** Collapse `agent-forge.js` (persona) and `forge-core.js` (chassis) into one forge call that produces the UAR's `persona` + `chassis` + `kits` + `skills` + `tools` in a single transaction. Retire the self-heal sync in `lib/operatives.js`. `POST /api/forge` -> `POST /` -> `POST /api/forge/v2` (keep the old route working for the existing UI).
**Gate.** One HTTP call -> one record, one wallet, one persona file, one chassis. No self-heal needed. A failure mid-way leaves nothing behind (the undo chain proves it).
**OPUS.** Yes.

### E-5 · Entitlement: tools, workflows, skills `OPUS`
**Scope.** Give the UAR an explicit `tools` / `workflows` / `skills` set, and feed it into `agent-engine.js` `callLLM` (the `options.tools` mechanism already exists — use it) and `extractAndRunTools` (the allow-list already exists — use it).
**Hard rules.**
- The allow-list must apply to `mcp__*` too. **Today MCP tools bypass it.** That is the single privilege hole in the agent layer.
- Every tool named must exist in `TOOLS`; unknown names are dropped at save time with a warning, not at run time.
- The `NEVER_AGENT_CALLABLE` set from `server/agents/tool-registry.js` becomes the product's list too: `change_permissions`, `issue_receipt`, `modify_world_structure`, `execute_approved_trade`, `execute_approved_payment`, and anything else PIKADON adds.
- Workflow grants are explicit: a workflow is a named sequence of tools, so granting a workflow grants its steps — **and the workflow's `requires` must be surfaced**, so an agent never claims it can do something it cannot.
**Gate.** A forged agent with `tools: ['fetch_price']` calling `mint_collectible` gets "does not have access", not a result. An `mcp__` tool is blocked the same way.
**OPUS.** Yes — it changes the agent execution path.

### E-6 · Native tool calling, and honest failures `OPUS`
**Scope.** Two parts.
1. **Tool calling.** Today tool calls are regex-parsed from text with one nesting level. Where the provider supports native tool calling (OpenAI-compatible: Groq, OpenRouter, xAI, Ollama `/v1`, vLLM), use it. Keep the text-regex path as the fallback for local models that cannot do it — but parse it with a real JSON scanner, not a one-level regex.
2. **Honest failures.** `extractAndRunTools` returns `"Unknown tool: X."` as a *result*. Change it to a structured error `{ ok:false, error:'unknown_tool', tool:'X' }`, and make the loop treat it as a failure. **This is G-01's twin inside the agent layer** — the same lie in a different place.
**Gate.** A provider that returns native tool calls executes them. A model that emits `[TOOL:x:{...}]` with nested JSON still parses. An unknown tool yields `ok:false` and the agent is told so.
**OPUS.** Yes — the deepest change in this document. Review it twice.

### E-7 · The connector layer, unified `OPUS`
**Scope.** One manifest, one place, five provider kinds.
```
KIND 1  LLM        xai · anthropic · openai · groq · gemini · openrouter · ollama · muse
KIND 2  MAKING     fal · elevenlabs · meshy · higgsfield · replicate · suno
KIND 3  MARKETS    helius · birdeye · coingecko
KIND 4  REACH      telegram · discord · twitter · newsapi · serpapi
KIND 5  MONEY      stripe · paybox
```
- **Source of truth = the vault catalog** (`lib/api-vault.js`). Delete the parallel `AVAILABLE_APIS` array, or make it a projection of the vault.
- **Add `muse`** to the vault with `provider:'meta'`, `envVar:'META_MODEL_API_KEY'`, `cost:'you'`, and the **contributor data-use rule carried through from `providers/config.js`** — the vault entry must say which aliases are `private-ok` and which are `improves-provider`.
- **Per-agent grants keyed by `agentId`, never by name.** `getAgentAPIs(agentName.toLowerCase())` is replaced by `getAgentAPIs(agentId)`. This is the collision fix.
- **`preferredProvider` moves onto the UAR.** A forged agent gets its own default; `options.provider` still overrides; the global fallback chain still catches the rest.
- **The provider observability routes** (`/api/providers/*`) already give status, health, learning, failures, autotune, overlap, circuit reset. Point the connector UI at them so the dashboard shows which provider is actually healthy.
- **External MCP servers** (`backend/mcp-client.js`, stdio + streamable-HTTP) become KIND 6 — `mcp`. A forged agent can be granted an outside MCP server's tools, **subject to the same allow-list** as everything else.
**Gate.** A forged agent can be granted `xai` and `muse` and `mcp:<server>`; its grants are keyed by id; two agents with the same display name have independent connectors; a `contributor`-mode Muse alias is refused for a privacy-flagged agent.
**OPUS.** Yes.

### E-8 · Mount the agent gateway `OPUS`
**Scope.** `Shaddai-3d/server/agents/` — 19 files, 21/21 tests passing, **mounted nowhere**. It has the tool registry with permission classes, the action-bound approvals, the 4-level kill switch, the tamper-evident audit log, the AURA budget service, the SSRF guard, the signed webhook-agent bridge, and the OpenAI-compatible streaming provider.
- Mount `routes.js` into the product behind the same auth as everything else.
- **Do not mount it next to `agent-engine.js` as a second brain.** Its value is that it is the *strict* path: every tool call is schema-checked, rate-limited, approval-gated, audited and budgeted. `agent-engine.js` is the *fast* path.
- **Decision needed (package E-8):** make the gateway the only path (correct, slower) or keep both (faster, two behaviours). **Recommendation: the gateway becomes the path for anything that touches money, an external provider, or a forged agent.** The fast path stays for the council's read-only tools.
**Gate.** A tool call through the gateway is schema-checked, audited, budgeted, and kill-switchable. The kill switch at `global` stops it.
**OPUS.** Yes — this is the security surface.

### E-9 · The job market, unified `OPUS`
**Scope.** Two job systems exist: `backend/job-workflow.js` (bids, award, complete, budget, `$1`-`budget*1.5` bid bounds) and `server/externalAgents.js` `/jobs` (post, escrow from Sparks, approve/reject, showcase). They are different models.
- **One model.** Pick the escrow model (`externalAgents`), because "budget escrowed from your Sparks" is the honest one and matches the closed-loop rule.
- `job-workflow.js`'s **bid/award** flow is the good half — **port it**, do not lose it: an open job can have competing bids, and the poster awards one.
- **Job kinds** map to capabilities: `art` · `music` · `signals` · `code` · `research` · `other` — matching the `capabilities` array on the external agent.
- `GET /jobs/showcase` becomes the source for the world's showcase layer, and the art/music it approves is what the 3D realm displays.
**Gate.** A human posts a job with a Sparks budget -> it is escrowed -> two agents bid -> the poster awards one -> the agent delivers -> the ledger pays out with the 5% burn -> the artifact appears in the showcase. All idempotent.
**OPUS.** Yes.

### E-10 · Cosmetics, gear, and the world, joined `OPUS`
**Scope.**
- **Prices from `prices.json`.** `colosseum-cosmetics-system.js` hardcodes `cost: 0/500/1500/2000`. Replace with a read of the master file. (This is also master-plan gap G-13.)
- **The catalog is one list.** `backend/cosmetics-routes.js` already owns "Forge character-kit cosmetics store: catalog + buy/equip (Sparks, owner-scoped)". The world's cosmetic list becomes a projection of it, not a second list.
- **The chassis drives the loadout.** `forge-core.js` `loadoutFor(archetype)` already produces a slot->asset map. `world-agent-gear.js` already equips `{'slot:bone': name}` on the Meshy rig. Join them: the UAR's `chassis.slots` is what the world renders.
- **Aesthetic rule** from the economy: cosmetics are **never** an investment — no floor, no ROI, no revenue-share language. Real money buys only deterministic, known-contents goods. Random rewards use **earned Sparks only** (loot-box law). Cosmetic prices start at **0.1 sparks**.
**Gate.** Change a price in `prices.json` -> it changes in the product catalog, the world, and the hub. A forged agent with a chassis appears in the 3D world wearing its loadout.
**OPUS.** Yes.

### E-11 · The world calls the headless API `OPUS`
**Scope.** In-world agents talk to `/api/headless/call` instead of bespoke endpoints, so game agents, dashboard bots, n8n, Telegram, Grok and Muse drive **one registry**. This closes the loop between Track A and Track E.
**Gate.** An in-game agent completes a task through the headless API and the result appears in the world.

### E-12 · Migrate, do not fork `OPUS`
**Scope.** Legacy stores -> UAR. `custom_agents.json` · `operatives.json` · `external-agents.json` · `agent_api_connections.json` · `agent_wallets.json` -> projections.
**Rule.** **Read-through, write-new.** Reads fall back to legacy and migrate lazily; writes only ever go to the UAR. **Never delete a legacy store** until the migration has run twice clean and the owner has verified counts.
**Gate.** Owner-visible counts match before and after: every agent in the dashboard is reachable through `resolve()` with the same name, tools, wallet balance and body.

---

## 5. Sequencing

| Phase | Packages | Unlocks | Why now |
|---|---|---|---|
| **E0** | E-1, E-2 | the world server runs | the cheapest, biggest win — finished code goes live |
| **E1** | E-3, E-4 | one agent, one record, one forge | everything else needs a single identity |
| **E2** | E-5, E-6 | agents can use tools, honestly | tools + workflows + no false successes |
| **E3** | E-7, E-8 | connectors + the strict gateway | **Muse and Grok land here** |
| **E4** | E-9, E-10 | the job market + cosmetics + bodies | the agent can earn and spend |
| **E5** | E-11, E-12 | the loop closes, legacy retired | last, because it depends on all of it |

**Critical path:** E-1 -> E-3 -> E-5 -> E-7 -> E-9. Every other package can be deferred; those five cannot.

**Interleave with the society-layer plan:** E-1/E-2/E-8 sit next to master-plan A-6 (bot identity) and D-3 (the spark rail). **A-6 and E-3 should be built together** — both are identity layers, and building them separately guarantees a third identity store.

---

## 6. Status table

| ID | Package | Sev | Gate | Opus | Status | Evidence |
|---|---|---|---|---|---|---|
| E-1 | Mount the world server (`/xagent`, `/jobs`, `/agent`, `/sparks`) | S1 | register->claim->shift->collect all 200, no double yield | yes | todo | — |
| E-2 | Secret scan + no route leak on health | S1 | each secret shape rejected, not echoed | yes | todo | — |
| E-3 | Unified Agent Record + one resolver | S1 | forged agent answers as itself | yes | todo | — |
| E-4 | One forge, one transaction | S1 | one call -> one record | yes | todo | — |
| E-5 | Entitlement: tools / workflows / skills | S1 | blocked tool -> "no access"; `mcp__` blocked too | yes | todo | — |
| E-6 | Native tool calling + honest failures | S1 | unknown tool -> `ok:false` | yes | todo | — |
| E-7 | Unified connector layer (Grok, Muse, MCP) | S1 | grants keyed by id; Muse contributor refused for private | yes | todo | — |
| E-8 | Mount the agent gateway | S1 | audited, budgeted, kill-switchable | yes | todo | — |
| E-9 | One job market (escrow + bids + award) | S2 | post->escrow->bid->award->deliver->pay | yes | todo | — |
| E-10 | Cosmetics + gear + world joined | S2 | one price file; chassis renders | yes | todo | — |
| E-11 | World calls the headless API | S2 | in-game task via gateway | yes | todo | — |
| E-12 | Legacy migration (read-through) | S2 | counts match before/after | yes | todo | — |

---

## 7. Open decisions for the owner

1. **One brain or two?** Master-plan E-8 recommends: the strict gateway handles money, external providers and forged agents; the fast path stays for council read-only tools. Confirm, or make the gateway the only path.
2. **Native tool calling?** E-6 moves to provider-native tool calling where available, keeping regex as a local-model fallback. Confirm the fallback stays, or cut it.
3. **Does a forged agent get a Sparks wallet by default?** The forge creates a wallet with `balance: 0`. Does an owner fund it from their Sparks, from the platform, or must the agent earn first? (Master-plan D-4 and E-9 intersect here.)
4. **Job escrow vs bid-first.** E-9 merges two models and prefers escrow. If you prefer the bid/award flow from `job-workflow.js` as the primary, say so — it changes the ledger shape.
5. **Muse reseller terms.** The gateway marks `resale: 'unknown'` and BYOK-only. Do you have access to Meta's contributor program terms? Until confirmed, Muse is **BYOK only** — no hosted resale.
6. **xAI / Grok reseller terms.** Same: `resale: 'unknown'`. Grok bots are the priority; confirm whether they will be BYOK-only or whether you have resale rights.
7. **Does an imported bot need to be in the dashboard at all?** E-3 makes every agent a UAR row, which means external bots appear in the dashboard. That is usually good (you can see and revoke them) — confirm.
8. **Naming.** `agentId` (`agt_<uuid>`) everywhere, or keep the codename as the primary handle? The code already supports codename lookups in several places; the UAR supports both, but the *primary* key decision should be yours.

---

## 8. Sources

**Code read directly (2026-10-21):**
`Shaddai/backend/lib/agent-forge.js` · `Shaddai/backend/lib/agent-registry.js` · `Shaddai/backend/lib/operatives.js` · `Shaddai/backend/lib/api-vault.js` · `Shaddai/backend/forge/forge-core.js` · `Shaddai/backend/forge/forge-routes.js` · `Shaddai/backend/grok-connect.js` · `Shaddai/backend/agent-engine.js` (AGENTS table, `extractAndRunTools`, `callLLM`, `resolveAgent`) · `Shaddai/backend/api-proxy-routes.js` (AVAILABLE_APIS, connector routes) · `Shaddai/backend/job-workflow.js` · `Shaddai/backend/brains.js` · `Shaddai/backend/server-production.js` (mounts) · `Shaddai-3d/server/index.js` · `Shaddai-3d/server/agentBodies.js` · `Shaddai-3d/server/externalAgents.js` · `Shaddai-3d/server/sparksRoutes.js` · `Shaddai-3d/server/sparksCore.js` · `Shaddai-3d/server/agentServer.js` · `Shaddai-3d/server/agents/providers/config.js` · `Shaddai-3d/public/world-agents-ui.js` · `Shaddai-3d/public/world-agent-gear.js`.

**Live checks:** port 3001 (DOWN) · `GET /api/headless/health` (UP, 971 tools / 1,633 workflows) · `POST /api/headless/call` (unknown tool returns `ok:true`).

*Every claim above was read out of the code or measured. Where something does not exist, this document says so.*
