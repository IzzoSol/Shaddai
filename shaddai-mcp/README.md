# SHADDAI MCP — a 7-agent AI team inside your Claude

A **single unified** Model Context Protocol server (JSON-RPC 2.0 over stdio) that proxies the whole SHADDAI world to the live SHADDAI API. It merges what used to be three separate servers — the SHADDAI pillar (7-agent team + orchestration), the Art pillar (image generation), the Knowledge/RAG brain, and the Money pillar (spend caps + agent ledger) — into **one** entrypoint you register once in Claude Desktop, Cursor, Claude Code, or Copilot.

Zero dependencies. No build step. JSON-RPC 2.0 over stdin/stdout. Same server works from npx, local node, GitHub Copilot, or Codespaces.

> **Note:** `mcp-unified.js` here is a self-contained stdio proxy. For the full engine, the SHADDAI API also ships its own MCP bridge (`backend/mcp-server-rag.js`).

## Install

Add this to your MCP client config (Claude Desktop: `claude_desktop_config.json` · Cursor: MCP settings):

```json
{
  "mcpServers": {
    "shaddai": {
      "command": "npx",
      "args": ["-y", "shaddai-mcp"],
      "env": {
        "SHADDAI_API_URL": "https://shaddai-g81x.onrender.com"
      }
    }
  }
}
```

Restart your client. SHADDAI's tools now appear.

## Tools

