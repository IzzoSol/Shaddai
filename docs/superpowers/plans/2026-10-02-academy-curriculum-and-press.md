# Academy Curriculum and Room Press (Plan 3 of 4)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (inline). TDD per task.

**Goal:** Fill the Academy with real, graded teaching content across the seven faculty rooms, and let each room sell its own books and docs (course books compiled from skills, guides, co-created works) with Sparks, authors paid, house funded.

**Architecture:** `press.js` (new, self-contained) sells titles with an entitlement model. A curriculum module defines benchmarks, rubrics, skills and house course books as data plus a loader `seedCurriculum(academy)` that registers them idempotently. The school router gains `/press/*` routes. `getAcademy()` seeds on first build.

**Spec:** `docs/superpowers/specs/2026-10-02-shaddai-academy-design.md` (4.8 curriculum, 4.10 room Press). **Builds on:** Plans 1 and 2.

## Global Constraints
Same as Plans 1 and 2. Additionally: trading content is paper only and never promises profit; no skill allows execution tools; house content is published by the house (admin path) and its money goes to the scholarship pool; lesson text is authored once and must pass `validateSkill`.

## Review Focus
1. Keyword stuffing cannot pass a deterministic benchmark (length caps, penalties) and an empty answer scores 0.
2. A pending or rejected title can never be bought or read by a non-author; entitlement is per owner.
3. Press money: author shares always total the author pool, rounding never loses or creates Sparks, double buy never double-charges.
4. Seeding twice changes nothing (idempotent) and never overwrites an edited skill.

## Tasks
1. **Press core** (`backend/lib/academy/press.js`, `press.test.js`). DONE in this plan's first commit: publish/approve/list/pending/get/buy/read, `compileBook(skill)`.
2. **Grader hardening** (`graders.js`, `graders.test.js` additions): checklist `spec.maxChars` (over-length output scores 0.5x), `spec.penalize:[{any:[...], weight}]` subtracts weighted hits; both optional so Plan 1 behavior is unchanged.
3. **Curriculum seed** (`backend/lib/academy/curriculum/*.js`, `curriculum.test.js`): 11 skills across the seven rooms (tool-hygiene, tool-error-recovery [NEXUS]; paper-risk-basics, trade-journal [ZEROX]; seo-audit, copy-clarity [QUILL]; image-prompt-craft [TURTLE]; sky-reading-basics, research-method [ORACLE]; secrets-hygiene [PIKADON]; strategy-brief [SHADDAI]); each with a benchmark (4+ tasks, deterministic where possible), a homework brief and a registered rubric. `seedCurriculum(academy)` idempotent. Tests: every skill validates, every benchmark registers, a model answer passes with lift against an empty baseline, a keyword-stuffed answer fails, all seven faculty rooms have at least one skill, seeding twice is a no-op, house skills carry `teacher.type === 'house'`.
4. **Press routes** (`academy-school-routes.js` additions, `academy-press-routes.test.js`): `GET /press/titles?room=`, `GET /press/titles/:id`, `POST /press/titles` (publish), `POST /press/buy`, `GET /press/read/:id`, admin `GET /press/pending`, `POST /press/approve`. Seed publishes one house course book per skill into its room.
5. **Wire and gate** (`academy-instance.js` seeds once; gate registration).

## Self-review
Spec 4.8 and 4.10 covered by tasks 1-5. Deferred: generated PDF output (markdown only for now), co-creation session UI (Plan 4 studio station drives the same `publish` with an authorship split), vision-model judging of images, Catalog B skills (parked in the owner's idea bank).
