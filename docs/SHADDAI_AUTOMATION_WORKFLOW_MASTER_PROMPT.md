# SHADDAI Automation & Workflow — Master Prompt

**Paste this first on any coding task touching workflows, automation, or agent routing.**

Audited 2026-09-11 by SHADDAI (sequencing) and NEXUS (architecture), against a direct read of
`backend/api-proxy-routes.js`, `backend/agent-engine.js`, and `public/index.html`. Read-only audit
— nothing below has been changed yet.

---

## THE HEADLINE FINDING

There is no single place "run an agent" or "run a workflow" lives. There are **six independent
systems**, built at different times, that never merged:

| # | System | Lives in | What actually happens |
|---|---|---|---|
| 1 | `agent-engine.js` tool-calling loop | `routeTask`/`runAgentLoop`/`TOOLS` registry | The **only** system with real tools — web search, price fetch, security scan. Powers `/agent/run`'s single-goal path. |
| 2 | `BUILTIN_WORKFLOWS` + `runWorkflowStreaming` | `api-proxy-routes.js:3153+` | A second, separate multi-step chain runner with its own template list and its own persistence (`workflow_runs.json`). **This is the one the live UI actually uses** for real workflow runs (`/workflows/run`, streamed). |
| 3 | `WORKFLOW_TEMPLATES` | `agent-engine.js:3008+` | A **third** template library (market-brief, security-audit, research-report, agent-council, content-blast, token-deep-dive) — fully built, shares zero template IDs with #2, and **has no frontend caller at all**. Dead code that works if you hit it directly. |
| 4 | `/api/agents/route` | `api-proxy-routes.js:5697` | Intent-detection → prompt template → RAG grounding → **direct raw LLM call**. Does not touch #1's tools at all. This is what the new Hall, and most single-turn chat surfaces across the whole dashboard, actually call. **An agent chatted with here cannot use any tool** — it's a themed completion, not the tool-enabled agent. |
| 5 | `_workflows` array + `/workflow` + `/workflow/:id/run` | `api-proxy-routes.js:3857-3900+` | A **fourth** persistence/validation layer (real agent-name validation, real Sparks charging, real SSE events). Actively called by the frontend (`/api/workflow/${id}/run`, index.html:22150). Execution body past "runs async in background" not fully traced this pass. |
| 6 | `/workflow/chain` | `api-proxy-routes.js:4610` | Talks to the literal **port 8000-8008 HTTP agent servers** (`shaddai:8000, zerox:8001, oracle:8002, nexus:8003, turtle:8004, quill:8005, pikadon:8008`) that CLAUDE.md documents as "the" way to invoke agents, falling back to raw Ollama if a port isn't reachable. **Zero frontend callers found.** The system your own agent docs describe as canonical is the one the live product doesn't use. |

**Confirmed bug, not just duplication:** `POST /api/workflow/create` (part of system #5's sibling
`/workflow` route family) is an **active dead stub** — it echoes `{id, status:'created', workflow}`
back with no real persistence or execution, and the frontend calls it in two places
(`index.html:27220`, `29180`). Someone clicking "create workflow" there gets a UI success message
for something that did nothing.

