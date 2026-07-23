const puppeteer = require('puppeteer');
(async () => {
  const errs = [];
  const browser = await puppeteer.launch({ headless: 'new', args:['--no-sandbox'] });
  const page = await browser.newPage();
  page.on('console', m => { if (m.type()==='error') errs.push('CONSOLE: '+m.text()); });
  page.on('pageerror', e => errs.push('PAGEERROR: '+e.message));
  page.on('requestfailed', r => { const u=r.url(); if(/localhost:3000/.test(u)) errs.push('REQFAIL: '+u+' '+r.failure()?.errorText); });

  await page.setViewport({ width:1440, height:900 });
  await page.goto('http://localhost:3000/intelligence.html', { waitUntil:'networkidle0', timeout:30000 });
  await new Promise(r=>setTimeout(r,1500));
  await page.screenshot({ path:'scripts/fin-intel-hero.png' });

  // open the Intelligence mega-nav (current pillar = 5th)
  const opened = await page.evaluate(() => {
    const pillars = document.querySelectorAll('.pillar[data-pillar] > button');
    const intel = Array.from(pillars).find(b => /intelligence/i.test(b.textContent));
    if(!intel) return false;
    intel.click();
    return intel.closest('.pillar').classList.contains('open');
  });
  await new Promise(r=>setTimeout(r,600));
  await page.screenshot({ path:'scripts/fin-intel-nav.png' });

  // ledger readout
  const ledger = await page.evaluate(() => ({
    hit: document.getElementById('rHit')?.textContent,
    tok: document.getElementById('rTok')?.textContent,
    pull: document.getElementById('rPull')?.textContent,
    uses: document.getElementById('rUses')?.textContent,
    state: document.getElementById('ledgerState')?.textContent,
    methods: document.getElementById('methods')?.children.length
  }));
  // scroll to ledger for screenshot
  await page.evaluate(() => document.getElementById('ledger').scrollIntoView());
  await new Promise(r=>setTimeout(r,1400));
  await page.screenshot({ path:'scripts/fin-intel-ledger.png' });

  // mobile 480px
  await page.setViewport({ width:480, height:900 });
  await page.goto('http://localhost:3000/intelligence.html', { waitUntil:'networkidle0', timeout:30000 });
  await new Promise(r=>setTimeout(r,800));
  const mob = await page.evaluate(() => {
    const btn=document.getElementById('menuBtn');
    const visible = btn && getComputedStyle(btn).display !== 'none';
    if(visible) btn.click();
    return { btnVisible:visible, navOpen: document.getElementById('mobileNav').classList.contains('open') };
  });
  await new Promise(r=>setTimeout(r,500));
  await page.screenshot({ path:'scripts/fin-intel-mobile.png' });

  await browser.close();
  console.log('ERRORS:', errs.length ? errs : 'NONE');
  console.log('NAV_OPENED:', opened);
  console.log('LEDGER:', JSON.stringify(ledger));
  console.log('MOBILE:', JSON.stringify(mob));
})().catch(e=>{ console.error('FATAL', e); process.exit(1); });
