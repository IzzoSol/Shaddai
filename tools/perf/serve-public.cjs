// tools/perf/serve-public.cjs — minimal static server for public/ (perf probes; docs/PERF-LOAD.md)
//   node tools/perf/serve-public.cjs [port=3017] [--baseline <rev>]
// --baseline <rev> also serves `git show <rev>:public/SHADDAI-WORLD-3D.html` at /_baseline.html (before/after runs
// against the same assets without touching the working tree).
const http = require('http'), fs = require('fs'), path = require('path'), cp = require('child_process');
const args = process.argv.slice(2), port = +(args.find(a => /^\d+$/.test(a)) || 3017);
const root = path.join(__dirname, '../../public');
const bi = args.indexOf('--baseline');
const baseline = bi >= 0 ? cp.execFileSync('git', ['show', args[bi + 1] + ':public/SHADDAI-WORLD-3D.html'], { cwd: path.join(__dirname, '../..'), maxBuffer: 64 << 20 }) : null;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.glb': 'model/gltf-binary', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.bin': 'application/octet-stream', '.css': 'text/css', '.svg': 'image/svg+xml', '.wasm': 'application/wasm', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.ktx2': 'image/ktx2' };
http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  if (baseline && u === '/_baseline.html') { res.writeHead(200, { 'content-type': TYPES['.html'] }); return res.end(baseline); }
  const p = path.normalize(path.join(root, u === '/' ? '/index.html' : u));
  if (!p.startsWith(root)) { res.writeHead(403); return res.end(); }
  fs.stat(p, (e, st) => {
    if (e || !st.isFile()) { res.writeHead(404); return res.end('404'); }
    res.writeHead(200, { 'content-type': TYPES[path.extname(p).toLowerCase()] || 'application/octet-stream', 'content-length': st.size });
    fs.createReadStream(p).pipe(res);
  });
}).listen(port, '127.0.0.1', () => console.log('[serve] public/ on http://127.0.0.1:' + port + (baseline ? ' (+ /_baseline.html)' : '')));
