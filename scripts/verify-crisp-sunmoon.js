/* Headless verify for scene-earth (SUN & MOON crisp day↔night beat).
 * Loads journey.html, scrolls so the 'earth' scene is ~50% local, screenshots,
 * and asserts 0 console/page errors. */
const puppeteer = require('puppeteer');
const path = require('path');

(async () => {
  const errors = [];
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });

  page.on('console', m => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('requestfailed', r => {
    const u = r.url();
    if (u.includes('/js/descent/') || u.includes('earth-hd')) errors.push('requestfailed: ' + u + ' ' + (r.failure() && r.failure().errorText));
  });

  await page.goto('http://localhost:3000/journey.html', { waitUntil: 'domcontentloaded', timeout: 60000 });

  // wait for scenes to register
  await page.waitForFunction(() => window.__DESCENT && window.__DESCENT.scenes && window.__DESCENT.scenes.length >= 7, { timeout: 15000 });

  const earthIdx = await page.evaluate(() => window.__DESCENT.scenes.findIndex(s => s.id === 'earth'));
  const total = await page.evaluate(() => window.__DESCENT.scenes.length);

  // Each beat spans 1/total of the scrollable range; target midpoint of earth beat.
  const targetFrac = (earthIdx + 0.5) / total;
  await page.evaluate((frac) => {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    window.scrollTo(0, Math.round(max * frac));
  }, targetFrac);

  // let the render loop advance + photo lazy-load (headless decode can be slow)
  await new Promise(r => setTimeout(r, 8000));

  // report what the shell thinks is active
  const info = await page.evaluate(() => ({
    scrollY: window.scrollY,
    maxScroll: document.documentElement.scrollHeight - window.innerHeight,
    label: (document.getElementById('label') || {}).textContent,
    photoOk: (function(){ try { return null; } catch(e){ return null; } })()
  }));

  // probe: fetch the asset as a blob + decode to confirm it's a real image in-page
  const probe = await page.evaluate(async () => {
    try {
      const resp = await fetch('/assets/journey/earth-hd.jpg', { cache: 'no-store' });
      const blob = await resp.blob();
      const bmp = await createImageBitmap(blob);
      return { ok: bmp.width > 0, status: resp.status, type: blob.type, w: bmp.width, h: bmp.height };
    } catch (e) { return { ok: false, err: String(e) }; }
  });
  console.log('photo probe: ' + JSON.stringify(probe));

  const outPath = path.join(__dirname, 'shot-crisp-sunmoon.png');
  await page.screenshot({ path: outPath });

  console.log('earthIdx=' + earthIdx + '/' + total + '  targetFrac=' + targetFrac.toFixed(3));
  console.log('scrollY=' + info.scrollY + '/' + info.maxScroll + '  label=' + JSON.stringify(info.label));
  console.log('screenshot -> ' + outPath);
  console.log('errors=' + errors.length);
  if (errors.length) errors.forEach(e => console.log('  ' + e));

  await browser.close();
  process.exit(errors.length ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
