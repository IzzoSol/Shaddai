import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const d = await io.read(process.argv[2]); const r = d.getRoot();
console.log('anims', r.listAnimations().map((a) => a.getName() + ':' + a.listChannels().length + 'ch:' + (Math.max(...a.listSamplers().map((s) => { const t = s.getInput().getArray(); return t[t.length - 1]; }))).toFixed(1) + 's').join(' '));
console.log('skins', r.listSkins().map((s) => s.listJoints().length + ' joints').join(' '), '| meshes', r.listMeshes().length, '| materials', r.listMaterials().map((m) => m.getName() + (m.getBaseColorTexture() ? '[tex]' : '')).join(' '), '| textures', r.listTextures().length);
