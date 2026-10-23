/* tools/_aerial-probe.cjs — final audit AERIALS (2026-10-23): one boot, camera locked high over the Grid centre + the 4 quadrants + the
 * ring towns, so open / empty / unlevelled stretches show => C:/Users/Brittany/eye/aerial-<name>.png. Read-only. */
const puppeteer = require('puppeteer'), os = require('os'), sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  if (os.freemem() / 1048576 < 520) { console.log('refused: low RAM'); process.exit(3); }
  const b = await puppeteer.launch({ headless: 'new', protocolTimeout: 900000, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage(); await p.setViewport({ width: 1100, height: 640 });
  await p.goto('http://localhost:3013/SHADDAI-WORLD-3D.html?colointro=0&bazaar=0', { waitUntil: 'domcontentloaded', timeout: 90000 });
  for (let i = 0; i < 150; i++) { await sleep(2000); if (await p.evaluate(() => !!window.__loadPlayable).catch(() => false)) break; }
  await sleep(8000);
  await p.evaluate(() => { const els = [...document.querySelectorAll('*')].filter(e => e.children.length < 4 && /Source Temple/i.test(e.textContent || '') && e.offsetParent); const t = els.sort((a, c) => (a.textContent || '').length - (c.textContent || '').length)[0]; if (t) (t.closest('button,[class*=portal],[class*=card],[onclick]') || t).click(); });
  for (let i = 0; i < 60 && !(await p.evaluate(() => window.__spawnBusy === false).catch(() => false)); i++) await sleep(3000);
  await sleep(15000);
  await p.evaluate(() => { const D = window.__w3dDebug; const r0 = D.renderer.render.bind(D.renderer); window.__camLock = {}; D.renderer.render = (s, c) => { const L = window.__camLock; if (L.on) { c.position.set(L.px, L.py, L.pz); c.lookAt(L.tx, L.ty, L.tz); c.updateMatrixWorld(true); } r0(s, c); };
    document.querySelectorAll('.hud,#worldNav,#chatBtn,#helpChip').forEach(e => e.style.visibility = 'hidden'); });
  const U = 7 / 1.8, SH = [['grid-centre', 0, 0, 900], ['grid-north', 0, -1100, 900], ['grid-east', 1100, 0, 900], ['grid-south', 0, 1100, 900], ['grid-west', -1100, 0, 900], ['ring-ne', 2000, -2000, 1100], ['ring-sw', -2000, 2000, 1100]];
  for (const [n, xm, zm, hm] of SH) {
    await p.evaluate((xm, zm, hm, U) => { const D = window.__w3dDebug; D.playerPos.x = xm * U; D.playerPos.z = zm * U; Object.assign(window.__camLock, { on: true, px: xm * U, py: hm * U, pz: zm * U + hm * U * 0.6, tx: xm * U, ty: 0, tz: zm * U }); }, xm, zm, hm, U);
    await sleep(10000); await p.screenshot({ path: 'C:/Users/Brittany/eye/aerial-' + n + '.png' }); console.log('shot', n);
  }
  await b.close();
})().catch(e => { console.error('aerial probe failed', e.message); process.exit(1); });
