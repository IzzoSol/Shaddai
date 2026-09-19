import puppeteer from 'puppeteer';
import { writeFileSync } from 'fs';
const [, , n, ...ks] = process.argv;
const b = await puppeteer.launch({ headless: 'new' });
const p = await b.newPage();
await p.setViewport({ width: 1024, height: 1024 });
await p.goto('http://localhost:8765/spike/sprite-capture.html', { waitUntil: 'load' });
await p.evaluate((f) => window.__loadClip(f), `../characters/${n}/${n}-rigged.glb`);
await p.waitForFunction(() => window.__ready === true, { timeout: 30000 });
for (const k of ks) {
  await p.evaluate((kk) => { window.__setTime(0); window.__stretchArms(parseFloat(kk)); }, k);
  writeFileSync(`fal-assets/spike/arm-${n}-${k}.png`, await p.screenshot({ omitBackground: true }));
  await p.evaluate((kk) => window.__stretchArms(1 / parseFloat(kk)), k);
}
await b.close();
