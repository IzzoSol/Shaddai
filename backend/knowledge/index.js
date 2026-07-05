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

/** Best answer across ALL agents (for a generic ask with no specific agent). */
function lookupAny(query) {
  if (!query) return null;
  let best = null, bestLen = 0;
  for (const k of Object.keys(KBS)) {
    try {
      const r = KBS[k].lookup(query);
      if (r && r.text && r.text.length > bestLen) { best = { agent: k, ...r }; bestLen = r.text.length; }
    } catch (e) {}
  }
  return best;
}

module.exports = { KBS, lookup, lookupAny, agents: Object.keys(KBS) };
