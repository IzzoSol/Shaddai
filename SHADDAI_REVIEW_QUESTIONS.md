# SHADDAI — Questions for Grok / Perplexity / GitHub Copilot

> Goal: figure out the coding we're missing to make the **tools complete**, the **security** right, the **workflows** correct, and decide **N8N vs custom**. Paste the CONTEXT block first into any AI, then the questions for that specific AI.

---

## 📋 CONTEXT — paste this FIRST into any AI

> SHADDAI is an AI-agent marketplace + dashboard. **Frontend:** one ~2.75 MB `public/index.html` (vanilla JS). **Backend:** Node/Express (~45 modules), serves the frontend + API same-origin, deploys on Render (`render.yaml`, `npm start` → `backend/server-production.js`). **LLM layer:** `llm-client.js` with a fallback chain **Ollama → Groq → OpenRouter → Anthropic → OpenAI**, plus `brains.js` (per-agent personas + brain routing) and `agent-engine.js` (multi-iteration task loop with tools). **7-agent council** (SHADDAI/NEXUS/ZEROX/ORACLE/TURTLE/QUILL/PIKADON).
>
> **Verified live state (localhost test):** 133 tools registered (e.g. fetch_price, whale_scan, search_web, run_js, run_python, write_file, mint_collectible). 7/14 API connections live (dexscreener, coingecko, coinlore, files, news, ollama, groq; openrouter now added). Workflow registry works (builtin: research→build, market-analysis, idea→product, full-audit; + custom). Billing: tiers free/pro/elite, credit ledger, `recordUsage` metering, Stripe lazy-loaded, MoonPay Agents (`@moonpay/cli`, non-custodial). Analytics + Suno-lyric generation return real data.
>
> **Known issues:** (CRITICAL) a live API key was hardcoded in the served `index.html`; billing `authenticateUser` trusts an `x-user-id` header without token validation, and `/admin/*` billing routes are unauthenticated. (HIGH) `/api/brains/*` and `/api/moonpay/*` have no auth (kill-switch can be toggled by anyone); user-supplied strings rendered via innerHTML (XSS). `run_js`/`run_python` tools execute code.

---

## 🤖 GitHub Copilot — in-repo CODE work (point it at the files)
1. **Tool registry completeness:** audit `agent-engine.js`'s 133 tools — which are real vs stubs? Generate real implementations for incomplete ones, and standardize every tool to one schema `{name, description, inputSchema, run()}` with timeouts, retries, and structured errors.
2. **Sandbox the dangerous tools:** `run_js` and `run_python` currently execute code — wrap them in a real sandbox (vm2/isolated-vm/worker with resource+network limits, or a container). Show the safest in-repo approach.
3. **Fix the security CRITICALs:** (a) remove ALL provider keys from `public/index.html`; route every browser LLM/API call through the server. (b) Implement Firebase ID-token verification in `billing-routes.js authenticateUser` and reject invalid tokens. (c) Protect `/api/billing/admin/*` behind a server-side secret/role. (d) Add auth middleware to `/api/brains/*` and `/api/moonpay/*`; role-gate the kill-switch. (e) Escape user/agent strings before `innerHTML`.
4. **Meter real usage:** wire `brains.js agentLLM()` / `billing-service recordUsage()` into `agent-engine.js` so every LLM call debits credits.
5. **Tests:** generate a tool-test harness that calls each tool with sample input and asserts shape; add CI that greps for committed secrets (`sk-or-v1-`, `sk-ant-`, `gsk_`, `AIza`).

## 🧠 Grok — architecture & strategy (reasoning)
1. Is a single 2.75 MB HTML + Node monolith the right architecture at this stage, or should the frontend be split/modularized? What breaks first at scale?
2. **Workflow correctness:** for the custom workflow engine (`job-workflow.js` + `agent-engine.runWorkflow`), what must it handle that it probably doesn't — retries, idempotency, partial-failure recovery, step timeouts, concurrency, scheduling, observability? Compare to N8N / Temporal / Inngest.
3. **N8N decision** (see dedicated section below) — give a clear recommendation.
4. **Agentic-money safety:** is non-custodial (keys in the user's local `@moonpay/cli`) + PIKADON kill-switch + paper-trade + per-transaction approval + spend caps a sound model for agent trading AND agentic commerce (MoonCard: shopping/travel/subscriptions)? What's missing?
5. Given the 3-pillar product (agent does work / moves money / lives in a marketplace), what's the single highest-leverage thing to build next?

## 🔎 Perplexity — research with citations
1. **N8N capabilities:** can N8N orchestrate LLM agents + call custom HTTP tools + MCP servers? Self-host vs cloud, license terms, and how it integrates with an existing Node/Express app. Cite docs.
2. **Safe code execution:** current best practice (2026) for safely running untrusted `run_js`/`run_python` from an agent (isolated-vm, gVisor, Firecracker, E2B, etc.) — trade-offs.
3. **Compliance for agentic payments/trading:** money-transmitter rules, KYC, and investment-advice/suitability exposure when an AI agent moves user funds (non-custodial vs custodial). What does MoonPay's agent product cover vs what we must.
4. **AI music/content resale:** Suno / Sora / image-model ToS — can users sell agent-generated music/content, and how to stay licensed.
5. Comparable products (agent marketplaces / agent-tool platforms) — how they implement tools + workflows + monetization.

## ⚙️ The N8N question (ask Grok + Perplexity)
> "I have a custom workflow engine in a Node/Express app that runs multi-step LLM-agent tasks with ~133 custom tools and a 7-agent council. Should I (a) replace it with N8N, (b) run N8N alongside for deterministic integrations while keeping my custom engine for the LLM agent loop, or (c) keep fully custom? Can N8N call my existing `/api` tools via HTTP/webhook nodes and run on the same Render host? Where does N8N add real value vs added infra/complexity, and where would it get in the way of the agent's reasoning loop?"
>
> *(Seed hypothesis to validate: keep the custom engine for agent **cognition**; use N8N for deterministic **plumbing** — scheduled jobs, multi-app integrations, webhooks — exposed to agents as tools. Confirm or refute.)*

## ✅ Already fixed this session (don't re-ask)
- Health checks read wrong env vars (`GROQ_KEY`/`OPENROUTER_KEY` → `*_API_KEY`).
- 7× tools hardcoded uninstalled Ollama model `phi:latest` → `OLLAMA_MODEL || llama3.2:1b`.
- `/api/pikadon/audit` crashed on empty body (`undefined.id`) → guarded.
- OpenRouter added to the API registry + wired as 3rd fallback (key in `backend/.env`).
