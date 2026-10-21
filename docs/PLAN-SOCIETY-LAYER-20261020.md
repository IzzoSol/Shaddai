# SHADDAI — SOCIETY LAYER & FINAL BUILD PLAN (2026-10-20)

**Status:** MASTER PLAN · **Owner:** Izzo · **Author:** Opus session, 2026-10-20
**Repos:** `IzzoSol/Shaddai` (product, Render auto-deploys `main`) · `IzzoSol/Shaddai-Beta` (lab) · `shaddai-n8n` (hub) · `Shaddai-3d` (world, pushes to `IzzoSol/Shaddai`)

> **Thesis.** SHADDAI is a *society layer*: one tool registry, many callers — Grok, Muse, n8n, Telegram, curl, cron, the seven council agents, and the 3D world itself. The registry already exists (1,074 tools · 1,633 workflows · 1,356 n8n exports · 3,022 skills). It is not yet *honest*, not yet *discoverable*, and not yet *reaching the world*. Fix those three and the rest of the build stops being a pile of manual work.

---

## 0. How to use this document

| Rule | Detail |
|---|---|
| **This is the source of truth for the plan.** | The Obsidian handoffs (7 of them, in 4 different vault roots) are the *inputs*. This file is the *output*. |
| **The Status table (§11) is the progress tracker.** | Tick the box, fill Evidence. Do not create a second tracker. |
| **Every package has a Gate.** | A package is NOT done until its gate passes AND the status row is updated. |
| **`OPUS` column = must be reviewed by Opus before merge.** | New work may be built by any model. Existing code is not to be modified without Opus review. |
| **One heavy job at a time.** | Blender export · video render · headless browser · full RAG reindex. Never two on this box. |
| **Never push `main`.** | Render auto-deploys it. Push a branch; owner merges. |
| **Never delete to free disk without asking.** | C: is at 2.7 GB. |

**Reading order for a fresh session:** §1 (map) → §3 (audit, so you know what is real) → §4 (gap register) → the track for your task → §9 (doctrine) → §11 (status).

---

## 1. The map — what we actually have

### 1.1 Repos

| Repo | Path | Role | Canonical for |
|---|---|---|---|
| `IzzoSol/Shaddai` | `C:\Users\Brittany\Shaddai` | **THE PRODUCT.** Render auto-deploys `main`. 109 HTML pages, no build step. | Dashboard, agent forge, agents, pricing page, academy |
| `IzzoSol/Shaddai-Beta` | `C:\Users\Brittany\Shaddai-Beta` | **THE LAB.** Headless gateway + canonical `shaddai-mcp` + 1,356 n8n exports + concept map + brain. | Headless gateway, MCP, n8n exports, brain index |
| `Shaddai-3d` | `C:\Users\Brittany\Shaddai-3d` | The 3D world. Pushes to `IzzoSol/Shaddai`. Branch `agents/1`; `main` = `26ef43d2`. | World, assets, perf probes, placement queue |
| `shaddai-n8n` | `C:\Users\Brittany\shaddai-n8n` | The hub (`SHADDAI-FINAL.html`), revenue maps, scale simulator, audience pages + videos. | Hub, money map, `prices.json` copy |
| `shaddai-academy` | `C:\Users\Brittany\shaddai-academy` | Academy 4-layer server on `:8787`. | Teaching, mastery packs, quotes→pay→run |
| `shaddai-consultancy` | `C:\Users\Brittany\shaddai-consultancy` | MMO server `:3001`. **CANNOT BOOT.** | Arena/economy — blocked on G-16 |
| `shaddai-design-studio` | `C:\Users\Brittany\shaddai-design-studio` | `portfolio/revenue2` = the single master money map. | Diagrams |
| `shaddai-mcp-repo` | `C:\Users\Brittany\shaddai-mcp-repo` | **Public edition** (key-free). Dirty: 30 files staged-deleted, never committed (G-23). | Public distribution |

### 1.2 Obsidian — 4 roots, no index

| Root | Holds |
|---|---|
| `OneDrive\Desktop\Downloads\OBSIDIAN\SHADDAI OBSIDIAN` | Main vault. `03 Builds` (71 md) incl. **World Handoff 2026-10-15**. `03 Builds\BLUEPRINT-SECTIONS\` = the ZEROX revenue pillars. |
| `OneDrive\Desktop\02 Agents\SHADDAI` | The 8 MCP notes + `00-INDEX.md` (written 2026-10-20). |
| `OneDrive\OBSIDIAN\SHADDAI OBSIDIAN` | `SHADDAI FINAL MASTER PLAN 2026` (2026-10-13), World Handoffs 10-16 & 10-17, economy whitepaper (`08_Economy/`). |
| `OneDrive\Documents\Obsidian Vault` | Session logs. |

**Decision (low risk):** do not move files. Add one `VAULT-MAP.md` to the main root that points at all four. Moving risks breaking links for zero gain.

### 1.3 The live surfaces (verified 2026-10-20)

| Surface | Status | Notes |
|---|---|---|
| `http://127.0.0.1:3000/api/headless/*` | **LIVE** | `Shaddai-Beta\backend\server-production.js` (PID 20244). 971 hosted tools · 1,633 workflows. |
| `shaddai-mcp\mcp-unified.js` | LIVE (PID 9368, 5040) | 520 tools over stdio. Canonical copy. |
| `Shaddai\shaddai-mcp\mcp-unified.js` | **LIVE but STALE** (PID 9328) | Oct-1 copy, 138 KB, missing creative/skills/knowledge modules. → G-08 |
| `rag-brain` MCP | LIVE | 91k chunks, 7 personas. **No 3D-world corpus.** → G-09 |
| `aura` MCP | LIVE | Token saver. `aura_ask` / `aura_remember`. |
| `Shaddai-Frames` agent MCP | LIVE | |
| `tg-signals`, `tg-virtuals` | LIVE | Keep running. |
| Academy `:8787` | live (per 10-15) | |
| MMO `:3001` | **DEAD** | → G-16 |
| Game-forge MCP | port clash `:3001` | → G-17 |

---

## 2. The diagrams and revenue streams, explained

### 2.1 The money spine — `prices.json` v1.1.0 (declared master)

**Everything prices flows through this one file.** It is the master for the hub, the simulator, the n8n revenue map, and the world.

