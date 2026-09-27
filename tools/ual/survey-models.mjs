// survey-models.mjs — header-only inventory of every .glb/.gltf under a folder (low RAM: never loads meshes).
//   node tools/ual/survey-models.mjs <folder> <out.json>
// Per file: MB, triangles, bounds (metres, root-scale applied), images (count + max px), animations, joints, meshopt/draco.
import fs from 'node:fs'; import path from 'node:path';
const [ROOT, OUT] = process.argv.slice(2);
const SKIP = /node_modules|\.git|cobalt-main|MiroFish|OpenCut|tactics-rpg|tidewater|img2threejs|shaddai-realms-scaffold|_files$/i;
const files = [];
(function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (SKIP.test(e.name)) continue; if (e.isDirectory()) walk(p); else if (/\.(glb|gltf)$/i.test(e.name)) files.push(p); } })(ROOT);

function readGlb(p) {
  const fd = fs.openSync(p, 'r'), h = Buffer.alloc(20); fs.readSync(fd, h, 0, 20, 0);
  if (h.readUInt32LE(0) !== 0x46546c67) { fs.closeSync(fd); throw new Error('not glb'); }
  const jl = h.readUInt32LE(12), jb = Buffer.alloc(jl); fs.readSync(fd, jb, 0, jl, 20);
  const binStart = 20 + jl + 8;
  return { json: JSON.parse(jb.toString('utf8')), peek: (off, n) => { const b = Buffer.alloc(n); fs.readSync(fd, b, 0, n, binStart + off); return b; }, close: () => fs.closeSync(fd) };
}
function readGltf(p) {
  const json = JSON.parse(fs.readFileSync(p, 'utf8')); const dir = path.dirname(p); const fds = {};
  return { json, dir, peek: (off, n, buf) => { const u = json.buffers[buf].uri; if (!u || u.startsWith('data:')) return Buffer.alloc(0); const f = path.join(dir, decodeURIComponent(u)); if (!fs.existsSync(f)) return Buffer.alloc(0); fds[f] ??= fs.openSync(f, 'r'); const b = Buffer.alloc(n); fs.readSync(fds[f], b, 0, n, off); return b; },
    close: () => Object.values(fds).forEach((fd) => fs.closeSync(fd)) };
}
function imgSize(b) {
  if (b.length > 24 && b.readUInt32BE(0) === 0x89504e47) return [b.readUInt32BE(16), b.readUInt32BE(20)];
  if (b.length > 4 && b[0] === 0xff && b[1] === 0xd8) { let i = 2; while (i < b.length - 9) { if (b[i] !== 0xff) { i++; continue; } const m = b[i + 1]; if (m >= 0xc0 && m <= 0xc3) return [b.readUInt16BE(i + 7), b.readUInt16BE(i + 5)]; i += 2 + b.readUInt16BE(i + 2); } }
  if (b.length > 30 && b.toString('ascii', 0, 4) === 'RIFF') { const t = b.toString('ascii', 12, 16); if (t === 'VP8 ') return [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff]; if (t === 'VP8L') { const v = b.readUInt32LE(21); return [(v & 0x3fff) + 1, ((v >> 14) & 0x3fff) + 1]; } if (t === 'VP8X') return [1 + b.readUIntLE(24, 3), 1 + b.readUIntLE(27, 3)]; }
  return null;
}
const mul = (a, b) => { const o = new Array(16).fill(0); for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k]; return o; };
function nodeMat(n) {
  if (n.matrix) return n.matrix; const [x, y, z, w] = n.rotation || [0, 0, 0, 1], [sx, sy, sz] = n.scale || [1, 1, 1], [tx, ty, tz] = n.translation || [0, 0, 0];
  return [(1 - 2 * (y * y + z * z)) * sx, 2 * (x * y + z * w) * sx, 2 * (x * z - y * w) * sx, 0, 2 * (x * y - z * w) * sy, (1 - 2 * (x * x + z * z)) * sy, 2 * (y * z + x * w) * sy, 0, 2 * (x * z + y * w) * sz, 2 * (y * z - x * w) * sz, (1 - 2 * (x * x + y * y)) * sz, 0, tx, ty, tz, 1];
}
const out = [];
for (const f of files) {
  const rel = path.relative(ROOT, f), mb = +(fs.statSync(f).size / 1048576).toFixed(1);
  try {
    const G = /\.glb$/i.test(f) ? readGlb(f) : readGltf(f), J = G.json, A = J.accessors || [];
    let tris = 0; const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
    const meshTris = (J.meshes || []).map((m) => m.primitives.reduce((s, pr) => s + ((pr.mode ?? 4) === 4 ? (pr.indices != null ? A[pr.indices].count : A[pr.attributes.POSITION].count) / 3 : 0), 0));
    const visit = (ni, M) => { const n = J.nodes[ni], W = mul(M, nodeMat(n));
      if (n.mesh != null) { tris += meshTris[n.mesh]; for (const pr of J.meshes[n.mesh].primitives) { const a = A[pr.attributes.POSITION]; if (!a.min) continue;
        for (let c = 0; c < 8; c++) { const p = [c & 1 ? a.max[0] : a.min[0], c & 2 ? a.max[1] : a.min[1], c & 4 ? a.max[2] : a.min[2]];
          for (let k = 0; k < 3; k++) { const v = W[k] * p[0] + W[4 + k] * p[1] + W[8 + k] * p[2] + W[12 + k]; mn[k] = Math.min(mn[k], v); mx[k] = Math.max(mx[k], v); } } } }
      (n.children || []).forEach((c) => visit(c, W)); };
    const sc = (J.scenes || [])[J.scene || 0]; (sc ? sc.nodes : []).forEach((ni) => visit(ni, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]));
    let maxPx = 0; for (const im of J.images || []) { let b = null;
      if (im.bufferView != null) { const bv = J.bufferViews[im.bufferView]; b = G.peek(bv.byteOffset || 0, Math.min(bv.byteLength, 65536), bv.buffer); }
      else if (im.uri && !im.uri.startsWith('data:')) { const fp = path.join(G.dir || path.dirname(f), decodeURIComponent(im.uri)); if (fs.existsSync(fp)) { const fd = fs.openSync(fp, 'r'); b = Buffer.alloc(65536); fs.readSync(fd, b, 0, 65536, 0); fs.closeSync(fd); } }
      const s = b && imgSize(b); if (s) maxPx = Math.max(maxPx, s[0], s[1]); }
    G.close();
    const size = mn[0] < 1e8 ? mx.map((v, k) => +(v - mn[k]).toFixed(2)) : null;
    out.push({ file: rel, mb, tris: Math.round(tris), size_xyz: size, images: (J.images || []).length, maxPx, materials: (J.materials || []).length,
      anims: (J.animations || []).map((a) => a.name || '?'), joints: (J.skins || []).reduce((s, k) => Math.max(s, k.joints.length), 0),
      ext: (J.extensionsUsed || []).filter((e) => /draco|meshopt|ktx|webp/i.test(e)) });
  } catch (e) { out.push({ file: rel, mb, error: String(e.message).slice(0, 120) }); }
}
fs.writeFileSync(OUT, JSON.stringify(out, null, 1)); console.log('surveyed', out.length, 'errors', out.filter((o) => o.error).length);
