/* tools/_world-status.cjs — ONE world boot, one health report for the finish pass (2026-10-23): runtime errors (with stacks), agents,
 * bots, dragons, wildlife, realm kits / dressing / interiors, academy + colosseum presence, NAVI globals, and screenshots of the
 * colosseum door, the academy exterior and the nearest dragon => C:/Users/Brittany/eye/status-*.png
 *   node tools/_world-status.cjs      (python -m http.server 3013 --directory public; >= 700 MB free RAM) */
const puppeteer = require('puppeteer'), os = require('os'), sleep = ms => new Promise(r => setTimeout(r, ms));
const OUT = 'C:/Users/Brittany/eye';
(async () => {
  if (os.freemem() / 1048576 < 700) { console.log('refused: low RAM'); process.exit(3); }
  const b = await puppeteer.launch({ headless: 'new', protocolTimeout: 900000, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage(); await p.setViewport({ width: 900, height: 560 }); const errs = new Map();
  p.on('pageerror', e => { const k = (e.stack || e.message).split('\n').slice(0, 4).join(' | ').slice(0, 400); errs.set(k, (errs.get(k) || 0) + 1); });
  await p.goto('http://localhost:3013/SHADDAI-WORLD-3D.html', { waitUntil: 'domcontentloaded', timeout: 90000 });
  for (let i = 0; i < 150; i++) { await sleep(2000); if (await p.evaluate(() => !!window.__loadPlayable).catch(() => false)) break; }
  await sleep(10000);
  await p.evaluate(() => { const els = [...document.querySelectorAll('*')].filter(e => e.children.length < 4 && /Source Temple/i.test(e.textContent || '') && e.offsetParent); const t = els.sort((a, c) => (a.textContent || '').length - (c.textContent || '').length)[0]; if (t) (t.closest('button,[class*=portal],[class*=card],[onclick]') || t).click(); });
  for (let i = 0; i < 60 && !(await p.evaluate(() => window.__spawnBusy === false).catch(() => false)); i++) await sleep(3000);
  await sleep(30000);
  const rep = await p.evaluate(() => {
    const D = window.__w3dDebug, S = D && D.scene, r = {}; let agents = 0, rigged = 0;
    if (S) S.traverse(o => { if (o.userData && o.userData.agent) { agents++; if (o.userData.__hasMixer) rigged++; } });
    const st = (x) => { try { return x && (typeof x.stats === 'function' ? x.stats() : x.stats) || null; } catch (e) { return 'err ' + e.message; } };
    r.agents = { objects: agents, riggedBodies: rigged };
    r.townsfolk = st(window.__townsfolk); r.realmKits = st(window.__realmKits); r.realmDress = st(window.__realmDress);
    r.interiorsV3 = st(window.__interiorsV3); r.realmInteriors = window.WorldRealmInteriors ? window.WorldRealmInteriors.stats() : null;
    const dr = window.__dragons; r.dragons = dr ? { list: (dr.dragons || []).length, ids: (dr.dragons || []).map(d => d.id).slice(0, 8) } : null;
    r.wildlife = st(window.__wildlife); r.academy = !!window.__academy; r.acadExterior = !!window.__acadExterior; r.colosseum = !!window.__colosseumExt;
    r.naviGlobals = Object.keys(window).filter(k => /navi/i.test(k)).slice(0, 12);
    r.player = D && D.playerPos ? [Math.round(D.playerPos.x), Math.round(D.playerPos.z)] : null;
    return r;
  });
  console.log(JSON.stringify(rep, null, 1));
  // screenshots: camera-lock like tools/_eye.cjs
  await p.evaluate(() => { const D = window.__w3dDebug; const r0 = D.renderer.render.bind(D.renderer); window.__camLock = {}; D.renderer.render = (s, c) => { const L = window.__camLock; if (L.on) { c.position.set(L.px, L.py, L.pz); c.lookAt(L.tx, L.ty, L.tz); c.updateMatrixWorld(true); } r0(s, c); }; });
  async function shot(name, fn) {
    const ok = await p.evaluate(fn).catch(() => false); if (!ok) { console.log('skip', name); return; }
    await sleep(6000); await p.screenshot({ path: OUT + '/status-' + name + '.png' }); console.log('shot', name);
  }
  await shot('colosseum', () => { const C = window.COLOSSEUM_WORLD, D = window.__w3dDebug; if (!C) return false; const [x, z] = C.door, [fx, fz] = C.front, U = 7 / 1.8;
    D.playerPos.x = x + fx * 40 * U; D.playerPos.z = z + fz * 40 * U; Object.assign(window.__camLock, { on: true, px: x + fx * 90 * U, py: 40 * U, pz: z + fz * 90 * U, tx: x, ty: 10 * U, tz: z }); return true; });
  await shot('academy', () => { const A = window.__acadExterior, D = window.__w3dDebug; const g = A && (A.group || A.root || A); if (!g || !g.position) return false; const x = g.position.x, z = g.position.z, U = 7 / 1.8;
    D.playerPos.x = x + 60 * U; D.playerPos.z = z + 60 * U; Object.assign(window.__camLock, { on: true, px: x + 110 * U, py: 60 * U, pz: z + 110 * U, tx: x, ty: 10 * U, tz: z }); return true; });
  await shot('dragon', () => { const dr = window.__dragons, D = window.__w3dDebug, d = dr && (dr.dragons || [])[0]; if (!d || !d.f) return false; const x = d.f.x, z = d.f.z, y = (d.f.y || 0), U = 7 / 1.8;
    D.playerPos.x = x + 40 * U; D.playerPos.z = z + 40 * U; Object.assign(window.__camLock, { on: true, px: x + 50 * U, py: y + 25 * U, pz: z + 50 * U, tx: x, ty: y, tz: z }); return true; });
  // PERF SAMPLE (draw calls / triangles do not depend on GPU speed - the real FPS levers; budget < 80 draws): stand at key spots, render, read renderer.info
  const spots = await p.evaluate(() => { const U = 7 / 1.8, T = (window.__worldTransitApi && window.__worldTransitApi.stations || []).filter(s => s.realm && s.onRing !== false), C = window.COLOSSEUM_WORLD;
    const out = [['city-core', 0, 120 * U]]; if (T[0]) out.push(['realm-town:' + T[0].realm, T[0].group.position.x, T[0].group.position.z]); if (T[3]) out.push(['realm-town:' + T[3].realm, T[3].group.position.x, T[3].group.position.z]);
    out.push(['athenaeum-district', -728 * U, -728 * U]); if (C) out.push(['colosseum', C.door[0], C.door[1]]); return out; });
  for (const sp of spots) {
    const info = await p.evaluate((sp) => new Promise(res => { const D = window.__w3dDebug; D.playerPos.x = sp[1]; D.playerPos.z = sp[2]; if (window.__camLock) window.__camLock.on = false;
      setTimeout(() => { const R = D.renderer; requestAnimationFrame(() => { R.info.autoReset = false; R.info.reset(); requestAnimationFrame(() => { const i = R.info.render, o = { calls: i.calls, tris: i.triangles, geos: R.info.memory.geometries, tex: R.info.memory.textures }; R.info.autoReset = true; res(o); }); }); }, 9000); }), sp).catch(e => ({ err: e.message }));
    console.log('PERF', sp[0].padEnd(24), JSON.stringify(info));
  }
  console.log('ERRORS', errs.size); for (const [k, n] of errs) console.log('x' + n, k);
  await b.close();
})().catch(e => { console.error('status failed', e.message); process.exit(1); });
