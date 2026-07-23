const puppeteer = require('puppeteer-core');
const path = require('path');
const os = require('os');
(async () => {
  const b = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new',
    userDataDir: os.tmpdir() + '/ppolB' + Date.now(),
    args: ['--no-sandbox', '--allow-file-access-from-files']
  });
  const p = await b.newPage();
  await p.setViewport({ width: 900, height: 1000, deviceScaleFactor: 2 });
  await p.goto('file:///C:/Users/Brittany/Desktop/SHADDAI%20MASTER%20FINAL%20BUILD/_polish-B.html', { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 1500));
  const cv = await p.$('#c');
  await cv.screenshot({ path: path.resolve(__dirname, '_polish-B-full.png') });
  // zoomed top row
  await p.setViewport({ width: 900, height: 1000, deviceScaleFactor: 3 });
  await new Promise(r => setTimeout(r, 400));
  const box = await cv.boundingBox();
  await p.screenshot({ path: path.resolve(__dirname, '_polish-B-heads.png'),
    clip: { x: box.x, y: box.y, width: box.width, height: box.height/3 } });
  // single-character close-up (Nike, top-left cell) for fine inspection
  await p.screenshot({ path: path.resolve(__dirname, '_polish-B-zoom.png'),
    clip: { x: box.x, y: box.y, width: box.width/3, height: box.height/3 } });
  // middle + bottom rows for inspecting the other outfits
  await p.screenshot({ path: path.resolve(__dirname, '_polish-B-row2.png'),
    clip: { x: box.x, y: box.y + box.height/3, width: box.width, height: box.height/3 } });
  await p.screenshot({ path: path.resolve(__dirname, '_polish-B-row3.png'),
    clip: { x: box.x, y: box.y + 2*box.height/3, width: box.width, height: box.height/3 } });
  // targeted single-cell zooms: bomber (r1,c1) and athlete (r2,c1)
  const cw = box.width/3, ch = box.height/3;
  await p.screenshot({ path: path.resolve(__dirname, '_polish-B-bomber.png'),
    clip: { x: box.x + cw, y: box.y + ch, width: cw, height: ch } });
  await p.screenshot({ path: path.resolve(__dirname, '_polish-B-athlete.png'),
    clip: { x: box.x + cw, y: box.y + 2*ch, width: cw, height: ch } });
  // suit (r0,c1) and hoodUp (r1,c2)
  await p.screenshot({ path: path.resolve(__dirname, '_polish-B-suit.png'),
    clip: { x: box.x + cw, y: box.y, width: cw, height: ch } });
  await p.screenshot({ path: path.resolve(__dirname, '_polish-B-hoodup.png'),
    clip: { x: box.x + 2*cw, y: box.y + ch, width: cw, height: ch } });
  await b.close();
  console.log('polB saved');
})().catch(e => { console.error(e.message); process.exit(1); });
