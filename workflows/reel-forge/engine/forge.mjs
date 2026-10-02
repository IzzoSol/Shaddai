// Reel Forge renderer — SHADDAI original.
//   node forge.mjs [--page reel.html] [--fps 30] [--blur 0.5] [--taps 6] [--out out/reel.mp4]
//
// 1. Serves the folder on a throw-away local port (ES modules need http, not file://).
// 2. Asks the page to paint each frame and saves it as a numbered PNG in out/frames.
//    Frames that already exist are skipped, so an interrupted render resumes.
// 3. ffmpeg turns the frame folder into an H.264 MP4.
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, mkdir, access, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { extname, join, resolve } from 'node:path';

const flag = (name, fallback) => {
  const i = process.argv.indexOf('--' + name);
  return i > -1 ? process.argv[i + 1] : fallback;
};
const root = resolve(flag('root', '.'));
const pageName = flag('page', 'reel.html');
const fps = Number(flag('fps', 30));
const shutter = Number(flag('blur', 0.5)) / fps;      // fraction of a frame the "shutter" stays open
const taps = Number(flag('taps', 6));
const outFile = flag('out', 'out/reel.mp4');
const framesDir = join(root, 'out', 'frames');

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const server = createServer(async (req, res) => {
  try {
    const path = join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (!path.startsWith(root)) throw new Error('outside root');
    res.writeHead(200, { 'content-type': MIME[extname(path)] || 'application/octet-stream' });
    res.end(await readFile(path));
  } catch { res.writeHead(404).end(); }
});
await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
const base = `http://127.0.0.1:${server.address().port}/`;

await mkdir(framesDir, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });
await page.goto(base + pageName);
await page.waitForFunction(() => typeof window.__paint === 'function');
await page.evaluate(() => document.fonts.ready);

const reel = await page.evaluate(() => window.__reel);
await page.setViewportSize({ width: reel.width, height: reel.height });
const frames = Math.round(reel.seconds * fps);
const exists = (p) => access(p).then(() => true, () => false);

for (let n = 0; n < frames; n++) {
  const file = join(framesDir, String(n).padStart(6, '0') + '.png');
  if (await exists(file)) continue;
  await page.evaluate(([t, s, k]) => window.__paint(t, s, k), [n / fps, shutter, taps]);
  await writeFile(file, await page.locator('canvas').screenshot({ type: 'png' }));
  if (n % fps === 0) console.log(`frame ${n}/${frames}`);
}
await browser.close();
server.close();

await mkdir(join(root, 'out'), { recursive: true });
const args = ['-y', '-framerate', String(fps), '-i', join(framesDir, '%06d.png'),
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '15', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', join(root, outFile)];
await new Promise((ok, fail) => spawn('ffmpeg', args, { stdio: 'inherit' }).on('close', (c) => (c ? fail(new Error('ffmpeg ' + c)) : ok())));
console.log('done →', outFile);
