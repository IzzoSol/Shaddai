/* tools/_sky-probe.cjs — why is the sky black?  (static server first: cd public && python -m http.server 3013)
 *   node tools/_sky-probe.cjs [query]     e.g. "?time=0.5"
 * Boots headless, waits for playable + landed, prints the sky mesh state (visible, precompile hold, uniforms, camera far,
 * bloom/composer) and saves C:/Users/Brittany/eye/sky-probe.png looking 35° up. Refuses below SMOKE_MIN_MB free RAM (1000). */
const puppeteer = require('puppeteer'), os = require('os'), sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const need = +(process.env.SMOKE_MIN_MB || 1000), free = Math.round(os.freemem() / 1048576);
  if (free < need) { console.log(JSON.stringify({ refused: true, free_mb: free, need_mb: need })); process.exit(3); }
  const qs = process.argv[2] || '?time=0.5', errs = [];
  const b = await puppeteer.launch({ headless: 'new', protocolTimeout: 900000, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage(); await p.setViewport({ width: 900, height: 520 }); p.on('pageerror', e => errs.push(String(e.message).slice(0, 160)));
  await p.goto('http://localhost:3013/SHADDAI-WORLD-3D.html' + qs, { waitUntil: 'domcontentloaded', timeout: 120000 });
  for (let i = 0; i < 300; i++) { await sleep(1000); if (await p.evaluate(() => !!window.__loadPlayable).catch(() => false)) break; }
  await sleep(20000);
  const st = await p.evaluate(() => {
    const D = window.__w3dDebug, sc = D && D.scene, cam = D && D.camera; let sky = null;
    sc && sc.traverse(o => { if (o.name === 'world-sky-v4') sky = o; });
    const u = sky && sky.material && sky.material.uniforms, c = k => u && u[k] && u[k].value && u[k].value.toArray ? u[k].value.toArray().map(x => +x.toFixed(3)) : null;
    let chain = []; for (let a = sky; a; a = a.parent) chain.push({ name: a.name || a.type, visible: a.visible, pending: !!a.userData.__pcPending });
    return { found: !!sky, chain, inScene: sky ? sky.parent === sc : false, zenith: c('uZenith'), horizon: c('uHorizon'), camFar: cam && cam.far, camNear: cam && cam.near,
      bg: sc && sc.background && sc.background.getHexString ? sc.background.getHexString() : String(sc && sc.background), precompile: window.__precompile,
      sky: D && D.sky && D.sky.stats ? D.sky.stats() : null, logDepth: D && D.renderer && D.renderer.capabilities ? D.renderer.capabilities.logarithmicDepthBuffer : null };
  });
  console.log(JSON.stringify(st, null, 1));
  await p.evaluate(() => { const D = window.__w3dDebug, r0 = D.renderer.render.bind(D.renderer); D.renderer.render = (s, c) => { c.rotation.order = 'YXZ'; c.rotation.x = 0.6; c.updateMatrixWorld(true); r0(s, c); }; });
  await sleep(8000); await p.screenshot({ path: 'C:/Users/Brittany/eye/sky-probe.png' });
  console.log(JSON.stringify({ shot: 'C:/Users/Brittany/eye/sky-probe.png', errs: errs.slice(0, 5) }));
  await b.close();
})().catch(e => { console.log(JSON.stringify({ crash: String(e.message).slice(0, 200) })); process.exit(2); });
