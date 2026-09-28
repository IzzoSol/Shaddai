/* world-sky-traffic.js — FLYING SHIP TRAFFIC over The Grid (Map v4, ?map=v4), 2026-09-27.
 *
 *   • WHAT: 5 voxel ship types (chopper/cross/gunbike/tracer/pyramidship, converted from owner
 *     Downloads via tools/city/obj-to-glb.mjs, manifest public/assets/manifest-downloads.json)
 *     looping the sky over the city on fixed lanes — background traffic, not interactive.
 *   • LANES: 4 concentric ring lanes over the Grid disc (r <= 1600 m) at 60-140 m altitude, plus
 *     8 radial "commuter" stadium-loop lanes running from the Grid's edge out to the 8 ring
 *     stations (bearings 0/31/54/90/142.1/225/299.1/333.4, station ring r 2829 m). Every lane is
 *     a closed analytic loop (circle, or a straight-straight-semicircle-semicircle "racetrack"
 *     shape) so a ship just advances a t in [0,1) forever — no waypoint lists, no per-frame
 *     allocation.
 *   • SHIPS: one InstancedMesh per ship type (5 meshes, <= 40 instances total: 10/8/8/8/6).
 *     Source ships are voxel-metre scale (2.6-8 m) — too small to read at 60-140 m altitude, so
 *     each type gets a visibility scale multiplier (x1.5-x3, smallest ship boosted the most; see
 *     SHIP_DEFS below and the manifest notes) applied only here, never baked into the GLB.
 *   • BANKING: heading is the lane tangent (atan2(tx,tz), matching world-wildlife-v4's yaw
 *     convention); bank angle is derived from the smoothed turn rate and applied as a roll around
 *     the ship's local forward (+Z) axis, composed after yaw — turns are visible everywhere but
 *     sharpest on the commuter lanes' end-cap curves.
 *   • NIGHT: each ship type's (cloned, per-type) material emissiveIntensity ramps with
 *     nightFactor() 0..1 — running lights brighten after dusk.
 *   • PERF: ships farther than 2.5 km from the player only advance/re-sample at 2 Hz (accumulate
 *     dt, flush every 0.5 s); nearby ships update every call. All THREE.Vector3/Quaternion/
 *     Matrix4 scratch objects are module-scope singletons reused every frame — update() does not
 *     allocate.
 *
 *   window.buildWorldSkyTraffic({ THREE, scene, loader, heightAt (units), nightFactor()?:0..1,
 *                                  getPlayer()?:{pos} })
 *     → { update(dt), stats(), dispose() }
 *
 *   stats() → { lanes, shipsTotal, shipsReady, types: { <id>: { ready, count } } }
 *
 *   Debug/test-only (not part of the public contract; used by tools/tests/world-sky-traffic.test.cjs):
 *     result._debug.lanes            — the built lane list (game units)
 *     result._debug.sampleLane(lane,t) — pure geometric sampler, returns {x,z,tx,tz}
 *     result._debug.ships             — flat list of per-ship state
 */
