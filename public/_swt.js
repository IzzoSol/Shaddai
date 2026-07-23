const puppeteer = require('puppeteer-core');
const os = require('os');
const path = require('path');

(async () => {
  const dir = path.resolve(__dirname);
  const url = 'file://' + dir.replace(/\\/g, '/') + '/_terrain-test.html';
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new',
    userDataDir: os.tmpdir() + '/ppter' + Date.now(),
    args: ['--no-sandbox', '--disable-gpu', '--force-color-profile=srgb']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1560, height: 1000, deviceScaleFactor: 2 });
  const errs = [];
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', e => errs.push(String(e)));
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction('window.__rendered === true', { timeout: 5000 });
  await new Promise(r => setTimeout(r, 400)); // let a few animation frames pass
  await page.screenshot({ path: path.join(dir, '_terrain.png') });
  await browser.close();
  console.log('errors:', errs.length ? errs : 'none');
  console.log('wrote _terrain.png');
})().catch(e => { console.error(e); process.exit(1); });
