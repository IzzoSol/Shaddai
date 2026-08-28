/* ══════════════════════════════════════════════════════════════════════
   SIMPLE MODE — CORE

   The navigator. Owns the scene, the level stack, and the one scalar `pos`
   that every renderer reads. Knows nothing about geometry; the renderers
   know nothing about input. Everything below is shared by all three skins.

   Interaction contract (docs/FRONT-DOOR-MASTER-PROMPT.md §3):
     spin      drag / swipe with inertia, snapping to the nearest item
     select    tap the front item (or the Enter button)
     read      dwell 5s on an item -> its bio; toggleable, remembered
     drill in  parent tips back and away, child rises into place
     back      swipe, the back chip, Esc, or browser back
     keyboard  arrows spin, Enter selects, Esc goes back

   ── FUTURE TODO · VOICE MODE — NOT BUILT, DELIBERATELY ──────────────────
   Asking the RAG brain aloud and hearing it answer is out of scope for this
   pass. No microphone, speech API, or audio endpoint is wired here. When
   scoped it becomes one more category in WHEEL (public/js/shd-modules.js).
   ────────────────────────────────────────────────────────────────────────
   ══════════════════════════════════════════════════════════════════════ */
import * as THREE from '/vendor/three/three.module.js';
import { SKINS } from './renderers.js';
import { platesReady } from './plate.js';

const CAM_Z = { wheel: 6.6, orb: 6.3, list: 6.2 };
const WRAPS = { wheel: true, orb: true, list: false };
const FOV = 42;
const DWELL_MS = 5000;
const PX_PER_ITEM = 96;      // thumb travel for one item — tuned for a phone
const FRICTION = 0.0022;     // velocity decay per ms
const SNAP = 12;             // snap spring stiffness

