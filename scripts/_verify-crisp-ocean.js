// Headless verify: load journey.html, scroll to the ocean beat (~30%), move
// the mouse to trigger ripples, screenshot, assert 0 page errors.
const puppeteer = require('puppeteer');
const path = require('path');

(async () => {
  const errors = [];
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--use-gl=swiftshader',
           '--enable-webgl', '--ignore-gpu-blocklist']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });

  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });
  page.on('requestfailed', r => {
    const u = r.url();
    if (/water-hd\.jpg|scene-water\.js|journey\.html/.test(u))
      errors.push('requestfailed: ' + u + ' ' + (r.failure() && r.failure().errorText));
  });

  await page.goto('http://localhost:3000/journey.html', { waitUntil: 'domcontentloaded', timeout: 45000 });

  // wait for descent scenes + water scene registered
  await page.waitForFunction(() =>
    window.__DESCENT && window.__DESCENT.scenes &&
    window.__DESCENT.scenes.some(s => s.id === 'water'), { timeout: 15000 });

  // scroll to ~30% of the journey (the ocean beat)
  await page.evaluate(() => {
    const doc = document.documentElement;
    const max = doc.scrollHeight - window.innerHeight;
    window.scrollTo(0, Math.round(max * 0.30));
  });
  await new Promise(r => setTimeout(r, 700));

  // move the mouse fast across the canvas to drive ripples
  for (let i = 0; i <= 12; i++) {
    await page.mouse.move(300 + i * 70, 380 + Math.sin(i) * 90);
    await new Promise(r => setTimeout(r, 30));
  }
  await new Promise(r => setTimeout(r, 500));

  // report which scene is active + whether the photo loaded
  const info = await page.evaluate(() => {
    const s = window.__DESCENT.scenes.find(x => x.id === 'water');
    return { hasWater: !!s, label: s && s.label };
  });

  const out = path.join(__dirname, 'shot-crisp-ocean.png');
  await page.screenshot({ path: out });

  await browser.close();

  console.log('WATER SCENE:', JSON.stringify(info));
  console.log('SCREENSHOT:', out);
  console.log('ERRORS(' + errors.length + '):');
  errors.forEach(e => console.log('  - ' + e));
  process.exit(errors.length === 0 ? 0 : 1);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
