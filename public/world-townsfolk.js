/* world-townsfolk.js — the rigged NPCs at their posts (2026-10-22, owner: "place every keeper where it belongs").
 *
 *   window.buildWorldTownsfolk({ THREE, GLTFLoader, cloneSkinned, scene, transit, heightAt, getPlayer }) -> { group, stats(), dispose() }
 *
 * Each NPC is a finalized GLB in /assets/npcs/ with the shared clip set BAKED in (tools/ual/bake-agent-clips.mjs — the same
 * world-anim.js retarget the council uses: rotation tracks + Hips only, so limbs never stretch; textures WebP at full res).
 * POSTS are authored, nothing random:
 *   - station posts use the realm-town frame of world-realm-kits.js (station-local METRES: x along the track, z toward the
 *     lift/city; the hall stands at z=70 facing the station, workshop at (30,140) facing -x, inn at (0,150)) so an NPC stands
 *     at a real door, never inside a building;
 *   - fixed posts (Race HQ, Colosseum gate) read the owning module's own coordinates.
 * Models keep their authored height (real metres x PM): chibi townsfolk stay smaller than the 1.75 m council.
 * Perf: a GLB loads only when the player first comes within LOAD_M of its post (one file per NPC type, skeleton-safe clones
 * for repeats); mixers tick only within ANIM_M; beyond SHOW_M the NPC is hidden. Own rAF tick, zero allocation per frame.
 * NPCs turn to face the player inside FACE_M and drift back to their post heading. ?townsfolk=0 = off.
 */
