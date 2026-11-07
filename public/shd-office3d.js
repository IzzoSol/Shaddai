/* SHADDAI V119 — MINI 3D OFFICE (Office tab).
   Your own holographic command room. Walk it, watch your forged agents and outside bots work at their desks live, steer them from Jarvis-style
   holo tabs that hover over every desk, restyle the room (5 themes, your own posters), and click any desk to open the real dashboard panel.
   Server truth only: positions/states come from /api/bridge/city + /api/bridge/runs; no bot code runs here and nothing moves money.
   Agent looks are saved on the agent (operative.look.orb) for the 3D world; room theme + posters are kept on this device for now.
   Restore the old Office: localStorage.shd_legacy_nav = '1'. */
(function () {
  'use strict';
  var legacy = function () { return document.documentElement.classList.contains('shd-legacy-nav'); };
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ── themes ─────────────────────────────────────────────────────────── */
  var THEMES = {
    neon:   { name: 'Neon Grid',    bg: 0x070b16, floor: '#0b1324', grid: [0x1f6f66, 0x12304a], trim: 0x00e5a0, wall: 0x0c1730, accent: '#00e5a0', sky: ['#0a1a33', '#00e5a0'], desk: 0x101a30 },
    aurora: { name: 'Aurora Glass', bg: 0x080716, floor: '#120d26', grid: [0x6d4fd6, 0x2a1f55], trim: 0xa78bfa, wall: 0x150f2e, accent: '#a78bfa', sky: ['#150f2e', '#22d3ee'], desk: 0x1a1438 },
    solar:  { name: 'Solar Forge',  bg: 0x120a06, floor: '#1c1209', grid: [0xc2741a, 0x4a2a10], trim: 0xfb923c, wall: 0x24140a, accent: '#fb923c', sky: ['#24140a', '#f0b429'], desk: 0x2a1a0e },
    voidlab:{ name: 'Void Lab',     bg: 0x05060a, floor: '#0a0c12', grid: [0x8a94a8, 0x252a36], trim: 0xe8eefc, wall: 0x0d1018, accent: '#e8eefc', sky: ['#0d1018', '#60a5fa'], desk: 0x131722 },
    sakura: { name: 'Sakura Night', bg: 0x100612, floor: '#1a0c1f', grid: [0xd946a0, 0x45163a], trim: 0xf472b6, wall: 0x200a26, accent: '#f472b6', sky: ['#200a26', '#fb7185'], desk: 0x2a1030 }
  };
  /* ── stations: desk position, hologram, what a click does ── */
  var STATIONS = {
    office:    { x: 0,    z: 0.8,  label: 'Control',   color: null,      sub: 'crew, approvals, status', hint: 'report' },
    market:    { x: -8,   z: -5.2, label: 'Market',    color: null,      sub: 'prices, mood, momentum', hint: 'price btc eth',   open: function () { showView('pipeline'); } },
    library:   { x: 0,    z: -6.6, label: 'Library',   color: null,      sub: 'news and deep research', hint: 'news  ·  research mangroves',          open: function () { officeTab('library'); } },
    garden:    { x: 8,    z: -5.2, label: 'Plots',     color: null,      sub: 'your land, growing',                open: function () { worldsTab('plots'); } },
    athenaeum: { x: -8,   z: 5.2,  label: 'Athenaeum', color: null,      sub: 'classes and skills',         open: function () { worldsTab('athenaeum'); } },
    workshop:  { x: 8,    z: 5.2,  label: 'Skills',    color: null,      sub: 'tools, tasks, workflows', hint: 'run crypto analysis',            open: function () { officeTab('skills'); } },
    wallet:    { x: -10.8, z: 0.2,  label: 'Wallet',    color: '#f0b429', sub: 'Sparks and payments',          open: function () { showView('wallet'); } },
    gallery:   { x: 10.8, z: 0.2,  label: 'Gallery',   color: '#a78bfa', sub: 'everything you have made',           open: function () { officeTab('gallery'); } },
    navi:      { x: 0,    z: 7.2,  label: 'Navi',      color: '#00f0ff', sub: 'your guide, in 3D',      open: function () { naviMenu(); } }
  };
  /* holo tab actions: wf = run a real workflow on the server (as your selected agent so you SEE it walk), open = jump to the panel */
  var HOLO = {
    office:    [{ t: 'Report', wf: 'dashboard.report' }],
    market:    [{ t: 'Prices', wf: 'market.snapshot' }, { t: 'Open', open: 1 }],
    library:   [{ t: 'News', wf: 'news.digest' }, { t: 'Research…', wf: 'research.topic', ask: 'Topic to research' }, { t: 'Open', open: 1 }],
    garden:    [{ t: 'Open', open: 1 }], athenaeum: [{ t: 'Classes', open: 1 }], workshop: [{ t: 'Skills', open: 1 }, { t: 'Tasks', tasks: 1 }],
    wallet:    [{ t: 'SOL balance', sol: 1 }, { t: 'Hyperliquid', hl: 1 }, { t: 'Open', open: 1 }], gallery: [{ t: 'Open', open: 1 }], navi: [{ t: 'Menu', open: 1 }]
  };
  var ROOM = { w: 26, d: 18 };   // metres; the earlier room was 18 x 13
  var FORMS = ['orb', 'crystal', 'figure'], ACCS = ['none', 'halo', 'ring', 'hat', 'antenna', 'crown'];
  var GRADS = [['#00e5a0', '#00b4ff'], ['#a78bfa', '#f43f5e'], ['#f0b429', '#fb923c'], ['#00f0ff', '#7c3aed'], ['#ffffff', '#60a5fa'], ['#34d399', '#fde047']];
  var NAVI = [['map', 'Map'], ['inv', 'Inventory'], ['bots', 'Bots'], ['wallet', 'Wallet'], ['academy', 'Academy'], ['market', 'Market'], ['chat', 'Chat'], ['settings', 'Settings']];
  var POSTER_SLOTS = [{ x: -10.2, y: 1.75, z: -8.92, ry: 0 }, { x: 10.2, y: 1.75, z: -8.92, ry: 0 }, { x: -12.92, y: 1.75, z: -2.6, ry: Math.PI / 2 }, { x: 12.92, y: 1.75, z: -2.6, ry: -Math.PI / 2 }];

  var T = null, card, host, hud, panel, prompt, holoLayer, dock, listEl, qBtn, recBtn, renderer, scene, camera, raf = 0, running = false, W = 0, H = 0, _v = null;
  var agents = {}, ops = [], runs = [], player, nearKey = null, simT = 0, camX = 0, camZ = 1.2, camYaw = 0, quality = 'high', dust = null, pulses = [], rec = null, keys = {};
  var target = null, pending = null, yaw = 0, dist = 17.5, poll = null, lastT = 0, labelCache = {}, full = false, sel = null, follow = null, focus = null, themeKey = 'neon', room = { theme: 'neon', posters: [null, null, null, null] };
  var hasPending = false, stationObjs = {}, holos = {}, posterMeshes = [], spinners = [], holoState = {};

  function h(tag, attrs, kids) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) { if (k === 'text') e.textContent = attrs[k]; else if (k === 'class') e.className = attrs[k]; else if (k.indexOf('on') === 0) e.addEventListener(k.slice(2), attrs[k]); else if (attrs[k] != null) e.setAttribute(k, attrs[k]); });
    (kids || []).forEach(function (c) { if (c != null) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return e;
  }
  function officeTab(t) { try { if (window.switchOfficeTab) window.switchOfficeTab(t); } catch (e) { /* ignore */ } exitFull(); }
  function worldsTab(t) { try { showView('worlds'); setTimeout(function () { if (window.switchWorldsTab) window.switchWorldsTab(t); }, 80); } catch (e) { /* ignore */ } exitFull(); }
  function uid() { try { return localStorage.getItem('shd_userid') || ''; } catch (e) { return ''; } }
  function hdr(json) { var o = {}; if (json) o['Content-Type'] = 'application/json'; try { var t = localStorage.getItem('shd_token'); if (t) o.Authorization = 'Bearer ' + t; } catch (e) { /* ignore */ } return o; }
  function api(method, path, body) { return fetch(path, { method: method, headers: hdr(!!body), credentials: 'same-origin', body: body ? JSON.stringify(body) : undefined }).then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { d._s = r.status; return d; }); }); }
  function toast(m) { try { if (typeof window.notify === 'function') window.notify(m); } catch (e) { /* ignore */ } }
  function hueOf(id) { var n = 0; for (var i = 0; i < id.length; i++) n = (n * 31 + id.charCodeAt(i)) >>> 0; return n % GRADS.length; }
  function th() { return THEMES[themeKey] || THEMES.neon; }
  function sColor(k) { return STATIONS[k].color || th().accent; }
  function loadRoom() { try { var r = JSON.parse(localStorage.getItem('shd_o3_room') || 'null'); if (r) { room.theme = THEMES[r.theme] ? r.theme : 'neon'; room.posters = [0, 1, 2, 3].map(function (i) { return (r.posters && typeof r.posters[i] === 'string' && r.posters[i].indexOf('data:image/') === 0) ? r.posters[i] : null; }); } } catch (e) { /* ignore */ } themeKey = room.theme; }
  function saveRoom() { room.theme = themeKey; try { localStorage.setItem('shd_o3_room', JSON.stringify(room)); } catch (e) { toast('Could not save the room (storage is full). Try a smaller poster.'); } }

  /* ── agent looks: form, gradient, accessory, glow ── */
  function defaultLook(id) { var g = GRADS[hueOf(String(id))]; return { form: 'orb', c1: g[0], c2: g[1], acc: 'none', glow: 1 }; }
  function sane(l, id) { var d = defaultLook(id), o = l && typeof l === 'object' ? l : {}, hex = /^#[0-9a-fA-F]{6}$/;
    return { form: FORMS.indexOf(o.form) > -1 ? o.form : d.form, c1: hex.test(o.c1) ? o.c1 : d.c1, c2: hex.test(o.c2) ? o.c2 : d.c2, acc: ACCS.indexOf(o.acc) > -1 ? o.acc : 'none', glow: Math.min(1.6, Math.max(0.4, +o.glow || 1)) }; }
  function lookOf(a) { var op = ops.filter(function (o) { return o.id === a.id; })[0], fromOp = op && op.look && op.look.orb, local = null; try { local = JSON.parse(localStorage.getItem('shd_orb_' + a.id) || 'null'); } catch (e) { /* ignore */ } return sane(fromOp || local, a.id); }

  /* ── three helpers ── */
  function disposeObj(o) { if (!o) return; o.traverse(function (n) { if (n.geometry) n.geometry.dispose(); if (n.material) { (Array.isArray(n.material) ? n.material : [n.material]).forEach(function (m) { if (m.map) m.map.dispose(); m.dispose(); }); } }); }
  function gradGeo(geo, c1, c2) { var pos = geo.attributes.position, n = pos.count, col = new Float32Array(n * 3), a = new T.Color(c1), b = new T.Color(c2), tmp = new T.Color(), minY = 1e9, maxY = -1e9, i; for (i = 0; i < n; i++) { var y = pos.getY(i); if (y < minY) minY = y; if (y > maxY) maxY = y; } for (i = 0; i < n; i++) { tmp.copy(a).lerp(b, (pos.getY(i) - minY) / Math.max(0.0001, maxY - minY)); col[i * 3] = tmp.r; col[i * 3 + 1] = tmp.g; col[i * 3 + 2] = tmp.b; } geo.setAttribute('color', new T.BufferAttribute(col, 3)); return geo; }
  function glowTex(c) { var k = 'g' + c; if (labelCache[k]) return labelCache[k]; var cv = document.createElement('canvas'); cv.width = cv.height = 128; var x = cv.getContext('2d'), g = x.createRadialGradient(64, 64, 4, 64, 64, 62); g.addColorStop(0, c); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(0, 0, 128, 128); return (labelCache[k] = new T.CanvasTexture(cv)); }
  function textSprite(text, opt) {
    opt = opt || {}; var cv = document.createElement('canvas'), x = cv.getContext('2d'); x.font = '700 ' + (opt.size || 26) + 'px sans-serif'; var w = Math.ceil(x.measureText(text).width) + 28; cv.width = w; cv.height = 44; x = cv.getContext('2d'); x.font = '700 ' + (opt.size || 26) + 'px sans-serif';
    if (opt.bg) { x.fillStyle = 'rgba(8,14,26,.88)'; x.strokeStyle = opt.color || '#00e5a0'; x.lineWidth = 2; x.beginPath(); if (x.roundRect) x.roundRect(1, 1, w - 2, 42, 18); else x.rect(1, 1, w - 2, 42); x.fill(); x.stroke(); }
    x.fillStyle = opt.color || '#e8eefc'; x.textBaseline = 'middle'; x.fillText(text, 14, 23);
    var sp = new T.Sprite(new T.SpriteMaterial({ map: new T.CanvasTexture(cv), transparent: true, depthTest: false })); sp.scale.set(w / 70, 44 / 70, 1); sp.renderOrder = 10; return sp;
  }
  function makeBeam(c) { var g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(new Float32Array(6), 3)); var l = new T.Line(g, new T.LineBasicMaterial({ color: new T.Color(c), transparent: true, opacity: 0.6 })); l.frustumCulled = false; l.visible = false; return l; }
  function pulse(s, c) { if (!s || reduce || !scene) return; var m = new T.Mesh(new T.RingGeometry(0.6, 0.7, 40), new T.MeshBasicMaterial({ color: new T.Color(c), transparent: true, opacity: 0.8, side: T.DoubleSide })); m.rotation.x = -Math.PI / 2; m.position.set(s.x, 0.05, s.z); scene.add(m); pulses.push({ m: m, t0: simT }); }

  /* ── procedural art: floor circuit, skyline, station glyphs, poster ── */
  function rnd(seed) { var s = seed >>> 0; return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
  function floorTexture(t) {
    var cv = document.createElement('canvas'); cv.width = 1024; cv.height = 740; var x = cv.getContext('2d'), R = rnd(7), ac = t.accent;
    x.fillStyle = t.floor; x.fillRect(0, 0, 1024, 740); x.strokeStyle = ac; x.globalAlpha = 0.16; x.lineWidth = 2;
    for (var i = 0; i < 46; i++) { var px = Math.floor(R() * 32) * 32, py = Math.floor(R() * 23) * 32; x.beginPath(); x.moveTo(px, py); for (var k = 0; k < 3 + Math.floor(R() * 3); k++) { if (R() < 0.5) px += (R() < 0.5 ? -1 : 1) * 32 * (1 + Math.floor(R() * 3)); else py += (R() < 0.5 ? -1 : 1) * 32 * (1 + Math.floor(R() * 3)); x.lineTo(px, py); } x.stroke(); x.fillStyle = ac; x.beginPath(); x.arc(px, py, 4, 0, 7); x.fill(); }
    x.globalAlpha = 1;
    Object.keys(STATIONS).forEach(function (k) { var s = STATIONS[k], cx = (s.x + ROOM.w / 2) / ROOM.w * 1024, cy = (s.z + ROOM.d / 2) / ROOM.d * 740, c = sColor(k), g = x.createRadialGradient(cx, cy, 6, cx, cy, 150); g.addColorStop(0, c + '55'); g.addColorStop(1, c + '00'); x.fillStyle = g; x.fillRect(cx - 160, cy - 160, 320, 320); x.strokeStyle = c; x.globalAlpha = 0.5; x.lineWidth = 3; x.beginPath(); x.arc(cx, cy, k === 'office' ? 74 : 56, 0, 7); x.stroke(); x.globalAlpha = 0.22; x.beginPath(); x.arc(cx, cy, k === 'office' ? 96 : 76, 0, 7); x.stroke(); x.globalAlpha = 1; });
    return new T.CanvasTexture(cv);
  }
  function skylineTexture(t) {
    var cv = document.createElement('canvas'); cv.width = 1024; cv.height = 256; var x = cv.getContext('2d'), R = rnd(21), g = x.createLinearGradient(0, 0, 0, 256); g.addColorStop(0, t.sky[0]); g.addColorStop(1, t.sky[1] + '66'); x.fillStyle = g; x.fillRect(0, 0, 1024, 256);
    for (var i = 0; i < 70; i++) { x.fillStyle = 'rgba(255,255,255,' + (0.2 + R() * 0.6) + ')'; x.fillRect(R() * 1024, R() * 110, 2, 2); }
    var bx = 0; while (bx < 1024) { var bw = 26 + R() * 56, bh = 50 + R() * 150; x.fillStyle = 'rgba(6,10,20,.92)'; x.fillRect(bx, 256 - bh, bw, bh); for (var wy = 256 - bh + 8; wy < 248; wy += 12) for (var wx = bx + 6; wx < bx + bw - 6; wx += 10) if (R() < 0.45) { x.fillStyle = R() < 0.2 ? t.accent : 'rgba(255,214,120,.8)'; x.fillRect(wx, wy, 4, 6); } bx += bw + 3 + R() * 8; }
    x.globalAlpha = 0.25; x.fillStyle = t.accent; x.fillRect(0, 248, 1024, 8); return new T.CanvasTexture(cv);
  }
  function glyphTexture(k, c) {
    var cv = document.createElement('canvas'); cv.width = cv.height = 128; var x = cv.getContext('2d'); x.strokeStyle = c; x.fillStyle = c; x.lineWidth = 6; x.lineCap = 'round'; x.lineJoin = 'round'; x.shadowColor = c; x.shadowBlur = 14; x.translate(64, 64); x.beginPath();
    if (k === 'market') { x.moveTo(-34, 28); x.lineTo(-34, 4); x.moveTo(-12, 28); x.lineTo(-12, -16); x.moveTo(10, 28); x.lineTo(10, -4); x.moveTo(32, 28); x.lineTo(32, -32); }
    else if (k === 'library') { x.rect(-36, -26, 34, 52); x.rect(2, -26, 34, 52); }
    else if (k === 'garden') { x.arc(0, 8, 26, 0, 7); x.moveTo(0, 34); x.lineTo(0, -32); }
    else if (k === 'athenaeum') { x.moveTo(-40, 30); x.lineTo(40, 30); x.moveTo(-30, 18); x.lineTo(-30, -12); x.moveTo(0, 18); x.lineTo(0, -12); x.moveTo(30, 18); x.lineTo(30, -12); x.moveTo(-42, -16); x.lineTo(0, -38); x.lineTo(42, -16); x.closePath(); }
    else if (k === 'workshop') { x.arc(0, 0, 20, 0, 7); x.moveTo(0, -38); x.lineTo(0, -24); x.moveTo(0, 24); x.lineTo(0, 38); x.moveTo(-38, 0); x.lineTo(-24, 0); x.moveTo(24, 0); x.lineTo(38, 0); }
    else if (k === 'wallet') { x.rect(-38, -22, 76, 48); x.moveTo(-38, -8); x.lineTo(38, -8); x.moveTo(18, 8); x.lineTo(30, 8); }
    else if (k === 'gallery') { x.rect(-34, -34, 68, 68); x.moveTo(-34, 18); x.lineTo(-10, -6); x.lineTo(8, 12); x.lineTo(20, 2); x.lineTo(34, 18); }
    else if (k === 'navi') { x.arc(0, 0, 32, 0, 7); x.moveTo(0, -22); x.lineTo(12, 12); x.lineTo(0, 4); x.lineTo(-12, 12); x.closePath(); }
    else { x.arc(0, 0, 30, 0, 7); x.moveTo(-14, 0); x.lineTo(14, 0); x.moveTo(0, -14); x.lineTo(0, 14); }
    x.stroke(); return new T.CanvasTexture(cv);
  }
  function posterPlaceholder(t) {
    var cv = document.createElement('canvas'); cv.width = 384; cv.height = 512; var x = cv.getContext('2d'), g = x.createLinearGradient(0, 0, 384, 512); g.addColorStop(0, t.sky[0]); g.addColorStop(1, t.accent + '88'); x.fillStyle = g; x.fillRect(0, 0, 384, 512);
    x.strokeStyle = t.accent; x.globalAlpha = 0.5; x.lineWidth = 3; x.strokeRect(24, 24, 336, 464); x.globalAlpha = 1; x.fillStyle = t.accent; x.font = '800 30px sans-serif'; x.textAlign = 'center'; x.fillText('YOUR POSTER', 192, 240); x.font = '600 18px sans-serif'; x.fillStyle = '#cfe0ff'; x.fillText('click to upload', 192, 276); return new T.CanvasTexture(cv);
  }
  function posterFromData(data, cb) { var img = new Image(); img.onload = function () { var cv = document.createElement('canvas'); cv.width = 384; cv.height = 512; var x = cv.getContext('2d'); x.fillStyle = '#0a0f1c'; x.fillRect(0, 0, 384, 512); var s = Math.max(384 / img.width, 512 / img.height), w = img.width * s, hh = img.height * s; x.drawImage(img, (384 - w) / 2, (512 - hh) / 2, w, hh); cb(new T.CanvasTexture(cv)); }; img.onerror = function () { cb(null); }; img.src = data; }

  /* ── agent bodies ── */
  function buildBody(a, look) {
    var g = new T.Group(), body = new T.Group(); g.add(body); g.userData.body = body; var mat = new T.MeshBasicMaterial({ vertexColors: true }), core;
    if (look.form === 'crystal') { var og = new T.OctahedronGeometry(0.55, 0); og.scale(1, 1.35, 1); core = new T.Mesh(gradGeo(og, look.c1, look.c2), mat); core.position.y = 0.95; body.add(core); }
    else if (look.form === 'figure') { var torso = new T.Mesh(gradGeo(new T.CapsuleGeometry(0.26, 0.5, 6, 14), look.c1, look.c2), mat); torso.position.y = 0.75; body.add(torso); var hd = new T.Mesh(gradGeo(new T.SphereGeometry(0.22, 18, 14), look.c2, look.c1), mat); hd.position.y = 1.4; body.add(hd); }
    else { core = new T.Mesh(gradGeo(new T.SphereGeometry(0.46, 28, 18), look.c1, look.c2), mat); core.position.y = 0.95; body.add(core); }
    var top = look.form === 'figure' ? 1.4 : look.form === 'crystal' ? 1.72 : 1.44, am = new T.MeshBasicMaterial({ color: look.c2 }), ac;
    if (look.acc === 'halo') { ac = new T.Mesh(new T.TorusGeometry(0.3, 0.035, 8, 32), am); ac.rotation.x = Math.PI / 2; ac.position.y = top + 0.28; }
    else if (look.acc === 'ring') { ac = new T.Mesh(new T.TorusGeometry(0.62, 0.03, 8, 40), am); ac.rotation.x = Math.PI / 2.3; ac.position.y = 0.95; g.userData.spin = ac; }
    else if (look.acc === 'hat') { ac = new T.Mesh(new T.ConeGeometry(0.26, 0.5, 18), am); ac.position.y = top + 0.3; }
    else if (look.acc === 'antenna') { ac = new T.Group(); var st = new T.Mesh(new T.CylinderGeometry(0.015, 0.015, 0.5, 6), am); st.position.y = 0.25; var tip = new T.Mesh(new T.SphereGeometry(0.06, 10, 8), am); tip.position.y = 0.52; ac.add(st); ac.add(tip); ac.position.y = top + 0.05; }
    else if (look.acc === 'crown') { ac = new T.Group(); for (var i = 0; i < 5; i++) { var sp = new T.Mesh(new T.ConeGeometry(0.06, 0.2, 6), am), an = i / 5 * Math.PI * 2; sp.position.set(Math.cos(an) * 0.2, 0.1, Math.sin(an) * 0.2); ac.add(sp); } ac.position.y = top + 0.14; }
    if (ac) body.add(ac);
    var glow = new T.Sprite(new T.SpriteMaterial({ map: glowTex(look.c1), blending: T.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.55 * look.glow })); glow.scale.set(2.6 * look.glow, 2.6 * look.glow, 1); glow.position.y = 0.95; g.add(glow); g.userData.glow = glow;
    var sh = new T.Mesh(new T.CircleGeometry(0.5, 20), new T.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35 })); sh.rotation.x = -Math.PI / 2; sh.position.y = 0.01; g.add(sh);
    var nm = textSprite(a.name || a.id, { color: look.c1 }); nm.position.set(0, 2.45, 0); g.add(nm); return g;
  }
  function stationPos(st, i, n) { var s = STATIONS[st] || STATIONS.office, a = (i / Math.max(n, 1)) * Math.PI * 2 + 0.6, r = n > 1 ? 1.0 : 0; return { x: s.x + Math.cos(a) * r, z: s.z + 1.4 + Math.sin(a) * r * 0.7 }; }

  /* ── the room ── */
  function buildScene() {
    var t = th(); scene = new T.Scene(); scene.background = new T.Color(t.bg); scene.fog = new T.Fog(t.bg, 26, 60); camera = camera || new T.PerspectiveCamera(48, 1, 0.1, 120);
    stationObjs = {}; posterMeshes = []; spinners = [];
    var sp = new Float32Array(240 * 3); for (var i = 0; i < 240; i++) { var r = 50 + Math.random() * 12, a = Math.random() * Math.PI * 2, e = Math.random() * 0.9; sp[i * 3] = Math.cos(a) * r * Math.cos(e); sp[i * 3 + 1] = Math.sin(e) * r + 2; sp[i * 3 + 2] = Math.sin(a) * r * Math.cos(e) - 10; }
    var sg = new T.BufferGeometry(); sg.setAttribute('position', new T.BufferAttribute(sp, 3)); scene.add(new T.Points(sg, new T.PointsMaterial({ color: 0xffffff, size: 0.12, transparent: true, opacity: 0.7, fog: false })));
    var floor = new T.Mesh(new T.PlaneGeometry(ROOM.w, ROOM.d), new T.MeshBasicMaterial({ map: floorTexture(t) })); floor.rotation.x = -Math.PI / 2; scene.add(floor); stationObjs._floor = floor;
    var grid = new T.GridHelper(ROOM.w, ROOM.w * 2, t.grid[0], t.grid[1]); grid.scale.z = ROOM.d / ROOM.w; grid.position.y = 0.012; grid.material.transparent = true; grid.material.opacity = 0.5; scene.add(grid);
    var trim = new T.LineSegments(new T.EdgesGeometry(new T.BoxGeometry(ROOM.w, 3.6, ROOM.d)), new T.LineBasicMaterial({ color: t.trim, transparent: true, opacity: 0.7 })); trim.position.y = 1.8; scene.add(trim);
    var wallMat = function () { return new T.MeshBasicMaterial({ color: t.wall, transparent: true, opacity: 0.5, side: T.DoubleSide }); };
    var wb = new T.Mesh(new T.PlaneGeometry(ROOM.w, 3.6), wallMat()); wb.position.set(0, 1.8, -ROOM.d / 2); scene.add(wb);
    var wl = new T.Mesh(new T.PlaneGeometry(ROOM.d, 3.6), wallMat()); wl.rotation.y = Math.PI / 2; wl.position.set(-ROOM.w / 2, 1.8, 0); scene.add(wl);
    var wr = new T.Mesh(new T.PlaneGeometry(ROOM.d, 3.6), wallMat()); wr.rotation.y = -Math.PI / 2; wr.position.set(ROOM.w / 2, 1.8, 0); scene.add(wr);
    var sky = new T.Mesh(new T.PlaneGeometry(13.6, 2.35), new T.MeshBasicMaterial({ map: skylineTexture(t) })); sky.position.set(0, 1.85, -ROOM.d / 2 + 0.06); scene.add(sky);
    var skyFrame = new T.LineSegments(new T.EdgesGeometry(new T.PlaneGeometry(13.6, 2.35)), new T.LineBasicMaterial({ color: t.trim })); skyFrame.position.copy(sky.position); scene.add(skyFrame);
    [[-12.6, -8.6], [12.6, -8.6], [-12.6, 8.6], [12.6, 8.6], [0, -8.7]].forEach(function (p) { var pl = new T.Mesh(new T.CylinderGeometry(0.07, 0.07, 3.6, 8), new T.MeshBasicMaterial({ color: t.trim, transparent: true, opacity: 0.8 })); pl.position.set(p[0], 1.8, p[1]); scene.add(pl); var gl = new T.Sprite(new T.SpriteMaterial({ map: glowTex(t.accent), blending: T.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.35 })); gl.scale.set(2.2, 4.2, 1); gl.position.set(p[0], 1.8, p[1]); scene.add(gl); });
    POSTER_SLOTS.forEach(function (ps, idx) {
      var m = new T.Mesh(new T.PlaneGeometry(1.8, 2.4), new T.MeshBasicMaterial({ map: posterPlaceholder(t) })); m.position.set(ps.x, ps.y, ps.z); m.rotation.y = ps.ry; m.userData.poster = idx; scene.add(m);
      var fr = new T.LineSegments(new T.EdgesGeometry(new T.PlaneGeometry(1.9, 2.5)), new T.LineBasicMaterial({ color: t.trim })); fr.position.copy(m.position); fr.rotation.y = ps.ry; scene.add(fr); posterMeshes.push(m);
      if (room.posters[idx]) posterFromData(room.posters[idx], function (tx) { if (tx && m.material) { if (m.material.map) m.material.map.dispose(); m.material.map = tx; m.material.needsUpdate = true; } });
    });
    Object.keys(STATIONS).forEach(function (k) {
      var s = STATIONS[k], grp = new T.Group(), col = new T.Color(sColor(k)); grp.position.set(s.x, 0, s.z);
      if (k !== 'office') {
        var base = new T.Mesh(new T.BoxGeometry(2.2, 0.62, 1.1), new T.MeshBasicMaterial({ color: t.desk })); base.position.y = 0.31; grp.add(base);
        var lip = new T.Mesh(new T.BoxGeometry(2.3, 0.05, 1.2), new T.MeshBasicMaterial({ color: col })); lip.position.y = 0.04; grp.add(lip);
        var topP = new T.Mesh(new T.BoxGeometry(2.2, 0.07, 1.1), new T.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.85 })); topP.position.y = 0.66; grp.add(topP); grp.userData.top = topP;
        var edge = new T.LineSegments(new T.EdgesGeometry(new T.BoxGeometry(2.2, 0.66, 1.1)), new T.LineBasicMaterial({ color: col })); edge.position.y = 0.33; grp.add(edge);
        var cone = new T.Mesh(new T.ConeGeometry(0.85, 1.7, 28, 1, true), new T.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.1, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide })); cone.rotation.x = Math.PI; cone.position.y = 1.55; grp.add(cone); grp.userData.cone = cone;
        var gl = new T.Sprite(new T.SpriteMaterial({ map: glyphTexture(k, '#' + col.getHexString()), transparent: true, depthWrite: false, blending: T.AdditiveBlending })); gl.scale.set(0.95, 0.95, 1); gl.position.y = 1.7; grp.add(gl); grp.userData.glyph = gl;
        var pad = new T.Mesh(new T.RingGeometry(1.25, 1.33, 48), new T.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.45, side: T.DoubleSide })); pad.rotation.x = -Math.PI / 2; pad.position.y = 0.03; grp.add(pad);
        grp.userData.key = k; stationObjs[k] = grp;
      } else {
        [1.3, 1.0, 0.7].forEach(function (rad, i) { var rg = new T.Mesh(new T.TorusGeometry(rad, 0.03, 8, 64), new T.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.7 - i * 0.12 })); rg.rotation.x = Math.PI / 2; rg.position.y = 0.04 + i * 0.28; grp.add(rg); spinners.push({ m: rg, sp: (i % 2 ? -1 : 1) * (0.5 + i * 0.4) }); });
        var beamCol = new T.Mesh(new T.CylinderGeometry(0.45, 0.45, 1.4, 20, 1, true), new T.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.08, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide })); beamCol.position.y = 0.7; grp.add(beamCol);
      }
      scene.add(grp);
    });
    var pl = new T.Group(), pc = new T.Mesh(new T.SphereGeometry(0.34, 20, 14), new T.MeshBasicMaterial({ color: 0xffffff })); pc.position.y = 0.7; pl.add(pc);
    var pg = new T.Sprite(new T.SpriteMaterial({ map: glowTex('#ffffff'), blending: T.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.6 })); pg.scale.set(2, 2, 1); pg.position.y = 0.7; pl.add(pg);
    var you = textSprite('You', { color: '#ffffff' }); you.position.y = 1.55; pl.add(you); pl.position.set(player ? player.position.x : 0, 0, player ? player.position.z : 4.6); scene.add(pl); player = pl;
  }
  function rebuildRoom() {
    var keep = Object.keys(agents).map(function (k) { return agents[k]; });
    if (scene) { keep.forEach(function (a) { scene.remove(a.obj); disposeObj(a.obj); scene.remove(a.beam); disposeObj(a.beam); }); disposeObj(scene); }
    pulses = []; dust = null; labelCache = {}; buildScene(); buildDust();
    keep.forEach(function (a) { a.obj = buildBody(a, a.look); a.obj.position.set(a.x, 0, a.z); scene.add(a.obj); a.beam = makeBeam(a.look.c1); scene.add(a.beam); a._bt = null; setBubble(a); });
    Object.keys(holos).forEach(function (k) { holos[k].style.setProperty('--hc', sColor(k)); }); card.style.setProperty('--o3a', th().accent); buildDock();
  }
  function buildDust() { if (dust) { scene.remove(dust); disposeObj(dust); dust = null; } if (quality !== 'high' || reduce) return; var n = 140, pos = new Float32Array(n * 3); for (var i = 0; i < n; i++) { pos[i * 3] = (Math.random() - 0.5) * (ROOM.w - 1); pos[i * 3 + 1] = Math.random() * 3.2; pos[i * 3 + 2] = (Math.random() - 0.5) * (ROOM.d - 1); } var g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(pos, 3)); dust = new T.Points(g, new T.PointsMaterial({ color: new T.Color(th().accent), size: 0.05, transparent: true, opacity: 0.5, depthWrite: false, blending: T.AdditiveBlending })); scene.add(dust); }
  function size() { if (!renderer) return; var r = host.getBoundingClientRect(); W = Math.max(280, Math.round(r.width)); H = full ? Math.round(window.innerHeight - (listEl ? listEl.offsetHeight : 0)) : (W < 560 ? 340 : 480); host.style.height = H + 'px'; renderer.setSize(W, H, false); renderer.domElement.style.width = W + 'px'; renderer.domElement.style.height = H + 'px'; camera.aspect = W / H; camera.updateProjectionMatrix(); }
  function camUpdate(dt) {
    var k = 1 - Math.exp(-6 * dt), ky = 1 - Math.exp(-8 * dt), f = follow && agents[follow], gx, gz;
    if (f) { gx = f.x * 0.5; gz = f.z * 0.4; } else { gx = player.position.x * 0.5 + (player._vx || 0) * 0.25; gz = player.position.z * 0.4 + (player._vz || 0) * 0.25; }
    camX += (gx - camX) * k; camZ += (gz - camZ) * k; camYaw += (yaw - camYaw) * ky;
    camera.position.set(camX + Math.sin(camYaw) * dist * 0.55, dist * 0.56, camZ + Math.cos(camYaw) * dist * 0.8); camera.lookAt(camX, 0.9, camZ - 1.0);
  }

  /* ── live state: crew + runs ── */
  function stationOfRun(wf) { return wf === 'market.snapshot' ? 'market' : (wf === 'news.digest' || wf === 'research.topic') ? 'library' : wf === 'dashboard.report' ? 'office' : /^sap\./.test(wf || '') ? 'garden' : 'workshop'; }
  function briefOut(outs) { if (!outs) return ''; var k = Object.keys(outs)[0], v = String(outs[k] || ''); try { var j = JSON.parse(v); v = typeof j === 'object' ? (j.price ? (j.symbol || k) + ' ' + j.price : j.title || j.summary || (Array.isArray(j) ? (j[0] && (j[0].title || j[0].name)) : '') || JSON.stringify(j)) : String(j); } catch (e) { /* plain */ } return String(v).replace(/\s+/g, ' ').slice(0, 78); }
  function pollCity() {
    if (!running || document.hidden) return;
    Promise.all([api('GET', '/api/bridge/city'), api('GET', '/api/operatives' + (uid() ? '?owner=' + encodeURIComponent(uid()) : '')).catch(function () { return {}; }), api('GET', '/api/bridge/runs').catch(function () { return {}; })]).then(function (r) {
      if (!running) return; var d = r[0], o = r[1]; runs = (r[2] && r[2].runs) || []; ops = (o && (o.operatives || (o.data && o.data.operatives))) || (Array.isArray(o) ? o : []);
      if (d._s === 401) { setNote('Sign in to open your crew.'); return; } if (d._s >= 400 || !d.me) { setNote('Live view is resting. The bot bridge is off on this server.'); return; }
      setNote(d.me.length ? '' : 'Your crew is empty. Forge one in the 3D Forge, or connect a bot.');
      var seen = {}, per = {}, idx = {}; d.me.forEach(function (m) { var st = m.station || 'office'; per[st] = (per[st] || 0) + 1; });
      d.me.forEach(function (m) {
        var st = m.presence === 'idle' || !m.station ? 'office' : m.station; idx[st] = idx[st] || 0; var p = stationPos(st, idx[st]++, per[st] || 1), a = agents[m.id], lk = lookOf(m);
        if (!a) { a = agents[m.id] = { id: m.id, name: m.name, kind: m.kind, x: STATIONS.office.x, z: STATIONS.office.z + 1.4, look: lk, sig: JSON.stringify(lk), phase: hueOf(String(m.id)) * 1.3 }; a.obj = buildBody(a, lk); a.obj.position.set(a.x, 0, a.z); scene.add(a.obj); a.beam = makeBeam(lk.c1); scene.add(a.beam); }
        if (a.sig !== JSON.stringify(lk)) { scene.remove(a.obj); disposeObj(a.obj); a.look = lk; a.sig = JSON.stringify(lk); a.obj = buildBody(a, lk); a.obj.position.set(a.x, 0, a.z); scene.add(a.obj); a._bt = null; a.beam.material.color.set(lk.c1); }
        var was = a.presence === 'working'; a.name = m.name; a.kind = m.kind; a.presence = m.presence; a.step = m.step; a.st = st; a.tx = p.x; a.tz = p.z; seen[m.id] = 1; if (m.presence === 'working' && !was) pulse(STATIONS[st], a.look.c1); setBubble(a);
      });
      Object.keys(agents).forEach(function (k) { if (!seen[k]) { scene.remove(agents[k].obj); disposeObj(agents[k].obj); scene.remove(agents[k].beam); disposeObj(agents[k].beam); if (follow === k) follow = null; delete agents[k]; } });
      holoState = {}; Object.keys(STATIONS).forEach(function (k) { holoState[k] = { busy: 0, last: null }; });
      Object.keys(agents).forEach(function (id) { var a = agents[id]; if (a.presence === 'working' && holoState[a.st]) holoState[a.st].busy++; });
      hasPending = runs.some(function (r) { return r.status === 'awaiting_approval'; });
      runs.forEach(function (rn) { var k = stationOfRun(rn.workflow_id); if (!holoState[k].last && rn.status === 'succeeded' && rn.outputs) holoState[k].last = { wf: rn.workflow_id, text: briefOut(rn.outputs) }; });
      renderList(); updateHolos();
    }).catch(function () { setNote('Cannot reach the server. Retrying.'); });
  }
  function bubbleText(a) { var p = a.presence; if (p === 'working') return String(a.step || 'working').replace(/^\d+\.\s*/, '').replace(/^price:/, 'price ').replace(/_/g, ' '); if (p === 'awaiting_approval') return 'waiting for you'; if (p === 'celebrating') return 'done'; if (p === 'failed') return 'failed'; return ''; }
  function setBubble(a) { var tx = bubbleText(a); if (a._bt === tx) return; a._bt = tx; if (a._bub) { a.obj.remove(a._bub); disposeObj(a._bub); a._bub = null; } if (tx) { a._bub = textSprite(tx.length > 26 ? tx.slice(0, 25) + '…' : tx, { color: a.presence === 'failed' ? '#ff5a6a' : a.presence === 'awaiting_approval' ? '#e8c45c' : '#e8eefc', bg: true, size: 22 }); a._bub.position.set(0, 2.95, 0); a.obj.add(a._bub); } }
  function setNote(tx) { if (prompt) { prompt.textContent = tx; prompt.style.display = tx ? 'block' : 'none'; } }

  /* ── holo tabs: DOM glass panels that hover over each desk and follow it in 3D ── */
  function buildHolos() {
    holoLayer.textContent = ''; holos = {};
    Object.keys(STATIONS).forEach(function (k) {
      var s = STATIONS[k], acts = h('div', { class: 'o3h-acts' }), res = h('div', { class: 'o3h-res' }), live = h('div', { class: 'o3h-live' });
      (HOLO[k] || []).forEach(function (ac) { acts.appendChild(h('button', { type: 'button', class: 'o3h-b', text: ac.t, onclick: function (e) { e.stopPropagation(); holoAction(k, ac, res); } })); });
      var el = h('div', { class: 'o3h' + (k === 'office' ? ' ctl' : ''), 'data-k': k, style: '--hc:' + sColor(k) }, [h('div', { class: 'o3h-head' }, [h('i', { class: 'o3h-dot' }), h('b', { text: s.label }), h('span', { text: s.sub })]), live, acts, res]);
      el.addEventListener('mouseenter', function () { focus = k; }); el.addEventListener('mouseleave', function () { if (focus === k) focus = null; });
      el.addEventListener('click', function (e) { if (e.target.closest && e.target.closest('.o3h-b')) return; if (window.matchMedia && matchMedia('(pointer:coarse)').matches) { el.classList.toggle('pin'); return; } if (k !== 'office') goStation(k); });
      if (s.hint) el.appendChild(h('div', { class: 'o3h-hint', text: 'say: ' + s.hint })); el._live = live; el._res = res; holoLayer.appendChild(el); holos[k] = el;
    });
  }
  function updateHolos() {
    if (!renderer) return; Object.keys(holos).forEach(function (k) {
      var el = holos[k], st = holoState[k] || { busy: 0, last: null }, live = el._live; el.classList.toggle('busy', st.busy > 0);
      if (k === 'office') {
        live.textContent = ''; var ids = Object.keys(agents), n = ids.length, wk = ids.filter(function (i) { return agents[i].presence === 'working'; }).length;
        live.appendChild(h('div', { class: 'o3h-line', text: n ? n + ' on your crew, ' + wk + ' working' : 'Your crew is empty' }));
        runs.filter(function (r) { return r.status === 'awaiting_approval'; }).slice(0, 3).forEach(function (r) { live.appendChild(h('div', { class: 'o3h-appr' }, [h('span', { text: r.workflow_id }), h('button', { type: 'button', class: 'o3h-b ok', text: 'Approve', onclick: function (e) { e.stopPropagation(); api('POST', '/api/bridge/runs/' + encodeURIComponent(r.run_id) + '/approve').then(pollCity); } }), h('button', { type: 'button', class: 'o3h-b', text: 'Deny', onclick: function (e) { e.stopPropagation(); api('POST', '/api/bridge/runs/' + encodeURIComponent(r.run_id) + '/deny').then(pollCity); } })])); });
        if (n && !live.querySelector('.o3h-appr')) live.appendChild(h('div', { class: 'o3h-line dim', text: 'Nothing waiting on you.' }));
      } else { var txt = st.busy ? st.busy + ' working here' : (st.last ? st.last.text : 'Quiet right now'); if (live.textContent !== txt) live.textContent = txt; }
    });
  }
  function holoAction(k, ac, resEl) {
    if (ac.open) { STATIONS[k].open(); return; } if (ac.tasks) { officeTab('tasks'); return; }
    if (ac.hl) { var hs = ''; try { hs = localStorage.getItem('shd_o3_hl') || ''; } catch (e) { /* ignore */ } var ha = window.prompt('Your public Hyperliquid address (0x…, read-only, never a key)', hs); if (!ha) return; ha = ha.trim(); if (!/^0x[0-9a-fA-F]{40}$/.test(ha)) { resEl.textContent = 'That does not look like a 0x address.'; return; } try { localStorage.setItem('shd_o3_hl', ha); } catch (e) { /* ignore */ } runWf('tool.run', { tool: 'hl_account', args: { address: ha } }, resEl); return; }
    if (ac.sol) { var saved = ''; try { saved = localStorage.getItem('shd_o3_sol') || ''; } catch (e) { /* ignore */ } var addr = window.prompt('Your public Solana address (read-only, never a key or seed phrase)', saved); if (!addr) return; addr = addr.trim(); if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(addr)) { resEl.textContent = 'That does not look like a Solana address.'; return; } try { localStorage.setItem('shd_o3_sol', addr); } catch (e) { /* ignore */ } runWf('tool.run', { tool: 'get_sol_balance', args: { address: addr } }, resEl); return; }
    var params = {}; if (ac.ask) { var v = window.prompt(ac.ask); if (!v) return; params.query = v; }
    runWf(ac.wf, params, resEl);
  }
  function runWf(wf, params, resEl) {
    var firstForged = Object.keys(agents).filter(function (i) { return agents[i].kind === 'forged'; })[0], as = sel && agents[sel] && agents[sel].kind === 'forged' ? sel : firstForged;
    resEl.textContent = 'Starting…'; api('POST', '/api/bridge/run', { workflow_id: wf, params: params, agent_id: as || undefined, idempotency_key: 'o3-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6) }).then(function (d) {
      if (!d.ok) { resEl.textContent = d._s === 402 ? 'Out of Sparks. Top up to continue.' : (d.error || 'Could not start'); return; }
      var id = d.run.run_id, tries = 0; (function p() { if (!running) return; api('GET', '/api/bridge/runs').then(function (r) { var run = ((r && r.runs) || []).filter(function (x) { return x.run_id === id; })[0]; if (!run) return; if (run.status === 'succeeded') { resEl.textContent = briefOut(run.outputs) || 'Done'; pollCity(); return; } if (['failed', 'expired', 'cancelled'].indexOf(run.status) > -1) { resEl.textContent = run.status + (run.error ? ': ' + run.error : ''); return; } resEl.textContent = run.status.replace('_', ' ') + '…'; if (++tries < 40) setTimeout(p, 1200); }); })(); });
  }
  function projectHolos() {
    if (!renderer || !_v) return; var rc = renderer.domElement.getBoundingClientRect();
    Object.keys(holos).forEach(function (k) {
      var s = STATIONS[k], el = holos[k]; _v.set(s.x, k === 'office' ? 2.6 : 2.7, s.z).project(camera); var behind = _v.z > 1, dd = Math.hypot(camera.position.x - s.x, camera.position.z - s.z), sc = Math.max(0.7, Math.min(1.08, 15 / dd));
      var x = (_v.x * 0.5 + 0.5) * rc.width, y = (-_v.y * 0.5 + 0.5) * rc.height; el.style.transform = 'translate(' + Math.round(x) + 'px,' + Math.max(Math.round(y), 96) + 'px) translate(-50%,-100%) scale(' + sc.toFixed(3) + ')'; el.style.zIndex = String(Math.round(1000 - dd * 10)); el.style.opacity = behind ? '0' : '1';
      el.classList.toggle('open', focus === k || nearKey === k || (k === 'office' && hasPending && window.innerWidth >= 700));
    });
  }
  function say(text) {
    var res = holos.office && holos.office._res, note = function (t) { if (res) { res.textContent = t; } setNote(t); setTimeout(function () { if (prompt && prompt.textContent === t) setNote(''); }, 6000); };
    if (!window.shdWords) { note('The word engine is not loaded.'); return; } if (holos.office) holos.office.classList.add('pin');
    window.shdWords.resolve(text).then(function (r) { if (!r.ok) { note(r.message + (r.suggestions && r.suggestions.length ? '  Try: ' + r.suggestions.slice(0, 4).map(function (x) { return x.say; }).join(' · ') : '')); return; } note(r.title + '…'); runWf(r.wf, r.params, res || h('div')); });
  }
  function buildDock() { dock.textContent = ''; ['market', 'library', 'garden', 'athenaeum', 'workshop', 'wallet', 'gallery', 'navi'].forEach(function (k) { dock.appendChild(h('button', { type: 'button', class: 'o3-chip', 'data-k': k, style: '--hc:' + sColor(k), text: STATIONS[k].label, onclick: function () { goStation(k); } })); }); }
  function goStation(k) { var s = STATIONS[k]; if (!s || !s.open) return; follow = null; target = { x: s.x, z: s.z + 1.5 }; pending = function () { s.open(); }; }

  /* ── loop ── */
  function frame(t) {
    if (!running) return; raf = requestAnimationFrame(frame); if (!card.offsetParent && !full) return; var dt = Math.min(0.05, (t - lastT) / 1000 || 0.016); lastT = t; simT += dt; var T0 = simT * 1000;
    var mx = (keys.d || keys.arrowright ? 1 : 0) - (keys.a || keys.arrowleft ? 1 : 0), mz = (keys.s || keys.arrowdown ? 1 : 0) - (keys.w || keys.arrowup ? 1 : 0); player._vx = 0; player._vz = 0;
    if (mx || mz) { target = null; pending = null; follow = null; var c = Math.cos(yaw), sn = Math.sin(yaw), vx = mx * c + mz * sn, vz = -mx * sn + mz * c, len = Math.hypot(vx, vz) || 1; player.position.x += vx / len * 5 * dt; player.position.z += vz / len * 5 * dt; player._vx = vx / len * 5; player._vz = vz / len * 5; }
    else if (target) { var dx = target.x - player.position.x, dz = target.z - player.position.z, d = Math.hypot(dx, dz); if (d < 0.2) { target = null; if (pending) { var f = pending; pending = null; f(); } } else { player.position.x += dx / d * Math.min(d, 5 * dt); player.position.z += dz / d * Math.min(d, 5 * dt); player._vx = dx / d * 5; player._vz = dz / d * 5; } }
    player.position.x = Math.max(-ROOM.w / 2 + 0.6, Math.min(ROOM.w / 2 - 0.6, player.position.x)); player.position.z = Math.max(-ROOM.d / 2 + 0.6, Math.min(ROOM.d / 2 - 0.6, player.position.z));
    var near = null, nd = 2.0; Object.keys(STATIONS).forEach(function (k) { if (k === 'office') return; var s = STATIONS[k], d2 = Math.hypot(s.x - player.position.x, s.z + 0.6 - player.position.z); if (d2 < nd) { nd = d2; near = k; } });
    if (near !== nearKey) { nearKey = near; if (near) setNote('Press E or click to open ' + STATIONS[near].label); else setNote(Object.keys(agents).length ? '' : (prompt && prompt.textContent)); }
    Object.keys(stationObjs).forEach(function (k) { var o = stationObjs[k]; if (o.userData && o.userData.top) { var busy = holoState[k] && holoState[k].busy > 0; o.userData.top.material.opacity = busy ? 0.7 + Math.sin(T0 / 150) * 0.3 : (near === k || focus === k ? 1 : 0.8); o.userData.cone.material.opacity = busy ? 0.2 + Math.sin(T0 / 200) * 0.06 : (near === k || focus === k ? 0.16 : 0.09); if (!reduce) { o.userData.glyph.material.rotation = Math.sin(T0 / 900 + o.position.x) * 0.12; o.userData.glyph.position.y = 1.7 + Math.sin(T0 / 700 + o.position.z) * 0.06; } } });
    if (!reduce) spinners.forEach(function (sp) { sp.m.rotation.z += dt * sp.sp; });
    for (var pi = pulses.length - 1; pi >= 0; pi--) { var pu = pulses[pi], age = simT - pu.t0; if (age > 1.2) { scene.remove(pu.m); disposeObj(pu.m); pulses.splice(pi, 1); } else { var sc = 1 + age * 2.2; pu.m.scale.set(sc, sc, 1); pu.m.material.opacity = 0.8 * (1 - age / 1.2); } }
    if (dust && !reduce) { var dp = dust.geometry.attributes.position; for (var di = 0; di < dp.count; di++) { var ny = dp.getY(di) + dt * 0.12; if (ny > 3.2) ny = 0; dp.setY(di, ny); } dp.needsUpdate = true; }
    Object.keys(agents).forEach(function (id) {
      var a = agents[id], dx = a.tx - a.x, dz = a.tz - a.z, d = Math.hypot(dx, dz); if (d > 0.04) { var sp = Math.min(d, 3.4 * dt); a.x += dx / d * sp; a.z += dz / d * sp; }
      var walking = d > 0.15, bob = reduce ? 0 : (walking ? Math.sin(T0 / 110) * 0.07 : Math.sin(T0 / 700 + a.phase) * 0.05), wob = (!walking && a.presence === 'idle' && !reduce) ? Math.sin(T0 / 1300 + a.z) * 0.25 : 0;
      a.obj.position.set(a.x + wob, bob, a.z); if (a.obj.userData.spin && !reduce) a.obj.userData.spin.rotation.z += dt * 1.6; if (!reduce) a.obj.userData.body.rotation.y += dt * (a.look.form === 'orb' ? 0.4 : 0.9);
      if (a.obj.userData.glow) a.obj.userData.glow.material.opacity = (0.45 + (a.presence === 'working' && !reduce ? Math.sin(T0 / 160) * 0.15 : 0)) * a.look.glow;
      var bw = a.presence === 'working' && STATIONS[a.st] && a.st !== 'office'; a.beam.visible = bw; if (bw) { var s2 = STATIONS[a.st], pa = a.beam.geometry.attributes.position; pa.setXYZ(0, a.x, 1.0, a.z); pa.setXYZ(1, s2.x, 1.35, s2.z); pa.needsUpdate = true; a.beam.material.opacity = 0.55 + Math.sin(T0 / 120) * 0.25; }
    });
    camUpdate(dt); renderer.render(scene, camera); projectHolos();
  }

  /* ── input ── */
  function onKey(e, down) { if (!running) return; var tg = e.target && e.target.tagName; if (tg === 'INPUT' || tg === 'TEXTAREA' || tg === 'SELECT') return; var k = e.key.toLowerCase(); if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].indexOf(k) > -1) { keys[k] = down; if (card.offsetParent || full) e.preventDefault(); } if (down && k === 'e' && nearKey) STATIONS[nearKey].open(); if (down && k === 'escape') exitFull(); }
  function pick(e, click) {
    var r = renderer.domElement.getBoundingClientRect(), ndc = new T.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), ray = new T.Raycaster(); ray.setFromCamera(ndc, camera);
    var objs = []; Object.keys(stationObjs).forEach(function (k) { if (k !== '_floor' && k !== 'office') objs.push(stationObjs[k]); }); posterMeshes.forEach(function (m) { objs.push(m); });
    var hits = ray.intersectObjects(objs, true), key = null, poster = null; if (hits.length) { var o = hits[0].object; while (o && !(o.userData && (o.userData.key || o.userData.poster !== undefined))) o = o.parent; if (o) { key = o.userData.key || null; poster = o.userData.poster !== undefined ? o.userData.poster : null; } }
    if (poster !== null) { if (click) uploadPoster(poster); return 'poster'; }
    if (key) { if (click) goStation(key); return key; }
    var ah = null; Object.keys(agents).forEach(function (id) { var a = agents[id], v = new T.Vector3(a.x, 1, a.z).project(camera), sx = (v.x * 0.5 + 0.5) * r.width, sy = (-v.y * 0.5 + 0.5) * r.height; if (Math.hypot(sx - (e.clientX - r.left), sy - (e.clientY - r.top)) < 30) ah = id; });
    if (ah) { if (click) selectAgent(ah); return 'agent'; }
    var fh = ray.intersectObject(stationObjs._floor); if (fh.length && click) { follow = null; target = { x: fh[0].point.x, z: fh[0].point.z }; pending = null; } return null;
  }
  var drag = null;
  function bindInput() {
    var cv = renderer.domElement; cv.style.touchAction = 'none';
    cv.addEventListener('pointerdown', function (e) { drag = { x: e.clientX, yaw: yaw, moved: false }; try { cv.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ } });
    cv.addEventListener('pointermove', function (e) { if (drag) { var dx = e.clientX - drag.x; if (Math.abs(dx) > 4) drag.moved = true; if (drag.moved) yaw = Math.max(-0.9, Math.min(0.9, drag.yaw - dx * 0.006)); } else { var k = pick(e, false); cv.style.cursor = k ? 'pointer' : 'default'; focus = (k && STATIONS[k]) ? k : null; } });
    cv.addEventListener('pointerup', function (e) { var was = drag; drag = null; if (was && !was.moved) pick(e, true); });
    cv.addEventListener('wheel', function (e) { e.preventDefault(); dist = Math.max(10, Math.min(32, dist + e.deltaY * 0.012)); }, { passive: false });
  }
  document.addEventListener('keydown', function (e) { onKey(e, true); }); document.addEventListener('keyup', function (e) { onKey(e, false); });

  /* ── posters: resized on this device, never uploaded anywhere ── */
  function uploadPoster(slot) {
    var inp = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp', style: 'display:none' }); document.body.appendChild(inp);
    inp.addEventListener('change', function () {
      var f = inp.files && inp.files[0]; inp.remove(); if (!f) return; if (f.size > 8 * 1024 * 1024) { toast('That image is too large (max 8 MB)'); return; }
      var img = new Image(), url = URL.createObjectURL(f); img.onload = function () { var cv = document.createElement('canvas'), s = Math.min(1, 512 / Math.max(img.width, img.height)); cv.width = Math.max(1, Math.round(img.width * s)); cv.height = Math.max(1, Math.round(img.height * s)); cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height); URL.revokeObjectURL(url); room.posters[slot] = cv.toDataURL('image/jpeg', 0.82); saveRoom(); rebuildRoom(); toast('Poster placed'); }; img.onerror = function () { URL.revokeObjectURL(url); toast('That file is not a usable image'); }; img.src = url;
    }); inp.click();
  }

  /* ── crew chips, agent look panel, room panel, navi menu ── */
  function renderList() { if (!listEl) return; listEl.textContent = ''; Object.keys(agents).forEach(function (id) { var a = agents[id]; listEl.appendChild(h('div', { class: 'o3-agent' + (sel === id ? ' on' : '') }, [h('button', { type: 'button', class: 'o3-agentb', onclick: function () { selectAgent(id); } }, [h('i', { style: 'background:linear-gradient(180deg,' + a.look.c1 + ',' + a.look.c2 + ')' }), h('b', { text: a.name }), h('span', { text: a.presence === 'idle' ? (a.kind === 'bot' ? 'bot · idle' : 'idle') : bubbleText(a) })]), h('button', { type: 'button', class: 'o3-follow' + (follow === id ? ' on' : ''), title: 'Follow with the camera', text: follow === id ? 'Following' : 'Follow', onclick: function () { follow = follow === id ? null : id; renderList(); } })])); }); }
  function selectAgent(id) { sel = id; renderList(); drawPanel(); }
  function closePanel() { sel = null; panel.style.display = 'none'; panel.textContent = ''; renderList(); }
  function drawPanel() {
    panel.textContent = ''; var a = agents[sel]; if (!a) { panel.style.display = 'none'; return; } panel.style.display = 'flex'; var L = JSON.parse(JSON.stringify(a.look)), op = ops.filter(function (o) { return o.id === a.id; })[0];
    function apply() { a.look = sane(L, a.id); a.sig = JSON.stringify(a.look); scene.remove(a.obj); disposeObj(a.obj); a.beam.material.color.set(a.look.c1); a.obj = buildBody(a, a.look); a.obj.position.set(a.x, 0, a.z); scene.add(a.obj); a._bt = null; setBubble(a); renderList(); }
    panel.appendChild(h('div', { class: 'o3-ph' }, [h('b', { text: a.name }), h('button', { type: 'button', class: 'o3-x', 'aria-label': 'Close', text: '×', onclick: closePanel })]));
    var formRow = h('div', { class: 'o3-row' }), accRow = h('div', { class: 'o3-row' }), gradRow = h('div', { class: 'o3-row' });
    FORMS.forEach(function (f) { formRow.appendChild(h('button', { type: 'button', class: 'o3-pill' + (L.form === f ? ' on' : ''), text: f === 'orb' ? 'Orb' : f === 'crystal' ? 'Crystal' : 'Figure', onclick: function (e) { L.form = f; apply(); formRow.querySelectorAll('.o3-pill').forEach(function (x) { x.classList.toggle('on', x === e.target); }); } })); });
    ACCS.forEach(function (c) { accRow.appendChild(h('button', { type: 'button', class: 'o3-pill' + (L.acc === c ? ' on' : ''), text: c === 'none' ? 'None' : c[0].toUpperCase() + c.slice(1), onclick: function (e) { L.acc = c; apply(); accRow.querySelectorAll('.o3-pill').forEach(function (x) { x.classList.toggle('on', x === e.target); }); } })); });
    var c1 = h('input', { type: 'color', value: L.c1, 'aria-label': 'Top colour' }), c2 = h('input', { type: 'color', value: L.c2, 'aria-label': 'Bottom colour' }); c1.addEventListener('input', function () { L.c1 = c1.value; apply(); }); c2.addEventListener('input', function () { L.c2 = c2.value; apply(); });
    GRADS.forEach(function (g) { gradRow.appendChild(h('button', { type: 'button', class: 'o3-sw', 'aria-label': 'Gradient ' + g[0] + ' to ' + g[1], style: 'background:linear-gradient(135deg,' + g[0] + ',' + g[1] + ')', onclick: function () { L.c1 = g[0]; L.c2 = g[1]; c1.value = g[0]; c2.value = g[1]; apply(); } })); });
    var glow = h('input', { type: 'range', min: '40', max: '160', value: String(Math.round(L.glow * 100)), 'aria-label': 'Glow', class: 'o3-range' }); glow.addEventListener('input', function () { L.glow = glow.value / 100; apply(); });
    panel.appendChild(h('div', { class: 'o3-sec' }, [h('div', { class: 'o3-lbl', text: 'Form' }), formRow, h('div', { class: 'o3-note', text: 'Crystal and Figure are upgrade forms: preview now, unlock with Sparks later.' })]));
    panel.appendChild(h('div', { class: 'o3-sec' }, [h('div', { class: 'o3-lbl', text: 'Gradient' }), gradRow, h('div', { class: 'o3-row' }, [c1, c2])]));
    panel.appendChild(h('div', { class: 'o3-sec' }, [h('div', { class: 'o3-lbl', text: 'Accessory' }), accRow])); panel.appendChild(h('div', { class: 'o3-sec' }, [h('div', { class: 'o3-lbl', text: 'Glow' }), glow]));
    var status = h('div', { class: 'o3-note' });
    panel.appendChild(h('div', { class: 'o3-row' }, [h('button', { type: 'button', class: 'o3-btn', text: 'Save look', onclick: function () { var look = sane(L, a.id); try { localStorage.setItem('shd_orb_' + a.id, JSON.stringify(look)); } catch (e) { /* ignore */ }
      if (op) { api('PATCH', '/api/operatives/' + encodeURIComponent(op.id), { look: Object.assign({}, op.look || {}, { orb: look }) }).then(function (d) { if (d.ok) { op.look = (d.operative && d.operative.look) || Object.assign({}, op.look || {}, { orb: look }); status.textContent = 'Saved. Your 3D world reads this look too.'; } else status.textContent = 'Saved on this device. Could not save to your agent (' + (d.error || d._s) + ').'; }); } else status.textContent = 'Saved on this device (outside bots and council agents keep their look locally).'; } }),
      h('button', { type: 'button', class: 'o3-btn ghost', text: 'Reset', onclick: function () { try { localStorage.removeItem('shd_orb_' + a.id); } catch (e) { /* ignore */ } L = defaultLook(a.id); apply(); drawPanel(); } })])); panel.appendChild(status);
    if (op && window.shdGlow && window.shdGlow.importToWorld) panel.appendChild(h('div', { class: 'o3-sec' }, [h('div', { class: 'o3-lbl', text: '3D realm' }), h('button', { type: 'button', class: 'o3-btn', text: 'Import to the 3D realm', onclick: function () { window.shdGlow.importToWorld(op); } }), h('div', { class: 'o3-note', text: 'Pick the agent body it wears in the 3D realm. Its glow body stays here.' })]));
  }
  function roomPanel() {
    sel = null; renderList(); panel.textContent = ''; panel.style.display = 'flex';
    panel.appendChild(h('div', { class: 'o3-ph' }, [h('b', { text: 'Room' }), h('button', { type: 'button', class: 'o3-x', 'aria-label': 'Close', text: '×', onclick: closePanel })]));
    var tr = h('div', { class: 'o3-row' }); Object.keys(THEMES).forEach(function (k) { tr.appendChild(h('button', { type: 'button', class: 'o3-pill' + (themeKey === k ? ' on' : ''), text: THEMES[k].name, onclick: function (e) { themeKey = k; saveRoom(); rebuildRoom(); tr.querySelectorAll('.o3-pill').forEach(function (x) { x.classList.toggle('on', x === e.target); }); } })); });
    panel.appendChild(h('div', { class: 'o3-sec' }, [h('div', { class: 'o3-lbl', text: 'Theme' }), tr]));
    var pr = h('div', { class: 'o3-row' }); POSTER_SLOTS.forEach(function (ps, i) { pr.appendChild(h('button', { type: 'button', class: 'o3-pill' + (room.posters[i] ? ' on' : ''), text: 'Poster ' + (i + 1), onclick: function () { uploadPoster(i); } })); if (room.posters[i]) pr.appendChild(h('button', { type: 'button', class: 'o3-pill', 'aria-label': 'Remove poster ' + (i + 1), text: '×', onclick: function () { room.posters[i] = null; saveRoom(); rebuildRoom(); roomPanel(); } })); });
    panel.appendChild(h('div', { class: 'o3-sec' }, [h('div', { class: 'o3-lbl', text: 'Posters' }), pr, h('div', { class: 'o3-note', text: 'Pick a frame, or click a frame on the wall. Images are resized and kept on this device for now. Syncing them to your office in the 3D world comes later.' })]));
    panel.appendChild(h('div', { class: 'o3-row' }, [h('button', { type: 'button', class: 'o3-btn ghost', text: 'Reset room', onclick: function () { room = { theme: 'neon', posters: [null, null, null, null] }; themeKey = 'neon'; saveRoom(); rebuildRoom(); roomPanel(); } })]));
  }
  function naviMenu() { var m = card.querySelector('.o3-navi'); if (m) { m.remove(); return; } var box = h('div', { class: 'o3-navi' }, [h('div', { class: 'o3-ph' }, [h('b', { text: 'Navi' }), h('button', { type: 'button', class: 'o3-x', 'aria-label': 'Close', text: '×', onclick: function () { box.remove(); } })]), h('div', { class: 'o3-note', text: 'Your guide lives in the 3D world. Pick a module to open it there.' })]); NAVI.forEach(function (n) { box.appendChild(h('button', { type: 'button', class: 'o3-pill', text: n[1], onclick: function () { exitFull(); if (window.enter3DWorld) window.enter3DWorld({ navi: n[0] }); } })); }); host.parentNode.appendChild(box); }
  function setQBtn() { if (qBtn) qBtn.textContent = 'Quality: ' + (quality === 'high' ? 'High' : 'Low'); }
  function toggleQuality() { quality = quality === 'high' ? 'low' : 'high'; try { localStorage.setItem('shd_o3_q', quality); } catch (e) { /* ignore */ } renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, quality === 'low' ? 1 : 2)); buildDust(); size(); setQBtn(); }
  function record() {
    if (rec) return; var cv = renderer && renderer.domElement; if (!cv || !cv.captureStream || !window.MediaRecorder) { toast('Recording is not supported in this browser'); return; }
    var mime = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].filter(function (m) { return MediaRecorder.isTypeSupported(m); })[0]; if (!mime) { toast('Recording is not supported in this browser'); return; }
    var chunks = [], mr = new MediaRecorder(cv.captureStream(30), { mimeType: mime, videoBitsPerSecond: 2500000 }); rec = mr; recBtn.textContent = 'Recording…'; recBtn.disabled = true; mr.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
    mr.onstop = function () { rec = null; recBtn.disabled = false; recBtn.textContent = 'Record 10s'; var a = h('a', { href: URL.createObjectURL(new Blob(chunks, { type: 'video/webm' })), download: 'my-shaddai-office.webm' }); document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 800); toast('Clip saved to your downloads'); };
    mr.start(); setTimeout(function () { if (mr.state !== 'inactive') mr.stop(); }, 10000);
  }
  function toggleFull() { full = !full; card.classList.toggle('o3-full', full); document.body.style.overflow = full ? 'hidden' : ''; size(); }
  function exitFull() { if (full) toggleFull(); }

  /* ── mount / open / close ── */
  function mount() {
    var view = document.getElementById('officeView'); if (!view || document.getElementById('shdOffice3d') || legacy()) return; loadRoom();
    var intro = h('div', { class: 'o3-intro' }, [h('b', { text: 'MY 3D OFFICE' }), h('span', { text: 'your holographic command room · watch agents and bots work live · restyle it' }), h('button', { type: 'button', class: 'o3-btn', text: 'Open 3D office', onclick: open })]);
    host = h('div', { class: 'o3-host', style: 'display:none' }); holoLayer = h('div', { class: 'o3-holos' }); prompt = h('div', { class: 'o3-prompt', style: 'display:none' }); listEl = h('div', { class: 'o3-list' }); panel = h('div', { class: 'o3-panel', style: 'display:none' }); dock = h('div', { class: 'o3-dock' });
    qBtn = h('button', { type: 'button', class: 'o3-btn ghost', onclick: toggleQuality }); recBtn = h('button', { type: 'button', class: 'o3-btn ghost', text: 'Record 10s', onclick: record });
    hud = h('div', { class: 'o3-hud' }, [h('button', { type: 'button', class: 'o3-btn ghost', text: 'Room', onclick: roomPanel }), h('button', { type: 'button', class: 'o3-btn ghost', text: 'Navi', onclick: naviMenu }), qBtn, recBtn, h('button', { type: 'button', class: 'o3-btn ghost', text: 'Spectate world', onclick: function () { exitFull(); worldsTab('arena'); } }), h('button', { type: 'button', class: 'o3-btn ghost', text: 'Full screen', onclick: toggleFull }), h('button', { type: 'button', class: 'o3-btn ghost', text: 'Close', onclick: close })]);
    // phones keep only Room / Full screen / Close in the scene; the rest appear in full screen (the dock handles navigation)
    [].slice.call(hud.children).forEach(function (b) { if (['Room', 'Full screen', 'Close'].indexOf(b.textContent) < 0) b.classList.add('o3-adv'); });
    var cmdIn = h('input', { class: 'o3-cmdin', type: 'text', placeholder: 'Say it: price btc · news · research mangroves', 'aria-label': 'Command', maxlength: '160' }), cmd = h('div', { class: 'o3-cmd' }, [cmdIn, h('button', { type: 'button', class: 'o3-btn', text: 'Go', onclick: function () { var v = cmdIn.value.trim(); if (v) { say(v); cmdIn.value = ''; } } })]);
    cmdIn.addEventListener('keydown', function (e) { if (e.key === 'Enter') { var v = cmdIn.value.trim(); if (v) { say(v); cmdIn.value = ''; } } e.stopPropagation(); });
    var stage = h('div', { class: 'o3-stage' }, [host, holoLayer, prompt, hud, panel, cmd, dock, h('div', { class: 'o3-help', text: 'WASD / arrows move · click a desk or a holo tab · drag to turn · wheel to zoom · E to use' })]);
    card = h('section', { id: 'shdOffice3d', class: 'o3-card' }, [intro, stage, listEl]); stage.style.display = 'none'; card._stage = stage; card._intro = intro; view.insertBefore(card, view.firstChild);
  }
  function open() {
    var ib = card._intro.querySelector('button'); ib.disabled = true; ib.textContent = 'Loading…';
    import('/vendor/three/three.module.js').then(function (m) {
      T = m; _v = new T.Vector3(); try { renderer = new T.WebGLRenderer({ antialias: window.innerWidth > 700, alpha: false }); } catch (e) { throw new Error('WebGL is not available in this browser'); }
      try { quality = localStorage.getItem('shd_o3_q') || ((window.innerWidth < 700 || reduce) ? 'low' : 'high'); } catch (e) { /* ignore */ }
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, quality === 'low' ? 1 : (window.innerWidth < 700 ? 1.5 : 2))); host.style.display = 'block'; card._stage.style.display = 'block'; card._intro.style.display = 'none'; host.appendChild(renderer.domElement);
      card.style.setProperty('--o3a', th().accent); dist = window.innerWidth < 700 ? 22 : 17.5; player = null; buildScene(); buildDust(); buildHolos(); buildDock(); size(); bindInput(); setQBtn(); running = true; lastT = performance.now(); pollCity(); poll = setInterval(pollCity, 2000); raf = requestAnimationFrame(frame);
    }).catch(function (e) { ib.disabled = false; ib.textContent = 'Open 3D office'; toast('3D office unavailable: ' + (e && e.message || e)); });
  }
  function close() {
    exitFull(); running = false; clearInterval(poll); cancelAnimationFrame(raf); if (rec && rec.state !== 'inactive') { try { rec.stop(); } catch (e) { /* ignore */ } }
    Object.keys(agents).forEach(function (k) { disposeObj(agents[k].obj); disposeObj(agents[k].beam); }); if (scene) disposeObj(scene); if (renderer) { try { renderer.dispose(); renderer.domElement.remove(); } catch (e) { /* ignore */ } renderer = null; }
    pulses = []; dust = null; agents = {}; sel = null; follow = null; holos = {}; holoLayer.textContent = ''; dock.textContent = ''; listEl.textContent = ''; panel.style.display = 'none'; var m = card.querySelector('.o3-navi'); if (m) m.remove();
    card._stage.style.display = 'none'; card._intro.style.display = ''; var b = card._intro.querySelector('button'); b.disabled = false; b.textContent = 'Open 3D office'; host.style.display = 'none'; labelCache = {};
  }
  window.addEventListener('resize', function () { if (running) size(); });
  document.addEventListener('visibilitychange', function () { if (!document.hidden && running) pollCity(); });
  function wrap() { var sv = window.showView; if (typeof sv !== 'function' || sv._o3) return; window.showView = function (v) { var r = sv.apply(this, arguments); if (v === 'office') setTimeout(mount, 60); return r; }; window.showView._o3 = true; }
  wrap(); window.addEventListener('load', function () { wrap(); setTimeout(wrap, 700); setTimeout(mount, 1200); });
  window.shdOffice3d = { open: open, close: close, mount: mount, _agents: function () { return agents; }, _player: function () { return player; }, _holos: function () { return holos; }, _theme: function () { return themeKey; }, themes: THEMES, stations: STATIONS };
})();
