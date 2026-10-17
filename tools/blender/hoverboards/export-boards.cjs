'use strict';
// tools/blender/hoverboards/export-boards.cjs — dump the 9 code-built boards (public/world-hoverboards.js) as plain
// mesh JSON (metres, Blender Z-up) for the headless preview sheet (preview-sheet.py). Run: node <this> <out.json>
const path = require('path'), fs = require('fs');
const T = require(path.join(__dirname, '..', '..', 'ual', 'node_modules', 'three', 'build', 'three.cjs'));
global.window = {};
require(path.join(__dirname, '..', '..', '..', 'public', 'world-hoverboards.js'));
const KIT = window.HoverboardKit, out = { boards: [] };
const place = (id, x, y, yaw, label) => {
  const g = KIT.build(T, id); g.userData.setThrust(0.7, 0);
  g.position.set(x, 0.45, y); g.rotation.y = yaw; g.updateMatrixWorld(true);
  const meshes = [];
  g.traverse(o => {
    if (!o.isMesh) return;
    const geo = o.geometry.index ? o.geometry : o.geometry, P = geo.attributes.position, m = o.material;
    const v = [], p = new T.Vector3();
    for (let i = 0; i < P.count; i++) { p.fromBufferAttribute(P, i).applyMatrix4(o.matrixWorld); v.push(+p.x.toFixed(4), +(-p.z).toFixed(4), +p.y.toFixed(4)); }   // three (x,y,z) → blender (x,-z,y)
    const idx = geo.index ? Array.from(geo.index.array) : Array.from({ length: P.count }, (_, i) => i);
    meshes.push({ v, f: idx, color: m.color.getHex(), emissive: m.emissive ? m.emissive.getHex() : (m.blending === T.AdditiveBlending ? m.color.getHex() : 0),
      strength: m.emissive ? m.emissiveIntensity : (m.blending === T.AdditiveBlending ? 3 * m.opacity : 0), metal: m.metalness || 0, rough: m.roughness == null ? 0.5 : m.roughness,
      additive: m.blending === T.AdditiveBlending });
  });
  out.boards.push({ id, label: label || g.userData.name, x, y: -y, meshes });
  return g;
};
// 3×3 sheet (metres): rows of three, 2.4 m apart; the tenth board (sunburst) carries ZEROX in front
KIT.ids.forEach((id, i) => place(id, (i % 3 - 1) * 2.4, -(Math.floor(i / 3)) * 2.6, 0.5));
place('sunburst', 5.2, -2.6, 0.2, 'rider');
out.rider = { x: 5.2, y: 2.6, z: 0.45 + 0.12, yaw: 0.2 };
fs.writeFileSync(process.argv[2] || 'boards.json', JSON.stringify(out));
console.log('wrote', out.boards.length, 'boards');
