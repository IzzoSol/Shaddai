// make-test-terrain.cjs — writes a SYNTHETIC terrain set for developing public/world-terrain-v4.js before the
// real Blender export exists. Same file contract the Blender export will follow (public/assets/terrain/):
//   height16.bin  raw Uint16 little-endian, row-major, row 0 = north (z = -HALF), col 0 = west (x = -HALF)
//   height16.png  the same samples as a 16-bit grayscale PNG (big-endian per the PNG spec) — the fallback path
//   color.jpg     ground colour, same footprint/orientation (sharp if available, else color.png via zlib)
//   terrain.json  { half_units, min_m, max_m, sea_level_m, size_px }
//   samples.json  analytic ground-truth heights (game units) at fixed points — the lab/probe checks heightAt
//                 against these (bilinear of quantised samples must land within 0.5% of the height range).
// Sample convention (IMPORTANT, the runtime uses the same one): N samples span [-HALF, +HALF] INCLUSIVE, i.e.
// sample k sits at -HALF + k * 2*HALF/(N-1). Height (m) = min_m + v/65535 * (max_m - min_m).
//
// Usage: node tools/terrain/make-test-terrain.cjs [outDir] [sizePx]
//   default outDir = public/assets/terrain/_test, sizePx = 1024 (disk is tight — 1024² is ~2 MB bin + ~2 MB png)
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const OUT = path.resolve(process.argv[2] || path.join(__dirname, '..', '..', 'public', 'assets', 'terrain', '_test'));
const N = Math.max(16, parseInt(process.argv[3] || '1024', 10));
const PM = 7 / 1.8;                  // scale law: 1 m = 3.889 game units
const HALF = 19450;                  // ~5 km half-extent in game units (the target ~10 km world)
const MIN_M = -80, MAX_M = 620, SEA_M = 0;

// ── the analytic test world (metres, from world x/z in UNITS) ─────────────────────────────────────────────
// A few gaussian hills/mountains + a broad sea basin in the south-east + gentle rolling noise. Smooth on
// purpose: bilinear reconstruction error must stay well under the 0.5% check tolerance.
const HILLS = [
  // [x_units, z_units, radius_units, height_m]
  [0, 0, 5200, 40],            // the central plateau (city)
  [-9000, -8000, 3800, 520],   // NW mountain
  [-5200, -10500, 2400, 330],  // NW shoulder
  [8000, -9000, 3000, 260],    // NE hill
  [-11000, 7000, 3200, 190],   // SW hill
  [2500, -3000, 1400, 70],     // small knoll near centre
];
const SEA = [9500, 9500, 7000, 140]; // SE sea basin: depth pulls ground below sea level
function heightM(x, z) {
  let h = 6;
  for (const [cx, cz, r, hh] of HILLS) { const d2 = ((x - cx) ** 2 + (z - cz) ** 2) / (r * r); h += hh * Math.exp(-d2); }
  const sd2 = ((x - SEA[0]) ** 2 + (z - SEA[1]) ** 2) / (SEA[2] * SEA[2]);
  h -= SEA[3] * Math.exp(-sd2 * 0.8);
  h += 6 * Math.sin(x / 1300) * Math.cos(z / 1700) + 3 * Math.sin((x + z) / 610);   // rolling
  return Math.max(MIN_M, Math.min(MAX_M, h));
}

fs.mkdirSync(OUT, { recursive: true });
const cell = (2 * HALF) / (N - 1);
const H = new Uint16Array(N * N);
for (let j = 0; j < N; j++) {
  const z = -HALF + j * cell;
  for (let i = 0; i < N; i++) {
    const x = -HALF + i * cell;
    H[j * N + i] = Math.round(((heightM(x, z) - MIN_M) / (MAX_M - MIN_M)) * 65535);
  }
}

// height16.bin — raw LE (Node Buffers on x86 are LE; write explicitly anyway so the contract never depends on it)
const bin = Buffer.alloc(N * N * 2);
for (let k = 0; k < N * N; k++) bin.writeUInt16LE(H[k], k * 2);
fs.writeFileSync(path.join(OUT, 'height16.bin'), bin);

