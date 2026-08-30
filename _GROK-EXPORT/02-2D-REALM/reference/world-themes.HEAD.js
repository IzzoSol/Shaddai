/* world-themes.js — SHADDAI World hybrid theme engine  (Workstream D)
 * Classic script — no import / export. Exposes window.buildWorldThemes.
 *
 * ─── FACTORY ────────────────────────────────────────────────────────────────
 *   const themes = window.buildWorldThemes({ THREE, scene, refs });
 *
 * ─── refs SHAPE (lead assembles from the HTML's existing vars) ───────────────
 *   {
 *     fog:         scene.fog,                         // THREE.FogExp2
 *     lights: {
 *       key:       key,                               // THREE.PointLight  (neon)
 *       gold:      gold,                              // THREE.PointLight  (warm)
 *       sun:       sun,                               // THREE.DirectionalLight
 *       hemi:      hemi,                              // THREE.HemisphereLight
 *       ambient:   ambient,                           // THREE.AmbientLight
 *     },
 *     skyUniforms: {                                  // .value Color objects from skyMat.uniforms
 *       top:       skyMat.uniforms.top.value,
 *       mid:       skyMat.uniforms.mid.value,
 *       horizon:   skyMat.uniforms.horizon.value,
 *       glow:      skyMat.uniforms.glow.value,
 *     },
 *     grids:       [g1, g2],                          // THREE.GridHelper[]
 *     terrain:     worldTerrain,                      // result of buildWorldTerrain()
 *     biomes:      worldBiomes,                       // result of buildWorldBiomes() — optional
 *   }
 *
 * ─── terrain.applyGround(ground) CONTRACT ───────────────────────────────────
 *   The textures workstream (world-terrain.js) must implement this method.
 *   ground = {
 *     type:  'pbr' | 'tron' | 'grid',
 *     dir:   '/assets/textures/<name>',  // PBR: folder containing albedo/normal/rough maps
 *     color: 0xRRGGBB,                   // base tint (0xffffff = neutral / no tint)
 *     tint:  0xRRGGBB,                   // additive emissive neon accent (optional)
 *   }
 *   The method is called synchronously on every applyTheme(); texture loading is the
 *   terrain module's responsibility (lazy, no first-paint stall, no double swap).
 *
 * ─── RETURNED API ────────────────────────────────────────────────────────────
 *   {
 *     THEMES,                // pure data — add a theme here, zero engine edits required
 *     applyTheme(name),      // snap the whole world: sky / fog / lights / grids / ground / particles
 *     current(),             // → key string of the active theme
 *     list(),                // → [{ key, label }, …]  — for UI construction
 *     onAfterTheme(cb),      // register cb(name, themeObj) fired after every applyTheme
 *     update(delta, elapsed) // animate particles — call from animate()
 *   }
 */

window.buildWorldThemes = function buildWorldThemes(_ref) {
  'use strict';

  var THREE   = _ref.THREE;
  var scene   = _ref.scene;
  var refs    = _ref.refs;

  // ── 1. PURE DATA THEMES ─────────────────────────────────────────────────────
  // Adding a new theme = adding one object here. No engine edits.
  //
  // Each theme:
