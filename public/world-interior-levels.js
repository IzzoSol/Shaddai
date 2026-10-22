/* world-interior-levels.js — BUILDING LEVELS for walk-in interiors (2026-10-23, owner: "all of the insides of the buildings and
 * levels all of that"). Interiors v3 builds the ground floor; every recipe with a lift (office, civic tower, farm tower, mall...) and
 * any building tall enough gets real upper floors:
 *   - E at the lift (or a 'roof' stair) opens a floor picker: G, 2 .. N, Roof (N = floors that fit the building height).
 *   - Upper floor k = a copy of the ground-floor room (shell, furniture, lights' glow) lifted k x storey height, so the layout and its
 *     colliders line up on every floor; the ground floor stays below the slab. Roof = open deck at the building top.
 *   - The player floor comes from window.__groundHooks (host loop); while upstairs the player is kept inside the footprint
 *     (the door gap is ground-floor only). Leaving via the lift back to G restores everything.
 *   WorldInteriorLevels.attach({ THREE, scene, interiors, getPlayer }) · .state() · .go(level)
 */
(function (root) {
  'use strict';
  var U = 7 / 1.8, MAX_FLOORS = 8;
  var S = { b: null, level: 0, floors: 1, storey: 4.6, clones: [], roof: null, ui: null, iv: null, opts: null };
  function floorsFor(L) { var st = L.ceil + 0.5; return { storey: st, n: Math.max(1, Math.min(MAX_FLOORS, Math.floor((L.H - 0.6) / st))) }; }
  function clear() {
    S.clones.forEach(function (c) { if (c.parent) c.parent.remove(c); }); S.clones = [];
    if (S.roof && S.roof.parent) S.roof.parent.remove(S.roof); S.roof = null;
  }
  function build(r, k) {   // copy of the ground-floor group lifted k storeys (shares geometry + materials: no new GPU memory)
    var g = r.group.clone(true); g.position.y += k * S.storey * U; g.name = 'interior-level-' + k; g.matrixAutoUpdate = true;
    g.traverse(function (o) { if (o.isLight) o.intensity = 0; });                                   // light budget stays with the ground floor
    r.group.parent.add(g); S.clones.push(g); return g;
  }
  function roofDeck(r) {
    var T = S.opts.THREE, L = r.L, m = new T.Mesh(new T.BoxGeometry(L.W, 0.3, L.D), new T.MeshStandardMaterial({ color: 0x3a4250, roughness: 0.8 }));
    var rail = new T.Mesh(new T.BoxGeometry(L.W, 1.1, L.D), new T.MeshBasicMaterial({ color: 0x27e0ff, wireframe: true, transparent: true, opacity: 0.35 }));
    var g = new T.Group(); g.add(m); rail.position.y = 0.7; g.add(rail);
    g.position.copy(r.group.position); g.rotation.y = r.group.rotation.y; g.scale.setScalar(U); g.position.y = r.floorY + L.H * U - 0.15 * U;
    r.group.parent.add(g); S.roof = g; return g;
  }
  function go(level) {
    var iv = S.iv, r = iv && iv.active && iv.active(); if (!r) return false;
    if (S.b !== r.b) { clear(); S.b = r.b; var f = floorsFor(r.L); S.floors = f.n; S.storey = f.storey; }
    level = Math.max(0, Math.min(S.floors, level));                                                  // S.floors = roof index
    clear();
    if (level > 0 && level < S.floors) build(r, level);
    if (level === S.floors) roofDeck(r);
    S.level = level; S.rec = r;
    if (root.__toast) root.__toast(level === 0 ? 'Ground floor' : (level === S.floors ? 'Roof' : 'Floor ' + (level + 1)));
    return true;
  }
  function floorY() {
    var r = S.rec; if (!r || !S.level) return null;
    return S.level === S.floors ? r.floorY + r.L.H * U : r.floorY + S.level * S.storey * U;
  }
  function picker() {
    var iv = S.iv, r = iv && iv.active && iv.active(); if (!r) return;
    if (S.b !== r.b) { clear(); S.b = r.b; S.level = 0; var f = floorsFor(r.L); S.floors = f.n; S.storey = f.storey; }
    if (S.ui) S.ui.remove();
    var d = document.createElement('div'); d.style.cssText = 'position:fixed;right:24px;top:50%;transform:translateY(-50%);z-index:9600;background:rgba(8,12,24,.92);border:1px solid #2a3a5a;border-radius:16px;padding:10px;display:flex;flex-direction:column-reverse;gap:6px;font:600 13px system-ui;color:#e8f6ff';
    for (var k = 0; k <= S.floors; k++) (function (k) {
      var b = document.createElement('button'); b.textContent = k === 0 ? 'G' : (k === S.floors ? 'Roof' : String(k + 1));
      b.style.cssText = 'min-width:64px;padding:8px 10px;border-radius:10px;border:1px solid ' + (k === S.level ? '#22e0ff' : '#2a3155') + ';background:#0b0f20;color:#fff;cursor:pointer;font:inherit';
      b.onclick = function () { go(k); close(); }; d.appendChild(b);
    })(k);
    var x = document.createElement('div'); x.textContent = 'LIFT'; x.style.cssText = 'text-align:center;opacity:.6;font-size:11px;letter-spacing:.2em'; d.appendChild(x);
    document.body.appendChild(d); S.ui = d;
    setTimeout(function () { addEventListener('keydown', onKey, true); }, 0);
  }
  function onKey(e) { if (e.code === 'Escape' || e.code === 'KeyE') close(); }
  function close() { if (S.ui) S.ui.remove(); S.ui = null; removeEventListener('keydown', onKey, true); }
  function keepInside(p) {   // upstairs: the door gap is ground-floor only, so hold the player inside the footprint
    var r = S.rec; if (!r || !S.level) return; var b = r.b, c = Math.cos(b.rot), s = Math.sin(b.rot), dx = (p.x - b.cx) / U, dz = (p.z - b.cz) / U;
    var a = dx * c - dz * s, z = dx * s + dz * c, hw = r.L.W / 2 - 0.6, hd = r.L.D / 2 - 0.6;
    var a2 = Math.max(-hw, Math.min(hw, a)), z2 = Math.max(-hd, Math.min(hd, z)); if (a2 === a && z2 === z) return;
    p.x = b.cx + (a2 * c + z2 * s) * U; p.z = b.cz + (-a2 * s + z2 * c) * U;
  }
  function attach(o) {
    S.opts = o; S.iv = o.interiors;
    var prev = root.__onInteriorUse;
    root.__onInteriorUse = function (e) {
      if (e && (e.type === 'lift' || e.type === 'roof' || e.kind === 'lift')) { picker(); return; }
      if (prev) prev(e);
    };
    (root.__groundHooks = root.__groundHooks || []).push(function (p) {
      var r = S.iv && S.iv.active && S.iv.active();
      if (!r || r !== S.rec || !S.level) { if (S.level && (!r || r !== S.rec)) { clear(); S.level = 0; S.rec = null; } return null; }
      keepInside(p); return floorY();
    });
    (root.__groundAtHooks = root.__groundAtHooks || []).push(function (x, z) {   // controller floor upstairs, inside the footprint only
      var r = S.rec; if (!r || !S.level) return null; var b = r.b, c = Math.cos(b.rot), s_ = Math.sin(b.rot), dx = (x - b.cx) / U, dz = (z - b.cz) / U;
      var a = dx * c - dz * s_, zz = dx * s_ + dz * c; return (Math.abs(a) <= r.L.W / 2 && Math.abs(zz) <= r.L.D / 2) ? floorY() : null;
    });
    root.__interiorLevels = api; return api;
  }
  var api = { attach: attach, go: go, state: function () { return { building: S.b && S.b.id, level: S.level, floors: S.floors, storey: S.storey }; }, picker: picker };
  root.WorldInteriorLevels = api;
})(typeof window !== 'undefined' ? window : this);
