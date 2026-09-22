/* world-actions.js — HOVERBOARD + TRICKS + SPARKS (2026-09-21).
 *
 * The playability layer: ride the hoverboard (E near it), SPACE = ollie,
 * SHIFT mid-air = kickflip, spin with the mouse/A-D for 180s/360s — land clean
 * to bank Sparks. Boards park at the plaza + the Crystal Sea dock, and the board
 * hovers OVER water too (wave-riding). Sparks persist in localStorage and show
 * in a HUD chip; every landed trick pops a gold nameplate.
 *
 * Plugs into the host's existing veh hooks (speed/baseY/flyControl/update/mode):
 *   let veh = window.buildWorldActions ? window.buildWorldActions({...}) : stub;
 *   veh.update(dt, fwd) is already called each frame by the host.
 */
window.buildWorldActions = function (opts) {
  var THREE = opts.THREE, scene = opts.scene, loader = opts.loader;
  if (!THREE || !scene) return null;
  var P = opts.playerPosGetter || function () { return window._playerPos; };

  var SPARK_KEY = 'shd.sparks3d';
  function sparks() { try { return parseInt(localStorage.getItem(SPARK_KEY) || '0', 10) || 0; } catch (e) { return 0; } }
  function addSparks(n) { try { localStorage.setItem(SPARK_KEY, String(sparks() + n)); } catch (e) {} hud(); }

  // ── HUD: sparks chip + trick toast (pure DOM, gold on obsidian) ──
  var chip = document.createElement('div');
  chip.style.cssText = 'position:fixed;top:12px;right:14px;z-index:70;font-family:system-ui,sans-serif;font-size:13px;font-weight:800;color:#e8c45c;background:rgba(6,10,16,.72);border:1px solid rgba(232,196,92,.4);border-radius:8px;padding:6px 12px;pointer-events:none;letter-spacing:.06em';
  document.body.appendChild(chip);
  function hud() { chip.textContent = '⚡ ' + sparks() + ' SPARKS'; }
  hud();

  var toast = document.createElement('div');
  toast.style.cssText = 'position:fixed;left:50%;bottom:18%;transform:translateX(-50%);z-index:70;font-family:system-ui,sans-serif;font-weight:900;font-size:22px;color:#e8c45c;text-shadow:0 0 14px rgba(232,196,92,.85),0 2px 0 rgba(0,0,0,.6);pointer-events:none;opacity:0;transition:opacity .18s,transform .18s;letter-spacing:.08em';
  document.body.appendChild(toast);
  var toastT = 0;
  function pop(txt, col) {
    toast.textContent = txt; toast.style.color = col || '#e8c45c';
    toast.style.opacity = '1'; toast.style.transform = 'translateX(-50%) translateY(-8px)';
    clearTimeout(toastT);
    toastT = setTimeout(function () { toast.style.opacity = '0'; toast.style.transform = 'translateX(-50%)'; }, 1100);
  }

  // ── BOARDS — GLB (hoverboard.glb, shipped 2026-09-21) with procedural fallback ──
  var group = new THREE.Group();
  group.name = 'world-actions';
  scene.add(group);
  var PARKS = [
    { x: 12, z: 88 },                 // plaza (near spawn)
    { x: -186, z: 202 },               // Crystal Sea dock approach
  ];
  var boards = [];
  var disposables = [];
  var track = function (o) { disposables.push(o); return o; };

  function fallbackBoard() {
    var g = new THREE.Group();
    var deck = new THREE.Mesh(track(new THREE.BoxGeometry(1.05, 0.1, 3.3)),
      track(new THREE.MeshStandardMaterial({ color: 0x14121c, roughness: 0.35, metalness: 0.8 })));
    deck.position.y = 0.32; g.add(deck);
    var strip = new THREE.Mesh(track(new THREE.BoxGeometry(0.9, 0.04, 2.9)),
      track(new THREE.MeshStandardMaterial({ color: 0x00ff9c, emissive: 0x00ff9c, emissiveIntensity: 1.4 })));
    strip.position.y = 0.27; g.add(strip);
    var glow = new THREE.PointLight(0x00ff9c, 2.2, 9); glow.position.y = 0.4; g.add(glow);
    return g;
  }

  function addBoard(cfg, mesh, fromGLB) {
    if (fromGLB) mesh.traverse(function (o) {
      if (o.isMesh && o.material && o.material.map) o.material.map.colorSpace = THREE.SRGBColorSpace;
    });
    var box = new THREE.Box3().setFromObject(mesh);
    var sz = box.getSize(new THREE.Vector3());
    mesh.scale.multiplyScalar(3.6 / Math.max(sz.x, sz.z, 0.001));
    var yOff = -new THREE.Box3().setFromObject(mesh).min.y;
    mesh.name = 'hoverboard';
    mesh.position.set(cfg.x, yOff, cfg.z);
    group.add(mesh);
    boards.push({ m: mesh, park: cfg, yOff: yOff });
  }

  PARKS.forEach(function (cfg) {
    if (loader) {
      loader.load('/assets/models/hoverboard.glb', function (g) { addBoard(cfg, g.scene, true); },
        undefined, function () { addBoard(cfg, fallbackBoard(), false); });
    } else addBoard(cfg, fallbackBoard(), false);
  });

  // ── RIDE STATE ──
  var st = {
    mode: false, board: null,
    boat: null, boatCfg: null, lastGy: 0,               // sea vessels (from world-ocean)
    jy: 0, vy: 0, air: 0,                 // jump arc + air-time
    spin: 0, lastYaw: 0,                  // spin accumulation
    flips: 0, flipAngle: 0,               // kickflip roll
    riding: false,
  };

  function ocAPI() { return window.__worldOcean || null; }

  function nearBoard() {
    var p = P(); if (!p) return null;
    var best = null, bd = 16 * 16;
    for (var i = 0; i < boards.length; i++) {
      var b = boards[i];
      if (b === st.board) continue;
      var d = (p.x - b.m.position.x) * (p.x - b.m.position.x) + (p.z - b.m.position.z) * (p.z - b.m.position.z);
      if (d < bd) { bd = d; best = { kind: 'hoverboard', b: b }; }
    }
    // moored sea vessels win if closer (E boards a SHIP when standing at the harbor)
    var O = ocAPI();
    if (O && O.boatCount && O.boatCount()) {
      var fleet = O.boats();
      for (var j = 0; j < fleet.length; j++) {
        var f = fleet[j];
        var d2 = (p.x - f.m.position.x) * (p.x - f.m.position.x) + (p.z - f.m.position.z) * (p.z - f.m.position.z);
        if (d2 < bd) { bd = d2; best = { kind: 'boat', b: f }; }
      }
    }
    return best;
  }

  function land() {
    var air = st.air, spinDeg = Math.abs(st.spin) * 57.2958, flips = st.flips;
    st.air = 0; st.spin = 0; st.flips = 0; st.vy = 0; st.jy = 0; st.flipAngle = 0;
    if (st.board) st.board.m.rotation.z = 0;
    if (air < 0.28 || !st.mode) return;
    var name = null, pts = 0;
    if (flips > 0) { name = flips > 1 ? 'DOUBLE KICKFLIP' : 'KICKFLIP'; pts = flips * 15; }
    if (spinDeg > 300) { name = '360 SPIN'; pts += 25; }
    else if (spinDeg > 150) { name = '180 SPIN'; pts += 12; }
    if (!name) { name = 'OLLIE'; pts = 5; }
    if (air > 1.1) { name = 'BIG AIR ' + name; pts = Math.round(pts * 1.6); }
    if (pts > 0) { addSparks(pts); pop(name + '  +' + pts + ' ⚡'); }
  }

  function dismountAllowed() {
    var p = P();
    if (st.lastGy > -0.5) return true;                    // shallow water / beach
    var O = ocAPI();
    if (O && O.dockPos) {
      var d = Math.hypot(p.x - O.dockPos[0], p.z - O.dockPos[1]);
      if (d < 45) return true;                            // at the harbor
    }
    return false;
  }

  addEventListener('keydown', function (e) {
    if (e.code !== 'KeyE' && e.code !== 'Space') return;
    var p = P(); if (!p) return;
    if (e.code === 'KeyE') {
      if (st.mode) {                                    // dismount — park it where legal
        if (!dismountAllowed()) { pop('SAIL BACK TO SHORE TO DISMOUNT', '#5fe0ff'); return; }
        st.mode = false; land();
        if (st.boat) { if (st.boatCfg) { st.boatCfg.x = p.x; st.boatCfg.z = p.z; } st.boat = null; st.boatCfg = null; }
        if (st.board) { st.board.m.position.set(p.x, st.board.yOff, p.z); st.board = null; }
        pop('DOCKED', '#5fe0ff');
      } else {
        var n = nearBoard();
        if (n && n.kind === 'boat') {
          st.mode = 'boat'; st.boat = n.b;
          // find the ocean cfg so parked-bob follows the boat after we move it
          var O = ocAPI();
          if (O) {
            var fleet = O.boats();
            st.boatCfg = null;
            // boats() returns {m,name}; find cfg through the ocean module's internals is not
            // exposed — instead we re-sync cfg lazily: world-ocean bobs via cfg.x/z, so we
            // push the live position back by matching the mesh reference through a side table.
            st.boatCfg = O.cfgOf && O.cfgOf(n.b) || null;
          }
          pop('SAILING: ' + (n.b.name || 'VESSEL'), '#00e5a0');
        } else if (n && n.kind === 'hoverboard') {
          st.mode = 'hoverboard'; st.board = n.b; pop('HOVERBOARD', '#00ff9c');
        }
      }
    } else if (e.code === 'Space' && st.mode === 'hoverboard' && st.air <= 0) {   // OLLIE (boards only)
      st.vy = 7.2; st.air = 0.001;
    }
  });

  // ── HERO SWITCH (H) — cycle the council bodies via the host's setPlayerCharacter(code).
  //    The bodies+clips are preloaded per code (host _pcCache); choice persists.
  var HEROES = ['SHADDAI', 'ZEROX', 'ORACLE', 'NEXUS', 'TURTLE', 'QUILL', 'PIKADON'];
  var heroIdx = 0;
  addEventListener('keydown', function (e) {
    if (e.code !== 'KeyH') return;
    var a = document.activeElement;
    if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA')) return;
    if (typeof window.setPlayerCharacter !== 'function') return;
    heroIdx = (heroIdx + 1) % HEROES.length;
    var code = HEROES[heroIdx];
    window.setPlayerCharacter(code);
    try { localStorage.setItem('shd.hero3d', code); } catch (_) {}
    pop('NOW PLAYING: ' + code, '#c084fc');
  });
  // restore the last hero once the host exposes setPlayerCharacter (built later in the module)
  setTimeout(function () {
    try {
      var saved = localStorage.getItem('shd.hero3d');
      if (saved && typeof window.setPlayerCharacter === 'function') {
        window.setPlayerCharacter(saved);
        heroIdx = Math.max(0, HEROES.indexOf(saved));
      }
    } catch (_) {}
  }, 6000);

  var lastT = 0;
  return {
    get mode() { return st.mode; },
    speed: function (base) {
      if (st.mode === 'hoverboard') return base * 2.1;   // board = fast glide
      if (st.mode === 'boat') {
        var n = (st.boat && st.boat.name) || '';
        if (/SKIFF/i.test(n)) return base * 3.2;         // skiff = sprinter
        if (/YACHT/i.test(n)) return base * 1.6;         // yacht = stately
        return base * 2.4;                               // catamaran / sub
      }
      return base;
    },
    flyControl: function () {},
    baseY: function (gy) {
      var p = P();
      st.lastGy = gy;
      if (!st.mode || !p) return gy;
      if (st.mode === 'boat') {                          // stand on the deck
        if (gy > 0.2) return gy + 0.35;                  // beached on the shelf — fine, futuristic hull
        var O = ocAPI();
        return 0.05 + (O && O.waveH ? O.waveH(p.x, p.z, performance.now() / 1000) * 0.6 : 0) + 0.35;
      }
      // hoverboard: ride waves over water, jump arcs on land
      if (gy < -0.5) {
        var O2 = ocAPI();
        gy = 0.05 + (O2 && O2.waveH ? O2.waveH(p.x, p.z, performance.now() / 1000) * 0.5 : 0);
      }
      return gy + st.jy + 0.22;
    },
    update: function (dt, fwd) {
      var t = performance.now() / 1000;
      // idle shimmer
      for (var i = 0; i < boards.length; i++) {
        var bb = boards[i];
        if (bb !== st.board) bb.m.position.y = bb.yOff + Math.abs(Math.sin(t * 1.6 + i * 2)) * 0.08;
      }
      if (!st.mode) {
        var nb = nearBoard();
        if (nb && t - lastT > 1.2) { pop('[E] RIDE ' + (nb.kind === 'boat' ? (nb.b.name || 'VESSEL') : 'HOVERBOARD'), '#5fe0ff'); lastT = t + 0.6; }
        return;
      }
      var p = P();
      var yaw = Math.atan2(fwd ? fwd.x : 0, fwd ? fwd.z : 1);
      if (st.mode === 'boat' && st.boat) {
        // move hull under the captain; world-ocean's own update bobs Y via cfg (we sync it)
        st.boat.m.position.x = p.x; st.boat.m.position.z = p.z;
        st.boat.m.rotation.y = yaw + 1.5708;            // models face +X; face travel heading
        if (st.boatCfg) { st.boatCfg.x = p.x; st.boatCfg.z = p.z; }
        return;
      }
      // hoverboard
      if (st.air > 0 || st.jy > 0) {
        st.air += dt; st.vy -= 22 * dt; st.jy += st.vy * dt;
        if (st.jy <= 0) { st.jy = 0; land(); }
        if (opts.isShift && opts.isShift()) { st.flipAngle += dt * 12.5; if (st.flipAngle >= 6.2832) { st.flips++; st.flipAngle = 0; } }
      } else if (st.air === 0 && st.jy === 0 && st.vy !== 0) { st.air = 0.001; }
      // spin tracking
      var d = yaw - st.lastYaw;
      while (d > Math.PI) d -= 6.283185; while (d < -Math.PI) d += 6.283185;
      if (st.air > 0) st.spin += d;
      st.lastYaw = yaw;
      // seat the board under the rider
      st.board.m.position.set(p.x, st.board.m.position.y, p.z);
      st.board.m.rotation.y = yaw;
      st.board.m.rotation.z = -st.flipAngle;
    },
    sparks: sparks,
    dispose: function () {
      scene.remove(group);
      disposables.forEach(function (d) { if (d.geometry) d.geometry.dispose(); if (d.material) d.material.dispose(); });
      chip.remove(); toast.remove();
    },
  };
};
