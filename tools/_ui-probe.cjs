/* tools/_ui-probe.cjs — the PLAYABILITY pass in one boot (2026-10-23): intro timing (ms to first slide, to playable, to spawned),
 * intro screenshots, HUD/controls screenshot, NAVI open (each module), FPS sample (frames over 5 s) => C:/Users/Brittany/eye/ui-*.png
 *   node tools/_ui-probe.cjs      (python -m http.server 3013 --directory public; >= 700 MB free RAM) */
const puppeteer = require('puppeteer'), os = require('os'), sleep = ms => new Promise(r => setTimeout(r, ms));
const OUT = 'C:/Users/Brittany/eye';
(async () => {
  if (os.freemem() / 1048576 < 700) { console.log('refused: low RAM'); process.exit(3); }
  const b = await puppeteer.launch({ headless: 'new', protocolTimeout: 900000, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage(); await p.setViewport({ width: 1100, height: 660 }); const errs = new Set(); const T0 = Date.now(), T = {};
  p.on('pageerror', e => errs.add((e.stack || e.message).split('\n').slice(0, 3).join(' | ').slice(0, 300)));
  await p.goto('http://localhost:3013/SHADDAI-WORLD-3D.html', { waitUntil: 'domcontentloaded', timeout: 90000 }); T.dom = Date.now() - T0;
  await sleep(3500); await p.screenshot({ path: OUT + '/ui-intro-1.png' });
  for (let i = 0; i < 150; i++) { await sleep(1000); if (await p.evaluate(() => !!window.__loadPlayable).catch(() => false)) break; } T.playable = Date.now() - T0;
  await p.screenshot({ path: OUT + '/ui-intro-2.png' });
  await sleep(8000);
  await p.evaluate(() => { const els = [...document.querySelectorAll('*')].filter(e => e.children.length < 4 && /Source Temple/i.test(e.textContent || '') && e.offsetParent); const t = els.sort((a, c) => (a.textContent || '').length - (c.textContent || '').length)[0]; if (t) (t.closest('button,[class*=portal],[class*=card],[onclick]') || t).click(); });
  for (let i = 0; i < 60 && !(await p.evaluate(() => window.__spawnBusy === false).catch(() => false)); i++) await sleep(2000); T.spawned = Date.now() - T0;
  await sleep(12000); await p.screenshot({ path: OUT + '/ui-hud.png' });
  const fps = await p.evaluate(() => new Promise(res => { let n = 0; const t0 = performance.now(); (function f() { n++; if (performance.now() - t0 < 5000) requestAnimationFrame(f); else res(Math.round(n / 5)); })(); }));
  const navi = await p.evaluate(() => { const N = window.Navi; if (!N) return null; N.open(); const S = window.NaviState || {}; return { modules: Object.keys(S.modules || {}).length || null, open: !!S.open }; });
  await sleep(2500); await p.screenshot({ path: OUT + '/ui-navi.png' });
  const mods = await p.evaluate(() => [...document.querySelectorAll('[data-mod],[data-module]')].map(e => e.getAttribute('data-mod') || e.getAttribute('data-module')).filter(Boolean).slice(0, 16));
  console.log(JSON.stringify({ timingsMs: T, fpsHeadlessSwiftshader: fps, navi, naviModules: mods }, null, 1));
  console.log('ERRORS', errs.size); for (const e of errs) console.log(' ', e);
  await b.close();
})().catch(e => { console.error('ui probe failed', e.message); process.exit(1); });
