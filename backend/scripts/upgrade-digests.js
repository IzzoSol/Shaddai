#!/usr/bin/env node
'use strict';
/* ══════════════════════════════════════════════════════════════════════
   UPGRADE-DIGESTS — turn extractive digests into organized knowledge.

     node backend/scripts/upgrade-digests.js            # every agent
     node backend/scripts/upgrade-digests.js zerox      # one agent
     node backend/scripts/upgrade-digests.js --force    # redo ones already done

   For each digest it synthesizes the ORGANIZATIONAL layer in the owning
   agent's voice (see lib/digest-llm.js), writes it back to digests.json,
   AND re-renders the matching DIGEST_* document in docs.json — otherwise
   search keeps returning the old first-14-words title, because the search
   index reads the rendered document body, not the digest object.

   Evidence is never regenerated: quotes, timestamps and word offsets are
   carried through untouched so citations stay verbatim and traceable.

   Resumable and idempotent: digests already carrying the '+llm' engine are
   skipped unless --force.
   ══════════════════════════════════════════════════════════════════════ */

const fs = require('fs');
const path = require('path');
const LLM = require('../lib/digest-llm');

const RAG = path.join(__dirname, '..', 'data', 'rag');
const AGENTS = ['shaddai', 'zerox', 'oracle', 'nexus', 'turtle', 'quill', 'pikadon'];

const args = process.argv.slice(2);
const FORCE = args.includes('--force');
const only = args.filter((a) => !a.startsWith('--')).map((s) => s.toLowerCase());
const agents = only.length ? only : AGENTS;

const P = (a, f) => path.join(RAG, 'kb_' + a, f);
const readJSON = (p, d) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return d; } };
const writeJSON = (p, o) => {
  const tmp = p + '.' + process.pid + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(o, null, 2));
  fs.renameSync(tmp, p);                     // atomic on the same volume
};
const hms = (s) => {
  s = Math.max(0, Math.round(s || 0));
  const h = (s / 3600) | 0, m = ((s % 3600) / 60) | 0, x = s % 60;
  return (h ? h + ':' + String(m).padStart(2, '0') : String(m)) + ':' + String(x).padStart(2, '0');
};

/* The searchable body. Mirrors the shape digest-brain.js already writes so
   existing DIGEST_* docs stay consistent — the title and labels are simply
   real now. */
function render(d) {
  const L = [];
  L.push(`DIGEST · ${d.agent} · ${d.name} · runtime ≈${hms(d.durationSec)} · mode:${d.tsMode || 'estimate'}`);
  L.push(`TITLE: ${d.title || d.name}`);
  if (d.thesis) L.push(`THESIS: ${d.thesis}`);
  if (d.url) L.push(`SOURCE: ${d.url}`);
  (d.chapters || []).forEach((c, i) => {
    L.push('');
    L.push(`CHAPTER ${i + 1} — ${c.label || 'Untitled'}`);
    (c.insights || []).forEach((ins) => L.push(`  [${hms(ins.t)}] ${ins.text}`));
  });
  if ((d.frameworks || []).length) {
    L.push(''); L.push('FRAMEWORKS:');
    d.frameworks.forEach((f) => L.push(`  · ${f.name}${f.summary ? ' — ' + f.summary : ''}`));
  }
  if ((d.takeaways || []).length) {
    L.push(''); L.push('TAKEAWAYS:');
    d.takeaways.forEach((t) => L.push(`  · ${t}`));
  }
  if ((d.quotes || []).length) {
    L.push(''); L.push('QUOTES:');
    d.quotes.forEach((q) => L.push(`  "${q.text || q}"${q.t != null ? ' [' + hms(q.t) + ']' : ''}`));
  }
  return L.join('\n');
}

/* Find the source transcript for a digest. Digests are keyed by name; docs
   carry the same name (or the digest recorded its docId). */
function sourceText(docs, d) {
  const arr = Array.isArray(docs) ? docs : (docs.docs || []);
  let hit = d.docId && arr.find((x) => x.id === d.docId && !/^DIGEST_/.test(x.name || ''));
  if (!hit) hit = arr.find((x) => x.name === d.name);
  if (!hit) hit = arr.find((x) => (x.name || '').replace(/^MASTERY_/, '') === d.name);
  return hit && hit.text ? hit.text : null;
}

(async () => {
  if (!LLM.hasKey()) {
    console.error('No GROQ_API_KEY (env or backend/.env). Nothing to do.');
    process.exit(1);
  }
  LLM.setWaitReporter((ms, code) =>
    console.log(`    … ${code} rate-limited, waiting ${(ms / 1000).toFixed(1)}s`));
  let done = 0, skipped = 0, failed = 0, noSrc = 0;

  for (const a of agents) {
    const dPath = P(a, 'digests.json');
    if (!fs.existsSync(dPath)) { console.log(`— kb_${a}: no digests.json`); continue; }
    const store = readJSON(dPath, null);
    if (!store || !Array.isArray(store.digests)) { console.log(`— kb_${a}: unreadable`); continue; }
    const docsPath = P(a, 'docs.json');
    const docs = readJSON(docsPath, null);
    const docArr = Array.isArray(docs) ? docs : (docs && docs.docs) || [];

    console.log(`\n${a.toUpperCase()} — ${store.digests.length} digests`);
    let touched = false;

    for (const d of store.digests) {
      if (!FORCE && /\+llm/.test(d.engine || '')) { skipped++; console.log(`  ⤳ ${d.name} (already organized)`); continue; }
      const text = sourceText(docs, d);
      if (!text) { noSrc++; console.log(`  ? ${d.name} — source transcript not found`); continue; }

      const t0 = Date.now();
      const syn = await LLM.synthesize({ agent: d.agent || a.toUpperCase(), text, extractive: d });
      if (!syn || syn._error) { failed++; console.log(`  ✗ ${d.name} — ${(syn && syn._error) || 'no result'}`); continue; }

      const up = LLM.apply(d, syn);
      Object.assign(d, up);
      touched = true;

      // re-render the searchable doc, or search keeps serving the old title
      const body = render(d);
      let doc = docArr.find((x) => x.name === 'DIGEST_' + d.name);
      if (doc) { doc.text = body; }
      else docArr.push({ id: 'doc_llm_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
                         name: 'DIGEST_' + d.name, text: body, uploadedAt: new Date().toISOString() });

      done++;
      console.log(`  ✓ ${d.name} — "${String(d.title).slice(0, 62)}" (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
    }

    if (touched) {
      store.generatedAt = new Date().toISOString();
      writeJSON(dPath, store);
      if (docs) writeJSON(docsPath, Array.isArray(docs) ? docArr : { ...docs, docs: docArr });
    }
  }

  console.log(`\nDONE — ${done} organized, ${skipped} already done, ${noSrc} missing source, ${failed} failed.`);
  if (done) console.log('Search now returns real titles, a thesis, and named chapters.');
})();
