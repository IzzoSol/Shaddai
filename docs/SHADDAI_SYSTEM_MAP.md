# SHADDAI — System Map & Gap Analysis
*Generated 2026-07-27. The single reference for "what we have vs. what's missing." Hand this to Copilot/Grok alongside the repo.*

---

## 0. What SHADDAI is (one paragraph)
A team of 7 AI agents (ORACLE, ZEROX, NEXUS, TURTLE, QUILL, PIKADON, SHADDAI) that do real work, backed by a tool registry, a skills catalog, and a workflow engine. Frontend = static pages in `public/` served by an Express backend (`backend/server-production.js`) on port 3000. Deployed on Render (`github.com/IzzoSol/Shaddai` → auto-deploy on push to `main`). Product = $30/mo subscription + a free no-signup demo (`prove.html`).

---

## 1. ⚠️ THE MOST IMPORTANT THING: 3 agent-run paths (and the demo uses the weakest)

| Path | Endpoint | Uses tools? | Used by | Notes |
|---|---|---|---|---|
| **A. LLM chat** | `POST /api/llm/chat` (`api-proxy-routes.js` ~L4440) | ❌ **No — pure LLM** | **the demo (`prove.html`)**, plus image via `/api/image/generate` | Groq/Gemini/Claude/Ollama + AURA cache. Task-first system prompt (fixed 2026-07-27). **This is why the demo feels like "just a chatbot" — it never fires a tool.** |
| **B. Skill executor** | `POST /api/agents/task` (`server-production.js` ~L1022 → `skill-executor-real.js`) | ⚠️ Partial | legacy | Only 5 hardcoded skills (nexus-build-api, turtle-design-login, pikadon-security-review, quill-write-documentation, shaddai-coordinate); throws on anything else. Tangled/semi-recursive. Avoid building on this. |
| **C. Agent engine (the real one)** | `agent-engine.js` → `runAgentLoop` / `runWorkflow` / `runSkill` (invoked via executions/jobs routes) | ✅ **YES — real `tool.execute()`** | dashboard executions, job workflow | The powerful path: agents get assigned tools (`a.tools` = BASE_TOOLS + resolved skills), loop, call `TOOLS[name].execute(params)`, chain steps. **This is what "agents cooking with tools" actually means.** |

