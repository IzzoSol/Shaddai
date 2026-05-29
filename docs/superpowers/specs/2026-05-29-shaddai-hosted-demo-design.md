# SHADDAI — Sub-Project A: Ship the Working Hosted Demo

*Design spec · 2026-05-29*

## Context

SHADDAI v80 runs fully on the author's machine (`localhost:3000`), but **localhost is unreachable by anyone else** — so it can't be demoed, tested by users, or sold. A Vercel attempt only produced a static UI shell because the dashboard's API calls are hardcoded to `localhost`. The goal of this sub-project is the **single unblocker for everything else**: a public URL (`shaddai.onrender.com`) where the dashboard loads *and the agents actually work*, at $0 on free tiers.

Key facts established during exploration:
- The 7 agents are **already pure Node.js** (`agent-engine.js`) — **no rewrite needed**. Python (`aura/`, `launch_agents.py`, ports 8000–8008) is optional/legacy, not in the agent path.
- A 5-provider fallback chain **already exists** in `backend/llm-client.js` (Ollama→Groq→OpenRouter→Anthropic→OpenAI) but isn't wired into the agent loop yet.
- The backend already binds `process.env.PORT`, serves the dashboard (`express.static('../public')` + `public/index.html` fallback), and reads data files with graceful try/catch.

The only real blockers are (1) the dashboard's hardcoded `localhost` URLs and (2) no cloud LLM wired for when Ollama is absent.

**Out of scope (later sub-projects):** hardening all 133 tools, Telegram signal wiring, easy API-add UI, agent appearance/customization, on-chain token. Ship a working demo first.

---

## Section 1 — Origin-aware dashboard URLs

**File:** `FINAL-SHADDAI-V80.html` (and synced copy `public/index.html`).

- Change the base constant (line ~9132):
  `const PROXY = 'http://localhost:3000'` → `const PROXY = (location.protocol === 'file:' ? 'http://localhost:3000' : '')`.
  Empty string makes all `${PROXY}/api/...` calls **same-origin relative**, which works on any host that serves the page; `file://` still falls back to localhost for direct-open use.
- Global-replace remaining hardcoded `http://localhost:3000` (~200 occurrences not using `PROXY`) → `${PROXY}` inside template literals, or strip to relative `/api/...` for quoted strings. **Use a scripted replace** (Node, in-place) rather than manual edits; re-run the dashboard audit afterward.
- `const AURA_BASE = 'http://localhost:8010'` (line ~35782) → `'/aura'`; the ~9 direct Ollama `http://localhost:11434/...` calls → route through backend (`/api/ollama/*`, which already exists) so the cloud build degrades gracefully when no local Ollama is present.

**Why same-origin matters:** because the backend serves the dashboard, same-origin requests carry no `Origin` header → **CORS is bypassed entirely**, removing that whole failure class.

## Section 2 — Multi-LLM fallback + per-agent providers

**Files:** `backend/agent-engine.js` (`callLLM`, `AGENTS`), reuse `backend/llm-client.js`.

- Wire the agent loop's `callLLM` (currently inline Ollama→Groq at ~line 2745) to delegate to the existing `llm-client.js` provider chain. Keep the Ollama-first behavior; add **Puter.js** as an additional link.
- Add an optional `preferredProvider` field to each entry in `AGENTS`. When set, that agent's calls start at its preferred provider, then fall down the shared chain on failure. Default spread example: ZEROX→Groq, ORACLE→OpenRouter, NEXUS→Gemini, QUILL→Groq, TURTLE→Puter, PIKADON→Groq, SHADDAI→OpenRouter. This lets multiple agents run **concurrently without a single provider's rate limit (e.g. Groq 30/min) bottlenecking the whole system**.
- Preserve token accuracy: continue recording real provider token counts via `llm-tracer`; local providers stay `$0`.

## Section 3 — Render deploy + safety net

**Files:** new `render.yaml`, existing `package.json` (root `start` script), `backend/server-production.js` (CORS comment only — no change needed for same-origin).

- **Backup first:** create a dated zip of the build and a git branch `pre-deploy-backup` before any edits (tangible "safe copy" + git restore point).
- Add `render.yaml` declaring a Node web service: build `npm install`, start `node backend/server-production.js`, and env vars `GROQ_KEY` (required for cloud LLM), optional `OPENROUTER_KEY` / `GEMINI_KEY`.
- The repo is already connected to Render via GitHub; pushing to `main` triggers auto-deploy. After deploy, `https://shaddai.onrender.com` serves the dashboard and agents respond via the cloud chain.
- Note Render's ephemeral filesystem: `backend/data/*.json` (marketplace, collectibles, memory) reset on redeploy — acceptable for a demo; flagged for a managed DB later.

---

## Critical files

| File | Change |
|---|---|
| `FINAL-SHADDAI-V80.html` + `public/index.html` | origin-aware `PROXY`/`AURA_BASE`, strip hardcoded localhost |
| `backend/agent-engine.js` | `callLLM` → use `llm-client.js`; add `preferredProvider` to `AGENTS` |
| `backend/llm-client.js` | add Puter.js link (reuse existing chain) |
| `render.yaml` (new) | Render service definition + env vars |
| `package.json` | confirm `start` script (already present) |

## Verification (end-to-end)

1. **Local, served (not file://):** start backend, open `http://localhost:3000`; confirm chat + an agent task work and Network tab shows **relative** `/api/...` calls (no `localhost:3000` absolute).
2. **Multi-provider:** with only `GROQ_KEY` set and Ollama stopped, run a ZEROX task → confirm it answers via Groq; check `/api/llm/traces` shows the provider + real tokens + correct cost.
3. **Per-agent spread:** trigger two agents with different `preferredProvider`s back-to-back → confirm each used its preferred provider (trace), proving no single-provider bottleneck.
4. **Audits:** `node backend/audit-connectivity.js` and `audit-dashboard.js` stay green after the URL rewrite.
5. **Render:** push to `main`, wait for auto-deploy, open `shaddai.onrender.com` in a fresh browser (logged-out) → dashboard loads, a chat returns a real answer.
