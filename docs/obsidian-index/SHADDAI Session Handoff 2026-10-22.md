---
title: SHADDAI Session Handoff 2026-10-22
date: 2026-10-22
area: shaddai/sessions
tags: [shaddai, shaddai/sessions, handoff, index]
---

# SHADDAI — Session Handoff (2026-10-22)

Everything done in this session, everything not done, and the state of the machine.
Back to [[SHADDAI Master Index 2026-10-22]].

---

## 1. The state of the machine right now

| Thing | State |
|---|---|
| **Disk C:** | **9.05 GB free** (was 2.7 GB at session start, 0.30 GB at the low point) |
| **RAM** | **851 MB free** of 8,048 MB. The headless-browser guard needs 1,000 MB — **browser work is still blocked.** |
| **Gateway** `:3000` | **UP** — `Shaddai-Beta\backend\server-production.js`. 971 tools · 1,633 workflows · 23 headless routes |
| **Hub** `:4545` | **UP** — `shaddai-hub`. 114/114 tests. 3 bazaar listings, 13 mastery packs |
| **Clipper** `:8788` | **UP** |
| **Product repo** | `IzzoSol/Shaddai` → `docs/society-layer-plan-20261020`, **46 commits ahead of main, 22 files** |
| **Lab repo** | `IzzoSol/Shaddai-Beta` → `fix/policy-honesty-and-catalog-endpoint`, 5 commits |
| **Design studio** | `IzzoSol/shaddai-design-studio` → `feat/mcp-surface-diagram`, 1 commit, **13 files dirty** |
| **3D world** | `Shaddai-3d` → `agents/1`, **308 uncommitted** (276 deletions + 18 untracked) — left for your review, as agreed |
| **Obsidian** | 5 vault roots, **6,790 notes**, now indexed — see §6 |

---

## 2. DONE

### 2.1 Correctness — the live catalogue now tells the truth
Six live surfaces contradicted the stated policy (*no staking, token optional, no yield*). **The policy was right everywhere it was written; only the catalogue was wrong.**

| Was | Now |
|---|---|
| Pack *"SHADDAI Token and Staking Pack v1"* ($59, on sale) | *"SHADDAI Economy Rules Pack v1"* + peg, seven splits, allocation, no-token rule |
| Workflow `staking-stake-claim-loop` | `platform-research-brief`, described as its three steps actually do |
| A `staking` skill (2,375 chars of auto-generated boilerplate) | a real `economy-rules` skill |
| `staking_reward.json` calling a **tool that does not exist** | archived to `n8n-workflows/_archive/` |
| Graph + discovery pointing at the old pack name | repointed; **dated logs annotated, not rewritten** |

Workflow family counts had tool- and combo- swapped. Live truth: **609 tool- · 554 combo- · 270 skill- · 74 uc- · 21 stacks · 114 pipelines.**

### 2.2 The RAG brain — it answers now
Your complaint was exact: it was *"not just excerpts but real knowledge"*, returning *"random useless information"*.

| Metric | Before | After |
|---|---|---|
| **precision@1** | **7%** | **100%** |
| precision@3 | 53% | **100%** |
| **answer coverage** | 27% | **100%** |
| **off-topic rate** | **93%** | **0%** |
| **junk density** | *unmeasurable* | **0%** |
| abstention | 0% | **50%** |

21 probes, live. Four structural defects, each fixed and measured:

1. **The chunker sliced on WHITESPACE** into 500-word windows — every chunk began and ended mid-sentence. *That was the excerpt problem.* Now it packs **whole sentences**.
2. **The stored text was raw speech.** Chunks carried `&gt;` as a term; `gt` scored **0.56** in one of the worst vectors — the single largest weight in it. Now `decodeEntities()` (always safe) + `cleanSpoken()` (**spoken docs only**, prose untouched). The 91k existing chunks clean at the **output boundary**, so they read well now without the 890 MB rebuild.
3. **A score cannot tell an answer from a coincidence.** The gate now uses **IDF-weighted coverage** — a rare term (*n8n*, *1994*, *Reykjavik*) counts far more than a generic one (*skills*, *workflow*).
4. **There was no platform knowledge at all.** Now **tier 1**: four documents **generated from `prices.json` + `catalog/catalog.json`** (so they cannot drift) — the economy · the registry and every price · how a bot gets in · the agent lifecycle, job market and council. A platform question is answered from them **directly**: exact, cited, **no LLM in the loop**.

