const puppeteer = require('puppeteer');
const path = require('path');

(async () => {
  const errors = [];
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox','--disable-setuid-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  page.on('console', m => { const t=m.text(); if (m.type()==='error') errors.push('CONSOLE: '+t); if(/WebGL2 acquired|shader compile error|link error/.test(t)) console.log('LOG:',t); });
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));

  await page.goto('http://localhost:3000/lab-molecules.html', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 800));

  // did WebGL2 acquire / fallback shown?
  const info = await page.evaluate(()=>({
    fallback: getComputedStyle(document.getElementById('fallback')).display,
    hasGL: !!document.getElementById('gl').getContext,
    dbg: window.__DBG || null
  }));
  console.log('fallback-display=', info.fallback, ' dbg=', JSON.stringify(info.dbg));

  const outDir = path.join(__dirname, '');
  async function pin(p, mx, my){
    await page.evaluate((pp)=>{ window.__forceP = pp; }, p);
    if(mx!==undefined){ await page.mouse.move(mx,my,{steps:12}); }
    await new Promise(r=>setTimeout(r, 900));
  }
  async function shot(name){ await page.screenshot({ path: path.join(outDir, name) }); const d=await page.evaluate(()=>window.__DBG); console.log(name,'=>',JSON.stringify(d)); }

  // MOLECULE (p ~ 0.10)
  await pin(0.10, 720, 450); await shot('j4-molecule.png');
  // WATER (p ~ 0.31 -> pWater ~ 0.5), ripple with mouse
  await pin(0.31, 500, 640); await page.mouse.move(950, 600, {steps:20}); await new Promise(r=>setTimeout(r,600)); await shot('j4-water.png');
  // DIRT (p ~ 0.44 -> pDirt ~ 0.5)
  await pin(0.44, 700, 620); await shot('j4-dirt.png');
  // GRASS (p ~ 0.60 -> pLife mid grass)
  await pin(0.60, 600, 700); await page.mouse.move(1000, 650, {steps:20}); await new Promise(r=>setTimeout(r,500)); await shot('j4-grass.png');
  // SKY (p ~ 0.90)
  await pin(0.90, 720, 300); await shot('j4-sky.png');

  await browser.close();
  console.log('ERROR_COUNT=' + errors.length);
  if (errors.length) console.log(errors.join('\n'));
  process.exit(errors.length ? 1 : 0);
})();
