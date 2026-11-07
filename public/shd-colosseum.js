/* SHADDAI V119 — THE COLOSSEUM. A real tiered arena you can watch from the dashboard: a bowl of ~1,200 seats with a glowing crowd, the sand ring,
   house fighters as glowing figures, a free PRACTICE bout that never stops, the MAIN EVENT and an 8-fighter TOURNAMENT.
   The fights are SIMULATED from a seed (same seed = same fight for everyone). Practice uses a public seed; the main event and tournament seeds are
   given by the server only to ticket holders (sign in; Sparks only when the server turns tickets on). No prizes, wallets or money paths here.
   Bodies are glowing figures; real 3D bodies belong to the 3D realm. Cosmetics later come from the shared catalog (docs/COSMETICS-CONTRACT.md). */
(function () {
  'use strict';
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var ROSTER = [['SHADDAI', '#f0b429', '#fb923c'], ['NEXUS', '#00f0ff', '#2563eb'], ['ZEROX', '#00e5ff', '#34d399'], ['ORACLE', '#a78bfa', '#f43f5e'], ['TURTLE', '#00ff88', '#22d3ee'], ['QUILL', '#fb923c', '#f472b6'], ['PIKADON', '#f43f5e', '#7c3aed'], ['WARDEN', '#e8eefc', '#60a5fa']];
  var TICK_MS = 700, MAX_TICKS = 30, BOUT_GAP = 6000, TOUR_MATCH_MS = 26000;
  var T = null, host, stage, canvas, renderer, scene, camera, raf = 0, running = false, hud = {}, W = 0, H = 0;
  var crowd = null, halo = null, crowdN = 0, crowdBase = [], fighters = [], floaters = [], torches = [], camMode = 'arena', ang = 0, drag = null, zoom = 1, simT = 0, lastT = 0, hype = 0;
  var mode = 'practice', tickets = null, offset = 0, seedLive = null, eventLive = null, lastTick = -1, matchKey = '', simCache = {}, poll = null, labelCache = {};

  function h(tag, attrs, kids) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) { if (k === 'text') e.textContent = attrs[k]; else if (k === 'class') e.className = attrs[k]; else if (k.indexOf('on') === 0) e.addEventListener(k.slice(2), attrs[k]); else if (attrs[k] != null) e.setAttribute(k, attrs[k]); });
    (kids || []).forEach(function (c) { if (c != null) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return e;
  }
  function hdr(json) { var o = {}; if (json) o['Content-Type'] = 'application/json'; try { var t = localStorage.getItem('shd_token'); if (t) o.Authorization = 'Bearer ' + t; } catch (e) { /* ignore */ } return o; }
  function api(method, path, body) { return fetch(path, { method: method, headers: hdr(!!body), credentials: 'same-origin', body: body ? JSON.stringify(body) : undefined }).then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { d._s = r.status; return d; }); }).catch(function () { return { _s: 0 }; }); }
  function nowMs() { return Date.now() + offset; }

  /* ── deterministic fight simulation ── */
  function rng(seed) { var a = seed >>> 0; return function () { a = (a + 0x6D2B79F5) >>> 0; var t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function stat(name) { var n = 0; for (var i = 0; i < name.length; i++) n = (n * 31 + name.charCodeAt(i)) >>> 0; return { atk: 9 + (n % 7), spd: 0.8 + ((n >> 3) % 5) * 0.1, hp: 100 }; }
  function simulate(seed, a, b) {
    var key = seed + '|' + a + '|' + b; if (simCache[key]) return simCache[key];
    var R = rng(seed), sa = stat(a), sb = stat(b), hpA = 100, hpB = 100, ev = [], i, aTurn;
    for (i = 0; i < MAX_TICKS && hpA > 0 && hpB > 0; i++) {
      aTurn = R() * (sa.spd + sb.spd) < sa.spd; var atk = aTurn ? sa : sb, crit = R() < 0.15, block = R() < 0.2, dmg = Math.max(1, Math.round(atk.atk * (0.6 + R() * 0.8) * (crit ? 1.8 : 1) * (block ? 0.5 : 1)));
      if (aTurn) hpB = Math.max(0, hpB - dmg); else hpA = Math.max(0, hpA - dmg);
      ev.push({ tick: i, by: aTurn ? 'A' : 'B', dmg: dmg, crit: crit, block: block, hpA: hpA, hpB: hpB });
    }
    var winner = hpA === hpB ? (R() < 0.5 ? 'A' : 'B') : (hpA > hpB ? 'A' : 'B');
    return (simCache[key] = { events: ev, winner: winner, ko: hpA <= 0 || hpB <= 0, hpA: hpA, hpB: hpB });
  }
  function shuffle(list, seed) { var R = rng(seed), a = list.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(R() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function tournament(seed) {   // 7 matches: 4 quarter-finals, 2 semi-finals, 1 final; each uses seed + index
    var names = shuffle(ROSTER.map(function (r) { return r[0]; }), seed), rounds = [names.slice()], matches = [], cur = names, idx = 0;
    while (cur.length > 1) { var next = []; for (var i = 0; i < cur.length; i += 2) { var s = simulate(seed + 17 * (idx + 1), cur[i], cur[i + 1]), w = s.winner === 'A' ? cur[i] : cur[i + 1]; matches.push({ a: cur[i], b: cur[i + 1], sim: s, winner: w, seed: seed + 17 * (idx + 1) }); next.push(w); idx++; } rounds.push(next); cur = next; }
    return { matches: matches, champion: cur[0], rounds: rounds };
  }
  /* what is on the sand right now: { a, b, sim, start, label, phase } */
  function current() {
    var t = nowMs();
    if (mode === 'practice') { var slot = Math.floor(t / 30000), start = slot * 30000, R = rng(20261107 + slot), n = ROSTER.map(function (r) { return r[0]; }), a = n[Math.floor(R() * 8)], b = n[Math.floor(R() * 8)]; if (a === b) b = n[(n.indexOf(a) + 1) % 8]; return { a: a, b: b, sim: simulate(20261107 + slot * 7, a, b), start: start + 3000, label: 'Practice bout', key: 'p' + slot, nextIn: start + 30000 - t }; }
    if (!seedLive || !eventLive) return null;
    if (eventLive.kind === 'main') { var st = eventLive.starts + 20000, names = shuffle(ROSTER.map(function (r) { return r[0]; }), seedLive); return { a: names[0], b: names[1], sim: simulate(seedLive, names[0], names[1]), start: st, label: 'MAIN EVENT', key: eventLive.id, final: true }; }
    var tour = tournament(seedLive), el = t - (eventLive.starts + 15000), mi = Math.max(0, Math.floor(el / TOUR_MATCH_MS)), done = mi >= 7; if (done) mi = 6; var m = tour.matches[mi], names2 = ['Quarter-final', 'Quarter-final', 'Quarter-final', 'Quarter-final', 'Semi-final', 'Semi-final', 'FINAL'];
    return { a: m.a, b: m.b, sim: m.sim, start: eventLive.starts + 15000 + mi * TOUR_MATCH_MS, label: names2[mi], key: eventLive.id + ':' + mi, tour: tour, done: done, matchIndex: mi };
  }

  /* ── three helpers ── */
  function disposeObj(o) { if (!o) return; o.traverse(function (n) { if (n.geometry) n.geometry.dispose(); if (n.material) (Array.isArray(n.material) ? n.material : [n.material]).forEach(function (m) { if (m.map) m.map.dispose(); m.dispose(); }); }); }
  function glowTex(c) { var k = 'g' + c; if (labelCache[k]) return labelCache[k]; var cv = document.createElement('canvas'); cv.width = cv.height = 128; var x = cv.getContext('2d'), g = x.createRadialGradient(64, 64, 4, 64, 64, 62); g.addColorStop(0, c); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(0, 0, 128, 128); return (labelCache[k] = new T.CanvasTexture(cv)); }
  function textSprite(text, color, bg, size) {
    var cv = document.createElement('canvas'), x = cv.getContext('2d'); x.font = '800 ' + (size || 30) + 'px sans-serif'; var w = Math.ceil(x.measureText(text).width) + 24; cv.width = w; cv.height = 48; x = cv.getContext('2d'); x.font = '800 ' + (size || 30) + 'px sans-serif';
    if (bg) { x.fillStyle = 'rgba(8,14,26,.85)'; x.strokeStyle = color; x.lineWidth = 2; x.beginPath(); if (x.roundRect) x.roundRect(1, 1, w - 2, 46, 18); else x.rect(1, 1, w - 2, 46); x.fill(); x.stroke(); }
    x.fillStyle = color; x.textBaseline = 'middle'; x.fillText(text, 12, 26); var sp = new T.Sprite(new T.SpriteMaterial({ map: new T.CanvasTexture(cv), transparent: true, depthTest: false })); sp.scale.set(w / 60, 48 / 60, 1); sp.renderOrder = 10; return sp;
  }
  function gradGeo(geo, c1, c2) { var pos = geo.attributes.position, n = pos.count, col = new Float32Array(n * 3), a = new T.Color(c1), b = new T.Color(c2), tmp = new T.Color(), mn = 1e9, mx = -1e9, i; for (i = 0; i < n; i++) { var y = pos.getY(i); if (y < mn) mn = y; if (y > mx) mx = y; } for (i = 0; i < n; i++) { tmp.copy(a).lerp(b, (pos.getY(i) - mn) / Math.max(1e-4, mx - mn)); col[i * 3] = tmp.r; col[i * 3 + 1] = tmp.g; col[i * 3 + 2] = tmp.b; } geo.setAttribute('color', new T.BufferAttribute(col, 3)); return geo; }
  function sandTexture() { var cv = document.createElement('canvas'); cv.width = 512; cv.height = 320; var x = cv.getContext('2d'), R = rng(5); x.fillStyle = '#6b5530'; x.fillRect(0, 0, 512, 320); for (var i = 0; i < 2600; i++) { x.fillStyle = 'rgba(' + (150 + R() * 70) + ',' + (115 + R() * 50) + ',' + (60 + R() * 30) + ',.35)'; x.fillRect(R() * 512, R() * 320, 1 + R() * 2, 1 + R() * 2); } x.strokeStyle = 'rgba(255,214,120,.55)'; x.lineWidth = 4; x.beginPath(); x.ellipse(256, 160, 70, 44, 0, 0, 7); x.stroke(); x.strokeStyle = 'rgba(255,214,120,.25)'; x.beginPath(); x.ellipse(256, 160, 120, 76, 0, 0, 7); x.stroke(); x.fillStyle = 'rgba(255,214,120,.4)'; x.font = '800 26px sans-serif'; x.textAlign = 'center'; x.fillText('SHADDAI', 256, 170); return new T.CanvasTexture(cv); }

  function buildFighter(name, side) {
    var r = ROSTER.filter(function (x) { return x[0] === name; })[0] || ROSTER[7], g = new T.Group(), mat = new T.MeshBasicMaterial({ vertexColors: true });
    var body = new T.Mesh(gradGeo(new T.CapsuleGeometry(0.34, 0.8, 6, 14), r[1], r[2]), mat); body.position.y = 1.0; g.add(body);
    var head = new T.Mesh(gradGeo(new T.SphereGeometry(0.28, 18, 14), r[2], r[1]), mat); head.position.y = 1.78; g.add(head);
    var blade = new T.Mesh(new T.BoxGeometry(0.09, 1.3, 0.09), new T.MeshBasicMaterial({ color: r[1] })); blade.position.set(0.55 * (side === 'A' ? 1 : -1), 1.2, 0); blade.rotation.z = (side === 'A' ? -1 : 1) * 0.5; g.add(blade); g.userData.blade = blade;
    var glow = new T.Sprite(new T.SpriteMaterial({ map: glowTex(r[1]), blending: T.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.6 })); glow.scale.set(3.4, 3.4, 1); glow.position.y = 1.2; g.add(glow); g.userData.glow = glow;
    var sh = new T.Mesh(new T.CircleGeometry(0.7, 20), new T.MeshBasicMaterial({ color: 0, transparent: true, opacity: 0.4 })); sh.rotation.x = -Math.PI / 2; sh.position.y = 0.02; g.add(sh);
    var nm = textSprite(name, r[1], true, 26); nm.position.y = 2.7; g.add(nm); g.userData.name = name; g.userData.home = side === 'A' ? -4.2 : 4.2; g.userData.side = side; g.userData.hit = 0; g.userData.lunge = 0; g.userData.ko = 0; g.position.set(g.userData.home, 0, 0); g.rotation.y = side === 'A' ? 0 : Math.PI; return g;
  }

  /* ── the bowl ── */
  function build() {
    scene = new T.Scene(); scene.background = new T.Color(0x070812); scene.fog = new T.Fog(0x070812, 60, 130); camera = new T.PerspectiveCamera(50, 1, 0.1, 220);
    var sp = new Float32Array(300 * 3); for (var i = 0; i < 300; i++) { var r = 90 + Math.random() * 20, a = Math.random() * Math.PI * 2, e = 0.1 + Math.random() * 0.8; sp[i * 3] = Math.cos(a) * r * Math.cos(e); sp[i * 3 + 1] = Math.sin(e) * r + 8; sp[i * 3 + 2] = Math.sin(a) * r * Math.cos(e); }
    var sg = new T.BufferGeometry(); sg.setAttribute('position', new T.BufferAttribute(sp, 3)); scene.add(new T.Points(sg, new T.PointsMaterial({ color: 0xffffff, size: 0.35, transparent: true, opacity: 0.8, fog: false })));
    var floor = new T.Mesh(new T.CircleGeometry(1, 72), new T.MeshBasicMaterial({ map: sandTexture() })); floor.rotation.x = -Math.PI / 2; floor.scale.set(14, 9, 1); scene.add(floor);
    var wall = new T.Mesh(new T.CylinderGeometry(1, 1, 0.9, 72, 1, true), new T.MeshBasicMaterial({ color: 0x1a1226, side: T.DoubleSide })); wall.scale.set(14.2, 1, 9.2); wall.position.y = 0.45; scene.add(wall);
    var rim = new T.LineLoop(new T.BufferGeometry().setFromPoints(Array.from({ length: 96 }, function (_, k) { var q = k / 96 * Math.PI * 2; return new T.Vector3(Math.cos(q) * 14.2, 0.92, Math.sin(q) * 9.2); })), new T.LineBasicMaterial({ color: 0xffd479 })); scene.add(rim);
    // seats + crowd
    var seats = [], TIERS = 10, gates = [0, Math.PI / 2, Math.PI, Math.PI * 1.5], pal = ['#f43f5e', '#00e5a0', '#a78bfa', '#f0b429', '#00b4ff', '#fb923c', '#f472b6', '#34d399'];
    for (var t = 0; t < TIERS; t++) { var ax = 15.6 + t * 1.25, bz = 10.4 + t * 1.0, y = 0.7 + t * 0.82, circ = 2 * Math.PI * Math.sqrt((ax * ax + bz * bz) / 2), n = Math.floor(circ / 0.9);
      for (var k = 0; k < n; k++) { var q = k / n * Math.PI * 2, gap = gates.some(function (gq) { var d = Math.abs(((q - gq + Math.PI * 3) % (Math.PI * 2)) - Math.PI); return d > Math.PI - 0.1; }); if (!gap) seats.push({ x: Math.cos(q) * ax, z: Math.sin(q) * bz, y: y, q: q, t: t }); } }
    var seatMesh = new T.InstancedMesh(new T.BoxGeometry(0.7, 0.22, 0.55), new T.MeshBasicMaterial({ color: 0x1b1530 }), seats.length), m4 = new T.Matrix4(), qt = new T.Quaternion(), up = new T.Vector3(0, 1, 0), sc = new T.Vector3(1, 1, 1), ps = new T.Vector3();
    seats.forEach(function (s, i) { qt.setFromAxisAngle(up, -s.q + Math.PI / 2); ps.set(s.x, s.y, s.z); m4.compose(ps, qt, sc); seatMesh.setMatrixAt(i, m4); }); scene.add(seatMesh);
    var R = rng(99), body = [], tmpC = new T.Color(); seats.forEach(function (s) { if (R() < 0.8) body.push(s); }); crowdN = body.length;
    crowd = new T.InstancedMesh(new T.CapsuleGeometry(0.17, 0.32, 3, 8), new T.MeshBasicMaterial({ color: 0xffffff }), crowdN); halo = new T.InstancedMesh(new T.SphereGeometry(0.46, 8, 6), new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.16, blending: T.AdditiveBlending, depthWrite: false }), crowdN); crowdBase = [];
    body.forEach(function (s, i) { var sec = Math.floor(s.q / (Math.PI * 2) * pal.length), c = pal[(sec + (R() < 0.18 ? 1 : 0)) % pal.length]; tmpC.set(c).multiplyScalar(0.7 + R() * 0.5); crowd.setColorAt(i, tmpC); halo.setColorAt(i, tmpC); crowdBase.push({ x: s.x * 0.985, y: s.y + 0.42, z: s.z * 0.985, ph: R() * 6.28 }); });
    scene.add(crowd); scene.add(halo);
    // torches on the top rim
    for (var j = 0; j < 20; j++) { var qa = j / 20 * Math.PI * 2, tx = Math.cos(qa) * 28.6, tz = Math.sin(qa) * 20.2, post = new T.Mesh(new T.CylinderGeometry(0.1, 0.14, 2.4, 8), new T.MeshBasicMaterial({ color: 0x2a1c3a })); post.position.set(tx, 9.4 + 1.2, tz); scene.add(post);
      var fl = new T.Sprite(new T.SpriteMaterial({ map: glowTex('#ffb347'), blending: T.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.9 })); fl.scale.set(3.2, 4, 1); fl.position.set(tx, 12.2, tz); scene.add(fl); torches.push(fl); }
    // gate arches (glowing)
    gates.forEach(function (gq) { var gx = Math.cos(gq) * 14.8, gz = Math.sin(gq) * 9.8, ar = new T.Mesh(new T.TorusGeometry(1.5, 0.12, 8, 24, Math.PI), new T.MeshBasicMaterial({ color: 0x00e5a0 })); ar.position.set(gx, 0.9, gz); ar.rotation.y = -gq + Math.PI / 2; scene.add(ar); });
  }
  function setFighters(a, b) { fighters.forEach(function (f) { scene.remove(f); disposeObj(f); }); fighters = [buildFighter(a, 'A'), buildFighter(b, 'B')]; fighters.forEach(function (f) { scene.add(f); }); }
  function floater(text, color, x) { var s = textSprite(text, color, false, 40); s.position.set(x, 2.8, 0); scene.add(s); floaters.push({ s: s, t0: simT }); }

  /* ── HUD ── */
  function buildHud() {
    hud.title = h('div', { class: 'col-title' }); hud.sub = h('div', { class: 'col-sub' }); hud.hpA = h('i'); hud.hpB = h('i'); hud.nA = h('b'); hud.nB = h('b'); hud.feed = h('div', { class: 'col-feed' }); hud.banner = h('div', { class: 'col-banner' }); hud.gate = h('div', { class: 'col-gate' }); hud.bracket = h('div', { class: 'col-bracket' });
    hud.modes = h('div', { class: 'col-modes' }); hud.cams = h('div', { class: 'col-cams' });
    [['practice', 'Practice', 'free'], ['main', 'Main event', ''], ['tournament', 'Tournament', '']].forEach(function (m) { var b = h('button', { type: 'button', class: 'col-mode', 'data-m': m[0], onclick: function () { setMode(m[0]); } }, [h('span', { text: m[1] }), h('em', { class: 'col-price', text: m[2] })]); hud.modes.appendChild(b); });
    [['arena', 'Arena'], ['tier', 'Stands'], ['top', 'Above'], ['spin', 'Orbit']].forEach(function (c) { hud.cams.appendChild(h('button', { type: 'button', class: 'col-cam' + (c[0] === camMode ? ' on' : ''), 'data-c': c[0], text: c[1], onclick: function () { camMode = c[0]; hud.cams.querySelectorAll('.col-cam').forEach(function (x) { x.classList.toggle('on', x.getAttribute('data-c') === camMode); }); } })); });
    var bars = h('div', { class: 'col-bars' }, [h('div', { class: 'col-bar l' }, [hud.nA, h('div', { class: 'col-hp' }, [hud.hpA])]), h('div', { class: 'col-vs', text: 'VS' }), h('div', { class: 'col-bar r' }, [hud.nB, h('div', { class: 'col-hp' }, [hud.hpB])])]);
    return h('div', { class: 'col-hud' }, [h('div', { class: 'col-top' }, [hud.title, hud.sub]), bars, hud.banner, hud.gate, hud.bracket, hud.feed, h('div', { class: 'col-bottom' }, [hud.modes, hud.cams])]);
  }
  function say(line) { var d = h('div', { text: line }); hud.feed.appendChild(d); while (hud.feed.childNodes.length > 4) hud.feed.removeChild(hud.feed.firstChild); }
  function setGate(msg, btn) { hud.gate.textContent = ''; if (!msg) { hud.gate.style.display = 'none'; return; } hud.gate.style.display = 'flex'; hud.gate.appendChild(h('div', { text: msg })); if (btn) hud.gate.appendChild(btn); }

  /* ── modes + tickets ── */
  function refreshEvents() { return api('GET', '/api/colosseum/events').then(function (d) { if (d && d.ok) { offset = d.now - Date.now(); tickets = d; } else tickets = null; updatePrices(); return d; }); }
  function updatePrices() { var m = hud.modes && hud.modes.querySelector('[data-m=main] .col-price'), t = hud.modes && hud.modes.querySelector('[data-m=tournament] .col-price'); if (!tickets) { if (m) m.textContent = 'offline'; if (t) t.textContent = 'offline'; return; } var c = tickets.current; if (m) m.textContent = c[0].has_ticket ? 'ticket ✓' : (tickets.tickets_on ? c[0].price_sparks + ' Spark' : 'sign in'); if (t) t.textContent = c[1].has_ticket ? 'ticket ✓' : (tickets.tickets_on ? c[1].price_sparks + ' Spark' : 'sign in'); }
  function setMode(m) {
    mode = m; seedLive = null; eventLive = null; lastTick = -1; matchKey = ''; hud.modes.querySelectorAll('.col-mode').forEach(function (x) { x.classList.toggle('on', x.getAttribute('data-m') === m); }); setGate('');
    if (m === 'practice') return;
    setGate('Checking your ticket…');
    refreshEvents().then(function (d) {
      if (!d || !d.ok) { setGate('Live events are offline on this server. Practice bouts still run.', h('button', { type: 'button', class: 'col-btn', text: 'Back to practice', onclick: function () { setMode('practice'); } })); return; }
      var e = d.current[m === 'main' ? 0 : 1], next = d.next[m === 'main' ? 0 : 1];
      var go = function () { api('GET', '/api/colosseum/ticket/' + e.id).then(function (r) { if (r.ok && r.has_ticket) { seedLive = r.seed; eventLive = e; setGate(''); } else getTicket(e); }); };
      if (e.has_ticket) go(); else getTicket(e, next);
    });
  }
  function getTicket(e) {
    var priced = tickets && tickets.tickets_on, label = (e.kind === 'main' ? 'Main event' : 'Tournament') + (priced ? ' ticket: ' + e.price_sparks + ' Spark' : ' ticket: free for now, sign-in required');
    setGate(label, h('button', { type: 'button', class: 'col-btn', text: 'Get ticket', onclick: function () {
      api('POST', '/api/colosseum/ticket', { event_id: e.id }).then(function (r) {
        if (r.ok) { seedLive = r.seed; eventLive = e; setGate(''); refreshEvents(); }
        else if (r._s === 401) setGate('Sign in to watch the ' + (e.kind === 'main' ? 'main event' : 'tournament') + '.', h('button', { type: 'button', class: 'col-btn ghost', text: 'Back to practice', onclick: function () { setMode('practice'); } }));
        else if (r._s === 402) setGate('Out of Sparks. Top up to get this ticket.', h('button', { type: 'button', class: 'col-btn ghost', text: 'Back to practice', onclick: function () { setMode('practice'); } }));
        else setGate(r.error || 'Could not get a ticket right now.', h('button', { type: 'button', class: 'col-btn ghost', text: 'Back to practice', onclick: function () { setMode('practice'); } }));
      }); } }));
  }

  /* ── frame ── */
  function frame(t) {
    if (!running) return; raf = requestAnimationFrame(frame); if (!canvas.offsetParent) return; var dt = Math.min(0.05, (t - lastT) / 1000 || 0.016); lastT = t; simT += dt;
    var cur = current(), tnow = nowMs();
    if (!cur) { hud.title.textContent = mode === 'main' ? 'MAIN EVENT' : 'TOURNAMENT'; hud.sub.textContent = 'Get a ticket to watch'; }
    else {
      if (cur.key !== matchKey) { matchKey = cur.key; lastTick = -1; setFighters(cur.a, cur.b); hud.nA.textContent = cur.a; hud.nB.textContent = cur.b; hud.feed.textContent = ''; hud.banner.textContent = ''; hud.banner.className = 'col-banner'; if (cur.tour) renderBracket(cur.tour, cur.matchIndex, cur.done); else hud.bracket.textContent = ''; }
      var el = tnow - cur.start, tick = Math.floor(el / TICK_MS);
      hud.title.textContent = cur.label + (cur.tour && cur.done ? ' · COMPLETE' : ''); hud.sub.textContent = cur.tour && cur.done ? 'Champion: ' + cur.tour.champion : (el < 0 ? 'Starts in ' + Math.ceil(-el / 1000) + 's' : (tick >= cur.sim.events.length ? 'Final' : 'LIVE'));
      var ev = cur.sim.events, upto = Math.min(ev.length - 1, tick), last = upto >= 0 ? ev[upto] : null, hpA = last ? last.hpA : 100, hpB = last ? last.hpB : 100;
      hud.hpA.style.width = hpA + '%'; hud.hpB.style.width = hpB + '%';
      while (lastTick < upto) { lastTick++; var e = ev[lastTick], atk = e.by === 'A' ? fighters[0] : fighters[1], def = e.by === 'A' ? fighters[1] : fighters[0]; atk.userData.lunge = 1; def.userData.hit = 1; hype = Math.min(1, hype + (e.crit ? 0.5 : 0.2));
        floater((e.crit ? 'CRIT ' : e.block ? 'BLOCK ' : '') + '-' + e.dmg, e.crit ? '#ffd479' : e.block ? '#9fb2d6' : '#ff7a8a', def.userData.home); say(atk.userData.name + (e.crit ? ' lands a CRITICAL on ' : e.block ? ' is blocked by ' : ' hits ') + def.userData.name + ' for ' + e.dmg); }
      if (el >= 0 && tick >= ev.length && !hud.banner.textContent) { var wname = cur.sim.winner === 'A' ? cur.a : cur.b, loser = cur.sim.winner === 'A' ? fighters[1] : fighters[0]; loser.userData.ko = 1; hud.banner.textContent = (cur.sim.ko ? 'KO! ' : '') + wname + ' wins'; hud.banner.className = 'col-banner show'; say(wname + ' takes it' + (cur.tour && cur.matchIndex < 6 ? ' and moves on' : '')); hype = 1; }
    }
    // fighters
    fighters.forEach(function (f) { var u = f.userData, dir = u.side === 'A' ? 1 : -1; u.lunge = Math.max(0, u.lunge - dt * 2.2); u.hit = Math.max(0, u.hit - dt * 3); var lx = Math.sin(u.lunge * Math.PI) * 2.2 * dir; f.position.x = u.home + lx; f.position.y = reduce ? 0 : Math.abs(Math.sin(simT * 2 + (u.side === 'A' ? 0 : 1.7))) * 0.1; u.blade.rotation.z = (dir === 1 ? -1 : 1) * (0.5 + Math.sin(u.lunge * Math.PI) * 1.1); u.glow.material.opacity = (0.55 + u.hit * 0.5) * (1 - u.ko * 0.7); if (u.ko) { f.rotation.z += (Math.PI / 2 * dir - f.rotation.z) * Math.min(1, dt * 4); } });
    for (var fi = floaters.length - 1; fi >= 0; fi--) { var fl = floaters[fi], age = simT - fl.t0; if (age > 1.3) { scene.remove(fl.s); disposeObj(fl.s); floaters.splice(fi, 1); } else { fl.s.position.y = 2.8 + age * 1.6; fl.s.material.opacity = 1 - age / 1.3; } }
    hype = Math.max(0, hype - dt * 0.35);
    if (!reduce) { if (!crowd || !crowdBase.length) { camera.lookAt(0, 0.5, 0); renderer.render(scene, camera); return; }
    var N = Math.min(70, crowdN, crowdBase.length), start = Math.floor(simT * 60) % Math.max(1, crowdN), m4 = new T.Matrix4(), ps = new T.Vector3(), qq = new T.Quaternion(), sc1 = new T.Vector3(1, 1, 1); for (var ci = 0; ci < N; ci++) { var idx = (start + ci * 17) % crowdBase.length, b = crowdBase[idx]; if (!b) continue; var bob = (Math.max(0, Math.sin(simT * 5 + b.ph)) * (0.08 + hype * 0.45)); ps.set(b.x, b.y + bob, b.z); m4.compose(ps, qq, sc1); crowd.setMatrixAt(idx, m4); halo.setMatrixAt(idx, m4); } crowd.instanceMatrix.needsUpdate = true; halo.instanceMatrix.needsUpdate = true; }
    torches.forEach(function (tr, i) { tr.material.opacity = 0.75 + Math.sin(simT * 7 + i) * 0.2; });
    // camera
    var small = W < 560, r = (camMode === 'tier' ? 22 : camMode === 'top' ? 8 : 31) * (small ? 1.25 : 1) * zoom, hy = camMode === 'tier' ? 7.5 : camMode === 'top' ? 36 : 15;
    if (camMode === 'spin' || (!drag && camMode === 'arena')) ang += dt * (camMode === 'spin' ? 0.16 : 0.03);
    camera.position.set(Math.sin(ang) * r, hy, Math.cos(ang) * r); camera.lookAt(0, camMode === 'tier' ? 2 : 0.5, 0); renderer.render(scene, camera);
  }
  function renderBracket(tour, mi, done) { hud.bracket.textContent = ''; tour.matches.forEach(function (m, i) { hud.bracket.appendChild(h('div', { class: 'col-m' + (i === mi && !done ? ' now' : '') + (i < mi || done ? ' done' : '') }, [h('span', { text: m.a }), h('em', { text: i < mi || done ? (m.winner === m.a ? '◀' : '▶') : 'vs' }), h('span', { text: m.b })])); }); }
  function size() { if (!renderer) return; var r = stage.getBoundingClientRect(); W = Math.max(280, Math.round(r.width)); H = W < 560 ? 420 : 560; stage.style.height = H + 'px'; renderer.setSize(W, H, false); canvas.style.width = W + 'px'; canvas.style.height = H + 'px'; camera.aspect = W / H; camera.updateProjectionMatrix(); }

  function mount(el) {
    if (running) return; host = el; host.textContent = ''; host.appendChild(h('div', { class: 'sw-msg dim', text: 'Building the Colosseum…' }));
    import('/vendor/three/three.module.js').then(function (m) {
      T = m; try { renderer = new T.WebGLRenderer({ antialias: window.innerWidth > 700 }); } catch (e) { throw new Error('WebGL is not available in this browser'); }
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, window.innerWidth < 700 ? 1.25 : 2)); canvas = renderer.domElement; canvas.style.touchAction = 'none';
      host.textContent = ''; stage = h('div', { class: 'col-stage' }, [canvas]); host.appendChild(stage); stage.appendChild(buildHud()); build(); setMode('practice'); size(); refreshEvents();
      canvas.addEventListener('pointerdown', function (e) { drag = { x: e.clientX, a: ang }; try { canvas.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ } });
      canvas.addEventListener('pointermove', function (e) { if (drag) { ang = drag.a - (e.clientX - drag.x) * 0.006; if (camMode === 'spin') camMode = 'arena'; } });
      canvas.addEventListener('pointerup', function () { drag = null; }); canvas.addEventListener('wheel', function (e) { e.preventDefault(); zoom = Math.max(0.5, Math.min(1.8, zoom + e.deltaY * 0.001)); }, { passive: false });
      running = true; lastT = performance.now(); raf = requestAnimationFrame(frame); poll = setInterval(function () { if (running && mode !== 'practice') refreshEvents(); }, 20000);
    }).catch(function (e) { host.textContent = ''; host.appendChild(h('div', { class: 'sw-msg warn', text: 'The Colosseum could not start: ' + (e && e.message || e) })); });
  }
  function unmount() {
    if (!running && !renderer) return; running = false; clearInterval(poll); cancelAnimationFrame(raf);
    if (scene) disposeObj(scene); if (renderer) { try { renderer.dispose(); } catch (e) { /* ignore */ } renderer = null; }
    fighters = []; floaters = []; torches = []; crowd = null; halo = null; crowdBase = []; crowdN = 0; labelCache = {}; simCache = {}; matchKey = ''; seedLive = null; eventLive = null; if (host) host.textContent = ''; host && host.appendChild(h('div', { class: 'sw-msg dim', text: 'Opens the Colosseum on demand.' }));
  }
  window.addEventListener('resize', function () { if (running) size(); });
  function wrap() { var f = window.switchWorldsTab; if (typeof f !== 'function' || f._col) return; window.switchWorldsTab = function (tab) { var r = f.apply(this, arguments); if (tab !== 'arena' && running) unmount(); return r; }; window.switchWorldsTab._col = true; }
  wrap(); window.addEventListener('load', function () { wrap(); setTimeout(wrap, 800); });
  window.shdColosseum = { _crowd: function () { return [crowdN, crowdBase.length]; }, mount: mount, unmount: unmount, _sim: simulate, _tour: tournament, _roster: ROSTER, _mode: function () { return mode; }, _setMode: setMode, _fighters: function () { return fighters; } };
})();
