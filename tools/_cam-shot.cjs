/* tools/_cam-shot.cjs — screenshots from fixed cameras in the real world (static server :3013).
 *   node tools/_cam-shot.cjs <outDir> name:px,py,pz,tx,ty,tz [name:...]     (world units)
 * Enters the world through the Source Temple portal, then locks the render camera per view (park-shot technique). Also writes spawn.png (as the player lands). */
const puppeteer = require('puppeteer'), os = require('os'), path = require('path'), sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  if (os.freemem() / 1048576 < 1000) { console.log('refused: low RAM'); process.exit(3); }
  const [dir, ...specs] = process.argv.slice(2), errs = [];
  const b = await puppeteer.launch({ headless: 'new', protocolTimeout: 900000, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--js-flags=--max-old-space-size=900'] });
  const p = await b.newPage(); await p.setViewport({ width: 1000, height: 600 }); p.on('pageerror', e => errs.push(e.message.slice(0, 140)));
  await p.goto('http://localhost:3013/SHADDAI-WORLD-3D.html?time=0.5', { waitUntil: 'domcontentloaded', timeout: 120000 });
  for (let i = 0; i < 150; i++) { await sleep(2000); if (await p.evaluate(() => !!window.__loadPlayable).catch(() => false)) break; }
  await p.evaluate(() => { const els = [...document.querySelectorAll('*')].filter(e => e.children.length < 4 && /Source Temple/i.test(e.textContent || '') && e.offsetParent); const t = els.sort((a, c) => (a.textContent || '').length - (c.textContent || '').length)[0]; if (t) (t.closest('button,[class*=portal],[class*=card],[onclick]') || t).click(); });
  await sleep(25000); await p.screenshot({ path: path.join(dir, 'spawn.png') });
  await p.evaluate(() => { const D = window.__w3dDebug; const r0 = D.renderer.render.bind(D.renderer); window.__camLock = {}; D.renderer.render = (s, c) => { const L = window.__camLock; if (L.on) { c.position.set(L.v[0], L.v[1], L.v[2]); c.lookAt(L.v[3], L.v[4], L.v[5]); c.updateMatrixWorld(true); } r0(s, c); }; });
  for (const s of specs) { const [n, v] = s.split(':'); await p.evaluate(v => { window.__camLock.on = true; window.__camLock.v = v; }, v.split(',').map(Number)); await sleep(8000); await p.screenshot({ path: path.join(dir, n + '.png') }); }
  console.log('done', JSON.stringify(errs.slice(0, 3))); await b.close();
})().catch(e => { console.log('crash', e.message); process.exit(2); });
