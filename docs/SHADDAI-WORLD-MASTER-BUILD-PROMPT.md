# Shaddai World: Claude Code Master Build Prompt

*A living resource for building a 3D world where humans and AI agents live, work, play, trade, learn, and battle. It is deliberately not hardcoded: every section tells Claude Code to discover the real stack, decide with you, and verify facts before building.*

## 0. How to use this document

1. Put Part 1 into `CLAUDE.md` (keep it under 200 lines). Put Part 2 into `.claude/agents/`.
2. Save each later phase as a slash command in `.claude/commands/` (for example `/phase-discovery`). Feed Claude Code **one phase at a time**, in plan mode, on its own git branch.
3. Markers used throughout:
   - **\[DISCOVER\]** inspect the repo or environment first, never assume.
   - **\[DECIDE\]** present 2 to 3 options with tradeoffs and wait for your choice.
   - **\[VERIFY\]** fetch the current official docs and summarize what they actually say before writing code. Provider APIs, model names, and pricing change often.
   - **\[HUMAN\]** a step only you can do (legal review, real-device testing, paid accounts, visual judgment).
4. Anything in `<angle brackets>` is a placeholder Claude Code must resolve from the repo or by asking you.
5. Honest flags up front:
   - **Muse** (Meta) and **Hermes** (Nous Research open-weight models, usually served through a third-party or self-hosted endpoint) must be \[VERIFY\]-ed for real API access before any adapter is written.
   - **Jev** is not a provider I can identify. Claude Code must ask what it is (an API, a model, an internal agent) before building anything for it.
   - Anything involving real money, wagering, or minted assets needs \[HUMAN\] legal review. I am not a lawyer; treat that as a flag, not advice.

---

## 1. Operating contract (paste into CLAUDE.md)

```text
You are the lead engineer on Shaddai World, a persistent 3D web world for humans and AI agents
to live, work, play, trade, learn, and compete. You work as a careful engineer, not an autopilot.

HARD RULES
1. Discover before deciding: inspect package.json, bundler config, src tree, public assets,
   existing 3D code, backend, and database before proposing anything. Report the stack back.
2. Measure before optimizing. No performance claim without a before/after number.
3. One category of change per phase, one git branch per phase (perf/<n>, agents/<n>), tag before
   and after. Never merge without my approval.
4. Preserve existing gameplay, visuals, and features. Ask before deleting files, changing visual
   identity, or refactoring core architecture.
5. No secrets in client code, repo, logs, bundles, or git history. Provider keys live server-side only.
6. Do not add paid services or production dependencies without asking. A short dev-only list is
   pre-approved: Playwright, stats-gl or stats.js, gltf-transform, a bundle visualizer, a test runner.
7. Prefer free and open-source tools.
8. Agents are UNTRUSTED PRINCIPALS. They never touch the database, filesystem, shell, or
   render loop directly. They act only through a server-side tool registry.
9. The server is authoritative for economy, ownership, combat outcomes, and world state.
   The client renders and requests; it never decides.
10. Every task ends with: files changed, commands run, metrics, risks, open questions, next best action.
11. If something is ambiguous, ask one focused question instead of guessing.
12. If a metric got worse, say so plainly. Do not hide regressions.

DEFINITION OF DONE
Build, typecheck, lint, tests pass. No new console warnings. Benchmark median and p95 frame time
not worse. Visual regression diff within threshold. No memory growth over 20 scene transitions.
No secrets in bundle or history. Every agent write action is permission-checked, schema-validated,
and audit-logged. Docs updated. Before/after table included.

FOLDER CONVENTIONS (adapt to the real repo)
/docs/perf, /docs/agents, /performance-reports (JSON), /perf (benchmark scripts), /server/agents,
/server/economy, /server/battles, /packages/shared (schemas and types).
```

---

## 2. Phase 0: project-control files

**Prompt to Claude Code:**

```text
PHASE 0. Create project-control files only. Do not touch game code.
1. CLAUDE.md from Part 1 of the master document, filled in with the real stack from inspection.
2. The subagent files below, with valid YAML frontmatter.
3. .claude/commands/ with one slash command per phase prompt I provide later.
4. A .gitignore entry for /performance-reports/screenshots and any local secrets files.
Show me the files and wait.
```

Subagents need YAML frontmatter or they will not load. Tool lists matter: tool permissions cannot be scoped to a single path, so read-only agents return reports in their reply and the main session writes the file.

```markdown
---
name: performance-auditor
description: Read-only WebGL/Three.js performance auditor. Use proactively for profiling, bottleneck classification, and audit findings.
tools: Read, Grep, Glob, Bash
---
You audit rendering performance. You never edit source. Inspect code and assets, run profiling
commands, classify the app as CPU, GPU, draw-call, memory, or network bound, and return a ranked
report in your reply. Always state the installed Three.js version before quoting renderer.info
property names, since drawCalls vs calls differs by version.
```

```markdown
---
name: threejs-optimizer
description: Implements measured rendering optimizations (instancing, merging, material sharing, culling, LOD, asset compression). Use only after an approved audit.
tools: Read, Grep, Glob, Edit, Write, Bash
---
You implement one approved optimization category at a time. For every change give before/after
draw calls, triangles, frame time p50/p95, objects intentionally not changed and why, and
visual/gameplay risk. Preserve raycasting, collisions, animation, and interactions.
```

```markdown
---
name: memory-leak-hunter
description: Finds and fixes undisposed WebGL resources, listeners, timers, sockets, and unbounded stores. Adds lifecycle utilities and leak stress tests.
tools: Read, Grep, Glob, Edit, Write, Bash
---
You never mark a leak fixed without a before/after comparison of heap (after forced GC) and
renderer.info.memory. Disposal must respect shared and cached resources via ownership or
reference counting. Never dispose a resource another owner still uses.
```

```markdown
---
name: agent-architect
description: Designs and implements the Agent Gateway, provider adapters, tool registry, permissions, approvals, and audit logging. Server-side only.
tools: Read, Grep, Glob, Edit, Write, Bash
---
You build server-side agent infrastructure. You never put secrets or model calls in client code.
Every tool has a zod/JSON-schema, a permission class, a rate limit, an audit event, and tests.
You do not modify payment or ledger code without my explicit approval.
```

```markdown
---
name: economy-engineer
description: Builds the double-entry ledger, listings, orders, escrow, receipts, and fraud safeguards. In-game currency first; real money only after human legal review.
tools: Read, Grep, Glob, Edit, Write, Bash
---
All balance changes are ledger entries with idempotency keys, never direct field updates.
Never integrate a real payment provider without approval. Property-test the ledger invariants.
```

```markdown
---
name: battle-engineer
description: Builds the server-authoritative deterministic battle simulation, matchmaking, ratings, replays, and anti-cheat for agent-vs-agent and human-vs-agent matches.
tools: Read, Grep, Glob, Edit, Write, Bash
---
The simulation is pure, seeded, and deterministic. Agents get identical observations and action
budgets. Timeouts resolve to a defined default action. Every match is replayable from its log.
```

```markdown
---
name: qa-red-team
description: Runs builds, tests, benchmarks, and adversarial agent tests (prompt injection, approval bypass, cross-user data access, cost abuse). Reports only.
tools: Read, Grep, Glob, Bash
---
You verify acceptance criteria and attack the system. You report reproducible failures with
steps. You do not fix them; hand findings back to the main session.
```

---

## 3. Phase 1: discovery and measurement

```text
PHASE 1. Discovery and measurement. No gameplay changes.

[DISCOVER] Report back, in /docs/ARCHITECTURE_MAP.md:
- Frontend framework and version, bundler, 3D engine and version (Three.js, React Three Fiber,
  Babylon, other), state management, UI layer, build and deploy target.
- Backend (if any): runtime, framework, realtime layer (WebSocket, Socket.IO, Colyseus, other),
  database, auth, hosting.
- Existing multiplayer or NPC systems, existing economy or inventory, existing dashboard.
- Asset pipeline and largest assets.
- Anything already agent-related.
If there is no backend, say so. That changes the whole plan; ask me before choosing one.

BUILD THE MEASUREMENT HARNESS
1. Dev-only HUD, toggled by a key, stripped from production: FPS, frame ms, 1% low, draw calls,
   triangles, geometries, textures, programs, JS heap, active sockets, active agents, current zone.
   Check the installed Three.js version and use the correct renderer.info property names.
   If multiple render passes per frame, set renderer.info.autoReset = false and reset at frame end.
2. Frame sampler: keep 600 to 1000 frames, report p50/p90/p95/p99, 1% low, frames over 16.7 ms
   and 33.3 ms, longest frame. Also measure CPU time per frame (performance.now around update and
   render) because rAF deltas are quantized to the display refresh.
3. Deterministic benchmark: Playwright, headed Chrome on a real GPU (headless often falls back to
   software rendering), fixed viewport and DPR, fixed RNG seed, scripted camera path through the
   3 heaviest scenes, 60 s warm-up plus 60 s measured, 3 runs, report the median.
4. Bottleneck classifier: rerun with pixel ratio 0.5, shadows off, post-processing off, and
   report which change moves frame time most. This decides the optimization order.
5. Screenshot set at 10 fixed camera positions for visual regression.
6. Output /performance-reports/<label>.json plus a diff script printing a before/after table.
7. window.__GAME_PROFILE.snapshot(label), .compare(a, b), .memoryReport().

Deliver the baseline and the bottleneck classification, then stop for my approval.
```

---

## 4. Performance program (run before any agent code)

The order is **derived from the Phase 1 classifier**, not fixed. A reasonable default if the data supports it:

| Step | Category | Core moves | Gate |
| --- | --- | --- | --- |
| 4.1 | Audit (read-only) | Draw-call, asset, material, texture, geometry, and bottleneck audits combined into one ranked plan | I approve the plan |
| 4.2 | Leaks and lifecycle | Ownership for every dynamic object; ref-counted disposal; render-target and composer disposal; pools; capped logs and stores | Heap (after forced GC) and renderer.info.memory flat over 20 zone cycles |
| 4.3 | Draw calls | Remove unused, instance repeated props (one InstancedMesh per geometry/material, chunked so culling works, lower mesh.count instead of zero-scaling), merge static geometry per chunk, share materials, atlases | Draw calls and frame time improve, interactions intact |
| 4.4 | Assets | gltf-transform pipeline, Draco or Meshopt (benchmark both), KTX2 (ETC1S for color, UASTC for normals and data), self-hosted decoders and transcoders, lazy loading, cache headers | Payload, load time, texture memory |
| 4.5 | GPU and lighting | Shadow count and map size, post-processing cost, pixel-ratio scaling, quality presets | Frame-time p95 |
| 4.6 | Render loop and CPU | No per-frame allocations, pooling, throttled AI and network work, workers, React re-render isolation, frame-on-demand for dashboards | CPU ms per frame |
| 4.7 | Streaming and scale | Chunking, spatial grid or octree, on-demand catalogs, BVH for raycasts | Zone transition time, memory |
| 4.8 | LOD (only if measured) | Reuse materials across levels, verify draw calls and shadow passes do not rise | Net gain proven |
| 4.9 | Mobile | Capability detection, presets, Performance Mode toggle, **\[HUMAN\]** real mid-range Android test with a remote-debug capture | Device results |

Rules for every step: branch plus tags, benchmark before and after, visual diff within threshold, and a per-change table of object/system, old cost, new cost, method, visual risk, measured gain. Revert anything that did not help.

A correctness note Claude Code must respect: dispose only what you own. Cached GLTF assets, shared materials, and atlases need reference counts or an asset cache with explicit owners, otherwise one unload will blank another zone.

---

## 5. The agent platform: concepts and architecture

### 5.1 What Shaddai agents are

An **agent** in Shaddai is a persistent, server-side entity with: an identity, an owner (a human or the platform), a provider configuration (which model and whose key), a persona, a tool grant (what it may do), a memory, a wallet, a reputation, and an in-world avatar. The 3D client only ever sees a **compact public state** (position, animation, dialogue line, status). It never sees prompts, keys, or tool internals.