(function (root) {
  'use strict';
  var PM = 7 / 1.8, LOAD_M = 420, SHOW_M = 300, ANIM_M = 140, FACE_M = 9, BASE = '/assets/npcs/', V = '?v=20261022a';
  // owner 2026-10-23: NPCs are BOTS (humanoid or wheeled, world-bot-bodies.js), never the council agents or lookalikes.
  // [bot kind, station realm, local x m, local z m, yaw deg (station-local, 180 = facing the station)]
  var STATION_POSTS = [], KINDS = ['scrap', 'lanky', 'unicycle', 'analyst'];
  var SPOTS = [[-6, 54, 180], [16, 40, -90], [6, 136, 180], [15, 146, -90]];   // hall steps, shop door, inn door, workshop door (checked vs realm-kit colliders)
  ['grid', 'void', 'desert', 'volcano', 'forest', 'suburb', 'meadow', 'ocean', 'darkforest', 'arctic'].forEach(function (r, i) {
    for (var k = 0; k < 2; k++) { var sp = SPOTS[(i + k * 2) % 4]; STATION_POSTS.push([KINDS[(i + k) % 4], r, sp[0], sp[1], sp[2]]); }
  });
  // realm colourways for the bots (body, head, eye, accent)
  var STYLE = { grid: [0x1a1f26, 0x2a3038, 0x27e0ff, 0xe8c45c], void: [0x1a1226, 0x2a1d3a, 0xb06cff, 0x9b59f5], desert: [0xc9a46a, 0xe3c995, 0xff7a18, 0x6b4a2a],
    volcano: [0x3a2c26, 0x5a453b, 0xff6a30, 0xff4a1a], forest: [0x3a4a30, 0x5a6b40, 0x3ddc84, 0x8a6a3a], suburb: [0xd9dde2, 0x9aa8b8, 0x3ad6c8, 0x55606c],
    meadow: [0xe9dcc0, 0x8a5a34, 0x8fd06a, 0xb85a3a], ocean: [0xf2f0ea, 0x2f4a5c, 0x5fe0ff, 0xc2a176], darkforest: [0x232c36, 0x3a4858, 0x9fd8ff, 0x2a3a4a], arctic: [0xdfeefa, 0x7c97ad, 0xaaddff, 0x5d6b78] };
  function fixedPosts(L) {
    var out = [];
    // Race HQ (world-race-hq.js POS_M e:1737 n:-302.9, grp yaw -0.182, model x1.5): its door is the GLB's hook_door at local +x 36 m
    // (= 54 m). The mechanic stands 8 m outside it, facing out toward arriving racers. three rotation.y maps local +x to (cos, -sin).
    var hx = 1737 * PM, hz = 302.9 * PM, hy = -0.182, d = (36 * 1.5 + 8) * PM;
    out.push({ file: 'unicycle', realm: 'grid', x: hx + Math.cos(hy) * d, z: hz - Math.sin(hy) * d, yaw: hy + Math.PI / 2, label: 'race-hq' });
    // Colosseum: world-colosseum.js publishes COLOSSEUM_WORLD (door point + front axis; the lobby faces OUTWARD since 2026-10-15).
    // Two sentries flank the lobby steps: 10 m out from the door, 14 m to each side, facing out — the doorway stays clear.
    var cw = root.COLOSSEUM_WORLD;
    if (cw && cw.door && cw.front) {
      var fX = cw.front[0], fZ = cw.front[1], sX = fZ, sZ = -fX, fy = Math.atan2(fX, fZ);
      [-1, 1].forEach(function (sd) { out.push({ file: 'lanky', realm: 'grid', x: cw.door[0] + (fX * 10 + sX * 14 * sd) * PM, z: cw.door[1] + (fZ * 10 + sZ * 14 * sd) * PM, yaw: fy, label: 'colosseum-' + (sd < 0 ? 'l' : 'r') }); });
    }
    return out;
  }
  function stationPosts(transit) {
    var st = (transit && transit.stations || []).filter(function (t) { return t.onRing !== false && t.realm && t.group; }), out = [];
    STATION_POSTS.forEach(function (p) {
      var s = st.filter(function (t) { return t.realm === p[1]; })[0]; if (!s) return;
      var x0 = s.group.position.x, z0 = s.group.position.z, rot = s.group.rotation.y, c = Math.cos(rot), sn = Math.sin(rot), lx = p[2] * PM, lz = p[3] * PM;
      out.push({ file: p[0], realm: p[1], x: x0 + lx * c + lz * sn, z: z0 - lx * sn + lz * c, yaw: rot + p[4] * Math.PI / 180, label: p[1] + '-' + out.length });   // same transform as world-realm-kits placements()
    });
    return out;
  }

  root.buildWorldTownsfolk = function (o) {
    if (typeof location !== 'undefined' && /[?&]townsfolk=0/.test(location.search || '')) return null;
    var THREE = o.THREE, heightAt = o.heightAt || function () { return 0; }, clone = o.cloneSkinned;
    if (!THREE || !o.scene || !o.GLTFLoader || !clone) return null;
    var group = new THREE.Group(); group.name = 'world-townsfolk'; o.scene.add(group);
    var posts = stationPosts(o.transit).concat(fixedPosts(root.WORLD_LAYOUT));
    var loader = new o.GLTFLoader(); if (o.meshopt) loader.setMeshoptDecoder(o.meshopt); if (o.draco) loader.setDRACOLoader(o.draco);
    var files = {}, npcs = [], stats = { posts: posts.length, loaded: 0, failed: 0, animating: 0 }, alive = true;
    function getFile(name) {
      if (!files[name]) files[name] = new Promise(function (res) {
        (root.__queueLoad || function (l, u, a, b) { l.load(u, a, undefined, b); })(loader, BASE + name + '.glb' + V, res, function (e) { console.warn('[townsfolk] ' + name + ' failed: ' + (e && (e.message || e))); res(null); });
      });
      return files[name];
    }
    function spawn(p) {
      p.loading = true;
      var B = root.WorldBotBodies; if (!B || !B.build) { stats.failed++; return; }
      var st = STYLE[p.realm] || STYLE.grid, bot;
      try { bot = B.build(THREE, p.file, { body: st[0], head: st[1], eye: st[2], accent: st[3] }); } catch (e) { stats.failed++; console.warn('[townsfolk] bot ' + p.file + ': ' + (e && e.message)); return; }
      var m = bot.root; m.scale.setScalar(PM);
      m.traverse(function (n) { if (n.isMesh) { n.castShadow = true; n.receiveShadow = true; } });
      var holder = new THREE.Group(); holder.name = 'npc-' + p.file + '-' + p.label; holder.add(m);
      holder.position.set(p.x, heightAt(p.x, p.z), p.z); holder.rotation.y = p.yaw; group.add(holder);
      var mixer = new THREE.AnimationMixer(m), C = bot.clips || {}, idle = C.idle ? mixer.clipAction(C.idle) : null, wave = C.wave ? mixer.clipAction(C.wave) : null;
      if (idle) { idle.time = Math.random() * C.idle.duration; idle.play(); mixer.update(0.0001); }
      if (wave) { wave.setLoop(THREE.LoopOnce, 1); wave.clampWhenFinished = false; }
      npcs.push({ p: p, holder: holder, mixer: mixer, yaw: p.yaw, idle: idle, wave: wave, waved: false });
      stats.loaded++;
      if (root.__registerPlaceable) root.__registerPlaceable('npc:' + p.file + '@' + p.label, holder, { source: 'world-townsfolk.js', id: p.file });
    }
    var last = 0, raf = 0;
    function tick(t) {
      if (!alive) return; raf = requestAnimationFrame(tick);
      var dt = last ? Math.min(0.1, (t - last) / 1000) : 0; last = t;
      var pl = o.getPlayer && o.getPlayer(); if (!pl) return;
      for (var i = 0; i < posts.length; i++) { var q = posts[i]; if (!q.loading) { var dx = q.x - pl.x, dz = q.z - pl.z; if (dx * dx + dz * dz < LOAD_M * LOAD_M * PM * PM) spawn(q); } }
      var anim = 0;
      for (var k = 0; k < npcs.length; k++) {
        var n = npcs[k], h = n.holder, ex = pl.x - h.position.x, ez = pl.z - h.position.z, d2 = ex * ex + ez * ez;
        h.visible = d2 < SHOW_M * SHOW_M * PM * PM; if (!h.visible) continue;
        if (d2 < ANIM_M * ANIM_M * PM * PM) { n.mixer.update(dt); anim++; }
        var near = d2 < FACE_M * FACE_M * PM * PM;
        if (near && !n.waved && n.wave) { n.waved = true; n.wave.reset().play(); if (n.idle) n.idle.crossFadeTo(n.wave, 0.2, false); setTimeout(function (q) { return function () { if (q.idle) { q.idle.reset().play(); q.wave.crossFadeTo(q.idle, 0.3, false); } }; }(n), 1600); }
        if (!near) n.waved = false;
        var want = near ? Math.atan2(ex, ez) : n.p.yaw, dy = Math.atan2(Math.sin(want - n.yaw), Math.cos(want - n.yaw));
        if (Math.abs(dy) > 0.002) { n.yaw += dy * Math.min(1, dt * 4); h.rotation.y = n.yaw; }
      }
      stats.animating = anim;
    }
    raf = requestAnimationFrame(tick);
    console.info('[townsfolk] ' + posts.length + ' posts: ' + posts.map(function (p) { return p.file + '@' + p.label; }).join(', '));
    return {
      group: group, posts: posts,
      stats: function () { return Object.assign({}, stats, { spawned: npcs.length }); },
      dispose: function () { alive = false; cancelAnimationFrame(raf); npcs.forEach(function (n) { n.mixer.stopAllAction(); }); o.scene.remove(group); }
    };
  };
})(typeof window !== 'undefined' ? window : this);