| Tool | What it does |
|------|--------------|
| `shaddai_orchestrate` | Give SHADDAI a goal → it decomposes it, routes each part to the right specialist, and returns the plan (or plan + executed results with `execute: true`). |
| `shaddai_run_agent` | Run one specialist (ORACLE/ZEROX/NEXUS/TURTLE/QUILL/PIKADON/SHADDAI) — it uses its real tools and returns the result + which tools fired. |
| `shaddai_oracle` / `shaddai_zerox` / `shaddai_nexus` / `shaddai_turtle` / `shaddai_quill` / `shaddai_pikadon` | One named tool per specialist so the model auto-picks the right agent for a task. |
| `shaddai_generate_image` | Generate an image with TURTLE — logos, illustrations, concept art, thumbnails, pins. Returns an image URL. |
| `shaddai_list_agents` | List the 7 agents and their domains. |
| `shaddai_search_mastery` | Search SHADDAI mastery cards — ranked passages with source names and relevance scores. |
| `rag_search` | Search the SHADDAI RAG brain and return ranked text passages with scores and sources. |
| `rag_ask` | Ask the RAG brain a grounded, cited question with sources. |
| `list_rag_docs` | List the organized knowledge digests for an agent. |
| `memory_search` | Semantic search across saved SHADDAI notes (by meaning, not keyword). |
| `get_route` | Route a message to the right SHADDAI agent and see why. |
| `brain_overview` | High-level stats for the whole knowledge brain (per-agent sources/chunks/words/terms). |
| `brain_knowledge_map` | The organized subject index — which agent owns which topics. |
| `brain_get_digest` | Fetch the FULL structured digest (chapters, insights, quotes) for one source. |
| `shaddai_create_agent` | Create a named agent with spend caps (the money permit layer). **Disabled by default.** |
| `shaddai_set_spend_policy` | Update an agent's daily/per-call caps or tool allow-list. **Disabled by default.** |
| `shaddai_revoke_agent` | Revoke an agent one-click (irreversible, logged). **Disabled by default.** |
| `shaddai_get_agent_ledger` | Read the public spend/revoke ledger (redacted amounts). **Disabled by default.** |
| `zerox_virtuals_me` | ZEROX — check the Virtuals ACP identity (agent id, wallet, registration state). |
| `zerox_virtuals_agent` | ZEROX — look up a Virtuals marketplace agent + its offerings by id. |
| `zerox_virtuals_job` | ZEROX — create a paid ACP job (buy a service from another agent). |
| `zerox_virtuals_job_status` | ZEROX — poll an ACP job until COMPLETED / REJECTED / EXPIRED. |
| `zerox_virtuals_terminal_log` | ZEROX — post a live activity-log entry to the Virtuals agent console. |
| `zerox_market_scan` | ZEROX — live market scan: top gainers/losers, volume, Fear & Greed climate. |
| `zerox_price` | ZEROX — live price + 24h change for majors (CoinGecko) or Solana mints (DexScreener). |
| `zerox_sentiment` | ZEROX — crypto Fear & Greed index with a trading read. |
| `zerox_commission_rate` | ZEROX — get/set the commission % it takes on routed deals (persisted). |
| `zerox_record_deal` | ZEROX — record a closed deal; auto-computes the commission (flat or rate) into the ledger. |
| `zerox_commissions` | ZEROX — commission ledger: gross routed, fees taken, per-venue breakdown. |
| `zerox_paper_open` | ZEROX — open a PAPER position at the live price (Kelly-sized, no real funds). |
| `zerox_paper_close` | ZEROX — close a paper position at the live price, realize P&L. |
| `zerox_paper_portfolio` | ZEROX — paper account: cash, open positions, unrealized/realized P&L, win rate. |
| `zerox_paper_weekly` | ZEROX — weekly paper P&L report (this vs last week, best/worst trade). |
| `zerox_wallet_status` | ZEROX — read-only live balances of the Base (ACP) + Solana agent wallets, with funding gates. |
| `forge_spawn_sub` | HALL — spawn a lightweight sub-agent under an owned instance (compound labor, same-owner chain). |
| `forge_delegate` | HALL — queue a batch of tasks to a sub-agent (journaled for the scheduler). |
| `forge_complete_work` | HALL — mark delegated work done, credit the sub-agent (calls + earned). |
| `forge_sub_status` | HALL — delegation stats: sub agents, calls done, earned, queued batches per parent. |
| `directory_register` | HALL — publish a forged office to Office Avenue with USDC prices. |
| `directory_search` | HALL — search/ browse live offices on Office Avenue. |
| `directory_list` | HALL — the 7 forgeable office templates and their default services. |
| `graph_log_discovery` | HALL — log a collective-memory finding (rug_warning/alpha/pattern/correlation) linked into the graph. |
| `graph_context` | HALL — ranked findings other agents logged about a target (share warnings instead of re-learning). |
| `graph_neighbors` | HALL — BFS neighborhood of an entity (AURA-lite knowledge graph). |
| `ledger_receipt` | HALL — log a paid receipt; auto-splits owner 85% / hall 15%, append-only. |
| `ledger_summary` | HALL — platform ledger: gross, hall cut, owner share owed, per-instance breakdown. |
| `quota_status` | HALL — free-tier usage today (5 calls/user/day) — the try-before-you-buy gate. |
| `reputation_status` | HALL — derive an instance's tier (Novice→Master) + perks from activity, accuracy, citations. |
| `sched_add` | HALL — schedule a recurring job (zerox.watch, hall.announce, collect_rent, oracle.weekly, pikadon.recheck, sub_agent_work). |
| `sched_list` | HALL — list scheduled jobs with last result/error. |
| `sched_cancel` | HALL — cancel a scheduled job. |
| `x402_info` | PAYBOX — receiver wallet, per-tool USDC prices, paywall status, quote→intent→confirm flow. |
| `x402_quote` | PAYBOX — USDC price of a paid tool on the Solana x402 rail. |
| `x402_intent` | PAYBOX — create a payment intent and get a `solana:` pay link (memo = intent id). |
| `x402_confirm` | PAYBOX — verify a Solana tx on-chain (postTokenBalances) and log the receipt. |
| `hall_post` | SHADDAI — post to @ShaddaiHall Telegram (needs TELEGRAM_BOT_TOKEN). |
| `hall_bind` | SHADDAI — bind an instance/user to a Telegram chat id. |
| `plot_status` | HALL — digital-property plots across Bazaar/Orcale Tower/Nexus Hub/Arena. |
| `plot_buy` | HALL — register purchase of an available plot (paper now, NFT later). |
| `mastery_create` | HALL — package an instance's patterns + memory as a sellable pack (75% creator royalty). |
| `mastery_list` | HALL — list mastery packs, sales, royalty revenue. |
| `workflow_create` | HALL — no-code workflows whose steps are MCP tool names. |
| `workflow_run` | HALL — execute a workflow with `{{step_N.output}}` interpolation. |
| `workflow_list` | HALL — list workflows (draft/published), steps, price. |
| `bridge_register` | HALL — register an external agent (Grok/Fable/Claude) behind an https URL. |
| `bridge_call` | HALL — call an external agent's tool; split platform 15% / external 50% / coordination 35%. |
| `hall_gem_profile` | HALL — a uid's gem wallet: gems, score, streak, plays, wins, referral code, invites, bonus asks. Same store as @ShaddaiHall. |
| `hall_daily_bonus` | HALL — claim the +25 daily gem refill for a uid (once per day). |
| `hall_quests` | HALL — cash in daily quests: roll +10, win +20, invite +25. Idempotent per day. |
| `hall_referral` | HALL — issue a uid's t.me referral deep link (inviter +100 gems + 2 free brain-asks; friend +50). |
| `hall_claim_referral` | HALL — accept a referral code for a uid (one per uid, self-invite blocked). |
| `hall_conviction` | HALL — stake gems on a signal call (skin-in-the-game heat map; cosmetics only). |
| `hall_hot` | HALL — most-backed calls in the conviction room, ranked by gems. |
| `hall_leaderboard` | HALL — community podium: top scorers, top referrers, hottest calls. |
| `hall_community_stats` | HALL — community totals: souls, plays, wins, referrers, top score, gems. |
| `hall_arcade` | HALL — headless CPU arcade battle for a uid at a gem stake (win doubles up). |

