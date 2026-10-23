/* tools/_finish-probe.cjs — checks the 2026-10-23 realm finish modules loaded in the game (roads, spur stop, towns, biome scatter, rivers, edge realms). */
const puppeteer = require('puppeteer'), os = require('os'), sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  if (os.freemem() / 1048576 < 520) { console.log('refused: low RAM'); process.exit(3); }
  const b = await puppeteer.launch({ headless: 'new', protocolTimeout: 900000, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage(); await p.setViewport({ width: 640, height: 400 }); const errs = [];
  p.on('pageerror', e => errs.push((e.message || '').slice(0, 200)));
  p.on('console', m => { const t = m.text(); if (/realm-roads|realm-dress|biome-scatter|edge-realms|canon-v4\]|rivers/i.test(t)) console.log('  console:', t.slice(0, 300)); });
  p.on('requestfailed', r => { if (/realm-|biome|rivers/.test(r.url())) console.log('  REQFAIL', r.url(), r.failure() && r.failure().errorText); });
  await p.goto('http://localhost:3013/SHADDAI-WORLD-3D.html?colointro=0', { waitUntil: 'domcontentloaded', timeout: 90000 });
  for (let i = 0; i < 150; i++) { await sleep(2000); if (await p.evaluate(() => !!window.__loadPlayable).catch(() => false)) break; }
  await sleep(6000);
  await p.evaluate(() => { const els = [...document.querySelectorAll('*')].filter(e => e.children.length < 4 && /Source Temple/i.test(e.textContent || '') && e.offsetParent); const t = els.sort((a, c) => (a.textContent || '').length - (c.textContent || '').length)[0]; if (t) (t.closest('button,[class*=portal],[class*=card],[onclick]') || t).click(); });
  for (let i = 0; i < 60 && !(await p.evaluate(() => window.__spawnBusy === false).catch(() => false)); i++) await sleep(3000);
  await sleep(40000);
  const r = await p.evaluate(() => ({ inWorld: document.body.classList.contains('in-world'), spawnBusy: window.__spawnBusy, hasRoadsMod: !!window.WorldRealmRoads, hasScatterMod: !!window.WorldBiomeScatter,
    roads: window.__realmRoads && window.__realmRoads.stats, scatter: window.__biomeScatter && window.__biomeScatter.stats,
    stops: window.__worldTransitApi && window.__worldTransitApi.stations.map(s => s.id), dress: window.__realmDress && window.__realmDress.stats,
    rivers: window.__rivers && window.__rivers.segments, embHidden: (function () { let n = 0, v = 0; window.__w3dDebug.scene.traverse(o => { if (/^EMB_(Terrace|Road_Lava)/.test(o.name || '')) { n++; if (o.visible) v++; } }); return n + ' found, ' + v + ' visible'; })() }));
  console.log(JSON.stringify(r, null, 1).slice(0, 2500));
  console.log('pageerrors', errs.length, errs.slice(0, 5));
  await b.close();
})().catch(e => { console.error('probe failed', e.message); process.exit(1); });
