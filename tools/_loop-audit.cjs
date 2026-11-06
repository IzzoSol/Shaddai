/* tools/_loop-audit.cjs — the finalization LOOP audit (2026-10-23): one boot, then
 *   PERF   draw calls / triangles at spawn with the perf guard ON vs OFF (world-perf-guard.js), guard stats + bad skins
 *   BAZAAR ride the centre lift down (WorldUndergroundBazaar.use), screenshot the cavern, ride the Undersea Line out
 *   PORTAL screenshot of the Skyward Portal over the Sky Nexus deck
 *   ERRORS every runtime error (stack head)
 * Screens => C:/Users/Brittany/eye/loop-*.png      node tools/_loop-audit.cjs   (server 3013; >= 700 MB free RAM) */
const puppeteer = require('puppeteer'), os = require('os'), sleep = ms => new Promise(r => setTimeout(r, ms));
const OUT = 'C:/Users/Brittany/eye';
(async () => {
  if (os.freemem() / 1048576 < 520) { console.log('refused: low RAM'); process.exit(3); }
  const b = await puppeteer.launch({ headless: 'new', protocolTimeout: 900000, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage(); await p.setViewport({ width: 900, height: 560 }); const errs = new Map();
  p.on('pageerror', e => { const k = (e.stack || e.message).split('\n').slice(0, 3).join(' | ').slice(0, 300); errs.set(k, (errs.get(k) || 0) + 1); });
  p.on('console', m => { const t = m.text(); if (/perf-guard|\[bazaar\]|\[levels\]|\[edge-realms\]/.test(t)) console.log('CONSOLE', t.slice(0, 220)); });
  await p.goto('http://localhost:3013/SHADDAI-WORLD-3D.html', { waitUntil: 'domcontentloaded', timeout: 90000 });
  for (let i = 0; i < 150; i++) { await sleep(2000); if (await p.evaluate(() => !!window.__loadPlayable).catch(() => false)) break; }
  await sleep(8000);
  await p.evaluate(() => { const els = [...document.querySelectorAll('*')].filter(e => e.children.length < 4 && /Source Temple/i.test(e.textContent || '') && e.offsetParent); const t = els.sort((a, c) => (a.textContent || '').length - (c.textContent || '').length)[0]; if (t) (t.closest('button,[class*=portal],[class*=card],[onclick]') || t).click(); });
  for (let i = 0; i < 60 && !(await p.evaluate(() => window.__spawnBusy === false).catch(() => false)); i++) await sleep(3000);
  await sleep(25000);
  const calls = () => p.evaluate(() => new Promise(res => { const R = window.__w3dDebug.renderer; requestAnimationFrame(() => { R.info.autoReset = false; R.info.reset(); requestAnimationFrame(() => { const o = { calls: R.info.render.calls, tris: R.info.render.triangles }; R.info.autoReset = true; res(o); }); }); }));
  await p.evaluate(() => window.__perfGuard && window.__perfGuard.enable(false)); await sleep(1500); const off = await calls();
  await p.evaluate(() => window.__perfGuard && window.__perfGuard.enable(true)); await sleep(1500); const on = await calls();
  console.log('PERF spawn guardOFF', JSON.stringify(off), 'guardON', JSON.stringify(on), 'stats', JSON.stringify(await p.evaluate(() => window.__perfGuard && window.__perfGuard.stats())));
  await p.screenshot({ path: OUT + '/loop-spawn.png' });
  console.log('TICK', JSON.stringify(await p.evaluate(() => ({ tickErr: window.__tickErr || null, guardType: typeof window.WorldPerfGuard, guard: window.__perfGuard === undefined ? 'undefined' : !!window.__perfGuard }))));
  await p.evaluate(() => { const B = window.__bazaar, D = window.__w3dDebug, U = 7 / 1.8; if (!B) return; const P = B.pad.position, cx = P.x - 58 * U, cz = P.z; D.playerPos.set(cx + 90 * U, P.y, cz + 60 * U); const r0 = D.renderer.render.bind(D.renderer);
    D.renderer.render = (s, c) => { c.position.set(cx + 110 * U, P.y + 70 * U, cz + 110 * U); c.lookAt(cx, P.y, cz); c.updateMatrixWorld(true); r0(s, c); }; window.__unlockCam0 = () => { D.renderer.render = r0; }; });
  await sleep(6000); await p.screenshot({ path: OUT + '/loop-grid-tip.png' });
  await p.evaluate(() => { const B = window.__bazaar, D = window.__w3dDebug, U = 7 / 1.8, P = B.pad.position, cx = P.x - 58 * U, cz = P.z, r0 = D.renderer.render.bind(D.renderer);
    D.renderer.render = (s, c) => { c.position.set(cx + 1, P.y + 650 * U, cz + 1); c.lookAt(cx, P.y, cz); c.updateMatrixWorld(true); r0(s, c); }; window.__unlockCam2 = () => { D.renderer.render = r0; }; });
  await sleep(6000); await p.screenshot({ path: OUT + '/loop-grid-top.png' }); await p.evaluate(() => window.__unlockCam2()); await p.evaluate(() => window.__unlockCam0 && window.__unlockCam0());
  // BAZAAR
  const bz = await p.evaluate(() => { const B = window.__bazaar; if (!B) return 'no bazaar'; const D = window.__w3dDebug, P = B.pad.position; D.playerPos.set(P.x + 2, P.y + 0.5, P.z + 2); return JSON.stringify(B.stats()); });
  console.log('BAZAAR', bz); await sleep(1500);
  console.log('BAZAAR use-down', await p.evaluate(() => window.__bazaar ? window.__bazaar.use() : false)); await sleep(5000);
  console.log('BAZAAR inside', await p.evaluate(() => window.__bazaar && window.__bazaar.isInside()), 'player', await p.evaluate(() => { const q = window.__w3dDebug.playerPos; return [q.x | 0, q.y | 0, q.z | 0]; }));
  await sleep(4000);
  await p.evaluate(() => { const B = window.__bazaar, D = window.__w3dDebug, U = 7 / 1.8, q = D.playerPos, r0 = D.renderer.render.bind(D.renderer), cx = B.pad.position.x - 58 * U, cz = B.pad.position.z;
    D.renderer.render = (s, c) => { c.position.set(q.x - 6 * U, q.y + 6 * U, q.z - 40 * U); c.lookAt(cx, q.y + 55 * U, cz); c.updateMatrixWorld(true); r0(s, c); }; window.__unlockCam1 = () => { D.renderer.render = r0; }; });
  await sleep(5000); await p.screenshot({ path: OUT + '/loop-bazaar-arrive.png' }); await p.evaluate(() => window.__unlockCam1());
  await p.evaluate(() => { const D = window.__w3dDebug, r0 = D.renderer.render.bind(D.renderer), B = window.__bazaar, P = B.pad.position, U = 7 / 1.8, Y = D.playerPos.y;
    D.renderer.render = (s, c) => { c.position.set(P.x + 260 * U, Y + 60 * U, P.z + 120 * U); c.lookAt(P.x, Y + 50 * U, P.z); c.updateMatrixWorld(true); r0(s, c); }; window.__unlockCam = () => { D.renderer.render = r0; }; });
  await sleep(5000); await p.screenshot({ path: OUT + '/loop-bazaar-wide.png' }); await p.evaluate(() => window.__unlockCam());
  console.log('PERF bazaar', JSON.stringify(await calls()));
  // walk to the undersea line and ride
  console.log('UNDERSEA', await p.evaluate(() => { const B = window.__bazaar, D = window.__w3dDebug; const h = B.group.getObjectByName('hook_line_undersea'); if (!h) return 'no hook'; const v = new (D.THREE.Vector3)(); h.getWorldPosition(v); D.playerPos.set(v.x, v.y, v.z); return B.use(); }));
  await sleep(6000); console.log('UNDERSEA after inside', await p.evaluate(() => window.__bazaar.isInside()), await p.evaluate(() => { const q = window.__w3dDebug.playerPos; return [q.x | 0, q.y | 0, q.z | 0]; }));
  await p.screenshot({ path: OUT + '/loop-undersea-arrive.png' });
  // PORTAL
  await p.evaluate(() => { const E = window.__edgeRealms, D = window.__w3dDebug, U = 7 / 1.8; const h = E && E.heads.find(x => x.id === 'portal'); if (!h) return; const r0 = D.renderer.render.bind(D.renderer);
    D.renderer.render = (s, c) => { c.position.set(h.x + 120 * U, h.y + 40 * U, h.z - 40 * U); c.lookAt(h.x, h.y + 30 * U, h.z + 45 * U); c.updateMatrixWorld(true); r0(s, c); }; });
  await sleep(6000); await p.screenshot({ path: OUT + '/loop-portal.png' });
  console.log('ERRORS', errs.size); for (const [k, n] of errs) console.log('x' + n, k);
  await b.close();
})().catch(e => { console.error('loop audit failed', e.message); process.exit(1); });
