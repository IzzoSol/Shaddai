// node tools/ual/park-export.mjs <out.obj> — dump the code-built hoverskate park v2 (metres, park-local) as OBJ for the Blender dressing pass
import * as THREE from 'three';
import { OBJExporter } from 'three/examples/jsm/exporters/OBJExporter.js';
import fs from 'node:fs'; import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
globalThis.window = globalThis; globalThis.location = { search: '' };
require('../../public/world-hoverpark-v2.js');
const scene = new THREE.Scene();
const P = window.WorldHoverPark.build({ THREE, scene, U: 1, anchor: { x: 0, z: 0 }, heightAt: () => 0 });
const g = P.group || scene; g.updateMatrixWorld(true);
fs.writeFileSync(process.argv[2], new OBJExporter().parse(g));
console.log('deckY', P.deckY, 'keys', Object.keys(P).join(','));
for (const [x, z] of [[0, 166], [0, 150], [33, 33], [0, 60], [60, 0], [0, 118], [-112, 0], [100, 100]]) console.log('h', x, z, P.heightAt ? (+P.heightAt(x, z)).toFixed(2) : '-');
let n = 0; g.traverse((o) => { if (o.isMesh) n++; }); console.log('meshes', n, 'rooms', (P.rooms || []).length);
