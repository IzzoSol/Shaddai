/* world-interiors.js — SHADDAI World 3D  (TURTLE cinematic v2, 2026-07-02)
 *
 * Classic script — no import/export.  Requires THREE + scene loaded first.
 *
 * Exposes ONE global factory:
 *   window.buildWorldInteriors({ THREE, scene, camera, controls, playerPos, layout })
 *     → { enter(code), exit(), isInside(), update(dt, t), nearestDoor(x, z) }
 *
 * v2 UPGRADES:
 *   • 3-light cinematic rig per room  (key + soft fill + accent rim)
 *   • Reflective floor sheen          (roughness 0.55, metalness 0.18)
 *   • emissiveIntensity hard-capped   at 0.50 — kills white-glow blowout
 *   • Light shafts                    (additive CylinderGeometry cones, ~0.04 opacity)
 *   • Floating motes / data rain      (THREE.Points ~60 particles, active-room-only update)
 *   • InstancedMesh                   (racks, terminals, stalls, ingots, frames, orbs)
 *   • Per-room animObjs               (orrery, hologlobe, pages) — active-room-only
 *   • Themed ceiling details          (grid, vault ribs, skylight panels)
 *   • Richer hero pieces              (dais+throne, orrery, ticker wall, vault door, etc.)
 *   • Clear exit portal               (glowing arch + filled portal plane)
 */
(function (global) {
  'use strict';

  /* ─── layout constants ──────────────────────────────────────────────────── */
  var ROOM_ISLAND_X  = 6000;
  var ROOM_SPACING   = 500;
  var ROOM_W         = 80;
  var ROOM_H         = 22;
  var ROOM_D         = 80;
  var PLAYER_EYE_Y   = 3.6;
  var SPAWN_Z_OFFSET = 28;

  // MUST match the actual building wall radius (footprint*0.46) so the "[E] ENTER" prompt fires when you
  // stand at the door — before this these were 24-34 while the walls sit at 62-119, so you hit the wall
  // and could NEVER reach the trigger ("no door / can't get in"). Now the prompt reaches just outside each wall.
  // RADII RE-DERIVED from the actual footprints in world-buildings.js × 0.46 (the dressed-wall faceR):
  //   NEXUS/TURTLE fp140→64 · ZEROX/PIKADON fp145→67 · ORACLE fp138→64 · QUILL/Library fp258→119.
  //   QUILL was the big miss: the library was grown 172→258 but this table still read 78, putting the
  //   ENTER trigger (78+16=94) a full ~24u INSIDE the fp*0.46=119 wall — you hit the wall before the
  //   prompt could ever fire ("can't get into the library"). Now 119 matches the wall. SHADDAI is unused
  //   here (skipped below — the ground centre is the open bazaar), left as-is.
  var COLLIDER_R = {
    SHADDAI: 76, ZEROX: 67, ORACLE: 64, NEXUS: 64,
    TURTLE: 64,  QUILL: 119, PIKADON: 67, bazaar: 37
  };
  // FRONT-DOOR GATE: the "[E] ENTER" prompt only fires when the player stands on the
  // building's ENTRANCE side — the side facing world-centre. We bake a normalized front
  // vector per door (frontDir = normalize(centre - buildingPos)) and require the player
  // to be inside a cone around it (dot-product test). SHADDAI sits AT centre so its door
  // faces -Z. COS_FRONT = cos(60deg) -> a 120deg-wide front arc; this stops the prompt
  // from firing at the back/sides of a building.
  var COS_FRONT  = 0.5;
  var COS_FRONT2 = COS_FRONT * COS_FRONT;
  var WORLD_CX   = 0;   // world centre X (SHADDAI sits here)
  var WORLD_CZ   = 0;   // world centre Z

  var DOOR_EXTRA = 16;   // how far OUTSIDE the wall the prompt still triggers — walk up to the door and it fires

  /* ─── themes ─────────────────────────────────────────────────────────────── */
  var THEMES = {
