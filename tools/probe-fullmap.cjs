// node tools/probe-fullmap.cjs 8790 -> verify the FULL MAP merge: realms, mountains, scaled ocean + overhead shot
const puppeteer = require('puppeteer');
const port = process.argv[2] || 8790;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({ headless: 'new', args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'] });
  const p = await b.newPage();
  await p.setViewport({ width: 1280, height: 800 });
  const errs = [];
  p.on('pageerror', (e) => errs.push('PAGEERR ' + String(e.message).slice(0, 150)));
  p.on('console', (m) => { const t = m.text(); if (m.type() === 'error' && !/favicon|WebSocket|net::|Failed to load resource|404/i.test(t)) errs.push(t.slice(0, 140)); });
  await p.goto(`http://localhost:${port}/SHADDAI-WORLD-3D.html?peek=1`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  for (let i = 0; i < 45; i++) { await sleep(2000); if (await p.evaluate(() => window.__worldBuilt === true).catch(() => false)) break; }
  for (let i = 0; i < 40; i++) { await sleep(1500); if (await p.evaluate(() => !!document.getElementById('spawnPicker')).catch(() => false)) break; }
  await p.evaluate(() => { const btn = document.querySelector('#spawnPicker .sp-btn.sp-default') || document.querySelector('#spawnPicker .sp-btn'); if (btn) btn.click(); });
  for (let i = 0; i < 50; i++) { await sleep(2000); const ok = await p.evaluate(() => { let t = null; if (window.__w3dDebug) window.__w3dDebug.scene.traverse((o) => { if (o.name === 'ocean-water' && o.material && o.material.uniforms) t = o.material.uniforms.t.value; }); return typeof t === 'number' && t > 3; }).catch(() => false); if (ok) break; }
  await sleep(2000);

  const r = await p.evaluate(() => {
    const L = window.WORLD_LAYOUT || {};
    const at = (x, z) => (L.biomeAt ? L.biomeAt(x, z).id : '?');
    let volcanoN = 0, realmN = 0, oceanBoats = 0, meshN = 0;
    window.__w3dDebug.scene.traverse((o) => {
      meshN++;
      if ((o.name || '').startsWith('volcano-')) volcanoN++;
      if ((o.name || '').startsWith('realm-')) realmN++;
      if ((o.name || '').startsWith('ocean-boat-')) oceanBoats++;
    });
    return {
      half: L.half,
      biomes: (L.biomes || []).length,
      probe: { meadow: at(400, 400), suburb: at(540, 40), volcano: at(420, -380), darkforest: at(-420, -380), ocean: at(-295, 290), plaza: at(0, 0) },
      volcanoModels: volcanoN, realmProps: realmN, oceanBoats,
      quality: window.__quality || null, meshN,
      ocAPI: !!window.__worldOcean, voAPI: !!window.__worldVolcano, rpAPI: !!window.__worldRealmProps,
    };
  });
  console.log(JSON.stringify(r, null, 1));
  console.log('ERR:', errs.slice(0, 8).join('\n') || 'none');

  // FULL MAP overhead screenshot: freeze camera, look down from high above
  await p.evaluate(() => {
    ['intro','loadmsg'].forEach((id) => { const e = document.getElementById(id); if (e) e.style.display = 'none'; });
    const c = window.__w3dDebug.camera;
    c.position.set = function () { return c.position; };
    c.position.set(0, 0, 0);
    c.position.x = 0; c.position.y = 950; c.position.z = 0.1;
    c.lookAt(0, 0, 0);
  });
  await sleep(3000);
  await p.screenshot({ path: 'C:/Users/Brittany/Shaddai-3d/fal-assets/spike/fullmap-overhead.png' });
  console.log('shot: fal-assets/spike/fullmap-overhead.png');
  await b.close();
  process.exit(0);
})().catch((e) => { console.log('FAIL', String(e).slice(0, 400)); process.exit(1); });
