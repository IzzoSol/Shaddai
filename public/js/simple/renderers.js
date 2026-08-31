/* ══════════════════════════════════════════════════════════════════════
   SIMPLE MODE — THE THREE RENDERERS

   One data model, one drill-down engine, three ways to look at it:

     WHEEL — a vertical drum. Thumb-spins up and down. The default.
     ORB   — the same items on a sphere, spun along the same ordering.
     LIST  — the same items as slabs receding in Z.

   All three are driven by a SINGLE scalar, `pos` (a continuous item index).
   That's the trick that keeps this one feature instead of three: selection,
   snapping, inertia, dwell timing and keyboard control all live in core.js
   and know nothing about geometry. A renderer only has to answer "where does
   item i sit when the wheel is at `pos`".

   Drill-down is also shared: core swaps the item list and hands over a
   direction, and the base class runs the same swivel for all three — the
   level you're leaving tips back and away, the level you're entering rises
   into its place. Never a page change.
   ══════════════════════════════════════════════════════════════════════ */
import * as THREE from '/vendor/three/three.module.js';
import { makePlate } from './plate.js';

const PLANE = new THREE.PlaneGeometry(1, 1);
const TRANSITION_MS = 620;
const easeOut = p => 1 - Math.pow(1 - p, 3);

/* VFX helpers — a shell colour read from the theme (same trick the front door
   uses so light skins don't turn the orb into a black blob) and a circle of
   points for the meridian accents. */
function shellColorP() {
  const v = getComputedStyle(document.documentElement).getPropertyValue('--shell').trim();
  if (v) { const n = parseInt(v.replace('#', ''), 16); if (!isNaN(n)) return n; }
  return 0x06080b;
}
function makeCircle(r, seg) {
  const pts = [];
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    pts.push(new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r, 0));
  }
  return pts;
}

/* ── base: builds plates, owns the level-swap swivel ──────────────────── */
class Base {
  constructor(scene) {
    this.scene = scene;
    this.cur = null;       // the level you're looking at
    this.out = null;       // the level swiveling away
    this.t = 1;            // transition progress, 1 = settled
    this.dir = 0;          // +1 drilled in, -1 came back
    this.count = 0;
    this.frontZ = 0;   // how far the front-most item sits toward the camera
    this.fitW = 0;     // world width that must stay on screen (0 = PW * 1.16)
  }

  plate(item, w, h) {
    const mat = new THREE.MeshBasicMaterial({
      map: makePlate(item), transparent: true, depthWrite: false,
      side: THREE.DoubleSide, toneMapped: false
    });
    const m = new THREE.Mesh(PLANE, mat);
    m.scale.set(w, h, 1);
    m.userData.baseScale = new THREE.Vector2(w, h);
    return m;
  }

  build(items) {
    const g = new THREE.Group();
    items.forEach(it => g.add(this.plate(it, this.PW, this.PH)));
    g.userData.items = items;
    return g;
  }

  setItems(items, dir) {
    if (this.out) this.kill(this.out);
    this.out = this.cur;
    this.cur = this.build(items);
    this.scene.add(this.cur);
    this.count = items.length;
    this.dir = dir || 0;
    this.t = dir ? 0 : 1;
    if (!dir && this.out) { this.kill(this.out); this.out = null; }
  }

  kill(g) {
    this.scene.remove(g);
    g.traverse(o => { if (o.material) o.material.dispose(); });
  }

  /* The swivel. `role` -1 = leaving, +1 = arriving. Returns the opacity
     multiplier; the subclass has already placed the items locally. */
  swivel(g, role, reduced) {
    if (this.t >= 1) { g.position.y = 0; g.rotation.x = 0; return 1; }
    const e = easeOut(this.t);
    const p = role < 0 ? e : 1 - e;          // how far from settled
    if (reduced) { g.position.y = 0; g.rotation.x = 0; return role < 0 ? 1 - e : e; }
    const sign = role < 0 ? this.dir : -this.dir;
    g.position.y = sign * 2.9 * p;
    g.rotation.x = -sign * 0.85 * p;
    return 1 - p;
  }