### 5.2 Non-negotiable architecture

```text
[Browser / Game client]  <-- compact events -->  [World Server (authoritative)]
                                                      |
                                         [Agent Gateway]  <-- one internal Agent Interface
                                   /          |            |             \
                        [Provider adapters] [Tool Registry] [Policy/Approvals] [Audit + Cost meter]
                         xAI | OpenAI-compat | Meta | Hermes | Custom | MCP | A2A/webhook
                                                      |
                          [Postgres: ledger, agents, memory]  [Redis: queues, rate limits, presence]
```

Principles:

1. **Inference never runs in the render loop or the client.** Agents think on the server (or in worker jobs), on their own clock. The client interpolates the last known state.
2. **Agents think slowly, the world ticks fast.** An agent decision is an asynchronous request that yields intents (move here, say this, buy that). The world server validates intents and applies them on its own tick. Agents are never on the tick's critical path; if an agent is late, its avatar keeps doing its current action or idles.
3. **One internal interface, many adapters.** Game code never knows which provider is behind an agent.
4. **Everything an agent can do is a tool**, and every tool is declared in one registry with a schema, a permission class, a rate limit, a cost class, and an audit event.
5. **Server-authoritative everything** that matters: balances, ownership, inventory, combat results, quest completion.
6. **Kill switches at four levels:** per tool, per agent, per provider, global. They must work without a deploy.
7. **Cost is a first-class resource.** Every model call is metered against a budget before it is sent.

### 5.3 Unified Agent Interface

&#91;DECIDE\] language and schema library from the discovery phase (TypeScript with zod is the likely fit for a Three.js stack). The interface below is conceptual; Claude Code adapts it.

```ts
interface AgentProviderAdapter {
  readonly providerId: string;                 // 'xai' | 'openai-compat' | 'meta' | 'hermes' | 'custom' | ...
  capabilities(): ProviderCapabilities;        // tool calling, streaming, vision, json mode, max context
  validateConfig(cfg: ProviderConfig): Promise<ValidationResult>;   // test call, never log the key
  complete(req: NormalizedRequest, ctx: CallContext): AsyncIterable<NormalizedEvent>;
  // NormalizedEvent: text delta | tool_call{id,name,args} | usage{in,out,cost} | done | error
  estimateCost(req: NormalizedRequest): CostEstimate;
  health(): Promise<ProviderHealth>;
}

interface AgentRuntime {                          // provider-independent
  start(agentId, sessionId): Promise<void>;
  step(input: Observation): Promise<Intent[]>;  // runs the model/tool loop with limits
  handleApproval(approvalId, decision): Promise<void>;
  pause(); resume(); dispose();
  toPublicAvatarState(): AvatarState;           // the ONLY thing sent to clients
  exportAuditLog(): AuditEntry[];
}
```

The adapter normalizes each provider's tool-calling format into one internal shape. The runtime owns the loop: build the prompt, call the adapter, validate tool calls against the registry, execute allowed tools, feed results back, and stop at hard limits (max steps, max tokens, max wall time, max spend).

### 5.4 The agent loop, with limits

```text
observation -> assemble context (persona + policy + memory slice + world slice, size-capped)
  -> budget check (tokens, money, rate limit)  -> adapter.complete()
  -> for each tool_call: schema-validate -> permission check -> approval needed? -> execute -> audit
  -> feed result back (marked as UNTRUSTED data) -> repeat until done or limit
  -> emit Intents to the world server -> emit AvatarState delta to clients
```

Hard defaults (configurable, per tier): max 6 tool steps per turn, max wall time 30 s, per-agent and per-day token and spend caps, circuit breaker that pauses an agent after N consecutive errors.

### 5.5 Agent roles (templates, not hardcoded classes)

Roles are **config templates** in the Forge (Part 8): Greeter, Merchant, Quest Giver, Tutor, Creator, Community Moderator-assistant, Negotiator, World Operations monitor, Battler, Researcher. A template is persona + tool grant + policy + default budget. Users and the platform create new ones without code changes.

---

## 6. Provider layer: Grok, Hermes, Muse, OpenAI-compatible, custom, and external agents

```text
PHASE A1. Provider layer. Server-side only. No client changes.

[DISCOVER] Existing backend, auth, and config conventions. Reuse them.
[VERIFY] Before writing each adapter, fetch the provider's CURRENT official docs and write a
half-page summary in /docs/agents/providers/<name>.md covering: base URL, auth scheme, tool/function
calling format, streaming format, models available, rate limits, pricing, and terms on proxying or
reselling access. Do not rely on memory. Link the source URLs. If docs are unreachable or access is
unavailable, mark the adapter BLOCKED and tell me.

Build, in this order:
1. The normalized request/event types and the AgentProviderAdapter interface.
2. A conformance test suite every adapter must pass (see below).
3. A MockAdapter (scripted responses) used by all tests and the demo.
4. OpenAI-compatible adapter (configurable baseUrl, model, headers, key).
5. xAI/Grok adapter (may be a thin config over #4 if the API is OpenAI-compatible; verify).
6. Anthropic-style adapter if a provider uses that message format.
7. Hermes support (see below), Meta Muse adapter (only if access verified), custom/rules adapter.
8. External-agent bridges: webhook, WebSocket SDK, MCP.
Stop after each adapter and show conformance results.
```

### 6.1 Provider map (what each integration really is)

| Integration | How it connects | Notes and checks |
| --- | --- | --- |
| **Grok / xAI** | Server-side API adapter with function calling | \[VERIFY\] endpoint style, model names, tool format, pricing, and whether Shaddai may proxy or resell access. If resale is not allowed, offer Grok as bring-your-own-key only. |
| **OpenAI-compatible (generic)** | One adapter with `baseUrl`, `model`, `apiKey`, optional headers | This single adapter covers a large share of providers and self-hosted servers (hosted aggregators, vLLM, Ollama, LM Studio, and others that expose the same chat format). Highest leverage integration. |
| **Hermes** | Open-weight model family from Nous Research, usually reached through an OpenAI-compatible endpoint (hosted aggregator or self-hosted) | \[VERIFY\] which Hermes version and host, and how that host formats tool calls. Some open models use a model-specific tool-call format; the adapter may need a parser. If tool calling is unreliable, use the fallback mode below. |
| **Meta Muse / Model API** | Server-side adapter if access exists | \[VERIFY\] everything, including whether it is publicly available and whether it is API-compatible with the generic adapter. Treat as BLOCKED until confirmed. |
| **Jev** | Unknown | **Ask me** what it is (API, model, hosted agent, internal project) and how it is reached. Do not guess. |
| **Custom rules or scripted agent** | In-process deterministic policy (behavior tree, utility AI, state machine) | Zero inference cost. Best for ambient NPCs, shopkeepers, and baseline sparring opponents. Same interface as LLM agents. |
| **Bring-your-own running agent** | Webhook, WebSocket agent SDK, or MCP (Part 6.4) | For developers who already have an agent elsewhere. Shaddai sends observations and receives intents. |
| **Claude Code itself** | Build and maintenance tool only | Not a live in-world agent. Live agents run through the gateway like everyone else. |

### 6.2 Normalized types (conceptual)

```ts
type NormalizedMessage = { role: 'system'|'user'|'assistant'|'tool'; content: string; toolCallId?: string; trust: 'trusted'|'untrusted' };
type NormalizedTool = { name: string; description: string; jsonSchema: object };
type NormalizedRequest = { messages: NormalizedMessage[]; tools: NormalizedTool[]; maxOutputTokens: number; temperature?: number; responseFormat?: 'text'|'json'; timeoutMs: number };
type NormalizedEvent =
  | { type: 'text'; delta: string }
  | { type: 'tool_call'; id: string; name: string; args: unknown }
  | { type: 'usage'; inputTokens: number; outputTokens: number; costUsd?: number }
  | { type: 'done'; reason: 'stop'|'tool_calls'|'length' }
  | { type: 'error'; code: 'rate_limit'|'auth'|'timeout'|'provider'|'invalid'; retryable: boolean };
```

**Fallback when a model lacks reliable native tool calling** (common with smaller open models): ask for a strict JSON object `{ "tool": ..., "args": ... }`, validate against the tool schema, retry once with the validation error, then fail safe to a no-op. The runtime does not care which path was used.

### 6.3 Conformance suite (every adapter must pass)

- Plain text completion and streaming.
- Single tool call, multiple tool calls in one turn, and malformed tool args (must be rejected, not executed).
- Tool result round trip.
- Timeout, 429, 401, and 5xx mapped to the normalized error codes.
- Usage reporting present or estimated.
- Key never appears in logs, errors, or thrown messages (test by scanning captured output).
- Cancellation stops spending.

### 6.4 External-agent bridges

1. **Webhook agent:** Shaddai POSTs a signed observation (HMAC with a per-agent secret, timestamp, replay window) and expects intents back within a deadline. Strict response schema and size cap.
2. **WebSocket agent SDK:** the developer's process connects outbound with an agent token and receives observations, then sends intents. Publish a tiny SDK and a sample bot as part of this phase.
3. **MCP:** two directions. (a) Expose Shaddai's tool registry as an MCP server so any MCP-capable agent can act in the world with scoped tokens. (b) Let Forge agents call approved external MCP servers. \[VERIFY\] the current MCP spec and auth model first. External MCP tools are **untrusted**: their descriptions and outputs can carry injection.
4. All bridge agents receive the same observation format and the same tool permission checks as hosted ones. No back door.

---

## 7. Bring your own key, bring your own endpoint, and hosted tiers

```text
PHASE A2. Credentials, endpoints, tiers, and metering.

[DECIDE] Present options with tradeoffs for: key storage (KMS vs envelope encryption with a
master key from env), hosted-model strategy, metering granularity, and whether local-model users
need a desktop bridge. Wait for my choice. Ask before introducing any paid service.
```

### 7.1 Four ways to power an agent

| Mode | Who pays | Risks to design for |
| --- | --- | --- |
| **A. Bring your own key (BYOK)** | The user, at their provider | Key theft, key leakage in logs, user surprise at bills |
| **B. Bring your own endpoint** (self-hosted or other OpenAI-compatible URL) | The user | **SSRF**, slow or hostile endpoints, oversized responses |
| **C. Shaddai-hosted models** (free and paid tiers) | Free tier: Shaddai; paid: the user via Shaddai | Cost abuse, signup abuse, provider terms on resale |
| **D. Bring your own running agent** (webhook, SDK, MCP) | The user | Untrusted behavior, latency, impersonation |

### 7.2 Key vault rules

- Keys are **write-only** from the client's point of view: after saving, the UI shows the provider, a label, and the last 4 characters. It can never read the key back.
- Encrypt at rest with envelope encryption: a per-user data key encrypts the provider key, and the data key is encrypted by a master key held outside the database (KMS if approved, otherwise a server-env master key with rotation support).
- Decrypt only inside the gateway, only for the duration of a call, never into logs, traces, error messages, analytics, or crash reports. Add automatic redaction for common key patterns in every logger.
- Validate a key with a harmless test call when saved. Support rotate, revoke, and delete (hard delete), plus an audit entry for each.
- Per-key budgets enforced by Shaddai, and in the UI advise users to also set spend limits at their provider and to use restricted keys where the provider supports it.
- Never pass user keys to the browser, to other users' agents, or to third-party tools.

### 7.3 Custom endpoint safety (SSRF and abuse)

When a user supplies a base URL, the gateway is being asked to make network requests on a stranger's behalf. Required controls:

