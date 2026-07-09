/**
 * projection.test.js — Node tests for projection.js
 * Run: node projection.test.js
 */

'use strict';

const fp = require('./projection.js');
const { project, projectFieldCorners, FIELD_WIDTH, FIELD_LENGTH } = fp;

let passed = 0, failed = 0;

function assert(desc, condition) {
  if (condition) {
    console.log('  PASS:', desc);
    passed++;
  } else {
    console.error('  FAIL:', desc);
    failed++;
  }
}

function assertFinite(desc, val) {
  assert(desc + ' is finite', Number.isFinite(val));
}

const VP = { width: 800, height: 500 };

// --- SIDE_25D ---
console.log('\n[SIDE_25D tests]');
{
  const centre  = project({ x: FIELD_WIDTH / 2, y: FIELD_LENGTH / 2, z: 0 }, 'SIDE_25D', VP);
  assertFinite('centre.sx', centre.sx);
  assertFinite('centre.sy', centre.sy);
  assert('centre is roughly on screen (x)', centre.sx > 0 && centre.sx < VP.width);
  assert('centre is roughly on screen (y)', centre.sy > 0 && centre.sy < VP.height);

  // Point farther downfield (higher y) should be HIGHER on screen (smaller sy)
  const p0 = project({ x: 26, y: 30,  z: 0 }, 'SIDE_25D', VP);
  const p1 = project({ x: 26, y: 80,  z: 0 }, 'SIDE_25D', VP);
  assert('deeper yard-line is higher on screen (SIDE_25D)', p1.sy < p0.sy);

  // Z lift should decrease sy
  const pGround = project({ x: 26, y: 60, z: 0   }, 'SIDE_25D', VP);
  const pAir    = project({ x: 26, y: 60, z: 5   }, 'SIDE_25D', VP);
  assert('object in air is higher on screen (SIDE_25D)', pAir.sy < pGround.sy);

  // Scale: nearer (y=10) > farther (y=110)
  const sNear = project({ x: 26, y: 10,  z: 0 }, 'SIDE_25D', VP).scale;
  const sFar  = project({ x: 26, y: 110, z: 0 }, 'SIDE_25D', VP).scale;
  assert('near player has larger scale (SIDE_25D)', sNear > sFar);

  // Corner projections
  const corners = projectFieldCorners('SIDE_25D', VP);
  assert('4 corners returned', corners.length === 4);
  corners.forEach(c => {
    assertFinite('corner ' + c.label + ' sx', c.screen.sx);
    assertFinite('corner ' + c.label + ' sy', c.screen.sy);
  });
}

// --- ISO ---
console.log('\n[ISO tests]');
{
  const centre = project({ x: FIELD_WIDTH / 2, y: FIELD_LENGTH / 2, z: 0 }, 'ISO', VP);
  assertFinite('centre.sx', centre.sx);
  assertFinite('centre.sy', centre.sy);
  assert('centre is roughly on screen (x)', centre.sx > 0 && centre.sx < VP.width);
  assert('centre is roughly on screen (y)', centre.sy > 0 && centre.sy < VP.height);

  // In ISO, moving along world-y changes both sx and sy
  const pY0 = project({ x: 26, y: 10,  z: 0 }, 'ISO', VP);
  const pY1 = project({ x: 26, y: 90,  z: 0 }, 'ISO', VP);
  assert('different y-world gives different screen-y (ISO)', Math.abs(pY1.sy - pY0.sy) > 1);

  // Moving along world-x changes sx
  const pX0 = project({ x: 5,  y: 60, z: 0 }, 'ISO', VP);
  const pX1 = project({ x: 50, y: 60, z: 0 }, 'ISO', VP);
  assert('different x-world gives different screen-x (ISO)', Math.abs(pX1.sx - pX0.sx) > 1);

  // Z lift
  const pGround = project({ x: 26, y: 60, z: 0 }, 'ISO', VP);
  const pAir    = project({ x: 26, y: 60, z: 5 }, 'ISO', VP);
  assert('object in air is higher on screen (ISO)', pAir.sy < pGround.sy);

  // ISO corners
  const corners = projectFieldCorners('ISO', VP);
  assert('4 ISO corners returned', corners.length === 4);
}

// --- Determinism ---
console.log('\n[Determinism tests]');
{
  const pos = { x: 20, y: 60, z: 2 };
  const a   = project(pos, 'SIDE_25D', VP);
  const b   = project(pos, 'SIDE_25D', VP);
  assert('SIDE_25D deterministic sx', a.sx === b.sx);
  assert('SIDE_25D deterministic sy', a.sy === b.sy);

  const c   = project(pos, 'ISO', VP);
  const d   = project(pos, 'ISO', VP);
  assert('ISO deterministic sx', c.sx === d.sx);
  assert('ISO deterministic sy', c.sy === d.sy);
}

// --- Summary ---
console.log(`\n=== projection.test.js: ${passed} passed, ${failed} failed ===\n`);
if (failed > 0) process.exit(1);
