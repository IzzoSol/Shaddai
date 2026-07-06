const puppeteer = require('puppeteer-core');
(async () => {
  const errors = [];
  const browser = await puppeteer.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: 'new', args: ['--no-sandbox','--use-gl=swiftshader','--enable-webgl','--ignore-gpu-blocklist']
  });
  const page = await browser.newPage();
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('requestfailed', r => { const u=r.url(); if(/pillar-relief|world-elevators|world-buildings/.test(u)) errors.push('REQFAIL: '+u+' '+(r.failure()&&r.failure().errorText)); });
  await page.goto('http://localhost:3000/SHADDAI-WORLD-3D.html', { waitUntil: 'load', timeout: 60000 });
  await new Promise(r => setTimeout(r, 4000));
  // force enter
  await page.evaluate(() => { const b = document.querySelector('#enterBtn'); if (b) b.click(); });
  await new Promise(r => setTimeout(r, 7000));
  const info = await page.evaluate(() => {
    let meshes = 0, instanced = 0;
    const s = window.__scene;
    if (s && s.traverse) s.traverse(o => { if (o.isMesh) meshes++; if (o.isInstancedMesh) instanced++; });
    const el = window.__shaddaiElevators;
    let lifts = [];
    if (el && el.platforms) el.platforms.forEach(p => { if (p.stops) lifts.push({ code: p.code, stops: p.stops.map(v=>Math.round(v)) }); });
    return {
      meshes, instanced,
      reliefLoaded: !!(document.querySelector('canvas')),
      multiStopLifts: lifts,
      hasEnter: !!document.querySelector('#enterBtn'),
    };
  });
  console.log('CONSOLE_ERRORS', errors.length);
  errors.slice(0, 20).forEach(e => console.log('  ' + e));
  console.log('SCENE_MESHES', info.meshes, 'INSTANCED', info.instanced);
  console.log('MULTISTOP_LIFTS', info.multiStopLifts.length);
  console.log(JSON.stringify(info.multiStopLifts, null, 0));
  await browser.close();
  process.exit(errors.length ? 1 : 0);
})().catch(e => { console.log('FATAL', e.message); process.exit(2); });
