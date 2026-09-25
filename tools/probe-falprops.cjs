// node tools/probe-falprops.cjs 8790 [outPrefix] -> fal models placed at REAL size: count, in-world heights vs spec, colliders, shots
const puppeteer = require('puppeteer');
const port = process.argv[2] || 8790, out = process.argv[3];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({ headless: 'new', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage(); await p.setViewport({ width: 1280, height: 800 });
  const errs = []; p.on('pageerror', (e) => errs.push('PAGEERR ' + String(e.message).slice(0, 150)));
  await p.goto(`http://localhost:${port}/SHADDAI-WORLD-3D.html?peek=1`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  for (let i = 0; i < 60; i++) { await sleep(2000); const s = await p.evaluate(() => window.__worldFalProps && window.__worldFalProps.stats()).catch(() => null); if (s && s.placed >= 19) break; }
  await sleep(1500);
  const r = await p.evaluate(() => {
    const st = window.__worldFalProps.stats(), g = window.__worldFalProps.group, PM = 7 / 1.8;
    const spec = {}; (window.WORLD_FAL_ITEMS || []).forEach((it) => { spec[it.id] = it.m; });
    const seen = {}, rows = [];
    g.children.forEach((h) => {
      const id = h.userData.falId; if (seen[id]) return; seen[id] = 1;
      const box = new h.position.constructor(); const B = new (Object.getPrototypeOf(window.__w3dDebug.scene).constructor === Object ? Object : Object)();
      return;
    });
    // measure with the scene's own Box3 via a mesh's geometry bounds in world space
    const T = window.__w3dDebug.terrain;
    g.children.forEach((h) => {
      const id = h.userData.falId; if (seen['m' + id]) return; seen['m' + id] = 1;
      let minY = Infinity, maxY = -Infinity, minX = Infinity, maxX = -Infinity;
      h.updateMatrixWorld(true);
      h.traverse((o) => { if (!o.isMesh || !o.geometry) return; o.geometry.computeBoundingBox(); const bb = o.geometry.boundingBox; const e = o.matrixWorld.elements;
        for (const x of [bb.min.x, bb.max.x]) for (const y of [bb.min.y, bb.max.y]) for (const z of [bb.min.z, bb.max.z]) {
          const wy = e[1] * x + e[5] * y + e[9] * z + e[13], wx = e[0] * x + e[4] * y + e[8] * z + e[12];
          minY = Math.min(minY, wy); maxY = Math.max(maxY, wy); minX = Math.min(minX, wx); maxX = Math.max(maxX, wx); } });
      const want = spec[id].h ? spec[id].h * PM : null;
      rows.push({ id, heightUnits: +(maxY - minY).toFixed(1), wantHeight: want && +want.toFixed(1), realMetres: +((maxY - minY) / PM).toFixed(1), widthUnits: +(maxX - minX).toFixed(1),
        feetOnGround: +(minY - (id === 'hub-dock' ? 0 : T.heightAt(h.position.x, h.position.z))).toFixed(2) });
    });
    return { stats: st, rows };
  });
  console.log(JSON.stringify(r, null, 1));
  if (out) {
    await p.evaluate(() => { const btn = document.querySelector('#spawnPicker .sp-btn.sp-default') || document.querySelector('#spawnPicker .sp-btn'); if (btn) btn.click(); });
    await sleep(6000);
    await p.addStyleTag({ content: 'body > *:not(canvas):not(script){visibility:hidden !important} canvas{visibility:visible !important}' });
    const shots = [['north', [0, 55, 30], [0, 18, -70]], ['shop', [-10, 30, -20], [-40, 16, -85]], ['arcade', [20, 30, -10], [62, 22, -55]]];
    for (const [n, pos, look] of shots) { await p.evaluate((a, l) => { window.__probeCam = { pos: a, look: l }; }, pos, look); await sleep(1800); await p.screenshot({ path: `${out}-${n}.png` }); }
  }
  console.log('ERR:', errs.slice(0, 6).join(' | ') || 'none');
  await b.close();
})().catch((e) => { console.log('FAIL', String(e).slice(0, 250)); process.exit(1); });
