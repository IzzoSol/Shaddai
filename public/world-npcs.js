/* world-npcs.js — living council-agent NPCs for SHADDAI World 3D.
 *
 * Loads each agent's static standee GLB (/assets/agents/<CODE>.glb?v=7).
 * Because standees have no skeleton, locomotion is PROCEDURAL:
 *   • walk-bob    — sin²-sine vertical bob while moving (smooth double-peak cadence)
 *   • body sway   — gentle Z-roll oscillation in sync with bob (half frequency)
 *   • step lean   — subtle X-rotation fore-aft weight-shift per step
 *   • breathing   — very slow Y micro-pulse while idle
 *
 * Polish additions (v3 — liveliness pass):
 *   • Varied speeds : per-NPC speed multiplier (0.65–1.15×) — each agent feels distinct.
 *   • Look-around   : during idle pauses the body slowly turns L or R then back,
 *                     as if scanning the plaza before moving on.
 *   • Natural paths : slow steer-drift random-walks the movement angle (±0.28 rad)
 *                     so walks curve gently instead of beelining in a straight line.
 *   • Angle-scaled turn : coarse corrections turn fast, fine adjustments slow —
 *                     eliminates micro-jitter while keeping responsive course changes.
 *   • Player awareness : face player + gentle idle sway (rotation.z) while watching.
 *   • Name label    : cheap canvas THREE.Sprite billboard above each NPC, accent color,
 *                     monospace font, soft drop-shadow for readability.
 *   • Accent aura   : flat RingGeometry under each NPC, accent tint, opacity 0.35,
 *                     gently pulses with breathe phase — cheap identity marker.
 *
 * Public interface (unchanged):
 *   window.buildWorldNPCs(THREE, scene, loader, heightAt, opts)
 *     → { update(dt), walkers }
 *
 * opts (all optional):
 *   opts.getPlayer()  → THREE.Vector3   — enables distance-cull + awareness
 *   opts.cullDist     → number (350)    — units beyond which NPCs freeze
 *   opts.speed        → number (5.5)    — base walk speed (units/sec)
 *   opts.scale        → number (3.2)    — target NPC height in world units
 *   opts.agents       → [{code,color}]  — override default agent roster
 */
