/* world-interior-agents.js — real rigged AGENTS inside buildings (owner 2026-10-16: "make sure the agents can sit in the furniture").
 * Before: world-interiors-v3 staffed every shop / office / home with grey placeholder capsules (nobody called setNpcFactory).
 *
 *   WorldInteriorAgents.attach({ THREE, interiors, loader, cloneSkinned, animLib: () => Promise<{clips, meta}> })
 *   Staff spots (counter, desk, bar...) get a standing agent on the shared idle; SEAT spots (sofas, benches; world-interiors-v3 `seats`)
 *   get a seated agent on Sit_Chair_Loop. Agent bodies are the council GLBs (/assets/agents/<CODE>.glb), loaded once, skeleton-cloned
 *   per NPC, scaled to 1.75 m, retargeted clips from the shared library (world-anim.js). Mixers only tick while the room is shown.
 *   The factory returns a Group at once (interiors stay synchronous); the body drops in when its GLB is ready. ?interioragents=0 = capsules.
 */
(function (root) {
  'use strict';
  var CODES = ['ZEROX', 'NEXUS', 'TURTLE', 'QUILL', 'ORACLE', 'PIKADON', 'SHADDAI'];
  var HEIGHT_M = 1.75, live = [], glbs = {}, O = null;
  function hash(s) { var h = 0; s = String(s); for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); }
  function body(code) {
    if (!glbs[code]) glbs[code] = new Promise(function (res) { O.loader.load('/assets/agents/' + code + '.glb', res, undefined, function () { res(null); }); });
    return glbs[code];
  }
  function fit(THREE, m) {   // stand the clone on y = 0 at HEIGHT_M (agent GLBs are metres but not all the same size)
    m.updateMatrixWorld(true); var bb = new THREE.Box3().setFromObject(m), h = bb.max.y - bb.min.y;
    if (h > 0.01) { var s = HEIGHT_M / h; m.scale.multiplyScalar(s); m.updateMatrixWorld(true); bb.setFromObject(m); m.position.y -= bb.min.y; }
  }
  function factory(n) {
    var THREE = O.THREE, g = new THREE.Group(), seated = n.t === 'seat' || n.seated, code = CODES[hash((n.role || '') + n.x.toFixed(1) + n.z.toFixed(1)) % CODES.length];
    g.name = 'int-agent:' + code + (seated ? ':seated' : '');
    body(code).then(function (gl) {
      if (!gl) return; var m = O.cloneSkinned(gl.scene); m.traverse(function (o) { if (o.isMesh) { o.frustumCulled = true; o.castShadow = false; } });
      fit(THREE, m); if (seated) m.position.y += (n.seatY || 0) - 0.48;   // hips onto the cushion (the sit clip lowers the hips ~0.48 m)
      g.add(m);
      O.animLib().then(function (lib) {
        if (!lib || !root.buildAgentAnimator) return;
        try {
          var anim = root.buildAgentAnimator({ THREE: THREE, model: m, clips: lib.clips, meta: lib.meta }), name = seated ? 'Sit_Chair_Loop' : 'Idle_FoldArms_Loop';
          if (!anim.has(name)) name = seated ? (lib.meta.actions && lib.meta.actions.sit) : (lib.meta.locomotion && lib.meta.locomotion.idle);
          var clip = name && anim.clip(name); if (!clip) return;
          var mixer = new THREE.AnimationMixer(m), act = mixer.clipAction(clip); act.time = (hash(code + n.x) % 100) / 100 * clip.duration; act.play();
          live.push({ g: g, mixer: mixer });
        } catch (e) { if (root.console) console.warn('[interior-agents]', code, e && e.message); }
      });
    });
    return g;
  }
  function tick() {
    var now = performance.now(), dt = Math.min(0.1, (now - (tick.t || now)) / 1000); tick.t = now;
    for (var i = live.length - 1; i >= 0; i--) { var e = live[i]; if (!e.g.parent) { live.splice(i, 1); continue; } var v = true; for (var p = e.g; p; p = p.parent) if (!p.visible) { v = false; break; } if (v) e.mixer.update(dt); }
    requestAnimationFrame(tick);
  }
  function attach(o) {
    if (typeof location !== 'undefined' && /[?&]interioragents=0\b/.test(location.search)) return false;
    if (!o || !o.interiors || !o.interiors.setNpcFactory || !o.loader || !o.cloneSkinned) return false;
    O = o; o.interiors.setNpcFactory(factory); requestAnimationFrame(tick); return true;
  }
  root.WorldInteriorAgents = { attach: attach, CODES: CODES, _hash: hash, _live: live };
})(typeof window !== 'undefined' ? window : globalThis);
