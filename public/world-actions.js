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
    // owned hovercar parked at the garage beacon
    if (carMesh && carGroup.visible && !st.mode) {
      var d3 = (p.x - carMesh.position.x) * (p.x - carMesh.position.x) + (p.z - carMesh.position.z) * (p.z - carMesh.position.z);
      if (d3 < bd) { bd = d3; best = { kind: 'car', b: { m: carGroup, name: 'HOVERCAR' } }; }
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
      // COLOSSEUM first: E near the arena opens the spectate/tourney modal
      var Lm = window.__worldLandmarks;
      if (Lm && Lm.arenaPos && Math.hypot(p.x - Lm.arenaPos[0], p.z - Lm.arenaPos[1]) < 50) { openArena(); return; }
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
        } else if (n && n.kind === 'car') {
          st.mode = 'car'; pop('HOVERCAR — cruise engaged', '#5fe0ff');
        }
      }
    } else if (e.code === 'Space' && st.mode === 'hoverboard' && st.air <= 0) {   // OLLIE (boards only)
      st.vy = OLLIE_VY[garage().boardTier || 1] || 7.2; st.air = 0.001;
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

  // ── GARAGE (B at the plaza beacon): buy the hovercar, upgrade board+car with Sparks.
  //    Procedural hovercar now; the real fal model replaces it in the same spot Thursday.
  var GAR_KEY = 'shd.garage3d';
  function garage() { try { return JSON.parse(localStorage.getItem(GAR_KEY) || '{"board":1,"boardTier":1,"car":0,"carTier":1}'); } catch (e) { return { board: 1, boardTier: 1, car: 0, carTier: 1 }; } }
  function saveGarage(g) { try { localStorage.setItem(GAR_KEY, JSON.stringify(g)); } catch (e) {} }
  var BOARD_SPD = [0, 2.1, 2.5, 3.0], CAR_SPD = [0, 0, 2.8, 3.4, 4.2];
  var OLLIE_VY = [0, 7.2, 8.0, 9.0];

  var carMesh = null, carGroup = new THREE.Group();
  carGroup.name = 'garage-car';
  group.add(carGroup);
  function buildCar() {
    while (carGroup.children.length) carGroup.remove(carGroup.children[0]);
    var g = new THREE.Group();
    var hull = new THREE.Mesh(track(new THREE.BoxGeometry(2.4, 0.6, 4.6)), track(new THREE.MeshStandardMaterial({ color: 0x14121c, roughness: 0.3, metalness: 0.85 })));
    hull.position.y = 0.9; g.add(hull);
    var canopy = new THREE.Mesh(track(new THREE.SphereGeometry(1.1, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2)), track(new THREE.MeshStandardMaterial({ color: 0x5fe0ff, transparent: true, opacity: 0.45, roughness: 0.1, metalness: 0.4, emissive: 0x5fe0ff, emissiveIntensity: 0.5 })));
    canopy.position.y = 1.2; g.add(canopy);
    var trimF = new THREE.Mesh(track(new THREE.BoxGeometry(2.5, 0.12, 0.5)), track(new THREE.MeshStandardMaterial({ color: 0xe8c45c, emissive: 0xe8c45c, emissiveIntensity: 1.1, metalness: 0.9, roughness: 0.25 })));
    trimF.position.set(0, 0.72, 2.15); g.add(trimF);
    var under = new THREE.PointLight(0x00ff9c, 2.4, 8); under.position.y = 0.3; g.add(under);
    g.name = 'hovercar';
    carGroup.add(g);
    carMesh = g;
  }
  function seatCar() {
    var G = garage();
    var L = window.__worldLandmarks;
    var gx = (L && L.garagePos) ? L.garagePos[0] + 9 : 35, gz = (L && L.garagePos) ? L.garagePos[1] + 9 : 105;
    carGroup.visible = !!G.car;
    if (G.car) { buildCar(); carMesh.position.set(gx, 0, gz); }
  }
  setTimeout(seatCar, 1500);   // landmarks built by then

  // ── SHOP MODAL (B) + ARENA MODAL (E at colosseum) ──
  var modal = document.createElement('div');
  modal.style.cssText = 'position:fixed;inset:0;z-index:80;display:none;align-items:center;justify-content:center;background:rgba(4,6,12,.72);backdrop-filter:blur(4px)';
  modal.innerHTML = '<div style="min-width:320px;max-width:400px;background:linear-gradient(160deg,#0d1220,#06080b);border:1px solid rgba(232,196,92,.45);border-radius:14px;padding:22px 24px;font-family:system-ui,sans-serif;color:#e8c45c;box-shadow:0 0 40px rgba(232,196,92,.15)"><div id="shTitle" style="font-weight:900;letter-spacing:.14em;font-size:15px;margin-bottom:14px"></div><div id="shBody" style="font-size:13px;color:#9fe8c4;line-height:1.55"></div><div id="shBtns" style="display:flex;gap:8px;margin-top:16px;flex-wrap:wrap"></div><div style="margin-top:10px;text-align:right;font-size:11px;opacity:.8">⚡ <span id="shBal"></span></div></div>';
  document.body.appendChild(modal);
  function closeModal() { modal.style.display = 'none'; }
  modal.addEventListener('click', function (e) { if (e.target === modal) closeModal(); });
  function openModal(title, bodyHTML, btns) {
    document.getElementById('shTitle').textContent = title;
    document.getElementById('shBody').innerHTML = bodyHTML;
    var holder = document.getElementById('shBtns'); holder.innerHTML = '';
    btns.forEach(function (b) {
      var el = document.createElement('button');
      el.textContent = b.label;
      el.style.cssText = 'flex:1;padding:9px 12px;border-radius:8px;border:1px solid rgba(232,196,92,.5);background:rgba(232,196,92,.08);color:#e8c45c;font-weight:700;font-size:12px;cursor:pointer' + (b.disabled ? ';opacity:.4;pointer-events:none' : '');
      el.onclick = function () { b.fn(); };
      holder.appendChild(el);
    });
    document.getElementById('shBal').textContent = sparks();
    modal.style.display = 'flex';
  }
  function buy(label, cost, fn) {
    if (sparks() < cost) { pop('NOT ENOUGH SPARKS', '#ff5a6e'); return; }
    addSparks(-cost); fn(); pop('PURCHASED: ' + label, '#00ff9c'); openGarage();  // refresh
  }
  function openGarage() {
    var G = garage();
    var boardT = G.boardTier, carT = G.carTier;
    var btns = [];
    if (boardT < 3) btns.push({ label: 'BOARD TIER ' + (boardT + 1) + ' — ' + (boardT === 1 ? 300 : 600) + '⚡', disabled: sparks() < (boardT === 1 ? 300 : 600), fn: function () { buy('BOARD T' + (boardT + 1), boardT === 1 ? 300 : 600, function () { G.boardTier++; saveGarage(G); }); } });
    if (!G.car) btns.push({ label: 'HOVERCAR — 500⚡', disabled: sparks() < 500, fn: function () { buy('HOVERCAR', 500, function () { G.car = 1; saveGarage(G); seatCar(); }); } });
    else if (carT < 4) btns.push({ label: 'CAR TIER ' + (carT + 1) + ' — ' + (carT === 1 ? 500 : 900) + '⚡', disabled: sparks() < (carT === 1 ? 500 : 900), fn: function () { buy('CAR T' + (carT + 1), carT === 1 ? 500 : 900, function () { G.carTier++; saveGarage(G); }); } });
    btns.push({ label: 'CLOSE', fn: closeModal });
    openModal('◈ SHADDAI GARAGE',
      'Hoverboard <b>Tier ' + boardT + '</b> — speed ×' + BOARD_SPD[boardT] + (G.car ? '<br>Hovercar <b>Tier ' + carT + '</b> — speed ×' + CAR_SPD[carT] + ' <span style="opacity:.7">(E to ride, parked at the beacon)</span>' : '<br>Hovercar — <span style="opacity:.7">not owned</span>')
      + '<br><span style="opacity:.65;font-size:11px">Earn sparks: hoverboard tricks, tourneys, jobs.</span>', btns);
  }
  // ARENA: walk in + spectate now; tourney/wager ledger foundation (games land Thursday)
  var TO_KEY = 'shd.tourney';
  function tourney() { try { return JSON.parse(localStorage.getItem(TO_KEY) || '{"fightPool":0,"fightN":0,"skatePool":0,"skateN":0}'); } catch (e) { return { fightPool: 0, fightN: 0, skatePool: 0, skateN: 0 }; } }
  function saveTourney(t) { try { localStorage.setItem(TO_KEY, JSON.stringify(t)); } catch (e) {} }
  function openArena() {
    var T = tourney();
    openModal('⚔ SHADDAI COLOSSEUM',
      '<b>FIGHTING</b> — entry 50⚡ · pool ' + T.fightPool + '⚡ · ' + T.fightN + ' entered<br>'
      + '<b>SKATE JAM</b> — entry 30⚡ · pool ' + T.skatePool + '⚡ · ' + T.skateN + ' entered<br>'
      + '<span style="opacity:.65;font-size:11px">Winner takes the pool. Matches open with the coming build — entry sparks are held in the pool.</span>',
      [
        { label: 'ENTER FIGHT (50⚡)', disabled: sparks() < 50, fn: function () {
            addSparks(-50); var t = tourney(); t.fightPool += 50; t.fightN++; saveTourney(t);
            closeModal();
            var T = window.__worldTactics;
            if (T && T.startFight({ entry: 50, pool: t.fightPool - 50, tier: Math.min(3, Math.floor((t.wins || 0) / 2)) })) {
              pop('FIGHT! tier ' + Math.min(3, Math.floor((t.wins || 0) / 2)) + ' · pot ' + (t.fightPool) + '⚡', '#c084fc');
            } else { pop('ENTERED — FIGHT POOL ' + t.fightPool + '⚡ (engine loading)', '#c084fc'); }
          } },
        { label: 'ENTER SKATE (30⚡)', disabled: sparks() < 30, fn: function () { addSparks(-30); var t = tourney(); t.skatePool += 30; t.skateN++; saveTourney(t); pop('ENTERED — SKATE POOL ' + t.skatePool + '⚡', '#c084fc'); closeModal(); } },
        { label: 'SPECTATE', fn: closeModal },
      ]);
  }

  addEventListener('keydown', function (e) {
    if (e.code !== 'KeyB') return;
    var a = document.activeElement;
    if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA')) return;
    var p = P(); if (!p) return;
    var L = window.__worldLandmarks;
    if (L && Math.hypot(p.x - L.garagePos[0], p.z - L.garagePos[1]) < 22) openGarage();
  });

  var lastT = 0;
  return {
    get mode() { return st.mode; },
    speed: function (base) {
      if (st.mode === 'hoverboard') return base * BOARD_SPD[garage().boardTier || 1];   // board = fast glide
      if (st.mode === 'car') return base * CAR_SPD[garage().carTier || 1];             // hovercar = faster
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
      if (st.mode === 'boat') {                          // stand ON DECK — sit IN the vessel (five-laws seating)
        if (gy > 0.2) return gy + 0.35;                  // beached on the shelf — fine, futuristic hull
        var O = ocAPI();
        var nm = (st.boat && st.boat.name) || '';
        var seat = /YACHT/i.test(nm) ? 1.6 : /SUB/i.test(nm) ? 1.25 : /CATAMARAN/i.test(nm) ? 0.85 : 0.55;
        return 0.05 + (O && O.waveH ? O.waveH(p.x, p.z, performance.now() / 1000) * 0.6 : 0) + seat;
      }
      if (st.mode === 'car') {                           // hovercar glides over everything
        if (gy < -0.5) { var O3 = ocAPI(); gy = 0.05 + (O3 && O3.waveH ? O3.waveH(p.x, p.z, performance.now() / 1000) * 0.5 : 0); }
        return gy + 1.05;
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
      if (st.mode === 'car' && carMesh) {
        carGroup.position.x = p.x; carGroup.position.z = p.z;
        carGroup.rotation.y = yaw;
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
