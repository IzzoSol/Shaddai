/* tools/_perf-breakdown.cjs — WHERE the draw calls go (2026-10-23). One boot, spawn, then: renderer.info at the spawn view, and the
 * visible-mesh count grouped by top-level scene child (name / userData tag), with frustum-culled vs in-frustum counts. Also prints full
 * stacks for runtime errors. Read-only: changes nothing in the world.
 *   node tools/_perf-breakdown.cjs      (python -m http.server 3013 --directory public; >= 700 MB free RAM) */
const puppeteer = require('puppeteer'), os = require('os'), sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  if (os.freemem() / 1048576 < 700) { console.log('refused: low RAM'); process.exit(3); }
  const b = await puppeteer.launch({ headless: 'new', protocolTimeout: 900000, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage(); await p.setViewport({ width: 900, height: 560 }); const errs = new Map();
  p.on('pageerror', e => { const k = (e.stack || e.message).split('\n').slice(0, 12).join(' | ').slice(0, 1500); errs.set(k, (errs.get(k) || 0) + 1); });
  await p.goto('http://localhost:3013/SHADDAI-WORLD-3D.html', { waitUntil: 'domcontentloaded', timeout: 90000 });
  for (let i = 0; i < 150; i++) { await sleep(2000); if (await p.evaluate(() => !!window.__loadPlayable).catch(() => false)) break; }
  await sleep(10000);
  await p.evaluate(() => { const els = [...document.querySelectorAll('*')].filter(e => e.children.length < 4 && /Source Temple/i.test(e.textContent || '') && e.offsetParent); const t = els.sort((a, c) => (a.textContent || '').length - (c.textContent || '').length)[0]; if (t) (t.closest('button,[class*=portal],[class*=card],[onclick]') || t).click(); });
  for (let i = 0; i < 60 && !(await p.evaluate(() => window.__spawnBusy === false).catch(() => false)); i++) await sleep(3000);
  await sleep(30000);
  const rep = await p.evaluate(() => new Promise(res => {
    const D = window.__w3dDebug, S = D.scene, R = D.renderer, T = D.THREE;
    requestAnimationFrame(() => { R.info.autoReset = false; R.info.reset(); requestAnimationFrame(() => {
      const info = { calls: R.info.render.calls, tris: R.info.render.triangles }; R.info.autoReset = true;
      const cam = D.camera || (D.getCamera && D.getCamera()); const fr = new T.Frustum();
      if (cam) { cam.updateMatrixWorld(); fr.setFromProjectionMatrix(new T.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse)); }
      const groups = {}, sph = new T.Sphere();
      function vis(o) { for (let x = o; x; x = x.parent) if (!x.visible) return false; return true; }
      S.traverse(o => {
        if (!(o.isMesh || o.isPoints || o.isLine || o.isSprite) || !vis(o)) return;
        let top = o; while (top.parent && top.parent !== S) top = top.parent;
        const key = (top.name || top.userData && (top.userData.tag || top.userData.kind) || top.type) + '';
        const g = groups[key] || (groups[key] = { meshes: 0, inFrustum: 0, noCull: 0, inst: 0, skinned: 0, tris: 0 });
        g.meshes++; if (o.isInstancedMesh) g.inst++; if (o.isSkinnedMesh) g.skinned++; if (o.frustumCulled === false) g.noCull++;
        let inF = true;
        if (cam && o.frustumCulled !== false && o.geometry) { if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere(); sph.copy(o.geometry.boundingSphere).applyMatrix4(o.matrixWorld); inF = fr.intersectsSphere(sph); }
        if (inF) { g.inFrustum++; const ix = o.geometry && o.geometry.index; g.tris += Math.round(((ix ? ix.count : (o.geometry && o.geometry.attributes.position ? o.geometry.attributes.position.count : 0)) / 3) * (o.isInstancedMesh ? o.count : 1)); }
      });
      const rows = Object.entries(groups).sort((a, c) => c[1].inFrustum - a[1].inFrustum).slice(0, 30);
      res({ info, cam: cam ? [Math.round(cam.position.x), Math.round(cam.position.y), Math.round(cam.position.z), cam.far] : null, rows });
    }); });
  }));
  console.log('INFO', JSON.stringify(rep.info), 'cam', JSON.stringify(rep.cam));
  for (const [k, g] of rep.rows) console.log(k.slice(0, 34).padEnd(34), JSON.stringify(g));
  console.log('ERRORS', errs.size); for (const [k, n] of errs) console.log('x' + n, k);
  await b.close();
})().catch(e => { console.error('breakdown failed', e.message); process.exit(1); });
