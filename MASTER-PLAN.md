# SHADDAI + Dreamers — Master Plan (Canonical)

**Status:** Ground-truth as of 2026-08-27, verified against actual code (not assumptions)
**Supersedes:** `MASTER-AGENT-SPEC.md` and `START-HERE-AGENT-BUILD.md` in this repo root — those were written before an audit and wrongly assumed the 7 agents didn't exist yet. They do. Do not follow them; they're kept only for their model-dispatch table, not their technical steps. Delete once this file is trusted.

This is the ONE file to read before touching SHADDAI or Dreamers. Every other doc (4,295 of them) is either linked from here or superseded by it.

---

## 0. GROUND TRUTH (from full codebase audit, 2026-08-27)

### ✅ Real and working
- **7 agents** (QUILL, ORACLE, PIKADON, NEXUS, TURTLE, ZEROX, SHADDAI) — real specs in `backend/data/agents/*.md`, real code in `backend/agent-engine.js` + `backend/agent-invoker.js`, wired into an MCP server (`backend/mcp-server-rag.js`) connected to Claude Desktop. 45-48 skills defined per agent.
- **RAG search** — TF-IDF pipeline live (`backend/data/rag/kb_<agent>/docs.json` + `idf.json`), exposed via MCP tools `rag_search`, `rag_ask`, `run_agent`.
- **2D world** — `SHADDAI-WORLD.html`, walkable pixel world, agents appear as characters.
- **3D toolkit** — Three.js procedural object sculptor, generates presets for Forge (no GLB export, no Meshy yet).
- **MoonPay** — production payment rail, non-custodial (`backend/moonpay-agent.js`).
- **Stripe billing** — Free/Pro/Elite tiers + credit ledger (`billing-service.js`).
- **n8n workflow** — `shaddai-orchestra.json` (Groq/Ollama-powered always-on agent layer, Claude-independent) — built, never deployed.

