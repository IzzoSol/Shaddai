// ─────────────────────────────────────────────────────────────────────────────
// HEAD EXPLODE — take a loaded head apart into labelled compartments.
//
// The head is one mesh, so "compartments" are cut from it by height: cranium,
// optics, jaw, column. Each shell drifts out along its own axis, carrying a
// label and a payload — the knowledge, skills, tools and scripts that actually
// live in that region of the agent. Collapsing snaps them home.
//
// Nothing here fabricates data: a compartment shows whatever payload it is
// handed, and shows an empty state when it is handed nothing.
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

// Fractions measured from the model's own bounding box, top → bottom.
// Directions fan OUTWARD in a ring rather than sliding sideways, so opened
// shells sit around the head like satellites on tethers instead of drifting
// off one axis.
export const COMPARTMENTS = [
  { id: 'cranium', label: 'KNOWLEDGE', from: 0.74, to: 1.00, dir: [ 0.10,  1.00,  0.30], slot: 'knowledge' },
  { id: 'optics',  label: 'TOOLS',     from: 0.52, to: 0.74, dir: [-1.00,  0.34,  0.42], slot: 'tools'     },
  { id: 'jaw',     label: 'SKILLS',    from: 0.24, to: 0.52, dir: [ 1.00,  0.02,  0.42], slot: 'skills'    },
  { id: 'column',  label: 'SCRIPTS',   from: 0.00, to: 0.24, dir: [-0.10, -1.00,  0.30], slot: 'scripts'   },
];

/**
 * Split a loaded GLTF scene into compartment groups.
 * Returns [{ id, label, group, home:Vector3, dir:Vector3, slot }].
 *
 * Implementation note: rather than boolean-cutting geometry (expensive and
 * fragile on arbitrary meshes), each compartment gets a CLONE of the head
 * clipped by local clipping planes. The renderer must have localClippingEnabled.
 */
export function buildCompartments(THREE, source, renderer, tetherParent, tetherColor = 0x22f0ff) {
  renderer.localClippingEnabled = true;

  const box = new THREE.Box3().setFromObject(source);
  const min = box.min.y, max = box.max.y, span = Math.max(1e-6, max - min);

  return COMPARTMENTS.map((c) => {
    const group = new THREE.Group();
    const clone = source.clone(true);

    const lo = min + span * c.from;
    const hi = min + span * c.to;
    // Keep only the slab between lo and hi.
    const planes = [
      new THREE.Plane(new THREE.Vector3(0,  1, 0), -lo),
      new THREE.Plane(new THREE.Vector3(0, -1, 0),  hi),
    ];

    clone.traverse((n) => {
      if (!n.isMesh || !n.material) return;
      const mats = (Array.isArray(n.material) ? n.material : [n.material]).map((m) => {
        const cl = m.clone();
        cl.clippingPlanes = planes;
        cl.clipShadows = true;
        cl.side = THREE.DoubleSide;   // slab cuts expose interiors
        return cl;
      });
      n.material = Array.isArray(n.material) ? mats : mats[0];
    });

    group.add(clone);

    // Visible tether: each shell stays wired back to the head it came from.
    let tether = null;
    if (tetherParent) {
      const tg = new THREE.BufferGeometry();
      tg.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(6), 3));
      tether = new THREE.Line(tg, new THREE.LineBasicMaterial({
        color: tetherColor, transparent: true, opacity: 0.35,
      }));
      tether.visible = false;
      tether.frustumCulled = false;
      tetherParent.add(tether);
    }

    return {
      id: c.id,
      tether,
      label: c.label,
      slot: c.slot,
      group,
      planes,
      // Clipping planes live in WORLD space. If a shell translates while its
      // planes stay put, the shell slides through its own cut and shows a
      // different slice of the head — the cranium ends up rendering the neck.
      // Keep the untranslated constants so applyExplode can move planes with it.
      baseConst: [-lo, hi],
      home: new THREE.Vector3(0, 0, 0),
      dir: new THREE.Vector3(...c.dir).normalize(),
    };
  });
}

/**
 * Drive compartment positions. `t` is 0 (assembled) → 1 (fully apart).
 * Eased so the parts settle rather than sliding linearly.
 */
export function applyExplode(parts, t, distance = 1.05) {
  const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; // easeInOutQuad
  parts.forEach((p, i) => {
    const stagger = Math.max(0, Math.min(1, e * 1.25 - i * 0.06));
    p.group.position.copy(p.dir).multiplyScalar(stagger * distance);
    // open outward AND turn to face the viewer as they separate
    p.group.rotation.z = p.dir.x * stagger * 0.22;
    p.group.rotation.x = -p.dir.y * stagger * 0.16;
    if (p.tether) {
      const g = p.tether.geometry;
      const a = g.attributes.position;
      a.setXYZ(0, p.dir.x * 0.35, p.dir.y * 0.35, p.dir.z * 0.35);
      a.setXYZ(1, p.group.position.x, p.group.position.y, p.group.position.z);
      a.needsUpdate = true;
      p.tether.visible = stagger > 0.02;
      p.tether.material.opacity = 0.20 + stagger * 0.45;
    }
    // Carry the cut with the shell: both planes are horizontal (normal ±Y), so
    // only the Y component of the offset shifts them.
    if (p.planes && p.baseConst) {
      const dy = p.group.position.y;
      p.planes[0].constant = p.baseConst[0] - dy;   // normal (0, 1,0)
      p.planes[1].constant = p.baseConst[1] + dy;   // normal (0,-1,0)
    }
  });
  return e;
}

/**
 * Project each compartment to 2D so HTML labels can track it.
 * Returns [{ id, label, slot, x, y, visible }] in CSS pixels.
 */
export function projectLabels(THREE, parts, camera, width, height) {
  const v = new THREE.Vector3();
  return parts.map((p) => {
    p.group.getWorldPosition(v);
    v.project(camera);
    return {
      id: p.id,
      label: p.label,
      slot: p.slot,
      x: (v.x * 0.5 + 0.5) * width,
      y: (-v.y * 0.5 + 0.5) * height,
      visible: v.z < 1,
    };
  });
}
