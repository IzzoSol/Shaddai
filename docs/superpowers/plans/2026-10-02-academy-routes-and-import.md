# Academy Routes, Judge and Bot Import Kit (Plan 2 of 4)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (inline). Steps are TDD: write the test, watch it fail, implement, watch it pass, commit.

**Goal:** Put the Academy core behind HTTP so owners (dashboard/game/Navi) and external bots (Grok, Muse, any agent with a `shdx_` token) can browse skills, enroll with Sparks, take baseline and exams, submit homework, finish exams, read receipts, export installed skills, and so admins can run the school. Bind the real LLM judge. Ship the agent-facing tool manifest and guide.

**Architecture:** One router factory `createSchoolRouter({ academy, uidOf, agentAuth })` (dependency-injected so it is tested with real `express` + `fetch` and fakes). A lazy singleton `academy-instance.js` wires the real `EconomyService`, `operatives`, `llm-router` and admin ids. Mounted at `/api/school` (human side, softAuth identity) and `/api/school/xagent` (bot side, existing `shdx_` bearer via the exported `agentAuth`). The x402 lab at `/api/academy` is untouched.

**Spec:** `docs/superpowers/specs/2026-10-02-shaddai-academy-design.md` (4.2, 4.3, 4.5, 4.7, 4.9). **Builds on:** Plan 1 (`2026-10-02-academy-core.md`), including its deferrals (needs_review resolution, teacher eligibility, owner mapping).

## Global Constraints
- Same as Plan 1 (local commits only, stage only listed files, no push, tests on temp dirs, repo test style registered in `backend/gate-node.js`).
- Identity is the verified uid only (`req.userId`); never trust a body-supplied owner. Bot identity is the bearer token's agent; its `operativeId` is the learner agent and its `owner` is the payer.
- Skill lesson content is the product: public listings never include `lesson`; the lesson is served only to an agent holding a matching paid enrollment.
- `withSkill` is derived server-side from `kind` (baseline=false, exam=true); never read from the body.
- Only admins publish house skills, benchmarks, rubrics; teachers publish skills only as themselves.
- Responses are `{ success: true, ... }` or `{ success: false, error }` with 400/401/403/404/429/500.
- Secrets in any body are rejected (reuse `secrets.hasSecret`).

## Review Focus
1. Another owner's agent/enrollment/attempt cannot be acted on (403), on both human and bot sides.
2. Lesson text never leaks via listings or without a matching paid enrollment.
3. A bot cannot assert `withSkill`, `agentId`, `ownerId` or a price; the server derives them.
4. A needs_review exam can be resolved only by an admin and stores only sanitized outputs.
5. Invalid JSON, huge bodies, prototype keys, and wrong types return 4xx, never 500 or a crash.

## Tasks

### Task 1: Core extensions for routes
Files: Modify `backend/lib/academy/exam.js`; Test `backend/lib/academy/exam-admin.test.js`.
Produces: `exams.get(attemptId) -> {id,agentId,skillId,kind,status,expiresAt,taskIds}|null` (no spec, no outputs); `exams.needsReview() -> [{attemptId,agentId,skillId,benchmark,tasks:[{taskId,prompt,output}]}]`; `exams.resolve({attemptId, by, taskScores:{[taskId]:0..1}}) -> {ok,score}`; `needs_review` attempts keep sanitized `outputs` (capped) for review.
Tests: get hides outputs; needsReview lists a persistent-disagreement attempt with prompt+output; resolve sets graded/score/resolvedBy and unlocks `evaluate`; resolve rejects non-needs_review, unknown task ids, scores outside 0..1; resolved attempt cannot be resolved twice.

### Task 2: LLM judge binding
Files: Create `backend/lib/academy/judge.js`; Test `judge.test.js`.
Produces: `createLlmJudge({ chat }) -> async (rubric, submission, label) -> {scores, critique}` using `buildJudgePrompt`; label B uses a different temperature; parses the first JSON object in the reply; throws on malformed output (so `gradeRubric` returns needs_review); system message instructs JSON-only and data-fence.
Tests: parses clean JSON and fenced JSON; passes the fenced prompt (contains one `<<<SUBMISSION`); throws on non-JSON and on missing `scores`; label B differs from A in options; submission text with a fence escape never produces a second fence in the sent prompt.

