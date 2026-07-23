// Headless verification for lab-molecules.html CLEAN+DETAIL pass.
// Captures molecule / water / desert / night via window.__forceP.
// swiftshader is slow: force rAF frames, generous waits, per-shot resilient.
const puppeteer = require('puppeteer');

const URL = 'http://localhost:3000/lab-molecules.html';
const ONLY = process.argv[2]; // optional single shot name to run just one
const ALL = [
  { name: 'cl-molecule', p: 0.10 },
  { name: 'cl-water',    p: 0.45 },
  { name: 'cl-desert',   p: 0.72 },
  { name: 'cl-night',    p: 0.97 },
];
const SHOTS = ONLY ? ALL.filter(s => s.name === 'cl-' + ONLY || s.name === ONLY) : ALL;

// pump N animation frames so time-based shader anim + forceP settle even under
// heavy rAF throttling in headless.
async function pump(page, n) {
  await page.evaluate((count) => new Promise(res => {
    let i = 0;
    function step(){ if (i++ >= count) return res(); requestAnimationFrame(step); }
    requestAnimationFrame(step);
  }), n);
}

(async () => {
  const errors = [];
  const browser = await puppeteer.launch({
    headless: 'new',
    userDataDir: require('path').join(require('os').tmpdir(), 'cl-prof-' + Date.now()),
    args: [
      '--no-sandbox','--disable-setuid-sandbox',
      '--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader',
      '--window-size=1280,800'
    ]
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE:'+m.text()); });
  page.on('pageerror', e => errors.push('PAGEERROR:'+e.message));

  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await pump(page, 20);

  const glOk = await page.evaluate(() => {
    const c = document.getElementById('gl');
    return !!(c && c.getContext('webgl2'));
  });

  for (const s of SHOTS) {
    await page.evaluate(p => { window.__forceP = p; }, s.p);
    await pump(page, 25);              // force frames so the pinned p renders
    const pinned = await page.evaluate(() => (window.__DBG ? window.__DBG.p : null));
    await page.screenshot({ path: 'scripts/' + s.name + '.png' });
    console.log(`shot ${s.name}: forceP=${s.p} pinned=${pinned}`);
  }

  console.log('WebGL2 acquired:', glOk);
  console.log('errors:', errors.length ? JSON.stringify(errors, null, 2) : 'NONE');
  await browser.close();
  process.exit(errors.length ? 2 : 0);
})().catch(e => { console.error('HARNESS FAIL:', e); process.exit(3); });
