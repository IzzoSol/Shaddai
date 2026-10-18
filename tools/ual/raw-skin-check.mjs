// raw-skin-check.mjs — decode the council GLB's BIN chunk directly: JOINTS_0 max, WEIGHTS_0 sums, POSITION bounds, inverse binds. No loaders, no transforms.
import fs from 'fs';
import path from 'path';
const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1'));
const REPO = HERE.includes('Shaddai-3d') ? HERE.slice(0, HERE.indexOf('Shaddai-3d') + 'Shaddai-3d'.length) : 'C:/Users/Brittany/Shaddai-3d';

function glb(file) {
  const b = fs.readFileSync(file); let off = 12, json = null, bin = null;
  while (off < b.length) {
    const len = b.readUInt32LE(off), type = b.readUInt32LE(off + 4);
    if (type === 0x4E4F534A) json = JSON.parse(b.slice(off + 8, off + 8 + len).toString('utf8'));
    else if (bin === null) bin = b.slice(off + 8, off + 8 + len);   // any non-JSON chunk = BIN (some exporters use chunkType 0)
    off += 8 + len + ((8 - (len % 8)) % 8);
  }
  return { json, bin };
}
const COMP = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
function view(buf, acc) {
  const bv = acc.bufferView != null ? acc.bufferView : null;
  const base = acc.byteOffset || 0;
  const view = bv != null ? buf : buf; // single buffer assumed
  let off = (bv != null ? (buf._bvOff[bv] || 0) : 0) + base;
  return off;
}
const f2 = n => n.toFixed(3);
for (const name of process.argv.slice(2).length ? process.argv.slice(2) : ['ZEROX']) {
  try {
  const p = path.join(REPO, 'public', 'assets', 'agents', name + '.glb');
  const { json, bin } = glb(p);
  bin._bvOff = []; // map bufferView idx -> byte offset within BIN
  (json.bufferViews || []).forEach((bv, i) => { bin._bvOff[i] = (json.buffers[bv.buffer || 0].byteOffset || 0) + (bv.byteOffset || 0); });
  const out = { model: name };
  (json.meshes || []).forEach((m, mi) => (m.primitives || []).forEach(pr => {
    const read = (attr) => {
      const acc = json.accessors[pr.attributes[attr]]; if (!acc) return null;
      const ct = COMP[acc.componentType], n = acc.count, comps = { VEC2: 2, VEC3: 3, VEC4: 4, SCALAR: 1, MAT4: 16 }[acc.type];
      const off = view(bin, acc), stride = acc.bufferView != null ? (json.bufferViews[acc.bufferView].byteStride || ct * comps) : ct * comps;
      return { off, stride, n, comps, ct, acc };
    };
    const J = read('JOINTS_0'), W = read('WEIGHTS_0'), P = read('POSITION');
    if (J) {
      let jmax = 0, jbad = 0;
      const dv = new DataView(bin.buffer, bin.byteOffset + J.off);
      for (let i = 0; i < J.n; i++) for (let c = 0; c < 4; c++) {
        const v = J.ct === 2 ? dv.getUint16(i * J.stride + c * 2, true) : J.ct === 1 ? dv.getUint8(i * J.stride + c) : dv.getUint32(i * J.stride + c * 4, true);
        if (v > jmax) jmax = v;
      }
      out.joints0max = jmax; out.joints0count = J.n;
    }
    if (W) {
      const dv = new DataView(bin.buffer, bin.byteOffset + W.off);
      let badSum = 0, maxSum = 0;
      for (let i = 0; i < W.n; i++) {
        let s = 0;
        for (let c = 0; c < 4; c++) s += dv.getFloat32(i * W.stride + c * 4, true);
        if (s > maxSum) maxSum = s;
        if (Math.abs(s - 1) > 0.05) badSum++;
      }
      out.weightsBadSum = badSum; out.weightsMaxSum = +maxSum.toFixed(3);
    }
    if (P) { const dv = new DataView(bin.buffer, bin.byteOffset + P.off); let lo = 1e9, hi = -1e9;
      for (let i = 0; i < Math.min(P.n, 60000); i++) { const y = dv.getFloat32(i * P.stride + 4, true); if (y < lo) lo = y; if (y > hi) hi = y; }
      out.posY = [f2(lo), f2(hi)];
    }
  }));
  const sk = (json.skins || [])[0];
  if (sk && sk.inverseBindMatrices != null) {
    const acc = json.accessors[sk.inverseBindMatrices];
    const off = view(bin, acc), ct = COMP[acc.componentType];
    const dv = new DataView(bin.buffer, bin.byteOffset + off);
    const stride = acc.bufferView != null ? (json.bufferViews[acc.bufferView].byteStride || 64) : 64;
    out.ibmFirstBones = [];
    for (let bIdx of [0, Math.floor(sk.joints.length / 2), sk.joints.length - 1]) {
      const m = [];
      for (let c = 0; c < 16; c++) m.push(+dv.getFloat32(bIdx * stride + c * 4, true).toFixed(2));
      out.ibmFirstBones.push({ bone: bIdx, m: m.slice(0, 4).concat(['...'], m.slice(12)) });
    }
  }
  console.log(JSON.stringify(out));
  } catch (e) { console.log(JSON.stringify({ model: name, error: e.message })); }
}
