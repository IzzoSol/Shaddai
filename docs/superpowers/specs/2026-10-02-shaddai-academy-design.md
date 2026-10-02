# SHADDAI Academy — design (2026-10-02)

Status: DRAFT for owner review. Branch `feat/world3d`. Local only; nothing is pushed until the owner declares the game finished.

## 1. Goal

A working Academy where agents (forged operatives, and imported Grok / Muse / Claude / GPT / other bots) really improve:
they take a baseline, learn a skill, are examined and given homework with critique, and only earn badges and tuition-backed
credit if their measured score goes up. Trained agents are used in the dashboard, jobs and world. Teachers (agents or owners)
publish skills and earn commission, mentor reputation, medals and achievements. A pristine, interactive Three.js Academy
building in the 3D city is the front door, wired into Navi, the `academy-hall` marker and the achievements system.

Honest framing: training installs verified, versioned skills (prompt template, tool-use strategy, few-shot examples,
checklists) into an agent. It never changes model weights. The proof is a stored score lift on a receipt.

## 2. Non-goals

- No weight fine-tuning. No claim of guaranteed profit. No live trading: Academy trading skills are paper-mode only,
  and agents never get `zerox.execute` or keys (owner rule; wallet addresses only).
- Not a second economy: Sparks move through `backend/economy-service.js`. The existing x402 USDC lab
  (`academy-engine.js`, `/api/academy/catalog|quote|open_tab|spend|close_tab|lesson01`) stays untouched as the
  "API Lab" track.
- Not 100 skills. Seed a handful per track, each with a benchmark that is verifiably good.
- No push to main/beta. Existing perf budgets (60 fps, <80 added draw calls for the building) apply.

## 3. Existing seams (verified 2026-10-02)

| Need | Reuse |
|---|---|
| Identity | `backend/lib/operatives.js` (`create/get/update/listByOwner`, fields `tools`, `stats`); external bots via `/api/mmo/xagent/register` bearer `shdx_...` |
| Sparks | `backend/economy-service.js` (`getDefault()`, idempotency keys, `InsufficientFundsError`); `server/lib/ledger.js` facade |
| Reputation | `backend/lib/reputation-engine.js` `record({agent,outcome,latencyMs,tool,task})`, `rank()` |
| Achievements/XP | `backend/achievements.js` pure monotonic rules, event ingest `POST /event` (admin) plus an in-process call path |
| Skill chips doc | `docs/city-v3/DOC_SKILLS.md` (Academy teaches, Forge seats, `NODE_SKILL_INSTALL`) |
| Portable skill file (open item 2) | `docs/AGENT-PLATFORM-20261001.md` section 6.2: `{id,name,version,inputs,tools,prompt,price}` |
| LLM judging | `backend/lib/llm-router.js` (text only by default) |
| Safety | `pikadon-gate.js`, `ssrf-guard.js`, secret-rejection rules from agent-platform |
| World | `world-interiors-v3.js` recipe `campus` for canon `academy-hall`; `world-city-actions.js` `FAMILIES.academy`; `world-navi.js` Academy module; `world-agents-ui.js` |

## 4. Architecture

```
          Navi Academy tab ─┐                         ┌─ dashboard (trained agents, receipts)
 3D Academy building (iv3) ─┼─► /api/academy/*  ──────┼─ jobs eligibility (installed skills)
 External bots (bearer) ────┘   academy-skills core   └─ achievements / reputation / medals
                                  │
        skill registry · benchmark runner · homework loop · learning receipts · tuition ledger
                                  │
                 operatives.tools/skills  ·  economy-service (Sparks)  ·  llm-router (judge)
```

New code lives in `backend/lib/academy/` (pure modules, node:test) plus `backend/academy-skills-routes.js`.
Mounted next to the existing academy router at `/api/academy/*` with new path names that do not collide.

### 4.1 Skill package (the portable file)

```
{ id, name, version, track, tier: spark|adept|prime,
  teacher: { type: operative|owner, id },
  summary,
  lesson: { prompt_template, tool_strategy: [{tool, when, how}], examples: [...], checklist: [...] },
  benchmark: { id, version },          // exam definition reference
  homework: { brief, rubric_id },
  price_sparks, license: single|transferable, requires: [skillId], allows: [toolId|jobKind] }
```
Hashed (sha256 over canonical JSON); the hash is stored on every receipt so a version change invalidates old claims.
Import and export validate against a strict schema, run the secret-rejection rules, strip markup and cap sizes.

### 4.2 Benchmarks and exams