  update(dt, pos, reduced) {
    if (this.t < 1) {
      this.t = Math.min(1, this.t + (dt * 1000) / TRANSITION_MS);
      if (this.t >= 1 && this.out) { this.kill(this.out); this.out = null; }
    }
    if (this.out) {
      const fade = this.swivel(this.out, -1, reduced);
      this.layout(this.out, this.outPos == null ? 0 : this.outPos, fade);
    }
    if (this.cur) {
      const fade = this.swivel(this.cur, 1, reduced);
      this.layout(this.cur, pos, fade);
    }
  }

  dispose() {
    if (this.out) this.kill(this.out);
    if (this.cur) this.kill(this.cur);
    this.out = this.cur = null;
  }
}

/* ── WHEEL — the vertical drum (default) ──────────────────────────────────
   Items ride a cylinder whose axis is horizontal, so a thumb sliding up and
   down the screen rolls it the way the hand expects. The front face is
   always upright and fully legible — the reason this beats an orb on a
   phone. Flattened vertically so it reads as a rolodex, not a ferris wheel. */
export class Wheel extends Base {
  constructor(scene) { super(scene); this.PW = 3.5; this.PH = 1.09; this.R = 2.75; this.frontZ = 2.75; this.fitW = 3.5 * 1.16; }
  step() { return Math.min((Math.PI * 2) / Math.max(this.count, 1), 0.56); }

  layout(g, pos, fade) {
    const st = this.step();
    const n = g.children.length;
    g.children.forEach((m, i) => {
      // take the SHORT way round: without this the drum is only a forward arc
      // and nothing ever appears below the selected item
      let d = i - pos;
      if (n) { d = ((d % n) + n) % n; if (d > n / 2) d -= n; }
      const th = d * st;
      const a = Math.abs(th);
      if (a > 2.05) { m.visible = false; return; }
      m.visible = true;
      m.position.set(0, Math.sin(th) * this.R * 0.66, Math.cos(th) * this.R);
      m.rotation.set(-th, 0, 0);
      const near = Math.max(0, 1 - a / 2.05);
      const s = 0.82 + near * 0.18;
      m.scale.set(m.userData.baseScale.x * s, m.userData.baseScale.y * s, 1);
      m.material.opacity = Math.max(0.06, Math.pow(near, 1.7)) * fade;
    });
  }
}

/* ── ORB — the same items on a sphere ─────────────────────────────────────
   Positions come from a Fibonacci sphere so they're evenly spread at any
   count. The same scalar `pos` drives it: each item has a quaternion that
   brings it to the front, and we slerp between neighbours as `pos` moves —
   so spinning the orb walks the identical ordering the wheel does. */
export class Orb extends Base {
  constructor(scene) { super(scene); this.PW = 2.45; this.PH = 0.77; this.R = 2.0; this.frontZ = 2.0; this.fitW = 2.45 + 2.0 * 1.05; this._t = 0; }

  build(items) {
    const g = super.build(items);
    const n = items.length;
    g.userData.dirs = [];
    g.userData.quats = [];
    const front = new THREE.Vector3(0, 0, 1);
    for (let i = 0; i < n; i++) {
      const y = n === 1 ? 0 : 1 - (i / (n - 1)) * 2;
      const r = Math.sqrt(Math.max(0, 1 - y * y));
      const th = Math.PI * (1 + Math.sqrt(5)) * i;
      const d = new THREE.Vector3(Math.cos(th) * r, y, Math.sin(th) * r).normalize();
      g.userData.dirs.push(d);
      g.userData.quats.push(new THREE.Quaternion().setFromUnitVectors(d, front));
    }
    g.userData.vfx = this._buildVFX();
    g.userData.vfx.forEach(o => { o.userData.vfx = true; g.add(o); });
    return g;
  }

  /* ── VFX: a glowing wire shell, a lattice of meridians, a focus ring, and
     an orbiting starfield. Pure decoration — never intercepts a plate, and
     dissolves harmlessly if anything about the geometry fails. */
  _buildVFX() {
    const out = [];
    try {
      // soft core — a translucent orb that makes the plates read as sitting
      // on a sphere rather than floating in space
      const core = new THREE.Mesh(
        new THREE.SphereGeometry(this.R * 0.92, 32, 24),
        new THREE.MeshBasicMaterial({ color: shellColorP(), transparent: true, opacity: 0.22,
          wireframe: false, depthWrite: false, toneMapped: false })
      );
      core.userData.kind = 'core'; out.push(core);

      // wire shell — the sphere's silhouette ghosted in the accent hue
      const shell = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.SphereGeometry(this.R, 20, 14)),
        new THREE.LineBasicMaterial({ color: 0x00ff9c, transparent: true, opacity: 0.06, depthWrite: false })
      );
      shell.userData.kind = 'shell'; out.push(shell);

