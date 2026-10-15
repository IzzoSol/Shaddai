/* tools/_unnamed-profile.cjs — WHAT are the unnamed top-level meshes outdoors?  node tools/_unnamed-profile.cjs   (static server :3013)
 * Groups visible meshes whose top-level owner has no name by geometry signature + material, with counts and a sample position,
 * so each bucket can be traced to its builder and instanced/merged deliberately (no blind merging). */
const puppeteer = require('puppeteer'), os = require('os'), sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  if (os.freemem() / 1048576 < 1000) { console.log('refused: low RAM'); process.exit(3); }
  const b = await puppeteer.launch({ headless: 'new', protocolTimeout: 900000, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage(); await p.setViewport({ width: 480, height: 300 });
  await p.goto('http://localhost:3013/SHADDAI-WORLD-3D.html?time=0.5', { waitUntil: 'domcontentloaded', timeout: 120000 });
  for (let i = 0; i < 300; i++) { await sleep(1000); if (await p.evaluate(() => !!window.__loadPlayable).catch(() => false)) break; }
  await sleep(15000);   // let the static merge pass 1 run
  const out = await p.evaluate(() => {
    const sc = window.__w3dDebug.scene, B = {};
    sc.children.forEach(top => {
      if (top.name || !top.visible) return;
      top.traverseVisible(o => {
        if (!o.isMesh) return;
        const g = o.geometry, pr = g.parameters ? Object.values(g.parameters).map(v => typeof v === 'number' ? +v.toFixed(2) : '').join(',') : '';
        const m = Array.isArray(o.material) ? o.material[0] : o.material;
        const k = (o.isInstancedMesh ? 'IM:' : '') + g.type + '(' + pr + ')|' + (m ? m.type + '#' + (m.color ? m.color.getHexString() : '') + (m.map ? '+map' : '') : '') + '|top=' + top.type + '/' + top.children.length;
        const e = B[k] || (B[k] = { n: 0, at: null, parentNames: new Set() }); e.n++;
        if (!e.at) { const v = o.getWorldPosition(new o.position.constructor()); e.at = [Math.round(v.x), Math.round(v.y), Math.round(v.z)]; }
        if (o.parent && o.parent.name) e.parentNames.add(o.parent.name);
      });
    });
    return Object.entries(B).sort((a, c) => c[1].n - a[1].n).slice(0, 25).map(([k, e]) => e.n + '  ' + k + '  at ' + e.at + (e.parentNames.size ? '  parents:' + [...e.parentNames].slice(0, 3).join(',') : ''));
  });
  console.log(out.join('\n')); await b.close();
})().catch(e => { console.log('crash', e.message); process.exit(2); });
