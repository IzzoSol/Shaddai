/* tools/_train-probe.cjs — does the maglev BOARD?  (static server on :3013)   node tools/_train-probe.cjs [query]
 * Teleports to the first station pad, presses E, checks the destination menu, clicks a stop, then reports the ride
 * status / walkable layout plus fps + draw calls. Refuses below 1000 MB free RAM. */
const puppeteer = require('puppeteer'), os = require('os'), sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  if (os.freemem() / 1048576 < 1000) { console.log('refused: low RAM'); process.exit(3); }
  const errs = [], t0 = Date.now();
  const b = await puppeteer.launch({ headless: 'new', protocolTimeout: 900000, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage(); await p.setViewport({ width: 480, height: 300 });
  p.on('pageerror', e => errs.push(String(e.message).slice(0, 160)));
  await p.goto('http://localhost:3013/SHADDAI-WORLD-3D.html' + (process.argv[2] || '?time=0.5'), { waitUntil: 'domcontentloaded', timeout: 120000 });
  let playable = null; for (let i = 0; i < 300; i++) { await sleep(1000); if (await p.evaluate(() => !!window.__loadPlayable).catch(() => false)) { playable = Date.now() - t0; break; } }
  if (!playable) { console.log(JSON.stringify({ playable: null, errs })); await b.close(); process.exit(1); }
  await sleep(4000);
  const perf = await p.evaluate(() => new Promise(res => { const ts = []; function f(t) { ts.push(t); if (ts.length < 120 && t - ts[0] < 5000) requestAnimationFrame(f); else { const i = window.__w3dDebug.renderer.info; res({ fps: +(1000 * (ts.length - 1) / (ts[ts.length - 1] - ts[0])).toFixed(1), calls: i.render.calls, tris: i.render.triangles, lights: (function () { let n = 0; window.__w3dDebug.scene.traverse(o => { if (o.isLight && o.visible) n++; }); return n; })(), heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null }); } } requestAnimationFrame(f); }));
  const r = await p.evaluate(async () => {
    const T = window.__worldTransitApi, D = window.__w3dDebug, out = {};
    out.api = !!T; if (!T) return out;
    out.walkLayout = !!(T._debug && T._debug.walkLayout());
    out.trainV2 = !!window.__trainV2; out.stations = T.stations.length;
    const s = T.stations[0]; D.playerPos.x = s.x; D.playerPos.z = s.z;
    out.near = T.near(s.x, s.z) ? T.near(s.x, s.z).id : null;
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE', key: 'e', bubbles: true }));
    await new Promise(r => setTimeout(r, 300));
    const btn = [...document.querySelectorAll('button[data-to]')];
    out.menuButtons = btn.length;
    const toasts = []; const ot = window.__toast; window.__toast = m => { toasts.push(m); if (ot) ot(m); };
    if (btn.length) btn[0].dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
    await new Promise(r => setTimeout(r, 1500));
    out.status = T.status(); out.aboard = T.aboard(); out.toasts = toasts;
    return out;
  });
  console.log(JSON.stringify({ playable_ms: playable, perf, train: r, errs: errs.slice(0, 6) }, null, 1));
  await b.close();
})().catch(e => { console.log(JSON.stringify({ crash: String(e.message).slice(0, 200) })); process.exit(2); });