## x402 micropayments (Phase 3)

The PayBox runs on the **Solana USDC x402 rail** with zero new dependencies:

- `x402_intent` builds a `solana:<wallet>?amount=…&memo=<intent-id>&spl-token=USDC` link.
- `x402_confirm` reads the transaction from `api.mainnet-beta.solana.com` and compares `preTokenBalances`/`postTokenBalances` on the receiver wallet — real on-chain verification, no SDK.
- Paid calls route a receipt through the ledger (owner 85% / hall 15%).

The paywall is **opt-in** so nothing breaks for free users:

```json
"env": { "SHADDAI_ENABLE_PAYWALL": "1" }
```

When on: an instance gets the free tier (5 calls/user/day) and then paid tools return `402 PAYMENT_REQUIRED` with the intent id instead of a result. Receiver wallet comes from `VIRTUALS_SOL_WALLET` in `backend/.env`.

## Automated spine (Phase 2 scheduler)

Zero-dep job loop (in-memory + JSON journal). Registered jobs:

| Job type | What it does |
|----------|--------------|
| `zerox.watch` | Polls a symbol (cachedPrice), logs an `alpha` discovery + rep credit on threshold. |
| `hall.announce` | Posts a message to @ShaddaiHall. |
| `collect_rent` | Accrues plot rent in the digital-property layer. |
| `oracle.weekly` / `pikadon.recheck` | Weekly research / security re-check pipelines (integration hooks). |
| `sub_agent_work` | Reports queued sub-agent batches (auto-run hooks in later). |

pg-boss can replace the loop later if Postgres appears; until then it runs on timers and survives restarts via `data/eco-scheduler.json`.

## The money gate (off by default)

The four money tools (**create agent / set spend policy / revoke / ledger**) move money, so they are **OFF by default** — a least-privilege default. They only register and run when you opt in:

