const puppeteer = require('puppeteer-core');
const path = require('path');
const os = require('os');
(async () => {
  const b = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new',
    userDataDir: os.tmpdir() + '/ppolC' + Date.now(),
    args: ['--no-sandbox', '--allow-file-access-from-files']
  });
  const p = await b.newPage();
  await p.setViewport({ width: 900, height: 1000, deviceScaleFactor: 3 });
  await p.goto('file:///C:/Users/Brittany/Desktop/SHADDAI MASTER FINAL BUILD/_polish-C.html', { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 1500));
  // full grid
  const stage = await p.$('.stage');
  await stage.screenshot({ path: path.resolve(__dirname, '_polish-C-full.png') });
  // zoomed top row heads
  await p.screenshot({ path: path.resolve(__dirname, '_polish-C-heads.png'), clip: { x: 22, y: 66, width: 820, height: 300 } });
  await p.screenshot({ path: path.resolve(__dirname, '_polish-C-row2.png'), clip: { x: 22, y: 300, width: 820, height: 300 } });
  await b.close();
  console.log('polish-C saved');
})().catch(e => { console.error(e.message); process.exit(1); });
