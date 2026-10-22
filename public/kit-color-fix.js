// kit-color-fix.js — runtime correction for the Blender kit GLBs' vertex colours (2026-10-22, owner-approved approach).
//
// The shared kit builder (Shaddai/public/assets/kits/_src/k1_tower.py, MB.finish) wrote LINEAR colours into a BYTE colour layer,
// which Blender stores as sRGB, so every value was linearized twice and the exported COLOR_0 (float VEC3) is ~13x too dark
// (measured: wall albedo 0.051 intended, 0.004 shipped). Re-encoding each value linear->sRGB restores exactly the intended
// linear colour. Applied once per geometry, only to GLBs loaded from /assets/kits/ (not _src), and skipped for kits already
// fixed at the source (K28+ mark a node with the custom property vc_linear_ok -> three userData). ?kitcolorfix=0 = off.
const enc = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);

export function fixKitColors(root) {
  let fixed = 0, skip = false;
  root.traverse((o) => { if (o.userData && o.userData.vc_linear_ok) skip = true; });
  if (skip) return 0;
  root.traverse((o) => {
    const g = o.isMesh && o.geometry, a = g && g.attributes.color;
    if (!a || g.userData.__kitColorFixed) return;
    for (let i = 0; i < a.count; i++) { a.setXYZ(i, enc(a.getX(i)), enc(a.getY(i)), enc(a.getZ(i))); }
    a.needsUpdate = true; g.userData.__kitColorFixed = true; fixed++;
  });
  return fixed;
}

export function installKitColorFix(GLTFLoader) {
  if (typeof location !== 'undefined' && /[?&]kitcolorfix=0/.test(location.search)) return false;
  if (GLTFLoader.prototype.__kitColorFix) return true;
  const load0 = GLTFLoader.prototype.load;
  GLTFLoader.prototype.load = function (url, onLoad, onProgress, onError) {
    const isKit = typeof url === 'string' && /\/assets\/kits\//.test(url) && !/\/_src\//.test(url);
    return load0.call(this, url, isKit ? (g) => { try { fixKitColors(g.scene); } catch (e) { console.warn('[kit-color-fix]', e && e.message); } onLoad && onLoad(g); } : onLoad, onProgress, onError);
  };
  GLTFLoader.prototype.__kitColorFix = true;
  return true;
}
