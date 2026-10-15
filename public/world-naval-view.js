/* world-naval-view.js — NAVAL BATTLE you can PLAY (owner 2026-10-01): first-person boat combat in the Colosseum water field. Draws world-naval.js (the rules) with code-built meshes,
 * puts the camera on your bow, adds the HUD, the controls and a mode / boat picker. Closed-loop Sparks rewards, capped per day.
 *
 *   var N = WorldNavalGame.create({ THREE, getArena: () => window.__colosseumArena, enter?: () => teleport+field('water') })
 *   N.open() -> picker panel · N.start({ mode:'fleet'|'hunt'|'salvage', cls:'galleon'|'skimmer'|'nautilus' }) · N.stop() · N.active()
 *   per frame (host): N.update(dt) then N.applyCamera(camera) when active.  While active the host must not walk the avatar: window.__noWalk = true (set here).
 * Controls: W/S throttle · A/D turn · Space or click = fire (galleon: starboard broadside) · Q or right-click or Shift = alt (galleon: port broadside / nautilus torpedo) · E or X = special (skimmer boost / nautilus dive) · Esc = leave
 * All geometry is authored in METRES in arena.root (root.scale = U), like world-colosseum-floors.js. Water surface y = 0.7 m.
 */
(function (root) {
  'use strict';
  var WATER_Y = 0.7, REWARD_CAP = 250, RKEY = 'shd_naval_day_v1';
  var MODES = { fleet: { name: 'Fleet Battle', note: 'Two fleets, last ship afloat. Sea monsters wake after a minute.', ais: { A: 1, B: 3 } }, hunt: { name: 'Monster Hunt', note: 'Co-op: five waves of serpents, a kraken every third wave.', ais: { A: 2 } }, salvage: { name: 'Salvage Run', note: 'Grab crates from the water (first to 12). Monsters roam. Ramming is allowed.', ais: { B: 1, C: 1 } } };
  function today() { return new Date().toISOString().slice(0, 10); }
  function dayReward() { try { var j = JSON.parse(root.localStorage.getItem(RKEY) || 'null'); if (j && j.d === today()) return j.n; } catch (e) { } return 0; }
  function addReward(n) { var have = dayReward(), give = Math.max(0, Math.min(n, REWARD_CAP - have)); if (give > 0) { try { root.localStorage.setItem(RKEY, JSON.stringify({ d: today(), n: have + give })); } catch (e) { } if (root.ShdSparks && root.ShdSparks.add) root.ShdSparks.add(give, 'naval', 'battle'); } return give; }
  function el(tag, css, html) { var e = document.createElement(tag); if (css) e.style.cssText = css; if (html != null) e.innerHTML = html; return e; }

  /* BLENDER K24 boats (2026-10-15, owner ref: tall-ship broadside video): WorldNavalGame.loadKit(THREE, GLTFLoader) preloads
     galleon / skimmer / nautilus; boats spawned after that use them, earlier ones keep the code meshes. ?navalkit=0 = code meshes. */
  var KIT = {}, kitP = null;
  function loadKit(THREE, GLTFLoader, url) {
    if (kitP) return kitP;
    kitP = new Promise(function (res) { new GLTFLoader().load(url || '/assets/kits/shaddai_naval_v01.glb', function (gl) { var n = 0, list = [];
      gl.scene.traverse(function (c) { var m = /^naval_(galleon|skimmer|nautilus)$/.exec(c.name); if (m) list.push([m[1], c]); });
      list.forEach(function (e) { if (e[1].parent) e[1].parent.remove(e[1]); e[1].position.set(0, 0, 0); KIT[e[0]] = e[1]; n++; }); res(n);
    }, undefined, function () { console.warn('[naval] Blender boat kit missing'); res(0); }); });
    return kitP;
  }

  function create(o) {
    var BSF = o.broadside != null ? !!o.broadside : !(root.location && /[?&]broadside=0(&|$)/.test(root.location.search || '')), bs = null, view = 'cockpit', chaseYaw = 0, boomFn = null;   // WorldBroadside FX + chase camera: ON by default since 2026-10-15 (owner ref: broadside smoke video); ?broadside=0 = off
    function wrapA(a) { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; }
    var THREE = o.THREE, WN = root.WorldNaval, game = null, group = null, objs = {}, fxs = [], keys = {}, seen = {}, me = 'you', mode = 'fleet', hud = null, panel = null, shake = 0, msgT = 0, tNow = 0, camYaw = 0, ended = null, shotPool = [], teamCol = { A: 0x27e0ff, B: 0xff4a5e, C: 0xffcf4a, crew: 0x27e0ff };
    function mat(c, e) { return new THREE.MeshStandardMaterial({ color: c, roughness: 0.6, metalness: 0.2, emissive: e || 0x000000, emissiveIntensity: e ? 0.6 : 0 }); }
    var M = { wood: mat(0x6b4a2a), dark: mat(0x1d232b), metal: mat(0x9aa8b6), sail: new THREE.MeshStandardMaterial({ color: 0xf0e6cc, roughness: 0.9, side: THREE.DoubleSide, emissive: 0x8a7a5a, emissiveIntensity: 0.55 }), glass: mat(0x2a4a5a, 0x1a6a8a) };

    // ---------- meshes ----------
    function boatMesh(b) {
      var g = new THREE.Group(), col = teamCol[b.team] || 0xffffff, trim = mat(col, col), body = new THREE.Group(); g.add(body); g.userData.body = body;
      var kitB = KIT[b.cls] && !/[?&]navalkit=0/.test(root.location ? root.location.search : '') ? KIT[b.cls] : null;   // Blender K24 boat (team trim re-tinted)
      if (kitB) { var kc = kitB.clone(true); kc.traverse(function (m) { if (m.isMesh && m.material && /naval_trim/.test(m.material.name)) m.material = trim; }); body.add(kc); return g; }
      if (b.cls === 'galleon') {
        var hull = new THREE.Mesh(new THREE.BoxGeometry(4.6, 2.2, 9), M.wood); hull.position.y = 0.9; body.add(hull);
        var bow = new THREE.Mesh(new THREE.ConeGeometry(2.3, 3.2, 4), M.wood); bow.rotation.x = Math.PI / 2; bow.rotation.y = Math.PI / 4; bow.position.set(0, 0.9, 6.1); bow.scale.set(1, 1, 0.55); body.add(bow);
        var stern = new THREE.Mesh(new THREE.BoxGeometry(4.2, 2.6, 2.6), M.wood); stern.position.set(0, 2.1, -3.4); body.add(stern); var band = new THREE.Mesh(new THREE.BoxGeometry(4.7, 0.25, 9.2), trim); band.position.y = 2.0; body.add(band);
        [-1.5, 1.8].forEach(function (z) { var m = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 8, 6), M.dark); m.position.set(0, 5.2, z); body.add(m); var s = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 4.6), M.sail); s.position.set(0, 5.6, z + 0.15); body.add(s); });
        [-1, 1].forEach(function (sd) { for (var i = 0; i < 3; i++) { var c = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.25, 1.3, 6), M.dark); c.rotation.z = Math.PI / 2; c.position.set(sd * 2.5, 1.4, -2 + i * 2.2); body.add(c); } });
      } else if (b.cls === 'skimmer') {
        var w = new THREE.Mesh(new THREE.ConeGeometry(1.5, 6.2, 4), mat(0x20303c, col)); w.rotation.x = Math.PI / 2; w.rotation.y = Math.PI / 4; w.scale.set(1, 1, 0.45); w.position.set(0, 0.7, 0.4); body.add(w);
        var cp = new THREE.Mesh(new THREE.SphereGeometry(0.75, 10, 8), M.glass); cp.scale.set(1, 0.6, 1.6); cp.position.set(0, 1.25, -0.2); body.add(cp);
        [-1, 1].forEach(function (s) { var f = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.9, 1.8), trim); f.position.set(s * 1.25, 0.9, -1.8); f.rotation.z = s * 0.35; body.add(f); }); var gl = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.2, 2.4), new THREE.MeshBasicMaterial({ color: col })); gl.position.set(0, 0.9, -2.7); body.add(gl);
      } else {
        var cap = new THREE.Mesh(new THREE.CapsuleGeometry(1.35, 5.2, 4, 10), mat(0x3b4a58)); cap.rotation.x = Math.PI / 2; cap.position.y = 0.2; body.add(cap);
        var tw = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.3, 2.0), mat(0x2b3844)); tw.position.set(0, 1.5, -0.4); body.add(tw); var pr = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.4, 5), M.dark); pr.position.set(0, 2.5, 0.1); body.add(pr);
        var st = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.14, 0.7), trim); st.position.set(0, 0.5, -2.8); body.add(st);
      }
      return g;
    }
    function serpentMesh() { var g = new THREE.Group(), segs = []; for (var i = 0; i < 9; i++) { var s = new THREE.Mesh(new THREE.SphereGeometry(1.5 - i * 0.12, 10, 8), mat(i === 0 ? 0x2f7d4a : 0x275f3a, i === 0 ? 0xb6ff3a : 0)); g.add(s); segs.push(s); } g.userData.segs = segs; return g; }
    function krakenMesh() { var g = new THREE.Group(), body = new THREE.Mesh(new THREE.SphereGeometry(4.5, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.6), mat(0x5a2f6a, 0x7a2f9a)); g.add(body); var tents = [];
      for (var i = 0; i < 8; i++) { var t = new THREE.Group(), a = i / 8 * Math.PI * 2; for (var k = 0; k < 5; k++) { var sg = new THREE.Mesh(new THREE.SphereGeometry(0.9 - k * 0.12, 8, 6), mat(0x4a2559)); sg.position.y = 1 + k * 1.3; t.add(sg); } t.position.set(Math.cos(a) * 3.2, 0, Math.sin(a) * 3.2); g.add(t); tents.push(t); } g.userData.tents = tents;
      [-1, 1].forEach(function (s) { var e = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff3a3a })); e.position.set(s * 1.4, 3, 3.4); g.add(e); }); return g; }
    function pickMesh(kind) { var c = { ammo: 0xff9a2a, repair: 0x34e56a, shield: 0x3aa0ff, speed: 0xffe03a, crate: 0xb07a3a }[kind] || 0xffffff, g = new THREE.Group(), m = kind === 'crate' ? new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.4, 1.6), mat(c, 0x553311)) : new THREE.Mesh(new THREE.OctahedronGeometry(1.1), mat(c, c)); m.position.y = 1.1; g.add(m); var beam = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 14, 6), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.35, depthWrite: false })); beam.position.y = 7; g.add(beam); g.userData.m = m; return g; }
    function shotMesh(kind) { var m = kind === 'energy' ? new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 2.4, 3, 6), new THREE.MeshBasicMaterial({ color: 0x7dffff })) : kind === 'torpedo' ? new THREE.Mesh(new THREE.CapsuleGeometry(0.35, 1.8, 3, 8), mat(0xdde6ee, 0x2a4a6a)) : new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), mat(0x20242a)); m.rotation.x = Math.PI / 2; var g = new THREE.Group(); g.add(m); return g; }
    function fx(kind, x, z, r, col) { var m = new THREE.Mesh(kind === 'ring' ? new THREE.RingGeometry(0.85, 1, 32) : new THREE.SphereGeometry(1, 10, 8), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false })); if (kind === 'ring') m.rotation.x = -Math.PI / 2; m.position.set(x, WATER_Y + (kind === 'ring' ? 0.15 : 1), z); group.add(m); fxs.push({ m: m, t: 0, dur: kind === 'ring' ? 0.9 : 0.45, r: r, ring: kind === 'ring' }); }

    // ---------- lifecycle ----------
    function start(cfg) {
      stop(); var A = o.getArena && o.getArena(); if (!A || !A.root) { toast('The Colosseum arena is not ready yet'); return false; }
      if (o.enter) o.enter(); mode = cfg.mode || 'fleet'; var cls = cfg.cls || 'skimmer', M0 = MODES[mode], boats = [{ id: me, cls: cls, team: mode === 'salvage' ? 'A' : (mode === 'hunt' ? 'crew' : 'A'), name: 'You' }], teams = Object.keys(M0.ais), cl = ['galleon', 'skimmer', 'nautilus'];
      teams.forEach(function (tm) { for (var i = 0; i < M0.ais[tm]; i++) boats.push({ id: 'ai-' + tm + i, cls: cl[(i + (tm === 'B' ? 1 : 0) + boats.length) % 3], team: tm === 'A' && mode === 'hunt' ? 'crew' : tm, ai: true, name: 'AI ' + tm + (i + 1) }); });
      var dims = A.dims || { A: 62, B: 44 }; game = WN.create({ mode: mode, A: dims.A * 0.9, B: dims.B * 0.9, seed: (Date.now() & 0xffff) | 1, boats: boats, monsters: mode === 'fleet' ? true : undefined });
      group = new THREE.Group(); group.name = 'naval-play'; A.root.add(group); objs = { boats: {}, mons: {}, picks: {}, shots: {} }; fxs = []; ended = null; shake = 0; window.__noWalk = true;
      game.state().boats.forEach(function (b) { var m = boatMesh(b); group.add(m); objs.boats[b.id] = m; });
      if (BSF && root.WorldBroadside && root.WorldRNG) {
        if (!boomFn) { boomFn = o.audio || null; if (!boomFn && root.AudioContext && root.WorldBroadside.synthBoom) { var lazy = null; boomFn = function (k, v) { try { lazy = lazy || root.WorldBroadside.synthBoom(new root.AudioContext()); lazy(k, v); } catch (e) { } }; } }
        bs = root.WorldBroadside.create({ THREE: THREE, scene: group, rng: root.WorldRNG.create(((Date.now() & 0xffff) | 1) ^ 0x5bd1), waterHeightAt: function () { return WATER_Y; }, baseY: WATER_Y, vfx: root.__vfx || null, audio: boomFn });
      }
      view = cfg.view === 'chase' && BSF ? 'chase' : 'cockpit'; chaseYaw = 0;
      if (A.floors) A.floors.autoBattle = false;   // the old AI-vs-AI galleys step aside while you play
      try { if (A.setField) A.setField('water'); } catch (e) { }
      buildHud(); if (panel) { panel.remove(); panel = null; } bindKeys(true); toast(MODES[mode].name + ' - ' + WN.CLASSES[cls].name); return true;
    }
    function stop() {
      if (!group) return; var A = o.getArena && o.getArena(); if (A && A.root) { A.root.remove(group); if (A.floors) { A.floors.autoBattle = true; try { if (A.floors.state && A.floors.state.mode === 'water') A.setField('water'); } catch (e) { } } }
      if (bs) { bs.dispose(); bs = null; } group = null; game = null; window.__noWalk = false; bindKeys(false); if (hud) { hud.remove(); hud = null; }
    }
    function toast(m) { if (root.Navi && root.Navi.toast) root.Navi.toast(m); }

    // ---------- input ----------
    function onKey(e) { if (/input|textarea|select/i.test((document.activeElement || {}).tagName || '')) return; if (e.code === 'Escape') { stop(); e.preventDefault(); return; } if (BSF && e.code === 'KeyC') { if (e.type === 'keydown' && !e.repeat) view = view === 'chase' ? 'cockpit' : 'chase'; seen.KeyC = 1; e.preventDefault(); e.stopPropagation(); return; } if (['KeyW', 'KeyS', 'KeyA', 'KeyD', 'Space', 'KeyQ', 'KeyE', 'KeyX', 'ShiftLeft', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].indexOf(e.code) >= 0) { keys[e.code] = e.type === 'keydown'; seen[e.code] = 1; e.preventDefault(); e.stopPropagation(); } }
    function onMouse(e) { if (e.button === 0) keys.Mouse0 = e.type === 'mousedown'; else if (e.button === 2) { keys.Mouse2 = e.type === 'mousedown'; e.preventDefault(); } }
    function noCtx(e) { e.preventDefault(); }
    function bindKeys(on) { var f = on ? addEventListener : removeEventListener; f('keydown', onKey, true); f('keyup', onKey, true); f('mousedown', onMouse, true); f('mouseup', onMouse, true); f('contextmenu', noCtx, true); if (!on) { keys = {}; if (typeof KeyboardEvent !== 'undefined' && typeof dispatchEvent === 'function') Object.keys(seen).forEach(function (c) { try { dispatchEvent(new KeyboardEvent('keyup', { code: c })); } catch (e) { } }); seen = {}; } }   // the host never saw our keyups: tell it every swallowed key is released
    function inputs() { var k = keys; return (function () { var i = {}; i[me] = { thr: (k.KeyW || k.ArrowUp ? 1 : 0) - (k.KeyS || k.ArrowDown ? 0.6 : 0), turn: (k.KeyD || k.ArrowRight ? 1 : 0) - (k.KeyA || k.ArrowLeft ? 1 : 0), fire: !!(k.Space || k.Mouse0), alt: !!(k.KeyQ || k.Mouse2 || k.ShiftLeft), special: !!(k.KeyE || k.KeyX) }; i[me].turn *= -1; return i; })(); }   // turn: D = starboard; the sim's +turn increases psi (toward +x), which is port when facing +z, so flip

    // ---------- HUD ----------
    function buildHud() {
      hud = el('div', 'position:fixed;inset:0;pointer-events:none;z-index:7450;font:700 14px Rajdhani,sans-serif;color:#e9f4ee;text-shadow:0 1px 3px #000');
      hud.innerHTML = '<div id="nvTop" style="position:absolute;left:50%;top:12px;transform:translateX(-50%);text-align:center;font:900 15px Orbitron,sans-serif;letter-spacing:.12em"></div><div id="nvMsg" style="position:absolute;left:50%;top:22%;transform:translateX(-50%);font:900 26px Orbitron,sans-serif;color:#ffd24a;opacity:0"></div>' +
        '<div style="position:absolute;left:50%;top:50%;width:26px;height:26px;margin:-13px 0 0 -13px;border:2px solid rgba(255,255,255,.7);border-radius:50%"></div><div id="nvBot" style="position:absolute;left:50%;bottom:26px;transform:translateX(-50%);width:min(90vw,460px)"></div><div id="nvTint" style="position:absolute;inset:0;background:rgba(10,60,120,.0)"></div><div id="nvEnd" style="position:absolute;inset:0;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.55);font:900 30px Orbitron,sans-serif;text-align:center;pointer-events:auto"></div>';
      document.body.appendChild(hud);
    }
    function bar(label, k, col) { return '<div style="display:flex;align-items:center;gap:8px;margin:3px 0"><span style="width:112px">' + label + '</span><span style="flex:1;height:9px;border:1px solid rgba(255,255,255,.35);background:rgba(0,0,0,.45)"><i style="display:block;height:100%;width:' + Math.round(Math.max(0, Math.min(1, k)) * 100) + '%;background:' + col + '"></i></span></div>'; }
    function updateHud(s, b) {
      if (!hud) return; var C = WN.CLASSES[b.cls], q = function (i) { return hud.querySelector(i); }, sc = Object.keys(s.score).map(function (k) { return k + ' ' + s.score[k]; }).join('  ·  ');
      q('#nvTop').innerHTML = MODES[mode].name.toUpperCase() + '  ·  ' + Math.ceil(s.timeLeft) + 's' + (mode === 'hunt' ? '  ·  WAVE ' + s.wave + '/5' : '') + '<div style="font:700 12px Rajdhani,sans-serif;opacity:.8">' + sc + '</div>';
      var h = bar('HULL', b.hp / b.hpMax, b.hp / b.hpMax > 0.35 ? '#34e56a' : '#ff4a5e'); if (b.shield > 0) h += bar('SHIELD', b.shield / 45, '#3aa0ff');
      if (b.cls === 'galleon') h += bar('CANNONBALLS', b.ammo / 40, '#ff9a2a') + '<div style="font-size:11px;opacity:.7">Space / click = starboard · Q / right-click = port</div>';
      else if (b.cls === 'skimmer') h += bar(b.locked ? 'OVERHEAT' : 'HEAT', b.heat / 100, b.locked ? '#ff3a3a' : '#7dffff') + bar('BOOST', 1 - b.boostCd / C.boostCd, '#ffe03a') + '<div style="font-size:11px;opacity:.7">Space = energy cannon · E = boost</div>';
      else h += bar('TORPEDOES', b.torp / 10, '#dde6ee') + bar(b.sub ? 'DIVING' : 'AIR', b.subLeft / C.diveS, '#3aa0ff') + '<div style="font-size:11px;opacity:.7">Space = torpedo · E = dive (cannon-proof)</div>';
      q('#nvBot').innerHTML = h; q('#nvTint').style.background = b.sub ? 'rgba(10,60,120,.35)' : 'rgba(10,60,120,0)';
      if (msgT > 0) { msgT -= 0.016; q('#nvMsg').style.opacity = Math.min(1, msgT); }
    }
    function say(t) { if (!hud) return; var m = hud.querySelector('#nvMsg'); m.textContent = t; msgT = 1.8; m.style.opacity = 1; }
    function finish(winner, why) {
      var s = game.state(), my = s.boats.filter(function (b) { return b.id === me; })[0], won = mode === 'hunt' ? why === 'cleared' : winner === my.team, reward = 0;
      if (mode === 'fleet') reward = won ? 40 : 8; else if (mode === 'hunt') reward = Math.min(60, s.wave * 12) + (won ? 30 : 0); else reward = (my.crates || 0) * 4 + (won ? 20 : 0);
      var given = addReward(reward); ended = { won: won, reward: given }; var e = hud && hud.querySelector('#nvEnd');
      if (e) { e.style.display = 'flex'; e.innerHTML = '<div>' + (won ? 'VICTORY' : (why === 'defeat' ? 'DEFEAT' : 'MATCH OVER')) + '<div style="font:700 16px Rajdhani,sans-serif;margin-top:10px">+' + given + ' Sparks' + (given < reward ? ' (daily cap)' : '') + ' · kills ' + my.kills + '</div><div style="margin-top:16px"><button id="nvAgain" style="pointer-events:auto;cursor:pointer;padding:8px 18px;border-radius:8px;border:1px solid #00ff9c;background:rgba(0,255,156,.2);color:#eafff6;font:700 14px Rajdhani,sans-serif">PLAY AGAIN</button> <button id="nvLeave" style="pointer-events:auto;cursor:pointer;padding:8px 18px;border-radius:8px;border:1px solid #888;background:rgba(0,0,0,.4);color:#ddd;font:700 14px Rajdhani,sans-serif">LEAVE</button></div></div>'; var cfg = { mode: mode, cls: my.cls }; e.querySelector('#nvAgain').onclick = function () { start(cfg); }; e.querySelector('#nvLeave').onclick = stop; }
    }

    // ---------- per frame ----------
    function update(dt) {
      if (!game) return; tNow += dt; dt = Math.min(dt, 0.1); game.step(dt, ended ? {} : inputs()); var s = game.state(), b = game.boat(me);
      s.boats.forEach(function (bb) { var m = objs.boats[bb.id]; if (!m) return; m.visible = bb.alive; m.position.set(bb.x, WATER_Y, bb.z); m.rotation.y = bb.psi; var body = m.userData.body; var dive = bb.sub ? 1 : 0; body.position.y += ((dive ? -1.6 : 0) - body.position.y) * Math.min(1, dt * 4); body.rotation.z = Math.sin(tNow * 1.3 + bb.x) * 0.03 + (-bb.v * 0.004); body.rotation.x = Math.sin(tNow * 0.9 + bb.z) * 0.02; });
      sync('mons', s.monsters.filter(function (m) { return m.alive; }), function (m) { return m.id; }, function (m) { return m.kind === 'kraken' ? krakenMesh() : serpentMesh(); }, function (m, g) {
        g.position.set(m.x, WATER_Y, m.z); g.rotation.y = m.psi || 0;
        if (m.kind === 'serpent') g.userData.segs.forEach(function (sg, i) { sg.position.set(Math.sin(tNow * 3 + i * 0.7) * 0.9, 0.2 + Math.max(0, Math.sin(tNow * 2 + i * 0.9)) * 0.9, -i * 1.5); });
        else g.userData.tents.forEach(function (t, i) { var rise = m.state === 'wind' ? 1.6 : 1; t.scale.y = rise * (0.9 + Math.sin(tNow * 2 + i) * 0.1); t.rotation.z = Math.sin(tNow * 1.5 + i) * 0.25; });
      });
      sync('picks', s.pickups, function (p) { return p.id; }, function (p) { return pickMesh(p.kind); }, function (p, g) { g.position.set(p.x, WATER_Y, p.z); g.userData.m.position.y = 1.1 + Math.sin(tNow * 2 + p.id) * 0.3; g.userData.m.rotation.y = tNow * 1.5; });
      sync('shots', s.shots, function (x) { return x.id; }, function (x) { return shotMesh(x.kind); }, function (x, g) { g.position.set(x.x, WATER_Y + (x.kind === 'torpedo' ? -0.2 : 1.6), x.z); g.rotation.y = Math.atan2(x.vx, x.vz); });
      game.drain().forEach(function (e) {
        if (bs && e.type === 'fire' && e.kind === 'cannon') { var fb = game.boat(e.id); if (fb && fb.cls === 'galleon' && bs.fire(wrapA(e.ang - fb.psi) > 0 ? 'starboard' : 'port', fb) && e.id === me) shake = Math.min(1, shake + 0.25); }   // 3 sim shots per broadside: first one fires the FX, the rest hit the 0.35 s cooldown
        if (e.type === 'hit' && e.id === me) { shake = Math.min(1, shake + (e.dmg || 5) / 40); } else if (e.type === 'hit' && e.id !== me && e.src === me) { var tb = game.boat(e.id); if (root.__hitfx) root.__hitfx.hit({ killed: !!tb && !tb.alive }); } else if (e.type === 'monster-hit' && e.by === me && root.__hitfx) root.__hitfx.hit({ killed: e.hp <= 0 });
        if (e.type === 'sunk') { var sb = game.boat(e.id); if (sb) fx('ball', sb.x, sb.z, 7, 0xff9a2a); say(e.id === me ? 'YOU WERE SUNK' : 'SUNK: ' + sb.name); }
        else if (e.type === 'kraken-wind') { fx('ring', e.x, e.z, 7, 0xff3a3a); say('KRAKEN!'); } else if (e.type === 'kraken-slam') fx('ring', e.x, e.z, e.r, 0xffffff);
        else if (e.type === 'monster') say(e.kind === 'kraken' ? 'A KRAKEN RISES' : 'SERPENT'); else if (e.type === 'wave') say('WAVE ' + e.n); else if (e.type === 'pickup' && e.id === me) say(e.kind.toUpperCase());
        else if (e.type === 'overheat' && e.id === me) say('OVERHEAT'); else if (e.type === 'dive' && e.id === me) say('DIVING'); else if (e.type === 'monster-dead') { var mm = s.monsters.filter(function (x) { return x.id === e.id; })[0]; if (mm) fx('ball', mm.x, mm.z, 6, 0xb06bff); }
        else if (e.type === 'end') finish(e.winner, e.why);
      });
      for (var i = fxs.length - 1; i >= 0; i--) { var f = fxs[i]; f.t += dt; var k = f.t / f.dur; f.m.scale.setScalar(Math.max(0.01, f.r * (f.ring ? (0.4 + k) : (0.3 + k)))); f.m.material.opacity = 0.8 * (1 - k); if (k >= 1) { group.remove(f.m); fxs.splice(i, 1); } }
      if (bs) bs.update(dt);
      if (b) updateHud(s, b);
    }
    function sync(key, list, idOf, make, place) {
      var seen = {}; list.forEach(function (it) { var id = idOf(it), g = objs[key][id]; if (!g) { g = make(it); group.add(g); objs[key][id] = g; } seen[id] = 1; place(it, g); });
      Object.keys(objs[key]).forEach(function (id) { if (!seen[id]) { group.remove(objs[key][id]); delete objs[key][id]; } });
    }
    var _v = null;
    function applyCamera(camera) {
      if (!game || !group) return; var b = game.boat(me); if (!b) return; var A = o.getArena(), C = WN.CLASSES[b.cls]; _v = _v || new THREE.Vector3();
      if (BSF && view === 'chase') {   // chase cam: behind and above, heading smoothed so turns swing the view; deterministic shake (no Math.random)
        if (!chaseYaw) chaseYaw = b.psi; chaseYaw = wrapA(chaseYaw + wrapA(b.psi - chaseYaw) * 0.08); var gal = b.cls === 'galleon', back = gal ? 20 : 11, hgt = gal ? 9 : 5, shk = shake * 0.5 * Math.sin(tNow * 53); shake = Math.max(0, shake - 0.03);
        _v.set(b.x - Math.sin(chaseYaw) * back, WATER_Y + hgt + shk, b.z - Math.cos(chaseYaw) * back); A.root.localToWorld(_v); camera.position.copy(_v);
        _v.set(b.x + Math.sin(b.psi) * 14, WATER_Y + (gal ? 3 : 1.5), b.z + Math.cos(b.psi) * 14); A.root.localToWorld(_v); camera.lookAt(_v); return;
      }
      var eye = b.cls === 'galleon' ? 5.2 : b.cls === 'skimmer' ? 1.9 : (b.sub ? 0.9 : 2.8), fw = b.cls === 'galleon' ? 3.5 : 0.8;
      _v.set(b.x + Math.sin(b.psi) * fw, WATER_Y + eye + (b.sub ? -1.0 : 0), b.z + Math.cos(b.psi) * fw); A.root.localToWorld(_v); camera.position.copy(_v);
      var sh = shake * 0.35; shake = Math.max(0, shake - 0.03); var ang = b.psi + (b.alive ? 0 : tNow * 0.3);
      _v.set(b.x + Math.sin(ang) * 40, WATER_Y + eye - 1.5 + sh * (Math.random() - 0.5), b.z + Math.cos(ang) * 40); A.root.localToWorld(_v); camera.lookAt(_v);
    }

    // ---------- picker ----------
    function open() {
      if (panel) panel.remove(); var sel = { mode: 'fleet', cls: 'skimmer' }; panel = el('div', 'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:9700;width:min(96vw,640px);max-height:88vh;overflow:auto;padding:18px;border-radius:14px;background:linear-gradient(180deg,rgba(14,20,34,.97),rgba(5,8,15,.98));border:1px solid rgba(39,224,255,.5);color:#e9f4ee;font:600 13px Rajdhani,sans-serif;box-shadow:0 20px 50px rgba(0,0,0,.65)');
      function draw() {
        var B = function (on) { return 'cursor:pointer;padding:10px;border-radius:10px;border:1px solid ' + (on ? '#00ff9c' : 'rgba(255,255,255,.18)') + ';background:' + (on ? 'rgba(0,255,156,.14)' : 'rgba(255,255,255,.04)') + ';flex:1;min-width:150px'; };
        var h = '<div style="display:flex;justify-content:space-between;color:#27e0ff;font:900 17px Orbitron,sans-serif;letter-spacing:.14em"><span>NAVAL BATTLE</span><span data-a="x" style="cursor:pointer">&#10005;</span></div><div style="opacity:.7;margin:6px 0 10px">Water-field game in the Colosseum. Rewards are Sparks (closed loop, ' + REWARD_CAP + '/day cap).</div><div style="color:#e8c45c;font-weight:700;margin-bottom:4px">MODE</div><div style="display:flex;gap:8px;flex-wrap:wrap">';
        Object.keys(MODES).forEach(function (k) { h += '<div data-m="' + k + '" style="' + B(sel.mode === k) + '"><b>' + MODES[k].name + '</b><br><small style="opacity:.75">' + MODES[k].note + '</small></div>'; });
        h += '</div><div style="color:#e8c45c;font-weight:700;margin:12px 0 4px">YOUR BOAT</div><div style="display:flex;gap:8px;flex-wrap:wrap">';
        Object.keys(WN.CLASSES).forEach(function (k) { var C = WN.CLASSES[k]; h += '<div data-c="' + k + '" style="' + B(sel.cls === k) + '"><b>' + C.name + '</b> <small style="opacity:.6">' + C.style + '</small><br><small>HULL ' + C.hp + ' · ARMOR ' + C.armor + ' · SPEED ' + C.speed + '</small><br><small style="opacity:.75">' + C.note + '</small></div>'; });
        h += '</div><div style="margin-top:14px;text-align:center"><button data-a="go" style="cursor:pointer;padding:10px 26px;border-radius:9px;border:1px solid #00ff9c;background:linear-gradient(180deg,rgba(0,255,156,.35),rgba(0,120,80,.5));color:#eafff6;font:900 14px Orbitron,sans-serif;letter-spacing:.1em">SET SAIL</button></div>'; panel.innerHTML = h;
      }
      panel.addEventListener('click', function (e) { var t = e.target.closest('[data-a],[data-m],[data-c]'); if (!t) return; if (t.dataset.m) { sel.mode = t.dataset.m; draw(); } else if (t.dataset.c) { sel.cls = t.dataset.c; draw(); } else if (t.dataset.a === 'x') { panel.remove(); panel = null; } else if (t.dataset.a === 'go') start(sel); });
      draw(); document.body.appendChild(panel);
    }
    return { open: open, start: start, stop: stop, active: function () { return !!game; }, update: update, applyCamera: applyCamera, game: function () { return game; }, broadside: function () { return bs; }, view: function () { return view; }, setView: function (v) { if (BSF) view = v === 'chase' ? 'chase' : 'cockpit'; }, MODES: MODES, _reward: addReward, _dayReward: dayReward };
  }
  root.WorldNavalGame = { create: create, loadKit: loadKit, _kit: KIT, MODES: MODES, REWARD_CAP: REWARD_CAP };
})(typeof window !== 'undefined' ? window : globalThis);
