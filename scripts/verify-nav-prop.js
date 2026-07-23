/* Headless verification of the shared nav.js across the 6 wired pages. */
const puppeteer = require('puppeteer');
const path = require('path');

const PAGES = [
  { page: 'agents.html',              active: 'council', shot: 'prop-agents.png'  },
  { page: 'create.html',              active: 'create',  shot: 'prop-create.png'  },
  { page: 'play.html',                active: 'play',    shot: 'prop-play.png'    },
  { page: 'data-api.html',            active: 'markets', shot: 'prop-markets.png' },
  { page: 'aura.html',                active: 'aura',    shot: 'prop-aura.png'    },
  { page: 'marketplace-shop-v2.html', active: 'shop',    shot: 'prop-shop.png'    },
];
const BASE = 'http://localhost:3000/';
const OUT = __dirname;

(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  let firstMenuShot = false;
  const summary = [];

  for (const P of PAGES) {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    const errors = [];
    page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
    page.on('pageerror', e => errors.push('pageerror: ' + e.message));

    await page.goto(BASE + P.page, { waitUntil: 'networkidle2', timeout: 45000 });
    await page.waitForSelector('header.bar.shd-nav', { timeout: 8000 }).catch(()=>{});
    await new Promise(r => setTimeout(r, 700));

    const r = await page.evaluate((activeKey) => {
      const bar = document.querySelector('header.bar.shd-nav');
      const pillars = Array.from(document.querySelectorAll('header.bar.shd-nav .pillar[data-pillar]'));
      const corner = document.querySelector('header.bar.shd-nav #cornerCluster');
      const cornerAscend = document.querySelector('#cornerAscend');
      const cornerDocs = document.querySelector('#cornerDocs');
      const cornerDeck = document.querySelector('#cornerDeck');
      const hasTheme = !!document.querySelector('.cc-theme, #themeToggle');
      const mark = document.querySelector('header.bar.shd-nav a.mark');
      const activePillar = document.querySelector('header.bar.shd-nav .pillar.active');
      return {
        barPresent: !!bar,
        pillarCount: pillars.length,
        pillarLabels: pillars.map(p => (p.querySelector('button')||{}).textContent.trim().replace(/\s+/g,' ')),
        cornerPresent: !!corner,
        cornerAscendTag: cornerAscend ? cornerAscend.tagName : null,
        cornerAscendHref: cornerAscend ? cornerAscend.getAttribute('href') : null,
        cornerDocs: cornerDocs ? cornerDocs.textContent.trim() : null,
        cornerDeck: cornerDeck ? cornerDeck.textContent.trim() : null,
        hasThemeButton: hasTheme,
        wordmarkHref: mark ? mark.getAttribute('href') : null,
        activeKey: activePillar ? activePillar.getAttribute('data-key') : null,
        activeMatches: activePillar ? activePillar.getAttribute('data-key') === activeKey : false,
      };
    }, P.active);

    // open a dropdown to prove it works
    let panelOpened = false;
    try {
      await page.click('header.bar.shd-nav .pillar[data-pillar]:nth-child(1) > button');
      await new Promise(r => setTimeout(r, 450));
      panelOpened = await page.evaluate(() => {
        const p = document.querySelector('header.bar.shd-nav .pillar.open .panel');
        if (!p) return false;
        const vis = getComputedStyle(p).visibility;
        return vis === 'visible';
      });
      if (panelOpened && !firstMenuShot) {
        await page.screenshot({ path: path.join(OUT, 'prop-menu.png') });
        firstMenuShot = true;
      }
      // close it again for the clean top-nav shot
      await page.click('header.bar.shd-nav .pillar[data-pillar]:nth-child(1) > button');
      await new Promise(r => setTimeout(r, 300));
    } catch (e) { errors.push('dropdown-click: ' + e.message); }

    // top-nav screenshot (clip to top strip)
    await page.screenshot({ path: path.join(OUT, P.shot), clip: { x: 0, y: 0, width: 1440, height: 120 } });

    // mobile menu @ 480px
    await page.setViewport({ width: 480, height: 800 });
    await new Promise(r => setTimeout(r, 300));
    let mobileOpens = false;
    try {
      await page.click('#menuBtn');
      await new Promise(r => setTimeout(r, 450));
      mobileOpens = await page.evaluate(() => {
        const m = document.getElementById('mobileNav');
        return !!m && m.classList.contains('open') && getComputedStyle(m).visibility === 'visible';
      });
    } catch (e) { errors.push('mobile-click: ' + e.message); }

    summary.push({ page: P.page, ...r, panelOpened, mobileOpens, errors });
    await page.close();
  }

  await browser.close();
  console.log(JSON.stringify(summary, null, 2));
})().catch(e => { console.error('FATAL', e); process.exit(1); });
