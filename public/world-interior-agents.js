/* world-interior-agents.js — BOTS staff the buildings (owner 2026-10-16: "we dont need agents in the buildings we need BOTS and those bots can be
 * peoples agents later and they can work them ... removing all those agents is speed too").
 * Before: world-interiors-v3 staffed rooms with grey capsules; a first pass here used full rigged council agents (heavy, and the owner wants bots).
 *
 *   WorldInteriorAgents.attach({ THREE, interiors, loader })
 *   Every staff spot (counter, desk, bar, stall...) gets a K14 work bot (Grok / Muse bodies, static meshes, no skeleton = cheap), 1.6 m tall,
 *   idling with a slow hover bob. No seated characters. Later a player's own agent can take over a bot's post (the slot is the job).
 *   The factory returns a Group at once (interiors stay synchronous); the bot drops in when its GLB is ready. ?interioragents=0 = capsules.
 */
(function (root) {
  'use strict';
  var BOTS = [{ url: '/assets/kits/shaddai_bot_grok_v01.glb', node: 'bot_grok' }, { url: '/assets/kits/shaddai_bot_muse_v01.glb', node: 'bot_muse' }];
  var HEIGHT_M = 1.6, live = [], glbs = {}, O = null;
  function hash(s) { var h = 0; s = String(s); for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); }
  function bot(i) { var b = BOTS[i]; if (!glbs[b.url]) glbs[b.url] = new Promise(function (res) { O.loader.load(b.url, res, undefined, function () { res(null); }); }); return glbs[b.url]; }
  function fit(THREE, m) {
    m.updateMatrixWorld(true); var bb = new THREE.Box3().setFromObject(m), h = bb.max.y - bb.min.y;
    if (h > 0.01) { m.scale.multiplyScalar(HEIGHT_M / h); m.updateMatrixWorld(true); bb.setFromObject(m); m.position.y -= bb.min.y; }
  }
  function factory(n) {
    if (n.t === 'seat') return null;   // owner: no seated characters in the rooms
    var THREE = O.THREE, g = new THREE.Group(), k = hash((n.role || '') + n.x.toFixed(1) + n.z.toFixed(1)) % BOTS.length;
    g.name = 'int-bot:' + (n.role || 'staff'); g.userData.slotRole = n.role || 'staff';
    bot(k).then(function (gl) {
      if (!gl) return; var src = gl.scene.getObjectByName(BOTS[k].node) || gl.scene, m = src.clone(true);
      m.traverse(function (o) { if (o.isMesh) { o.castShadow = false; } }); fit(THREE, m); g.add(m); live.push({ g: g, m: m, y0: m.position.y, ph: hash(n.role + n.x) % 628 / 100 });
    });
    return g;
  }
  function tick() {
    var t = performance.now() / 1000;
    for (var i = live.length - 1; i >= 0; i--) { var e = live[i]; if (!e.g.parent) { live.splice(i, 1); continue; } e.m.position.y = e.y0 + Math.sin(t * 1.6 + e.ph) * 0.04; }
    requestAnimationFrame(tick);
  }
  function attach(o) {
    if (typeof location !== 'undefined' && /[?&]interioragents=0\b/.test(location.search)) return false;
    if (!o || !o.interiors || !o.interiors.setNpcFactory || !o.loader) return false;
    O = o; o.interiors.setNpcFactory(factory); requestAnimationFrame(tick); return true;
  }
  root.WorldInteriorAgents = { attach: attach, BOTS: BOTS, _hash: hash, _live: live };
})(typeof window !== 'undefined' ? window : globalThis);
