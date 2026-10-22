/* tools/_error-probe.cjs — boot the world headless and print every page error WITH its stack (first frames), then exit.
 *   node tools/_error-probe.cjs [query]      e.g. node tools/_error-probe.cjs "?townsfolk=0"     (needs python http.server 3013)
 * Used to bisect runtime errors with the per-module kill switches (?townsfolk=0 ?realmdress=0 ?gearwear=0 ?realminteriors=0 ?kitcolorfix=0). */
const puppeteer = require('puppeteer'), os = require('os'), sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  if (os.freemem() / 1048576 < 700) { console.log('refused: low RAM'); process.exit(3); }
  const q = process.argv[2] || '';
  const b = await puppeteer.launch({ headless: 'new', protocolTimeout: 600000, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage(); await p.setViewport({ width: 800, height: 500 }); const errs = new Map();
  p.on('pageerror', e => { const k = (e.stack || e.message).split('\n').slice(0, 6).join(' | ').slice(0, 700); errs.set(k, (errs.get(k) || 0) + 1); });
  await p.goto('http://localhost:3013/SHADDAI-WORLD-3D.html' + q, { waitUntil: 'domcontentloaded', timeout: 90000 });
  for (let i = 0; i < 150; i++) { await sleep(2000); if (await p.evaluate(() => !!window.__loadPlayable).catch(() => false)) break; }
  await sleep(10000);
  await p.evaluate(() => { const els = [...document.querySelectorAll('*')].filter(e => e.children.length < 4 && /Source Temple/i.test(e.textContent || '') && e.offsetParent); const t = els.sort((a, c) => (a.textContent || '').length - (c.textContent || '').length)[0]; if (t) (t.closest('button,[class*=portal],[class*=card],[onclick]') || t).click(); });
  for (let i = 0; i < 60 && !(await p.evaluate(() => window.__spawnBusy === false).catch(() => false)); i++) await sleep(3000);
  await sleep(25000);
  console.log('QUERY', q || '(none)', 'distinct errors', errs.size);
  for (const [k, n] of errs) console.log('x' + n, k);
  await b.close();
})().catch(e => { console.error('probe failed', e.message); process.exit(1); });
