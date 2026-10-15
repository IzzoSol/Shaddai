/* tools/_boot-smoke.cjs — does the world BOOT and PLAY?  (static server first: cd public && python -m http.server 3013)
 *   node tools/_boot-smoke.cjs [query]      e.g. "?time=0.5"
 * Loads the game headless (software GL: absolute times are SLOW; compare run to run, not to a real GPU), waits for __loadPlayable, then samples 6 s of frames.
 * Prints JSON: playable_ms, page errors, console errors (404s on /api/* are expected on the static server and ignored), fps stats, draw calls, triangles, textures, geometries, heap MB.
 * Exit code 1 if there are page errors or it never became playable. Refuses to start below SMOKE_MIN_MB free RAM (default 1000). */
const puppeteer = require('puppeteer'), os = require('os'), sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const need = +(process.env.SMOKE_MIN_MB || 1000), free = Math.round(os.freemem() / 1048576);
  if (free < need) { console.log(JSON.stringify({ refused: true, free_mb: free, need_mb: need })); process.exit(3); }
  const qs = process.argv[2] || '', t0 = Date.now(), errs = [], cons = [];
  const b = await puppeteer.launch({ headless: 'new', protocolTimeout: 900000, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage(); await p.setViewport({ width: 900, height: 520 });
  p.on('pageerror', e => errs.push(String(e.message).slice(0, 160)));
  p.on('console', m => { if (m.type() === 'error') { const t = m.text(); if (!/\/api\/|favicon|404 \(File not found\)|Failed to load resource/.test(t)) cons.push(t.slice(0, 160)); } });
  await p.goto('http://localhost:3013/SHADDAI-WORLD-3D.html' + qs, { waitUntil: 'domcontentloaded', timeout: 120000 });
  let playable = null; for (let i = 0; i < 300; i++) { await sleep(1000); if (await p.evaluate(() => !!window.__loadPlayable).catch(() => false)) { playable = Date.now() - t0; break; } }
  let fps = null, info = null;
  if (playable) {
    await sleep(3000);
    fps = await p.evaluate(() => new Promise(res => { const ts = []; let n = 0; function f(t) { ts.push(t); if (++n < 360 && t - ts[0] < 6000) requestAnimationFrame(f); else { const d = ts.slice(1).map((x, i) => x - ts[i]).sort((a, c) => a - c); res({ frames: ts.length, avg_fps: +(1000 * (ts.length - 1) / (ts[ts.length - 1] - ts[0])).toFixed(1), p50_ms: +d[d.length >> 1].toFixed(1), p95_ms: +d[Math.floor(d.length * 0.95)].toFixed(1), worst_ms: +d[d.length - 1].toFixed(1) }); } } requestAnimationFrame(f); }));
    info = await p.evaluate(() => { const r = window.__w3dDebug && window.__w3dDebug.renderer, i = r && r.info; return i ? { draw_calls: i.render.calls, triangles: i.render.triangles, textures: i.memory.textures, geometries: i.memory.geometries, heap_mb: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null, quality: window.__quality } : null; });
  }
  console.log(JSON.stringify({ playable_ms: playable, page_errors: errs.slice(0, 8), console_errors: cons.slice(0, 8), fps, info }, null, 1));
  await b.close(); process.exit(errs.length || !playable ? 1 : 0);
})().catch(e => { console.log(JSON.stringify({ crash: String(e.message).slice(0, 200) })); process.exit(2); });
