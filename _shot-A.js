const puppeteer = require('puppeteer-core');
const path = require('path');
const os = require('os');
(async () => {
  const b = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new',
    userDataDir: os.tmpdir() + '/ppA' + Date.now(),
    args: ['--no-sandbox']
  });
  const file = path.resolve(__dirname, 'public', '_char-A.html');
  const base = 'file:///' + file.split(path.sep).join('/');

  // ---- INSPECT (single big character) ----
  const p1 = await b.newPage();
  await p1.setViewport({ width: 900, height: 620, deviceScaleFactor: 2 });
  await p1.goto(base + '?inspect', { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 900));
  await p1.screenshot({ path: path.resolve(__dirname, '_char-A-inspect.png') });

  // The page zooms the inspect rig 2.6x + centers it, so the full-page shot IS
  // the detail view. Also save a tight center crop for arm/torso inspection.
  await p1.screenshot({ path: path.resolve(__dirname, '_char-A-inspect-zoom.png'),
    clip: { x: 300, y: 120, width: 300, height: 320 } });

  // ---- ROW (full cast) ----
  const p2 = await b.newPage();
  await p2.setViewport({ width: 1240, height: 620, deviceScaleFactor: 2 });
  await p2.goto(base, { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 900));
  await p2.screenshot({ path: path.resolve(__dirname, '_char-A-row.png') });

  await b.close();
  console.log('shots saved -> _char-A-inspect.png, _char-A-inspect-zoom.png, _char-A-row.png');
})().catch(e => { console.error(e.message); process.exit(1); });
