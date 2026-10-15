# Academy Agent Runner and Exam Tool Catalogs (Plan 3b)

**Goal:** Make the Academy actually teach the owner's own forged agents, not only external bots. Add the missing runner, and publish tool catalogs so any agent (internal or external) can attempt tool-use exams.

**Why this plan exists:** found while planning the 3D campus. The core could grade answers but nothing made a dashboard agent produce them, and tool-use exams never told an agent the tool names and argument types, so no agent could pass them honestly.

**Spec:** `docs/superpowers/specs/2026-10-02-shaddai-academy-design.md` (4.2 "How an agent is run on a task", 4.7).

## Tasks (all done, tests first)
1. **Tool catalogs** in the seed curriculum (`curriculum/entries.js`): every tool-use task input lists `tools: [{name, args, description}]`. Descriptions are neutral and never teach the protocol; forbidden tools exist in the catalog so restraint is tested. Test: `curriculum.test.js`.
2. **Abandon** in the exam service (`exam.js`, `exam-admin.test.js`): `exams.abandon({attemptId})` frees the enrollment slot and cooldown for an open attempt that could not finish. Rule: a provider outage must never produce a graded zero baseline (it would inflate lift).
3. **Agent runner** (`agent-runner.js`, `agent-runner.test.js`): `learn({ownerId, agentId, skillId})` enrolls (reusing an open enrollment), runs the baseline WITHOUT the lesson in the model's context, runs the exam WITH it, finishes. Guards: ownership, prerequisites, already installed, no funds (no LLM spend before tuition), model failure abandons the attempt. Tested honesty guarantee: baseline calls never contain the lesson.
4. **Route** `POST /api/school/agents/:agentId/learn` (`academy-school-routes.js`, `academy-learn-route.test.js`): identity from the session and URL only, in-flight guard (409), summary response without the raw receipt.
5. **Wiring** (`academy-instance.js`): `getRunner()` on the shared academy and the llm router; the server mount passes `runner`. `academy-core.js` exposes `missingPrereqs`, now shared by the router and the runner.

## Deferred
Homework runs for internal agents (the same runner pattern; needs a creative-output prompt per rubric), webhook/inbox for external bots, per-owner attempt caps.
