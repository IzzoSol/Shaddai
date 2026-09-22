// node tools/probe-seats.cjs 8790  -> logs each mount's bbox + current seatV so seatY can be tuned numerically
const puppeteer = require('puppeteer');
const port = process.argv[2] || 8790, hero = process.argv[3] || 'zerox';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({ headless: 'new', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage(); await p.setViewport({ width: 900, height: 600 });
  p.on('pageerror', (e) => console.log('PAGEERR', e.message.slice(0, 160)));
  await p.goto(`http://localhost:${port}/world3d.html`, { waitUntil: 'domcontentloaded' });
  for (let i = 0; i < 150; i++) { await sleep(2000); if (await p.evaluate(() => !!(window.__w && window.__w.mounts.length >= 6)).catch(() => false)) break; }
  const names = ['CANOPY GORILLA', 'SKY HAWK', 'HOVER POD', 'HOVER POD II'];
  for (const name of names) {
    const r = await p.evaluate((name) => {
      const w = window.__w, m = w.mounts.find((x) => x.name === name); if (!m) return { name, miss: true };
      const b = new w.THREE.Box3().setFromObject(m.grp);
      return { name, hTop: +b.max.y.toFixed(2), hBot: +b.min.y.toFixed(2), h: +(b.max.y - b.min.y).toFixed(2),
        seatY: +m.seatV.y.toFixed(2), seatYfrac: +(m.seatV.y / Math.max(1e-6, b.max.y)).toFixed(3),
        rootY: +m.seatV.y.toFixed(2) };
    }, name);
    console.log(JSON.stringify(r));
  }
  await b.close();
})().catch((e) => { console.log('FAIL', e.message.slice(0, 300)); process.exit(1); });