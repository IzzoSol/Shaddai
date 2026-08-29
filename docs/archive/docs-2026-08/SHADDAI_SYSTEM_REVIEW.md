# SHADDAI — Full System Review & Forward Plan
**Date:** 2026-06-21 · **For:** handoff to Perplexity Pro / build planning
**Verified against the actual code** in `C:\Users\Brittany\Desktop\SHADDAI MASTER FINAL BUILD\` (not guesses). Where something is unconfirmed it says so.

---

## 0. The goal (in one line)
Create **Shaddai World** — a sovereign neon world where the SHADDAI agents live as characters; let users **easily add / build agents** (into the world, the swivel, and the Office), have agents **carry out x402 payments cleanly**, and **use their tool sets reliably**. Everything below is measured against that.

---

## 1. What exists & how it's wired
- **Frontend:** ONE giant file `SHADDAI-DASHBOARD-v93.html` (~49,600 lines, HTML + inline JS). Views toggle via `showView(v)` (shows `#<v>View`). This is the **source of truth / product**.
- **Standalone world:** `SHADDAI-WORLD.html` (~342 lines) — a self-contained **2D-canvas** neon world (agents as booths, walk with WASD, "press E", minimap). Loaded into the dashboard via iframe.
- **Standalone marketplace:** `SHADDAI-Marketplace-Floor.html` ("the Bazaar" / Neon Exchange) — self-contained 2D canvas floor; **not yet wired** into the dashboard.
- **Backend:** Node/Express (`backend/server-production.js`). Key real pieces:
  - `agent-engine.js` — **182 real tools** + 7-agent router + LLM loop. **VERIFIED working** (`/api/agent/tools` → 182).
  - `lib/x402-ledger.js` (`/api/x402/ledger/credit|debit|balance|history`) — **REAL off-chain credit ledger**.
  - `lib/x402.js` — HTTP-402 + facilitator verify/settle; ~80% of a real x402 flow (targets EVM/Base by default; Solana possible).
  - `brains.js`, `forge/forge-routes.js`, `lib/operatives-routes.js`, `collectables/`, `rooms/` — all real, mounted.
- **Preview:** `_dash93.cjs` (port 8099) serves the dashboard + `/world` + the real agent engine. **Needs `node_modules`** (now installed). Production serves a **STALE v85** copy (see §6).

---

## 2. ⚠️ Root cause of most "fake / inconsistent / wrong" feelings: DUPLICATED AGENT DATA
The 7 agents are defined in **at least 5 separate places that disagree**:
| Location | What it holds | Problem |
|---|---|---|
| `S.agents` ~L10760 | office/pixel sim: 6 agents | **SHADDAI is missing entirely**; ORACLE role "Wisdom Keeper" |
| block ~L12147 | roles: SHADDAI "Supreme Commander" | different role text |
| lists ~L12633 / ~L12690 | `{name,color,port}` | partial |
| **`AGENT_REGISTRY` ~L29334** | rank, skills[5], skillDetails, price, jobs, stars | **SHADDAI `rank:'THE ORACLE'` (WRONG — should be THE SOURCE)**, only 5 skills but description says "80+", **stats derive from hardcoded `skillDetails`, not the real 182 tools** |
| `_AGENT_TOOLS_REGISTRY` ~L18915 | real tool→agent mapping | the *real* skills, but not used by the character sheet |

**Fix = one canonical agent model.** Define a single `AGENTS` source (identity + caps + real tool list), and have the cards, swivel, character sheet, office, and world all read from it. This single change kills the SHADDAI=Oracle bug, the 5-vs-80 skills mismatch, and the "stats don't update" problem at once.

---

## 3. Component status (honest)
Legend: ✅ done · 🟡 partial · 🔴 broken · 🎭 fake/mock · 🚧 too big (defer)

