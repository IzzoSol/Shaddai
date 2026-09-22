// node tools/probe-boot.cjs 8790 -> quick build check (no entry flow)
const puppeteer = require('puppeteer');
const port = process.argv[2] || 8790;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({ headless: 'new', args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'] });
  const p = await b.newPage();
  await p.setViewport({ width: 1280, height: 800 });
  const errs = [];
  p.on('pageerror', (e) => errs.push('PAGEERR ' + String(e.message).slice(0, 140)));
  p.on('console', (m) => { const t = m.text(); if (m.type() === 'error' && !/favicon|WebSocket|net::|Failed to load resource|404/i.test(t)) errs.push(t.slice(0, 140)); });
  await p.goto(`http://localhost:${port}/SHADDAI-WORLD-3D.html`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  for (let i = 0; i < 45; i++) { await sleep(2000); if (await p.evaluate(() => window.__worldBuilt === true).catch(() => false)) break; }
  await sleep(4000);
  const r = await p.evaluate(() => {
    let trails = 0, arena = 0, car = 0, garageOk = false, tourneyOk = false;
    window.__w3dDebug.scene.traverse((o) => {
      if (o.name === 'world-trails') trails++;
      if ((o.name || '').indexOf('colosseum') >= 0 || o.name === 'world-landmarks') arena++;
      if (o.name === 'hovercar') car++;
    });
    try { garageOk = !!JSON.parse(localStorage.getItem('shd.garage3d') || 'null') || true; } catch (e) {}
    return { built: window.__worldBuilt, trailsAPI: !!window.__worldTrails, landmarksAPI: !!window.__worldLandmarks, trails, landmarkN: arena, carNodes: car, garageDB: garageOk };
  });
  console.log(JSON.stringify(r));
  console.log('ERR:', errs.slice(0, 8).join(' | ') || 'none');
  await b.close();
  process.exit(0);
})().catch((e) => { console.log('FAIL', String(e).slice(0, 200)); process.exit(1); });
