// node tools/probe-terrain.cjs 8790 -> check terrain meshes built after boot
const puppeteer = require('puppeteer');
const port = process.argv[2] || 8790;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({ headless: 'new', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage(); await p.setViewport({ width: 900, height: 600 });
  const errs = []; p.on('pageerror', (e) => errs.push('PAGEERR ' + e.message.slice(0, 200)));
  p.on('console', (m) => { if (m.type() === 'error' && !/WebSocket|404.*\.js|favicon/.test(m.text())) errs.push(m.text().slice(0, 160)); });
  await p.goto(`http://localhost:${port}/world3d.html`, { waitUntil: 'domcontentloaded' });
  for (let i = 0; i < 150; i++) { await sleep(2000); if (await p.evaluate(() => !!(window.__w && window.__w.mounts.length >= 6)).catch(() => false)) break; }
  const r = await p.evaluate(() => {
    const w = window.__w, world = w.scene;
    const mats = new Set(); world.traverse((o) => { if (o.isMesh && o.material.map && o.material.map.image && o.material.map.image.src) mats.add(o.material.map.image.src.replace(/.*terrain\//, '').replace(/\?.*/, '')); });
    let meshes = 0; world.traverse((o) => { if (o.isMesh) meshes++; });
    const texMissing = world.children.filter((o) => o.isMesh && o.material.map && !o.material.map.image).length;
    return { meshes, texMissing, tiles: [...mats].sort() };
  });
  console.log(JSON.stringify(r));
  console.log('ERR:', errs.slice(0, 6).join('\n') || 'none');
  await b.close();
})().catch((e) => { console.log('FAIL', e.message.slice(0, 300)); process.exit(1); });