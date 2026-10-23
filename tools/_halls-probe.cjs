/* tools/_halls-probe.cjs — the seven council HALL interiors as they look today (2026-10-23, owner: "these are the inside of the shaddai
 * city buildings ... needs to be fixed"). One boot, then for each hall: window.__interiorsEnter(code), wait, screenshot from the entry
 * and a wide angle => C:/Users/Brittany/eye/hall-<code>-a.png / -b.png. Read-only.   node tools/_halls-probe.cjs  (server 3013; >= 700 MB) */
const puppeteer = require('puppeteer'), os = require('os'), sleep = ms => new Promise(r => setTimeout(r, ms));
const CODES = (process.argv[2] || 'SHADDAI,NEXUS,ZEROX,ORACLE,TURTLE,QUILL,PIKADON').split(',');
(async () => {
  if (os.freemem() / 1048576 < 700) { console.log('refused: low RAM'); process.exit(3); }
  const b = await puppeteer.launch({ headless: 'new', protocolTimeout: 900000, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage(); await p.setViewport({ width: 960, height: 560 }); const errs = new Map();
  p.on('console', m => { const t = m.text(); if (/perf-guard|cloneSkinned/.test(t)) console.log('CONSOLE', t.slice(0, 300)); }); p.on('pageerror', e => { const k = (e.stack || e.message).split('\n').slice(0, 2).join(' | ').slice(0, 200); errs.set(k, (errs.get(k) || 0) + 1); });
  await p.goto('http://localhost:3013/SHADDAI-WORLD-3D.html?colointro=0', { waitUntil: 'domcontentloaded', timeout: 90000 });
  for (let i = 0; i < 150; i++) { await sleep(2000); if (await p.evaluate(() => !!window.__loadPlayable).catch(() => false)) break; }
  await sleep(8000);
  await p.evaluate(() => { const els = [...document.querySelectorAll('*')].filter(e => e.children.length < 4 && /Source Temple/i.test(e.textContent || '') && e.offsetParent); const t = els.sort((a, c) => (a.textContent || '').length - (c.textContent || '').length)[0]; if (t) (t.closest('button,[class*=portal],[class*=card],[onclick]') || t).click(); });
  for (let i = 0; i < 60 && !(await p.evaluate(() => window.__spawnBusy === false).catch(() => false)); i++) await sleep(3000);
  await sleep(15000);
  for (const code of CODES) {
    const ok = await p.evaluate((c) => { try { if (!window.__interiorsEnter) return 'no enter api'; window.__interiorsEnter(c); return 'ok'; } catch (e) { return 'err ' + e.message; } }, code);
    await sleep(12000);
    console.log('HALL', code, ok, JSON.stringify(await p.evaluate(() => { const q = window.__w3dDebug.playerPos; return [q.x | 0, q.y | 0, q.z | 0]; })));
    await p.screenshot({ path: 'C:/Users/Brittany/eye/hall-' + code + '-a.png' });
    await p.evaluate(() => { const D = window.__w3dDebug, q = D.playerPos, U = 7 / 1.8, r0 = D.renderer.render.bind(D.renderer);
      D.renderer.render = (s, c) => { c.position.set(q.x + 12 * U, q.y + 9 * U, q.z + 14 * U); c.lookAt(q.x, q.y + 3 * U, q.z - 20 * U); c.updateMatrixWorld(true); r0(s, c); }; window.__unl = () => { D.renderer.render = r0; }; });
    await sleep(4000); await p.screenshot({ path: 'C:/Users/Brittany/eye/hall-' + code + '-b.png' }); await p.evaluate(() => window.__unl && window.__unl());
    await p.evaluate(() => { try { if (window.__interiorsExit) window.__interiorsExit(); else document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' })); } catch (e) { } });
    await sleep(5000);
  }
  console.log('ERRORS', errs.size); for (const [k, n] of errs) console.log('x' + n, k);
  await b.close();
})().catch(e => { console.error('halls probe failed', e.message); process.exit(1); });
