/* tools/_boot-ab.cjs — back-to-back boot A/B (2026-10-24): for each query, a fresh headless browser boots the world and reports seconds to
 * __loadPlayable, the JS request count and the slowest _bootT stages. Order is A,B,A,B to expose noise.
 *   node tools/_boot-ab.cjs "?bundle=0" ""        (static server :3013 first: node tools/serve.cjs) */
const puppeteer = require('puppeteer'), sleep = ms => new Promise(r => setTimeout(r, ms));
const qs = process.argv.slice(2).length ? process.argv.slice(2) : ['?bundle=0', ''];
(async () => {
  for (const q of [...qs, ...qs]) {
    const b = await puppeteer.launch({ headless: 'new', protocolTimeout: 900000, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
    const p = await b.newPage(); await p.setViewport({ width: 640, height: 400 }); let js = 0, errs = 0;
    p.on('request', r => { if (r.resourceType() === 'script') js++; }); p.on('pageerror', () => errs++);
    const t = Date.now(); await p.goto('http://localhost:3013/SHADDAI-WORLD-3D.html' + (q ? q + '&' : '?') + 'colointro=0', { waitUntil: 'domcontentloaded', timeout: 120000 });
    const dcl = (Date.now() - t) / 1000;
    for (let i = 0; i < 600 && !(await p.evaluate(() => !!window.__loadPlayable).catch(() => false)); i++) await sleep(250);
    const s = (Date.now() - t) / 1000;
    const top = await p.evaluate(() => (window.__bootTimings || []).slice().sort((a, c) => (c.ms || c[2] || 0) - (a.ms || a[2] || 0)).slice(0, 5).map(x => (x.name || x[0]) + ':' + Math.round(x.ms || x[2] || 0))).catch(() => []);
    console.log((q || 'default').padEnd(12), 'domcontentloaded', dcl.toFixed(1), 's | playable', s.toFixed(1), 's | js requests', js, '| errors', errs, '|', top.join(' '));
    await b.close(); await sleep(3000);
  }
})().catch(e => { console.error('boot-ab failed', e.message); process.exit(1); });
