# SHADDAI RAG + Agents — Claude Desktop MCP setup

Lets Claude Desktop (and Claude Code) talk to the SHADDAI agent council and the
RAG knowledge base you built from the YouTube transcriptions.

The server is `backend/mcp-server-rag.js` (MCP 2024-11-05, JSON-RPC 2.0 over
stdio). It is a single dependency-free file — no install step.

Long-running tools (`rag_ask`, `run_agent`) emit live `notifications/progress`
when the client passes a `_meta.progressToken`, so Claude shows real-time status
("Running tool: …", "Reasoning…", etc.) instead of hanging silently.

**No Ollama required.** `rag_ask` and `run_agent` use the engine's cloud LLM
chain (Groq → Gemini → OpenRouter → Anthropic → OpenAI) — set any one API key
(Groq is free + fastest) in `backend/.env`. A local Ollama model is used only
as a last-resort fallback if no key is configured.

## 0. Quick self-check (recommended)

Verify the server before wiring up a client:

```
node "C:\Users\Brittany\Desktop\SHADDAI MASTER FINAL BUILD\backend\mcp-server-rag.js" --self-test
```

This spawns the server, runs the handshake + fast tools (list_agents,
rag_search, list_rag_docs, resources, error paths) and exits 0 on success.
Use `--self-test-full` to also exercise `rag_ask` (local Ollama) and
`run_agent` (full agent loop) — slower but a complete end-to-end check.

```
node "C:\Users\Brittany\Desktop\SHADDAI MASTER FINAL BUILD\backend\mcp-server-rag.js" --help
```

## 1. One-time setup

Edit your Claude Desktop config file:

- Windows: `C:\Users\Brittany\AppData\Roaming\Claude\claude_desktop_config.json`
- macOS:   `~/Library/Application Support/Claude/claude_desktop_config.json`

Add a new entry under `mcpServers` (keep anything already there):

```json
{
  "mcpServers": {
    "shaddai-rag": {
      "command": "node",
      "args": [
        "C:\\Users\\Brittany\\Desktop\\SHADDAI MASTER FINAL BUILD\\backend\\mcp-server-rag.js"
      ]
    }
  }
}
```

For Claude Code (CLI), run:

```
claude mcp add shaddai-rag -- node "C:\Users\Brittany\Desktop\SHADDAI MASTER FINAL BUILD\backend\mcp-server-rag.js"
```

Then restart Claude Desktop (Settings → Developer → Reload MCP servers).

## 2. Tools & resources Claude will see

| Tool           | What it does |
|----------------|--------------|
| `list_agents`  | The 7 agents, their role, KB doc count, tool count |
| `list_rag_docs`| Documents inside one agent's knowledge base |
| `rag_search`   | Raw chunk hits (score + source doc) for a query |
| `rag_ask`      | Grounded answer from the KB via local Ollama, with sources |
| `run_agent`    | Full agent run (RAG + skills + live MCP tools) |

Plus browsable resources: each agent's KB is exposed as `kb://<agent>` and
appears in Claude's resource list (list docs, read a KB as JSON).

## 3. Requirements on this machine

- Ollama running with `phi4-mini:latest` (and `nomic-embed-text:latest` for embeddings):
  `ollama serve`
- The SHADDAI server does NOT need to be running for `rag_search` / `rag_ask` /
  `list_agents` / `list_rag_docs` — they read the KB files directly.
- `run_agent` executes the full agent engine in-process (uses its own env keys /
  local Ollama). For best speed set a GROQ key in `backend/.env`.
- Env knobs (read from `backend/.env`): `DEFAULT_OLLAMA_MODEL`,
  `OLLAMA_API_URL`, `OLLAMA_TIMEOUT_MS`, `SHADDAI_RAG_KB_PREFIX`.

## 4. Verify

Open Claude Desktop, ask:

> "List the SHADDAI agents and what each one specializes in."

You should see the MCP tool list appear. Then try a RAG-grounded question:

> "Use the NEXUS knowledge base: what are the three components of an AI agent?"

Claude will call `rag_ask` / `run_agent` and reply with sources.
