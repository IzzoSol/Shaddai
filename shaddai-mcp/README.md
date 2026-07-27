# SHADDAI MCP — a 7-agent AI team inside your Claude

Plug SHADDAI's council of specialist agents + 556 real tools into **Claude Desktop, Cursor, or Claude Code** via the [Model Context Protocol](https://modelcontextprotocol.io). Your AI gains a team that does real work — research with live data, multi-agent workflows, images, security audits — running on *your* model.

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
| `shaddai_orchestrate` | Give SHADDAI a goal → it decomposes it and routes each part to the right specialist (plan, or plan + execute). |
| `shaddai_run_agent` | Run one specialist (ORACLE/ZEROX/NEXUS/TURTLE/QUILL/PIKADON) — it uses its real tools and returns the result + which tools fired. |
| `shaddai_list_agents` | List the 7 agents and their domains. |

## The agents
- **SHADDAI** — orchestrator; decomposes goals and coordinates the team
- **ORACLE** — research, knowledge, science, health, psychology, esoteric
- **ZEROX** — revenue, pricing, offers, markets/crypto
- **NEXUS** — engineering, data, code, assembling deliverables
- **TURTLE** — design, images, visuals, branding
- **QUILL** — writing, descriptions, copy, docs
- **PIKADON** — security, risk, auditing

## Safety
Read-only / fetch tools only over MCP — no writes, trades, posting, or code execution (server-side denylist). It only does what you ask.

## Config
- `SHADDAI_API_URL` — the SHADDAI API (default: the hosted instance)
- `SHADDAI_API_KEY` — optional; for gated / subscriber access

MIT © SHADDAI
