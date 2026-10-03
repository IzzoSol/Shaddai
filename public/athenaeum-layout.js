/* athenaeum-layout.js — the Athenaeum Campus layout in METRES (local frame), pure data + geometry, no three.js.
 *
 *   var C = AthenaeumLayout.build();   // fresh object every call
 *   C.contains(x, z) · C.heightAt(x, z) · C.blockedAt(x, z, pad) · C.resolve(pos, px, pz) · C.nearestStation(x, z)
 *   C.rooms · C.stations · C.colliders · C.wings · C.apse · C.gate · C.spawn
 *
 * Frame: +x east, +z south. Angles are clockwise from north. The rotunda (the Arcade concourse) is the hub; six wings radiate
 * from it through 14 m doorways; a north apse (Dean's Atrium) and a south gate corridor (the entrance) complete the plan.
 * world-athenaeum.js builds the meshes from this; the world uses contains/heightAt/resolve exactly like the colosseum arena.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.AthenaeumLayout = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var U = 7 / 1.8;                       // game units per metre (same as the colosseum and interiors v3)
  var R = 34;                            // rotunda radius
  var DOOR_HALF = 7;                     // doorway half width (wings and gate)
  var WING_ALONG0 = 40, WING_LEN = 44, WING_HALF = 12, WING_H = 14;
  var APSE_R = 14, APSE_DOOR_HALF = 6;
  var GATE_START = R - 3, GATE_END = 64;
  var PLAYER_R = 0.5;
  var ROTUNDA_H = 30;

  var AGENT_COLOR = { SHADDAI: 0xe8c45c, ZEROX: 0x2dd4a0, ORACLE: 0x5fe0ff, NEXUS: 0x4da3ff, TURTLE: 0x00ff9c, QUILL: 0xf0d27a, PIKADON: 0xff6a5a };

  var WING_DEFS = [
    { id: 'observatory', hall: 'oracle',  angleDeg: 30,  room: 'observatory-lab',    agent: 'ORACLE',  label: 'The Observatory' },
    { id: 'library',     hall: 'quill',   angleDeg: 90,  room: 'scriptorium',        agent: 'QUILL',   label: 'The Library' },
    { id: 'museum',      hall: 'turtle',  angleDeg: 150, room: 'co-creation-studio', agent: 'TURTLE',  label: 'The Museum' },
    { id: 'forge',       hall: 'forge',   angleDeg: 210, room: 'tool-foundry',       agent: 'NEXUS',   label: 'The Forge' },
    { id: 'music',       hall: 'music',   angleDeg: 270, room: 'music-hall',         agent: null,      label: 'The Sound Studio' },
    { id: 'council',     hall: 'council', angleDeg: 330, room: 'safety-bureau',      agent: 'PIKADON', label: 'The Council Hall' }
  ];

  function rad(d) { return d * Math.PI / 180; }
  function polar(deg, r) { return { x: Math.sin(rad(deg)) * r, z: -Math.cos(rad(deg)) * r }; }

  function build() {
    var wings = WING_DEFS.map(function (d) {
      var a = rad(d.angleDeg), dx = Math.sin(a), dz = -Math.cos(a);
      var along = WING_ALONG0 + WING_LEN / 2;
      return {
        id: d.id, hall: d.hall, angleDeg: d.angleDeg, room: d.room, agent: d.agent, label: d.label,
        accent: d.agent ? AGENT_COLOR[d.agent] : 0xb06bff,
        dx: dx, dz: dz, nx: -dz, nz: dx,                    // along axis and across axis (unit)
        along0: WING_ALONG0, along1: WING_ALONG0 + WING_LEN, halfW: WING_HALF, h: WING_H,
        cx: dx * along, cz: dz * along, rot: a
      };
    });
    var apse = { cx: 0, cz: -(WING_ALONG0 + APSE_R), r: APSE_R, doorHalf: APSE_DOOR_HALF, doorStartZ: -(R - 3), doorEndZ: -WING_ALONG0, agent: 'SHADDAI', accent: AGENT_COLOR.SHADDAI, h: 22 };
    var gate = { halfW: DOOR_HALF, startZ: GATE_START, endZ: GATE_END, h: 12 };

    function at(w, along, across) { return { x: w.dx * along + w.nx * across, z: w.dz * along + w.nz * across }; }
    function local(w, x, z) { return { along: x * w.dx + z * w.dz, across: x * w.nx + z * w.nz }; }

    // ── rooms ───────────────────────────────────────────────────────────────────
    var rooms = [{ id: 'arcade-concourse', kind: 'rotunda', agent: null, label: 'The Arcade Concourse', cx: 0, cz: 0, r: R, accent: 0x00ff9c },
      { id: 'trading-desk', kind: 'alcove', agent: 'ZEROX', label: 'The Trading Desk', cx: polar(300, 29).x, cz: polar(300, 29).z, r: 6, accent: AGENT_COLOR.ZEROX },
      { id: 'deans-atrium', kind: 'apse', agent: 'SHADDAI', label: "The Dean's Atrium", cx: apse.cx, cz: apse.cz, r: APSE_R, accent: AGENT_COLOR.SHADDAI }];
    wings.forEach(function (w) {
      rooms.push({ id: w.room, kind: 'wing', wing: w.id, agent: w.agent, label: w.label, cx: w.cx, cz: w.cz, w: w.halfW * 2, d: WING_LEN, rot: w.rot, accent: w.accent });
    });
    var council = wings[5], ao = at(council, WING_ALONG0 + WING_LEN - 3, 0);
    rooms.push({ id: 'admin-office', kind: 'office', wing: 'council', agent: null, label: 'Admin Office', cx: ao.x, cz: ao.z, w: council.halfW * 2, d: 6, rot: council.rot, accent: 0xff6a5a, locked: 'admin' });

    // Where each wing's lectern body stands (the player stands 3 m in front of it). The council wing keeps its far end for the Admin Office.
    function lecAlong(w) { return w.id === 'council' ? WING_ALONG0 + 22 : WING_ALONG0 + WING_LEN - 5; }

    // ── stations (all positions are where the player STANDS to use them) ────────
    var stations = [];
    function st(id, kind, room, label, x, z, r, extra) { stations.push(Object.assign({ id: id, kind: kind, room: room, label: label, x: x, z: z, r: r || 3.2 }, extra || {})); }

    st('dais', 'dais', 'arcade-concourse', 'Skill Tree', 0, 10.5, 4);
    for (var k = 0; k < 6; k++) { var pp = polar(15 + 60 * k, 18); st('pod-' + (k + 1), 'pods', 'arcade-concourse', 'Exam Pod ' + (k + 1), pp.x, pp.z, 3, { pod: k + 1 }); }
    var p240 = polar(240, 28.5), p60 = polar(60, 28.5), p120 = polar(120, 28.5), p300 = polar(300, 27.5), p346 = polar(346, 29);
    st('directory', 'directory', 'arcade-concourse', 'Skill Directory', p240.x, p240.z, 4);
    st('teachers', 'teachers', 'arcade-concourse', 'Hall of Teachers', p60.x, p60.z, 4);
    st('trophy', 'trophy', 'arcade-concourse', 'Trophy Gallery', p120.x, p120.z, 4);
    st('trading', 'trading', 'trading-desk', 'Trading Desk (paper)', p300.x, p300.z, 4, { agent: 'ZEROX' });
    st('navi', 'navi', 'arcade-concourse', 'Navi Kiosk', p346.x, p346.z, 3);

    wings.forEach(function (w) {
      var lec = at(w, lecAlong(w) - 3, 0);
      st('lectern-' + w.id, 'lectern', w.room, w.label.replace('The ', '') + ' Lectern', lec.x, lec.z, 4, { agent: w.agent, wing: w.id });
      if (w.agent) {      // the Sound Studio has no faculty room yet, so no Press counter there
        var pc = at(w, WING_ALONG0 + 9, w.halfW - 5);
        st('press-' + w.id, 'press', w.room, w.label.replace('The ', '') + ' Press', pc.x, pc.z, 3.5, { agent: w.agent, wing: w.id });
      }
    });
    var forge = wings[3]; var imp = at(forge, WING_ALONG0 + 20, -(forge.halfW - 5));
    st('import', 'import', 'tool-foundry', 'Import Dock', imp.x, imp.z, 3.5, { wing: 'forge' });
    var adm = at(council, WING_ALONG0 + WING_LEN - 6, 0);
    st('admin', 'admin', 'admin-office', 'Admin Office', adm.x, adm.z, 3, { locked: 'admin', wing: 'council' });
    st('lectern-deans', 'lectern', 'deans-atrium', "Dean's Lectern", apse.cx, apse.cz + 4.5, 4, { agent: 'SHADDAI' });
    st('press-deans', 'press', 'deans-atrium', "Dean's Press", apse.cx + 7, apse.cz + 4, 3.5, { agent: 'SHADDAI' });
    st('press-trading', 'press', 'trading-desk', 'Trading Desk Press', p300.x + 2.5, p300.z + 3.2, 3.5, { agent: 'ZEROX' });

    // ── colliders: circles and rotated boxes, local metres ──────────────────────
    var colliders = [{ type: 'circle', x: 0, z: 0, r: 7, tag: 'dais' }];
    for (var j = 0; j < 6; j++) { var cp = polar(15 + 60 * j, 21); colliders.push({ type: 'circle', x: cp.x, z: cp.z, r: 1.8, tag: 'pod' }); }
    [p240, p60, p120, p346].forEach(function (p, i) { var o = polar([240, 60, 120, 346][i], 32); colliders.push({ type: 'circle', x: o.x, z: o.z, r: 1.5, tag: 'board' }); });
    colliders.push({ type: 'circle', x: polar(300, 31.5).x, z: polar(300, 31.5).z, r: 1.6, tag: 'desk' });
    wings.forEach(function (w) {
      var lec = at(w, lecAlong(w), 0);
      colliders.push({ type: 'circle', x: lec.x, z: lec.z, r: 1.4, tag: 'lectern' });
      if (w.agent) { var pc = at(w, WING_ALONG0 + 9, w.halfW - 2.2); colliders.push({ type: 'box', x: pc.x, z: pc.z, hx: 3, hz: 0.9, rot: w.rot, tag: 'press' }); }
    });
    // furniture that makes each wing read as its subject, kept clear of the centre aisle
    var lib = wings[1], obs = wings[0], mus = wings[2], frg = wings[3], snd = wings[4];
    [-1, 1].forEach(function (side) {
      var sh = at(lib, WING_ALONG0 + 22, side * (lib.halfW - 1.2)); colliders.push({ type: 'box', x: sh.x, z: sh.z, hx: 14, hz: 0.8, rot: lib.rot, tag: 'shelves' });
      var bn = at(frg, WING_ALONG0 + 24, side * (frg.halfW - 3)); colliders.push({ type: 'box', x: bn.x, z: bn.z, hx: 10, hz: 1.2, rot: frg.rot, tag: 'workbench' });
    });
    var orr = at(obs, WING_ALONG0 + 22, 0); colliders.push({ type: 'circle', x: orr.x, z: orr.z, r: 3.5, tag: 'orrery' });
    [-6, 6].forEach(function (c) { var pl = at(mus, WING_ALONG0 + 22, c); colliders.push({ type: 'circle', x: pl.x, z: pl.z, r: 1.2, tag: 'plinth' }); });
    var stg = at(snd, WING_ALONG0 + WING_LEN - 2, 0); colliders.push({ type: 'box', x: stg.x, z: stg.z, hx: 1.2, hz: 9, rot: snd.rot, tag: 'stage' });   // spans ACROSS the wing (hx = along, hz = across)
    colliders.push({ type: 'circle', x: apse.cx, z: apse.cz, r: 1.6, tag: 'lectern' });

    // ── walkability ─────────────────────────────────────────────────────────────
    function inWing(w, x, z) {
      var l = local(w, x, z);
      if (Math.abs(l.across) <= DOOR_HALF && l.along >= R - 3 && l.along <= w.along0 + 0.01) return true;      // doorway corridor
      return l.along >= w.along0 && l.along <= w.along1 && Math.abs(l.across) <= w.halfW;
    }
    function contains(x, z) {
      if (x * x + z * z <= R * R) return true;
      if (Math.abs(x) <= gate.halfW && z >= gate.startZ && z <= gate.endZ) return true;
      if (Math.abs(x) <= apse.doorHalf && z <= apse.doorStartZ && z >= apse.doorEndZ) return true;
      var ax = x - apse.cx, az = z - apse.cz;
      if (ax * ax + az * az <= apse.r * apse.r) return true;
      for (var i = 0; i < wings.length; i++) if (inWing(wings[i], x, z)) return true;
      return false;
    }
    function heightAt(x, z) { return contains(x, z) ? 0 : 999; }
    function hitCollider(c, x, z, pad) {
      if (c.type === 'circle') { var dx = x - c.x, dz = z - c.z, rr = c.r + pad; return dx * dx + dz * dz <= rr * rr; }
      var s = Math.sin(c.rot), co = Math.cos(c.rot), px = x - c.x, pz = z - c.z;
      // box frame: u along the wing axis (dx,dz) = (sin rot, -cos rot), v across it
      var u = px * s + pz * -co, v = px * co + pz * s;
      return Math.abs(u) <= c.hx + pad && Math.abs(v) <= c.hz + pad;
    }
    function blockedAt(x, z, pad) {
      for (var i = 0; i < colliders.length; i++) if (hitCollider(colliders[i], x, z, pad || 0)) return true;
      return false;
    }
    function free(x, z) { return contains(x, z) && !blockedAt(x, z, PLAYER_R); }
    // Step the player: take the move if free, else slide along one axis, else stay. Returns a NEW {x, z}.
    function resolve(pos, px, pz) {
      if (free(pos.x, pos.z)) return { x: pos.x, z: pos.z };
      if (free(pos.x, pz)) return { x: pos.x, z: pz };
      if (free(px, pos.z)) return { x: px, z: pos.z };
      return { x: px, z: pz };
    }
    function nearestStation(x, z) {
      var best = null, bd = Infinity;
      for (var i = 0; i < stations.length; i++) {
        var s = stations[i], d = Math.hypot(x - s.x, z - s.z);
        if (d <= s.r && d < bd) { best = s; bd = d; }
      }
      return best;
    }

    var spawn = { x: 0, z: GATE_END - 3, lookX: 0, lookZ: -1 };
    return {
      U: U, R: R, ROTUNDA_H: ROTUNDA_H, WING_H: WING_H, PLAYER_R: PLAYER_R, DOOR_HALF: DOOR_HALF, WING_ALONG0: WING_ALONG0, WING_LEN: WING_LEN, WING_HALF: WING_HALF,
      wings: wings, apse: apse, gate: gate, rooms: rooms, stations: stations, colliders: colliders, spawn: spawn, AGENT_COLOR: AGENT_COLOR,
      at: at, local: local, contains: contains, heightAt: heightAt, blockedAt: blockedAt, resolve: resolve, nearestStation: nearestStation
    };
  }

  return { build: build, U: U, AGENT_COLOR: AGENT_COLOR };
});