| Component | Status | Notes |
|---|---|---|
| Dashboard shell, nav, view system | ✅ | Solid. `showView` has a monkey-patch chain (works, a bit fragile). |
| Agent engine / 182 tools | ✅ | Real, executes tool loops. Reliability depends on the LLM (1b model is weak at tool syntax → use llama3.2:3b or a Groq/OpenRouter key). |
| x402 off-chain ledger | ✅ | Real credit/debit/balance. |
| x402 on-chain (Solana) | 🟡 | `lib/x402.js` ~80%; needs Solana asset + facilitator wiring. HIRE button in world is a placeholder `alert()`. |
| Forge (agent builder) | 🟡 | Works (loads 182 real tools, saves operatives + brains). **Janky:** boot relies on polling fallbacks, showView race. **Forged agents are NOT added to the swivel.** |
| Agent cards | 🟡 | Use real portraits, but skills come from hardcoded `AGENT_REGISTRY`, not real tools. |
| Swivel carousel | 🟡 | Real FLUX portraits for the 7; **cannot add forged operatives yet.** |
| Character sheet (RPG stats) | 🟡🎭 | PWR/INT *are* computed (L29997) — but from **hardcoded `skillDetails`**, so they don't reflect real/equipped tools. SHADDAI mislabeled "THE ORACLE". |
| **Shaddai World** (neon world) | 🟡🔴 | **Wired** (nav → portal → iframe `/world`) and the file serves (HTTP 200), but **user reports it doesn't render** — needs live console diagnosis (likely the iframe/portal lifecycle or the world's canvas in-frame). NOT yet confirmed working in-browser. |
| Marketplace / "Bazaar" | 🟡 | `SHADDAI-Marketplace-Floor.html` exists; **not wired** in. Spec ready: `docs/BAZAAR_WIRING_SPEC.md`. |
| Office (work board) | 🔴 | "COMMAND ALL" buttons (`cmdWork()`/`cmdAudit()`/… L4837+) **don't work** (handlers undefined/broken). **No way to upload agents into the Office** yet. |
| Phantom wallet widget (L3351) | 🔴(unwanted) | Solana **mainnet** connect — **owner wants it removed.** |
| Skills library / Obsidian skills | ✅ | Real registry + `/api/agent/tools`. |
| Clips engine (premium) | ✅ | Real (separate `SHADDAI CLIPPER`), not yet in dashboard. |
| tiny.place interop | 🚧/❌ | Not built. Vision = sovereign world + open interop (see §7). Spec: `docs/TINYPLACE_INTEGRATION_SPEC.md`. |
| MMO multiplayer / portals / "consciousness" (Neocortex) | 🚧 | Too big for now — defer. |

---

## 4. Confirmed bugs you flagged (with locations + fix)
1. **SHADDAI shown as "THE ORACLE"** → `AGENT_REGISTRY[0].rank = 'THE ORACLE'` (L29335) + description (L29336). Fix: `rank: 'THE SOURCE'` and correct copy. SHADDAI = the Source/orchestrator, NOT Oracle.
2. **Fake/stale stats & "5 skills vs 80+"** → character sheet uses hardcoded `skillDetails`. Fix: derive skills + counts from the **real** tool registry per agent; make PWR/INT/SPD/DEF a function of actual equipped/available tools.
3. **Forged agents not in swivel** → `renderCarousel` only iterates the 7 council. Fix: merge `/api/operatives` into the carousel source list.
4. **Forge janky** → boot polling + showView race. Fix: the dispatch-registry refactor (already specced) and remove the polling fallbacks once stable.
5. **Shaddai World not rendering** → need the browser console error (F12) when clicking ⬡ SHADDAI WORLD — likely iframe/portal lifecycle or canvas sizing inside the frame. Highest-priority diagnosis.
6. **Office buttons dead** → `cmdWork/cmdLearn/cmdBreak/cmdAnalyze/cmdResearch/cmdBrainstorm/cmdAudit/cmdReport` undefined/broken. Fix: define them to dispatch real tasks via `POST /api/agent/run`.
7. **Phantom wallet not wanted** → remove the widget at L3351 (+ related pipe wallet UI).

---

## 5. What's REAL vs FAKE
- **REAL:** 182 tools + agent loop; off-chain x402 ledger; forge save/run; FLUX portraits; skills library; the world & marketplace canvas apps; backend routes.
- **PARTLY FAKE / placeholder:** character-sheet skills & stats (hardcoded), some agent "jobs/earnings/stars" numbers in `AGENT_REGISTRY` (seeded demo values), the world's HIRE button (alert), on-chain x402 (not finished).
- **NOT FAKE but UNCONFIRMED:** Shaddai World rendering in-browser.

---

## 6. Too big / defer (don't try to build now)
- Full MMO multiplayer, portal-worlds, "agent consciousness"/Neocortex memory — **defer.**
- On-chain **mainnet** x402 — devnet first; mainnet only after legal/wallet review.
- UGC game builder — Phase 3+.
- **Deploy gap (do soon, not big):** production serves stale **v85** (`public/index.html`). To ship v93 + world: promote v93 → `public/index.html`, add a prod `/world` route, commit/push (Render). Spec: `docs/SHADDAI_WORLD_DEPLOY_SPEC.md`.

