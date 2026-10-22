# SHADDAI — MASTER TRACKER

**One page. Everything done, everything left, in order.**
Last updated **2026-10-21**. Every "done" row below was **verified**, not assumed.

---

## 0. How to read this

| | |
|---|---|
| **DONE** | Shipped and verified. The evidence column says how. |
| **IN FLIGHT** | Started, not finished. |
| **NOT STARTED** | Ordered by what unblocks what. The gate column says what proves it done. |
| **DECISIONS** | Only the owner can close these. Each one blocks something. |

**The five master documents** (all in `docs/`, all on the `docs/society-layer-plan-20261020` branch):

| Document | Owns |
|---|---|
| `PLAN-SOCIETY-LAYER-20261020.md` | Tracks A (gateway) · B (Grok + forging) · C (3D realm) · D (money). 46-item gap register. |
| `PLAN-AGENT-LIFECYCLE-20261021.md` | Track E. The forged-agent lifecycle and the connector layer. 12 packages. |
| `SECURITY-BRIEF-20261021.md` | The real exposures, the PHP scoping, the standing orders for agents. 13 items. |
| `NEXT-OPTIONS-OPUS-BRIEF-20261021.md` | The three next options, reordered, with gates. OP-1..OP-7. |
| `CONTENT-ENGINE-AND-AGENT-INGRESS-20261021.md` | The content engine and the provider-agnostic ingress. CE-1..CE-8. |

**The rule: one plan, one table. This tracker is the index; the plans hold the detail.**

---

## 1. DONE — verified

### 1.1 Correctness (the catalogue now tells the truth)

| # | What | Evidence |
|---|---|---|
| 1 | **6 live surfaces fixed** that contradicted the no-staking policy | Mastery pack renamed "SHADDAI Token and Staking Pack v1" -> **"SHADDAI Economy Rules Pack v1"**; workflow `staking-stake-claim-loop` -> `platform-research-brief`; the `staking` catalogue skill -> a real `economy-rules` skill; `staking_reward.json` (called a **non-existent** tool) archived; graph + discovery references updated |
| 2 | **Dated logs annotated, not rewritten** | `eco-subagents.json` + `eco-discoveries.json` carry `[SUPERSEDED 2026-10-13: no staking, no yield, token optional and undecided]`. A log from 10-15 still says what was drafted then. |
| 3 | **Workflow family counts corrected** | Live truth: **609 tool- / 554 combo- / 270 skill- / 74 uc- / 21 stacks+framework / 114 pipelines**. The notes had tool- and combo- swapped. |
| 4 | **The policy is right everywhere it is written** | prices.json, the hub dossier, the master plan all already said "no staking, no lockups, no APR, no yield promises". It was only the *catalogue* that was wrong. |

### 1.2 The discovery layer — 16 headless routes, all live

| Route | For | Verified |
|---|---|---|
| `GET /api/headless/health` | liveness, tool count, workflow count | 200 |
| `GET /api/headless/catalog` | everything: prices, rails, splits, how to get in | 200, 25 KB |
| `GET /api/headless/price-index` | the flat price list, each row with its rail + payment steps | 200, 62 rows |
| `GET /api/headless/capabilities` | what the system can do, by domain, priced | 200, 49 KB |
| `GET /api/headless/sitemap` | the whole surface as one machine index | 200, 496 KB |
| `GET /api/headless/agents` | the council by name, tool counts, price-from | 200 |
| `GET /api/headless/domains/:id` | one capability domain in full, priced | 200 |
| `GET /api/headless/workflows` · `/:name` | every workflow, and one with its steps + `requires` | 200 |
| `GET /api/headless/skills` · `/:id` | the catalogue; one skill's **metadata only** | 200 |
| `GET /api/headless/jobs` | the open work market | 200 |
| `GET /api/headless/legal` | terms, policy, the value boundary | 200 |
| `GET /api/headless/whoami` | identity echo (truthful today: not built yet) | 200 |
| `GET /api/headless/search?q=` | tools + workflows + market in one call, by intent | 200 |
| `GET /api/headless/tools` · `/:name` | every tool, one tool's contract | 200 |
| `GET /api/headless/manifest` | the bot onboarding payload | 200 |
| `GET /api/headless/llms.txt` · `llms-full.txt` | the machine index; 971 tools with schemas | 200, 247 KB |
| `GET /api/headless/mcp.json` | the MCP server manifest | 200 |
| `GET /api/headless/feeds/catalog.xml` · `packs.xml` | RSS | 200 |
| `GET /api/headless/openapi.json` | a **real OpenAPI 3.1 spec**, 264 KB, one schema per tool | 200 |
| `GET /api/headless/call` · `workflow/run` | call a tool, run a workflow | 200 |

