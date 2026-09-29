// node tools/slim-static.mjs in.glb out.glb [ratio=0.25]  -> weld + simplify + meshopt (static props like the casino dealer bot)
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import sharp from 'sharp';
import { weld, simplify, prune, meshopt, textureCompress } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
const [inp, out, ratio = '0.25'] = process.argv.slice(2);
await MeshoptDecoder.ready; await MeshoptEncoder.ready; await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const doc = await io.read(inp);
await doc.transform(weld(), simplify({ simplifier: MeshoptSimplifier, ratio: +ratio, error: 0.01 }), prune(), textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [1024, 1024], quality: 82 }), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
await io.write(out, doc);
console.log('wrote', out);
