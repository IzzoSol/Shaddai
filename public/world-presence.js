/* world-presence.js — G-6: visible multiplayer presence for the 3D realm (2026-11-15).
 *
 * The backend already returns the other players in the room on every chat sync
 * (POST /api/mp/sync -> { players: [{ id, name, agent, x, y }] }, y is the world z;
 * backend/multiplayer.js, 8 s server TTL). world-navi-chat.js used to discard
 * d.players; it now hands them here, and this module keeps ONE lightweight avatar
 * per remote player id in the 3D scene:
 *   capsule body + name sprite (same canvas-pill label recipe as world-npcs.js
 *   makeLabel) + a flat accent ring at the feet.
 * Positions lerp smoothly between the 2.5 s sync updates; ground height comes
 * from the realm's heightAt path (__w3dDebug.terrain / .terrainV4). An id that
 * stops appearing is removed once it has been absent for > TTL_MS (8 s, matching
 * the server TTL). The local player's own id is never rendered. At most
 * MAX_AVATARS (32) avatars exist at once — nearest to the local player first;
 * a nearer newcomer evicts the farthest current avatar.
 *
 *   WorldPresence.update(players, { selfId, selfPos })  · stop()
 *   ?presence=0  -> module disabled entirely (update is a no-op, nothing renders)
 */
