// node tools/probe-flow.cjs 8790 -> trace the peek->enter->skydive->picker->land flow
const puppeteer = require('puppeteer');
const port = process.argv[2] || 8790;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({ headless: 'new', args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'] });
  const p = await b.newPage();
  await p.setViewport({ width: 1280, height: 800 });
  p.on('pageerror', (e) => console.log('PAGEERR', String(e.message).slice(0, 150)));
  await p.goto(`http://localhost:${port}/SHADDAI-WORLD-3D.html?peek=1`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  for (let i = 0; i < 30; i++) {
    await sleep(2000);
    const s = await p.evaluate(() => {
      const pick = document.getElementById('spawnPicker');
      const btn = document.querySelector('#spawnPicker .sp-btn');
      return {
        built: window.__worldBuilt,
        enterShown: !!(document.getElementById('enterBtn') && document.getElementById('enterBtn').classList.contains('show')),
        introGone: !!(document.getElementById('intro') && document.getElementById('intro').classList.contains('gone')),
        picker: !!pick,
        pickerBtns: pick ? pick.querySelectorAll('.sp-btn').length : 0,
        firstBtn: btn ? (btn.textContent || '').slice(0, 24) : null,
        camY: window.__w3dDebug ? Math.round(window.__w3dDebug.camera.position.y) : null,
        pos: window._playerPos ? [Math.round(window._playerPos.x), Math.round(window._playerPos.y), Math.round(window._playerPos.z)] : null,
        spawnLo: window.__spawnWasLo === true,
        ocT: (() => { let t = null; if (window.__w3dDebug) window.__w3dDebug.scene.traverse((o) => { if (o.name === 'ocean-water' && o.material && o.material.uniforms) t = o.material.uniforms.t.value; }); return t; })(),
      };
    }).catch((e) => ({ err: String(e).slice(0, 100) }));
    console.log(JSON.stringify(s));
    if (s.ocT && s.ocT > 3) break; // ocean clock alive = landed and running
  }
  await b.close();
  process.exit(0);
})().catch((e) => { console.log('FAIL', String(e).slice(0, 300)); process.exit(1); });
