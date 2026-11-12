'use strict';
/* ══════════════════════════════════════════════════════════════════════
   DIGEST-LLM — turn a raw transcript into ORGANIZED knowledge, in the
   voice of the agent who owns it.

   THE PROBLEM THIS SOLVES
   `digest-brain.js` is `extractive-v1`: it can only COPY sentences out of a
   transcript. So a source's title becomes its first 14 words
   ("good morning thank you than…"), and its "insights" are mid-sentence
   fragments. Search then returns a meaningless title and two random
   sentences — which is not knowledge, and not a brain.

   WHAT IS AND IS NOT SYNTHESIZED — the important line
     SYNTHESIZED (organization):  title · thesis · chapter labels ·
                                  takeaways · frameworks
     EXTRACTIVE  (evidence):      quotes · timestamps · word offsets

   Quotes and timestamps are never generated. They stay verbatim and
   positionally anchored so every claim can still be traced to the exact
   moment in the source. Synthesizing evidence would destroy the one
   property that makes this a RAG brain rather than a chatbot.

   VOICE
   Each agent's persona (backend/data/agents/<AGENT>.md) is fed as the
   system prompt, so ZEROX organizes a transcript the way ZEROX would and
   ORACLE the way ORACLE would. Same source, different agent, different
   digest — which is the point.

   Runs on the existing GROQ_API_KEY. Fails closed: any error, timeout or
   malformed reply and the caller keeps the extractive digest unchanged.
   ══════════════════════════════════════════════════════════════════════ */

const fs = require('fs');
const path = require('path');

const AGENTS_DIR = path.join(__dirname, '..', 'data', 'agents');
const ENV_PATH = path.join(__dirname, '..', '.env');

/* GROQ_API_KEY / GROQ_MODEL from the environment, falling back to backend/.env
   (which is gitignored) so this works in dev without exporting anything. */
