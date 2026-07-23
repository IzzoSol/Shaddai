const puppeteer = require('puppeteer');
const path = require('path');

(async () => {
  const errors = [];
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox','--disable-setuid-sandbox','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader','--ignore-gpu-blocklist','--enable-webgl','--enable-webgl2-compute-context']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('requestfailed', r => { const u=r.url(); if(!/fonts|gstatic|googleapis/.test(u)) errors.push('REQFAIL: ' + u); });

  await page.goto('http://localhost:3000/lab-molecules.html', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 800));

  // confirm WebGL2 acquired
  const glInfo = await page.evaluate(() => {
    const c = document.getElementById('gl');
    const g = c && c.getContext('webgl2');
    const fb = document.getElementById('fallback');
    return { hasGL2: !!g, fallbackShown: fb && getComputedStyle(fb).display !== 'none' };
  });
  console.log('WebGL2 acquired=', glInfo.hasGL2, ' fallbackShown=', glInfo.fallbackShown);

  const outDir = path.join(__dirname, '');
  async function shot(p, name){
    await page.evaluate(v => { window.__forceP = v; }, p);
    await new Promise(r => setTimeout(r, 700));
    // nudge mouse to activate reactions
    await page.mouse.move(700, 500, {steps:8});
    await new Promise(r => setTimeout(r, 500));
    const dbg = await page.evaluate(()=>window.__DBG);
    await page.screenshot({ path: path.join(outDir, name) });
    console.log(name, 'p='+p, JSON.stringify(dbg));
  }

  await shot(0.34, 'lift-water.png');   // WATER (must be unchanged)
  await shot(0.50, 'lift-dirt.png');    // DIRT
  await shot(0.646, 'lift-grass.png');  // GRASS (peak growB, before tree)
  await shot(0.73, 'lift-tree.png');    // TREE
  await shot(0.85, 'lift-sky.png');     // SKY

  await browser.close();
  console.log('ERROR_COUNT=' + errors.length);
  if (errors.length) console.log(errors.join('\n'));
  process.exit(errors.length ? 1 : 0);
})();
