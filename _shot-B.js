const puppeteer = require('puppeteer-core');
const path = require('path');
const os = require('os');
(async () => {
  const b = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new', userDataDir: os.tmpdir() + '/ppB' + Date.now(), args: ['--no-sandbox']
  });
  const p = await b.newPage();
  await p.setViewport({ width: 1240, height: 660, deviceScaleFactor: 2 });
  const file = path.resolve(__dirname, 'public', '_char-B.html');
  const base = 'file:///' + file.split(path.sep).join('/');

  // ---- INSPECT (big single char) ----
  await p.goto(base + '?inspect', { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 900));
  await p.screenshot({ path: path.resolve(__dirname, '_char-B-inspect.png') });

  // zoomed crop around the inspect char to check arm attachment closely
  await p.evaluate(() => {
    const c = document.getElementById('c');
    const z = document.createElement('canvas'); z.width = 520; z.height = 560;
    z.id = 'zoom'; z.style.cssText = 'position:fixed;left:0;top:0;z-index:9999;background:#0d1017';
    const g = z.getContext('2d'); g.imageSmoothingEnabled = false;
    // inspect char: OX=CSSW/2, feet near OY+2*TH=238css. Head top ~110css.
    // device px = css * DPR(2). Grab a tight column centered on the char.
    const bw = c.width, cxb = bw * 0.5;
    const sx = cxb - 20, sy = 200, sw = 300, sh = 430;
    g.drawImage(c, sx, sy, sw, sh, 0, 0, 390, 560);
    document.body.appendChild(z);
  });
  await p.screenshot({ path: path.resolve(__dirname, '_char-B-zoom.png'), clip: { x:0, y:0, width:520, height:560 } });

  // ---- ROW (all 6 variants + walker) ----
  await p.goto(base, { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 900));
  await p.screenshot({ path: path.resolve(__dirname, '_char-B-row.png') });

  await b.close();
  console.log('shots saved -> _char-B-inspect.png / _char-B-zoom.png / _char-B-row.png');
})().catch(e => { console.error(e.message); process.exit(1); });
