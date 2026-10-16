/* world-cutscene-travel.js — TUNNEL LINE cutscene travel (2026-10-11, owner: "underground connection to the train can be a cutscene ... or a cutscene through the water tunnel").
 *
 *   WorldCutsceneTravel.init({ getPos():{x,z}, teleport(x,z,yaw), enter(code), exit(), inside():bool, layout, reef():{x,z}|null, lift():{x,z}|null })
 *   Stand inside a station zone (40 m) and press J: a small menu lists the lines from there; pick one (click or 1-9) and a 4.5 s cutscene plays
 *   (rail = amber light streaks, water = teal bubbles), the player is moved at the midpoint, then the overlay fades out.
 *   Zones: COLOSSEUM metro platform, Central Station, Harbor Line Station, Reef City hub, Reef Twin hub, Reef Line Shore (mainland), Ring Canal sea lift.
 *   Pure DOM, no WebGL, no per-frame cost outside a 250 ms zone poll. ?cutscene=0 disables.
 */
(function (root) {
  'use strict';
  var U = 7 / 1.8, H = null, menu = null, ov = null, busy = false, last = '', ZR = 40 * U;
  function pos(m) { return m ? { x: m[0], z: m[1] } : null; }
  function zones() {
    var out = [], L = H.layout || {}, st = L.stations || [], central = st[0] && st[0].pos, harbor = (st.find ? st.find(function (s) { return s.id === 'harbor'; }) : null);
    var CI = root.COLOSSEUM_ISLAND, CM = root.COLOSSEUM_METRO;
    if (CI && CM && CM.metroPad) out.push({ id: 'colosseum', name: 'Colosseum Metro', x: CI.x + CM.metroPad[0] * CI.U, z: CI.z + CM.metroPad[1] * CI.U, arena: true });
    if (central) out.push({ id: 'central', name: 'Central Station', x: central[0], z: central[1] });
    if (harbor && harbor.pos) out.push({ id: 'harbor', name: 'Harbor Line Station', x: harbor.pos[0], z: harbor.pos[1] });
    var r = H.reef && H.reef(); if (r) out.push({ id: 'reef', name: 'Reef City', x: r.x, z: r.z });
    // 2026-10-16 owner sketch: Reef B (the twin across the bridge) + the REEF LINE SHORE station where the undersea tube lands on the mainland
    var r2 = root.__reefTwin; if (r2) out.push({ id: 'reef2', name: 'Reef Twin', x: r2.x, z: r2.z });
    var sh = root.__reefShore; if (sh) out.push({ id: 'shore', name: 'Reef Line Shore', x: sh.x, z: sh.z });
    var l = H.lift && H.lift(); if (l) out.push({ id: 'lift', name: 'Ring Canal Lift', x: l.x, z: l.z });
    // VOID UNDERCROFT (owner 2026-10-15): the void exit of the Colosseum metro, 150 m out from Rift Gate Station (no tunnel is
    // dug in the realm - the cutscene IS the tunnel). Toxic air: arrive without a gas mask and you must get back on the line.
    var rift = st.find ? st.find(function (s) { return s.id === 'rift'; }) : null;
    if (rift && rift.pos) { var rx = rift.pos[0], rz = rift.pos[1], rl = Math.hypot(rx, rz) || 1; out.push({ id: 'void', name: 'Void Undercroft', x: rx + rx / rl * 150 * U, z: rz + rz / rl * 150 * U, toxic: true }); }
    return out;
  }
  var LINES = { colosseum: ['shore', 'central', 'harbor', 'reef', 'void'], central: ['colosseum', 'harbor', 'shore'], harbor: ['colosseum', 'central', 'reef', 'lift'], reef: ['shore', 'reef2', 'harbor', 'lift', 'colosseum'], reef2: ['reef', 'shore'], shore: ['colosseum', 'reef', 'reef2', 'central'], lift: ['harbor', 'reef'], void: ['colosseum'] };
  function styleOf(a, b) { if (a === 'void' || b === 'void') return 'void'; var W = { reef: 1, reef2: 1, lift: 1 }; return (W[a] || W[b]) ? 'water' : 'rail'; }
  function zoneAt(p) { var zs = zones(), best = null, bd = ZR; zs.forEach(function (z) { var d = Math.hypot(z.x - p.x, z.z - p.z); if (d < bd) { bd = d; best = z; } }); return best; }
  function el(tag, css, html) { var e = document.createElement(tag); if (css) e.style.cssText = css; if (html != null) e.innerHTML = html; return e; }
  function closeMenu() { if (menu && menu.parentNode) menu.parentNode.removeChild(menu); menu = null; }
  function toast(m) { if (root.Navi && root.Navi.toast) root.Navi.toast(m); }
  function openMenu(z) {
    closeMenu(); var zs = zones(), dests = (LINES[z.id] || []).map(function (id) { return zs.filter(function (q) { return q.id === id; })[0]; }).filter(Boolean);
    if (!dests.length) return toast('No line from here yet.');
    menu = el('div', 'position:fixed;left:50%;bottom:120px;transform:translateX(-50%);z-index:9400;min-width:300px;padding:14px 18px;background:rgba(5,12,10,.92);border:2px solid #2bff88;border-radius:10px;color:#eafff3;font:700 14px Rajdhani,Segoe UI,sans-serif;box-shadow:0 0 28px rgba(43,255,136,.3)');
    menu.innerHTML = '<div style="letter-spacing:.25em;color:#e8c45c;font:900 12px Orbitron,sans-serif;margin-bottom:8px">TUNNEL LINE · ' + z.name.toUpperCase() + '</div>' +
      dests.map(function (d, i) { var w = styleOf(z.id, d.id) === 'water'; return '<div data-i="' + i + '" style="cursor:pointer;padding:8px 10px;margin:4px 0;border-radius:7px;border:1px solid ' + (w ? '#4ac8ff' : '#e8c45c') + ';background:rgba(255,255,255,.04)">' + (i + 1) + ' · ' + d.name + ' <small style="opacity:.65">' + (w ? 'water tunnel' : 'maglev tunnel') + '</small></div>'; }).join('') +
      '<div style="opacity:.6;font-size:12px;margin-top:6px">J or Esc to close</div>';
    menu.addEventListener('click', function (e) { var t = e.target.closest('[data-i]'); if (!t) return; var d = dests[+t.getAttribute('data-i')]; closeMenu(); go(z, d); });
    menu._dests = dests; menu._from = z; document.body.appendChild(menu);
  }
  function go(a, b) {
    if (busy) return; busy = true; var sty = styleOf(a.id, b.id), water = sty === 'water', vd = sty === 'void', T = 4500;
    ov = el('div', 'position:fixed;inset:0;z-index:9800;pointer-events:none;overflow:hidden;background:' + (vd ? 'radial-gradient(circle,#2a0a3a,#07020c)' : water ? 'radial-gradient(circle,#06323a,#02121a)' : 'radial-gradient(circle,#2a1a05,#06080c)') + ';opacity:0;transition:opacity .5s');
    var streaks = ''; for (var i = 0; i < 26; i++) { var y = (i * 37 % 100), d = 0.5 + (i % 5) * 0.25, w = 10 + (i % 7) * 7; streaks += '<i style="position:absolute;top:' + y + '%;left:-30%;width:' + w + '%;height:' + (water ? 6 : 3) + 'px;border-radius:4px;background:' + (vd ? 'rgba(176,112,255,.75)' : water ? 'rgba(120,230,255,.7)' : 'rgba(255,200,90,.8)') + ';animation:wct ' + d + 's linear ' + (i % 6) * 0.1 + 's infinite"></i>'; }
    ov.innerHTML = '<style>@keyframes wct{from{transform:translateX(0)}to{transform:translateX(190vw)}}</style>' + streaks +
      '<div style="position:absolute;left:50%;top:42%;transform:translate(-50%,-50%);text-align:center;color:#eafff3;font:900 26px Orbitron,sans-serif;letter-spacing:.2em;text-shadow:0 0 18px ' + (vd ? '#b070ff' : water ? '#4ac8ff' : '#e8c45c') + '">' + (vd ? 'VOID LINE' : water ? 'UNDERSEA LINE' : 'MAGLEV TUNNEL') +
      '<div style="font:700 15px Rajdhani,sans-serif;letter-spacing:.3em;margin-top:10px;color:#e8c45c">' + a.name + '  →  ' + b.name + '</div></div>' +
      '<div style="position:absolute;left:20%;right:20%;bottom:18%;height:6px;background:rgba(255,255,255,.15);border-radius:4px"><i id="wctbar" style="display:block;height:100%;width:0;background:#2bff88;border-radius:4px;transition:width ' + T + 'ms linear"></i></div>';
    document.body.appendChild(ov); requestAnimationFrame(function () { ov.style.opacity = '1'; var bar = ov.querySelector('#wctbar'); if (bar) bar.style.width = '100%'; });
    setTimeout(function () {   // midpoint: move the player while the screen is covered
      try {
        if (b.arena) { if (H.enter) H.enter('COLOSSEUM'); setTimeout(function () { H.teleport(b.x, b.z, 0); }, 400); }
        else { if (a.arena && H.exit) H.exit(); setTimeout(function () { H.teleport(b.x, b.z + 6 * U, 0); }, a.arena ? 400 : 0); }
      } catch (e) { if (root.console) console.warn('[tunnel-line]', e && e.message); }
    }, T * 0.55);
    setTimeout(function () { if (ov) ov.style.opacity = '0'; setTimeout(function () { if (ov && ov.parentNode) ov.parentNode.removeChild(ov); ov = null; busy = false; toast('Arrived: ' + b.name); if (b.toxic) toxicArrival(b); }, 600); }, T);
  }
  var TOXIC_S = 15, toxicT = null;
  function hasMask() { var I = root.ShdInv; return !!(I && I.perk && (+I.perk('mask-gas') || 0) >= 1); }
  function toxicArrival(b) {
    if (hasMask()) { toast('Gas mask sealed - the Void air is breathable.'); return; }
    var left = TOXIC_S, box = el('div', 'position:fixed;left:50%;top:18%;transform:translateX(-50%);z-index:9500;padding:12px 20px;background:rgba(30,6,40,.92);border:2px solid #b070ff;border-radius:10px;color:#f3e8ff;font:700 15px Rajdhani,sans-serif;text-align:center;pointer-events:none');
    document.body.appendChild(box);
    function paint() { box.innerHTML = '<div style="font:900 13px Orbitron,sans-serif;letter-spacing:.2em;color:#d9a8ff">TOXIC AIR</div>No gas mask. Get back on the line (J) - evacuating in <b>' + left + '</b> s<div style="opacity:.7;font-size:12px;margin-top:4px">Void Respirator: Sky Dock shop</div>'; }
    paint(); if (toxicT) clearInterval(toxicT);
    toxicT = setInterval(function () {
      var p = H.getPos(), still = p && Math.hypot(p.x - b.x, p.z - b.z) < 600 * U;
      if (!still || busy || hasMask()) { clearInterval(toxicT); toxicT = null; if (box.parentNode) box.parentNode.removeChild(box); return; }
      left--; paint();
      if (left <= 0) { clearInterval(toxicT); toxicT = null; if (box.parentNode) box.parentNode.removeChild(box); var home = zones().filter(function (q) { return q.id === 'colosseum'; })[0]; if (home) go(b, home); }
    }, 1000);
  }
  function init(h) {
    if (typeof document === 'undefined' || /[?&]cutscene=0\b/.test(location.search)) return; H = h;
    document.addEventListener('keydown', function (e) {
      if (busy || e.repeat) return; var k = e.code;
      if (menu) { if (k === 'Escape' || k === 'KeyJ') { closeMenu(); e.preventDefault(); return; } if (/^(Digit|Numpad)[1-9]$/.test(k)) { var i = +k.slice(-1) - 1, d = menu._dests[i]; if (d) { var f = menu._from; closeMenu(); go(f, d); } e.preventDefault(); } return; }
      if (k === 'KeyJ') { var p = H.getPos(), z = p && zoneAt(p); if (z) { openMenu(z); e.preventDefault(); } }
    }, true);
    setInterval(function () { if (busy || menu) return; var p = H.getPos(), z = p && zoneAt(p); if (z && z.id !== last) { last = z.id; toast('Tunnel line: ' + z.name + ' - press J'); } else if (!z) last = ''; }, 500);
  }
  function travelTo(id) { if (!H) return false; var zs = zones(), z = zs.filter(function (q) { return q.id === id; })[0], a = zs.filter(function (q) { return q.id === 'colosseum'; })[0] || { id: 'colosseum', name: 'Colosseum', arena: true }; if (!z) return false; go(a, z); return true; }
  root.WorldCutsceneTravel = { init: init, travelTo: travelTo, _zones: function () { return H ? zones() : []; }, _lines: LINES, _style: styleOf, _toxic: function (b) { toxicArrival(b); }, TOXIC_S: TOXIC_S };
})(typeof window !== 'undefined' ? window : globalThis);
