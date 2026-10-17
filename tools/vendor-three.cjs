/* tools/vendor-three.cjs — self-host three.js addons (r180) under public/vendor/three/addons so the world loads from our own origin (no unpkg hop, works offline, no CDN outage).
 *   node tools/vendor-three.cjs            fetch the entry addons + every relative import they need from unpkg three@0.180.0, write them to public/vendor/three/addons/
 * three.module.js / three.core.js are already vendored (REVISION 180). The importmap in SHADDAI-WORLD-3D.html points here. Idempotent. */
const fs = require('fs'), path = require('path');
const VER = '0.180.0', BASE = 'https://unpkg.com/three@' + VER + '/examples/jsm/', OUT = path.join(__dirname, '..', 'public', 'vendor', 'three', 'addons');
const ENTRY = ['controls/PointerLockControls.js', 'environments/RoomEnvironment.js', 'libs/meshopt_decoder.module.js', 'loaders/DRACOLoader.js', 'loaders/GLTFLoader.js', 'postprocessing/EffectComposer.js', 'postprocessing/RenderPass.js', 'postprocessing/UnrealBloomPass.js', 'utils/BufferGeometryUtils.js', 'utils/SkeletonUtils.js', 'controls/OrbitControls.js', 'controls/TransformControls.js'];
const seen = new Set();
async function get(rel) {
  if (seen.has(rel)) return; seen.add(rel);
  const r = await fetch(BASE + rel); if (!r.ok) throw new Error(rel + ' HTTP ' + r.status); const txt = await r.text();
  const f = path.join(OUT, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, txt);
  const deps = [...txt.matchAll(/(?:from|import)\s*['"](\.{1,2}\/[^'"]+)['"]/g)].map(m => path.posix.normalize(path.posix.join(path.posix.dirname(rel), m[1])));
  for (const d of deps) await get(d);
}
(async () => { for (const e of ENTRY) await get(e); console.log('vendored ' + seen.size + ' files:'); [...seen].sort().forEach(f => console.log('  ' + f)); })().catch(e => { console.error('FAIL', e.message); process.exit(1); });