// height16.png — hand-rolled: IHDR (16-bit, colour type 0 gray), one zlib IDAT, filter byte per row.
// Rows use filter 2 (Up) — compresses smooth terrain far better than None and exercises the runtime unfilter.
const CRC_T = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
function crc32(buf) { let c = -1; for (let i = 0; i < buf.length; i++) c = CRC_T[(c ^ buf[i]) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; }
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png16(W, Hh, get) {
  const stride = W * 2, raw = Buffer.alloc((stride + 1) * Hh), prev = Buffer.alloc(stride), row = Buffer.alloc(stride);
  for (let y = 0; y < Hh; y++) {
    for (let x = 0; x < W; x++) row.writeUInt16BE(get(x, y), x * 2);
    const o = y * (stride + 1); raw[o] = 2;
    for (let b = 0; b < stride; b++) raw[o + 1 + b] = (row[b] - prev[b]) & 255;
    row.copy(prev);
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(Hh, 4); ihdr[8] = 16; ihdr[9] = 0; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
fs.writeFileSync(path.join(OUT, 'height16.png'), png16(N, N, (x, y) => H[y * N + x]));

// colour: height/slope ramp (sea floor → sand → grass → rock → snow), 8-bit RGB same orientation
const rgb = Buffer.alloc(N * N * 3);
function lerp(a, b, t) { return a + (b - a) * t; }
function ramp(h, slope) {
  const stops = [[-80, [18, 40, 62]], [-2, [60, 96, 110]], [3, [196, 182, 138]], [14, [88, 128, 62]], [180, [62, 102, 48]], [330, [112, 104, 96]], [470, [150, 146, 142]], [560, [236, 240, 244]]];
  let c = stops[stops.length - 1][1];
  for (let s = 0; s < stops.length - 1; s++) if (h < stops[s + 1][0]) { const t = Math.max(0, (h - stops[s][0]) / (stops[s + 1][0] - stops[s][0])); c = stops[s][1].map((v, q) => lerp(v, stops[s + 1][1][q], t)); break; }
  const rock = Math.min(1, Math.max(0, (slope - 0.25) * 2.5));   // steep → rock grey
  return c.map((v, q) => lerp(v, [104, 98, 92][q], rock * (h > 3 ? 1 : 0)));
}
for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
  const k = j * N + i, hm = MIN_M + (H[k] / 65535) * (MAX_M - MIN_M);
  const hx = MIN_M + (H[j * N + Math.min(N - 1, i + 1)] / 65535) * (MAX_M - MIN_M) - hm;
  const hz = MIN_M + (H[Math.min(N - 1, j + 1) * N + i] / 65535) * (MAX_M - MIN_M) - hm;
  const slope = Math.hypot(hx, hz) / (cell / PM);
  const c = ramp(hm, slope), n = ((i * 7919 + j * 104729) % 17) - 8;   // tiny dither so it isn't banded
  rgb[k * 3] = Math.max(0, Math.min(255, c[0] + n)); rgb[k * 3 + 1] = Math.max(0, Math.min(255, c[1] + n)); rgb[k * 3 + 2] = Math.max(0, Math.min(255, c[2] + n));
}

// ground-truth sample points (units): grid points (exact quantised) + off-grid (bilinear) + landmarks
const samples = [];
const rnd = (() => { let s = 12345; return () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff); })();
for (let q = 0; q < 60; q++) { const x = (rnd() * 2 - 1) * HALF * 0.98, z = (rnd() * 2 - 1) * HALF * 0.98; samples.push({ x: +x.toFixed(2), z: +z.toFixed(2), h: +(heightM(x, z) * PM).toFixed(4) }); }
HILLS.forEach(([x, z]) => samples.push({ x, z, h: +(heightM(x, z) * PM).toFixed(4) }));
samples.push({ x: SEA[0], z: SEA[1], h: +(heightM(SEA[0], SEA[1]) * PM).toFixed(4) });

const meta = { half_units: HALF, min_m: MIN_M, max_m: MAX_M, sea_level_m: SEA_M, size_px: N, generator: 'tools/terrain/make-test-terrain.cjs' };
fs.writeFileSync(path.join(OUT, 'terrain.json'), JSON.stringify(meta, null, 2));
fs.writeFileSync(path.join(OUT, 'samples.json'), JSON.stringify({ tolerance_frac_of_range: 0.005, range_units: (MAX_M - MIN_M) * PM, samples }, null, 1));

(async () => {
  let sharp = null;
  try { sharp = require('sharp'); } catch (e) { try { sharp = require('C:/Users/Brittany/Shaddai/node_modules/sharp'); } catch (e2) { /* fall through */ } }
  if (sharp) {
    await sharp(rgb, { raw: { width: N, height: N, channels: 3 } }).jpeg({ quality: 86 }).toFile(path.join(OUT, 'color.jpg'));
  } else {
    // no JPEG encoder: 8-bit RGB PNG (runtime falls back color.jpg → color.png)
    const stride = N * 3, raw = Buffer.alloc((stride + 1) * N);
    for (let y = 0; y < N; y++) { raw[y * (stride + 1)] = 0; rgb.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride); }
    const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(N, 0); ihdr.writeUInt32BE(N, 4); ihdr[8] = 8; ihdr[9] = 2;
    fs.writeFileSync(path.join(OUT, 'color.png'), Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
  }
  const files = fs.readdirSync(OUT).map((f) => f + ' ' + Math.round(fs.statSync(path.join(OUT, f)).size / 1024) + 'KB');
  console.log('[make-test-terrain] wrote', OUT, '\n  ' + files.join('\n  '));
})();