```
  REVENUE IN
  +-- Platform tiers (self-serve)        +-- Tool calls (USDC, per-call)     +-- Consultancy (done-for-you)
  |   Explorer $0                        |   zerox_price      $0.25          |   Setup Sprint   $499  (one-time)
  |   Builder   $49                     |   zerox_sentiment $0.25          |   Whole Brand  $1,999  (one-time)
  |   Mastermind $199                   |   zerox_market_scan $0.50        |   Care    $99/mo
  |   Empire   $999                     |   workflow_run     $0.50          |   Growth $249/mo
  |   (Explorer $0 | Builder 3 agents |   graph_context      $1.00          |   Dominate $499/mo
  |    Mastermind/Empire 7 agents)       oracle_chart       $9.00          |
  |                                      quill_rewrite      $1.00          |  <-- MISSING from prices.json:
  |                                      pikadon_review     $2.00          |    per-deliverable unlock $2.99
  |                                      turtle_brief       $3.00          |    (the documented first dollar)
  +-- 7 Offices (per-call)               +-- Catalog                         +-- Mastery packs (75% creator royalty)
  |   academy teach 2 / class 1 / enroll .5   plan base $8               13 live @ $25-79
  |   nexus-forge build 2 / review 1 / plan .5   books $5-9             **0 sales to date**
  |   zerox-trading scan .5 / signals 1       mastery royalty 75%       (one pack renamed
  |   turtle-art design 1 / logo 1.5 / brief .5                              "Economy Rules")
  |   oracle-research research 1 / chart .5   subs accounting $0.10/task
  |   quill-voice copy 1 / rewrite .5 / thread .5
  |   pikadon-gate audit 1.5 / review 1
  +-- Founders passes (after first revenue)
      Genesis 100 | Pioneer 500 | Settler 1000
```

**Spark peg:** `1 spark = $1.00` target, 6 decimals (0.5 spark = 50c), dust floor `0.000001`, min-tx `0.01`. **Sparks are store credit. NO cash-out, NO staking, NO yield.** The peg is defended by sinks >= faucets.

### 2.2 The seven splits — every unit of revenue divides exactly

| Stream | Split | Meaning |
|---|---|---|
| Avenue (office calls) | owner **85** / hall **15** | The agent's owner keeps 85c of each dollar |
| Purse (battle/race) | winner **70** / owner **15** / hall **15** | Entry escrow **before** the tilt; PIKADON arbitrates |
| Tickets | owner **80** / hall **20** | Colosseum: floor 50 / lower 25 / promenade 15 / upper 10 / lobby 100 sparks |
| Bazaar | seller **85** / hall **10** / referrer **5** | Agent-to-agent commerce |
| Bridge | platform **15** / external owner **50** / coordination **35** | External bots (Grok) routed through SHADDAI |
| Planting | reserve **50** / replant **40** / farm owner **10** | Farms/trees loop |
| Mastery | creator **75%** | Skill-pack sales to creators |

### 2.3 The flywheel — where revenue gets allocated

```
revenue -> 30% reserve
        -> 20% treasury ops
        -> 20% founders + community share
        -> 15% sinks        <-- these defend the peg
        -> 10% farms + trees
        ->  5% giveaways / plots reserve
```
Internal allocation. Subject to change. Every split must sum to 100.

### 2.4 The five revenue avenues (n8n `revenue-streams-map`, 13 nodes)

```
Manual trigger --+
                 +--> Academy API ----> Split by stream --+-> 1 Ledger receipt  (office 85/15)
Nightly poll ----+-> Paybox totals --> Reconcile vs ledger (!! TODO - not implemented)
                                                    |
                                                    +-> 2 Paybox credit    (academy plans $8, books $5-9)
                                                    +-> 3 Royalty 75%      (mastery packs - 0 sales)
                                                    +-> 4 Purse 70/15/15   (battles + races)
                                                    +-> 5 Ticket share 80/20 (tickets, plots, subs, jobs)
```
Sticky notes also flag: **BLOCKER — MMO :3001 cannot boot** and **do not run 2 MMO instances** (in-process locks, JSON files).

### 2.5 The seven revenue streams (ZEROX blueprint section 3) — turn-on order

| # | Stream | Gate to turn on | $ contribution | Status |
|---|---|---|---|---|
| A | **Subscriptions** | Immediately (after legal docs) | 75-80% of revenue | Tiers exist; Stripe links live in `pricing.html` |
| B | **Per-deliverable unlock $2.99** | Same sprint as subs — **fastest first dollar** | +15-25% over sub MRR | **NOT IN prices.json** — gap |
| C | **Sparks Shop** (closed-loop) | ~50 users | $0 direct; retention lever | Retail catalog + world cosmetics exist |
| D | **Bazaar take-rate 5-10%** | GMV >= $2k/mo | $300-600/mo at $5k MRR | Splits defined; no GMV |
| E | **Collectables / cosmetic NFT** | ~700 users | $200-600/mo | Founders passes defined; 0 issued |
| F | **Partner-portal placement fees** | World DAU >= 300 | $100-1,000/mo per partner | Not built. Highest margin, near-zero marginal cost |
| G | **Creator worlds** | ~800 users | $200-800/mo + network effect | Not built |
| H | **AURA-as-a-service** | Dev inbound (~Day 240) | $100-500/mo upside; mainly distribution | AURA is live + published |
| I | **ReFi / impact** | From first real fees | **Negative by design** — trust, not income | 1% flag only |
| J | **$SHADDAI token** | **MRR > $2k sustained 3+ months + securities lawyer + defined non-speculative utility** | Do NOT model as revenue | **See section 8 D-07** |

### 2.6 The money reality (honesty ledger, 2026-10-15 — verify before quoting)

> **$0 receipts. 0 sales. Wallets unfunded. Paywall off. Everything below is paper until gas + first USDC.**
> Paper $10k / 0 trades (no edge claimed) · SOL $106.01 · Fear/Greed 53 at design time · AURA cache 61% hits · Academy runner 15+ jobs, **~$2.70 earned** · specialist agent backends unreachable that session, so their quoted advice was the author's, grounded in comps.

**This is the single most important sentence in the plan.** We have a complete, well-designed, *unfunded* economy. Track D is about turning paper into receipts.

### 2.7 The 5 revenue blockers (master handoff, in order)

1. Build `sparksRoutes.js` + `sparksCore.js` (spec in `Shaddai-consultancy/docs/wip/colosseum-economy-wip.patch`) — **MMO `:3001` cannot boot without them.**
2. Move game-forge MCP bridge off `:3001` (clash) -> `:3002`.
3. Import 4 n8n workflows; set creds (`ACADEMY_BASE`, `MMO_BASE`, `X_USER_ID`, Telegram, Sheets).
4. Fund wallets (Base ETH + Solana SOL); flip the paywall **deliberately**.
5. Open first paper trades -> weekly win/lose reports -> publish at 30+ closed trades.

