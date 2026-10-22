/* world-realm-interiors.js — every realm-town building and Blender landmark becomes a walk-in interior (2026-10-22).
 *
 * Owner: "make the buildings functional with insides so we don't have to later". The K10/K10b/K28 kit GLBs are hollow shells
 * with a 3.0 x 3.4 m door on the front (= three +z, the interior engine's door wall); world-interiors-v3.js already furnishes
 * rooms by recipe. This glue registers them:
 *   - world-realm-kits.js fills window.__realmKitBuildings ({ id, realm, kind, x, z, yaw, canon }) — homes are handled by
 *     world-realm-homes.js (deeds), so they are not listed;
 *   - world-realm-dress.js fills window.__realmDressInteriors from hook_interior_* nodes (interior_recipe / _w / _d / _h extras).
 * sync() registers anything new once window.__interiorsV3 is ready; called by both builders and once the engine is ready, so
 * load order does not matter. canon = the building's circle collider, handed to the engine so the doorway opens when inside.
 * Sizes are the shell's inside (K10 KINDS / K10b TOWN_KINDS minus the 0.5 m walls), ground-floor ceiling. ?realminteriors=0 = off.
 */
(function (root) {
  'use strict';
  var OFF = typeof location !== 'undefined' && /[?&]realminteriors=0/.test(location.search || '');
  //            recipe           w     d     h   (metres, inside the shell)
  var KIND = {
    hall:       ['shaddai-hall', 23,   17,   8.5],
    shop:       ['storefront-s', 13,   11,   4.0],
    tower:      ['office',       15,   15,   3.8],
    inn:        ['home',         17,   13,   4.0],
    workshop:   ['techlab',      17,   13,   6.0],
    apartments: ['home',         13,   13,   3.6]
  };
  var REALM_RECIPE = { volcano: { workshop: 'forge' } };   // Emberfall's workshop is a smithy
  var done = {}, stats = { registered: 0, failed: 0 };
  function sync() {
    var iv3 = root.__interiorsV3; if (OFF || !iv3 || !iv3.register) return stats;
    (root.__realmKitBuildings || []).forEach(function (b) {
      if (done[b.id]) return; var k = KIND[b.kind]; if (!k) return; done[b.id] = 1;
      var recipe = (REALM_RECIPE[b.realm] && REALM_RECIPE[b.realm][b.kind]) || k[0], s = b.s || 1;
      try { iv3.register({ id: b.id, key: 'realm-' + b.kind, recipe: recipe, x: b.x, z: b.z, rot: b.yaw, w: k[1] * s, d: k[2] * s, h: k[3] * s, canon: b.canon || null }); stats.registered++; }
      catch (e) { stats.failed++; console.warn('[realm-interiors] ' + b.id + ': ' + (e && e.message)); }
    });
    (root.__realmDressInteriors || []).forEach(function (b) {
      if (done[b.id]) return; done[b.id] = 1;
      try { iv3.register({ id: b.id, key: 'landmark', recipe: b.recipe, x: b.x, z: b.z, rot: b.yaw, w: b.w, d: b.d, h: b.h, canon: b.canon || null }); stats.registered++; }
      catch (e) { stats.failed++; console.warn('[realm-interiors] ' + b.id + ': ' + (e && e.message)); }
    });
    return stats;
  }
  root.WorldRealmInteriors = { sync: sync, stats: function () { return stats; }, KIND: KIND };
})(typeof window !== 'undefined' ? window : this);
