# SHADDAI — repository instructions

You are working in the SHADDAI monorepo. Read this before proposing changes.

---

## 1. What this is, and why it exists

**SHADDAI is a workstation where AI agents do paid work, and a persistent world those agents live in.**

The one-line why: *an agent should be able to earn its owner money while they sleep, and the place it earns should be somewhere people actually want to be.*

Most AI products sell you a chat box. The bet here is different, and every architectural decision follows from it:

1. **An agent is property, not a session.** It has a name, a persona file, a wallet, a set of abilities, and an owner. It persists. It can be hired by someone who isn't its owner, and its earnings go to the owner.
2. **Work has to be visible to feel real.** Hence the 2D city and 3D realm — an agent standing on a plot is an agent doing a job someone can watch. The world is not a game bolted on; it is the interface for the economy.
3. **Grounded beats generative.** Answers cite an indexed corpus (401,767 passages) rather than improvising. An agent that makes things up is worthless as a paid worker.
4. **The money model must survive a regulator reading it.** Sparks are store credit at a fixed $1, permanently. Not a token, does not float, no yield. Anything that pays a holder a share of platform revenue *they did not work for* is an investment contract in substance whatever the wrapper is called — so the design pays people for **work performed**, never for holding.

**Current business goal:** 20 founding members at $100 each. Everything should be judged against "does this help a stranger understand, trust, and pay."

---

## 2. Repository map

| Repo | Visibility | What it is |
|---|---|---|
| `IzzoSol/Shaddai` | **private** | This repo. The product. Render auto-deploys `main`. |
| `IzzoSol/aura` | public, MIT | AURA, published to npm as `shaddai-aura`. Vendored in-tree at `backend/lib/aura.js`. |
| `IzzoSol/Shaddai-Clipper-Feature-` | public, MIT | Video clipper. |
| `IzzoSol/updog-site` | public | Unrelated landing page. Live on Render. |
| `IzzoSol/Dreamers` | public | Sister project, same 7-agent council, shared backend intent. |

**Hard rule:** AURA predates and is unrelated to "AINL"/`ainativelang`. Never associate them anywhere.

---

## 3. Architecture

```
public/            109 HTML pages — no build step, no framework, vanilla JS
  enter.html         the "pre-landing": 6 swappable module doors
  home.html          the landing / SHADDAI gate
  index.html         THE DASHBOARD — the actual product
  simple.html        Simple Mode — one spinnable wheel, mobile-first
  agent-forge.html   build an agent end to end
  manual.html        N64-style booklet, data-driven from js/manual-pages.js
  pricing.html       tiers + live Stripe Payment Links
  js/                12 shared modules (shd-modules, shd-chrome, simple/*)

backend/           353 JS files, Express, no TypeScript
  server-production.js   entry point; 105 direct routes + 57 mounted routers
  api-proxy-routes.js    299 more routes (the big one)
  skill-router.js        65 named skills across the 7 agents
  agentic-engine.js      554 executable tools, TTL-cached
  auth-guard.js          softAuth → req.userId; SECURITY-CRITICAL
  lib/agent-registry.js  resolves council + forged agents to a system prompt
  lib/agent-forge.js     creates an agent across all 4 stores, atomically
  lib/aura.js            answers without an LLM where it can
  brain-server.js        the RAG brain
  data/                  JSON file stores (no SQL for most things)
```

**Stack reality:** Node + Express, JSON files on disk, vanilla front-end, deployed to Render. There is no bundler, no React, no ORM. **Do not introduce one.** Proposals that add a build step to a 109-page static front-end will be rejected.

---

## 4. The seven agents

Each owns a domain and answers from its own indexed library. Personas live in `backend/data/agents/*.md`.

| Agent | Domain |
|---|---|
| **SHADDAI** | Orchestration, strategy, the final call |
| **ZEROX** | Money — markets, pricing, unit economics, trading |
| **ORACLE** | Research, people, patterns, esoterica |
| **NEXUS** | Backends, APIs, data, systems that must hold |
| **TURTLE** | UI/UX, image, motion, sound, game assets |
| **QUILL** | Every word a person reads |
| **PIKADON** | Security — what could go wrong |

Routing is automatic (`backend/lib/knowledge-map.js`, `GET /api/route?q=`). Users describe what they want; the council decides who takes it.

**Forged agents are first-class.** A user-created agent resolves through the same registry, appears in `/api/agents`, and answers with its own persona. Never write code that assumes an agent id is one of the seven.

---

## 5. Data stores (JSON, on disk)

| File | Holds | Careful because |
|---|---|---|
| `custom_agents.json` | forged agents + system prompts | **The only store that makes an agent answerable.** A corrupt file silently deletes every agent a user made — always write via temp-file + rename. |
| `agent_wallets.json` | spend budgets, keyed by **NAME** | Two agents with one name would share funds. Duplicate names are refused. |
| `data/agents/custom/*.md` | forged persona files | Editable by hand; that's the point |
| `operatives.json` | forge portraits / world presence | Has been an object *and* an array. Defensive parse required. |
| `forge-state.json` | token ids, portraits | atomic write |
| `data/rag/kb_*/` | 7 agent knowledge bases, 170 docs | `docs.json` is a list; chunks live *inside* each doc |

