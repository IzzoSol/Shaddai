// node tools/probe-mapv2.cjs 8790 [shotPrefix] -> MAP v2 boot: errors, build time, ridge/passes, plaza, model counts, editor registry
const puppeteer = require('puppeteer');
const port = process.argv[2] || 8790, out = process.argv[3];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({ headless: 'new', protocolTimeout: 240000, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage(); await p.setViewport({ width: 1100, height: 650 });
  const errs = [], logs = [];
  p.on('pageerror', (e) => errs.push('PAGEERR ' + String(e.message).slice(0, 160)));
  p.on('console', (m) => { const t = m.text(); if (/\[perf\] TOTAL|world built|REALM colliders/.test(t)) logs.push(t.slice(0, 120)); if (m.type() === 'error' && !/favicon|WebSocket|net::|Failed to load resource|404/i.test(t)) errs.push(t.slice(0, 140)); });
  const t0 = Date.now();
  await p.goto(`http://localhost:${port}/SHADDAI-WORLD-3D.html?peek=1&perf=1`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  for (let i = 0; i < 90; i++) { await sleep(2000); if (await p.evaluate(() => window.__worldBuilt === true).catch(() => false)) break; }
  const built = (Date.now() - t0) / 1000;
  await sleep(20000);   // let GLBs stream in
  const r = await p.evaluate(() => {
    const L = window.WORLD_LAYOUT, T = window.__w3dDebug.terrain, H = (x, z) => +T.heightAt(x, z).toFixed(1), M = L.mountains;
    const mid = (M.r0 + M.r1) / 2; let ridgeMax = 0; for (let a = -Math.PI; a < Math.PI; a += 0.01) ridgeMax = Math.max(ridgeMax, H(Math.cos(a) * mid, Math.sin(a) * mid));
    const passes = {}; L.biomes.filter((b) => Math.hypot(...b.center) > M.r1).forEach((b) => { const a = Math.atan2(b.center[1], b.center[0]); passes[b.id] = H(Math.cos(a) * mid, Math.sin(a) * mid); });
    const co = L.landmark('colosseum');
    const reg = window.__placeables || {}, bySrc = {}; Object.keys(reg).forEach((k) => { const s = k.split(':')[0]; bySrc[s] = (bySrc[s] || 0) + 1; });
    const fp = window.__worldFalProps && window.__worldFalProps.stats(), nat = window.__worldNature && window.__worldNature.stats();
    return { half: L.half, ridgeMax: +ridgeMax.toFixed(1), passes, colosseumPlaza: H(co.pos[0], co.pos[1]), realmPlazaHeights: L.biomes.filter((b) => b.id !== 'ocean').map((b) => b.id + ':' + H(b.center[0], b.center[1])).join(' '),
      placeables: bySrc, falprops: fp, nature: nat, routes: (window.WORLD_ROUTES || []).length, colliders: L.realmColliders.length };
  });
  console.log(JSON.stringify(r, null, 1));
  console.log('page built in', built.toFixed(1), 's ·', logs.join(' | '));
  if (out) {
    await p.evaluate(() => { const btn = document.querySelector('#spawnPicker .sp-btn.sp-default') || document.querySelector('#spawnPicker .sp-btn'); if (btn) btn.click(); });
    await sleep(6000);
    await p.addStyleTag({ content: 'body > *:not(canvas):not(script){visibility:hidden !important} canvas{visibility:visible !important}' });
    const L = await p.evaluate(() => ({ v: window.WORLD_LAYOUT.biomes.find((b) => b.id === 'volcano').center, d: window.WORLD_LAYOUT.biomes.find((b) => b.id === 'darkforest').center }));
    for (const [n, pos, look] of [['volcano', [L.v[0] - 520, 260, L.v[1] + 520], [L.v[0], 20, L.v[1]]], ['darkforest', [L.d[0] + 520, 240, L.d[1] + 520], [L.d[0], 20, L.d[1]]], ['overview', [0, 2600, 2600], [0, 0, 0]]]) {
      await p.evaluate((a, l) => { window.__probeCam = { pos: a, look: l }; const c = window.__w3dDebug.camera; if (c.far < 9000) { c.far = 9000; c.updateProjectionMatrix(); } }, pos, look);
      await sleep(2500); await p.screenshot({ path: `${out}-${n}.png` });
    }
  }
  console.log('ERR:', errs.slice(0, 8).join(' | ') || 'none');
  await b.close();
})().catch((e) => { console.log('FAIL', String(e).slice(0, 300)); process.exit(1); });
