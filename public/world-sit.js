/* world-sit.js — SITTING. E next to a seat (sofa, bench, stool, chair) sits you down; E or any move key stands you up.
 *
 *   WorldSit.register({ id, x, y?, z, yaw, r? })   world-space seats (any module: benches in plazas, arena stands, Hoverskate lounge...). yaw = facing (atan2(dx, dz)).
 *   WorldSit.update(dt, playerPos, playPlayerOnce, time, U) -> drop (world units) to subtract from the camera/avatar height (host calls once a frame)
 *   WorldSit.isSeated() · WorldSit.yaw() (null when standing) · WorldSit.stand() · WorldSit.sitNearest()
 *   Interiors: seats are read straight from the walk-in interior layout (interiors v3 layoutOf) — no extra data: sofa = 2 seats, bench = 2, stool/chair = 1.
 * The host: skips movement while seated, forces the avatar facing to WorldSit.yaw(), plays the library clip Sit_Chair_Loop, and lowers the camera by the seat drop.
 */
(function () {
  'use strict';
  if (window.WorldSit) return;
  var SEATS = { sofa: { n: 2, off: 0.55 }, bench: { n: 2, off: 0.45 }, stool: { n: 1, off: 0 }, chair: { n: 1, off: 0 }, 'bar-stool': { n: 1, off: 0 } };
  var REACH_M = 1.9, DROP_M = 0.42, U = 7 / 1.8;
  var st = { seated: null, yaw: null, drop: 0, hintT: 0, clipT: 0, cacheId: null, cache: [], taken: {}, extra: [] };

  function pure() { return window.buildWorldInteriorsV3 && window.buildWorldInteriorsV3.pure; }
  function interiorSeats() {
    var iv = window.__interiorsV3, P = pure(); if (!iv || !P || !iv.isInside || !iv.isInside()) { st.cacheId = null; return []; }
    var b = iv.current && iv.current(); if (!b) return [];
    if (st.cacheId === b.id) return st.cache;
    var L = iv.layoutOf(b.id), out = [], co = Math.cos(b.rot), si = Math.sin(b.rot);
    if (L) L.items.forEach(function (it, k) {
      var S = SEATS[it.kind]; if (!S) return;
      var f = P.rotPt(0, 1, it.q), r = P.rotPt(1, 0, it.q);                                        // room-local front + right of the item
      var fx = f[0] * co + f[1] * si, fz = -f[0] * si + f[1] * co, yaw = Math.atan2(fx, fz);      // -> world facing
      for (var s = 0; s < S.n; s++) {
        var off = S.n === 1 ? 0 : (s === 0 ? -S.off : S.off), w = P.toWorld(b, it.x + r[0] * off, it.z + r[1] * off);
        out.push({ id: b.id + ':' + k + ':' + s, x: w[0], z: w[1], yaw: yaw, fx: fx, fz: fz, kind: it.kind });
      }
    });
    st.cacheId = b.id; st.cache = out; return out;
  }
  function allSeats() { return interiorSeats().concat(st.extra); }
  function nearest(px, pz) {
    var best = null, bd = REACH_M * U; allSeats().forEach(function (s) { if (st.taken[s.id]) return; var d = Math.hypot(s.x - px, s.z - pz); if (d < bd) { bd = d; best = s; } }); return best;
  }
  function pp() { return window.__w3dDebug && window.__w3dDebug.playerPos; }
  function toast(m) { if (window.Navi && window.Navi.toast) window.Navi.toast(m); else if (window.__toast) window.__toast(m); }
  function sit(s) {
    var p = pp(); if (!p || !s) return false; st.seated = s; st.yaw = s.yaw; st.taken[s.id] = true; p.x = s.x; p.z = s.z; st.clipT = 0; toast('Seated · move or [E] to stand'); return true;
  }
  function stand() {
    var s = st.seated; if (!s) return false; var p = pp(); st.seated = null; st.yaw = null; delete st.taken[s.id];
    if (p) { var fx = s.fx != null ? s.fx : Math.sin(s.yaw), fz = s.fz != null ? s.fz : Math.cos(s.yaw); p.x = s.x + fx * 1.1 * U; p.z = s.z + fz * 1.1 * U; }
    return true;
  }
  function sitNearest() { var p = pp(); if (!p) return false; return sit(nearest(p.x, p.z)); }

  addEventListener('keydown', function (e) {
    if (/input|textarea|select/i.test(((document.activeElement || {}).tagName || ''))) return;
    if (st.seated) {
      if (e.code === 'KeyE' || e.code === 'KeyW' || e.code === 'KeyA' || e.code === 'KeyS' || e.code === 'KeyD' || e.code === 'Space' || e.code.indexOf('Arrow') === 0) { if (e.code === 'KeyE') { e.stopImmediatePropagation(); e.preventDefault(); } stand(); }
      return;
    }
    if (e.code === 'KeyE' && !e.repeat) {
      var p = pp(); if (!p) return; var s = nearest(p.x, p.z);
      // let a real use-point win (shop counter, bed, terminal): sit only when no interact prompt is closer than the seat
      if (s && !(window.__interiorsV3 && window.__interiorsV3.nearestUse && window.__interiorsV3.nearestUse(p))) { if (sit(s)) { e.stopImmediatePropagation(); e.preventDefault(); } }
    }
  }, true);

  function update(dt, p, play, time, u) {
    U = u || U; var tgt = st.seated ? DROP_M * U : 0; st.drop += (tgt - st.drop) * Math.min(1, dt * 10);
    if (st.seated && p) {
      p.x = st.seated.x; p.z = st.seated.z;
      if (play && time >= st.clipT) { play('ual_Sit_Chair_Loop'); st.clipT = time + 0.8; }
      var iv = window.__interiorsV3; if (iv && iv.isInside && !iv.isInside() && st.seated.id.indexOf('reg:') !== 0) stand();   // left the room (teleport / exit) -> stand
    } else if (p) {
      st.hintT -= dt; if (st.hintT <= 0) { st.hintT = 4; var s = nearest(p.x, p.z); if (s) toast('[E] Sit'); }
    }
    return st.drop;
  }
  window.WorldSit = {
    register: function (s) { if (!s || s.x == null) return; s.id = 'reg:' + (s.id || (Math.round(s.x) + ',' + Math.round(s.z))); s.fx = Math.sin(s.yaw || 0); s.fz = Math.cos(s.yaw || 0); st.extra = st.extra.filter(function (q) { return q.id !== s.id; }); st.extra.push(s); },
    update: update, isSeated: function () { return !!st.seated; }, yaw: function () { return st.yaw; }, stand: stand, sitNearest: sitNearest, seats: allSeats, _state: st
  };
})();
