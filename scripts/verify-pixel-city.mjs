import puppeteer from 'puppeteer';
import { fileURLToPath, pathToFileURL } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const file = resolve(__dirname, '..', 'public', 'pixel-city.html');
const url = pathToFileURL(file).href;

const errors = [];
const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
page.on('requestfailed', r => { const u = r.url(); if (!u.includes('fonts.g')) errors.push('REQFAIL: ' + u + ' ' + r.failure()?.errorText); });

await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
await new Promise(r => setTimeout(r, 1500));
// walk the player a moment to exercise movement + collision
await page.keyboard.down('d'); await new Promise(r => setTimeout(r, 500)); await page.keyboard.up('d');
await page.keyboard.down('w'); await new Promise(r => setTimeout(r, 500)); await page.keyboard.up('w');
// DAYTIME shot first (default tod=0.5 = noon)
const out = resolve(__dirname, 'shot-pixel-city.png');
await page.screenshot({ path: out });
// then toggle to night
await page.keyboard.press('t');
await new Promise(r => setTimeout(r, 800));
const outNight = resolve(__dirname, 'shot-pixel-city-night.png');
await page.screenshot({ path: outNight });

await browser.close();
console.log('errors:', errors.length);
if (errors.length) console.log(errors.join('\n'));
console.log('screenshot:', out);
process.exit(errors.length ? 1 : 0);
