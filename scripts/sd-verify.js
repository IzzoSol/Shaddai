// Headless verify: lab-molecules.html — molecule -> water -> DESERT.
// Confirms 0 console/page errors, WebGL2 acquires, __forceP pins, and
// captures the required water / reveal / dunes / night screenshots.
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
  const dbgAt = {};
  async function shot(name, p, mx, my) {
    await page.evaluate(v => { window.__forceP = v; }, p);
    await page.mouse.move(mx, my);
    await new Promise(r => setTimeout(r, 140));
    await page.mouse.move(mx+70, my-45);
    await new Promise(r => setTimeout(r, 450));
    await page.screenshot({ path: path.join(outDir, name) });
    dbgAt[name] = await page.evaluate(() => window.__DBG || null);
  }

  // seams: mol->water 0.2063, water->desert 0.625
  await shot('sd-water.png',  0.50, 700, 500);  // deep in water beat (unchanged)
  await shot('sd-reveal.png', 0.66, 640, 430);  // pull-back: pool + pyramid + desert
  await shot('sd-dunes.png',  0.82, 620, 380);  // aerial glide over dunes
  await shot('sd-night.png',  0.99, 640, 300);  // tilt up, night stars
  // extra continuity checks
  await shot('sd-molecule.png', 0.10, 520, 360);
  await shot('sd-seamwd.png',   0.635, 640, 440); // right at water->desert seam

  await page.evaluate(() => { window.__forceP = 0.82; });
  const fps = await page.evaluate(() => new Promise(res => {
    let n=0; const t0=performance.now();
    function loop(){ n++; if(performance.now()-t0<2000) requestAnimationFrame(loop); else res(Math.round(n/((performance.now()-t0)/1000))); }
    requestAnimationFrame(loop);
  }));

  console.log('WEBGL2_OK='+glOk);
  console.log('FPS~'+fps+' (swiftshader software raster)');
  Object.keys(dbgAt).forEach(k=>console.log('DBG '+k+'='+JSON.stringify(dbgAt[k])));
  console.log('ERRORS='+errors.length);
  errors.forEach(e=>console.log('  '+e));
  await browser.close();
  process.exit(errors.length? 1 : 0);
})();