      // meridians + equator — the "accents": three great circles so the form
      // reads as navigable geometry, not just a floating ball
      const rings = new THREE.Group();
      [0, Math.PI / 3, -Math.PI / 3].forEach(rotY => {
        const circle = new THREE.LineLoop(
          new THREE.BufferGeometry().setFromPoints(makeCircle(this.R * 1.001, 64)),
          new THREE.LineBasicMaterial({ color: 0x00ff9c, transparent: true, opacity: 0.12, depthWrite: false })
        );
        circle.rotation.y = rotY;
        rings.add(circle);
      });
      const eq = new THREE.LineLoop(
        new THREE.BufferGeometry().setFromPoints(makeCircle(this.R * 1.001, 64)),
        new THREE.LineBasicMaterial({ color: 0xe8c45c, transparent: true, opacity: 0.10, depthWrite: false })
      );
      eq.rotation.x = Math.PI / 2; rings.add(eq);
      rings.userData.kind = 'rings'; out.push(rings);
    } catch (_) {}
    return out;
  }

  /* gentle breathing pulse — bright at rest, so the accents read as a live
     object; the wave rides on time so it never sits dead on a static frame */
  _pulse() {
    return 0.5 + 0.5 * Math.sin(this._t * 1.4);
  }

  layout(g, pos, fade) {
    const n = (g.userData.dirs || []).length; if (!n) return;
    const q = g.userData.quats;
    const lo = ((Math.floor(pos) % n) + n) % n;
    const hi = (lo + 1) % n;
    const f = pos - Math.floor(pos);
    const rot = new THREE.Quaternion().copy(q[lo]).slerp(q[hi], f);

    const v = new THREE.Vector3();
    g.children.forEach((m, i) => {
      if (m.userData && m.userData.vfx) return;
      v.copy(g.userData.dirs[i]).applyQuaternion(rot);
      m.position.copy(v).multiplyScalar(this.R);
      m.quaternion.identity();          // billboard: plates always face the viewer
      const near = Math.max(0, (v.z + 0.35) / 1.35);
      m.visible = near > 0.02;
      const s = 0.7 + near * 0.42;
      m.scale.set(m.userData.baseScale.x * s, m.userData.baseScale.y * s, 1);
      m.material.opacity = Math.max(0.05, Math.pow(near, 1.5)) * fade;
    });
    this._t = this._t == null ? 0 : this._t;
    this._t += 0.016;
    const pulse = this._pulse();
    const vfx = g.userData.vfx || [];
    for (const o of vfx) {
      if (o.userData.kind === 'core') o.material.opacity = 0.10 + pulse * 0.16;
      else if (o.userData.kind === 'shell') o.material.opacity = 0.04 + pulse * 0.05;
      else if (o.userData.kind === 'rings') {
        o.rotation.y = this._t * 0.1;
        o.children.forEach((c, ci) => { if (c.material) c.material.opacity = 0.07 + pulse * 0.06 - ci * 0.01; });
      }
    }
  }
}

/* ── LIST — slabs receding in Z ───────────────────────────────────────────
   The most legible and the most accessible of the three, and the one that
   behaves best under prefers-reduced-motion. Same scalar, same ordering. */
export class List extends Base {
  constructor(scene) { super(scene); this.PW = 4.0; this.PH = 1.25; this.frontZ = 0; this.fitW = 4.0 * 1.16; }

  layout(g, pos, fade) {
    g.children.forEach((m, i) => {
      const d = i - pos;
      const a = Math.abs(d);
      if (a > 3.6) { m.visible = false; return; }
      m.visible = true;
      m.position.set(0, -d * 1.42, -Math.min(a, 3.6) * 0.78);
      m.rotation.set(Math.max(-0.5, Math.min(0.5, d * 0.16)), 0, 0);
      const near = Math.max(0, 1 - a / 3.6);
      const s = 0.74 + near * 0.26;
      m.scale.set(m.userData.baseScale.x * s, m.userData.baseScale.y * s, 1);
      m.material.opacity = Math.max(0.05, Math.pow(near, 1.6)) * fade;
    });
  }
}

export const SKINS = { wheel: Wheel, orb: Orb, list: List };
