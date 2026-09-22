// node tools/probe-actions.cjs 8790 -> hoverboard + sparks chip verify
const puppeteer = require('puppeteer');
const port = process.argv[2] || 8790;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({ headless: 'new', args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'] });
  const p = await b.newPage();
  await p.setViewport({ width: 1280, height: 800 });
  const errs = [];
  p.on('pageerror', (e) => errs.push('PAGEERR ' + String(e.message).slice(0, 120)));
  p.on('console', (m) => { const t = m.text(); if (m.type() === 'error' && !/favicon|WebSocket|net::|Failed to load resource|404/i.test(t)) errs.push(t.slice(0, 120)); });
  await p.goto(`http://localhost:${port}/SHADDAI-WORLD-3D.html?peek=1`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  for (let i = 0; i < 45; i++) { await sleep(2000); if (await p.evaluate(() => window.__worldBuilt === true).catch(() => false)) break; }
  await sleep(9000); // GLB board loads
  const r = await p.evaluate(() => {
    let boards = 0;
    window.__w3dDebug.scene.traverse((o) => { if (o.name === 'hoverboard') boards++; });
    const chipText = [...document.querySelectorAll('div')].map((d) => d.textContent).find((t) => /SPARKS/.test(t) && t.length < 20) || null;
    return { boards, chip: chipText, built: window.__worldBuilt };
  });
  console.log(JSON.stringify(r));
  console.log('ERR:', errs.slice(0, 6).join(' | ') || 'none');
  await b.close();
  process.exit(0);
})().catch((e) => { console.log('FAIL', String(e).slice(0, 200)); process.exit(1); });