Plus, in the site root: `llms.txt` · `llms-full.txt` · `.well-known/mcp.json` · `.well-known/ai-plugin.json` · `.well-known/security.txt` · `sitemap.xml` · `robots.txt` · `showcase.html`.

### 1.3 The value boundary — the index is free, the content is not

| Protection | Detail | Verified |
|---|---|---|
| **`skill_get` no longer leaks** | It returned the **full methodology ungated** (4,655 chars for `pricing-strategy`). 3,022 skills x ~2,400 chars = **~7 MB of the product, free to any scraper** - and exactly what the mastery packs sell, where the creator keeps 75%. Now a **700-char preview** + the full length, and it says why. **The MCP stdio path is deliberately unchanged** - an agent doing work is not a scraper. | 928 chars returned, `preview: true`, `full_length: 4655` |
| **Two rate-limit buckets** | discovery **120/min**, execution **30/min**, per client, with `X-RateLimit-*` and `Retry-After`. Independent on purpose: a crawler reading prices is never blocked by an agent running workflows. | 40 parallel calls -> **30x200, 10x429** |
| **Cache headers** | `Cache-Control: public, max-age=300, stale-while-revalidate=86400` on the GETs | verified |
| **A real OpenAPI** | was 890 bytes of summary strings with no schemas | 264 KB, one schema per tool |
| **Terms** | `llms.txt` states it: index free and complete, content metered, attribute us, respect the rate limits | in the file |
| **Server code was never exposed** | Static roots are `public/` and the site dir only; every unknown path falls through to the SPA. Verified: `/backend/agent-engine.js` returns the **dashboard HTML**, not the source. | live probe |
| **Source-path denylist** | new `backend/lib/protect.js` - refuses `/backend/`, `/server/`, `/shaddai-mcp/`, `/docs/`, `/.git/`, `*.map`, `*.ts`, `*.sql`, `*.bak`, `package.json`, keys | mounted before every static mount |
| **MCP package gate now fails closed** | the passphrase was a **literal default in the source** (`ASCEND-MCP`) - the same as no gate. Now refused with 503 unless `MCP_PACKAGE_CODE` is set, compared with `timingSafeEqual` | patched |
| **Extra headers** | `Cross-Origin-Resource-Policy`, `Permissions-Policy`, `Server`/`X-Powered-By` stripped | mounted |
| **0 source maps** | none in `public/` | verified |

### 1.4 The content

| # | What | Evidence |
|---|---|---|
| 1 | **The showcase** | `public/showcase.html` + `content/showcase.html` - "One registry. Every bot." 6 live tiles, what a bot can sell with the price for each, the seven splits, the live market, the three steps to add a bot, and the FAQ that answers *where do I sign up* / *can they work without the 3D world* / *can my bots teach* / *do you resell Grok*. Says whether its numbers are **LIVE** or a **SNAPSHOT**. | rendered, 5 tables, 6 tiles, 0 errors |
| 2 | **Live samples** | `docs/showcase-samples.md` - **16/16 probes passed**, every block is the real captured output, including the honest failure (`rag_search` returns a Pygame tutorial at score 100). | 16/16 |
| 3 | **The diagram** | `portfolio/mcp-surface/` - "One registry. Every bot." 16 nodes, 17 edges, **every edge one column wide** so nothing routes on a lane. | **5/5 gates**, geometry clean, title contrast 16.4:1 |
| 4 | **The explainer** | `video/registry.mp4` - 36s, 864 frames, 2.2 MB. Hook "The adventure begins" + SHADDAI watermark burned in, 9:16. | rendered, **frames watched**, not just checked |
| 5 | **The hub** | Publish tab now carries the platform diagram, the explainer and the showcase. | 16 tabs, 4 videos, 0 placeholders unfilled |
| 6 | **The branded clip pipeline** (pre-existing) | `shaddai-hub` on :4545, clipper on :8788, **114/114 tests**. local file -> Whisper -> AI highlight -> 9:16 -> brand -> **human approve** -> `published-ready/` + sidecar | verified visually |

