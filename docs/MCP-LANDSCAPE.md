# Which "SHADDAI MCP" is which (2026-11-06)

There are several different things people call "the MCP". They are NOT the same.

| Name | Where | What it is | Status |
|---|---|---|---|
| `shaddai-mcp` **2.3.0** (npm) | npm + `IzzoSol/shaddai-mcp` (older release) | 7 agents + RAG knowledge bases + NVIDIA skills catalog. Returns persona + retrieved passages for the host model to finish. **No workflows, no tool execution.** | This is what Claude Code is connected to as `mcp__shaddai__*` (5 tools). It is the OLD one. |
| `shaddai-mcp-unified` **3.3.0** | private repo `IzzoSol/shaddai-mcp` (`mcp-unified.js`, zero dependencies) | The big one: ~100 tools (workflows `workflow_list/run/create`, Forge `forge_*`, `shaddai_*` agent control, plots, ZEROX paper trading, x402, scheduler, Hall arcade, AURA, graph/brain, redact/detect secrets), a 3,022-skill catalog and **1,633 workflows** (`data/eco-workflows.json`; 1,536 self-contained, 97 declare a requirement). | **Not published to npm** (E404). Newer than the npm package. Must be run from a clone. |
| Headless gateway `/api/headless/*` | described in that repo's `HEADLESS-GATEWAY.md` | REST twin of the unified MCP for things that cannot speak MCP (Grok bots, n8n, Telegram, cron): `/tools`, `/call`, `/skills`, `/workflows`, `/workflow/run`, `/manifest`, `/openapi.json`. | **Not found in the code I could search** (`Shaddai-3d` backend/public/docs: no `api/headless`). It may live only in the private monolith on Render. Unverified. |
| `shaddai-agents-mcp` | public repo | Proxy to a running backend: `shaddai_list_agents`, `shaddai_ask`, `shaddai_task` (real agentic job), `nvidia_skills`. | Needs a backend at `SHADDAI_URL`; local use. |
| **Outside-bot bridge** `/api/bridge/mcp` | `backend/platform-bridge.js` (this branch) | Remote, authenticated MCP for bots: scoped tokens, runs/receipts/approvals, 73 vetted tools, 107 recipe skills, **154 library workflows imported from the unified MCP's data**, council ask, chat, class join. | Built + tested here. Not deployed. |

## What was done about it
- The unified MCP's workflow library was **imported as data** (`backend/data/library-workflows.json`). Of 1,633 workflows, **154** are made only of tools the bridge can run safely (rag search, council ask, web/price/sentiment, and the allowlisted engine tools). They run inside the bridge's executor with its scopes, limits, approvals and receipts: MCP tool `library_search`, `GET /api/bridge/library`, workflow ids `lib.<name>`, chat commands `/library` and `/wf`.
- Mapping notes: unified `zerox_price` takes `symbols: "BTC,ETH,SOL"` (a list), so it fetches each one; a missing symbol fails clearly instead of guessing. `shaddai_<agent>` / `shaddai_run_agent` / `rag_ask` map to the council ask. Admin-ish `shaddai_*` tools (create/revoke agent, spend policy, media, orchestrate) are never imported.
- `on_fail: continue` from the library is not honored: any failed step stops the run (safer).
- The unified server's own code was **not executed** (the environment blocked running downloaded code). So its `workflow_run`, Forge, plots, paper-trading and x402 tools are untested by me.
- The other 1,479 workflows need tools bots should not have by default (game arena, payments, admin agent control) or tools whose argument shapes are unknown. Mapping more tools grows the 154. Biggest blockers (workflows each blocks): `hall_moon` 20, `graph_log_discovery` 17, `turtle_palette` 16, `turtle_geometry` 13, `hall_arena` 10, `styles_get` 10, `detect_secrets` 7, `web_scrape` 6 (needs an SSRF-safe fetch).

## To use the REAL unified MCP in Claude Code (you run this; I was not allowed to)
```
git clone https://github.com/IzzoSol/shaddai-mcp.git C:\Users\Brittany\mcp-servers\shaddai-unified
claude mcp add shaddai-unified -- node C:\Users\Brittany\mcp-servers\shaddai-unified\mcp-unified.js
```
Restart Claude Code afterwards. (A clone already exists at `%TEMP%\shaddai-mcp-unified`.) Publishing 3.3.0 to npm would make `claude mcp add shaddai -- npx -y shaddai-mcp-unified` work for everyone.

## Grok Bot's answers (2026-11-06) and what they changed
| Question | Answer | Effect |
|---|---|---|
| Bot auth | Custom `Authorization: Bearer <token>` headers ARE supported. OAuth is optional (pre-registered CLIENT_ID, optional CLIENT_SECRET, scopes). Exact OAuth discovery flow unverified. | The pasted-token bridge works as built. **OAuth is not needed now.** |
| Transport | Streamable HTTP vs SSE, GET-stream behaviour, JSON-only compatibility and `Mcp-Session-Id` handling: unverified. | Bridge made tolerant: plain JSON by default, SSE framing if a client accepts only event streams, `Mcp-Session-Id` on initialize, `DELETE /mcp` OK, `GET /mcp` 405. Tested incl. the official SDK. Real Grok behaviour still unproven. |
| Callbacks | No verified signed completion/approval webhook. | Polling stays the design (`get_run_status` about every 2 s). |
| Unified tool schemas | `mcp-unified.js` source was not available to Grok. | The ~100 blocked library workflows stay blocked until someone with the source (you) reads their schemas. |
| `/api/headless/*` | `https://shaddai-g81x.onrender.com/` answers (app-level JSON 404) for `/api/headless/health` and `/workflows`. | That host is **running** (my earlier "looks suspended" was wrong or outdated) but does **not** serve the headless gateway. Which service is production is still unverified. |
| Sparks | economy-service = integer Sparks (BIGINT), closed loop, no fiat redemption. No verified "100 units = 1 Spark" or "1 Spark = $1". 10,000 welcome Sparks have no verified dollar value. | **Billing stays OFF.** The unit assumption is a placeholder. |
| Skill ids | Registry equivalence unverified. | Lessons now store `registry`, `id`, `version` separately (plus the legacy `skillId` key used for matching). |
| Wallet | Start with a connected Solana address and read-only balances via chain RPC; Hyperliquid reads use `POST https://api.hyperliquid.xyz/info` with `clearinghouseState` / `spotClearinghouseState` and a public address; PayBox app API/auth unverified. | Built: `/sol <address>` and the 3D office Wallet holo "SOL balance" use the allowlisted read-only `get_sol_balance` (public address only; remembered on this device). Hyperliquid read and PayBox not built. |
