#!/usr/bin/env node
'use strict';
// ─────────────────────────────────────────────────────────────────────────────
// SHADDAI BRAIN DIGESTER v1 — turns raw transcripts into ORGANIZED knowledge.
//
// For every corpus transcript this pipeline produces a structured DIGEST:
//   thesis → chapters (≈timestamps) → insights → frameworks → quotes →
//   questions-it-answers. Digests are stored as JSON per knowledge base and
//   INGESTED back into the RAG store as first-class documents, so search
//   returns organized, timestamped knowledge instead of raw transcript walls.
//
// Timestamps: real in-text markers when present; otherwise honest estimates
// (word-position ÷ ~150 wpm), flagged tsEstimate — nothing pretends to be exact.
//
// Mastery-card merge: if backend/knowledge/mastery/<AGENT>/<name>.md exists,
// its curated bullets/quotes are located inside the transcript to attach real
// time positions, then merged into the digest (LLM quality + time value).
//
// Idempotent: content-hash keyed — re-runs only upgrade changed/forced docs.
//
// Usage:
//   node digest-brain.js                      # all agents
//   node digest-brain.js ZEROX --limit 2      # subset
//   node digest-brain.js --force              # re-digest everything
//   node digest-brain.js --backfill-only      # only stamp legacy chunks
//   node digest-brain.js --stats              # brain census, no writes
// ─────────────────────────────────────────────────────────────────────────────
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const rag = require('./rag-index');

const CORPUS = process.env.SHADDAI_CORPUS ||
  'C:/Users/Brittany/Documents/SHADDAI-SYSTEM/oracle/deep_brains';
const MASTERY_DIR = path.join(__dirname, 'knowledge', 'mastery');
const RAG_ROOT = path.join(__dirname, 'data', 'rag');
const AGENTS = ['SHADDAI', 'ORACLE', 'ZEROX', 'NEXUS', 'TURTLE', 'QUILL', 'PIKADON'];
const WPM = 150;
const ENGINE = 'extractive-v1';

const { tokenize } = rag._internal;

// ── safety: never let names wander outside their directories ────────────────
const safeSeg = s => String(s || '').replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 120);
const hashOf = s => crypto.createHash('sha1').update(String(s)).digest('hex').slice(0, 12);

// ── timeline: word index → seconds ───────────────────────────────────────────
function makeTimeline(words) {
  const markers = rag._internal.parseTimeMarkers(words);
  const hasReal = markers.length >= 2;
  const totalWords = words.length;
  return {
    hasReal,
    mode: hasReal ? 'markers' : 'estimate',
    durationSec: Math.round((totalWords / WPM) * 60),
    at(wIdx) {
      if (!totalWords) return 0;
      const w = Math.max(0, Math.min(totalWords - 1, wIdx));
      if (hasReal) {
        if (w <= markers[0].word) return markers[0].sec;
        const last = markers[markers.length - 1];
        if (w >= last.word) return last.sec;
        for (let k = 1; k < markers.length; k++) {
          if (w <= markers[k].word) {
            const a = markers[k - 1], b = markers[k];
            const f = (w - a.word) / Math.max(1, b.word - a.word);
            return a.sec + f * (b.sec - a.sec);
          }
        }
      }
      return (w / WPM) * 60;
    },
  };
}

// ── pseudo-sentence segmentation (transcripts often lack punctuation) ────────
function units(text) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const punctDensity = words.length ? (String(text).match(/[.!?]/g) || []).length / words.length : 0;
  const out = [];
  if (punctDensity > 0.02) {
    // real punctuation exists — split on sentence ends, track word offsets
    let wIdx = 0;
    for (const raw of String(text).split(/(?<=[.!?])\s+/)) {
      const w = raw.trim().split(/\s+/).filter(Boolean);
      if (w.length >= 6 && out.length < 20000) out.push({ text: w.join(' '), w0: wIdx });
      wIdx += w.length;
    }
  } else {
    // wall of text — sliding ~32-word windows aligned on discourse cues
    const CUES = /^(and|but|so|because|well|okay|now|then|look|see|here|right|yes|no)$/i;
    let i = 0;
    while (i < words.length && out.length < 20000) {
      let end = Math.min(words.length, i + 32);
      if (end < words.length) {
        for (let j = end; j > i + 20; j--) { if (CUES.test(words[j])) { end = j; break; } }
      }
      out.push({ text: words.slice(i, end).join(' '), w0: i });
      i = end;
    }
  }
  return out;
}

