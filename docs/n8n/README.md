# SHADDAI Orchestra — n8n workflow

An importable n8n workflow that mirrors the "Orchestra Agent" pattern: a chat trigger → an
AI Agent that routes to a **free** model and can call your **SHADDAI council + 141 tools**
as tools. Runs independently of Claude — this is your always-on / Claude-is-down layer.

## Import
1. Self-host n8n free: `docker run -it --rm -p 5678:5678 -v n8n_data:/home/node/.n8n docker.n8n.io/n8nio/n8n` → open http://localhost:5678
2. In n8n: **Workflows → ⋯ → Import from File** → pick `shaddai-orchestra.json`.
3. Open the workflow → **Open chat** to talk to it.

## Wire the free sources (all $0)
- **Groq (primary, free):** create a key at console.groq.com → add a **Groq** credential to the "Groq (free)" node. Fast Llama-3.3-70b / Kimi.
- **Ollama (local, $0, offline):** `ollama pull qwen2.5-coder:32b` (great for coding). To use it *instead* of Groq, drag the "Ollama (local, $0)" node's output onto the agent's **Chat Model** input.
- **SHADDAI tools:** the two HTTP tools call your SHADDAI server. Set their `url`:
  - Local: `http://localhost:3000` (run `node backend/server-production.js`)
  - Deployed: `https://shaddai-g81x.onrender.com`

## What you get
- **SHADDAI Council (tool)** → `POST /api/agents/route` — ask any of the 7 agents; tools run server-side.
- **SHADDAI Skill (tool)** → `POST /api/skills/run` (sync) — run any of the 141 recipe tools (e.g. `daily-market-snapshot`, `hn-tech-pulse`, `file-security-audit`).
- **Window Memory** — 12-message context so it remembers the conversation.

## Notes
- For **your own** local use you need **no API keys/x402** — just localhost. API keys/x402 are only for letting *other people* pay to use your agents.
- To automate (no chat): swap the Chat Trigger for a **Schedule** or **Webhook** trigger and it runs 24/7 without you or Claude.
- Coding fallback when Claude is off: point the agent at **Ollama + qwen2.5-coder**, or use **Cline/Continue/OpenCode** with Ollama directly.
