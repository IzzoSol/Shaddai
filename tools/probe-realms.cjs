// node tools/probe-realms.cjs 8790 -> every realm model: loaded, grounded (base vs terrain), real size (m)
const puppeteer = require('puppeteer');
const port = process.argv[2] || 8790;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({ headless: 'new', protocolTimeout: 240000, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage(); await p.setViewport({ width: 900, height: 600 });
  const errs = []; p.on('pageerror', (e) => errs.push('PAGEERR ' + String(e.message).slice(0, 160)));
  await p.goto(`http://localhost:${port}/SHADDAI-WORLD-3D.html?peek=1`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  for (let i = 0; i < 90; i++) { await sleep(2000); if (await p.evaluate(() => window.__worldBuilt === true).catch(() => false)) break; }
  for (let i = 0; i < 40; i++) { await sleep(3000); const n = await p.evaluate(() => Object.keys(window.__placeables || {}).filter((k) => k.startsWith('realm:')).length); if (n >= 28) break; }
  const r = await p.evaluate(() => {
    const T = window.__w3dDebug.terrain, PM = 7 / 1.8, reg = window.__placeables, out = [];
    Object.keys(reg).filter((k) => k.startsWith('realm:')).sort().forEach((k) => {
      const o = reg[k].obj; o.updateMatrixWorld(true);
      let mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
      o.traverse((c) => { if (!c.isMesh || !c.geometry) return; c.geometry.computeBoundingBox(); const bb = c.geometry.boundingBox, e = c.matrixWorld.elements;
        for (const x of [bb.min.x, bb.max.x]) for (const y of [bb.min.y, bb.max.y]) for (const z of [bb.min.z, bb.max.z]) { const w = [e[0] * x + e[4] * y + e[8] * z + e[12], e[1] * x + e[5] * y + e[9] * z + e[13], e[2] * x + e[6] * y + e[10] * z + e[14]]; for (let i = 0; i < 3; i++) { mn[i] = Math.min(mn[i], w[i]); mx[i] = Math.max(mx[i], w[i]); } } });
      const cx = (mn[0] + mx[0]) / 2, cz = (mn[2] + mx[2]) / 2, g = T.heightAt(cx, cz);
      out.push(k.padEnd(40) + ' base-ground ' + (mn[1] - g).toFixed(1).padStart(6) + 'u  width ' + ((Math.max(mx[0] - mn[0], mx[2] - mn[2])) / PM).toFixed(0).padStart(4) + 'm  height ' + ((mx[1] - mn[1]) / PM).toFixed(0).padStart(4) + 'm');
    });
    return out;
  });
  console.log(r.join('\n')); console.log('ERR:', errs.slice(0, 6).join(' | ') || 'none');
  await b.close();
})().catch((e) => { console.log('FAIL', String(e).slice(0, 300)); process.exit(1); });
