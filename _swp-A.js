const puppeteer = require('puppeteer-core');
const path = require('path');
const os = require('os');
(async () => {
  const b = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new',
    userDataDir: os.tmpdir() + '/ppolA' + Date.now(),
    args: ['--no-sandbox']
  });
  const p = await b.newPage();
  await p.setViewport({ width: 900, height: 980, deviceScaleFactor: 3 });
  await p.goto('file:///C:/Users/Brittany/Desktop/SHADDAI MASTER FINAL BUILD/_polish-A.html', { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 1400));
  // full grid
  await p.screenshot({ path: path.resolve(__dirname, '_polish-A-full.png') });
  // zoomed top-row heads clip
  await p.screenshot({ path: path.resolve(__dirname, '_polish-A-heads.png'), clip: { x: 24, y: 74, width: 780, height: 235 } });
  // super-zoom on top-row faces for pixel inspection
  await p.screenshot({ path: path.resolve(__dirname, '_polish-A-zoom.png'), clip: { x: 40, y: 130, width: 470, height: 130 } });
  // bottom row heads (dress ponytail / athlete / robot)
  const H = await p.evaluate(() => document.querySelector('canvas').getBoundingClientRect().bottom);
  await p.screenshot({ path: path.resolve(__dirname, '_polish-A-bot.png'), clip: { x: 24, y: Math.round(H) - 155, width: 780, height: 150 } });
  await b.close();
  console.log('polish-A shots saved');
})().catch(e => { console.error(e.message); process.exit(1); });