### ✅ UPDATE 2026-08-27 (later same day) — RAG brain data layer is DONE, not "80% done"
Verified by actually running it in the `rag-brain-corpus-ingestion` worktree, not just reading docs:
- `backend/ingest-knowledge.js` (Task 4, the "missing" ingest CLI) **exists and works** — ran it live, source corpus (`Documents/SHADDAI-SYSTEM/oracle/deep_brains`, 8.9MB unified brain file) is fully ingested, 0 new transcripts pending.
- `backend/lib/grounding.js` (Task 5, "MCP grounding" / anti-hallucination layer) **exists and passes 16/16 tests** (`node backend/lib/grounding.test.cjs`) — catches fabricated numbers, drift, unverified claims.
- Ran the recall check: all 7 agents answer real questions grounded in their ingested knowledge (SHADDAI on leadership, ORACLE on consciousness, ZEROX quoting Hormozi's 100M Offers, etc.) — not generic LLM output.
- **The earlier "Half-built" assessment below was wrong** — it came from an audit that read stale planning docs instead of running the code. Lesson: verify by executing, not by reading specs.
- **Landing page visuals** (`public/brain.html`, `public/brain-head.html`, `public/rag-cockpit.html`) — checked live in browser. `brain.html` (node-graph RAG visualization) renders correctly. `brain-head.html` was rendering **solid black** due to a real bug: `public/pixel-forge.html:305` computed a canvas gradient radius as `Math.min(190,(W-430)*0.34)` with no floor, which goes negative whenever the embedded canvas is narrower than 430px, crashing `createRadialGradient` (`IndexSizeError: r1 < 0`) and killing the whole render loop. **Fixed** — floored at `Math.max(24, ...)`, committed as `28771c9` in the worktree. Reverified: onboarding wizard and page now render correctly, no more crash, only unrelated MetaMask extension noise in console.
- **Still not merged to `main`** — this worktree is 51 commits ahead. Merge it (or open a PR) to make any of this live outside the worktree.

### ⚠️ Half-built (superseded by the update above for the RAG item — kept for history)
- ~~RAG brain rebuild — Missing: Task 4 (ingest-corpus CLI) + Task 5 (MCP grounding)~~ — **wrong, see update above, both exist and work.**
- **Forge "Build" UI** — says "coming soon," marketplace (`/api/gallery`) already wired per-user.

### ❌ Docs-only, zero code (do not assume these exist)
- x402 Solana payments
- Paybox
- Meshy 3D generation integration
- SHADDAI coin / DREAM coin contracts
- ~~Obsidian vault (does not exist on disk)~~ — **CORRECTION (2026-08-28): it does exist**, at `OneDrive/OBSIDIAN/SHADDAI OBSIDIAN/` (includes a `07 Credentials/` folder with API keys — HF tokens, FAL_KEY, etc). The earlier audit missed it because it searched under `C:\Users\Brittany\Shaddai` and top-level user dirs, not OneDrive. See memory note `API_KEYS_VAULT_AND_HF_PROVIDERS` for the HF provider gotcha found there (hf-inference returns 410 Gone, not a dead key — route via nscale/fal-ai/wavespeed instead). Don't re-search for this — it's found, use it.

### Known contradictions in old docs
- Dreamers Climb spec (`DREAMERS_CLIMB_V16.39_MASTER_PLAN.md`) says 3 radios + "VS mode coming soon"; actual code has 8 radios and no VS mode. Spec is stale — trust the code.
- `SPEC_agentic-commerce.md` names Paybox as the payment plan; actual production payments run on MoonPay. This file resolves that: **both**, see §2.

### Git state at time of writing
- `Shaddai` repo, `main` branch, 10 uncommitted files (see below) + 2 new speculative docs from before this audit.
- Worktree `rag-brain-corpus-ingestion` active — has the RAG finish-line work.
- `Dreamers` is a separate repo (`IzzoSol/Dreamers`), linked via `Dreamers/docs/COORDINATION-with-shaddai-terminal.md`.

---

## 1. DECISIONS LOCKED (owner-approved 2026-08-27)

1. **Payments — CONFIRMED (2026-08-29), real tool surface now known:** Paybox is NOT a Stripe-like checkout processor — it's a non-custodial AI-agent WALLET (MPC-sharded keys, agents never touch keys directly, request-then-approve transfers/swaps, plus a real x402 service catalog for buying/booking things across the open internet). `paybox-guard.js` has been rebuilt around the real tools — see §Phase 2 for the full detail and current status (currently `enabled:false`, safe). Its actual fit: give agents (ZEROX for trading, PIKADON for policy oversight) a real scoped wallet to operate on-chain — closer to what `moonpay-agent.js` already does manually (user signs locally via CLI) than to Stripe checkout. **Keep Stripe as the checkout/subscription rail — it's already live and wired to Sparks (§Phase 2). Don't replace it.**
2. **x402:** Build it for real. It's the right protocol for **agent-to-agent and pay-per-insight micropayments** (hit-rate-based charging on ZEROX signals, forge trading fees). Scope: Phase 2, after Paybox checkout ships.
3. **Docs home:** This file (`MASTER-PLAN.md`) is the single canonical source of truth at repo root. Existing specs are NOT deleted — they're either linked below as still-valid detail docs, or marked superseded. No Obsidian vault gets built.
4. **Sparks unit (owner-approved 2026-08-27):** 1 Spark = $1 USD, fixed, never floats. SOL/ETH/USDC/Paybox/MoonPay are all *payment rails into* Sparks (convert-then-credit at spend time), not the unit of account itself. Every price in the product stays human-readable ("this costs 5 Sparks") regardless of what someone actually paid with. Do not make Sparks a tradeable/floating token — that's what SHADDAI coin is for, a separate, later, explicitly speculative asset (§7).
5. **Paybox MCP added** to `.mcp.json` (`https://api.paybox.sh/mcp`) — requires a session restart to connect. Once connected, LIST ITS TOOLS FIRST before writing any more integration code — `backend/paybox-guard.js`'s current REST "charge" shape is a wrong guess (see correction above) and needs rebuilding around Paybox's real wallet-operation tools (likely: create/vault a wallet, set a policy, agent-initiated transfer/swap under that policy, approve/reject a pending action) — not a generic checkout charge.
6. **Model access for Pro (owner decision needed, 2026-08-28):** keep the existing Stripe billing as the subscription/tier rail. For "high-end models without users adding their own API key" — use a model-aggregator platform behind ONE key SHADDAI holds (OpenRouter is already wired into `agent-engine.js`'s provider chain — reuse it rather than adding a new aggregator) and gate provider selection by tier: Free routes cheap/fast first (groq/ollama), Pro/Elite routes to stronger models first (openrouter/anthropic/openai). This is the concrete version of §3's "best models thru us" positioning.

---

## 2. THE ECOSYSTEM (what we're actually building)

One agent economy, two front doors:

- **SHADDAI** = the platform/dashboard/API. Agents work FOR people here: generate content, build websites, research markets, review code, price things, design, orchestrate.
- **Dreamers** = the creative/gaming/social layer on the same agent backend, same coin economy eventually. 2D climb game today; 3D spaces, podcasts, and "circular room" shared-but-private audio spaces are future scope (§6).

Both are powered by:
- The same 7 agents, same RAG brain, same MCP server
- Grok bot as an alternate front-end to the agents (chat interface)
- Payments: MoonPay (live) + Paybox (building) + x402 (Phase 2, micropayments)
- 3D marketplace: Forge (2D presets today) → Meshy integration (deferred until funded) for real generative 3D

### Revenue surfaces (nuance the user flagged — captured explicitly so nothing gets lost)
- Tiered subscriptions (Stripe — exists)
- One-off workflow purchases (Paybox checkout — building)
- **Pay-per-insight**: ZEROX market/coin-sentiment calls charged per use or by hit-rate (x402 micropayment — Phase 2)
- Forge trading fees (once Forge marketplace + Meshy are live)
- Coin economy (SHADDAI coin + DREAM coin — no contracts yet, Phase 3+)

---

## 3. MODEL ACCESS STRATEGY & 0→1M ROADMAP (owner vision, captured 2026-08-27)

### The positioning: don't compete on models, compete on outcome
Grok, GPT, Gemini, Claude, etc. are commodity inputs, not the product. SHADDAI's
differentiation is: the SAME frontier models, run THROUGH our 7 agents, our RAG
brain (grounded in real, growing, cited knowledge — §Phase 1 of the RAG plan),
our skill catalog (3,437 skills), and our tool/API connections — producing a
different, better-fit creative and analytical OUTPUT than using that model raw.
A user asking Grok directly gets Grok's generic answer. A user asking SHADDAI
(which may route to Grok, Claude, GPT, or whatever's best for the job under the
hood) gets an answer grounded in digested mastery content, routed through the
right specialist agent's persona and tools, citing real sources. **We're not
building a better foundation model. We're building the layer that makes any
foundation model worth more when it runs through us.**

Practically, this means:
- **Model routing stays invisible to the user.** They pick an agent or a task,
  not a model. Under the hood, `agent-engine.js`'s provider chain already does
  this (groq → gemini → openrouter → anthropic → openai → ollama, cheapest/
  fastest first, degrading gracefully) — extend it, don't replace it, as
  "premium model access" becomes a paid tier feature (higher-tier users route
  to stronger/pricier models; free tier gets the cheap/fast chain).
- **Tool/API access is the other differentiator.** As the empire scales,
  connecting more APIs (image/video gen, on-chain data, Higgs Field, whatever's
  next) through the MCP/tool layer means SHADDAI agents can DO more than a raw
  chat model ever could alone — this is the moat, not the LLM choice.
- **This is the same reason the MCP servers matter**: `mcp-server-rag.js` +
  the eventual Paybox MCP mean SHADDAI's grounded-agent-plus-tools stack is
  something OTHER tools (Claude Desktop, a Grok-based bot, whatever) can plug
  into and get the differentiated output too — the RAG brain + skills +
  tool access become licensable/usable infrastructure, not just a dashboard
  feature.
- **Named ecosystem partners (owner, 2026-08-28), all complementary not competing:**
  Paybox (agent wallet) + MoonPay (non-custodial trading) for the money/wallet
  layer; Claude + Grok bot + other chat surfaces as front-ends into the SAME
  agent/RAG/tool stack; the video clipper + Higgsfield + Hugging Face + Meshy
  for generative media/3D, feeding Forge and the 3D marketplace; gamers and
  content creators as the two core user archetypes the whole pipeline (§ above)
  serves. The token (§Phase 5, SHADDAI/DREAM coin) is the long-run unifying
  asset across all of it — still explicitly LATER, not blocking anything above.

### The pipeline (how everything connects)
Sparks (§1.4, $1 fixed unit) is the metering/billing spine that every piece
below plugs into:

```
User pays (MoonPay / Paybox / SOL / ETH)
        ↓ converts to
     Sparks ledger ($1 = 1 Spark, fixed)
        ↓ spent on
┌───────────────────────────────────────────────────────────┐
│ Agent workflows (content, research, code, design, pricing) │
│ Model access (premium routing, "use the best model" tier)  │
│ Video clipper + AI generation (image/video/music tools)    │
│ Forge / 3D marketplace (presets today, Meshy generative)   │
│ Pro Signals (ZEROX market/coin sentiment, pay-per-insight) │
│ Dreamers (2D game today, 3D spaces/podcasts later)         │
└───────────────────────────────────────────────────────────┘
        ↓ eventually settles through
     x402 (Solana micropayments, Phase 2) + SHADDAI/DREAM coin (Phase 5)
        ↓ unlocks
     NFTs (Forge output, collectibles), token utility, DAO/governance (Dreamers)
```

Coin + NFTs + the token launch are explicitly LATER (Phase 5+, not blocking
anything above) — the pipeline above needs to work on Sparks + fiat/crypto-in
first. Don't let "we need a token" block shipping the Sparks-metered product.

### 0 → 1,000,000 (users, not necessarily dollars — revenue follows usage)

**Stage 0 → 100 (founders + earliest users):** what exists today plus what's
in flight is enough — 7 real agents, RAG-grounded MCP, 2D world, MoonPay
payments, DIGESTED/SYSTEM knowledge tabs. Goal here is NOT more features, it's
proving 10-20 real people get real value and pay real Sparks for it. Access-
code-gated is fine and expected at this stage (per owner note: Forge/marketplace/
2D world can ship "in progress, access-code only").

**Stage 100 → 1,000 (Paybox + Sparks live, model-tier differentiation live):**
Sparks ledger fully wired (see Phase plan below), Paybox checkout live
alongside MoonPay, premium model routing as a paid-tier feature. This is where
"pay-per-insight" (ZEROX hit-rate charging) and workflow purchases start being
real recurring revenue, not just subscriptions.

**Stage 1,000 → 10,000 (MCP as licensable infra, x402 live):** other
tools/bots (a Grok-based bot, third-party agents) can plug into SHADDAI's
MCP server and get the grounded/tooled output — this is where "not competing
on models" becomes a real product, not just positioning. x402 micropayments
make agent-to-agent and pay-per-call metering possible at this scale without
a human clicking checkout every time.

**Stage 10,000 → 100,000 (Forge/Meshy live, coin launches, NFTs):** 3D
marketplace goes from presets to real generative 3D (funding permitting),
SHADDAI coin + DREAM coin mint, NFT pipeline (Forge output → mintable
collectibles) goes live, Dreamers' 3D spaces/podcasts ship.

**Stage 100,000 → 1,000,000:** desktop-agent form factor (owner's "mini 3D
form like three.ws" vision) — SHADDAI agents running as a local presence on a
user's own machine, not just a web dashboard. This is explicitly a LATER
platform bet, not near-term scope; flag it here so it's not lost, but nothing
before Stage 10,000 should be built assuming this exists yet.

**Ordering discipline:** each stage's revenue proof gates the next stage's
build. Don't build Stage 3 features (coin/NFT) while Stage 1 (Sparks + Paybox)
isn't proven with real paying users — that's the single biggest risk to this
plan (chasing token/NFT excitement before the metering spine actually works).

---

## 4. PHASE PLAN

### Phase 0 — Clean the floor (before anything else, ~1 day)
- [x] **Resolved (2026-09-11).** `MASTER-AGENT-SPEC.md` and `START-HERE-AGENT-BUILD.md` no longer exist in the repo — already deleted/archived. The `rag-brain-corpus-ingestion` worktree is gone and its work is merged (confirmed by Phase 1's own checklist below, and by `git worktree list` showing only the main checkout). The original "10 uncommitted files" is stale — this repo has had 130+ commits since this line was written; current uncommitted state is ordinary in-progress work, not a backlog to clear.

### Phase 1 — Finish the RAG brain (blocks everything "agent personality/lesson plan" related)
- [x] Task 4: `ingest-corpus` CLI — **done**, `backend/ingest-knowledge.js`, verified live-run 2026-08-27, corpus fully ingested
- [x] Task 5: MCP grounding — **done**, `backend/lib/grounding.js`, 16/16 tests pass, verified live-run 2026-08-27
- [x] Verify: asked each agent a grounded question, confirmed real corpus-backed answers (not generic) — **done**
- [x] Landing page visual bug (`brain-head.html` black screen, `pixel-forge.html` gradient crash) — **fixed**, committed `28771c9` in worktree
- [x] **Merged worktree `rag-brain-corpus-ingestion` into `main`** — done 2026-08-27 (`51ef19d`), clean merge, no conflicts. Brings the 3D cockpit, council GLB heads, digest-ranked search, DIGESTED/SYSTEM tabs, all of it, onto `main`.
- [x] **Server-side free/pro quota gate** — added on `/ask`, `/synthesize`, `/council`, `/crosstalk` (`b7de985`). Previously client-side-only (localStorage), trivially bypassed. Free tier: 3 grounded queries/day, then 402 + upgrade prompt. Pro/elite: unlimited, checked against `billing-service.js`'s real `TIER_CONFIG` (free/pro/elite) — not the stale pro/alpha/builder vocabulary the old client code used.
- [x] **"Clickable, summarizable knowledge"** — already built, just uncommitted: DIGESTED tab shows each source as chapters/insights/quotes with clickable ≈timestamp chips (deep-links into source video); backed by `/api/digests`, `/api/digest`, all 7 agents' pre-generated `digests.json`. SYSTEM tab shows routes-of-use + tools ledger. Committed `a11c4b7`.
- [x] **Search now favors organized knowledge over raw walls** — `searchChunks2` merges the digestion-pipeline index with the raw corpus, dedupes, and score-boosts digest hits 1.35x so a chapter/insight card outranks a raw transcript chunk for the same query.
- [x] **Lesson-layer Phase 3 (MCP grounding) — done** (`35fde60`). `mcp-server-rag.js`'s `rag_ask` now uses the same 5-layer grounding (routes/digests/static-KB/tools-ledger/learned-recall) the dashboard already had, and stores each answer back via `knowledge.learn()` — this is the literal "evolving" piece: every real question asked through Claude Desktop/MCP now grows the agent's knowledge, not just reads it. Added `get_route` and `list_digests` MCP tools per the spec. 23/23 self-test passing (`node backend/mcp-server-rag.js --self-test-full`).
  - Found + fixed a real bug along the way: AURA's `forCall()` token-saver runs deterministic pattern-solvers against the last user message before calling any LLM — a large knowledge blob in the user message could falsely trigger one and short-circuit the real answer. Fix: grounding context now lives in the system message, user message stays the bare question.
- [ ] Lesson-layer Phase 1 (full-corpus ingestion, 2,777 videos / 482k chunks from the old Python store) — still not done, only ~55 digests exist from the small curated pilot folder. Bigger data job, not started.
- [ ] Lesson-layer Phase 2 (LLM-synthesized digests via `claude-v1` engine) — explicitly deferred by prior owner decision, no `ANTHROPIC_API_KEY` being added. Stays deferred under the "no spend" instruction.
- [ ] Free-quota counter is in-memory (resets on server restart) — fine for a soft cap now; before Paybox billing goes live (Phase 2), move it to persistent storage so it can't be trivially reset by restarting the process.

**Model:** Sonnet for the merge + lesson-layer wiring, Haiku for test iteration.

### Phase 2 — Payments: Sparks ledger + Paybox + x402
- [x] **Paybox real tool surface confirmed + `paybox-guard.js` rebuilt for real (2026-08-29).** OAuth finally completed (took several attempts — the connector's flow-tracking was flaky, not user error). Real tools: `list_credentials`, `get_portfolio` (read-only) + `request_swap`/`request_transfer`/`request_payment`/`pay_x402`/`use_plugin`/`use_service` (money-moving, async — return a `request_id` + `pending_*` status, poll `get_request` to terminal, never re-call) + `discover_plugins`/`discover_services`/`use_plugin`/`use_service` (a Coinbase Bazaar/pay.sh x402 catalog — real-world purchases: Amazon via `purch`, flights via `brij`, etc) + `resolve_username`/`verify_solana_balance`/`get_buy_link`. Reached over MCP (JSON-RPC/HTTP at `{base_url}/mcp`, `Accept: application/json, text/event-stream` required) with a persistent `pbx_live_*` Bearer key from the Paybox app's Clients screen — no REST API exists separately, and this is a genuinely different credential from the browser-OAuth grant this Claude Code session used. `paybox-guard.js` rebuilt around this: same 5-layer safety scaffold as `pay-guard.js` (disabled by default, per-call cap, daily budget, human-approval gate, audited ledger) — only the transport was wrong before, now fixed. **`enabled` stays `false`.** Verified live from the backend itself (not this chat session): `get_portfolio` returned real wallet data (two wallets, $0 balance each — the connected wallets are currently empty).
  - **Real, important finding:** the connected wallets (`sol-default`/`evm-default`, and the user's own personal Solana wallet) are set to `approval_mode: "autonomous"` — Paybox will NOT additionally prompt for these; `paybox-guard.js`'s `enabled:false` + approval gate is the ONLY human checkpoint that exists for them today. Do not flip `enabled:true` without deliberately deciding to, and consider whether `autonomous` mode is really wanted given how much agent experimentation happens in this codebase.
  - ZEROX has its own dedicated wallets in Paybox ("Xerox Fomo Robinhood" EVM + "Xerox Fomo Solana") for per-agent spend attribution — as of 2026-08-29 evening, granting them to the ZEROX `pbx_live_*` connector is pending the owner's confirmation via a Paybox `manage_url` (their own passkey required) + pasting back a fresh signing key Paybox mints on grant. Not usable until both steps happen.
- [x] **CORRECTION (2026-08-28):** the Sparks ledger already existed and is genuinely well-built — `backend/economy-service.js` + `backend/economy-routes.js` (`/api/economy/*`). Postgres-or-atomic-file store, idempotent `grant`/`spend`, integer-only amounts, catalog + inventory, deliberately closed-loop (no cash-out — keeps SHADDAI out of money-transmitter territory). The earlier plan entry here calling for a new ledger was wrong — don't rebuild it.
- [x] **The real gap, found and fixed:** `stripe-webhook.js` (already live, signature-verified, idempotent) only ever granted the OLD SEPARATE `billing-service.js` "credits" system (LLM usage metering) — a real Stripe payment never touched the Sparks economy at all. Fixed (`7fa9d76`): `checkout.session.completed` now also grants Sparks computed from the actual amount Stripe charged (`session.amount_total`), at the owner-locked 1 Spark = $1 rate, idempotent on the Stripe session id. Verified: grant + retry-of-same-key → `replayed:true`, balance unchanged.
- [ ] ~~Wire Paybox checkout~~ — not applicable, Paybox is a wallet not a checkout processor (see correction above). Sparks top-ups stay on Stripe (done) + eventually direct SOL/ETH/USDC convert-then-credit.
- [ ] SOL/ETH/USDC direct-pay → convert to USD at payment time, then grant Sparks 1:1 the same way (never let Sparks float with crypto price)
- [x] **Decided (2026-09-11), via `backend/lib/tiers.js`'s own rule, not a new decision:** NO — no subscription-Sparks bonus. `tiers.js` already states "NO ALLOWANCE, NO FREE SPARKS... never handed out as a subscription sweetener." Only the raw Stripe `amount_total` converts to Sparks — correct, leave as-is.
- [x] **Tier-gated model routing — done** (`8991f87`). `callLLM()` looks up the caller's billing tier and reorders the provider chain: Free stays cheap/fast-first, Pro/Elite try anthropic/openai-premium/openrouter-premium first (new env-overridable `*_PREMIUM_MODEL` vars), falling back gracefully. Per-agent `preferredProvider` still wins position 1 either way. Fails open to free routing on any billing error. Structurally verified live (tier lookup + pref/order sequence confirmed correct); full success path needs real provider API keys to confirm end-to-end, which wasn't available to test here.
- [x] **Decided (2026-09-11):** subscription-only, no per-call Sparks debit. `tiers.js`: "TALKING IS NOT METERED" — Sparks are only for things that cost real money to produce (image/video/voice/3D/deliverables), never for chat/LLM calls at any tier. The existing `modelTiers` flat-unlock gating is the complete, correct design — nothing further to build here.
- [x] **x402 micropayment layer — bridge built (2026-09-11).** `backend/lib/economy-x402-bridge.js` settles `/api/x402/charge` into Sparks via `spend()`/`grant()`; off by default behind `X402_SPARKS_BRIDGE`, integer-only, idempotent, fail-safe (never breaks the existing SHAD-Credits charge). Wired additively into `x402-routes.js` (async handler, `settledInSparks`/`sparkBalance`/`sparksInsufficient` added to the charge response, informational only). 23/23 gate + 205/205 jest green. **Still not done:** real on-chain RPC verification for the SOL/ETH/USDC item below — `creditSparks()` exists and is tested, but nothing in this codebase calls it yet, and it must not be wired to an unverified on-chain "intent" (do not set `X402_SPARKS_BRIDGE=true` in production and start crediting on-chain payments until that verification exists). Hit-rate/ZEROX-signal billing on top of this bridge is not yet built.
- [ ] Forge trading fee hook (stub now, activate when Forge marketplace is live) — use the catalog system already in `economy-routes.js` (`sparks_price` / `usd_price_cents` dual pricing already supported)

**Model:** Sonnet for remaining integration/webhooks, Opus for x402 economic design (fee structure, hit-rate formula) and model-routing tier design.

### Phase 3 — Agent activation for real use
- [ ] Confirm each agent's `backend/data/agents/*.md` spec matches what's actually invokable via MCP (audit found specs exist — verify dashboard/Forge/2D world actually call live agent skills, not cached responses — audit flagged this as unclear, gap #9)
- [ ] Wire Grok bot as an alternate chat front-end to the same agent dispatch layer
- [ ] Dashboard "Agents" surface: people can ask agents to generate a website, content, research, lesson plan, market/coin sentiment (ZEROX)
- [ ] Fix Dreamers Climb spec drift (update doc to match 8-radio, no-VS reality, or decide whether to build VS mode)

### Phase 4 — Forge + Meshy + 3D marketplace
- [ ] Ship Forge "Build" UI (currently "coming soon")
- [ ] Meshy API integration for real generative 3D (image→3D), gated behind funding as originally planned — do not build until budget confirmed
- [ ] 3D marketplace buy/sell wired to Paybox + trading fee hook from Phase 2

### Phase 5 — Coin economy
- [ ] SHADDAI coin contract (Solana SPL)
- [ ] DREAM coin contract (Solana SPL)
- [ ] Mint/airdrop/stake APIs
- [ ] Tie into x402 settlement + Paybox coin pre-orders

### Phase 6 — Dreamers expansion (2D → 3D social)
- [ ] 3D circular "spaces" — private-audio-shared-room concept (people in the same room hear shared music, others in the space can't hear it unless invited in; talk to others outside independently)
- [ ] Podcast/spaces hosting inside Dreamers
- [ ] Fitness/workout and journaling content generated by agents (QUILL/RAG-brain-fed), tied into Dreamers UX

### Phase 7 — n8n + automation layer goes live
- [ ] Deploy `shaddai-orchestra.json` (currently local/sandbox only) to real infra
- [ ] Loop-engineering hooks: agents self-check, retry, escalate to SHADDAI for decisions

---

## 5. WHAT NOT TO DO
- Don't rebuild the 7 agents from scratch — they exist. Extend, don't replace.
- Don't touch MoonPay while building Paybox — additive only.
- Don't start Meshy work until funding is confirmed (original plan, still valid).
- Don't create a new Obsidian vault — decided against it (§1.3).
- Don't trust `DREAMERS_CLIMB_V16.39_MASTER_PLAN.md` numbers (radios/VS mode) — code is ground truth until spec is updated.

---

## 6. DETAIL DOCS STILL VALID (linked, not duplicated)
- Agent specs: `backend/data/agents/{QUILL,ORACLE,PIKADON,NEXUS,TURTLE,ZEROX,SHADDAI}.md`
- Agent skills: `backend/agents/agents/*/SKILL.md`
- RAG state: `backend/data/rag/README.md`, `backend/MCP-RAG-SETUP.md`
- RAG rebuild in progress: worktree `rag-brain-corpus-ingestion`, spec `docs/superpowers/specs/2026-08-23-rag-brain-lesson-layer-design.md`, plan `docs/superpowers/plans/2026-08-23-rag-brain-corpus-ingestion.md`
- Payments spec (for design intent, not as truth on what's built): `docs/specs/SPEC_agentic-commerce.md`
- World architecture: `docs/SHADDAI_MASTER_BLUEPRINT_2026-08-09.md`, `docs/SHADDAI_MASTER_BUILD_ARCHITECTURE_2026-07-24.md`
- Forge: `docs/FORGE-3D-PIPELINE.md`, `docs/FORGE_PARTS_SPEC.md`
- Dreamers: `Dreamers/ecosystem/{OVERVIEW,TOKEN-ECONOMY,NFT-SYSTEM,DAO,MARKETPLACE}.md`, `Dreamers/docs/COORDINATION-with-shaddai-terminal.md`

---

## 7. NEXT IMMEDIATE ACTION

Phase 1's core (RAG grounding) is done and verified. Phase 2 is now active — and further along than expected, since the Sparks ledger already existed:

1. **Done:** Stripe payments now actually credit Sparks (1 Spark = $1, computed from the real amount charged) — the ledger itself (`economy-service.js`) was already solid, it just wasn't connected to the one live payment rail.
2. **Building now: tier-gated model routing** — Pro/Elite users get access to stronger models (via OpenRouter, already wired) without adding their own API key, Free tier stays on the cheap/fast chain. This is the concrete "high-end models thru us" feature.
3. **After session restart with Paybox MCP connected**, list its tools and rebuild `paybox-guard.js` around what it actually offers (agent wallet operations, not checkout).
4. **Owner: decide** whether tier subscription purchases should also grant a Sparks bonus (not yet decided — only raw credit-pack/one-off amounts convert right now).
5. Then: x402 for pay-per-insight, Forge trading fees via the catalog system that already exists.

**Do not start Phase 3+ (coin, NFTs, Meshy) until Sparks + Paybox are proven with real paying users** — per §3's ordering discipline, chasing token/NFT work before the metering spine works is the single biggest risk to this plan.
