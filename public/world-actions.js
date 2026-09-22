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
    jy: 0, vy: 0, air: 0,                 // jump arc + air-time
    spin: 0, lastYaw: 0,                  // spin accumulation
    flips: 0, flipAngle: 0,               // kickflip roll
    riding: false,
  };

  function nearBoard() {
    var p = P(); if (!p) return null;
    var best = null, bd = 16 * 16;
    for (var i = 0; i < boards.length; i++) {
      var b = boards[i];
      if (b === st.board) continue;
      var d = (p.x - b.m.position.x) * (p.x - b.m.position.x) + (p.z - b.m.position.z) * (p.z - b.m.position.z);
      if (d < bd) { bd = d; best = b; }
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

  addEventListener('keydown', function (e) {
    if (e.code !== 'KeyE' && e.code !== 'Space') return;
    var p = P(); if (!p) return;
    if (e.code === 'KeyE') {
      if (st.mode) {                                    // dismount — park it
        st.mode = false; land();
        if (st.board) { st.board.m.position.set(p.x, st.board.yOff, p.z); st.board = null; }
        pop('BOARD PARKED', '#5fe0ff');
      } else {
        var b = nearBoard();
        if (b) { st.mode = 'hoverboard'; st.board = b; pop('HOVERBOARD', '#00ff9c'); }
      }
    } else if (e.code === 'Space' && st.mode && st.air <= 0) {   // OLLIE
      st.vy = 7.2; st.air = 0.001;
    }
  });

  var lastT = 0;
  return {
    get mode() { return st.mode; },
    speed: function (base) { return st.mode ? base * 2.1 : base; },   // board = fast glide
    flyControl: function () {},
    baseY: function (gy) {
      var p = P();
      if (!st.mode || !p) return gy;
      if (gy < -0.5) {                                                 // hovering over water: ride the waves
        var O = window.__worldOcean;
        gy = 0.05 + (O && O.waveH ? O.waveH(p.x, p.z, performance.now() / 1000) * 0.5 : 0);
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
      if (!st.mode || !st.board) {
        var nb = nearBoard();
        if (nb && t - lastT > 1.2) { pop('[E] RIDE HOVERBOARD', '#5fe0ff'); lastT = t + 0.6; }   // gentle hint
        return;
      }
      var p = P();
      // jump arc
      if (st.air > 0 || st.jy > 0) {
        st.air += dt; st.vy -= 22 * dt; st.jy += st.vy * dt;
        if (st.jy <= 0) { st.jy = 0; land(); }
        if (opts.isShift && opts.isShift()) { st.flipAngle += dt * 12.5; if (st.flipAngle >= 6.2832) { st.flips++; st.flipAngle = 0; } }
      } else if (st.air === 0 && st.jy === 0 && st.vy !== 0) { st.air = 0.001; }
      // spin tracking
      var yaw = Math.atan2(fwd ? fwd.x : 0, fwd ? fwd.z : 1);
      var d = yaw - st.lastYaw;
      while (d > Math.PI) d -= 6.283185; while (d < -Math.PI) d += 6.283185;
      if (st.air > 0) st.spin += d;
      st.lastYaw = yaw;
      // seat the board under the rider
      st.board.m.position.set(p.x, (st.board.m.position.y), p.z);
      st.board.m.rotation.y = yaw;
      st.board.m.rotation.z = -st.flipAngle;
      var groundY = st.board.m.position.y - st.jy * 0 + 0;   // keep simple: board bobs at baseY height
    },
    sparks: sparks,
    dispose: function () {
      scene.remove(group);
      disposables.forEach(function (d) { if (d.geometry) d.geometry.dispose(); if (d.material) d.material.dispose(); });
      chip.remove(); toast.remove();
    },
  };
};
