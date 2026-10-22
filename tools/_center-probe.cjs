/* tools/_center-probe.cjs — what stands inside the Grid's centre circle (r < 150 m) in the running game (2026-10-23): the bazaar shaft
 * opens there, so anything at street level inside it would float over the hole. Lists meshes (by top-level owner + path) whose world
 * bounds centre is inside the circle, plus a screenshot from above => C:/Users/Brittany/eye/center-*.png. Read-only.
 *   node tools/_center-probe.cjs   (server 3013; >= 700 MB free RAM) */
const puppeteer = require('puppeteer'), os = require('os'), sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  if (os.freemem() / 1048576 < 700) { console.log('refused: low RAM'); process.exit(3); }
  const b = await puppeteer.launch({ headless: 'new', protocolTimeout: 900000, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage(); await p.setViewport({ width: 900, height: 560 }); const errs = new Map();
  p.on('pageerror', e => { const k = (e.stack || e.message).split('\n').slice(0, 2).join(' | ').slice(0, 200); errs.set(k, (errs.get(k) || 0) + 1); });
  await p.goto('http://localhost:3013/SHADDAI-WORLD-3D.html', { waitUntil: 'domcontentloaded', timeout: 90000 });
  for (let i = 0; i < 150; i++) { await sleep(2000); if (await p.evaluate(() => !!window.__loadPlayable).catch(() => false)) break; }
  await sleep(8000);
  await p.evaluate(() => { const els = [...document.querySelectorAll('*')].filter(e => e.children.length < 4 && /Source Temple/i.test(e.textContent || '') && e.offsetParent); const t = els.sort((a, c) => (a.textContent || '').length - (c.textContent || '').length)[0]; if (t) (t.closest('button,[class*=portal],[class*=card],[onclick]') || t).click(); });
  for (let i = 0; i < 60 && !(await p.evaluate(() => window.__spawnBusy === false).catch(() => false)); i++) await sleep(3000);
  await sleep(20000);
  const r = await p.evaluate(() => {
    const D = window.__w3dDebug, S = D.scene, T = D.THREE, U = 7 / 1.8, out = {}, box = new T.Box3(), c = new T.Vector3();
    S.traverse(o => {
      if (!o.isMesh || !o.visible || o.isInstancedMesh) return;
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox(); box.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld); box.getCenter(c);
      if (Math.hypot(c.x, c.z) > 150 * U || c.y < -60 * U || c.y > 400 * U) return;
      let top = o; while (top.parent && top.parent !== S) top = top.parent;
      const k = (top.name || top.type) + ' > ' + (o.parent && o.parent !== S ? (o.parent.name || o.parent.type) : '') + ' > ' + (o.name || o.material && o.material.name || o.geometry.type);
      out[k] = (out[k] || 0) + 1;
    });
    return Object.entries(out).sort((a, b) => b[1] - a[1]).slice(0, 40);
  });
  for (const [k, n] of r) console.log('IN-CIRCLE', n, k.slice(0, 160));
  await p.evaluate(() => { const D = window.__w3dDebug, U = 7 / 1.8, r0 = D.renderer.render.bind(D.renderer); D.renderer.render = (s, c) => { c.position.set(260 * U, 220 * U, 260 * U); c.lookAt(0, 0, 0); c.updateMatrixWorld(true); r0(s, c); }; });
  await sleep(6000); await p.screenshot({ path: 'C:/Users/Brittany/eye/center-circle.png' });
  console.log('ERRORS', errs.size); for (const [k, n] of errs) console.log('x' + n, k);
  await b.close();
})().catch(e => { console.error('center probe failed', e.message); process.exit(1); });
