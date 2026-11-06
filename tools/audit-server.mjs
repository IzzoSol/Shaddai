/* SHADDAI Audit Server — port 3014
   Serves the repo (public/ + fal-assets/) AND accepts note/snapshot saves.
   Replaces: python -m http.server 3014   (same URL, same files, now writable)
   Writes: public/__asset-notes.json + public/__audit-shots/*.png  (local only, never git)
*/
import http from 'http';
import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();
const PORT = 3014;
const NOTES_FILE = path.join(ROOT, 'public', '__asset-notes.json');
const SHOTS_DIR = path.join(ROOT, 'public', '__audit-shots');
if (!fs.existsSync(SHOTS_DIR)) fs.mkdirSync(SHOTS_DIR, { recursive: true });

const MIME = {
  '.html': 'text/html', '.htm': 'text/html', '.js': 'text/javascript',
  '.mjs': 'text/javascript', '.json': 'application/json', '.map': 'application/json',
  '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.bin': 'application/octet-stream',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.css': 'text/css',
  '.wasm': 'application/wasm', '.ktx2': 'image/ktx2', '.fbx': 'application/octet-stream',
  '.txt': 'text/plain', '.md': 'text/markdown', '.ico': 'image/x-icon',
  '.hdr': 'application/octet-stream', '.mp3': 'audio/mpeg', '.wav': 'audio/wav',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.svg': 'image/svg+xml'
};

function emptyNotes() {
  return {
    _readme: 'SHADDAI asset audit notes. Written by public/__inspector.html via tools/audit-server.mjs. ' +
      'Keyed by asset path. Fields per entry: rank (1-5), decision (keep|fix|delete|place), ' +
      'note (free text for the placement session), updated (ISO date). ' +
      'Claude: join "path" against public/__glb-scan.json, use docs/ASSET-AUDIT-20261017.md as the world map, ' +
      'then place/organize per each entry\'s note and decision.',
    _updated: '',
    notes: {}
  };
}

function readNotes() {
  try {
    let t = fs.readFileSync(NOTES_FILE, 'utf8');
    if (t.charCodeAt(0) === 0xFEFF) t = t.slice(1); // tolerate BOM
    const j = JSON.parse(t);
    if (j && typeof j === 'object' && j.notes) return j;
  } catch (e) {}
  return emptyNotes();
}

function writeNotes(j) {
  j._updated = new Date().toISOString();
  const tmp = NOTES_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(j, null, 1));
  fs.renameSync(tmp, NOTES_FILE);
}

function body(req) {
  return new Promise((res, rej) => {
    let b = '';
    req.on('data', c => { b += c; if (b.length > 20e6) req.destroy(); });
    req.on('end', () => { try { res(JSON.parse(b)); } catch (e) { rej(e); } });
    req.on('error', rej);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const pathname = decodeURIComponent(url.pathname);

  /* ── save a note/rank/decision for one asset ── */
  if (req.method === 'POST' && pathname === '/__note') {
    try {
      const patch = await body(req);
      if (!patch || typeof patch.path !== 'string' || patch.path.length < 3) throw new Error('bad path');
      const j = readNotes();
      const cur = j.notes[patch.path] || {};
      ['rank', 'decision', 'note', 'name'].forEach(k => { if (patch[k] !== undefined) cur[k] = patch[k]; });
      cur.updated = new Date().toISOString().slice(0, 10);
      j.notes[patch.path] = cur;
      writeNotes(j);
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ ok: true, total: Object.keys(j.notes).length }));
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: String(e.message || e) }));
    }
    return;
  }

  /* ── save an audit snapshot PNG ── */
  if (req.method === 'POST' && pathname === '/__snap') {
    try {
      const p = await body(req);
      const name = String(p.name || 'shot').replace(/[^\w.-]/g, '_').slice(0, 80);
      const dataUrl = String(p.dataUrl || '');
      const b64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
      if (!b64 || b64.length < 100) throw new Error('no image data');
      fs.writeFileSync(path.join(SHOTS_DIR, name + '.png'), Buffer.from(b64, 'base64'));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, file: '__audit-shots/' + name + '.png' }));
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: String(e.message || e) }));
    }
    return;
  }

  /* ── static serving (repo root: /public/..., /fal-assets/...) ── */
  const fp = path.resolve(ROOT, '.' + pathname);
  if (!fp.startsWith(ROOT)) { res.writeHead(403); res.end('forbidden'); return; }
  fs.stat(fp, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404); res.end('not found: ' + pathname); return; }
    const ext = path.extname(fp).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Content-Length': st.size,
      'Cache-Control': ext === '.json' ? 'no-store' : 'no-cache'
    });
    fs.createReadStream(fp).pipe(res);
  });
});

server.listen(PORT, () => console.log('SHADDAI audit server on http://localhost:' + PORT +
  '/public/__inspector.html  (notes: ' + NOTES_FILE + ')'));
