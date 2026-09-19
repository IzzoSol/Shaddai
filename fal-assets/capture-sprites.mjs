#!/usr/bin/env node
/* SHADDAI · capture-sprites.mjs
 *
 * Renders Little-Fighter-style 2D sprite-sheet strips straight off the
 * already-paid-for rigged 3D characters (fal-assets/characters/<name>/) --
 * zero extra API spend, guarantees pixel-perfect 2D/3D parity since it's
 * literally the same mesh+animation, just screenshotted frame-by-frame with
 * headless Chromium (puppeteer) via fal-assets/spike/sprite-capture.html.
 *
 * The 3D viewer deliberately renders each frame zoomed WAY out into a big
 * safe canvas (the CPU-side geometry bounding box on these auto-rigged
 * meshes doesn't reliably match where the GPU-skinned mesh actually
 * renders, so precise 3D framing math isn't trustworthy here). This script
 * finds the real character silhouette in the rendered PIXELS instead (via
 * sharp's trim), takes the union bounding box across every frame of a clip
 * so the character doesn't jitter in scale/position frame to frame, then
 * crops+centers every frame from that shared box.
 *
 * USAGE:
 *   node fal-assets/capture-sprites.mjs <name> [framesPerClip]
 *   node fal-assets/capture-sprites.mjs warrior 8
 *
 * Requires the local static server serving fal-assets/ on :8899.
 */
import puppeteer from 'puppeteer';
import sharp from 'sharp';
import { mkdirSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const BASE_URL = 'http://localhost:8899';

const CLIPS = ['walking', 'running', 'action'];
const RAW_SIZE = 2048;  // raw safe-zoomed render size (4x the cell: crisp after fit-scaling)
const OUT_SIZE = 512;   // final per-frame sprite cell size
const PAD = 24 * 4;      // px padding around the trimmed union box (raw pixels)
const FIT_MARGIN = 16;   // px kept clear inside the final cell          // px padding around the trimmed union box

async function captureRawFrames(page, name, clip, framesPerClip) {
  const glbPath = `../characters/${name}/${name}-${clip}.glb`;
  const abs = resolve(ROOT, `fal-assets/characters/${name}/${name}-${clip}.glb`);
  if (!existsSync(abs)) {
    console.log(`   (skip ${clip} -- no file at ${abs})`);
    return null;
  }
  await page.evaluate((p) => window.__loadClip(p), glbPath);
  await page.waitForFunction(() => window.__ready === true || window.__ready === 'error', { timeout: 30000 });
  const ready = await page.evaluate(() => window.__ready);
  if (ready === 'error') { console.log(`   (skip ${clip} -- load error)`); return null; }
  const duration = await page.evaluate(() => window.__duration);

  const frames = [];
  for (let i = 0; i < framesPerClip; i++) {
    const t = duration > 0 ? (duration * i) / framesPerClip : 0;
    await page.evaluate((tt) => window.__setTime(tt), t);
    const buf = await page.screenshot({ omitBackground: true });
    frames.push(buf);
  }
  return frames;
}

async function trimBox(buf) {
  const { info } = await sharp(buf).trim({ threshold: 10 }).toBuffer({ resolveWithObject: true });
  const left = -info.trimOffsetLeft;
  const top = -info.trimOffsetTop;
  return { left, top, right: left + info.width, bottom: top + info.height };
}

async function processClip(frames, name, clip, outDir) {
  const boxes = await Promise.all(frames.map(trimBox));
  const union = boxes.reduce((a, b) => ({
    left: Math.min(a.left, b.left),
    top: Math.min(a.top, b.top),
    right: Math.max(a.right, b.right),
    bottom: Math.max(a.bottom, b.bottom),
  }));
  const left = Math.max(0, union.left - PAD);
  const top = Math.max(0, union.top - PAD);
  const right = Math.min(RAW_SIZE, union.right + PAD);
  const bottom = Math.min(RAW_SIZE, union.bottom + PAD);
  const cropW = right - left;
  const cropH = bottom - top;

  let fitScale = 1;
  const finalFrames = [];
  for (let i = 0; i < frames.length; i++) {
    // Fit the union box to the cell (uniform scale, bottom-anchored). RAW is
    // 4x oversampled so this only ever DOWNscales = crisp. Characters used to
    // fill ~45% of the cell at 512 raw; now they fill it.
    const fit = Math.min((OUT_SIZE - 2 * FIT_MARGIN) / cropW, (OUT_SIZE - FIT_MARGIN) / cropH);
    fitScale = fit;
    const cropped = await sharp(frames[i]).extract({ left, top, width: cropW, height: cropH })
      .resize({ width: Math.round(cropW * fit), height: Math.round(cropH * fit), kernel: 'lanczos3' }).toBuffer();
    const framed = await sharp({
      create: { width: OUT_SIZE, height: OUT_SIZE, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } }
    }).composite([{ input: cropped, gravity: 'south' }]).png().toBuffer();
    finalFrames.push(framed);
    writeFileSync(resolve(outDir, `${name}-${clip}-${String(i).padStart(2, '0')}.png`), framed);
  }

  const composites = finalFrames.map((buf, i) => ({ input: buf, left: i * OUT_SIZE, top: 0 }));
  const strip = sharp({
    create: { width: OUT_SIZE * finalFrames.length, height: OUT_SIZE, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } }
  }).composite(composites);
  const stripPath = resolve(outDir, `${name}-${clip}-strip.png`);
  await strip.png().toFile(stripPath);
  console.log(`   saved strip: ${stripPath} (${finalFrames.length} frames, ${OUT_SIZE}x${OUT_SIZE} each, union-cropped ${cropW}x${cropH} raw, fit x${fitScale.toFixed(3)})`);
  return { clip, fitScale, cropW, cropH };
}

async function main() {
  const [, , name, framesArg] = process.argv;
  if (!name) {
    console.error('usage: node fal-assets/capture-sprites.mjs <name> [framesPerClip=8]');
    process.exit(1);
  }
  const framesPerClip = parseInt(framesArg || '8', 10);
  const outDir = resolve(ROOT, `fal-assets/characters/${name}/sprites`);
  mkdirSync(outDir, { recursive: true });

  console.log(`▶ capturing sprite sheets for "${name}" (${framesPerClip} frames/clip, free -- headless render only)`);
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  await page.setViewport({ width: RAW_SIZE, height: RAW_SIZE });
  await page.goto(`${BASE_URL}/spike/sprite-capture.html`, { waitUntil: 'load' });

  const meta = [];
  for (const clip of CLIPS) {
    console.log(`  ${clip}...`);
    const frames = await captureRawFrames(page, name, clip, framesPerClip);
    if (!frames) continue;
    meta.push(await processClip(frames, name, clip, outDir));
  }
  // px per normalized model unit in the raw render = RAW/(2*FRAME_HALF); FRAME_HALF=5.0 in sprite-capture.html
  writeFileSync(resolve(outDir, 'meta.json'), JSON.stringify({ rawPxPerModelUnit: RAW_SIZE / 10, cell: OUT_SIZE, clips: meta }, null, 2));

  await browser.close();
  console.log(`\n✔ Done. Sprite sheets in fal-assets/characters/${name}/sprites/`);
}

main().catch((e) => { console.error('CAPTURE FAILED:', e.message); process.exit(1); });
