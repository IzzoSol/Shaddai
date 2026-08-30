# Archive

Superseded and historical planning docs. Nothing here is deleted — it is kept
for provenance. **Do not follow anything in this folder without checking it
against `docs/final/` and `MASTER-PLAN.md` first.**

Known contradictions already resolved:

| Archived claim | Reality (verified) |
|---|---|
| Dreamers Climb has 3 radios + "VS mode coming soon" | Shipped code has **8 radios and no VS mode** |
| Paybox is a Stripe-like checkout processor | It is a non-custodial **agent wallet**; Stripe is the checkout rail |
| The Obsidian vault does not exist on disk | It **does** — `OneDrive/OBSIDIAN/SHADDAI OBSIDIAN/` (contains live credentials; never copy them into the repo) |
| RAG lesson layer deferred for lack of an LLM key | `GROQ_API_KEY` works — the layer is built and running |

---

## Consolidation of 2026-08-29

Thirty documents were moved here in one pass. Nothing was deleted; every move
used `git mv`, so `git log --follow` still reaches the original history.

- `root-2026-08/` — planning and status docs that had accumulated at the repo root.
- `docs-2026-08/` — superseded specs and dated research from `docs/`.

The surviving root docs are `MASTER-PLAN.md`, `README.md`, `HOW-TO-RUN.md`,
`AGENT_BODY_SPEC.md`, `SHADDAI-WORLD-BIBLE.md`, and
`SIGNAL_QUALITY_SYSTEM_V2_2026-08-23.md`. Everything else lives under
`docs/final/`, `docs/` as detail, or here.

### `root-2026-08/`

| File | What it was | Class | Why archived |
|---|---|---|---|
| `3D_ECOSYSTEM_MASTER_PLAN.md` | Multi-provider 3D generation + unified marketplace + GLB viewer plan | SUPERSEDED | Assumes Meshy and multi-provider 3D are near-term. `MASTER-PLAN.md` §0 lists Meshy as docs-only with zero code, and §5 forbids starting it until funding is confirmed. Kept as the design intent for Phase 4. |
| `3D_MARKETPLACE_AND_TOOLS_READY_TO_DEPLOY.md` | "Ready to deploy" status, 2026-08-21 | HISTORICAL | Point-in-time deploy readiness claim. Forge's Build UI still says "coming soon". |
| `AGENT_ECONOMY_INTEGRATION_PLAN.md` | Multi-provider payments × task execution × 3D bodies | SUPERSEDED | Built on the payment model `MASTER-PLAN.md` §1.1 corrected: it treats Paybox as a checkout processor. It is an agent wallet. Stripe is the checkout rail. |
| `AGENT_ECONOMY_SPRINT_1_COMPLETE.md` | Sprint report, commit `f2b1d72` | HISTORICAL | Snapshot. Its "Meshy 3D bodies" claim contradicts the audited ground truth. |
| `BUILD_COMPLETE.md` | World Labs build report, June 2026 | HISTORICAL | Snapshot. |
| `COMPLETE_WORLD_BUILT.md` | `SHADDAI-WORLD-COMPLETE.html` build report, June 2026 | HISTORICAL | Snapshot. |
| `DASHBOARD_INTEGRATION_GUIDE.md` | Tools + 3D marketplace + agent payments wiring | SUPERSEDED | Same corrected payment model as above; also written against the v93 single-file dashboard. |
| `HANDOFF-QUICKSTART.md` | Session handoff | HISTORICAL | Says "10 commits ahead of origin/main, never pushed" — a git state that no longer holds. |
| `SHADDAI-FRONTEND-HANDOFF.md` | Iso-world front-end handoff | HISTORICAL | Superseded by `docs/FRONT-DOOR-MASTER-PROMPT.md`, which is the shipped entry experience. |
| `SHADDAI_BUILD_STATUS.md` | v83 session log / master index | HISTORICAL | Version-era status log. `MASTER-PLAN.md` is the index now. |
| `START_HERE.md` | Snapshot orientation note | SUPERSEDED | Names the old `IzzoIzzoIzzo/Shaddai` repo, `ship/SHADDAI_v85.html`, and a Desktop reference snapshot. All three are stale. |
| `TASK_8_COMPLETION_REPORT.md` | Challenge calculation engine, 2026-07-05 | HISTORICAL | Single-task completion report. |
| `TODO-COORDINATION.md` | Two-terminal coordination note, 2026-08-28 | HISTORICAL | Live scratch note for one session. |
| `WORLDS_CREATED_SUMMARY.md` | Five generated worlds, June 2026 | HISTORICAL | Snapshot. |
| `WORLD_BUILD_INSTRUCTIONS.md` | World build steps | HISTORICAL | Snapshot of a build that has moved on. |
| `WORLD_FIX_LIST.md` | Fix punch-list, 2026-07-03 | HISTORICAL | Closed punch-list. |
| `WORLD_README.md` | "Canonical entrypoint" for the world | SUPERSEDED | Claims canonical status that now belongs to `MASTER-PLAN.md` and `docs/final/`. |
| `WORLD_VIEWER_GUIDE.md` | Viewer/port guide | HISTORICAL | Ports and entry paths have since changed. |

