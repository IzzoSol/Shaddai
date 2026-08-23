# RAG Brain: Full-Corpus Digests + MCP Grounding

**Date:** 2026-08-23
**Status:** Draft for review

## Context

Two RAG stores existed for SHADDAI: a standalone Python store (`Documents\SHADDAI-SYSTEM\rag\`, 482,301 chunks across 7 agents from 2,777 videos + books, TF-IDF/flat JSONL, no timestamps preserved) and the Node backend's per-agent store (`Shaddai\backend\data\rag\kb_<agent>\`), which is what's actually live — wired into the dashboard's Brain tab and (partially) the MCP server.

Mid-investigation we found that **another session had already built most of the target architecture**, staged but uncommitted in `C:\Users\Brittany\Shaddai` as of 2026-08-22:

- `backend/rag-index.js` v2 — per-chunk `t0`/`t1` timestamps, parsed from real in-text `[MM:SS]` markers when present, else estimated from word-position ÷ ~150wpm (flagged `tsEstimate`). `deepLink()` builds a YouTube seek URL; `backfillTimestamps()` retrofits legacy docs.
- `backend/digest-brain.js` — turns a transcript into a structured digest: thesis → timestamped chapters → insights → frameworks → quotes → questions-it-answers. Engine tag `extractive-v1` (rule-based, no LLM call).
- `backend/knowledge/routes.json` — goal → playbook mapping per agent (e.g. "make a strategic call" → numbered steps citing specific digests). This *is* the "use cases" layer, and it's more actionable than a flat lesson summary would have been.
- `backend/knowledge/tools-ledger.json` — living registry of tools the empire runs on.
- `backend/lib/knowledge.js` — combines routes + digests + static KB + tools ledger + learned recall into a 5-layer context block injected into every agent's system prompt.
- `backend/brain-server.js` v2 — the dashboard's `/api/*` HTTP endpoints now use `knowledge.contextFor()` and surface timestamps/deep-links in results.

Gaps against what you asked for:
- Only **55 digests** exist, generated from a small curated folder (`Documents\SHADDAI-SYSTEM\oracle\deep_brains`) — not the full 2,777-video / 482k-chunk corpus.
- Digests are extractive, not LLM-synthesized — thinner than "full lessons, really full understanding."
- **`backend/mcp-server-rag.js` was never touched.** Its `rag_ask` tool still synthesizes answers from raw chunk search via local Ollama — it does not call `knowledge.contextFor()`, so MCP clients (including agents invoked through Claude Code) get none of the routes/digests/tools grounding that the dashboard's HTTP API already has. This is the literal gap behind "we need the agents and the MCP to actually understand the knowledge."

## Decision

Build on the existing pipeline rather than replacing it. Three phases:

### Phase 1 — Full-corpus ingestion
Migrate the Python store's 2,777 videos + book content into the Node `kb_<agent>` stores as one document per video (not per pre-split chunk), so `rag-index.js`'s existing timestamp machinery works unmodified:
- For each video: reconstruct full text from the transcript file, but interleave `[MM:SS]` markers at each caption-cue boundary using the real timestamps already sitting in the matching `.vtt` file under `Documents\SHADDAI-SYSTEM\downloads\`. `parseTimeMarkers()` in `rag-index.js` already recognizes this exact format — no ingestion-time re-download needed (per earlier finding: no source video/audio survives locally; VTT captions do).
- Call `rag-index.addDocument(kb_<agent>, title, markedText, { videoId, url, kind:'transcript', title })` — `buildChunks()` picks up the real markers automatically and sets `tsMode:'markers'`.
- Agent assignment comes from the existing `agent` field already present on each video's chunks in `chunks.jsonl` (no re-classification needed).
- Book content (`books_chunks.jsonl`, 80,534 chunks, 42 topics) ingests the same way without markers — falls back to `tsMode:'estimate'`, which is correct since books have no timestamps.
- Old pilot corpus (`oracle/deep_brains`, source of the current 55 digests) stays as-is; new ingestion is additive.

### Phase 2 — Digest quality upgrade
Add a `claude-v1` engine option to `digest-brain.js`, alongside the existing `extractive-v1`, using the Anthropic provider already wired in `llm-client.js` (needs `ANTHROPIC_API_KEY` in `backend/.env` — not currently set). Claude produces the thesis/chapters/insights/frameworks/quotes/questions structure with real synthesis instead of rule-based extraction. Run `node digest-brain.js --force` (scoped per agent, dry-run smallest agent first) across the newly-ingested full corpus. `routes.json` stays hand-curated (goal→playbook mapping is a judgment call), but digest theses from this pass become candidate material for expanding it later — not automated in this phase.

### Phase 3 — MCP grounding
Update `backend/mcp-server-rag.js`'s `rag_ask` (and optionally `run_agent`) to call `knowledge.contextFor(agent, query)` for the same 5-layer grounding `brain-server.js` already has, instead of raw-chunk-only Ollama synthesis. Add two new tools: `get_route(agent, query)` and `list_digests(agent)` so MCP clients can pull routes/digests directly, not just through a synthesized answer.

## Testing
- Phase 1: dry-run on one agent's videos first (PIKADON — fewest topics), verify `tsMode==='markers'` on ingested docs and spot-check 3-4 `deepLink` timestamps against the actual source video's real content (via the VTT text at that offset, not by re-fetching from YouTube).
- Phase 2: dry-run `claude-v1` digestion on the same agent's newly-ingested docs, spot-check digest quality against the extractive baseline, estimate/confirm cost before running the full 7-agent pass.
- Phase 3: `node mcp-server-rag.js --self-test-full` (existing harness) plus a manual `rag_ask` call before/after to confirm routes/digests now appear in the grounding context.

## Open items before implementation
- The existing staged (uncommitted) work in `Shaddai\backend` should be committed as a clean baseline before Phase 1 starts, so the two efforts don't get tangled — needs your sign-off since it's a commit, not something to do silently.
- `ANTHROPIC_API_KEY` needs to be set in `backend/.env` for Phase 2's Claude engine to run at all.