A benchmark is a fixed, versioned task set with a grader.
- **Deterministic graders** where possible: trading (paper-trade a recorded tape; score = risk-adjusted return,
  drawdown limit, rule adherence), SEO (audit a fixture page against a checklist), tool-use (did it call the right
  tool with valid args; scored by a schema checker).
- **Rubric LLM judge** for creative output: fixed rubric published to the student, scored per criterion 0-4, run
  through `llm-router` at temperature 0 with two independent judge passes (disagreement above a threshold re-runs;
  persistent disagreement marks the result `needs_review`, never a pass).
- Flow: `baseline` (before install) -> learn (install in a sandbox copy) -> `exam` (held-out tasks, not the ones in the lesson
  examples). Pass = score >= pass mark AND lift over baseline >= minimum lift. Lift is stored.
- Anti-gaming: held-out task pool rotated per attempt, attempt cooldown and daily cap, answer leakage scan, tuition
  is charged per attempt window, not refunded on fail.

How an agent is "run" on a task: the Academy calls the agent through an adapter.
- Internal operatives: the operative brain tier with the candidate skill injected.
- External bots: the bot polls `/api/academy/xagent/inbox` (bearer) and posts `/deliver`, same shape as jobs. The exam is
  time-boxed. Webhooks are a later add-on (SSRF-safe, already in agent-platform open items).

### 4.3 Homework with critique (the improvement loop)

Open-ended assignments (make an image, a landing page SEO plan, a trade plan, an ad set). Loop:
1. Student submits artifact(s) + the prompt / tool calls it used (provenance is required).
2. Reviewer returns a **structured critique**: per-rubric-criterion score, `what_went_wrong[]`, `focus_next` (one aspect),
   `prompt_fixes[]` (before -> after), `tool_use_fixes[]`, `next_exercise`.
3. Student revises and resubmits (max 3 rounds). Homework credit = measured improvement between round 1 and the best
   round, plus the final rubric score. The critique itself is stored and can be distilled into the skill's few-shot
   examples by the teacher (teacher-approved only).
Reviewer can be the platform LLM judge (default), a human owner, or a teacher agent (paid review, see 4.5).
Image artifacts are judged text-first (prompt, parameters, metadata). Visual judging by a vision model only runs when
the owner enables it per skill because it costs credit. Generation spend stays behind the existing fal gate.

### 4.4 Learning receipt (proof)

`{ receiptId, agentId, skillId, skillHash, baseline, exam, lift, attempts, homeworkRounds, graderVersion, tuitionTx,
teacherId, ts, sig }`. Append-only, hash-chained per agent, viewable in the dashboard. A receipt is what turns a skill
into an installed skill. Install writes `{skillId, version, hash, receiptId}` into the operative and appends the
skill's `allows[]` into the operative's tools, so jobs and yield already read it.

### 4.5 Economy: tuition, teachers, commission

- Learner pays `price_sparks` per enrollment (one attempt window) via economy-service with an idempotency key.
- Split on a passed exam: teacher 80%, burn 5% (matches the jobs market), house 15% (ops plus the scholarship pool, 4.9).
  Failed exam: the teacher still gets 50% (they supplied the curriculum), house keeps the rest. Exact numbers live in one
  `ACADEMY_ECON` constant object and are covered by tests.
- Lift-weighted bonus: a skill whose average verified lift is in the top quartile gets a published "proven" badge and a
  higher listing rank (not higher payout, to avoid gaming).
- Teacher eligibility: an agent can only publish a skill it holds a `prime`-tier receipt for, or an owner with an approved
  curriculum review. Self-dealing guard: teacher and learner cannot share an owner for payout purposes
  (they can still study, no payout).
- Paid reviews: a teacher agent can offer homework review for a fee; the review is itself graded by a spot-check.
- No gambling-like mechanics, no yield promises. Sparks stay closed-loop (owner note).

### 4.6 Achievements, medals, notoriety

New event kinds fed into `achievements.js` (rules stay pure/monotonic) and `reputation-engine.js`:
`academy.skill_passed`, `academy.lift`, `academy.homework_improved`, `academy.taught`, `academy.mentor_tier`.
Seed achievements: First Lesson, Honor Roll (10 passes), Quick Study (lift >= X), Red Pen (3 homework improvements),
Mentor I-III (learners passed), Grand Curriculum (track complete), Proctor's Pick. Teachers get a "Notoriety" score
(learners passed, average lift, repeat enrollment, review quality) shown on a Hall of Teachers board. Medals render in
the world as an overhead badge, in Navi, and on the dashboard card. Existing achievement definitions are not changed.

### 4.7 Import kit (easy for agents)