---

## 7. Forward plan (phased — this is the "what's next")
**Phase 0 — Cleanup & truth (fast, high impact):**
- One canonical `AGENTS` model → fixes SHADDAI=Source, skill counts, and stats-from-real-tools in one move.
- Remove Phantom wallet widget.
- Wire the 8 Office "COMMAND ALL" buttons to `POST /api/agent/run`.
- Reconcile character sheet to pull real tools.

**Phase 1 — Shaddai World solid:**
- Diagnose & fix the world render (console first).
- Add forged operatives into the swivel.
- "Upload agent into Office" so any built/forged agent works with the user (gate extra agents by tier/subscription).
- Deploy v93 + `/world` to production.

**Phase 2 — Clean economy & tools:**
- HIRE → real x402 (off-chain ledger first; then Solana via `lib/x402.js`).
- Make tool use reliable (3b model / Groq key); verify each agent's tools actually fire.

**Phase 3 — Sovereign world + open interop (the big vision):**
- Define a **Shaddai Agent Card** format (the world's `COUNCIL` array is already ~one) + serve `/api/agents/cards`.
- **Portal** that imports an external Agent Card (e.g. a tiny.place `@handle`) → spawns that agent as a *visitor* in Shaddai World; export ours so other worlds pull them. Open standards (Agent Card / A2A / x402) = agents federate **between** worlds. Shaddai World stays sovereign (its own identity/economy), tiny.place is a **peer**, not a dependency.

---

## 8. Companion specs already written (in `docs/`)
- `TINYPLACE_INTEGRATION_SPEC.md` — x402-on-Solana mechanics + Agent Card format (repurpose for our OWN sovereign+interop design).
- `BAZAAR_WIRING_SPEC.md` — wire `SHADDAI-Marketplace-Floor.html` under the marketplace + a market HUD in the world.
- `SHADDAI_WORLD_DEPLOY_SPEC.md` — exact steps to ship v93 + world to Render.

## 9. Additional owner requirements (2026-06-21 — must be in the plan)
- **Agent lifecycle & control:** users can **ADD, BUILD, and DELETE** agents + full management (rename, edit tools, retire). Gate extra agents by **tier/subscription**.
- **Forge → REAL agents, not just an image:** clicking FORGE must output a **working operative whose equipped tools are real and callable everywhere** — dashboard chat, Office, Hire, AND **inside Shaddai World** (walk up to it → it actually does the job). Visual part-picking stays; the *result* must be functional, not a portrait.
- **Autonomous, not a chatbot:** agents run **background task loops** (the agent-engine already supports task queue + iterative loop) — scheduled/triggered autonomous work, not just request→reply. The Office "COMMAND ALL" buttons + scheduler should drive real autonomous runs.
- **AURA token-saver:** the AURA proxy (prompt/semantic caching, context compression, adaptive model routing) is the margin-maker — must be wired across ALL agent calls. Exists as a CLI at `aura-cli/`; integrate into the dashboard's agent call path.
- **Seamless tool use:** equipped tools must fire reliably — use **llama3.2:3b** or a **Groq/OpenRouter key** (the 1b model is unreliable at tool-call syntax).
- **Hosting:** **Render is fine** for this stack (Node + static) at current scale. Only revisit past ~200 DAU (add Postgres/Redis). No need to move now.

## 10. Revised forward plan (folding in §9)
- **Phase 0 (cleanup):** one canonical `AGENTS` model (fixes SHADDAI=Source, skills, stats) · remove Phantom wallet · wire Office buttons → `/api/agent/run` · **agent delete/manage UI**.
- **Phase 1 (Shaddai World solid):** fix world render · forged operatives into swivel **and** into the world (walk-up works) · **upload/spawn any built agent into the Office** · deploy v93 + `/world` to Render.
- **Phase 2 (real agentic economy):** Forge output = fully callable agent everywhere · HIRE → real x402 (ledger then Solana) · **autonomous task loops** + scheduler · **AURA** wired into every agent call · reliable tool use (3b/Groq).
- **Phase 3 (sovereign + interop):** Agent Card format + `/api/agents/cards` · portal to import/export agents between worlds · subscription gating for adding agents.

**Bottom line:** you're ~70% there on the *pieces* (engine, tools, x402 ledger, forge, world UI all real). The gap is **consolidation** (one agent model), **wiring** (world render, office, swivel, HIRE→x402), and **cleanup** (remove wallet, fix labels). Almost nothing is "too big" except the MMO/consciousness layer — those are deferred, not blocking.
