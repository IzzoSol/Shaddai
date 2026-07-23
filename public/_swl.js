const puppeteer = require('puppeteer-core');
const os = require('os');
const path = require('path');

(async () => {
  const udd = path.join(os.tmpdir(), 'pplm' + Date.now());
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new',
    userDataDir: udd,
    args: ['--no-sandbox', '--disable-gpu', '--force-color-profile=srgb']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1240, height: 720, deviceScaleFactor: 1 });

  const consoleErrs = [];
  page.on('console', m => { if (m.type() === 'error') consoleErrs.push(m.text()); });
  page.on('pageerror', e => consoleErrs.push('PAGEERROR: ' + e.message));

  const fileUrl = 'file:///' + path.resolve(__dirname, '_landmarks-test.html').replace(/\\/g, '/');
  await page.goto(fileUrl, { waitUntil: 'load' });
  await page.waitForFunction('window.__RENDERED === true', { timeout: 5000 });
  await new Promise(r => setTimeout(r, 600));

  const pageErrs = await page.evaluate('window.__ERRORS || []');
  await page.screenshot({ path: path.resolve(__dirname, '_landmarks.png') });
  await browser.close();

  const all = consoleErrs.concat(pageErrs);
  console.log('CONSOLE_ERRORS:' + all.length);
  all.forEach(e => console.log('  ' + e));
  console.log('DONE');
})().catch(e => { console.error('FATAL', e); process.exit(1); });
