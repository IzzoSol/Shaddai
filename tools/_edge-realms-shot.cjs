/* tools/_edge-realms-shot.cjs — one boot: K31 edge realms loaded?, gate message at each causeway head (on foot, no cosmetic),
 * and a screenshot from the rim toward each realm => C:/Users/Brittany/eye/edge-<id>.png
 *   node tools/_edge-realms-shot.cjs      (python -m http.server 3013 --directory public; >= 700 MB free RAM) */
const puppeteer = require('puppeteer'), os = require('os'), sleep = ms => new Promise(r => setTimeout(r, ms));
const OUT = 'C:/Users/Brittany/eye';
(async () => {
  if (os.freemem() / 1048576 < 700) { console.log('refused: low RAM'); process.exit(3); }
  const b = await puppeteer.launch({ headless: 'new', protocolTimeout: 900000, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage(); await p.setViewport({ width: 900, height: 560 }); const errs = new Map();
  p.on('pageerror', e => { const k = (e.stack || e.message).split('\n').slice(0, 3).join(' | ').slice(0, 300); errs.set(k, (errs.get(k) || 0) + 1); });
  await p.goto('http://localhost:3013/SHADDAI-WORLD-3D.html', { waitUntil: 'domcontentloaded', timeout: 90000 });
  for (let i = 0; i < 150; i++) { await sleep(2000); if (await p.evaluate(() => !!window.__loadPlayable).catch(() => false)) break; }
  await sleep(8000);
  await p.evaluate(() => { const els = [...document.querySelectorAll('*')].filter(e => e.children.length < 4 && /Source Temple/i.test(e.textContent || '') && e.offsetParent); const t = els.sort((a, c) => (a.textContent || '').length - (c.textContent || '').length)[0]; if (t) (t.closest('button,[class*=portal],[class*=card],[onclick]') || t).click(); });
  for (let i = 0; i < 60 && !(await p.evaluate(() => window.__spawnBusy === false).catch(() => false)); i++) await sleep(3000);
  for (let i = 0; i < 40 && !(await p.evaluate(() => !!window.__edgeRealms).catch(() => false)); i++) await sleep(3000);
  console.log('STATS', JSON.stringify(await p.evaluate(() => window.__edgeRealms ? window.__edgeRealms.stats() : null)));
  await p.evaluate(() => { const D = window.__w3dDebug; const r0 = D.renderer.render.bind(D.renderer); window.__camLock = {}; D.renderer.render = (s, c) => { const L = window.__camLock; if (L.on) { c.position.set(L.px, L.py, L.pz); c.lookAt(L.tx, L.ty, L.tz); c.updateMatrixWorld(true); } r0(s, c); }; });
  const heads = await p.evaluate(() => window.__edgeRealms.heads.map(h => ({ id: h.id, x: h.x, y: h.y, z: h.z })));
  for (const h of heads) {
    const gate = await p.evaluate((h) => { const D = window.__w3dDebug, U = 7 / 1.8, r = Math.hypot(h.x, h.z), dx = h.x / r, dz = h.z / r;
      D.playerPos.x = h.x - dx * 20 * U; D.playerPos.z = h.z - dz * 20 * U;
      Object.assign(window.__camLock, { on: true, px: h.x - dx * 260 * U, py: h.y + 140 * U, pz: h.z - dz * 260 * U, tx: h.x + dx * 700 * U, ty: h.y + 60 * U, tz: h.z + dz * 700 * U });
      const c = window.__edgeRealms.check(); return c && c.msg; }, h);
    console.log('GATE', h.id, gate);
    await sleep(9000); await p.screenshot({ path: OUT + '/edge-' + h.id + '.png' }); console.log('shot', h.id);
  }
  console.log('ERRORS', errs.size); for (const [k, n] of errs) console.log('x' + n, k);
  await b.close();
})().catch(e => { console.error('edge shot failed', e.message); process.exit(1); });