---

## 3. Verified audit — what the systems actually do today

Every number below was measured against the running system on 2026-10-20.

### 3.1 Tool surface

| Measurement | Value |
|---|---|
| Gateway hosted tools (`GET /api/headless/tools`) | **971** = 554 `backend` (`agent-engine`) + 125 `creative-tools` + 276 `skills-tools` + 16 `knowledge-tools` |
| MCP tools (`tools/list` over stdio) | **520** = 276 `skill_*` · 24 `shaddai_*` · 21 `hall_*` · 16 `zerox_*` · 8 `story_*` · 7 `firecrawl_*` · 6 `think_*` · 5 `rag_*` · 5 `forge_*` · 4 `x402_*` · 4 `tool_*` · 4 `turtle_*` · 4 `styles_*` · 4 `browser_*` · 3 `brain_*` · 3 `aura_*` · 3 `graph_*` · 3 `workflow_*` · 3 `hunyuan3d_*` + … |
| Union (what the docs claim) | **1,074** |
| Workflows | **1,633** ✓ (1,536 self-contained · 97 declare `requires`) |
| n8n exports | **1,356** ✓ |
| Skills catalog / curated playbooks | **3,022 / 270** ✓ |
| Knowledge frameworks | **16** in `knowledge-tools.js` (manifest lists **13**) |

### 3.2 Claim vs. reality

| Claim | Reality | Gap |
|---|---|---|
| "`/tools` — every tool with schemas" | Only the 971 hosted. ~103 proxied-only tools (`x402_*`, `hall_*`, `shaddai_*`, `forge_*`, `graph_*`, `brain_*`, `aura_*`) are **callable but invisible**. | G-02 |
| "`/manifest` — bot-onboarding payload" | `start_with` names **`health_check`** and **`intent_route`** — **neither exists**. `endpoints` are **double-prefixed**: `POST /api/headless/api/headless/call` -> 404. `tool_count` 971. Frameworks 13/16. | G-03 G-04 G-05 |
| "Unknown tool" handling | **HTTP 200, `ok:true`,** body `"Unknown tool: x402_pay"`. A bot sees success on a call that never happened. | **G-01** |
| "`/openapi.json` — machine-readable contract" | 890 bytes, summary strings, **zero schemas**. | G-06 |
| "One source of truth / no drift" | The same **270 skill playbooks** are implemented **twice**: `shaddai-mcp/skills-tools.js` (7.4 KB) and `mcp-unified.js` (144.6 KB). | **G-07** |
| "Workflow integrity — zero silent failures" | ✓ **True.** `requires` markers work; 1,633 validated. | — |
| "3,022 skills" | ✓ True. | — |
| RAG grounding for our world | ✗ `rag_search("world scale contract")` returns a **legal-review document at score 100**. The brain has **no 3D-world corpus**. | G-09 |
| World tooling | ✗ Across 1,074 tools / 3,022 skills / 520 MCP tools — **not one** knows `U = 7/1.8`, bone-union measurement, the council hexagon, realm coordinates, `__opus-placement-queue.json`, or `_boot-smoke`/`_draw-profile`. | G-10 |
| Agent forging from a bot | ✗ `forge_run` is the **3D asset** forge (`mode: img2art`), not the agent forge. There is **no** `forge_agent` / `create_agent` on the gateway. The real forges (`backend/lib/agent-forge.js` 18.2 KB, `backend/forge/forge-core.js` 10.6 KB) are reachable only from the dashboard's `/api/forge/*`. | G-11 |
| Price source of truth | **Three disagreeing sets** (see section 4 G-12). | G-12 |
| World cosmetics pricing | `public/colosseum-cosmetics-system.js` hardcodes `cost: 0 / 500 / 1500 / 2000`. `prices.json` says "cosmetics from 0.1 sparks". | G-13 |
| On-chain discipline | `x402` tools, PayBox, USDC tool prices, bazaar, siege USDC payouts **already exist**, while the blueprint says don't build on-chain before MRR > $2k + a lawyer. | G-14 |

### 3.3 The world

| Fact | Value |
|---|---|
| Live GLBs | **590** (`public/__glb-scan.json`) |
| Deployed (protected, never move/delete) | **151** = 97 code-referenced + 52 LOD + 2 dynamic |
| Queue | keep **74** · fix **123** · unrated **242** · place **0** · 97 already have a realm home |
| Owner decisions | 122 keep · 165 fix · **369 deleted** · 155 unrated |
| Scale contract | `U = 7/1.8` world units per metre; agents 7 units ≈ 1.8 m |
| Rig measurement | **bone-union only** — raw geometry bounds lie on Meshy rigs (read 0.018 m vs 1.75 m -> the giant-agent bug) |
| Council placement | plaza hexagon, `r = 260`, 60° apart; SHADDAI at `[0,0]` |
| Export rules | GLB < 15 MB · metres · bone names match `public/assets/anim/agent-clips.glb` (75 clips) |
| Last perf measurement | playable **91,435 ms** · **3,166** draw calls · 4,053,220 tris · 117 textures · heap 244 MB · LOW tier · 0 page errors |
| Known perf win | park dressing = 41 draws -> BatchMesh per material ≈ 10 |

### 3.4 Machine reality

| Fact | Value |
|---|---|
| Disk C: free | **2.7 GB** |
| RAM free / total | **1,047 MB / 8,048 MB** (headless-browser guard = 1,000 MB -> browser work is at the edge) |
| Shaddai-3d working tree | **276 tracked files deleted, uncommitted ≈ 1.25 GB** (the owner-approved purge). One `git checkout .` re-fills the disk. |
| `shaddai-mcp-repo` | 30 files staged-deleted, 10 untracked, never committed |
| Repos by size | Shaddai-3d 6.4 GB · Shaddai 5.01 GB · Shaddai-3d-lockon 4.78 GB (merged; removable) · OneDrive 20.17 GB |

---

## 4. Gap register — what we are missing

Severity: **S1** = breaks a promise to a bot/user · **S2** = blocks a track · **S3** = quality/hygiene.

