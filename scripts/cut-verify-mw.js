// Headless verify: lab-molecules.html cut to molecule + water only.
const puppeteer = require('puppeteer');
const path = require('path');

(async () => {
  const errors = [];
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader',
           '--no-sandbox','--disable-setuid-sandbox','--window-size=1280,800']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });

  page.on('console', m => { if (m.type()==='error') errors.push('CONSOLE: '+m.text()); });
  page.on('pageerror', e => errors.push('PAGEERROR: '+e.message));
  page.on('requestfailed', r => errors.push('REQFAIL: '+r.url()+' '+(r.failure()&&r.failure().errorText)));

  await page.goto('http://localhost:3000/lab-molecules.html', { waitUntil:'networkidle2', timeout:60000 });
  await new Promise(r => setTimeout(r, 1500));

  const glOk = await page.evaluate(() => {
    const c = document.getElementById('gl');
    return !!(c && c.getContext && c.getContext('webgl2'));
  });

  const outDir = path.join(__dirname);
  async function shot(name, p, mx, my) {
    await page.evaluate(v => { window.__forceP = v; }, p);
    await page.mouse.move(mx, my);
    await new Promise(r => setTimeout(r, 120));
    await page.mouse.move(mx+60, my-40);
    await new Promise(r => setTimeout(r, 400));
    await page.screenshot({ path: path.join(outDir, name) });
  }

  await shot('cut-molecule.png', 0.10, 520, 360);
  await shot('cut-water.png',    0.62, 700, 500);
  await shot('cut-end.png',      1.00, 640, 420);

  const dbg = await page.evaluate(() => window.__DBG || null);

  await page.evaluate(() => { window.__forceP = 0.62; });
  const fps = await page.evaluate(() => new Promise(res => {
    let n=0; const t0=performance.now();
    function loop(){ n++; if(performance.now()-t0<2000) requestAnimationFrame(loop); else res(Math.round(n/((performance.now()-t0)/1000))); }
    requestAnimationFrame(loop);
  }));

  console.log('WEBGL2_OK='+glOk);
  console.log('DBG='+JSON.stringify(dbg));
  console.log('FPS~'+fps);
  console.log('ERRORS='+errors.length);
  errors.forEach(e=>console.log('  '+e));
  await browser.close();
  process.exit(errors.length? 1 : 0);
})();
