/* tools/_load-timings.cjs — which startup steps are slow? Boots headless (software GL: compare step to step, not to a real GPU) and prints
 * window.__loadTimings / __loadSummary sorted by duration, plus when each flag flipped.  node tools/_load-timings.cjs "?time=0.5" */
const puppeteer = require('puppeteer'), os = require('os'), sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  if (Math.round(os.freemem() / 1048576) < 900) { console.log('refused: low RAM'); process.exit(3); }
  const b = await puppeteer.launch({ headless: 'new', protocolTimeout: 900000, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage(); await p.setViewport({ width: 900, height: 520 });
  const logs = []; p.on('console', m => { const t = m.text(); if (/\[(load|LD|perf|map-v4|reef|batch)\]|long task/i.test(t)) logs.push(t.slice(0, 160)); });
  const t0 = Date.now(); await p.goto('http://localhost:3013/SHADDAI-WORLD-3D.html' + (process.argv[2] || '?time=0.5'), { waitUntil: 'domcontentloaded', timeout: 120000 });
  const flags = {}; const names = ['__worldBuilt', '__loadPlayable', '__raceTrackDone'];
  for (let i = 0; i < 400; i++) { await sleep(1000); const st = await p.evaluate(n => n.map(k => !!window[k]), names).catch(() => []); names.forEach((k, j) => { if (st[j] && flags[k] == null) flags[k] = Math.round((Date.now() - t0) / 1000); }); if (flags.__loadPlayable != null && i > 8) break; }
  const r = await p.evaluate(() => { const T = window.__loadTimings || window.__LT || null; let rows = []; try { if (T && typeof T === 'object') rows = (Array.isArray(T) ? T : Object.keys(T).map(k => ({ name: k, ms: T[k] && T[k].ms != null ? T[k].ms : T[k] }))).map(x => ({ name: x.name || x[0], ms: Math.round(+x.ms || +x.duration || +x[1] || 0) })); } catch (e) { }
    return { rows: rows.sort((a, b) => b.ms - a.ms).slice(0, 18), summary: window.__loadSummary || null, keys: Object.keys(window).filter(k => /^__(load|LD|boot|t)/i.test(k)).slice(0, 12) }; });
  console.log(JSON.stringify({ flags, ...r, logs: logs.slice(-12) }, null, 1)); await b.close();
})().catch(e => { console.log('crash', String(e.message).slice(0, 200)); process.exit(2); });
