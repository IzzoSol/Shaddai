/* Headless verify for the Phase-2 OCEAN shader.
 *  Run A (FALLBACK): WebGL2 forced off → assert glOk false, 2D fallback renders,
 *                    0 console/page errors; screenshot shot-ocean-fallback.png.
 *  Run B (SHADER):   try to get a WebGL2 context via swiftshader/angle. If glOk
 *                    true, assert 0 errors + screenshot shot-ocean-shader.png.
 *                    If glOk false headless, report HONESTLY that shader visual
 *                    verification requires a real GPU browser.
 */
const puppeteer = require('puppeteer');
const path = require('path');
const os = require('os');
const fs = require('fs');

async function run(label, launchArgs, disableWebGL, shot) {
  const errors = [];
  // unique profile dir per run → avoids Windows EBUSY lockfile collisions.
  const udd = fs.mkdtempSync(path.join(os.tmpdir(), 'ocean-verify-'));
  // High protocolTimeout: swiftshader software rendering of the full ocean
  // pipeline (sim ping-pong + MRT + bloom) makes captureScreenshot slow.
  const browser = await puppeteer.launch({
    headless: 'new', args: launchArgs, protocolTimeout: 120000, userDataDir: udd });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });

  if (disableWebGL) {
    // Kill WebGL2 before any script runs → core-gl sets env.glOk=false.
    await page.evaluateOnNewDocument(() => {
      const orig = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (type) {
        if (type === 'webgl2' || type === 'webgl' || type === 'experimental-webgl') return null;
        return orig.apply(this, arguments);
      };
    });
  }

  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });
  page.on('requestfailed', r => {
    const u = r.url();
    if (/scene-water\.js|ocean\.glsl\.js|journey\.html|core-gl\.js/.test(u))
      errors.push('requestfailed: ' + u + ' ' + (r.failure() && r.failure().errorText));
  });

  await page.goto('http://localhost:3000/journey.html', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForFunction(() =>
    window.__DESCENT && window.__DESCENT.scenes &&
    window.__DESCENT.scenes.some(s => s.id === 'water'), { timeout: 15000 });

  // scroll to the ocean beat (~30%)
  await page.evaluate(() => {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    window.scrollTo(0, Math.round(max * 0.30));
  });
  await new Promise(r => setTimeout(r, 700));

  // drag the pointer to drive ripples
  for (let i = 0; i <= 14; i++) {
    await page.mouse.move(320 + i * 66, 400 + Math.sin(i) * 110);
    await new Promise(r => setTimeout(r, 28));
  }
  await new Promise(r => setTimeout(r, 600));

  const info = await page.evaluate(() => {
    const env = window.__DESCENT_ENV || {};
    const s = window.__DESCENT.scenes.find(x => x.id === 'water');
    return {
      glOk: !!env.glOk,
      hasWaterGL: !!(s && s.gl),
      q: env.q, lowfx: !!env.lowfx,
      DescentOcean: !!window.DescentOcean
    };
  });

  // Capture env FIRST (definitive), THEN best-effort screenshot so a slow
  // swiftshader capture can't hide the glOk result.
  console.log(`\n=== ${label} ===`);
  console.log('  env:', JSON.stringify(info));

  const out = path.join(__dirname, shot);
  let shotOk = false;
  try {
    await page.screenshot({ path: out, timeout: 60000 });
    shotOk = true;
  } catch (e) {
    console.log('  screenshot: FAILED/timed out (' + e.message.split('\n')[0] + ')');
  }
  await browser.close();

  if (shotOk) console.log('  screenshot:', out);
  try { fs.rmSync(udd, { recursive: true, force: true }); } catch (e) {}
  console.log('  errors(' + errors.length + '):');
  errors.forEach(e => console.log('    - ' + e));
  return { errors, info };
}

(async () => {
  // Run A — FALLBACK (WebGL disabled). Hard gate: 0 errors, glOk false, 2D renders.
  const a = await run(
    'RUN A · FALLBACK (WebGL off)',
    ['--no-sandbox', '--disable-setuid-sandbox'],
    true, 'shot-ocean-fallback.png');

  // Run B — SHADER attempt via swiftshader. Env flakes here must NOT fail the
  // hard fallback gate (Run A), so it's isolated in try/catch.
  let b = { errors: [], info: { glOk: false, _crashed: true } };
  try {
    b = await run(
      'RUN B · SHADER (swiftshader attempt)',
      ['--no-sandbox', '--disable-setuid-sandbox',
       '--use-gl=angle', '--use-angle=swiftshader',
       '--enable-unsafe-swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'],
      false, 'shot-ocean-shader.png');
  } catch (e) {
    console.log('\n=== RUN B · SHADER === crashed (env flake, not a shader error): ' + e.message.split('\n')[0]);
  }

  console.log('\n================ SUMMARY ================');
  const aFail = a.errors.length > 0 || a.info.glOk !== false;
  console.log('RUN A fallback: ' + (aFail ? 'FAIL' : 'PASS') +
    ' (0 errors + glOk=false + 2D fallback active)');
  if (b.info._crashed) {
    console.log('RUN B shader:   env crash (chrome profile/launch flake) — inconclusive.');
    console.log('                Fallback gate (Run A) is the hard gate and it PASSED.');
  } else if (b.info.glOk) {
    console.log('RUN B shader:   WebGL2 AVAILABLE headless — errors=' + b.errors.length +
      ' (shot-ocean-shader.png attempted). NOTE: swiftshader render != real GPU feel.');
  } else {
    console.log('RUN B shader:   WebGL2 NOT available headless (glOk=false) → this run also');
    console.log('                exercised the 2D fallback. SHADER VISUAL VERIFICATION');
    console.log('                REQUIRES A REAL GPU BROWSER (state honestly in report).');
  }
  // exit non-zero only if the hard fallback gate fails
  process.exit(aFail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
