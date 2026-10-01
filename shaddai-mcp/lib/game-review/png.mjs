// Minimal PNG reader/writer (no dependencies) — enough to analyse browser screenshots.
// Reads 8-bit greyscale, grey+alpha, RGB and RGBA, non-interlaced. Always returns RGBA.
import { inflateSync, deflateSync } from 'node:zlib';

const SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const CHANNELS = { 0: 1, 2: 3, 4: 2, 6: 4 };

export function decodePng(buf) {
  if (!buf.subarray(0, 8).equals(SIG)) throw new Error('not a PNG file');
  let pos = 8, w = 0, h = 0, depth = 0, type = 0, interlace = 0;
  const idat = [];
  while (pos + 8 <= buf.length) {
    const len = buf.readUInt32BE(pos), kind = buf.toString('ascii', pos + 4, pos + 8), body = buf.subarray(pos + 8, pos + 8 + len);
    if (kind === 'IHDR') { w = body.readUInt32BE(0); h = body.readUInt32BE(4); depth = body[8]; type = body[9]; interlace = body[12]; }
    else if (kind === 'IDAT') idat.push(body);
    else if (kind === 'IEND') break;
    pos += 12 + len;
  }
  if (!w || !h) throw new Error('PNG has no header');
  if (depth !== 8) throw new Error(`unsupported PNG bit depth ${depth} (need 8)`);
  if (!(type in CHANNELS)) throw new Error(`unsupported PNG colour type ${type} (palette images are not supported)`);
  if (interlace) throw new Error('interlaced PNGs are not supported');

  const bpp = CHANNELS[type], stride = w * bpp;
  const raw = inflateSync(Buffer.concat(idat));
  if (raw.length < h * (stride + 1)) throw new Error('PNG data is truncated');
  const px = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) {
    const filter = raw[y * (stride + 1)], src = y * (stride + 1) + 1, dst = y * stride;
    for (let x = 0; x < stride; x++) {
      const cur = raw[src + x];
      const a = x >= bpp ? px[dst + x - bpp] : 0;
      const b = y > 0 ? px[dst - stride + x] : 0;
      const c = x >= bpp && y > 0 ? px[dst - stride + x - bpp] : 0;
      let v;
      switch (filter) {
        case 0: v = cur; break;
        case 1: v = cur + a; break;
        case 2: v = cur + b; break;
        case 3: v = cur + ((a + b) >> 1); break;
        case 4: { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v = cur + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c); break; }
        default: throw new Error('bad PNG filter ' + filter);
      }
      px[dst + x] = v & 255;
    }
  }
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const s = i * bpp, o = i * 4;
    if (type === 6) { data[o] = px[s]; data[o + 1] = px[s + 1]; data[o + 2] = px[s + 2]; data[o + 3] = px[s + 3]; }
    else if (type === 2) { data[o] = px[s]; data[o + 1] = px[s + 1]; data[o + 2] = px[s + 2]; data[o + 3] = 255; }
    else { data[o] = data[o + 1] = data[o + 2] = px[s]; data[o + 3] = type === 4 ? px[s + 1] : 255; }
  }
  return { width: w, height: h, data };
}

const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (buf) => { let c = 0xffffffff; for (const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };

function chunk(kind, body) {
  const out = Buffer.alloc(12 + body.length), tag = Buffer.from(kind, 'ascii');
  out.writeUInt32BE(body.length, 0); tag.copy(out, 4); body.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([tag, body])), 8 + body.length);
  return out;
}

// image: { width, height, data: RGBA }
export function encodePng({ width, height, data }) {
  const rows = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) {
    rows[y * (width * 4 + 1)] = 0;
    Buffer.from(data.buffer, data.byteOffset + y * width * 4, width * 4).copy(rows, y * (width * 4 + 1) + 1);
  }
  const head = Buffer.alloc(13);
  head.writeUInt32BE(width, 0); head.writeUInt32BE(height, 4); head[8] = 8; head[9] = 6;
  return Buffer.concat([SIG, chunk('IHDR', head), chunk('IDAT', deflateSync(rows)), chunk('IEND', Buffer.alloc(0))]);
}
