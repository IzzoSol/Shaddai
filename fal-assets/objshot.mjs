// usage: node fal-assets/objshot.mjs <glb path relative to fal-assets/> <out.png>  (free static render, oversampled 1024)
import puppeteer from 'puppeteer';
import sharp from 'sharp';
const [, , glb, out] = process.argv;
const b = await puppeteer.launch({ headless: 'new' });
const p = await b.newPage();
await p.setViewport({ width: 2048, height: 2048 });
await p.goto('http://localhost:8765/spike/sprite-capture.html', { waitUntil: 'load' });
await p.evaluate((f) => window.__loadClip(f), '../' + glb);
await p.waitForFunction(() => window.__ready === true || window.__ready === 'error', { timeout: 60000 });
await p.evaluate(() => window.__setTime(0));
const full = await p.screenshot({ omitBackground: true });
await sharp(full).trim({ threshold: 10 }).flatten({ background: '#dfe3ea' }).resize({ height: 800, width: 800, fit: 'contain', background: '#dfe3ea' }).png().toFile(out);
await b.close();