### `docs-2026-08/`

| File | What it was | Class | Why archived |
|---|---|---|---|
| `ASK-PERPLEXITY-shaddai-media-organization.md` | Brief written for an external LLM | HISTORICAL | A question asked once, not a plan. |
| `BAZAAR_WIRING_SPEC.md` | Marketplace floor → dashboard wiring, 2026-06-21 | SUPERSEDED | Targets `SHADDAI-DASHBOARD-v93.html`, which is no longer the shipped dashboard. |
| `COMPETITOR_ANALYSIS_ARMARA_2026-08-06.md` | Competitive kill-list | HISTORICAL | Dated market research. |
| `OPENCODE-HANDOFF-2026-07-21.md` | Fix handoff to another tool | HISTORICAL | Closed handoff. |
| `SHADDAI_BUILD_PLAN_CROSSREFERENCE_2026-08-04.md` | File-by-file audit of the 08-04 plan | HISTORICAL | Superseded by the 2026-08-27 audit recorded in `MASTER-PLAN.md` §0. |
| `SHADDAI_MASTER_BUILD_PLAN_2026-08-04.md` | Master build plan | SUPERSEDED | Replaced wholesale by `MASTER-PLAN.md`. Its RAG chunk counts also predate the corpus rebuild. |
| `SHADDAI_SYSTEM_MAP.md` | System map + gap analysis | SUPERSEDED | Its gap list is largely closed; `MASTER-PLAN.md` §0 is the current map. |
| `SHADDAI_SYSTEM_REVIEW.md` | Full system review, 2026-06-21 | HISTORICAL | Verified against a Desktop build path that no longer exists. |
| `SHADDAI_TOOLS_RESEARCH_BRIEF.md` | Research brief for tool expansion | HISTORICAL | Question, not plan. |
| `SHADDAI_WORLD_DEPLOY_SPEC.md` | v93 production deploy spec | SUPERSEDED | v93-era. `docs/DEPLOYMENT.md` is the live guide. |
| `THREEWS_COMPETITIVE_STRATEGY.md` | three.ws competitive read, 2026-06-04 | HISTORICAL | Dated research. Note: three.ws is reference-only and proprietary — never copy from it. |
| `TINYPLACE_INTEGRATION_SPEC.md` | tiny.place integration, marked Draft | SUPERSEDED | Never implemented; no code exists. Kept for the idea, not the plan. |

### Additional contradictions resolved in this pass

| Claim | Reality (and why it won) |
|---|---|
| Root `START_HERE.md`: canonical source is `IzzoIzzoIzzo/Shaddai` | The repo is `IzzoSol/Shaddai`. The rename is recorded in owner memory; the doc predates it. |
| Several 2026-06/07 docs target `SHADDAI-DASHBOARD-v93.html` as the dashboard | The shipped dashboard is `public/index.html`. Code is ground truth. |
| `AGENT_ECONOMY_*` docs: Paybox is the checkout processor | `MASTER-PLAN.md` §1.1 (2026-08-28 correction) — Paybox is a non-custodial agent wallet; Stripe is the checkout rail and is already live. The correction is newer and was made after inspecting the product. |
| `AGENT_ECONOMY_SPRINT_1_COMPLETE.md`: Meshy 3D bodies shipped | `MASTER-PLAN.md` §0 — Meshy is docs-only, zero code. The audit ran against the codebase; the sprint report did not. |
