const puppeteer = require('puppeteer');

(async () => {
  const errors = [];
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox','--disable-setuid-sandbox','--enable-unsafe-swiftshader',
           '--use-gl=angle','--use-angle=swiftshader','--ignore-gpu-blocklist',
           '--enable-webgl','--enable-webgl2-compute-context']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));

  await page.goto('http://localhost:3000/lab-molecules.html', { waitUntil: 'networkidle2', timeout: 30000 });
  await new Promise(r => setTimeout(r, 800));

  // WebGL2 acquired?
  const gl2 = await page.evaluate(() => {
    const c = document.getElementById('gl');
    return !!(c && c.getContext && c.getContext('webgl2'));
  });

  // pin p and move mouse, capture three points
  async function shot(name, p, mx, my) {
    await page.evaluate(v => { window.__forceP = v; }, p);
    await page.mouse.move(mx, my);
    await new Promise(r => setTimeout(r, 350));
    await page.mouse.move(mx + 40, my + 30);   // motion to trigger excite
    await new Promise(r => setTimeout(r, 400));
    const dbg = await page.evaluate(() => window.__DBG);
    await page.screenshot({ path: 'scripts/' + name });
    return dbg;
  }

  const dMol = await shot('cut-molecule.png', 0.10, 640, 400);
  const dWat = await shot('cut-water.png',    0.60, 700, 420);
  const dEnd = await shot('cut-end.png',      1.00, 660, 440);

  // confirm only molecule + water uniforms exist
  const hasOldUniforms = await page.evaluate(() => {
    const d = window.__DBG || {};
    return ('pDirt' in d) || ('pLife' in d) || ('pSky' in d);
  });

  console.log(JSON.stringify({
    errors, webgl2: gl2, hasOldUniforms,
    dbgMol: dMol, dbgWater: dWat, dbgEnd: dEnd
  }, null, 2));

  await browser.close();
  if (errors.length) process.exit(2);
})();