### 1.5 The build log (what changed, this session)

| Where | Change |
|---|---|
| `Shaddai-Beta/backend/routes/headless-routes.js` | + `/price-index` `/llms.txt` `/mcp.json` `/search`; the `skill_get` preview; the discovery bucket + GET caching; `/openapi.json` handed to the discovery router |
| `Shaddai-Beta/backend/routes/headless-discovery.js` | **new** - the whole discovery layer |
| `Shaddai-Beta/backend/routes/headless-rate.js` | **new** - the two buckets |
| `Shaddai-Beta/backend/lib/protect.js` | **new** - the source denylist + headers + the fail-closed gate |
| `Shaddai-Beta/backend/server-production.js` | the discovery router mounted; protection mounted before the statics; the MCP gate fails closed |
| `Shaddai-Beta/shaddai-mcp/data/*.json` | the 6 policy fixes + `catalog.json` + `llms.txt` + `llms-full.txt` + `mcp.json` |
| `shaddai-n8n/catalog/*.py` | **new** - the catalog, the showcase and the discovery generators |
| `shaddai-n8n/content/showcase.html` + `showcase-samples.md` | **new** - generated from live sources |
| `shaddai-n8n/public/llms.txt` · `llms-full.txt` · `.well-known/*` · `sitemap.xml` | **new** |
| `Shaddai/public/showcase.html` · `llms.txt` · `llms-full.txt` · `robots.txt` · `sitemap.xml` · `.well-known/*` | **new** - the product surface |
| `shaddai-design-studio/portfolio/mcp-surface/` | **new** - the gated diagram |

### 1.6 Two bugs I found in my own work (worth keeping)

| Bug | How it was caught | Lesson |
|---|---|---|
| The **rate limiter was a no-op** - `make()` built a fresh bucket per request and never wrote it back to the map, so the counter was always 1. | Firing 40 parallel calls: every one returned 200 and `remaining` never moved off 29. | **A limiter that has never been load-tested is a guess.** It now returns 30x200 / 10x429. |
| The **discovery layer was mounted inside a `try` block** that was split by a bad patch, which broke the server. | `node --check` caught it before a restart. | Syntax-check every server edit. |

---
### 1.7 The RAG brain now answers about SHADDAI

The complaint was exact: the brain was not answering, it was **regurgitating excerpts** and returning **random useless information**. Now it is measured, diagnosed and fixed.

| Metric | Before | After |
|---|---|---|
| precision@1 | **7%** | **100%** |
| precision@3 | 53% | **100%** |
| answer coverage | 27% | **100%** |
| **off-topic rate** | **93%** | **0%** |
| abstention | 0% | **50%** |

**The measurement** is `backend/scripts/rag-audit.mjs` — 19 probes (15 that must be answered, 4 that must be abstained from). Baseline and result are saved as `docs/rag-audit-baseline.json` and `docs/rag-audit-after.json`.

**The diagnosis:** the corpus is almost entirely spoken-word video transcripts with **no authoritative statement of the platform's own rules** — so the nearest thing to an answer was a business course that happened to say "revenue". Measured, not guessed: *"what are the seven revenue splits"* retrieved **"battle pass design secrets"**; *"how do I pay"* retrieved **"jump transport — instant fast travel in vanilla Minecraft"**.