### 🎯 THE #1 FIX
**Route the demo (and the product's main "run" action) through Path C, not Path A.** Right now the strongest capability (300 tools, live data, workflows) is invisible to every new user because the demo only hits the LLM. Wire `prove.html` → an agent-engine run that fires real tools, and show the tools on the receipt (`used: coingecko_price, web_search`). That single change makes the "300 tools that do real work" claim *provable* where people can see it.

---

## 2. Tools — 276 built, 9 categories empty (the roadmap)
Registered via `reg(tool(...))` in `backend/tools-*.js`, loaded into the `TOOLS` registry in `agent-engine.js` (`TOOLS[name].execute(params)`).

**BUILT (276 total):**
| File | # tools | Domain |
|---|---|---|
| `tools-dev.js` | 49 | code/dev |
| `tools-utils3.js` | 34 | utilities |
| `tools-utils2.js` | 34 | utilities |
| `tools-utils4.js` | 30 | utilities |
| `tools-turtle.js` | 27 | design/visual |
| `tools-data.js` | 26 | data/scrape |
| `tools-nexus.js` | 24 | engineering |
| `tools-pikadon.js` | 20 | security |
| `tools-research.js` | 18 | research |
| `tools-markets.js` | 14 | crypto/markets |

**EMPTY STUBS (0 tools — this IS your "what's missing" list):**
`tools-writing.js` · `tools-solana.js` · `tools-social.js` · `tools-security.js` · `tools-news.js` · `tools-content.js` · `tools-design.js` · `tools-defi.js` · `tools-extra.js`

> Note: the marketing says "400 tools / 3500 skills." **Real registered tool count is 276.** Use the honest number, or count tools+skills+integrations together and label it clearly. Building the 9 empty categories is the concrete path to a bigger *true* number.

### Live-data tools that already work (proof the agents can touch reality)
Real endpoints in `api-proxy-routes.js`: `coingecko/price` & `market`, `dexscreener/search` & `pairs`, `helius/balance` & `tokens` (on-chain wallet data). These are genuinely wired — surface them in agent runs.

---

## 3. Skills — `backend/data/skills-catalog.json`
**3,022 skill entries** (8.4 MB). Plus `skill-packs.json` (15 packs) and `credit-costs.json`. Skills resolve to tool sets in the agent engine (`runSkill`, skill→tools mapping ~L3026-3033). Consumed via `/api/skills/*` and agent loadouts.

## 4. Agents — 7 souls
`backend/data/agents/{ORACLE,ZEROX,NEXUS,TURTLE,QUILL,PIKADON,SHADDAI}.md`. Each = identity + Human Design + domain. **Orchestration:** SHADDAI is intended as the coordinator; agent engine supports multi-agent (`runWorkflow`, `runAutonomousCommander`). Real orchestration guardrails to add: hard step caps, explicit handoffs, a verification/"say-no" pass (see the Reddit-framework notes).

---

## 5. API surface (backend, port 3000) — selected
Agents: `/api/agents`, `/api/agents/:name`, `/api/agents/task`, `/api/agents/:name/{skills,skill,history,health}`, `/api/agents/route`
Run/exec: `/api/executions/*`, `/api/jobs/*`, `/api/batch/jobs`, `/api/llm/chat`, `/api/agent/:name/task`, `/api/agent/:name/stream`
Data: `/api/coingecko/*`, `/api/dexscreener/*`, `/api/helius/*`, `/api/brains`, `/api/tasks/receipts`
Product: `/api/image/generate`, `/api/subscribe`, `/api/stripe/*`, `/api/sub-billing/*`, `/api/operatives`, `/api/office/*`, `/api/forge`, `/api/aura`, `/api/economy`, `/api/collectables`
World/games: `/api/city/*`, `/api/worlds/*`, `/api/football`, `/api/arcade`, `/api/realms`

## 6. Frontend surfaces (`public/`)
**Product/funnel:** `home.html` (landing), `prove.html` (free demo — Path A), `pricing.html` ($30), `playbooks.html` + `playbooks/*` (6 lead-magnet books), `launch-kit.html`, `growth.html`, `links.html`, `monetize.html`
**App:** `index.html` (~50k-line dashboard), `game.html` (2D world), `arcade.html`, `museum.html`, `library.html`, `oracle-sky.html`, `agents.html`
**Bankr/x402:** `bankr/*` (x402 endpoints + monetize app)

## 7. Existing docs (`docs/` — already 35+ specs)
Key ones to cross-reference: `ARCHITECTURE.md`, `AGENT_GUIDE.md`, `WORKFLOW_GUIDE.md`, `API_REFERENCE_COMPLETE.md`, `SHADDAI_SYSTEM_REVIEW.md`, `SHADDAI_SKILLS_LIST.md`, `SHADDAI_TOOLS_RESEARCH_BRIEF.md`, `RUN_SKILL_SPEC.md`, `SHADDAI_MASTER_BUILD_ARCHITECTURE_2026-07-24.md`.

---

## 8. HONEST GAP ANALYSIS — what to fix, in order
1. **Demo doesn't use tools (Path A).** → Route demo/product "run" through the agent engine (Path C) so real tools fire + show on the receipt. *Highest leverage — makes the whole pitch true.*
2. **9 empty tool categories** (writing, social, news, content, design, security, solana, defi, extra). → Build these; each is a whole capability users expect.
3. **Orchestration hardening.** → SHADDAI as coordinator with step caps + explicit handoffs + a verification pass (kills the looping the Reddit framework warns about).
4. **Path B (skill-executor) is legacy/tangled.** → Deprecate; consolidate on Path C.
5. **Honest numbers.** → 276 tools / 3,022 skills. Don't inflate; build to grow it.
6. **Model quality in beta.** → Demo runs on Groq free tier; a stronger model markedly improves output (esp. TURTLE design). Consider a "premium model" toggle (BYOM already exists in `prove.html`).
7. **Receipts everywhere.** → Stamp model + tools-used on every dashboard response (started; finish it).

---

## 9. How to run / deploy
- **Local:** `node backend/server-production.js` → http://localhost:3000
- **Deploy:** push to `main` on `github.com/IzzoSol/Shaddai` → Render auto-deploys (~minutes)
- **Secrets (gitignored):** `backend/data/runtime-keys.json` (HF/Meshy/WorldLabs keys), `backend/data/payment-config.json` (Stripe links)
