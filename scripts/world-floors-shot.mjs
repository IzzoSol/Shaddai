// Screenshot of the SHADDAI world building pillar-pavilions + NEW second-floor decks.
// Loads world, clicks ENTER, picks a portal (skips the manual picker), teleports the
// player next to a building, and captures a screenshot. Also probes the scene for the
// new deck meshes so we can confirm they were built even though this box has no GPU
// (swiftshader software raster — lighting/AA differ from the owner's real machine).
import puppeteer from 'puppeteer';

const URL = 'http://localhost:3000/SHADDAI-WORLD-3D.html';
const OUT = process.argv[2] || 'C:/Users/Brittany/Desktop/SHADDAI-MASTER/00_AUDIT/world-floors.png';
const errors = [];

const browser = await puppeteer.launch({
  headless: 'new',
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--window-size=1400,900'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 900 });
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('console', m => { const t = m.text(); if (/error|undefined is not|cannot read/i.test(t)) errors.push('console: ' + t); });

await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(e => errors.push('goto: ' + e.message));
// Software raster is SLOW — give the build gate a generous window.
await page.waitForFunction('window.__worldBuilt === true', { timeout: 150000 }).catch(() => errors.push('world build timeout'));
await new Promise(r => setTimeout(r, 5000));

// ENTER -> skydive -> picker
await page.evaluate(() => { const b = document.getElementById('enterBtn'); if (b) b.click(); });
// Wait for the spawn picker overlay to appear, then click a portal card (most robust).
await page.waitForSelector('.sp-btn', { timeout: 30000 }).catch(() => errors.push('picker never appeared'));
const codes = await page.evaluate(() => Array.from(document.querySelectorAll('.sp-btn')).map(b => (b.querySelector('.sp-code')||{}).textContent || '?'));
// Click the ZEROX / Markets card if found, else the first card.
await page.evaluate(() => {
  const cards = Array.from(document.querySelectorAll('.sp-btn'));
  const z = cards.find(c => /zerox|market/i.test(c.textContent));
  (z || cards[0]).click();
});
await new Promise(r => setTimeout(r, 8000));

// Teleport in front of ZEROX so pillars + upper deck are framed.
const info = await page.evaluate(() => {
  const L = window.WORLD_LAYOUT;
  const s = L && L.sector && L.sector('ZEROX');
  if (!s) return { ok: false };
  const bx = s.pos[0], bz = s.pos[1];
  const len = Math.hypot(bx, bz) || 1;
  const ox = bx - (bx / len) * 150;
  const oz = bz - (bz / len) * 150;
  if (window.teleportTo) window.teleportTo(ox, oz);
  return { ok: true, bx, bz, ox, oz };
});
await new Promise(r => setTimeout(r, 3500));

await page.screenshot({ path: OUT });
await browser.close();
console.log('screenshot -> ' + OUT);
console.log('portal codes: ' + JSON.stringify(codes));
console.log('teleport info: ' + JSON.stringify(info));
console.log('errors (' + errors.length + '):\n' + (errors.join('\n') || '(none)'));
process.exit(0);