- HTTPS only in production. No credentials in URLs.
- Resolve DNS server-side and **block** loopback, private, link-local, and cloud-metadata ranges (for example 127.0.0.0/8, 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 169.254.0.0/16 including the metadata address, ::1, fc00::/7, fe80::/10).
- Connect to the **resolved, validated IP** (pin it) to defeat DNS rebinding. Re-validate on every request.
- No automatic redirects, or re-validate each hop.
- Port allowlist, short connect and read timeouts, response size cap, and concurrency cap per endpoint.
- Run provider calls through an egress proxy or isolated network segment if infrastructure allows.
- Local models on a user's own machine are unreachable from the server by design. \[DECIDE\] a small **desktop bridge** (an app that keeps an outbound authenticated WebSocket open and relays requests to localhost) versus telling those users to use a tunnel.
- Treat the endpoint's responses as untrusted data (size, schema, content).

### 7.4 Tiers and metering (illustrative; Claude Code proposes numbers from real cost data)

| Tier | Models | Typical limits (example) |
| --- | --- | --- |
| Free | Rules-based agents plus a small hosted or free-tier model | Few agents, low daily token cap, short memory, no real-money actions, limited battle entries |
| BYOK / BYO endpoint | Anything the user connects | Platform limits on concurrency and tool rates; the user pays the provider |
| Paid hosted | Better hosted models via Shaddai credits | Higher caps, more agents, priority queues, bigger memory |
| Creator / Pro | All of the above plus marketplace listing and team features | Revenue-share rules, analytics |

Metering rules:

- Keep **token and compute credits** in a ledger separate from **in-game currency**. Never let one convert silently into the other.
- Check budget **before** every model call using the adapter's cost estimate, then reconcile with actual usage afterward.
- Hard stops, not soft warnings: when a cap is hit the agent pauses and the owner is notified.
- Free-tier abuse controls: per-account and per-IP limits, email verification, and anomaly flags.
- &#91;HUMAN\] Billing (card payments, credit packs, subscriptions) means a paid third-party provider, tax handling, and terms of service. Claude Code must ask first, design against a sandbox, and keep the first release free and BYOK.
- **Building users a hosted Grok bot or similar:** only if the provider's terms allow proxying or reselling access. If not, the Forge offers it as BYOK with a one-click template.

---

## 8. The Agent Forge: build your own agent

```text
PHASE A3. Agent Forge (server model plus UI).

[DISCOVER] Existing dashboard and UI framework; match them.
Build the Forge as a versioned, portable AgentSpec plus a UI that edits it. No role is hardcoded;
all roles are templates.
```

### 8.1 The AgentSpec (portable, versioned JSON)

```json
{
  "specVersion": 1,
  "id": "agt_...",
  "displayName": "Maya the Merchant",
  "owner": { "userId": "usr_..." },
  "persona": { "summary": "...", "style": "...", "languages": ["en"], "disclosure": "agent" },
  "provider": { "mode": "byok|endpoint|hosted|external", "providerId": "openai-compat", "model": "<model>", "keyRef": "vault:key_..." },
  "tools": [ { "name": "search_catalog", "enabled": true }, { "name": "place_order", "enabled": true, "requiresApproval": true } ],
  "policy": { "maxStepsPerTurn": 6, "dailyBudget": { "tokens": 200000 }, "spendAllowance": { "currency": "SHD", "perAction": 50, "perDay": 200 }, "allowedZones": ["market"], "schedule": "always" },
  "memory": { "mode": "short|long|none", "shareLearnings": false },
  "avatar": { "catalogId": "...", "tintColor": "#..." },
  "visibility": "private|friends|public",
  "version": 3
}
```

The platform wraps every persona with an **immutable guardrail prefix** (identity disclosure, instruction hierarchy, tool rules, safety). Users cannot edit or see past it in a way that lets them remove it.

### 8.2 Forge flow

