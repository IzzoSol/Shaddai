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
 *
 * 2026-09-26 VEHICLES V2 (docs/VEHICLES-V2.md):
 *   • window.WorldRiderPose — a rig-agnostic procedural RIDER POSE (seated bike tuck, surf
 *     stance…) solved with world-space aim + analytic two-bone IK on the avatar's own bones.
 *     Shared by the Grid Bike below and public/world-hoverboard.js.
 *   • veh.bike — Grid Bike physics + visuals (accel/brake/drag, terrain pitch/roll, banking,
 *     collider slide, smooth mount/dismount, seated rider). Host calls veh.bike.step() in the
 *     movement block and veh.bike.pose() where the old bikeMode block placed the mesh.
 */

/* ════════════════════════════════════════════════════════════════════════════════════
 * WorldRiderPose — procedural riding poses for ANY humanoid rig.
 *
 * WHY world-space aiming instead of "add 1.2 rad to the knee's rotation.x": every rig ships
 * different bone-local axes (Mixamo, Meshy, UE-style, Blender .L/.R …) and a different rest
 * pose (T vs A). A fixed local offset bends one rig correctly and folds the next one
 * backwards. Instead we ask for a WORLD result — "this joint's child should sit THERE" —
 * and compute the minimal rotation that gets it there, converted back into the bone's
 * local frame. Same code, any rig, no per-model tuning.
 *
 * WHY analytic two-bone IK for limbs: the hands must land on the handlebars and the feet on
 * the pegs / deck regardless of the character's proportions (short QUILL vs tall ZEROX).
 * Law of cosines gives the elbow/knee position in closed form — no iterations, no allocs.
 *
 * Blending: the host's AnimationMixer may (or may not) write these bones each frame. We
 * detect that by remembering what we wrote last frame: if a bone still holds our value,
 * nothing else drives it, so the blend base is its REST pose (captured at bind); if it
 * changed, the mixer wrote it this frame, so the blend base is the mixer's pose. That
 * makes mount/dismount fade from/to whatever the body was doing — never a T-pose flash.
 * ════════════════════════════════════════════════════════════════════════════════════ */