### Task 3: School router, human side and admin
Files: Create `backend/academy-school-routes.js`; Test `backend/academy-school-routes.test.js`.
Produces: `createSchoolRouter({ academy, uidOf, agentAuth }) -> express.Router` with
`GET /faculty`, `GET /skills`, `GET /skills/:id`, `GET /skills/:id/lesson?enrollmentId=`, `POST /skills`, `POST /benchmarks`, `POST /rubrics`, `GET /classes`, `POST /classes`, `POST /classes/:id/join`, `POST /enroll`, `POST /exams/begin`, `POST /exams/submit`, `POST /homework`, `POST /finish`, `GET /agents/:agentId/receipts`, `GET /agents/:agentId/skills`, `POST /admin/roles`, `GET /admin/audit`, `GET /admin/review`, `POST /admin/review/:attemptId`.
Tests (real express + fetch, fake uid header, real academy on temp dir): public skill list has no `lesson`; lesson 403 without enrollment, 200 with; publish needs teacher role and forces `teacher` to the caller; house skills admin-only; enroll for someone else's agent 403; full flow begin baseline -> submit -> begin exam -> submit -> finish installs the skill and returns a receipt; other owner's attempt 403; homework flow returns critique; admin review queue + resolve; non-admin 403; malformed JSON 400; unknown routes 404; secrets in body 400.

### Task 4: Bot side, tool manifest, guide
Files: Modify `backend/academy-school-routes.js` (add `/xagent/*`), Create `backend/lib/academy/tool-manifest.js`, `docs/ACADEMY-AGENT-GUIDE.md`; Test `academy-xagent.test.js`.
Produces: with `agentAuth`: `GET /xagent/catalog`, `POST /xagent/enroll {skillId,windowId?}`, `GET /xagent/skills/:id/lesson?enrollmentId=`, `POST /xagent/exams/begin {skillId,kind}`, `POST /xagent/exams/submit {attemptId,outputs}`, `POST /xagent/homework`, `POST /xagent/finish {skillId,enrollmentId,classId?}`, `GET /xagent/receipts`, `GET /xagent/skills` (installed, portable export with receipt id/hash; `transferable` license only exposes the full lesson), `GET /xagent/tools` (no auth: OpenAI/Anthropic-style tool definitions + base URL placeholder). `buildToolManifest({ baseUrl }) -> { openai:[...], anthropic:[...] }`.
Tests: bot flow end to end with a fake agentAuth (agent -> operative/owner); body `agentId`/`ownerId`/`withSkill`/`price` ignored; installed export only for passed receipts; manifest has one tool per action with required fields; guide file exists and mentions every endpoint (drift check).

### Task 5: Instance, mount, gate
Files: Create `backend/lib/academy/academy-instance.js`; Modify `backend/server-production.js` (mount after the `/api/academy` line), `server/externalAgents.js` (export `agentAuth`), `backend/gate-node.js`; Test `academy-instance.test.js`.
Produces: `getAcademy()` lazy singleton using `EconomyService.getDefault()`, `backend/lib/operatives`, `llm-router.chat` through `createLlmJudge`, `ACADEMY_ADMINS`; mount `app.use('/api/school', softAuth, _mmoId, createSchoolRouter({...}))` guarded in try/catch like the MMO layer. Seed-free: no content yet (Plan 3).
Tests: `getAcademy()` returns the same instance twice and exposes finishExam; builds with env `ACADEMY_DATA_DIR` temp; `node --check` on `server-production.js` passes; `externalAgents` still exports `xagent`, `jobs`, `_test` plus `agentAuth`.

## Self-review
Spec coverage (4.2 judge binding, 4.3 homework routes, 4.5 payouts via enroll/finish, 4.7 import kit, 4.9 roles/admin/review) mapped to tasks 1-5. Deferred to Plan 3: curriculum content and Press. Deferred: MCP-server packaging (the separate `public-mcp` package), webhooks, per-owner attempt caps (needs request-level owner mapping; add as a Plan 2 follow-up if time), teacher-eligibility beyond role check.
