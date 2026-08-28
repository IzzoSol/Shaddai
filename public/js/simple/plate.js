/* ══════════════════════════════════════════════════════════════════════
   SIMPLE MODE — LABEL PLATES

   Every item in every renderer (wheel, orb, list) is the same thing: a
   textured plane. This builds that texture — big bold Cinzel lettering on
   a dark plate with an accent frame, drawn once per item and cached.

   Drawing type into a canvas texture (rather than 3D text geometry) is what
   keeps the lettering crisp and legible at a glance on a phone, which is the
   whole point of Simple Mode.
   ══════════════════════════════════════════════════════════════════════ */
import * as THREE from '/vendor/three/three.module.js';

const CACHE = new Map();

/* Shrink-to-fit: step the size down until the label fits the safe width.
   Long names (MARKETPLACE, THE CLIMB) must not clip or wrap awkwardly. */
function fitFont(ctx, text, maxW, start, min) {
  let size = start;
  for (;;) {
    ctx.font = '900 ' + size + 'px Cinzel, Georgia, serif';
    if (ctx.measureText(text).width <= maxW || size <= min) return size;
    size -= 4;
  }
}

function hexToRgba(hex, a) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
  return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
}

/**
 * @param {object} item  — { name, accent, pro }
 * @param {object} opts  — { w, h, dim } dim<1 renders an unselected variant
 * @returns {THREE.CanvasTexture}
 */
export function makePlate(item, opts = {}) {
  const W = opts.w || 1024, H = opts.h || 320;
  const key = item.id + '|' + item.name + '|' + W + 'x' + H;
  if (CACHE.has(key)) return CACHE.get(key);

  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  const accent = item.accent || '#00ff9c';
  const pad = Math.round(H * 0.13);

  // plate body — near-black so the wheel reads as solid objects, not floating type
  g.fillStyle = 'rgba(9,13,17,0.90)';
  g.fillRect(0, 0, W, H);

  // a soft accent bloom from the left edge, so each item carries its own colour
  const grad = g.createLinearGradient(0, 0, W, 0);
  grad.addColorStop(0, hexToRgba(accent, 0.20));
  grad.addColorStop(0.45, hexToRgba(accent, 0.03));
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);

  // frame + the heavy accent bar down the leading edge
  g.strokeStyle = hexToRgba(accent, 0.55);
  g.lineWidth = 3;
  g.strokeRect(1.5, 1.5, W - 3, H - 3);
  g.fillStyle = accent;
  g.fillRect(0, 0, Math.round(W * 0.012), H);

  // the label
  const safeW = W - pad * 2 - Math.round(W * 0.11);
  const size = fitFont(g, item.name, safeW, Math.round(H * 0.46), Math.round(H * 0.17));
  g.font = '900 ' + size + 'px Cinzel, Georgia, serif';
  g.textBaseline = 'middle';
  g.textAlign = 'left';
  g.shadowColor = hexToRgba(accent, 0.5);
  g.shadowBlur = Math.round(H * 0.09);
  g.fillStyle = '#f2f6f2';
  g.fillText(item.name, pad + Math.round(W * 0.02), H / 2 + 1);
  g.shadowBlur = 0;

  // affordance glyphs: a chevron when there's a sub-menu, a lock when Pro
  g.textAlign = 'right';
  g.fillStyle = hexToRgba(accent, 0.85);
  if (item.pro) {
    g.font = '500 ' + Math.round(H * 0.2) + 'px "IBM Plex Mono", monospace';
    g.fillText('PRO', W - pad, H / 2 + 1);
  } else if (item.items && item.items.length) {
    g.font = '500 ' + Math.round(H * 0.3) + 'px "IBM Plex Mono", monospace';
    g.fillText('›', W - pad, H / 2);
  }

  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  CACHE.set(key, tex);
  return tex;
}

/** Fonts must be ready before any plate is drawn, or Cinzel silently falls
    back to a serif and every label is redrawn wrong for the session. */
export function platesReady() {
  if (!document.fonts || !document.fonts.load) return Promise.resolve();
  return Promise.all([
    document.fonts.load('900 64px Cinzel'),
    document.fonts.load('500 32px "IBM Plex Mono"')
  ]).then(() => document.fonts.ready).catch(() => {});
}

export function disposePlates() {
  CACHE.forEach(t => t.dispose());
  CACHE.clear();
}
