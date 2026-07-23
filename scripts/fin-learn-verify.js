const puppeteer = require('puppeteer');
(async () => {
  const errors = [];
  const browser = await puppeteer.launch({ headless: 'new', args:['--no-sandbox'] });
  const page = await browser.newPage();
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('requestfailed', r => { const u=r.url(); if(!/favicon/.test(u)) errors.push('REQFAIL: ' + u + ' ' + (r.failure()&&r.failure().errorText)); });

  // Desktop hero
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto('http://localhost:3000/learn.html', { waitUntil: 'networkidle2', timeout: 60000 });
  await new Promise(r=>setTimeout(r,1200));
  await page.screenshot({ path: 'scripts/fin-learn-hero.png' });

  // Open the Learn mega-nav (current pillar = last)
  const opened = await page.evaluate(() => {
    const pillars = document.querySelectorAll('.pillar[data-pillar]');
    const learn = pillars[pillars.length-1];
    const btn = learn.querySelector('button'); btn.click();
    return learn.classList.contains('open');
  });
  await new Promise(r=>setTimeout(r,600));
  await page.screenshot({ path: 'scripts/fin-learn-nav.png' });

  // Verify every pillar opens
  const allOpen = await page.evaluate(() => {
    const pillars = [...document.querySelectorAll('.pillar[data-pillar]')];
    let ok = true;
    pillars.forEach(p => {
      const b = p.querySelector('button'); b.click();
      if(!p.classList.contains('open')) ok = false;
      b.click();
    });
    return ok;
  });

  // Mobile at 480px
  await page.setViewport({ width: 480, height: 900 });
  await page.reload({ waitUntil: 'networkidle2' });
  await new Promise(r=>setTimeout(r,800));
  const mob = await page.evaluate(() => {
    document.getElementById('menuBtn').click();
    return document.getElementById('mobileNav').classList.contains('open');
  });
  await new Promise(r=>setTimeout(r,500));
  await page.screenshot({ path: 'scripts/fin-learn-mobile.png' });

  await browser.close();
  console.log('learnPillarOpened:', opened);
  console.log('allPillarsOpen:', allOpen);
  console.log('mobileMenuOpens:', mob);
  console.log('errorCount:', errors.length);
  errors.forEach(e => console.log('  ' + e));
  process.exit(errors.length ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
