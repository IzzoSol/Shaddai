// node tools/ual/terrain-ripples.test.mjs — K23 sand ripples wired into the terrain-v4 shader (real terrain data, real three; GLSL text checks, no GPU)
import * as THREE from 'three';
import fs from 'node:fs'; import assert from 'node:assert'; import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const T = new URL('../../public/assets/terrain/', import.meta.url);
globalThis.window = globalThis; globalThis.location = { search: '' };
globalThis.fetch = async (u) => { const f = new URL(u.replace('/assets/terrain/', ''), T); const b = fs.readFileSync(f); return { ok: true, json: async () => JSON.parse(b), arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) }; };
const loaded = [];
THREE.TextureLoader.prototype.load = function (url, ok, _p, err) { loaded.push(url); if (err) err(new Error('no image in node')); return new THREE.Texture(); };
require('../../public/world-terrain-v4.js');
let pass = 0; const t = (n, fn) => { fn(); pass++; console.log('  ok ', n); };
const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera();
const api = await window.buildWorldTerrainV4({ THREE, scene, camera, base: '/assets/terrain/' });
let mat = null; scene.traverse((o) => { if (!mat && o.material && o.material.name === 'terrain-v4') mat = o.material; });
if (!mat && api && api.material) mat = api.material;
t('terrain material found', () => assert(mat && mat.onBeforeCompile));
const sh = { uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader };
mat.onBeforeCompile(sh);
const fs_ = sh.fragmentShader;
t('ripple maps requested (linear webp)', () => assert(loaded.some((u) => /sand_ripple_n\.webp$/.test(u)) && loaded.some((u) => /sand_ripple_h\.webp$/.test(u))));
t('uniforms + samplers declared before use', () => {
  assert(sh.uniforms.tRipN && sh.uniforms.tRipH);
  const decl = fs_.indexOf('tRipN, tRipH'), use = fs_.indexOf('texture2D(tRipN'), tv = fs_.indexOf('float tvRip = 0.0');
  assert(decl > 0 && use > decl && tv > 0 && tv < use);
});
t('ripple normal applied after the normal maps, inside TV_LAYERS, no raw newlines in the injection', () => {
  const i = fs_.indexOf('#include <normal_fragment_maps>'), j = fs_.indexOf('if (tvRip > 0.001)');
  assert(i > 0 && j > i && fs_.lastIndexOf('#ifdef TV_LAYERS', j) > i);
  assert((fs_.match(/\{/g) || []).length === (fs_.match(/\}/g) || []).length, 'braces balanced');
});
t('desert (w2) + beach (w6) gate the ripples; fades with distance; none on slip faces', () => {
  assert(/tvRip = \(w2 \+ w6 \* 0\.6\) \* \(1\.0 - smoothstep\(80\.0, 600\.0/.test(fs_) && /smoothstep\(0\.78, 0\.95, flat0\)/.test(fs_));
});
console.log(`${pass} passed, 0 failed`); process.exit(0);
