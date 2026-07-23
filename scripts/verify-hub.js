const puppeteer = require('puppeteer');
(async () => {
  const errors = [];
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('requestfailed', r => { const u=r.url(); if(!/favicon/.test(u)) errors.push('REQFAIL: '+u+' '+(r.failure()&&r.failure().errorText)); });

  await page.setViewport({ width: 1440, height: 900 });
  await page.goto('http://localhost:3000/home.html', { waitUntil: 'networkidle2' });
  await new Promise(r=>setTimeout(r,1200));
  await page.screenshot({ path: 'scripts/hub-hero.png' });

  // open a mega-menu (The Council = 2nd pillar) via click
  await page.evaluate(() => { document.querySelectorAll('.pillar[data-pillar] > button')[1].click(); });
  await new Promise(r=>setTimeout(r,600));
  const navOpen = await page.evaluate(() => document.querySelectorAll('.pillar.open .panel a').length);
  await page.screenshot({ path: 'scripts/hub-nav-open.png' });
  console.log('mega-menu rows visible:', navOpen);

  // close menus, open the descent player
  await page.evaluate(() => document.body.click());
  await page.evaluate(() => document.querySelector('.descent-btn').click());
  await new Promise(r=>setTimeout(r,900));
  const playerOpen = await page.evaluate(() => {
    const p=document.getElementById('descentPlayer');
    return { open: p.classList.contains('open'), hasIframe: !!p.querySelector('iframe'), src: p.querySelector('iframe')&&p.querySelector('iframe').getAttribute('src') };
  });
  await page.screenshot({ path: 'scripts/hub-descent-overlay.png' });
  console.log('descent player:', JSON.stringify(playerOpen));

  // exit restores landing
  await page.evaluate(() => document.getElementById('descentExit').click());
  await new Promise(r=>setTimeout(r,600));
  const restored = await page.evaluate(() => !document.body.classList.contains('player-open'));
  console.log('landing restored after exit:', restored);

  // mobile 480px menu — fresh page (avoid the still-animating descent iframe)
  await page.setViewport({ width: 480, height: 900 });
  await page.goto('http://localhost:3000/home.html', { waitUntil: 'domcontentloaded' });
  await new Promise(r=>setTimeout(r,1200));
  await page.evaluate(() => document.getElementById('menuBtn').click());
  await new Promise(r=>setTimeout(r,600));
  const mobileOpen = await page.evaluate(() => document.getElementById('mobileNav').classList.contains('open'));
  await page.screenshot({ path: 'scripts/hub-mobile.png' });
  console.log('mobile menu open:', mobileOpen);

  await browser.close();
  console.log('\n=== ERRORS ('+errors.length+') ===');
  errors.forEach(e=>console.log(e));
  process.exit(errors.length ? 1 : 0);
})();
