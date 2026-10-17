/* _athenaeum-shot.cjs — headless screenshots of the Athenaeum campus.
 *   node tools/_athenaeum-shot.cjs [outDir]      (serves ./public itself; needs network for the three.js CDN import map)
 * Writes athenaeum-<view>.png for the overview, rotunda, dais, gate, dean's atrium and every wing. */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

const PUBLIC = path.resolve(__dirname, '..', 'public');
const OUT = path.resolve(process.argv[2] || path.join(__dirname, '..', '.shots'));
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.css': 'text/css' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const server = http.createServer((req, res) => {
    const p = path.join(PUBLIC, decodeURIComponent(req.url.split('?')[0]));
    if (!p.startsWith(PUBLIC) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end('nope'); }
    res.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port;
  const browser = await puppeteer.launch({ headless: 'new', executablePath: fs.existsSync(CHROME) ? CHROME : undefined, protocolTimeout: 300000, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1100, height: 680 });
  const errs = []; page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 160))); page.on('console', (m) => { if (m.type() === 'error') errs.push(String(m.text()).slice(0, 160)); });
  await page.goto(base + '/athenaeum-viewer.html', { waitUntil: 'domcontentloaded', timeout: 120000 });
  for (let i = 0; i < 60; i++) { if (await page.evaluate(() => !!(window.__viewer && window.__viewer.ready)).catch(() => false)) break; await sleep(1000); }
  const shots = [['overview', () => window.__viewer.views.over()], ['rotunda', () => window.__viewer.views.rot()], ['dais', () => window.__viewer.views.dais()], ['gate', () => window.__viewer.views.gate()], ['dean', () => window.__viewer.views.dean()]];
  for (const w of ['observatory', 'library', 'museum', 'forge', 'music', 'council']) shots.push(['wing-' + w, new Function('window.__viewer.wingView("' + w + '")')]);
  for (const [name, fn] of shots) {
    await page.evaluate(fn); await sleep(1500);
    await page.screenshot({ path: path.join(OUT, 'athenaeum-' + name + '.png') });
    console.log('shot', name);
  }
  console.log('stats', await page.$eval('#stats', (e) => e.textContent).catch(() => '?'));
  console.log('errors', JSON.stringify(errs.slice(0, 5)));
  await browser.close(); server.close();
})().catch((e) => { console.error('FAILED', e && e.stack || e); process.exit(1); });
