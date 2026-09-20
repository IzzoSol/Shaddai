const puppeteer = require('puppeteer'); const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({ headless: 'new', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage(); await p.setViewport({ width: 700, height: 500 });
  p.on('pageerror', (e) => console.log('PAGEERR', e.message.slice(0, 200)));
  await p.goto('http://localhost:8790/world3d.html', { waitUntil: 'domcontentloaded' });
  for (let i = 0; i < 150; i++) { await sleep(2000); if (await p.evaluate(() => !!(window.__w && window.__w.mounts.length >= 1)).catch(() => false)) break; }
  await sleep(1500);
  const r = await p.evaluate(() => {
    const w = window.__w, m = w.mounts[0], P = w.player; P.root.position.set(m.grp.position.x + 3, 0, m.grp.position.z); w.mount(m); w.step(0.016); w.step(0.016);
    const wp = new w.THREE.Vector3(); P.root.getWorldPosition(wp); const hb = P.bones.Hips, hp = new w.THREE.Vector3(); hb.getWorldPosition(hp);
    const nan = Object.entries(P.bones).filter(([n, bn]) => bn && (isNaN(bn.quaternion.x) || isNaN(bn.position.x))).map(([n]) => n);
    return { seat: m.seatV.toArray().map((v) => +v.toFixed(2)), rootWorld: wp.toArray().map((v) => +v.toFixed(2)), hipsWorld: hp.toArray().map((v) => +v.toFixed(2)), grp: m.grp.position.toArray().map((v) => +v.toFixed(2)), hipsH: P.hipsH, visible: P.root.visible, nan, seat_pose: P.seat, scale: P.model.scale.x };
  });
  console.log(JSON.stringify(r));
  await p.evaluate(() => { const w = window.__w; w.state.cam.dist = 6.5; w.state.cam.pitch = 0.15; w.state.cam.yaw = 0.9; }); await sleep(1500); await p.screenshot({ path: 'fal-assets/spike/rider-probe.png' }); await b.close();
})().catch((e) => { console.log('FAIL', e.message.slice(0, 200)); process.exit(1); });
