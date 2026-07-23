// Verify the CRISP Tree-of-Life beat (scene-tree.js) in journey.html.
// Scroll to ~83% (tree scene center = 5/6), screenshot, assert 0 errors +
// the painted tree base is visible (non-black, warm luminous content).
import puppeteer from 'puppeteer';

const OUT = 'C:\\Users\\Brittany\\Desktop\\SHADDAI MASTER FINAL BUILD\\scripts\\shot-crisp-tree.png';
const browser = await puppeteer.launch({
  headless: 'new',
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist']
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });
const errs = [];
page.on('pageerror', e => errs.push(e.message));
page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });

await page.goto('http://localhost:3000/journey.html', { waitUntil: 'networkidle2', timeout: 45000 })
  .catch(e => errs.push('goto ' + e.message));

// scroll to ~83% of the scrollable range (tree scene center)
await page.evaluate(() => {
  const max = document.documentElement.scrollHeight - innerHeight;
  window.scrollTo(0, Math.round(max * 0.833));
});
// let the base image load + several RAF frames render
await new Promise(r => setTimeout(r, 3500));

const info = await page.evaluate(() => {
  const art = document.getElementById('art');
  const out = { hasArt: !!art, w: art && art.width, h: art && art.height,
                sceneCount: (window.__DESCENT && window.__DESCENT.scenes || []).length,
                treeCrisp: null, nonBlackPct: 0, warmPct: 0, meanLum: 0 };
  if (!art) return out;
  const tree = (window.__DESCENT.scenes || []).find(s => s.id === 'tree');
  out.treeCrisp = !!(tree && tree.crisp && tree.crisp.ok);
  // sample the canvas center band for non-black / warm luminous painted content
  const ctx = art.getContext('2d');
  let sx = 0, sy = 0, sw = art.width, sh = art.height;
  let img;
  try { img = ctx.getImageData(0, 0, sw, sh); } catch (e) { out.err = e.message; return out; }
  const d = img.data;
  let nb = 0, warm = 0, lumsum = 0, n = 0;
  // sample a grid (step to keep it fast)
  const step = 6;
  for (let y = 0; y < sh; y += step) {
    for (let x = 0; x < sw; x += step) {
      const i = (y * sw + x) * 4;
      const r = d[i], g = d[i + 1], b = d[i + 2];
      const lum = (r * 0.299 + g * 0.587 + b * 0.114);
      lumsum += lum; n++;
      if (lum > 24) nb++;
      // warm/gold painted content: red+green elevated over blue
      if (r > 60 && g > 45 && r >= b && (r + g) > (b * 2)) warm++;
    }
  }
  out.nonBlackPct = +(100 * nb / n).toFixed(1);
  out.warmPct = +(100 * warm / n).toFixed(1);
  out.meanLum = +(lumsum / n).toFixed(1);
  return out;
});

await page.screenshot({ path: OUT });
await browser.close();

const painted = info.treeCrisp && info.nonBlackPct > 15 && info.warmPct > 2;
console.log('errors:', errs.length ? errs.slice(0, 6).join(' | ') : '(none)');
console.log('info:', JSON.stringify(info));
console.log('painted-tree-base-visible:', painted);
console.log('saved:', OUT);
process.exit(errs.length === 0 && painted ? 0 : 1);
