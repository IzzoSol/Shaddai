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
      model: 'llama-3.3-70b-versatile', key: groqKey, format: 'openai' });
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
  const thesis = card.match(/## Thesis\n([\s\S]*?)(?=\n## |$)/);
  if (!thesis) { issues.push('missing THESIS section'); }
  else {
    const wc = thesis[1].trim().split(/\s+/).length;
    if (wc > MAX_THESIS_WORDS) issues.push(`thesis too long (${wc} words, max ${MAX_THESIS_WORDS})`);
    if (wc < 10) issues.push(`thesis too short (${wc} words)`);
  }

  const questions = card.match(/## Questions This Answers\n([\s\S]*?)(?=\n## |$)/);
  const qCount = questions ? (questions[1].match(/^- /g) || []).length : 0;
  if (qCount < MIN_QUESTIONS) issues.push(`only ${qCount} questions (min ${MIN_QUESTIONS})`);

  const frameworks = card.match(/## Core Frameworks\n([\s\S]*?)(?=\n## |$)/);
  const fCount = frameworks ? (frameworks[1].match(/^- /g) || []).length : 0;
  if (fCount < MIN_FRAMEWORKS) issues.push(`only ${fCount} frameworks (min ${MIN_FRAMEWORKS})`);

  const chapters = card.match(/## Key Chapters\n([\s\S]*?)(?=\n## |$)/);
  const chCount = chapters ? (chapters[1].match(/^### /gm) || []).length : 0;
  if (chCount < 2) issues.push(`only ${chCount} chapters (min 2)`);

  const wordCount = card.split(/\s+/).length;
  if (wordCount < 150) issues.push(`card too short (${wordCount} words)`);

  const transcriptDump = (card.match(/transcript|the speaker said|in this video/i) || []).length > 3;
  if (transcriptDump) issues.push('appears to be a transcript dump, not distilled');

  return { pass: issues.length === 0, issues };
}

// ── 4-pass progressive distillation ──────────────────────────────────────────
async function distillVideo(v) {
  const raw = fs.readFileSync(v.file, 'utf8');
  if (raw.trim().length < 400) return null;

  const segs = segments(raw);
  const lens = AGENT_LENS[v.agent] || 'general knowledge';

  // ── Pass 1: Chapter outline ────────────────────────────────────────────────
  const pass1Parts = [];
  for (let i = 0; i < segs.length; i++) {
    const result = await callAI(
      `You are a master note-taker for the ${v.agent} domain. Your lens: ${lens}\n\n` +
      `Given a portion of a talk transcript, produce a raw chapter outline. For each distinct topic:\n` +
      `### Chapter title\n- Key point (1 sentence)\n- Key point (1 sentence)\n\n` +
      `Stay faithful to the transcript. No preamble, no summary. Only what's actually in this portion.`,
      segs[i], 0.25
    );
    pass1Parts.push(result.trim());
    if (i < segs.length - 1) await sleep(SLEEP_MS);
  }
  const rawChapters = pass1Parts.join('\n\n');
  await sleep(SLEEP_MS);

  // ── Pass 2: Signal extraction ──────────────────────────────────────────────
  const pass2 = await callAI(
    `You are a signal extractor for the ${v.agent} domain. Your lens: ${lens}\n\n` +
    `Given the raw chapter outline below, extract ONLY the highest-signal sentences — the ones with:\n` +
    `- Specific frameworks, models, or principles\n` +
    `- Counterintuitive insights\n` +
    `- Actionable heuristics or rules of thumb\n` +
    `- Data points or evidence\n` +
    `- Memorable quotes\n\n` +
    `Preserve the chapter structure. Drop filler, repetition, and generic statements.\n` +
    `Output format:\n` +
    `### Chapter title\n- 💡 Signal: <the high-signal sentence>\n` +
    `- 💡 Signal: <the high-signal sentence>\n\n` +
    `Only include what passes the signal bar. It's OK to have zero signals for a chapter if it had none.`,
    rawChapters, 0.3
  ).catch(() => rawChapters);
  await sleep(SLEEP_MS);

  // ── Pass 3: Synthesis (thesis + frameworks + questions + takeaways) ─────────
  const titleGuess = extractTitle(raw);
  const pass3 = await callAI(
    `You are a mastery card writer for the ${v.agent} domain. Your lens: ${lens}\n\n` +
    `Given the extracted signals below, produce EXACTLY this structure (no extra text, no preamble):\n\n` +
    `## Thesis\n` +
    `A tight 80-100 word paragraph capturing the core argument. Write in the agent's voice — what would ${v.agent} need to retrieve later?\n\n` +
    `## Core Frameworks\n` +
    `- <Framework name> — <description, when to use it>\n` +
    `(List every named framework, model, or principle from the material)\n\n` +
    `## Questions This Answers\n` +
    `- <A real question a user would type that this card answers>\n` +
    `- <Another real question — use everyday language>\n` +
    `(At least ${MIN_QUESTIONS}. Cover different angles.)\n\n` +
    `## Actionable Takeaways\n` +
    `- <Portable rule or heuristic>\n` +
    `- <Portable rule or heuristic>\n\n` +
    `## Key Chapters\n` +
    `(Copy the chapter titles and signals from the input below, reformatting as plain bullets for each chapter)\n\n` +
    `## Open Loops / Connections\n` +
    `- Links to other knowledge domains or agents this connects to (SHADDAI, ORACLE, ZEROX, NEXUS, TURTLE, QUILL, PIKADON)\n` +
    `- Open questions this raises\n\n` +
    `Signals:\n${pass2.slice(0, 9000)}`, 0.35
  );
  await sleep(SLEEP_MS);

  // ── Pass 4: Self-critique ───────────────────────────────────────────────────
  const critique = await callAI(
    `You are a quality critic for the ${v.agent} knowledge base. Review the mastery card below.\n\n` +
    `Check for:\n` +
    `1. Is the thesis tight (80-100 words) and written in agent voice?\n` +
    `2. Does it have at least ${MIN_QUESTIONS} real-world questions a user would type (not generic)?\n` +
    `3. Does it name at least ${MIN_FRAMEWORKS} specific framework or model?\n` +
    `4. Are the takeaways genuinely actionable (not vague)?\n` +
    `5. Is it free of transcript-filler ("in this video", "the speaker said")?\n\n` +
    `If it PASSES all checks, output ONLY: PASS\n` +
    `If it FAILS, output: FAIL: <specific issue to fix>\n\n` +
    `Card:\n${pass3.slice(0, 5000)}`, 0.2
  );

  // Build the final card
  const today = new Date().toISOString().slice(0, 10);
  const tags = extractTags(v.agent, pass3);
  const finalBody = critique.trim().startsWith('FAIL')
    ? pass3 + '\n\n<!-- NEEDS RE-DISTILL: ' + critique.trim().slice(5).trim() + ' -->'
    : pass3;

  const card = `---
agent: ${v.agent}
source_id: ${v.id}
source_title: "${titleGuess.replace(/"/g, '\\"')}"
date_distilled: ${today}
tags: [${tags.join(', ')}]
quality: ${critique.trim().startsWith('FAIL') ? 'needs_review' : 'pass'}
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
