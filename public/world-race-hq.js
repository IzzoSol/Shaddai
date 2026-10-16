/* world-race-hq.js — RACE HQ (owner 2026-10-16: "a building for the one on the ground and a shop center in it to buy a car, later car upgrades ...
 * that could be the starting point, and you can do the short race or the long one across the map and back down to the building").
 *
 *   WorldRaceHQ.init({ THREE, scene, GLTFLoader, heightAt(x,z), getPlayer():{x,z}|null, U })
 *   Places the Blender K27 Race HQ (1.5x, gold-capped beacon spire spins) (assets/kits/shaddai_race_hq_v01.glb) on the ground beside Dragon Gate, its door facing the Skyline Circuit pit straight
 *   (the long race starts there). Four showroom turntables carry slowly turning race ships. E anywhere inside the showroom opens the HQ desk:
 *     1 Short race (Dragon Gate)   2 Full Course (Skyline Circuit)   3 Showroom (buy a ride with Sparks)   4 Upgrades (coming soon)
 *   Owned rides: localStorage 'shd.raceGarage' = { owned:[typeId] } (client-side like the existing garage; must move server-side before real money).
 *   ?racehq=0 disables.
 */
(function (root) {
  'use strict';
  var POS_M = { e: 1737, n: -302.9 }, YAW = -0.182, SC = 1.5, FOOT_M = 28 * SC, KEY = 'shd.raceGarage';   // owner moved it to Dragon Gate's west tip (Blender); 1.5x (TURTLE), 12 m west so the podium clears the deck
  var FEATURED = ['arrow', 'viper', 'raptor', 'lancer'];
  var PRICE = function (T) { return T.ship ? 1500 : T.bike ? 900 : T.water ? 1100 : 600; };
  var H = null, grp = null, panel = null, tables = [], center = null, inner = 0, beacon = null;

  function garage() { try { var g = JSON.parse(localStorage.getItem(KEY) || '{}'); g.owned = g.owned || []; return g; } catch (e) { return { owned: [] }; } }
  function save(g) { try { localStorage.setItem(KEY, JSON.stringify(g)); } catch (e) {} }
  function owns(id) { return garage().owned.indexOf(id) >= 0; }
  function toast(m) { if (root.Navi && root.Navi.toast) root.Navi.toast(m); }
  function sparks() { return root.ShdSparks && root.ShdSparks.get ? root.ShdSparks.get() : 0; }
  function el(tag, css, html) { var e = document.createElement(tag); if (css) e.style.cssText = css; if (html != null) e.innerHTML = html; return e; }

  function buy(T) {
    if (owns(T.id)) return toast(T.name + ' is already in your garage');
    var p = PRICE(T); if (!root.ShdSparks || !root.ShdSparks.spend(p, 'race-hq', 'buy ' + T.id)) return toast('Not enough Sparks (' + p + ' needed)');
    var g = garage(); g.owned.push(T.id); save(g); toast('Bought: ' + T.name + ' - it is in your garage'); draw('showroom');
  }
  function race(cid) { close(); if (root.WorldRaceSelect) root.WorldRaceSelect.open({ cid: cid }); else if (root.__raceStart) root.__raceStart(cid, {}); }
  function close() { if (panel) panel.style.display = 'none'; }
  function draw(view) {
    if (!panel) { panel = el('div', 'position:fixed;right:18px;top:80px;width:330px;max-height:72vh;overflow:auto;z-index:9300;background:rgba(5,8,14,.94);border:1px solid #27e0ff;box-shadow:0 0 24px rgba(255,63,164,.25);border-radius:12px;color:#eaf6ff;font:600 13px Rajdhani,"Segoe UI",sans-serif;padding:14px 16px;display:none');
      document.body.appendChild(panel);
      panel.addEventListener('click', function (e) { var t = e.target.closest('[data-a]'); if (!t) return; var a = t.getAttribute('data-a');
        if (a === 'short') race('dragon-gate'); else if (a === 'full') race('grand-course'); else if (a === 'show') draw('showroom'); else if (a === 'home') draw('home'); else if (a === 'x') close();
        else if (a === 'buy') { var T = (root.WorldHoverCars.TYPES || []).filter(function (q) { return q.id === t.getAttribute('data-id'); })[0]; if (T) buy(T); } }); }
    var head = '<div style="font:900 12px Orbitron,sans-serif;letter-spacing:.28em;color:#27e0ff">SHADDAI RACE HQ</div><div style="color:#ff3fa4;font-size:12px;margin:2px 0 10px">Balance: ' + sparks() + ' Sparks</div>';
    var btn = function (a, label, sub, dis) { return '<div data-a="' + a + '" style="cursor:' + (dis ? 'default' : 'pointer') + ';opacity:' + (dis ? 0.45 : 1) + ';padding:10px 12px;margin:6px 0;border-radius:9px;border:1px solid ' + (dis ? '#445' : '#27e0ff') + ';background:rgba(39,224,255,.06)"><b>' + label + '</b><div style="opacity:.7;font-size:12px">' + sub + '</div></div>'; };
    if (view === 'showroom') {
      var list = (root.WorldHoverCars && root.WorldHoverCars.TYPES || []).filter(function (T) { return !T.water || T.id === 'pod'; });
      panel.innerHTML = head + '<div style="font-weight:800;margin-bottom:6px">SHOWROOM</div>' + list.map(function (T) { var o = owns(T.id), p = PRICE(T);
        return '<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid rgba(255,255,255,.06)"><span>' + T.name + '<small style="opacity:.55"> ' + (T.ship ? 'race ship' : T.bike ? 'lightcycle' : 'hover car') + '</small></span>' +
          (o ? '<span style="color:#00ff9c">OWNED</span>' : '<button data-a="buy" data-id="' + T.id + '" style="background:' + (sparks() >= p ? '#ff3fa4' : '#444') + ';color:#fff;border:0;padding:4px 9px;border-radius:5px;cursor:pointer">' + p + '</button>') + '</div>'; }).join('') +
        btn('home', 'Back', 'Race desk') + '<div style="opacity:.55;font-size:11px">E to close</div>';
    } else {
      panel.innerHTML = head + btn('short', '1 · Short race', 'Dragon Gate - 3 laps on the ground track next door') + btn('full', '2 · Full course', 'Skyline Circuit - out of the HQ, up onto the sky ring round the city, back down here (11.5 km)') +
        btn('show', '3 · Showroom', 'Buy a race ship, hover car or lightcycle (' + garage().owned.length + ' owned)') + btn('up', '4 · Upgrades', 'Engines, hulls and paint - coming soon', true) + '<div style="opacity:.55;font-size:11px">E to close</div>';
    }
    panel.style.display = 'block';
  }
  function nearInside() { var p = H.getPlayer && H.getPlayer(); return p && center && Math.hypot(p.x - center.x, p.z - center.z) < inner; }

  function init(h) {
    if (typeof location !== 'undefined' && /[?&]racehq=0\b/.test(location.search)) return null;
    H = h; var THREE = h.THREE, U = h.U || 7 / 1.8, x = POS_M.e * U, z = -POS_M.n * U, y = -Infinity;
    for (var r = 0; r <= FOOT_M; r += FOOT_M / 2) for (var a = 0; a < 8; a++) y = Math.max(y, h.heightAt(x + Math.cos(a * Math.PI / 4) * r * U, z + Math.sin(a * Math.PI / 4) * r * U));   // highest ground under the footprint (the podium skirt covers the rest)
    center = { x: x, y: y, z: z }; inner = 24 * SC * U;
    grp = new THREE.Group(); grp.name = 'race-hq'; grp.position.set(x, y, z); grp.rotation.y = YAW; h.scene.add(grp);
    new h.GLTFLoader().load('/assets/kits/shaddai_race_hq_v01.glb', function (g) {
      var m = g.scene; m.scale.setScalar(U * SC); grp.add(m); m.updateMatrixWorld(true); beacon = m.getObjectByName('race_hq_beacon');
      for (var k = 0; k < 4; k++) { var hk = m.getObjectByName('hook_plinth_' + k); if (!hk || !root.WorldHoverCars) continue;
        var car = root.WorldHoverCars.buildGroup(THREE, FEATURED[k]), tt = new THREE.Group(); tt.position.copy(hk.position).multiplyScalar(U * SC); tt.add(car); car.scale.setScalar(U * 1.2); grp.add(tt); tables.push(tt); }
    }, undefined, function (e) { if (root.console) console.warn('[race-hq] GLB failed:', e && e.message); });
    document.addEventListener('keydown', function (e) {
      if (e.code !== 'KeyE' || e.repeat) return;
      if (panel && panel.style.display === 'block') { close(); return; }
      if (nearInside()) { draw('home'); e.stopImmediatePropagation(); }
    }, true);
    var last = false; setInterval(function () { var n = !!nearInside(); if (n && !last) toast('Race HQ - press E for the race desk'); if (!n && panel) close(); last = n; }, 600);
    (function spin() { requestAnimationFrame(spin); for (var i = 0; i < tables.length; i++) tables[i].rotation.y += 0.004; if (beacon) beacon.rotation.y += 0.01; })();
    root.__raceHQ = { pos: center, owned: function () { return garage().owned.slice(); } };
    return root.__raceHQ;
  }
  root.WorldRaceHQ = { init: init, PRICE: PRICE, POS_M: POS_M, _owns: owns };
})(typeof window !== 'undefined' ? window : globalThis);
