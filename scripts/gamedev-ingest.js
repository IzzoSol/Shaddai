#!/usr/bin/env node
'use strict';
// Game-dev library ingester (NEXUS). Turns any game repo into a compact, searchable
// text corpus the SHADDAI API serves to TURTLE and MCP users.
//
//   node scripts/gamedev-ingest.js <repoPath> --name <source-id> [--license MIT] [--origin <url>] [--cap-mb 5]
//
// Writes backend/knowledge/gamedev/<name>.jsonl (one section per line) and updates
// backend/knowledge/gamedev/sources.json. Re-running a name replaces it.
// Only text (docs, skills, code, shaders, small JSON) — no binaries, deps or build output.

const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', 'backend', 'knowledge', 'gamedev');
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'out', '.next', 'coverage', '__pycache__', 'vendor', 'assets', 'public', 'images', 'models', 'textures', 'fonts']);
const EXT = new Set(['.md', '.mdx', '.txt', '.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.glsl', '.vert', '.frag', '.wgsl', '.json', '.html', '.yml', '.yaml', '.sh', '.py', '.mjs']);
const MAX_FILE = 200 * 1024;   // skip single files bigger than this
const SECTION = 6000;          // target chars per section

function arg(name, def) { const i = process.argv.indexOf('--' + name); return i > -1 ? process.argv[i + 1] : def; }
const repo = process.argv[2];
const name = arg('name');
if (!repo || !name || repo.startsWith('--')) { console.error('usage: gamedev-ingest.js <repoPath> --name <id> [--license MIT] [--origin url] [--cap-mb 5]'); process.exit(1); }
const excluded = new Set(arg('exclude') ? JSON.parse(fs.readFileSync(arg('exclude'), 'utf8')) : []); // repo-relative paths to leave out
const capBytes = (Number(arg('cap-mb', 5))) * 1048576;

// Higher = ingested first, so the cap cuts the least useful material.
function priority(rel) {
  const l = rel.toLowerCase();
  if (/(^|\/)skill\.md$/.test(l)) return 0;
  if (/(^|\/)(readme|claude|agents|opencode)[^/]*\.md$/.test(l)) return 1;
  if (l.endsWith('.md') || l.endsWith('.mdx')) return 2;
  if (/\.(glsl|vert|frag|wgsl)$/.test(l)) return 3;
  if (/\.(js|mjs|ts|tsx|jsx|cjs)$/.test(l)) return 4;
  return 5;
}

function walk(dir, base, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.') && e.name !== '.claude') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name.toLowerCase())) walk(p, base, out); continue; }
    if (!EXT.has(path.extname(e.name).toLowerCase())) continue;
    if (/\.min\.|package-lock|\.map$/.test(e.name)) continue;
    if (excluded.has(path.relative(base, p).split(path.sep).join('/'))) continue;
    let st; try { st = fs.statSync(p); } catch (_) { continue; }
    if (st.size > MAX_FILE || st.size < 40) continue;
    out.push({ abs: p, rel: path.relative(base, p).split(path.sep).join('/'), size: st.size });
  }
}

function sections(text) {
  if (text.length <= SECTION * 1.3) return [text];
  const parts = []; let cur = '';
  for (const block of text.split(/\n(?=#{1,3} |\n)/)) {
    if (cur.length + block.length > SECTION && cur) { parts.push(cur); cur = ''; }
    cur += (cur ? '\n' : '') + block;
    while (cur.length > SECTION * 1.6) { parts.push(cur.slice(0, SECTION)); cur = cur.slice(SECTION); }
  }
  if (cur.trim()) parts.push(cur);
  return parts;
}

function titleOf(rel, text) {
  const h = /^#\s+(.+)$/m.exec(text) || /^name:\s*(.+)$/m.exec(text);
  return (h ? h[1].trim() : path.basename(rel)).slice(0, 120);
}
function kindOf(rel) {
  const l = rel.toLowerCase();
  if (/skill\.md$/.test(l)) return 'skill';
  if (/\.(md|mdx|txt)$/.test(l)) return 'doc';
  if (/\.(glsl|vert|frag|wgsl)$/.test(l)) return 'shader';
  if (/template|scaffold|example/.test(l)) return 'template';
  return 'code';
}

const files = []; walk(path.resolve(repo), path.resolve(repo), files);
files.sort((a, b) => priority(a.rel) - priority(b.rel) || a.size - b.size);

fs.mkdirSync(OUT, { recursive: true });
const lines = []; let bytes = 0, docs = 0, skipped = 0;
for (const f of files) {
  if (bytes >= capBytes) { skipped++; continue; }
  let text; try { text = fs.readFileSync(f.abs, 'utf8'); } catch (_) { continue; }
  if (text.includes('\u0000')) continue;
  const title = titleOf(f.rel, text), kind = kindOf(f.rel);
  const parts = sections(text);
  parts.forEach((t, i) => {
    const row = { id: `${name}:${f.rel}${parts.length > 1 ? '#' + (i + 1) : ''}`, source: name, path: f.rel, title, kind, part: parts.length > 1 ? `${i + 1}/${parts.length}` : '', text: t };
    const s = JSON.stringify(row); lines.push(s); bytes += s.length;
  });
  docs++;
}
fs.writeFileSync(path.join(OUT, name + '.jsonl'), lines.join('\n') + '\n');

const manifestPath = path.join(OUT, 'sources.json');
let manifest = {}; try { manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')); } catch (_) {}
manifest[name] = { license: arg('license', 'unknown'), origin: arg('origin', ''), files: docs, sections: lines.length, bytes, skippedOverCap: skipped, ingestedAt: new Date().toISOString() };
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
console.log(`${name}: ${docs} files → ${lines.length} sections, ${(bytes / 1048576).toFixed(2)} MB${skipped ? ` (cap hit, ${skipped} files skipped)` : ''}`);
