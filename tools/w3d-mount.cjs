// node tools/w3d-mount.cjs [port] [hero]  -> spike shots of every mount with the rider seated, from front-3/4 and side
const puppeteer = require('puppeteer'); const sharp = require('sharp');
const port = process.argv[2] || 8790, hero = process.argv[3] || 'zerox';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({ headless: 'new', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage(); await p.setViewport({ width: 900, height: 600 });
  const errs = []; p.on('pageerror', (e) => errs.push('PAGEERR ' + e.message.slice(0, 200))); p.on('console', (m) => { if (m.type() === 'error' && !/WebSocket|404/.test(m.text())) errs.push(m.text().slice(0, 160)); });
  await p.goto(`http://localhost:${port}/world3d.html`, { waitUntil: 'domcontentloaded' });
  for (let i = 0; i < 150; i++) { await sleep(2000); if (await p.evaluate(() => !!(window.__w && window.__w.mounts.length >= 6)).catch(() => false)) break; }
  await p.evaluate((h) => { window.__w.spawnPlayer(h, new window.__w.THREE.Vector3(0, 0, 14)); }, hero);
  await sleep(2500);
  const names = await p.evaluate(() => window.__w.mounts.map((m) => m.name)); console.log('mounts:', names.join(' | '));
  const out = [];
  for (let i = 0; i < names.length; i++) {
    await p.evaluate((i) => { const w = window.__w, m = w.mounts[i]; if (w.player.seat) { w.state.keys = {}; } const wp = m.grp.position; w.player.root.position.set(wp.x + 3, 0, wp.z); w.mount(m); m.grp.rotation.y = m.yaw = 0; w.state.cam.dist = Math.max(7, m.len * 0.9 + 4); w.state.cam.pitch = 0.22; w.state.cam.yaw = 0.8; }, i);
    await sleep(1600);
    const f1 = await p.screenshot(); await p.evaluate(() => { window.__w.state.cam.yaw = 1.57; }); await sleep(1200); const f2 = await p.screenshot();
    out.push(await sharp(f1).resize(450, 300).toBuffer(), await sharp(f2).resize(450, 300).toBuffer());
    await p.evaluate(() => { const w = window.__w; w.dismount ? w.dismount(true) : 0; });
  }
  const rows = Math.ceil(out.length / 4);
  await sharp({ create: { width: 1800, height: rows * 300, channels: 3, background: '#000' } }).composite(out.map((bf, i) => ({ input: bf, left: (i % 4) * 450, top: Math.floor(i / 4) * 300 }))).png().toFile('fal-assets/spike/mount-sheet.png');
  console.log('ERR:', errs.slice(0, 6).join('\n') || 'none'); await b.close();
})().catch((e) => { console.log('FAIL', e.message.slice(0, 300)); process.exit(1); });
