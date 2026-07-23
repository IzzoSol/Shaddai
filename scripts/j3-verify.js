const puppeteer = require('puppeteer');
const path = require('path');

(async () => {
  const errors = [];
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox','--disable-setuid-sandbox','--use-gl=angle','--enable-webgl','--ignore-gpu-blocklist'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('requestfailed', r => { const u=r.url(); if(!/fonts|gstatic|googleapis/.test(u)) errors.push('REQFAIL: ' + u); });

  await page.goto('http://localhost:3000/lab-molecules.html', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 700));

  const webgl2 = await page.evaluate(() => {
    const c = document.createElement('canvas');
    return !!c.getContext('webgl2');
  });
  const glLog = await page.evaluate(() => window.__DBG ? 'DBG_OK' : 'NO_DBG');

  const outDir = path.join(__dirname, '');
  async function pin(v){
    await page.evaluate(p => { window.__forceP = p; }, v);
    await new Promise(r => setTimeout(r, 900)); // let a few raf frames render
  }
  async function dbg(){ return await page.evaluate(()=>window.__DBG); }

  // TREE — just before the sky seam (pLife high, pSky ~0)
  await pin(0.665);
  await page.mouse.move(700, 500, {steps:8});
  await new Promise(r=>setTimeout(r,300));
  console.log('tree', JSON.stringify(await dbg()));
  await page.screenshot({ path: path.join(outDir, 'j3-tree.png') });

  // SKY — sun/moon/pyramids/birds (pSky ~0.35)
  await pin(0.80);
  await page.mouse.move(500, 300, {steps:12});
  await new Promise(r=>setTimeout(r,400));
  console.log('sky ', JSON.stringify(await dbg()));
  await page.screenshot({ path: path.join(outDir, 'j3-sky.png') });

  // CITY / rising toward STARS (pSky ~0.80)
  await pin(0.93);
  await page.mouse.move(900, 450, {steps:12});
  await new Promise(r=>setTimeout(r,400));
  console.log('city', JSON.stringify(await dbg()));
  await page.screenshot({ path: path.join(outDir, 'j3-city.png') });

  await pin(0.985);
  await new Promise(r=>setTimeout(r,400));
  console.log('stars', JSON.stringify(await dbg()));
  await page.screenshot({ path: path.join(outDir, 'j3-stars.png') });

  await browser.close();
  console.log('WEBGL2=' + webgl2 + ' ' + glLog);
  console.log('ERROR_COUNT=' + errors.length);
  if (errors.length) console.log(errors.join('\n'));
  process.exit(errors.length ? 1 : 0);
})();
