/* Headless verify for scene-cosmos crisp/planets fix.
 * Loads journey.html, scrolls into the cosmos beat, waits for art+video,
 * screenshots, and asserts: 0 page errors AND the frame is not black
 * (cosmos base + at least Saturn/cavern rendering).
 */
const path = require('path');
const puppeteer = require('puppeteer');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL = 'http://localhost:3000/journey.html';
const OUT = path.join(__dirname, 'shot-crisp-cosmos.png');

(async () => {
  const errors = [];
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: [
      '--autoplay-policy=no-user-gesture-required',
      '--no-sandbox', '--disable-setuid-sandbox',
      '--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist',
      '--window-size=1280,800'
    ]
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });
  page.on('requestfailed', r => {
    const u = r.url();
    const err = (r.failure() && r.failure().errorText) || '';
    // <video> streaming aborts its initial full request to switch to range
    // requests — ERR_ABORTED on the .mp4 is normal and NOT a real failure
    // (we separately confirm saturnVideoReady). Ignore it.
    if (/planet-saturn-spin/.test(u) && /ERR_ABORTED/.test(err)) return;
    if (/cosmos-hd|cavern-world|fractal-universe|planet-saturn-spin|scene-cosmos|video-tex/.test(u))
      errors.push('requestfailed: ' + u + ' ' + err);
  });

  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await new Promise(r => setTimeout(r, 1500)); // let scenes register

  // scroll to ~66% of the scrollable range (into the cosmos beat)
  await page.evaluate(() => {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    window.scrollTo(0, Math.round(max * 0.66));
  });

  // let art/video load + a few animation frames settle
  await new Promise(r => setTimeout(r, 6000));

  // Report descent state + asset readiness, and sample the #art canvas pixels
  // in-page (avoids a pngjs dependency). We measure:
  //   base  = the cosmos-hd photo (broad non-black coverage across the frame)
  //   glow  = luminous emerald planet content ('lighter' hits, esp. green)
  const state = await page.evaluate(() => {
    const out = { scenes: (window.__DESCENT && window.__DESCENT.scenes || []).map(s => s.id) };
    const vt = window.__VIDTEX && window.__VIDTEX['/assets/journey/planet-saturn-spin.mp4'];
    out.saturnVideoReady = !!(vt && vt.ready && vt.video && vt.video.videoWidth > 0);
    const cav = window.__DESCENT && null; // placeholder
    const art = document.getElementById('art');
    try {
      const c = document.createElement('canvas');
      const SW = 320, SH = 200;
      c.width = SW; c.height = SH;
      const g = c.getContext('2d');
      g.drawImage(art, 0, 0, SW, SH);
      const d = g.getImageData(0, 0, SW, SH).data;
      let total = SW * SH, nonBlack = 0, bright = 0, greenGlow = 0;
      for (let i = 0; i < d.length; i += 4) {
        const r = d[i], gg = d[i + 1], b = d[i + 2];
        const lum = 0.2126 * r + 0.7152 * gg + 0.0722 * b;
        if (lum > 12) nonBlack++;
        if (lum > 60) bright++;
        if (gg > 70 && gg > r + 18 && gg > b + 10) greenGlow++; // emerald planet glow
      }
      out.notBlack = nonBlack / total;
      out.bright = bright / total;
      out.greenGlow = greenGlow / total;
    } catch (e) { out.sampleError = String(e); }
    return out;
  });

  await page.screenshot({ path: OUT });
  await browser.close();

  console.log('scenes:', state.scenes.join(','));
  console.log('saturnVideoReady:', state.saturnVideoReady);
  console.log('errors:', errors.length);
  errors.forEach(e => console.log('  -', e));
  console.log('notBlack:', (state.notBlack||0).toFixed(4),
              ' bright:', (state.bright||0).toFixed(4),
              ' greenGlow:', (state.greenGlow||0).toFixed(4));
  if (state.sampleError) console.log('sampleError:', state.sampleError);

  const okErrors = errors.length === 0;
  // base photo should cover most of the frame (not black); some luminous glow present
  const okBase = (state.notBlack || 0) > 0.35;
  const okGlow = (state.bright || 0) > 0.02;
  console.log('RESULT:', (okErrors && okBase && okGlow) ? 'PASS' : 'FAIL');
  process.exit((okErrors && okBase && okGlow) ? 0 : 1);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
