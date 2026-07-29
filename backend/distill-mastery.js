#!/usr/bin/env node
'use strict';
// ─────────────────────────────────────────────────────────────────────────────
// SHADDAI MASTERY DISTILLER — turns raw transcripts into per-video "mastery cards".
// For each video: segment into chapters → AI distills each chapter's key teaching →
// assemble a structured card (thesis, chapters, frameworks, quotes, and the REAL
// questions it answers so retrieval never misses) → save to knowledge/mastery/<AGENT>/
// (small, committable, deploy-safe) → ingest into the agent's kb_<agent> memory.
//
// Idempotent + resumable: a video whose card already exists is skipped. Safe to
// re-run, safe to stop/restart, safe to run alongside more absorption.
//
// Usage:
//   node distill-mastery.js                       # all agents, all videos
//   node distill-mastery.js ZEROX --limit 3       # just a few, for a proof run
//   node distill-mastery.js --limit 2             # 2 per agent
// ─────────────────────────────────────────────────────────────────────────────
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const rag = require('./rag-index');

// ── config ───────────────────────────────────────────────────────────────────
const CORPUS = process.env.SHADDAI_CORPUS ||
  'C:/Users/Brittany/Documents/SHADDAI-SYSTEM/downloads/transcripts';
const MASTERY_DIR = path.join(__dirname, 'knowledge', 'mastery');
const AGENTS = ['SHADDAI', 'ORACLE', 'ZEROX', 'NEXUS', 'TURTLE', 'QUILL', 'PIKADON'];
const SEGMENT_WORDS = 800;    // words per AI call
const MAX_SEGMENTS = 12;      // cap per video
const SLEEP_MS = 3500;        // ~17 RPM — safe under Groq's 30 RPM limit

// ── provider cascade (Groq primary, Ollama fallback) ─────────────────────────
function loadProviders() {
  const out = [];
  let groqKey = '';
  try {
    const e = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
    const m = e.match(/^\s*GROQ_API_KEY\s*=\s*(.+)\s*$/m);
    if (m) groqKey = m[1].trim();
  } catch (_) {}
  if (groqKey) {
    out.push({ name: 'Groq', url: 'https://api.groq.com/openai/v1/chat/completions',
      model: 'llama-3.3-70b-versatile', key: groqKey, format: 'openai' });
  }
  out.push({ name: 'Ollama', url: 'http://localhost:11434/api/generate',
    model: 'phi4-mini', key: '', format: 'generate' });
  return out;
}

const ACTIVE = loadProviders();
const sleep = ms => new Promise(r => setTimeout(r, ms));

// adaptive rate limiter — detects 429s and slows down
let minGap = 3500;
const REQ_LOG = [];
function rateLimit() {
  const now = Date.now();
  // keep last 2 minutes of request times
  while (REQ_LOG.length && REQ_LOG[0] < now - 120000) REQ_LOG.shift();
  if (REQ_LOG.length >= 25) {
    // approaching Groq's 30 RPM limit — add extra delay
    return Math.max(0, REQ_LOG[REQ_LOG.length - 25] + 60000 - now);
  }
  return 0;
}

async function callAI(systemMsg, userMsg, temperature = 0.3) {
  let lastErr;
  for (let pi = 0; pi < ACTIVE.length; pi++) {
    const p = ACTIVE[pi];
    // Adaptive rate limiting before each attempt
    const wait = rateLimit();
    if (wait > 0) { process.stdout.write(`[rate:${(wait/1000).toFixed(0)}s]`); await sleep(wait); }

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        let body, headers = { 'Content-Type': 'application/json' };
        if (p.key) headers['Authorization'] = 'Bearer ' + p.key;
        let txt = '';

        if (p.format === 'generate') {
          body = { model: p.model, system: systemMsg, prompt: userMsg, stream: false, options: { temperature } };
        } else {
          body = { model: p.model, messages: [{ role: 'system', content: systemMsg }, { role: 'user', content: userMsg }], temperature, max_tokens: 1800 };
        }

        const r = await axios.post(p.url, body, { headers, timeout: 300000 });
        REQ_LOG.push(Date.now());
        if (p.format === 'generate') {
          txt = (r.data && r.data.response) || '';
        } else {
          txt = (r.data.choices && r.data.choices[0] && r.data.choices[0].message && r.data.choices[0].message.content) || '';
        }
        if (txt) return txt;
        await sleep(2000);
      } catch (e) {
        lastErr = e;
        const st = e.response && e.response.status;
        if (st === 429) {
          // increase min gap to slow down
          minGap = Math.min(minGap + 500, 15000);
          const ra = e.response && e.response.headers && parseFloat(e.response.headers['retry-after']);
          await sleep(ra && !isNaN(ra) ? Math.min(ra * 1000 + 500, 30000) : minGap);
          continue;
        }
        if (st === 401 || st === 403 || st === 500 || st === 503 || !st) {
          if (attempt < 2) { await sleep(5000); continue; }
          break;
        }
        throw e;
      }
    }
  }
  throw lastErr || new Error('all providers exhausted');
}

