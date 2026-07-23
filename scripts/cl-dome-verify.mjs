import puppeteer from 'puppeteer';

const URL = 'http://localhost:3000/lab-dome.html';
const OUT = 'scripts';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const browser = await puppeteer.launch({
  headless: 'new',
  protocolTimeout: 180000,
  args: [
    '--enable-unsafe-swiftshader',
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--no-sandbox',
    '--window-size=1440,900',
  ],
});

const page = await browser.newPage();
await page.setViewport({ width: 1200, height: 760, deviceScaleFactor: 1 });

const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

await page.goto(URL, { waitUntil: 'load', timeout: 30000 });
await sleep(600);

// WebGL2 acquired?
const webgl2 = await page.evaluate(() => {
  const c = document.createElement('canvas');
  return !!c.getContext('webgl2');
});

// fallback visible? (means WebGL2 failed to acquire in-page)
const fallbackShown = await page.evaluate(() => {
  const f = document.getElementById('fallback');
  return f && getComputedStyle(f).display !== 'none';
});

// ---- Orion screenshot: pin p high, look toward Orion's center ----
await page.evaluate(() => {
  window.__forceP = 1.0;
  // Orion center ~ (-0.18,0.72,-0.62). Solve yaw/pitch for fwd=(sp*sy,cp,sp*cy).
  const c = [-0.18, 0.72, -0.62];
  const n = Math.hypot(...c); const d = c.map(v => v / n);
  const pitch = Math.acos(Math.max(-1, Math.min(1, d[1])));
  const yaw = Math.atan2(d[0], d[2]);
  // offset the gaze slightly so the whole Orion figure frames (not one
  // centered hero star ballooning under bloom)
  window.__forceYaw = yaw + 0.10;
  window.__forcePitch = pitch - 0.62 - 0.10; // basePitch adds ~0.02 at p=1, plus uPitch
});
await sleep(1200);
await page.screenshot({ path: `${OUT}/cl-dome-orion.png` });

// ---- Crown screenshot: look straight up at the zenith ----
await page.evaluate(() => {
  window.__forceP = 1.0;
  window.__forceYaw = 0.0;
  window.__forcePitch = -0.60; // basePitch(~0.02) + this => ~ -0.58, looks up past zenith-ish
});
await sleep(1200);
await page.screenshot({ path: `${OUT}/cl-dome-crown.png` });

// ---- Drag test: capture yaw before, simulate a pointer drag, confirm rotation ----
const beforeYaw = await page.evaluate(() => {
  // release the forced yaw so the drag controller can move it
  delete window.__forceYaw; delete window.__forcePitch;
  window.__forceP = 1.0;
  return window.__DBG ? window.__DBG.yaw : null;
});
await sleep(200);

// perform a real pointer drag across the canvas
await page.mouse.move(600, 380);
await page.mouse.down();
for (let i = 0; i < 20; i++) { await page.mouse.move(600 - i * 20, 380 + i * 4); await sleep(14); }
await page.mouse.up();
await sleep(900); // let inertia settle a touch but keep motion visible

const afterYaw = await page.evaluate(() => window.__DBG ? window.__DBG.yaw : null);
await sleep(400);
await page.screenshot({ path: `${OUT}/cl-dome-drag.png` });

const rotated = (beforeYaw !== null && afterYaw !== null && Math.abs(afterYaw - beforeYaw) > 0.05);

console.log(JSON.stringify({
  webgl2,
  fallbackShown,
  errors,
  beforeYaw,
  afterYaw,
  yawDelta: (afterYaw !== null && beforeYaw !== null) ? (afterYaw - beforeYaw) : null,
  rotated,
}, null, 2));

await browser.close();