let _env = null;
function env(key) {
  if (process.env[key]) return process.env[key];
  if (_env === null) {
    _env = {};
    try {
      fs.readFileSync(ENV_PATH, 'utf8').split(/\r?\n/).forEach((line) => {
        const m = /^([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line.trim());
        if (m) _env[m[1]] = m[2].replace(/^["']|["']$/g, '');
      });
    } catch { _env = {}; }
  }
  return _env[key] || '';
}

function hasKey() { return !!env('GROQ_API_KEY'); }

/* The agent's own spec is the voice. Trimmed to the parts that describe how
   it thinks — the full 5KB is more than the model needs to hold a voice. */
const _personas = new Map();
function persona(agent) {
  const key = String(agent || '').toUpperCase();
  if (_personas.has(key)) return _personas.get(key);
  let md = '';
  try { md = fs.readFileSync(path.join(AGENTS_DIR, key + '.md'), 'utf8'); } catch {}
  const trimmed = md.slice(0, 1800).trim();
  _personas.set(key, trimmed);
  return trimmed;
}

/* A CONTROLLED vocabulary. Letting the model invent tags produces a thousand
   near-duplicates ("crypto", "cryptocurrency", "web3") and no browsable
   taxonomy at all. These are the shelves the brain is organized on. */
const TOPICS = [
  'trading', 'markets', 'investing', 'money', 'business', 'sales', 'offers',
  'marketing', 'psychology', 'mindset', 'discipline', 'health', 'spirituality',
  'consciousness', 'people', 'leadership', 'negotiation', 'writing', 'design',
  'art', 'music', 'engineering', 'backend', 'ai', 'agents', 'security',
  'blockchain', 'crypto', 'productivity', 'learning', 'strategy', 'storytelling',
];

function clip(s, n) { return String(s || '').replace(/\s+/g, ' ').trim().slice(0, n); }

/* Models wrap JSON in prose or fences no matter how firmly you ask. Pull the
   outermost object rather than trusting the whole reply to parse. */
function extractJSON(raw) {
  if (!raw) return null;
  let t = String(raw).trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  try { return JSON.parse(t); } catch {}
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a >= 0 && b > a) { try { return JSON.parse(t.slice(a, b + 1)); } catch {} }
  return null;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* Groq's free tier is capped on tokens-per-minute, and full transcripts hit
   it quickly. A 429 is a "wait", not a failure — and Groq states how long to
   wait in the error body, so honour that rather than guessing. */
function retryAfterMs(body) {
  const m = /try again in ([\d.]+)\s*s/i.exec(String(body || ''));
  if (m) return Math.ceil(parseFloat(m[1]) * 1000) + 500;
  return 0;
}

async function groq(messages, { maxTokens = 1400, timeoutMs = 90000, retries = 4 } = {}) {
  const key = env('GROQ_API_KEY');
  if (!key) throw new Error('no GROQ_API_KEY');
  const model = env('GROQ_MODEL') || 'openai/gpt-oss-20b';
  let wait = 4000;
  for (let attempt = 0; ; attempt++) {
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages, temperature: 0.3, max_tokens: maxTokens }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (r.ok) {
      const j = await r.json();
      const msg = j && j.choices && j.choices[0] && j.choices[0].message;
      // some models put the answer in `reasoning` when `content` is empty
      return (msg && (msg.content || msg.reasoning)) || '';
    }
    const body = await r.text().catch(() => '');
    const transient = r.status === 429 || r.status >= 500;
    if (!transient || attempt >= retries) throw new Error('groq ' + r.status + ' ' + clip(body, 160));
    const hinted = r.status === 429 ? retryAfterMs(body) : 0;
    const delay = Math.min(hinted || wait, 65000);
    if (typeof onWait === 'function') onWait(delay, r.status);
    await sleep(delay);
    wait = Math.min(wait * 2, 60000);
  }
}

/* optional progress hook so a long batch can say why it paused */
let onWait = null;
function setWaitReporter(fn) { onWait = typeof fn === 'function' ? fn : null; }

/**
 * Synthesize the organizational layer for one source.
 *
 * @param {object} o
 * @param {string} o.agent      which agent owns this source (drives the voice)
 * @param {string} o.text       the raw transcript
 * @param {object} o.extractive the digest from digest-brain.js (for chapter count)
 * @returns {Promise<object|null>} { title, thesis, chapterLabels[], takeaways[],
 *                                   frameworks[] } or null if it could not be done
 */
async function synthesize({ agent, text, extractive }) {
  if (!hasKey()) return null;
  const body = clip(text, 22000);            // plenty for a title/thesis/labels pass
  if (body.length < 400) return null;
  const nCh = Math.max(1, ((extractive && extractive.chapters) || []).length || 6);

  const sys = [
    persona(agent) || ('You are ' + agent + ', an analyst.'),
    '',
    'You are organizing a source document into your knowledge base. Write as',
    'yourself — your domain, your judgement, your voice.',
    '',
    'Return ONLY a JSON object, no prose and no code fences, shaped exactly:',
    '{"title":string,"thesis":string,"topics":string[],"chapterLabels":string[],' +
      '"takeaways":string[],"frameworks":[{"name":string,"summary":string}]}',
    '',
    'Rules:',
    '- title: what this source is ACTUALLY about, 4-12 words. Never quote the',
    '  opening line, never use a video id, never start with "In this video".',
    '- thesis: 1-3 sentences. The single argument the source is making.',
    '- topics: 2-5 lowercase tags from THIS list only, most relevant first:',
    '  ' + TOPICS.join(', ') + '.',
    '  These are how the brain is browsed and how other agents find this',
    '  source, so choose the ones someone would actually look under.',
    '- chapterLabels: exactly ' + nCh + ' short labels, in order, covering the',
    '  document start to end. 2-6 words each. Descriptive, not "Part 1".',
    '- takeaways: 3-6 items. What someone should DO or BELIEVE differently.',
    '  Complete sentences, specific, not generic advice.',
    '- frameworks: 0-4 named models/methods the source teaches. [] if none.',
    '- Never invent content that is not in the source.',
  ].join('\n');

  let raw;
  try { raw = await groq([{ role: 'system', content: sys }, { role: 'user', content: body }]); }
  catch (e) { return { _error: e.message }; }

  const j = extractJSON(raw);
  if (!j || typeof j !== 'object') return { _error: 'unparseable reply' };

  const arr = (v) => (Array.isArray(v) ? v : []);
  const out = {
    title: clip(j.title, 110),
    thesis: clip(j.thesis, 460),
    topics: Array.from(new Set(arr(j.topics)
      .map((t) => String(t || '').toLowerCase().trim())
      .filter((t) => TOPICS.includes(t)))).slice(0, 5),
    chapterLabels: arr(j.chapterLabels).map((s) => clip(s, 70)).filter(Boolean),
    takeaways: arr(j.takeaways).map((s) => clip(s, 260)).filter(Boolean),
    frameworks: arr(j.frameworks)
      .map((f) => ({ name: clip(f && f.name, 80), summary: clip(f && f.summary, 300) }))
      .filter((f) => f.name),
  };
  // a digest with no title and no thesis is not an upgrade — reject it
  if (!out.title && !out.thesis) return { _error: 'empty synthesis' };
  return out;
}

/**
 * Merge a synthesis over an extractive digest. Evidence is preserved: quotes,
 * timestamps and word offsets are never touched, only relabelled.
 */
function apply(digest, syn) {
  if (!digest || !syn || syn._error) return digest;
  const d = { ...digest };
  if (syn.title) d.title = syn.title;
  if (syn.thesis) d.thesis = syn.thesis;
  if (syn.topics && syn.topics.length) d.topics = syn.topics;
  if (syn.takeaways.length) d.takeaways = syn.takeaways;
  if (syn.frameworks.length) d.frameworks = syn.frameworks;
  if (syn.chapterLabels.length && Array.isArray(d.chapters)) {
    d.chapters = d.chapters.map((c, i) => (
      syn.chapterLabels[i] ? { ...c, label: syn.chapterLabels[i] } : c
    ));
  }
  d.engine = (digest.engine || 'extractive-v1') + '+llm';
  d.synthesizedAt = new Date().toISOString();
  return d;
}

module.exports = { hasKey, persona, synthesize, apply, extractJSON, setWaitReporter, TOPICS };
