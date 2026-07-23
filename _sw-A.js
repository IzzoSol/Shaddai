const puppeteer = require('puppeteer-core');
const path = require('path');
const os = require('os');
(async () => {
  const b = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', userDataDir: os.tmpdir()+'/ppA'+Date.now(), args: ['--no-sandbox'] });
  const p = await b.newPage();
  await p.setViewport({ width: 820, height: 950, deviceScaleFactor: 3 });
  await p.goto('file:///C:/Users/Brittany/Desktop/SHADDAI%20MASTER%20FINAL%20BUILD/_ward-A.html', { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 1400));
  // top row of 3 characters — zoom on HEADS
  await p.screenshot({ path: path.resolve(__dirname, '_ward-A-heads.png'), clip: { x: 20, y: 40, width: 760, height: 200 } });
  await b.close(); console.log('ward-A heads saved');
})().catch(e => { console.error(e.message); process.exit(1); });
