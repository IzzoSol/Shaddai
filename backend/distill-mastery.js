#!/usr/bin/env node
'use strict';
// ─────────────────────────────────────────────────────────────────────────────
// SHADDAI MASTERY DISTILLER v2 — Progressive Summarization pipeline
// Multi-pass (4 passes): transcript → chapter outline → signal extraction →
// synthesis (thesis/frameworks/questions/takeaways) → self-critique + quality gates
// Output: YAML-frontmatter markdown cards, one per video.
//
// Usage:
//   node distill-mastery.js                        # all agents
//   node distill-mastery.js ZEROX --limit 3        # limited run
//   node distill-mastery.js --force                # re-distill existing cards
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
const SEGMENT_WORDS = 800;
const MAX_SEGMENTS = 12;
const SLEEP_MS = 3500;
const MAX_THESIS_WORDS = 120;
const MIN_QUESTIONS = 3;
const MIN_FRAMEWORKS = 1;

// ── agent distillation lens — what each agent cares about ───────────────────
const AGENT_LENS = {
  SHADDAI:  'strategy, long-term vision, product-market fit, orchestration, competitive positioning, high-level decision-making',
  ORACLE:   'research methodology, knowledge structures, science, psychology, esoteric systems, health/body, pattern recognition',
  ZEROX:    'revenue models, pricing strategy, offers, unit economics, markets, business growth, monetization mechanics',
  NEXUS:    'engineering architecture, system design, data structures, code patterns, tooling, technical decisions',
  TURTLE:   'design principles, visual systems, UI/UX, branding, creativity, aesthetics, user experience',
  QUILL:    'writing craft, communication, copywriting, narrative structure, clarity, documentation patterns',
  PIKADON:  'security, risk assessment, compliance, auditing, threat modeling, safety reviews, due diligence',
};

// ── provider cascade ─────────────────────────────────────────────────────────
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
      model: 'llama-3.1-8b-instant', key: groqKey, format: 'openai' });
  }
  out.push({ name: 'Ollama', url: 'http://localhost:11434/api/generate',
    model: 'phi4-mini', key: '', format: 'generate' });
  return out;
}

const ACTIVE = loadProviders();
const sleep = ms => new Promise(r => setTimeout(r, ms));

// adaptive rate limiter
let minGap = 3500;
const REQ_LOG = [];
function rateLimit() {
  const now = Date.now();
  while (REQ_LOG.length && REQ_LOG[0] < now - 120000) REQ_LOG.shift();
  if (REQ_LOG.length >= 25) {
    return Math.max(0, REQ_LOG[REQ_LOG.length - 25] + 60000 - now);
  }
  return 0;
}

