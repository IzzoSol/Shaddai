import puppeteer from 'puppeteer';

const URL = 'http://localhost:3000/lab-molecules.html';
const errors = [];
const logs = [];

const browser = await puppeteer.launch({
  headless: 'new',
  args: [
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist',
    '--no-sandbox',
    '--window-size=1600,900'
  ]
});

const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 900, deviceScaleFactor: 1 });

page.on('console', m => {
  const t = m.type();
  logs.push(`[${t}] ${m.text()}`);
  if (t === 'error') errors.push('console.error: ' + m.text());
});
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('requestfailed', r => {
  // ignore favicon
  if (!r.url().includes('favicon')) errors.push('requestfailed: ' + r.url() + ' ' + (r.failure()?.errorText||''));
});

await page.goto(URL, { waitUntil: 'networkidle2', timeout: 60000 });

// give the render loop time to run + ease
await new Promise(r => setTimeout(r, 2500));

// probe WebGL2 + fallback state
const state = await page.evaluate(() => {
  const c = document.getElementById('gl');
  const gl2 = c && c.getContext('webgl2');
  const fb = document.getElementById('fallback');
  const fbShown = fb && getComputedStyle(fb).display !== 'none';
  return {
    webgl2Present: !!gl2,
    canvasW: c ? c.width : 0,
    canvasH: c ? c.height : 0,
    fallbackShown: fbShown
  };
});

// move mouse to first spot, screenshot
await page.mouse.move(500, 350);
await new Promise(r => setTimeout(r, 1200));
await page.screenshot({ path: 'scripts/lab-molecules.png' });

// move mouse to a different spot, screenshot
await page.mouse.move(1150, 600);
await page.mouse.down(); await page.mouse.up(); // trigger excite
await new Promise(r => setTimeout(r, 1200));
await page.screenshot({ path: 'scripts/lab-molecules-2.png' });

await browser.close();

console.log('=== VERIFY: lab-molecules.html ===');
console.log('WebGL2 context acquired :', state.webgl2Present);
console.log('Canvas backing size    :', state.canvasW + 'x' + state.canvasH);
console.log('Fallback shown         :', state.fallbackShown);
console.log('Console/page errors    :', errors.length);
if (errors.length) errors.forEach(e => console.log('   ! ' + e));
console.log('--- relevant logs ---');
logs.filter(l => l.includes('QuantumLattice')).forEach(l => console.log('   ' + l));
console.log('Screenshots: scripts/lab-molecules.png , scripts/lab-molecules-2.png');
console.log(errors.length === 0 && state.webgl2Present ? 'RESULT: PASS' : 'RESULT: CHECK');