(function () {
  var U = 7 / 1.8; // game units per metre (matches world-wildlife-v4.js)

  // ---- ship set: file, per-type instance count, visibility scale multiplier, running-light tint
  var SHIP_DEFS = [
    { id: 'chopper', file: '/assets/vehicles/ships/chopper.glb', count: 10, scale: 2.0, emissive: 0x8ef7ff, speed: 30 },
    { id: 'cross', file: '/assets/vehicles/ships/cross.glb', count: 8, scale: 2.0, emissive: 0xff8f6b, speed: 24 },
    { id: 'gunbike', file: '/assets/vehicles/ships/gunbike.glb', count: 8, scale: 2.0, emissive: 0xffb454, speed: 26 },
    { id: 'tracer', file: '/assets/vehicles/ships/tracer.glb', count: 8, scale: 1.5, emissive: 0x5bd0ff, speed: 36 },
    { id: 'pyramidship', file: '/assets/vehicles/ships/pyramidship.glb', count: 6, scale: 3.0, emissive: 0xffe08a, speed: 18 },
  ];

  // ---- lane layout (metres; converted to game units at build time)
  var RING_LANES = [
    { r: 500, alt: 65, dir: 1 },
    { r: 900, alt: 85, dir: -1 },
    { r: 1300, alt: 110, dir: 1 },
    { r: 1550, alt: 135, dir: -1 },
  ];
  var STATION_BEARINGS = [0, 31, 54, 90, 142.1, 225, 299.1, 333.4];
  var GRID_R_M = 1600, STATION_R_M = 2829;
  var COMMUTER_RIN_M = GRID_R_M + 50;   // just outside the Grid disc edge
  var COMMUTER_ROUT_M = STATION_R_M - 29; // just inside the station ring
  var COMMUTER_HALF_WIDTH_M = 50;

  var FAR_M = 2500, FAR_UPDATE_HZ = 2, FAR_UPDATE_DT = 1 / FAR_UPDATE_HZ;
  var BANK_GAIN = 2.4, MAX_BANK = 0.62, BANK_SMOOTH = 3.5;

  function norm(c) { return (c % 360 + 360) % 360; }

  function buildRingLane(def) {
    return { type: 'ring', R: def.r * U, alt: def.alt * U, dir: def.dir, length: 2 * Math.PI * def.r * U };
  }
  function buildTrackLane(bearingDeg, alt) {
    var th = bearingDeg * Math.PI / 180;
    var dirOutX = Math.sin(th), dirOutZ = -Math.cos(th);
    var dirPerpX = Math.cos(th), dirPerpZ = Math.sin(th);
    var L = (COMMUTER_ROUT_M - COMMUTER_RIN_M) * U;
    var w = COMMUTER_HALF_WIDTH_M * U;
    var rin = COMMUTER_RIN_M * U;
    var S = 2 * L + 2 * Math.PI * w;
    return {
      type: 'track', dirOutX: dirOutX, dirOutZ: dirOutZ, dirPerpX: dirPerpX, dirPerpZ: dirPerpZ,
      L: L, w: w, rin: rin, alt: alt * U, length: S,
    };
  }

  function buildLanes() {
    var lanes = RING_LANES.map(buildRingLane);
    for (var i = 0; i < STATION_BEARINGS.length; i++) {
      lanes.push(buildTrackLane(STATION_BEARINGS[i], 70 + (i % 3) * 25));
    }
    return lanes;
  }

  // Pure geometric sampler: writes into `out` ({x,z,tx,tz}), returns it. No allocation.
  function sampleLane(lane, t, out) {
    t = t - Math.floor(t); // wrap into [0,1)
    if (lane.type === 'ring') {
      var a = t * Math.PI * 2, s = Math.sin(a), c = Math.cos(a);
      out.x = lane.R * s; out.z = -lane.R * c;
      out.tx = c * lane.dir; out.tz = s * lane.dir;
      return out;
    }
    // track (stadium loop): straight(+rin..+rin+L @ v=-w) -> far cap -> straight back @ v=+w -> near cap
    var s = t * lane.length;
    var L = lane.L, w = lane.w;
    var u, v, du, dv;
    var capLen = Math.PI * w;
    if (s < L) {
      u = s; v = -w; du = 1; dv = 0;
    } else if (s < L + capLen) {
      var a1 = -Math.PI / 2 + (s - L) / w;
      u = L + w * Math.cos(a1); v = w * Math.sin(a1);
      du = -Math.sin(a1); dv = Math.cos(a1);
    } else if (s < 2 * L + capLen) {
      var s2 = s - (L + capLen);
      u = L - s2; v = w; du = -1; dv = 0;
    } else {
      var a2 = Math.PI / 2 + (s - (2 * L + capLen)) / w;
      u = w * Math.cos(a2); v = w * Math.sin(a2);
      du = -Math.sin(a2); dv = Math.cos(a2);
    }
    u += lane.rin;
    out.x = lane.dirOutX * u + lane.dirPerpX * v;
    out.z = lane.dirOutZ * u + lane.dirPerpZ * v;
    out.tx = lane.dirOutX * du + lane.dirPerpX * dv;
    out.tz = lane.dirOutZ * du + lane.dirPerpZ * dv;
    return out;
  }

  function shortAngle(d) { return ((d + Math.PI * 3) % (Math.PI * 2)) - Math.PI; }

  window.buildWorldSkyTraffic = function (opts) {
    var THREE = opts.THREE, scene = opts.scene, loader = opts.loader, heightAt = opts.heightAt;
    var group = new THREE.Group(); group.name = 'world-sky-traffic'; scene.add(group);

    var lanes = buildLanes();
    var types = {}; // id -> { def, mesh, material, ships: [], ready }
    var ships = []; // flat list across all types, for round-robin lane assignment + debug
    var laneCounter = 0;

    SHIP_DEFS.forEach(function (def) {
      var t = { def: def, mesh: null, material: null, ships: [], ready: false };
      types[def.id] = t;
      for (var i = 0; i < def.count; i++) {
        var lane = lanes[laneCounter % lanes.length]; laneCounter++;
        var w = {
          type: t, i: i, lane: lane,
          t: Math.random(),
          speed: def.speed * (0.9 + Math.random() * 0.2) * U,
          heading: 0, bank: 0, slowAcc: 0,
          x: 0, z: 0, y: 0,
        };
        t.ships.push(w); ships.push(w);
      }
      loader.load(def.file + '?v=1', function (t) {
        return function (gltf) {
          var mesh = null;
          gltf.scene.traverse(function (o) { if (!mesh && o.isMesh) mesh = o; });
          if (!mesh) return;
          var material = mesh.material.clone();
          material.emissive = new THREE.Color(t.def.emissive);
          material.emissiveIntensity = 0.15;
          var inst = new THREE.InstancedMesh(mesh.geometry, material, t.def.count);
          inst.frustumCulled = false;
          if (inst.instanceMatrix.setUsage) inst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
          group.add(inst);
          t.mesh = inst; t.material = material; t.ready = true;
        };
      }(t), undefined, function (e) {
        if (window.console) console.warn('[sky-traffic] ' + def.id + ' failed:', e && e.message);
      });
    });

    // module-scope scratch — never reallocated inside update()
    var AX_Y = new THREE.Vector3(0, 1, 0), AX_Z = new THREE.Vector3(0, 0, 1);
    var qYaw = new THREE.Quaternion(), qRoll = new THREE.Quaternion();
    var vPos = new THREE.Vector3(), vScale = new THREE.Vector3();
    var mtx = new THREE.Matrix4();
    var samp = { x: 0, z: 0, tx: 0, tz: 0 };

    function update(dt) {
      dt = Math.min(dt || 0, 0.1);
      var P = opts.getPlayer ? opts.getPlayer() : null;
      var night = opts.nightFactor ? opts.nightFactor() : 0;
      var farR2 = (FAR_M * U) * (FAR_M * U);

      for (var k = 0; k < ships.length; k++) {
        var w = ships[k], t = w.type;
        if (!t.ready) continue;

        var effDt;
        if (P && P.pos) {
          var dx = w.x - P.pos.x, dz = w.z - P.pos.z;
          if (dx * dx + dz * dz > farR2) {
            w.slowAcc += dt;
            if (w.slowAcc < FAR_UPDATE_DT) continue; // skip this ship this frame — keep last matrix
            effDt = w.slowAcc; w.slowAcc = 0;
          } else { effDt = dt; }
        } else { effDt = dt; }

        w.t += (w.speed * effDt) / w.lane.length;
        sampleLane(w.lane, w.t, samp);
        var heading = Math.atan2(samp.tx, samp.tz);
        var turnRate = effDt > 0 ? shortAngle(heading - w.heading) / effDt : 0;
        var targetBank = Math.max(-MAX_BANK, Math.min(MAX_BANK, -turnRate * BANK_GAIN));
        w.bank += (targetBank - w.bank) * Math.min(1, effDt * BANK_SMOOTH);
        w.heading = heading;
        w.x = samp.x; w.z = samp.z;
        w.y = heightAt(w.x, w.z) + w.lane.alt;

        vPos.set(w.x, w.y, w.z);
        vScale.setScalar(t.def.scale * U);
        qYaw.setFromAxisAngle(AX_Y, heading);
        qRoll.setFromAxisAngle(AX_Z, w.bank);
        qYaw.multiply(qRoll);
        mtx.compose(vPos, qYaw, vScale);
        t.mesh.setMatrixAt(w.i, mtx);
      }

      SHIP_DEFS.forEach(function (def) {
        var t = types[def.id];
        if (!t.ready) return;
        t.mesh.instanceMatrix.needsUpdate = true;
        t.material.emissiveIntensity = 0.15 + night * 0.85;
      });
    }

    function stats() {
      var out = { lanes: lanes.length, shipsTotal: ships.length, shipsReady: 0, types: {} };
      SHIP_DEFS.forEach(function (def) {
        var t = types[def.id];
        out.types[def.id] = { ready: t.ready, count: def.count };
        if (t.ready) out.shipsReady += def.count;
      });
      return out;
    }

    function dispose() {
      SHIP_DEFS.forEach(function (def) {
        var t = types[def.id];
        if (t.mesh) { group.remove(t.mesh); t.mesh.geometry.dispose && t.mesh.geometry.dispose(); t.material.dispose && t.material.dispose(); }
      });
      scene.remove(group);
    }

    return {
      group: group, update: update, stats: stats, dispose: dispose,
      _debug: { lanes: lanes, sampleLane: sampleLane, ships: ships, types: types },
    };
  };
})();
