// node tools/probe-colosseum.cjs 8790 outPrefix -> enter the real-size colosseum through the door system, shoot every broadcast cam + field modes
const puppeteer = require('puppeteer');
const port = process.argv[2] || 8790, out = process.argv[3];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({ headless: 'new', protocolTimeout: 240000, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage(); await p.setViewport({ width: 1100, height: 650 });
  const errs = []; p.on('pageerror', (e) => errs.push('PAGEERR ' + String(e.message).slice(0, 160)));
  await p.goto(`http://localhost:${port}/SHADDAI-WORLD-3D.html?peek=1`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  for (let i = 0; i < 60; i++) { await sleep(2000); if (await p.evaluate(() => !!(window.__w3dDebug && window.__w3dDebug.interiors)).catch(() => false)) break; }
  await p.evaluate(() => { const btn = document.querySelector('#spawnPicker .sp-btn.sp-default') || document.querySelector('#spawnPicker .sp-btn'); if (btn) btn.click(); });
  await sleep(5000);
  await p.evaluate(() => window.__w3dDebug.interiors.enter('COLOSSEUM'));
  for (let i = 0; i < 20; i++) { await sleep(1000); if (await p.evaluate(() => window.__colosseumArena && window.__colosseumArena.group.visible)) break; }
  const info = await p.evaluate(() => { const a = window.__colosseumArena; return a ? { built: true, visible: a.group.visible, inside: window.__w3dDebug.interiors.isInside(), dims: a.dims, themes: a.themes } : { built: false }; });
  console.log(JSON.stringify(info));
  await p.addStyleTag({ content: 'body > *:not(canvas):not(script){visibility:hidden !important} canvas{visibility:visible !important}' });
  const shots = [[0, 'classic', 'sand'], [2, 'classic', 'soccer'], [1, 'royal', 'tactics'], [3, 'night', 'party'], [4, 'classic', 'sand']];
  for (const [cam, theme, field] of shots) {
    await p.evaluate((c, t, f) => { const a = window.__colosseumArena; a.setTheme(t); a.setField(f); a.spectate(c); }, cam, theme, field);
    await sleep(1800); await p.screenshot({ path: `${out}-${cam}-${theme}-${field}.png` });
  }
  console.log('ERR:', errs.slice(0, 6).join(' | ') || 'none');
  await b.close();
})().catch((e) => { console.log('FAIL', String(e).slice(0, 300)); process.exit(1); });
