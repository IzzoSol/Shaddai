#!/usr/bin/env node
/**
 * Dashboard static debugger (no browser, no tokens).
 * Finds:
 *  1. Dead handlers   — onclick/onchange/etc. calling a function that's never defined
 *  2. Duplicate element IDs
 *  3. getElementById refs to IDs that never appear (best-effort; dynamic ids noted)
 */
const fs = require('fs');
const path = require('path');
const HTML = fs.readFileSync(path.join(__dirname, '..', 'FINAL-SHADDAI-79.9.html'), 'utf8');

let problems = 0;
const P = (m) => { console.log('  ✗ ' + m); problems++; };
const OK = (m) => console.log('  ✓ ' + m);

// ── Collect defined function names ──────────────────────────────────────────
const defined = new Set();
const defPatterns = [
  /function\s+([A-Za-z_$][\w$]*)\s*\(/g,
  /(?:async\s+function)\s+([A-Za-z_$][\w$]*)\s*\(/g,
  /(?:window\.)([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:function|\()/g,
  /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:function|\([^)]*\)\s*=>)/g,
  /\b([A-Za-z_$][\w$]*)\s*:\s*(?:async\s*)?function/g,        // object method: name: function
  /\b([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{/g,                    // method shorthand / decls (loose)
];
for (const re of defPatterns) { let m; while ((m = re.exec(HTML)) !== null) defined.add(m[1]); }

// Built-ins / globals that are always available (not "undefined")
const BUILTINS = new Set([
  'if','for','while','switch','catch','function','return','typeof','await','new','do','else',
  'alert','confirm','prompt','setTimeout','setInterval','clearTimeout','clearInterval',
  'fetch','parseInt','parseFloat','isNaN','encodeURIComponent','decodeURIComponent','JSON',
  'Math','Date','Object','Array','String','Number','Boolean','console','window','document',
  'localStorage','sessionStorage','navigator','location','event','this','closeModal','showModal',
  'notify','Promise','Set','Map','RegExp','requestAnimationFrame','btoa','atob','structuredClone',
  'Chart','THREE','Tone','solanaWeb3','io','URL','FormData','Blob','FileReader','AbortSignal',
  // CSS functions that appear inside inline style= manipulations (not JS calls)
  'rgba','rgb','var','translateY','translateX','translate','scale','rotate','calc','hsl','hsla',
  'blur','brightness','linear','radial','repeat','url','matrix','perspective',
]);

// ── 1. Event-handler function references ────────────────────────────────────
console.log('\n[1] EVENT HANDLERS → function defined?');
const handlerAttr = /\bon(?:click|change|input|submit|keydown|keyup|keypress|mouseenter|mouseleave|focus|blur|load)\s*=\s*"([^"]*)"/g;
const handlerCalls = new Map(); // fnName -> count
let hm;
while ((hm = handlerAttr.exec(HTML)) !== null) {
  const code = hm[1];
  // grab leading identifiers that are immediately called: name(  — possibly chained with ; or multiple
  const callRe = /([A-Za-z_$][\w$]*)\s*\(/g;
  let cm;
  while ((cm = callRe.exec(code)) !== null) {
    const name = cm[1];
    // skip property access calls (e.g. this.style...) — those are preceded by '.'
    const before = code[cm.index - 1];
    if (before === '.') continue;
    handlerCalls.set(name, (handlerCalls.get(name) || 0) + 1);
  }
}
const deadHandlers = [];
for (const [name, count] of handlerCalls) {
  if (BUILTINS.has(name) || defined.has(name)) continue;
  // also accept window.X used anywhere
  if (new RegExp(`window\\.${name}\\s*=`).test(HTML)) continue;
  deadHandlers.push({ name, count });
}
if (!deadHandlers.length) OK(`all ${handlerCalls.size} handler functions are defined`);
else deadHandlers.sort((a,b)=>b.count-a.count).forEach(d => P(`handler "${d.name}(...)" used ${d.count}× but NOT defined`));

// ── 2. Duplicate element IDs (STATIC HTML only) ─────────────────────────────
// Strip <script> blocks first: IDs inside JS string templates are dynamic
// rebuilds (e.g. modal restore), not simultaneous static duplicates.
console.log('\n[2] DUPLICATE ELEMENT IDs (static HTML, excluding JS templates)');
const STATIC_HTML = HTML.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
const idRe = /\bid\s*=\s*"([^"]+)"/g;
const idCounts = new Map();
let im;
while ((im = idRe.exec(STATIC_HTML)) !== null) {
  if (im[1].includes('${')) continue;        // skip template-literal ids
  idCounts.set(im[1], (idCounts.get(im[1]) || 0) + 1);
}
const dupes = [...idCounts.entries()].filter(([, c]) => c > 1);
if (!dupes.length) OK(`no duplicate static element IDs (${idCounts.size} unique)`);
else dupes.sort((a,b)=>b[1]-a[1]).slice(0,20).forEach(([id, c]) => P(`duplicate id "${id}" appears ${c}×`));

// ── 3. getElementById targets that never appear as an id ────────────────────
console.log('\n[3] getElementById → id exists? (static best-effort)');
const gebi = /getElementById\(\s*['"`]([^'"`$]+)['"`]\s*\)/g;
const referenced = new Set();
let gm;
while ((gm = gebi.exec(HTML)) !== null) referenced.add(gm[1]);
const allIds = new Set(idCounts.keys());
const missing = [...referenced].filter(id => !allIds.has(id));
if (!missing.length) OK(`all ${referenced.size} getElementById targets have a matching static id`);
else {
  console.log(`  ⓘ ${missing.length} ids referenced but not found as static HTML (may be created dynamically):`);
  console.log('     ' + missing.slice(0, 30).join(', '));
  // these are warnings, not hard failures (many are injected at runtime)
}

console.log(`\n${'═'.repeat(50)}`);
console.log(problems === 0 ? '✅ DASHBOARD CLEAN — 0 hard problems' : `⚠️ ${problems} dashboard issue(s) found`);
console.log('═'.repeat(50) + '\n');
process.exit(0);
