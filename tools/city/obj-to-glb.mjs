#!/usr/bin/env node
/* tools/city/obj-to-glb.mjs — minimal OBJ(+MTL, single palette texture) → GLB converter, 2026-09-27.
 *
 * Built for the MagicaVoxel OBJ exports in the sky-traffic ship set (voxel meshes, one material
 * "palette", a 256x1 (or similar) palette strip PNG as map_Kd, per-face flat normals limited to
 * the 6 axis directions, all faces already triangles). Keeps things intentionally small:
 *   - parses v / vt / vn / f (triangulates any n-gon via fan)
 *   - one POSITION/NORMAL/TEXCOORD_0/indices primitive, one material, one baseColor texture
 *   - recentres the mesh to its base-centre: x/z centred on the bounding-box centre, y shifted so
 *     the lowest vertex sits at y=0 (i.e. the object's "feet" are at the node origin)
 *   - texture sampler forced to NEAREST/CLAMP so the voxel palette stays crisp (no bleed between
 *     adjacent palette cells, no mip blur since these are tiny strip textures)
 *   - does NOT run meshopt/Draco compression — no @gltf-transform/cli or `gltf-transform` binary
 *     is present in tools/ual/node_modules (checked: only core/extensions/meshoptimizer/three
 *     libraries, no CLI, no .bin). Per the task's own fallback, output is left uncompressed and
 *     that fact is reported per file (see console + manifest "compressed": false).
 *
 * Usage: node tools/city/obj-to-glb.mjs <in.obj> <out.glb> [--name Foo]
 * Depends only on @gltf-transform/core, resolved by absolute path from tools/ual/node_modules
 * (this script does not live under tools/ual, so plain bare imports would not resolve there).
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const UAL_NM = 'C:/Users/Brittany/Shaddai-3d/tools/ual/node_modules';
const core = await import(pathToFileURL(path.join(UAL_NM, '@gltf-transform/core/dist/index.js')).href);
const { Document, NodeIO } = core;

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--name') { args.name = argv[++i]; }
    else args._.push(a);
  }
  return args;
}

function parseObj(objPath) {
  const text = fs.readFileSync(objPath, 'utf8');
  const positions = []; // flat [x,y,z,...]
  const normals = [];
  const uvs = [];
  let mtllib = null;
  const outPos = [], outNorm = [], outUv = [];
  const indexCache = new Map(); // "vi/vti/vni" -> outIndex
  const indices = [];

  function vertKey(vi, ti, ni) { return vi + '/' + ti + '/' + ni; }
  function emitVertex(vi, ti, ni) {
    const key = vertKey(vi, ti, ni);
    let idx = indexCache.get(key);
    if (idx !== undefined) return idx;
    idx = outPos.length / 3;
    const p = positions.slice(vi * 3, vi * 3 + 3);
    outPos.push(p[0], p[1], p[2]);
    if (ni >= 0) { const n = normals.slice(ni * 3, ni * 3 + 3); outNorm.push(n[0], n[1], n[2]); }
    else { outNorm.push(0, 1, 0); }
    if (ti >= 0) { const t = uvs.slice(ti * 2, ti * 2 + 2); outUv.push(t[0], 1 - t[1]); } // flip V: OBJ bottom-left -> glTF top-left
    else { outUv.push(0, 0); }
    indexCache.set(key, idx);
    return idx;
  }

  const lines = text.split('\n');
  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];
    if (line.charCodeAt(0) === 35 /* # */) continue; // comment
    if (line.startsWith('mtllib ')) { mtllib = line.slice(7).trim(); continue; }
    if (line.startsWith('v ')) {
      const p = line.trim().split(/\s+/);
      positions.push(parseFloat(p[1]), parseFloat(p[2]), parseFloat(p[3]));
      continue;
    }
    if (line.startsWith('vn ')) {
      const p = line.trim().split(/\s+/);
      normals.push(parseFloat(p[1]), parseFloat(p[2]), parseFloat(p[3]));
      continue;
    }
    if (line.startsWith('vt ')) {
      const p = line.trim().split(/\s+/);
      uvs.push(parseFloat(p[1]), parseFloat(p[2]));
      continue;
    }
    if (line.startsWith('f ')) {
      const p = line.trim().split(/\s+/).slice(1);
      const verts = p.map((tok) => {
        const parts = tok.split('/');
        const vi = parseInt(parts[0], 10);
        const ti = parts[1] ? parseInt(parts[1], 10) : 0;
        const ni = parts[2] ? parseInt(parts[2], 10) : 0;
        // OBJ indices are 1-based, and negative indices are relative to the end of the list so far.
        const resolve = (i, len) => (i > 0 ? i - 1 : len + i);
        return {
          vi: resolve(vi, positions.length / 3),
          ti: ti ? resolve(ti, uvs.length / 2) : -1,
          ni: ni ? resolve(ni, normals.length / 3) : -1,
        };
      });
      // fan-triangulate (handles the common case of already-triangulated faces too)
      for (let k = 1; k < verts.length - 1; k++) {
        const a = emitVertex(verts[0].vi, verts[0].ti, verts[0].ni);
        const b = emitVertex(verts[k].vi, verts[k].ti, verts[k].ni);
        const c = emitVertex(verts[k + 1].vi, verts[k + 1].ti, verts[k + 1].ni);
        indices.push(a, b, c);
      }
      continue;
    }
  }
  return { positions: outPos, normals: outNorm, uvs: outUv, indices, mtllib };
}

