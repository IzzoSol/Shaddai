/* world-gear-wear.js — realm protective gear you can SEE on the character (2026-10-22, owner: "void gas mask, desert wraps on head and
 * feet so it doesn't burn you, gear to walk the ice realm").
 *
 *   window.WorldGearWear.build({ THREE, scene, height, getAvatar, perk?, realm? }) -> { update(dt), dispose(), state() }
 *
 * The RULES live in world-realm-hazards.js / world-realm-zones.js (masks gas / wrap / arctic + resist perks bought in
 * world-gadgets.js: Void Respirator, Desert Wrap, Frost Kit). This module only draws them, and only where they matter:
 *   Void Respirator  -> dark visor + twin glowing filters        shown in the void realm (and the castle gas)
 *   Desert Wrap      -> sand-cloth head wrap + scarf tail + foot wraps   shown in the desert realm
 *   Frost Kit        -> clear face shield + spiked ice cleats    shown in the arctic realm
 * Pieces follow the rig's Head / LeftFoot / RightFoot bone POSITIONS each frame and take the avatar's facing (rigs disagree on
 * bone axes, the avatar yaw does not). Boneless bodies fall back to fractions of the body height. Sizes are real metres scaled
 * by the body height (height units = 1.8 m). Zero allocation per frame. ?gearwear=0 = off.
 */
