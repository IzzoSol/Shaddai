/* tools/_clutter-probe.cjs — WHAT is floating / cluttered at a building base (2026-10-23): at the ZEROX + NEXUS bases, list every mesh /
 * instance within 80 m that is small (< 4 m) and floats > 0.6 m above the ground, grouped by owner path + material colour. Read-only. */
const puppeteer = require('puppeteer'), os = require('os'), sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  if (os.freemem() / 1048576 < 700) { console.log('refused: low RAM'); process.exit(3); }
  const b = await puppeteer.launch({ headless: 'new', protocolTimeout: 900000, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage(); await p.setViewport({ width: 700, height: 420 });
  await p.goto('http://localhost:3013/SHADDAI-WORLD-3D.html?colointro=0', { waitUntil: 'domcontentloaded', timeout: 90000 });
  for (let i = 0; i < 150; i++) { await sleep(2000); if (await p.evaluate(() => !!window.__loadPlayable).catch(() => false)) break; }
  await sleep(8000);
  await p.evaluate(() => { const els = [...document.querySelectorAll('*')].filter(e => e.children.length < 4 && /Source Temple/i.test(e.textContent || '') && e.offsetParent); const t = els.sort((a, c) => (a.textContent || '').length - (c.textContent || '').length)[0]; if (t) (t.closest('button,[class*=portal],[class*=card],[onclick]') || t).click(); });
  for (let i = 0; i < 60 && !(await p.evaluate(() => window.__spawnBusy === false).catch(() => false)); i++) await sleep(3000);
  await sleep(15000);
  const r = await p.evaluate(() => {
    const D = window.__w3dDebug, S = D.scene, T = D.THREE, U = 7 / 1.8, H = (x, z) => (window.WORLD_HEIGHT_AT ? window.WORLD_HEIGHT_AT(x, z) : (D.terrainV4 && D.terrainV4.heightAt ? D.terrainV4.heightAt(x, z) : 0));
    const L = window.WORLD_LAYOUT, out = {}, box = new T.Box3(), m4 = new T.Matrix4(), c = new T.Vector3(), sz = new T.Vector3();
    const spots = ['ZEROX', 'NEXUS'].map(k => { const s = L.sector(k); const d = Math.hypot(s.pos[0], s.pos[1]) || 1; return { x: s.pos[0] - s.pos[0] / d * 50 * U, z: s.pos[1] - s.pos[1] / d * 50 * U }; });
    function test(o, mw) {
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox(); box.copy(o.geometry.boundingBox).applyMatrix4(mw); box.getCenter(c); box.getSize(sz);
      if (Math.max(sz.x, sz.y, sz.z) > 4 * U) return;
      if (!spots.some(s => Math.hypot(c.x - s.x, c.z - s.z) < 80 * U)) return;
      const gap = (box.min.y - H(c.x, c.z)) / U; if (gap < 0.6 || gap > 40) return;
      let top = o; const chain = []; for (let x = o; x && x !== S; x = x.parent) chain.push(x.name || x.type);
      const col = o.material && o.material.color ? '#' + o.material.color.getHexString() : '?';
      const k = chain.reverse().join('>').slice(0, 120) + ' col=' + col; out[k] = (out[k] || 0) + 1;
    }
    S.traverse(o => {
      if (!o.isMesh || !o.visible) return;
      if (o.isInstancedMesh) { for (let i = 0; i < Math.min(o.count, 4000); i++) { o.getMatrixAt(i, m4); m4.premultiply(o.matrixWorld); test(o, m4); } }
      else test(o, o.matrixWorld);
    });
    return Object.entries(out).sort((a, b) => b[1] - a[1]).slice(0, 25);
  });
  r.forEach(([k, n]) => console.log('FLOAT', n, k));
  await b.close();
})().catch(e => { console.error('clutter probe failed', e.message); process.exit(1); });
