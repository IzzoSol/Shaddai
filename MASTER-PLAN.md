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
- Obsidian vault (does not exist on disk — knowledge is 4,295 scattered `.md` files)

### Known contradictions in old docs
- Dreamers Climb spec (`DREAMERS_CLIMB_V16.39_MASTER_PLAN.md`) says 3 radios + "VS mode coming soon"; actual code has 8 radios and no VS mode. Spec is stale — trust the code.
- `SPEC_agentic-commerce.md` names Paybox as the payment plan; actual production payments run on MoonPay. This file resolves that: **both**, see §2.

### Git state at time of writing
- `Shaddai` repo, `main` branch, 10 uncommitted files (see below) + 2 new speculative docs from before this audit.
- Worktree `rag-brain-corpus-ingestion` active — has the RAG finish-line work.
- `Dreamers` is a separate repo (`IzzoSol/Dreamers`), linked via `Dreamers/docs/COORDINATION-with-shaddai-terminal.md`.

---

## 1. DECISIONS LOCKED (owner-approved 2026-08-27)

1. **Payments:** Keep MoonPay as-is (production, working). Add **Paybox alongside it** as a second checkout path for crypto/card ordering (workflow purchases, insight paywalls, coin buys). Do not touch MoonPay code while building Paybox.
2. **x402:** Build it for real. It's the right protocol for **agent-to-agent and pay-per-insight micropayments** (hit-rate-based charging on ZEROX signals, forge trading fees). Scope: Phase 2, after Paybox checkout ships.
3. **Docs home:** This file (`MASTER-PLAN.md`) is the single canonical source of truth at repo root. Existing specs are NOT deleted — they're either linked below as still-valid detail docs, or marked superseded. No Obsidian vault gets built.

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

## 3. PHASE PLAN

### Phase 0 — Clean the floor (before anything else, ~1 day)
- [ ] Commit or revert the 10 uncommitted files in `Shaddai` main (`git status --short` to see them — includes `brain-server.js`, `public/brain.html`, agent data JSONs)
- [ ] Delete or archive `MASTER-AGENT-SPEC.md` and `START-HERE-AGENT-BUILD.md` (superseded by this file) once confirmed unused
- [ ] Merge or formally continue the `rag-brain-corpus-ingestion` worktree — don't let it go stale

### Phase 1 — Finish the RAG brain (blocks everything "agent personality/lesson plan" related)
- [x] Task 4: `ingest-corpus` CLI — **done**, `backend/ingest-knowledge.js`, verified live-run 2026-08-27, corpus fully ingested
- [x] Task 5: MCP grounding — **done**, `backend/lib/grounding.js`, 16/16 tests pass, verified live-run 2026-08-27
- [x] Verify: asked each agent a grounded question, confirmed real corpus-backed answers (not generic) — **done**
- [x] Landing page visual bug (`brain-head.html` black screen, `pixel-forge.html` gradient crash) — **fixed**, committed `28771c9` in worktree
- [ ] **Merge worktree `rag-brain-corpus-ingestion` into `main`** — 51 commits sitting unmerged, this is the only remaining step to make Phase 1 actually live outside the worktree
- [ ] Wire lesson-layer design (`2026-08-23-rag-brain-lesson-layer-design.md`) — this is what lets agents "create content and lesson plans based on the RAG brain" and keep improving as it's fed. Not yet verified as built — check after merge.

**Model:** Sonnet for the merge + lesson-layer wiring, Haiku for test iteration.

### Phase 2 — Payments: Paybox + x402
- [ ] Paybox checkout integration (new payment option, alongside MoonPay, not replacing it)
- [ ] Wire Paybox to: workflow purchases, tier upgrades, coin pre-orders
- [ ] x402 micropayment layer for pay-per-insight (ZEROX signals, hit-rate billing)
- [ ] Forge trading fee hook (stub now, activate when Forge marketplace is live)

**Model:** Sonnet for integration/webhooks, Opus for x402 economic design (fee structure, hit-rate formula).

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

## 4. WHAT NOT TO DO
- Don't rebuild the 7 agents from scratch — they exist. Extend, don't replace.
- Don't touch MoonPay while building Paybox — additive only.
- Don't start Meshy work until funding is confirmed (original plan, still valid).
- Don't create a new Obsidian vault — decided against it (§1.3).
- Don't trust `DREAMERS_CLIMB_V16.39_MASTER_PLAN.md` numbers (radios/VS mode) — code is ground truth until spec is updated.

---

## 5. DETAIL DOCS STILL VALID (linked, not duplicated)
- Agent specs: `backend/data/agents/{QUILL,ORACLE,PIKADON,NEXUS,TURTLE,ZEROX,SHADDAI}.md`
- Agent skills: `backend/agents/agents/*/SKILL.md`
- RAG state: `backend/data/rag/README.md`, `backend/MCP-RAG-SETUP.md`
- RAG rebuild in progress: worktree `rag-brain-corpus-ingestion`, spec `docs/superpowers/specs/2026-08-23-rag-brain-lesson-layer-design.md`, plan `docs/superpowers/plans/2026-08-23-rag-brain-corpus-ingestion.md`
- Payments spec (for design intent, not as truth on what's built): `docs/specs/SPEC_agentic-commerce.md`
- World architecture: `docs/SHADDAI_MASTER_BLUEPRINT_2026-08-09.md`, `docs/SHADDAI_MASTER_BUILD_ARCHITECTURE_2026-07-24.md`
- Forge: `docs/FORGE-3D-PIPELINE.md`, `docs/FORGE_PARTS_SPEC.md`
- Dreamers: `Dreamers/ecosystem/{OVERVIEW,TOKEN-ECONOMY,NFT-SYSTEM,DAO,MARKETPLACE}.md`, `Dreamers/docs/COORDINATION-with-shaddai-terminal.md`

---

## 6. NEXT IMMEDIATE ACTION

Phase 0 first (clean git state), then Phase 1 (finish RAG ingest CLI + MCP grounding) — everything else depends on agents actually being grounded in real, growing knowledge instead of static specs.

**Do not start Phase 2+ work until Phase 1 is verified working.**
