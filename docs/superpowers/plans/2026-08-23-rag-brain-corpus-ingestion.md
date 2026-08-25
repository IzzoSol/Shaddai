# RAG Brain Corpus Ingestion + MCP Grounding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ingest the full 2,777-video / 482,301-chunk SHADDAI corpus (video transcripts + books) into the live `backend/data/rag/kb_<agent>` stores with real timestamps recovered from existing `.vtt` caption files, and wire `mcp-server-rag.js` to use the same routes/digests/tools grounding `brain-server.js` already has.

**Architecture:** A one-time Node ingestion script (`backend/scripts/ingest-corpus.js`) reads `Documents\SHADDAI-SYSTEM\rag\chunks.jsonl`/`books_chunks.jsonl` for per-video metadata (title/channel/topic/agent), cross-references each video against a filesystem index of `.vtt` caption files under `Documents\SHADDAI-SYSTEM\downloads\` to recover real per-line timestamps (embedded as `[MM:SS]` markers that `rag-index.js`'s existing `parseTimeMarkers()` already understands), and calls a new bulk-insert API on `rag-index.js` to write documents into each agent's `kb_<agent>` store without rebuilding TF-IDF vectors after every single insert. Videos with no matching `.vtt` (and all book chunks) ingest as individual pre-chunked documents with estimated (not real) timestamps — this is the existing, already-correct fallback behavior in `buildChunks()`. Phase 3 wires `backend/mcp-server-rag.js`'s `rag_ask` tool to call `backend/lib/knowledge.js`'s `contextFor()` for the same 5-layer grounding the dashboard HTTP API already gets, and adds `get_route`/`list_digests` MCP tools.

**Tech Stack:** Node.js (CommonJS, matches existing `backend/` convention), Jest for tests, no new dependencies.

**Spec:** `docs/superpowers/specs/2026-08-23-rag-brain-lesson-layer-design.md`

## Global Constraints

- No re-download of source videos/audio — timestamps come only from `.vtt` files already on disk (per spec: none of the 2,777 source videos have surviving local media).
- Phase 2 (Claude-synthesized digest engine) is explicitly deferred — do not touch `digest-brain.js`'s engine selection in this plan.
- Every new/modified function in `rag-index.js` must stay backward-compatible with the existing `addDocument()` single-doc API — do not remove or change its signature.
- `parseTimeMarkers()`'s regex (already in `rag-index.js`) is the single source of truth for what counts as a valid marker token; new VTT-marking code must produce tokens that regex accepts, not a parallel format.

---

## File Structure

- **Modify:** `backend/rag-index.js` — add `addDocumentsBulk(user, items)` alongside the existing `addDocument()`, sharing `buildChunks()`/`_timeRefs()` but rebuilding vectors once per batch instead of once per document.
- **Create:** `backend/scripts/vtt-parse.js` — pure functions `vttToMarkedText(raw)` and `fmtMarker(totalSec)`. No filesystem or rag-index dependency, fully unit-testable.
- **Create:** `backend/scripts/vtt-index.js` — `buildVttIndex(roots)` walks given directories and returns `Map(videoId -> absoluteFilePath)` for `.vtt` files only.
- **Create:** `backend/scripts/ingest-corpus.js` — CLI orchestrator: streams `chunks.jsonl`/`books_chunks.jsonl`, uses `vtt-index.js` + `vtt-parse.js` + `rag-index.js`'s new bulk API to populate `kb_<agent>` stores. Supports `--agent=<NAME>`, `--limit=<N>`, `--dry-run`.
- **Modify:** `backend/mcp-server-rag.js` — `rag_ask` tool calls `knowledge.contextFor()`; two new tools `get_route` and `list_digests` added to the `TOOLS` array and their handlers.
- **Test:** `backend/tests/vtt-parse.test.js`, `backend/tests/rag-index-bulk.test.js`, `backend/tests/vtt-index.test.js`.

---

### Task 1: `vtt-parse.js` — VTT-to-marked-text conversion

**Files:**
- Create: `backend/scripts/vtt-parse.js`
- Test: `backend/tests/vtt-parse.test.js`

**Interfaces:**
- Produces: `vttToMarkedText(raw: string): string` — takes raw WEBVTT file content, returns plain text with a `[MM:SS]` or `[H:MM:SS]` marker token inserted immediately before the first caption line of each cue (subsequent lines within the same cue get no marker, avoiding marker spam). Strips `WEBVTT` header, cue-number lines, timing lines, and `<...>` inline tags — mirrors the stripping behavior of the existing Python `vtt_to_text()` in `Documents\SHADDAI-SYSTEM\rag\build_index.py` but keeps the timestamp instead of discarding it.
- Produces: `fmtMarker(totalSec: number): string` — formats seconds as `"MM:SS"` (two-digit, zero-padded) or `"H:MM:SS"` past one hour. This is intentionally a separate small function from `rag-index.js`'s own `fmtTime()` (which formats `M:SS` without zero-padding minutes) — `fmtMarker`'s output must exactly satisfy `parseTimeMarkers()`'s regex `^\[?\(?((?:\d{1,2}:)?[0-5]?\d):([0-5]\d)\)?\]?[.:,;]?$`, which requires the minutes group to be 1-2 digits — zero-padded `"00"` through `"59"` both satisfy `[0-5]?\d`, so this is safe.

- [ ] **Step 1: Write the failing test**

```js
// backend/tests/vtt-parse.test.js
const { vttToMarkedText, fmtMarker } = require('../scripts/vtt-parse');
const ragIndex = require('../rag-index');