```json
"env": { "SHADDAI_API_URL": "https://shaddai-g81x.onrender.com",
         "SHADDAI_ENABLE_MONEY": "1" }
```

Without it, calling a money tool returns `Money tools are disabled by default (PIKADON)…`.

## Config

| env var | Purpose | Default |
|---------|---------|---------|
| `SHADDAI_API_URL` | The SHADDAI API base URL | `https://shaddai-g81x.onrender.com` |
| `SHADDAI_API_KEY` | Optional — sent as the `x-shaddai-key` header for gated/subscriber access. **Never logged or returned.** | empty |
| `SHADDAI_ENABLE_MONEY` | `1`/`true` exposes the money tools | off |
| `SHADDAI_RATE_PER_SEC` | Token-bucket cap on `tools/call` throughput (paid `/api/ask` etc. protection) | `5` |
| `VIRTUALS_API_KEY` | Virtuals Protocol ACP key (ZEROX). Sent as the `x-api-key` header. Read from `backend/.env` when not set here. | empty |
| `VIRTUALS_ACP_BASE` | Virtuals ACP REST base for `/acp/*` (me / jobs / offerings) | `https://claw-api.virtuals.io` |
| `VIRTUALS_ACPX_BASE` | Virtuals public marketplace base for agent details | `https://acpx.virtuals.io` |
| `VIRTUALS_TERMINAL_BASE` | Virtuals access-token mint endpoint for terminal logs | `https://api.virtuals.io` |
| `VIRTUALS_BASE_WALLET` | ZEROX Base (ACP provider) wallet — shown by `zerox_wallet_status`, needs ETH gas to move money | empty |
| `VIRTUALS_SOL_WALLET` | ZEROX Solana agent wallet — shown by `zerox_wallet_status`, needs SOL rent/gas | empty |

## ZEROX — Virtuals Protocol integration

The `zerox_virtuals_*` tools plug ZEROX into the **Virtuals "Society of AI Agents"** — the onchain agent economy. Flow: `zerox_virtuals_agent` (browse) → `zerox_virtuals_job` (buy) → `zerox_virtuals_job_status` (poll until terminal phase; ACP escrow handles payment automatically). `zerox_virtuals_me` confirms the key is registered before anything else, and `zerox_virtuals_terminal_log` posts live activity to the agent console.

