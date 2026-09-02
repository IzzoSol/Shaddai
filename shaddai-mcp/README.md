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
