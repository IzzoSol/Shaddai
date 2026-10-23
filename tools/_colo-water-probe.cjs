/* tools/_colo-water-probe.cjs — (1) Colosseum flow: enter -> lobby shot (no modal expected) -> walk to the inner doors -> mode screen shot
 * (2) mode pickers: Hover League + Naval open() shots  (3) water: ocean shoreline + Grid canal shots => C:/Users/Brittany/eye/cw-*.png */
const puppeteer = require('puppeteer'), os = require('os'), sleep = ms => new Promise(r => setTimeout(r, ms));
const SHOT = (p, n) => p.screenshot({ path: 'C:/Users/Brittany/eye/cw-' + n + '.png' });
(async () => {
  if (os.freemem() / 1048576 < 700) { console.log('refused: low RAM'); process.exit(3); }
  const b = await puppeteer.launch({ headless: 'new', protocolTimeout: 900000, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage(); await p.setViewport({ width: 960, height: 560 }); const errs = new Map();
  p.on('error', e => console.log('PAGE CRASH', e.message)); p.on('framenavigated', f => { if (f === p.mainFrame()) console.log('NAV', f.url().slice(0, 90)); }); p.on('pageerror', e => { const k = (e.stack || e.message).split('\n').slice(0, 2).join(' | ').slice(0, 200); errs.set(k, (errs.get(k) || 0) + 1); });
  await p.goto('http://localhost:3013/SHADDAI-WORLD-3D.html?colointro=0&bazaar=0&edgerealms=0', { waitUntil: 'domcontentloaded', timeout: 90000 });
  for (let i = 0; i < 150; i++) { await sleep(2000); if (await p.evaluate(() => !!window.__loadPlayable).catch(() => false)) break; }
  await sleep(8000);
  await p.evaluate(() => { const els = [...document.querySelectorAll('*')].filter(e => e.children.length < 4 && /Source Temple/i.test(e.textContent || '') && e.offsetParent); const t = els.sort((a, c) => (a.textContent || '').length - (c.textContent || '').length)[0]; if (t) (t.closest('button,[class*=portal],[class*=card],[onclick]') || t).click(); });
  for (let i = 0; i < 60 && !(await p.evaluate(() => window.__spawnBusy === false).catch(() => false)); i++) await sleep(3000);
  await sleep(12000);
  const modal = () => p.evaluate(() => { const m = [...document.querySelectorAll('div')].find(d => d.offsetParent && /SHADDAI COLOSSEUM/.test(d.textContent || '') && d.textContent.length < 2000); return m ? m.textContent.replace(/\s+/g, ' ').slice(0, 300) : null; });
  await p.evaluate(() => window.__interiorsEnter && window.__interiorsEnter('COLOSSEUM')); await sleep(10000);
  console.log('LOBBY modal on entry:', await modal()); await SHOT(p, 'lobby');
  console.log('DOOR step', await p.evaluate(() => { try { const I = window.COLOSSEUM_ISLAND, D = window.__w3dDebug; const before = [D.playerPos.x | 0, D.playerPos.z | 0]; D.playerPos.x = I.x; D.playerPos.z = I.z + (I.lobbyZ0 + 4) * I.U; return JSON.stringify({ I, before, cur: window._currentInterior }); } catch (e) { return 'ERR ' + e.message + ' I=' + typeof window.COLOSSEUM_ISLAND + ' D=' + typeof window.__w3dDebug; } })); await sleep(2500);
  console.log('DOORS modal:', await modal()); await SHOT(p, 'doors');
  await p.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => /HOVER LEAGUE/.test(x.textContent)); if (b) b.click(); }); await sleep(4000); await SHOT(p, 'hoverleague');
  await p.keyboard.press('Escape'); await sleep(1500);
  await p.evaluate(() => { try { window.__hoverLeague && window.__hoverLeague.stop && window.__hoverLeague.stop(); } catch (e) {} try { window.__naval && window.__naval.open && window.__naval.open(); } catch (e) {} }); await sleep(4000); await SHOT(p, 'naval');
  await p.keyboard.press('Escape'); await sleep(1000);
  await p.evaluate(() => window.__interiorsExit && window.__interiorsExit()); await sleep(5000);
  await p.evaluate(() => { const D = window.__w3dDebug; const r0 = D.renderer.render.bind(D.renderer); window.__camLock = {}; D.renderer.render = (s, c) => { const L = window.__camLock; if (L.on) { c.position.set(L.px, L.py, L.pz); c.lookAt(L.tx, L.ty, L.tz); c.updateMatrixWorld(true); } r0(s, c); }; });
  const st = await p.evaluate(() => { const U = 7 / 1.8, T = (window.__worldTransitApi && window.__worldTransitApi.stations || []).find(s => s.realm === 'ocean'); if (!T) return null; const q = T.group.position, d = Math.hypot(q.x, q.z), ux = q.x / d, uz = q.z / d; return { x: q.x + ux * 220 * U, z: q.z + uz * 220 * U, ux, uz }; });
  if (st) { await p.evaluate((s) => { const D = window.__w3dDebug, U = 7 / 1.8; D.playerPos.x = s.x; D.playerPos.z = s.z; Object.assign(window.__camLock, { on: true, px: s.x - s.ux * 60 * U, py: 40 * U, pz: s.z - s.uz * 60 * U, tx: s.x + s.ux * 200 * U, ty: 0, tz: s.z + s.uz * 200 * U }); }, st); await sleep(8000); await SHOT(p, 'ocean'); }
  console.log('ERRORS', errs.size); for (const [k, n] of errs) console.log('x' + n, k);
  await b.close();
})().catch(e => { console.error('cw probe failed', e.message); process.exit(1); });