const SAMPLE_VTT = `WEBVTT

1
00:00:01.000 --> 00:00:04.000
Hello and welcome to this video

2
00:00:04.500 --> 00:00:08.000
<c>Today we're</c> talking about hashing

00:01:05.000 --> 00:01:09.000
Let's get started with the details
`;

describe('fmtMarker', () => {
  test('formats seconds under an hour as MM:SS', () => {
    expect(fmtMarker(1)).toBe('00:01');
    expect(fmtMarker(65)).toBe('01:05');
    expect(fmtMarker(599)).toBe('09:59');
  });
  test('formats seconds past an hour as H:MM:SS', () => {
    expect(fmtMarker(3661)).toBe('1:01:01');
  });
});

describe('vttToMarkedText', () => {
  test('strips WEBVTT header, cue numbers, timing lines, and tags', () => {
    const out = vttToMarkedText(SAMPLE_VTT);
    expect(out).not.toMatch(/WEBVTT/);
    expect(out).not.toMatch(/-->/);
    expect(out).not.toMatch(/<c>/);
    expect(out).toContain('Hello and welcome to this video');
    expect(out).toContain('Today we\'re talking about hashing');
  });

  test('inserts one bracketed marker per cue, before the caption text', () => {
    const out = vttToMarkedText(SAMPLE_VTT);
    expect(out).toContain('[00:01] Hello and welcome to this video');
    expect(out).toContain('[00:04] Today we\'re talking about hashing');
    expect(out).toContain('[01:05] Let\'s get started with the details');
  });

  test('produced markers are recognized as real by rag-index parseTimeMarkers', () => {
    const out = vttToMarkedText(SAMPLE_VTT);
    const words = out.split(/\s+/).filter(Boolean);
    const markers = ragIndex._internal.parseTimeMarkers(words);
    expect(markers.length).toBeGreaterThanOrEqual(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx jest tests/vtt-parse.test.js`
Expected: FAIL with `Cannot find module '../scripts/vtt-parse'`

- [ ] **Step 3: Write minimal implementation**

```js
// backend/scripts/vtt-parse.js
'use strict';

/** Seconds -> "MM:SS" (zero-padded) or "H:MM:SS" past one hour. */
function fmtMarker(totalSec) {
  const s = Math.max(0, Math.round(Number(totalSec) || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const two = (n) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${two(m)}:${two(ss)}` : `${two(m)}:${two(ss)}`;
}

const CUE_TIME_RE = /^(?:(\d{1,2}):)?(\d{2}):(\d{2})\.\d{3}\s*-->/;

/**
 * Convert raw WEBVTT text into plain text with a [MM:SS] marker before the
 * first caption line of each cue. Mirrors the Python vtt_to_text() stripping
 * (WEBVTT header, cue-number lines, timing lines, <tag> markup) but keeps
 * the timestamp as a standalone bracketed token instead of discarding it.
 */
function vttToMarkedText(raw) {
  const lines = String(raw || '').split(/\r?\n/);
  const out = [];
  let pendingSec = null;

  for (let rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith('WEBVTT')) continue;
    if (/^\d+$/.test(line)) continue; // cue number

    const m = CUE_TIME_RE.exec(line);
    if (m) {
      const h = m[1] ? parseInt(m[1], 10) : 0;
      const mm = parseInt(m[2], 10);
      const ss = parseInt(m[3], 10);
      pendingSec = h * 3600 + mm * 60 + ss;
      continue;
    }
    if (line.includes('-->')) continue; // malformed timing line safety net

    const text = line.replace(/<[^>]+>/g, '').trim();
    if (!text) continue;

    if (pendingSec != null) {
      out.push(`[${fmtMarker(pendingSec)}]`);
      pendingSec = null; // only the cue's first caption line gets a marker
    }
    out.push(text);
  }
  return out.join(' ');
}

module.exports = { vttToMarkedText, fmtMarker };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx jest tests/vtt-parse.test.js`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
cd "C:\Users\Brittany\Shaddai"
git add backend/scripts/vtt-parse.js backend/tests/vtt-parse.test.js
git commit -m "feat: add VTT-to-marked-text parser for real timestamp recovery"
```

---

### Task 2: `vtt-index.js` — filesystem index of available VTT captions

**Files:**
- Create: `backend/scripts/vtt-index.js`
- Test: `backend/tests/vtt-index.test.js`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: `buildVttIndex(roots: string[]): Map<string,string>` — walks each root directory recursively, and for every `.vtt` file found, derives a video id from the filename (strip `.vtt` extension, then strip a trailing `.en` if present — this exactly matches the `vid = fn[:-4]; if vid.endswith(".en"): vid = vid[:-3]` logic in `Documents\SHADDAI-SYSTEM\rag\build_index.py`), and maps that id to the file's absolute path. Later files with a duplicate id do not overwrite earlier ones (first-found wins, matching the Python script's `seen_vids` dedup order: `transcripts/utopia_land` conceptually comes first, but that folder holds only `.txt` — real dedup only matters within `downloads/`, so plain first-wins over `fs`'s natural walk order is sufficient and does not need to replicate Python's exact source-priority list).

- [ ] **Step 1: Write the failing test**

```js
// backend/tests/vtt-index.test.js
const fs = require('fs');
const os = require('os');
const path = require('path');
const { buildVttIndex } = require('../scripts/vtt-index');

describe('buildVttIndex', () => {
  let tmpRoot;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vtt-index-test-'));
    fs.mkdirSync(path.join(tmpRoot, 'nested'), { recursive: true });
    fs.writeFileSync(path.join(tmpRoot, 'abc123.en.vtt'), 'WEBVTT\n');
    fs.writeFileSync(path.join(tmpRoot, 'nested', 'xyz789.vtt'), 'WEBVTT\n');
    fs.writeFileSync(path.join(tmpRoot, 'not-a-caption.txt'), 'plain text\n');
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  test('indexes .vtt files by video id, stripping trailing .en', () => {
    const idx = buildVttIndex([tmpRoot]);
    expect(idx.get('abc123')).toBe(path.join(tmpRoot, 'abc123.en.vtt'));
  });

  test('finds .vtt files in nested directories', () => {
    const idx = buildVttIndex([tmpRoot]);
    expect(idx.get('xyz789')).toBe(path.join(tmpRoot, 'nested', 'xyz789.vtt'));
  });

  test('ignores non-.vtt files', () => {
    const idx = buildVttIndex([tmpRoot]);
    expect(idx.has('not-a-caption')).toBe(false);
    expect(idx.size).toBe(2);
  });

  test('silently skips a root directory that does not exist', () => {
    const idx = buildVttIndex([path.join(tmpRoot, 'does-not-exist')]);
    expect(idx.size).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx jest tests/vtt-index.test.js`
Expected: FAIL with `Cannot find module '../scripts/vtt-index'`

- [ ] **Step 3: Write minimal implementation**

```js
// backend/scripts/vtt-index.js
'use strict';

const fs = require('fs');
const path = require('path');

function videoIdFromVttFilename(filename) {
  let vid = filename.slice(0, -'.vtt'.length);
  if (vid.endsWith('.en')) vid = vid.slice(0, -'.en'.length);
  return vid;
}

/**
 * Walk each root directory recursively and index every .vtt file by the
 * video id derived from its filename. First-found wins on id collision.
 */
function buildVttIndex(roots) {
  const index = new Map();

  function walk(dir) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (_) {
      return; // missing/unreadable directory: skip silently
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.vtt')) {
        const vid = videoIdFromVttFilename(entry.name);
        if (!index.has(vid)) index.set(vid, full);
      }
    }
  }

  for (const root of roots) walk(root);
  return index;
}

module.exports = { buildVttIndex, videoIdFromVttFilename };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx jest tests/vtt-index.test.js`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
cd "C:\Users\Brittany\Shaddai"
git add backend/scripts/vtt-index.js backend/tests/vtt-index.test.js
git commit -m "feat: add filesystem VTT-caption indexer for corpus ingestion"
```

---

### Task 3: `rag-index.js` — bulk document insert (single vector rebuild per batch)

**Files:**
- Modify: `backend/rag-index.js`
- Test: `backend/tests/rag-index-bulk.test.js`

**Interfaces:**
- Consumes: `buildChunks(docId, text, meta)` and `rebuildVectors(docs)` — both already exist in `rag-index.js` (used internally by the existing `addDocument()`).
- Produces: `addDocumentsBulk(user: string, items: Array<{name: string, text: string, meta?: object}>): {docIds: string[], totalChunks: number}` — same per-item validation and chunk-building as `addDocument()` (throws if any item has empty/non-string `text`, same field-length caps on `meta`), but appends every item to the in-memory `docs` array first and calls `rebuildVectors(docs)` / writes `idf.json` / `saveDocs()` exactly once at the end, instead of once per item. Existing `addDocument()` is unchanged and continues to work for single-document callers (`ingest-knowledge.js`, any live upload endpoint).

**Why this task exists:** `addDocument()` currently rebuilds every chunk's TF-IDF vector across the user's *entire* document set on every single call, then rewrites `docs.json`+`idf.json` to disk. Ingesting per-video/per-chunk documents one at a time across ~2,777 videos plus ~80,534 book chunks would call this thousands of times per agent, so each successive insert would be slower than the last and the whole corpus ingestion would take drastically longer than necessary. Batching removes that quadratic-ish cost for this one-time job.

- [ ] **Step 1: Write the failing test**

```js
// backend/tests/rag-index-bulk.test.js
const fs = require('fs');
const os = require('os');
const path = require('path');

describe('addDocumentsBulk', () => {
  let tmpHome, ragIndex, RAG_ROOT;
  const USER = 'kb_bulktest';

  beforeEach(() => {
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'rag-bulk-test-'));
    jest.resetModules();
    process.env.SHADDAI_RAG_ROOT_OVERRIDE_FOR_TEST = tmpHome; // see Step 3 note
    ragIndex = require('../rag-index');
  });

  afterEach(() => {
    delete process.env.SHADDAI_RAG_ROOT_OVERRIDE_FOR_TEST;
    fs.rmSync(tmpHome, { recursive: true, force: true });
  });

  test('inserts multiple documents and returns one docId per item', () => {
    const { docIds, totalChunks } = ragIndex.addDocumentsBulk(USER, [
      { name: 'Video One', text: 'alpha beta gamma delta epsilon zeta eta theta iota kappa '.repeat(5) },
      { name: 'Video Two', text: 'lambda mu nu xi omicron pi rho sigma tau upsilon '.repeat(5) },
    ]);
    expect(docIds).toHaveLength(2);
    expect(totalChunks).toBeGreaterThan(0);
  });

  test('bulk-inserted documents are searchable afterward, same as addDocument', () => {
    ragIndex.addDocumentsBulk(USER, [
      { name: 'Unique Topic Doc', text: 'zephyrsaurus is a made up word that only appears here '.repeat(10) },
    ]);
    const hits = ragIndex.searchUser(USER, 'zephyrsaurus', 3);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].docName).toBe('Unique Topic Doc');
  });

  test('meta (videoId, kind, title) is preserved per item like addDocument', () => {
    ragIndex.addDocumentsBulk(USER, [
      { name: 'Meta Doc', text: 'word '.repeat(30), meta: { videoId: 'abc123', kind: 'transcript', title: 'Meta Doc Title' } },
    ]);
    const docs = ragIndex.listUserDocs(USER);
    const doc = docs.find(d => d.name === 'Meta Doc');
    expect(doc.videoId).toBe('abc123');
    expect(doc.kind).toBe('transcript');
  });

  test('rebuildVectors/save happens once for the whole batch, not once per item', () => {
    const saveDocsSpy = jest.spyOn(require('../rag-index')._internal, 'saveDocsForTest');
    // saveDocsForTest is a thin test-only wrapper added in Step 3 around the
    // module-private saveDocs(), purely so this test can count calls.
    ragIndex.addDocumentsBulk(USER, [
      { name: 'D1', text: 'one two three four five six seven eight nine ten '.repeat(5) },
      { name: 'D2', text: 'eleven twelve thirteen fourteen fifteen sixteen '.repeat(5) },
      { name: 'D3', text: 'seventeen eighteen nineteen twenty twenty-one '.repeat(5) },
    ]);
    expect(saveDocsSpy).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx jest tests/rag-index-bulk.test.js`
Expected: FAIL — `ragIndex.addDocumentsBulk is not a function`

- [ ] **Step 3: Write minimal implementation**

Add to `backend/rag-index.js`, right after the existing `addDocument()` function (do not modify `addDocument()` itself):

```js
/**
 * Insert multiple documents for a user in one batch: builds every item's
 * chunks first, appends them all to the in-memory doc list, then rebuilds
 * TF-IDF vectors and writes docs.json/idf.json exactly once. Use this for
 * bulk/corpus ingestion instead of calling addDocument() in a loop — see
 * Task 3 of docs/superpowers/plans/2026-08-23-rag-brain-corpus-ingestion.md
 * for why per-call vector rebuilds don't scale to thousands of documents.
 *
 * items: Array<{ name, text, meta? }> — same validation/shape as addDocument.
 * Returns { docIds: string[], totalChunks: number }.
 */
function addDocumentsBulk(user, items) {
  if (!Array.isArray(items) || !items.length) throw new Error('items array required');
  const docs = loadDocs(user);
  const docIds = [];
  let totalChunks = 0;

  for (const item of items) {
    const { name, text, meta } = item || {};
    if (!text || typeof text !== 'string') throw new Error('text required for every item');
    const docId = 'doc_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    const m = meta && typeof meta === 'object' ? meta : {};
    const built = buildChunks(docId, text, m);
    if (!built.chunks.length) throw new Error(`No content found in text for item "${name}"`);

    docs.push({
      id: docId,
      name: String(name || 'untitled').slice(0, 200),
      text: text.slice(0, 1_000_000),
      uploadedAt: new Date().toISOString(),
      kind: m.kind ? String(m.kind).slice(0, 40) : undefined,
      videoId: m.videoId ? String(m.videoId).slice(0, 32) : undefined,
      url: m.url ? String(m.url).slice(0, 500) : undefined,
      title: m.title ? String(m.title).slice(0, 300) : undefined,
      source: m.source ? String(m.source).slice(0, 200) : undefined,
      durationSec: Number(m.durationSec) > 0 ? Math.round(Number(m.durationSec)) : undefined,
      tsMode: built.hasReal ? 'markers' : (Number(m.durationSec) > 0 ? 'duration' : 'estimate'),
      chunks: built.chunks,
    });
    docIds.push(docId);
    totalChunks += built.chunks.length;
  }

  const metaOut = rebuildVectors(docs);
  fs.writeFileSync(path.join(userDir(user), 'idf.json'), JSON.stringify(metaOut.idf), 'utf8');
  saveDocs(user, docs);

  return { docIds, totalChunks };
}
```

Add `addDocumentsBulk` to the `module.exports` object (alongside the existing `addDocument`).

For the fourth test's spy target: add a one-line test-only wrapper so `saveDocs` call counts are observable without changing its real call sites. In the `_internal` export object at the bottom of `rag-index.js`, add `saveDocsForTest: saveDocs` (an alias, not a new function) — this exposes the existing private `saveDocs` reference under `_internal` purely for this test's `jest.spyOn`, exactly like `buildChunks`/`parseTimeMarkers`/etc. are already exposed there.

Note on the `SHADDAI_RAG_ROOT_OVERRIDE_FOR_TEST` env var referenced in Step 1: check `RAG_ROOT`'s definition at the top of `rag-index.js` first — if it is a hardcoded `path.join(__dirname, 'data', 'rag')` with no override hook, add one (`process.env.SHADDAI_RAG_ROOT_OVERRIDE_FOR_TEST || path.join(__dirname, 'data', 'rag')`) so tests never write into the real `backend/data/rag/kb_bulktest` directory. This is a one-line change to the existing `RAG_ROOT` constant, not a new function.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx jest tests/rag-index-bulk.test.js`
Expected: PASS (4 tests)

- [ ] **Step 5: Run the full existing rag-index test suite to confirm no regression**

Run: `cd backend && npx jest rag-index`
Expected: PASS — all prior rag-index behavior (including `addDocument()`, timestamp parsing, search) unaffected.

- [ ] **Step 6: Commit**

```bash
cd "C:\Users\Brittany\Shaddai"
git add backend/rag-index.js backend/tests/rag-index-bulk.test.js
git commit -m "feat: add addDocumentsBulk for single-rebuild batch ingestion"
```

---

### Task 4: `ingest-corpus.js` — corpus ingestion CLI

**Files:**
- Create: `backend/scripts/ingest-corpus.js`
- Test: manual dry-run verification (see Steps below) — this task is an integration/orchestration script over real multi-hundred-MB external files, not unit-testable in isolation; Tasks 1-3 already cover its building blocks with unit tests.

**Interfaces:**
- Consumes: `buildVttIndex` (Task 2), `vttToMarkedText` (Task 1), `rag-index.js`'s `addDocumentsBulk` (Task 3).
- Produces: a CLI script, `node backend/scripts/ingest-corpus.js [--agent=NAME] [--limit=N] [--dry-run]`.

- [ ] **Step 1: Write the script**

```js
#!/usr/bin/env node
// backend/scripts/ingest-corpus.js
// ─────────────────────────────────────────────────────────────────────────────
// Full-corpus ingestion: reads the Python-era chunks.jsonl / books_chunks.jsonl
// (Documents\SHADDAI-SYSTEM\rag\) and populates each agent's Node kb_<agent>
// store. Videos with a matching .vtt caption file get real per-line
// timestamps (via vtt-parse.js); everything else ingests with the existing
// estimate-timestamp fallback already built into rag-index.js.
//
// Usage:
//   node ingest-corpus.js                 # all agents, full corpus
//   node ingest-corpus.js --agent=PIKADON # one agent only (dry-run this first)
//   node ingest-corpus.js --limit=20      # cap videos processed, for a quick test
//   node ingest-corpus.js --dry-run       # log what would happen, write nothing
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

const fs = require('fs');
const readline = require('readline');
const path = require('path');

const { buildVttIndex } = require('./vtt-index');
const { vttToMarkedText } = require('./vtt-parse');
const ragIndex = require('../rag-index');

const CORPUS_DIR = process.env.SHADDAI_CORPUS_DIR ||
  'C:/Users/Brittany/Documents/SHADDAI-SYSTEM';
const CHUNKS_FILE = path.join(CORPUS_DIR, 'rag', 'chunks.jsonl');
const BOOKS_FILE = path.join(CORPUS_DIR, 'rag', 'books_chunks.jsonl');
const VTT_ROOTS = [
  path.join(CORPUS_DIR, 'downloads'),
  path.join(CORPUS_DIR, 'transcripts'),
];

function parseArgs(argv) {
  const args = { agent: null, limit: Infinity, dryRun: false };
  for (const a of argv) {
    if (a === '--dry-run') args.dryRun = true;
    else if (a.startsWith('--agent=')) args.agent = a.slice('--agent='.length).toUpperCase();
    else if (a.startsWith('--limit=')) args.limit = parseInt(a.slice('--limit='.length), 10);
  }
  return args;
}

async function readLines(filePath, onLine) {
  const stream = fs.createReadStream(filePath, { encoding: 'utf8' });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.trim()) continue;
    let row;
    try { row = JSON.parse(line); } catch (_) { continue; }
    onLine(row);
  }
}

function kbName(agent) {
  return 'kb_' + String(agent || 'shaddai').toLowerCase();
}

async function ingestVideos(args, vttIndex) {
  // Pass A: first-seen metadata per unique video_id.
  const videoMeta = new Map();
  await readLines(CHUNKS_FILE, (row) => {
    if (!row.video_id || videoMeta.has(row.video_id)) return;
    videoMeta.set(row.video_id, {
      title: row.title || row.video_id,
      agent: (row.agent || 'SHADDAI').toUpperCase(),
    });
  });
  console.log(`[ingest-corpus] ${videoMeta.size} unique videos found in chunks.jsonl`);

  const withVtt = [];
  const withoutVtt = new Set();
  for (const [vid, meta] of videoMeta) {
    if (args.agent && meta.agent !== args.agent) continue;
    if (vttIndex.has(vid)) withVtt.push(vid);
    else withoutVtt.add(vid);
  }

  // Videos WITH a real VTT: ingest one full marked-up document per video.
  const byAgentBulk = new Map(); // agent -> items[]
  let processed = 0;
  for (const vid of withVtt) {
    if (processed >= args.limit) break;
    const meta = videoMeta.get(vid);
    const raw = fs.readFileSync(vttIndex.get(vid), 'utf8');
    const markedText = vttToMarkedText(raw);
    if (!markedText.trim()) continue;
    const agent = meta.agent;
    if (!byAgentBulk.has(agent)) byAgentBulk.set(agent, []);
    byAgentBulk.get(agent).push({
      name: meta.title,
      text: markedText,
      meta: { videoId: vid, title: meta.title, kind: 'transcript' },
    });
    processed++;
  }
  console.log(`[ingest-corpus] ${processed} videos have real VTT timestamps and will ingest as tsMode=markers`);

  // Videos WITHOUT a VTT: re-emit each existing chunks.jsonl row as its own
  // small document (estimate timestamps, existing fallback behavior).
  let fallbackChunks = 0;
  if (processed < args.limit) {
    await readLines(CHUNKS_FILE, (row) => {
      if (fallbackChunks >= args.limit - processed) return;
      if (!row.video_id || !withoutVtt.has(row.video_id)) return;
      const meta = videoMeta.get(row.video_id);
      if (args.agent && meta.agent !== args.agent) return;
      if (!row.text || !row.text.trim()) return;
      const agent = meta.agent;
      if (!byAgentBulk.has(agent)) byAgentBulk.set(agent, []);
      byAgentBulk.get(agent).push({
        name: row.id,
        text: row.text,
        meta: { videoId: row.video_id, title: meta.title, kind: 'transcript' },
      });
      fallbackChunks++;
    });
  }
  console.log(`[ingest-corpus] ${fallbackChunks} chunk-rows ingested individually (no VTT available, estimate timestamps)`);

  return byAgentBulk;
}

async function ingestBooks(args, byAgentBulk) {
  let count = 0;
  await readLines(BOOKS_FILE, (row) => {
    if (count >= args.limit) return;
    if (!row.text || !row.text.trim()) return;
    const agent = (row.agent || 'ORACLE').toUpperCase();
    if (args.agent && agent !== args.agent) return;
    if (!byAgentBulk.has(agent)) byAgentBulk.set(agent, []);
    byAgentBulk.get(agent).push({
      name: row.id,
      text: row.text,
      meta: { title: row.title, kind: 'book' },
    });
    count++;
  });
  console.log(`[ingest-corpus] ${count} book chunk-rows queued (estimate timestamps — books have none)`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  console.log(`[ingest-corpus] agent=${args.agent || 'ALL'} limit=${args.limit} dryRun=${args.dryRun}`);

  const vttIndex = buildVttIndex(VTT_ROOTS);
  console.log(`[ingest-corpus] indexed ${vttIndex.size} .vtt caption files`);

  const byAgentBulk = await ingestVideos(args, vttIndex);
  await ingestBooks(args, byAgentBulk);

  for (const [agent, items] of byAgentBulk) {
    if (!items.length) continue;
    console.log(`[ingest-corpus] ${agent}: ${items.length} documents ${args.dryRun ? '(dry-run, not written)' : 'writing...'}`);
    if (args.dryRun) continue;
    const { docIds, totalChunks } = ragIndex.addDocumentsBulk(kbName(agent), items);
    console.log(`[ingest-corpus] ${agent}: wrote ${docIds.length} docs, ${totalChunks} chunks`);
  }
  console.log('[ingest-corpus] done');
}

main().catch((err) => {
  console.error('[ingest-corpus] FAILED:', err);
  process.exit(1);
});
```

- [ ] **Step 2: Dry-run smoke test on the smallest agent, capped**

Run: `cd backend && node scripts/ingest-corpus.js --agent=PIKADON --limit=20 --dry-run`
Expected: Logs show a non-zero VTT index size, a nonzero "videos have real VTT timestamps" count (or an honest zero if PIKADON's corpus genuinely has none — check the log for `withoutVtt`/fallback count instead in that case), and no files written (`git status` on `backend/data/rag/kb_pikadon/` shows no changes).

- [ ] **Step 3: Real run on the same small scope, verify on disk**

Run: `cd backend && node scripts/ingest-corpus.js --agent=PIKADON --limit=20`
Expected: Command exits 0. Then run:
```bash
node -e "const r=require('./rag-index'); console.log(r.listUserDocs('kb_pikadon').filter(d=>d.tsMode==='markers').length, 'docs with real timestamps')"
```
Expected: a number greater than 0 (assuming at least one of PIKADON's first 20 videos has a matching `.vtt` — if the log from Step 2 showed zero VTT matches for this agent/limit combo, rerun with a larger `--limit` until at least one is found, since the point of this smoke test is to confirm real timestamps land correctly).

- [ ] **Step 4: Spot-check one timestamp against its actual source**

Pick one `docId` from Step 3's output with `tsMode==='markers'`, find its `videoId`, and manually open the matching `.vtt` file (path known from the VTT index — re-run `buildVttIndex` in a one-off `node -e` to look it up) at the timestamp of its first chunk's `t0`. Confirm the chunk's `text` field roughly matches what's actually being said in the VTT around that offset. This is a manual correctness check, not an automated test — timestamps are derived from real file content, so the only way to catch an off-by-N-cue bug is to look at one by hand.

- [ ] **Step 5: Commit**

```bash
cd "C:\Users\Brittany\Shaddai"
git add backend/scripts/ingest-corpus.js
git commit -m "feat: add full-corpus ingestion CLI (videos + books, real+estimate timestamps)"
```

- [ ] **Step 6: Full run (owner-supervised — this is the expensive, long-running step)**

Run: `cd backend && node scripts/ingest-corpus.js` (no `--agent`, no `--limit`)
This processes all ~2,777 videos and ~80,534 book chunks across all 7 agents. Expect a long runtime (minutes to low hours depending on `.vtt` file sizes and disk speed — `addDocumentsBulk` rebuilds vectors once per agent, not once per document, but each agent's final `docs.json` may still become large). Do not run this unattended without first confirming Steps 2-4 succeeded on real data. After completion, run:
```bash
node -e "const r=require('./rag-index'); ['shaddai','nexus','zerox','oracle','turtle','quill','pikadon'].forEach(a=>{const docs=r.listUserDocs('kb_'+a); console.log(a, docs.length, 'docs,', docs.filter(d=>d.tsMode==='markers').length, 'with real timestamps')})"
```
to confirm every agent's store grew and report the real-vs-estimate timestamp split.

- [ ] **Step 7: Commit the ingested data**

```bash
cd "C:\Users\Brittany\Shaddai"
git add backend/data/rag/
git commit -m "data: ingest full 2,777-video corpus + books into kb_<agent> stores"
```

---

### Task 5: Wire MCP server to routes/digests grounding

**Files:**
- Modify: `backend/mcp-server-rag.js`

**Interfaces:**
- Consumes: `backend/lib/knowledge.js`'s existing exports — `contextFor(agent, query)`, `routeContext(agent, query)`, and (need to confirm exact digest-listing export name by reading `knowledge.js` at implementation time — it exports `digestRecall` but that returns already-formatted strings, not a raw list; if a raw digest-listing function does not already exist, add a small `listDigests(agent)` export to `knowledge.js` that reads the agent's `kb_<agent>/digests.json` file directly and returns its `digests` array's `{name, title, thesis}` fields, following the same `nsFor()`/file-path convention already used elsewhere in that file).

- [ ] **Step 1: Locate the current `rag_ask` and `list_rag_docs` tool handlers**

Run: `grep -n "rag_ask\|list_rag_docs" backend/mcp-server-rag.js` to find exact line numbers before editing — this file is long and line numbers will have shifted since the earlier research pass.

- [ ] **Step 2: Update `rag_ask`'s handler to include 5-layer grounding**

Find the `rag_ask` tool's execute/handler function. It currently synthesizes an answer via local Ollama using only raw chunk search results. Add, immediately before the LLM call, a call to `require('./lib/knowledge').contextFor(agentId, query)` and prepend its output to the system/context prompt the same way `backend/brain-server.js`'s `groundedLLM()` already does (see the existing pattern: `` `${SYSTEM_PROMPTS[agentId] || SYSTEM_PROMPTS.SHADDAI}\n\n${layers}\n\nGrounded knowledge excerpts...` ``). Do not change `rag_ask`'s tool schema/parameters — this only changes what goes into the prompt.

- [ ] **Step 3: Add `list_digests` to `knowledge.js` if it doesn't already exist**

Read `backend/lib/knowledge.js` in full first. If a function that returns an agent's raw digest list (not pre-formatted text) does not exist, add:

```js
// ── list raw digests for an agent (used by MCP list_digests tool) ──────────
function listDigests(agent) {
  const file = path.join(__dirname, '..', 'data', 'rag', nsFor(agent), 'digests.json');
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    return (data.digests || []).map(d => ({ name: d.name, title: d.title, thesis: d.thesis }));
  } catch (_) { return []; }
}
```

Add `listDigests` to `knowledge.js`'s `module.exports`.

- [ ] **Step 4: Add `get_route` and `list_digests` tool definitions to `mcp-server-rag.js`**

In the `TOOLS` array (near the existing `rag_search`/`rag_ask` entries), add two entries following the exact same shape/style as neighboring tool definitions (inputSchema with an `agent` enum of the 7 agent ids, plus a `query` string param for `get_route`):

```js
{
  name: 'get_route',
  description: 'Get the goal-to-playbook route for one agent matching a query — how that agent applies its knowledge to a specific kind of task, with numbered steps and cited sources.',
  inputSchema: {
    type: 'object',
    properties: {
      agent: { type: 'string', enum: STATIC_AGENT_IDS },
      query: { type: 'string', description: 'The goal or task to find a route for' },
    },
    required: ['agent', 'query'],
  },
},
{
  name: 'list_digests',
  description: 'List an agent\'s organized knowledge digests (thesis + title per source), the distilled form of that agent\'s knowledge base.',
  inputSchema: {
    type: 'object',
    properties: { agent: { type: 'string', enum: STATIC_AGENT_IDS } },
    required: ['agent'],
  },
},
```

Then add their handlers in the tool-dispatch switch/if-chain (wherever `rag_search`'s handler is wired), calling `knowledge.routeContext(agent, query)` and `knowledge.listDigests(agent)` respectively, returning their results in the same MCP tool-result content shape the other tools already use (check `rag_search`'s handler for the exact return-shape convention — likely `{ content: [{ type: 'text', text: JSON.stringify(result) }] }`).

- [ ] **Step 5: Verify via the existing self-test harness**

Run: `cd backend && node mcp-server-rag.js --self-test-full`
Expected: PASS, including the new `get_route`/`list_digests` tools appearing in the tool list and returning non-error results for at least one agent.

- [ ] **Step 6: Manual before/after check on `rag_ask` grounding**

Run: `cd backend && node -e "require('./mcp-server-rag')"` is not directly callable this way (it's a stdio server) — instead, use the `--self-test-full` output from Step 5, or manually invoke `rag_ask` over stdio per the file's own documented CLI usage, and confirm the returned answer's grounding context now includes route/tool-ledger content (visible in the prompt if the tool result includes the sources used, or by temporarily adding a `console.error` of the assembled prompt during manual testing — remove any temporary debug logging before committing).

- [ ] **Step 7: Commit**

```bash
cd "C:\Users\Brittany\Shaddai"
git add backend/mcp-server-rag.js backend/lib/knowledge.js
git commit -m "feat: wire MCP server to routes/digests grounding (get_route, list_digests, rag_ask upgrade)"
```

---

## Self-Review Notes

- **Spec coverage:** Phase 1 (full-corpus ingestion, real timestamps from VTT) → Tasks 1-4. Phase 3 (MCP wiring) → Task 5. Phase 2 is explicitly out of scope per the spec's deferral.
- **Placeholder scan:** no TBD/TODO markers; Task 5's Steps 1 and 6 name manual verification steps rather than fixed line numbers/exact output because `mcp-server-rag.js` is a long file being read fresh at execution time — this is an explicit "look this up first" instruction with a concrete command, not a vague placeholder.
- **Type consistency:** `addDocumentsBulk(user, items)` in Task 3 matches its usage in Task 4 (`ragIndex.addDocumentsBulk(kbName(agent), items)`) — same parameter order and item shape (`{name, text, meta}`) throughout.
