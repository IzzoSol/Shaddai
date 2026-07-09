/**
 * projection.js — Pure world→screen projection, no DOM.
 * Supports SIDE_25D (broadcast 2.5D) and ISO (isometric) camera modes.
 * Works in Node (module.exports) and browser (window.FootballProjection).
 *
 * World coordinate system:
 *   x  = horizontal across field (0 = left sideline, 100 = right sideline ... actually 53.3 yards)
 *   y  = yard-line depth (0 = team-A end zone, 100 = team-B end zone)
 *   z  = height above ground (0 = ground, positive = up; used for jumps/throws)
 *
 * Viewport: { width, height } in pixels (canvas CSS pixels).
 *
 * Returns: { sx, sy, scale } where sx/sy are canvas pixel coords.
 */

'use strict';

// IIFE-wrapped so top-level helpers (FIELD_WIDTH, lerp, normX ...) do NOT leak
// into the shared browser global scope, where they'd collide with replay.js's
// identically-named constants and throw a redeclaration SyntaxError.
(function (root) {

// ---------- FIELD CONSTANTS ----------
const FIELD_WIDTH  = 53.33; // yards across
const FIELD_LENGTH = 120;   // yards total including end zones (10 each)

// ---------- HELPERS ----------

/**
 * Lerp between two values.
 */
function lerp(a, b, t) {
  return a + (b - a) * t;
}

/**
 * Map world y (0..120, y=0=teamA goal) to a 0..1 normalised depth.
 */
function normY(worldY) {
  return worldY / FIELD_LENGTH;
}

/**
 * Map world x (0..FIELD_WIDTH) to a 0..1 normalised width.
 */
function normX(worldX) {
  return worldX / FIELD_WIDTH;
}

// ---------- CAMERA MODES ----------

/**
 * SIDE_25D — broadcast-style angled 2.5D view.
 * The field is drawn top-down but tilted: deeper rows appear higher on screen.
 * A slight foreshortening factor squishes the depth axis.
 * Z (height) lifts the object upward on screen.
 *
 * Layout on canvas:
 *   - Field occupies 85% of height, centred horizontally.
 *   - y=0 (teamA end) maps to bottom of the field area.
 *   - y=120 (teamB end) maps to top of the field area.
 */
function projectSide25D(worldPos, viewport) {
  const { x = 0, y = 0, z = 0 } = worldPos;
  const { width, height } = viewport;

  // Field render area (leave margins)
  const margin   = 0.05;
  const fieldW   = width  * (1 - 2 * margin);
  const fieldH   = height * (1 - 2 * margin);
  const originX  = width  * margin;
  const originY  = height * margin;

  // Foreshortening: depth axis is compressed to ~70% of linear
  const FORESHORTEN = 0.70;

  const nx = normX(x);
  const ny = normY(y); // 0 (teamA) .. 1 (teamB)

  // Slight lateral lean from perspective (~3% of fieldW per unit depth)
  const perspLean = (ny - 0.5) * fieldW * 0.03;

  const sx = originX + nx * fieldW + perspLean;
  // y=0 → bottom, y=120 → top  (flip: higher y = higher on field = higher screen)
  const sy = originY + fieldH * (1 - ny * FORESHORTEN) - z * (fieldH * 0.008);

  // Scale: objects near bottom (closer) appear slightly larger
  const scale = 0.85 + (1 - ny) * 0.30;

  return { sx, sy, scale };
}

/**
 * ISO — standard isometric (2:1) projection.
 * World → iso coords → canvas.
 *
 * Iso axes: right = (+x, +y screen), down-right = (+y world, -x screen ... adjusted for our coords).
 * Classic iso: screenX = (worldX - worldY) * tileW/2
 *              screenY = (worldX + worldY) * tileH/2  (then invert y for our coord system)
 * We normalise so the field fits the viewport.
 */
function projectISO(worldPos, viewport) {
  const { x = 0, y = 0, z = 0 } = worldPos;
  const { width, height } = viewport;

  // Normalise to -1..1 centred
  const nx = (x / FIELD_WIDTH)  * 2 - 1;   // -1 (left) .. +1 (right)
  const ny = (y / FIELD_LENGTH) * 2 - 1;   // -1 (teamA) .. +1 (teamB)

  // Iso matrix (tile ratio 2:1)
  const isoX = (nx - ny) * 0.5;
  const isoY = (nx + ny) * 0.25;  // compressed to keep field on screen

  // Scale to fit viewport (keep 10% margin)
  const scale0 = Math.min(width, height) * 0.42;
  const cx = width  / 2;
  const cy = height / 2;

  const sx = cx + isoX * scale0;
  const sy = cy + isoY * scale0 - z * scale0 * 0.02;

  // Distance from viewer: further objects are slightly smaller
  const dist = Math.sqrt(isoX * isoX + isoY * isoY);
  const scale = 1.0 - dist * 0.12;

  return { sx, sy, scale: Math.max(0.6, scale) };
}

// ---------- FIELD CORNER PROJECTION ----------
/**
 * Returns the four screen-space corners of the field for the given mode/viewport.
 * Useful for drawing the field quad.
 * Corners in world coords: TL=(0,120), TR=(53.33,120), BR=(53.33,0), BL=(0,0)
 */
function projectFieldCorners(mode, viewport) {
  const corners = [
    { label: 'TL', w: { x: 0,           y: FIELD_LENGTH, z: 0 } },
    { label: 'TR', w: { x: FIELD_WIDTH,  y: FIELD_LENGTH, z: 0 } },
    { label: 'BR', w: { x: FIELD_WIDTH,  y: 0,            z: 0 } },
    { label: 'BL', w: { x: 0,           y: 0,            z: 0 } },
  ];
  return corners.map(c => ({ label: c.label, screen: project(c.w, mode, viewport) }));
}

// ---------- PUBLIC API ----------

/**
 * project(worldPos, mode, viewport) → { sx, sy, scale }
 *
 * @param {Object} worldPos  - { x, y, z } world coords
 * @param {string} mode      - 'SIDE_25D' | 'ISO'
 * @param {Object} viewport  - { width, height } in pixels
 */
function project(worldPos, mode, viewport) {
  if (mode === 'ISO') return projectISO(worldPos, viewport);
  return projectSide25D(worldPos, viewport);
}

// ---------- EXPORTS ----------
const FootballProjection = { project, projectFieldCorners, FIELD_WIDTH, FIELD_LENGTH, lerp, normX, normY };

if (typeof module !== 'undefined' && module.exports) {
  module.exports = FootballProjection;
}
root.FootballProjection = FootballProjection;

})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
