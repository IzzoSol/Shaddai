const puppeteer = require('puppeteer-core');
const path = require('path');
const os = require('os');
(async () => {
  const b = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', userDataDir: os.tmpdir()+'/ppC'+Date.now(), args: ['--no-sandbox'] });
  const p = await b.newPage();
  await p.setViewport({ width: 820, height: 950, deviceScaleFactor: 3 });
  await p.goto('file:///C:/Users/Brittany/Desktop/SHADDAI MASTER FINAL BUILD/_ward-C.html', { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 1400));
  // zoomed clip of the top-row heads
  await p.screenshot({ path: path.resolve(__dirname, '_ward-C-heads.png'), clip: { x: 90, y: 150, width: 620, height: 150 } });
  await b.close(); console.log('ward-C heads saved');
})().catch(e => { console.error(e.message); process.exit(1); });
