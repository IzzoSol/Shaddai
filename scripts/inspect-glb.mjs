import { NodeIO } from '@gltf-transform/core';
import { KHRONOS_EXTENSIONS } from '@gltf-transform/extensions';

const io = new NodeIO().registerExtensions(KHRONOS_EXTENSIONS);

for (const path of process.argv.slice(2)) {
  try {
    const doc = await io.read(path);
    const root = doc.getRoot();
    const anims = root.listAnimations().map(a => a.getName() || '(unnamed)');
    const skins = root.listSkins();
    const meshes = root.listMeshes();
    let boneCount = 0, sampleBones = [];
    if (skins.length) {
      const joints = skins[0].listJoints();
      boneCount = joints.length;
      sampleBones = joints.slice(0, 12).map(j => j.getName());
    }
    console.log('\n=== ' + path.split(/[\\/]/).pop() + ' ===');
    console.log('  meshes:', meshes.length, '| skins:', skins.length, '| bones:', boneCount);
    console.log('  animations (' + anims.length + '):', anims.join(', ') || '(none)');
    if (sampleBones.length) console.log('  sample bones:', sampleBones.join(', '));
  } catch (e) {
    console.log('\n=== ' + path + ' ===\n  ERROR:', e.message);
  }
}