| ID | Gap | Sev | Evidence | Package |
|---|---|---|---|---|
| G-01 | Unknown tool returns HTTP 200 `ok:true` — false success | **S1** | `POST /call {"name":"x402_pay"}` -> `{"ok":true,"result":"Unknown tool: x402_pay"}` | A-1 |
| G-02 | `/tools` omits ~103 proxied MCP tools | **S1** | `total: 971`; `x402_*`/`hall_*`/`shaddai_*` absent from listing | A-3 |
| G-03 | `/manifest` start_with names 2 non-existent tools | **S1** | `health_check`, `intent_route` not in either registry | A-2 |
| G-04 | `/manifest` endpoints double-prefixed | **S1** | `POST /api/headless/api/headless/call` | A-2 |
| G-05 | Manifest frameworks 13 vs 16; `tool_count` 971 vs 1,074 | S2 | `knowledge-tools.js` defines 16 | A-2 |
| G-06 | `openapi.json` has no schemas | S2 | 890 B, summary strings only | A-3 |
| G-07 | 270 skill playbooks implemented twice | **S1** | `skills-tools.js` 7,368 B vs `mcp-unified.js` 144,551 B | A-4 |
| G-08 | Stale MCP process serving the Oct-1 copy | **S1** | PID 9328 -> `Shaddai\shaddai-mcp` (138 KB) | A-5 |
| G-09 | RAG brain has no 3D-world corpus | **S1** | `rag_search("world scale contract")` -> legal review, score 100 | C-1 |
| G-10 | Blender toolkit not exposed as tools | **S1** | `shaddai_import_glb` exists in 0 of 2 MCPs | C-2 |
| G-11 | No agent-forge or cosmetic-forge tool on the gateway | S2 | only `forge_run` (img2art) | B-4 |
| G-12 | Three conflicting price sets | **S1** | blueprint $9.99/$29.99/$79 · prices.json $0/$49/$199/$999 · copilot-instructions $0/$30/$200/$100 | D-1 |
| G-13 | World cosmetics prices hardcoded, not from `prices.json` | S2 | `colosseum-cosmetics-system.js` cost 0/500/1500/2000 | D-1, C-5 |
| G-14 | On-chain rails exist ahead of their own gate | S2 | 4 `x402_*` tools + PayBox + USDC prices + siege USDC payouts | D-7 |
| G-15 | Revenue reconcile node is an unimplemented TODO | S2 | `// TODO(Claude): compare academy paybox totals vs hall ledger_summary gross` | D-6 |
| G-16 | MMO `:3001` cannot boot | **S1** | missing `sparksRoutes.js` + `sparksCore.js` | D-3 |
| G-17 | 4 n8n workflows unimported; game-forge MCP port clash | S2 | creds unset; `:3001` vs `:3002` | D-5, D-3 |
| G-18 | Wallets unfunded, paywall off, $0 receipts | **S1** | honesty ledger 2026-10-15 | D-4 |
| G-19 | 276 deletions uncommitted (~1.25 GB) | S2 | `git status` in Shaddai-3d | C-3 |
| G-20 | Disk 2.7 GB / RAM 1,047 MB | S2 | — | Track 0 |
| G-21 | Combat + lock-on wired 2026-10-09, never verified in a browser | S2 | `?combat=1` behind a flag, no browser run since | C-4 |
| G-22 | No parity test between the two skill implementations | S2 | — | A-4 |
| G-23 | Public edition repo has 30 staged deletions never committed | S3 | `shaddai-mcp-repo` | — |
| G-24 | Obsidian split across 4 roots with no map | S3 | see section 1.2 | section 12 |
| G-25 | No per-bot identity / key / quota layer on the gateway | **S1** | no auth in `headless-routes.js`; `MCP-CHARGING` describes rails with no key layer | A-6 |
| G-26 | Per-deliverable unlock ($2.99) missing from `prices.json` | S2 | documented first dollar, absent from master | D-1 |
| G-27 | `teach_grok_bot` returns a *description* of a pack, not a pack | S2 | returns JSON metadata, no SKILL.md/workflow.json/tools.json emitted | B-2 |

---

## 5. Track A — Society layer (honest → complete → sellable)

### A-1 · Truth the error path `OPUS` · G-01 · disk ~0
**Change** `backend/routes/headless-routes.js`: unknown tool -> `404 {"ok":false,"error":"unknown_tool","hint":"GET /api/headless/tools"}`; proxied failure -> `ok:false` + the real error; add `X-SHADDAI-Source: hosted|mcp` on every response.
**Gate** test asserts unknown->404, known->200, proxied-error->`ok:false`.
**Done when** no code path can return `ok:true` without a real result.

