// node tools/tests/model-bounds.test.cjs — LOAD-TIME NORMALIZATION CONTRACT (handoff Cluster A): every character/bot/mount GLB must have a sane world-space height
// (the loader rescales to the target height, but a model that arrives 40 units tall or 1 mm tall means the pipeline/rig is broken). Fails the build, not the playtest.
const assert = require('assert'), fs = require('fs'), path = require('path');
(async () => {
  const { NodeIO } = require('@gltf-transform/core'), { ALL_EXTENSIONS } = require('@gltf-transform/extensions'), { getBounds } = require('@gltf-transform/functions'), { MeshoptDecoder } = require('meshoptimizer');
  await MeshoptDecoder.ready; const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
  // [dir, file regex, min height, max height] in model units (Meshy/Blender GLBs are metres or normalized; wide band catches cm-vs-m (x100) and mm slips)
  const SETS = [['public/assets/bots', /\.glb$/, 0.3, 12], ['public/assets/mounts', /\.glb$/, 0.3, 12], ['public/assets/agents', /\.glb$/, 0.3, 12]];
  let pass = 0, fail = 0;
  for (const [dir, re, lo, hi] of SETS) for (const f of fs.readdirSync(dir).filter(x => re.test(x))) {
    try {
      const d = await io.read(path.join(dir, f)), sc = d.getRoot().getDefaultScene() || d.getRoot().listScenes()[0], skins = d.getRoot().listSkins();
      let h;   // skinned: use the SKELETON's world extent (mesh nodes sit under a 0.01 armature, so getBounds would read ~0.02); static: world bounds
      if (skins.length) { let mn = 1e9, mx = -1e9; skins[0].listJoints().forEach(j => { const y = j.getWorldTranslation()[1]; mn = Math.min(mn, y); mx = Math.max(mx, y); }); h = mx - mn; } else { const b = getBounds(sc); h = b.max[1] - b.min[1]; }
      assert(h >= lo && h <= hi, f + ' height ' + h.toFixed(3) + ' outside [' + lo + ', ' + hi + ']'); console.log('  ok  ' + dir.split('/').pop() + '/' + f + ' height ' + h.toFixed(2)); pass++;
    } catch (e) { console.log('  FAIL ' + e.message); fail++; }
  }
  console.log(pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
})();
