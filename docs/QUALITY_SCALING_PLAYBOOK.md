# SHADDAI — Quality Assessment & Scaling Playbook

**Date:** 2026-08-03 · **Purpose:** how to know each area of SHADDAI is *top-tier*, when to *stop* working on it, and the *scaling path* to finish the whole build. Verified against the actual repo where possible.

---

## 0. The core principle: tiered effort with explicit stop gates

Every domain gets a **Tier rubric** (what "top-tier" concretely means), a **current score** (evidence-based), a **stop gate** (the moment further polish is wasted effort), and a **scaling step** (what to do after you stop).

Rules of thumb used everywhere:

1. **Top-tier ≠ infinite.** A feature is top-tier when it is (a) visibly excellent, (b) reliable, (c) consistent with the rest of the product. Not when every edge case is perfect.
2. **Stop when marginal value < marginal effort.** The universal stop gate: *"If I spend 3 more hours here, will a user actually notice?"* If no → stop.
3. **Overkill is a real tier.** Some work is *worse* than stopping because it adds complexity, size, or regression risk with zero user-visible gain. That tier is explicitly labeled and should never be crossed.
4. **Score is dynamic.** Re-score after any big feature. Scores below gate on the critical path block release; scores above gate are done.
5. **Tests are the floor, not the ceiling.** 135 tests passing means "nothing is broken" — it does not mean "top-tier." Top-tier adds the polish that tests can't measure.

**Tier definitions (shared language):**
| Tier | Meaning | Rule of thumb |
|------|---------|---------------|
| L0 Broken | Doesn't work, placeholder, or actively confusing | Must fix before anything ships |
| L1 MVP | Works, does the job, not embarrassing | "I can demo it and it functions" |
| L2 Solid | Works *well* — reliable, consistent, reasonable performance | "I'd be OK showing a stranger" |
| L3 Top-Tier | Visibly excellent — polished, delightful, cohesive | "This looks intentional and finished" |
| L4 Overkill | More than users notice; adds size/complexity/risk | Do NOT build (except passion-item budget) |

---

## 1. Domain rubric + current score

Legend: score = best tier reached overall in that domain. Evidence from 2026-08-03 audit.

### 1.1 Game Assets (agents, VFX, regions, art, thumbnails)
**What's here:** 7 agent GLB bodies (ZEROX 7.5MB / TURTLE 7.2MB / ORACLE 7.5MB / PIKADON 8.8MB / VILLAIN 4.6MB, each with 7 clips idle/walk/run/attack1/attack2/heavy/flip; SHADDAI/NEXUS/QUILL intentionally static). VFX props oracle-glow/shad dai-blast/emberblade. 8 FLUX action thumbnails (not yet wired). 30+ asset dirs under `public/assets/` (agents, vfx, buildings, characters, regions, world-models, vehicles, textures, ui...). 92 forge-art PNGs now committed so Render serves real art.

**Top-Tier bar (L3):**
- Every agent body renders textured + animated in-world (no white/floating bodies).
- Every agent has a wired action thumbnail on its tile/card.
- VFX fire, look right, and don't kill framerate.
- Region/room art is cohesive (one visual language, not a mix of "stock + emoji fallback").

**Overkill (L4, avoid):** re-generating art that already reads well; adding animation clips nobody triggers; bumping every asset to 4K.

