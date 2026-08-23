# Quick Start Wizard — Design Spec

**Date:** 2026-08-23
**Status:** Approved by owner, proceeding to implementation plan.

## Problem

Real people keep asking for things SHADDAI should already be able to give them ("3rd time this week someone needed a website") and can't get it easily. The platform has powerful agents but no easy, guided path from "I want X" to "here's X." Onboarding/UI complexity is a separate, already-approved effort (`BLUEPRINT-SECTIONS/05-PRODUCT-ONBOARDING-WHITEPAPER.md` — gamified starter-agent flow) and is NOT touched by this spec. This is a second, additive entry point: a "Quick Start" wizard reachable from inside the dashboard.

## Goals

1. A generic, mobile-first, step-by-step Q&A wizard UI: one question per screen, big tap targets, progress indicator, works well on a phone.
2. A declarative **use-case registry** so each "flow" (Make a Website, and eventually dozens more) is defined as data (questions + workflow steps + output type), not bespoke code per use case — this is what lets the registry scale toward 10-100 use cases without a rewrite each time.
3. One fully real, working flagship use case: **Make a Website** — answers go in, a real, styled, live-URL website comes out (not just text).
4. Reuse what already exists: the Workflow Center's agent-dispatch/SSE machinery (`/api/workflows/run`), the existing BYOK "Connect Your APIs" panel (Groq/Ollama already in the catalog — not rebuilt), and the already-live MCP server (`shaddai-mcp`) — new backend capability is reachable via `shaddai_orchestrate` automatically, no new MCP scaffolding needed for this pass.

## Non-goals (this pass)

- Rebuilding or replacing the approved gamified onboarding flow.
- Per-user-scoped BYOK key isolation (current global env-override BYOK is a known gap, flagged, not fixed here — separate security task).
- Building all 10-100 use cases now. This pass builds the registry pattern + ONE complete flagship flow (Make a Website) + 2-3 stub entries proving the pattern generalizes. Filling out the rest of the registry is follow-on work using the same pattern.
- A new dedicated MCP tool for website-making (orchestrate already reaches it; a nicer typed tool can follow later).

## Architecture

**New backend capability — website generator.** Nothing in SHADDAI today outputs a real deployable HTML site (TURTLE's `write_file` saves privately to `generated-output/`, not a public path; no HTML template system exists). New pieces:
- A small set of clean, responsive HTML page templates (landing/portfolio/business-basic — pick 2-3 to start) with placeholder slots for: site name, tagline, sections/copy, color/style choice, contact info.
- A generator function that takes wizard answers + QUILL-written copy (via the existing agent-dispatch path) and fills a template, writing the result to a new **public**, servable path (e.g. `public/sites/<slug>/index.html`) so it's a real live URL immediately — no separate deploy step needed since `public/` is already served.
- A backend route, e.g. `POST /api/quickstart/make-website`, that orchestrates: call QUILL for copy → fill template → write file → return `{ url, previewHtml }`.

**Use-case registry.** A single JSON/JS config file (e.g. `backend/quickstart-usecases.js`) — array of `{ id, label, icon, questions: [{key, prompt, type, options?}], run: <handler or workflow-chain reference> }`. The wizard UI is generic: given a use-case id, render its questions in order, collect answers, POST to a generic `/api/quickstart/run/:useCaseId` endpoint that looks up the registry entry and executes its handler (for "make-website", that's the generator above; for simpler use cases, it can just be an existing Workflow Center chain run with the answers as input).

**Wizard UI.** New lightweight page or dashboard section (not crammed into random spots in the 55k-line file) — mobile-first, one question per screen, "Back"/"Next", progress dots, a picker screen first ("What do you want to make?" → cards, starting with Make a Website + 2-3 stubs marked "coming soon" or simple text-output flows). On completion: show the result — for website, an embedded preview iframe + the live URL + a copy-link button; for text/image outputs, render inline.

## Data flow

```
User picks use case → wizard asks its questions (client-side, from registry)
  → POST /api/quickstart/run/:useCaseId { answers }
  → server looks up use case, runs its handler
      (make-website: QUILL copy → template fill → write to public/sites/<slug>/)
  → response { ok, outputType: 'website'|'text'|'image', url?, content? }
  → wizard renders result (preview iframe / text / image) + "Start over" / "Make another"
```

## Testing

- Backend: exercise `/api/quickstart/run/make-website` headlessly (curl, matching today's verification pattern) with a few different answer sets, confirm a real file lands under `public/sites/` and is fetchable.
- Frontendl: no visible browser automation per standing preference — verify via reading rendered output / headless checks; a manual look is on the owner if wanted.

## Open items carried forward (not blocking this pass)

- Per-user BYOK key scoping.
- Filling out use-cases #4 through #100.
- A dedicated `shaddai_make_website` MCP tool.
