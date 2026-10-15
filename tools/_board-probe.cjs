/* tools/_board-probe.cjs — hoverboard + Space black-screen repro.  node tools/_board-probe.cjs   (static server :3013)
 * Enters the world, presses O (board), holds Space, then reports player/camera positions each second and flags any NaN. */
const puppeteer = require('puppeteer'), os = require('os'), sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  if (os.freemem() / 1048576 < 1000) { console.log('refused: low RAM'); process.exit(3); }
  const errs = [], warns = [];
  const b = await puppeteer.launch({ headless: 'new', protocolTimeout: 900000, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--js-flags=--max-old-space-size=900'] });
  const p = await b.newPage(); await p.setViewport({ width: 480, height: 300 });
  p.on('pageerror', e => errs.push(e.message.slice(0, 160))); p.on('console', m => { const t = m.text(); if (/nan|NaN|error/i.test(t)) warns.push(t.slice(0, 160)); });
  await p.goto('http://localhost:3013/SHADDAI-WORLD-3D.html?time=0.5', { waitUntil: 'domcontentloaded', timeout: 120000 });
  for (let i = 0; i < 150; i++) { await sleep(2000); if (await p.evaluate(() => !!window.__loadPlayable).catch(() => false)) break; }
  await p.evaluate(() => { const els = [...document.querySelectorAll('*')].filter(e => e.children.length < 4 && /Source Temple/i.test(e.textContent || '') && e.offsetParent); const t = els.sort((a, c) => (a.textContent || '').length - (c.textContent || '').length)[0]; if (t) (t.closest('button,[class*=portal],[class*=card],[onclick]') || t).click(); });
  await sleep(20000);
  const snap = () => p.evaluate(() => { const D = window.__w3dDebug, c = D.camera.position, q = D.playerPos; return { p: [q.x, q.y, q.z].map(v => +(+v).toFixed(1)), cam: [c.x, c.y, c.z].map(v => +(+v).toFixed(1)) }; });
  const key = (code, type) => p.evaluate((c, t) => { const k = new KeyboardEvent(t, { code: c, key: c === 'Space' ? ' ' : c.slice(3).toLowerCase(), bubbles: true }); window.dispatchEvent(k); document.dispatchEvent(k); }, code, type);
  console.log('before', JSON.stringify(await snap()));
  await key('KeyO', 'keydown'); await sleep(300); await key('KeyO', 'keyup'); await sleep(4000);
  console.log('board', JSON.stringify(await snap()));
  await key('Space', 'keydown');
  for (let i = 0; i < 6; i++) { await sleep(1500); console.log('space+' + (i + 1), JSON.stringify(await snap())); }
  await key('Space', 'keyup'); await sleep(3000); console.log('after', JSON.stringify(await snap()));
  console.log('errs', JSON.stringify(errs.slice(0, 5)), 'warns', JSON.stringify(warns.slice(0, 5)));
  await b.close();
})().catch(e => { console.log('crash', e.message); process.exit(2); });
