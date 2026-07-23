const puppeteer = require('puppeteer-core');
const path = require('path');
const os = require('os');
(async () => {
  const b = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new',
    userDataDir: os.tmpdir() + '/ppfA' + Date.now(),
    args: ['--no-sandbox', '--allow-file-access-from-files']
  });
  const p = await b.newPage();
  await p.setViewport({ width: 820, height: 950, deviceScaleFactor: 3 });
  await p.goto('file:///C:/Users/Brittany/Desktop/SHADDAI%20MASTER%20FINAL%20BUILD/_fix-A.html', { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 1400));
  // zoomed top-row heads (tight on the 3 heads: hoodie, suit, long-sleeve)
  await p.screenshot({ path: path.resolve(__dirname, '_fix-A-heads.png'), clip: { x: 60, y: 120, width: 700, height: 150 } });
  // single head super-zoom (long-sleeve tee, rightmost top) for gap inspection
  await p.screenshot({ path: path.resolve(__dirname, '_fix-A-zoom.png'), clip: { x: 590, y: 120, width: 180, height: 150 } });
  // middle row heads: tank+shorts (cap), bomber, hoodie-up — verify caps/hood wrap
  await p.screenshot({ path: path.resolve(__dirname, '_fix-A-row2.png'), clip: { x: 60, y: 380, width: 700, height: 170 } });
  // super-zoom blue cap head for temple-gap check
  await p.screenshot({ path: path.resolve(__dirname, '_fix-A-cap.png'), clip: { x: 60, y: 380, width: 200, height: 170 } });
  // full grid
  await p.screenshot({ path: path.resolve(__dirname, '_fix-A-full.png'), clip: { x: 0, y: 40, width: 820, height: 850 } });
  await b.close();
  console.log('fix-A screenshots saved');
})().catch(e => { console.error(e.message); process.exit(1); });