---

## 6. The economy

```
FREE      Simple Mode, the 7 agents, a few grounded brain answers a day
PRO $30   Pro Signals, uncapped brain, sentiment, workflows, AURA
MAX $200  + brain lessons, full library, MCP access, priority
FOUNDER   $100 once, 20 seats, permanent Pro + founder mark + first claim on land
SPARKS    1 Spark = $1, fixed forever. Store credit. No subscription needed.
```

Three live Stripe **Payment Links** are wired into `pricing.html` (no API key, no redeploy needed).

Rules when touching money code:
- Sparks never float. A price in Sparks means the same dollars next year.
- Card / SOL / ETH / USDC are all just *ways in*; they convert at spend time.
- **Never ship anything that pays a holder for holding.** Make the asset productive instead — the plot earns because an agent works from it.

---

## 7. What is real vs. what is not

Be accurate about this. Overstating it is the fastest way to lose a founding member —
and **check the tree before declaring something missing**. This repo is large enough that
"not built" has been asserted about things that were already working (MCP, twice).

**Works today:** the 7 agents · RAG brain with citations · agent routing · Agent Forge (end to end) · workflows · Pro Signals · the 3D sculptor and gallery · the arcade · both worlds · AURA · 554 tools · Stripe checkout.

**Does not work yet:**
- **Paybox** — `backend/paybox-guard.js` exists with a full 5-layer safety model, but is **not mounted**, disabled by default, and its REST contract is **unverified against live docs**. Do not treat it as working.
- ~~MCP server~~ — **CORRECTION: this IS built.** `backend/mcp-server-rag.js` is a
  working stdio MCP server (v2.2.0) exposing `list_agents`, `list_rag_docs`,
  `rag_search`, `rag_ask`, `run_agent` plus `kb://<agent>` resources.
  `backend/mcp-client.js` is a dependency-free JSON-RPC client that connects
  SHADDAI *to* external MCP servers (stdio + streamable-HTTP), lazily. Live
  status at `GET /api/mcp/status`. What is missing is only **tier gating**
  (MCP is a Max-tier feature) and packaging/docs — not the protocol work.
- **Grok bot ingress** — not built.
- **x402 / Bankr** — `bankr/` holds a working x402 agent-monetization flow
  (`x402-shaddai-agent.js`, `x402-shaddai-alpha.js`, `app-shaddai-monetize`)
  and `backend/lib/x402*.js` + `x402-*-routes.js` are in the tree. Treat this
  as the proven micropayment path, not a greenfield.
- **Land, plots, the monthly siege** — regions and characters exist; the economy on top of them does not.
- **AURA hit rate** — never measured. Treat token savings as a design goal, not a proven number.
- **Touch controls** for most arcade games — keyboard/mouse only.
- **`/forge.html`** — the *older* build screen, still says coming soon. `/agent-forge.html` is the one that finishes.

---

## 8. Conventions

**Security**
- Never commit `backend/data/runtime-keys.json`, or any `hf_` / `gsk_` / `sk_` / `sk-` / `AIza` string.
- Never print a secret value into output or logs.
- Identity comes from `auth-guard.softAuth` → `req.userId`. **Never** trust `x-user-id` in production.
- Someone else's resource returns **404, not 403** — confirming an id exists is itself a leak.
- Every user-scoped route must filter by owner. Cross-user leaks have shipped here before.

**Failure modes this codebase has actually hit — check for them**
- **CSS specificity:** an ID selector (`#fr1{flex-wrap:wrap}`) silently beats your class rule. Lost twice here.
- **Multi-store writes:** write in dependency order and roll back on failure. A half-made object looks real in a list and then does nothing.
- **Light themes:** use the `--shell` token (near-black on dark skins, near-white on light). Never hardcode a list of which skins are light.
- **SSE:** Express `compression()` buffers it. Needs `no-transform` + `X-Accel-Buffering: no`.
- **Service worker:** `sw.js` is cache-first. A "bug" that doesn't reproduce on a fresh render is usually stale cache.
- **Mobile:** 390px is the target. Inputs must be ≥16px or iOS zooms. Touch targets ≥44px.

**Style**
- Match the surrounding code. Vanilla JS, `var`/`function` in older files, no frameworks.
- Comment the *why*, especially the non-obvious constraint that forced a decision.
- Degrade gracefully. A missing API key should fall back, not 500. See `forge-routes.js`.
- Verify before claiming. Headless Chrome checks for layout; real HTTP calls for endpoints.

---

## 9. What good work looks like here

The owner is building this while working a regular job and is newer to code. That means:

- **Finish things.** A half-built feature costs more than none, because it has to be remembered.
- **Reduce before adding.** The product already sprawls across 109 pages. Consolidation is usually worth more than a new surface.
- **Say plainly what is broken.** Never describe an unfinished thing as if it works.
- **Small verifiable steps** beat large autonomous runs.