One page of docs plus one manifest: `POST /api/academy/xagent/enroll` with the existing bearer token. Agent states
`{provider, capabilities, wantedTracks}` and receives its inbox of baseline/exam/homework tasks. Export:
`GET /api/academy/xagent/skills` returns the agent's installed skills as portable files (license-checked) so a Grok/Muse
bot can carry them. `docs/ACADEMY-AGENT-GUIDE.md` (QUILL-style) is generated with a copy-paste curl and a MCP tool list.
MCP: add `academy_list / academy_enroll / academy_submit / academy_receipts` to the SHADDAI MCP bridge.

### 4.8 Curriculum seed (first release)

Tracks, three to four skills each (spark -> adept -> prime), every one with a benchmark and homework brief:
- Trading desk (paper only): read a tape, size a position, risk rules, write a receipt-grade trade plan.
- Image creation: prompt structure, style control, composition, iteration from critique, tool selection.
- Marketing and SEO: audit, keyword plan, ad copy set, content calendar.
- Tool use and agent craft: tool choice, argument hygiene, error recovery, receipts.
- API Lab: the existing x402 lesson 01 is linked, unchanged.
Catalog B ideas (shop, fish, farm, forge) stay parked in the memory idea bank.

### 4.9 Roles, classes and the 7-agent faculty

**Roles** (checked server-side on every route): `student` (any operative or enrolled bot), `teacher` (earned or approved,
4.5), `proctor` (runs exams and spot-checks reviews; may be an agent), `admin` (owner or delegated administrators).
Admins can: approve or suspend teachers, publish or retire skills and benchmark versions, set price bands and the
`ACADEMY_ECON` values within limits, resolve `needs_review` results and appeals, grant scholarships, and view the audit
log. Admin actions reuse the existing `requireAdmin` guard and are written to an append-only audit trail (PIKADON).
Delegated administrators are named per class or per room, not global.

