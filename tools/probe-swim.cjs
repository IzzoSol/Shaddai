// node tools/probe-swim.cjs 8790 -> SWIM LAW: enter world, teleport over deep water, verify the player floats (no seafloor walking)
const puppeteer = require('puppeteer');
const port = process.argv[2] || 8790;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({ headless: 'new', args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'] });
  const p = await b.newPage();
  await p.setViewport({ width: 1280, height: 800 });
  const errs = [];
  p.on('pageerror', (e) => errs.push(String(e.message).slice(0, 130)));
  await p.goto(`http://localhost:${port}/SHADDAI-WORLD-3D.html?peek=1`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  for (let i = 0; i < 45; i++) { await sleep(2000); if (await p.evaluate(() => window.__worldBuilt === true).catch(() => false)) break; }
  for (let i = 0; i < 40; i++) { await sleep(1500); if (await p.evaluate(() => !!document.getElementById('spawnPicker')).catch(() => false)) break; }
  await p.evaluate(() => { const btn = document.querySelector('#spawnPicker .sp-btn.sp-default') || document.querySelector('#spawnPicker .sp-btn'); if (btn) btn.click(); });
  for (let i = 0; i < 50; i++) { await sleep(2000); const ok = await p.evaluate(() => { let t = null; if (window.__w3dDebug) window.__w3dDebug.scene.traverse((o) => { if (o.name === 'ocean-water' && o.material && o.material.uniforms) t = o.material.uniforms.t.value; }); return typeof t === 'number' && t > 3; }).catch(() => false); if (ok) break; }
  await sleep(2000);
  const r = await p.evaluate(async () => {
    const P = window._playerPos;
    // dry-land baseline: plaza
    P.x.set ? P.x.set(0) : P.x = 0; P.z = 70;
    await new Promise((r2) => setTimeout(r2, 400));
    const yLand = window.__w3dDebug.camera.position.y;
    // deep water: Crystal Sea center [-295, 290]
    P.x = -295; P.z = 290;
    await new Promise((r2) => setTimeout(r2, 700));
    const ySea = window.__w3dDebug.camera.position.y;
    const terr = window.__worldTerrainHeightAt ? null : null;
    return { yLand: +yLand.toFixed(2), ySea: +ySea.toFixed(2), floats: ySea > 0.6 && ySea < 3.5, p: [Math.round(P.x), Math.round(P.z)] };
  });
  console.log(JSON.stringify(r));
  console.log('ERR:', errs.slice(0, 6).join(' | ') || 'none');
  await b.close(); process.exit(0);
})().catch((e) => { console.log('FAIL', String(e).slice(0, 250)); process.exit(1); });
