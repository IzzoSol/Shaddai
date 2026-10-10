/* tools/_load-profile.cjs — which JS functions eat the load time?  (static server first: cd public && python -m http.server 3013)
 *   node tools/_load-profile.cjs [query]      e.g. "?time=0.5"
 * Starts the Chrome CPU profiler before navigation, stops it at __loadPlayable, and prints the top functions by self time
 * (ms, percent of the profiled window, function name, script file and line). No host edits needed.
 * Software GL is slow in absolute terms: compare run to run. Refuses to start below SMOKE_MIN_MB free RAM (default 1000). */
const puppeteer = require('puppeteer'), os = require('os'), sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const need = +(process.env.SMOKE_MIN_MB || 1000), free = Math.round(os.freemem() / 1048576);
  if (free < need) { console.log(JSON.stringify({ refused: true, free_mb: free, need_mb: need })); process.exit(3); }
  const qs = process.argv[2] || '';
  const b = await puppeteer.launch({ headless: 'new', protocolTimeout: 900000, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage(); await p.setViewport({ width: 900, height: 520 });
  const cdp = await p.target().createCDPSession();
  await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 1000 });
  await cdp.send('Profiler.start');
  const t0 = Date.now();
  await p.goto('http://localhost:3013/SHADDAI-WORLD-3D.html' + qs, { waitUntil: 'domcontentloaded', timeout: 120000 });
  let playable = null; for (let i = 0; i < 300; i++) { await sleep(1000); if (await p.evaluate(() => !!window.__loadPlayable).catch(() => false)) { playable = Date.now() - t0; break; } }
  let { profile } = await cdp.send('Profiler.stop');
  // POST=<seconds>: profile the window AFTER playable (where streamed-in objects compile their shaders on first draw)
  const post = +(process.env.POST || 0);
  if (post > 0 && playable) {
    await cdp.send('Profiler.start');
    const programsStart = await p.evaluate(() => window.__w3dDebug.renderer.info.programs.length);
    await sleep(post * 1000);
    const programsEnd = await p.evaluate(() => window.__w3dDebug.renderer.info.programs.length);
    ({ profile } = await cdp.send('Profiler.stop'));
    console.log(JSON.stringify({ post_window_s: post, programs_start: programsStart, programs_end: programsEnd }));
  }
  // self time per node: sum of timeDeltas attributed to the sampled node
  const byId = new Map(profile.nodes.map(n => [n.id, n]));
  const self = new Map();
  profile.samples.forEach((id, i) => { self.set(id, (self.get(id) || 0) + (profile.timeDeltas[i] || 0)); });
  const agg = new Map();
  for (const [id, us] of self) {
    const n = byId.get(id), cf = n.callFrame, key = `${cf.functionName || '(anonymous)'} @ ${(cf.url || '').split('/').pop() || '(native)'}:${cf.lineNumber + 1}`;
    agg.set(key, (agg.get(key) || 0) + us);
  }
  const total = [...agg.values()].reduce((a, c) => a + c, 0);
  // OWNER: attribute each sample to the first non-three.js frame on its stack (which world module or host line triggered the work)
  const parentOf = new Map(); profile.nodes.forEach(n => (n.children || []).forEach(c => parentOf.set(c, n.id)));
  const owners = new Map();
  for (const [id, us] of self) {
    let cur = id, owner = '(engine only)';
    while (cur !== undefined) { const cf = byId.get(cur).callFrame; if (cf.url && !/three\.(module|core)\.js/.test(cf.url) && cf.url !== '') { owner = `${cf.url.split('/').pop().split('?')[0]}:${cf.lineNumber + 1}`; break; } cur = parentOf.get(cur); }
    owners.set(owner, (owners.get(owner) || 0) + us);
  }
  const topOwners = [...owners.entries()].sort((a, c) => c[1] - a[1]).slice(0, 15).map(([k, us]) => ({ ms: Math.round(us / 1000), pct: +(100 * us / total).toFixed(1), owner: k }));
  const top = [...agg.entries()].sort((a, c) => c[1] - a[1]).slice(0, 25).map(([k, us]) => ({ ms: Math.round(us / 1000), pct: +(100 * us / total).toFixed(1), fn: k }));
  console.log(JSON.stringify({ playable_ms: playable, profiled_ms: Math.round(total / 1000), top, top_owners: topOwners }, null, 1));
  await b.close(); process.exit(playable ? 0 : 1);
})().catch(e => { console.log(JSON.stringify({ crash: String(e.message).slice(0, 200) })); process.exit(2); });
