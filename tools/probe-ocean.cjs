// node tools/probe-ocean.cjs 8790 -> verify the Crystal Sea cove (step 2) in the host world
const puppeteer = require('puppeteer');
const port = process.argv[2] || 8790;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({ headless: 'new', args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'] });
  const p = await b.newPage();
  await p.setViewport({ width: 1280, height: 800 });
  const errs = [];
  p.on('pageerror', (e) => errs.push('PAGEERR ' + String(e.message).slice(0, 180)));
  p.on('console', (m) => { const t = m.text(); if (m.type() === 'error' && !/favicon|WebSocket|net::|Failed to load resource|404/i.test(t)) errs.push(t.slice(0, 160)); });
  await p.goto(`http://localhost:${port}/SHADDAI-WORLD-3D.html?peek=1`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  for (let i = 0; i < 40; i++) { await sleep(2000); if (await p.evaluate(() => window.__worldBuilt === true).catch(() => false)) break; }
  // enter flow auto-fires (?peek); wait for the portal picker, click the default drop
  for (let i = 0; i < 30; i++) { await sleep(1500); if (await p.evaluate(() => !!document.getElementById('spawnPicker')).catch(() => false)) break; }
  await p.evaluate(() => { const btn = document.querySelector('#spawnPicker .sp-btn.sp-default') || document.querySelector('#spawnPicker .sp-btn'); if (btn) btn.click(); });
  // wait for the sky-dive to finish (camera settles near ground)
  for (let i = 0; i < 40; i++) { await sleep(1500); const y = await p.evaluate(() => window.__w3dDebug ? window.__w3dDebug.camera.position.y : 999).catch(() => 999); if (y < 12) break; }
  await sleep(3000);

  const r = await p.evaluate(() => {
    const L = window.WORLD_LAYOUT || {};
    const oc = (L.biomes || []).find((x) => x.id === 'ocean');
    const O = window.__worldOcean;
    let s1 = null, by1 = null;
    window.__w3dDebug.scene.traverse((o) => {
      if (o.name === 'ocean-water' && o.material && o.material.uniforms) s1 = o.material.uniforms.t.value;
      if (o.name === 'ocean-boat-ocean-skiff') by1 = o.position.y;
    });
    return {
      hasOceanBiome: !!oc, dock: oc && oc.dock,
      atCove: L.biomeAt(-295, 290) && L.biomeAt(-295, 290).id,
      atPlaza: L.biomeAt(0, 0) && L.biomeAt(0, 0).id,
      atNexus: L.biomeAt(-130, 225) && L.biomeAt(-130, 225).id,
      worldOcean: !!O, boats: O ? O.boatCount() : 0,
      uniformT: s1, skiffY: by1,
      player: window._playerPos ? [Math.round(window._playerPos.x), Math.round(window._playerPos.z)] : null,
      quality: window.__quality || null,
    };
  });
  await sleep(3000);
  const r2 = await p.evaluate(() => {
    let s2 = null, by2 = null;
    window.__w3dDebug.scene.traverse((o) => {
      if (o.name === 'ocean-water' && o.material && o.material.uniforms) s2 = o.material.uniforms.t.value;
      if (o.name === 'ocean-boat-ocean-skiff') by2 = o.position.y;
    });
    return { uniformT: s2, skiffY: by2 };
  });
  console.log(JSON.stringify({ ...r, clockAdvancing: r2.uniformT > r.uniformT, skiffBobbing: Math.abs(r2.skiffY - r.skiffY) > 1e-4 }, null, 1));
  console.log('ERR:', errs.slice(0, 10).join('\n') || 'none');

  // screenshot: freeze the camera's set(), park it over the cove
  await p.evaluate(() => {
    const c = window.__w3dDebug.camera;
    c.position.set = function () { return c.position; };   // loop keeps calling set(player...) — neutralize
    c.position.x = -170; c.position.y = 42; c.position.z = 420;
    c.lookAt(-295, 0, 290);
  });
  await sleep(2500);
  await p.screenshot({ path: 'C:/Users/Brittany/Shaddai-3d/fal-assets/spike/ocean-step2.png' });
  console.log('shot: fal-assets/spike/ocean-step2.png');
  await b.close();
  process.exit(0);
})().catch((e) => { console.log('FAIL', String(e).slice(0, 400)); process.exit(1); });
