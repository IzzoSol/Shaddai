import puppeteer from 'puppeteer';
import { fileURLToPath, pathToFileURL } from 'url';
import { dirname, resolve } from 'path';
const __dirname = dirname(fileURLToPath(import.meta.url));
const url = pathToFileURL(resolve(__dirname, '..', 'public', 'journey.html')).href;
const errors = [];
const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
await new Promise(r => setTimeout(r, 800));
// sample FPS over ~2s at the molecules scene (top)
const fps = await page.evaluate(() => new Promise(res => {
  let n = 0; const t0 = performance.now();
  (function loop(){ n++; if (performance.now()-t0 < 2000) requestAnimationFrame(loop); else res(Math.round(n/((performance.now()-t0)/1000))); })();
}));
await page.mouse.move(700, 380); await new Promise(r => setTimeout(r, 300));
await page.screenshot({ path: resolve(__dirname, 'shot-journey-molecules.png') });
await browser.close();
console.log('errors:', errors.length, '| molecules FPS:', fps);
if (errors.length) console.log(errors.join('\n'));
process.exit(errors.length ? 1 : 0);
