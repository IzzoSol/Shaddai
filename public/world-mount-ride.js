/* world-mount-ride.js — ride your rigged MOUNTS (bull, mammoth, gorilla, hawk) in the SHADDAI world (2026-09-29).
 *
 * Classic script. Same shape the host already drives for the dragon ride, so the chase cam + seated rider (world-riders.js) just work:
 *   const ride = window.buildMountRide({ THREE, scene, loader, heightAt, playerPos, mounts: WorldMounts, spend, toast })
 *   ride.update(dt, {fwd,back,left,right,climb,dive})   every frame (also spawns/animates the parked mount)
 *   ride.isRiding() / saddle() {x,y,z,yaw,pitch,bank} / camera() {x,y,z,lx,ly,lz,fov} / tune.fovBase / boosting() / stamina()
 *   ride.summon(id)  put an OWNED mount beside you · ride.stow() · ride.mount() (nearest, E) · ride.dismount()
 *   ride.panel()     toggles the Mount Store DOM panel (key M): buy (Sparks, flying costs more), summon, stow
 * Ground mounts: W/S throttle, A/D turn, Shift = run. Flying mount (hawk): W thrust, Space climb, Shift dive/boost, min 2 m over ground.
 * Dismount (E/F): ground mount anywhere; flyer only within 4 m of the ground. Nothing here allocates per frame after the first spawn.
 */
