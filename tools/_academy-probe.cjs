/* tools/_academy-probe.cjs — does the Academy campus open from the realm?  node tools/_academy-probe.cjs [shot.png]   (static server :3013)
 * Boots the world, calls interiors.enter('ATHENAEUM'), reports campus/visibility/player-inside/stations + draw calls, saves a screenshot. */
const puppeteer = require('puppeteer'), os = require('os'), sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  if (os.freemem() / 1048576 < 1000) { console.log('refused: low RAM'); process.exit(3); }
  const errs = [];
  const b = await puppeteer.launch({ headless: 'new', protocolTimeout: 900000, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage(); await p.setViewport({ width: 640, height: 380 });
  p.on('pageerror', e => errs.push(String(e.message).slice(0, 160)));
  await p.goto('http://localhost:3013/SHADDAI-WORLD-3D.html?time=0.5', { waitUntil: 'domcontentloaded', timeout: 120000 });
  for (let i = 0; i < 300; i++) { await sleep(1000); if (await p.evaluate(() => !!window.__loadPlayable).catch(() => false)) break; }
  await sleep(3000);
  const r = await p.evaluate(async () => {
    const D = window.__w3dDebug, I = D.interiors, out = { builder: !!window.buildAthenaeumCampus, client: !!window.WorldAcademy };
    try { I.enter('ATHENAEUM'); } catch (e) { out.enterErr = e.message; }
    await new Promise(r => setTimeout(r, 6000));
    const C = window.__athenaeumCampus; out.campus = !!C; out.inside = I.isInside();
    if (C) { out.visible = C.group.visible; out.stations = C.stations.length; out.playerIn = C.contains(D.playerPos.x, D.playerPos.z); out.calls = D.renderer.info.render.calls; out.station = window.__athStation ? window.__athStation.label : null; out.hidden = !!window.__outdoorHidden;
      const top = {}; D.scene.children.forEach(o => { if (!o.visible) return; let n = 0; o.traverseVisible(c => { if (c.isMesh) n++; }); if (n) { const k = (o.name || o.type) + (o === C.group ? '*' : ''); top[k] = (top[k] || 0) + n; } });
      out.top = Object.entries(top).sort((a, b) => b[1] - a[1]).slice(0, 25); }
    return out;
  });
  if (process.argv[2]) await p.screenshot({ path: process.argv[2] });
  console.log(JSON.stringify({ academy: r, errs: errs.slice(0, 6) }, null, 1));
  await b.close();
})().catch(e => { console.log(JSON.stringify({ crash: String(e.message).slice(0, 200) })); process.exit(2); });
