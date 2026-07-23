// Verify lab-bird.html: 0 errors, WebGL2 acquires, 3 forced-p screenshots.
const puppeteer = require('puppeteer');
(async () => {
  const errors = [];
  const browser = await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--enable-unsafe-swiftshader',
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--ignore-gpu-blocklist'
    ]
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));

  await page.goto('http://localhost:3000/lab-bird.html', { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 600));

  const diag = await page.evaluate(() => {
    const cv = document.getElementById('gl');
    let ok = false, ver = '';
    try {
      const g = cv.getContext('webgl2');
      ok = !!g;
      if (g) ver = g.getParameter(g.VERSION);
    } catch (e) {}
    return {
      webgl2: ok, version: ver,
      ready: !!window.__labBirdReady,
      fallbackShown: getComputedStyle(document.getElementById('fallback')).display !== 'none'
    };
  });

  async function shoot(p, name, movePath) {
    await page.evaluate(v => { window.__forceP = v; }, p);
    await new Promise(r => setTimeout(r, 500));
    if (movePath) {
      for (let i = 0; i < 14; i++) {
        await page.mouse.move(400 + i * 60, 450 + Math.sin(i * 0.6) * 200);
        await new Promise(r => setTimeout(r, 30));
      }
      await page.mouse.down(); await page.mouse.up();
      await new Promise(r => setTimeout(r, 250));
    }
    await page.screenshot({ path: 'scripts/' + name });
    return true;
  }

  await shoot(0.15, 'bird-dive.png', true);    // descending toward water
  await shoot(0.43, 'bird-splash.png', true);  // hitting water, ripples
  await shoot(0.80, 'bird-sky.png', true);     // rising into sky

  console.log('=== lab-bird verify ===');
  console.log('WebGL2 acquired :', diag.webgl2, '(' + diag.version + ')');
  console.log('ready flag      :', diag.ready);
  console.log('fallback shown  :', diag.fallbackShown);
  console.log('errors          :', errors.length);
  errors.forEach(e => console.log('  ' + e));
  console.log('screenshots     : bird-dive.png, bird-splash.png, bird-sky.png');

  await browser.close();
  process.exit(errors.length ? 1 : 0);
})();
