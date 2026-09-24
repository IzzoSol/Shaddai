// node tools/probe-mountains.cjs 8790 [shot.png] -> MOUNTAINS v2: ridge height, open passes, flat ground under placed structures
const puppeteer = require('puppeteer');
const port = process.argv[2] || 8790, shot = process.argv[3];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({ headless: 'new', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage(); await p.setViewport({ width: 1280, height: 800 });
  const errs = []; p.on('pageerror', (e) => errs.push('PAGEERR ' + String(e.message).slice(0, 150)));
  await p.goto(`http://localhost:${port}/SHADDAI-WORLD-3D.html?peek=1`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  for (let i = 0; i < 60; i++) { await sleep(2000); if (await p.evaluate(() => !!(window.__w3dDebug && window.__w3dDebug.terrain)).catch(() => false)) break; }
  const r = await p.evaluate(() => {
    const T = window.__w3dDebug.terrain, L = window.WORLD_LAYOUT, H = (x, z) => +T.heightAt(x, z).toFixed(1);
    const passes = { meadow: 0.785, suburb: 0.074, volcano: -0.736, darkforest: -2.405, ocean: 2.366, colosseum: 1.6 };
    const passH = {}; for (const [n, a] of Object.entries(passes)) passH[n] = H(Math.cos(a) * 450, Math.sin(a) * 450);
    let ridgeMax = 0, ridgeAbove30 = 0, n = 0;
    for (let a = -Math.PI; a < Math.PI; a += 0.02) { const h = H(Math.cos(a) * 450, Math.sin(a) * 450); ridgeMax = Math.max(ridgeMax, h); if (h > 30) ridgeAbove30++; n++; }
    const flat = {}; L.realmColliders.forEach((c) => { const d = Math.hypot(c.x, c.z); if (d > 380 && d < 520) flat[c.label] = H(c.x, c.z); });
    flat.colosseum = H(-14, 460);
    return { ridgeMax: +ridgeMax.toFixed(1), ridgeCoverage: Math.round(100 * ridgeAbove30 / n) + '% of ring above 30m', passH, flatUnderStructures: flat };
  });
  console.log(JSON.stringify(r, null, 1));
  if (shot) {
    await p.evaluate(() => { const c = window.__w3dDebug.camera; c.position.set(0, 1100, 250); c.lookAt(0, 0, 0); c.far = 5000; c.updateProjectionMatrix(); window.__freezeCam = true; });
    await sleep(1500); await p.screenshot({ path: shot });
  }
  console.log('ERR:', errs.slice(0, 6).join(' | ') || 'none');
  await b.close();
})().catch((e) => { console.log('FAIL', String(e).slice(0, 250)); process.exit(1); });