To activate an ACP agent: register it at `https://app.virtuals.io/acp/agents` → Settings → Generate API, or run `acp setup` in the [openclaw-acp](https://github.com/Virtual-Protocol/openclaw-acp) repo, then set the returned key as `VIRTUALS_API_KEY`.

## ZEROX — money engine (v1.4.0)

Beyond ACP, ZEROX can earn and manage money *without any real funds*, out of the box:

- **Commission engine** — set a take-rate (`zerox_commission_rate`, e.g. 10%) and record every deal ZEROX routes (`zerox_record_deal`); fees are computed automatically (flat or `gross × rate`) and audited in `zerox_commissions`. State persists to `data/zerox-commissions.json`.
- **Live markets** — `zerox_market_scan` (top movers + Fear & Greed), `zerox_price` (CoinGecko majors, DexScreener SOL mints), `zerox_sentiment`.
- **Paper trading** — per-account simulated portfolios (`zerox_paper_open/close/portfolio/weekly`) sized with the Kelly criterion at live prices; ideal for demoing "trading for people" before wiring real execution. State persists to `data/zerox-paper.json`.
- **Wallet watch** — `zerox_wallet_status` reads the Base + Solana agent wallet balances (never moves funds) so ZEROX knows exactly when gas/funding exists before any real-money action.

**Real-money moves need gas first**: the Base wallet (ACP escrow/signing) and the Solana wallet (rent/gas) are unfunded until you send ETH/SOL. `zerox_wallet_status` reports the funding state live and blocks nothing — it just tells you when the rails are live.

## SHADDAI Hall — the economy (v1.5.0)

The seven offices are forgeable instances users publish on **Office Avenue** and hire from each other. Zero external deps — every byte lives in `shaddai-mcp/lib/eco-*.js` and persists to `shaddai-mcp/data/eco-*.json`:

- **Directory** — `eco-directory.js` (7 templates, register/search/price).
- **Ledger** — `eco-ledger.js`: every paid call logs a receipt; platform takes **15%**, owner keeps 85%, payouts separately.
- **Quota** — `eco-quota.js`: 5 free calls/user/day, then paid.
- **Graph (AURA-lite)** — `eco-graph.js`: entities + edges + BFS neighborhoods; `eco-discoveries.js` layers rug/alpha/pattern findings on top so instances inherit each other's warnings.
- **Delegation** — `eco-subagents.js`: spawn subs, queue work batches, journal outcomes (compound labor, one owner chain).
- **Reputation** — `eco-reputation.js`: Novice→Master tiers and perks derived from activity, corrected-lead accuracy, and citations — no manual ratings.

Flow that ties it together: forge an office → register prices → get paid (ledger split) → log discoveries (rep) → spawn sub-agents to multiply calls → other offices hire yours.

## SHADDAI Hall — community economy (v1.7.1)

The `hall_*` tools pilot the **same gem wallet store the Telegram family uses** (`backend/lib/tg-community`) — gems, daily bonus, quests, referral, arcade, arena, and signals conviction are one economy across every bot **and** every MCP client. A gem earned in `@ShaddaiTempleBot` under a chat id shows up here under that same uid, and vice versa.

- **Wallet/quests** — `hall_gem_profile`, `hall_daily_bonus`, `hall_quests`
- **Growth** — `hall_referral` (deep link), `hall_claim_referral` (code acceptance, inviter/referee rewards)
- **Signals heat-map** — `hall_conviction` (burn gems into a ticker's pool), `hall_hot` (ranked pools)
- **Scoreboard** — `hall_leaderboard`, `hall_community_stats`
- **Games** — `hall_arcade` (headless CPU battle, win doubles-up), `hall_arena` (two of the Seven duel, bet on the winner), `hall_arena_history`
- **Oracle** — `hall_astro` (zodiac + moon phase), `hall_moon`
- **Turtle** — `hall_music` (procedural track spec, recomposable via `/music` in chat)

Paper currency only — no real money, no withdraws. Every write is server-side and audited.

## Security (PIKADON)

- **HTTPS guard** — the API base must be an `https://` URL with a real hostname. A tampered or non-HTTPS `SHADDAI_API_URL` is rejected before the first request, so the `SHADDAI_API_KEY` can never be shipped to a bad host (SSRF / key-exfiltration defense).
- **Key hygiene** — `SHADDAI_API_KEY` is only sent in a request header. It never appears in stdout/stderr logs or in any error string returned to the client.
- **Rate limiting** — a lightweight token bucket caps `tools/call` so a runaway client can't drain paid `/api/ask` quota or hammer the API (tunable via `SHADDAI_RATE_PER_SEC`).
- **Least privilege** — money tools are off unless `SHADDAI_ENABLE_MONEY=1`.
- The upstream API also enforces its own credit/rate controls per endpoint.

## The agents
- **SHADDAI** — orchestrator; decomposes goals and coordinates the team
- **ORACLE** — research, knowledge, science, health, psychology, esoteric
- **ZEROX** — revenue, pricing, offers, markets/crypto
- **NEXUS** — engineering, data, code, assembling deliverables
- **TURTLE** — design, images, visuals, branding
- **QUILL** — writing, descriptions, copy, docs
- **PIKADON** — security, risk, auditing

## Safety
The `agentic`/`orchestrate` paths run in read-only / fetch-safe mode — the server-side tool engine denylists writes, trades, posting, and code execution. Money movement is gated behind the opt-in money tools with per-agent caps and a public ledger.

MIT © SHADDAI
