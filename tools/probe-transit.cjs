// node tools/probe-transit.cjs 8790 -> maglev builds (stations, trains, pylon colliders) + a real ride: E at a pad → pick → arrive
const puppeteer = require('puppeteer');
const port = process.argv[2] || 8790;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({ headless: 'new', protocolTimeout: 240000, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage(); await p.setViewport({ width: 1000, height: 620 });
  const errs = []; p.on('pageerror', (e) => errs.push('PAGEERR ' + String(e.message).slice(0, 160)));
  await p.goto(`http://localhost:${port}/SHADDAI-WORLD-3D.html?peek=1`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  for (let i = 0; i < 90; i++) { await sleep(2000); if (await p.evaluate(() => window.__worldBuilt === true && !!window.__worldTransit).catch(() => false)) break; }
  await p.evaluate(() => { const btn = document.querySelector('#spawnPicker .sp-btn.sp-default') || document.querySelector('#spawnPicker .sp-btn'); if (btn) btn.click(); });
  await sleep(4000);
  console.log("spawn busy (headless SwiftShader is slow; ride is driven manually below):", await p.evaluate(() => window.__spawnBusy));
  const info = await p.evaluate(() => { const T = window.__worldTransit; return { stations: T.stations.map((s) => s.name), deckY: Math.round(T.deckY), pylons: window.WORLD_LAYOUT.realmColliders.filter((c) => c.label === 'maglev-pylon').length }; });
  console.log(JSON.stringify(info));
  const from = await p.evaluate(() => { const T = window.__worldTransit, s = T.stations.find((x) => x.id === 'harbor'), P = window.__w3dDebug.playerPos; P.x = s.x; P.z = s.z; return [Math.round(s.x), Math.round(s.z)]; });
  await sleep(600);
  await p.keyboard.press('KeyE'); await sleep(800);
  const menu = await p.evaluate(() => [...document.querySelectorAll('button[data-to]')].map((b) => b.getAttribute('data-to')));
  console.log('at Harbor Line', JSON.stringify(from), '→ menu offers', menu.length, 'destinations');
  await p.evaluate(() => { const b = document.querySelector('button[data-to="forge"]'); if (b) b.click(); });
  const mid = await p.evaluate(() => { const T = window.__worldTransit; const out = []; for (let i = 0; i < 400 && T.status(); i++) { T.update(i * 0.05, 0.05); if (i === 60) out.push(JSON.stringify({ s: T.status(), cam: !!window.__probeCam })); } out.push('done=' + !T.status()); return out; });
  console.log('  mid-ride', mid.join(' '));
  await sleep(3000);   // let the host run a few frames: does anything drag the player back?
  const to = await p.evaluate(() => { const P = window.__w3dDebug.playerPos, s = window.__worldTransit.stations.find((x) => x.id === 'forge'); return { player: [Math.round(P.x), Math.round(P.z)], forgePad: [Math.round(s.x), Math.round(s.z)], camFree: !window.__probeCam }; });
  console.log('after ride:', JSON.stringify(to), Math.hypot(to.player[0] - to.forgePad[0], to.player[1] - to.forgePad[1]) < 5 ? 'ARRIVED ✓' : 'NOT ARRIVED ✗');
  console.log('ERR:', errs.slice(0, 6).join(' | ') || 'none');
  await b.close();
})().catch((e) => { console.log('FAIL', String(e).slice(0, 300)); process.exit(1); });
