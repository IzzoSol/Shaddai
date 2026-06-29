/* world-buildings.js — load the REAL textured building models (HF->Meshy) per sector, scaled LARGE.
 *   window.buildWorldBuildings(THREE, scene, layout, heightAt, loader) -> { update(t), markers }
 * Falls back to a simple procedural tower if a building GLB is missing.
 */
window.buildWorldBuildings = function (THREE, scene, layout, heightAt, loader) {
  const gy = (x, z) => (heightAt ? heightAt(x, z) : 0);
  const spinners = [];
  const markers = [];
  const sec = (c) => (layout.sector && layout.sector(c)) || { pos: [0, 0], color: 0x27e0ff };

  function fallback(x, z, color) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(20, 34, 20),
      new THREE.MeshStandardMaterial({ color: 0x141a24, emissive: color || 0x27e0ff, emissiveIntensity: 0.3, metalness: 0.7, roughness: 0.4 }));
    m.position.set(x, gy(x, z) + 17, z); m.castShadow = true; scene.add(m);
  }
  function placeGLB(file, footprint, x, z, color) {
    if (!loader) { fallback(x, z, color); return; }
    loader.load('/assets/buildings/' + file + '.glb?v=2', (g) => {  // v2 = intricate inscribed regen
      try {
        const m = g.scene;
        const b = new THREE.Box3().setFromObject(m); const s = new THREE.Vector3(); b.getSize(s);
        const sc = footprint / Math.max(s.x, s.z || 1); m.scale.setScalar(sc);
        const b2 = new THREE.Box3().setFromObject(m); m.position.set(x, gy(x, z) - b2.min.y, z);
        m.traverse(c => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } });
        scene.add(m);
      } catch (e) { fallback(x, z, color); }
    }, undefined, () => fallback(x, z, color));
  }

  // building GLB + LARGE footprint per sector (real cathedral/fantasy-scale structures)
  const S = {
    SHADDAI: sec('SHADDAI'), NEXUS: sec('NEXUS'), ZEROX: sec('ZEROX'),
    QUILL: sec('QUILL'), ORACLE: sec('ORACLE'), PIKADON: sec('PIKADON'), TURTLE: sec('TURTLE'),
  };
  placeGLB('source-spire', 60, S.SHADDAI.pos[0], S.SHADDAI.pos[1], 0xffcf4a);  // SHADDAI — its own spire
  placeGLB('nexus-hub',    50, S.NEXUS.pos[0],   S.NEXUS.pos[1],   0x34e5b0);
  placeGLB('library',      70, S.QUILL.pos[0],   S.QUILL.pos[1],   0xb98cff);  // THE LIBRARY (Quill entrance + Oracle esoteric)
  placeGLB('aegis',        56, S.PIKADON.pos[0], S.PIKADON.pos[1], 0xff5a6e);  // PIKADON facility
  placeGLB('museum',       54, S.TURTLE.pos[0],  S.TURTLE.pos[1],  0x1fd6c4);
  placeGLB('markets-exchange', 56, S.ZEROX.pos[0], S.ZEROX.pos[1], 0xff7a18);  // ZEROX trading center
  placeGLB('oracle-spire', 52, S.ORACLE.pos[0], S.ORACLE.pos[1], 0xc084fc);    // ORACLE esoteric observatory (its own hexagon point)
  placeGLB('bazaar',       46, 0, 60, 0x00e5a0);                                // Bazaar near spawn
  for (const c of Object.keys(S)) markers.push({ code: c, x: S[c].pos[0], z: S[c].pos[1] });

  return { markers, update(t) { for (const s of spinners) s.o.rotation.y = t * s.ry; } };
};
