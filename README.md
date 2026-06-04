<div align="center">

# ⚡ SHADDAI v80 — Sovereign AI Command

**A local-first, multi-agent AI command center.** Seven specialized agents that autonomously
research, analyze, write, code, watch markets, and build — using 180+ real tools, connecting to
any MCP server, running free on your own machine.

`Local-first (Ollama) · Cloud-optional · Token-efficient · No subscriptions required`

</div>

---

## 📖 Table of Contents
1. [What is SHADDAI?](#-what-is-shaddai)
2. [The 7 Agents](#-the-7-agents)
3. [Key Features](#-key-features)
4. [Architecture](#-architecture)
5. [Token Tracking & Savings (AURA)](#-token-tracking--savings)
6. [The Tool Catalog (180+)](#-the-tool-catalog)
7. [Quick Start](#-quick-start)
8. [Project Structure](#-project-structure)
9. [API Reference](#-api-reference)
10. [Security](#-security)
11. [Status & Roadmap](#-status--roadmap)

---

## 🌌 What is SHADDAI?

SHADDAI is a single-file dashboard (`FINAL-SHADDAI-V80.html`) backed by a Node.js engine and an
optional Python token-saver. You give an agent a goal; it runs an **autonomous tool-use loop** —
the LLM picks tools → tools fetch *real* data → results feed back → it reasons → delivers an
answer (up to 5 iterations).

It is **local-first**: the default brain is **Ollama** (free, on your machine). Cloud models
(Groq, Gemini, Claude, etc.) are optional fallbacks you add with a key — you never *need* them.
The goal is a real, autonomous agent platform that costs **$0 to run**.

**Who it's for:** creators, crypto/Web3 users, solo founders, devs, and tinkerers who want their
own AI team instead of a generic chatbot.

---

## 🤖 The 7 Agents

Each agent has a role, a persona, and a curated tool set. They run individually, in workflow
chains, or as a delegating council led by SHADDAI.

| Agent | Role | What it does |
|---|---|---|
| **🜲 SHADDAI** | Supreme Orchestrator | Coordinates & delegates to specialists, synthesizes results, makes the call |
| **💰 ZEROX** | Wealth & Revenue | Live crypto/forex/markets, whale scan, DeFi TVL, funding rates, position sizing |
| **🔮 ORACLE** | Research & Intelligence | Web/Wikipedia/arXiv/Reddit research, geocoding, sentiment, summarization |
| **⚙️ NEXUS** | Technical Architect | Runs JS/Python, GitHub/npm, code analysis, security scans, diagrams |
| **🎨 TURTLE** | UI/UX & Creative | Image generation, color palettes, QR codes, mermaid diagrams |
| **✍️ QUILL** | Writing & Comms | Tweets, blogs, emails, threads, scripts, translation, grammar |
| **🛡️ PIKADON** | Security & Compliance | Code/password audits, validation, vulnerability scanning |

---

## ✨ Key Features

- **180+ real tools** across crypto, research, dev, web, files, media, geocoding, forex, marketplace, and more — all calling real APIs (keyless/free wherever possible).
- **Provider Gateway** — one engine-agnostic endpoint (`/api/model/chat`). The UI never picks a vendor; it runs Ollama-first with automatic cloud fallback. Swap engines with zero UI changes.
- **AURA token-saver** — a cache-first router that answers from cache/compute/local-LLM *before* spending tokens (see [below](#-token-tracking--savings)).
- **MCP client** — connect agents to any [Model Context Protocol](https://modelcontextprotocol.io) server (filesystem, GitHub, Postgres, Slack…) and use its tools natively.
- **Skill system** — 3,022 skills with semantic TF-IDF search + a Skill Debugger that shows *why* a skill matched.
- **Skill marketplace** — 8 installable skill packs (one per agent) that override an agent's behavior.
- **Collectibles & marketplace** — mint (HMAC-signed receipts), list, and trade collectibles (10% platform fee); post / bid / complete jobs.
- **Guarded machine payments** — agents can pay for premium APIs via `pay.sh` behind a hard spending cap + daily budget + human-approval gate (disabled by default).
- **Token Efficiency dashboard** — Chart.js views for cache hit rate, LLM calls by provider, and cost-vs-saved.
- **Pixel agent office** — agents sit at desks with live work/learn/break/analyze states.
- **BYOK tier gating** — free / builder / pro / alpha API-key permissions.

---

## 🏗️ Architecture

```
┌─────────────────────────── Dashboard (single HTML) ───────────────────────────┐
│  Chat · Agents · Skills · Marketplace · Collectibles · Token Efficiency · Office │
└───────────────────────────────────┬────────────────────────────────────────────┘
                                     │  one engine-agnostic call
                          ┌──────────▼───────────┐
                          │   PROVIDER GATEWAY    │  /api/model/chat · /api/model/health
                          │   (Ollama → cloud)    │
                          └──────────┬───────────┘
        ┌────────────────────────────┼────────────────────────────┐
        │                            │                            │
┌───────▼────────┐         ┌─────────▼──────────┐       ┌─────────▼─────────┐
│  AGENT ENGINE  │         │   AURA (port 8010) │       │   MCP CLIENT      │
│ 7 agents · 180+ │         │ cache-first token  │       │ connect external  │
│ tools · loop   │         │ saver (Flask)      │       │ MCP servers       │
└───────┬────────┘         └────────────────────┘       └───────────────────┘
        │
┌───────▼───────────────────────────────────────────────────────────────────┐
│  llm-tracer (cost/tokens) · cache-analytics · skill-embeddings · event-bus  │
└─────────────────────────────────────────────────────────────────────────────┘
```

- **Backend:** Node.js + Express (`backend/server-production.js`, port **3000**) — 322 routes.
- **Engine:** `backend/agent-engine.js` — agents, tool registry, tool-use loop, gateway.
- **Token saver:** `aura/` — Python Flask service (port **8010**), SQLite semantic cache.
- **LLM:** Ollama (`llama3.2:1b` default) primary; Groq/Gemini/Claude/OpenRouter optional fallbacks.

---

## 📊 Token Tracking & Savings

SHADDAI has **two complementary systems** so you always know what you're using and how much you're saving.

### 1. AURA — the token **saver** (`aura/`, port 8010)
Before any LLM call, AURA's router tries the cheapest path first (cheapest → most expensive):

| Step | Method | Cost |
|---|---|---|
| 1 | **FETCH** — exact cache hit | **0 tokens, instant** |
| 2 | **QUERY** — similar cached answer (cosine similarity ≥ 0.82) | **0 tokens** |
| 3 | **COMPUTE** — math / date / unit-convert / format / count solved locally | **0 tokens** |
| 4 | **LLM** — only now call a model (Ollama free first, cloud fallback) | tokens used |

Every time AURA answers from steps 1–3, that's an LLM call you **didn't pay for**. The dashboard's
AURA panel shows **Tokens Saved**, **Cache Hits**, and **Cost Saved** (the $ you'd have paid had
those calls gone to a paid cloud model). Cache TTLs: market 5 min, search 15 min, agent 1 hr, default 24 hr.

### 2. llm-tracer — the token **tracker** (`backend/llm-tracer.js`)
Every *actual* model call is logged with **real** token counts and cost:
- **Input/output tokens** come from the provider's real numbers — Ollama's `prompt_eval_count` / `eval_count`, Groq's `usage` — not a character estimate. (`exact: true` in a trace means real counts.)
- **Cost** — local providers (Ollama, LM Studio, etc.) are correctly **$0**; cloud models use a per-model rate table.
- Exposed at `GET /api/llm/traces` and visualized in the **Token Efficiency** Chart.js card (cache-hit doughnut, calls-by-provider bar, cost-vs-saved bar).

> **Bottom line:** running local on Ollama, your real cost is **$0**. AURA's "Cost Saved" shows the
> value of every call it served without touching a paid model. The tracker proves the numbers are accurate.

---

## 🧰 The Tool Catalog

180+ tools, every one assigned to ≥1 agent. Highlights by category:

- **Crypto / Finance:** `fetch_price`, `get_fear_greed`, `whale_scan`, `get_defi_tvl`, `get_dominance`, `get_funding_rates`, `calculate_position_size`, `jupiter_quote`, `get_crypto_backup` (CoinPaprika), `get_forex_rate` (Frankfurter), `binance_orderbook`, `get_top_gainers` …
- **Research / Web:** `search_web`, `wikipedia_search`, `get_arxiv_papers`, `get_reddit_posts`, `get_hackernews`, `fetch_url_clean`, `geocode_address` (OpenStreetMap), `get_news_headlines`, `summarize_text` …
- **Dev / Code:** `run_js`, `run_python`, `get_github_repo`, `search_npm`, `analyze_code_complexity`, `validate_json`, `check_security`, `generate_mermaid`, `diff_texts` …
- **Creative / Media:** `generate_image`, `get_color_palette`, `get_qr_code`, `markdown_to_html` …
- **Marketplace / Agentic:** `mint_collectible`, `list_collectible`, `execute_trade`, `bid_on_job`, `complete_job`, `create_skill_pack`, `install_skill_pack`, `run_workflow_chain`, `pay_api_call` (guarded) …
- **Memory / Utility:** `save_memory`, `remember_fact`, `set_agent_room_state`, `translate_text`, `hash_text`, `format_as_table` …
- **MCP tools:** any tool from a connected MCP server appears as `mcp__<server>__<tool>`.

---

## 🚀 Quick Start

### Easiest — one click
Double-click **`START-SHADDAI.bat`**. It starts Ollama + the backend (+ AURA if Python is installed)
and opens the dashboard. `STOP-SHADDAI.bat` shuts it down.

### Manual
```bash
# 1. Prereqs: Node.js 18+, Ollama (https://ollama.com)
ollama pull llama3.2:1b
ollama serve

# 2. Backend (port 3000)
cd backend
npm install
node server-production.js

# 3. (Optional) AURA token-saver (port 8010)
cd ../aura
pip install -r requirements.txt
python aura_server.py

# 4. Open the dashboard
#    → http://localhost:3000   (served)   or open FINAL-SHADDAI-V80.html
```

**Optional — add a free cloud key** for speed/reliability (no local RAM pressure): put a Groq key
(https://console.groq.com/keys) in `backend/.env` as `GROQ_KEY=...`. See `backend/.env.example`.

Full details: **[HOW-TO-RUN.md](HOW-TO-RUN.md)**.

> 💡 **Low-RAM tip (8GB):** keep only one dashboard window open and don't run extra services you
> don't need — the backend + Ollama are enough; AURA is optional.

---

## 📁 Project Structure

```
SHADDAI/
├── FINAL-SHADDAI-V80.html     # The dashboard (single-file UI)
├── public/index.html          # Same dashboard, served by the backend
├── START-SHADDAI.bat          # One-click launcher
├── STOP-SHADDAI.bat           # Stop services
├── HOW-TO-RUN.md              # Step-by-step run guide
├── backend/                   # Node.js engine + REST API
│   ├── server-production.js   #   Express server (port 3000)
│   ├── agent-engine.js        #   7 agents, 180+ tools, tool-loop, gateway
│   ├── api-proxy-routes.js    #   322 API routes
│   ├── mcp-client.js          #   MCP client (stdio + HTTP)
│   ├── pay-guard.js           #   guarded pay.sh payments
│   ├── llm-tracer.js          #   token/cost tracking
│   ├── cache-analytics.js     #   tool-result cache
│   ├── skill-embeddings.js    #   TF-IDF semantic skill search
│   ├── audit-*.js             #   reusable audit scripts
│   └── data/                  #   skills catalog, packs, marketplace, etc.
└── aura/                      # Python token-saver (Flask, port 8010)
    ├── aura_server.py · aura_router.py · aura_cache.py · aura_llm.py …
```

---

## 🔌 API Reference (key endpoints)

| Endpoint | Purpose |
|---|---|
| `POST /api/model/chat` | **Provider Gateway** — engine-agnostic chat |
| `GET /api/model/health` | Which engines/keys are available |
| `POST /api/agent/run` | Run an agent task (async, poll `/api/agent/task/:id`) |
| `GET /api/agent/stats` | Per-agent task stats |
| `GET /api/skills/semantic-search?q=` | Ranked skill search (TF-IDF) |
| `POST /api/skills/run` | Execute a skill (async) |
| `GET /api/llm/traces` | Token/cost trace stats |
| `GET /api/cache/stats` | Cache hit rate |
| `GET/POST /api/collectibles/*` | Mint / list / trade collectibles |
| `POST /api/marketplace/jobs/post` | Post a job (+ bid / accept) |
| `GET/POST /api/mcp/*` | List / connect MCP servers, call tools |
| `POST /api/byok/set` | Store an API key (tier-gated) |
| `*/aura/*` (port 8010) | AURA cache / chat / health / stats |

---

## 🔒 Security — Foundation Hardening

SHADDAI runs on an **audited security base** so it's safe to open to the public. Full write-up: **[`docs/FOUNDATION_HARDENING.md`](docs/FOUNDATION_HARDENING.md)**.

- **Secrets** live only in `backend/.env` (gitignored) + the Render dashboard — never in code or the browser. A **gitleaks CI** blocks any key on push; the backend reports key *presence* as a boolean, never the value.
- **Authentication** — sensitive routes (agent run, skill ops, code-exec, money movement) are Firebase-verified + admin-gated; dev-permissive locally, enforced in production via `REQUIRE_AUTH`/`ADMIN_TOKEN`.
- **Code execution** is routed through a hardened sandbox and gated; `run_python` is off by default.
- **XSS** — user/agent-controlled strings are escaped (`sanitizeText`) before the DOM.
- **Payments** — x402 is non-custodial and disabled until `X402_ENABLED`; MoonPay intents are signed locally; per-call caps + kill-switch on any money movement.
- **Verified continuously** — 90-test suite, an endpoint-integrity auditor (0 broken links), and a tool audit (180+ live tools).

---

## 📈 Status & Roadmap

**Status:** Fully audited — 0 connectivity problems, 180+ tools wired, 46/46 backend files clean,
dashboard handlers + IDs clean. Provider Gateway live and verified.

**Next (optional polish):**
- Retire the legacy per-vendor chat path entirely (route everything through the gateway)
- Server-side session auth for multi-user / hosted deployment
- Per-agent model registry (default model per agent)
- Real on-chain collectible minting (Metaplex) + live Solana Pay subscriptions

---

<div align="center">

*SHADDAI v80 — built local-first, token-efficient, and yours.*

</div>