// ── insight scoring: local IDF + cue/number boosts ───────────────────────────
const CUE_RE = /(the key|the trick|most people|never |always |remember|important|secret|rule|biggest mistake|best way|what matters|lesson|reason)/i;

function scoreUnits(us) {
  const df = new Map();
  const toks = us.map(u => tokenize(u.text));
  toks.forEach(ts => { new Set(ts).forEach(t => df.set(t, (df.get(t) || 0) + 1)); });
  const N = us.length || 1;
  return us.map((u, i) => {
    const ts = toks[i] || [];
    if (!ts.length) return { ...u, score: 0 };
    let s = 0;
    new Set(ts).forEach(t => { s += Math.log((N + 1) / ((df.get(t) || 1))) + 1; });
    s /= Math.sqrt(ts.length);
    if (CUE_RE.test(u.text)) s *= 1.35;
    if (/\d/.test(u.text)) s *= 1.2;
    return { ...u, score: s };
  });
}

const trimTo = (s, n) => { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s; };
const cap = w => w ? w[0].toUpperCase() + w.slice(1) : w;

function chapterLabel(chapterUnits, globalTop) {
  const w = new Map();
  chapterUnits.forEach(u => tokenize(u.text).forEach(t => {
    if (!globalTop.has(t)) w.set(t, (w.get(t) || 0) + u.score);
  }));
  const top = [...w.entries()]
    .sort((a, b) => b[1] - a[1]).slice(0, 3)
    .map(([t]) => cap(t));
  return (top.length ? top.join(' · ') : 'Discussion');
}

function topGlobalTerms(scoredUnits, n) {
  const tf = new Map();
  scoredUnits.forEach(u => tokenize(u.text).forEach(t => tf.set(t, (tf.get(t) || 0) + 1)));
  return new Set([...tf.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([t]) => t));
}

