/* tools/_probe-tri.cjs — Meridian Trefoil: build, symmetry, gate towers, force field, then a chase-cam style screenshot. Static server :3013. */
const puppeteer = require('puppeteer'), os = require('os'), sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  if (Math.round(os.freemem() / 1048576) < 1000) { console.log('refused: low RAM'); process.exit(3); }
  const b = await puppeteer.launch({ headless: 'new', protocolTimeout: 900000, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage(); await p.setViewport({ width: 1000, height: 560 }); const errs = []; p.on('pageerror', e => errs.push(String(e.message).slice(0, 160)));
  await p.goto('http://localhost:3013/SHADDAI-WORLD-3D.html?time=0.5&tracks=meridian-tri&trackcity=1', { waitUntil: 'domcontentloaded', timeout: 120000 });
  let ok = false; for (let i = 0; i < 400; i++) { await sleep(1000); if (await p.evaluate(() => !!(window.__raceTracks && window.__raceTracks['meridian-tri'] && window.__raceTrackDone)).catch(() => false)) { ok = true; break; } }
  if (!ok) { console.log(JSON.stringify({ pass: false, reason: 'not built', errs })); await b.close(); process.exit(1); }
  const r = await p.evaluate(() => { const t = window.__raceTracks['meridian-tri'], g = t.group, names = {}; g.traverse(o => { if (o.name) names[o.name] = (o.isInstancedMesh ? o.count : 1); });
    const U = 7 / 1.8, ys = t.frames.map(f => f.P.y / U); return { frames: t.frames.length, lenM: Math.round(t.lengthM), deckMin: Math.round(Math.min.apply(null, ys)), deckMax: Math.round(Math.max.apply(null, ys)), pads: t.pads.length, gateTowers: names['track-gate-towers'] || 0, forcefield: !!names['track-forcefield'], markings: ['track-startline-a','track-sector-bars','track-grid-slots','track-distance-ticks'].map(k => names[k] || 0), gates: names['track-sector-gates'] || 0, drawObjects: Object.keys(names).length }; });
  if (process.argv[2]) { await p.evaluate(() => { try { window.__raceStart('meridian-tri', { free: true, vehicle: 'kart-arrow' }); } catch (e) { window.__startErr = String(e); } }); await sleep(9000); await p.screenshot({ path: process.argv[2] }); }
  console.log(JSON.stringify({ pass: r.gateTowers === 3 && r.forcefield && errs.length === 0, r, errs: errs.slice(0, 5) }, null, 1)); await b.close(); process.exit(0);
})().catch(e => { console.log('crash', String(e.message).slice(0, 200)); process.exit(2); });