export function createSimple(opts) {
  const { canvas, data, on } = opts;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
  } catch (e) {
    on.fatal && on.fatal(e);
    return null;
  }
  renderer.setClearAlpha(0);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 100);

  /* ── level stack ──────────────────────────────────────────────────────
     Each frame remembers the position it was left at, so coming back out
     of a sub-menu returns you to exactly the item you drilled in from. */
  let stack = [{ items: data, label: null, pos: 0 }];
  let skinName = 'wheel';
  let view = null;

  let pos = 0, vel = 0, target = 0, settling = false;
  let dwellT = null, dwellOn = true, lastSel = -1;

  const level = () => stack[stack.length - 1];
  const count = () => level().items.length;

  function norm(p) {
    const n = count(); if (!n) return 0;
    if (WRAPS[skinName]) return ((p % n) + n) % n;
    return Math.max(0, Math.min(n - 1, p));
  }
  function selectedIndex() {
    const n = count(); if (!n) return 0;
    return ((Math.round(pos) % n) + n) % n;
  }
  function selectedItem() { return level().items[selectedIndex()]; }

  /* ── skins ────────────────────────────────────────────────────────────
     Switching rebuilds the geometry but keeps the stack and the position,
     so the same item stays selected across all three looks. */
  function setSkin(name, silent) {
    if (!SKINS[name]) name = 'wheel';
    skinName = name;
    if (view) view.dispose();
    view = new SKINS[name](scene);
    view.setItems(level().items, 0);
    pos = norm(pos); target = norm(Math.round(pos)); vel = 0;
    fit();
    try { localStorage.setItem('shd_simple_skin', name); } catch (e) {}
    if (!silent) on.skin && on.skin(name);
  }

  /* ── level movement ───────────────────────────────────────────────────── */
  function enter(item) {
    if (item.items && item.items.length) {
      level().pos = pos;
      stack.push({ items: item.items, label: item.name, pos: 0 });
      pos = 0; target = 0; vel = 0;
      view.setItems(level().items, reduced ? 0 : 1);
      clearDwell(); lastSel = -1;
      try { history.pushState({ depth: stack.length }, '', '#' + crumbHash()); } catch (e) {}
      announce();
      return true;
    }
    if (item.href) { on.navigate ? on.navigate(item) : (window.location.href = item.href); return true; }
    return false;
  }

  function back(fromPop) {
    if (stack.length <= 1) return false;
    stack.pop();
    pos = level().pos || 0; target = Math.round(pos); vel = 0;
    view.setItems(level().items, reduced ? 0 : -1);
    clearDwell(); lastSel = -1;
    if (!fromPop) { try { history.back(); } catch (e) {} }
    announce();
    return true;
  }

  function crumbHash() {
    return stack.slice(1).map(s => String(s.label || '').toLowerCase().replace(/\s+/g, '-')).join('/');
  }
  function announce() {
    on.level && on.level({
      items: level().items,
      trail: stack.slice(1).map(s => s.label),
      depth: stack.length
    });
    emitSelect(true);
  }

  window.addEventListener('popstate', () => { if (stack.length > 1) back(true); });

  /* ── dwell: sit on something for 5s and it tells you what it is ──────── */
  function clearDwell() {
    if (dwellT) { clearTimeout(dwellT); dwellT = null; }
    on.dwellEnd && on.dwellEnd();
  }
  function armDwell() {
    clearDwell();
    if (!dwellOn || reduced === 'never') return;
    dwellT = setTimeout(() => { on.dwell && on.dwell(selectedItem()); }, DWELL_MS);
  }
  function setDwellEnabled(v) {
    dwellOn = !!v;
    if (!dwellOn) clearDwell(); else armDwell();
  }

  function emitSelect(force) {
    const i = selectedIndex();
    if (!force && i === lastSel) return;
    lastSel = i;
    on.select && on.select(selectedItem(), i, count());
    armDwell();
  }

  /* ── input ────────────────────────────────────────────────────────────
     One pointer handler covers mouse, pen and touch. Touch is the primary
     case: a drag under the movement threshold is a tap, so a fingertip that
     wobbles by a pixel still selects instead of nudging the wheel. */
  const TAP_SLOP = 8;
  let down = false, dragged = false, lastY = 0, lastX = 0, lastT = 0, startY = 0, startX = 0;

  function onDown(e) {
    down = true; dragged = false; settling = false; vel = 0;
    lastY = startY = e.clientY; lastX = startX = e.clientX; lastT = performance.now();
    clearDwell();
    canvas.setPointerCapture && canvas.setPointerCapture(e.pointerId);
  }
  function onMove(e) {
    if (!down) return;
    const dy = e.clientY - lastY, dx = e.clientX - lastX;
    if (!dragged && Math.hypot(e.clientY - startY, e.clientX - startX) > TAP_SLOP) dragged = true;
    if (dragged) {
      // dragging DOWN walks toward earlier items, the way a physical drum turns
      const travel = skinName === 'orb' ? (dy * 0.8 + dx * 0.8) : dy;
      pos = norm(pos - travel / PX_PER_ITEM);
      const now = performance.now(), dt = Math.max(1, now - lastT);
      vel = (-travel / PX_PER_ITEM) / dt;
      lastT = now;
      emitSelect();
    }
    lastY = e.clientY; lastX = e.clientX;
  }
  function onUp(e) {
    if (!down) return;
    down = false;
    canvas.releasePointerCapture && e && e.pointerId != null &&
      canvas.hasPointerCapture && canvas.hasPointerCapture(e.pointerId) &&
      canvas.releasePointerCapture(e.pointerId);
    if (!dragged) { activate(); return; }
    if (performance.now() - lastT > 90) vel = 0;   // finger stopped before lifting
    settling = true;
    armDwell();
  }

  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', () => { down = false; settling = true; });
  canvas.style.touchAction = 'none';   // we own the gesture; stop the page scrolling under it

  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    settling = false; vel = 0;
    pos = norm(pos + Math.sign(e.deltaY) * 0.55);
    target = Math.round(pos); settling = true;
    emitSelect();
  }, { passive: false });

  function activate() {
    const it = selectedItem();
    if (it) { clearDwell(); enter(it); }
  }

  function spin(by) {
    settling = false; vel = 0;
    pos = norm(Math.round(pos) + by);
    target = Math.round(pos); settling = true;
    emitSelect();
  }

  document.addEventListener('keydown', e => {
    if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { e.preventDefault(); spin(1); }
    else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') { e.preventDefault(); spin(-1); }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(); }
    else if (e.key === 'Escape') { if (!back()) on.escape && on.escape(); }
  });

  /* ── frame ────────────────────────────────────────────────────────────── */
  function fit() {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // Dolly back far enough that the widest plate always fits, or the lettering
    // runs off the sides of a phone in portrait. Measured against the FRONT
    // item, which sits `frontZ` nearer the camera than the origin — fitting to
    // the origin instead makes everything ~15% too big on a narrow screen.
    const tanHalf = Math.tan((FOV * Math.PI / 180) / 2);
    const frontZ = view ? (view.frontZ || 0) : 0;
    const need = view ? (view.fitW || view.PW * 1.16) : 4.06;
    const zFit = need / (2 * tanHalf * camera.aspect) + frontZ;
    camera.position.z = Math.max((CAM_Z[skinName] || 6.6) + frontZ, zFit);
    // The reachable controls live along the bottom edge, so bias the framing
    // upward — camera below the wheel puts the wheel above screen centre.
    const visH = 2 * tanHalf * (camera.position.z - frontZ);
    camera.position.y = -visH * 0.10;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', fit);

  let paused = document.hidden;
  document.addEventListener('visibilitychange', () => { paused = document.hidden; });

  let last = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (paused) return;

    if (!down && settling) {
      const ms = dt * 1000;
      if (Math.abs(vel) > 0.00008) {
        pos = norm(pos + vel * ms);
        vel *= Math.max(0, 1 - FRICTION * ms);
        target = Math.round(pos);
        emitSelect();
      } else {
        vel = 0;
        // snap to the nearest item, taking the short way round on a wrapping skin
        let d = Math.round(pos) - pos;
        if (WRAPS[skinName] && count()) {
          const n = count();
          if (d > n / 2) d -= n; else if (d < -n / 2) d += n;
        }
        if (Math.abs(d) < 0.0015) { pos = norm(Math.round(pos)); settling = false; emitSelect(); }
        else { pos = norm(pos + d * Math.min(1, SNAP * dt)); }
      }
    }

    view && view.update(dt, pos, reduced);
    renderer.render(scene, camera);
  }

  /* ── boot ─────────────────────────────────────────────────────────────── */
  const api = {
    setSkin, skin: () => skinName,
    enter: activate, back, spin,
    setDwellEnabled,
    selected: selectedItem,
    depth: () => stack.length,
    refit: fit
  };

  platesReady().then(() => {
    let saved = 'wheel';
    try { saved = localStorage.getItem('shd_simple_skin') || 'wheel'; } catch (e) {}
    setSkin(saved, true);
    on.skin && on.skin(skinName);
    announce();
    on.ready && on.ready(api);
    requestAnimationFrame(frame);
  });

  return api;
}
