const puppeteer = require('puppeteer-core');
const path = require('path');
const os = require('os');
(async () => {
  const b = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new',
    userDataDir: os.tmpdir() + '/ppfB' + Date.now(),
    args: ['--no-sandbox']
  });
  const p = await b.newPage();
  await p.setViewport({ width: 900, height: 1000, deviceScaleFactor: 3 });
  await p.goto('file:///C:/Users/Brittany/Desktop/SHADDAI MASTER FINAL BUILD/_fix-B.html', { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 1400));
  // full grid
  await p.screenshot({ path: path.resolve(__dirname, '_fix-B-full.png') });
  // zoomed top row of heads (clip in CSS px; viewport 900 wide, grid ~540 wide centered)
  await p.screenshot({ path: path.resolve(__dirname, '_fix-B-heads.png'), clip: { x: 10, y: 150, width: 520, height: 150 } });
  // middle row (caps + hood-up) to check those variants for gaps
  await p.screenshot({ path: path.resolve(__dirname, '_fix-B-caps.png'), clip: { x: 10, y: 445, width: 520, height: 160 } });
  await b.close();
  console.log('fix-B screenshots saved');
})().catch(e => { console.error(e.message); process.exit(1); });