(function (root) {
  'use strict';
  var U = 7 / 1.8;
  // per-mount feel (metres / seconds): tall = model height in m; walk/run m/s; turn rad/s; fly = { cruise, boost, climb }
  var FEEL = {
    bull:    { tall: 3.0, walk: 7,  run: 18, turn: 2.2 },
    mammoth: { tall: 4.6, walk: 5,  run: 12, turn: 1.4 },
    gorilla: { tall: 3.4, walk: 8,  run: 20, turn: 2.6 },
    'car-pod': { tall: 1.4, walk: 20, run: 42, turn: 2.4, hover: 0.55 }, 'car-sedan': { tall: 1.4, walk: 16, run: 32, turn: 2.0, hover: 0.55 }, 'car-van': { tall: 2.0, walk: 12, run: 24, turn: 1.6, hover: 0.55 },
    skiff:   { tall: 1.5, walk: 4,  run: 8,  turn: 2.4, fly: { cruise: 40, boost: 78, climb: 20, ceil: 400 } },
    hawk:    { tall: 2.6, walk: 4,  run: 8,  turn: 2.0, fly: { cruise: 26, boost: 48, climb: 14, ceil: 320 } }
  };
  function kartDef(id) { var m = /^kart-(.+)$/.exec(String(id)); return m ? { id: id, name: 'Kart ' + m[1], kind: 'mount', flying: false, model: null, procedural: 'car:' + m[1], saddle: 'saddle', kart: true } : null; }
  /* SHIP UPGRADES (world-skydock.js): engine = top speed, handling = turning; applies to every ride */
  function feelOf(id) { var f = feelBase(id), u = root.WorldSkyDock && root.WorldSkyDock.mult && root.WorldSkyDock.mult(); if (!u || (u.speed === 1 && u.turn === 1)) return f; var o2 = {}; for (var k in f) o2[k] = f[k]; o2.walk = f.walk * u.speed; o2.run = f.run * u.speed; o2.turn = f.turn * u.turn; return o2; }
  function feelBase(id) { if (FEEL[id]) return FEEL[id]; var m = /^kart-(.+)$/.exec(String(id)), k = m && root.WorldHoverCars && root.WorldHoverCars.KARTS && root.WorldHoverCars.KARTS[m[1]]; return k ? { tall: k.tall, walk: k.top * 0.7, run: k.top, turn: k.handle, hover: 0.55, accel: k.accel, weight: k.weight } : FEEL.bull; }
  var TUNE = { fovBase: 62, fovBoost: 8, summonDist: 6, mountRange: 9 };

  /* HOVER TILT (idea from the thruster-hovercar reference: one hover force per corner, so the body follows the ground): sample the ground ahead/behind/left/right of the car,
   * pitch with the slope, roll with the cross-slope, and lean into turns. Pure: gY(x,z) -> height (game units); returns radians. */
  function hoverTilt(gY, x, z, yaw, hl, hw, turn, speedK) {
    var sx = Math.sin(yaw), cz = Math.cos(yaw), hf = gY(x + sx * hl, z + cz * hl), hb = gY(x - sx * hl, z - cz * hl), hL = gY(x + cz * hw, z - sx * hw), hR = gY(x - cz * hw, z + sx * hw);
    return { pitch: -Math.atan2(hf - hb, 2 * hl) * 0.85, bank: Math.atan2(hL - hR, 2 * hw) * 0.25 + turn * speedK * 0.16 };
  }

  root.buildMountRide = function (o) {
    var THREE = o.THREE, scene = o.scene, loader = o.loader, heightAt = o.heightAt, playerPos = o.playerPos, Mo = o.mounts || root.WorldMounts;
    var edgeFn = null;   // setEdgeProvider(fn(x, z, y) -> {over, cx, cz} | null): invisible wall line along elevated race decks (host wires it for city circuits)
    var st = { riding: false, id: null, boosting: false }, MOD = { mul: 1, t: 0, stun: 0, noise: 0, nt: 0, turn: 1, tt: 0 }, raceMode = false;   // MOD = race modifiers (boost pads / items / stun / steer noise), set by world-race-run through raceAdapter()
    var M = { x: 0, z: 0, y: 0, yaw: 0, pitch: 0, bank: 0, sp: 0, vy: 0, def: null, fl: false };
    var SAD = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, bank: 0 };
    var CAM = { x: 0, y: 0, z: 0, lx: 0, ly: 0, lz: 0, fov: TUNE.fovBase, init: false };
    var holder = new THREE.Group(); holder.rotation.order = 'YXZ'; holder.visible = false; scene.add(holder);
    var cur = null, mixer = null, acts = {}, saddleNode = null, cache = {}, loading = null, tmp = new THREE.Vector3(), lastAnim = '';

    function approach(v, t, d) { return v < t ? Math.min(t, v + d) : Math.max(t, v - d); }
    function toast(m) { if (o.toast) o.toast(m); else if (root.Navi && root.Navi.toast) root.Navi.toast(m); }
    function gY(x, z) { return heightAt ? heightAt(x, z) : 0; }
    // WATER CRAFT (2026-10-11): the six-seat sub-hover and the Rimba pod ride ON the water surface (rivers, the Harbor Ring Canal, the sea) instead of sinking to the bed.
    var waterAt = o.waterAt, _wcFor = null, _wc = false;
    function isWaterCraft() { if (_wcFor !== cur) { _wcFor = cur; var m = /^kart-(.+)$/.exec(String(cur || '')), HC = root.WorldHoverCars, t = m && HC && HC.TYPES ? HC.TYPES.filter(function (x) { return x.id === m[1]; })[0] : null; _wc = !!(t && t.water); } return _wc; }
    function surfY(x, z) { var g = gY(x, z); if (waterAt && isWaterCraft()) { var w = waterAt(x, z); if (w != null && w > g) return w; } return g; }

    function load(id, done) {
      if (cache[id]) return done(cache[id]);
      var d = Mo.def(id) || kartDef(id); if (!d) { toast('Unknown ride: ' + id); return; }
      if (!d.model && d.procedural === 'skiff') { var sk = buildSkiff(); sk.scale.setScalar(U); cache[id] = { scene: sk, anims: [], def: d, proc: true }; return done(cache[id]); }   // authored in metres -> world units
      if (!d.model && d.procedural && d.procedural.indexOf('car:') === 0 && root.WorldHoverCars) { var dye = root.ShdInv && root.ShdInv.perk('dye'), cg = root.WorldHoverCars.buildGroup(THREE, d.procedural.slice(4), dye ? parseInt(String(dye).replace('#', ''), 16) : undefined);   /* Turtle dye tints the body */
       cg.scale.setScalar(U); cache[id] = { scene: cg, anims: [], def: d, proc: true }; return done(cache[id]); }
      if (!d.model) { toast(d.name + ' has no model yet'); return; }
      loader.load(d.model, function (g) {
        var root3 = g.scene, box = new THREE.Box3().setFromObject(root3), sz = new THREE.Vector3(); box.getSize(sz);
        var f = feelOf(id), k = f.tall * U / Math.max(sz.y, 0.001);
        root3.scale.multiplyScalar(k); root3.position.y -= box.min.y * k;   // feet on the ground
        root3.traverse(function (n) { if (n.isMesh || n.isSkinnedMesh) { n.frustumCulled = false; n.castShadow = false; } });
        cache[id] = { scene: root3, anims: g.animations || [], def: d }; done(cache[id]);
      }, undefined, function (e) { console.warn('[mount-ride] load failed', id, e && e.message); toast('Could not load ' + (d.name || id) + ' - try again'); });
    }
    function buildSkiff() {   // code-built hover ship: hull, canopy, wings, twin thrusters + underglow (Shaddai gold/cyan), ~1.5 m tall, +z forward
      var g = new THREE.Group(), hull = new THREE.MeshStandardMaterial({ color: 0x141a22, metalness: 0.85, roughness: 0.3, emissive: 0x0a2a30, emissiveIntensity: 0.6 }),
        gold = new THREE.MeshStandardMaterial({ color: 0xe8c45c, metalness: 0.9, roughness: 0.25 }), neon = new THREE.MeshBasicMaterial({ color: 0x27e0ff });
      var body = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 2.0, 6, 14), hull); body.rotation.x = Math.PI / 2; body.scale.set(1, 1, 0.55); body.position.y = 0.55; g.add(body);
      var can = new THREE.Mesh(new THREE.SphereGeometry(0.36, 16, 12), new THREE.MeshStandardMaterial({ color: 0x27e0ff, transparent: true, opacity: 0.55, metalness: 0.2, roughness: 0.05, emissive: 0x0a5a66 })); can.scale.set(1, 0.7, 1.6); can.position.set(0, 0.95, 0.15); g.add(can);
      var seat = new THREE.Object3D(); seat.name = 'saddle'; seat.position.set(0, 1.0, -0.15); g.add(seat);
      [-1, 1].forEach(function (sx) {
        var w = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.06, 0.8), gold); w.position.set(sx * 0.85, 0.5, -0.5); w.rotation.z = -sx * 0.12; g.add(w);
        var th = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.26, 0.5, 14), hull); th.rotation.x = Math.PI / 2; th.position.set(sx * 0.9, 0.5, -1.05); g.add(th);
        var fl = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.9, 12), neon); fl.rotation.x = -Math.PI / 2; fl.position.set(sx * 0.9, 0.5, -1.65); fl.name = 'flame'; g.add(fl);
      });
      var glow = new THREE.Mesh(new THREE.CircleGeometry(1.5, 24), new THREE.MeshBasicMaterial({ color: 0x27e0ff, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false })); glow.rotation.x = -Math.PI / 2; glow.position.y = 0.05; g.add(glow);
      var stripe = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, 2.2), neon); stripe.position.set(0, 0.86, 0); g.add(stripe);
      return g;
    }
    function show(id, x, z, yaw, auto) {
      load(id, function (c) {
        while (holder.children.length) holder.remove(holder.children[0]);
        holder.add(c.scene); cur = id; M.def = feelOf(id); M.fl = !!(c.def.flying && M.def.fly);
        M.x = x; M.z = z; M.y = gY(x, z) + (M.fl ? 0 : 0); M.yaw = yaw; M.sp = 0; M.pitch = 0; M.bank = 0; M.vy = 0;
        mixer = new THREE.AnimationMixer(c.scene); acts = {};
        c.anims.forEach(function (a) { acts[a.name] = mixer.clipAction(a); });
        saddleNode = null; c.scene.traverse(function (n) { if (n.name === (c.def.saddle || 'saddle')) saddleNode = n; });
        holder.visible = true; lastAnim = ''; play('idle', 0); if (auto) mount();
      });
    }
    function play(name, fade) {
      var want = (name === 'idle' && !acts.idle) ? null : name; if (want === lastAnim) return; lastAnim = want;
      Object.keys(acts).forEach(function (k) { var a = acts[k]; if (k === want) { a.enabled = true; a.reset().fadeIn(fade == null ? 0.25 : fade).play(); } else if (a.isRunning()) a.fadeOut(fade == null ? 0.25 : fade); });
    }
    function summon(id, auto) {
      root.__vehicleActionAt = (root.performance || Date).now();
      if (!Mo || !Mo.has(id)) { toast('You do not own that mount'); return false; }
      var s = Mo.summon(id); if (!s || s.kind !== 'mount') { toast('Boards are ridden with O'); return false; }
      var yaw = playerPos.__yaw != null ? playerPos.__yaw : 0, fx = Math.sin(yaw), fz = Math.cos(yaw);
      show(id, playerPos.x + fx * TUNE.summonDist * U, playerPos.z + fz * TUNE.summonDist * U, yaw + Math.PI, auto); toast(s.id + (auto ? ' summoned - E to dismount' : ' summoned - E to mount')); return true;
    }
    function summonKart(id) {   // free-roam ships / hover cars (2026-10-11 owner: "the ships aren't showing up" - they were race-select only)
      var kd = kartDef(id); if (!kd) { toast('Unknown ship'); return false; }
      if (st.riding) dismount();
      var yaw = playerPos.__yaw != null ? playerPos.__yaw : 0, fx = Math.sin(yaw), fz = Math.cos(yaw);
      show(id, playerPos.x + fx * TUNE.summonDist * U, playerPos.z + fz * TUNE.summonDist * U, yaw + Math.PI, true); toast('Boarding ' + kd.name + ' - E to get out'); return true;
    }
    function stow() { if (st.riding) return; holder.visible = false; cur = null; }
    function near() { return !!cur && holder.visible && Math.hypot(M.x - playerPos.x, M.z - playerPos.z) < TUNE.mountRange * U; }
    function mount() {
      root.__vehicleActionAt = (root.performance || Date).now();
      if (st.riding || !near()) return false; st.riding = true; st.id = cur; CAM.init = false;
      M.sp = 0; if (M.fl) M.y = gY(M.x, M.z); return true;
    }
    function dismount() {
      if (!st.riding) return false;
      if (M.fl && M.y - gY(M.x, M.z) > 4 * U) { toast('Land first (hold Shift to dive)'); return false; }
      st.riding = false; st.boosting = false; if (o.onDismount) o.onDismount(M.yaw); playerPos.x = M.x + Math.cos(M.yaw) * 3 * U; playerPos.z = M.z - Math.sin(M.yaw) * 3 * U; playerPos.y = gY(playerPos.x, playerPos.z); M.sp = 0; return true;
    }

    function update(dt, inp) {
      if (!holder.visible || !cur) return; inp = inp || {};
      if (MOD.t > 0) { MOD.t -= dt; if (MOD.t <= 0) MOD.mul = 1; } if (MOD.stun > 0) MOD.stun -= dt; if (MOD.nt > 0) { MOD.nt -= dt; if (MOD.nt <= 0) MOD.noise = 0; }
      var topK = (MOD.t > 0 ? MOD.mul : 1) * (MOD.stun > 0 ? 0.2 : 1);
      var f = M.def, ride = st.riding, thr = ride ? ((inp.fwd ? 1 : 0) - (inp.back ? 0.4 : 0)) : 0, turn = ride ? ((inp.left ? 1 : 0) - (inp.right ? 1 : 0)) : 0;
      st.boosting = ride && !!inp.dive && !!inp.fwd;
      if (ride) {
        if (MOD.tt > 0) MOD.tt -= dt; M.yaw += turn * f.turn * dt * (M.fl ? 1.1 : 1) * (MOD.tt > 0 ? (MOD.turn || 1) : 1);
        if (M.fl) {
          var cr = st.boosting && !(inp.climb) ? f.fly.boost : f.fly.cruise, want = (inp.fwd ? cr : (inp.back ? 0 : f.fly.cruise * 0.3)) * U;
          M.sp = approach(M.sp, want, 26 * U * dt);
          var vy = ((inp.climb ? 1 : 0) - (inp.dive && !inp.fwd ? 1 : 0) - (inp.dive && inp.fwd ? 0.5 : 0)) * f.fly.climb * U;
          M.vy = approach(M.vy, vy, 40 * U * dt);
          M.y = Math.max(gY(M.x, M.z) + 2 * U, Math.min(f.fly.ceil * U, M.y + M.vy * dt));
          M.pitch = approach(M.pitch, -M.vy / (f.fly.climb * U) * 0.5, 2 * dt); M.bank = approach(M.bank, turn * 0.5, 2.5 * dt);
        } else {
          var top = ((inp.dive || raceMode) ? f.run : f.walk) * U * topK; M.sp = approach(M.sp, thr * top * (MOD.stun > 0 ? 0 : 1), (thr ? (raceMode ? 22 * (f.accel ? 0.7 + 0.1 * f.accel : 1) : 14) : 24) * U * dt); if (MOD.noise > 0) M.yaw += (Math.random() - 0.5) * MOD.noise * dt * 5;
          if (f.hover) { var tl = hoverTilt(gY, M.x, M.z, M.yaw, 2.0 * U, 0.9 * U, turn, Math.min(1, Math.abs(M.sp) / Math.max(1, top))); M.pitch = approach(M.pitch, tl.pitch, 6 * dt); M.bank = approach(M.bank, tl.bank, 6 * dt); }   // hover cars follow slopes and lean into turns
          else { M.pitch = 0; M.bank = 0; }
        }
      } else { M.sp = approach(M.sp, 0, 30 * U * dt); M.vy = 0; if (M.fl) M.y = Math.max(gY(M.x, M.z), M.y - 20 * U * dt); }
      M.x += Math.sin(M.yaw) * M.sp * dt; M.z += Math.cos(M.yaw) * M.sp * dt;
      if (edgeFn && st.riding) { var eg = edgeFn(M.x, M.z, M.y); if (eg && eg.over) { M.x = eg.cx; M.z = eg.cz; M.sp *= 1 - Math.min(0.5, 2.2 * dt); } }   // wall: pulled back onto the deck edge, scrapes 2.2 /s
        var _rim = root.__worldRimU, _mr = Math.hypot(M.x, M.z); if (_rim && _mr > _rim) { M.x *= _rim / _mr; M.z *= _rim / _mr; }   // world edge (host sets __worldRimU)
      if (!M.fl) { var gy = surfY(M.x, M.z) + (f.hover || 0) * U; M.y += (gy - M.y) * Math.min(1, 14 * dt); }
      var bob = (cache[cur] && cache[cur].proc) ? Math.sin(performance.now() / 320) * 0.12 * U : 0;
      holder.position.set(M.x, M.y + bob, M.z); holder.rotation.set(M.pitch, M.yaw, M.bank);
      if (bob !== 0 && cache[cur].scene) cache[cur].scene.traverse(function (n) { if (n.name === 'flame') n.scale.y = 0.6 + Math.min(2.6, Math.abs(M.sp) / ((f.run || 30) * U) * 2.6) + Math.sin(performance.now() / 60) * 0.12; });
      if (cache[cur] && cache[cur].proc && cache[cur].scene) { var _boostOn = MOD.t > 0 && MOD.mul > 1.05; cache[cur].scene.traverse(function (n) { if (n.name === 'boostRing') n.visible = _boostOn; }); }
      if (mixer) {
        var spd = Math.abs(M.sp) / U;
        if (M.fl) play(ride && (M.sp > 4 * U || M.vy > 0) ? (st.boosting || M.vy > 0 ? 'fly' : 'glide') : (M.y - gY(M.x, M.z) > 3 * U ? 'glide' : 'idle'), 0.3);
        else play(spd > f.walk * 0.8 ? 'run' : (spd > 0.5 ? 'walk' : 'idle'), 0.25);
        mixer.update(dt);
      }
      holder.updateMatrixWorld(true);
      if (saddleNode) { saddleNode.getWorldPosition(tmp); SAD.x = tmp.x; SAD.y = tmp.y; SAD.z = tmp.z; }
      else { SAD.x = M.x; SAD.y = M.y + f.tall * U * 0.7; SAD.z = M.z; }
      SAD.yaw = M.yaw; SAD.pitch = -M.pitch; SAD.bank = -M.bank;   /* world-riders dragonVehicle applies pitchSign/bankSign -1 (the dragon ride's convention), so hand it negated angles: the rider tilts WITH the vehicle */
      if (ride) {
        playerPos.x = SAD.x; playerPos.y = SAD.y; playerPos.z = SAD.z;
        var back = f.tall * 3.4 * U, up = f.tall * 1.1 * U, tx = SAD.x - Math.sin(M.yaw) * back, tz = SAD.z - Math.cos(M.yaw) * back, ty = SAD.y + up;
        var lx = SAD.x + Math.sin(M.yaw) * 8 * U, lz = SAD.z + Math.cos(M.yaw) * 8 * U, ly = SAD.y + 0.5 * U, kk = CAM.init ? 1 - Math.exp(-6 * dt) : 1; CAM.init = true;
        CAM.x += (tx - CAM.x) * kk; CAM.y += (ty - CAM.y) * kk; CAM.z += (tz - CAM.z) * kk; CAM.lx += (lx - CAM.lx) * kk; CAM.ly += (ly - CAM.ly) * kk; CAM.lz += (lz - CAM.lz) * kk;
        CAM.fov = approach(CAM.fov, TUNE.fovBase + (st.boosting ? TUNE.fovBoost : 0), 20 * dt);
      }
    }

    // ── Mount Store panel (key M): buy / summon / stow ──
    var pnl = null;
    function panel(force) {
      if (typeof document === 'undefined') return;
      if (pnl) { pnl.remove(); pnl = null; if (force !== true) return; }
      pnl = document.createElement('div'); pnl.id = 'mountStore';
      pnl.style.cssText = 'position:fixed;right:18px;top:80px;z-index:9999;width:340px;max-height:calc(100vh - 110px);overflow-y:auto;background:rgba(6,8,11,.94);border:1px solid #e8c45c;border-radius:12px;padding:14px;color:#dfe9e4;font:13px system-ui;box-shadow:0 0 30px rgba(232,196,92,.25)';
      var h = '<div style="display:flex;justify-content:space-between;font-weight:700;color:#e8c45c;margin-bottom:8px"><span>MOUNT STORE</span><span id="msx" style="cursor:pointer">x</span></div><div style="font-size:11px;opacity:.7;margin-bottom:8px">Flying mounts cost more. You can lose a mount if it is destroyed - rebuy here. Sparks are closed-loop.</div>';
      Mo.CATALOG.filter(function (c) { return c.kind === 'mount'; }).forEach(function (c) {
        var own = Mo.has(c.id);
        h += '<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-top:1px solid #1d2a26"><span>' + c.name + (c.flying ? ' &#9992;' : '') + '<br><small style="opacity:.6">' + (own ? 'owned' : Mo.replaceCost(c.id) + ' Sparks') + '</small></span>' +
          '<button data-id="' + c.id + '" data-a="' + (own ? 'go' : 'buy') + '" style="background:#0d1a16;color:#00ff9c;border:1px solid #00ff9c;border-radius:8px;padding:5px 10px;cursor:pointer">' + (own ? 'Summon' : 'Buy') + '</button></div>';
      });
      if (root.__travel) { h += '<div style="font-weight:700;color:#e8c45c;margin:10px 0 4px">TRAVEL <small style="opacity:.6;font-weight:400">quick jump for testing</small></div><div style="display:flex;flex-wrap:wrap;gap:6px">';
        [['maglev', 'Maglev station'], ['park', 'Hoverskate park'], ['colosseum', 'Colosseum'], ['grid', 'The Grid']].forEach(function (t) { h += '<button data-a="travel" data-id="' + t[0] + '" style="background:#0d1a16;color:#00ff9c;border:1px solid #00ff9c;border-radius:8px;padding:4px 9px;cursor:pointer">' + t[1] + '</button>'; }); h += '</div>'; }
      h += '<div style="font-weight:700;color:#e8c45c;margin:10px 0 4px">HOVERBOARDS <small style="opacity:.6;font-weight:400">tricks, flight, Skate Jam</small></div>';
      Mo.CATALOG.filter(function (c) { return c.kind === 'board'; }).forEach(function (c) { var own = Mo.has(c.id); h += '<div style="display:flex;justify-content:space-between;align-items:center;padding:5px 0;border-top:1px solid #1d2a26"><span>' + c.name + (c.flying ? ' &#9992;' : '') + '<br><small style="opacity:.6">' + (own ? 'owned' : Mo.replaceCost(c.id) + ' Sparks') + '</small></span><button data-id="' + c.id + '" data-a="' + (own ? 'ride' : 'buy') + '" style="background:#0d1a16;color:#00ff9c;border:1px solid #00ff9c;border-radius:8px;padding:5px 10px;cursor:pointer">' + (own ? 'Ride' : 'Buy') + '</button></div>'; });
      var HC0 = root.WorldHoverCars;
      if (HC0 && HC0.TYPES && HC0.TYPES.length) { h += '<div style="font-weight:700;color:#e8c45c;margin:10px 0 4px">SHIPS &amp; CARS <small style="opacity:.6;font-weight:400">free to drive</small></div><div style="display:flex;flex-wrap:wrap;gap:6px">';
        HC0.TYPES.forEach(function (t) { h += '<button data-a="kart" data-id="kart-' + t.id + '" style="background:#0d1a16;color:#27e0ff;border:1px solid #27e0ff;border-radius:8px;padding:4px 9px;cursor:pointer">' + (t.name || t.id) + '</button>'; }); h += '</div>'; }
      if (root.__skateJam) h += '<div style="margin-top:6px"><button data-a="jam" style="background:#1a1608;color:#e8c45c;border:1px solid #e8c45c;border-radius:8px;padding:5px 11px;cursor:pointer">Skate Jam (trick game)</button></div>';
      var bs = 'background:#0d1a16;color:#00ff9c;border:1px solid #00ff9c;border-radius:8px;padding:5px 11px;cursor:pointer';
      if (root.WorldArcade || root.WorldFarm || root.WorldQuests || root.WorldGear) h += '<div style="font-weight:700;color:#e8c45c;margin:10px 0 4px">ARCADE &amp; FARM</div><div style="display:flex;gap:6px;flex-wrap:wrap">' + (root.WorldArcade ? ['slots|Slots', 'hl|Higher-Lower', 'dash|Hover Dash'].map(function (x) { var q = x.split('|'); return '<button data-a="arcade" data-id="' + q[0] + '" style="' + bs + '">' + q[1] + '</button>'; }).join('') : '') + (root.WorldGear ? '<button data-a="gear" style="background:#0d1a16;color:#ff7a8a;border:1px solid #ff7a8a;border-radius:8px;padding:5px 11px;cursor:pointer">Armory</button>' : '') + (root.WorldQuests ? '<button data-a="quests" style="background:#0d1a16;color:#e8c45c;border:1px solid #e8c45c;border-radius:8px;padding:5px 11px;cursor:pointer">Quest board</button>' : '') + (root.WorldFarm ? '<button data-a="farm" data-id="farm" style="background:#0d1a16;color:#34e5b0;border:1px solid #34e5b0;border-radius:8px;padding:5px 11px;cursor:pointer">Farm beds</button>' : '') + '</div>';
      if (root.WorldOffices) h += '<div style="font-weight:700;color:#e8c45c;margin:10px 0 4px">OFFICES <small style="opacity:.6;font-weight:400">one unique service each</small></div><div style="display:flex;gap:6px;flex-wrap:wrap">' + Object.keys(root.WorldOffices.OFFICES).map(function (c) { var o = root.WorldOffices.OFFICES[c]; return '<button data-a="office" data-id="' + c + '" title="' + o.name + '" style="background:#14141a;color:' + o.color + ';border:1px solid ' + o.color + ';border-radius:8px;padding:5px 9px;cursor:pointer;font-size:11px">' + c + ' \u00B7 ' + o.verb + '</button>'; }).join('') + '</div>';
      if (root.WorldAgentsUI) h += '<div style="font-weight:700;color:#e8c45c;margin:10px 0 4px">AGENTS &amp; JOBS <small style="opacity:.6;font-weight:400">station, import Grok/Muse, hire</small></div><div style="display:flex;gap:6px;flex-wrap:wrap"><button data-a="agents" data-id="agents" style="background:#0d1a16;color:#00ff9c;border:1px solid #00ff9c;border-radius:8px;padding:5px 11px;cursor:pointer">My agents</button><button data-a="agents" data-id="import" style="background:#0d1a16;color:#00ff9c;border:1px solid #00ff9c;border-radius:8px;padding:5px 11px;cursor:pointer">Import agent</button><button data-a="agents" data-id="jobs" style="background:#1a1608;color:#e8c45c;border:1px solid #e8c45c;border-radius:8px;padding:5px 11px;cursor:pointer">Jobs board</button></div>';
      if (root.WorldRaceSelect) h += '<div style="margin:10px 0 4px"><button data-a="rselect" style="width:100%;background:linear-gradient(180deg,rgba(232,196,92,.35),rgba(120,80,10,.5));color:#fff3c8;border:1px solid #e8c45c;border-bottom-width:4px;border-radius:10px;padding:9px;cursor:pointer;font:800 13px inherit;letter-spacing:.12em">\uD83C\uDFC1 HOVER RACING \u2014 pick cup, car &amp; GO</button></div>';
      if (root.__raceChallenge) { h += '<div style="font-weight:700;color:#e8c45c;margin:10px 0 4px">RACES <small style="opacity:.6;font-weight:400">wager Sparks, pick spots on the map</small></div><div style="display:flex;gap:6px"><button data-a="race" data-id="build" style="background:#0d1a16;color:#00ff9c;border:1px solid #00ff9c;border-radius:8px;padding:5px 11px;cursor:pointer">Race builder</button><button data-a="race" data-id="board" style="background:#1a1608;color:#e8c45c;border:1px solid #e8c45c;border-radius:8px;padding:5px 11px;cursor:pointer">Challenge board</button></div>'; }
      if (root.__travel && root.__travel.colospot) { h += '<div style="font-weight:700;color:#e8c45c;margin:10px 0 4px">COLOSSEUM <small style="opacity:.6;font-weight:400">go in, then change the arena floor</small></div><div style="display:flex;flex-wrap:wrap;gap:6px">';
        [['colospot:lobby', 'Lobby'], ['colospot:arena', 'Arena floor']].concat(['sand', 'water', 'lava', 'void', 'grass', 'ice'].map(function (f) { return ['field:' + f, f]; })).forEach(function (t) { h += '<button data-a="travel2" data-id="' + t[0] + '" style="background:#0d1a16;color:#e8c45c;border:1px solid #e8c45c;border-radius:8px;padding:4px 9px;cursor:pointer">' + t[1] + '</button>'; }); h += '</div>'; }
      if (root.__naval) h += '<div style="margin-top:8px"><button data-a="naval" style="background:#0d1a16;color:#27e0ff;border:1px solid #27e0ff;border-radius:8px;padding:6px 14px;cursor:pointer;font-weight:700">NAVAL BATTLE (water game)</button></div>';
      if (root.WorldBots) { h += '<div style="font-weight:700;color:#e8c45c;margin:10px 0 4px">HELPER BOTS <small style="opacity:.6;font-weight:400">wheeled = base, humanoid = premium</small></div>';
        root.WorldBots.ROSTER.forEach(function (b) { var own = root.WorldBots.rec(b.id); h += '<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;border-top:1px solid #1d2a26"><span>' + b.name + ' <small style="opacity:.6">' + b.kind + ' - ' + (own ? 'owned' : root.WorldBots.PRICE[b.kind] + ' Sparks') + '</small></span>' +
          '<button data-id="' + b.id + '" data-a="' + (own ? 'bcall' : 'bbuy') + '" style="background:#0d1a16;color:#00ff9c;border:1px solid #00ff9c;border-radius:8px;padding:4px 9px;cursor:pointer">' + (own ? 'Call' : 'Buy') + '</button></div>'; }); }
      h += '<div style="margin-top:8px;text-align:right"><button data-a="stow" style="background:none;color:#aaa;border:1px solid #444;border-radius:8px;padding:4px 10px;cursor:pointer">Stow</button></div>';
      pnl.innerHTML = h; document.body.appendChild(pnl);
      pnl.addEventListener('click', function (e) {
        var t = e.target; if (t.id === 'msx') { panel(); return; } var a = t.getAttribute && t.getAttribute('data-a'); if (!a) return; var id = t.getAttribute('data-id');
        if (a === 'buy') { var r = Mo.buy(id, o.spend || function (n, k, i) { return root.ShdSparks ? root.ShdSparks.spend(n, k, i) : false; }); toast(r.ok ? 'Bought ' + r.item.name + ' for ' + r.paid : r.why); panel(true); }
        else if (a === 'ride') { var bd = Mo.def(id); var okR = root.__rideBoard && root.__rideBoard(bd && bd.style); toast(okR ? 'Riding ' + (bd ? bd.name : 'board') + ' - Space hop, hold Space to fly, Shift boost' : 'Could not mount the board'); panel(); }
        else if (a === 'kart') { summonKart(id); panel(); }
        else if (a === 'arcade') { panel(); if (root.WorldArcade) root.WorldArcade.open(id); }
        else if (a === 'naval') { panel(); if (root.__naval) root.__naval.open(); }
        else if (a === 'gear') { panel(); if (root.WorldGear) root.WorldGear.open(); }
        else if (a === 'quests') { panel(); if (root.WorldQuests) root.WorldQuests.open(); }
        else if (a === 'farm') { panel(); if (root.WorldFarm) root.WorldFarm.open(); }
        else if (a === 'office') { panel(); if (root.WorldOffices) root.WorldOffices.open(id); }
        else if (a === 'rselect') { panel(); if (root.WorldRaceSelect) root.WorldRaceSelect.open(); }
        else if (a === 'agents') { panel(); if (root.WorldAgentsUI) root.WorldAgentsUI.open(id); }
        else if (a === 'jam') { panel(); if (root.__skateJam) root.__skateJam.open(); }
        else if (a === 'race') { panel(); if (root.__raceChallenge) { if (id === 'board') root.__raceChallenge.openBoard(); else root.__raceChallenge.openBuilder(); } }
        else if (a === 'travel2') { var pr = id.split(':'), t2 = root.__travel && root.__travel[pr[0]] && root.__travel[pr[0]](pr[1]); toast(t2 ? 'Colosseum: ' + t2 : 'Not ready (enter the Colosseum first)'); }
        else if (a === 'travel') { var tr = root.__travel && root.__travel[id] && root.__travel[id](); toast(tr ? 'Traveled: ' + tr : 'Not ready yet'); panel(); }
        else if (a === 'bbuy') { var rb = root.WorldBots.buy(id, o.spend || function (n, k, i) { return root.ShdSparks ? root.ShdSparks.spend(n, k, i) : false; }); toast(rb.ok ? 'Bought ' + rb.def.name + ' for ' + rb.paid : rb.why); panel(true); }
        else if (a === 'bcall') { try { var cr = root.WorldBots.call(id, root.__botZone ? root.__botZone() : 'wilderness', root._currentInterior); toast(cr && cr.ok === false ? cr.why : 'Calling ' + id); } catch (e) { toast('Could not call'); } panel(); }
        else if (a === 'go') { if (st.riding) dismount(); summon(id, true); panel(); } else if (a === 'stow') { stow(); panel(); }
      });
    }
    function key(e) {
      if (e.repeat) return; var tg = e.target && e.target.tagName; if (tg === 'INPUT' || tg === 'TEXTAREA') return;
      if (st.riding && e.code === 'KeyI') { panel(); e.stopImmediatePropagation(); e.preventDefault(); return; }   // owner 2026-10-04: I works while riding too
      if (st.riding) { if (e.code === 'KeyE' || e.code === 'KeyF') { e.stopImmediatePropagation(); e.preventDefault(); dismount(); } else if (e.code === 'KeyB' || e.code === 'KeyO' || e.code === 'KeyH') e.stopImmediatePropagation(); return; }
      if (e.code === 'KeyI') { panel(); e.stopImmediatePropagation(); e.preventDefault(); }
      else if (e.code === 'KeyE' && near()) { if (mount()) { e.stopImmediatePropagation(); e.preventDefault(); } }
    }
    if (typeof addEventListener === 'function') addEventListener('keydown', key, true);

    return {
      // ── race hooks (world-race-run.js drives a ride exactly like the hoverboard) ──
      raceAdapter: { setModifier: function (o) { o = o || {}; if (o.mul != null) { MOD.mul = o.mul; MOD.t = o.dur || 1; } if (o.stun != null) { var _wf = cur ? feelOf(cur) : null; MOD.stun = o.stun * (_wf && _wf.weight ? 1.3 - 0.1 * _wf.weight : 1); } if (o.noise != null) { MOD.noise = o.noise; MOD.nt = o.noiseDur || 2; } if (o.turn != null) { MOD.turn = o.turn; MOD.tt = o.turnDur || 0.15; } }, state: function () { return { x: M.x, y: M.y, z: M.z, psi: M.yaw }; }, isFlying: function () { return M.fl; }, altitudeM: function () { return (M.y - gY(M.x, M.z)) / U; }, isRiding: function () { return st.riding; } },
      setEdgeProvider: function (fn) { edgeFn = typeof fn === 'function' ? fn : null; },
      setRaceMode: function (on) { raceMode = !!on; if (!on) { MOD.mul = 1; MOD.t = 0; MOD.stun = 0; MOD.noise = 0; } },
      /* rentRace(id, x, z, yaw): put a RENTED kart on the grid and ride it (no ownership needed - race selection screen karts are free to pick) */
      rentRace: function (id, x, z, yaw) { var d = Mo.def(id) || kartDef(id); if (!d) return false; if (st.riding) dismount(); show(id, x, z, yaw); if (!cur) return false; M.x = x; M.z = z; M.yaw = yaw; M.sp = 0; M.y = gY(x, z) + ((M.def && M.def.hover) || 0) * U; playerPos.x = x; playerPos.z = z; st.riding = true; st.id = id; CAM.init = false; raceMode = true; return true; },
      placeAt: function (x, z, yaw, keepSpeed) { M.x = x; M.z = z; M.yaw = yaw; if (!keepSpeed) M.sp = 0; M.y = gY(x, z) + ((M.def && M.def.hover) || 0) * U; },
      update: update, isRiding: function () { return st.riding; }, mount: mount, dismount: dismount, summon: summon, summonKart: summonKart, stow: stow, panel: panel, near: near,
      seatKind: function () { return /^(car-|kart-)|^skiff$/.test(String(cur || '')) ? 'seat' : 'saddle'; },   /* cars, karts and the skiff are SAT IN; beasts are straddled */
      saddle: function () { return SAD; }, camera: function () { return CAM; }, tune: TUNE, boosting: function () { return st.boosting; }, stamina: function () { return 1; },
      speedMS: function () { return Math.abs(M.sp) / U; },
      state: function () { return { riding: st.riding, id: cur, x: M.x, y: M.y, z: M.z, yaw: M.yaw, sp: M.sp / U, flying: M.fl, visible: holder.visible }; },
      on: function () { }, off: function () { }, dispose: function () { scene.remove(holder); if (pnl) pnl.remove(); removeEventListener('keydown', key, true); }
    };
  };
  root.buildMountRide.hoverTilt = hoverTilt;
})(typeof window !== 'undefined' ? window : globalThis);