(function (root) {
  'use strict';
  var OFF = /[?&]presence=0\b/.test((root.location && root.location.search) || '');
  var MAX_AVATARS = 32, TTL_MS = 8000, SNAP_DIST = 60, TAU_MS = 280;
  var CAP_R = 0.32, CAP_LEN = 1.16;                    // capsule: total height 1.8
  var BODY_H = CAP_LEN + 2 * CAP_R, LABEL_Y = BODY_H + 0.42;

  var records = {};        // id -> { id, name, agent, cur:{x,z}, tgt:{x,z}, lastSeen, group, labelName }
  var count = 0;
  var stage = null;        // { THREE, scene } once __w3dDebug is available
  var shared = null;       // { capGeo, ringGeo } shared geometries (never disposed per-avatar)
  var rafId = null, lastTick = 0;

  function now() { return Date.now(); }

  // Deterministic per-player accent colour (same id -> same colour everywhere).
  function accentFor(id) {
    var h = 0; id = String(id || '');
    for (var i = 0; i < id.length; i++) h = ((h * 31) + id.charCodeAt(i)) >>> 0;
    var hue = (h % 360) / 360, s = 0.65, l = 0.60;
    var c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((hue * 6) % 2) - 1)), m = l - c / 2, r = 0, g = 0, b = 0, seg = hue * 6;
    if (seg < 1) { r = c; g = x; } else if (seg < 2) { r = x; g = c; } else if (seg < 3) { g = c; b = x; }
    else if (seg < 4) { g = x; b = c; } else if (seg < 5) { r = x; b = c; } else { r = c; b = x; }
    return ((Math.round((r + m) * 255) << 16) | (Math.round((g + m) * 255) << 8) | Math.round((b + m) * 255)) >>> 0;
  }

  function groundY(x, z) {
    var d = root.__w3dDebug;
    try {
      if (d && d.terrain && d.terrain.heightAt) { var a = d.terrain.heightAt(x, z); if (isFinite(a)) return a; }
      if (d && d.terrainV4 && d.terrainV4.heightAt) { var b = d.terrainV4.heightAt(x, z); if (isFinite(b)) return b; }
    } catch (e) {}
    return 0;
  }

  function ensureStage() {
    if (stage) return stage;
    var d = root.__w3dDebug;
    if (!d || !d.scene || !d.THREE) return null;
    stage = { THREE: d.THREE, scene: d.scene };
    shared = {
      capGeo: new stage.THREE.CapsuleGeometry(CAP_R, CAP_LEN, 4, 12),
      ringGeo: new stage.THREE.RingGeometry(0.55, 0.8, 32)
    };
    return stage;
  }

  // Name sprite — same recipe as world-npcs.js makeLabel (canvas pill, monospace,
  // accent text), sized for a player name.
  function makeLabel(text, accentHex) {
    var THREE = stage.THREE, W = 256, H = 64;
    var cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    var ctx = cv.getContext('2d');
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(10, 12, W - 20, H - 24, 10); else ctx.rect(10, 12, W - 20, H - 24);
    ctx.fill();
    ctx.font = 'bold 26px "Courier New",monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,0.9)'; ctx.shadowBlur = 6;
    ctx.fillStyle = '#' + ('000000' + (accentHex & 0xFFFFFF).toString(16)).slice(-6);
    ctx.fillText(String(text || 'anon').slice(0, 24), W / 2, H / 2);
    var tex = new THREE.CanvasTexture(cv); tex.needsUpdate = true;
    if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
    var spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, sizeAttenuation: true }));
    spr.scale.set(5.0, 5.0 * (H / W), 1);
    spr.position.y = LABEL_Y;
    return spr;
  }

  function buildAvatar(rec) {
    var THREE = stage.THREE, accent = accentFor(rec.id);
    var group = new THREE.Group();
    var body = new THREE.Mesh(shared.capGeo, new THREE.MeshStandardMaterial({
      color: 0x8d99ae, roughness: 0.6, metalness: 0.1,
      emissive: accent, emissiveIntensity: 0.35, transparent: true, opacity: 0.92
    }));
    body.position.y = BODY_H / 2;
    group.add(body);
    var ring = new THREE.Mesh(shared.ringGeo, new THREE.MeshBasicMaterial({
      color: accent, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false
    }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.04;
    group.add(ring);
    group.add(makeLabel(rec.name, accent));
    rec.labelName = rec.name;
    group.position.set(rec.cur.x, groundY(rec.cur.x, rec.cur.z), rec.cur.z);
    stage.scene.add(group);
    rec.group = group;
  }

  function removeAvatar(id) {
    var rec = records[id]; if (!rec) return;
    if (rec.group && stage) {
      stage.scene.remove(rec.group);
      rec.group.traverse(function (o) {
        if (o.material) { if (o.material.map && o.material.map.dispose) o.material.map.dispose(); if (o.material.dispose) o.material.dispose(); }
        // geometries are shared (capsule/ring) or sprite-owned — never disposed here
      });
    }
    delete records[id]; count--;
  }

  function dist2(ax, az, bx, bz) { var dx = ax - bx, dz = az - bz; return dx * dx + dz * dz; }

  function farthestId(selfPos) {
    var worst = null, wd = -1;
    for (var id in records) { var r = records[id], d = dist2(r.tgt.x, r.tgt.z, selfPos.x, selfPos.z); if (d > wd) { wd = d; worst = id; } }
    return worst;
  }

  function update(players, opts) {
    if (OFF || !players || !players.length) { if (!OFF) startLoop(); return; }
    opts = opts || {};
    var selfId = opts.selfId, selfPos = opts.selfPos || { x: 0, z: 0 }, t = now();
    ensureStage();
    for (var i = 0; i < players.length; i++) {
      var p = players[i];
      if (!p || p.id == null || p.id === selfId) continue;              // never render ourselves
      var x = +p.x, z = +p.y;                                            // server y == world z
      if (!isFinite(x) || !isFinite(z)) continue;
      var rec = records[p.id];
      if (!rec) {
        if (count >= MAX_AVATARS) {                                      // cap: nearest first
          var worst = farthestId(selfPos);
          if (worst == null || dist2(x, z, selfPos.x, selfPos.z) >= dist2(records[worst].tgt.x, records[worst].tgt.z, selfPos.x, selfPos.z)) continue;
          removeAvatar(worst);
        }
        rec = records[p.id] = { id: p.id, name: p.name || 'anon', agent: p.agent || '', cur: { x: x, z: z }, tgt: { x: x, z: z }, lastSeen: t, group: null, labelName: null };
        count++;
        if (stage) buildAvatar(rec);
      } else {
        rec.tgt.x = x; rec.tgt.z = z; rec.lastSeen = t;
        if (p.name && p.name !== rec.name) {
          rec.name = p.name;
          if (rec.group && stage) {                                      // rebuild the label sprite in place
            var old = null; rec.group.children.forEach(function (c) { if (c.isSprite) old = c; });
            if (old) { rec.group.remove(old); if (old.material) { if (old.material.map) old.material.map.dispose(); old.material.dispose(); } }
            rec.group.add(makeLabel(rec.name, accentFor(rec.id))); rec.labelName = rec.name;
          }
        }
        if (!rec.group && stage) buildAvatar(rec);
      }
    }
    startLoop();
  }

  function tick(t) {
    rafId = null;
    ensureStage();
    var dt = Math.min(100, Math.max(0, t - (lastTick || t))); lastTick = t;
    var k = 1 - Math.exp(-dt / TAU_MS);
    var empty = true;
    for (var id in records) {
      var rec = records[id];
      if (t - rec.lastSeen > TTL_MS) { removeAvatar(id); continue; }     // absent > 8 s -> gone (server TTL)
      empty = false;
      var dx = rec.tgt.x - rec.cur.x, dz = rec.tgt.z - rec.cur.z, d2 = dx * dx + dz * dz;
      if (d2 > SNAP_DIST * SNAP_DIST) { rec.cur.x = rec.tgt.x; rec.cur.z = rec.tgt.z; }   // teleport/respawn: snap, don't glide
      else if (d2 > 1e-8) {
        rec.cur.x += dx * k; rec.cur.z += dz * k;
        if (rec.group) {                                                 // face travel direction
          var want = Math.atan2(dx, dz), cur = rec.group.rotation.y, diff = ((want - cur + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
          rec.group.rotation.y = cur + diff * k;
        }
      }
      if (rec.group) rec.group.position.set(rec.cur.x, groundY(rec.cur.x, rec.cur.z), rec.cur.z);
      else if (stage) buildAvatar(rec);
    }
    if (!empty || count > 0) startLoop();
  }

  function startLoop() {
    if (OFF || rafId != null || typeof root.requestAnimationFrame !== 'function') return;
    rafId = root.requestAnimationFrame(tick);
  }

  function stop() {
    if (rafId != null && typeof root.cancelAnimationFrame === 'function') root.cancelAnimationFrame(rafId);
    rafId = null;
    for (var id in records) removeAvatar(id);
  }

  root.WorldPresence = {
    update: update, stop: stop,
    MAX_AVATARS: MAX_AVATARS, TTL_MS: TTL_MS,
    _records: records, _count: function () { return count; }, _tick: tick, _off: OFF
  };
})(typeof window !== 'undefined' ? window : globalThis);