**Frontend duplication to match:** `#workflowView` (index.html:5466) and `#automationView`
(index.html:12541) carry near-identical pitch copy ("chain agents · schedule jobs · delegate
tasks" vs "delegate · schedule · chain workflows · cron jobs · webhooks") — two nav items selling
the same idea, one of which (`#automationView`) has a button that just sends you back to the other.

---

## NEXUS — root cause and the one thing that actually matters

Five of the six systems are symptoms. The one structural problem underneath all of them:

> **The endpoint everything actually calls (`/api/agents/route`, system #4) was built as a
> lightweight chat completion, then organically became the default for every new chat surface
> — including ones (like the Hall, just shipped) that imply "talk to a real capable agent." It
> was never connected to the one system that has real tools (`agent-engine.js`, system #1).**

Every other duplicate (systems #2, #3, #5, #6) exists because someone needed "run more than one
step" or "run this as a background job" and, rather than extending #1 or #4, built a new parallel
path. None of them talk to each other. None of them share a template list. Two have their own
persistence file.

**The fix is not "delete five things."** System #2 (`BUILTIN_WORKFLOWS`) is real, live, and
working — it's the one to keep for multi-step workflows. System #1 (`agent-engine.js`) is real
and has the only tools — it's the one to keep for single-agent tool use. The fix is:

1. **Make `/api/agents/route` call into `agent-engine.js`'s tool-calling loop** when the request
   would benefit from tools (which is most of them), instead of being a parallel raw-LLM path.
   This alone fixes the Hall and every other chat surface at once — no per-surface changes needed,
   since they all already call this one endpoint.
2. **Fix or remove the dead `/workflow/create` stub** — either wire it to system #2's real
   `/workflows/create`, or repoint its two frontend callers at the real endpoint directly.
3. **Retire system #3** (`WORKFLOW_TEMPLATES` in agent-engine.js) — migrate any templates worth
   keeping (market-brief, security-audit, etc.) into system #2's `BUILTIN_WORKFLOWS`, then delete
   the dead duplicate list and its two orphaned routes (`/agent/workflows`, `/agent/workflow/:id/run`).
4. **Decide on system #5 and #6 explicitly, don't just leave them.** System #5 is real and called
   — trace what it actually does past "runs async in background" before deciding whether it's a
   third legitimate path (single-workflow-object CRUD, distinct from #2's template-based runs) or
   another duplicate to fold into #2. System #6 (port 8000-8008 servers) has zero live callers —
   either wire it into the product for real (if the standalone-agent-server architecture is meant
   to matter) or mark it explicitly as a dev/CLI-only tool (matching CLAUDE.md's `agent_wrapper.py`
   framing) so nobody mistakes it for a live path again.
5. **Merge `#workflowView` and `#automationView`** into one nav entry — same consolidation pattern
   already applied to the Worlds Hub.

---

## SHADDAI — sequencing

This is bigger and riskier than the Hall work — it touches how every agent interaction in the
product actually executes, not just a new UI surface. Build order, safest-first:

1. **Fix the active bug first, alone.** Repoint or implement `/workflow/create`'s two frontend
   callers. Zero architectural risk, immediate correctness win, ships same-day.
2. **Trace system #5 to a real answer** (spike, not a build) — read past line ~3900 to see what
   "runs async in background" actually executes. This determines whether step 4 below folds #5
   into #2 or keeps it separate.
3. **Connect `/api/agents/route` to `agent-engine.js`'s tools** — the one change with the biggest
   payoff (every existing chat surface gains real tool use with no frontend changes), and the one
   most worth designing carefully before touching, since it's the most-called endpoint in the
   entire dashboard. Needs its own scoped design pass — not something to improvise inline.
4. **Retire system #3**, migrating any templates worth keeping into #2.
5. **Decide system #6's fate** (wire it in for real, or explicitly demote to dev-tool status) and
   update CLAUDE.md if the port-based agent-server framing is no longer how the live product
   actually routes to agents — a stale doc here is worse than no doc.
6. **Merge the two nav views.**

## Non-goals for this pass

- No changes to the Hall, Forge, siege, or any 2D-world system — separate, already-shipped work.
- No changes to the just-landed identity-spoofing security fixes (commit `a5c24bb`) or the Groq
  model fix (`2cfdb78`) — unrelated, already complete, already live.
- Step 3 (connecting `/api/agents/route` to real tools) is flagged as needing its own design pass
  — this doc does not pre-decide how that connection should work (streaming? tool-call display in
  the Hall's chat UI? cost/latency tradeoff of tool calls on every chat turn?). That's the next
  brainstorming conversation, not a decision made here.