// ── list every transcript in the corpus, tagged by agent ─────────────────────
function walk(dir, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith('.txt')) out.push(p);
  }
  return out;
}
function videosForAgent(agent) {
  const dir = path.join(CORPUS, agent);
  if (!fs.existsSync(dir)) return [];
  return walk(dir, []).map(fp => ({
    agent,
    id: path.basename(fp).replace(/\.en\.txt$/, '').replace(/\.txt$/, ''),
    file: fp,
  }));
}

function segments(text) {
  const words = text.split(/\s+/).filter(Boolean);
  const segs = [];
  for (let i = 0; i < words.length && segs.length < MAX_SEGMENTS; i += SEGMENT_WORDS) {
    segs.push(words.slice(i, i + SEGMENT_WORDS).join(' '));
  }
  return segs;
}

// ── distill one video → mastery card markdown ────────────────────────────────
async function distillVideo(v) {
  const raw = fs.readFileSync(v.file, 'utf8');
  if (raw.trim().length < 400) return null;
  const segs = segments(raw);

  // Pass 1 — chapter cards from each segment
  const chapterBlocks = [];
  for (let i = 0; i < segs.length; i++) {
    const result = await callAI(
      'You are a master note-taker for the ' + v.agent + ' domain. Given a portion of a talk/lecture ' +
      'transcript, break it into its distinct CHAPTERS (topics). For each chapter output:\n' +
      '### <short chapter title>\n- Key teaching: <1-2 sentences, concrete>\n- Quote: "<one short verbatim line if a strong one exists, else omit>"\n' +
      'Be faithful to the transcript. No preamble, no summary of the whole — just the chapters in this portion.',
      segs[i]
    );
    chapterBlocks.push(result.trim());
    if (i < segs.length - 1) await sleep(SLEEP_MS);
  }
  const chaptersMd = chapterBlocks.join('\n\n');

  await sleep(SLEEP_MS);
  // Pass 2 — thesis + frameworks + the real questions it answers
  const head = await callAI(
    'You distill a talk into a mastery header for the ' + v.agent + ' domain. Given the chapter notes, output EXACTLY:\n' +
    '## THESIS\n<2-3 sentence core argument>\n\n## FRAMEWORKS & PRINCIPLES\n- <bulleted, concrete, reusable>\n\n' +
    '## QUESTIONS THIS ANSWERS\n- <5-8 natural questions a person would actually type that this content answers — use the everyday words people use>\n' +
    'No preamble.',
    chaptersMd.slice(0, 9000)
  );

  const card =
`# MASTERY CARD — ${v.agent} · ${v.id}
Source video id: ${v.id} · Domain agent: ${v.agent}

${head.trim()}

## CHAPTERS
${chaptersMd}
`;
  return card;
}

// ── main ─────────────────────────────────────────────────────────────────────
(async () => {
  const args = process.argv.slice(2);
  const limitArg = args.find(a => a === '--limit');
  const limit = limitArg ? parseInt(args[args.indexOf('--limit') + 1], 10) : Infinity;
  const wantAgents = args.filter(a => AGENTS.includes(a.toUpperCase())).map(a => a.toUpperCase());
  const runAgents = wantAgents.length ? wantAgents : AGENTS;

  console.log(`\nSHADDAI MASTERY DISTILLER`);
  console.log(`Providers: ${ACTIVE.map(p => p.name + '(' + p.model + ')').join(' → ')} · Corpus: ${CORPUS}`);
  console.log(`Agents: ${runAgents.join(', ')}${limit !== Infinity ? ` · limit ${limit}/agent` : ''}\n`);

  let done = 0, skipped = 0, failed = 0;
  for (const agent of runAgents) {
    const outDir = path.join(MASTERY_DIR, agent);
    fs.mkdirSync(outDir, { recursive: true });
    const vids = videosForAgent(agent);
    let n = 0;
    for (const v of vids) {
      if (n >= limit) break;
      const cardPath = path.join(outDir, v.id + '.md');
      if (fs.existsSync(cardPath)) { skipped++; continue; }
      n++;
      process.stdout.write(`  [${agent}] ${v.id} … `);
      try {
        const card = await distillVideo(v);
        if (!card) { console.log('skip (too short)'); continue; }
        fs.writeFileSync(cardPath, card, 'utf8');
        try { rag.addDocument('kb_' + agent.toLowerCase(), 'MASTERY_' + v.id, card); } catch (_) {}
        done++;
        console.log(`✓`);
      } catch (e) {
        failed++;
        console.log(`✗ ${String(e.message || e).slice(0, 80)}`);
      }
      await sleep(SLEEP_MS);
    }
  }
  console.log(`\nDONE — ${done} new mastery cards, ${skipped} already done, ${failed} failed.\n`);
})();
