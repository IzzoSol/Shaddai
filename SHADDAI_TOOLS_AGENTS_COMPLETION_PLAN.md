# SHADDAI — Tools, Connections & Build-Your-Own-Agent: Review + Completion Plan
*Reviewed by NEXUS (architecture) + PIKADON (security). Grounded in the live localhost test.*

## ✅ What actually works right now (verified)
- **133+ tools** registered in `agent-engine.js` (`TOOLS = {…}`): market (fetch_price, whale_scan, get_ohlcv, get_fear_greed…), web (search_web, fetch_url, wikipedia, github, rss), compute (run_js, run_python, calculate), files/memory (write_file, save_memory), creative (**generate_image** ✓ via Pollinations), on-chain (sol/eth balance, mint_collectible), **+ new: `schedule_task` / `list_scheduled_tasks`** (calendar).
- **8/14 connections live**: dexscreener, coingecko, coinlore, files, news, ollama, groq, **+ openrouter (now registered)**. Market analysis works (live Fear&Greed, trending, global).
- **Workflows**: registry + engine work (research→build, market-analysis, idea→product, full-audit + custom).
- **LLM brains**: `llm-client.js` chain (Ollama→Groq→OpenRouter→Anthropic→OpenAI) + `brains.js` (per-agent personas + model routing) + `agent-engine` task loop with tools.

## 🟡 Capability matrix (your "am I missing things?")
| Capability | Status |
|---|---|
| Market analysis | ✅ live (CoinGecko/DexScreener/Polymarket) |
| Image generation | ✅ already exists (`generate_image`, free) — can upgrade to AceDataCloud/Flux with a key |
| Calendar / scheduling | ✅ **added this pass** (`schedule_task`) — needs the cron runner to fire due tasks (background-jobs.js) |
| Music creation | 🟡 lyric + Suno-prompt generation works (`/api/content/lyrics`); **real audio needs `SUNO_API_KEY`** (or AceDataCloud suno skill) |
| Content creation | ✅ works |
| Trading / payments | ✅ MoonPay Agents (non-custodial) + pay-agent |

## 🧩 Build-your-own-agent (the centerpiece) — how it works + what's left
**Foundation already built (`brains.js`, `/api/brains`):**
- `GET /api/brains` → list available **models/brains** (ollama/groq/openrouter/claude) + their availability + the 7 council agents.
- `POST /api/brains/custom {name, persona, brainId}` → **a user creates their own agent**: a persona + the connected model it should use.
- `POST /api/brains/agent {agent, brainId}` → point any agent at a different connected model.
- `POST /api/brains/test {agent, prompt}` → **run** that agent on its chosen model.
- `agentLLM()` resolves persona + brain + meters usage (billing `recordUsage`).

**So "people connect & build their own agents pulling the connected model" is architecturally done — it needs 3 things to be REAL for users:**
1. **Frontend "Agent Builder" panel** (next build): pick a model (from `/api/brains`), write a persona, name it, save (`/custom`), run (`/test`). + BYOK field so they paste their own key (stored server-side per user, never client).
2. **Agent-engine integration**: let custom agents run full tool-using tasks via `/api/agent/run` (not just `/brains/test`) — register custom personas into the engine's agent list.
3. **Mount + deploy**: `brains.js` is in the repo but the live build must run the latest code (see "Unify build" below).

## 🔐 PIKADON gates — REQUIRED before users connect keys/agents
1. **Auth** on `/api/brains/*`, `/api/moonpay/*`, and real billing auth (Firebase JWT) — today they're open (see `SHADDAI_PIKADON_AUDIT.md`). Users building agents = untrusted input → must be authenticated + rate-limited.
2. **Sandbox `run_js` / `run_python`** — agents (incl. user-made) can run code; must be isolated (isolated-vm / worker / container) before public.
3. **BYOK key storage** — user-supplied model keys stored server-side, encrypted, never sent to the browser; never logged.
4. **Strip the hardcoded client key** + escape user persona/agent names before render (XSS).

## 🗺️ Completion roadmap (ordered — "organized & complete")
1. **Unify the runnable build** so live = repo (one source of truth) — *in progress: `npm install` on the repo clone.*
2. **Agent Builder UI** (frontend panel → `/api/brains`) + register custom agents into `agent-engine` so they run real tool tasks. ← *the centerpiece*
3. **PIKADON gates** (auth on new routes + billing JWT + sandbox run_js/python + BYOK encryption). ← *before any public/multi-user use*
4. **Finish the cron runner** so `schedule_task` actually fires (wire to `background-jobs.js`).
5. **Music**: add `SUNO_API_KEY` (or AceDataCloud) to turn lyric-gen into real audio; expose as a tool.
6. **Audit the 133 tools**: tag stub vs live, add timeouts/retries/uniform schema, tool-test harness (good Copilot task — see `SHADDAI_REVIEW_QUESTIONS.md`).
7. **Wire `recordUsage` into `agent-engine`** so every agent action meters credits (makes billing real end-to-end).

## Already fixed this session
health env-var bug · 7× `phi:latest` → installed model · `/api/pikadon/audit` empty-body crash · OpenRouter added to chain + registry · billing de-mocked · mobile + onboarding · MoonPay Agents + pay-agent · brains/personas layer.
