'use strict';
// Regenerates backend/data/library-workflows.json from the unified SHADDAI MCP's workflow data (data only; none of that repo's code is executed).
//   node backend/scripts/build-library-workflows.js <path-to-shaddai-mcp-unified-clone>
// detect_secrets is deliberately NOT imported: the bridge rejects key-shaped input, so a scanner could never receive the text it scans.
// A workflow is imported only if EVERY step uses a tool the bridge can run safely (see platform-bridge.js: ASK / OK / NATIVE / safe-tools).
const fs = require('fs');
const path = require('path');
const safe = require('../lib/safe-tools');

const src = process.argv[2];
if (!src) { console.error('usage: node build-library-workflows.js <unified-mcp-clone-dir>'); process.exit(1); }
const w = JSON.parse(fs.readFileSync(path.join(src, 'data', 'eco-workflows.json'), 'utf8')).workflows;
const ASK = new Set(['shaddai_run_agent', 'shaddai_shaddai', 'shaddai_nexus', 'shaddai_zerox', 'shaddai_oracle', 'shaddai_turtle', 'shaddai_quill', 'shaddai_pikadon', 'rag_ask']);
const OK = new Set(['rag_search', 'web_search', 'zerox_price', 'zerox_sentiment', 'hall_moon']);
const NATIVE = new Set(['roi', 'profit_margin', 'ltv_cac', 'json_format', 'csv_stats', 'turtle_palette']);
const okTool = (t) => OK.has(t) || ASK.has(t) || NATIVE.has(t) || safe.has(t);

const seen = {}, out = [];
Object.keys(w).forEach((k) => {
  const x = w[k], st = x.steps || [];
  if (!st.length || st.length > 12 || !st.every((s) => okTool(s.tool))) return;
  let slug = String(x.name || k).toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || k;
  if (seen[slug]) slug = slug.slice(0, 42) + '-' + k.slice(3, 9);
  seen[slug] = 1;
  out.push({ id: slug, name: x.name, description: String(x.description || '').slice(0, 200), requires: x.requires || [], steps: st.map((s) => ({ tool: s.tool, args: s.args || {} })) });
});
fs.writeFileSync(path.join(__dirname, '..', 'data', 'library-workflows.json'), JSON.stringify(out));
console.log('library workflows written: ' + out.length + ' of ' + Object.keys(w).length);
