#!/usr/bin/env node
/**
 * Safe duplicate-ID de-dup for the dashboard.
 *
 * For each id duplicated in STATIC HTML (outside <script>), rename the 2nd+
 * occurrence to `<id>__dup2`, `__dup3`, … . This makes the HTML valid without
 * changing behavior: getElementById(name) already only ever reached the FIRST
 * occurrence, so the renamed (previously shadowed) elements were already
 * unreachable by that name — nothing that worked before changes.
 *
 * Script-block contents are never modified (IDs there are dynamic rebuilds).
 */
const fs = require('fs');
const path = require('path');
const FILE = path.join(__dirname, '..', 'FINAL-SHADDAI-79.9.html');
let html = fs.readFileSync(FILE, 'utf8');

// Map out <script>…</script> ranges to leave untouched
const scriptRanges = [];
{
  const re = /<script\b[^>]*>[\s\S]*?<\/script>/gi; let m;
  while ((m = re.exec(html)) !== null) scriptRanges.push([m.index, m.index + m[0].length]);
}
const inScript = (i) => scriptRanges.some(([a, b]) => i >= a && i < b);

// Find all static id="..." occurrences (outside scripts, no template literals)
const idRe = /\bid\s*=\s*"([^"]+)"/g;
const occ = {}; // id -> [indices]
let m;
while ((m = idRe.exec(html)) !== null) {
  const id = m[1];
  if (id.includes('${')) continue;
  if (inScript(m.index)) continue;
  (occ[id] = occ[id] || []).push({ index: m.index, full: m[0] });
}

// Build edits for duplicates: rename 2nd+ occurrence
const edits = []; // {index, fromLen, to}
let renamed = 0;
for (const [id, list] of Object.entries(occ)) {
  if (list.length < 2) continue;
  for (let k = 1; k < list.length; k++) {
    const suffix = '__dup' + (k + 1);
    edits.push({ index: list[k].index, fromLen: list[k].full.length, to: `id="${id}${suffix}"` });
    renamed++;
  }
}

// Apply edits from the end so indices stay valid
edits.sort((a, b) => b.index - a.index);
for (const e of edits) {
  html = html.slice(0, e.index) + e.to + html.slice(e.index + e.fromLen);
}

fs.writeFileSync(FILE, html);
console.log(`Renamed ${renamed} shadowed duplicate id attribute(s) across ${Object.values(occ).filter(l => l.length > 1).length} id name(s).`);
