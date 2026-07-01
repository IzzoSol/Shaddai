/* world-buildings.js — load the REAL textured building models (HF->Meshy) per sector, scaled LARGE.
 *   window.buildWorldBuildings(THREE, scene, layout, heightAt, loader) -> { update(t), markers }
 * Falls back to a simple procedural tower if a building GLB is missing.
 * Procedural landmark layer (no network): glowing ground ring + floating canvas-sprite name label per building.
 */
window.buildWorldBuildings = function (THREE, scene, layout, heightAt, loader) {
  const gy = (x, z) => (heightAt ? heightAt(x, z) : 0);
  const spinners = [];
  const markers = [];
  const landmarks = [];        // { ring, mat, baseOpacity, phase } — pulsing ground rings
  const labelSprites = [];     // floating name sprites (always face camera)
  const sec = (c) => (layout.sector && layout.sector(c)) || { pos: [0, 0], color: 0x27e0ff };

  // ---- procedural landmark helpers (cheap, no per-frame allocation, no network) ----
  function hexColor(color) {
    const c = (typeof color === 'number') ? color : 0x27e0ff;
    return '#' + ('000000' + (c >>> 0).toString(16)).slice(-6);
  }

  // glowing ground ring tinted with the sector color, sits flat on the terrain at the base
  function groundMarker(x, z, color, radius) {
    const r = radius || 30;
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(r * 0.78, r, 48),
      new THREE.MeshBasicMaterial({
        color: color, transparent: true, opacity: 0.45,
        side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false,
      })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, gy(x, z) + 0.4, z);
    ring.renderOrder = 2;
    scene.add(ring);
    landmarks.push({ mat: ring.material, baseOpacity: 0.45, phase: Math.random() * Math.PI * 2 });
    return ring;
  }

  // floating name label as a canvas-texture sprite (auto-faces camera)
  function nameLabel(x, z, color, text, y) {
    const W = 512, H = 128;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d');
    ctx.clearRect(0, 0, W, H);
    const col = hexColor(color);
    ctx.font = 'bold 64px Georgia, "Times New Roman", serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // dark backing pill for readability
    const tw = Math.min(W - 20, ctx.measureText(text).width + 60);
    ctx.fillStyle = 'rgba(8,10,16,0.62)';
    if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect((W - tw) / 2, 24, tw, H - 48, 22); ctx.fill(); }
    else { ctx.fillRect((W - tw) / 2, 24, tw, H - 48); }
    // glow + fill in sector color
    ctx.shadowColor = col; ctx.shadowBlur = 18;
    ctx.fillStyle = col;
    ctx.fillText(text, W / 2, H / 2 + 2);
    ctx.shadowBlur = 0;
    ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.strokeText(text, W / 2, H / 2 + 2);

    const tex = new THREE.CanvasTexture(cv);
    tex.anisotropy = 4; tex.needsUpdate = true;
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false }));
    spr.scale.set(44, 11, 1);
    // `y` is the ABSOLUTE world height (top of the actual building), not an offset.
    spr.position.set(x, (typeof y === 'number' ? y : gy(x, z) + 70), z);
    spr.renderOrder = 5;
    scene.add(spr);
    labelSprites.push({ spr, baseY: spr.position.y, phase: Math.random() * Math.PI * 2 });
    return spr;
  }

  // ring on the ground + name label sitting on top of the ACTUAL building.
  // topY = absolute world height of the building's roof (so the label never floats).
  function decorate(x, z, color, displayName, footprint, topY) {
    groundMarker(x, z, color, (footprint || 50) * 0.62);
    if (displayName) nameLabel(x, z, color, displayName, topY + 6);
  }

  function fallback(x, z, color, displayName, footprint) {
    const H = 34;
    const m = new THREE.Mesh(new THREE.BoxGeometry(20, H, 20),
      new THREE.MeshStandardMaterial({ color: 0x141a24, emissive: color || 0x27e0ff, emissiveIntensity: 0.3, metalness: 0.7, roughness: 0.4 }));
    m.position.set(x, gy(x, z) + H / 2, z); m.castShadow = true; scene.add(m);
    decorate(x, z, color, displayName, footprint, gy(x, z) + H);
  }
  function placeGLB(file, footprint, x, z, color, displayName) {
    if (!loader) { fallback(x, z, color, displayName, footprint); return; }
    loader.load('/assets/buildings/' + file + '.glb?v=2', (g) => {  // v2 = intricate inscribed regen
      try {
        const m = g.scene;
        const b = new THREE.Box3().setFromObject(m); const s = new THREE.Vector3(); b.getSize(s);
        const sc = footprint / Math.max(s.x, s.z || 1); m.scale.setScalar(sc);
        const b2 = new THREE.Box3().setFromObject(m); m.position.set(x, gy(x, z) - b2.min.y, z);
        m.traverse(c => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } });
        scene.add(m);
        // label + ring placed on the REAL building top, only after it actually loads
        decorate(x, z, color, displayName, footprint, gy(x, z) + (b2.max.y - b2.min.y));
      } catch (e) { fallback(x, z, color, displayName, footprint); }
    }, undefined, () => fallback(x, z, color, displayName, footprint));
  }

  // building GLB + LARGE footprint per sector (real cathedral/fantasy-scale structures)
  const S = {
    SHADDAI: sec('SHADDAI'), NEXUS: sec('NEXUS'), ZEROX: sec('ZEROX'),
    QUILL: sec('QUILL'), ORACLE: sec('ORACLE'), PIKADON: sec('PIKADON'), TURTLE: sec('TURTLE'),
  };
  placeGLB('source-spire', 60, S.SHADDAI.pos[0], S.SHADDAI.pos[1], 0xffcf4a, 'SHADDAI TEMPLE');  // SHADDAI — its own spire
  placeGLB('nexus-hub',    50, S.NEXUS.pos[0],   S.NEXUS.pos[1],   0x34e5b0, 'NEXUS HUB');
  placeGLB('library',      70, S.QUILL.pos[0],   S.QUILL.pos[1],   0xb98cff, 'LIBRARY');  // THE LIBRARY (Quill entrance + Oracle esoteric)
  placeGLB('aegis',        56, S.PIKADON.pos[0], S.PIKADON.pos[1], 0xff5a6e, 'THE AEGIS');  // PIKADON facility
  placeGLB('museum',       54, S.TURTLE.pos[0],  S.TURTLE.pos[1],  0x1fd6c4, 'THE MUSEUM');
  placeGLB('markets-exchange', 56, S.ZEROX.pos[0], S.ZEROX.pos[1], 0xff7a18, 'ZEROX MARKETS');  // ZEROX trading center
  placeGLB('oracle-spire', 52, S.ORACLE.pos[0], S.ORACLE.pos[1], 0xc084fc, 'ORACLE');    // ORACLE esoteric observatory (its own hexagon point)
  placeGLB('bazaar',       46, 0, 60, 0x00e5a0, 'BAZAAR');                                // Bazaar near spawn
  for (const c of Object.keys(S)) markers.push({ code: c, x: S[c].pos[0], z: S[c].pos[1] });

  return {
    markers,
    update(t) {
      for (const s of spinners) s.o.rotation.y = t * s.ry;
      // gentle pulse of the landmark ground rings
      for (const lm of landmarks) {
        lm.mat.opacity = lm.baseOpacity * (0.72 + 0.28 * Math.sin(t * 1.6 + lm.phase));
      }
      // soft bob of the floating name labels (sprites auto-face the camera)
      for (const l of labelSprites) {
        l.spr.position.y = l.baseY + Math.sin(t * 1.1 + l.phase) * 1.6;
      }
    }
  };
};
