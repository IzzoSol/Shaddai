#!/usr/bin/env node
'use strict';
// ─────────────────────────────────────────────────────────────────────────────
// SHADDAI KNOWLEDGE INGEST — pour transcribed source material into each agent's
// growing knowledge store (the kb_<agent> RAG namespace that lib/knowledge.js
// recall() reads on every run). Idempotent: a transcript already present in a
// namespace is skipped, so this is safe to re-run and safe to run alongside
// other work — it never duplicates and never touches another agent's data.
//
// Usage:
//   node ingest-knowledge.js                 # all agents
//   node ingest-knowledge.js ORACLE ZEROX    # only these agents
//   SHADDAI_CORPUS=/path node ingest-knowledge.js   # override source root
//
// Source layout expected:  <CORPUS>/<AGENT>/transcript_*.txt
// Default CORPUS = the local transcription workspace (deep_brains).
// ─────────────────────────────────────────────────────────────────────────────
const fs = require('fs');
const path = require('path');
const rag = require('./rag-index');

const CORPUS = process.env.SHADDAI_CORPUS ||
  'C:/Users/Brittany/Documents/SHADDAI-SYSTEM/oracle/deep_brains';

const AGENTS = ['SHADDAI', 'ORACLE', 'ZEROX', 'NEXUS', 'TURTLE', 'QUILL', 'PIKADON'];

// Esoteric/mystical material is ORACLE-only — never let it bleed into another
// agent's namespace (so ZEROX doesn't answer business questions with chakra talk).
const nsFor = (agent) => 'kb_' + String(agent).toLowerCase();

function existingNames(ns) {
  try { return new Set(rag.listUserDocs(ns).map(d => d.name)); }
  catch (_) { return new Set(); }
}

function ingestAgent(agent) {
  const dir = path.join(CORPUS, agent);
  if (!fs.existsSync(dir)) { console.log(`  [${agent}] no source folder — skip`); return { added: 0, chunks: 0, skipped: 0 }; }
  const ns = nsFor(agent);
  const have = existingNames(ns);

  const files = fs.readdirSync(dir).filter(f => f.startsWith('transcript_') && f.endsWith('.txt'));
  let added = 0, chunks = 0, skipped = 0;

  for (const f of files) {
    const name = f.replace(/^transcript_/, '').replace(/\.txt$/, '');
    if (have.has(name)) { skipped++; continue; }               // idempotent: never dup
    const text = fs.readFileSync(path.join(dir, f), 'utf8');
    if (text.trim().length < 200) { skipped++; continue; }      // skip empties
    try {
      const res = rag.addDocument(ns, name, text);
      added++; chunks += res.chunks;
      console.log(`  [${agent}] + ${name}  (${text.length.toLocaleString()} chars → ${res.chunks} chunks)`);
    } catch (e) {
      console.log(`  [${agent}] ! ${name} failed: ${e.message}`);
    }
  }
  if (skipped) console.log(`  [${agent}] (${skipped} already present — skipped)`);
  return { added, chunks, skipped };
}

function sampleRecall(agent, query) {
  const hits = rag.searchUser(nsFor(agent), query, 1);
  if (!hits.length) return `      (no recall for "${query}")`;
  return `      "${query}" → ${hits[0].chunkText.slice(0, 140).replace(/\s+/g, ' ')}…`;
}

const wanted = process.argv.slice(2).map(a => a.toUpperCase()).filter(a => AGENTS.includes(a));
const run = wanted.length ? wanted : AGENTS;

console.log(`\nSHADDAI KNOWLEDGE INGEST`);
console.log(`Source: ${CORPUS}`);
console.log(`Agents: ${run.join(', ')}\n`);

const SAMPLES = {
  SHADDAI: 'how do I grow a business and lead a team',
  ORACLE: 'how does consciousness shape reality',
  ZEROX: 'how do I make an irresistible offer and price it',
  NEXUS: 'how do I design a scalable system',
  TURTLE: 'what makes a design great',
  QUILL: 'how do I write persuasively and with a strong voice',
  PIKADON: 'how do I think about security and strategy',
};

let totalAdded = 0, totalChunks = 0;
for (const agent of run) {
  const r = ingestAgent(agent);
  totalAdded += r.added; totalChunks += r.chunks;
}

console.log(`\n─── Recall check (proof each agent can answer from its knowledge) ───`);
for (const agent of run) {
  console.log(`  ${agent}:`);
  console.log(sampleRecall(agent, SAMPLES[agent]));
}

console.log(`\nDONE — ${totalAdded} new transcripts, ${totalChunks.toLocaleString()} new searchable chunks.`);
console.log(`Every agent now grounds its answers in this knowledge on every run (local).\n`);
