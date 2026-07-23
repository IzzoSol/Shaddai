// SEAM A verification: molecule -> water -> bird continuous journey.
const puppeteer = require('puppeteer');

(async () => {
  const errors = [];
  const logs = [];
  const browser = await puppeteer.launch({
    headless: 'new',
    args: [
      '--enable-unsafe-swiftshader',
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--no-sandbox',
      '--disable-setuid-sandbox',
    ],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });

  page.on('console', (m) => {
    const t = m.text();
    logs.push('[' + m.type() + '] ' + t);
    if (m.type() === 'error') errors.push('CONSOLE ERROR: ' + t);
  });
  page.on('pageerror', (e) => errors.push('PAGE ERROR: ' + e.message));

  await page.goto('http://localhost:3000/lab-molecules.html', { waitUntil: 'networkidle0' });
  await new Promise((r) => setTimeout(r, 1200));

  // WebGL2 + debug hook present?
  const info = await page.evaluate(() => {
    const c = document.getElementById('gl');
    let gl2 = false;
    try { gl2 = !!c.getContext('webgl2'); } catch (e) {}
    const fb = document.getElementById('fallback');
    const fallbackShown = fb && getComputedStyle(fb).display !== 'none';
    return {
      gl2,
      fallbackShown,
      hasForceP: typeof window.__forceP !== 'undefined' || 'settable',
      dbg: window.__DBG || null,
    };
  });

  async function shot(p, file) {
    await page.evaluate((pv) => { window.__forceP = pv; }, p);
    await new Promise((r) => setTimeout(r, 1100)); // let time-based anim settle a few frames
    const dbg = await page.evaluate(() => window.__DBG); // read AFTER frames ran
    await page.screenshot({ path: 'scripts/' + file });
    return dbg;
  }

  const dW = await shot(0.40, 'sa-water.png');   // deep in the held water beat
  const dD = await shot(0.71, 'sa-dive.png');    // bird impact / splash into SAME pool (pBird~0.45)
  const dS = await shot(0.97, 'sa-sky.png');     // bird risen to a point in star sky
  const dMol = await shot(0.10, 'sa-molecule.png'); // molecule unchanged sanity

  console.log('=== SEAM A VERIFY ===');
  console.log('WebGL2 acquired:', info.gl2);
  console.log('Fallback shown:', info.fallbackShown);
  console.log('water  p=0.40 DBG:', JSON.stringify(dW));
  console.log('dive   p=0.62 DBG:', JSON.stringify(dD));
  console.log('sky    p=0.90 DBG:', JSON.stringify(dS));
  console.log('mol    p=0.10 DBG:', JSON.stringify(dMol));
  console.log('errors count:', errors.length);
  errors.forEach((e) => console.log('  ' + e));
  // print any shader-related logs
  logs.filter((l) => /shader|link|WebGL2 acquired|QuantumLattice/i.test(l)).forEach((l) => console.log('LOG', l));

  await browser.close();
  process.exit(errors.length ? 1 : 0);
})().catch((e) => { console.error('HARNESS FAIL', e); process.exit(2); });
