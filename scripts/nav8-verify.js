const puppeteer = require('puppeteer');
const path = require('path');
const URL = 'http://localhost:3000/home.html';
const OUT = __dirname;

(async () => {
  const errors = [];
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('requestfailed', r => {
    const u = r.url();
    if (u.startsWith('http://localhost:3000')) errors.push('REQFAIL: ' + u + ' ' + (r.failure() && r.failure().errorText));
  });

  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await new Promise(r => setTimeout(r, 2500));

  // 1) count mega-nav tabs
  const tabs = await page.$$eval('.bar nav.mega .pillar > button', els => els.map(e => e.textContent.replace(/[▾\s]+$/,'').trim()));
  console.log('TABS (' + tabs.length + '):', JSON.stringify(tabs));

  // 2) open each tab, count visible links
  const tabReport = [];
  for (let i = 0; i < tabs.length; i++) {
    await page.evaluate(idx => {
      document.querySelectorAll('.pillar').forEach(p => p.classList.remove('open'));
      const p = document.querySelectorAll('.bar nav.mega .pillar')[idx];
      p.classList.add('open');
    }, i);
    await new Promise(r => setTimeout(r, 120));
    const links = await page.evaluate(idx => {
      const p = document.querySelectorAll('.bar nav.mega .pillar')[idx];
      const panel = p.querySelector('.panel');
      const vis = panel && getComputedStyle(panel).visibility === 'visible';
      const items = Array.from(panel.querySelectorAll('a, span.soon')).map(a => ({
        t: (a.querySelector('.t') ? a.querySelector('.t').textContent : a.textContent).trim(),
        href: a.tagName === 'A' ? a.getAttribute('href') : '(soon)'
      }));
      return { vis, items };
    }, i);
    tabReport.push({ tab: tabs[i], visible: links.vis, count: links.items.length, items: links.items });
  }
  await page.evaluate(() => document.querySelectorAll('.pillar').forEach(p => p.classList.remove('open')));

  // 3) corner cluster
  const corner = await page.evaluate(() => {
    const c = document.getElementById('cornerCluster');
    if (!c) return null;
    return {
      theme: !!document.getElementById('themeToggle'),
      docs: (() => { const d = document.getElementById('cornerDocs'); return d ? d.getAttribute('href') : null; })(),
      deck: (() => { const d = document.getElementById('cornerDeck'); return d ? d.getAttribute('href') : null; })(),
      ascend: !!document.getElementById('cornerAscend'),
      ascendText: (document.getElementById('cornerAscend') || {}).textContent
    };
  });

  // 4) wordmark home link
  const wordmark = await page.$eval('.bar .mark', a => a.getAttribute('href'));

  // 5) no visible "Descent"
  const visText = await page.evaluate(() => document.body.innerText);
  const descentInText = /descent/i.test(visText);

  // screenshots
  await page.screenshot({ path: path.join(OUT, 'nav8-hero.png') });
  // open Council tab for menu shot
  await page.evaluate(() => { const p = document.querySelectorAll('.bar nav.mega .pillar')[1]; p.classList.add('open'); });
  await new Promise(r => setTimeout(r, 350));
  await page.screenshot({ path: path.join(OUT, 'nav8-menu.png') });
  await page.evaluate(() => document.querySelectorAll('.pillar').forEach(p => p.classList.remove('open')));
  // corner crop
  await page.screenshot({ path: path.join(OUT, 'nav8-corner.png'), clip: { x: 640, y: 0, width: 800, height: 70 } });

  // mobile
  await page.setViewport({ width: 480, height: 900 });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 1500));
  await page.evaluate(() => { const b = document.getElementById('menuBtn'); if (b) b.click(); });
  await new Promise(r => setTimeout(r, 500));
  await page.screenshot({ path: path.join(OUT, 'nav8-mobile.png') });
  const mobileGroups = await page.$$eval('#mobileNav .mgroup .mh', els => els.map(e => e.textContent.trim()));

  await browser.close();

  console.log('\n=== TAB REPORT ===');
  tabReport.forEach(t => console.log(`  ${t.tab} — visible:${t.visible} items:${t.count}\n    ` + t.items.map(i => `${i.t} [${i.href}]`).join('\n    ')));
  console.log('\n=== CORNER ===', JSON.stringify(corner));
  console.log('=== WORDMARK href ===', wordmark);
  console.log('=== "descent" in visible text? ===', descentInText);
  console.log('=== MOBILE GROUPS ===', JSON.stringify(mobileGroups));
  console.log('\n=== ERRORS (' + errors.length + ') ===');
  errors.forEach(e => console.log('  ' + e));
  console.log('\nDONE');
})().catch(e => { console.error('FATAL', e); process.exit(1); });
