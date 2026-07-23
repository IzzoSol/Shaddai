// _swi.js — screenshot each interior room type via puppeteer-core + system Chrome
const puppeteer = require('puppeteer-core');
const os = require('os');
const path = require('path');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const HERE = __dirname.replace(/\\/g, '/');
const URL = 'file:///' + HERE + '/_interiors-test.html';
const TYPES = ['home', 'shop', 'office', 'agent'];

(async () => {
  const errors = [];
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    userDataDir: path.join(os.tmpdir(), 'ppint' + Date.now()),
    args: ['--no-sandbox', '--disable-gpu', '--force-color-profile=srgb', '--window-size=1280,900'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
  page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));

  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForFunction('window.__ready === true', { timeout: 8000 });

  // grid shot first
  await new Promise(r => setTimeout(r, 400));
  await page.screenshot({ path: path.join(__dirname, '_interiors-grid.png') });

  for (const t of TYPES) {
    await page.evaluate(ty => window.__setRoom(ty), t);
    await new Promise(r => setTimeout(r, 500)); // let a few frames animate
    await page.screenshot({ path: path.join(__dirname, `_interiors-${t}.png`) });
    console.log('shot', t);
  }

  await browser.close();
  if (errors.length) { console.log('ERRORS:\n' + errors.join('\n')); process.exit(1); }
  else console.log('0 console errors');
})().catch(e => { console.error(e); process.exit(1); });
