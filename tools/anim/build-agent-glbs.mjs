// node tools/anim/build-agent-glbs.mjs   (run from the repo root)
// Meshy v6 rigged agents (fal-assets/characters/<n>/<n>-rigged.glb, 24 bones) -> public/assets/agents/<CODE>.glb
//   * weld + meshopt + quantize, 1024px webp textures (~0.5-1.5 MB each)
//   * the library's Idle / Walking / Running are retargeted to THIS rig and baked in as clips 'idle' / 'walk' / 'run',
//     so EVERY viewer (host, dossier, model-viewer pages, character select) plays an idle the moment the model appears
//     and nothing ever shows the T-pose. The host still uses the full library (world-anim.js) for the other 70 clips.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { weld, quantize, meshopt, textureCompress, prune, dedup } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';
import fs from 'fs';
import vm from 'vm';
import path from 'path';
import { pathToFileURL } from 'url';
const NM = path.resolve('tools/ual/node_modules');
const T = await import(pathToFileURL(NM + '/three/build/three.module.js').href);
const { GLTFLoader } = await import(pathToFileURL(NM + '/three/examples/jsm/loaders/GLTFLoader.js').href);
const sandbox = { window: {} }; vm.createContext(sandbox);
vm.runInContext(fs.readFileSync('public/world-anim.js', 'utf8'), sandbox);
const META = JSON.parse(fs.readFileSync('public/assets/anim/agent-clips.json', 'utf8'));
const ab = (b) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
const parse = (buf) => new Promise((res, rej) => new GLTFLoader().parse(ab(buf), '', res, rej));
await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
const lib = await parse(fs.readFileSync('public/assets/anim/agent-clips.glb'));
const TEX = +process.env.TEX || 1024;
const BAKE = [['idle', META.locomotion.idle], ['walk', META.locomotion.walk], ['run', META.locomotion.run]];
for (const n of ['zerox', 'turtle', 'pikadon', 'quill', 'oracle', 'nexus', 'shaddai']) {
  const src = `fal-assets/characters/${n}/${n}-rigged.glb`;
  // 1. retarget on a texture-free copy (three in node can't decode the PNG)
  const tmp = await io.read(src);
  tmp.getRoot().listTextures().forEach((t) => t.dispose()); tmp.getRoot().listMaterials().forEach((m) => m.dispose());
  const gltf = await parse(Buffer.from(await io.writeBinary(tmp)));
  const anim = sandbox.window.buildAgentAnimator({ THREE: T, model: gltf.scene, clips: lib.animations, meta: META });
  const baked = BAKE.map(([as, lname]) => [as, anim.clip(lname)]);
  // 2. the real document
  const doc = await io.read(src), root = doc.getRoot(), buf = root.listBuffers()[0];
  root.listAnimations().forEach((a) => a.dispose());
  const byName = new Map(root.listNodes().map((x) => [x.getName(), x]));
  for (const [as, clip] of baked) {
    const out = doc.createAnimation(as); let c = 0;
    for (const tr of clip.tracks) {
      const dot = tr.name.lastIndexOf('.'), node = byName.get(tr.name.slice(0, dot)), prop = tr.name.slice(dot + 1);
      if (!node || (prop !== 'quaternion' && prop !== 'position')) continue;
      const inp = doc.createAccessor().setArray(new Float32Array(tr.times)).setType('SCALAR').setBuffer(buf);
      const outp = doc.createAccessor().setArray(new Float32Array(tr.values)).setType(prop === 'quaternion' ? 'VEC4' : 'VEC3').setBuffer(buf);
      const smp = doc.createAnimationSampler().setInput(inp).setOutput(outp).setInterpolation('LINEAR');
      out.addSampler(smp).addChannel(doc.createAnimationChannel().setTargetNode(node).setTargetPath(prop === 'quaternion' ? 'rotation' : 'translation').setSampler(smp)); c++;
    }
    console.log(`  ${n}.${as}: ${c} channels, ${clip.duration.toFixed(2)}s (${lname(as)})`);
  }
  await doc.transform(weld(), prune(), dedup(),
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [TEX, TEX], quality: 84 }),
    quantize({ quantizePosition: 14, quantizeNormal: 10, quantizeTexcoord: 12, quantizeWeight: 8 }),
    meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  const outF = `public/assets/agents/${n.toUpperCase()}.glb`;
  await io.write(outF, doc);
  console.log(n, 'retargeted=' + anim.retargeted, (fs.statSync(outF).size / 1024).toFixed(0) + ' KB');
}
function lname(as) { return BAKE.find((b) => b[0] === as)[1]; }