(function (root) {
  'use strict';
  var SHOW = { respirator: ['void'], wrap: ['desert'], frost: ['arctic'] };
  function build(o) {
    if (typeof location !== 'undefined' && /[?&]gearwear=0/.test(location.search || '')) return null;
    var THREE = o.THREE, H = o.height || 7, M = H / 1.8;                       // world units per real metre on this body
    var perk = o.perk || function (k) { var I = root.ShdInv; return I && I.perk ? (+I.perk(k) || 0) : 0; };
    var realm = o.realm || function () { var z = root.__realmZones, s = z && z.state && z.state(); var r = s && s.realm; return r && (r.id || r); };
    var g = new THREE.Group(); g.name = 'gear-wear'; o.scene.add(g);
    var std = function (c, e, ei, extra) { return new THREE.MeshStandardMaterial(Object.assign({ color: c, roughness: 0.55, metalness: 0.2, emissive: e || 0x000000, emissiveIntensity: ei || 0 }, extra || {})); };
    function part(geo, mat, x, y, z, rx) { var m = new THREE.Mesh(geo, mat); m.position.set(x * M, y * M, z * M); if (rx) m.rotation.x = rx; m.castShadow = true; return m; }
    // ---- pieces, built once, in metres around a local origin (head = base of the skull, feet = ankle)
    var resp = new THREE.Group(), visorM = std(0x14101c, 0x6a3cff, 0.35, { metalness: 0.6, roughness: 0.25 }), filtM = std(0x2a2433, 0x9b59f5, 1.4);
    resp.add(part(new THREE.BoxGeometry(0.19 * M, 0.07 * M, 0.035 * M), visorM, 0, 0.1, 0.105));
    resp.add(part(new THREE.BoxGeometry(0.12 * M, 0.07 * M, 0.06 * M), visorM, 0, 0.02, 0.1));
    [-1, 1].forEach(function (s) { resp.add(part(new THREE.CylinderGeometry(0.028 * M, 0.032 * M, 0.06 * M, 10), filtM, s * 0.065, 0.01, 0.125, Math.PI / 2)); });
    var wrapHead = new THREE.Group(), cloth = std(0xd9c29a, 0x000000, 0, { roughness: 0.95, metalness: 0 }), clothDark = std(0xb89a68, 0, 0, { roughness: 0.95, metalness: 0 });
    wrapHead.add(part(new THREE.TorusGeometry(0.1 * M, 0.04 * M, 8, 18), cloth, 0, 0.14, 0, Math.PI / 2));
    wrapHead.add(part(new THREE.SphereGeometry(0.1 * M, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), cloth, 0, 0.15, -0.005));
    wrapHead.add(part(new THREE.BoxGeometry(0.17 * M, 0.06 * M, 0.03 * M), clothDark, 0, 0.04, 0.1));                  // face veil
    var tail = part(new THREE.BoxGeometry(0.07 * M, 0.26 * M, 0.02 * M), clothDark, 0, 0.0, -0.11); tail.rotation.x = 0.25; wrapHead.add(tail);
    var frostHead = new THREE.Group(), shieldM = new THREE.MeshStandardMaterial({ color: 0xbfe8ff, transparent: true, opacity: 0.35, roughness: 0.05, metalness: 0.1, emissive: 0x5fc8ff, emissiveIntensity: 0.15, side: THREE.DoubleSide, depthWrite: false });
    var sh = new THREE.Mesh(new THREE.CylinderGeometry(0.13 * M, 0.13 * M, 0.2 * M, 16, 1, true, -Math.PI / 2.2, Math.PI / 1.1), shieldM); sh.position.set(0, 0.1 * M, 0.0); frostHead.add(sh);
    frostHead.add(part(new THREE.BoxGeometry(0.27 * M, 0.025 * M, 0.06 * M), std(0x5d6b78, 0x8fd8ff, 0.6), 0, 0.21, 0.02));
    function footPair(make) { return [make(), make()]; }
    var wrapFeet = footPair(function () { var f = new THREE.Group(); f.add(part(new THREE.CylinderGeometry(0.065 * M, 0.075 * M, 0.11 * M, 10), cloth, 0, 0.03, 0)); f.add(part(new THREE.BoxGeometry(0.11 * M, 0.04 * M, 0.2 * M), clothDark, 0, -0.04, 0.05)); return f; });
    var cleats = footPair(function () {
      var f = new THREE.Group(), steel = std(0x3a4450, 0x8fd8ff, 0.25, { metalness: 0.8, roughness: 0.3 });
      f.add(part(new THREE.BoxGeometry(0.11 * M, 0.02 * M, 0.24 * M), steel, 0, -0.07, 0.05));
      for (var i = 0; i < 6; i++) f.add(part(new THREE.ConeGeometry(0.012 * M, 0.035 * M, 5), steel, (i % 2 ? 0.035 : -0.035), -0.095, -0.04 + Math.floor(i / 2) * 0.08, Math.PI));
      return f;
    });
    [resp, wrapHead, frostHead].concat(wrapFeet, cleats).forEach(function (p) { p.visible = false; g.add(p); });
    // ---- per frame
    var bones = { av: null, head: null, lf: null, rf: null }, v = new THREE.Vector3(), st = { respirator: false, wrap: false, frost: false };
    function findBones(av) {
      bones.av = av; bones.head = bones.lf = bones.rf = null;
      av.traverse(function (n) { if (!n.isBone) return; if (n.name === 'Head') bones.head = n; else if (n.name === 'LeftFoot') bones.lf = n; else if (n.name === 'RightFoot') bones.rf = n; });
    }
    function at(obj, bone, av, fy, side) {
      if (bone) { bone.getWorldPosition(v); obj.position.copy(v); }
      else { obj.position.set(av.position.x + Math.cos(av.rotation.y) * side * 0.1 * M, av.position.y + fy * H, av.position.z - Math.sin(av.rotation.y) * side * 0.1 * M); }
      obj.rotation.set(0, av.rotation.y, 0);
    }
    function update() {
      var av = o.getAvatar && o.getAvatar(); if (!av) { g.visible = false; return; }
      g.visible = av.visible !== false; if (bones.av !== av) findBones(av);
      av.updateMatrixWorld(true);
      var r = realm(), inR = function (k) { return SHOW[k].indexOf(r) >= 0; };
      st.respirator = perk('mask-gas') >= 1 && inR('respirator'); st.wrap = perk('mask-wrap') >= 1 && inR('wrap'); st.frost = perk('mask-arctic') >= 3 && inR('frost');
      resp.visible = st.respirator; wrapHead.visible = st.wrap; frostHead.visible = st.frost;
      wrapFeet[0].visible = wrapFeet[1].visible = st.wrap; cleats[0].visible = cleats[1].visible = st.frost;
      if (st.respirator) at(resp, bones.head, av, 0.9, 0);
      if (st.wrap) { at(wrapHead, bones.head, av, 0.9, 0); at(wrapFeet[0], bones.lf, av, 0.04, 1); at(wrapFeet[1], bones.rf, av, 0.04, -1); }
      if (st.frost) { at(frostHead, bones.head, av, 0.9, 0); at(cleats[0], bones.lf, av, 0.04, 1); at(cleats[1], bones.rf, av, 0.04, -1); }
    }
    return { group: g, update: update, state: function () { return st; }, dispose: function () { o.scene.remove(g); } };
  }
  root.WorldGearWear = { build: build, SHOW: SHOW };
})(typeof window !== 'undefined' ? window : this);
