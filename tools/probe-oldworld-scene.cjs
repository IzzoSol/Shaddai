// node tools/probe-oldworld-scene.cjs 8790 -> deep inventory of __scene graph + worldview exports
const puppeteer = require('puppeteer');
const port = process.argv[2] || 8790;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({ headless: 'new', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage(); await p.setViewport({ width: 900, height: 620 });
  const errs = []; p.on('pageerror', (e) => errs.push('PAGEERR ' + e.message.slice(0, 160)));
  p.on('console', (m) => { if (m.type() === 'error' && !/404|WebSocket|favicon|Failed to load resource/i.test(m.text())) errs.push(m.text().slice(0, 150)); });
  await p.goto(`http://localhost:${port}/SHADDAI-WORLD-3D.html`, { waitUntil: 'domcontentloaded' });
  for (let i = 0; i < 120; i++) { await sleep(2500); if (await p.evaluate(() => window.__worldBuilt === true).catch(() => false)) break; }
  await sleep(6000);
  const r = await p.evaluate(() => {
    const s = window.__scene; const out = {};
    out.sceneChildren = s.children.map((c) => ({ name: c.name || '(anon)', type: c.type, count: (o) => 0 })).slice(0, 0);
    const byName = {};
    let meshes = 0, lights = 0, groups = 0, sprites = 0;
    s.traverse((o) => { if (o.isMesh) meshes++; else if (o.isLight) lights++; if (o.isGroup) groups++; if (o.isSprite) sprites++; if (o.name && o.name.length < 48) byName[o.name] = (byName[o.name] || 0) + 1; });
    const top = s.children.map((c) => c.name || c.type || '(anon)').filter((n, i, a) => a.indexOf(n) === i);
    out.topLevel = top;
    out.meshes = meshes; out.lights = lights; out.groups = groups; out.sprites = sprites;
    out.namedCounts = Object.entries(byName).sort((a, b) => b[1] - a[1]).slice(0, 40);
    // worldview helpers
    out.registry = typeof window.PORTALS_REGISTRY !== 'undefined' ? window.PORTALS_REGISTRY.length : undefined;
    out.portalDomes = typeof window._portalDomes !== 'undefined' ? window._portalDomes.length : undefined;
    out.layout = typeof window.WORLD_LAYOUT !== 'undefined' ? Object.keys(window.WORLD_LAYOUT).slice(0, 30) : undefined;
    out.agentsPlaced = typeof window.originAgentCluster !== 'undefined' ? JSON.stringify(window.originAgentCluster).slice(0, 200) : undefined;
    // buildings / districts content
    if (typeof window.buildWorldBuildings === 'function') {
      out.buildingsFn = 'present';
      try { const k = Object.keys(window); out.extra = k.filter((n) => /BUILD|DISTRICT|REALM|BIOME|REGION/i.test(n)).slice(0, 40); } catch (e) {}
    }
    return out;
  });
  console.log(JSON.stringify(r, null, 1));
  console.log('ERR:', errs.slice(0, 8).join('\n') || 'none');
  await b.close();
})().catch((e) => { console.log('FAIL', e.message.slice(0, 300)); process.exit(1); });