import puppeteer from 'puppeteer';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
const __dirname = dirname(fileURLToPath(import.meta.url));
const URL = process.env.URL || 'http://localhost:3000/journey.html';

const errors = [];
const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-webgl'] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));

await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
await new Promise(r => setTimeout(r, 2500));

// scroll 0 -> 1 in ~8 steps
for (let i = 0; i <= 8; i++) {
  await page.evaluate((f) => {
    const max = document.documentElement.scrollHeight - innerHeight;
    scrollTo(0, max * f);
  }, i / 8);
  await page.mouse.move(500 + i * 40, 350 + (i % 3) * 30);
  await new Promise(r => setTimeout(r, 300));
}

// measure FPS at current position
const fps = await page.evaluate(() => new Promise(res => {
  let n = 0; const t0 = performance.now();
  (function loop(){ n++; if (performance.now()-t0 < 1500) requestAnimationFrame(loop); else res(Math.round(n/((performance.now()-t0)/1000))); })();
}));

const checks = await page.evaluate(() => {
  const gl = document.getElementById('gl'), art = document.getElementById('art');
  return {
    glW: gl ? gl.width : 0, glH: gl ? gl.height : 0,
    artW: art ? art.width : 0, artH: art ? art.height : 0,
    hasPointer: !!window.Pointer, hasShell: !!window.Shell, hasDGL: !!window.DGL, hasAssets: !!window.Assets,
    sceneCount: (window.__DESCENT && window.__DESCENT.scenes) ? window.__DESCENT.scenes.length : 0,
    sceneIds: (window.__DESCENT && window.__DESCENT.scenes) ? window.__DESCENT.scenes.map(s=>s.id) : [],
    glOk: (window.__DESCENT_ENV||{}).glOk,
    enterHidden: (document.getElementById('enter')||{}).hidden,
    progressW: (document.querySelector('#progress i')||{}).style ? document.querySelector('#progress i').style.width : ''
  };
});

await page.screenshot({ path: resolve(__dirname, 'shot-foundation.png') });
await browser.close();

const fail = [];
if (errors.length) fail.push('console/page errors');
if (!(checks.glW > 0 && checks.artW > 0)) fail.push('canvas width==0');
if (!(checks.hasPointer && checks.hasShell && checks.hasDGL && checks.hasAssets)) fail.push('missing global(s)');
if (checks.sceneCount !== 7) fail.push('scene count != 7');

console.log('── VERIFY DESCENT FOUNDATION ──');
console.log('errors:', errors.length);
if (errors.length) console.log(errors.join('\n'));
console.log('canvases  gl:', checks.glW+'x'+checks.glH, 'art:', checks.artW+'x'+checks.artH);
console.log('globals   Pointer:'+checks.hasPointer, 'Shell:'+checks.hasShell, 'DGL:'+checks.hasDGL, 'Assets:'+checks.hasAssets);
console.log('scenes    count:', checks.sceneCount, checks.sceneIds.join(','));
console.log('glOk:', checks.glOk, '| enterHidden@end:', checks.enterHidden, '| progressW:', checks.progressW);
console.log('FPS:', fps);
console.log(fail.length ? ('FAIL: ' + fail.join('; ')) : 'PASS');
process.exit(fail.length ? 1 : 0);