**The fix — two tiers:**
- **Tier 1, platform knowledge.** Four authored, structured documents generated from `prices.json` and `catalog/catalog.json` so they **cannot drift** from the real numbers: the economy · the registry and its prices · how a bot gets in · the agent lifecycle, job market and council. A platform question is answered from it **directly** — exact, cited, **no LLM in the loop, nothing to hallucinate**.
- **Tier 2, the brain.** 91k transcript chunks, still right for everything else, and the fallback when tier 1 does not apply.
- **Hygiene.** `tokenize` now undoes HTML entities first (`&gt;` `&amp;` `&#39;` leak out of transcripts and carried the largest tf-idf weights in the worst chunks — `"gt"` scored **0.56** in one), drops two-character tokens (`um`, `uh`, `gt`, `ve`, `ll`), and drops transcript filler (`like`, `really`, `gonna`, `kinda`...).
- **A tunable floor.** `MIN_RELEVANCE` and the `relevant` flag are now env-tunable, so abstention is calibrated against the audit instead of guessed.

**Three bugs in the audit itself**, because a measurement that lies is worse than no measurement: it read only the first 90 characters of a result (the title, not the text); it passed `query` where `rag_ask` wants `question`; and it did not warm the MCP, so the first probe after a restart read a boot error.

**Excerpts became knowledge — three more real defects, all fixed.**

1. **The chunker sliced on WHITESPACE** into 500-word windows, so every chunk began and ended mid-sentence. That is *why* retrieval read like a pile of excerpts. It now packs **whole sentences** into ~500-word windows.
2. **The stored text was raw speech.** The chunks carried &gt; as a term, and gt scored **0.56** in one of the worst - the single largest weight in that vector. Now decodeEntities() (always safe) and cleanSpoken() (filler, doubled words, punctuation) - and cleanSpoken applies **only to spoken documents**, so prose is never touched. The 91k existing brain chunks are cleaned at the **output boundary**, so they read well now without the 890 MB rebuild.
3. **A score cannot tell an answer from a coincidence.** A broad transcript corpus always contains something similar to something. So the brain's relevance gate now uses a **coverage** test - and the coverage is **IDF-weighted**, so a rare term (*n8n*, *1994*, *Reykjavik*) counts for far more than a generic one (*skills*, *workflow*). The platform tier likewise needs **most** of the question's distinctive terms before it takes over, so *"how do I build an n8n workflow"* no longer gets answered from our own docs.

**The audit now measures readability too** - junk_density, the share of a returned answer that is filler and entity fragments. It reads **0%**.

**Remaining, stated plainly:** abstention is 50%. Two of the four must-abstain probes still get an answer, because the corpus genuinely holds broad educational material (philosophy, music, sport) and a rare term can still land in an adjacent chunk. The gate is now IDF-weighted and tunable (SHADDAI_RAG_COVERAGE); tightening it trades against answer coverage, and **0.5 was the best measured compromise** (0.34 scored the same; 0.12 was worse). Calibrating it properly needs a larger probe set - which is the honest next job, not a tweak.

## 2. IN FLIGHT

| Item | State | What is left |
|---|---|---|
| **PR #2** (`docs/society-layer-plan-20261020`) | 34 commits, 17 files, docs-only, off `main` | **Owner merge.** The discovery layer only reaches the internet after this merges. |
| **Lab branch** (`Shaddai-Beta` `fix/policy-honesty-and-catalog-endpoint`) | 3 commits: the policy fixes, the catalog + discovery endpoints, the value protection, the rate-limit fix | Promote to the product backend, **after OP-1**. |
| **The gateway is not deployed** | `/api/headless/*` is 404 on both live hosts | Deploy it **behind the gate**, not before. |

---

## 3. NOT STARTED — in order

### Phase 1 — the gate (blocks everything public)

| ID | Package | Gate |
|---|---|---|
| **OP-1** | **Auth on the whole gateway.** Identity from `softAuth` -> `req.userId`. Per-bot key -> `{botId, owner, scopes, quota, wallet}`, hashed, revocable. `SHADDAI_ENABLE_MONEY` default `'0'`. Tool deny-list. `forge_run` path-confined. Honest failures (unknown tool -> 404, not `ok:true`). Scraped content is data, never orders. `findSecret()` extended to `hf_`/`gsk_`/`sk-`/`AIza`/`Bearer`. The `isMcp` allow-list exemption removed. | **9/9 routes return 401 without a key.** A valid key with no money scope cannot reach a money tool. A deny-listed tool is refused. An injected mismatch raises an alert. |
| **OP-2** | **Per-bot identity, quota, x402 wallets.** Wire the AURA usage service that already exists (reserve/settle/release; release on every exit path). The 4-level kill switch. Audit with the principal on every line. Per-bot payout address, chain-validated, address-only. | keyless 401 · over-quota 429 · global kill 503 · one full 402 quote -> pay -> settle -> ledger. |