**Three bugs in my own audit**, because a measurement that lies is worse than no measurement: it read only the first **90 characters** of a result (the title, not the text); it passed `query` where `rag_ask` wants `question`; and its abstention regex looked for *"not in the brain"* — a phrase the brain never uses (it says **"no strong knowledge"**), which was hiding the whole abstention fix.

### 2.3 The discovery layer — 23 headless routes, all live
`/health /catalog /price-index /capabilities /sitemap /agents /domains/:id /workflows/:name /skills/:id /jobs /legal /whoami /search /tools /tools/:name /manifest /skills /workflows /llms.txt /llms-full.txt /mcp.json /feeds/*.xml /openapi.json /call /workflow/run` — plus site-root `llms.txt`, `llms-full.txt`, `.well-known/{mcp,ai-plugin,security}`, `sitemap.xml`, `robots.txt`, `showcase.html`.

**OpenAPI 3.1 with one real schema per tool** (264 KB). The flat **62-row price index** carries `currency`, `rail`, `pay_with` on every row: USDC→x402 (4 steps) · Sparks→PayBox · USD→Stripe · royalty→internal 75%.

### 2.4 The value boundary — the index is free, the product is not
- **`skill_get` leaked the whole product** — 4,655 chars of methodology ungated, ~7 MB free to any scraper, exactly what the $25–$79 packs sell. Now a **700-char preview**. The MCP stdio path is deliberately unchanged (an agent working isn't a scraper).
- **Two rate-limit buckets**: discovery 120/min, execution 30/min — independent, so a crawler never blocks an agent.
- Unknown tool → **404 `ok:false`**, not 200 `ok:true`.
- `backend/lib/protect.js`: source denylist mounted **before** every static root (7/7 clean 404). **Server code was never exposed** — there was no leak to close.
- MCP package gate now **fails closed** (the passphrase was a literal default in source).

### 2.5 Founder content
`public/showcase.html` (LIVE/SNAPSHOT indicator) · `docs/showcase-samples.md` (16/16 real probes) · `portfolio/mcp-surface/` diagram (16 nodes, 17 edges, 5/5 gates, contrast 16.4:1) · `video/registry.mp4` (36 s, **watched frame by frame**) wired into the hub Publish tab · `minify-client.ps1` (3.59 MB → 1.74 MB, 51.6%).

### 2.6 The Obsidian vault — organized (this session's second half)
Full detail in §6.

---

## 3. NOT DONE

### 🔴 The one that blocks everything: **OP-1, the security gate**
The gateway has **zero auth middleware** and `SHADDAI_ENABLE_MONEY` defaults to **`'1'`**. It is not deployed — that is the window.

**Gate:** 9/9 routes return 401 without a key · money unreachable without scope · deny-list holds · `forge_run` path-confined · unknown tool → 404 · scraped content treated as data · `findSecret()` covers `hf_`/`gsk_`/`sk-`/`AIza`/`Bearer` · the `isMcp` allow-list exemption removed.

### Then, in order
| ID | Package | Gate |
|---|---|---|
| **OP-2** | Per-bot identity, quota, x402 wallets (AURA budget service already exists — reserve/settle/**release on every exit path**) | keyless 401 · over-quota 429 · 402 → pay → settle → ledger |
| **OP-3** | Registry parity — `/tools` shows all ~1,074 · `/manifest` generated · the **270 playbooks live in one file** with a parity test | delete a tool → gone from both |
| **OP-4** | The gateway dashboard tab — **never grow `index.html`** (3.62 MB) | another bot's → **404, not 403** |
| **OP-5** | One provider-agnostic ingress over TLS (xai·meta·anthropic·openai·groq·gemini·openrouter·ollama·**webhook**) | a webhook agent completes the same round trip |
| **OP-6** | The founder demo, end to end | manifest→search→info→run→charged→creator paid |
| **CE-1** | **Mount the ingress** — 40 KB of finished, tested, PIKADON-hardened code, **unmounted** | register→claim→accept→deliver→approve→pay, idempotent |
| **CE-3** | Brain roster in the BYOK vault + each provider's data-use rules (**Muse added**) | contributor rule enforced in the *product* |
| **E-1/E-3** | One identity for external bots (UAR, keyed by `agentId`) | two bots, same display name, stay independent |
| **C-1..C-5** | The 3D realm: world corpus → brain · Blender toolkit as real MCP tools (7 functions, not a tool) · 439-asset queue machine-driven · 9 gameplay items · cosmetics priced from `prices.json` | `model_info` on a rigged agent → ~1.75 m, not 0.018 m |
| **D-1..D-7** | One price source (add the missing **$2.99** unlock; **re-point Stripe links — live money, needs your approval**) · spark rail · fund + flip wallets · import 4 n8n workflows · reconcile node · consultancy line · the token decision | `:3001` boots with **no cash-out path** |
| **SEO-1** | Per-domain priced pages `/capabilities/<domain>.html` | *"logo design api"* lands on a priced page |
| **SEC-1/2/3** | Run the minifier · move value server-side · the observatory (watch for scrapers) | an alert at extraction speed |
| **OPS-1** | Commit the **276 deletions in `Shaddai-3d`** (1.25 GB permanent) — *you said later* | disk stays where it is |
| **OBS-1** | **Fix `OBSIDIAN_ROOT`** — the default path is missing the `Downloads\` segment, so the live skills loader finds nothing unless `.env` sets it (§6.4) | the loader returns 5,321 skills with no env var |
| **OBS-2** | Tag the **5,321 `SKILL.md`** files — deliberately skipped this session because it is a live product surface (§6.3). Needs a loader-aware change first, not a bulk edit | a skill file with `area:` **and** `name:`/`description:` that still parses |

### Cheap and worth doing first
1. Re-run `node backend/scripts/ingest-platform-knowledge.mjs` after **any** price change (or wire it into a deploy hook).
2. Calibrate the abstention floor properly — 0.5 was the best measured compromise (0.34 identical, 0.12 worse). Needs a **larger probe set**, not a tweak.
3. Add the `discover` skill ("how to discover SHADDAI") to the catalogue.
4. Wire the gallery regen (`shaddai-design-studio` still 13 dirty).

---

## 4. Read in this order
1. `docs/TRACKER.md` — the one page. Done, in flight, not started, 14 decisions.
2. `docs/PLAN-SOCIETY-LAYER-20261020.md` — the 46-item gap register, tracks A–D.
3. `docs/PLAN-AGENT-LIFECYCLE-20261021.md` — track E.
4. `docs/NEXT-OPTIONS-OPUS-BRIEF-20261021.md` — **the Opus build brief**, OP-1…OP-7 with gates.
5. `docs/SECURITY-BRIEF-20261021.md` · 6. `docs/CONTENT-ENGINE-AND-AGENT-INGRESS-20261021.md` · 7. `AGENTS.md` · 8. `.github/copilot-instructions.md` §10–12.

## 5. Do in this order
1. **OP-1** — the security gate. Everything public waits on it.
2. **CE-1** — mount the ingress. 40 KB of already-paid-for work, sitting dark.
3. **D-1 → D-3 → D-4** — one price file, the spark rail, then fund and flip. *The first dollar.*

---

## 6. The Obsidian work (this session)

### 6.1 What was found
**5 vault roots on 4 disk roots**, **6,790 markdown notes**:

| Vault | Path | Notes |
|---|---|---|
| Main | `Desktop\Downloads\OBSIDIAN\SHADDAI OBSIDIAN` | 6,790 |
| Active desk | `Documents\Obsidian Vault` | 9 (newest, Oct 2026) |
| MCP set | `Desktop\02 Agents\SHADDAI` | 26 |
| Archive | `Desktop\05 Archives\BACKUP_ARCHIVE\SKILLS` | 2 |
| Archive | `Desktop\03 Mastery\Dreamers Mastery\_ARCHIVED\Shaddai_oldvault` | 2 |

A reorg had already been **planned on 2026-06-25** (`_START_HERE.md`, `00_MASTER_INDEX.md`, `REORGANIZATION_SUMMARY_2026-06-25.md`, `VAULT_FILE_MANIFEST.md`) — but it was explicitly *"audited, planned, and documented (**but not migrated yet**)"*. Those notes are left intact; this session added a layer on top rather than replacing them.

### 6.2 What was built — `00 Index/SHADDAI Master Index/`
| Note | What it is |
|---|---|
| **SHADDAI Master Index 2026-10-22.md** | The hub. Area map, vault map, what changed, what was deliberately left alone |
| **SHADDAI Timeline Newest First.md** | **All 1,488 curated notes, newest → oldest**, by month, each with a wikilink and its area |
| **SHADDAI Area Map.md** | The 12 areas and what each covers |
| **Areas/shaddai/*.md** | **12 area notes**, each listing its notes newest-first |
| **SHADDAI Vault Map.md** | The 5 vaults, their roles, and the `OBSIDIAN_ROOT` trap |
| **SHADDAI Skill Library Map.md** | The 5,321-skill library by agent and category |
| **SHADDAI Session Handoff 2026-10-22.md** | This note |

Plus a **pointer note in each of the 4 other vaults** (`SHADDAI - Pointer to the Main Vault.md`) — consistent with the standing decision: **move nothing, add a pointer**. Nothing was moved, so no link breaks and no hardcoded path breaks.

**1,453 curated notes** now carry frontmatter:
```yaml
date: 2026-10-07          # the REAL authoring date
area: shaddai/economy     # one of 12
tags: [shaddai, shaddai/economy, shaddai/backend]
```
That is what makes "newest to oldest" and "what does this pertain to" work *inside Obsidian* — sort by `date`, filter the tag pane by area.

### 6.3 The thing that nearly broke the product — and why it didn't
A first pass added frontmatter to **every** note including the 5,321 `SKILL.md` files. That would have broken the live product:

- `backend/skills-loader.js` reads `SKILL.md` **live from this vault at runtime**.
- Its `parseFrontmatter()` matches the **first** `---` pair and reads `name:` / `description:` from it. A block without those keys **silently blanks the skill's name and description for every bot on the network**.
- `backend/scripts/build-skills-catalog.js` bakes the same files into the shipped catalog.

**What was done:**
1. All **5,321** `SKILL.md` files were **restored byte-for-byte** from a pre-change backup. Verified: **346 checked, 0 mismatched**, 0 still carrying our marker.
2. The live loader was then run as the proof: **5,321 skills loaded, 0 with an empty name, 0 with an empty description**, and `getSkillContent()` returns the original text.
3. **Every one of the 641 pre-existing notes was byte-verified against the backup: 0 body bytes changed.**
4. **File mtimes were restored** afterwards — tagging a file updates its mtime, which would have made "newest first" a lie.
5. **Credential notes were indexed but never rewritten.** Not one byte of a file holding a live key was touched.
6. One UTF-16 note (`Agents/Agent_Marketplace_Knowledge.md`) was left in its original encoding rather than silently converted.

Backup: `C:\Users\Brittany\AppData\Local\Temp\opencode\vault-backup-20261022.zip` (1.1 MB, 641 files). Move it somewhere permanent if you want it.

### 6.4 A real bug found while organizing
`backend/skills-loader.js` and `backend/scripts/build-skills-catalog.js` both default to:
```
C:\Users\Brittany\OneDrive\Desktop\OBSIDIAN\SHADDAI OBSIDIAN
```
The vault actually lives at `Desktop\**Downloads**\OBSIDIAN\SHADDAI OBSIDIAN`. Unless `OBSIDIAN_ROOT` is set in `.env`, the live loader finds **nothing** and the skills registry is empty. The 5,321 count in [[SHADDAI Skill Library Map]] was measured against the **real** path. — logged as **OBS-1**.

### 6.5 The honest limit
The 5,321 `SKILL.md` playbooks are **not** individually listed. Five thousand filenames is not a map. They are organised by **agent and category** (which is how the folders already work), and everything *written about* them is indexed individually. Tagging them needs a loader-aware change first (**OBS-2**), not a bulk edit.

---

## 7. Things that will bite you
1. **`shaddai-n8n` has no remote.** The whole founder-content pipeline (`build-*.py`, `showcase.html`, `showcase-samples.md`, `llms*.txt`, `registry.mp4`) is **local-only** — its "repo" is the home directory. **Get it into a real repo.** Everything else is pushed.
2. **RAM 851 MB, guard needs 1,000 MB** — browser work (3D probes, screenshots) refuses until a Chrome tab closes.
3. **276 deletions in `Shaddai-3d` are uncommitted** — one `git checkout .` re-fills 1.25 GB.
4. **The 91k brain chunks clean on *output*, not at source** — the 890 MB rebuild is prepared, not run.
5. **Two live `mcp-unified.js` copies** — `Shaddai\shaddai-mcp` is an older Oct-1 snapshot; the gateway uses the Beta one. Consolidate or it drifts.
6. **Nothing is on `main`** — all pushes are branches. Render auto-deploys `main`, so nothing is deployed either.
7. **The Obsidian vault now has 1,453 notes with `area:` frontmatter.** If a future tool writes to `Agents/*/Skills/*/SKILL.md`, it must preserve `name:`/`description:` inside the frontmatter — see §6.3.

---

## 8. The commands
```bash
# is it alive
curl -s http://127.0.0.1:3000/api/headless/health
curl -s http://127.0.0.1:3000/api/headless/llms.txt | head -30

# the brain, and whether it still answers
node backend/scripts/rag-audit.mjs --json backend/scripts/rag-audit-after.json

# regenerate the founder content from live sources
python shaddai-n8n/catalog/build-catalog.py
python shaddai-n8n/catalog/build-discovery.py
python shaddai-n8n/catalog/build-showcase.py
python shaddai-n8n/catalog/build-samples.py
node  backend/scripts/ingest-platform-knowledge.mjs   # after a price change

# the diagram
cd shaddai-design-studio
node tools/diagrams/finalize.mjs architecture portfolio/mcp-surface/mcp-surface.json portfolio/mcp-surface/mcp-surface.html
node tools/portfolio.mjs && node tools/gallery-check.mjs

# minify the client (report only; -Write to emit public/dist)
powershell -File backend/scripts/minify-client.ps1

# the skills loader, against the REAL vault path (OBS-1)
node -e "const l=require('./Shaddai-Beta/backend/skills-loader.js');
const r=l.getSkillRegistry('C:/Users/Brittany/OneDrive/Desktop/Downloads/OBSIDIAN/SHADDAI OBSIDIAN');
console.log(r.length,'skills,',r.filter(s=>!s.name).length,'unnamed');"
```

---

## 9. The one-paragraph version
> We have a **complete, well-designed, unfunded** economy; a registry of **1,074 tools** that is now **honest, discoverable and protected**; a **discovery layer** any bot can read for free; a brain that now **answers** (precision@1 7% → 100%, off-topic 93% → 0%); an Obsidian vault that is finally **organized and navigable** (6,790 notes, indexed newest-to-oldest by 12 areas, with every live-read file left byte-identical); and **~40 KB of finished agent/world code that is written but not mounted**. The next dollar is not in building more. It is in **gating what exists, mounting it, and turning on the paywall** — and in getting `shaddai-n8n` under version control before something eats the disk.

*Every number in this handoff was measured or read out of the running system on 2026-10-22. Where a claim was wrong, this file says so and gives the corrected value.*
