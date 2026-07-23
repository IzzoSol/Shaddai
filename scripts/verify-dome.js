// Headless verify for lab-dome.html — captures constellation-dome states.
// Run: node scripts/verify-dome.js  (server must be up on :3000)
const puppeteer = require('puppeteer');
const path = require('path');

const URL = 'http://localhost:3000/lab-dome.html';
const OUT = __dirname;

(async () => {
  const errors = [];
  const browser = await puppeteer.launch({
    headless: 'new',
    args: [
      '--enable-unsafe-swiftshader',
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--window-size=1600,900'
    ]
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 900, deviceScaleFactor: 1 });

  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('requestfailed', r => errors.push('REQFAIL: ' + r.url()));

  await page.goto(URL, { waitUntil: 'networkidle0', timeout: 30000 });

  // WebGL2 check
  const webgl2 = await page.evaluate(() => {
    const c = document.getElementById('gl');
    return !!(c && c.getContext && c.getContext('webgl2'));
  });

  const sleep = ms => new Promise(r => setTimeout(r, ms));

  async function shot(name, p, mx, my) {
    await page.evaluate((pp, x, y) => {
      window.__forceP = pp;
      window.__forceMouse = { x: x, y: y };
    }, p, mx, my);
    await sleep(700); // let animation + easing settle a few frames
    await page.screenshot({ path: path.join(OUT, name) });
  }

  // dome-rise: constellations growing (mid rise), centered look
  await shot('dome-rise.png', 0.45, 0.0, 0.0);
  // dome-full: fully under the dome overhead, centered
  await shot('dome-full.png', 1.0, 0.0, 0.0);
  // dome-look: full dome but mouse rotated to a different part of the sky
  await shot('dome-look.png', 1.0, 0.75, 0.35);

  const dbg = await page.evaluate(() => window.__DBG || null);

  console.log('--- VERIFY lab-dome.html ---');
  console.log('WebGL2 acquired :', webgl2);
  console.log('__DBG           :', JSON.stringify(dbg));
  console.log('errors          :', errors.length);
  errors.forEach(e => console.log('  ' + e));
  console.log('screenshots     : dome-rise.png, dome-full.png, dome-look.png');

  await browser.close();
  process.exit(errors.length ? 1 : 0);
})().catch(e => { console.error('HARNESS FAILURE:', e); process.exit(2); });
