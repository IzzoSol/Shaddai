/* tools/_fabric-probe.cjs — why the Grid district buildings don't show (2026-10-23): grid fabric api stats, sc-* InstancedMesh counts/visibility,
 * and every console warning mentioning map-v4 / clusters / fabric / layout. Read-only. */
const puppeteer = require('puppeteer'), os = require('os'), sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  if (os.freemem() / 1048576 < 520) { console.log('refused: low RAM'); process.exit(3); }
  const b = await puppeteer.launch({ headless: 'new', protocolTimeout: 900000, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage(); await p.setViewport({ width: 700, height: 420 });
  p.on('console', m => { const t = m.text(); if (/map-v4|cluster|fabric|layout|districts|ghost/i.test(t)) console.log('CONSOLE', t.slice(0, 240)); });
  p.on('pageerror', e => console.log('PAGEERR', (e.message || '').slice(0, 200)));
  await p.goto('http://localhost:3013/SHADDAI-WORLD-3D.html?colointro=0&bazaar=0&edgerealms=0', { waitUntil: 'domcontentloaded', timeout: 90000 });
  for (let i = 0; i < 150; i++) { await sleep(2000); if (await p.evaluate(() => !!window.__loadPlayable).catch(() => false)) break; }
  await sleep(8000);
  await p.evaluate(() => { const els = [...document.querySelectorAll('*')].filter(e => e.children.length < 4 && /Source Temple/i.test(e.textContent || '') && e.offsetParent); const t = els.sort((a, c) => (a.textContent || '').length - (c.textContent || '').length)[0]; if (t) (t.closest('button,[class*=portal],[class*=card],[onclick]') || t).click(); });
  for (let i = 0; i < 60 && !(await p.evaluate(() => window.__spawnBusy === false).catch(() => false)); i++) await sleep(3000);
  await p.evaluate(() => { const D = window.__w3dDebug, U = 7 / 1.8; D.playerPos.x = 450 * U; D.playerPos.z = 450 * U; });
  await sleep(25000);
  const r = await p.evaluate(() => {
    const D = window.__w3dDebug, G = D.gridFabricV4, out = { hasApi: !!G, layout: !!window.__cityLayout, items: window.__cityLayout && window.__cityLayout.items && window.__cityLayout.items.length };
    try { out.stats = G && (typeof G.stats === 'function' ? G.stats() : G.stats); } catch (e) { out.stats = 'err ' + e.message; }
    let im = 0, imVis = 0, inst = 0, names = {};
    D.scene.traverse(o => { if (!o.isInstancedMesh) return; let top = o; while (top.parent && top.parent !== D.scene) top = top.parent; const k = top.name || '?'; if (!/fabric|cluster|grid/i.test(k)) return; im++; let vis = true; for (let x = o; x; x = x.parent) if (!x.visible) vis = false; if (vis) imVis++; inst += o.count; names[k] = (names[k] || 0) + o.count; });
    out.fabricInstanced = { meshes: im, visibleMeshes: imVis, instances: inst, byTop: names };
    return out;
  });
  console.log(JSON.stringify(r, null, 1).slice(0, 3000));
  await b.close();
})().catch(e => { console.error('fabric probe failed', e.message); process.exit(1); });
