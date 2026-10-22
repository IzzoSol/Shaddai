/* tools/_realm-preview-shot.cjs — screenshot public/__realm-preview.html for realms (headless, light: one realm at a time, no world boot).
 *   node tools/_realm-preview-shot.cjs grid forest volcano     (python -m http.server 3013 --directory public) => C:/Users/Brittany/eye/realm-<id>-<view>.png
 * Two views per realm: overview (the whole station town) and close (the town street). Prints the page's info line + console errors. */
const puppeteer = require('puppeteer'), fs = require('fs'), os = require('os'), sleep = ms => new Promise(r => setTimeout(r, ms));
const OUT = 'C:/Users/Brittany/eye'; fs.mkdirSync(OUT, { recursive: true });
(async () => {
  if (os.freemem() / 1048576 < 700) { console.log('refused: low RAM'); process.exit(3); }
  const realms = process.argv.slice(2).length ? process.argv.slice(2) : ['grid'];
  const b = await puppeteer.launch({ headless: 'new', executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage(); await p.setViewport({ width: 1100, height: 700 }); const errs = [];
  p.on('pageerror', e => errs.push(e.message.slice(0, 160))); p.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.text().slice(0, 160)); });
  // views in station-local metres: [target x, z, camera x, height, z]  (+z = toward the city / the town street)
  const VIEWS = { behind: [0, -70, 0, 70, -190], street: [0, 110, 45, 28, 60], district: [120, 95, 30, 60, 30] };
  for (const r of realms) {
    await p.goto('http://localhost:3013/__realm-preview.html?realm=' + r, { waitUntil: 'domcontentloaded', timeout: 60000 });
    for (let i = 0; i < 80; i++) { await sleep(1500); if (await p.evaluate(() => window.__preview && window.__preview.ready()).catch(() => false)) break; }
    await sleep(5000);
    console.log(await p.evaluate(() => document.getElementById('info').textContent));
    for (const [name, v] of Object.entries(VIEWS)) {
      await p.evaluate((v) => { const P = window.__preview, M = P.PM; P.controls.target.set(v[0] * M, 4 * M, v[1] * M); P.camera.position.set(v[2] * M, v[3] * M, v[4] * M); P.controls.update(); }, v);
      await sleep(2500); await p.screenshot({ path: OUT + '/realm-' + r + '-' + name + '.png' });
    }
  }
  console.log('ERRS', JSON.stringify(errs.slice(0, 8)));
  await b.close();
})().catch(e => { console.error('shot failed', e.message); process.exit(1); });
