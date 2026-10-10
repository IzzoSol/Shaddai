/* tools/_boot-timings.cjs — where does the load time go?  (static server first: cd public && python -m http.server 3013)
 *   node tools/_boot-timings.cjs [query]      e.g. "?time=0.5"
 * Boots the game headless like _boot-smoke.cjs, waits for __loadPlayable, then prints the slowest boot stages
 * recorded by _bootT() in window.__bootTimings (name, start offset ms, duration ms), plus the total boot time.
 * Software GL is slow in absolute terms: compare run to run, not to a real GPU.
 * Refuses to start below SMOKE_MIN_MB free RAM (default 1000). */
const puppeteer = require('puppeteer'), os = require('os'), sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const need = +(process.env.SMOKE_MIN_MB || 1000), free = Math.round(os.freemem() / 1048576);
  if (free < need) { console.log(JSON.stringify({ refused: true, free_mb: free, need_mb: need })); process.exit(3); }
  const qs = process.argv[2] || '', t0 = Date.now();
  const b = await puppeteer.launch({ headless: 'new', protocolTimeout: 900000, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage(); await p.setViewport({ width: 900, height: 520 });
  await p.goto('http://localhost:3013/SHADDAI-WORLD-3D.html' + qs, { waitUntil: 'domcontentloaded', timeout: 120000 });
  let playable = null; for (let i = 0; i < 300; i++) { await sleep(1000); if (await p.evaluate(() => !!window.__loadPlayable).catch(() => false)) { playable = Date.now() - t0; break; } }
  const stages = await p.evaluate(() => (window.__bootTimings || []).map(s => ({ name: s.name, at: s.at, ms: s.ms })));
  const top = stages.slice().sort((a, c) => c.ms - a.ms).slice(0, 15);
  const sum = stages.reduce((a, s) => a + s.ms, 0);
  console.log(JSON.stringify({ playable_ms: playable, stage_count: stages.length, stage_ms_total: Math.round(sum), slowest: top }, null, 1));
  await b.close(); process.exit(playable ? 0 : 1);
})().catch(e => { console.log(JSON.stringify({ crash: String(e.message).slice(0, 200) })); process.exit(2); });
