// usage: node fal-assets/headshot.mjs <name>  -> fal-assets/spike/head-<name>.png (2048 render, cropped to head, free)
import puppeteer from 'puppeteer';
import sharp from 'sharp';
const n = process.argv[2];
const b = await puppeteer.launch({ headless: 'new' });
const p = await b.newPage();
await p.setViewport({ width: 2048, height: 2048 });
await p.goto('http://localhost:8765/spike/sprite-capture.html', { waitUntil: 'load' });
await p.evaluate((f) => window.__loadClip(f), `../characters/${n}/${n}-rigged.glb`);
await p.waitForFunction(() => window.__ready === true, { timeout: 30000 });
if (process.argv[3]) await p.evaluate((k) => window.__setLight(parseFloat(k)), process.argv[3]);
await p.evaluate(() => window.__setTime(0));
const full = await p.screenshot({ omitBackground: true });
const { info } = await sharp(full).trim({ threshold: 10 }).toBuffer({ resolveWithObject: true });
const top = Math.max(0, -info.trimOffsetTop), left = -info.trimOffsetLeft;
const w = Math.round(info.width * 0.32);
await sharp(full).extract({ left: Math.max(0, left + Math.round(info.width / 2 - w / 2)), top, width: w, height: Math.round(info.height * 0.2) }).flatten({ background: '#ffffff' }).png().toFile(`fal-assets/spike/head-${n}${process.argv[3] ? '-L' + process.argv[3] : ''}.png`);
await b.close();
console.log('ok');