### Phase 2 — the truth of the registry

| ID | Package | Gate |
|---|---|---|
| **OP-3** | **Registry parity.** `/tools` lists all ~1,074 once with schemas. `/manifest` generated from the registry (no hand lists). The 270 playbooks live in **one** file, with a byte-identical parity test. A real OpenAPI (done). | delete a tool -> it disappears from `/tools` and `/manifest` on the next request. |
| **A-2** | The manifest's ghosts: `intent_route`, `usecase_list`, `workflow_categories` do not exist. `health_check` **does**. | a bot completes the whole `start_with` sequence with zero "Unknown tool". |

### Phase 3 — the surfaces

| ID | Package | Gate |
|---|---|---|
| **OP-4** | **The gateway in the dashboard.** `public/js/shd-headless.js`, mounted through the existing `showView(v)` registry. **Never grow `index.html`** (3.62 MB). Tool search · one-call manifest · workflow browser with `requires` visible · live run + streaming · quota panel · key management. | two different test users prove scoping (another user's bot -> **404**, not 403). Owner visual review. |
| **OP-5** | **One provider-agnostic ingress over TLS.** Not "a Grok connector and a Muse connector" - **one protocol**, with a brain roster: xai · meta · anthropic · openai · groq · gemini · openrouter · ollama · **webhook**. The `webhook` entry is the one that keeps us cohesive with innovation: any agent, any host, any language, with no connector written for it. Muse's `contributor` aliases stay blocked for private/paid work. | a bot with a key lists and calls over TLS; a **webhook** agent completes the same round trip; a contributor-mode Muse alias is refused for a privacy-flagged agent. |
| **OP-6** | **The founder demo.** One screen: manifest -> tool_search -> tool_info -> workflow_run -> charged -> creator paid. The diagram and the explainer are the assets. | the one screen, end to end, on a real host. |

### Phase 4 — the economy

| ID | Package | Gate |
|---|---|---|
| **D-1** | **One price source.** `prices.json` wins. Add the missing `$2.99` per-deliverable unlock. Reconcile the three conflicting tier sets. Point the Stripe Payment Links at the chosen tiers (**live money - owner approval**). | one file -> the dashboard, the hub, the simulator, the n8n map and the world all show the same price. |
| **D-3** | **The Spark rail.** Mount `sparksRoutes` + `sparksCore` (they exist). Move the game-forge MCP off the `:3001` clash to `:3002`. | `:3001` boots; **no** cash-out, redeem or sell-back path exists anywhere. |
| **D-4** | **Fund and flip.** Fund the wallets (Base ETH + Solana SOL). Flip the paywall deliberately. Open the first paper trades -> weekly win/lose -> publish at 30+ closed trades. | one real receipt end to end. **This is the "first dollar" milestone.** |
| **D-5/D-6** | Import the 4 n8n workflows + creds. Implement the reconcile node (it is a `// TODO` today). | the nightly poll reconciles PayBox against the hall ledger; an injected mismatch alerts. |
| **D-2** | **The consultancy line.** The engagement model + invoices + per-client scoping. Strict scoping: another client's resource -> 404. | an engagement, tracked tasks, an issued invoice, and a second client who cannot see it. |
| **D-7** | **The token decision** - a *decision*, not a build. MRR > $2k sustained 3+ months **AND** securities counsel **AND** a defined non-speculative utility. All three or none. Meanwhile: add no on-chain surface. | a one-page decision doc next to `prices.json`, so no session re-litigates it. |

### Phase 5 — the 3D world

| ID | Package | Gate |
|---|---|---|
| **E-1 / CE-1** | **Mount the ingress.** `/xagent` + `/jobs` + `/agent` + `/sparks`. The code exists; it is unmounted. | register -> claim -> accept -> deliver -> approve -> pay, one run, idempotent. |
| **E-3 / CE-2** | **One identity for external bots** (the UAR, keyed by `agentId`). | a bot resolves by id, not by name; two bots with the same display name stay independent. |
| **E-7 / CE-3** | **The brain roster** in the BYOK vault, with each provider's data-use rules. **Muse added.** | the contributor rule is enforced in the product, not in the unmounted gateway. |
| **C-1** | **The world corpus.** Ingest `Shaddai-3d/docs/` into the brain **and** publish the conventions as skills. | `rag_search("how are sparks split")` returns the splits, not a Pygame tutorial. **Highest payoff of anything left.** |
| **C-2** | **The Blender toolkit as tools** (7 functions exist as a script). | `model_info` on a rigged council agent returns ~1.75 m, not 0.018 m. |
| **C-3** | **The 439-asset queue, machine-driven and probe-gated.** | 10 assets placed end to end with probe numbers, zero manual placement. |
| **C-4** | **Gameplay in the owner's order.** W-A Colosseum black screen + far-side entrance · W-B combat/lock-on verify (wired 10-09, never run in a browser) · W-C FPS/load (3,166 draws, 91,435 ms playable) · W-D hoverskate v2 + HOVERPAINT · W-E water · W-F lava/Emberfall · W-G realm cities · W-H Colosseum 7+ · W-I the 7 agents. | per item: 0 page errors, before/after draws + tris + ms in the commit, tests green, owner visual QA. |
| **C-5** | **Cosmetics priced from `prices.json`**, driven by the `forge-core` chassis, rendered by `world-agent-gear.js`. | one price file -> the catalog, the world and the hub. The chassis renders. |
| **C-6** | **The world calls the headless API.** | an in-game agent completes a task through the gateway and the result appears in the world. |
| **CE-5/CE-6/CE-7** | The sidecar links the published files. A publish-a-link channel for non-video artifacts. The new assets go through the same human gate. | the sidecar beside an artifact links to the artifact. |

### Phase 6 — discoverability and protection

| ID | Package | Gate |
|---|---|---|
| **SEO-1** | **Per-domain capability pages.** `/capabilities/<domain>.html` - a human or an agent searching *"logo design api"* lands on a **priced** page for that exact thing. Generated from the same catalog. | one page per domain, all from live data, sitemap updated. |
| **SEC-1** | **Minify + obfuscate the client.** 190 JS files, **9 MB**, currently fully readable. `npx terser` into `public/dist/` + a `?v=` cache-bust. **This raises the cost of reading; it stops nobody.** The only real fix is moving the value server-side. | a size report before/after, and the pages still work. |
| **SEC-2** | **Move the value server-side.** A standing rule, not a task: anything worth stealing belongs in `backend/`. | a review of the client for logic that should be server-side. |
| **SEC-3** | **The observatory** - watch for scrapers: which routes, which IP, how fast. | an alert when one client pulls the index at a rate that reads like extraction rather than integration. |
| **OPS-1** | **Commit the 276 uncommitted deletions** in Shaddai-3d. They are the owner-approved purge; committing makes the 1.25 GB permanent and stops a stray `git checkout .` re-filling the disk. | the disk stays at 5.7 GB. |
| **OPS-2** | **A branch per phase, never `main`.** Render auto-deploys `main`. | — |

---

## 4. DECISIONS — only the owner can close these

| # | Decision | Blocks | My recommendation |
|---|---|---|---|
| 1 | **The tier set.** Three disagree: blueprint $9.99/$29.99/$79, `prices.json` $0/$49/$199/$999, copilot-instructions $0/$30/$200/$100. | D-1, the Stripe links, every pricing surface | **`prices.json` wins** - it is declared master twice and is far the most complete. Update the copilot text to match. |
| 2 | **The `$2.99` per-deliverable unlock** - the documented first dollar, missing from the master file. | D-1 | **Add it.** It is the fastest route to a first receipt. |
| 3 | **xAI and Meta resale** | OP-5, the connector list | **CLOSED - we do not resell model inference.** The only rule left is Muse's contributor data-use. |
| 4 | **Muse's contributor models** | OP-5, CE-3 | **Never for private or paid work without explicit consent.** Confirm in writing in the connector entry. |
| 5 | **Consultancy verticals** to launch with (coaches, real estate, insurance, clinics, accountants, law, agencies, education) | the onboarding wizard, the founder pages | Pick 3. Depth beats breadth. |
| 6 | **The token** | D-7 | Confirm the gate, or say **never**, and write it into the decision doc. |
| 7 | **The dashboard nav link** to the showcase (one line in the 3.62 MB monolith) | the founder demo | **Yes** - it is the product surface and it is one line. Needs Opus review. |
| 8 | **The showcase on the landing page** as the first thing a founder sees | the founder demo | Yes, after OP-1 lands. |
| 9 | **Per-bot key format** - `shdx_` (one credential type) or a separate `shk_` | OP-2 | **Separate.** An external bot's key and an internal service's key have very different blast radii. |
| 10 | **Quota shape** - flat daily cap, or weighted per tool? | OP-2 | **Weighted.** The AURA service already prices per tool. |
| 11 | **Who may mint a bot key** - owner only, or any Pro/Max user for their own bots? | OP-2, the business model | Depends on #1. It decides whether option 2 is a feature or a business. |
| 12 | **`agentId` vs codename** as the primary key | E-3 | **`agentId`.** Codenames collide; ids do not. |
| 13 | **Disk** - commit the 276 deletions now? | OPS-1 | **Yes.** It makes 1.25 GB permanent and stops the disk refilling. |
| 14 | **The Obsidian `VAULT-MAP.md`** - 4 vault roots, no index | nothing | Add one pointer file, **move nothing**. |

---

## 5. HOW TO VERIFY ANY OF IT

```bash
# the gateway is alive
curl -s http://127.0.0.1:3000/api/headless/health

# the discovery layer
curl -s http://127.0.0.1:3000/api/headless/llms.txt | head -30
curl -s http://127.0.0.1:3000/api/headless/price-index | head -c 300
curl -s http://127.0.0.1:3000/api/headless/capabilities | head -c 300
curl -s http://127.0.0.1:3000/api/headless/openapi.json | head -c 200

# the value boundary
curl -s -X POST http://127.0.0.1:3000/api/headless/call \
  -H 'Content-Type: application/json' \
  -d '{"name":"skill_get","params":{"id":"pricing-strategy"}}' | head -c 300
# -> a 700-char PREVIEW, not the 4,655-char method

# the catalogue is honest
curl -s -X POST http://127.0.0.1:3000/api/headless/call \
  -H 'Content-Type: application/json' -d '{"name":"mastery_list"}' | head -c 400
# -> "SHADDAI Economy Rules Pack v1", no staking pack

# the samples are real
python shaddai-n8n/catalog/build-samples.py

# the diagram passes its gates
cd shaddai-design-studio
node tools/diagrams/finalize.mjs architecture portfolio/mcp-surface/mcp-surface.json portfolio/mcp-surface/mcp-surface.html
```

**Regenerate everything from live sources:**
```bash
python shaddai-n8n/catalog/build-catalog.py      # the catalogue + the 62-price index
python shaddai-n8n/catalog/build-discovery.py    # llms.txt, llms-full.txt, mcp.json, feeds, sitemap
python shaddai-n8n/catalog/build-showcase.py     # content/showcase.html
python shaddai-n8n/catalog/build-samples.py      # content/showcase-samples.md
```

---

## 6. THE ONE-LINE VERSION

> We have a **complete, well-designed, unfunded** economy; a **registry of 1,074 tools** that is now **honest, discoverable and protected**; a **discovery layer** any bot can read for free; a **value boundary** that keeps the product from being scraped; and **~40 KB of finished agent/world code that is written but not mounted**. The next dollar is not in building more. It is in **gating what exists, mounting it, and turning on the paywall.**

*Everything above was measured or read out of the running system on 2026-10-21. Where a number was wrong, this tracker says so and gives the corrected value.*
