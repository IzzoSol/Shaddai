const puppeteer = require('puppeteer');
(async () => {
  const errors = [];
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));

  await page.goto('http://localhost:3000/journey.html', { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 500));

  // scroll to water stage (index 2 of 6 -> ~0.40 of scrollable height)
  const info = await page.evaluate(() => {
    const max = document.body.scrollHeight - window.innerHeight;
    return { max, driverH: document.getElementById('driver')?.offsetHeight };
  });
  // water is stage index 2 of 7 -> target ~2.4/6 to sit mid-water
  // stageF = t*6 ; water(i=2) is fully dominant at t=0.333 (scrollY/max).
  // Let the eased scroll settle for a couple seconds.
  await page.evaluate((max) => window.scrollTo(0, Math.round(max * 0.3333)), info.max);
  await new Promise(r => setTimeout(r, 2000));

  const stageLabel = await page.evaluate(() => ({
    idx: document.getElementById('stgIdx')?.textContent,
    name: document.getElementById('stgName')?.textContent
  }));
  // drive mouse across the surface to spawn ripples + warp
  for (let i = 0; i < 12; i++) {
    await page.mouse.move(300 + i * 70, 400 + Math.sin(i) * 120);
    await new Promise(r => setTimeout(r, 40));
  }
  await new Promise(r => setTimeout(r, 300));
  await page.screenshot({ path: 'scripts/water-cymatic.png' });

  // move mouse to a different spot to show ripple distortion elsewhere
  for (let i = 0; i < 10; i++) {
    await page.mouse.move(1100 - i * 40, 300 + i * 30);
    await new Promise(r => setTimeout(r, 40));
  }
  await new Promise(r => setTimeout(r, 300));
  await page.screenshot({ path: 'scripts/water-cymatic-2.png' });

  // ── prove the cursor warps the grid: capture a settled frame, then a frame
  //    with fresh ripples around a fixed point, and pixel-diff a local region ──
  await page.mouse.move(720, 500);
  await new Promise(r => setTimeout(r, 2500)); // let ripples die, pattern settles
  const settled = await page.evaluate(() => {
    const cv = document.getElementById('scene'); const c = cv.getContext('2d');
    return Array.from(c.getImageData(500*window.devicePixelRatio||500, 350, 400, 300).data.filter((_,i)=>i%16===1));
  });
  // now agitate the same region with a burst of pointer moves (spawns ripples)
  for (let i = 0; i < 14; i++) {
    await page.mouse.move(700 + (i%2?18:-18), 500 + (i%3?14:-14));
    await new Promise(r => setTimeout(r, 30));
  }
  await new Promise(r => setTimeout(r, 60));
  const agitated = await page.evaluate(() => {
    const cv = document.getElementById('scene'); const c = cv.getContext('2d');
    return Array.from(c.getImageData(500*window.devicePixelRatio||500, 350, 400, 300).data.filter((_,i)=>i%16===1));
  });
  let diff = 0, n = Math.min(settled.length, agitated.length);
  for (let i = 0; i < n; i++) diff += Math.abs(settled[i] - agitated[i]);
  const avgDiff = diff / n;
  console.log('warp pixel avgDiff (settled vs rippled):', avgDiff.toFixed(3), avgDiff > 1.5 ? '=> VISIBLE DISTORTION' : '=> weak');

  // sample canvas brightness to confirm caustics render (non-flat)
  const stats = await page.evaluate(() => {
    const cv = document.getElementById('scene');
    const c = cv.getContext('2d');
    const d = c.getImageData(0, 0, cv.width, cv.height).data;
    let bright = 0, cyanish = 0, n = 0;
    for (let i = 0; i < d.length; i += 400 * 4) {
      const r = d[i], g = d[i + 1], b = d[i + 2];
      if (g > 120 || b > 120) bright++;
      if (b > r && g > r) cyanish++;
      n++;
    }
    return { brightFrac: bright / n, cyanFrac: cyanish / n };
  });

  console.log('stage at scroll:', JSON.stringify(stageLabel));
  console.log('caustic brightFrac:', stats.brightFrac.toFixed(4), 'cyanFrac:', stats.cyanFrac.toFixed(4));
  console.log('errors:', errors.length ? JSON.stringify(errors, null, 2) : 'NONE');
  await browser.close();
  process.exit(errors.length ? 1 : 0);
})();