window.buildWorldNPCs = function (THREE, scene, loader, heightAt, opts) {
  'use strict';
  opts = opts || {};

  // ── tiny helpers (no allocation) ──────────────────────────────────────────
  var TWO_PI = Math.PI * 2;
  var gy = function (x, z) {
    var y = heightAt ? heightAt(x, z) : 0;
    return (y === y && isFinite(y)) ? y : 0;   // NaN-safe
  };
  var clamp = function (v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; };

  // shortest-arc angle lerp (no allocation)
  var lerpAngle = function (cur, tgt, t) {
    var d = tgt - cur;
    while (d >  Math.PI) d -= TWO_PI;
    while (d < -Math.PI) d += TWO_PI;
    return cur + d * t;
  };

  // shortest-arc absolute difference
  var angleDiff = function (a, b) {
    var d = Math.abs(b - a);
    while (d > Math.PI) d -= TWO_PI;
    return Math.abs(d);
  };

  // ── tuning constants ───────────────────────────────────────────────────────
  var BASE_SPEED   = opts.speed    || 5.5;   // units/sec
  var MODEL_HEIGHT = opts.scale    || 3.2;   // world-unit target height
  var CULL_DIST    = opts.cullDist || 350;
  var CULL_DIST2   = CULL_DIST * CULL_DIST;
  var TURN_SPEED   = 4.5;    // rad/sec base turn rate
  var BOB_AMP      = 0.13;   // vertical bob amplitude (world units)
  var BOB_HZ       = 1.3;    // step cycles/sec — sin² doubles peaks → ~2.6 steps/sec
  var SWAY_AMP     = 0.038;  // body roll amplitude (radians, side-to-side)
  var LEAN_AMP     = 0.012;  // fore-aft lean amplitude (radians, per step)
  var BREATHE_AMP  = 0.022;  // idle breathing bob amplitude
  var BREATHE_HZ   = 0.35;   // idle breathing cycles/sec
  var IDLE_MIN     = 2.0;    // seconds idle at waypoint (min)
  var IDLE_MAX     = 6.0;    // seconds idle at waypoint (max)
  var REACH_DIST   = 5.0;    // waypoint "arrived" radius
  var BLDG_RADIUS  = 26;     // avoidance/exclusion zone around each building
  var PUSH_RADIUS  = BLDG_RADIUS + 10;  // start pushing before hitting the hard radius
  var SCATTER_R    = 60;     // max radius for random scatter waypoints (kept tight so NPCs stay near their district, not roaming the whole map)
  var SCATTER_N    = 10;     // how many scatter points to add per NPC

  // ── liveliness tuning (v3) ─────────────────────────────────────────────────
  var LOOK_SPEED   = 1.6;    // rad/sec for look-around body swing
  var LOOK_AMP     = 0.80;   // max look-around swing (±radians, ~46°)
  var STEER_MAX    = 0.28;   // max steer-drift offset (radians)
  var STEER_SPEED  = 0.55;   // how fast steer drifts toward new target (lerp rate)
  var AWARE_SWAY   = 0.024;  // rotation.z amplitude while watching player (radians)
  var AWARE_SWAY_HZ = 0.6;   // cycles/sec of sway while watching

  // ── player-awareness tuning ────────────────────────────────────────────────
  var AWARE_DIST   = 12;                  // units — NPC notices player
  var AWARE_DIST2  = AWARE_DIST * AWARE_DIST;
  var AWARE_TURN   = TURN_SPEED * 1.8;   // faster turn to face player
  var HOME_CHANCE  = 0.6;                // probability of returning to home building (high → agents mostly linger at their own district, short walks only)

  // ── PERF: pre-squared thresholds & detail-cull tier ─────────────────────────
  // Hoisted out of the per-frame update() path so they are computed once, not
  // per-walker per-frame.
  var REACH2       = REACH_DIST * REACH_DIST;      // waypoint-arrival radius²
  var PUSH_R2      = PUSH_RADIUS * PUSH_RADIUS;     // avoidance push radius²
  var REACH_2X     = REACH_DIST * 2;               // driftMix lower bound
  var REACH_6X     = REACH_DIST * 6;               // driftMix span
  // Cosmetic aura pulse is a sub-pixel effect far away — detail-cull it beyond
  // AURA_DIST so we skip the sin() + 3 scale writes for distant NPCs (they
  // still walk normally; only the ring stops breathing). Opt-in override.
  var AURA_DIST    = opts.auraDist || 130;
  var AURA_DIST2   = AURA_DIST * AURA_DIST;

  // ── PERF: mid-distance LOD tier — stagger far-NPC updates ──────────────────
  // NPCs between FAR_DIST and CULL_DIST are still visible but far enough that a
  // reduced update cadence is imperceptible. Instead of running the full
  // walk/anim/avoidance path every frame for them, we round-robin: each far
  // NPC is processed only every FAR_STRIDE-th frame, and the skipped frames'
  // dt is ACCUMULATED so movement + animation advance by the correct amount
  // (no slow-mo, no desync — it just updates in coarser steps far away).
  // NPCs within FAR_DIST (i.e. near the player) always update every frame, so
  // their look/behaviour is byte-for-byte identical to before.
  var FAR_DIST     = opts.farDist  || 170;   // beyond this → staggered cadence
  var FAR_DIST2    = FAR_DIST * FAR_DIST;
  var FAR_STRIDE   = Math.max(1, opts.farStride || 4);  // process every Nth frame (tightened 3→4: at 170+ units a ~15Hz cadence is imperceptible, dt is accumulated so motion stays correct)
  var _frame       = 0;   // global frame counter for round-robin phase

  // ── PERF: one shared ring geometry for every aura (colour lives in the
  // per-NPC material, so geometry can be shared — fewer GPU buffers). ─────────
  var _sharedRingGeo = new THREE.RingGeometry(1.1, 2.0, 48);

  // ── name-label sprite factory ──────────────────────────────────────────────
  // Returns a THREE.Sprite with canvas texture; accent-colored monospace text.
  var makeLabel = function (code, accentHex) {
    var W = 256, H = 64;
    var cv  = document.createElement('canvas');
    cv.width = W; cv.height = H;
    var ctx = cv.getContext('2d');
    ctx.clearRect(0, 0, W, H);
    // dark pill background for contrast
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(10, 12, W - 20, H - 24, 10)
                  : ctx.rect(10, 12, W - 20, H - 24);  // fallback for older browsers
    ctx.fill();
    // accent text
    ctx.font = 'bold 26px "Courier New",monospace';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor  = 'rgba(0,0,0,0.9)';
    ctx.shadowBlur   = 6;
    ctx.fillStyle    = '#' + ('000000' + (accentHex & 0xFFFFFF).toString(16)).slice(-6);
    ctx.fillText(code, W / 2, H / 2);

    var tex = new THREE.CanvasTexture(cv);
    tex.needsUpdate = true;
    var mat = new THREE.SpriteMaterial({
      map:          tex,
      transparent:  true,
      depthWrite:   false,
      sizeAttenuation: true,
    });
    var sprite = new THREE.Sprite(mat);
    // scale: width ~5.5 world units, height proportional
    sprite.scale.set(5.5, 5.5 * (H / W), 1);
    return sprite;
  };

  // ── accent aura ring factory ───────────────────────────────────────────────
  // Flat ring mesh in XZ plane, softly tinted to agent accent.
  var makeAura = function (accentHex) {
    var mat = new THREE.MeshBasicMaterial({
      color:       new THREE.Color(accentHex),
      transparent: true,
      opacity:     0.35,
      side:        THREE.DoubleSide,
      depthWrite:  false,
    });
    var ring = new THREE.Mesh(_sharedRingGeo, mat);  // shared geometry (PERF)
    ring.rotation.x = -Math.PI / 2;   // lay flat
    ring.position.y = 0.08;           // just above terrain
    // PERF: local transform only changes when the pulse rewrites scale, so we
    // opt out of the automatic per-frame matrix recompute and bake the matrix
    // ourselves — once here, and again inside the pulse block when scale moves.
    ring.matrixAutoUpdate = false;
    ring.updateMatrix();
    return ring;
  };

  // ── agent roster — read colors from WORLD_LAYOUT, skip SHADDAI center ──────
  var DEFAULT_AGENTS = (function () {
    var list = [];
    var sectors = (window.WORLD_LAYOUT && window.WORLD_LAYOUT.sectors) || [];
    for (var i = 0; i < sectors.length; i++) {
      var s = sectors[i];
      if (s.code !== 'SHADDAI') {
        list.push({ code: s.code, color: s.color || 0x34e5b0 });
      }
    }
    if (!list.length) {
      list = [
        { code: 'ZEROX',   color: 0x27e0ff },
        { code: 'ORACLE',  color: 0xc084fc },
        { code: 'NEXUS',   color: 0x34e5b0 },
        { code: 'TURTLE',  color: 0x1fd6c4 },
        { code: 'QUILL',   color: 0xb98cff },
        { code: 'PIKADON', color: 0xff5a6e },
      ];
    }
    return list;
  }());
  var AGENTS = opts.agents || DEFAULT_AGENTS;

  // ── shared building list for avoidance + waypoints ─────────────────────────
  var buildings = [];   // [{ x, z }]

  var refreshBuildings = function () {
    buildings = [];
    var sectors = (window.WORLD_LAYOUT && window.WORLD_LAYOUT.sectors) || [];
    for (var i = 0; i < sectors.length; i++) {
      var s = sectors[i];
      if (s.pos) buildings.push({ x: s.pos[0], z: s.pos[1] });
    }
  };

  var clearOfBuildings = function (x, z) {
    for (var b = 0; b < buildings.length; b++) {
      var dx = x - buildings[b].x, dz = z - buildings[b].z;
      if (dx * dx + dz * dz < BLDG_RADIUS * BLDG_RADIUS) return false;
    }
    return true;
  };

  // Combined blocker check: sector-centre exclusion zone + pixel-perfect collider.
  // WORLD_COLLIDES may not exist yet at waypoint-build time — falls back gracefully.
  var isBlocked = function (x, z) {
    if (!clearOfBuildings(x, z)) return true;
    if (window.WORLD_COLLIDES && window.WORLD_COLLIDES(x, z)) return true;
    return false;
  };

  // build a shared patrol waypoint list:
  //   1. all building district centres (good rally/home points)
  //   2. scatter of clear random points for variety
  // NOTE: the first buildings.length entries are always building entrances —
  //       used by homeWpIdx below.
  var sharedWaypoints = null;
  var buildSharedWaypoints = function () {
    if (sharedWaypoints) return sharedWaypoints;
    refreshBuildings();
    var pts = [];
    // building district entrances (NPC stands just outside the front)
    for (var i = 0; i < buildings.length; i++) {
      var bx = buildings[i].x, bz = buildings[i].z;
      var len = Math.sqrt(bx * bx + bz * bz) || 1;
      pts.push({
        x: bx - (bx / len) * (BLDG_RADIUS + 4),
        z: bz - (bz / len) * (BLDG_RADIUS + 4)
      });
    }
    // random clear scatter
    var tries = 0;
    while (pts.length < buildings.length + SCATTER_N && tries < 400) {
      tries++;
      var a   = Math.random() * TWO_PI;
      var r   = 35 + Math.random() * SCATTER_R;
      var sx  = Math.cos(a) * r, sz = Math.sin(a) * r;
      if (!isBlocked(sx, sz)) pts.push({ x: sx, z: sz });
    }
    sharedWaypoints = pts;
    return pts;
  };

  // ── pre-allocated scratch for update() — zero allocation per frame ─────────
  var _playerPos = new THREE.Vector3();
  var _hasPlayer = typeof opts.getPlayer === 'function';

  // ── walkers array (public) ─────────────────────────────────────────────────
  var walkers = [];

  // ── load each agent GLB ───────────────────────────────────────────────────
  AGENTS.forEach(function (agent, idx) {
    var url = '/assets/agents/' + agent.code + '.glb?v=9';

    loader.load(url, function (gltf) {
      try {
        var m = gltf.scene;

        // ── scale to target height ───────────────────────────────────────
        var box1   = new THREE.Box3().setFromObject(m);
        var sizeVec = new THREE.Vector3();
        box1.getSize(sizeVec);
        var s = MODEL_HEIGHT / (sizeVec.y || 1);
        m.scale.setScalar(s);

        // ── foot-align: recompute bounds after scale ─────────────────────
        var box2  = new THREE.Box3().setFromObject(m);
        var baseY = -box2.min.y;   // push up so feet sit at group Y=0
        m.position.y = baseY;

        // ── kill white glow; tint toward agent accent (30 % blend) ───────
        var accentCol = new THREE.Color(agent.color);
        m.traverse(function (c) {
          if (!c.isMesh) return;
          c.castShadow    = true;
          c.receiveShadow = false;
          c.frustumCulled = false;   // don't flicker at view edge

          var srcMats = Array.isArray(c.material) ? c.material : [c.material];
          var newMats = srcMats.map(function (mat) {
            if (!mat) return mat;
            var nm = mat.clone();
            if (nm.emissive)        nm.emissive.set(0, 0, 0);
            nm.emissiveIntensity    = 0;
            nm.metalness = clamp((nm.metalness != null ? nm.metalness : 0), 0, 0.12);
            nm.roughness = clamp((nm.roughness != null ? nm.roughness : 0.8), 0.55, 1.0);
            if (nm.color) nm.color.lerp(accentCol, 0.28);
            return nm;
          });
          c.material = Array.isArray(c.material) ? newMats : newMats[0];
        });

        // ── group: grp = world pos/rot; m = bob-animated inner mesh ──────
        var grp = new THREE.Group();
        grp.add(m);
        grp.name = 'NPC_' + agent.code;

        // ── name label (billboard sprite) above the model ─────────────────
        var label = makeLabel(agent.code, agent.color);
        label.position.set(0, MODEL_HEIGHT + 1.1, 0);  // above head
        // PERF: the label's local transform never changes (it only rides along
        // with grp and billboards toward the camera in-shader), so skip its
        // per-frame matrix recompute and bake the local matrix once.
        label.matrixAutoUpdate = false;
        label.updateMatrix();
        grp.add(label);

        // ── accent aura ring at feet ──────────────────────────────────────
        var auraRing = makeAura(agent.color);
        grp.add(auraRing);

        // ── starting position near this agent's own district ─────────────
        var wp       = buildSharedWaypoints();
        var startIdx = idx % wp.length;
        var startPt  = wp[startIdx] || { x: (Math.random() - 0.5) * 80, z: (Math.random() - 0.5) * 80 };

        grp.position.set(startPt.x, gy(startPt.x, startPt.z), startPt.z);
        scene.add(grp);

        // ── per-NPC speed personality: 0.65–1.15× base speed ─────────────
        // Using a Beta-like distribution: sum two randoms → cluster toward centre.
        var speedMult = 0.65 + (Math.random() + Math.random()) * 0.25;  // 0.65–1.15

        // ── walker state object ──────────────────────────────────────────
        var nextIdx = (startIdx + 1 + Math.floor(Math.random() * (wp.length - 1))) % wp.length;
        var walker = {
          grp:         grp,
          m:           m,          // inner mesh group (bobbed)
          auraRing:    auraRing,   // accent ring at feet (pulsed)
          baseY:       baseY,
          agent:       agent,
          speed:       BASE_SPEED * speedMult,
          // patrol target
          tx:          wp[nextIdx].x,
          tz:          wp[nextIdx].z,
          // smooth facing
          facing:      Math.random() * TWO_PI,
          // walk-bob phase (radians, grows over time)
          phase:       Math.random() * TWO_PI,
          breathPhase: Math.random() * TWO_PI,
          // idle countdown; start with brief pause so NPCs don't all sprint at once
          idle:        Math.random() * IDLE_MAX,
          // waypoint index
          wpIdx:       nextIdx,
          waypoints:   wp,
          // home building entrance waypoint (first buildings.length slots in wp)
          homeWpIdx:   idx % Math.max(buildings.length, 1),
          // player-awareness flag
          aware:       false,
          awaySway:    Math.random() * TWO_PI,  // phase for sway while watching player

          // ── v3 liveliness state ────────────────────────────────────────
          // look-around (idle body swing)
          lookTimer:   Math.random() * 2.0,   // seconds until next look-around trigger
          lookAngle:   0,                      // current body-swing offset (radians)
          lookTarget:  0,                      // target body-swing offset

          // steer drift (curved walk paths)
          steerAngle:  0,                      // current movement-dir offset (radians)
          steerTarget: 0,                      // target offset
          steerTimer:  Math.random() * 3.0,   // seconds until next steer change

          // ── stuck-recovery state ───────────────────────────────────────
          stuckTimer:  0,           // secs elapsed since last meaningful movement
          stuckX:      startPt.x,  // last progress-checkpoint X
          stuckZ:      startPt.z,  // last progress-checkpoint Z

          // ── PERF: staggered-update dt accumulator ──────────────────────
          // Holds unspent dt for far NPCs between their strided updates so no
          // simulation time is lost. Near NPCs reset it every frame.
          _acc:        0,

          // ── PERF: hard-cull visibility latch ───────────────────────────
          // true while frozen beyond CULL_DIST (grp.visible=false so the GPU
          // skips it entirely). Flipped back on when the NPC re-enters range.
          _culled:     false,
        };
        walkers.push(walker);

      } catch (e) { /* silently skip bad GLB */ }
    }, undefined, function () { /* 404 / load error — skip silently */ });
  });

  // ── advance to next waypoint ───────────────────────────────────────────────
  var nextWaypoint = function (w) {
    var wp  = w.waypoints;
    var rnd = Math.random();
    var newIdx;
    if (rnd < HOME_CHANCE) {
      // return to own building entrance (home behaviour)
      newIdx = w.homeWpIdx;
    } else if (rnd < HOME_CHANCE + 0.35) {
      // random jump for variety
      newIdx = Math.floor(Math.random() * wp.length);
    } else {
      // sequential sweep
      newIdx = (w.wpIdx + 1) % wp.length;
    }
    // Reject waypoints that sit inside a solid building at runtime.
    // Walk forward through the list until we find a clear slot (or exhaust all).
    if (window.WORLD_COLLIDES) {
      var guard = 0;
      while (guard < wp.length && window.WORLD_COLLIDES(wp[newIdx].x, wp[newIdx].z)) {
        newIdx = (newIdx + 1) % wp.length;
        guard++;
      }
    }
    w.wpIdx = newIdx;
    w.tx    = wp[w.wpIdx].x;
    w.tz    = wp[w.wpIdx].z;
    w.idle  = 0;   // start moving immediately
    // reset steer drift so we don't immediately veer off on departure
    w.steerAngle  = 0;
    w.steerTarget = 0;
    // reset stuck-recovery so the new target gets a fresh 2.5 s budget
    w.stuckTimer  = 0;
  };

  // ── update loop ───────────────────────────────────────────────────────────
  return {
    walkers: walkers,

    update: function (dt) {
      if (!dt || !isFinite(dt) || dt <= 0) dt = 0.016;
      if (dt > 0.10) dt = 0.10;   // clamp spike frames (tab re-focus etc.)

      // optional: grab player position once per frame for cull + awareness
      if (_hasPlayer) {
        var pp = opts.getPlayer();
        if (pp) { _playerPos.x = pp.x; _playerPos.y = pp.y; _playerPos.z = pp.z; }
      }

      _frame++;   // advance round-robin phase for staggered far-NPC updates

      for (var i = 0; i < walkers.length; i++) {
        var w  = walkers[i];
        var gx = w.grp.position.x;
        var gz = w.grp.position.z;

        // ── distance cull — freeze NPC if far from player ────────────────
        // Compute squared player-distance ONCE and reuse it for the hard cull,
        // the cosmetic aura detail-cull, and the proximity-awareness check
        // below (previously this was recomputed 2–3× per walker per frame).
        var pd2 = -1;   // <0 sentinel = no player → treat as "always near"
        if (_hasPlayer) {
          var cdx = gx - _playerPos.x, cdz = gz - _playerPos.z;
          pd2 = cdx * cdx + cdz * cdz;
          if (pd2 > CULL_DIST2) {
            // hard cull — freeze distant NPCs with TRULY zero per-frame cost:
            // no matrix writes, no anim, and hide the group so the GPU skips it.
            if (!w._culled) { w.grp.visible = false; w._culled = true; }
            continue;
          }
        }
        // back in range → un-hide once (latch avoids a write every frame).
        if (w._culled) { w.grp.visible = true; w._culled = false; }

        // ── PERF: mid-distance LOD — stagger updates for far NPCs ─────────
        // Accumulate every frame's dt. NEAR NPCs (no player, or within
        // FAR_DIST) always process this frame — identical to before. FAR
        // NPCs process only on their round-robin slot; on skipped frames we
        // bail out early (no anim/avoidance/matrix work) and keep the dt for
        // their next real update, so motion stays correct, just coarser.
        w._acc += dt;
        if (pd2 >= 0 && pd2 > FAR_DIST2 && ((_frame + i) % FAR_STRIDE) !== 0) {
          continue;   // not this far-NPC's turn — skip the heavy path
        }
        var wdt = w._acc;         // effective delta for all work below
        w._acc = 0;
        if (wdt > 0.20) wdt = 0.20;   // guard against a huge accumulated spike

        // ── aura pulse: gently scale with breathe phase ──────────────────
        // Detail-cull: only pulse when close (or when there is no player to
        // measure against). Far-away rings hold a static scale — invisible.
        if (w.auraRing && (pd2 < 0 || pd2 < AURA_DIST2)) {
          var auraSc = 1 + Math.sin(w.breathPhase * 0.85) * 0.09;
          w.auraRing.scale.x = auraSc;
          w.auraRing.scale.y = auraSc;   // ring is in XY pre-rotation; both needed
          w.auraRing.scale.z = auraSc;
          w.auraRing.updateMatrix();     // PERF: matrixAutoUpdate=false → bake here
        }

        // ── PLAYER AWARENESS: pause + face player + gentle sway when nearby
        // Runs before idle/walk so it can override both.
        if (_hasPlayer) {
          // reuse pd2 from the cull step (pd2 >= 0 whenever _hasPlayer)
          if (pd2 < AWARE_DIST2) {
            if (!w.aware) {
              w.aware = true;
              // interrupt current walk: force a watch-pause of 1.2–3 s
              if (w.idle < 1.2) w.idle = 1.2 + Math.random() * 1.8;
            }
            // vector to player (only needed on the rare close-up frames)
            var pdx = _playerPos.x - gx;
            var pdz = _playerPos.z - gz;
            // smoothly turn to face the player (quicker than normal wander)
            var toPlayer = Math.atan2(pdx, pdz);
            w.facing = lerpAngle(w.facing, toPlayer, clamp(AWARE_TURN * wdt, 0, 1));
            w.grp.rotation.y = w.facing;

            // advance breathe + sway phases while watching
            w.breathPhase += wdt * BREATHE_HZ * TWO_PI;
            if (w.breathPhase > TWO_PI * 50) w.breathPhase -= TWO_PI * 50;
            w.awaySway += wdt * AWARE_SWAY_HZ * TWO_PI;
            if (w.awaySway > TWO_PI * 50)    w.awaySway   -= TWO_PI * 50;

            w.m.position.y = w.baseY + Math.sin(w.breathPhase) * BREATHE_AMP;
            // gentle side-sway while watching — acknowledges the player
            w.m.rotation.z = Math.sin(w.awaySway) * AWARE_SWAY;
            w.m.rotation.x = 0;
            // fall through to idle handler for idle countdown decrement
          } else {
            if (w.aware) {
              // player just left: tidy up sway
              w.m.rotation.z = 0;
              w.awaySway = 0;
            }
            w.aware = false;  // player out of range — resume normal behaviour
          }
        }

        // ── IDLE STATE ───────────────────────────────────────────────────
        if (w.idle > 0) {
          w.idle -= wdt;

          // skip breathing/look if player-awareness already wrote the pose
          if (!w.aware) {
            // breathing bob
            w.breathPhase += wdt * BREATHE_HZ * TWO_PI;
            if (w.breathPhase > TWO_PI * 50) w.breathPhase -= TWO_PI * 50;
            w.m.position.y = w.baseY + Math.sin(w.breathPhase) * BREATHE_AMP;
            w.m.rotation.x = 0;   // no lean while idle

            // look-around: periodically swing body left/right to scan the scene
            w.lookTimer -= wdt;
            if (w.lookTimer <= 0) {
              // pick a new look target — alternate or randomise
              w.lookTarget = (Math.random() - 0.5) * 2 * LOOK_AMP;
              // schedule next look-around check in 1.2–3.5 s
              w.lookTimer  = 1.2 + Math.random() * 2.3;
            }
            // smoothly drift body toward look target
            w.lookAngle = lerpAngle(w.lookAngle, w.lookTarget, clamp(LOOK_SPEED * wdt, 0, 1));
            w.m.rotation.z = w.lookAngle * 0.12;  // subtle roll accompanies the body turn
            w.grp.rotation.y = w.facing + w.lookAngle;
          }

          if (w.idle <= 0) {
            // done pausing — reset look-around and pick next waypoint
            w.lookAngle  = 0;
            w.lookTarget = 0;
            w.grp.rotation.y = w.facing;
            nextWaypoint(w);
          }
          continue;
        }

        // ── WALKING STATE ─────────────────────────────────────────────────
        var dx    = w.tx - gx;
        var dz    = w.tz - gz;
        var dist2 = dx * dx + dz * dz;

        if (dist2 < REACH2) {
          // arrived — snap bob flat, enter idle
          w.m.position.y = w.baseY;
          w.m.rotation.z = 0;
          w.m.rotation.x = 0;
          w.idle = IDLE_MIN + Math.random() * (IDLE_MAX - IDLE_MIN);
          continue;
        }

        var dist = Math.sqrt(dist2);
        var nx   = dx / dist;   // normalised direction X
        var nz   = dz / dist;   // normalised direction Z

        // ── steer drift: gentle random-walk of direction offset ──────────
        // Gives paths a natural curve instead of a straight beeline.
        w.steerTimer -= wdt;
        if (w.steerTimer <= 0) {
          // bias new target away from current to get meandering S-curves
          w.steerTarget = (Math.random() - 0.5) * 2 * STEER_MAX;
          w.steerTimer  = 1.8 + Math.random() * 2.8;
        }
        // only drift when far from destination — dial down near arrival
        var driftMix = clamp((dist - REACH_2X) / REACH_6X, 0, 1);
        w.steerAngle += (w.steerTarget - w.steerAngle) * clamp(STEER_SPEED * wdt, 0, 1) * driftMix;

        // rotate movement direction by steer offset
        if (w.steerAngle !== 0) {
          var cs  = Math.cos(w.steerAngle);
          var sn  = Math.sin(w.steerAngle);
          var snx = nx * cs - nz * sn;
          var snz = nx * sn + nz * cs;
          nx = snx; nz = snz;
          // no need to re-normalise — rotation preserves length
        }

        // ── building avoidance: accumulate soft repulsion forces ─────────
        var avX = 0, avZ = 0;
        for (var b = 0; b < buildings.length; b++) {
          var bvx = gx - buildings[b].x;
          var bvz = gz - buildings[b].z;
          var bd2 = bvx * bvx + bvz * bvz;
          if (bd2 < PUSH_R2 && bd2 > 0.01) {
            var bd  = Math.sqrt(bd2);
            var str = (PUSH_RADIUS - bd) / PUSH_RADIUS;  // 0..1 ramp
            avX += (bvx / bd) * str * 2.2;
            avZ += (bvz / bd) * str * 2.2;
          }
        }
        // blend avoidance into travel direction then re-normalise
        nx += avX;  nz += avZ;
        var nl = Math.sqrt(nx * nx + nz * nz) || 1;
        nx /= nl;   nz /= nl;

        // ── angle-error-scaled smooth turn ───────────────────────────────
        // Coarse corrections (large angle error) turn fast so the NPC
        // commits quickly to a new direction.  Fine micro-corrections
        // turn slowly, eliminating the foot-slide jitter seen when the
        // lerp factor is constant and overshoots on each frame.
        var targetFacing = Math.atan2(nx, nz);
        var errRad       = angleDiff(w.facing, targetFacing);
        // scale 0.6× when nearly aligned → 2× when >120° off
        var errScale     = 0.6 + clamp(errRad / (Math.PI * 0.667), 0, 1) * 1.4;
        var turnT        = clamp(TURN_SPEED * errScale * wdt, 0, 1);
        w.facing         = lerpAngle(w.facing, targetFacing, turnT);
        w.grp.rotation.y = w.facing;

        // ── translate (wall-slide via WORLD_RESOLVE) ──────────────────────
        var step  = w.speed * wdt;
        var nextX = gx + nx * step;
        var nextZ = gz + nz * step;
        // Slide along building surfaces instead of passing through them.
        // WORLD_RESOLVE(fromX, fromZ, toX, toZ) → [resolvedX, resolvedZ].
        // Guard in case world-collision.js loads after this file.
        if (window.WORLD_RESOLVE) {
          var res = window.WORLD_RESOLVE(gx, gz, nextX, nextZ);
          nextX = res[0]; nextZ = res[1];
        }
        w.grp.position.x = nextX;
        w.grp.position.z = nextZ;
        w.grp.position.y = gy(nextX, nextZ);

        // ── stuck-recovery: pick new waypoint if no progress for 2.5 s ───
        // "Progress" = moved more than 1 unit from last checkpoint.
        var sdx = nextX - w.stuckX, sdz = nextZ - w.stuckZ;
        w.stuckTimer += wdt;
        if (sdx * sdx + sdz * sdz > 1.0) {
          // made meaningful progress — refresh checkpoint
          w.stuckTimer = 0; w.stuckX = nextX; w.stuckZ = nextZ;
        } else if (w.stuckTimer > 2.5) {
          // pinned against geometry — abandon current target
          w.stuckTimer = 0; w.stuckX = nextX; w.stuckZ = nextZ;
          nextWaypoint(w);
        }

        // ── procedural walk animation ─────────────────────────────────────
        // sin²(phase) produces a smooth bounce that peaks TWICE per cycle
        // (at phase = π/2 and 3π/2) with a continuous derivative everywhere.
        // This eliminates the sharp V-notch at the ground point that abs(sin)
        // produces.  At BOB_HZ=1.3 we get ~2.6 visible footsteps/sec.
        //
        // Side-sway (rotation.z) runs at half frequency — one full roll per
        // stride — giving a natural hip-sway look.
        //
        // Forward lean (rotation.x) shifts weight fore-aft each step, adding
        // subtle momentum feel.
        w.phase += wdt * BOB_HZ * TWO_PI;
        if (w.phase > TWO_PI * 80) w.phase -= TWO_PI * 80;  // keep bounded

        var sinP = Math.sin(w.phase);
        var bob  = sinP * sinP;               // sin² — smooth 0..1 double-peak
        var sway = Math.sin(w.phase * 0.5);  // full-sine side roll, one per cycle
        var lean = sinP * LEAN_AMP;           // fore-aft weight shift per step

        w.m.position.y = w.baseY + bob * BOB_AMP;
        w.m.rotation.z = sway * SWAY_AMP;    // gentle lean side-to-side
        w.m.rotation.x = lean;               // subtle forward lean per step
      }
    }
  };
};