async function callAI(systemMsg, userMsg, temperature = 0.3) {
  let lastErr;
  for (let pi = 0; pi < ACTIVE.length; pi++) {
    const p = ACTIVE[pi];
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

// ── transcript handling ──────────────────────────────────────────────────────
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

function extractTitle(text) {
  const firstLine = text.split('\n')[0]?.trim() || '';
  if (firstLine.length > 10 && firstLine.length < 120) return firstLine;
  const m = text.match(/\b(how to|what is|why|the complete|understanding|guide to|introduction to)\b/i);
  if (m) {
    const idx = text.indexOf(m[1]);
    return text.slice(Math.max(0, idx), idx + 100).split(/[.\n]/)[0].trim();
  }
  return 'Untitled';
}

function extractTags(agent, card) {
  const tags = new Set();
  const lower = card.toLowerCase();
  const tagMap = {
    'framework|model|theory|principle': 'frameworks',
    'pricing|revenue|unit.?economic|monetiz|offer|profit': 'business',
    'marketing|sales|copy|conversion|funnel': 'marketing',
    'design|ui|ux|visual|brand|color|layout|typography': 'design',
    'code|architectur|api|system.?design|data.?structure|algorithm': 'engineering',
    'secur|risk|threat|vulnerab|audit|compliance|exploit': 'security',
    'research|science|study|methodology|experiment|evidence': 'research',
    'psycholog|mindset|cognit|habit|behavio|mental.?model': 'psychology',
    'health|body|fitness|nutrition|longevit|bio': 'health',
    'write|copy|narrativ|story|communicat|doc': 'writing',
    'startup|founder|product.?market|growth|scale': 'startup',
    'trading|market|crypto|stock|invest|defi': 'markets',
    'strategy|vision|long.?term|orchestrat|coordinat': 'strategy',
    'learn|teach|educat|skill|master': 'learning',
  };
  for (const [pattern, tag] of Object.entries(tagMap)) {
    if (new RegExp(pattern, 'i').test(lower)) tags.add(tag);
  }
  if (tags.size === 0) tags.add('general');
  return [...tags];
}

// ── quality gates ────────────────────────────────────────────────────────────
function qualityCheck(card, agent) {
  const issues = [];
  const isRequired = [];

  const thesis = card.match(/## Thesis\n([\s\S]*?)(?=\n## |$)/);
  if (!thesis) { isRequired.push('missing THESIS'); }
  else {
    const wc = thesis[1].trim().split(/\s+/).length;
    if (wc > MAX_THESIS_WORDS) isRequired.push(`thesis ${wc}w (max ${MAX_THESIS_WORDS})`);
    if (wc < 80) isRequired.push(`thesis ${wc}w (min 80)`);
  }

  const questions = card.match(/## Questions This Answers\n([\s\S]*?)(?=\n## |$)/);
  const qCount = questions ? (questions[1].match(/^- /g) || []).length : 0;
  if (qCount < MIN_QUESTIONS) isRequired.push(`questions:${qCount} (min ${MIN_QUESTIONS})`);

  const frameworks = card.match(/## Core Frameworks[&\s]*Models?\n([\s\S]*?)(?=\n## |$)/);
  const fCount = frameworks ? (frameworks[1].match(/^- /g) || []).length : 0;
  if (fCount < MIN_FRAMEWORKS) isRequired.push(`frameworks:${fCount} (min ${MIN_FRAMEWORKS})`);

  const examples = card.match(/## Important Examples/)
  if (!examples) issues.push('no Examples section (recommended)');

  const quotes = card.match(/## Notable Quotes/)
  if (!quotes) issues.push('no Quotes section (recommended)');

  const transcriptDump = (card.match(/transcript|the speaker said|in this video/i) || []).length > 5;
  if (transcriptDump) issues.push('possible transcript dump');

  if (isRequired.length) issues.push('REQUIRED: ' + isRequired.join('; '));
  return { pass: isRequired.length === 0, issues };
}

// ── 4-pass progressive distillation ──────────────────────────────────────────
async function distillVideo(v) {
  const raw = fs.readFileSync(v.file, 'utf8');
  if (raw.trim().length < 400) return null;

  const segs = segments(raw);
  const lens = AGENT_LENS[v.agent] || 'general knowledge';

  // ── Pass 1: Chapter outline with timestamps ────────────────────────────────
  const pass1Parts = [];
  for (let i = 0; i < segs.length; i++) {
    const result = await callAI(
      `You are a master note-taker for the ${v.agent} domain. Your lens: ${lens}\n\n` +
      `Given a portion of a talk transcript, produce a detailed chapter/section outline with approximate timestamps. For each distinct topic:\n` +
      `### Chapter title (≈MM:SS)\n` +
      `- <key claim / argument>\n` +
      `- <key claim / argument>\n` +
      `- <key claim / argument>\n\n` +
      `Estimate timestamps based on position in the transcript portion. Stay faithful to the transcript. Capture ALL major topics, not just the first few. No preamble.`,
      segs[i], 0.25
    );
    pass1Parts.push(result.trim());
    if (i < segs.length - 1) await sleep(SLEEP_MS);
  }
  const rawChapters = pass1Parts.join('\n\n');
  await sleep(SLEEP_MS);

  // ── Pass 2: Signal extraction (high-fidelity — keep detail) ─────────────────
  const pass2 = await callAI(
    `You are a signal extractor for the ${v.agent} domain. Your lens: ${lens}\n\n` +
    `Given the detailed chapter outline, extract nearly everything important into structured chapter bullets. Err on the side of inclusion — it is better to have a longer, richer section than to lose useful nuance.\n\n` +
    `For each chapter, extract:\n` +
    `- Every specific claim, argument, or thesis point\n` +
    `- Frameworks, models, or principles mentioned\n` +
    `- Concrete examples, stories, case studies, data points\n` +
    `- Notable quotes or precise statements\n` +
    `- Actionable advice or heuristics\n\n` +
    `Output format:\n` +
    `### Chapter title (≈MM:SS)\n` +
    `- <extracted point>\n` +
    `- <extracted point>\n` +
    `(5-15 bullets per chapter is normal for rich content — do not compress away useful detail)`,
    rawChapters, 0.3
  ).catch(() => rawChapters);
  await sleep(SLEEP_MS);

  // ── Pass 3: Synthesis (high-fidelity card) ──────────────────────────────────
  const titleGuess = extractTitle(raw);
  const pass3 = await callAI(
    `You are a mastery card writer for the ${v.agent} domain. Your lens: ${lens}\n\n` +
    `Given the detailed signals below, produce a structured high-fidelity mastery card using EXACTLY this schema. This is NOT about maximum compression — it is about structured high-fidelity extraction. Preserve names, numbers, examples, arguments, and nuance.\n\n` +
    `Schema:\n\n` +
    `## Thesis\n` +
    `A tight 80-120 word paragraph capturing the core argument in the voice of ${v.agent}. Must be tight enough for fast RAG retrieval.\n\n` +
    `## Key Chapters\n` +
    `For each major section of the talk, produce rich detail:\n` +
    `### Chapter Title (≈MM:SS)\n` +
    `- Detailed bullet capturing claims, arguments, data\n` +
    `- Detailed bullet — aim for 5-15 per major chapter\n` +
    `- Include specific names, numbers, examples when present\n\n` +
    `## Core Frameworks & Models\n` +
    `- **Name** → Full explanation + how it works + when ${v.agent} should use it\n` +
    `(Keep these rich — don't over-compress)\n\n` +
    `## Important Examples & Evidence\n` +
    `- Concrete cases, stories, data points, studies, or historical examples from the video\n` +
    `- Preserve names, numbers, and key details\n\n` +
    `## Questions This Answers\n` +
    `- 4-7 real-world questions a user would type that this card specifically answers\n` +
    `- Use everyday language — "How do I...", "What's the best way to...", "Why does..."\n` +
    `(Make them specific enough that the detailed content above actually answers them)\n\n` +
    `## Actionable Takeaways & Heuristics\n` +
    `- Portable rules, decision criteria, and principles\n` +
    `- Keep the reasoning behind them when the source provides it\n\n` +
    `## Notable Quotes & High-Signal Passages\n` +
    `- "Quote or near-verbatim statement" (≈MM:SS)\n` +
    `- 3-8 of the strongest statements from the talk\n\n` +
    `## Open Loops & Connections\n` +
    `- Links to other knowledge domains (SHADDAI, ORACLE, ZEROX, NEXUS, TURTLE, QUILL, PIKADON)\n` +
    `- Unresolved questions or further implications\n\n` +
    `Write in the voice of ${v.agent} — what would this agent actually need to retrieve later?\n\n` +
    `Signals:\n${pass2.slice(0, 9000)}`, 0.35
  );
  await sleep(SLEEP_MS);

  // ── Pass 4: Self-critique (relaxed for fidelity) ────────────────────────────
  const critique = await callAI(
    `You are a quality critic for the ${v.agent} knowledge base. Review the mastery card below with these relaxed gates:\n\n` +
    `1. Is the thesis 80-120 words and written in ${v.agent}'s voice? (REQUIRED)\n` +
    `2. Does it have at least ${MIN_QUESTIONS} real-world questions? (REQUIRED)\n` +
    `3. Does it name at least ${MIN_FRAMEWORKS} specific framework or model? (REQUIRED)\n` +
    `4. Are Key Chapters richly detailed (not 2-bullet summaries)? (RECOMMENDED)\n` +
    `5. Are specific names, numbers, examples, and arguments preserved? (RECOMMENDED)\n` +
    `6. Is it free of unformatted transcript walls? (RECOMMENDED)\n\n` +
    `If all REQUIRED gates pass, output ONLY: PASS\n` +
    `If any REQUIRED gate fails, output: FAIL: <specific issue>\n\n` +
    `Card:\n${pass3.slice(0, 6000)}`, 0.2
  );

  // Build the final card
  const today = new Date().toISOString().slice(0, 10);
  const tags = extractTags(v.agent, pass3);
  const finalBody = critique.trim().startsWith('FAIL')
    ? pass3 + '\n\n<!-- NEEDS RE-DISTILL: ' + critique.trim().slice(5).trim() + ' -->'
    : pass3;
  const sourceUrl = 'https://youtube.com/watch?v=' + v.id;

  const card = `---
agent: ${v.agent}
source_id: ${v.id}
source_title: "${titleGuess.replace(/"/g, '\\"')}"
source_url: ${sourceUrl}
duration_min: ~30
date_distilled: ${today}
tags: [${tags.join(', ')}]
quality_score: ${critique.trim().startsWith('FAIL') ? 0 : 1}
linked_cards: []
status: ${critique.trim().startsWith('FAIL') ? 'review' : 'draft'}
---

# ${v.agent} — ${titleGuess}

${finalBody.trim()}

---
_Distilled from ${v.id} via SHADDAI Progressive Summarization v2_
`;

  // Quality gate
  const qc = qualityCheck(card, v.agent);
  if (!qc.pass) {
    process.stdout.write(`[QC:${qc.issues.join('; ')}] `);
  }

  return { card, qc };
}

// ── main ─────────────────────────────────────────────────────────────────────
(async () => {
  const args = process.argv.slice(2);
  const limitArg = args.find(a => a.startsWith('--limit'));
  const limit = limitArg ? parseInt(args[args.indexOf(limitArg) + 1], 10) : Infinity;
  const force = args.includes('--force');
  const wantAgents = args.filter(a => AGENTS.includes(a.toUpperCase())).map(a => a.toUpperCase());
  const runAgents = wantAgents.length ? wantAgents : AGENTS;

  console.log(`\nSHADDAI MASTERY DISTILLER v2 — Progressive Summarization`);
  console.log(`Providers: ${ACTIVE.map(p => p.name + '(' + p.model + ')').join(' → ')}`);
  console.log(`Corpus: ${CORPUS}`);
  console.log(`Agents: ${runAgents.join(', ')}${limit !== Infinity ? ` · limit ${limit}/agent` : ''}${force ? ' · FORCE (re-distill)' : ''}\n`);

  let done = 0, skipped = 0, failed = 0, qcFailed = 0;
  for (const agent of runAgents) {
    const outDir = path.join(MASTERY_DIR, agent);
    fs.mkdirSync(outDir, { recursive: true });
    const vids = videosForAgent(agent);
    let n = 0;
    for (const v of vids) {
      if (n >= limit) break;
      const cardPath = path.join(outDir, v.id + '.md');
      if (!force && fs.existsSync(cardPath)) { skipped++; continue; }
      n++;
      process.stdout.write(`  [${agent}] ${v.id} … `);
      try {
        const result = await distillVideo(v);
        if (!result) { console.log('skip (too short)'); continue; }
        fs.writeFileSync(cardPath, result.card, 'utf8');
        try { rag.addDocument('kb_' + agent.toLowerCase(), 'MASTERY_' + v.id, result.card); } catch (_) {}
        done++;
        if (!result.qc.pass) { qcFailed++; console.log(`✓ (QC:${result.qc.issues.length} issues)`); }
        else { console.log(`✓`); }
      } catch (e) {
        failed++;
        console.log(`✗ ${String(e.message || e).slice(0, 80)}`);
      }
      await sleep(SLEEP_MS);
    }
  }
  console.log(`\nDONE — ${done} new, ${skipped} skipped, ${failed} failed, ${qcFailed} with quality issues.\n`);
})();