// ── mastery card parsing + quote location ────────────────────────────────────
function parseMasteryCard(md) {
  if (!md) return null;
  const sections = {};
  let cur = null;
  for (const line of String(md).split(/\r?\n/)) {
    const h = line.match(/^#{1,3}\s+(.*)$/);
    if (h) { cur = h[1].trim(); sections[cur] = []; continue; }
    if (cur) sections[cur].push(line);
  }
  const bucket = re => {
    const key = Object.keys(sections).find(k => re.test(k));
    return key ? sections[key] : [];
  };
  const bullets = lines => lines.map(l => l.replace(/^\s*[-*•]\s*/, '').trim()).filter(l => l.length > 25);
  const quotes = [];
  for (const l of bullets(bucket(/quote/i))) {
    const m = l.match(/["""]([^"""]{15,300})["""]/);
    if (m) quotes.push(m[1]);
  }
  return {
    title: (() => { const t = String(md).split(/\r?\n/).find(l => /^#\s+/.test(l)); return t ? t.replace(/^#\s+/, '') : null; })(),
    thesis: bullets(bucket(/thesis/i))[0] || null,
    frameworks: bullets(bucket(/framework|model|equation|formula/i)),
    examples: bullets(bucket(/example|evidence|story|case/i)),
    takeaways: bullets(bucket(/takeaway|action|heuristic|advice/i)).concat(bullets(bucket(/sales application|method/i))),
    questions: bullets(bucket(/question/i)),
    quotes,
  };
}

/** Find where a snippet's leading tokens occur in the transcript words. */
function locateInTranscript(snippet, words) {
  const sig = tokenize(snippet).slice(0, 6);
  if (!sig.length || !words.length) return -1;
  const norm = words.map(w => w.toLowerCase().replace(/[^a-z0-9]/g, ''));
  const target = sig.map(t => t.replace(/[^a-z0-9]/g, ''));
  outer:
  for (let i = 0; i <= norm.length - target.length; i++) {
    for (let j = 0; j < target.length; j++) if (norm[i + j] !== target[j]) continue outer;
    return i;
  }
  // fuzzy fallback: match first 4 tokens only
  const t4 = target.slice(0, 4);
  outer4:
  for (let i = 0; i <= norm.length - t4.length; i++) {
    for (let j = 0; j < t4.length; j++) if (norm[i + j] !== t4[j]) continue outer4;
    return i;
  }
  return -1;
}

// ── digest builder ───────────────────────────────────────────────────────────
function buildDigest(agent, name, text, cardMd) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  if (words.length < 150) return null;
  const videoId = /^[A-Za-z0-9_-]{11}$/.test(name) ? name : null;
  const tl = makeTimeline(words);
  const all = scoreUnits(units(text));
  const globalTop = topGlobalTerms(all, 40);
  const card = parseMasteryCard(cardMd);

  // chapters ≈10, clamped size
  const chW = Math.max(800, Math.min(3000, Math.ceil(words.length / 10)));
  const chapters = [];
  for (let c0 = 0; c0 < words.length; c0 += chW) {
    const c1 = Math.min(words.length, c0 + chW);
    const inCh = all.filter(u => u.w0 >= c0 && u.w0 < c1);
    const insights = inCh.slice().sort((a, b) => b.score - a.score).slice(0, 4)
      .sort((a, b) => a.w0 - b.w0)
      .map(u => ({ text: trimTo(u.text, 260), t: Math.round(tl.at(u.w0)), tsEstimate: !tl.hasReal }));
    const qBest = inCh.slice().sort((a, b) => b.score - a.score)
      .find(u => u.text.split(/\s+/).length >= 8 && u.text.length <= 230);
    chapters.push({
      idx: chapters.length + 1,
      label: chapterLabel(inCh, globalTop),
      t0: Math.round(tl.at(c0)),
      t1: Math.round(tl.at(c1 - 1)),
      insights,
      quote: qBest ? { text: trimTo(qBest.text, 220), t: Math.round(tl.at(qBest.w0)), tsEstimate: !tl.hasReal } : null,
    });
  }

  // frameworks from card first, else extractive pattern scan
  let frameworks = [];
  if (card && card.frameworks.length) {
    frameworks = card.frameworks.slice(0, 6).map(f => {
      const p = locateInTranscript(f, words);
      return { text: trimTo(f, 280), t: p >= 0 ? Math.round(tl.at(p)) : null, located: p >= 0, tsEstimate: p < 0 || !tl.hasReal };
    }).filter(f => f.text);
  }
  if (frameworks.length < 3) {
    const FW_RE = /(framework|equation|formula|the \w+ (method|rule|principle)|step (one|two|three|1|2|3))/i;
    all.filter(u => FW_RE.test(u.text)).sort((a, b) => b.score - a.score).slice(0, 6 - frameworks.length)
      .forEach(u => frameworks.push({ text: trimTo(u.text, 280), t: Math.round(tl.at(u.w0)), located: true, tsEstimate: !tl.hasReal }));
  }

  // quotes: card quotes win (they were hand-picked); locate each in transcript
  let quotes = [];
  if (card && card.quotes.length) {
    quotes = card.quotes.slice(0, 8).map(q => {
      const p = locateInTranscript(q, words);
      return { text: trimTo(q, 240), t: p >= 0 ? Math.round(tl.at(p)) : null, located: p >= 0, tsEstimate: p < 0 || !tl.hasReal };
    });
  }
  if (quotes.length < 3) {
    chapters.forEach(c => { if (c.quote && quotes.length < 8) quotes.push({ ...c.quote, located: true }); });
  }

  // takeaways: card first else cue-heavy units
  const takeaways = card && card.takeaways.length
    ? card.takeaways.slice(0, 7).map(trimTakeaway)
    : all.filter(u => CUE_RE.test(u.text)).sort((a, b) => b.score - a.score).slice(0, 5).map(u => trimTakeaway(u.text));

  // questions answered: card first else term templates
  const questions = card && card.questions.length ? card.questions.slice(0, 7) :
    [...globalTop].slice(0, 4).map(t => `What does the source teach about ${t}?`)
      .concat([`How does ${name.replace(/_/g, ' ')} apply today?`]);

  // thesis: strongest substantive unit from the front half of the source —
  // question-shaped / lightning-round fragments are disqualified.
  let thesis = (card && card.thesis) || null;
  if (!thesis) {
    const JUNK_RE = /(favorite|lightning|under duress|last question|thanks for watching|subscribe)/i;
    const QUESTIONY = u => (u.text.match(/\?/g) || []).length >= 2 || /^(what about|do you|what is your|who is your)\b/i.test(u.text.trim());
    const pool = all
      .filter(u => u.w0 <= words.length * 0.45)
      .filter(u => tokenize(u.text).length >= 12 && !JUNK_RE.test(u.text) && !QUESTIONY(u));
    const best = (pool.length ? pool : all).slice()
      .sort((a, b) => (b.score * (1 + 0.25 * (1 - b.w0 / Math.max(1, words.length)))) -
                      (a.score * (1 + 0.25 * (1 - a.w0 / Math.max(1, words.length)))))[0];
    thesis = trimTo((best || {}).text || '', 320);
  }

  const digest = {
    name,
    agent,
    engine: card ? ENGINE + '+mastery' : ENGINE,
    videoId,
    url: videoId ? ('https://www.youtube.com/watch?v=' + videoId) : null,
    words: words.length,
    durationSec: tl.durationSec,
    tsMode: tl.mode,
    generatedAt: new Date().toISOString(),
    contentHash: hashOf(text),
    title: (card && card.title) || trimTo(words.slice(0, 14).join(' '), 90),
    thesis,
    chapters,
    frameworks,
    takeaways,
    quotes,
    questions,
    mergedFromMastery: !!(card && (card.frameworks.length || card.quotes.length || card.takeaways.length)),
  };
  return digest;
}
function trimTakeaway(s) { return trimTo(s.replace(/^[-*•]\s*/, ''), 220); }

// ── rendering (this is what gets ingested into RAG) ──────────────────────────
const T = sec => rag._internal.fmtTime(sec);
function renderDigestText(d) {
  const L = [];
  L.push(`DIGEST · ${d.agent} · ${d.name} · runtime ≈${T(d.durationSec)} · mode:${d.tsMode}${d.videoId ? ' · src:' + d.videoId : ''}`);
  L.push(`TITLE: ${d.title}`);
  if (d.thesis) L.push(`THESIS: ${d.thesis}`);
  L.push('');
  L.push('CHAPTERS:');
  d.chapters.forEach(c => {
    L.push(`[${T(c.t0)}–${T(c.t1)}] ${c.label}`);
    c.insights.forEach(i => L.push(`  - [≈${T(i.t)}] ${i.text}`));
    if (c.quote) L.push(`  QUOTE: "${c.quote.text}" (≈${T(c.quote.t)})`);
  });
  if (d.frameworks.length) {
    L.push('');
    L.push('FRAMEWORKS & RULES:');
    d.frameworks.forEach(f => L.push(`  - [${f.t != null ? '≈' + T(f.t) : 'time n/a'}] ${f.text}`));
  }
  if (d.takeaways.length) {
    L.push('');
    L.push('TAKEAWAYS & HEURISTICS:');
    d.takeaways.forEach(k => L.push(`  - ${k}`));
  }
  if (d.quotes.length) {
    L.push('');
    L.push('NOTABLE QUOTES:');
    d.quotes.forEach(q => L.push(`  - [${q.t != null ? '≈' + T(q.t) : 'time n/a'}] "${q.text}"`));
  }
  if (d.questions.length) {
    L.push('');
    L.push('QUESTIONS THIS ANSWERS:');
    d.questions.forEach(q => L.push(`  - ${q}`));
  }
  return L.join('\n');
}

// ── persistence ──────────────────────────────────────────────────────────────
function digestsPath(agent) { return path.join(RAG_ROOT, 'kb_' + safeSeg(agent).toLowerCase(), 'digests.json'); }
function loadDigests(agent) {
  try { return JSON.parse(fs.readFileSync(digestsPath(agent), 'utf8')); }
  catch { return { agent, generatedAt: null, digests: [] }; }
}
function saveDigests(agent, store) {
  fs.mkdirSync(path.dirname(digestsPath(agent)), { recursive: true });
  store.generatedAt = new Date().toISOString();
  fs.writeFileSync(digestsPath(agent), JSON.stringify(store, null, 2), 'utf8');
}
function findRagDocId(ns, name) {
  try { return (rag.listUserDocs(ns).find(d => d.name === name) || {}).id || null; }
  catch { return null; }
}
function upsertRagDoc(ns, name, body, meta) {
  const existingId = findRagDocId(ns, name);
  if (existingId) { try { rag.deleteDocument(ns, existingId); } catch (_) {} }
  return rag.addDocument(ns, name, body, meta);
}

// ── backfill: stamp legacy transcript docs with timestamps ───────────────────
function backfillAgent(agent) {
  const ns = 'kb_' + agent.toLowerCase();
  const dir = path.join(CORPUS, safeSeg(agent));
  const defaults = [];
  if (fs.existsSync(dir)) {
    for (const f of fs.readdirSync(dir)) {
      const m = f.match(/^transcript_(.+)\.txt$/);
      if (m) {
        const nm = m[1];
        defaults.push({ name: nm, kind: 'transcript', ...( /^[A-Za-z0-9_-]{11}$/.test(nm) ? { videoId: nm, url: 'https://www.youtube.com/watch?v=' + nm } : {} ) });
      }
    }
  }
  const r = rag.backfillTimestamps(ns, defaults);
  console.log(`  [${agent}] backfilled timestamps on ${r.touched} docs`);
  return r.touched;
}

// ── main ─────────────────────────────────────────────────────────────────────
(async () => {
  const args = process.argv.slice(2);
  const force = args.includes('--force');
  const statsOnly = args.includes('--stats');
  const backfillOnly = args.includes('--backfill-only');
  const limitIdx = args.indexOf('--limit');
  const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) || Infinity : Infinity;
  const wanted = args.filter(a => AGENTS.includes(a.toUpperCase())).map(a => a.toUpperCase());
  const runAgents = wanted.length ? wanted : AGENTS;

  if (statsOnly) {
    console.log('\nBRAIN CENSUS');
    for (const agent of runAgents) {
      const ns = 'kb_' + agent.toLowerCase();
      const docs = rag.listUserDocs(ns);
      const timed = docs.reduce((s, d) => s + (d.timedChunks || 0), 0);
      const chunks = docs.reduce((s, d) => s + (d.chunks || 0), 0);
      const ds = loadDigests(agent);
      console.log(`  ${agent.padEnd(8)} docs:${String(docs.length).padStart(4)} chunks:${String(chunks).padStart(6)} timedChunks:${String(timed).padStart(6)} digests:${ds.digests.length}`);
    }
    process.exit(0);
  }

  console.log(`\nSHADDAI BRAIN DIGESTER (${ENGINE})`);
  console.log(`Corpus: ${CORPUS}\nAgents: ${runAgents.join(', ')}${limit !== Infinity ? ` · limit ${limit}/agent` : ''}${force ? ' · FORCE' : ''}\n`);

  let totalDigests = 0, totalUpgraded = 0, totalBackfilled = 0;

  for (const agent of runAgents) {
    const ns = 'kb_' + agent.toLowerCase();
    const store = loadDigests(agent);
    const byName = new Map(store.digests.map(d => [d.name, d]));
    const dir = path.join(CORPUS, safeSeg(agent));
    const masteryDir = path.join(MASTERY_DIR, safeSeg(agent));
    if (!fs.existsSync(dir)) { console.log(`  [${agent}] no corpus folder — skip`); continue; }

    if (backfillOnly) { totalBackfilled += backfillAgent(agent); continue; }

    const files = fs.readdirSync(dir).filter(f => /^transcript_.+\.txt$/.test(f));
    let n = 0, added = 0, upgraded = 0;

    for (const f of files) {
      if (n >= limit) break;
      const name = f.replace(/^transcript_/, '').replace(/\.txt$/, '');
      const existing = byName.get(name);
      const cardFile = path.join(masteryDir, safeSeg(name) + '.md');
      const cardMd = fs.existsSync(cardFile) ? fs.readFileSync(cardFile, 'utf8') : null;
      const text = fs.readFileSync(path.join(dir, f), 'utf8');

      if (existing && !force && existing.contentHash === hashOf(text)) { continue; }
      if (text.trim().length < 400) continue;
      n++;

      process.stdout.write(`  [${agent}] ${name} … `);
      try {
        const d = buildDigest(agent, name, text, cardMd);
        if (!d) { console.log('skip (short)'); continue; }
        const docName = 'DIGEST_' + name;
        const res = upsertRagDoc(ns, docName, renderDigestText(d), {
          kind: 'digest', videoId: d.videoId || undefined, url: d.url || undefined,
          title: d.title, source: name, durationSec: d.durationSec,
        });
        d.docId = res.docId;
        store.digests = store.digests.filter(x => x.name !== name);
        store.digests.push(d);
        saveDigests(agent, store);
        added++; if (existing) upgraded++;
        console.log(`✓ ${d.chapters.length}ch · ${d.frameworks.length}fw · ${d.quotes.length}q · ${res.chunks} rag-chunks${cardMd ? ' · +mastery' : ''}`);
      } catch (e) {
        console.log(`✗ ${String(e.message || e).slice(0, 90)}`);
      }
    }

    totalBackfilled += backfillAgent(agent);
    totalDigests += added; totalUpgraded += upgraded;
    console.log('');
  }

  console.log(`DONE — ${totalDigests} digests created/upserted (${totalUpgraded} upgrades), ${totalBackfilled} legacy docs timestamped.`);
  console.log(`Search now returns organized, timestamped knowledge. Try: rag.searchUser('kb_zerox','pricing','DIGEST_')\n`);
})();