window.WorldRiderPose = window.WorldRiderPose || (function () {
  function create(THREE) {
    var V = THREE.Vector3, Q = THREE.Quaternion;
    var _a = new V(), _b = new V(), _d = new V(), _t = new V(), _q = new Q(), _wq = new Q(), _pq = new Q();
    var _S = new V(), _E = new V(), _F = new V(), _dir = new V(), _p = new V(), _el = new V(), _tg = new V(), _tmp = new V();

    var rig = null;          // bound bones for the current avatar model
    var boundModel = null;   // the avatar child we bound to (hero switch swaps it → rebind)
    var boundAvatar = null;

    function wpos(o, out) { return out.setFromMatrixPosition(o.matrixWorld); }

    // Strip rig prefixes + side tokens so "mixamorig:LeftUpLeg", "thigh_l", "UpperLeg.L",
    // "Bip01 L Thigh" all collapse to a comparable limb word. SIDE is decided by position
    // (see bind) — names lie more often than geometry does.
    function limbWord(name) {
      var n = String(name || '').toLowerCase();
      n = n.replace(/mixamorig\d*[:_]?/, '').replace(/left|right/g, '');
      n = n.replace(/(^|[_.\s:-])[lr](?=[_.\s:-]|$)/g, '$1');
      return n.replace(/[_.\s:|-]/g, '');
    }
    function kindOf(w) {
      if (/twist|roll|end$|nub|toe|finger|thumb|index|middle|ring|pinky|eye|jaw|ik|pole|target/.test(w)) return null;
      if (/upleg|thigh|upperleg/.test(w)) return 'upleg';
      if (/calf|shin|lowerleg|knee/.test(w) || /(^|[^pa-z])leg$/.test(w) || w === 'leg') return 'leg';
      if (/foot|ankle/.test(w)) return 'foot';
      if (/forearm|lowerarm|elbow/.test(w)) return 'fore';
      if (/upperarm/.test(w) || /(^|[^e])arm$/.test(w)) return 'arm';
      if (/hand$|wrist/.test(w)) return 'hand';
      if (/neck/.test(w)) return 'neck';
      if (/^head$|head$/.test(w)) return 'head';
      if (/spine|chest|torso/.test(w)) return 'spine';
      if (/hips?$|pelvis/.test(w)) return 'hips';
      return null;
    }

    function bind(avatar) {
      var model = avatar && avatar.children && avatar.children[0];
      if (rig && boundAvatar === avatar && boundModel === model) return rig;
      if (rig) restore();                            // leaving an old body — hand its bones back
      boundAvatar = avatar; boundModel = model;
      rig = { bones: [], rest: new Map(), last: new Map(), hasBones: false, hipH: 0, footH: 0, height: 0 };
      if (!model) return rig;
      avatar.updateMatrixWorld(true);
      var found = {}, firstOf = {};
      model.traverse(function (o) {
        if (!o.isBone) return;
        var k = kindOf(limbWord(o.name));
        if (!k) return;
        if (k === 'hips' || k === 'neck' || k === 'head') { if (!firstOf[k]) firstOf[k] = o; return; }
        if (k === 'spine') { if (!firstOf.spine) firstOf.spine = o; return; }      // LOWEST spine bone → leans the whole torso
        // side from geometry: avatar-local +X is the character's LEFT (it faces +Z)
        avatar.worldToLocal(wpos(o, _tmp));
        var side = _tmp.x >= 0 ? 'l' : 'r';
        if (Math.abs(_tmp.x) < 1e-4) return;       // centre-line bone mis-tagged as a limb
        var key = k + side;
        if (!found[key]) found[key] = o;           // traverse is parent-first → keep the root-most match
      });
      var box = new THREE.Box3().setFromObject(model), sz = box.getSize(new V());
      rig.height = sz.y || 7;
      var b = {
        hips: firstOf.hips, spine: firstOf.spine, neck: firstOf.neck, head: firstOf.head,
        armL: found.arml, foreL: found.forel, handL: found.handl,
        armR: found.armr, foreR: found.forer, handR: found.handr,
        uplegL: found.uplegl, legL: found.legl, footL: found.footl,
        uplegR: found.uplegr, legR: found.legr, footR: found.footr,
      };
      // CHAIN FIX (2026-11-07, torn chest/shoulders on the hoverboard): side-by-position is only safe for the ROOT of a limb
      // (shoulder joints / hip joints never cross). Hands and feet can: SHADDAI + ORACLE idle with FOLDED ARMS, so at bind time the
      // right hand sits on the body's left and was wired as handL → the solver twisted the left forearm toward the RIGHT hand.
      // Now fore/hand and leg/foot are taken from the DESCENDANTS of their own upper bone (geometry only picks the root).
      ['L', 'R'].forEach(function (s) {
        var up = b['arm' + s]; if (up) { b['fore' + s] = descKind(up, 'fore') || firstBoneChild(up); if (b['fore' + s]) b['hand' + s] = descKind(b['fore' + s], 'hand') || firstBoneChild(b['fore' + s]); }
        var ul = b['upleg' + s]; if (ul) { b['leg' + s] = descKind(ul, 'leg') || firstBoneChild(ul); if (b['leg' + s]) b['foot' + s] = descKind(b['leg' + s], 'foot') || firstBoneChild(b['leg' + s]); }
      });
      rig.b = b;
      // posed bones in PARENT-FIRST order (blend + matrix updates rely on this)
      [b.spine, b.neck, b.uplegL, b.legL, b.uplegR, b.legR, b.armL, b.foreL, b.armR, b.foreR]
        .forEach(function (o) { if (o) { rig.bones.push(o); rig.rest.set(o, o.quaternion.clone()); } });
      rig.hasBones = !!(b.uplegL && b.legL && b.footL && b.uplegR && b.legR && b.footR);
      rig.hipH = b.hips ? avatar.worldToLocal(wpos(b.hips, _tmp)).y : rig.height * 0.52;
      rig.footH = b.footL ? Math.max(0, avatar.worldToLocal(wpos(b.footL, _tmp)).y) : rig.height * 0.05;
      rig.full = rig.bones.map(function () { return new Q(); });
      rig.base = rig.bones.map(function () { return new Q(); });
      return rig;
    }
    function firstBoneChild(o) { for (var i = 0; i < o.children.length; i++) if (o.children[i].isBone) return o.children[i]; return null; }
    // nearest bone below `o` (breadth-first) whose limb word is `kind` (skips twist/roll helpers in between)
    function descKind(o, kind) {
      var q = o.children.slice();
      while (q.length) { var c = q.shift(); if (!c.isBone) continue; if (kindOf(limbWord(c.name)) === kind) return c; for (var i = 0; i < c.children.length; i++) q.push(c.children[i]); }
      return null;
    }

    // rotate `bone` (minimal rotation) so the joint `tip` moves onto the ray toward `target`
    function aimAt(bone, tip, target) {
      if (!bone || !tip) return;
      wpos(bone, _a); wpos(tip, _b);
      _d.subVectors(_b, _a); _t.subVectors(target, _a);
      if (_d.lengthSq() < 1e-10 || _t.lengthSq() < 1e-10) return;
      _q.setFromUnitVectors(_d.normalize(), _t.normalize());
      bone.getWorldQuaternion(_wq).premultiply(_q);
      if (bone.parent) { bone.parent.getWorldQuaternion(_pq).invert(); _wq.premultiply(_pq); }
      bone.quaternion.copy(_wq);
      bone.updateMatrixWorld(true);
    }
    function aimDir(bone, tip, dir) { if (!bone || !tip) return; wpos(bone, _el); _el.add(dir); aimAt(bone, tip, _el); }

    // analytic two-bone IK: place `end` at `target`, bending toward `pole` (world direction)
    function twoBone(upper, lower, end, target, pole) {
      if (!upper || !lower || !end) return;
      wpos(upper, _S); wpos(lower, _E); wpos(end, _F);
      var a = _S.distanceTo(_E), c = _E.distanceTo(_F);
      _dir.subVectors(target, _S);
      var d = _dir.length(); if (d < 1e-6 || a < 1e-6 || c < 1e-6) return;
      _dir.divideScalar(d);
      d = Math.max(Math.abs(a - c) * 1.02 + 1e-4, Math.min(d, (a + c) * 0.999));   // unreachable → straight limb pointing at it
      var x = (a * a + d * d - c * c) / (2 * d), h = Math.sqrt(Math.max(0, a * a - x * x));
      if (pole) _p.copy(pole).addScaledVector(_dir, -pole.dot(_dir)); else _p.set(0, 0, 0);
      if (_p.lengthSq() < 1e-8) _p.set(0, 1, 0).addScaledVector(_dir, -_dir.y);
      _p.normalize();
      _tg.copy(_S).addScaledVector(_dir, x).addScaledVector(_p, h);   // elbow/knee
      aimAt(upper, lower, _tg);
      _tg.copy(_S).addScaledVector(_dir, d);                            // (clamped) hand/foot
      aimAt(lower, end, _tg);
    }

    /* apply(w, T): T is a world-space target set (all optional):
     *   spineDir, neckDir           — unit directions for hips→neck / neck→head
     *   footL, footR, kneePoleL/R   — ankle targets + knee bend directions
     *   handL, handR, elbowPoleL/R  — wrist targets + elbow bend directions (IK)
     *   armDirL/R, foreDirL/R       — OR plain directions for arms (no IK target)
     * Caller must have placed + updateMatrixWorld()'d the avatar root first. */
    function apply(w, T) {
      if (!rig || !rig.bones.length || w <= 0.0005) return;
      var bs = rig.bones, i;
      // 1) pick the blend base per bone (mixer output, or rest if nobody else drives it)
      for (i = 0; i < bs.length; i++) {
        var lw = rig.last.get(bs[i]);
        if (lw && lw.equals(bs[i].quaternion)) bs[i].quaternion.copy(rig.rest.get(bs[i]));
        rig.base[i].copy(bs[i].quaternion);
      }
      boundModel.updateMatrixWorld(true);
      // 2) solve the full pose (w = 1), torso first so limbs start from the leaned shoulders
      var b = rig.b;
      if (T.spineDir && b.spine && b.neck) aimDir(b.spine, b.neck, T.spineDir);
      if (T.neckDir && b.neck && b.head) aimDir(b.neck, b.head, T.neckDir);
      if (T.footL) twoBone(b.uplegL, b.legL, b.footL, T.footL, T.kneePoleL);
      if (T.footR) twoBone(b.uplegR, b.legR, b.footR, T.footR, T.kneePoleR);
      if (T.handL) twoBone(b.armL, b.foreL, b.handL, T.handL, T.elbowPoleL);
      else if (T.armDirL) { aimDir(b.armL, b.foreL, T.armDirL); if (T.foreDirL) aimDir(b.foreL, b.handL, T.foreDirL); }
      if (T.handR) twoBone(b.armR, b.foreR, b.handR, T.handR, T.elbowPoleR);
      else if (T.armDirR) { aimDir(b.armR, b.foreR, T.armDirR); if (T.foreDirR) aimDir(b.foreR, b.handR, T.foreDirR); }
      // 3) blend base → full by w, remember what we wrote
      for (i = 0; i < bs.length; i++) {
        rig.full[i].copy(bs[i].quaternion);
        if (w < 0.999) bs[i].quaternion.slerpQuaternions(rig.base[i], rig.full[i], w);
        var m = rig.last.get(bs[i]); if (!m) { m = new Q(); rig.last.set(bs[i], m); }
        m.copy(bs[i].quaternion);
      }
      boundModel.updateMatrixWorld(true);
    }

    // hand every posed bone back to its rest pose (dismount complete / body swapped)
    function restore() {
      if (!rig) return;
      rig.bones.forEach(function (o) { var r = rig.rest.get(o); if (r) o.quaternion.copy(r); });
      rig.last.clear();
    }

    return {
      bind: bind, apply: apply, restore: restore,
      rig: function () { return rig; },
    };
  }
  return { create: create };
})();

