/* world-buildings.js — Procedural buildings for SHADDAI World.
 *   window.buildWorldBuildings(THREE, scene, layout, heightAt, loader) → { update(t), markers }
 *
 * TURTLE pass v6 (2026-07-02) — FLOATING FIX + VISUAL OVERHAUL
 *
 * ROOT CAUSE OF ZEROX FLOAT:
 *   Every builder was using `fp * 0.46` as the entrance face radius — sized for SHADDAI's
 *   first octagonal tier. Box buildings (ZEROX, LIBRARY, MUSEUM, AEGIS) have face radii
 *   of fp*0.25–0.38. The door recess, columns, arch, and ground plaque were all placed
 *   8–12 units in front of the actual building wall, hanging in empty air. ZEROX (square
 *   box face at fp*0.35 vs fp*0.46 → 10-unit gap) was worst because it's side-on to the
 *   player and the gap was maximally visible.
 *
 * FIX:
 *   Each _build* now returns { topY, faceR } where faceR is the ACTUAL facade radius.
 *   decorate(), addEntrance(), _doorRecess(), and addGroundPlaque() all accept faceR.
 *
 * VISUAL OVERHAUL:
 *   • buildPalette() adds `body` (very dark graphite + 18% primary tint) — replaces
 *     raw `pal.primary` or muddy structural blends as the main building material.
 *   • Belt courses: thin emissive bands every ~8-10 units up each tower.
 *   • Greeble panels: InstancedMesh of shallow recessed quads on major facades.
 *   • Each building has a distinct silhouette + meaningful crown detail.
 *   • Emissive values constrained (body ≤0.05, crown ≤0.22) — no neon soup.
 *
 * PERFORMANCE:
 *   InstancedMesh for ribs, windows, greeble panels, colonnade, fins.
 *   0 per-building PointLights. No per-frame allocations in update().
 *   ≤16 draw calls per building × 8 buildings.
 */
