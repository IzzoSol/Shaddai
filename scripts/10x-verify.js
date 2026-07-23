const puppeteer = require('puppeteer');
const path = require('path');

(async () => {
  const errors = [];
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox','--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('requestfailed', r => { const u=r.url(); if(!/fonts|gstatic|googleapis/.test(u)) errors.push('REQFAIL: ' + u); });

  await page.goto('http://localhost:3000/journey.html', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 500));

  const outDir = path.join(__dirname, '');
  // helper: set scroll fraction of the driver
  async function scrollTo(frac){
    await page.evaluate(f => {
      const d = document.getElementById('driver');
      const max = d.offsetHeight - window.innerHeight;
      window.scrollTo(0, max*f);
      window.dispatchEvent(new Event('scroll'));
    }, frac);
    await new Promise(r => setTimeout(r, 1400)); // let smoothing + raf settle
  }
  async function stageOf(){ return await page.evaluate(()=>window.__journey.stage); }

  // full scroll sweep to exercise all stages
  for (let f=0; f<=1.001; f+=0.05){ await scrollTo(Math.min(1,f)); }

  // GRASS stage ~ 1/6
  await scrollTo(1/6 + 0.02);
  let s = await stageOf();
  // mouse move across grass to trigger reaction
  await page.mouse.move(300, 700);
  await new Promise(r=>setTimeout(r,150));
  await page.mouse.move(1100, 650, {steps: 20});
  await new Promise(r=>setTimeout(r,400));
  await page.screenshot({ path: path.join(outDir, '10x-grass.png') });
  console.log('grass stage index=', s);

  // SUN & MOON (horizon) ~ 3/6, sweep within stage for day->night
  await scrollTo(3/6 + 0.015);   // horizon dominant (stageF~3.1), day/sun side
  s = await stageOf();
  await page.mouse.move(720, 300, {steps:10});
  await new Promise(r=>setTimeout(r,500));
  const tv = await page.evaluate(()=>window.__journey.t);
  await page.screenshot({ path: path.join(outDir, '10x-sunmoon.png') });
  console.log('sunmoon stage index=', s, 't=', tv.toFixed(3));
  await scrollTo(3/6 + 0.045);  // deeper = dusk/night
  await page.screenshot({ path: path.join(outDir, '10x-sunmoon-night.png') });

  // COSMOS / PLANETS ~ 4.4/6 (mid-band so planets are passing)
  await scrollTo(4.45/6);
  s = await stageOf();
  await page.mouse.move(600, 450, {steps:10});
  await new Promise(r=>setTimeout(r,500));
  await page.screenshot({ path: path.join(outDir, '10x-cosmos.png') });
  console.log('cosmos stage index=', s);

  // arrival hover glitch
  await scrollTo(1);
  await new Promise(r=>setTimeout(r,400));
  const gl = await page.$('#glitch');
  if (gl){ const box = await gl.boundingBox(); if(box){ await page.mouse.move(box.x+box.width/2, box.y+box.height/2, {steps:8}); await new Promise(r=>setTimeout(r,300)); } }

  await browser.close();
  console.log('ERROR_COUNT=' + errors.length);
  if (errors.length) console.log(errors.join('\n'));
  process.exit(errors.length ? 1 : 0);
})();
