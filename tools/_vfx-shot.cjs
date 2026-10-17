/* tools/_vfx-shot.cjs - VFX lab review (public/vfx-lab.html; light, no world). Static server first (cd public && python -m http.server 3013).
 *   node tools/_vfx-shot.cjs [label]   -> C:/Users/Brittany/eye/vfx-<label>-{a,b}.png + JSON (stats, shader errors). Refuses below 500 MB free. */
const puppeteer = require('puppeteer'), os = require('os'), sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const free = Math.round(os.freemem() / 1048576); if (free < +(process.env.LAB_MIN_MB || 500)) { console.log(JSON.stringify({ refused: true, free_mb: free })); process.exit(3); }
  const label = process.argv[2] || 'v1', errs = [];
  const b = await puppeteer.launch({ headless: 'new', protocolTimeout: 300000, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage(); await p.setViewport({ width: 900, height: 520 });
  p.on('pageerror', e => errs.push('page: ' + String(e.message).slice(0, 300)));
  p.on('console', m => { const t = m.text(); if (m.type() === 'error' || /shader|program|GLSL|ERROR:/i.test(t)) errs.push(t.slice(0, 600)); });
  await p.goto('http://localhost:3013/vfx-lab.html?loop=1' + (process.env.VFX_QS || ''), { waitUntil: 'load', timeout: 60000 });
  await sleep(2500); await p.screenshot({ path: `C:/Users/Brittany/eye/vfx-${label}-a.png` });
  await sleep(3000); await p.screenshot({ path: `C:/Users/Brittany/eye/vfx-${label}-b.png` });
  const st = await p.evaluate(() => window.__lab ? window.__lab.stats() : null).catch(e => ({ err: e.message }));
  console.log(JSON.stringify({ stats: st, errs: errs.slice(0, 8) }, null, 1));
  await b.close(); process.exit(errs.length ? 1 : 0);
})().catch(e => { console.log(JSON.stringify({ crash: String(e.message).slice(0, 200) })); process.exit(2); });