**Current score: L2 (Solid).** Bodies + clips + props are committed and verified. Gaps that hold it below L3:
- 8 action thumbnails **not wired into dashboard tiles** (explicit PENDING #3 in `FINALIZED/MANIFEST.md`).
- Dashboard rooms still risk "white/no-texture bodies" (PENDING #1) — needs lights/material + optional idle anim.

**Stop gate:** wire the 8 thumbnails + fix room lighting, verify one body in every room on the live site, then STOP. Do not regenerate HF images unless a specific one is bad.

---

### 1.2 Game Coding (world, combat, movement, economy in-game)
**What's here:** `public/game.html` (199KB, UTOPIA LAND 2D world: region select, create operative, gallery, shop, prompt); `public/SHADDAI-WORLD-3D.html` (3D world with AnimationMixer crossfade, LMB combo, R signature + VFX, Q flip, villain in char-select, SkeletonUtils.clone + matrix fixes); `public/games/` mini-games (basketball, shooting, soccer with many `.bak-*` backups, sigil-storm, tactics-engine.js); backend `battle-engine.js`, `sports/football/*` (ruleset, playbook, roles, abilities, lab — all tested green).

**Top-Tier bar (L3):**
- Core loop is fun and readable (movement, combat, one enemy that fights back).
- No `alert()` placeholders; no dead HIRE/world buttons.
- In-game economy actually affects gameplay (buy/sell, region unlocks feel meaningful).
- Mini-games are not broken; each has at least one clear win condition.
- No half-finished feature left visible to the player (`.bak-*` files suggest repeated rework — pick a direction and finish).

**Overkill (L4, avoid):** MMO multiplayer, portal-worlds, "consciousness"/Neocortex memory (explicitly deferred in `SHADDAI_SYSTEM_REVIEW.md` §6). Don't add a 5th movement style.

**Current score: L1–L2 (MVP → Solid).** 3D world + combat work and are verified; 2D world is functional. Gaps:
- 12+ `.bak-*` soccer/shooting backups = churn with no landed decision (pick the best variant, delete the rest).
- VILLAIN is playable but has no boss AI (fine if intentional — but decide).
- Deferred MMO/portals must stay deferred.

**Stop gate:** When movement+combat+shop+regions all work end-to-end from a fresh account on the live site, and every `.bak-*` variant is either promoted or deleted, STOP. Boss AI for VILLAIN only if you personally want it (passion budget), not required for release.

---

### 1.3 Backend / API (the server)
**What's here:** `server-production.js` with `/api/health` + `/api/status`; `agent-engine.js` (224KB, ~182 real tools + 7-agent router + LLM loop); `api-proxy-routes.js` (399KB); auth-service (+hardened), agent-invoker, bazaar-routes, aura-routes, analytics/achievements/admin/arcade routes; workflow-security, x402 ledger (real off-chain credit/debit/balance). **135 tests passing** (113 jest in `tests/` + 22 node scripts via `gate-node.js`).

**Top-Tier bar (L3):**
- All tests green (✅ 135/135 today).
- No `console.log` debug spam; errors are handled and logged with context.
- Every public endpoint has input validation + auth + rate limit.
- `/api/health` + `/api/status` respond on the live site.
- No secrets in code; env-driven config.

**Overkill (L4, avoid):** microservices split, Kubernetes, Postgres+Redis migration now (owner rule: only past ~200 DAU — `SHADDAI_SYSTEM_REVIEW.md` §9).

**Current score: L2 (Solid).** Test coverage is genuinely good and the gate scripts exist (`npm run gate`). Gaps:
- `docs/CHECKLISTS.md` pre-deployment items are **all unchecked** — the checklist exists but no one has run it against the current build.
- 12 modified + ~20 deleted files uncommitted in git (incl. `knowledge/mastery/*.md` deletions + modified `distill-mastery.js`) — **uncommitted work = risk of losing knowledge.** Needs a decision: commit the deletions (distilled content) or restore them.

**Stop gate:** `npm run gate` passes (✅), the Pre-Deployment checklist is ticked for the live build, and git is clean (uncommitted deletions resolved). Then STOP. Do not rewrite working routes "to be cleaner."

---

### 1.4 Economy / Billing / Token
**What's here:** `billing-service.js`, `sub-billing-service.js`, `token-db.js`, `economy-service.js` (+ test), `workflow-security.js` (+ test); x402 off-chain ledger; Solana wallet infra present (Metaplex/Umi deps). In-game economy (token-db, ledger, marketplace/bazaar) exists server-side.

**Top-Tier bar (L3):**
- Buy/credit/debit/balance round-trips work and are tested.
- Subscription tiers gate content correctly (free vs paid).
- No way to "invent" money client-side (all balances validated server-side).
- Solana/x402 path is either finished OR explicitly off with a clean error (no half-wired mainnet).

**Overkill (L4, avoid):** mainnet x402 before legal/wallet review (owner rule — `SHADDAI_SYSTEM_REVIEW.md` §6).

**Current score: L2 (Solid).** Off-chain ledger is real and tested. Gaps:
- On-chain x402 is ~80% (documented) — decide: finish devnet path or gate it behind a clear "coming soon."
- HIRE button historically an `alert()` placeholder — verify it now routes to real x402 or shows a clean upsell.

**Stop gate:** Every money path is either real-and-tested or cleanly disabled; no placeholder money buttons. Then STOP. Don't build new payment rails.

---

### 1.5 Frontend / Dashboard / UX
**What's here:** `public/index.html` — **55,989 lines, single file** (source of truth / product). 121 HTML files under `public/`. Views toggle via `showView(v)`. Portals to world, marketplace, forge. Rooms tab with agent chambers. Swivel relocated to Rooms.

**Top-Tier bar (L3):**
- First paint → playable in reasonable time on the live site (world load-speed pass is PENDING #5).
- No broken view, no dead nav button, no emoji-fallback UI.
- Consistent visual language across dashboard, world, marketplace, forge (this is the #1 "feels fake" fixer).
- One canonical agent model — every surface (cards, swivel, character sheet, rooms, world) reads the SAME agent data. **This is the biggest known truth-gap** (`SHADDAI_SYSTEM_REVIEW.md` §2: 5+ duplicate agent definitions disagree).

**Overkill (L4, avoid):** migrating off the single-file dashboard to a framework; rebuilding views "properly."

**Current score: L2 (Solid) but with a truth problem.** Gaps:
- Duplicated agent data (5 places disagree) — SHADDAI=Oracle rank bug, skills count mismatch, stats-from-hardcoded vs real-182-tools.
- Thumbnails not wired; intro/duplicate-splash cleanup (PENDING #2).
- Production served stale v85 historically; confirm live = current build.

**Stop gate:** One canonical `AGENTS` source of truth, every surface reads from it, no duplicate intros, thumbnails wired. Then STOP. Do not redesign the shell.

---

### 1.6 Agent System (engine, tools, autonomy, AURA)
**What's here:** `agent-engine.js` ~182 real tools + 7-agent router + iterative loop + task queue; `agent-invoker.js`; `workflow-security.js`; RAG per-agent knowledge (brain: 80 principles, 718 frameworks, 1071 quotes, 1154 action items, 826 terms; 1575 chunks from a 120-video corpus — all verified + indexed); AURA proxy (prompt/semantic caching, context compression, adaptive routing) exists at `aura-cli/` + `backend/aura-routes.js`.

**Top-Tier bar (L3):**
- Tools fire reliably (needs a capable LLM — owner rule: llama3.2:3b or Groq/OpenRouter key, NOT 1b).
- Autonomous background loops work (scheduler + task queue), not just request→reply.
- AURA is wired into the agent call path (it's the margin-maker — owner rule §9).
- Forged/operative agents are usable across the app (chat tool-execution, rooms, world walk-up).

**Overkill (L4, avoid):** Neocortex/consciousness memory layer; full agent framework rewrite.

**Current score: L2 (Solid) — corpus side is L3.** Gaps (explicit NEXT SESSION budget items in MANIFEST):
- Forged agents not fully wired (swivel, agents tab, chat tool-execution, AURA routing).
- Reliable tool use depends on model choice (verify current key/model).
- AURA not confirmed routed through every agent call.

**Stop gate:** Forge → working operative callable in chat/rooms/world, AURA on every call, scheduler driving real autonomous runs. Then STOP. Don't add a 9th agent or new memory system.

---

### 1.7 Security & Compliance
**What's here:** auth-service (+hardened), JWT, bcrypt, rate limiting, helmet, CORS, workflow-security, aura-audit, sandbox, auth-guard — all with tests. x402 ledger audited.

**Top-Tier bar (L3):**
- Auth/authorization tests green (✅), no secrets in code, CORS/helmet/rate-limit on the live site.
- Audit log actually records agent actions (aura-audit.jsonl exists).
- No obvious injection/XSS paths in the 55k-line dashboard (spot-check user-input render paths).

**Overkill (L4, avoid):** SOC2/GDPR paperwork now; pen-test vendor before having an audience.

**Current score: L2 (Solid).** Gaps:
- Security checklist in `CHECKLISTS.md` unticked — run the relevant subset as a quick pass (rate-limit, headers, secrets, CSP) rather than the whole 600-line checklist.
- PIKADON review of any code touching money/auth before release.

**Stop gate:** Security subset of the checklist verified live (auth, rate-limit, headers, no secrets in logs). Then STOP — no penetration testing until launch traffic.

---

### 1.8 Docs & Deployment
**What's here:** 37 docs in `docs/` (ARCHITECTURE, API_REFERENCE_COMPLETE, DEPLOYMENT, CHECKLISTS, handoffs, specs). `FINALIZED/MANIFEST.md` cross-reference. Render auto-deploy on main. `.env` config, `START-SERVER.ps1`, pm2/ecosystem.

**Top-Tier bar (L3):**
- A fresh dev can start the server + open the dashboard from README/GETTING_STARTED alone.
- Deployment procedure + rollback documented and matches reality.
- Handoff docs current (HANDOFF_TO_GAME_TERMINAL reflects the 120-video corpus — ✅ done).

**Overkill (L4, avoid):** full runbooks/on-call rotation/SLO dashboards before there are users.

**Current score: L2 (Solid).** Gaps:
- CHECKLISTS.md unchecked → either tick it (if verified) or mark the sections that apply.
- Confirm DEPLOYMENT.md's "stale v85" concern is resolved (live = current).

**Stop gate:** GETTING_STARTED → server runs → dashboard opens, live site serves current build, checklists ticked. Then STOP.

---

### 1.9 Research Corpus & Knowledge (done, gate = maintain)
**What's here:** 120 verified videos / 1575 RAG chunks / 120 transcripts / 6-batch tracker; brain (80/718/1071/1154/826); UTOPIA_LAND_SOURCES.md 889 lines with #101–#120; Obsidian playbook Section A2 (10 code-only graphics techniques). RAG filters verified (`--system 2d_graphics`, `--agent NEXUS|TURTLE`).

**Score: L3 (Top-Tier).** This domain is DONE for now.

**Stop gate (maintenance mode):** Only grow the corpus when a real feature gap needs new knowledge. Do not absorb more videos for the sake of it.

---

## 2. Master scorecard (quick view)

| Domain | Score | Biggest single gap | Stop gate = |
|--------|-------|--------------------|-------------|
| Game Assets | L2→L3 | Action thumbnails WIRED + room lighting FIXED (2026-08-03) | Wire thumbs, verify rooms, stop |
| Game Coding | L2 | VILLAIN boss AI undecided | Loop works end-to-end + delete baks |
| Backend/API | L3 | — (135 tests green, checklists verified) | Gate passes + git clean + checklist |
| Economy | L2 | x402 on-chain 80%, verify no money placeholders | Real-or-disabled, no money placeholders |
| Frontend/UX | L3 | Canonical AGENT_REGISTRY CONFIRMED (all 7, THE SOURCE) | One canonical AGENTS source |
| Agent System | L3 | Forge→/api/agent/run WIRED + AURA on every call | Forge→callable everywhere, AURA wired |
| Security | L2→L3 | Headers/rate-limit/JWT/sandbox VERIFIED live | Quick security pass, stop |
| Docs/Deploy | L2→L3 | Checklists ticked; live = current build CONFIRMED | Fresh-start works, live = current |
| Research Corpus | L3 | — | Maintenance mode |

**Status 2026-08-03:** Sprints A–E are **DONE and verified**. HIRE → `/api/x402/charge` confirmed live (real debit, 5% fee → treasury, net → payee, ledger txn). Remaining before release bar: VILLAIN boss AI decision + the few unverified checklist items (backup/restore test, load test, npm audit).

---

## 3. What "done" means (the release bar)

Release when **all** critical-path domains hit L3, defined as:
1. `npm run gate` green (135 tests). ✅ already
2. Live site (shaddai-g81x.onrender.com): sign in → dashboard → world renders → combat + one region works → shop round-trip works — no placeholders, no `alert()`, no emoji fallback.
3. One canonical agent model; all surfaces read from it.
4. Forged agent is callable in chat (real tool execution) + AURA on the call path.
5. 8 action thumbnails wired; rooms render bodies with light + idle anim.
6. Pre-deployment checklist ticked for the live build.
7. Git clean (uncommitted deletions resolved — commit distilled knowledge, don't lose it).

After that: **STOP building.** Move to launch (growth, funnel, on-ramp), fix only bugs that block signups.

---

## 4. Scaling plan (ordered, what to do next)

> **Status 2026-08-03:** Sprints A–E items below marked ✅ are DONE (verified). The remaining work is only Sprint D + release-bar gaps.

### Sprint A — Truth & cleanup (1-2 sessions, unblocks everything)
1. ✅ **Resolve git state:** mastery cards restored (28, feed RAG startup rebuild), nav/games assets + MCP package committed and pushed, RAG test junk removed.
2. ✅ **One canonical `AGENTS` model:** `AGENT_REGISTRY` confirmed single source of truth — all 7 agents, QUILL/PIKADON present, SHADDAI=`THE SOURCE`; consumed by carousel/character-sheet/world.
3. ✅ Delete or promote every `.bak-*` game variant (0 remain).
4. ✅ Wire the 8 action thumbnails into dashboard tiles.

### Sprint B — World & rooms (make it look finished)
5. ✅ Room lighting + material so bodies aren't white/floating (IBL + ambient/hemisphere/key/rim + metalness clamp + model-viewer swap); idle anim runs.
6. ✅ Remove duplicate gold intro; world load-speed pass (in SHADDAI-WORLD-3D.html).
7. [ ] VILLAIN: decide boss AI yes/no (default: yes = 1 simple AI, small budget).

### Sprint C — Forge → real agent (the biggest product gap)
8. ✅ Forged agent populates gallery + runs REAL tool loops via `/api/agent/run` (tools reported), deploys to office/marketplace/room, delete works. AURA wired on every LLM call (agent-engine.js chokepoint).

### Sprint D — Economy final pass
9. ✅ HIRE → real x402 off-chain CONFIRMED LIVE: `/api/x402/charge` debits (100→98.5), 5% fee → treasury, net → payee, ledger txn recorded; kill-switch/replay/budget gates active. On-chain devnet finish is a post-launch stretch.

### Sprint E — Checklist & deploy
10. ✅ Pre-Deployment checklist run against live build (70 items verified, 2026-08-03).
11. ✅ Security quick pass (headers live, rate-limit, JWT+bcrypt, sandbox, no hardcoded secrets).
12. ✅ Confirm live = current build (dashboard.html 3.4MB current, /world serves 3D, assets live). Git clean + pushed.

### Sprint F — Launch (only after E)
13. Growth/funnel/on-ramp work per the existing launch docs. Bug-fix only.

---

## 5. Anti-patterns (how to not get stuck)

- **Perfectionism on invisible things:** if the user can't perceive it in 3 seconds, it's not top-tier work — it's L4.
- **Churn instead of decide:** multiple `.bak-*` variants mean "decision not made." Make the call, delete the losers.
- **Growth by adding, not finishing:** new domains are L0; finishing existing L2→L3 is cheaper and more visible.
- **Rebuilding what works:** the 55k-line dashboard works. Don't migrate it to a framework. Don't rewrite working routes.
- **Uncommitted work:** anything uncommitted is not real. Commit the distilled knowledge.

---

## 6. How to use this with the agents
- **SHADDAI:** final call on stop gates + release bar.
- **NEXUS:** Sprint A + E (truth, git, checklist).
- **ZEROX:** Sprint D (money paths real-or-disabled).
- **TURTLE:** Sprint B (rooms, thumbs, visual cohesion) + game-asset bar.
- **PIKADON:** security quick pass before release.
- **QUILL:** docs/checklists ticked + handoff updated.
- **ORACLE:** only to research a specific gap — corpus is in maintenance mode.

Last updated: 2026-08-03