function parseMtl(mtlPath) {
  const dir = path.dirname(mtlPath);
  const text = fs.readFileSync(mtlPath, 'utf8');
  let mapKd = null;
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (t.startsWith('map_Kd')) { mapKd = path.join(dir, t.slice(6).trim()); break; }
  }
  return { mapKd };
}

function recentre(positions) {
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i], y = positions[i + 1], z = positions[i + 2];
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
    if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
  }
  const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2,by = minY;
  for (let i = 0; i < positions.length; i += 3) {
    positions[i] -= cx;
    positions[i + 1] -= by;
    positions[i + 2] -= cz;
  }
  return { size: { x: maxX - minX, y: maxY - minY, z: maxZ - minZ }, base: { cx, cz, by } };
}

async function convert(objPath, glbPath, name) {
  const parsed = parseObj(objPath);
  const dims = recentre(parsed.positions);

  const doc = new Document();
  const buffer = doc.createBuffer();

  const posAcc = doc.createAccessor().setType('VEC3').setArray(new Float32Array(parsed.positions)).setBuffer(buffer);
  const normAcc = doc.createAccessor().setType('VEC3').setArray(new Float32Array(parsed.normals)).setBuffer(buffer);
  const uvAcc = doc.createAccessor().setType('VEC2').setArray(new Float32Array(parsed.uvs)).setBuffer(buffer);
  const idxArr = parsed.positions.length / 3 - 1 > 65535 ? new Uint32Array(parsed.indices) : new Uint16Array(parsed.indices);
  const idxAcc = doc.createAccessor().setType('SCALAR').setArray(idxArr).setBuffer(buffer);

  const material = doc.createMaterial(name || 'palette').setRoughnessFactor(0.85).setMetallicFactor(0.0);

  if (parsed.mtllib) {
    const mtlPath = path.join(path.dirname(objPath), parsed.mtllib);
    if (fs.existsSync(mtlPath)) {
      const { mapKd } = parseMtl(mtlPath);
      if (mapKd && fs.existsSync(mapKd)) {
        const imgBuf = fs.readFileSync(mapKd);
        const tex = doc.createTexture(path.basename(mapKd)).setImage(imgBuf).setMimeType('image/png');
        material.setBaseColorTexture(tex);
        const info = material.getBaseColorTextureInfo();
        if (info) {
          info.setMagFilter(9728); // NEAREST — keep voxel palette crisp
          info.setMinFilter(9728); // NEAREST
          info.setWrapS(33071);    // CLAMP_TO_EDGE — no bleed across the palette strip
          info.setWrapT(33071);
        }
      }
    }
  }

  const prim = doc.createPrimitive()
    .setAttribute('POSITION', posAcc)
    .setAttribute('NORMAL', normAcc)
    .setAttribute('TEXCOORD_0', uvAcc)
    .setIndices(idxAcc)
    .setMaterial(material);

  const mesh = doc.createMesh(name || 'ship');
  mesh.addPrimitive(prim);

  const node = doc.createNode(name || 'ship').setMesh(mesh);
  const scene = doc.createScene('scene');
  scene.addChild(node);
  doc.getRoot().setDefaultScene(scene);

  const io = new NodeIO();
  const glb = await io.writeBinary(doc);
  fs.mkdirSync(path.dirname(glbPath), { recursive: true });
  fs.writeFileSync(glbPath, Buffer.from(glb));

  const tris = parsed.indices.length / 3;
  const kb = Math.round(fs.statSync(glbPath).size / 1024 * 10) / 10;
  return { tris, kb, size: dims.size };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const [objPath, glbPath] = args._;
  if (!objPath || !glbPath) {
    console.error('Usage: node tools/city/obj-to-glb.mjs <in.obj> <out.glb> [--name Foo]');
    process.exit(1);
  }
  const result = await convert(objPath, glbPath, args.name);
  console.log(JSON.stringify({ obj: objPath, glb: glbPath, ...result, compressed: false, compressNote: 'no @gltf-transform/cli or meshopt CLI binary present in tools/ual/node_modules (only core/extensions/meshoptimizer libs, no .bin) — left uncompressed' }, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
