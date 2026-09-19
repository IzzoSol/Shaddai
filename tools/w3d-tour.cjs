// Headless tour of every realm: node tools/w3d-tour.cjs  -> fal-assets/spike/tour-*.png + log lines
const puppeteer = require('puppeteer');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({ headless: 'new', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage(); await p.setViewport({ width: 1280, height: 720 });
  const errs = []; p.on('pageerror', (e) => errs.push('PAGEERR ' + e.message.slice(0, 200))); p.on('console', (m) => { const t = m.text(); if (m.type() === 'error' && !/WebSocket/.test(t)) errs.push('console: ' + t.slice(0, 160)); });
  const t0 = Date.now();
  await p.goto('http://localhost:3000/world3d.html', { waitUntil: 'domcontentloaded' });
  let ready = false;
  for (let i = 0; i < 200; i++) { await sleep(2000); ready = await p.evaluate(() => document.querySelector('#loading').hidden === true).catch(() => false); if (ready) break; if (i % 10 === 0) console.log('loading…', await p.evaluate(() => document.querySelector('#loadmsg').textContent).catch(() => '?')); }
  console.log('READY', ready, ((Date.now() - t0) / 1000).toFixed(0) + 's');
  const shot = async (name, ms = 2500) => { await sleep(ms); await p.screenshot({ path: `fal-assets/spike/tour-${name}.png` }); console.log('shot', name); };
  await shot('city', 3000);
  for (const [realm, yaw, dist, pitch] of [['ocean', 0.0, 20, 0.35], ['volcano', 0.0, 26, 0.3], ['castle', 0.3, 18, 0.3], ['desert', 0.4, 16, 0.3]]) {
    await p.evaluate((r, y, d, pt) => { const w = window.__w; w.state.cam.yaw = y; w.state.cam.dist = d; w.state.cam.pitch = pt; w.travelTo(r); }, realm, yaw, dist, pitch);
    await shot(realm, 3500);
  }
  // ocean: board the catamaran and sail
  await p.evaluate(() => { const w = window.__w; w.travelTo('ocean'); });
  await sleep(2500);
  const info = await p.evaluate(() => { const w = window.__w; const m = w.mounts.find((x) => x.boat); w.player.root.position.set(m.grp.position.x + 3, 0, m.grp.position.z); w.mount(m); w.state.cam.yaw = 2.6; w.state.cam.dist = 22; w.state.cam.pitch = 0.3; w.state.keys['w'] = true; return { name: m.name, seat: m.seat }; });
  console.log('boarded', JSON.stringify(info));
  await sleep(4500); await p.evaluate(() => { window.__w.state.keys['w'] = false; });
  await shot('boat', 500);
  console.log('ERRORS:', errs.slice(0, 10).join('\n') || 'none');
  await b.close();
})().catch((e) => { console.log('TOURFAIL', e.message.slice(0, 200)); process.exit(1); });