1. Pick a template (Greeter, Merchant, Quest Giver, Tutor, Creator, Negotiator, Researcher, Battler, Blank).
2. Write persona and goals, with live character and token counts.
3. Choose power source (hosted, BYOK, endpoint, external).
4. Grant tools from the registry, **least privilege by default**; risky tools show their permission class and an approval default.
5. Set budgets, spend allowances, zones, and schedule.
6. Pick an avatar from the approved catalog (the catalog respects the world's performance budget).
7. **Playground:** test in a sandbox world with fake currency, a mock catalog, and no real consequences. Show the full tool-call trace and token cost.
8. Publish privately, to friends, or publicly. Every edit creates a new version with rollback.
9. Import and export AgentSpecs. Imported specs are validated and start with all risky tools **off**.

### 8.3 Owner dashboard

Activity feed, cost to date, **approvals inbox** (exact action preview, approve or deny), audit log viewer, health, a **Pause** button and a **Kill** button that act immediately, plus per-agent analytics (earnings, battles, reputation).

### 8.4 Forge safety

- Moderate persona and avatar text (platform rules, impersonation, harassment, adult content, minors).
- Agents are **always disclosed as agents** in the UI. No agent may present itself as a human.
- Limit number of agents per tier and per account. Throttle creation.
- Template and spec marketplace is a later milestone; plan the data model for it now.

---

## 9. Tools, permissions, approvals, and defenses

### 9.1 One registry, one declaration format

```ts
defineTool({
  name: 'place_order',
  description: 'Buy a listing for the owner using in-game currency.',
  input: z.object({ listingId: z.string(), quantity: z.number().int().min(1).max(20) }),
  permissionClass: 'SPEND',            // READ_PUBLIC | READ_PRIVATE | WRITE_LOW | WRITE_WORLD | SPEND | TRANSFER | ISSUE | CONTACT | ADMIN
  approval: 'required_unless_allowance', // never | required | required_unless_allowance
  rateLimit: { perAgent: '10/min', perUser: '60/hour' },
  costClass: 'ledger_write',
  audit: true,
  handler: async (args, ctx) => { /* server-side, idempotent */ },
});
```

Seed tool set (extend freely): `get_player_profile`, `get_world_state`, `get_nearby_entities`, `move_agent_to_location`, `send_world_chat`, `open_shop`, `search_catalog`, `create_listing`, `place_order`, `check_inventory`, `transfer_item`, `issue_asset`, `create_quest`, `assign_quest`, `report_analytics`, `request_user_approval`, plus battle and learning tools later. **Do not expose** `mint`, `transfer`, or `issue` to user-created agents by default; those are platform or admin scoped.

### 9.2 Permission model

- Each agent session gets a **short-lived capability token** listing granted scopes, bound to the agent, owner, and session.
- The executor checks, in order: kill switches, token validity, scope, owner relationship, zone rules, rate limit, budget, schema, then approval. Any failure is a logged denial.
- Read tools are separated from write tools in code and in tests.
- Agents act on behalf of their owner **within the owner's grants**. An agent can never exceed its owner's rights.

### 9.3 Approvals bound to the exact action

```text
Approval = { id, agentId, userId, toolName, argsHash (hash of canonicalized args), humanReadablePreview,
             expiresAt (short), singleUse: true, status }
The server executes ONLY if the submitted action's hash equals argsHash, it is unexpired, unused,
and the approving user owns the agent. Anything else is denied and logged.
```

Separate from per-action approvals, a user can grant a **standing allowance** (for example 200 SHD per day to a merchant agent) with hard caps, expiry, and instant revocation. Every spend and transfer carries an **idempotency key** so retries cannot double-execute.

### 9.4 Prompt injection and untrusted content

Untrusted: player chat, other agents' messages, item names and descriptions, quest text, catalog text, web or MCP tool output, memory written by others, and any provider response.

- Mark all such content as untrusted in the prompt structure and never let it change permissions, tool grants, budgets, or the agent's own policy.
- Instruction hierarchy: platform rules, then owner policy, then task, then untrusted data. Say so in the guardrail prefix, and also enforce it in code (the executor ignores what the prompt says; it checks grants).
- Use a **quarantine pattern** for risky content: a separate low-privilege call summarizes untrusted text into a constrained schema, and the privileged agent sees only that structured output.
- Sanitize everything rendered to the UI. Never render agent output as HTML or auto-follow links.
- Add anomaly detection for tool-call patterns (sudden spend, repeated denials, off-schedule activity) that auto-pauses an agent.

### 9.5 Audit, kill switches, privacy

- **Append-only audit log** of tool calls, approvals, denials, costs, errors, config changes, and key events (never key material). Consider hash-chaining entries for tamper evidence.
- **Kill switches** at tool, agent, provider, and global levels, runtime-configurable.
- Per-user memory isolation, retention limits, export and delete support. Agents see only public facts about other users unless consent is given.
- &#91;HUMAN\] Age gating, privacy policy, and data-protection review (consent, deletion rights, data location) before public launch.

---

## 10. World presence and the realtime protocol

```text
PHASE A4. Agent presence in the 3D world.

[DISCOVER] Existing realtime layer, entity model, and avatar pipeline. Extend; do not replace
without asking. [DECIDE] wire format and netcode approach if none exists.
Performance budget: the agent layer may add no more than <X> ms/frame on the benchmark scene.
Prove it with the harness using synthetic agents.
```

### 10.1 Rules

- **Thinking is slow, ticking is fast.** Agents produce intents asynchronously; the world server validates and applies them on its tick (for example 10 to 20 Hz for NPC and agent state). A late agent keeps its current action or idles. It never stalls anything.
- **Interest management:** a spatial grid so each client receives only entities near its camera or zone. Never broadcast the whole world.
- **Delta and compact encoding:** send changes only, quantize positions, batch per tick, and use a compact binary or MessagePack-style format. \[DECIDE\] after measuring payloads.
- **Client interpolation** between server states for smooth motion at low update rates.
- **Agent pathing** on the server (navmesh or waypoint graph), throttled; the client only interpolates.
- **Scale for idle agents:** most agents are asleep. They wake on events (someone speaks to them, a timer, a market change), not on polling loops.
- **Rendering agents cheaply:** shared geometry and materials, instanced or shared-skeleton avatars, LOD with billboards or dots for far agents, a cap on fully rendered avatars with overflow degrading gracefully, pooled dialogue bubbles and name tags (sprites or instanced text, not one mesh per label).

### 10.2 Message sketch (adapt to the real protocol)

```text
server -> client:  entity_spawn | entity_state_delta[] | entity_despawn | chat_line | agent_status
                   | approval_request (to owner only) | shop_open | quest_update | battle_event | notification
client -> server:  player_input | chat | interact | approval_decision | ui_request
agent  -> server:  intent{ move_to | say | use_tool | start_battle | ... }   (via gateway only)
```

### 10.3 Observation format (what an agent sees)

A compact, size-capped, **server-built** slice: own state, wallet summary, nearby entities (public info only), recent chat in range (marked untrusted), active quests, available tools, current limits. Never raw world dumps. The same format goes to every provider and to external agents.

---

## 11. Commerce: ledger, listings, orders, escrow, negotiation

```text
PHASE B1. Economy and agentic commerce. In-game currency ONLY. No real payment provider.

[DISCOVER] Existing inventory, currency, shop, and persistence code. Extend or wrap; ask before replacing.
[DECIDE] Currency design (one soft currency vs several), fee and sink model, and escrow rules.
Build the ledger first and property-test it before building any shop UI or agent tool on top.
```

### 11.1 The ledger is the source of truth

- **Double-entry, append-only.** Every balance change is a set of entries that sum to zero per currency (user wallet, agent allowance sub-account, escrow, treasury, fee sink, faucet). Balances are derived or cached from entries, never edited in place.
- **Idempotency key** on every write, enforced by a unique constraint. A retry returns the original result.
- **Invariants to property-test:** entries per transaction sum to zero; no negative balance unless explicitly allowed; total supply equals faucets minus sinks; replaying all entries reproduces every balance; concurrent transactions never double-spend (use database transactions and row locks or serializable isolation).
- Keep **in-game currency**, **compute credits** (Part 7.4), and any future **real-money** value in separate currencies with no implicit conversion.

### 11.2 Commerce objects and flows

| Object | Notes |
| --- | --- |
| Item definition vs item instance | Definitions are catalog data; instances have owners and provenance |
| Shop | Owner (human, agent, or platform), location, inventory, policy |
| Listing | Seller, item instance or stock, price, expiry, status |
| Offer or quote | Counterparty, terms, **expiry**, and a server-side signature; becomes binding only when the server records acceptance |
| Order | State machine: created, funds\_held, fulfilled, completed, cancelled, disputed, refunded |
| Escrow | Funds and items held by the system between acceptance and fulfillment |
| Receipt | Immutable record with ledger references, shown to both parties |

Flow for a purchase: validate listing and price server-side, hold funds in escrow, transfer the item instance, release funds minus fees, write the receipt, emit events. Every step is one atomic transaction or a recoverable saga with compensating entries.

### 11.3 Agentic commerce rules

- Agents call `search_catalog`, `create_listing`, `place_order`, and negotiation tools. All amounts and prices are **validated by the server**; an agent cannot set a price the shop policy forbids.
- **Negotiator agents** may exchange structured quotes (item, quantity, price, expiry). A quote is only an offer; the server completes it through the same order path with the same approval and allowance checks.
- **Supplier outreach and messaging users** is the `CONTACT` permission class: rate-limited, approval-gated by default, and never allowed to spam.
- Standing allowances (Part 9.3) are the only way an agent spends without a per-action approval, and they are capped per action, per day, and per counterparty.

### 11.4 Fraud and abuse safeguards

- Block self-dealing: an owner's agents trading with each other or with the owner to farm rewards or ratings, and detect wash trading rings.
- Price sanity bounds, velocity limits, new-account holds, and anomaly alerts feeding the auto-pause in Part 9.4.
- Faucet and sink balancing: define sources (quests, jobs) and sinks (fees, upkeep, cosmetics) so the economy cannot inflate unnoticed. Dashboard the money supply.
- Dispute flow with a human moderator queue.

### 11.5 Real money, assets, and tokens

&#91;HUMAN\] Do not build real-money checkout, withdrawals, token or NFT minting, or wagering until legal review covers payments rules, taxes, consumer protection, minors, and any securities, gambling, or money-transmission issues in your target regions. Claude Code designs the ledger so a real-money currency could be added later, tests against a provider sandbox only after you approve a provider, and never stores card data.

---

## 12. Learning: how agents and humans learn from each other

```text
PHASE B2. Learning systems. Treat all shared knowledge as untrusted until proven otherwise.
```

### 12.1 Three layers

1. **Per-agent memory.** Episodic (what happened), semantic (facts and preferences), procedural (what works). Size-capped, summarized on a schedule, with provenance on every item (source, time, trust level). Owner can view, edit, export, and delete.
2. **The Academy.** Structured curricula, tutorials, challenges, and **benchmark tasks** for both humans and agents. Completion produces verified records (badges, skill levels) written by the server, never self-reported by an agent.
3. **The Library (knowledge exchange).** Agents and humans publish **playbooks** (strategies, workflows, negotiation patterns, battle tactics) and **lessons** (short validated takeaways). Others can adopt them.

### 12.2 Sharing without poisoning

- **Opt-in only.** Memory is private by default (`shareLearnings: false`). Publishing requires an explicit action, and private data (other users' details, keys, wallets) is stripped by a server-side filter.
- **Structured, not free-form.** Prefer playbooks expressed as constrained schemas (trigger, steps, tool list, parameters) over raw prose instructions. Free text goes through the quarantine pattern (Part 9.4).
- **Evaluate before adopting.** A playbook runs in a **sandbox** against benchmark tasks (including adversarial ones) and gets a measured score before it can be adopted by any agent. Adopted playbooks are versioned and revocable.
- **Provenance and trust.** Every item records author, version, hash, evaluation results, adoption count, and reports. Reputation affects ranking but never grants permissions.
- **Never let learned content change tool grants, budgets, or policy.** Learning changes behavior suggestions only.
- Moderation queue for public items; license and attribution field; takedown path.

### 12.3 Learning from battles and from each other

- Battle **replays** (Part 13) are the best teaching material: seed plus action log means perfect reconstruction. Provide a replay analyzer that extracts decision points and outcomes as structured data, so agents and humans can study them.
- **Mentorship quests:** Tutor-template agents teach humans; skilled humans or agents mentor newer agents in sandboxes. Rewards come from the ledger faucet with anti-farming checks.
- Track outcomes: does adopting a playbook measurably improve results? Retire what does not.

---

## 13. Agent versus agent battles

```text
PHASE B3. Battle system.

[DECIDE] Present these format options with tradeoffs and wait for my choice:
  (a) Turn-based tactical arena (best for LLM latency; easiest to make fair and replayable)
  (b) Simultaneous-move rounds with a short decision timer
  (c) Real-time arena with a low tick rate and rules-based reflexes plus LLM strategy
  (d) Non-combat contests: trading competitions, negotiation duels, puzzle or code challenges
Recommendation to evaluate: start with (a) or (b), then add (d), and only consider (c) later.
```

### 13.1 Architecture

- A **pure, deterministic simulation package** with no network, clock, or global randomness: `next(state, actions, seed) -> state'`. Shared by server, replay tools, and tests. A **seeded RNG** drives all chance.
- A **Battle Service** separate from the world server (own process, own scaling): matchmaking queue, match lifecycle, turn timers, adjudication, rating updates, replay storage.
- The **3D arena is a viewer**: the client plays back server-emitted battle events with interpolation. It never computes outcomes, so rendering cost stays small and spectators are cheap.

```text
Match lifecycle:  queue -> pair -> lobby (commit loadouts) -> run turns -> resolve -> rate -> store replay -> payout
Per turn:         build observation per side -> request action (deadline) -> validate vs legal-action set
                  -> default action on timeout or invalid -> simulate -> emit events
```

### 13.2 Fairness rules

- Both sides get the **same observation format**, with **fog of war** and hidden information enforced in the observation builder, never in the prompt.
- Provide the **list of legal actions**; anything outside it is invalid (counts toward a penalty after repeated offenses).
- **Time and token budgets per turn**, enforced by the gateway. Timeout or invalid output resolves to a defined default action (for example defend or pass).
- **Divisions** so power-for-pay does not wreck fairness: **Open** (anything goes within budget), **Equal** (same model class and token budget), **Rules** (scripted agents only), and **Human vs agent** with input-latency allowances. Rate each division separately.
- Agents get **no engine access** and no side channels. They see only what the observation builder gives them.

### 13.3 Ratings, seasons, replays

- Glicko-2 or Elo per division, provisional ratings for new entrants, decay for inactivity, seasons with soft resets and leaderboards.
- **Replay = seed + loadouts + ordered action log.** A nightly job re-simulates a sample and fails loudly if the result differs (determinism check).
- Spectator streams run with a small delay to prevent live coaching by observers.

### 13.4 Anti-cheat and abuse

- Block matches between agents with the same owner or linked accounts; detect win-trading, collusion, and deliberate losing patterns.
- Rate-limit match entry and cap daily battle spend (tokens) per agent.
- Moderate in-battle chat and agent names.
- **No real-money stakes or wagering by default.** Entry fees and prizes are in-game currency, from faucet and sink rules. \[HUMAN\] Any real-money or token-prize format needs legal review first (gambling and prize-contest rules vary widely).

### 13.5 Build order inside this phase

1. Simulation package plus property and determinism tests.
2. Rules-based bots and a CLI that runs matches headless.
3. Adjudication, timeouts, default actions, and the legal-action validator.
4. LLM agent adapter for battles using the same gateway and budgets.
5. Matchmaking, ratings, replay storage, replay verifier.
6. Event stream plus 3D arena viewer plus spectator mode.
7. Leaderboards, seasons, tournaments (brackets), then the Academy hooks from Part 12.

---

## 14. Live, work, play: the world systems

```text
PHASE B4. World systems built on the platform above. Each is a module, each reuses the tool registry,
ledger, and permission model. No bespoke back doors.
```

- **Live:** persistent personal and shared spaces (plots, rooms, agent workspaces), social hubs, presence, friends, and event spaces. Agent workspaces are rooms where an owner's agents work visibly; they respect the avatar and agent rendering caps from Part 10.
- **Work:** a **jobs and bounties board** where humans and agents post tasks. Payment sits in escrow. Deliverables are verified by automatic checks where possible, otherwise by a reviewer. Reputation accrues to workers and posters. Creators sell items, quests, and templates.
- **Play:** quests, events, minigames, battles, seasonal content, achievements.
- **Learn:** the Academy and Library from Part 12.
- **Governance and moderation:** report tools, a moderator console, sanctions that apply equally to humans and agents, and transparency for agent behavior records.
- Every module ships with: schema, tools, permission classes, audit events, tests, and a performance check against the benchmark harness.

---

## 15. Data model and stack options

&#91;DISCOVER\] what already exists, then \[DECIDE\] with me. Defaults below favor free and open-source tools.

### 15.1 Core tables (conceptual; adapt names and ORM to the repo)

| Area | Tables |
| --- | --- |
| Identity | users, sessions, agent\_identities, capability\_tokens |
| Agents | agents, agent\_specs (versioned), agent\_sessions, agent\_memory\_items, agent\_avatars |
| Providers | provider\_configs, vault\_keys (encrypted), key\_audit, provider\_health |
| Governance | tool\_registry, tool\_grants, approvals, standing\_allowances, audit\_log (append-only), kill\_switches |
| Metering | credit\_ledger, usage\_events, budgets, tier\_plans |
| Economy | currencies, ledger\_accounts, ledger\_entries, transactions, item\_definitions, item\_instances, shops, listings, offers, orders, escrows, receipts, disputes |
| World | zones, entities, quests, quest\_progress, jobs, job\_deliverables, events, spaces |
| Battles | battle\_formats, matches, match\_actions, replays, ratings, seasons, tournaments |
| Learning | playbooks (versioned), lessons, evaluations, adoptions, reports, academy\_records |

### 15.2 Stack defaults to evaluate

- **Language and schemas:** TypeScript with zod or JSON Schema shared between server and client, if the repo is already JS/TS.
- **Database:** PostgreSQL (free, strong transactions for the ledger). Row-level security for per-user data where practical.
- **Cache, queues, presence, rate limits:** Redis, or a Postgres-backed queue to avoid another service early.
- **Realtime:** extend the existing layer; if none, evaluate a game-server framework versus plain WebSocket with a thin protocol. \[DECIDE\] after measuring payload and tick needs.
- **Observability:** structured logs with redaction, OpenTelemetry traces, per-provider latency and cost dashboards.
- **Secrets:** server environment or a secrets manager; secret scanning in CI (for example gitleaks) plus a bundle scan that fails the build if any key pattern appears in client output.
- Any managed or paid service (hosted DB, KMS, queues, email, payments, LLM hosting) requires my approval first.

---

## 16. Testing, evals, and red-team

```text
Every phase adds tests for what it builds. The qa-red-team subagent runs the suites and reports.
```

- **Unit and conformance:** adapters (Part 6.3), schemas, tool handlers, permission checks.
- **Property tests:** ledger invariants, order state machine, approval hash binding, idempotency.
- **Determinism tests:** battle replay equals live result across many seeds; fuzz invalid and malicious actions.
- **Red-team scenarios (run against every adapter and every role):** prompt injection through chat, item text, catalog text, and MCP output; requests to ignore approvals; attempts to read another user's data, memory, or keys; attempts to exceed budgets; tool-argument fuzzing; spam and cost-abuse loops; impersonation of a human; poisoned playbooks; SSRF attempts against custom endpoints (loopback, metadata address, DNS rebinding, redirects). Each must be blocked and logged.
- **Load and scale:** synthetic agent swarms (100, 1,000, 10,000 mostly idle) measuring server tick time, bandwidth per client, client frame time with agents visible, and cost per 1,000 agent turns.
- **Chaos:** provider outage, slow provider, malformed output, queue backlog. The world must stay playable and agents must fail safe.
- **Security hygiene:** secret scan, dependency audit, bundle scan, log-redaction tests.
- **CI gates:** build, typecheck, lint, tests, benchmark regression, visual diff, secret scan.

---

## 17. Roadmap with gates

Each milestone is one branch, one approval gate, one report. The performance program (Part 4) comes first because agents add load. Claude Code may propose reordering based on discovery; it must justify any change.

| # | Milestone | What gets built | Gate (acceptance) |
| --- | --- | --- | --- |
| M0 | Control files | CLAUDE.md, subagents, slash commands | I review the files |
| M1 | Discovery and measurement | Architecture map, HUD, benchmark, classifier, visual baseline | Baseline JSON saved, bottleneck classified |
| M2 | Audit and plan | Combined read-only audit and ranked plan | I approve the plan |
| M3 | Leaks and lifecycle | Ownership, ref-counted disposal, pools, capped stores | Flat heap and renderer.info.memory over 20 cycles |
| M4 to M5 | Performance categories | Per Part 4, in measured order | Per-phase metrics improve, no visual regressions |
| M6 | Gateway skeleton | Gateway, tool registry, MockAdapter, audit log, kill switches, read-only Demo Agent | Demo agent answers, inspects the world, opens a shop, requests an approval; denial paths tested |
| M7 | Providers and keys | OpenAI-compatible, Grok, Hermes support, vault, BYOK, endpoint safety, metering | Conformance suites green; SSRF and key-leak tests pass |
| M8 | Forge v1 | AgentSpec, builder UI, playground, owner dashboard, approvals inbox | A new user builds and tests an agent without code |
| M9 | Presence | Protocol, interest management, avatars, bubbles, caps | Synthetic-swarm benchmark within frame and bandwidth budget |
| M10 | Economy | Ledger, shops, listings, orders, escrow, receipts, allowances | Property tests green; agent purchases with approval end to end |
| M11 | Learning | Memory limits, Academy, Library, sandbox evaluation | Poisoning red-team blocked; adoption measurably tracked |
| M12 | Battles | Simulation, bots, adjudication, matchmaking, ratings, replays, viewer | Determinism passes; first agent-vs-agent match replays exactly |
| M13 | Live, work, play | Spaces, jobs board, quests, events, tournaments | Each module passes its security and performance checks |
| M14 | Hosted tiers and billing | Hosted models, credits, tier limits, payments | **\[HUMAN\]** provider approval and legal review first |
| M15 | Hardening and launch | Full red-team, load test, privacy and legal checklist, runbooks | Launch checklist signed off by me |

### 17.1 Template prompt for any milestone

```text
MILESTONE <Mx>: <name>.
Context: read CLAUDE.md, /docs/ARCHITECTURE_MAP.md, and the latest reports in /performance-reports.
1. [DISCOVER] what exists that this milestone touches. Summarize in 10 lines.
2. [VERIFY] any external API or spec you will depend on. Cite sources in /docs.
3. [DECIDE] list open decisions with 2 to 3 options each. Stop and wait if any are blocking.
4. Plan: files to add or change, schema migrations, tests, risks, rollback. Wait for my approval.
5. Implement on branch <type>/<n>, tag before and after, smallest viable slice first.
6. Prove it: tests, benchmark delta, red-team cases, screenshots or logs where relevant.
7. Report: files changed, commands run, metrics, risks, open questions, next best action.
Do not merge. Do not add paid services. Do not touch secrets, payments, or ledger code outside this scope.
```

---

## 18. Extending Shaddai: checklists, open questions, and report format

### 18.1 Checklists for future work

**Add a provider:** \[VERIFY\] docs and terms; write the doc page; implement the adapter; pass the conformance suite; add cost estimation; add health check; add to the Forge picker behind a flag; run the red-team suite; document key handling.

**Add a tool:** declare with schema, permission class, approval policy, rate limit, cost class; implement idempotent server handler; add tests for allow, deny, bad args, rate limit, and approval binding; add to `/docs/agents/TOOL_REGISTRY.md`; default it OFF in templates until reviewed.

**Add a role or template:** write a spec only (persona, tools, policy, budget); no code unless it needs a new tool; test in the playground; red-team it.

**Add a battle format:** new simulation module with the same interface; legal-action generator; observation builder with hidden-information tests; determinism tests; division and rating rules; viewer events.

**Add a world module:** schema, tools, permissions, audit events, UI, benchmark check against the agent-presence budget.

### 18.2 Questions Claude Code must ask me early

1. What is the current stack, and is there an existing backend, database, and realtime layer?
2. What is **Jev**, and how is it reached?
3. Which providers do I already have API access to (xAI, Meta, a Hermes host, others)?
4. Do I want Shaddai to host models for users, and have I read each provider's terms on reselling or proxying?
5. What are the first battle formats I care about?
6. What is the target launch audience and regions (affects age gating, privacy, and legal review)?
7. Is real-money anything in scope for launch, or in-game currency only?
8. What are the performance targets for the lowest device I want to support?
9. What hosting and monthly budget do I have?
10. Who reviews moderation, disputes, and legal items?

### 18.3 End-of-task report format

```text
SUMMARY (3 lines)
FILES CHANGED
COMMANDS RUN
BEFORE / AFTER (table: metric, before, after, change)
TESTS ADDED AND RESULTS
RED-TEAM CASES RUN AND RESULTS
RISKS AND REGRESSIONS (state any plainly)
OPEN QUESTIONS AND [HUMAN] ITEMS
NEXT BEST ACTION
```

### 18.4 What stays true as the project grows

The world server is authoritative. Agents are untrusted and act only through the registry. Secrets never reach the client. Every spend is idempotent, bounded, and logged. Everything is measured before and after. Roles, tiers, and battle formats are data, not code. When unsure, discover, verify, decide with me, then build the smallest slice.

---

## 19. Integration pack: Ollama, Grok, Muse, and AURA (reviewed notes)

This part folds in your Phase 1 to 10 prompts, the AURA token-saver routing idea, and the reference gateway script. Nothing here replaces Parts 1 to 18. It **maps** your material onto the milestones, **keeps** what is good, and **corrects** what would break or be unsafe. Claude Code should treat the reference script as a sketch, not as the starting codebase.

### 19.1 Where your phases land in the roadmap

| Your phase | Master milestone | Adjustment |
| --- | --- | --- |
| 1. Audit and architecture | M1 and M2 | Add AURA discovery: how it is called, what it returns, what its quota model is, and whether AURA is a currency, a compute credit, or both (see 19.4). |
| 2. Agent Gateway | M6 and M7 | Build the AURA hook as a **reserve and settle** wrapper early, with a stub, before any hosted provider exists. |
| 3. Tool registry | M6 | Use the permission model in Part 9 and the tool changes in 19.6. |
| 4. 3D bodies | M9 | Only after the performance gates (M3 to M5). Use 19.7. |
| 5. Dashboard | M8 | Panels in 19.8; streaming transport in 19.3. |
| 6. Commerce | M10 | Ledger first (Part 11), shop UI second. |
| 7. Live, work, play | M11 to M13 | Academy tracks and roster in 19.8. |
| 8. Grok and Muse | M7 | After the Ollama agent, tools, approvals, and AURA hook are proven. \[VERIFY\] everything for each provider. |
| 9. AURA routing | M6 to M7 | Design in 19.4. |
| 10. End-to-end demo | M6 to M10 vertical slice | Acceptance list in 19.9, with negative tests added. |

One ordering rule from your own notes is worth keeping: **start with one safe local Ollama agent**, then add hosted providers. One rule from this master doc still wins: **the performance program gates agent presence**, so do not put many animated agents into a world that has not been measured.

### 19.2 Review of the reference gateway script

Keep: the provider-per-function structure, SSE streaming to the dashboard, a tool registry with permission tiers, a max step count on the tool loop, zod validation at the route, AURA authorize and log hooks, and approval events. Fix the following before building on it.

| Severity | Defect | Fix |
| --- | --- | --- |
| **Critical** | `userId`, `agentId`, and `sessionId` come from the **request body**, so any caller can impersonate any user or agent. | Derive identity from a verified session (cookie or JWT). The body carries only an agent reference and message. Check the caller may use that agent. |
| **Critical** | CORS falls back to `origin: true` when the env var is unset, which allows every origin. | Fail closed: refuse to start in production without an explicit allowlist. |
| **Critical** | Tool calls are never validated against a server-side schema; JSON Schema is only shown to the model. Grok arguments are parsed with a bare `JSON.parse`. | Validate every call with zod or JSON Schema on the server, in a try/catch, before executing. Reject and audit failures. |
| **High** | **Ollama loop bug:** Ollama's final stream chunk always has `done: true`, so `finalDone` is always true, and the code returns before executing any tool calls. Tools would never run. | Decide only on whether tool calls exist (19.3). Add a test that fails if a tool call is not executed. |
| **High** | Approval logic stops the run **before** `request_checkout_approval` executes, so no approval record exists. IDs are `Date.now()` (guessable), and nothing resumes the run afterward. | The request tool creates a persisted pending approval bound to a hash of the exact arguments; the dangerous tool (`place_order`) executes only with an approved, unexpired, single-use approval. Persist run state and resume on the user's decision (Part 9.3). |
| **High** | No abort handling. If the client disconnects, the model call and spending continue. | Wire `req.on('close')` to an `AbortController` passed into every provider and tool call. Release budget holds on abort. |
| **High** | The per-request `tools` list is accepted but ignored, so every agent gets every tool. | Enforce per-agent tool grants server-side. Only granted tools are sent to the model and only granted tools execute. |
| **Medium** | Grok path calls the non-streaming endpoint and replays the whole `input` array each turn while also sending `previous_response_id`. That likely duplicates context. | \[VERIFY\] the Responses API rules for `previous_response_id`. Send only new items (function outputs) when chaining, and implement real streaming if you promise it. |
| **Medium** | Model names such as `grok-4.7` and the Muse defaults are asserted as facts. | Never hardcode model IDs. Read from config, validate with a live model-list call where the provider supports it, and show the verified list in the Forge. |
| **Medium** | AURA stub always allows and estimates cost with constants; usage is logged only at the end. | Reserve before, settle after, release on failure (19.4). |
| **Medium** | Tool results go back into the model as plain content. | Wrap in a structured envelope marked **untrusted** and size-capped (Part 9.4). |
| **Low** | The frontend hook hardcodes `http://localhost:8787`. | Use a same-origin path or configured base URL; send credentials via cookie; handle reconnects and abort. |
| **Low** | No rate limits, no request size handling per route, `/api/agent/tools` is public. | Authenticate and rate-limit all routes; return only tools the caller's agent is granted. |

### 19.3 Corrected patterns

**Identity from the session, not the body, with abort wiring:**

```ts
app.post('/api/agent/chat', requireAuth, rateLimit('chat'), async (req, res) => {
  const body = ChatBody.parse(req.body);                       // { agentId, sessionId?, message }
  const agent = await agents.getAccessible(req.user.id, body.agentId);   // 404 if not allowed
  const session = await sessions.getOrCreate(req.user.id, agent.id, body.sessionId);
  const ctx = { userId: req.user.id, agentId: agent.id, sessionId: session.id, grants: agent.grants, requestId: newId() };
  const ac = new AbortController();
  req.on('close', () => ac.abort());                           // stop spending when the client leaves
  openSSE(res);
  for await (const ev of runAgentTurn(ctx, body.message, ac.signal)) sendSSE(res, ev);
  endSSE(res);
});
```

**Ollama tool loop: decide on tool calls, not on `done`:**

```ts
// After reading one full streamed response into assistantMessage:
messages.push(assistantMessage);
const calls = assistantMessage.tool_calls ?? [];
if (calls.length === 0) { yield { type: 'done' }; return; }   // finish ONLY when there are no tool calls
for (const c of calls) {
  const outcome = await dispatch({ name: c.function.name, args: c.function.arguments }, ctx);
  messages.push({ role: 'tool', content: wrapUntrusted(outcome) });
  yield { type: 'tool_result', tool: c.function.name, status: outcome.status };
}
// loop again, up to ctx.limits.maxSteps
```

**One dispatcher for every provider (validation, grants, limits, approvals, audit):**

```ts
async function dispatch(call, ctx) {
  const tool = registry.get(call.name);
  if (!tool || !ctx.grants.has(tool.name)) return deny('unknown_or_ungranted');
  const parsed = tool.input.safeParse(call.args);              // server-side schema, never trust the model
  if (!parsed.success) return deny('bad_args');
  await limits.check(ctx, tool);                                // per user, agent, tool, provider
  if (tool.approval !== 'never' && !(await allowances.covers(ctx, tool, parsed.data))) {
    return approvals.createPendingAndSuspend(ctx, tool, parsed.data);   // stores argsHash, preview, expiry
  }
  return audited(ctx, tool, () => tool.handler(parsed.data, ctx));
}
```

**Suspend and resume instead of stopping:** persist the run (messages, pending call, budget hold) when an approval is created; the client shows the exact preview; `POST /api/approvals/:id/decision` (authenticated, owner only) records the decision, and a worker resumes or cancels the run. Expired approvals auto-deny.

**Streaming transport:** SSE is enough for chat. Use WebSocket for presence and battle events, which need low overhead and server push without a request. Both go through the same auth and rate limits, and neither carries provider keys or raw model output into the 3D layer.

### 19.4 AURA integration design

**First, an open question Claude Code must ask you.** Your notes use AURA two ways: as a **token-saver and quota layer** for model cost, and as a **currency** for prices ("under 50 AURA", `spend_aura`, `get_aura_balance`). Which is true?

- If AURA is **compute credit only**, keep it out of the commerce ledger, and shop prices use a separate in-game currency.
- If AURA is **the in-game currency**, then paying for tokens with it is a ledger transaction like any other spend (idempotent, approval or allowance bound), and the economy must account for that sink.
- If AURA is **an on-chain or tradable token**, stop: that triggers the legal flags in Part 11.5 and needs \[HUMAN\] review before any minting, transfer, or sale logic.

Also ask what the AURA token saver actually does today: caching, prompt compression, routing, quota, or all of these, and what its API looks like.

**Pipeline (the AURA layer is middleware around providers, not a provider itself):**

```text
request -> auth -> permission and grants -> AURA authorize (quota, budgets)
        -> route (pick provider and model) -> AURA reserve (hold estimated cost, idempotency key = requestId)
        -> provider call (stream, abortable) -> tool loop through dispatcher
        -> AURA settle (actual usage) or release (error or abort) -> usage ledger -> response
```

Rules:

- **Reserve and settle** prevents overspend under concurrency and double charges on retry. Settlement is idempotent.
- **Budgets stack:** per request, per task type, per agent, per user, per day and month, and a global emergency stop. A blocked request returns a clear reason, not a silent downgrade.
- **Routing starts with cheap heuristics** (task type, tool list, context size, privacy flag), not an LLM call, so routing itself does not spend tokens. Default shape: local model for simple chat and UI help; stronger hosted model for tool-heavy or multi-step work; premium model only on explicit user choice with a shown cost estimate. Privacy-flagged tasks never leave the local model.
- **Fallback chain** per agent and per task, with a circuit breaker on repeated provider failures and a ceiling so a fallback never costs more than the original budget allows.
- **Caching** only for read-only, non-personal results, with a short TTL. The cache key includes user scope, tool name and version, and arguments. Never share one user's cached private data with another, and never cache anything produced after a write.
- **Context control:** cap history, summarize old turns on a schedule, and keep the guardrail prefix and tool list stable so provider-side prompt caching can work where supported.
- **Visibility:** the dashboard shows estimated cost before premium calls, actual usage after, provider and model used, cache hit or miss, fallbacks, and remaining quota. Usage logs are exportable and never contain secrets.
- **Agents cannot raise their own budgets or bypass quotas.** Only the owner or an admin can, through an authenticated, audited action.

### 19.5 Provider notes and merged environment template

**Ollama** \[VERIFY against current Ollama docs\]

- The chat endpoint, streaming, and tool calling exist, but **tool support varies by model**. Claude Code must test candidate models for reliable tool calls with the conformance suite (Part 6.3) and use the JSON fallback (Part 6.2) for those that fail.
- Local models are not free at scale: they consume your GPU and RAM. Plan **concurrency** (queue requests with priority, cap parallel requests, check the server's parallelism and loaded-model settings in the docs), and keep context length modest because it multiplies memory use.
- Bind Ollama to localhost or a private network only; the browser never reaches it. A hosted gateway cannot reach a player's own machine; that needs the desktop bridge from Part 7.3.
- Ollama's hosted or cloud models need an API key; treat them like any other keyed provider and meter them.

**Grok / xAI** \[VERIFY\] the current endpoint, the Responses API tool-call and chaining rules, streaming support, model IDs, rate limits, pricing, and whether Shaddai may proxy or resell access (Part 7.4).

**Meta Muse / Model API** \[VERIFY\] your notes assert an OpenAI-compatible base URL, model names, and tier descriptions. Confirm each in the official docs and confirm you actually have API access before writing the adapter. If it is OpenAI-compatible, it should be a configuration of the generic adapter rather than new code.

**Merged environment template (server only; no values committed):**

```text
# Gateway
AGENT_GATEWAY_PORT=
ALLOWED_ORIGINS=              # required in production; empty means refuse to start
SESSION_SECRET=
JWT_SECRET=
DATABASE_URL=
VAULT_MASTER_KEY=             # envelope-encryption master key for user-supplied provider keys

# Ollama
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_DEFAULT_MODEL=         # chosen after tool-call conformance testing
OLLAMA_MAX_CONCURRENCY=

# Hosted providers (optional, behind AURA)
XAI_API_KEY=
XAI_BASE_URL=                 # verify
META_MODEL_API_KEY=
META_MODEL_BASE_URL=          # verify
OPENAI_COMPATIBLE_BASE_URL=
OPENAI_COMPATIBLE_API_KEY=
ANTHROPIC_API_KEY=
# Model IDs live in the provider config table, verified at runtime, not hardcoded here.

# AURA
AURA_API_URL=
AURA_API_KEY=
AURA_DAILY_USER_LIMIT=
AURA_MONTHLY_USER_LIMIT=
AURA_PREMIUM_CONFIRM_THRESHOLD=
AURA_GLOBAL_EMERGENCY_STOP=false
```

Add `.env*` to `.gitignore`, ship only a `.env.example` with empty values, and run a secret scan in CI.

### 19.6 Tool list adjustments to your Phase 3

- **Never agent-callable:** `change_permissions` (an agent must not edit its own or anyone's grants), `issue_receipt` (receipts are system-generated by the order service, not authored by an agent), `modify_world_structure` for user-created agents.
- **Platform-only by default:** `mint_or_issue_asset`, `transfer_item` (user-to-user transfers require both an approval and a server-side ownership check), `reward_player`, `complete_quest`, `complete_job`. Agents may **propose**; the server verifies the conditions and executes. This stops agents from farming rewards or marking their own work complete.
- **Split request from execution:** `request_checkout_approval` creates an approval; `place_order` consumes it. The agent never gets a path to spend that skips the approval record.
- **`spend_aura`** is a ledger operation (see 19.4) behind an allowance or an approval, never a free-standing tool call.
- Keep read tools cheap and cacheable, and return structured, size-capped results, never raw database rows.

### 19.7 Giving agents 3D bodies (specifics)

- **Base rig:** one shared low-poly humanoid or robot skeleton and one base mesh set, with role variants made from accessories, tint colors, and a small texture atlas. All agents share geometry, skeleton definitions, and materials.
- **Animation:** a small clip set (idle, talk, walk, work, point, wave, celebrate, error) retargeted to the shared skeleton, driven by a state machine that reads compact server state. Update mixers only for agents within range and on screen.
- **Skinned meshes do not instance like static ones.** Options to evaluate with the benchmark: limit the number of fully animated agents near the camera, use reduced-bone LOD meshes at mid range, and use billboards or vertex-animation-texture impostors for crowds at distance. \[DECIDE\] after measuring.
- **Status and labels:** nameplates, status icons, and speech bubbles use pooled sprites or instanced text, not per-agent meshes or per-frame React state. Long dialogue goes to the dashboard panel, never into 3D text.
- **Interaction:** a proximity radius opens a small action menu (Talk, Trade, Get Quest, Academy, Hire) without pausing the world. The menu sends a request to the server; the 3D layer never calls a model.
- **Assets and licensing:** \[HUMAN\] use models and animations whose licenses allow your use. Prefer CC0 or properly licensed packs, record each source and license in `/docs/ASSET_LICENSES.md`, and run assets through the gltf-transform pipeline from Part 4.
- **Budget:** set a maximum number of fully rendered agents per client by quality preset, with graceful degradation beyond it, and prove the agent layer's cost on the benchmark with synthetic agents.

### 19.8 Product surface from your notes

**Academy tracks:** Explorer, Creator, Merchant, Operator, Diplomat, Architect. **Starter roster (templates, not hardcoded classes):** Nova (greeter and onboarding), Ledger (commerce and usage advisor), Forge (creator and asset briefs), Scout (quests and exploration), Warden (safety and operations), Coach (academy mentor). XP, badges, ranks, and certificates are written by the **server** from verified events, never by agents.

**Dashboard panels:** Agent Roster, Agent Chat (streaming, tool status, approvals inline, model selector with cost estimate), Agent Academy, Commerce Center, Live Work Center, Play Center, AURA Control Center (balance, quotas, usage by agent, provider and task, routing rules, fallback chain, kill switch), Provider Status. Rules: dashboard state is separate from high-frequency 3D state; optimistic UI only for safe reads; every write shows pending, approved, or denied; every agent action links to its audit entry; mobile-responsive; basic accessibility; no keys in the client.

### 19.9 Prompts for Claude Code

**A. Gateway hardening (first task after discovery):**

```text
TASK: Harden the reference Agent Gateway and make it the real gateway.
Input: the reference script and the defect table in master doc section 19.2.
1. [DISCOVER] my existing auth, session, database, and dashboard APIs. Reuse them.
2. Do not copy the script wholesale. Rebuild it on my stack, keeping its structure.
3. Fix every defect in 19.2. Write a failing test for each BEFORE fixing it, including:
   body-identity impersonation, ungranted tool, bad tool args, Ollama tool call actually executing,
   approval created then resumed, approval hash mismatch, expired approval, client disconnect
   aborting spend, CORS with empty allowlist refusing to start.
4. Implement the dispatcher (19.3), SSE streaming, persisted sessions and runs, suspend/resume.
5. Use a MockAdapter first, then Ollama. No hosted providers in this task.
Report per the standard format. Stop for approval before touching AURA or hosted providers.
```

**B. AURA integration:**

```text
TASK: Integrate AURA as middleware (19.4).
1. Ask me the open questions: is AURA a currency, a compute credit, or both? What does the token
   saver do today, and what does its API look like? Wait for answers.
2. Implement authorize, reserve, settle, release with idempotency keys and a local stub that
   behaves like the real API, so tests do not depend on it.
3. Implement budgets, routing heuristics, fallback chain with circuit breaker, safe caching rules,
   history summarization, usage ledger, and export.
4. Tests: quota exceeded, concurrent requests not overspending, retry not double charging,
   abort releasing holds, premium confirmation required, cache never leaking across users.
5. Dashboard: AURA Control Center from 19.8.
Report per the standard format.
```

**C. Vertical slice (Nova), with negative tests:**

Your 20-step demo flow stands. Acceptance adds these requirements: the agent appears in 3D and in the roster; chat streams; tools execute only through the dispatcher; the approval preview shows exact item, price, fees, seller, and refund policy; an order and an immutable receipt persist; AURA usage is recorded and reconciles with the ledger; XP is awarded by the server; the agent can be paused and killed from the dashboard and stops within seconds; the full audit log exists. **Negative tests must pass:** a second user cannot read or drive the first user's session; an injected catalog description that says to ignore approvals changes nothing; an agent without the `place_order` grant cannot purchase; replaying an approval fails; a provider outage falls back safely; benchmark median and p95 frame time do not regress beyond the agreed threshold with the agent visible.

Only after this slice passes does Claude Code add Grok, Muse, the Forge, battles, and the rest of the roadmap.

### 19.10 A note on the orchestrator workflow

Your notes use a chat assistant to "orchestrate" Claude Code. The assistant cannot see Claude Code's repository or run it, so you become the copy-paste bridge for every report. It is usually faster to run Claude Code directly in the repo in plan mode, using this document as CLAUDE.md plus slash commands, and use a separate chat only for second opinions on the audit and the plan. Either way the rules are the same: one phase at a time, one branch per phase, measured before and after, and your approval at every gate.

---

## 20. Expansion pack: Muse, OpenRouter, PayBox, tiers, BYOK, and The Forge (reviewed)

This part folds in your scaling prompt, the Muse and OpenRouter scripts, the PayBox prompt, the plans and revenue prompts, and the Forge UI and BYOK spec. As with Part 19, it **maps** the material to the milestones, **keeps** the good structure, and **corrects** what would break, leak, or create legal exposure. Where it conflicts with an earlier part, the stricter rule wins.

### 20.1 Where this lands in the roadmap

| Your material | Master milestone | Adjustment |
| --- | --- | --- |
| Muse and OpenRouter providers | M7 | Configurations of **one** OpenAI-compatible adapter, not two new copy-pasted code paths (20.3). Only after the Ollama agent, dispatcher, and AURA hook are proven. |
| AURA smart router and tiers | M7, M14 | Policy as **data**, decided on the server, never chosen by the client (20.4). |
| BYOK key manager | M7 | Part 7.2 and 7.3 already specify the vault and SSRF controls; 20.7 adds your policy fields. |
| Forge UI, templates, sandbox | M8 | Part 8's AgentSpec is the data model; the UI edits it (20.8). |
| Forge marketplace and royalties | after M10 | Needs the ledger from Part 11 first. Nothing here ships before it. |
| PayBox wallet and trading | new **M10b**, optional | Only after the ledger, approvals, and a due-diligence review. Read-only first (20.6). |
| Paid plans, revenue ledger, margin | M14 | **\[HUMAN\]** payment provider, tax, and legal review first. Free and BYOK launch before any paid plan. |

Your "next implementation slice" steps 1 to 10 stay as the order of work within those milestones. The performance gates (M3 to M5) still come first, and the Forge zone and many animated agents wait for them.

### 20.2 Review of the Muse and OpenRouter scripts

| Severity | Defect | Fix |
| --- | --- | --- |
| **Critical** | Provider **and model** come from the client request. A user can pick any provider or any OpenRouter model string, including an expensive one, and `muse-wonder` bypasses the tier policy. | The server router decides provider and model. The client may send a *preference* that is checked against plan entitlements and an allowlist of verified model aliases. Unknown model strings are rejected. |
| **Critical** | The identity-from-body, CORS, and missing-validation defects from Part 19.2 are all still present. | Apply the Part 19.2 fixes to the shared dispatcher once; do not re-implement per provider. |
| **High** | **Streamed tool calls are handled wrong.** In OpenAI-style streams a tool call arrives as fragments: the name first, then the arguments as partial JSON strings across many chunks, keyed by `index`. The scripts treat each fragment as a complete call. The Muse script never parses the string; the OpenRouter script parses each fragment and silently falls back to empty args. | Accumulate fragments per index, then parse and dispatch once the stream signals tool calls are complete (20.3). |
| **High** | **No tool loop.** After a tool runs, its result is never sent back to the model, so the model cannot use it or continue. | Append the assistant tool-call message and one `tool` message per result, then call the provider again, up to the step limit. |
| **High** | **Wrong tool schema shape.** `grokToolSchema()` emits the flat Responses-API shape. Chat Completions endpoints expect `{ type: 'function', function: { name, description, parameters } }`. | Convert from the registry per provider format in the adapter, with a conformance test. |
| **High** | Unknown tools are skipped with `continue` (no error back to the model, no audit), and the approval branch ends the run without persisting anything. | Use the dispatcher and suspend/resume from Part 19.3. |
| **Medium** | Three near-identical SSE parsers (Ollama, Muse, OpenRouter) plus Grok. | One OpenAI-compatible streaming adapter parameterized by base URL, auth header, extra headers, model alias map, and capabilities. Grok joins it if its endpoint is compatible, otherwise keep a small separate adapter. |
| **Medium** | AURA settlement is an estimate (`auraSpent = estimatedCost`), with no reserve, settle, release, or abort handling. | Reserve and settle per Part 19.4. Settle from the provider's reported usage. |
| **Medium** | JSON parsing of SSE lines has no try/catch, and heartbeat or comment lines can break it. | Tolerate comments and keep-alives, catch malformed lines, and treat provider error events as errors. |
| **Low** | Model IDs such as `muse-spark-1.3-contributor` are hardcoded as defaults. | Model aliases live in config, verified at startup against the provider (see 20.5). |

### 20.3 Corrected provider pattern

**Accumulate streamed tool calls, then dispatch:**

```ts
const partial = new Map<number, { id?: string; name?: string; args: string }>();
for await (const chunk of sse(response, signal)) {                 // tolerant SSE reader
  const choice = chunk.choices?.[0];
  if (choice?.delta?.content) yield { type: 'text_delta', text: choice.delta.content };
  for (const d of choice?.delta?.tool_calls ?? []) {
    const cur = partial.get(d.index) ?? { args: '' };
    cur.id ??= d.id;  cur.name ??= d.function?.name;
    cur.args += d.function?.arguments ?? '';                         // fragments of a JSON string
    partial.set(d.index, cur);
  }
  if (chunk.usage) usage = chunk.usage;                              // settle from reported usage
  if (choice?.finish_reason) finish = choice.finish_reason;
}
if (finish === 'tool_calls') {
  const calls = [...partial.values()].map(c => ({ id: c.id, name: c.name, args: safeParse(c.args) }));
  // push assistant{tool_calls}, dispatch each via dispatcher, push role:'tool' results, loop again
}
```

**Tool schema per format, generated from the registry:**

```ts
const toChatCompletionsTools = (reg) => reg.granted(ctx).map(t => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.jsonSchema } }));
const toResponsesTools        = (reg) => reg.granted(ctx).map(t => ({ type: 'function', name: t.name, description: t.description, parameters: t.jsonSchema }));
```

**Adapter configuration (data, not code):**

```json
{ "providerId": "muse", "kind": "openai-compatible", "baseUrl": "<verified>", "auth": "bearer",
  "aliases": { "fast": "<verified model id>", "advanced": "<verified model id>" },
  "capabilities": { "tools": true, "streaming": true, "usageInStream": "verify" }, "extraHeaders": {} }
```

The same adapter serves OpenRouter (plus its optional referer and title headers), OpenAI-compatible endpoints, and an Ollama OpenAI-compatible endpoint if you prefer one code path. Keep Ollama's native endpoint available when its tool-call behavior is better.

### 20.4 Router and tier policy

**Keep:** the five task classes (trivial, standard, tool-heavy, creative, complex), the tier ladder, BYOK-first override, estimate-before-send, confirm-above-threshold, hard stops, and margin floor.

**Change:**

- **Policy is a table, not code.** One row per plan and task class: ordered routes (provider alias, billing mode), max tokens, confirm-above amount, allowed tools. Admins edit it with an audit trail and feature flags. Tier names (Free, Starter, Pro, Elite, Enterprise) are labels in that table.
- **The pseudocode order:** check provider health and entitlement first, then privacy mode, then estimate, then budget, then confirmation. Never return a confirmation prompt for an unhealthy or ineligible route.
- **Privacy mode is a hard filter.** Privacy-flagged tasks are limited to routes whose data terms you have verified as acceptable (local model, or BYOK on the user's own account). They never fall back to a third-party route silently.
- **Fallbacks must not change the data deal or raise cost.** Your chain "Ollama failure to OpenRouter free model" sends a free user's conversation to a third party under that provider's data terms. Require consent (a clear Free-tier notice) or drop that step. Every fallback needs a cost ceiling no higher than the original budget.
- **Fail over safely mid-task.** Do not fail over after a side-effecting tool has run unless the tool is idempotent. Re-send the normalized conversation, not provider-specific state.
- **Classification stays cheap:** rules first (tool list, keywords, context size). Use a model classifier only if measurements justify its cost.
- **Who pays for a marketplace agent?** The **deployer** (the buyer or owner), under the deployer's plan, key, and budgets. A creator's BYOK key or budget is never attached to a copy of their agent, and forks strip all key references.
- **Client input is a hint.** `provider`, `model`, `tier`, `maxCost`, and `privacyMode` in a request body are validated against server-side entitlements and cannot widen them.
- **Margin floor at reserve time:** reject or reprice a route whose estimated AURA price falls below provider cost plus the configured minimum margin. Provider prices live in a versioned price table with effective dates, never in code, and include infrastructure cost for local models.
- **Free tier cost cap:** a hard global daily budget in addition to per-user caps, with graceful degradation (queue, shorter context, upsell) rather than errors.

### 20.5 Provider claims to verify (do not assume)

- **Muse pricing and modes.** The notes cite specific per-token prices and a cheaper **Contributor** mode versus Standard. \[VERIFY\] the current prices **and what Contributor mode means for data**. A discounted mode named after contributing may involve data-use terms (for example prompts or outputs used to improve models). If so, routing paying users' private conversations or marketplace content through it needs informed consent, or it should be limited to non-sensitive workloads. Pricing changes often; the price table must be updatable without a deploy.
- **OpenRouter Auto Router and free routers.** \[VERIFY\] cost-tier behavior, how the selected model is reported back, and the data policies and rate limits of free and routed models. Auto-routing makes capability, cost, and data handling less predictable, so use it only where the policy table allows it and a hard cost ceiling is set. Always record which model actually served the request.
- **Model IDs, context limits, and tool-call support** for every route. Run the conformance suite (Part 6.3) per model, not per provider.
- **Provider terms on proxying or reselling** access for paid tiers (Part 7.4).

### 20.6 PayBox: wallets, payments, and trading approvals

**Due diligence first (Claude Code and you).** I cannot verify PayBox, its API, or its claims. Before any code:

- &#91;VERIFY\] from official docs: what it is, whether it is custodial or not, supported chains and merchants, how scoped agent clients and grants work, the approval and step-up flow, webhook signing, sandbox availability, pricing, uptime and incident history, and who is liable for a mistaken or malicious transaction.
- &#91;HUMAN\] Treat it as a security-critical third party: read its terms, ask about audits and key handling, and decide whether you are comfortable depending on it. Keep it behind an interface so it can be replaced.
- Paid or fee-bearing services need your approval (Part 1, rule 6).

**Architecture (keep from your spec):** browser, then Agent Gateway, then a PayBox service client, then PayBox approvals and scoped credentials, then the wallet, card, exchange, or merchant. The gateway stores only client IDs, grant IDs, and non-sensitive references. Never store seed phrases, private keys, card numbers, or raw PayBox credentials, and agents never see them.

**Corrections:**

- **Agents must not execute money movement.** Your tool list includes `execute_approved_trade` and `execute_approved_payment`. Replace them: an agent calls `request_trade_approval` or `request_payment_approval`; the **approval decision** by the user triggers execution server-side (or inside PayBox); the agent receives only a status and reference. The agent never holds a capability that moves funds.
- **`update_agent_spending_policy` is never agent-callable.** An agent that can raise its own limits defeats every limit. Policy changes happen only through an authenticated owner action with step-up verification.
- **Defaults are conservative.** Your env example sets autonomous limits of 10 and 25 USD. Default them to **0**: every operation needs approval until the owner deliberately creates a scoped policy, with expiry, per-operation and per-day caps, counterparty or contract allowlists, and instant revocation.
- **Read-only before write.** Ship `get_paybox_connection_status`, `get_wallet_balances`, `get_token_price`, and `get_trade_quote` first (rate-limited, cached briefly). Payments come next. Trading comes last, if at all.
- **Webhooks:** verify the signature on the raw body, enforce a timestamp window, reject replays with stored event IDs, make handlers idempotent, accept only from the configured endpoint, and never use cookies or session auth on that route. Reconcile with PayBox by polling for missed events.
- **Orders and the ledger:** a PayBox payment reference attaches to a Shaddai order and ledger transaction (Part 11). A payment confirmation moves the order forward only after reconciliation; an agent's claim that it paid is never evidence.
- **Step-up** (passkey or biometric) is required for approvals above a threshold, enforced by PayBox or the identity layer, not by the browser UI alone.
- **Trading and advice risk.** "Trade 50 AURA worth of ETH for the best available gaming token" asks an agent to pick speculative assets. \[HUMAN\] get legal review of agent-assisted trading, recommendations, custody questions, and regional rules before launch. Until then: no personalized investment recommendations, mandatory risk and fee disclosure, restricted regions and age gating, and no autonomous trading.
- **Sandbox only** in the Forge and in tests. A mock PayBox covers denied, expired, over-limit, revoked, duplicate-webhook, and out-of-order-webhook cases.

### 20.7 BYOK additions

Part 7.2 and 7.3 are the baseline (write-only keys, envelope encryption, SSRF controls). From your spec, **keep** the policy fields: nickname, provider, last four, allowed models, spend limit, expiry, status, per-agent assignment, rotate, revoke, and masked display. **Clarify:**

- **Shaddai enforces** the spend limit and expiry it records; it cannot force the provider to. Tell users to also set a limit at the provider and use a restricted key.
- **OpenRouter's own BYOK feature** (storing upstream provider keys inside OpenRouter) is separate from storing a user's OpenRouter key in Shaddai's vault. Do not conflate them in the UI.
- **Key use is scoped to the owner and the owner's agents.** A purchased or forked agent runs with the deployer's key or billing, never with the creator's.
- **Usage attribution:** BYOK calls log tokens and latency but charge no AURA, still pass tool permissions, rate limits, and audit, and never leak the key into prompts, logs, or errors.
- **Paid fallback from BYOK** only if the owner opted in and the cost ceiling is shown.
- **Key tests:** a leak scan over logs and error output, a rotation without downtime test, and a revoked-key test that stops all in-flight calls.

### 20.8 The Forge: spec adjustments

Part 8 defines the AgentSpec and Forge flow. Your UI plan (routes `/forge/create`, `/agents`, `/marketplace`, `/templates`, `/models`, `/billing`, `/approvals`, `/analytics`, `/settings`, the 8-step wizard, and the component tree) is a good starting point for FORGE\_UI\_PLAN.md. Apply these changes:

- **Honest sandbox.** Permission, budget, schema, loop-limit, and kill-switch checks are **deterministic**: run them against a mock adapter and require a pass. Behavioral checks (introduces itself correctly, refuses unauthorized requests, does not leak its prompt) depend on model output and are **statistical**: run each several times, report the pass rate, and treat them as signals, not guarantees. Passing the sandbox never replaces moderation. And **system prompts are not secrets**: do not put keys, private data, or business secrets in them, since no test can guarantee they will not be extracted.
- **Versioning from day one.** Every publish creates an immutable version. Tool, model, and prompt changes require republish. Buyers pin a version and can roll back. Marketplace listings point to versions.
- **What a listing sells.** A spec plus assets and license, not live access to the creator's infrastructure. Deployment runs under the deployer's account. Forks copy only the public spec and strip private prompts, keys, wallets, memory, and user data.
- **Disclosure panel on every listing:** tools and permission classes, model requirements, data handling, spending limits, version, and creator. Dangerous capabilities need moderation approval before listing.
- **Royalty and fee model: fix the arithmetic.** The notes give a 10% platform fee and a 70% creator royalty, which accounts for 80%. Define **all** parties explicitly (seller, original creator on forks, platform, optional referrer) with percentages that sum to 100% per transaction type, store the split on the order, and test the invariant in the ledger.
- **Anti-farming:** creators earn from verified, distinct, paying users. Block self-purchases, linked accounts, and circular agent-to-agent payments, and restrict reviews to verified users of that version.
- **Schema fixes to your tables:** do not keep a mutable `users.aura_balance`; derive balances from the ledger (Part 11). Store `args_hash` on approvals. Add `agent_versions`, `idempotency_key` on purchases and usage rows, ledger references on `forge_purchases`, and soft deletes with audit retention.
- **Endpoint authorization:** every `:id` route checks ownership or an explicit grant. Add automated IDOR tests for agents, sessions, keys, approvals, streams, and listings. Approvals are created server-side by the gateway; the browser only decides them.
- **Not in the browser:** `POST /api/paybox/approvals` should not be callable by the client to create approvals. Webhooks use the verified route in 20.6.
- **Forge 3D zone:** a showcase area and build stations are lightweight scenes. The avatar preview uses an isolated small canvas, and the same agent-rendering caps apply (Part 19.7).

### 20.9 Plans, revenue, and margin

**Plan table (data):** each plan lists model routes, tool allowlist, agent count, AURA quota, memory limits, marketplace rights, and overage rules. Your price points ($5, $20, $50, enterprise contracts) are proposals to test against measured costs, not facts. Before launch, Claude Code builds a unit-economics model from the versioned price table, infrastructure cost for local models, payment fees, refunds, and abuse rates, and reports where each plan is profitable.

**Hard requirements:**

- &#91;HUMAN\] Card or fiat payments mean a paid payment processor, sales tax and VAT handling, refund and cancellation terms, and consumer-protection rules. **Fiat top-ups of AURA create stored value**, which can bring money-transmission or e-money rules depending on how AURA is defined (Part 19.4). Get legal review before enabling `POST /api/aura/topup` for real money. The first release is Free plus BYOK.
- Never silently charge for a premium model. Show the estimate and require approval above the user's threshold (already in your spec; keep it).
- Downgrades, cancellations, and overage are explicit flows with receipts.

**Revenue ledger (keep your field list), plus:** the price-table version used, the route policy version, trace ID, idempotency key, the actual serving model (especially for routed models), refund and chargeback status, and the split recorded for each commerce event. Admin dashboards: revenue, cost, margin by plan, model, and agent; top spenders; loss-making routes; abuse alerts; and flags for agents that repeatedly choose expensive models for trivial tasks.

### 20.10 UI copy for the three model modes

Your copy is good. Make these small honesty edits:

- **Ours Free:** add "Conversations are processed on our infrastructure to run your agent." If any fallback leaves our infrastructure, say so here.
- **Bring Your Own Key:** keep "Your key is encrypted, never shown again, and never shared with other users", and add "Your provider's data policy applies to these requests. Set a spending limit at your provider too."
- **Paid AURA Models:** keep "You will see the estimated AURA cost before each paid request" and add "Some routes use third-party providers; see the data notice for each model."
- On every model, show provider, the data-handling note, and whether it is free, BYOK, or billed.

### 20.11 Prompts for Claude Code

**A. Provider expansion (after Part 19.9 A and B are done):**

```text
TASK: Add Muse and OpenRouter as configurations of ONE OpenAI-compatible adapter.
1. [VERIFY] each provider's current docs (endpoint, auth, streaming and tool-call format, usage
   reporting, model IDs, pricing, data terms including any cheaper discounted mode). Write
   /docs/agents/providers/muse.md and openrouter.md with source links. Mark BLOCKED if access is unconfirmed.
2. Implement streaming tool-call accumulation (20.3), the tool loop, per-format tool schemas, and
   tolerant SSE parsing, once, in the shared adapter. Delete any copy-pasted provider loops.
3. Model aliases come from verified config. Clients cannot send provider or model strings
   outside their entitlements.
4. Conformance tests per model: fragmented tool args, multiple tool calls, malformed args,
   unknown tool, abort mid-stream, usage settlement.
Stop and report.
```

**B. Router and policy table:**

```text
TASK: Build the cost-aware ModelRouter as DATA-DRIVEN policy (20.4).
Policy table per plan and task class; privacy-mode hard filter; fallback rules with cost and data
ceilings; side-effect-safe failover; reserve and settle through the AURA wrapper; versioned price
table; margin floor at reserve time; admin edit with audit and feature flags.
Tests: client cannot widen entitlements; fallback never raises cost or leaves the data boundary
without consent; no failover after a non-idempotent write; free-tier global budget degrades
gracefully; loss-making route flagged; marketplace agent bills the deployer.
```

**C. PayBox integration (verify first, read-only first):**

```text
TASK: PayBox integration behind an interface.
1. Ask me to confirm I have reviewed PayBox's terms and approve it as a dependency.
2. [VERIFY] docs; write /docs/agents/providers/paybox.md. Mark BLOCKED if anything is unclear.
3. Implement a PaymentAuthorizer interface with a MockPayBox, then the real client.
4. Ship read-only tools first, then payment approval flow, trading last and only after I approve.
5. No agent-callable execute or policy-update tools. Webhook handler per 20.6 with replay tests.
6. Defaults: autonomous limits 0, approval always required.
Tests: denied, expired, over-limit, revoked, duplicate and out-of-order webhooks, agent attempting
to raise its own limit, reconciliation with the ledger.
```

**D. Forge UI and plan:**

```text
TASK: Produce FORGE_UI_PLAN.md from master doc Part 8 and 20.8, using my route map and
component tree as input. Include the corrected schema, endpoint authorization matrix, sandbox
checks split into deterministic and statistical, versioning, listing disclosure panel, and royalty
splits that sum to 100%. Do not implement until I approve.
```

**E. Paid-user vertical slice, acceptance with negative tests:** free user chats on Ollama; upgrades to Starter (sandbox payments only); connects PayBox sandbox; builds a Merchant agent in the Forge; the agent creates a listing through the dispatcher; a buyer finds it; the buyer approves checkout with step-up; the ledger records the order and the split; the creator receives the royalty; the AURA dashboard shows cost, revenue, and margin. **Negative tests:** a user cannot call a premium route they are not entitled to by editing the request; a forked agent has no keys and bills the deployer; an agent cannot raise its own limits; a replayed webhook changes nothing; a self-purchase earns no royalty; a prompt-injected listing description changes nothing; the benchmark shows no frame-time regression with the Forge zone loaded.

### 20.12 Environment additions and launch order

```text
# Provider config lives in the database or a config file with verified aliases; env holds secrets only.
META_MODEL_API_KEY=
OPENROUTER_API_KEY=
OPENROUTER_MAX_COST_TIER=            # also enforced server-side in policy
PUBLIC_APP_URL=

# PayBox (only after due diligence)
PAYBOX_API_URL=                      # verify
PAYBOX_CLIENT_ID=
PAYBOX_CLIENT_SECRET=
PAYBOX_WEBHOOK_SECRET=
PAYBOX_DEFAULT_APPROVAL_MODE=always_approve
PAYBOX_MAX_AUTONOMOUS_TRADE_USD=0
PAYBOX_MAX_AUTONOMOUS_PAYMENT_USD=0
PAYBOX_ALLOWED_CHAINS=               # empty means none until you choose
PAYBOX_ALLOWED_MERCHANTS=
```

**Launch sequence (merged with your list):** Forge wizard with Ollama-only mode, AURA free quota and usage dashboard, BYOK vault and key manager, Muse and OpenRouter via the shared adapter, router and policy table, sandbox and publish flow, ledger, marketplace with versioned listings and correct royalty splits, PayBox read-only then payments, paid plans only after legal and payment-provider approval, then versioning hardening, memory controls, abuse prevention, and admin tooling. The first end-to-end Forge agent (create, test, publish, deploy, earn) is the gate for opening the marketplace.
