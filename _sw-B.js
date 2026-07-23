const puppeteer = require('puppeteer-core');
const path = require('path');
const os = require('os');
(async () => {
  const b = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', userDataDir: os.tmpdir()+'/ppB'+Date.now(), args: ['--no-sandbox'] });
  const p = await b.newPage();
  await p.setViewport({ width: 820, height: 950, deviceScaleFactor: 3 });
  await p.goto('file:///C:/Users/Brittany/Desktop/SHADDAI MASTER FINAL BUILD/_ward-B.html', { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 1400));
  // ZOOMED clip on the top-row heads (3 chars): heads sit near the top of each 280px cell
  await p.screenshot({ path: path.resolve(__dirname, '_ward-B-heads.png'), clip: { x: 20, y: 130, width: 760, height: 175 } });
  await b.close(); console.log('ward-B heads saved');
})().catch(e => { console.error(e.message); process.exit(1); });
