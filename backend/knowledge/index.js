// SHADDAI agent knowledge bases — loader + unified lookup.
// Each <agent>-kb.js exports { agent, domains, entries, lookup(query) } and answers from LOCAL,
// evergreen domain knowledge (no API cost). This index maps an agent name → its KB and provides
// a single `lookup(agentName, query)` used to GROUND the agent's LLM answer (or answer directly).
const fs = require('fs');
const path = require('path');

const KBS = {};
for (const f of fs.readdirSync(__dirname)) {
  if (f === 'index.js' || !f.endsWith('-kb.js')) continue;
  try {
    const mod = require(path.join(__dirname, f));
    if (mod && mod.agent && typeof mod.lookup === 'function') {
      KBS[String(mod.agent).toUpperCase()] = mod;
    }
  } catch (e) { /* a bad KB file must never break the server */ }
}

// normalize common aliases → canonical agent key
const ALIAS = {
  SHADDAI: 'SHADDAI', NEXUS: 'NEXUS', ZEROX: 'ZEROX', XEROX: 'ZEROX',
  ORACLE: 'ORACLE', TURTLE: 'TURTLE', QUILL: 'QUILL', PIKADON: 'PIKADON',
};

/** Look up a real answer for (agentName, query). Returns {title, text} or null. */
function lookup(agentName, query) {
  if (!query) return null;
  const key = ALIAS[String(agentName || '').toUpperCase()] || String(agentName || '').toUpperCase();
  const kb = KBS[key];
  if (!kb) return null;
  try { return kb.lookup(query) || null; } catch (e) { return null; }
}

/** Best answer across ALL agents (for a generic ask with no specific agent).
 *  FIX: previously ranked by text.length (longest wins) — now calls each KB's
 *  scorer and picks the one that returns a non-null result (first non-null wins,
 *  ordered ZEROX first since it has the most signal-strategy context). */
function lookupAny(query) {
  if (!query) return null;
  // Priority: ZEROX first (richest signal/finance KB), then remaining agents.
  const ordered = ['ZEROX', ...Object.keys(KBS).filter(k => k !== 'ZEROX')];
  for (const k of ordered) {
    const kb = KBS[k];
    if (!kb) continue;
    try {
      const r = kb.lookup(query);
      if (r && r.text) return { agent: k, ...r };
    } catch (e) {}
  }
  return null;
}

/** Return up to k relevant KB hits for (agentName, query), deduped by title.
 *  Cross-KB lookup only consults ZEROX — it has the richest finance/signal context
 *  and other KBs (NEXUS, PIKADON) match on noise words like "rate", "token", "limit". */
function lookupTop(agentName, query, k = 2) {
  if (!query) return [];
  const agentKey = String(agentName || '').toUpperCase();
  const seen = new Set();
  const hits = [];
  // 1. Primary: the specific agent's KB.
  const h1 = lookup(agentName, query);
  if (h1 && h1.text) { seen.add(h1.title); hits.push(h1); }
  // 2. Cross-KB: only ZEROX for the second slot (avoids noise from NEXUS/PIKADON).
  if (hits.length < k && agentKey !== 'ZEROX') {
    const zerox = KBS['ZEROX'];
    if (zerox) {
      try {
        const r = zerox.lookup(query);
        if (r && r.text && !seen.has(r.title)) { seen.add(r.title); hits.push({ agent: 'ZEROX', ...r }); }
      } catch (e) {}
    }
  }
  return hits;
}

module.exports = { KBS, lookup, lookupAny, lookupTop, agents: Object.keys(KBS) };
