// node tools/slim-tex.mjs file.glb [px=1024]  -> in-place webp texture shrink (keeps skin/animation)
import sharp from 'sharp'; import { NodeIO } from '@gltf-transform/core'; import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { textureCompress } from '@gltf-transform/functions'; import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
await MeshoptDecoder.ready; await MeshoptEncoder.ready;
const [f, px = '1024'] = process.argv.slice(2);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const doc = await io.read(f); await doc.transform(textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [+px, +px], quality: 82 })); await io.write(f, doc); console.log('slimmed', f);