### A-2 · Manifest generated from the registry `OPUS` · G-03 G-04 G-05
**Change** build `start_with`, `high_value_tools`, `frameworks`, `tool_count`, `endpoints` at request time from the live registry. **Zero hand-maintained lists.** Fix the double prefix. Either implement `health_check` + `intent_route` or replace them with tools that exist (`tool_search` + `skill_search` + `workflow_list` cover `intent_route`'s job).
**Gate** a bot completes the whole `start_with` sequence with zero "Unknown tool".
**Done when** the manifest changes when the registry changes — delete a tool, the manifest loses it.

### A-3 · Tool-list parity + a real OpenAPI `OPUS` · G-02 G-06
**Change** `/tools?source=hosted|mcp|all` (default `all`) merges MCP's `tools/list` with a `source` marker -> one listing of ~1,074 with schemas. Regenerate `openapi.json` from the same registry with real request/response schemas.
**Gate** every tool in the union appears exactly once; `openapi.json` parses and has schemas for every route.

### A-4 · One home for the 270 playbooks `OPUS` · G-07 G-22
**Decision** **MCP hosts them, gateway proxies** — matches the doc's own statement that "the MCP server is the canonical client". `/call` routes through one registry.
**Change** delete the duplicate implementation in `skills-tools.js`; keep the 6 management tools (`skill_search/get/list_by_agent/list_by_category/count/recommend`) wherever they live best.
**Gate** a diff test asserts `skill_search` output is byte-identical from MCP and gateway.
**Done when** exactly one file defines the playbooks.

### A-5 · Kill the stale MCP process `OPUS` · G-08
**Change** stop PID 9328 (`Shaddai\shaddai-mcp`, Oct-1). Ensure one process serves one registry.
**Gate** `Get-CimInstance Win32_Process` shows exactly one `mcp-unified.js` per repo.

### A-6 · Bot identity: key → principal → quota → wallet `OPUS` + PIKADON · G-25
**Change** new `backend/headless/identity.js`: per-bot API key -> `{botId, owner, scopes, quota, wallet}`. Keys hashed at rest, redacted from logs (reuse `server/agents/audit.js` redaction). Scopes per tool. Quota rides the **existing** AURA usage service (`server/agents/usage.js`: reserve/settle/release — AURA = compute cost, **not** a currency). Wire the 4-level kill switch (`server/agents/kill-switch.js`: global / agent / tool / provider). Charge via the existing rails: per-call x402 (Solana USDC), PayBox/ZEROX platform take, mastery packs, gem economy.
**Gate** keyless -> `401`; over-quota -> `429` with the reason; global kill -> `503`; every audit line names the principal; another user's bot id -> `404` (not 403 — confirming an id exists is itself a leak).
**PIKADON** red-team before this ships.

### A-7 · Hosted TLS MCP endpoint for Grok + Muse `OPUS` · depends A-3, A-6
**Change** remote MCP over Streamable HTTP so Grok/Muse call tools natively. BYOK only until resale terms are confirmed (see the 10-16 provider notes: Muse "contributor" models are *used to improve Meta's products* — the routing already blocks them for private/paid content).
**Gate** Grok completes `tools/list` + one real tool call over TLS with a key.

### A-8 · Gateway tab in the dashboard `OPUS` · depends A-3, A-6
**Change** new `public/js/shd-headless.js`, mounted through the existing `showView(v)` / tab registry. **Never grow `public/index.html` (3.62 MB).** Surface: tool search · one-call manifest · workflow browser with `requires` visible · live run + streaming · quota panel · key management.
**Process** build in **Beta** (lab) -> promote to **Shaddai** (final) when Opus signs off.
**Gate** `node --check`; curl the routes as two different test users to prove scoping; owner visual review.

---

## 6. Track B — Grok bot training + agent forging

### B-1 · Grok manifest correctness `OPUS` · G-03 G-04
Ship A-2 **and** verify with `GET /api/headless/manifest?bot=grok`: the system prompt, `start_with`, `high_value_tools`, `charging` must all be callable and correctly prefixed. The current Grok prompt tells the bot to call `intent_route` — a tool that does not exist.

### B-2 · `teach_grok_bot` emits a real pack `OPUS` · G-27
**Today** it returns a *description* of a pack. **Target** it writes the actual files: `SKILL.md` · `workflow.json` · `tools.json` · `examples/` · `README.md`, zipped or base64'd, with the tool names it references **verified against the live registry** (so it can never teach a bot a ghost tool).
**Gate** the generated pack's `tools.json` resolves 100% against `/api/headless/tools`.

### B-3 · Pack → bridge → money path `OPUS`
**Today** `mastery_create` (75% royalty), `bridge_register`, `bridge_call`, `x402` all work. **Missing** the join. `teach_grok_bot` output must be directly consumable by `bridge_register` (platform = `grok`), sellable via `mastery_create`, and payable via x402 per-call.
**Gate** a pack generated by B-2 can be registered, sold and called end-to-end.

### B-4 · Agent forging + cosmetic forging as tools `OPUS` · G-11
**Two different forges, both currently invisible to bots:**
1. **Agent forge** — `backend/lib/agent-forge.js` (18.2 KB) + `backend/forge/forge-routes.js` (15.9 KB). Creates a user agent across 4 stores, atomically, versioned, with provenance + capability manifest + `type:proxy` + `connector_id`.
2. **Cosmetic / 3D asset forge** — `backend/forge/forge-core.js` (10.6 KB): `SLOTS`, `ASSETS`, `ARCHETYPES`, `STYLE`, `ETHNICITY`, `rarityOf`, `loadoutFor`, `validateBuild`, `assemblePrompt`, `forgeMetadata`.

Expose both as headless tools: `forge_agent` · `forge_cosmetic_loadout` · `forge_create_agent`. Enforce the Forge rules — atomic writes (temp-file + rename), `custom_agents.json` is the only store that makes an agent answerable, `agent_wallets.json` is keyed by **name** (duplicate names refused), forged agents resolve through the same registry as the seven.
**Gate** a bot creates an agent through the gateway, and that agent appears in `/api/agents` and answers with its own persona.

### B-5 · Provider connectors (Grok + Muse) `OPUS`
Per connector manifest v1.0: `provider:xai base_url https://api.x.ai/v1` · `provider:meta base_url https://api.meta.ai/v1` · `wallet_control:false` · `auth:{type, credential_ref}` (vault only, never raw) · `sandbox_test{prompt, expected_contains}` · `permissions{can_accept_jobs, can_teach_skills, can_earn}`.
**Gate** a Grok connector passes its sandbox test and appears in the gateway's tool surface.

---

## 7. Track C — the 3D realm

### Track 0 · Stabilise first (disk + RAM)
Free disk before anything heavy (owner to approve the exact list): remove the merged `Shaddai-3d-lockon` worktree (4.78 GB) · drop `docs/blender/*.blend1` (181 MB) · `npm cache clean --force` (0.94 GB). Commit or deliberately preserve the 276 deletions (1.25 GB). Free RAM to >=1,500 MB — **every browser probe refuses below 1,000 MB and we are at 1,047 MB.**

### C-1 · Build the world corpus `OPUS` · G-09
**This is the highest-leverage single item in Track C.** Our conventions live only in `Shaddai-3d/docs/` (~30 files: `MASTER-TRACKER.md` 12.5 KB · `ASSET-AUDIT-20261017.md` 9.3 KB · `BLENDER-TOOLKIT.md` 10.1 KB · `QUALITY_SCALING_PLAYBOOK.md` 19.7 KB · `PERF-LOAD.md` · `REALMS-V1.md` · `RIG-AUDIT.md` · `SHADDAI-WORLD-MASTER-BUILD-PROMPT.md` 102.9 KB).
**Change** ingest into the brain as a new KB, **and** publish as skills so they appear in `/skills?q=` and become n8n exports: `skill_world_scale_contract` · `skill_world_asset_place` · `skill_world_hexagon_placement` · `skill_world_fps_gate` · `skill_world_rig_bone_measure` · `skill_world_queue_workflow`.
**Gate** five world questions retrieve the right document (not a legal review); `/skills?q=bone union` returns the new skills.
**Risk** a new corpus must not dilute the existing 91k-chunk brain. Measure retrieval precision before/after.

### C-2 · Blender toolkit as real tools `OPUS` · G-10
`tools/blender_toolkit.py` (192 lines, 7 functions) + `docs/BLENDER-TOOLKIT.md` (271 lines) exist and are **not** tools. Expose `shaddai_import_glb` · `shaddai_export_glb` · `shaddai_model_info` · `shaddai_scene_audit` · `shaddai_place_hexagon` · `shaddai_scale_check` · `shaddai_batch_import`.
**Guardrails** GLB < 15 MB · metres · bone names match `agent-clips.glb` (75 clips) · **measure by bone-union** · never touch `deployed` or any `-lod1/-lod2` mesh · small per-asset files only, never the full city `.blend`.
**Gate** `model_info` on a rigged council agent returns ~1.75 m (not 0.018 m); a round-trip import/export lands at the same coordinates.

### C-3 · The 439-asset queue, machine-driven and probe-gated `OPUS` · G-19
**Change** new tools `world_queue_next` (respects the deployed protection) · `world_asset_status` (writes back to `__asset-notes.json`) · `world_audit_sweep` (regenerates via `node tools/build-opus-handoff.mjs`) · `world_probe_fps` (runs `_boot-smoke` / `_draw-profile`).
**The gate rule** an asset counts as *placed* only when the FPS probe passes **and** the agents-not-tpose test passes **and** the scale check passes. This is the same `requires` honesty contract as the workflows — a workflow that needs an API key says so; an asset that fails a probe says so.
**Process** one asset per run; batch commits onto a branch; never `main`.
**Gate** 10 assets placed end-to-end with probe numbers recorded, zero manual placement.

### C-4 · Gameplay, in the owner's order `OPUS` · G-21
Owner order (World Handoff 2026-10-15) plus the open items:

| # | Item | Note |
|---|---|---|
| W-A | **Colosseum black screen** (#4) + **entrance on far side** (#7) | open since 10-11, blocks every Colosseum shot |
| W-B | **Combat + lock-on verify** | wired 10-09 behind `?combat=1`; **never run in a browser**. state machine idle/run/roll/attack1/attack2/hitstun/dead; attack1 0.38 s active 0.14–0.26; roll 0.45 s i-frames 0.08–0.32; sword trail = 16-segment ribbon, additive `#8fd4ff`; named enemy bar inside 18 m; ENEMY FELLED gold card; combat music ducks on lock |
| W-C | **FPS / load** (#5) | target draws < 150 (now 3,166) · playable ms down (now 91,435) · park dressing 41 draws -> BatchMesh ≈ 10 · tiers Low/Med/High/Ultra · merged statics + KTX2/Basis + atlases + LOD + culling |
| W-D | **Hoverskate v2 + crest colourway + HOVERPAINT VS** (owner #1) | kicked decks, graffiti decals, chunky hover pods, holographic deck, crest as deck emblem; tricks paint items |
| W-E | **Water wakes + shallows/glare** (owner #2) | wakes behind boats/ships; cheap normal ripple, no extra passes |
| W-F | **Lava / Emberfall** (owner #3 + #8) | ring city round a spired citadel, lava rivers/falls, rune pads |
| W-G | **Realm cities + homes** (owner #4) | furniture, doors, interiors; Athenaeum rooms + cowork hall |
| W-H | **Colosseum stages 7+ + race design** (owner #5) | colosseum-economy-wip.patch (Sparks cache, plot faucet cap, ledgered burns); race track design + item pickup + one-key item use |
| W-I | **The 7 agents** (owner #7, last) | fighting, rigging, clothing, cosmetics |

**Gate per item** `node tools/_boot-smoke.cjs "?time=0.5"` -> 0 page errors, with before/after playable ms + draws + tris in the commit message · `tools/tests/world-*.test.cjs` green · owner visual QA · screenshot review for visual passes.

### C-5 · 3D realm cosmetics `OPUS` · G-13
**Change** every cosmetic price comes from `prices.json` (never hardcoded in the world) — the world already hardcodes `cost: 0/500/1500/2000`. Use `forge-core.js` (`SLOTS`/`ARCHETYPES`/`STYLE`/`rarityOf`/`loadoutFor`) as the cosmetic generator so cosmetics are *forged* items with provenance, not hand-authored JSON. Marketplace sells: feeds · item swaps · clothing · agent bodies (new chassis via `agentBodies` grants) · **cosmetics from 0.1 sparks**.
**Rules** cosmetics are **never** framed as investments — no floor/ROI/staking/revenue-share language. Real money buys only deterministic, known-contents goods. Random rewards use **earned Sparks only** (loot-box law).
**Gate** changing a price in `prices.json` changes it in the world with no code edit.

### C-6 · The world calls its own tools `OPUS`
In-world agents talk to `/api/headless/call` instead of bespoke endpoints. Then game agents, dashboard bots, n8n, Telegram, Grok and Muse all drive **one registry**. This is what "society layer" means in practice.
**Gate** an in-game agent completes a task through the headless API and the result appears in the world.

---

## 8. Track D — money: pricing, consultancy, token

### D-1 · One price source of truth `OPUS` · G-12 G-13 G-26
**Decision** `prices.json` v1.1.0 wins — it is declared master in two independent documents and has by far the most complete structure.
**Change** (1) add the missing `unlock_per_deliverable: 2.99` — the documented *first dollar* mechanism is absent from the master file. (2) Update `.github/copilot-instructions.md` section 6 from `PRO $30 / MAX $200` to `Builder $49 / Mastermind $199 / Empire $999` + `Founder $100 once`, and adopt the `Explorer/Builder/Mastermind/Empire` names everywhere so one tier does not have three names. (3) Retire the blueprint's `$9.99/$29.99/$79` line — superseded. (4) Point the three live Stripe Payment Links in `pricing.html` at the chosen tiers **— this is a live-money change and needs explicit owner approval.** (5) Make the world and the simulator read `prices.json`.
**Gate** one file -> tier prices render identically in the dashboard, the hub, the simulator, the n8n map and the world.

### D-2 · The consultancy line `OPUS`
Already priced in `prices.json`: `setup_sprint $499` (brand voice pack · templates + dashboard · 1 arena event · 30-day quest line) · `whole_brand $1,999` (identity + content engine · vtuber avatar + 10 clips · 90-day calendar · SEO + social launch) · `care $99/mo` · `growth $249/mo` · `dominate $499/mo`.
**Missing** there is no **invoice**, **engagement record**, or **client-scoping** anywhere in the product — the client portal needs an engagement model: `engagement { clientId, scope, deliverables[], status, agentAssignments[], invoices[] }`, and **strict per-client scoping** (the past cross-user leak rule: another user's resource returns `404`, never `403`).
**Gate** an engagement can be created, tasks tracked, an invoice issued, and a second client cannot see it.

### D-3 · Make the Spark rail real `OPUS` · G-16 G-17
Build `sparksRoutes.js` + `sparksCore.js` (spec: `Shaddai-consultancy/docs/wip/colosseum-economy-wip.patch`) so **MMO `:3001` boots**. Move the game-forge MCP bridge to `:3002`.
**Rules** Sparks are closed-loop: **no cash-out, no redeem, no sell-back code path may exist** — that shield is the money-transmitter and securities protection. Every `wallet_update` names its rail. Idempotent quote_ids. PIKADON veto before payout.
**Gate** `:3001` boots, `GET /api/health` is 200, a plot purchase moves Sparks and writes an append-only ledger entry, and a repo-wide search for redeem/cashout/withdraw/sellback returns nothing that pays out.

### D-4 · Fund and flip, deliberately `OPUS` · G-18
Fund wallets (Base ETH + Solana SOL). Flip the paywall **deliberately**, not by accident. Open the first paper trades -> weekly win/lose reports -> publish at 30+ closed trades.
**Gate** one real receipt exists end-to-end: buyer -> PayBox -> ledger -> creator payout -> monthly report. **This is the "first dollar" milestone.**

### D-5 · Import the 4 n8n workflows `OPUS` · G-17
`revenue-streams-map` (13 nodes) · `purchase-to-payout` (14) · `scale-simulator` (4) · `mmo-ops-daily` (11). Set creds: `ACADEMY_BASE` · `MMO_BASE` · `X_USER_ID` · Telegram · Sheets. **Ops rules** n8n calls APIs and never writes JSON directly; the backend stays the source of truth; secrets in the n8n store/vault, never in the repo; retries with backoff; a human-approval branch above any money threshold.
**Gate** the nightly poll reconciles PayBox totals against the hall ledger with a real (non-TODO) compare.

### D-6 · Implement the reconcile node `OPUS` · G-15
Replace the `// TODO(Claude): compare academy paybox totals vs hall ledger_summary gross` placeholder with a real comparison. A mismatch means a settlement path is broken — it must alert, not silently pass.
**Gate** a deliberately injected mismatch raises an alert.

### D-7 · The token decision — a **decision**, not a build item `OPUS` · G-14
**The gates, restated** (from the blueprint section 3.J, the master handoff and `prices.json` — three sources agree):
- **No staking. No yield. No floor. No ROI or revenue-share framing. Ever.**
- A token is **optional and undecided** — it is not part of the build.
- Turn-on requires **all three**: `MRR > $2,000 sustained 3+ months` **AND** `securities counsel signs off` **AND** `a defined non-speculative utility` (governance / access / recruiting alignment).
- Risks to state plainly: **securities** (a token sold with profit expectation from your efforts is a security — fatal if wrong) · **money-transmitter** (a cash-out path triggers licensing; closed-loop is the shield) · **reputation** (the category is rug-adjacent) · **distraction** (token ops eat the exact solo-builder time that should go to distribution).
- **Rule: if in doubt, DON'T.** "Token" is not a revenue stream; do not model it as one.

**What to do now:** (1) write this as a one-page decision doc next to `prices.json` so every future session inherits the gate instead of re-litigating it. (2) **Do not add new on-chain surface** — hold the existing rails (4 `x402_*` tools, PayBox, USDC tool prices, bazaar, siege USDC payouts) as they are and add nothing until the gate opens. (3) If the gate opens, the token must be *utility for people who already earned things*, never a claim on revenue the platform has not generated.

---

## 9. Operating doctrine — how we use our tools

1. **Read before you think.** `rag_search` / `rag_ask` -> `/api/headless/skills?q=` (+ `?mode=recommend` for task->skills) -> `/api/headless/workflows` -> `/api/headless/tools?q=`. **After C-1 the brain actually knows our world.** Before C-1 it does not — do not trust it for world questions.
2. **AURA first.** `aura_ask` before generating; `aura_remember` after any reusable answer. That is what "token saver" means, and it is live on this machine. The master plan puts AURA at ~60% of the zero-budget path — treat that as a design goal, not a proven number.
3. **Every new capability ships three ways: MCP tool -> gateway exposure (automatic) -> n8n export.** That is how 1,356 exports exist. **No fourth path**, and no bespoke script that only one terminal can run.
4. **One honest standard everywhere.** `requires` on workflows -> `NEEDS:` on the world queue -> "what's blocked" in the client portal -> `ok:false` on a failed call. **Never claim something works without a gate that proves it.** The gateway breaks this rule today (G-01); that is why A-1 is first.
5. **Agent -> work -> gate.**

   | Agent | Owns | Gate |
   |---|---|---|
   | ORACLE | research, market/tech scan, consultancy verticals | cites sources |
   | ZEROX | pricing, tiers, splits, x402/PayBox, unit economics | numbers only in `prices.json` |
   | TURTLE | visual design, layouts, 3D look, cosmetics, media studio | screenshot before/after |
   | QUILL | copy, docs, Obsidian notes, SEO pages | reads like a human |
   | NEXUS | code, gateway, routing, perf, the asset pipeline | tests green + before/after numbers |
   | PIKADON | keys, quotas, authz, kill switches, audit, SSRF | red-team before any route ships |
   | SHADDAI | orchestrates, prioritises, final QA | nothing ships without this |

   **Maker != checker.** TURTLE builds -> NEXUS + PIKADON verify -> SHADDAI approves.
6. **One heavy job at a time.** Blender export · video render · headless browser · full RAG reindex. Never two on an 8 GB box with 1 GB headroom.
7. **Nothing existing gets modified without Opus review.** New work may be built by any model; Opus polishes.
8. **Say plainly what is broken.** Never describe an unfinished thing as if it works — the honesty ledger in section 2.6 is the house style.

**Space needed per step (C: is at 2.7 GB):** A-1..A-8 ≈ 0 · C-1 ≈ 0 (brain index grows ~10 MB) · C-2 ≈ 50-200 MB transient (Blender export) · C-3 ≈ 50-200 MB per asset batch · C-4 ≈ 0 (plus browser probes, RAM-gated) · D-3 ≈ 0 · D-4 ≈ 0 · video/asset renders 100-300 MB each.

---

## 10. Sequencing

| Phase | Packages | Why now |
|---|---|---|
| **0** | Stabilise (disk, RAM, decide the 276 deletions) | Everything heavy is gated on this |
| **1** | **A-1, A-2** | The honesty contract. Small, contract-only, biggest trust win. Also fixes Grok's onboarding. |
| **2** | **A-3, A-4, A-5** | Parity + de-duplication. Makes "one source of truth" true. |
| **3** | **C-1** | The world corpus. Unblocks every world task and every agent that touches the world. |
| **4** | **C-2, C-3** | The asset pipeline. Turns 439 manual placements into a probe-gated machine queue. |
| **5** | **A-6** | Identity. Unblocks A-7, A-8 and all charging. PIKADON red-team. |
| **6** | **B-1..B-5** | Grok training + forging, on top of a trustworthy surface. |
| **7** | **D-1, D-3, D-5, D-6** | Price truth, spark rail, n8n import, reconcile. |
| **8** | **D-2, D-4** | Consultancy portal + fund + flip. The first dollar. |
| **9** | **C-4, C-5** | Gameplay items, one at a time, with Opus review each. |
| **10** | **A-7, A-8, C-6** | Public TLS endpoint, dashboard tab, in-world loop. |
| — | **D-7 (token)** | Not on the critical path. A gated decision, not a build. |

---

## 11. Status table — tick me

| ID | Package | Track | Sev | Gate | Opus | Status | Evidence |
|---|---|---|---|---|---|---|---|
| A-1 | Truth the error path | A | S1 | unknown->404, known->200 | yes | todo | — |
| A-2 | Manifest from the registry | A | S1 | start_with fully callable | yes | todo | — |
| A-3 | `/tools` parity + real OpenAPI | A | S1 | union listed once, schemas present | yes | todo | — |
| A-4 | Duplicate 270 playbooks | A | S1 | diff test byte-identical | yes | todo | — |
| A-5 | Stale MCP process | A | S1 | one process per repo | yes | todo | — |
| A-6 | Bot identity / quota / wallet | A | S1 | 401/429/503 + audit principal | yes | todo | — |
| A-7 | Hosted TLS MCP (Grok/Muse) | A | S2 | Grok lists + calls over TLS | yes | todo | — |
| A-8 | Dashboard gateway tab | A | S2 | 2 users, scoping proved | yes | todo | — |
| B-1 | Grok manifest correct | B | S1 | no ghost tools | yes | todo | — |
| B-2 | `teach_grok_bot` emits a real pack | B | S2 | tools.json resolves 100% | yes | todo | — |
| B-3 | Pack -> bridge -> money path | B | S2 | register, sell, call end-to-end | yes | todo | — |
| B-4 | Agent + cosmetic forge as tools | B | S2 | forged agent answers | yes | todo | — |
| B-5 | Grok + Muse connectors | B | S2 | sandbox test passes | yes | todo | — |
| C-1 | World corpus in the brain | C | S1 | 5 queries retrieve right doc | yes | todo | — |
| C-2 | Blender toolkit as tools | C | S1 | model_info ~1.75 m | yes | todo | — |
| C-3 | 439-asset queue machine-driven | C | S2 | 10 assets, probe-gated | yes | todo | — |
| C-4 | Gameplay W-A..W-I | C | S2 | boot smoke + before/after | yes | todo | — |
| C-5 | Cosmetics priced from `prices.json` | C | S2 | one file -> all surfaces | yes | todo | — |
| C-6 | World calls the headless API | C | S2 | in-game task via gateway | yes | todo | — |
| D-1 | One price source of truth | D | S1 | dashboard=hub=simulator=world | yes | todo | — |
| D-2 | Consultancy engagement + invoice | D | S2 | cross-client scoping proved | yes | todo | — |
| D-3 | Spark rail + MMO boots | D | S1 | `:3001` 200, no cash-out path | yes | todo | — |
| D-4 | Fund wallets + flip paywall | D | S1 | one real receipt end-to-end | yes | todo | — |
| D-5 | Import 4 n8n workflows | D | S2 | nightly poll reconciles | yes | todo | — |
| D-6 | Reconcile node implemented | D | S2 | injected mismatch alerts | yes | todo | — |
| D-7 | Token decision doc | D | S2 | one page next to prices.json | yes | todo | — |

---

## 12. Open decisions for the owner

1. **Tiers:** confirm `Explorer $0 / Builder $49 / Mastermind $199 / Empire $999` + `Founder $100 once` (prices.json) as the single set — this changes live Stripe Payment Links. **Needs your explicit OK.**
2. **The $2.99 per-deliverable unlock** — add to `prices.json` as the documented first dollar? (recommended yes)
3. **Consultancy verticals** to launch with (coaches / real estate / insurance / clinics / accountants / law / agencies / education).
4. **Token** — confirm the D-7 gate, or say "never", and we write that into the decision doc and stop re-litigating it.
5. **Disk** — approve removing the merged `Shaddai-3d-lockon` worktree (4.78 GB) and committing the 276 deletions (1.25 GB), or you free space yourself.
6. **Vault** — add a `VAULT-MAP.md` to the main Obsidian root pointing at all four roots, and move nothing. (recommended)
7. **Public edition repo** (`shaddai-mcp-repo`) has 30 staged deletions never committed — commit them, or restore?

---

## 13. Sources

**Live systems (measured 2026-10-20):** `GET /api/headless/{health,tools,skills,manifest,workflows,openapi.json}` · `POST /api/headless/call` · `tools/list` over stdio from `shaddai-mcp/mcp-unified.js` · `rag-brain` MCP · `shaddai-n8n/prices.json` v1.1.0 · `shaddai-n8n/shaddai-revenue-streams-map.json` · `Shaddai-3d/public/__opus-placement-queue.json` · `Shaddai-3d/docs/*`.

**Obsidian:** `SHADDAI FINAL MASTER PLAN 2026` (10-13) · `03 Builds\BLUEPRINT-SECTIONS\01-REVENUE-AND-SCALE.md` (ZEROX, 07-13) · `World Handoff 2026-10-15` · `World Handoff 2026-10-17` · `08_Economy\SHADDAI-Economy-Whitepaper.md` · `02 Agents\SHADDAI\MCP-*.md` (8 notes, 10-20).

**Repo docs:** `Shaddai-3d/docs/HANDOFF-OPUS-WORLD-FINISH-20261020.md` · `BLENDER-TOOLKIT.md` · `ASSET-AUDIT-20261017.md` · `MASTER-TRACKER.md` · `QUALITY_SCALING_PLAYBOOK.md` · `shaddai-n8n/SHADDAI-MASTER-HANDOFF.md` (10-15) · `Shaddai/.github/copilot-instructions.md` · `Shaddai/docs/CONSULTANCY-DASHBOARD-SPEC.md`.

*Verified against running systems 2026-10-20. Every number in section 3 was measured, not remembered.*
