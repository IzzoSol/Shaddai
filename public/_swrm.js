const puppeteer = require('puppeteer-core');
const path = require('path');
const os = require('os');

(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new',
    userDataDir: os.tmpdir() + '/pprm' + Date.now(),
    args: ['--no-sandbox', '--disable-gpu', '--window-size=1440,900']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  const url = 'file://' + path.resolve(__dirname, '_regionmap-test.html').replace(/\\/g, '/');
  page.on('console', m => console.log('PAGE:', m.text()));
  page.on('pageerror', e => console.log('PAGEERR:', e.message));
  await page.goto(url, { waitUntil: 'load' });
  await new Promise(r => setTimeout(r, 1300)); // land on Agent City (central volcano showcase)
  const out = path.resolve(__dirname, '_regionmap.png');
  await page.screenshot({ path: out });
  console.log('WROTE', out);
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