window.buildWorldBuildings = function (THREE, scene, layout, heightAt, loader) {
  const gy       = (x, z) => (heightAt ? heightAt(x, z) : 0);
  const spinners  = [];
  const markers   = [];
  const landmarks = [];
  const trimRings = [];

  // ── SHARED SCENE LIGHTS (one-time cost, all buildings) ───────────────────
  const _bldHemi = new THREE.HemisphereLight(0x2a3a5a, 0x050406, 0.22);
  scene.add(_bldHemi);
  const _bldDir  = new THREE.DirectionalLight(0xfff2cc, 0.32);
  _bldDir.position.set(120, 220, 90); _bldDir.castShadow = false;
  scene.add(_bldDir);

  const sec = (c) => (layout && layout.sector  && layout.sector(c))    || { pos: [0, 0], color: 0x27e0ff };
  const lmk = (id) => (layout && layout.landmark && layout.landmark(id)) || null;

  // ── COLOR HELPERS ─────────────────────────────────────────────────────────
  function hexColor(color) {
    const c = (typeof color === 'number') ? color : 0x27e0ff;
    return '#' + ('000000' + (c >>> 0).toString(16)).slice(-6);
  }

  // Palette: dark architectural base (body) + accent as trim/glow only.
  // body       — deep obsidian-graphite tinted 18% with primary; the main building mass.
  // primary    — full accent; used ONLY for emissive, never as diffuse body.
  // secondary  — hue-shifted complement; panels, ribs, accent plates.
  // structural — near-black; deep shadows, base plinths.
  // trim       — primary lightened; glowing seams, crown elements.
  function buildPalette(accentHex) {
    const primary    = new THREE.Color(accentHex || 0x27e0ff);
    const secondary  = primary.clone();
    { const h = {}; secondary.getHSL(h);
      secondary.setHSL((h.h + 0.10) % 1.0, Math.max(0.15, h.s * 0.68), Math.min(0.75, h.l * 1.15)); }
    const structural = new THREE.Color(0x030507).lerp(primary, 0.10);
    const body       = new THREE.Color(0x06090f).lerp(primary, 0.18);
    const trim       = primary.clone().lerp(new THREE.Color(0xffffff), 0.32);
    return { primary, secondary, structural, body, trim };
  }

  // ── SCENE MARKERS ─────────────────────────────────────────────────────────
  function groundMarker(x, z, color, radius) {
    const r    = radius || 30;
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(r * 0.78, r, 48),
      new THREE.MeshBasicMaterial({
        color, transparent: true, opacity: 0.26,
        side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false,
      })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, gy(x, z) + 0.4, z);
    ring.renderOrder = 2;
    scene.add(ring);
    landmarks.push({ mat: ring.material, baseOpacity: 0.26, phase: Math.random() * Math.PI * 2 });
  }

  function accentTrimRing(x, z, color, roofY, footprint) {
    const r    = (footprint || 40) * 0.42;
    const mesh = new THREE.Mesh(
      new THREE.TorusGeometry(r, r * 0.028, 8, 64),
      new THREE.MeshBasicMaterial({
        color, transparent: true, opacity: 0.40,
        blending: THREE.AdditiveBlending, depthWrite: false,
      })
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, roofY + 0.5, z);
    mesh.renderOrder = 4;
    scene.add(mesh);
    trimRings.push({ ring: mesh, baseOpacity: 0.40, phase: Math.random() * Math.PI * 2 });
  }

  // ── LOW-LEVEL GEOMETRY HELPERS ────────────────────────────────────────────
  function _cyl(x, z, baseY, rTop, rBot, h, mat, segs) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, h, segs || 16), mat);
    m.position.set(x, baseY + h * 0.5, z);
    m.castShadow = true; m.receiveShadow = true;
    scene.add(m);
    return baseY + h;
  }
  function _dome(x, z, baseY, r, mat, segs) {
    const m = new THREE.Mesh(
      new THREE.SphereGeometry(r, segs || 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), mat);
    m.position.set(x, baseY, z);
    m.castShadow = true; scene.add(m);
    return baseY + r;
  }
  function _band(x, z, y, r, tube, pal) {
    const m = new THREE.Mesh(
      new THREE.TorusGeometry(r, tube, 8, 64),
      new THREE.MeshBasicMaterial({
        color: pal.trim.clone().lerp(new THREE.Color(0xffffff), 0.18),
        transparent: true, opacity: 0.52,
        blending: THREE.AdditiveBlending, depthWrite: false,
      })
    );
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, y, z);
    m.renderOrder = 3; scene.add(m);
  }
  function _box(x, z, baseY, w, h, d, mat) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, baseY + h * 0.5, z);
    m.castShadow = true; m.receiveShadow = true;
    scene.add(m); return baseY + h;
  }
  function _fins(x, z, baseY, topY, r, count, finW, finD, pal) {
    const H   = topY - baseY;
    const mat = new THREE.MeshStandardMaterial({
      color: pal.secondary.clone().lerp(pal.structural, 0.30),
      emissive: pal.primary.clone(), emissiveIntensity: 0.06,
      roughness: 0.62, metalness: 0.14,
    });
    const im = new THREE.InstancedMesh(new THREE.BoxGeometry(finW, H, finD), mat, count);
    const d  = new THREE.Object3D();
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      d.position.set(x + Math.cos(a) * r, baseY + H * 0.5, z + Math.sin(a) * r);
      d.rotation.set(0, a, 0); d.updateMatrix();
      im.setMatrixAt(i, d.matrix);
    }
    im.instanceMatrix.needsUpdate = true;
    im.castShadow = true; scene.add(im);
  }
  function _battlements(x, z, y, r, count, mW, mH, mD, pal) {
    const mat = new THREE.MeshStandardMaterial({
      color: pal.structural.clone().lerp(pal.primary, 0.28),
      emissive: pal.primary.clone(), emissiveIntensity: 0.04,
      roughness: 0.84, metalness: 0.04,
    });
    const im = new THREE.InstancedMesh(new THREE.BoxGeometry(mW, mH, mD), mat, count);
    const d  = new THREE.Object3D();
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      d.position.set(x + Math.cos(a) * r, y + mH * 0.5, z + Math.sin(a) * r);
      d.rotation.set(0, a, 0); d.updateMatrix();
      im.setMatrixAt(i, d.matrix);
    }
    im.instanceMatrix.needsUpdate = true; scene.add(im);
  }

  // Belt courses: thin horizontal emissive bands every `step` units up a tower.
  // 1 InstancedMesh = 1 draw call regardless of belt count.
  function _beltCourses(x, z, baseY, topY, r, tube, step, pal) {
    const H     = topY - baseY;
    const count = Math.max(1, Math.floor(H / step));
    const mat   = new THREE.MeshBasicMaterial({
      color: pal.trim.clone().lerp(new THREE.Color(0xffffff), 0.10),
      transparent: true, opacity: 0.38,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const im = new THREE.InstancedMesh(new THREE.TorusGeometry(r, tube, 6, 48), mat, count);
    const d  = new THREE.Object3D();
    for (let i = 0; i < count; i++) {
      const y = baseY + step * (i + 1);
      d.position.set(x, y, z);
      d.rotation.set(-Math.PI / 2, 0, 0); d.updateMatrix();
      im.setMatrixAt(i, d.matrix);
    }
    im.instanceMatrix.needsUpdate = true;
    im.renderOrder = 3; scene.add(im);
  }

  // ── MULLION STRIPS — vertical panel-joint extrusions on facades ─────────────
  // Real-geometry grid of vertical dividers. 1 IM = 1 draw call.
  // Adds tangible shadow-casting depth to what would otherwise be a flat wall.
  function _mullionStrips(x, z, baseY, topY, faceR, sides, cols, pal) {
    if (cols < 1) return;
    const H     = Math.max(1, topY - baseY);
    const thick = Math.max(0.20, faceR * 0.013);
    const depth = 0.36;
    const count = sides * cols;
    const mat   = new THREE.MeshStandardMaterial({
      color:    pal.structural.clone().lerp(pal.secondary, 0.18),
      emissive: pal.trim.clone(), emissiveIntensity: 0.028,
      roughness: 0.72, metalness: 0.18,
    });
    const im = new THREE.InstancedMesh(new THREE.BoxGeometry(thick, H, depth), mat, count);
    im.castShadow = true;
    const d  = new THREE.Object3D();
    let idx  = 0;
    for (let s = 0; s < sides; s++) {
      const fa   = (s / sides) * Math.PI * 2 + Math.PI / sides;
      const cosF = Math.cos(fa), sinF = Math.sin(fa);
      const cosP = Math.cos(fa + Math.PI / 2), sinP = Math.sin(fa + Math.PI / 2);
      const faceW   = faceR * (Math.PI * 2 / sides) * 0.78;
      const spacing = faceW / Math.max(1, cols + 1);
      for (let c = 0; c < cols; c++) {
        const xOff = (c - (cols - 1) * 0.5) * spacing;
        d.position.set(
          x + cosF * (faceR + depth * 0.5) + cosP * xOff,
          baseY + H * 0.5,
          z + sinF * (faceR + depth * 0.5) + sinP * xOff
        );
        d.rotation.set(0, fa, 0); d.updateMatrix();
        im.setMatrixAt(idx++, d.matrix);
      }
    }
    im.instanceMatrix.needsUpdate = true; scene.add(im);
  }

  // ── EXHAUST STACKS — industrial rooftop chimneys / vent pipes ──────────────
  // count stacks placed deterministically on the roof. 2 IM (shaft + cap ring).
  function _exhaustStacks(x, z, roofY, fp, count, pal) {
    const h   = Math.max(3.5, fp * 0.090);
    const r   = Math.max(0.28, fp * 0.013);
    const mat = new THREE.MeshStandardMaterial({
      color:    pal.structural.clone().lerp(new THREE.Color(0x3a3a3a), 0.55),
      emissive: pal.primary.clone(), emissiveIntensity: 0.008,
      roughness: 0.88, metalness: 0.30,
    });
    const capMat = new THREE.MeshBasicMaterial({
      color: pal.trim, transparent: true, opacity: 0.55,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const im  = new THREE.InstancedMesh(new THREE.CylinderGeometry(r * 0.75, r, h, 8), mat, count);
    const cap = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(r * 1.28, r * 0.92, r * 0.48, 8), capMat, count);
    cap.renderOrder = 3; im.castShadow = true;
    const d    = new THREE.Object3D();
    const cols = Math.ceil(Math.sqrt(count));
    const sp   = fp * 0.11;
    for (let i = 0; i < count; i++) {
      const row = Math.floor(i / cols), col = i % cols;
      const ox  = (col - (cols - 1) * 0.5) * sp + (i % 3 - 1) * sp * 0.22;
      const oz  = (row - (Math.ceil(count / cols) - 1) * 0.5) * sp + (i % 2 - 0.5) * sp * 0.18;
      d.position.set(x + ox, roofY + h * 0.5, z + oz);
      d.rotation.set(0, (i * 1.13) % (Math.PI * 2), 0); d.updateMatrix();
      im.setMatrixAt(i, d.matrix);
      d.position.set(x + ox, roofY + h + r * 0.24, z + oz);
      d.rotation.set(0, 0, 0); d.updateMatrix();
      cap.setMatrixAt(i, d.matrix);
    }
    im.instanceMatrix.needsUpdate  = true; scene.add(im);
    cap.instanceMatrix.needsUpdate = true; scene.add(cap);
  }

  // ── VENT BOXES — HVAC / mechanical box units on rooftops ────────────────────
  // Box bodies + face-mounted grill glows. 2 IM.
  function _ventBoxes(x, z, roofY, fp, count, pal) {
    const bw = Math.max(2.0, fp * 0.055), bd = Math.max(1.4, fp * 0.036), bh = Math.max(1.2, fp * 0.028);
    const mat = new THREE.MeshStandardMaterial({
      color:    pal.body.clone().lerp(new THREE.Color(0x2e2e2e), 0.50),
      emissive: pal.secondary.clone(), emissiveIntensity: 0.015,
      roughness: 0.82, metalness: 0.22,
    });
    const grillMat = new THREE.MeshBasicMaterial({
      color: pal.trim, transparent: true, opacity: 0.32,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const im    = new THREE.InstancedMesh(new THREE.BoxGeometry(bw, bh, bd), mat, count);
    const grill = new THREE.InstancedMesh(new THREE.PlaneGeometry(bw * 0.78, bh * 0.65), grillMat, count);
    grill.renderOrder = 3; im.castShadow = true;
    const d    = new THREE.Object3D();
    const cols = Math.ceil(Math.sqrt(count));
    for (let i = 0; i < count; i++) {
      const row = Math.floor(i / cols), col = i % cols;
      const a   = (i / count) * Math.PI * 2;
      const ox  = Math.cos(a) * fp * 0.20 + (col - (cols - 1) * 0.5) * fp * 0.080;
      const oz  = Math.sin(a) * fp * 0.20 + (row - (Math.ceil(count / cols) - 1) * 0.5) * fp * 0.080;
      d.position.set(x + ox, roofY + bh * 0.5, z + oz);
      d.rotation.set(0, a, 0); d.updateMatrix();
      im.setMatrixAt(i, d.matrix);
      d.position.set(x + ox + Math.cos(a) * (bd * 0.51), roofY + bh * 0.5, z + oz + Math.sin(a) * (bd * 0.51));
      d.rotation.set(0, a, 0); d.updateMatrix();
      grill.setMatrixAt(i, d.matrix);
    }
    im.instanceMatrix.needsUpdate    = true; scene.add(im);
    grill.instanceMatrix.needsUpdate = true; scene.add(grill);
  }

  // ── CONDUIT RUNS — horizontal pipe runs across each facade ──────────────────
  // 1 IM. Pipes as thin cylinders, each running parallel to the face.
  function _conduitRun(x, z, y, faceR, sides, fp, pal) {
    const r   = Math.max(0.16, fp * 0.005);
    const len = faceR * 0.70;
    const mat = new THREE.MeshStandardMaterial({
      color:    pal.secondary.clone().lerp(new THREE.Color(0x181818), 0.58),
      emissive: pal.trim.clone(), emissiveIntensity: 0.048,
      roughness: 0.52, metalness: 0.48,
    });
    const im = new THREE.InstancedMesh(new THREE.CylinderGeometry(r, r, len, 6), mat, sides);
    const d  = new THREE.Object3D();
    for (let s = 0; s < sides; s++) {
      const fa = (s / sides) * Math.PI * 2 + Math.PI / sides;
      d.position.set(x + Math.cos(fa) * faceR, y, z + Math.sin(fa) * faceR);
      d.rotation.set(0, fa + Math.PI / 2, Math.PI / 2); d.updateMatrix();
      im.setMatrixAt(s, d.matrix);
    }
    im.instanceMatrix.needsUpdate = true; scene.add(im);
  }

  // ── ANTENNA CLUSTER — radiating rod array, rooftop sensor mast ──────────────
  // 1 IM. Deterministic radial pattern. Adds height hierarchy to roofline.
  function _antennaCluster(x, z, roofY, fp, count, pal) {
    const mat = new THREE.MeshStandardMaterial({
      color:    pal.trim.clone().lerp(pal.structural, 0.28),
      emissive: pal.primary.clone(), emissiveIntensity: 0.18,
      roughness: 0.36, metalness: 0.58,
    });
    const im = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(fp * 0.003, fp * 0.008, fp * 0.095, 5), mat, count);
    const d  = new THREE.Object3D();
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      const r = fp * (0.038 + (i % 3) * 0.028);
      const h = fp * (0.070 + (i % 2) * 0.042);
      d.position.set(x + Math.cos(a) * r, roofY + h * 0.5, z + Math.sin(a) * r);
      d.rotation.set(0, a, (i % 4) * 0.10); d.updateMatrix();
      im.setMatrixAt(i, d.matrix);
    }
    im.instanceMatrix.needsUpdate = true; scene.add(im);
  }

  // ── SATELLITE DISH — parabolic dish on rooftop mast ─────────────────────────
  function _satelliteDish(x, z, roofY, r, pal) {
    const mastH  = r * 2.8;
    const mastMat = new THREE.MeshStandardMaterial({
      color: pal.structural.clone().lerp(new THREE.Color(0x404040), 0.55),
      roughness: 0.80, metalness: 0.35,
    });
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.08, r * 0.12, mastH, 6), mastMat);
    mast.position.set(x, roofY + mastH * 0.5, z); mast.castShadow = true; scene.add(mast);
    const dishMat = new THREE.MeshStandardMaterial({
      color:    pal.secondary.clone().lerp(new THREE.Color(0x808080), 0.45),
      emissive: pal.trim.clone(), emissiveIntensity: 0.055,
      roughness: 0.55, metalness: 0.40,
      side: THREE.DoubleSide,
    });
    const dish = new THREE.Mesh(
      new THREE.SphereGeometry(r, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.45), dishMat);
    dish.rotation.x = Math.PI * 0.30; dish.rotation.z = Math.PI * 0.15;
    dish.position.set(x, roofY + mastH, z);
    dish.castShadow = true; scene.add(dish);
  }

  // ── ROOFTOP PINNACLES — slender decorative tapered spires (Library/Gothic) ──
  function _rooftopPinnacles(x, z, roofY, fp, count, pal) {
    const h   = Math.max(5, fp * 0.082);
    const r   = Math.max(0.22, fp * 0.010);
    const mat = new THREE.MeshStandardMaterial({
      color:    pal.secondary.clone().lerp(pal.structural, 0.30),
      emissive: pal.trim.clone(), emissiveIntensity: 0.060,
      roughness: 0.68, metalness: 0.14,
    });
    const orb = new THREE.InstancedMesh(new THREE.SphereGeometry(r * 1.35, 8, 6), mat, count);
    const pin = new THREE.InstancedMesh(new THREE.CylinderGeometry(r * 0.15, r, h, 6), mat, count);
    pin.castShadow = true;
    const d  = new THREE.Object3D();
    for (let i = 0; i < count; i++) {
      const a  = (i / count) * Math.PI * 2;
      const pr = fp * 0.36;
      d.position.set(x + Math.cos(a) * pr, roofY + h * 0.5, z + Math.sin(a) * pr);
      d.rotation.set(0, a, 0); d.updateMatrix();
      pin.setMatrixAt(i, d.matrix);
      d.position.set(x + Math.cos(a) * pr, roofY + h + r * 1.4, z + Math.sin(a) * pr);
      d.rotation.set(0, 0, 0); d.updateMatrix();
      orb.setMatrixAt(i, d.matrix);
    }
    pin.instanceMatrix.needsUpdate = true; scene.add(pin);
    orb.instanceMatrix.needsUpdate = true; scene.add(orb);
  }

  // Greeble panel quads on building facades — shallow recessed look, 1 draw call.
  // faceR = distance from center to facade. rows/cols of panels per face. sides = face count.
  function _greeblePanels(x, z, baseY, topY, faceR, sides, rows, cols, panW, panH, pal) {
    const H     = topY - baseY;
    const count = sides * rows * cols;
    const mat   = new THREE.MeshBasicMaterial({
      color: pal.primary.clone().lerp(new THREE.Color(0xffffff), 0.08),
      transparent: true, opacity: 0.12,
      blending: THREE.AdditiveBlending, depthWrite: false,
      side: THREE.DoubleSide,
    });
    const im = new THREE.InstancedMesh(new THREE.PlaneGeometry(panW, panH), mat, count);
    im.renderOrder = 2;
    const d = new THREE.Object3D();
    let idx = 0;
    for (let s = 0; s < sides; s++) {
      const fa   = (s / sides) * Math.PI * 2 + Math.PI / (sides);
      const cosF = Math.cos(fa), sinF = Math.sin(fa);
      const cosP = Math.cos(fa + Math.PI / 2), sinP = Math.sin(fa + Math.PI / 2);
      const spacing = panW * 1.55;
      for (let row = 0; row < rows; row++) {
        const yPos = baseY + H * (0.15 + (row / Math.max(1, rows - 1)) * 0.68);
        for (let col = 0; col < cols; col++) {
          const xOff = (col - (cols - 1) / 2) * spacing;
          d.position.set(
            x + cosF * faceR + cosP * xOff,
            yPos,
            z + sinF * faceR + sinP * xOff
          );
          d.rotation.set(0, fa, 0); d.updateMatrix();
          im.setMatrixAt(idx++, d.matrix);
        }
      }
    }
    im.instanceMatrix.needsUpdate = true; scene.add(im);
  }

  // ── TEMPLE COLONNADE — peristyle of classical columns with a FRONT ENTRY GAP ─
  // A ring of proper columns (plinth base + fluted shaft + echinus + abacus capital)
  // around a building's lower level, leaving a wide OPEN gap facing `gapDir` (the
  // direction toward world-centre) so it reads as a walk-in portico, not a sealed wall.
  // Columns that fall inside the entrance arc are skipped; the entablature lintels that
  // would bridge the gap are skipped too → the opening stays clear top to bottom.
  //   Draw calls: 5 InstancedMesh (base/shaft/echinus/abacus/capital-glow)
  //             + 1 InstancedMesh (entablature lintels) + 1 flat stylobate decal.
  // All matrices baked once at build; nothing per-frame.
  function _colonnade(x, z, baseY, ringR, totalH, colR, count, gapDir, gapHalf, pal) {
    // Which column angles survive? Skip the arc facing gapDir (the entrance).
    const frontAng = Math.atan2(gapDir.z, gapDir.x);
    const angles = [];
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      let d = a - frontAng;
      while (d >  Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      if (Math.abs(d) < gapHalf) continue;   // leave the entrance open
      angles.push(a);
    }
    const n = angles.length;
    if (n < 1) return;

    const baseH  = colR * 0.55;
    const capH   = colR * 0.60;
    const shaftH = Math.max(2, totalH - baseH - capH);

    const stoneMat = new THREE.MeshStandardMaterial({
      color: pal.structural.clone().lerp(new THREE.Color(0xd8ccae), 0.30),
      emissive: pal.primary.clone(), emissiveIntensity: 0.018,
      roughness: 0.82, metalness: 0.05,
    });
    const capMat = new THREE.MeshStandardMaterial({
      color: pal.secondary.clone().lerp(pal.structural, 0.24),
      emissive: pal.trim.clone(), emissiveIntensity: 0.055,
      roughness: 0.62, metalness: 0.16,
    });

    // 12-sided shaft reads as fluting under the directional light.
    const baseIM  = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(colR * 1.42, colR * 1.55, baseH, 12), capMat, n);
    const shaftIM = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(colR * 0.86, colR * 0.98, shaftH, 12), stoneMat, n);
    const echIM   = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(colR * 1.28, colR * 0.90, capH, 12), capMat, n);
    const abacIM  = new THREE.InstancedMesh(
      new THREE.BoxGeometry(colR * 2.5, colR * 0.30, colR * 2.5), capMat, n);
    const glowMat = new THREE.MeshBasicMaterial({
      color: pal.trim.clone().lerp(new THREE.Color(0xffffff), 0.30),
      transparent: true, opacity: 0.32,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const glowIM  = new THREE.InstancedMesh(
      new THREE.TorusGeometry(colR * 1.00, colR * 0.10, 6, 16), glowMat, n);
    baseIM.castShadow = shaftIM.castShadow = echIM.castShadow = abacIM.castShadow = true;
    glowIM.renderOrder = 3;

    const abacY = baseY + baseH + shaftH + capH + colR * 0.15;
    {
      const d = new THREE.Object3D();
      for (let k = 0; k < n; k++) {
        const a  = angles[k];
        const cx = x + Math.cos(a) * ringR;
        const cz = z + Math.sin(a) * ringR;
        d.rotation.set(0, 0, 0);
        d.position.set(cx, baseY + baseH * 0.5, cz);                d.updateMatrix(); baseIM.setMatrixAt(k, d.matrix);
        d.position.set(cx, baseY + baseH + shaftH * 0.5, cz);       d.updateMatrix(); shaftIM.setMatrixAt(k, d.matrix);
        d.position.set(cx, baseY + baseH + shaftH + capH * 0.5, cz);d.updateMatrix(); echIM.setMatrixAt(k, d.matrix);
        d.position.set(cx, abacY, cz);                              d.updateMatrix(); abacIM.setMatrixAt(k, d.matrix);
        d.rotation.set(-Math.PI / 2, 0, 0);
        d.position.set(cx, abacY, cz);                              d.updateMatrix(); glowIM.setMatrixAt(k, d.matrix);
      }
      baseIM.instanceMatrix.needsUpdate  = true; scene.add(baseIM);
      shaftIM.instanceMatrix.needsUpdate = true; scene.add(shaftIM);
      echIM.instanceMatrix.needsUpdate   = true; scene.add(echIM);
      abacIM.instanceMatrix.needsUpdate  = true; scene.add(abacIM);
      glowIM.instanceMatrix.needsUpdate  = true; scene.add(glowIM);
    }

    // Entablature — lintel beams spanning ADJACENT columns. Pairs that straddle the
    // entrance gap are skipped, so the doorway stays open right to the top.
    const spacing  = (Math.PI * 2) / count;
    const lintMids = [];
    for (let k = 0; k < n; k++) {
      const a0 = angles[k], a1 = angles[(k + 1) % n];
      let dd = a1 - a0; if (dd <= 0) dd += Math.PI * 2;
      if (dd > spacing * 1.6) continue;   // straddles the entrance → leave open
      lintMids.push(a0 + dd * 0.5);
    }
    if (lintMids.length) {
      const L      = 2 * ringR * Math.sin(spacing * 0.5) * 1.02;   // chord length
      const rMid   = ringR * Math.cos(spacing * 0.5);              // chord midpoint radius
      const lintY  = abacY + colR * 0.30;
      const lintIM = new THREE.InstancedMesh(
        new THREE.BoxGeometry(L, colR * 0.72, colR * 1.5), stoneMat, lintMids.length);
      lintIM.castShadow = true;
      const d = new THREE.Object3D();
      for (let k = 0; k < lintMids.length; k++) {
        const mid = lintMids[k];
        // Same span convention as the entrance lintel: local-x = tangent to the face.
        d.rotation.set(0, Math.atan2(Math.cos(mid), Math.sin(mid)), 0);
        d.position.set(x + Math.cos(mid) * rMid, lintY, z + Math.sin(mid) * rMid);
        d.updateMatrix(); lintIM.setMatrixAt(k, d.matrix);
      }
      lintIM.instanceMatrix.needsUpdate = true; scene.add(lintIM);
    }

    // Flat stylobate outline at the column feet — decorative decal, never blocks movement.
    const sty = new THREE.Mesh(
      new THREE.RingGeometry(ringR - colR * 1.7, ringR + colR * 1.7, 64),
      new THREE.MeshBasicMaterial({
        color: pal.trim, transparent: true, opacity: 0.10,
        side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false,
      })
    );
    sty.rotation.x = -Math.PI / 2;
    sty.position.set(x, baseY + 0.06, z);
    sty.renderOrder = 2; scene.add(sty);
  }

  // ── FACADE TEXTURE REGISTRY ───────────────────────────────────────────────
  const facadeRegistry = {};
  function regFacade(code, mat) {
    (facadeRegistry[code] = facadeRegistry[code] || []).push(mat);
  }

  // ── FOUNDATION SKIRT ──────────────────────────────────────────────────────
  // FLAT, WALKABLE FOUNDATION (was a 3.1u raised plinth that lifted the whole building — including the
  // door — off the ground with no stairs, so you could never reach the entrance and bumped an invisible
  // circular edge). Now: a thin foundation slab whose TOP sits flush with the terrain, sealing the
  // building-to-ground gap without raising anything. The door + walls start at ground level → you walk
  // straight up to the entrance and the [E] prompt. Returns 0 (no landing offset).
  function addMonumentBase(x, z, palette, baseY, footprint) {
    const fp       = footprint || 50;
    const sealCol  = palette.structural.clone().lerp(new THREE.Color(0x9a948a), 0.22);
    const foundMat = new THREE.MeshStandardMaterial({
      color: sealCol, roughness: 0.94, metalness: 0.03,
      emissive: palette.primary.clone(), emissiveIntensity: 0.003,
    });

    // Foundation slab — slightly wider than the walls, TOP flush with terrain, body sunk below.
    // No climb, no barrier: it just hides the seam where the building meets the ground.
    const slab = new THREE.Mesh(
      new THREE.CylinderGeometry(fp * 0.50, fp * 0.54, 1.4, 28), foundMat);
    slab.position.set(x, baseY - 0.65, z);   // top at baseY+0.05, buried below
    slab.receiveShadow = true; scene.add(slab);

    // A low ground trim ring flush to the floor — decorative only (flat decal, never blocks movement).
    const runeR = fp * 0.56;
    const rune  = new THREE.Mesh(
      new THREE.RingGeometry(runeR * 0.94, runeR, 24),
      new THREE.MeshBasicMaterial({
        color: palette.trim, transparent: true, opacity: 0.14,
        side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false,
      })
    );
    rune.rotation.x = -Math.PI / 2;
    rune.position.set(x, baseY + 0.04, z);
    rune.renderOrder = 2; scene.add(rune);

    return 0;  // door + walls now sit at ground level — walk right in
  }

  // ── DOOR RECESS ───────────────────────────────────────────────────────────
  // Deep slot punched into the front facade with:
  //   1. Dark recess box — absolute black, wide, deep → maximum shadow
  //   2. Glowing back panel — emissive rectangle at the back of the void
  //      reads as "lit interior" even from 100+ units away
  //   3. Threshold glow strip at floor level — unmistakeable entry cue
  // faceR = actual building face distance (fixes floating on box buildings).
  function _doorRecess(x, z, baseY, pal, fp, frontDir, faceR) {
    const doorW   = Math.max(5.5, fp * 0.18);
    const doorH   = Math.max(9.0, fp * 0.28);
    const depth   = Math.max(2.2, fp * 0.052);   // deeper recess = more dramatic shadow
    const actualR = (faceR || fp * 0.46) - depth * 0.5;
    const faceAng = Math.atan2(frontDir.x, frontDir.z);

    // 1) Dark recess box
    const voidMat = new THREE.MeshStandardMaterial({
      color:    new THREE.Color(0x000102),
      emissive: pal.primary.clone(), emissiveIntensity: 0.024,
      roughness: 0.99, metalness: 0.0,
    });
    const recess = new THREE.Mesh(new THREE.BoxGeometry(doorW, doorH, depth * 1.30), voidMat);
    recess.position.set(x + frontDir.x * actualR, baseY + doorH * 0.5, z + frontDir.z * actualR);
    recess.rotation.y = faceAng;
    scene.add(recess);

    // 2) Glowing back panel — interior light, positioned at far end of recess
    const backR = (faceR || fp * 0.46) - depth * 1.18;
    const glow  = new THREE.Mesh(
      new THREE.PlaneGeometry(doorW * 0.82, doorH * 0.88),
      new THREE.MeshBasicMaterial({
        color: pal.trim.clone().lerp(new THREE.Color(0xffffff), 0.22),
        transparent: true, opacity: 0.68,
        blending: THREE.AdditiveBlending, depthWrite: false,
      })
    );
    glow.position.set(x + frontDir.x * backR, baseY + doorH * 0.50, z + frontDir.z * backR);
    glow.rotation.y = faceAng;
    glow.renderOrder = 5; scene.add(glow);

    // 3) Floor threshold glow strip — the unmistakeable "come in here" signal
    const stripW = doorW * 1.12, stripD = Math.max(1.8, fp * 0.040);
    const faceR_ = faceR || fp * 0.46;
    const thresh = new THREE.Mesh(
      new THREE.PlaneGeometry(stripW, stripD),
      new THREE.MeshBasicMaterial({
        color: pal.primary.clone().lerp(new THREE.Color(0xffffff), 0.30),
        transparent: true, opacity: 0.55,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      })
    );
    thresh.rotation.order = 'YXZ';
    thresh.rotation.y = faceAng;
    thresh.rotation.x = -Math.PI / 2;
    thresh.position.set(
      x + frontDir.x * (faceR_ - stripD * 0.3),
      baseY + 0.18,
      z + frontDir.z * (faceR_ - stripD * 0.3)
    );
    thresh.renderOrder = 4; scene.add(thresh);

    // 4) Door frame — architectural surround that frames the void
    const frameMat = new THREE.MeshStandardMaterial({
      color:    pal.secondary.clone().lerp(pal.structural, 0.38),
      emissive: pal.trim.clone(), emissiveIntensity: 0.065,
      roughness: 0.60, metalness: 0.22,
    });
    const frameBox = new THREE.Mesh(
      new THREE.BoxGeometry(doorW + fp * 0.022, doorH + fp * 0.014, fp * 0.010), frameMat);
    frameBox.position.set(
      x + frontDir.x * (faceR_ + fp * 0.005),
      baseY + doorH * 0.5 + fp * 0.007,
      z + frontDir.z * (faceR_ + fp * 0.005)
    );
    frameBox.rotation.y = faceAng;
    frameBox.castShadow = true; scene.add(frameBox);
  }

  // ── ENTRANCE DOORWAY ──────────────────────────────────────────────────────
  // Fluted columns + lintel + double-ring arch + threshold glow + approach runner.
  // faceR = actual building face distance (fixes floating entrance bug).
  function addEntrance(x, z, palette, doorY, footprint, frontDir, faceR) {
    const fp         = footprint || 50;
    const doorFaceR  = faceR || fp * 0.46;
    const doorW      = Math.max(4.5, fp * 0.16);
    const doorH      = Math.max(7.0, fp * 0.25);
    const colR       = Math.max(0.72, fp * 0.028);
    const lintH      = Math.max(1.0,  fp * 0.038);

    const dfx      = x + frontDir.x * doorFaceR;
    const dfz      = z + frontDir.z * doorFaceR;
    const px       = -frontDir.z;
    const pz       =  frontDir.x;
    const faceAngle = Math.atan2(frontDir.x, frontDir.z);

    const stoneMat = new THREE.MeshStandardMaterial({
      color: palette.structural.clone().lerp(palette.secondary, 0.40),
      emissive: palette.trim.clone(), emissiveIntensity: 0.06,
      metalness: 0.05, roughness: 0.72,
    });

    // Columns (left + right) — the two sides differ only by translation (all parts are
    // rotationally symmetric or plan-square), so each part-type becomes one InstancedMesh
    // with 2 instances: 5 draw calls instead of 10, and the orb material is built once
    // instead of once per side. × 8 buildings = ~40 draw calls saved.
    const colH      = doorH * 1.12;
    const colOffset = doorW * 0.5 + colR * 1.80;
    const baseIM = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(colR * 1.58, colR * 1.70, colR * 0.50, 8), stoneMat, 2);
    const shaftIM = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(colR * 0.80, colR, colH, 12), stoneMat, 2);
    const echIM = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(colR * 1.35, colR * 0.82, colR * 0.58, 8), stoneMat, 2);
    const abacIM = new THREE.InstancedMesh(
      new THREE.BoxGeometry(colR * 2.9, colR * 0.34, colR * 2.9), stoneMat, 2);
    const colOrbMat = new THREE.MeshBasicMaterial({
      color: palette.trim.clone().lerp(new THREE.Color(0xffffff), 0.50),
      transparent: true, opacity: 0.68,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const colOrbIM = new THREE.InstancedMesh(new THREE.SphereGeometry(colR * 1.02, 10, 7), colOrbMat, 2);
    baseIM.castShadow = shaftIM.castShadow = echIM.castShadow = abacIM.castShadow = true;
    colOrbIM.renderOrder = 4;
    {
      const d = new THREE.Object3D(); let k = 0;
      for (const side of [-1, 1]) {
        const cx = dfx + px * colOffset * side;
        const cz = dfz + pz * colOffset * side;
        d.position.set(cx, doorY + colR * 0.25, cz); d.updateMatrix(); baseIM.setMatrixAt(k, d.matrix);
        d.position.set(cx, doorY + colR * 0.50 + colH * 0.5, cz); d.updateMatrix(); shaftIM.setMatrixAt(k, d.matrix);
        d.position.set(cx, doorY + colR * 0.50 + colH + colR * 0.29, cz); d.updateMatrix(); echIM.setMatrixAt(k, d.matrix);
        d.position.set(cx, doorY + colR * 0.50 + colH + colR * 0.62 + colR * 0.17, cz); d.updateMatrix(); abacIM.setMatrixAt(k, d.matrix);
        d.position.set(cx, doorY + colR * 0.50 + colH + colR * 0.80 + colR * 0.34, cz); d.updateMatrix(); colOrbIM.setMatrixAt(k, d.matrix);
        k++;
      }
      baseIM.instanceMatrix.needsUpdate  = true; scene.add(baseIM);
      shaftIM.instanceMatrix.needsUpdate = true; scene.add(shaftIM);
      echIM.instanceMatrix.needsUpdate   = true; scene.add(echIM);
      abacIM.instanceMatrix.needsUpdate  = true; scene.add(abacIM);
      colOrbIM.instanceMatrix.needsUpdate = true; scene.add(colOrbIM);
    }

    // Lintel / architrave
    const lintW = doorW + colR * 4.0;
    const lintY = doorY + doorH + lintH * 0.5;
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(lintW, lintH, colR * 1.40), stoneMat);
    lintel.position.set(dfx, lintY, dfz);
    lintel.rotation.y = faceAngle;
    lintel.castShadow = true; scene.add(lintel);

    // Emissive trim strip on lintel face
    const trimStrip = new THREE.Mesh(
      new THREE.BoxGeometry(lintW * 0.95, lintH * 0.16, colR * 0.10),
      new THREE.MeshBasicMaterial({
        color: palette.trim.clone().lerp(new THREE.Color(0xffffff), 0.18),
        transparent: true, opacity: 0.72,
        blending: THREE.AdditiveBlending, depthWrite: false,
      })
    );
    trimStrip.position.set(dfx + frontDir.x * colR * 0.78, lintY - lintH * 0.38,
                           dfz + frontDir.z * colR * 0.78);
    trimStrip.rotation.y = faceAngle;
    trimStrip.renderOrder = 4; scene.add(trimStrip);

    // Dentil course — row of small blocks beneath the architrave (classical cornice
    // detail). Instanced along the tangent (px,pz) using the entrance's proven vectors.
    const dentN  = 7;
    const dentIM = new THREE.InstancedMesh(
      new THREE.BoxGeometry(colR * 0.42, colR * 0.52, colR * 0.52), stoneMat, dentN);
    dentIM.castShadow = true;
    {
      const dd   = new THREE.Object3D();
      const span = lintW * 0.80;
      for (let i = 0; i < dentN; i++) {
        const off = (i - (dentN - 1) / 2) * (span / dentN);
        dd.position.set(
          dfx + px * off + frontDir.x * colR * 0.58,
          lintY - lintH * 0.64,
          dfz + pz * off + frontDir.z * colR * 0.58
        );
        dd.rotation.set(0, faceAngle, 0); dd.updateMatrix();
        dentIM.setMatrixAt(i, dd.matrix);
      }
      dentIM.instanceMatrix.needsUpdate = true; scene.add(dentIM);
    }

    // Cornice cap — projecting crown molding above the architrave
    const cornice = new THREE.Mesh(
      new THREE.BoxGeometry(lintW + colR * 1.2, lintH * 0.5, colR * 2.0), stoneMat);
    cornice.position.set(dfx, lintY + lintH * 0.58, dfz);
    cornice.rotation.y = faceAngle;
    cornice.castShadow = true; scene.add(cornice);

    // Double arch above lintel
    const archR     = doorW * 0.52 + colR * 1.2;
    const archCentY = lintY + lintH * 0.5 + archR * 0.86;
    const archTube  = Math.max(0.20, archR * 0.053);
    const archOuter = new THREE.Mesh(
      new THREE.TorusGeometry(archR, archTube, 10, 52),
      new THREE.MeshBasicMaterial({
        color: palette.trim.clone().lerp(new THREE.Color(0xffffff), 0.26),
        transparent: true, opacity: 0.75,
        blending: THREE.AdditiveBlending, depthWrite: false,
      })
    );
    archOuter.rotation.y = faceAngle;
    archOuter.position.set(dfx, archCentY, dfz);
    archOuter.renderOrder = 5; scene.add(archOuter);
    const archInner = new THREE.Mesh(
      new THREE.TorusGeometry(archR * 0.70, archTube * 1.48, 8, 40),
      new THREE.MeshBasicMaterial({
        color: palette.primary.clone().lerp(new THREE.Color(0xffffff), 0.58),
        transparent: true, opacity: 0.32,
        blending: THREE.AdditiveBlending, depthWrite: false,
      })
    );
    archInner.rotation.y = faceAngle;
    archInner.position.set(dfx, archCentY, dfz);
    archInner.renderOrder = 4; scene.add(archInner);

    // Keystone — wedge block crowning the arch apex (classical centrepiece)
    const keystone = new THREE.Mesh(
      new THREE.BoxGeometry(colR * 1.1, archR * 0.44, colR * 1.35),
      new THREE.MeshStandardMaterial({
        color: palette.secondary.clone().lerp(palette.trim, 0.30),
        emissive: palette.trim.clone(), emissiveIntensity: 0.10,
        roughness: 0.58, metalness: 0.20,
      })
    );
    keystone.position.set(
      dfx + frontDir.x * colR * 0.20,
      archCentY + archR * 0.92,
      dfz + frontDir.z * colR * 0.20
    );
    keystone.rotation.y = faceAngle;
    keystone.castShadow = true; scene.add(keystone);

    // Threshold glow tile
    const threshW = doorW + colR * 2.6;
    const threshD = Math.max(2.8, fp * 0.068);
    const thresh  = new THREE.Mesh(
      new THREE.PlaneGeometry(threshW, threshD),
      new THREE.MeshBasicMaterial({
        color: palette.trim, transparent: true, opacity: 0.40,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      })
    );
    thresh.rotation.order = 'YXZ';
    thresh.rotation.y = faceAngle;
    thresh.rotation.x = -Math.PI / 2;
    thresh.position.set(dfx + frontDir.x * threshD * 0.5, doorY + 0.16,
                        dfz + frontDir.z * threshD * 0.5);
    thresh.renderOrder = 3; scene.add(thresh);

    // Approach path
    const pathLen = Math.max(8, fp * 0.22);
    const path    = new THREE.Mesh(
      new THREE.PlaneGeometry(doorW * 0.46, pathLen),
      new THREE.MeshBasicMaterial({
        color: palette.primary, transparent: true, opacity: 0.14,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      })
    );
    path.rotation.order = 'YXZ';
    path.rotation.y = faceAngle;
    path.rotation.x = -Math.PI / 2;
    path.position.set(dfx + frontDir.x * (threshD + pathLen * 0.5), doorY + 0.12,
                      dfz + frontDir.z * (threshD + pathLen * 0.5));
    path.renderOrder = 2; scene.add(path);

    // Two entry steps
    const stepH   = 0.25;
    const stepD   = Math.max(1.5, fp * 0.040);
    const stepW   = doorW + colR * 3.0;
    const stepMat = new THREE.MeshStandardMaterial({
      color: palette.structural.clone().lerp(new THREE.Color(0xbab0a0), 0.30),
      roughness: 0.90, metalness: 0.02,
      emissive: palette.primary.clone(), emissiveIntensity: 0.005,
    });
    for (let i = 0; i < 2; i++) {
      const stepFaceR = doorFaceR - stepD * (1.8 - i * 0.90);
      const sx  = x + frontDir.x * stepFaceR;
      const sz  = z + frontDir.z * stepFaceR;
      const stp = new THREE.Mesh(
        new THREE.BoxGeometry(stepW - i * colR * 0.8, stepH, stepD), stepMat);
      stp.position.set(sx, doorY + stepH * (i + 0.5), sz);
      stp.rotation.y = faceAngle;
      stp.castShadow = true; stp.receiveShadow = true; scene.add(stp);
    }
  }

  // ── GROUND PLAQUE ──────────────────────────────────────────────────────────
  // Engraved name slab at the doorstep. faceR = actual building face.
  function addGroundPlaque(x, z, color, text, doorY, footprint, frontDir, faceR) {
    const fp        = footprint || 50;
    const plaqueW   = Math.max(6.5, fp * 0.19);
    const plaqueD   = Math.max(2.6, fp * 0.072);
    const plaqueH   = 0.20;
    const doorFaceR = faceR || fp * 0.46;
    const plaqueR   = doorFaceR + Math.max(3.5, fp * 0.13);
    const faceAngle = Math.atan2(frontDir.x, frontDir.z);
    const px_       = x + frontDir.x * plaqueR;
    const pz_       = z + frontDir.z * plaqueR;

    const slabCol = new THREE.Color(0x060910).lerp(new THREE.Color(color), 0.14);
    const slab    = new THREE.Mesh(
      new THREE.BoxGeometry(plaqueW, plaqueH, plaqueD),
      new THREE.MeshStandardMaterial({
        color: slabCol, roughness: 0.84, metalness: 0.06,
        emissive: new THREE.Color(color), emissiveIntensity: 0.020,
      })
    );
    slab.position.set(px_, doorY + plaqueH * 0.5, pz_);
    slab.rotation.y = faceAngle;
    slab.receiveShadow = true; slab.castShadow = true; scene.add(slab);

    // Canvas text engraved on slab top
    const W  = 256, H = 64;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d');
    ctx.clearRect(0, 0, W, H);
    const col = hexColor(color);
    ctx.font = 'bold 26px Georgia, "Times New Roman", serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.shadowColor = col; ctx.shadowBlur = 10;
    ctx.fillStyle = col;
    ctx.fillText(text, W / 2, H / 2);
    ctx.shadowBlur = 0;
    ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(255,255,255,0.26)';
    ctx.strokeText(text, W / 2, H / 2);
    const tex  = new THREE.CanvasTexture(cv);
    tex.anisotropy = 4; tex.needsUpdate = true;
    const face = new THREE.Mesh(
      new THREE.PlaneGeometry(plaqueW * 0.86, plaqueD * 0.76),
      new THREE.MeshBasicMaterial({
        map: tex, transparent: true, opacity: 0.83,
        depthWrite: false, side: THREE.DoubleSide,
      })
    );
    face.rotation.order = 'YXZ';
    face.rotation.y = faceAngle;
    face.rotation.x = -Math.PI / 2;
    face.position.set(px_, doorY + plaqueH + 0.02, pz_);
    face.renderOrder = 3; scene.add(face);
  }

  // ── SHARED RIBS (InstancedMesh) ───────────────────────────────────────────
  function addRibs(x, z, palette, baseY, roofY, footprint) {
    const H    = Math.max(1, roofY - baseY);
    const r    = footprint * 0.48;
    const ribW = Math.max(0.7, footprint * 0.030);
    const N    = 8;
    const ribIM = new THREE.InstancedMesh(
      new THREE.BoxGeometry(ribW, H, ribW),
      new THREE.MeshStandardMaterial({
        color: palette.secondary.clone().lerp(palette.structural, 0.30),
        emissive: palette.secondary.clone(), emissiveIntensity: 0.05,
        metalness: 0.08, roughness: 0.76,
      }),
      N
    );
    ribIM.castShadow = true;
    const dummy = new THREE.Object3D();
    for (let i = 0; i < N; i++) {
      const angle = (i / N) * Math.PI * 2;
      dummy.position.set(x + Math.cos(angle) * r, baseY + H * 0.5, z + Math.sin(angle) * r);
      dummy.rotation.set(0, angle, 0); dummy.updateMatrix();
      ribIM.setMatrixAt(i, dummy.matrix);
    }
    ribIM.instanceMatrix.needsUpdate = true; scene.add(ribIM);

    // Cap cylinders
    const capIM = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(ribW * 1.2, ribW * 1.2, ribW * 0.55, 8),
      new THREE.MeshBasicMaterial({
        color: palette.trim.clone().lerp(new THREE.Color(0xffffff), 0.10),
        transparent: true, opacity: 0.32,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }),
      N
    );
    capIM.renderOrder = 3;
    for (let i = 0; i < N; i++) {
      const angle = (i / N) * Math.PI * 2;
      dummy.position.set(x + Math.cos(angle) * r, roofY + ribW * 0.28, z + Math.sin(angle) * r);
      dummy.rotation.set(0, 0, 0); dummy.updateMatrix();
      capIM.setMatrixAt(i, dummy.matrix);
    }
    capIM.instanceMatrix.needsUpdate = true; scene.add(capIM);
  }

  // ── RECESSED WINDOWS (InstancedMesh — 3 draw calls total per building) ──────
  // Each window = frame surround (solid geometry) + near-black recess box + additive glass.
  // The recess box is physically punched into the facade depth → real shadow, real depth.
  // faceR: actual face distance from building center (per-building, fixes position accuracy).
  function addWindowsRecessed(x, z, palette, baseY, roofY, footprint, faceR, sides, rows, cols) {
    const H      = Math.max(1, roofY - baseY);
    const fp     = footprint;
    const actual_r  = (faceR !== undefined ? faceR : fp * 0.49);
    const winW   = Math.max(1.4, fp * 0.044);
    const winH   = Math.max(2.0, fp * 0.068);
    const depth  = Math.max(0.9, fp * 0.024);   // physical recess depth — creates shadow pocket
    const frameT = Math.max(0.24, fp * 0.008);  // frame reveal thickness
    const colSpacing = winW + Math.max(1.0, fp * 0.030);
    const count  = sides * rows * cols;
    if (count < 1) return;

    // 1) Frame surround — stands proud of facade surface, creates shadowed reveal edge
    const frameMat = new THREE.MeshStandardMaterial({
      color:    palette.structural.clone().lerp(palette.secondary, 0.24),
      emissive: palette.trim.clone(), emissiveIntensity: 0.040,
      roughness: 0.63, metalness: 0.22,
    });
    const frameIM = new THREE.InstancedMesh(
      new THREE.BoxGeometry(winW + frameT * 2, winH + frameT * 2, frameT * 1.6),
      frameMat, count);
    frameIM.castShadow = true;

    // 2) Recess void — near-black deep box; the shadow depth that makes the facade read as 3D
    const recessMat = new THREE.MeshStandardMaterial({
      color:    new THREE.Color(0x000204),
      emissive: palette.primary.clone(), emissiveIntensity: 0.010,
      roughness: 0.99, metalness: 0.0,
    });
    const recessIM = new THREE.InstancedMesh(
      new THREE.BoxGeometry(winW, winH, depth), recessMat, count);

    // 3) Glass glow — additive interior-light plane at the back of the recess
    const glassMat = new THREE.MeshBasicMaterial({
      color: palette.trim.clone().lerp(new THREE.Color(0xffffff), 0.12),
      transparent: true, opacity: 0.26,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const glassIM = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(winW * 0.78, winH * 0.78), glassMat, count);
    glassIM.renderOrder = 3;

    const dummy = new THREE.Object3D();
    let idx = 0;
    for (let s = 0; s < sides; s++) {
      const fa   = (s / sides) * Math.PI * 2 + Math.PI / sides;
      const cosF = Math.cos(fa), sinF = Math.sin(fa);
      const cosP = Math.cos(fa + Math.PI / 2), sinP = Math.sin(fa + Math.PI / 2);
      for (let row = 0; row < rows; row++) {
        const yPos = baseY + H * (0.16 + (row / Math.max(1, rows - 1)) * 0.66);
        for (let col = 0; col < cols; col++) {
          const xOff = (col - (cols - 1) * 0.5) * colSpacing;
          // Point on the facade surface
          const fx = x + cosF * actual_r + cosP * xOff;
          const fz = z + sinF * actual_r + sinP * xOff;

          // Frame: just proud of facade surface along the outward normal
          dummy.position.set(fx + cosF * (frameT * 0.80), yPos, fz + sinF * (frameT * 0.80));
          dummy.rotation.set(0, fa, 0); dummy.updateMatrix();
          frameIM.setMatrixAt(idx, dummy.matrix);

          // Recess box: center is depth/2 behind the facade surface
          dummy.position.set(fx - cosF * (depth * 0.5 - 0.12), yPos, fz - sinF * (depth * 0.5 - 0.12));
          dummy.rotation.set(0, fa, 0); dummy.updateMatrix();
          recessIM.setMatrixAt(idx, dummy.matrix);

          // Glass: at the very back of the recess
          dummy.position.set(fx - cosF * (depth - 0.22), yPos, fz - sinF * (depth - 0.22));
          dummy.rotation.set(0, fa, 0); dummy.updateMatrix();
          glassIM.setMatrixAt(idx, dummy.matrix);

          idx++;
        }
      }
    }
    frameIM.instanceMatrix.needsUpdate = true; scene.add(frameIM);
    recessIM.instanceMatrix.needsUpdate = true; scene.add(recessIM);
    glassIM.instanceMatrix.needsUpdate  = true; scene.add(glassIM);
  }

  // ── FULL DECORATION SUITE ─────────────────────────────────────────────────
  // faceR = actual building face radius (from each builder).
  // buildingCode used to tune window sides/density.
  function decorate(x, z, color, displayName, footprint, topY, frontDir, faceR, buildingCode) {
    const baseY   = gy(x, z);
    const palette = buildPalette(color);
    const fp      = footprint || 50;

    groundMarker(x, z, color, fp * 0.62);
    accentTrimRing(x, z, palette.trim, topY, fp);

    const apronH   = addMonumentBase(x, z, palette, baseY, fp);
    const landingY = baseY + apronH;   // ≈ ground level + 0.30

    addEntrance(x, z, palette, landingY, fp, frontDir, faceR);
    if (displayName) addGroundPlaque(x, z, color, displayName, landingY, fp, frontDir, faceR);
    addRibs   (x, z, palette, landingY, topY, fp);

    // ── Recessed windows: 3 IM objects, real physical depth ──────────────────
    // Cylinder buildings get more sides; box buildings use 4.
    const isCylinder = (buildingCode === 'nexus-hub' || buildingCode === 'oracle-spire');
    const winSides   = isCylinder ? 6 : 4;
    const winRows    = 5, winCols = 3;
    addWindowsRecessed(x, z, palette, landingY, topY, fp, faceR, winSides, winRows, winCols);

    // ── Mullion strips — vertical panel seams, 1 IM ──────────────────────────
    _mullionStrips(x, z, landingY, topY, faceR, winSides, winCols + 1, palette);

    // ── Horizontal conduit runs at mechanical levels (1 IM each = 2 draw calls) ─
    const h1 = landingY + (topY - landingY) * 0.32;
    const h2 = landingY + (topY - landingY) * 0.64;
    _conduitRun(x, z, h1, faceR, winSides, fp, palette);
    _conduitRun(x, z, h2, faceR, winSides, fp, palette);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 8 DISTINCT PROCEDURAL BUILDING BUILDERS
  // Each returns { topY, faceR } — faceR is the ACTUAL face distance, used to
  // seat the entrance flush against the building wall (fixes floating).
  // ═══════════════════════════════════════════════════════════════════════════

  // ── SHADDAI TEMPLE — stepped octagonal ziggurat + central spire, GOLD ────
  // faceR = first tier radius (fp * 0.46) — the entrance was always correct here.
  function _buildShaddaiTemple(x, z, baseY, pal, fp, code, frontDir) {
    frontDir = frontDir || { x: 0, z: -1 };
    // Deep-gold body: structural (near-black) + 50% primary tint
    const bodyMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0x09070a).lerp(pal.primary, 0.50),
      emissive: pal.primary.clone(), emissiveIntensity: 0.022,
      roughness: 0.62, metalness: 0.18,
    });
    regFacade(code, bodyMat);

    const tiers = [
      { r: fp * 0.46, h: 12 },
      { r: fp * 0.33, h: 13 },
      { r: fp * 0.22, h: 14 },
      { r: fp * 0.13, h: 15 },
    ];
    let y = baseY;
    for (const t of tiers) {
      const mesh = new THREE.Mesh(
        new THREE.CylinderGeometry(t.r * 0.92, t.r, t.h, 8), bodyMat);
      mesh.position.set(x, y + t.h * 0.5, z);
      mesh.castShadow = true; mesh.receiveShadow = true; scene.add(mesh);
      // Emissive belt at each tier transition
      _band(x, z, y + t.h, t.r * 0.94, t.r * 0.014, pal);
      y += t.h;
    }

    // Belt courses up the first (largest) tier
    _beltCourses(x, z, baseY, baseY + tiers[0].h, tiers[0].r * 0.96, tiers[0].r * 0.008, 4, pal);

    // Greeble panels on first tier faces
    _greeblePanels(x, z, baseY, baseY + tiers[0].h,
      tiers[0].r * 0.94, 8, 3, 2, fp * 0.045, fp * 0.045, pal);

    // ── GRAND BASE COLONNADE ────────────────────────────────────────────────
    // A peristyle of fluted columns rings tier 0, standing just outside the cella
    // wall so the temple base reads as PILLARS, not a solid block. The ring has a
    // wide OPEN gap aligned to frontDir (i.e. facing world-centre / the entrance),
    // with the entablature lintels over the gap omitted → a real walk-in portico.
    // Columns rise a touch above tier 0 so they appear to carry the setback above.
    _colonnade(
      x, z, baseY,
      tiers[0].r * 1.16,          // ring radius — just outside the fp*0.46 cella wall
      tiers[0].h * 1.04,          // column height ≈ first tier
      fp * 0.019,                 // column radius
      24,                         // columns before the entrance gap is cut
      frontDir, 0.42,             // gap faces world-centre (~48° clear opening)
      pal
    );

    // Central spire
    const spireH  = 38;
    const spireMat = new THREE.MeshStandardMaterial({
      color: pal.trim.clone().lerp(new THREE.Color(0xffd700), 0.50),
      emissive: pal.primary.clone(), emissiveIntensity: 0.20,
      roughness: 0.44, metalness: 0.30,
    });
    const spire = new THREE.Mesh(
      new THREE.CylinderGeometry(fp * 0.016, fp * 0.068, spireH, 8), spireMat);
    spire.position.set(x, y + spireH * 0.5, z);
    spire.castShadow = true; scene.add(spire);
    y += spireH;

    // Crown orb
    const orbMat = new THREE.MeshStandardMaterial({
      color: pal.trim.clone().lerp(new THREE.Color(0xffffff), 0.30),
      emissive: pal.primary.clone(), emissiveIntensity: 0.28,
      roughness: 0.34, metalness: 0.34,
    });
    const orb = new THREE.Mesh(new THREE.SphereGeometry(fp * 0.036, 12, 8), orbMat);
    orb.position.set(x, y, z); scene.add(orb);
    y += fp * 0.036;

    // 4 corner mini-spires off tier 0 — InstancedMesh (1 draw call vs 4)
    const miniR = fp * 0.32, miniH = 26;
    const miniIM = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(fp * 0.008, fp * 0.036, miniH, 6), spireMat, 4);
    miniIM.castShadow = true;
    {
      const d = new THREE.Object3D();
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
        d.position.set(
          x + Math.cos(a) * miniR,
          baseY + miniH * 0.5 + tiers[0].h * 0.30,
          z + Math.sin(a) * miniR
        );
        d.updateMatrix(); miniIM.setMatrixAt(i, d.matrix);
      }
      miniIM.instanceMatrix.needsUpdate = true; scene.add(miniIM);
    }

    // ── Rooftop: ritual antenna array + satellite dish on tier-1 ────────────
    _antennaCluster(x, z, y, fp, 8, pal);
    _satelliteDish(x + tiers[1].r * 0.72, z, baseY + tiers[0].h, fp * 0.055, pal);
    // Exhaust stacks as ceremonial brazier chimneys around tier-2 platform
    _exhaustStacks(x, z, baseY + tiers[0].h + tiers[1].h, fp * 0.50, 5, pal);

    return { topY: y, faceR: tiers[0].r };  // faceR = fp * 0.46
  }

  // ── NEXUS HUB — dark cylinder + data rings + fin array + dome + antenna ──
  // faceR = mainR = fp * 0.30 (previously: fp * 0.46 → entrance was floating 11+ units out)
  function _buildNexusHub(x, z, baseY, pal, fp, code) {
    // Dark slate graphite body, teal tint only on emissive
    const bodyMat = new THREE.MeshStandardMaterial({
      color: pal.body.clone(),
      emissive: pal.primary.clone(), emissiveIntensity: 0.040,
      roughness: 0.54, metalness: 0.22,
    });
    regFacade(code, bodyMat);

    const mainR = fp * 0.30, mainH = 50;
    _cyl(x, z, baseY, mainR, mainR * 1.05, mainH, bodyMat, 20);

    // Horizontal data-ring bands up the shaft (belt courses)
    _beltCourses(x, z, baseY, baseY + mainH, mainR * 1.08, mainR * 0.018, 8, pal);

    // Accent panel ring at mid-height
    const midBand = baseY + mainH * 0.50;
    const midMat  = new THREE.MeshStandardMaterial({
      color: pal.secondary.clone().lerp(pal.structural, 0.40),
      emissive: pal.trim.clone(), emissiveIntensity: 0.10,
      roughness: 0.48, metalness: 0.28,
    });
    _cyl(x, z, midBand - 2.5, mainR * 1.12, mainR * 1.16, 5.0, midMat, 20);

    // Radiating tech fins at mid zone
    _fins(x, z, baseY + mainH * 0.32, baseY + mainH * 0.68,
          mainR * 1.18, 8, fp * 0.014, fp * 0.092, pal);

    // Greeble panels on cylinder face
    _greeblePanels(x, z, baseY, baseY + mainH, mainR * 1.02, 6, 4, 3, fp * 0.038, fp * 0.040, pal);

    // Upper shaft (narrower)
    const upperR = fp * 0.18, upperH = 24;
    const aft    = baseY + mainH;
    const afterU = _cyl(x, z, aft, upperR, upperR * 1.06, upperH, bodyMat, 16);
    _band(x, z, afterU, upperR * 1.08, upperR * 0.028, pal);

    // Dome cap
    const domeR   = upperR * 1.28;
    const domeMat = new THREE.MeshStandardMaterial({
      color: pal.secondary.clone().lerp(pal.structural, 0.20),
      emissive: pal.trim.clone(), emissiveIntensity: 0.12,
      roughness: 0.44, metalness: 0.26,
    });
    const domeTop = _dome(x, z, afterU, domeR, domeMat, 24);

    // Antenna
    const antH  = 14;
    const antMat = new THREE.MeshStandardMaterial({
      color: pal.trim.clone(), emissive: pal.primary.clone(), emissiveIntensity: 0.22,
      roughness: 0.36, metalness: 0.46,
    });
    const ant = new THREE.Mesh(new THREE.CylinderGeometry(fp * 0.004, fp * 0.011, antH, 6), antMat);
    ant.position.set(x, domeTop + antH * 0.5, z); scene.add(ant);

    // ── Rooftop: dense cooling array + vent boxes + extra antenna cluster ────
    _exhaustStacks(x, z, domeTop - domeR * 0.3, fp * 0.55, 8, pal);
    _ventBoxes(x, z, afterU - 2, fp * 0.55, 5, pal);
    _antennaCluster(x, z, domeTop, fp, 12, pal);
    _satelliteDish(x - mainR * 0.60, z + mainR * 0.40, afterU, fp * 0.060, pal);

    return { topY: domeTop + antH, faceR: mainR };
  }

  // ── LIBRARY (QUILL) — dark stone hall + gabled roof + side wings ─────────
  // faceR = mainD / 2 = fp * 0.26 (the depth-facing side meets the player)
  function _buildLibrary(x, z, baseY, pal, fp, code) {
    const stoneMat = new THREE.MeshStandardMaterial({
      color: pal.body.clone().lerp(pal.primary, 0.08),
      emissive: pal.primary.clone(), emissiveIntensity: 0.018,
      roughness: 0.80, metalness: 0.06,
    });
    regFacade(code, stoneMat);

    const mainW = fp * 0.82, mainD = fp * 0.52, mainH = 38;
    _box(x, z, baseY, mainW, mainH, mainD, stoneMat);

    // Pilaster panels on main facade (greeble — 2 instanced faces)
    _greeblePanels(x, z, baseY, baseY + mainH, mainD * 0.51, 2, 5, 4, fp * 0.042, fp * 0.050, pal);

    // Belt courses up main block
    _beltCourses(x, z, baseY, baseY + mainH, mainW * 0.42, mainW * 0.006, 9, pal);

    // Cornice band
    const cornMat = new THREE.MeshStandardMaterial({
      color: pal.secondary.clone().lerp(pal.structural, 0.28),
      emissive: pal.trim.clone(), emissiveIntensity: 0.08,
      roughness: 0.66, metalness: 0.10,
    });
    _box(x, z, baseY + mainH, mainW + 2.6, 2.8, mainD + 2.6, cornMat);
    const afterCornice = baseY + mainH + 2.8;

    // Gabled pyramid roof
    const roofH   = 18;
    const roofMat = new THREE.MeshStandardMaterial({
      color: pal.secondary.clone().lerp(pal.structural, 0.35),
      emissive: pal.primary.clone(), emissiveIntensity: 0.035,
      roughness: 0.72, metalness: 0.08,
    });
    const roofMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.3, mainW * 0.52, roofH, 4), roofMat);
    roofMesh.position.set(x, afterCornice + roofH * 0.5, z);
    roofMesh.rotation.y = Math.PI / 4;
    roofMesh.castShadow = true; scene.add(roofMesh);

    // Side wings
    const wingW = fp * 0.24, wingD = fp * 0.36, wingH = 26;
    for (const side of [-1, 1]) {
      const wx = x + side * (mainW * 0.5 + wingW * 0.5 - 1.0);
      _box(wx, z, baseY, wingW, wingH, wingD, stoneMat);
      const wRoof = new THREE.Mesh(
        new THREE.CylinderGeometry(0.3, wingW * 0.52, 10, 4), roofMat);
      wRoof.position.set(wx, baseY + wingH + 5, z);
      wRoof.rotation.y = Math.PI / 4;
      wRoof.castShadow = true; scene.add(wRoof);
    }

    _band(x, z, afterCornice, mainW * 0.46, 0.88, pal);

    // ── Rooftop: Gothic pinnacles + chimney stacks + a satellite dish ────────
    _rooftopPinnacles(x, z, afterCornice, fp, 8, pal);
    _exhaustStacks(x, z, afterCornice, fp * 0.60, 6, pal);
    _satelliteDish(x + mainW * 0.28, z - mainD * 0.20, afterCornice, fp * 0.058, pal);

    return { topY: afterCornice + roofH, faceR: mainD * 0.5 };
  }

  // ── AEGIS (PIKADON) — dark fortress keep + curtain wall + 4 corner towers ─
  // faceR = cw / 2 = fp * 0.38 (outer curtain wall half-extent)
  function _buildAegis(x, z, baseY, pal, fp, code) {
    const wallMat = new THREE.MeshStandardMaterial({
      color: pal.body.clone().lerp(pal.primary, 0.06),
      emissive: pal.primary.clone(), emissiveIntensity: 0.024,
      roughness: 0.86, metalness: 0.05,
    });
    regFacade(code, wallMat);

    // Outer curtain wall
    const cw = fp * 0.76, ch = 20, ct = fp * 0.060;
    const bw = new THREE.Mesh(new THREE.BoxGeometry(cw, ch, ct), wallMat);
    bw.position.set(x, baseY + ch * 0.5, z - cw * 0.5 + ct * 0.5);
    bw.castShadow = true; bw.receiveShadow = true; scene.add(bw);
    for (const s of [-1, 1]) {
      const sw = new THREE.Mesh(new THREE.BoxGeometry(ct, ch, cw), wallMat);
      sw.position.set(x + s * (cw * 0.5 - ct * 0.5), baseY + ch * 0.5, z);
      sw.castShadow = true; sw.receiveShadow = true; scene.add(sw);
    }
    // Battlements on curtain wall
    _battlements(x, z, baseY + ch, cw * 0.44, 14, 2.8, 4.0, 2.2, pal);
    _band(x, z, baseY + ch, cw * 0.44, cw * 0.009, pal);

    // Central keep
    const keepW = fp * 0.48, keepH = 50;
    _box(x, z, baseY, keepW, keepH, keepW, wallMat);
    _beltCourses(x, z, baseY, baseY + keepH, keepW * 0.50, keepW * 0.007, 10, pal);
    _greeblePanels(x, z, baseY + ch, baseY + keepH, keepW * 0.50, 4, 4, 3, fp * 0.040, fp * 0.044, pal);

    // Cornice + keep battlements
    const cornMat = new THREE.MeshStandardMaterial({
      color: pal.secondary.clone().lerp(pal.structural, 0.32),
      emissive: pal.trim.clone(), emissiveIntensity: 0.08,
      roughness: 0.70, metalness: 0.10,
    });
    _box(x, z, baseY + keepH, keepW + 3.0, 2.8, keepW + 3.0, cornMat);
    _battlements(x, z, baseY + keepH + 2.8, keepW * 0.44, 12, 2.8, 4.2, 2.4, pal);

    // 4 corner towers
    const cR    = fp * 0.082, cH = 60;
    const cMat  = new THREE.MeshStandardMaterial({
      color: pal.body.clone().lerp(pal.primary, 0.10),
      emissive: pal.primary.clone(), emissiveIntensity: 0.05,
      roughness: 0.76, metalness: 0.08,
    });
    const capMat = new THREE.MeshStandardMaterial({
      color: pal.trim.clone().lerp(pal.structural, 0.30),
      emissive: pal.primary.clone(), emissiveIntensity: 0.14,
      roughness: 0.52, metalness: 0.18,
    });
    // 4 corner towers + cone caps — 2 InstancedMesh (2 draw calls vs 8)
    const towerIM = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(cR, cR * 1.06, cH, 10), cMat, 4);
    const towerCapIM = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0, cR * 1.08, cH * 0.18, 10), capMat, 4);
    towerIM.castShadow = true; towerCapIM.castShadow = true;
    {
      const d = new THREE.Object3D();
      for (let i = 0; i < 4; i++) {
        const a  = (i / 4) * Math.PI * 2 + Math.PI / 4;
        const tx = x + Math.cos(a) * (cw * 0.40);
        const tz = z + Math.sin(a) * (cw * 0.40);
        d.position.set(tx, baseY + cH * 0.5, tz); d.updateMatrix();
        towerIM.setMatrixAt(i, d.matrix);
        d.position.set(tx, baseY + cH + cH * 0.09, tz); d.updateMatrix();
        towerCapIM.setMatrixAt(i, d.matrix);
      }
      towerIM.instanceMatrix.needsUpdate = true; scene.add(towerIM);
      towerCapIM.instanceMatrix.needsUpdate = true; scene.add(towerCapIM);
    }

    // ── Rooftop: radar dish + weapons-style vent boxes + antenna cluster ─────
    _satelliteDish(x, z, baseY + keepH + 2.8, fp * 0.065, pal);
    _ventBoxes(x, z, baseY + keepH + 2.8, fp * 0.55, 6, pal);
    _antennaCluster(x, z, baseY + keepH + 7, fp, 8, pal);
    // Guard-post exhaust on each corner tower top
    _exhaustStacks(x, z, baseY + cH, fp * 0.65, 4, pal);

    return { topY: baseY + cH + cH * 0.18, faceR: cw * 0.5 };
  }

  // ── MUSEUM (TURTLE) — dark gallery + drum + glass dome + curtain fins ─────
  // faceR = mainD / 2 = fp * 0.25
  function _buildMuseum(x, z, baseY, pal, fp, code) {
    const faceMat = new THREE.MeshStandardMaterial({
      color: pal.body.clone(),
      emissive: pal.primary.clone(), emissiveIntensity: 0.032,
      roughness: 0.64, metalness: 0.18,
    });
    regFacade(code, faceMat);

    const mainW = fp * 0.86, mainD = fp * 0.50, mainH = 30;
    _box(x, z, baseY, mainW, mainH, mainD, faceMat);
    _beltCourses(x, z, baseY, baseY + mainH, mainW * 0.44, mainW * 0.006, 6, pal);
    _greeblePanels(x, z, baseY, baseY + mainH, mainD * 0.51, 2, 5, 5, fp * 0.036, fp * 0.042, pal);

    // Parapet cornice
    const cornMat = new THREE.MeshStandardMaterial({
      color: pal.secondary.clone().lerp(pal.structural, 0.26),
      emissive: pal.trim.clone(), emissiveIntensity: 0.08,
      roughness: 0.62, metalness: 0.14,
    });
    _box(x, z, baseY + mainH, mainW + 2.0, 2.6, mainD + 2.0, cornMat);

    // Central drum + dome
    const dRum = fp * 0.18, dRumH = 13;
    const dMat = new THREE.MeshStandardMaterial({
      color: pal.secondary.clone().lerp(pal.structural, 0.22),
      emissive: pal.primary.clone(), emissiveIntensity: 0.050,
      roughness: 0.58, metalness: 0.20,
    });
    _cyl(x, z, baseY + mainH + 2.6, dRum, dRum * 1.04, dRumH, dMat, 20);
    const domeBase = baseY + mainH + 2.6 + dRumH;
    const domeR    = dRum * 1.20;
    const glassMat = new THREE.MeshStandardMaterial({
      color: pal.secondary.clone().lerp(pal.trim, 0.40),
      emissive: pal.trim.clone(), emissiveIntensity: 0.11,
      roughness: 0.38, metalness: 0.26,
      transparent: true, opacity: 0.84,
    });
    const domeTop = _dome(x, z, domeBase, domeR, glassMat, 24);
    _band(x, z, domeBase, domeR * 1.08, domeR * 0.025, pal);

    // Side wings
    const wingW = fp * 0.20, wingD = fp * 0.34, wingH = 18;
    for (const s of [-1, 1]) {
      _box(x + s * (mainW * 0.5 + wingW * 0.5 - 0.8), z, baseY, wingW, wingH, wingD, faceMat);
    }

    // Vertical glass curtain-wall fins on facade (InstancedMesh)
    const panIM = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(fp * 0.024, mainH * 0.68),
      new THREE.MeshBasicMaterial({
        color: pal.trim.clone().lerp(new THREE.Color(0xffffff), 0.25),
        transparent: true, opacity: 0.18,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }),
      8
    );
    panIM.renderOrder = 3;
    const pd = new THREE.Object3D();
    for (let i = 0; i < 8; i++) {
      pd.position.set(x + (i - 3.5) * (mainW / 9), baseY + mainH * 0.50, z + mainD * 0.502);
      pd.rotation.set(0, 0, 0); pd.updateMatrix();
      panIM.setMatrixAt(i, pd.matrix);
    }
    panIM.instanceMatrix.needsUpdate = true; scene.add(panIM);

    // ── Rooftop: AC vent boxes + pinnacles on gallery wings + exhaust ────────
    _ventBoxes(x, z, baseY + mainH + 2.6, fp * 0.60, 6, pal);
    _rooftopPinnacles(x, z, baseY + mainH + 2.6, fp * 0.70, 6, pal);
    _exhaustStacks(x, z, baseY + mainH + 2.6, fp * 0.48, 4, pal);

    return { topY: domeTop, faceR: mainD * 0.5 };
  }

  // ── ZEROX MARKETS — dark art-deco 4-tier setback tower + needle ──────────
  // FLOATING FIX: faceR = tiers[0].w / 2 = fp * 0.35 (was fp * 0.46 — 10-unit overshoot).
  // Visual: thinner ledges (less "grid"), deep graphite body, amber accent seams,
  // diagonal buttress fins rising full first-tier height, pronounced crown needle.
  function _buildMarketsExchange(x, z, baseY, pal, fp, code) {
    const bodyMat = new THREE.MeshStandardMaterial({
      color: pal.body.clone().lerp(pal.primary, 0.10),
      emissive: pal.primary.clone(), emissiveIntensity: 0.030,
      roughness: 0.60, metalness: 0.24,
    });
    regFacade(code, bodyMat);

    const tiers = [
      { w: fp * 0.70, h: 20 },
      { w: fp * 0.50, h: 18 },
      { w: fp * 0.34, h: 16 },
      { w: fp * 0.20, h: 14 },
    ];
    // Thinner setback ledges (1.4 instead of 3.2) — less "grid", more refined
    const ledgeMat = new THREE.MeshStandardMaterial({
      color: pal.secondary.clone().lerp(pal.structural, 0.26),
      emissive: pal.trim.clone(), emissiveIntensity: 0.10,
      roughness: 0.52, metalness: 0.24,
    });
    let y = baseY;
    for (const t of tiers) {
      _box(x, z, y, t.w, t.h, t.w, bodyMat);
      // Belt courses within each tier
      _beltCourses(x, z, y, y + t.h, t.w * 0.50, t.w * 0.008, Math.max(2, Math.floor(t.h / 6)), pal);
      // Thin ledge at tier top — only 1.4 units protrusion each side
      _box(x, z, y + t.h, t.w + 2.8, 1.6, t.w + 2.8, ledgeMat);
      _band(x, z, y + t.h, t.w * 0.50, t.w * 0.009, pal);
      y += t.h + 1.6;
    }

    // Greeble panels on the first (largest) tier faces
    _greeblePanels(x, z, baseY, baseY + tiers[0].h, tiers[0].w * 0.50, 4, 4, 3, fp * 0.040, fp * 0.048, pal);

    // Art-deco vertical buttress fins on tier 0 (full height)
    _fins(x, z, baseY, baseY + tiers[0].h, tiers[0].w * 0.50, 8, fp * 0.013, fp * 0.048, pal);

    // Crown needle — tall, tapering, emissive
    const needleH  = 20;
    const needleMat = new THREE.MeshStandardMaterial({
      color: pal.trim.clone(), emissive: pal.primary.clone(), emissiveIntensity: 0.26,
      roughness: 0.36, metalness: 0.44,
    });
    const needle = new THREE.Mesh(
      new THREE.CylinderGeometry(fp * 0.005, fp * 0.020, needleH, 6), needleMat);
    needle.position.set(x, y + needleH * 0.5, z);
    needle.castShadow = true; scene.add(needle);
    y += needleH;

    // Crown orb at needle tip
    const crownOrb = new THREE.Mesh(
      new THREE.SphereGeometry(fp * 0.022, 10, 8),
      new THREE.MeshStandardMaterial({
        color: pal.trim.clone(), emissive: pal.primary.clone(), emissiveIntensity: 0.32,
        roughness: 0.30, metalness: 0.40,
      })
    );
    crownOrb.position.set(x, y, z); scene.add(crownOrb);
    y += fp * 0.022;

    // ── Rooftop: broadcast antenna cluster + art-deco floodlights ───────────
    _antennaCluster(x, z, y, fp, 10, pal);
    _exhaustStacks(x, z, y - needleH * 0.15, fp * 0.35, 4, pal);
    _ventBoxes(x + tiers[2].w * 0.25, z, y - needleH - 2.0, fp * 0.30, 4, pal);

    return { topY: y, faceR: tiers[0].w * 0.5 };  // faceR = fp * 0.35 — FIXED
  }

  // ── ORACLE SPIRE — dark circular tower + observatory saucer + orbit rings ─
  // faceR = mainR = fp * 0.25
  function _buildOracleSpire(x, z, baseY, pal, fp, code) {
    const bodyMat = new THREE.MeshStandardMaterial({
      color: pal.body.clone(),
      emissive: pal.primary.clone(), emissiveIntensity: 0.042,
      roughness: 0.56, metalness: 0.20,
    });
    regFacade(code, bodyMat);

    const mainR = fp * 0.25, mainH = 56;
    _cyl(x, z, baseY, mainR, mainR * 1.04, mainH, bodyMat, 18);
    _beltCourses(x, z, baseY, baseY + mainH, mainR * 1.06, mainR * 0.016, 7, pal);
    _greeblePanels(x, z, baseY, baseY + mainH, mainR * 1.04, 5, 4, 3, fp * 0.034, fp * 0.038, pal);

    // Observatory saucer (wider than tower — overhangs like a flying disc)
    const obsR = fp * 0.38, obsH = 12;
    const obsMat = new THREE.MeshStandardMaterial({
      color: pal.secondary.clone().lerp(pal.structural, 0.24),
      emissive: pal.trim.clone(), emissiveIntensity: 0.08,
      roughness: 0.50, metalness: 0.24,
    });
    _cyl(x, z, baseY + mainH, obsR, obsR * 1.02, obsH, obsMat, 24);
    _band(x, z, baseY + mainH + obsH, obsR * 1.04, obsR * 0.022, pal);
    // Underside trim ring of saucer
    _band(x, z, baseY + mainH, obsR * 1.02, obsR * 0.020, pal);

    // 2 tilted orbit rings
    for (let i = 0; i < 2; i++) {
      const rR  = fp * (0.32 + i * 0.055);
      const rng = new THREE.Mesh(
        new THREE.TorusGeometry(rR, rR * 0.015, 8, 72),
        new THREE.MeshBasicMaterial({
          color: pal.trim.clone().lerp(new THREE.Color(0xffffff), 0.36),
          transparent: true, opacity: 0.58,
          blending: THREE.AdditiveBlending, depthWrite: false,
        })
      );
      rng.position.set(x, baseY + mainH + obsH * 0.5 + i * 2.8, z);
      rng.rotation.x = (Math.PI / 2) * 0.28 * (i % 2 === 0 ? 1 : -1);
      rng.rotation.z = (Math.PI / 6) * i;
      rng.renderOrder = 4; scene.add(rng);
    }

    // Dome on saucer
    const domeBase = baseY + mainH + obsH;
    const domeR    = obsR * 0.76;
    const domeMat  = new THREE.MeshStandardMaterial({
      color: pal.secondary.clone().lerp(pal.trim, 0.30),
      emissive: pal.trim.clone(), emissiveIntensity: 0.14,
      roughness: 0.40, metalness: 0.28,
    });
    const domeTop = _dome(x, z, domeBase, domeR, domeMat, 22);

    // Antenna cluster (3 rods)
    const antMat = new THREE.MeshStandardMaterial({
      color: pal.trim.clone(), emissive: pal.primary.clone(), emissiveIntensity: 0.22,
      roughness: 0.34, metalness: 0.48,
    });
    const offsets = [0, fp * 0.026, -fp * 0.026];
    const heights = [14, 9, 10];
    for (let i = 0; i < 3; i++) {
      const aH  = heights[i];
      const ant = new THREE.Mesh(
        new THREE.CylinderGeometry(fp * 0.004, fp * 0.009, aH, 5), antMat);
      ant.position.set(x + offsets[i], domeTop + aH * 0.5, z);
      scene.add(ant);
    }

    // ── Rooftop: dense sensor array + weather instruments + extra dishes ─────
    _antennaCluster(x, z, domeTop, fp, 14, pal);
    _satelliteDish(x - obsR * 0.55, z + obsR * 0.30, domeBase, fp * 0.065, pal);
    _satelliteDish(x + obsR * 0.45, z - obsR * 0.50, domeBase, fp * 0.048, pal);
    _ventBoxes(x, z, domeBase, fp * 0.55, 5, pal);

    return { topY: domeTop + 14, faceR: mainR };
  }

  // ── BAZAAR — dark multi-domed souk + colonnade arcade + 4 corner domes ────
  // faceR = baseW / 2 = fp * 0.43
  function _buildBazaar(x, z, baseY, pal, fp, code) {
    const bodyMat = new THREE.MeshStandardMaterial({
      color: pal.body.clone().lerp(pal.primary, 0.12),
      emissive: pal.primary.clone(), emissiveIntensity: 0.022,
      roughness: 0.74, metalness: 0.07,
    });
    regFacade(code, bodyMat);

    const baseW = fp * 0.86, baseH = 12;
    _box(x, z, baseY, baseW, baseH, baseW, bodyMat);
    _band(x, z, baseY + baseH, baseW * 0.48, baseW * 0.011, pal);
    _greeblePanels(x, z, baseY, baseY + baseH, baseW * 0.44, 4, 2, 4, fp * 0.042, fp * 0.042, pal);

    // Central drum + large dome
    const cDrumR = fp * 0.25, cDrumH = 11;
    const drumMat = new THREE.MeshStandardMaterial({
      color: pal.secondary.clone().lerp(pal.structural, 0.28),
      emissive: pal.primary.clone(), emissiveIntensity: 0.042,
      roughness: 0.62, metalness: 0.14,
    });
    _cyl(x, z, baseY + baseH, cDrumR, cDrumR * 1.04, cDrumH, drumMat, 18);
    const cDomeBase = baseY + baseH + cDrumH;
    const cDomeR    = cDrumR * 1.14;
    const cDomeMat  = new THREE.MeshStandardMaterial({
      color: pal.secondary.clone().lerp(pal.trim, 0.24),
      emissive: pal.trim.clone(), emissiveIntensity: 0.10,
      roughness: 0.46, metalness: 0.20,
    });
    const cDomeTop = _dome(x, z, cDomeBase, cDomeR, cDomeMat, 22);
    _band(x, z, cDomeBase, cDomeR * 1.06, cDomeR * 0.024, pal);

    // 4 corner smaller domes
    const sDomeR  = fp * 0.086, sDrumH = 7;
    const sDomeMat = new THREE.MeshStandardMaterial({
      color: pal.secondary.clone().lerp(pal.structural, 0.30),
      emissive: pal.primary.clone(), emissiveIntensity: 0.055,
      roughness: 0.54, metalness: 0.16,
    });
    // 4 corner domes: drum + dome + accent band → 3 InstancedMesh (3 draw calls vs 12).
    // Geometry/material/positions match the prior _cyl/_dome/_band calls exactly.
    const sOff = fp * 0.27;
    const cornDrumIM = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(sDomeR, sDomeR * 1.03, sDrumH, 12), drumMat, 4);
    const cornDomeIM = new THREE.InstancedMesh(
      new THREE.SphereGeometry(sDomeR * 1.10, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2), sDomeMat, 4);
    const cornBandMat = new THREE.MeshBasicMaterial({   // one shared band material (was 4)
      color: pal.trim.clone().lerp(new THREE.Color(0xffffff), 0.18),
      transparent: true, opacity: 0.52,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const cornBandIM = new THREE.InstancedMesh(
      new THREE.TorusGeometry(sDomeR * 1.12, sDomeR * 0.028, 8, 64), cornBandMat, 4);
    cornDrumIM.castShadow = true; cornDomeIM.castShadow = true;
    cornBandIM.renderOrder = 3;
    {
      const d = new THREE.Object3D();
      for (let i = 0; i < 4; i++) {
        const a  = (i / 4) * Math.PI * 2 + Math.PI / 4;
        const sx = x + Math.cos(a) * sOff;
        const sz = z + Math.sin(a) * sOff;
        d.rotation.set(0, 0, 0);
        d.position.set(sx, baseY + baseH + sDrumH * 0.5, sz); d.updateMatrix();
        cornDrumIM.setMatrixAt(i, d.matrix);
        d.position.set(sx, baseY + baseH + sDrumH, sz); d.updateMatrix();
        cornDomeIM.setMatrixAt(i, d.matrix);
        d.rotation.set(-Math.PI / 2, 0, 0);
        d.position.set(sx, baseY + baseH + sDrumH, sz); d.updateMatrix();
        cornBandIM.setMatrixAt(i, d.matrix);
      }
      cornDrumIM.instanceMatrix.needsUpdate = true; scene.add(cornDrumIM);
      cornDomeIM.instanceMatrix.needsUpdate = true; scene.add(cornDomeIM);
      cornBandIM.instanceMatrix.needsUpdate = true; scene.add(cornBandIM);
    }

    // Perimeter colonnade arcade (InstancedMesh)
    const arcCount = 16, arcR = baseW * 0.45, arcH = baseH * 0.78;
    const colIM = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(fp * 0.016, fp * 0.020, arcH, 8),
      new THREE.MeshStandardMaterial({
        color: pal.structural.clone().lerp(new THREE.Color(0xc8c0b0), 0.22),
        emissive: pal.secondary.clone(), emissiveIntensity: 0.035,
        roughness: 0.82, metalness: 0.04,
      }),
      arcCount
    );
    const cd = new THREE.Object3D();
    for (let i = 0; i < arcCount; i++) {
      const a = (i / arcCount) * Math.PI * 2;
      cd.position.set(x + Math.cos(a) * arcR, baseY + arcH * 0.5, z + Math.sin(a) * arcR);
      cd.rotation.set(0, 0, 0); cd.updateMatrix();
      colIM.setMatrixAt(i, cd.matrix);
    }
    colIM.instanceMatrix.needsUpdate = true;
    colIM.castShadow = true; scene.add(colIM);

    // ── Rooftop: wind catchers (tall exhaust stacks) + bazaar vents ──────────
    _exhaustStacks(x, z, cDomeTop, fp * 0.60, 6, pal);
    _ventBoxes(x, z, baseY + baseH, fp * 0.65, 8, pal);
    // Minarets as tall antenna clusters
    _antennaCluster(x, z, cDomeTop, fp, 8, pal);

    return { topY: cDomeTop, faceR: baseW * 0.5 };
  }

  // Generic fallback
  function _buildGenericTower(x, z, baseY, pal, fp, code) {
    const H   = 48;
    const mat = new THREE.MeshStandardMaterial({
      color: pal.body.clone(), emissive: pal.primary.clone(),
      emissiveIntensity: 0.05, roughness: 0.70, metalness: 0.10,
    });
    regFacade(code, mat);
    _box(x, z, baseY, fp * 0.52, H, fp * 0.52, mat);
    return { topY: baseY + H, faceR: fp * 0.26 };
  }

  // ── PBR FACADE TEXTURE LOADER ─────────────────────────────────────────────
  // Runs once after all buildings are placed. Loads Poly Haven CC0 1k JPG sets
  // and applies map + normalMap + roughnessMap to each building's registered
  // facade materials. Async-safe: geometry/fallback vertex colors remain visible
  // while textures stream in.  Falls back silently if any file is missing (404).
  //
  // Texture mapping:
  //   source-spire     → brushed_concrete   (temple stone, worn brushed surface)
  //   nexus-hub        → metal_plate        (sleek dark steel cylinder)
  //   library          → concrete_block_wall(heavy masonry hall)
  //   aegis            → factory_wall       (industrial brutalist fortress)
  //   museum           → concrete_layers_02 (layered architectural concrete)
  //   markets-exchange → metal_plate        (art-deco dark metal tower)
  //   oracle-spire     → concrete_layers_02 (observatory column)
  //   bazaar           → brushed_concrete   (souk-style worn stone base)
  //
  // repeat values (U,V) tuned so tile seams read as architectural joints, not
  // repeating wallpaper.  Buildings are 30-80 units tall, 20-90 units wide:
  //   2×3 → one tile every ~25 units = large panel / slab block feel
  //   3×5 → one tile every ~12 units = metal panel / factory brick
  //   4×6 → one tile every  ~8 units = dense masonry / greeble
  function _initFacadeTextures() {
    const tl   = loader || new THREE.TextureLoader();
    const base = 'assets/textures/facades/';

    // Per-set texture objects (loaded once, cloned per material for repeat isolation)
    const setCache = {};
    function getSet(name) {
      if (setCache[name]) return setCache[name];
      function lt(suffix, colorSpace) {
        try {
          const t = tl.load(
            base + name + '/' + suffix + '.jpg',
            undefined, undefined,
            function() { /* silently ignore 404 — fallback color stays */ }
          );
          t.wrapS = t.wrapT = THREE.RepeatWrapping;
          if (colorSpace) t.colorSpace = colorSpace;
          return t;
        } catch (e) { return null; }
      }
      setCache[name] = {
        albedo: lt('albedo', THREE.SRGBColorSpace),
        normal: lt('normal'),
        rough:  lt('rough'),
      };
      return setCache[name];
    }

    // Texture assignment per building code
    const CFG = {
      'source-spire':     { set: 'brushed_concrete',   ru: 2, rv: 3 },
      'nexus-hub':        { set: 'metal_plate',         ru: 3, rv: 5 },
      'library':          { set: 'concrete_block_wall', ru: 3, rv: 4 },
      'aegis':            { set: 'factory_wall',        ru: 4, rv: 5 },
      'museum':           { set: 'concrete_layers_02',  ru: 3, rv: 3 },
      'markets-exchange': { set: 'metal_plate',         ru: 4, rv: 6 },
      'oracle-spire':     { set: 'concrete_layers_02',  ru: 2, rv: 5 },
      'bazaar':           { set: 'brushed_concrete',    ru: 3, rv: 2 },
    };

    for (var code in CFG) {
      var mats = facadeRegistry[code];
      if (!mats || !mats.length) continue;
      var cfg = CFG[code];
      var s   = getSet(cfg.set);
      (function(mats, cfg, s) {
        mats.forEach(function(mat) {
          function applyTex(src, prop) {
            if (!src) return;
            var t = src.clone();
            t.repeat.set(cfg.ru, cfg.rv);
            t.needsUpdate = true;
            mat[prop] = t;
          }
          applyTex(s.albedo, 'map');
          applyTex(s.normal, 'normalMap');
          applyTex(s.rough,  'roughnessMap');
          // When an albedo map is present, lift the base color from near-black so
          // the texture isn't crushed dark by THREE's color × map multiplication.
          if (s.albedo) mat.color.lerp(new THREE.Color(0x999999), 0.60);
          // normalScale 1.80 → texture relief pops under directional light,
          // making panel seams, brick joints, and plate edges visually read as real depth.
          if (s.normal) mat.normalScale = new THREE.Vector2(1.80, 1.80);
          mat.needsUpdate = true;
        });
      })(mats, cfg, s);
    }
  }

  // ── PROCEDURAL BUILDING PLACER ────────────────────────────────────────────
  function buildProceduralBuilding(buildingCode, fp, x, z, color, displayName) {
    const baseY = gy(x, z);
    const pal   = buildPalette(color);

    const dx  = -x, dz = -z, len = Math.sqrt(dx * dx + dz * dz);
    const frontDir = (len < 0.1) ? { x: 0, z: -1 } : { x: dx / len, z: dz / len };

    const BUILDERS = {
      'source-spire':     _buildShaddaiTemple,
      'nexus-hub':        _buildNexusHub,
      'library':          _buildLibrary,
      'aegis':            _buildAegis,
      'museum':           _buildMuseum,
      'markets-exchange': _buildMarketsExchange,
      'oracle-spire':     _buildOracleSpire,
      'bazaar':           _buildBazaar,
    };
    const builder       = BUILDERS[buildingCode] || _buildGenericTower;
    // frontDir passed through so builders can align entrances/colonnades to world-centre.
    const { topY, faceR } = builder(x, z, baseY, pal, fp, buildingCode, frontDir);

    // Door recess uses the actual face radius — no more floating slot
    _doorRecess(x, z, baseY, pal, fp, frontDir, faceR);

    // Full decoration suite: apron, columns+arch, plaque, ribs, recessed windows, mullions, conduits
    decorate(x, z, color, displayName, fp, topY, frontDir, faceR, buildingCode);
  }

  // ── SECTOR BUILDINGS ──────────────────────────────────────────────────────
  const S = {
    SHADDAI: sec('SHADDAI'), NEXUS:  sec('NEXUS'),  ZEROX:   sec('ZEROX'),
    QUILL:   sec('QUILL'),   ORACLE: sec('ORACLE'), PIKADON: sec('PIKADON'),
    TURTLE:  sec('TURTLE'),
  };

  buildProceduralBuilding('source-spire',     168, S.SHADDAI.pos[0], S.SHADDAI.pos[1], 0xffcf4a, 'SHADDAI TEMPLE');
  buildProceduralBuilding('nexus-hub',         140, S.NEXUS.pos[0],   S.NEXUS.pos[1],   0x34e5b0, 'NEXUS HUB');
  buildProceduralBuilding('library',           172, S.QUILL.pos[0],   S.QUILL.pos[1],   0xb98cff, 'LIBRARY');
  buildProceduralBuilding('aegis',             145, S.PIKADON.pos[0], S.PIKADON.pos[1], 0xff5a6e, 'THE AEGIS');
  buildProceduralBuilding('museum',            140, S.TURTLE.pos[0],  S.TURTLE.pos[1],  0x1fd6c4, 'THE MUSEUM');
  buildProceduralBuilding('markets-exchange',  145, S.ZEROX.pos[0],   S.ZEROX.pos[1],   0xff7a18, 'ZEROX MARKETS');
  buildProceduralBuilding('oracle-spire',      138, S.ORACLE.pos[0],  S.ORACLE.pos[1],  0xc084fc, 'ORACLE');

  // Bazaar
  const bazaarLM = lmk('bazaar');
  if (bazaarLM) {
    buildProceduralBuilding(
      bazaarLM.building || 'bazaar',
      bazaarLM.footprint || 82,
      bazaarLM.pos[0], bazaarLM.pos[1],
      bazaarLM.color   || 0x00e5a0,
      'BAZAAR'
    );
  } else {
    buildProceduralBuilding('bazaar', 82, 0, 130, 0x00e5a0, 'BAZAAR');
  }

  for (const c of Object.keys(S)) markers.push({ code: c, x: S[c].pos[0], z: S[c].pos[1] });

  // Apply PBR textures to all registered facade materials (async, lazy)
  _initFacadeTextures();

  // ── FRUSTUM-CULLING FIX (one-time, at build) ───────────────────────────────
  // Every InstancedMesh here bakes WORLD coordinates into its instance matrices
  // while the mesh object itself stays at the origin. Without an explicit bounding
  // sphere, Three.js frustum-tests against the base geometry's origin-centred
  // sphere, so instanced detail on buildings far from world-centre could pop out
  // when the camera looks away from [0,0], and distant off-screen buildings would
  // never be culled. computeBoundingSphere() rebuilds each sphere from the instance
  // matrices → correct, cheap per-frame culling. No visual change to on-screen
  // geometry; frustumCulled is left at its default (never forced off).
  scene.traverse(function (o) {
    if (o.isInstancedMesh && o.boundingSphere === null) o.computeBoundingSphere();
  });

  return {
    markers,

    // applyFacadeTexture — public hook (kept for external callers).
    // Accepts either a single THREE.Texture (legacy: sets map only) or an object
    // { map, normalMap, roughnessMap } for full PBR override per building code.
    applyFacadeTexture(code, texOrObj) {
      const mats = facadeRegistry[code] || [];
      mats.forEach(m => {
        if (texOrObj && typeof texOrObj === 'object' && !(texOrObj instanceof THREE.Texture)) {
          if (texOrObj.map)          { m.map = texOrObj.map; }
          if (texOrObj.normalMap)    { m.normalMap = texOrObj.normalMap; }
          if (texOrObj.roughnessMap) { m.roughnessMap = texOrObj.roughnessMap; }
        } else {
          m.map = texOrObj;
        }
        m.needsUpdate = true;
      });
    },

    update(t) {
      for (const s  of spinners)  s.o.rotation.y = t * s.ry;
      for (const lm of landmarks) lm.mat.opacity = lm.baseOpacity * (0.72 + 0.28 * Math.sin(t * 1.6 + lm.phase));
      for (const tr of trimRings) tr.ring.material.opacity = tr.baseOpacity * (0.75 + 0.25 * Math.sin(t * 1.8 + tr.phase));
    },
  };
};