window.buildWorldActions = function (opts) {
  var THREE = opts.THREE, scene = opts.scene, loader = opts.loader;
  if (!THREE || !scene) return null;
  var P = opts.playerPosGetter || function () { return window._playerPos; };

  // ONE ledger (sparks-ledger.js): the same balance as the 2D realm, arcade and dashboard
  var L = window.ShdSparks;
  function sparks() { return L ? L.get() : 0; }
  function addSparks(n) { if (L) L.add(n, '3d', n >= 0 ? 'earned in World 3D' : 'spent in World 3D'); hud(); }

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
      // COLOSSEUM: the realm DOOR enters the Tourney Hall (world-interiors). Inside,
      // the betting board greets you (auto-open on entry, B to reopen). This outdoor
      // trigger is only the fallback when the interiors module failed to build.
      var Lm = window.__worldLandmarks;
      var _noInteriors = !window.buildWorldInteriors;
      if (_noInteriors && Lm && Lm.arenaPos && Math.hypot(p.x - Lm.arenaPos[0], p.z - Lm.arenaPos[1]) < 50) { openArena(); return; }
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
  /* COLOSSEUM DESK (owner 2026-10-03): walking in is FREE. Fees apply ONLY while a real event is live (window.__colosseumEvent = { name, fee, pool }).
   * Otherwise: sign up for the next event (free), spectate, or free practice. The old 2D grid tactics game is a free optional practice mode, not "the Colosseum". */
  var SIGN_KEY = 'shd.colo.signup';
  function signedUp() { try { return localStorage.getItem(SIGN_KEY) === '1'; } catch (e) { return false; } }
  /* MODE SCREEN (owner 2026-10-23: "normal entry walk in, and when you get to the colosseum inside doors THEN you get asked what mode or
   * spectate, tournament sign up (coming soon)"). Opens at the lobby's inner arena doors (or B inside). Each mode opens its own picker. */
  function openArena() {
    var ev = window.__colosseumEvent || null, T = tourney(), btns = [];
    btns.push({ label: '👁  SPECTATE · walk into the arena', fn: closeModal });
    if (window.__hoverLeague && window.__hoverLeague.open) btns.push({ label: '🛹  HOVER LEAGUE · hover-skate match', fn: function () { closeModal(); try { window.__hoverLeague.open(); } catch (e) { pop('Hover League is warming up, try again in a moment.', '#ff6a5a'); } } });
    if (window.__naval && window.__naval.open) btns.push({ label: '⚓  NAVAL BATTLE · flood the arena', fn: function () { closeModal(); try { window.__naval.open(); } catch (e) { pop('Naval battle is warming up, try again in a moment.', '#ff6a5a'); } } });
    btns.push({ label: '♟  PRACTICE · classic tactics (free)', fn: function () { closeModal(); var X = window.__worldTactics; if (X && X.startFight({ entry: 0, pool: 0, tier: 0 })) pop('Practice match: no entry fee, no pool.', '#c084fc'); else pop('Practice is loading, try again in a moment.', '#ff6a5a'); } });
    if (ev && ev.fee > 0) btns.push({ label: '🏆  ENTER EVENT · ' + (ev.name || 'tournament') + ' (' + ev.fee + '⚡)', disabled: sparks() < ev.fee, fn: function () { addSparks(-ev.fee); var t = tourney(); t.fightPool += ev.fee; t.fightN++; saveTourney(t); closeModal(); pop('ENTERED: ' + (ev.name || 'event'), '#e8c45c'); } });
    else btns.push({ label: '🏆  TOURNAMENT SIGN-UP · coming soon', disabled: true, fn: function () {} });
    openModal('⚔ SHADDAI COLOSSEUM',
      '<b>Choose how you enter.</b> Spectating and practice are always free.' + (ev ? '<br><b>EVENT LIVE: ' + (ev.name || 'Tournament') + '</b> · pool ' + T.fightPool + '⚡' : '') +
      '<br><span style="opacity:.65;font-size:11px">B reopens this screen anywhere inside the Colosseum.</span>', btns);
  }

  addEventListener('keydown', function (e) {
    if (e.code !== 'KeyB') return;
    var a = document.activeElement;
    if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA')) return;
    var p = P(); if (!p) return;
    var L = window.__worldLandmarks;
    if (L && Math.hypot(p.x - L.garagePos[0], p.z - L.garagePos[1]) < 22) openGarage();
    // realm venue boards: B reopens the panel while inside the Colosseum / Garage halls
    else if (window._currentInterior === 'COLOSSEUM' || (window.__colosseumArena && window.__colosseumArena.group && window.__colosseumArena.group.visible)) openArena();
    else if (window._currentInterior === 'GARAGE') openGarage();
  });

  // ── REALM VENUE BOARDS (interior law): entering the Colosseum Hall greets you with the
  //    tourney board; entering the Hover Works opens the garage shop. Watch the host's
  //    _currentInterior (set on enter/exit) — no hooks needed in the interiors module.
  var _lastInterior = null;
  setInterval(function () {
    var cur = window._currentInterior || null;
    if (cur === _lastInterior) return;
    _lastInterior = cur;
    // COLOSSEUM: no greeting on entry any more - the mode screen waits at the lobby's inner arena doors (see the door watcher below)
    if (cur === 'GARAGE')    setTimeout(function () { if (window._currentInterior === 'GARAGE') openGarage(); }, 350);
  }, 400);
  function inColosseum() { var A = window.__colosseumArena; return window._currentInterior === 'COLOSSEUM' || !!(A && A.group && A.group.visible); }
  var _doorArmed = true;
  setInterval(function () {
    if (!inColosseum()) { _doorArmed = true; return; }
    var I = window.COLOSSEUM_ISLAND, p = P(); if (!I || !p) return;
    var dx = (p.x - I.x) / I.U, dz = (p.z - I.z) / I.U - (I.lobbyZ0 + 2), d = Math.hypot(dx, dz);   // arena metres; inner doors = lobby back wall
    if (_doorArmed && d < 7 && Math.abs(dx) < 10) { _doorArmed = false; openArena(); }
    else if (!_doorArmed && d > 14) _doorArmed = true;
  }, 300);

  /* ══════════════════════════════════════════════════════════════════════════════════
   * GRID BIKE V2 (2026-09-26) — owner: "the bike riding and the models not right" (rider
   * T-posed, standing OVER a toy-sized bike that snapped to the camera and floated flat on
   * hills). Everything here is data-driven by BIKE_TUNE; units in the table are REAL metres
   * and converted with U (world units per metre) so the numbers read like a spec sheet.
   * ══════════════════════════════════════════════════════════════════════════════════ */
  var U = 7 / 1.8;                    // 1 m = 3.889 world units (characters are 7 u = 1.8 m)
  var BIKE_TUNE = {
    lengthM: 2.4,        // real light-cycle length; the host's primitive bike is ~1.0 m → rescaled on attach
    topMS: 25,           // top speed (m/s) under full throttle — asymptotic via (1-(v/top)^2)
    accelMS2: 8,         // throttle acceleration at low speed
    brakeMS2: 14,        // S while rolling forward
    reverseMS: 4,        // S from a standstill backs up, slowly
    coastMS2: 1.4,       // rolling resistance with no input
    dragK: 0.004,        // aero drag (per m of v^2) — makes the top end taper naturally
    slopeGravity: 0.6,   // share of g·sin(slope) felt (hills slow you / downhill speeds you up)
    steerGain: 4.5,      // heading chases camera yaw with this P-gain (1/s)
    steerOffset: 0.55,   // A/D add ±this (rad) to the heading target (carve while looking ahead)
    turnRateLow: 2.6,    // max yaw rate (rad/s) at low speed…
    turnRateHigh: 1.15,  // …and at top speed (fast bikes turn wider)
    pivotMin: 0.35,      // share of turn rate available at a standstill (walk the bike around)
    bankMaxDeg: 34,      // lean clamp; lean = atan(v·yawRate/g) — real motorcycle physics
    terrainRollK: 0.3,   // bikes stay mostly upright on side-slopes (only 30% of camber)
    poseSmooth: 10,      // pitch/roll/height smoothing (1/s)
    radiusM: 0.55,       // collision radius vs realmColliders
    impactLoss: 0.75,    // speed lost on a head-on hit (scaled by impact angle)
    mountTime: 0.35,     // seconds for the rider to swing on / step off
    leanDeg: 42,         // rider torso tuck (from vertical)
    dismountSideM: 0.9,  // rider steps off to the bike's left by this much
  };
  // rider contact points in the host gridBike's OWN (unscaled) coordinates, bike faces +Z
  var BIKE_PTS = {
    seat:  [0, 1.10, -0.62],   // top of the cockpit's rear half
    gripL: [0.30, 1.15, 0.40], gripR: [-0.30, 1.15, 0.40],
    pegL:  [0.30, 0.35, -1.20], pegR: [-0.30, 0.35, -1.20],   // rear-set pegs → sport tuck, legs clear the rear wheel
  };
  var bike = (function () {
    var mesh = opts.bikeMesh || null, avatar = opts.avatar || null;
    var heightAt = function (x, z) {
      var f = opts.heightAt || window.WORLD_HEIGHT_AT;
      var h = f ? f(x, z) : 0; return isFinite(h) ? h : 0;
    };
    var colliders = function () {
      var c = opts.getColliders ? opts.getColliders() : (window.WORLD_LAYOUT && window.WORLD_LAYOUT.realmColliders);
      return c || [];
    };
    var RP = window.WorldRiderPose ? window.WorldRiderPose.create(THREE) : null;
    var s = {
      riding: false, ever: false, w: 0, v: 0, psi: 0, yawRate: 0, thr: 0,
      x: 0, z: 0, y: 0, pitch: 0, roll: 0, scale: 1, wb: 2.7, width: 0.6,
      out: { speedMS: 0, vx: 0, vz: 0 },
    };
    var V3 = THREE.Vector3;
    var _v = new V3(), _up = new V3(), _fw = new V3(), _lf = new V3(), _seat = new V3();
    var _standP = new V3(), _standQ = new THREE.Quaternion();
    var T = { spineDir: new V3(), neckDir: new V3(), footL: new V3(), footR: new V3(), handL: new V3(), handR: new V3(),
              kneePoleL: new V3(), kneePoleR: new V3(), elbowPoleL: new V3(), elbowPoleR: new V3() };

    // one-time: resize the primitive bike to real scale + add a seat pad and handlebar so the
    // rider has something visible to sit on / hold (the old bike had neither)
    function attach() {
      if (!mesh || mesh.userData.__v2) return;
      mesh.userData.__v2 = true;
      mesh.rotation.order = 'YXZ';                    // yaw, then pitch, then roll — no gimbal mixing
      mesh.scale.set(1, 1, 1); mesh.rotation.set(0, 0, 0);   // measure in the bike's own frame
      mesh.updateMatrixWorld(true);
      var box = new THREE.Box3().setFromObject(mesh), sz = box.getSize(new V3());
      var len = Math.max(sz.z, 0.01);
      s.scale = BIKE_TUNE.lengthM * U / len;
      mesh.scale.setScalar(s.scale);
      s.wb = 2.7 * s.scale;                            // host wheels sit at z=-1.4 / +1.3 (unscaled)
      s.width = 0.6 * s.scale;
      var dark = track(new THREE.MeshStandardMaterial({ color: 0x0a0c12, metalness: 0.85, roughness: 0.3 }));
      var glow = track(new THREE.MeshBasicMaterial({ color: 0x27e0ff, toneMapped: false }));
      var pad = new THREE.Mesh(track(new THREE.BoxGeometry(0.34, 0.07, 0.62)), dark);
      pad.position.set(BIKE_PTS.seat[0], BIKE_PTS.seat[1] - 0.04, BIKE_PTS.seat[2]); mesh.add(pad);
      var bar = new THREE.Mesh(track(new THREE.BoxGeometry(0.72, 0.05, 0.05)), dark);
      bar.position.set(0, BIKE_PTS.gripL[1], BIKE_PTS.gripL[2]); mesh.add(bar);
      var riser = new THREE.Mesh(track(new THREE.BoxGeometry(0.06, 0.2, 0.06)), dark);
      riser.position.set(0, BIKE_PTS.gripL[1] - 0.1, BIKE_PTS.gripL[2] - 0.02); mesh.add(riser);
      [BIKE_PTS.gripL, BIKE_PTS.gripR].forEach(function (g) {
        var tip = new THREE.Mesh(track(new THREE.BoxGeometry(0.08, 0.06, 0.06)), glow);
        tip.position.set(g[0] * 1.15, g[1], g[2]); mesh.add(tip);
      });
    }
    function wrap(a) { while (a > Math.PI) a -= 6.283185307; while (a < -Math.PI) a += 6.283185307; return a; }
    function ease(t) { return t * t * (3 - 2 * t); }
    function local(p, out) { return mesh.localToWorld(out.set(p[0], p[1], p[2])); }

    /* step(dt, input) — PHYSICS. Call in the host movement block INSTEAD of the walk velocity
     * code while the bike is mounted (and once on the frame B toggles it off, so the
     * dismount step-off happens). input = { riding, throttle(-1..1), steer(-1..1, +1 = right),
     * camYaw, pos (host playerPos, mutated), vel ({x,z} units/s — optional, carried in on mount) }.
     * Returns { speedMS, vx, vz } (vx/vz in world units/s so the host can sync its _vel). */
    function step(dt, inp) {
      attach();
      var pos = inp.pos; if (!pos) return s.out;
      dt = Math.min(dt, 0.05);                         // tab-switch hitch must not fling the bike
      if (inp.riding && !s.riding) {                   // MOUNT — summon the bike under you, carry walk speed
        s.riding = true; s.ever = true;
        s.psi = isFinite(inp.camYaw) ? inp.camYaw : (avatar ? avatar.rotation.y : 0);
        s.v = inp.vel ? Math.max(0, (inp.vel.x * Math.sin(s.psi) + inp.vel.z * Math.cos(s.psi)) / U) : 0;
        s.x = pos.x; s.z = pos.z; s.y = heightAt(pos.x, pos.z); s.pitch = 0; s.roll = 0; s.yawRate = 0; s.thr = 0;
      } else if (!inp.riding && s.riding) {            // DISMOUNT — park, rider steps off to the left
        s.riding = false; s.v = 0; s.yawRate = 0;
        pos.x = s.x + Math.cos(s.psi) * BIKE_TUNE.dismountSideM * U;   // bike-left = (cos ψ, -sin ψ)
        pos.z = s.z - Math.sin(s.psi) * BIKE_TUNE.dismountSideM * U;
      }
      var o = s.out;
      if (!s.riding) { o.speedMS = 0; o.vx = 0; o.vz = 0; return o; }
      var B = BIKE_TUNE;
      s.x = pos.x; s.z = pos.z;                        // host collision may have nudged us last frame
      // ── steering: chase the camera heading (mouse steers), A/D carve an offset ──
      var target = (isFinite(inp.camYaw) ? inp.camYaw : s.psi) - (inp.steer || 0) * B.steerOffset;
      var av = Math.abs(s.v), sf = Math.min(1, av / B.topMS);
      var maxRate = (B.turnRateLow + (B.turnRateHigh - B.turnRateLow) * sf) * (B.pivotMin + (1 - B.pivotMin) * Math.min(1, av / 3));
      var rate = Math.max(-maxRate, Math.min(maxRate, wrap(target - s.psi) * B.steerGain));
      s.psi = wrap(s.psi + rate * dt);
      s.yawRate += (rate - s.yawRate) * (1 - Math.exp(-8 * dt));
      // ── longitudinal: throttle / brake / reverse / coast + slope gravity ──
      s.thr += ((inp.throttle || 0) - s.thr) * (1 - Math.exp(-8 * dt));   // no on/off snap
      var th = s.thr, a;
      if (th > 0.02) a = s.v < -0.2 ? B.brakeMS2 : B.accelMS2 * th * Math.max(0, 1 - (s.v / B.topMS) * (s.v / B.topMS));
      else if (th < -0.02) a = s.v > 0.2 ? -B.brakeMS2 * -th : -B.accelMS2 * 0.5 * -th * Math.max(0, 1 + s.v / B.reverseMS);
      else a = 0;
      var drag = B.coastMS2 * (th > 0.02 ? 0.3 : 1) + B.dragK * s.v * s.v;
      var sx = Math.sin(s.psi), cz = Math.cos(s.psi), hw = s.wb * 0.5;
      var grade = (heightAt(s.x + sx * hw, s.z + cz * hw) - heightAt(s.x - sx * hw, s.z - cz * hw)) / Math.max(s.wb, 0.01);
      a -= 9.81 * B.slopeGravity * grade / Math.sqrt(1 + grade * grade);
      var vPrev = s.v;
      s.v += a * dt;
      if (Math.abs(th) <= 0.02 || (th > 0 && s.v > 0) || (th < 0 && s.v < 0)) {  // drag opposes motion, never reverses it
        var dv = drag * dt;
        s.v = Math.abs(s.v) <= dv ? 0 : s.v - Math.sign(s.v) * dv;
      }
      if (vPrev > 0 && s.v < 0 && th >= -0.02) s.v = 0;     // braking to zero stops; reversing needs S held
      s.v = Math.max(-B.reverseMS, Math.min(B.topMS * 1.1, s.v));
      // parking brake: no input + nearly stopped + gentle slope → stay put (no creeping downhill)
      if (Math.abs(th) <= 0.02 && Math.abs(s.v) < 0.4 && Math.abs(grade) < 0.35) s.v = 0;
      // ── move + slide along realm collider circles ──
      var step_ = s.v * U * dt;
      s.x += sx * step_; s.z += cz * step_;
      var cs = colliders(), rb = B.radiusM * U;
      for (var i = 0; i < cs.length; i++) {
        var c = cs[i]; if (!c) continue;
        var rr = c.r + rb, dx = s.x - c.x, dz = s.z - c.z;
        if (dx > rr || dx < -rr || dz > rr || dz < -rr) continue;
        var d2 = dx * dx + dz * dz;
        if (d2 >= rr * rr || d2 < 1e-8) continue;
        var d = Math.sqrt(d2), nx = dx / d, nz = dz / d;
        s.x = c.x + nx * rr; s.z = c.z + nz * rr;             // push out → tangential motion survives = slide
        var into = -(sx * nx + cz * nz) * Math.sign(s.v || 1); // 1 = head-on, 0 = grazing
        if (into > 0) s.v *= 1 - B.impactLoss * into;
      }
      pos.x = s.x; pos.z = s.z;
      o.speedMS = s.v; o.vx = sx * s.v * U; o.vz = cz * s.v * U;
      return o;
    }

    /* pose(dt, ctx) — VISUALS. Call AFTER the host has placed playerAvatar for the frame
     * (i.e. where the old `if(bikeMode){ gridBike.position.set(...) }` block was).
     * ctx = { groundY (host ground under the player), flat (true inside interiors / on lifts) } */
    function pose(dt, ctx) {
      if (!mesh || !s.ever) return;
      attach();
      ctx = ctx || {};
      var B = BIKE_TUNE, k = 1 - Math.exp(-B.poseSmooth * dt);
      mesh.visible = true;                             // parked bike stays where you left it
      // ── terrain contact: wheels front/back, sides left/right ──
      var sx = Math.sin(s.psi), cz = Math.cos(s.psi), hw = s.wb * 0.5, ws = s.width * 0.5;
      var hc = heightAt(s.x, s.z), gy = isFinite(ctx.groundY) ? ctx.groundY : hc;
      var flat = ctx.flat || Math.abs(gy - hc) > 0.6 * U;   // on a deck / lift / interior floor → no terrain samples
      var y, pT = 0, rT = 0;
      if (flat) y = gy;
      else if (hc < -0.45) y = 0.05;                    // over the sea: skim the surface (hydro-cycle)
      else {
        var hf = heightAt(s.x + sx * hw, s.z + cz * hw), hb = heightAt(s.x - sx * hw, s.z - cz * hw);
        var hl = heightAt(s.x + cz * ws, s.z - sx * ws), hr = heightAt(s.x - cz * ws, s.z + sx * ws);
        y = Math.max((hf + hb) * 0.5, hc - 0.05);        // both wheels touch; never sink below centre ground
        pT = -Math.atan2(hf - hb, s.wb);                 // +X rotation tips the nose DOWN
        rT = Math.atan2(hl - hr, s.width) * B.terrainRollK;
      }
      var bankMax = B.bankMaxDeg * Math.PI / 180;
      var bank = s.riding ? -Math.atan(s.v * s.yawRate / 9.81) : 0;   // turning left (ψ↑) leans left (+X down)
      bank = Math.max(-bankMax, Math.min(bankMax, bank));
      s.pitch += (pT - s.pitch) * k;
      s.roll += (rT + bank - s.roll) * k;
      s.y = Math.abs(y - s.y) > 3 * U ? y : s.y + (y - s.y) * Math.min(1, k * 2);
      mesh.position.set(s.x, s.y, s.z);
      mesh.rotation.set(s.pitch, s.psi, s.roll, 'YXZ');
      mesh.updateMatrixWorld(true);
      // ── rider blend weight (smooth swing on / step off) ──
      s.w = Math.max(0, Math.min(1, s.w + (s.riding ? dt : -dt) / B.mountTime));
      if (!avatar) return;
      if (s.w <= 0) {                                  // fully off: hand the bones back ONCE (the mixer owns them again)
        if (!s.restored && RP && RP.rig()) RP.restore();
        s.restored = true; return;
      }
      s.restored = false;
      var e = ease(s.w);
      var rig = RP ? RP.bind(avatar) : null;
      var hipH = rig ? rig.hipH : 3.6;
      // seated root: hips a hair above the seat pad, body leaned with the bike
      _up.set(0, 1, 0).applyQuaternion(mesh.quaternion);
      local(BIKE_PTS.seat, _seat).addScaledVector(_up, 0.08 * U - hipH);
      _standP.copy(avatar.position); _standQ.copy(avatar.quaternion);
      avatar.position.lerpVectors(_standP, _seat, e);
      avatar.quaternion.slerpQuaternions(_standQ, mesh.quaternion, e);
      avatar.visible = ctx.showRider !== false;
      avatar.updateMatrixWorld(true);
      if (!RP || !rig || !rig.hasBones) return;
      // ── riding pose targets (world space) ──
      _fw.set(0, 0, 1).applyQuaternion(mesh.quaternion);
      _lf.set(1, 0, 0).applyQuaternion(mesh.quaternion);
      var lean = (B.leanDeg + 8 * Math.min(1, Math.abs(s.v) / B.topMS)) * Math.PI / 180;   // tuck deeper at speed
      T.spineDir.copy(_up).multiplyScalar(Math.cos(lean)).addScaledVector(_fw, Math.sin(lean));
      T.neckDir.copy(_up).multiplyScalar(0.9).addScaledVector(_fw, 0.45).normalize();         // chin up, eyes on the road
      local(BIKE_PTS.pegL, T.footL).addScaledVector(_up, rig.footH * 0.6);
      local(BIKE_PTS.pegR, T.footR).addScaledVector(_up, rig.footH * 0.6);
      local(BIKE_PTS.gripL, T.handL); local(BIKE_PTS.gripR, T.handR);
      T.kneePoleL.copy(_fw).addScaledVector(_lf, 0.35).addScaledVector(_up, -0.2);
      T.kneePoleR.copy(_fw).addScaledVector(_lf, -0.35).addScaledVector(_up, -0.2);
      T.elbowPoleL.copy(_lf).multiplyScalar(0.8).addScaledVector(_up, -0.5).addScaledVector(_fw, -0.4);
      T.elbowPoleR.copy(_lf).multiplyScalar(-0.8).addScaledVector(_up, -0.5).addScaledVector(_fw, -0.4);
      RP.apply(e, T);
    }

    return {
      tune: BIKE_TUNE, points: BIKE_PTS,
      step: step, pose: pose,
      isRiding: function () { return s.riding; },
      visible: function () { return s.ever; },
      speedMS: function () { return s.v; },
      heading: function () { return s.psi; },
      trailY: function () { return s.y + 0.35 * s.scale; },   // light-trail height follows the terrain
      setAvatar: function (a) { avatar = a; },
      setMesh: function (m) { mesh = m; },
    };
  })();

  var lastT = 0;
  return {
    bike: bike,
    bikeRide: bike.step,
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
