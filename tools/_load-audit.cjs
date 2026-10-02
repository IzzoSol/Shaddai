/* tools/_load-audit.cjs — what does the game download, how big, and how long until it is playable?  (python -m http.server 3013 --directory public)
 *   node tools/_load-audit.cjs [query]   -> C:/Users/Brittany/eye/load-audit.json + a printed summary (top 25 files, totals by type, timings)
 * Sizes are the bytes the server sent (python http.server does not gzip; Render does, so the real transfer is smaller for js/json/html). */
const puppeteer = require('puppeteer'); const fs = require('fs'); const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const qs = process.argv[2] || '';
  const b = await puppeteer.launch({ headless: 'new', protocolTimeout: 900000, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage(); await p.setViewport({ width: 900, height: 520 }); const files = [], t0 = Date.now();
  p.on('response', async r => { try { const u = r.url().replace('http://localhost:3013', ''); const buf = await r.buffer().catch(() => null); files.push({ url: u, status: r.status(), bytes: buf ? buf.length : +(r.headers()['content-length'] || 0), t: Date.now() - t0, type: (r.headers()['content-type'] || '').split(';')[0] }); } catch (e) { } });
  await p.goto('http://localhost:3013/SHADDAI-WORLD-3D.html' + qs, { waitUntil: 'domcontentloaded', timeout: 90000 }); const tDom = Date.now() - t0;
  let tPlayable = null; for (let i = 0; i < 200; i++) { await sleep(1000); if (await p.evaluate(() => !!window.__loadPlayable).catch(() => false)) { tPlayable = Date.now() - t0; break; } }
  const mark = {}; for (const k of ['__worldBuilt', '__spawnBusy']) mark[k] = await p.evaluate(k => window[k], k).catch(() => null);
  await sleep(5000); const tIdle = Date.now() - t0;
  const by = {}; files.forEach(f => { const k = /\.js(\?|$)/.test(f.url) ? 'js' : /\.(glb|gltf)/.test(f.url) ? 'glb' : /\.(png|jpg|jpeg|webp)/.test(f.url) ? 'image' : /\.json/.test(f.url) ? 'json' : /\.html/.test(f.url) ? 'html' : /\.(bin|ktx2|wasm)/.test(f.url) ? 'bin' : 'other'; by[k] = by[k] || { n: 0, bytes: 0 }; by[k].n++; by[k].bytes += f.bytes; });
  const out = { query: qs, domMs: tDom, playableMs: tPlayable, idleMs: tIdle, files: files.length, totalMB: +(files.reduce((s, f) => s + f.bytes, 0) / 1048576).toFixed(1), by, top: files.sort((a, b) => b.bytes - a.bytes).slice(0, 40).map(f => ({ url: f.url, kB: Math.round(f.bytes / 1024), atMs: f.t })), failed: files.filter(f => f.status >= 400).map(f => f.url + ' ' + f.status) };
  fs.mkdirSync('C:/Users/Brittany/eye', { recursive: true }); fs.writeFileSync('C:/Users/Brittany/eye/load-audit.json', JSON.stringify(out, null, 1));
  console.log('dom', tDom, 'ms | playable', tPlayable, 'ms | idle', tIdle, 'ms | files', out.files, '| total', out.totalMB, 'MB'); console.log(JSON.stringify(by)); out.top.slice(0, 25).forEach(f => console.log(String(f.kB).padStart(7) + ' kB  @' + String(f.atMs).padStart(6) + ' ms  ' + f.url)); console.log('FAILED', JSON.stringify(out.failed.slice(0, 15)));
  await b.close();
})();
