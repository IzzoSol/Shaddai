/* tools/_probe-edges.cjs — walls + respawn on the Meridian deck (kart race). Static server on :3013. Exit 0 = pass. */
const puppeteer = require('puppeteer'), os = require('os'), sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  if (Math.round(os.freemem() / 1048576) < 1000) { console.log('refused: low RAM'); process.exit(3); }
  const b = await puppeteer.launch({ headless: 'new', protocolTimeout: 900000, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage(); await p.setViewport({ width: 800, height: 450 }); const errs = []; p.on('pageerror', e => errs.push(String(e.message).slice(0, 160)));
  await p.goto('http://localhost:3013/SHADDAI-WORLD-3D.html?time=0.5&tracks=meridian-8&trackcity=1', { waitUntil: 'domcontentloaded', timeout: 120000 });
  let ok = false; for (let i = 0; i < 400; i++) { await sleep(1000); if (await p.evaluate(() => !!(window.__raceTracks && window.__raceTracks['meridian-8'] && window.__raceStart && window.__raceTrackDone && window.__mountRide)).catch(() => false)) { ok = true; break; } }
  if (!ok) { console.log(JSON.stringify({ pass: false, reason: 'not ready', errs })); await b.close(); process.exit(1); }
  const r = await p.evaluate(async () => {
    const T = window.__raceTracks['meridian-8'], U = 7 / 1.8, f = T.frames[300], sl = Math.hypot(f.S.x, f.S.z), sx = f.S.x / sl, sz = f.S.z / sl, out = {};
    // 1. edgeAt: on-deck point is not over, a point 30 m to the side is over and is pulled back to the wall line
    const on = T.edgeAt(f.P.x, f.P.z), off = T.edgeAt(f.P.x + sx * 22 * U, f.P.z + sz * 22 * U);
    out.edge = { onOver: on && on.over, offOver: off && off.over, pulledLatM: off ? Math.round(Math.hypot(off.cx - f.P.x, off.cz - f.P.z) / U * 10) / 10 : null };
    // 2. kart on the deck driven sideways into the wall stays on the deck
    window.__raceStart('meridian-8', { vehicle: 'kart-arrow', ais: 0 });
    const M = window.__mountRide; M.placeAt(f.P.x, f.P.z, Math.atan2(sx, sz));   // yaw pointing straight at the side wall
    window.__wireEdges(); out.start = true; window.__probeT = T; window.__probeF = { x: f.P.x, z: f.P.z, sx, sz };
    return out;
  });
  await p.keyboard.down('w'); let maxLat = 0, minY = 1e9, y0 = null;
  for (let k = 0; k < 60; k++) { await sleep(100); const q = await p.evaluate(() => { const s = window.__mountRide.state(), e = window.__probeT.edgeAt(s.x, s.z), U = 7 / 1.8; return { lat: e ? Math.abs(e.lat) / U : null, y: s.y / U, sp: s.sp }; }); if (q.lat != null) maxLat = Math.max(maxLat, q.lat); minY = Math.min(minY, q.y); if (y0 == null) y0 = q.y; }
  await p.keyboard.up('w'); r.maxLatM = Math.round(maxLat * 10) / 10; r.edgeLimitM = 16.3; r.dropM = Math.round((y0 - minY) * 10) / 10;
  const pass = r.edge.onOver === false && r.edge.offOver === true && r.maxLatM <= 18 && r.dropM < 12 && errs.length === 0;
  console.log(JSON.stringify({ pass, r, errs: errs.slice(0, 5) }, null, 1)); await b.close(); process.exit(pass ? 0 : 1);
})().catch(e => { console.log('crash', String(e.message).slice(0, 200)); process.exit(2); });
