const puppeteer = require('puppeteer');
(async () => {
  const errors = [];
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('requestfailed', r => { const u = r.url(); if (!/fonts|cdnjs|gstatic/.test(u)) errors.push('REQFAIL: ' + u + ' ' + (r.failure() && r.failure().errorText)); });

  // Desktop
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto('http://localhost:3000/play.html', { waitUntil: 'networkidle0', timeout: 30000 });
  await new Promise(r => setTimeout(r, 1200));
  await page.screenshot({ path: 'scripts/fin-play-hero.png' });

  // Open the PLAY mega-nav
  const btns = await page.$$('.pillar[data-pillar] > button');
  // PLAY is the 4th pillar
  await btns[3].click();
  await new Promise(r => setTimeout(r, 600));
  const panelVisible = await page.evaluate(() => {
    const p = document.querySelectorAll('.pillar[data-pillar]')[3].querySelector('.panel');
    return getComputedStyle(p).visibility === 'visible';
  });
  await page.screenshot({ path: 'scripts/fin-play-nav.png' });

  // Mobile 480
  await page.setViewport({ width: 480, height: 900 });
  await page.goto('http://localhost:3000/play.html', { waitUntil: 'networkidle0', timeout: 30000 });
  await new Promise(r => setTimeout(r, 800));
  await page.click('#menuBtn');
  await new Promise(r => setTimeout(r, 500));
  const mobileOpen = await page.evaluate(() => document.getElementById('mobileNav').classList.contains('open'));
  await page.screenshot({ path: 'scripts/fin-play-mobile.png' });

  await browser.close();
  console.log('ERRORS:', errors.length ? JSON.stringify(errors, null, 2) : 'NONE');
  console.log('MEGA-NAV PLAY panel visible:', panelVisible);
  console.log('MOBILE nav opens at 480px:', mobileOpen);
  process.exit(errors.length ? 1 : 0);
})();
