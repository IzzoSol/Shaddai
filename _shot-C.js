const puppeteer = require('puppeteer-core');
const path = require('path');
const os = require('os');
(async () => {
  const b = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new', userDataDir: os.tmpdir() + '/ppC' + Date.now(), args: ['--no-sandbox']
  });
  const p = await b.newPage();
  await p.setViewport({ width: 1240, height: 620, deviceScaleFactor: 2 });
  const file = path.resolve(__dirname, 'public', '_char-C.html');
  const base = 'file:///' + file.split(path.sep).join('/');

  // INSPECT single-char
  await p.goto(base + '?inspect', { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 900));
  await p.screenshot({ path: path.resolve(__dirname, '_char-C-inspect.png') });

  // zoomed crop of the inspect char to verify arm attachment
  await p.evaluate(() => {
    const c = document.getElementById('c');
    const z = document.createElement('canvas'); z.width = 520; z.height = 520;
    z.id = 'zoom'; z.style.cssText = 'position:fixed;left:0;top:0;z-index:9999;background:#0d1017';
    const g = z.getContext('2d'); g.imageSmoothingEnabled = false;
    const bw = c.width, cxb = bw * 0.5;
    // whole figure: center column, head->feet
    g.drawImage(c, cxb - 115, 250, 330, 400, 0, 0, 429, 520);
    document.body.appendChild(z);
  });
  await p.screenshot({ path: path.resolve(__dirname, '_char-C-zoom.png'), clip: { x: 0, y: 0, width: 520, height: 520 } });

  // full row
  await p.goto(base, { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 900));
  await p.screenshot({ path: path.resolve(__dirname, '_char-C-row.png') });

  await b.close();
  console.log('shots saved -> _char-C-inspect.png / _char-C-zoom.png / _char-C-row.png');
})().catch(e => { console.error(e.message); process.exit(1); });
