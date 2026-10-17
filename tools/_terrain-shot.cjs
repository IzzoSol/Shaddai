/* tools/_terrain-shot.cjs — terrain-only A/B shots via public/terrain-v4-lab.html (light: no city, no world modules).
 *   node tools/_terrain-shot.cjs [label] [extraQuery]     e.g. new ""   |  old "&tsplat=0"
 * Saves C:/Users/Brittany/eye/terrain-<label>-<view>.png for each view below. Refuses below TERRAIN_MIN_MB free RAM (600). */
const puppeteer = require('puppeteer'), os = require('os'), sleep = ms => new Promise(r => setTimeout(r, ms));
const VIEWS = [   // [name, camX, camY(above ground), camZ, lookX, lookZ, lookY(above ground)]  world units (3.89 u = 1 m)
  ['ground', -6964, 25, 716, -9200, 300, 0],
  ['ridge', -6000, 900, 2500, -11000, -1500, 200],
  ['aerial', 9000, 5200, 9000, 2000, 2000, 0],
  ['far', -2000, 2600, -9000, -9000, -15000, 300],
];
(async () => {
  const need = +(process.env.TERRAIN_MIN_MB || 600), free = Math.round(os.freemem() / 1048576);
  if (free < need) { console.log(JSON.stringify({ refused: true, free_mb: free, need_mb: need })); process.exit(3); }
  const label = process.argv[2] || 'new', extra = process.argv[3] || '', errs = [];
  const b = await puppeteer.launch({ headless: 'new', protocolTimeout: 600000, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage(); await p.setViewport({ width: 900, height: 520 });
  p.on('pageerror', e => errs.push(String(e.message).slice(0, 200)));
  p.on('console', m => { const t = m.text(); if (m.type() === 'error' || /ERROR|shader/i.test(t)) errs.push(t.slice(0, 300)); });
  await p.goto('http://localhost:3013/terrain-v4-lab.html?set=real&noShadow' + extra, { waitUntil: 'domcontentloaded', timeout: 120000 });
  for (let i = 0; i < 120 && !(await p.evaluate(() => !!(window.__lab && window.__lab.api && window.__lab.api.ready)).catch(() => false)); i++) await sleep(1000);
  await p.evaluate(() => { const L = window.__lab, r0 = L.renderer.render.bind(L.renderer); L.renderer.render = (s, c) => { const V = window.__view; if (V) { c.position.set(V[0], V[1], V[2]); c.lookAt(V[3], V[4], V[5]); c.updateMatrixWorld(true); } r0(s, c); }; });
  for (const v of VIEWS) {
    await p.evaluate(v => { const H = window.__lab.api.heightAt; window.__view = [v[1], H(v[1], v[3]) + v[2], v[3], v[4], H(v[4], v[5]) + v[6], v[5]]; }, v);
    await sleep(9000);   // terrain LOD streams in for the new viewpoint
    await p.screenshot({ path: `C:/Users/Brittany/eye/terrain-${label}-${v[0]}.png` }); console.log('shot', v[0]);
  }
  console.log(JSON.stringify({ errs: errs.slice(0, 6) }));
  await b.close(); process.exit(errs.length ? 1 : 0);
})().catch(e => { console.log(JSON.stringify({ crash: String(e.message).slice(0, 200) })); process.exit(2); });
