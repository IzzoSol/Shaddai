const puppeteer = require('puppeteer');
const path = require('path');
const DIR = __dirname;
(async () => {
  const errs = [];
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  page.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE: ' + m.text()); });
  page.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
  page.on('requestfailed', r => {
    const u = r.url();
    if (!/favicon/.test(u)) errs.push('REQFAIL: ' + u + ' ' + (r.failure() && r.failure().errorText));
  });

  await page.setViewport({ width: 1440, height: 900 });
  await page.goto('http://localhost:3000/create.html', { waitUntil: 'networkidle2', timeout: 45000 });
  await new Promise(r => setTimeout(r, 1200));
  await page.screenshot({ path: path.join(DIR, 'fin-create-hero.png') });

  // current pillar marked?
  const current = await page.$eval('.pillar.current > button', b => b.textContent.trim());
  console.log('CURRENT PILLAR:', current);

  // open each pillar via click, count destination links
  const pillars = await page.$$('.pillar[data-pillar]');
  let totalOpened = 0;
  for (let i = 0; i < pillars.length; i++) {
    // click to open, verify THIS pillar's panel is visible
    const res = await pillars[i].evaluate(p => {
      p.querySelector('button').click();
      return null;
    });
    await new Promise(r => setTimeout(r, 220));
    const info = await pillars[i].evaluate(p => ({
      isOpen: p.classList.contains('open'),
      vis: getComputedStyle(p.querySelector('.panel')).visibility,
      label: p.querySelector('button').textContent.trim(),
      links: [...p.querySelectorAll('.panel a')].length
    }));
    if (info.isOpen && info.vis === 'visible') totalOpened++;
    else console.log('  FAILED open:', info.label);
    // click same button again to close before next
    await pillars[i].evaluate(p => p.querySelector('button').click());
    await new Promise(r => setTimeout(r, 120));
  }
  console.log('PILLARS OPENED OK:', totalOpened, '/', pillars.length);

  // screenshot the CREATE mega-menu open
  await page.$eval('.pillar.current > button', b => b.click());
  await new Promise(r => setTimeout(r, 350));
  await page.screenshot({ path: path.join(DIR, 'fin-create-nav.png') });
  await page.$eval('.pillar.current > button', b => b.click());

  // collect live links present
  const links = await page.$$eval('.panel a[href$=".html"], .panel a[href="/dashboard"]', as => as.map(a => a.getAttribute('href')));
  const createLinks = await page.$$eval('.pillar.current .panel a', as => as.map(a => a.getAttribute('href')));
  console.log('CREATE PANEL LINKS:', JSON.stringify(createLinks));

  // mobile at 480
  await page.setViewport({ width: 480, height: 900 });
  await page.reload({ waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 500));
  const menuBtnVisible = await page.$eval('#menuBtn', b => getComputedStyle(b).display !== 'none');
  await page.click('#menuBtn');
  await new Promise(r => setTimeout(r, 500));
  const mobileOpen = await page.$eval('#mobileNav', n => n.classList.contains('open') && getComputedStyle(n).visibility === 'visible');
  const groups = await page.$$eval('#mobileNav .mgroup .mh', hs => hs.map(h => h.textContent.trim()));
  console.log('MOBILE menuBtn visible:', menuBtnVisible, '| menu opens:', mobileOpen);
  console.log('MOBILE GROUPS:', JSON.stringify(groups));
  await page.screenshot({ path: path.join(DIR, 'fin-create-mobile.png') });

  await browser.close();
  console.log('\nERRORS (' + errs.length + '):');
  errs.forEach(e => console.log('  ' + e));
  process.exit(errs.length ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
