/* tools/_freeze-trace.cjs — WHERE does the start-of-game freeze come from?  (static server first: cd public && python -m http.server 3013)
 *   node tools/_freeze-trace.cjs [query] [seconds]      e.g. "?time=0.5" 40
 * Loads headless (software GL: compare run to run), waits for __loadPlayable, then records every frame for N seconds (default 40).
 * Prints JSON: playable_ms, long frames (> 50 ms) with page time, post-entry builder timings (window.__bootTimings), load steps
 * (window.__loadTimings) that started after entry, main-thread long tasks after entry, worst frame, and draws/tris at the end.
 * Refuses to start below SMOKE_MIN_MB free RAM (default 1000), like _boot-smoke. */
const puppeteer = require('puppeteer'), os = require('os'), sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const need = +(process.env.SMOKE_MIN_MB || 1000), free = Math.round(os.freemem() / 1048576);
  if (free < need) { console.log(JSON.stringify({ refused: true, free_mb: free, need_mb: need })); process.exit(3); }
  const qs = process.argv[2] || '', secs = +(process.argv[3] || 40), t0 = Date.now(), errs = [];
  const b = await puppeteer.launch({ headless: 'new', protocolTimeout: 900000, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage(); await p.setViewport({ width: 900, height: 520 });
  p.on('pageerror', e => errs.push(String(e.message).slice(0, 160)));
  // frame recorder installed before any page script runs, so the sky-dive frames are captured too
  await p.evaluateOnNewDocument(() => { window.__ft = []; (function f(t){ window.__ft.push(t); requestAnimationFrame(f); })(performance.now()); });
  await p.goto('http://localhost:3013/SHADDAI-WORLD-3D.html' + qs, { waitUntil: 'domcontentloaded', timeout: 120000 });
  let playable = null; for (let i = 0; i < 300; i++) { await sleep(1000); if (await p.evaluate(() => !!window.__loadPlayable).catch(() => false)) { playable = Date.now() - t0; break; } }
  let out = null;
  if (playable) {
    const gl = () => { const r = window.__w3dDebug && window.__w3dDebug.renderer, i = r && r.info; return i ? { programs: (i.programs || []).length, textures: i.memory.textures, geometries: i.memory.geometries, precompile: window.__precompile || null } : null; };
    const enterAt = await p.evaluate(() => performance.now());
    const glAtEnter = await p.evaluate(gl);
    await sleep(secs * 1000);
    const glAtEnd = await p.evaluate(gl);
    const warm = await p.evaluate(() => (window.__loadTimings || []).filter(s => s.step === 'warm'));
    const fpsEnd = await p.evaluate(() => new Promise(res => { const ts = []; function f(t){ ts.push(t); if (t - ts[0] < 6000 && ts.length < 360) requestAnimationFrame(f); else res({ frames: ts.length, avg_fps: +(1000 * (ts.length - 1) / Math.max(1, ts[ts.length - 1] - ts[0])).toFixed(1) }); } requestAnimationFrame(f); }));
    console.log(JSON.stringify({ glAtEnter, glAtEnd, warm, fpsEnd }));
    out = await p.evaluate((enterAt) => {
      const ft = window.__ft.filter(t => t >= enterAt), long = [];
      for (let i = 1; i < ft.length; i++) { const d = ft[i] - ft[i - 1]; if (d > 50) long.push({ at: Math.round(ft[i - 1] - enterAt), ms: Math.round(d) }); }
      const rel = r => Object.assign({}, r, { at: Math.round((r.at != null ? r.at : r.start) - enterAt) });
      const r = window.__w3dDebug && window.__w3dDebug.renderer, info = r && r.info;
      const sorted = ft.slice(1).map((t, i) => t - ft[i]).sort((a, c) => a - c);
      return {
        frames: ft.length, worst_ms: Math.round(sorted[sorted.length - 1] || 0), p95_ms: Math.round(sorted[Math.floor(sorted.length * 0.95)] || 0),
        long_frames: long.sort((a, c) => c.ms - a.ms).slice(0, 30),
        long_frame_total_ms: long.reduce((a, e) => a + e.ms, 0),
        builders: (window.__bootTimings || []).map(rel).sort((a, c) => c.ms - a.ms),
        steps_after_entry: (window.__loadTimings || []).filter(s => s.start >= enterAt - 1).map(rel).sort((a, c) => c.ms - a.ms),
        long_tasks_after_entry: ((window.__LD && window.__LD.long) || []).filter(e => e[0] >= enterAt).map(e => ({ at: Math.round(e[0] - enterAt), ms: Math.round(e[1]) })).sort((a, c) => c.ms - a.ms).slice(0, 20),
        draw_calls: info && info.render.calls, triangles: info && info.render.triangles, quality: window.__quality,
        heap_mb: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null };
    }, enterAt);
  }
  console.log(JSON.stringify({ playable_ms: playable, window_s: secs, page_errors: errs.slice(0, 8), trace: out }, null, 1));
  await b.close(); process.exit(errs.length || !playable ? 1 : 0);
})().catch(e => { console.log(JSON.stringify({ crash: String(e.message).slice(0, 200) })); process.exit(2); });
