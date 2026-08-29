# SHADDAI — Agent Tools Expansion: Research Brief for Perplexity Pro
**Date:** 2026-06-21 · **Goal:** give the 7 SHADDAI agents *many* real, working, easy-to-use tools — from the existing 182 backend tools, ~3500 skill files, and new APIs — without hand-coding thousands of functions.

## Current state (verified)
- **Frontend** (`SHADDAI-DASHBOARD-v93.html`): a client-side `_AGENT_TOOLS_REGISTRY` with **only 10 tools** + `_AGENT_TOOL_GRANTS` per agent. This is what the main chat uses → "we only have 10."
- **Backend** (`backend/agent-engine.js`): **182 real tools**, callable via `POST /api/agent/run` (the agent loop parses `[TOOL:name:{json}]`). Used by Forge/Hire, NOT by the council chat.
- **Skills:** ~3500 `SKILL.md` files (Obsidian) indexed by `backend/skill-index` — prompt templates, not API code.
- **Models:** tool-calling reliability is poor on llama3.2:1b; better on 3b / Groq / OpenRouter.
- Keys present: HuggingFace/FLUX, Helius (Solana), AceDataCloud is allowed in CSP (`https://api.acedata.cloud`).

## The 3-tier strategy we want validated/expanded
1. **Use the 182 now** — route council agents through `/api/agent/run`.
2. **Add new real API tools** (image/video/music/voice/search/finance) mapped to agent domains.
3. **`run_skill` meta-tool** — make all 3500 SKILL.md callable via one tool + semantic tool/skill retrieval (you can't put 3500 tool defs in a prompt).

---

## RESEARCH QUESTIONS (please answer with links, repos, and code patterns)

### A. Ready-made tool collections to steal from
- Compare **LangChain Tools**, **LlamaIndex tools**, **Composio**, **Toolhouse**, **Arcade.dev**, and the **MCP server registry** — which gives the most *working, hosted* tools (web search, code exec, files, email, calendars, GitHub, finance, social) with the least integration work for a **Node.js/Express** backend?
- Which have a **Node SDK** (not just Python)? Which are free / self-hostable?
- Specific GitHub repos with large, permissively-licensed tool sets we can port into `agent-engine.js`'s `[TOOL:...]` format.

### B. Many-tools architecture (100s–1000s)
- Best practices for agents with **hundreds/thousands of tools**: you can't list them all in the prompt. Research **tool RAG / semantic tool selection** (embed tool descriptions, retrieve top-K per task). Examples: Toolformer, Gorilla, ToolLLM, RAG-over-tools, OpenAI function-calling with dynamic tool sets.
- How to make tools **easy for a small local model** (3b) to call reliably — naming, schemas, few-shot, constrained decoding, JSON-mode.

### C. Turning 3500 markdown skills into callable tools
- Pattern for a single **`run_skill(skill_name, input)`** tool that loads a `SKILL.md` prompt and executes it via the LLM — plus **semantic search** so the agent finds the right skill from 3500.
- Should skills become individual tools, or stay behind one meta-tool with retrieval? Tradeoffs.
- Any existing "prompt-library-as-tools" frameworks.

### D. New high-value API tools (map to agents)
- **TURTLE (creative):** image (FLUX / Seedream / Nano-banana / Midjourney), video (Veo / Kling / Luma / Sora / Hailuo), music (Suno / Producer), voice/TTS (Fish Audio) — confirm **AceDataCloud** endpoints, request/response shapes, auth, and pricing for each (we have AceDataCloud access).
- **ORACLE / QUILL (intel/writing):** Google/web search (AceDataCloud google-search), web scrape/fetch, news.
- **ZEROX (finance):** DexScreener, Jupiter, CoinGecko, Helius on-chain (key present), whale/sentiment.
- **NEXUS / PIKADON:** code exec sandbox, scheduling/cron, security scanners.
- For each: the **minimal Node call** + what key/env is needed.

### E. Reliability & UX
- How to surface tools in the UI so users **see what each agent can do** and trust it works (tool catalog, per-agent loadout, live "tool used" indicators).
- Cheapest reliable **tool-calling model** options (Groq Llama-3.3-70B, OpenRouter, local 3b) and rough cost per call.
- How **x402** can meter per-tool-call for the expensive ones (image/video/music) while keeping cheap tools free.

## Deliverable we want back from Perplexity
1. A ranked shortlist of tool sources (repos/SDKs/MCP servers) to integrate first, with Node examples.
2. A concrete **tool-RAG** design for 100s–1000s of tools on a small model.
3. The **`run_skill` + semantic skill search** pattern (with code).
4. A table of **new API tools per agent** with endpoints/keys/cost (esp. AceDataCloud media tools).
5. The reliability/model recommendation.

## Constraints
- Backend is **Node/Express** (`agent-engine.js`), tool call format `[TOOL:name:{json}]`.
- Keep secrets server-side. Prefer free/self-hostable. Gate expensive media tools behind x402.
- Output Node-ready snippets, not Python-only.
