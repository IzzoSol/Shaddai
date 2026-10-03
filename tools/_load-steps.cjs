/* tools/_load-steps.cjs — which boot STEPS take the time?  node tools/_load-steps.cjs [url]   (default local static server :3013; software GL, compare run to run)
 * Prints window.__loadTimings (host _ldStep instrumentation) sorted by duration + when each milestone happened. */
const puppeteer = require('puppeteer'), os = require('os'), sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  if (os.freemem() / 1048576 < 1000) { console.log('refused: low RAM'); process.exit(3); }
  const url = process.argv[2] || 'http://localhost:3013/SHADDAI-WORLD-3D.html?time=0.5';
  const b = await puppeteer.launch({ headless: 'new', protocolTimeout: 900000, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage(); await p.setViewport({ width: 900, height: 520 }); const t0 = Date.now(), lt = [];
  await p.evaluateOnNewDocument(() => { window.__t0 = performance.now(); window.__longTasks = 0; try { new PerformanceObserver(l => { for (const e of l.getEntries()) window.__longTasks += e.duration; }).observe({ entryTypes: ['longtask'] }); } catch (e) { } });
  await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
  let playable = null; for (let i = 0; i < 300; i++) { await sleep(1000); if (await p.evaluate(() => !!window.__loadPlayable).catch(() => false)) { playable = Date.now() - t0; break; } }
  const r = await p.evaluate(() => ({ timings: window.__loadTimings || null, long_task_ms: Math.round(window.__longTasks), now_ms: Math.round(performance.now() - window.__t0) }));
  console.log('playable_ms', playable, 'long_task_total_ms', r.long_task_ms);
  const T = r.timings; if (T) { const rows = Array.isArray(T) ? T : Object.keys(T).map(k => Object.assign({ step: k }, typeof T[k] === 'object' ? T[k] : { ms: T[k] })); rows.sort((a, c) => (c.ms || c.dur || 0) - (a.ms || a.dur || 0)); rows.slice(0, 22).forEach(x => console.log(JSON.stringify(x))); } else console.log('no __loadTimings');
  await b.close();
})().catch(e => { console.log('crash', String(e.message).slice(0, 200)); process.exit(2); });
