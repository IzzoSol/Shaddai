// node tools/probe-nature.cjs 8790 [outPrefix] -> CC0 nature scatter: counts + forest/meadow/darkforest shots
const puppeteer = require('puppeteer');
const port = process.argv[2] || 8790, out = process.argv[3];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({ headless: 'new', protocolTimeout: 240000, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage(); await p.setViewport({ width: 1280, height: 800 });
  const errs = []; p.on('pageerror', (e) => errs.push('PAGEERR ' + String(e.message).slice(0, 150)));
  await p.goto(`http://localhost:${port}/SHADDAI-WORLD-3D.html?peek=1`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  for (let i = 0; i < 60; i++) { await sleep(2000); const s = await p.evaluate(() => window.__worldNature && window.__worldNature.stats()).catch(() => null); if (s && s.instances >= s.planned && s.planned > 0) break; }
  console.log(JSON.stringify(await p.evaluate(() => window.__worldNature.stats())));
  if (out) {
    await p.evaluate(() => { const btn = document.querySelector('#spawnPicker .sp-btn.sp-default') || document.querySelector('#spawnPicker .sp-btn'); if (btn) btn.click(); });
    await sleep(6000);
    await p.addStyleTag({ content: 'body > *:not(canvas):not(script){visibility:hidden !important} canvas{visibility:visible !important}' });
    for (const [n, pos, look] of [['forest', [130, 45, 60], [215, 10, 150]], ['meadow', [320, 40, 330], [400, 5, 400]], ['darkforest', [-330, 60, -300], [-420, 10, -380]]]) {
      await p.evaluate((a, l) => { window.__probeCam = { pos: a, look: l }; }, pos, look); await sleep(1800); await p.screenshot({ path: `${out}-${n}.png` });
    }
  }
  console.log('ERR:', errs.slice(0, 6).join(' | ') || 'none');
  await b.close();
})().catch((e) => { console.log('FAIL', String(e).slice(0, 250)); process.exit(1); });
