// usage: node fal-assets/bindpose-shot.mjs <name...>  -> fal-assets/spike/bind-<name>.png (T-pose front view, free)
import puppeteer from 'puppeteer';
import { writeFileSync } from 'fs';
const b = await puppeteer.launch({ headless: 'new' });
const p = await b.newPage();
await p.setViewport({ width: 1024, height: 1024 });
await p.goto('http://localhost:8765/spike/sprite-capture.html', { waitUntil: 'load' });
for (const n of process.argv.slice(2)) {
  await p.evaluate((f) => window.__loadClip(f), `../characters/${n}/${n}-rigged.glb`);
  await p.waitForFunction(() => window.__ready === true || window.__ready === 'error', { timeout: 30000 });
  await p.evaluate(() => window.__setTime(0));
  writeFileSync(`fal-assets/spike/bind-${n}.png`, await p.screenshot({ omitBackground: true }));
  console.log('saved', n);
}
await b.close();