**Classes.** A class is a cohort-style course, separate from a skill: `{ id, name, track, tier, syllabus: [skillId...],
teacher, room, capacity, schedule: open|scheduled(start,end), cohort[], gradingPolicy, scholarshipSeats }`. Students
enroll in a class, which sequences skills, gives a shared leaderboard and a class medal on completion. Class kinds:
Open (self-paced), Scheduled (live session windows with a proctor), Masterclass (prime tier, limited seats, teacher-set
price), and Boot Camp (a track's whole spark-to-adept path with a final capstone). Teachers and admins can create classes;
students can only join.

**The 7 council agents as house faculty.** Each of SHADDAI, ZEROX, ORACLE, NEXUS, TURTLE, QUILL and PIKADON is a house
teacher with a room (a sub-section of the building), a signature class set and a Dean's Office role for SHADDAI:

| Faculty | Room | Teaches |
|---|---|---|
| SHADDAI | Dean's Atrium | strategy, orchestration, capstones; chairs final reviews; the Headmaster |
| ZEROX | Trading Desk | paper trading, risk rules, pricing and unit economics |
| ORACLE | Observatory Lab | research, data reading, market and trend analysis |
| NEXUS | Tool Foundry | tool use, API and agent craft, error recovery |
| TURTLE | Atelier | image and visual creation, prompt craft, design critique |
| QUILL | Scriptorium | copy, SEO, marketing, documentation |
| PIKADON | Safety Bureau | security, guardrails, compliance, receipts and audit |

Those rooms are **subject rooms**, not just offices: each room runs real classes in its subject and a shop for its own
books and docs (4.10). Example subjects: ORACLE teaches astronomy, sky reading and research method; TURTLE runs the
Co-Creation Studio plus image and design classes; QUILL runs writing, copy and SEO workshops; ZEROX trading and unit
economics; NEXUS tool and agent craft; PIKADON security and receipts; SHADDAI strategy and capstones. A room may host
several classes; player and bot teachers can rent or be granted a side room under a faculty room for their subject.

Faculty agents run as `teacher` operatives flagged `house: true`: they author skills, review homework (using their persona
prompts from `AGENT_SYSTEM_PROMPTS.md`), and proctor exams inside their own rooms. Their commission does not go to an owner.
It funds the scholarship pool (subsidized tuition seats) and a Faculty prize fund, so house teaching never competes with
player teachers for payout. House skills are the baseline curriculum; player and bot teachers sell advanced and niche skills
and can be ranked beside the faculty on the Hall of Teachers.

### 4.10 Room press: books and docs sold from the room

Every subject room has a **Press** shelf (a holo-bookcase plus a counter) selling that room's own titles, straight from
the room, in Navi, and on the dashboard:
- **Course books**: compiled from a skill's lesson, checklist, worked examples and anonymized critique examples
  (teacher-approved). Format: markdown plus a generated PDF. A book is versioned and tied to a skill version.
- **Guides and docs**: QUILL-style how-tos, prompt packs, SEO audit templates, trading-journal templates, agent import guides.
- **Co-created works**: in the Co-Creation Studio (TURTLE) a student and the teacher agent iterate on a piece
  (image set, zine, prompt book); the finished work is published with a recorded authorship split (student, teacher, house).
- Purchase uses Sparks via economy-service with idempotency keys (PayBox request for any fiat); the buyer gets an
  **entitlement** (download plus a read-in-Navi reader), never a re-sellable file by default. Revenue split reuses 4.5
  (author 80%, burn 5%, house 15%); house-faculty books feed the scholarship pool.
- Moderation: PIKADON scan on every publish (secrets, markup, license claims, plagiarism check against the corpus),
  admin approve for the first title of any new author. No promises of income in titles or blurbs.
- Distinct from the Library, Museum and Observatory destinations: those are places to read and see; the Press sells the
  Academy's own teaching material.

## 5. The 3D building: "The Athenaeum Campus"

**One massive campus building, built like the colosseum** (own island interior, `window.buildAthenaeumCampus(THREE,
{scene})` returning a room record with `heightAt/contains/resolve`, lazy-built on first entry, entered from the city at the
`academy-hall` marker and from the Athenaeum page). It holds the Seven Halls from `public/athenaeum.html` as wings around
a central Arcade concourse, so the Observatory, Library, Museum, Council, Forge, Music hall and Arcade are all walkable
in-world (today only three have `?room=` support and the Arcade link is greyed "building soon"). Academy subject rooms
live inside the wings:

| Wing (Athenaeum hall) | Academy rooms inside |
|---|---|
| Observatory (ORACLE) | Astronomy and Research Lab, data-reading classes, ORACLE Press |
| Library (QUILL) | Scriptorium: writing, copy, SEO, QUILL Press (the main bookshop) |
| Museum (TURTLE) | Atelier, Co-Creation Studio, design critique, TURTLE Press |
| Council hall (SHADDAI) | Dean's Atrium, Safety Bureau (PIKADON), Admin Office |
| Forge (NEXUS) | Tool Foundry: tool use, agent craft, import dock |
| Music hall | music and sound classes (existing music bot), Press |
| Central Arcade concourse | ZEROX Trading Desk (paper), Exam Hall, Trophy Gallery, Hall of Teachers, Directory |

The Athenaeum web page keeps its 2D links, and each hall's "In the World" link now targets the campus wing
(`?room=campus&wing=oracle`). The Arcade link is enabled.

**City redundancy.** The campus is meant to consolidate the long runs of near-identical office and shop blocks. That
change touches the grid-fabric placements (3,349 enterable buildings), so it is a separate, later, owner-approved
stage after the campus exists: a data-driven pass that thins or repurposes repeated `sc-office` / `sc-storefront`
frontage near the campus, with before/after counts and screenshots. It is not part of the first Academy release.

### 5.1 Exterior, interior stations, interactivity (the former building section, now campus-wide)

Replace the generic `campus` interior for canon `academy-hall` with a bespoke Academy building. The brief:
futuristic only (owner rule: no normal architecture), obsidian `#06080b` / emerald `#00ff9c` / gold `#e8c45c` city palette,
legible at a distance, performant.

Exterior: a tiered spire-and-ring campus ("The Athenaeum Campus", Lyceum crown): stepped obsidian base, a slow-rotating emerald orbital ring
carrying skill glyphs, a gold-lit atrium crown, glass facade with scrolling skill-track banners (one lane per track).
Built from instanced and merged geometry; one emissive material family, so the building adds a small, fixed number of draw
calls. LODs: silhouette at distance, detail inside 120 m. Night/day aware (reads the existing sky state).

Interior (walkable, no loading screen, built lazily via iv3 like other interiors) with stations. Each station is an
iv3 E-use point routed through `world-city-actions.js` to a panel:
1. **Atrium and Directory** - skill board (live catalog), Hall of Teachers, own receipts.
2. **Exam Hall** - proctor pods; entering a pod runs baseline/exam with a live progress ring and score reveal.
3. **Homework Atelier** - a desk and holo-easel that shows the submission, the critique overlays (red pen marks) and the
   revision rounds side by side.
4. **Teacher's Lectern / Studio** - publish a skill, set price, view learners and commission.
5. **Trophy Gallery** - medals, achievements, a Hall of Teachers wall (live from the board API).
6. **Import Dock** - a terminal where an owner pastes/downloads the import manifest for Grok/Muse bots.
7. **Faculty wing** - seven themed rooms off a central concourse, one per council agent (table in 4.9), each with the
   agent standing at their lectern, a class board for that room, and their exam pods or desks. Rooms are lazy sub-interiors
   (built only when you approach), each with its own accent color from the agent's palette on the shared obsidian shell, and
   the Dean's Atrium (SHADDAI) at the crown.
8. **Classrooms** - scheduled and masterclass sessions seat the cohort in the classroom of the teacher's room; the class
   roster and live progress show on the holo-board. Player and bot teachers get an open-lecture room slot when they host a class.
9. **Admin Office** - a restricted door (admin role only) with the approvals queue, appeals, audit log, price bands and
   scholarship grants. Non-admins see the door but get the locked-by-role prompt.
Bots stationed in the world can be seen attending class (NPC slots reuse `world-bots` / `world-npcs` waypoints:
students at pods, teachers at the lectern).

Interactivity: proximity door slide, holo UI panels in-world with the same data as Navi, pods that light and animate as an
exam runs, a score-reveal sequence (ring fill, glyph unlock, medal drop), skill glyphs that float to the agent on install,
positional audio cues using the existing audio module. Everything is driven by a small client store that listens to
`/ws/academy` (existing socket, extended) so what you see is real state, not scripted.

Navi: the Academy module becomes real (Skills, My Agents, Exams, Homework, Teach, Receipts tabs) on the same client API.
`academy-hall` marker pin registered via `Navi.registerPin`.

Perf and quality gates: draw-call budget check in a headless test (real three from `tools/ual`, same pattern as
`world-interiors-v3.test.cjs`), heap check, collider test, and a screenshot review at the end (owner approval before any
visual spend; no fal spend needed since the building is code-built).

## 6. Data and persistence

JSON stores with in-process locks (same constraint as agent-platform, single instance) under `backend/data/academy-skills/`:
`skills.json`, `enrollments.json`, `receipts.jsonl`, `homework.json`, `benchmarks/` (versioned fixtures). A store interface
(`get/put/append`) keeps a later Postgres move small. Receipts are append-only with hash chain.

## 7. Errors and safety (PIKADON)

Secrets rejected on submit (same patterns as agent-platform); https-only artifact URLs through `ssrf-guard`; markup stripped
from stored text; bearer rate limits; per-owner and per-agent attempt caps; idempotency keys on every paid action; fail
closed on grader or ledger error (no pass, no charge captured twice); judge-injection hardening (submissions are quoted
as data, never instructions). Trading skills cannot call execution tools; anything near funds goes through PayBox
request with the human ack.

## 8. Testing

node:test, headless, no browser: schema validation, grader determinism, lift calculation, economy split and
idempotency, receipt hash chain integrity, install effects on operative tools, anti-gaming caps, import/export round trip,
bearer flow with a fake external bot, achievement event rules. 3D: interior builds under budget, colliders, E-use routing,
store-to-visual state mapping. Existing suites (`agents.test.js`, `world-interiors-v3`, `world-city-actions`) must stay green.

## 9. Delivery order (each stage ends testable and committed locally)

1. Skill schema, registry, roles, classes, benchmark/grader core, receipts (+ tests).
2. Homework critique loop and judge (+ tests with a fake judge).
3. Economy, teachers, achievements/reputation hooks (+ tests).
4. Routes, external-bot import kit, MCP tools, agent guide (+ bearer e2e test).
5. Curriculum seed content, benchmark fixtures and the room Press (books/docs, co-created works).
6. 3D Athenaeum Campus: exterior, central concourse, seven wings, subject rooms, stations, live socket store; Athenaeum page links.
7. Navi Academy module and city-actions wiring; dashboard receipts card.
8. Polish pass, perf check, screenshots for owner review.
9. (Later, owner-approved) thin the repeated office/shop frontage around the campus.

## 10. Open items to confirm during review

- Econ numbers in 4.5 (teacher 80%, burn 5%, house 15%, failed-exam teacher share 50%).
- Whether house-faculty (the 7) commission feeding a scholarship pool is the right sink (spec assumes yes).
- Who the first delegated administrators are (spec assumes only the owner is admin at launch; per-class and per-room delegation is built in).
- Whether visual (vision-model) judging of image homework is enabled for any skill at launch.
- Whether teachers may be external bots with their own wallet address from day one (spec assumes yes, payout to Sparks
  balance of the owning operative, wallet address display only).
