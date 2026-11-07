/* SHADDAI V119 — MINI 3D OFFICE (Office tab). Your own small room: walk around, see your forged agents and outside bots as glowing
   orbs walk to the desks they are using RIGHT NOW (live from /api/bridge/city), customize them (form, gradient, light accessories),
   and walk up to a desk to open the real dashboard panel (Market, Library, Gallery, Wallet, Skills, Tasks, Plots) or Navi in the 3D world.
   The scene only DRAWS server state; no bot code runs here. Orb looks are saved on the agent (operative.look.orb) so the 3D world can read them.
   Wallets/PayBox open the existing Wallet tab; nothing here moves money. Restore the old Office: localStorage.shd_legacy_nav = '1'. */
(function () {
  'use strict';
  var legacy = function () { return document.documentElement.classList.contains('shd-legacy-nav'); };
  var STATIONS = {
    office:    { x: 0,    z: 0.6,  label: 'Home',      open: null },
    market:    { x: -5,   z: -3.5, label: 'Market',    open: function () { showView('pipeline'); } },
    library:   { x: 0,    z: -4.6, label: 'Library',   open: function () { officeTab('library'); } },
    garden:    { x: 5,    z: -3.5, label: 'Plots',     open: function () { worldsTab('plots'); } },
    athenaeum: { x: -5,   z: 3.4,  label: 'Athenaeum', open: function () { worldsTab('athenaeum'); } },
    workshop:  { x: 5,    z: 3.4,  label: 'Skills',    open: function () { officeTab('skills'); } },
    wallet:    { x: -7.0, z: 0.2,  label: 'Wallet',    open: function () { showView('wallet'); } },
    gallery:   { x: 7.0,  z: 0.2,  label: 'Gallery',   open: function () { officeTab('gallery'); } },
    navi:      { x: 0,    z: 4.9,  label: 'Navi',      open: function () { naviMenu(); } }
  };
  var FORMS = ['orb', 'crystal', 'figure'];
  var ACCS = ['none', 'halo', 'ring', 'hat', 'antenna', 'crown'];
  var GRADS = [['#00e5a0', '#00b4ff'], ['#a78bfa', '#f43f5e'], ['#f0b429', '#fb923c'], ['#00f0ff', '#7c3aed'], ['#ffffff', '#60a5fa'], ['#34d399', '#fde047']];
  var NAVI = [['map', 'Map'], ['inv', 'Inventory'], ['bots', 'Bots'], ['wallet', 'Wallet'], ['academy', 'Academy'], ['market', 'Market'], ['chat', 'Chat'], ['settings', 'Settings']];
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var T = null, card, host, hud, panel, prompt, renderer, scene, camera, raf = 0, running = false, W = 0, H = 0, loadErr = null;
  var agents = {}, ops = [], player, nearKey = null, simT = 0, camX = 0, camZ = 1.2, camYaw = 0, quality = 'high', dust = null, pulses = [], rec = null, keys = {}, target = null, pending = null, yaw = 0.0, dist = 15, poll = null, lastT = 0, labelCache = {}, full = false, sel = null;
  var stationObjs = {};

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

  /* ── look: form, gradient, accessory, glow ── */
  function defaultLook(id) { var g = GRADS[hueOf(String(id))]; return { form: 'orb', c1: g[0], c2: g[1], acc: 'none', glow: 1 }; }
  function sane(l, id) { var d = defaultLook(id), o = l && typeof l === 'object' ? l : {}; var hex = /^#[0-9a-fA-F]{6}$/;
    return { form: FORMS.indexOf(o.form) > -1 ? o.form : d.form, c1: hex.test(o.c1) ? o.c1 : d.c1, c2: hex.test(o.c2) ? o.c2 : d.c2, acc: ACCS.indexOf(o.acc) > -1 ? o.acc : 'none', glow: Math.min(1.6, Math.max(0.4, +o.glow || 1)) }; }
  function lookOf(a) {
    var op = ops.filter(function (o) { return o.id === a.id; })[0], fromOp = op && op.look && op.look.orb;
    var local = null; try { local = JSON.parse(localStorage.getItem('shd_orb_' + a.id) || 'null'); } catch (e) { /* ignore */ }
    return sane(fromOp || local, a.id);
  }
  function gradGeo(geo, c1, c2) {
    var pos = geo.attributes.position, n = pos.count, col = new Float32Array(n * 3), a = new T.Color(c1), b = new T.Color(c2), tmp = new T.Color(), minY = 1e9, maxY = -1e9, i;
    for (i = 0; i < n; i++) { var y = pos.getY(i); if (y < minY) minY = y; if (y > maxY) maxY = y; }
    for (i = 0; i < n; i++) { tmp.copy(a).lerp(b, (pos.getY(i) - minY) / Math.max(0.0001, maxY - minY)); col[i * 3] = tmp.r; col[i * 3 + 1] = tmp.g; col[i * 3 + 2] = tmp.b; }
    geo.setAttribute('color', new T.BufferAttribute(col, 3)); return geo;
  }
  function glowTex(c) {
    var k = 'g' + c; if (labelCache[k]) return labelCache[k]; var cv = document.createElement('canvas'); cv.width = cv.height = 128; var x = cv.getContext('2d'), g = x.createRadialGradient(64, 64, 4, 64, 64, 62);
    g.addColorStop(0, c); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(0, 0, 128, 128); return (labelCache[k] = new T.CanvasTexture(cv));
  }
  function textSprite(text, opt) {
    opt = opt || {};
    var cv = document.createElement('canvas'), x = cv.getContext('2d'); x.font = '700 ' + (opt.size || 26) + 'px sans-serif'; var w = Math.ceil(x.measureText(text).width) + 28; cv.width = w; cv.height = 44; x = cv.getContext('2d'); x.font = '700 ' + (opt.size || 26) + 'px sans-serif';
    if (opt.bg) { x.fillStyle = 'rgba(8,14,26,.88)'; x.strokeStyle = opt.color || '#00e5a0'; x.lineWidth = 2; x.beginPath(); if (x.roundRect) x.roundRect(1, 1, w - 2, 42, 18); else x.rect(1, 1, w - 2, 42); x.fill(); x.stroke(); }
    x.fillStyle = opt.color || '#e8eefc'; x.textBaseline = 'middle'; x.fillText(text, 14, 23);
    var tex = new T.CanvasTexture(cv), sp = new T.Sprite(new T.SpriteMaterial({ map: tex, transparent: true, depthTest: false })); sp.scale.set(w / 70, 44 / 70, 1); sp.renderOrder = 10; return sp;
  }

  // Free GPU memory (geometries, materials, text/glow textures) whenever something is rebuilt or removed: long sessions must not leak.
  function disposeObj(o) { if (!o) return; o.traverse(function (n) { if (n.geometry) n.geometry.dispose(); if (n.material) { (Array.isArray(n.material) ? n.material : [n.material]).forEach(function (m) { if (m.map) m.map.dispose(); m.dispose(); }); } }); }
  // One pooled line per agent (positions updated in place); nothing is allocated per frame.
  function makeBeam(c) { var g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(new Float32Array(6), 3)); var l = new T.Line(g, new T.LineBasicMaterial({ color: new T.Color(c), transparent: true, opacity: 0.6 })); l.frustumCulled = false; l.visible = false; return l; }
  function pulse(s, c) { if (!s || reduce || !scene) return; var m = new T.Mesh(new T.RingGeometry(0.6, 0.7, 40), new T.MeshBasicMaterial({ color: new T.Color(c), transparent: true, opacity: 0.8, side: T.DoubleSide })); m.rotation.x = -Math.PI / 2; m.position.set(s.x, 0.04, s.z); scene.add(m); pulses.push({ m: m, t0: simT }); }
  function buildDust() {
    if (dust) { scene.remove(dust); disposeObj(dust); dust = null; } if (quality !== 'high' || reduce) return;
    var n = 90, pos = new Float32Array(n * 3); for (var i = 0; i < n; i++) { pos[i * 3] = (Math.random() - 0.5) * 17; pos[i * 3 + 1] = Math.random() * 3.2; pos[i * 3 + 2] = (Math.random() - 0.5) * 12; }
    var g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(pos, 3)); dust = new T.Points(g, new T.PointsMaterial({ color: 0x7fe9d0, size: 0.05, transparent: true, opacity: 0.5, depthWrite: false, blending: T.AdditiveBlending })); scene.add(dust);
  }

  function buildBody(a, look) {
    var g = new T.Group(), body = new T.Group(); g.add(body); g.userData.body = body;
    var mat = new T.MeshBasicMaterial({ vertexColors: true });
    var core;
    if (look.form === 'crystal') { var og = new T.OctahedronGeometry(0.55, 0); og.scale(1, 1.35, 1); core = new T.Mesh(gradGeo(og, look.c1, look.c2), mat); core.position.y = 0.95; body.add(core); }
    else if (look.form === 'figure') { var bg = new T.CapsuleGeometry(0.26, 0.5, 6, 14); var torso = new T.Mesh(gradGeo(bg, look.c1, look.c2), mat); torso.position.y = 0.75; body.add(torso); var hd = new T.Mesh(gradGeo(new T.SphereGeometry(0.22, 18, 14), look.c2, look.c1), mat); hd.position.y = 1.4; body.add(hd); core = hd; }
    else { core = new T.Mesh(gradGeo(new T.SphereGeometry(0.46, 28, 18), look.c1, look.c2), mat); core.position.y = 0.95; body.add(core); }
    var top = look.form === 'figure' ? 1.4 : look.form === 'crystal' ? 1.72 : 1.44;
    var am = new T.MeshBasicMaterial({ color: look.c2 }), ac;
    if (look.acc === 'halo') { ac = new T.Mesh(new T.TorusGeometry(0.3, 0.035, 8, 32), am); ac.rotation.x = Math.PI / 2; ac.position.y = top + 0.28; }
    else if (look.acc === 'ring') { ac = new T.Mesh(new T.TorusGeometry(0.62, 0.03, 8, 40), am); ac.rotation.x = Math.PI / 2.3; ac.position.y = 0.95; g.userData.spin = ac; }
    else if (look.acc === 'hat') { ac = new T.Mesh(new T.ConeGeometry(0.26, 0.5, 18), am); ac.position.y = top + 0.3; }
    else if (look.acc === 'antenna') { ac = new T.Group(); var st = new T.Mesh(new T.CylinderGeometry(0.015, 0.015, 0.5, 6), am); st.position.y = 0.25; var tip = new T.Mesh(new T.SphereGeometry(0.06, 10, 8), am); tip.position.y = 0.52; ac.add(st); ac.add(tip); ac.position.y = top + 0.05; }
    else if (look.acc === 'crown') { ac = new T.Group(); for (var i = 0; i < 5; i++) { var sp = new T.Mesh(new T.ConeGeometry(0.06, 0.2, 6), am); var an = i / 5 * Math.PI * 2; sp.position.set(Math.cos(an) * 0.2, 0.1, Math.sin(an) * 0.2); ac.add(sp); } ac.position.y = top + 0.14; }
    if (ac) body.add(ac);
    var glow = new T.Sprite(new T.SpriteMaterial({ map: glowTex(look.c1), blending: T.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.55 * look.glow })); glow.scale.set(2.6 * look.glow, 2.6 * look.glow, 1); glow.position.y = 0.95; g.add(glow); g.userData.glow = glow;
    var shadow = new T.Mesh(new T.CircleGeometry(0.5, 20), new T.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35 })); shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.01; g.add(shadow);
    var nm = textSprite(a.name || a.id, { color: look.c1 }); nm.position.set(0, 2.45, 0); g.add(nm);
    return g;
  }
  function stationPos(st, i, n) { var s = STATIONS[st] || STATIONS.office, a = (i / Math.max(n, 1)) * Math.PI * 2 + 0.6, r = n > 1 ? 1.0 : 0; return { x: s.x + Math.cos(a) * r, z: s.z + 1.4 + Math.sin(a) * r * 0.7 }; }

  /* ── scene ── */
  function buildScene() {
    scene = new T.Scene(); scene.background = new T.Color(0x070b16); scene.fog = new T.Fog(0x070b16, 18, 38);
    camera = new T.PerspectiveCamera(48, 1, 0.1, 100);
    var floor = new T.Mesh(new T.PlaneGeometry(18, 13), new T.MeshBasicMaterial({ color: 0x0b1324 })); floor.rotation.x = -Math.PI / 2; scene.add(floor); stationObjs._floor = floor;
    var grid = new T.GridHelper(18, 18, 0x1f6f66, 0x12304a); grid.scale.z = 13 / 18; grid.position.y = 0.01; scene.add(grid);
    var trim = new T.LineSegments(new T.EdgesGeometry(new T.BoxGeometry(18, 3.2, 13)), new T.LineBasicMaterial({ color: 0x00e5a0, transparent: true, opacity: 0.55 })); trim.position.y = 1.6; scene.add(trim);
    var wallBack = new T.Mesh(new T.PlaneGeometry(18, 3.2), new T.MeshBasicMaterial({ color: 0x0c1730, transparent: true, opacity: 0.55, side: T.DoubleSide })); wallBack.position.set(0, 1.6, -6.5); scene.add(wallBack);
    Object.keys(STATIONS).forEach(function (k) {
      var s = STATIONS[k], grp = new T.Group(); grp.position.set(s.x, 0, s.z);
      if (k !== 'office') {
        var col = k === 'wallet' ? 0xf0b429 : k === 'gallery' ? 0xa78bfa : k === 'navi' ? 0x00f0ff : 0x00e5a0;
        var desk = new T.Mesh(new T.BoxGeometry(2.2, 0.7, 1.1), new T.MeshBasicMaterial({ color: 0x101a30 })); desk.position.y = 0.35; grp.add(desk);
        var top = new T.Mesh(new T.BoxGeometry(2.2, 0.06, 1.1), new T.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.85 })); top.position.y = 0.72; grp.add(top); grp.userData.top = top;
        var edge = new T.LineSegments(new T.EdgesGeometry(new T.BoxGeometry(2.2, 0.72, 1.1)), new T.LineBasicMaterial({ color: col })); edge.position.y = 0.36; grp.add(edge);
        var scr = new T.Mesh(new T.PlaneGeometry(1.5, 0.8), new T.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.22, side: T.DoubleSide })); scr.position.set(0, 1.35, -0.3); grp.add(scr);
        var lb = textSprite(s.label, { color: '#' + col.toString(16).padStart(6, '0'), bg: true }); lb.position.set(0, 2.05, 0); grp.add(lb);
        grp.userData.key = k; stationObjs[k] = grp;
      } else { var ring = new T.Mesh(new T.RingGeometry(1.0, 1.08, 40), new T.MeshBasicMaterial({ color: 0x00e5a0, transparent: true, opacity: 0.5, side: T.DoubleSide })); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.02; grp.add(ring); }
      scene.add(grp);
    });
    // you
    var pl = new T.Group(); var pc = new T.Mesh(new T.SphereGeometry(0.34, 20, 14), new T.MeshBasicMaterial({ color: 0xffffff })); pc.position.y = 0.7; pl.add(pc);
    var pg = new T.Sprite(new T.SpriteMaterial({ map: glowTex('#ffffff'), blending: T.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.6 })); pg.scale.set(2, 2, 1); pg.position.y = 0.7; pl.add(pg);
    var you = textSprite('You', { color: '#ffffff' }); you.position.y = 1.55; pl.add(you); pl.position.set(0, 0, 3); scene.add(pl); player = pl;
    var beams = new T.Group(); scene.add(beams); scene.userData.beams = beams;
  }
  function size() { if (!renderer) return; var r = host.getBoundingClientRect(); W = Math.max(280, Math.round(r.width)); H = full ? Math.round(window.innerHeight) : (W < 560 ? 320 : 420); host.style.height = H + 'px'; renderer.setSize(W, H, false); renderer.domElement.style.width = W + 'px'; renderer.domElement.style.height = H + 'px'; camera.aspect = W / H; camera.updateProjectionMatrix(); }
  function camUpdate(dt) {
    var k = 1 - Math.exp(-6 * dt), ky = 1 - Math.exp(-8 * dt), gx = player.position.x * 0.5 + (player._vx || 0) * 0.25, gz = player.position.z * 0.4 + (player._vz || 0) * 0.25;
    camX += (gx - camX) * k; camZ += (gz - camZ) * k; camYaw += (yaw - camYaw) * ky;
    camera.position.set(camX + Math.sin(camYaw) * dist * 0.55, dist * 0.62, camZ + Math.cos(camYaw) * dist * 0.78); camera.lookAt(camX, 0.6, camZ - 0.5);
  }

  /* ── live state ── */
  function pollCity() {
    if (!running || document.hidden) return;
    Promise.all([api('GET', '/api/bridge/city'), api('GET', '/api/operatives' + (uid() ? '?owner=' + encodeURIComponent(uid()) : '')).catch(function () { return {}; })]).then(function (r) {
      var d = r[0], o = r[1]; ops = (o && (o.operatives || (o.data && o.data.operatives))) || (Array.isArray(o) ? o : []);
      if (d._s === 401) { setNote('Sign in to see your agents in your office.'); return; } if (d._s >= 400 || !d.me) { setNote('Live agent view needs the bot bridge on this server.'); return; }
      setNote(d.me.length ? '' : 'No agents yet. Forge one in the 3D Forge, or connect a bot (Worlds → My Space → Outside bots).');
      var seen = {}, per = {}, idx = {}; d.me.forEach(function (m) { var st = m.station || 'office'; per[st] = (per[st] || 0) + 1; });
      d.me.forEach(function (m) {
        var st = m.presence === 'idle' || !m.station ? 'office' : m.station; idx[st] = idx[st] || 0; var p = stationPos(st, idx[st]++, per[st] || 1), a = agents[m.id], lk = lookOf(m);
        if (!a) { a = agents[m.id] = { id: m.id, name: m.name, kind: m.kind, x: STATIONS.office.x, z: STATIONS.office.z + 1.4, look: lk, sig: JSON.stringify(lk), phase: hueOf(String(m.id)) * 1.3 }; a.obj = buildBody(a, lk); a.obj.position.set(a.x, 0, a.z); scene.add(a.obj); a.beam = makeBeam(lk.c1); scene.add(a.beam); }
        if (a.sig !== JSON.stringify(lk)) { scene.remove(a.obj); disposeObj(a.obj); a.look = lk; a.sig = JSON.stringify(lk); a.obj = buildBody(a, lk); a.obj.position.set(a.x, 0, a.z); scene.add(a.obj); a._bt = null; a.beam.material.color.set(lk.c1); }
        var wasWork = a.presence === 'working'; a.name = m.name; a.kind = m.kind; a.presence = m.presence; if (m.presence === 'working' && !wasWork) pulse(STATIONS[st], a.look.c1); a.step = m.step; a.st = st; a.tx = p.x; a.tz = p.z; seen[m.id] = 1; setBubble(a);
      });
      Object.keys(agents).forEach(function (k) { if (!seen[k]) { scene.remove(agents[k].obj); disposeObj(agents[k].obj); scene.remove(agents[k].beam); disposeObj(agents[k].beam); delete agents[k]; } });
      renderList();
    }).catch(function () { setNote('Could not reach the server.'); });
  }
  function bubbleText(a) { var p = a.presence; if (p === 'working') return String(a.step || 'working').replace(/^\d+\.\s*/, '').replace(/^price:/, 'price ').replace(/_/g, ' '); if (p === 'awaiting_approval') return 'waiting for you'; if (p === 'celebrating') return 'done'; if (p === 'failed') return 'failed'; return ''; }
  function setBubble(a) {
    var t = bubbleText(a); if (a._bt === t) return; a._bt = t; if (a._bub) { a.obj.remove(a._bub); a._bub = null; }
    if (t) { a._bub = textSprite(t.length > 26 ? t.slice(0, 25) + '…' : t, { color: a.presence === 'failed' ? '#ff5a6a' : a.presence === 'awaiting_approval' ? '#e8c45c' : '#e8eefc', bg: true, size: 22 }); a._bub.position.set(0, 2.95, 0); a.obj.add(a._bub); }
  }
  function setNote(t) { if (prompt) { prompt.textContent = t; prompt.style.display = t ? 'block' : 'none'; } }

  /* ── loop ── */
  function frame(t) {
    if (!running) return; raf = requestAnimationFrame(frame); if (!card.offsetParent && !full) return; var dt = Math.min(0.05, (t - lastT) / 1000 || 0.016); lastT = t; simT += dt; var T0 = simT * 1000;
    var mx = (keys.d || keys.arrowright ? 1 : 0) - (keys.a || keys.arrowleft ? 1 : 0), mz = (keys.s || keys.arrowdown ? 1 : 0) - (keys.w || keys.arrowup ? 1 : 0);
    player._vx = 0; player._vz = 0;
    if (mx || mz) { target = null; pending = null; var c = Math.cos(yaw), s = Math.sin(yaw); var vx = mx * c + mz * s, vz = -mx * s + mz * c, len = Math.hypot(vx, vz) || 1; player.position.x += vx / len * 5 * dt; player.position.z += vz / len * 5 * dt; player._vx = vx / len * 5; player._vz = vz / len * 5; }
    else if (target) { var dx = target.x - player.position.x, dz = target.z - player.position.z, d = Math.hypot(dx, dz); if (d < 0.2) { target = null; if (pending) { var f = pending; pending = null; f(); } } else { player.position.x += dx / d * Math.min(d, 5 * dt); player.position.z += dz / d * Math.min(d, 5 * dt); player._vx = dx / d * 5; player._vz = dz / d * 5; } }
    player.position.x = Math.max(-8.4, Math.min(8.4, player.position.x)); player.position.z = Math.max(-6, Math.min(6, player.position.z));
    var near = null, nd = 2.0; Object.keys(STATIONS).forEach(function (k) { if (k === 'office') return; var s = STATIONS[k], d = Math.hypot(s.x - player.position.x, s.z + 0.6 - player.position.z); if (d < nd) { nd = d; near = k; } });
    if (near !== nearKey) { nearKey = near; if (near) setNote('Press E or click to open ' + STATIONS[near].label); else setNote(Object.keys(agents).length ? '' : prompt && prompt.textContent); }
    Object.keys(stationObjs).forEach(function (k) { var o = stationObjs[k]; if (o.userData && o.userData.top) { var busy = Object.keys(agents).some(function (id) { return agents[id].presence === 'working' && agents[id].st === k; }); o.userData.top.material.opacity = busy ? 0.7 + Math.sin(T0 / 150) * 0.3 : (near === k ? 1 : 0.8); } });
    for (var pi = pulses.length - 1; pi >= 0; pi--) { var pu = pulses[pi], age = simT - pu.t0; if (age > 1.2) { scene.remove(pu.m); disposeObj(pu.m); pulses.splice(pi, 1); } else { var sc = 1 + age * 2.2; pu.m.scale.set(sc, sc, 1); pu.m.material.opacity = 0.8 * (1 - age / 1.2); } }
    if (dust && !reduce) { var dp = dust.geometry.attributes.position; for (var di = 0; di < dp.count; di++) { var ny = dp.getY(di) + dt * 0.12; if (ny > 3.2) ny = 0; dp.setY(di, ny); } dp.needsUpdate = true; }
    Object.keys(agents).forEach(function (id) {
      var a = agents[id], dx = a.tx - a.x, dz = a.tz - a.z, d = Math.hypot(dx, dz); if (d > 0.04) { var sp = Math.min(d, 3.4 * dt); a.x += dx / d * sp; a.z += dz / d * sp; }
      var walking = d > 0.15, bob = reduce ? 0 : (walking ? Math.sin(T0 / 110) * 0.07 : Math.sin(T0 / 700 + a.phase) * 0.05), wob = (!walking && a.presence === 'idle' && !reduce) ? Math.sin(T0 / 1300 + a.z) * 0.25 : 0;
      a.obj.position.set(a.x + wob, bob, a.z); if (a.obj.userData.spin && !reduce) a.obj.userData.spin.rotation.z += dt * 1.6; if (!reduce) a.obj.userData.body.rotation.y += dt * (a.look.form === 'orb' ? 0.4 : 0.9);
      if (a.obj.userData.glow) a.obj.userData.glow.material.opacity = (0.45 + (a.presence === 'working' && !reduce ? Math.sin(T0 / 160) * 0.15 : 0)) * a.look.glow;
      var bw = a.presence === 'working' && STATIONS[a.st] && a.st !== 'office'; a.beam.visible = bw; if (bw) { var s2 = STATIONS[a.st], pa = a.beam.geometry.attributes.position; pa.setXYZ(0, a.x, 1.0, a.z); pa.setXYZ(1, s2.x, 1.35, s2.z); pa.needsUpdate = true; a.beam.material.opacity = 0.55 + Math.sin(T0 / 120) * 0.25; }
    });
    camUpdate(dt); renderer.render(scene, camera);
  }

  /* ── input ── */
  function onKey(e, down) { if (!running) return; var tg = e.target && e.target.tagName; if (tg === 'INPUT' || tg === 'TEXTAREA' || tg === 'SELECT') return; var k = e.key.toLowerCase(); if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].indexOf(k) > -1) { keys[k] = down; if (card.offsetParent || full) e.preventDefault(); } if (down && k === 'e' && nearKey) STATIONS[nearKey].open(); if (down && k === 'escape') exitFull(); }
  function pick(e, click) {
    var r = renderer.domElement.getBoundingClientRect(), ndc = new T.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), ray = new T.Raycaster(); ray.setFromCamera(ndc, camera);
    var objs = []; Object.keys(stationObjs).forEach(function (k) { if (k !== '_floor') objs.push(stationObjs[k]); });
    var hits = ray.intersectObjects(objs, true), key = null; if (hits.length) { var o = hits[0].object; while (o && !(o.userData && o.userData.key)) o = o.parent; key = o && o.userData.key; }
    if (key) { if (!click) return key; var s = STATIONS[key]; target = { x: s.x, z: s.z + 1.5 }; pending = function () { s.open(); }; return key; }
    var fh = ray.intersectObject(stationObjs._floor); if (fh.length && click) { target = { x: fh[0].point.x, z: fh[0].point.z }; pending = null; }
    var ah = null; Object.keys(agents).forEach(function (id) { var a = agents[id], v = new T.Vector3(a.x, 1, a.z).project(camera), sx = (v.x * 0.5 + 0.5) * r.width, sy = (-v.y * 0.5 + 0.5) * r.height; if (Math.hypot(sx - (e.clientX - r.left), sy - (e.clientY - r.top)) < 28) ah = id; });
    if (ah && click) selectAgent(ah); return null;
  }
  var drag = null;
  function bindInput() {
    var cv = renderer.domElement; cv.style.touchAction = 'none';
    cv.addEventListener('pointerdown', function (e) { drag = { x: e.clientX, y: e.clientY, yaw: yaw, moved: false }; try { cv.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ } });
    cv.addEventListener('pointermove', function (e) { if (drag) { var dx = e.clientX - drag.x; if (Math.abs(dx) > 4) drag.moved = true; if (drag.moved) yaw = Math.max(-0.9, Math.min(0.9, drag.yaw - dx * 0.006)); } else { var k = pick(e, false); cv.style.cursor = k ? 'pointer' : 'default'; } });
    cv.addEventListener('pointerup', function (e) { var was = drag; drag = null; if (was && !was.moved) pick(e, true); });
    cv.addEventListener('wheel', function (e) { e.preventDefault(); dist = Math.max(9, Math.min(22, dist + e.deltaY * 0.01)); }, { passive: false });
  }
  document.addEventListener('keydown', function (e) { onKey(e, true); }); document.addEventListener('keyup', function (e) { onKey(e, false); });

  /* ── UI: agent list, customize panel, navi menu ── */
  var listEl;
  function renderList() { if (!listEl) return; listEl.textContent = ''; Object.keys(agents).forEach(function (id) { var a = agents[id]; listEl.appendChild(h('button', { type: 'button', class: 'o3-agent' + (sel === id ? ' on' : ''), onclick: function () { selectAgent(id); } }, [h('i', { style: 'background:linear-gradient(180deg,' + a.look.c1 + ',' + a.look.c2 + ')' }), h('b', { text: a.name }), h('span', { text: a.presence === 'idle' ? (a.kind === 'bot' ? 'bot · idle' : 'idle') : bubbleText(a) })])); }); }
  function selectAgent(id) { sel = id; renderList(); drawPanel(); }
  function drawPanel() {
    panel.textContent = ''; var a = agents[sel]; if (!a) { panel.style.display = 'none'; return; } panel.style.display = 'flex'; var L = JSON.parse(JSON.stringify(a.look));
    var op = ops.filter(function (o) { return o.id === a.id; })[0];
    function apply() { a.look = sane(L, a.id); a.sig = JSON.stringify(a.look); scene.remove(a.obj); disposeObj(a.obj); a.beam.material.color.set(a.look.c1); a.obj = buildBody(a, a.look); a.obj.position.set(a.x, 0, a.z); scene.add(a.obj); a._bt = null; setBubble(a); renderList(); }
    panel.appendChild(h('div', { class: 'o3-ph' }, [h('b', { text: a.name }), h('button', { type: 'button', class: 'o3-x', 'aria-label': 'Close', text: '×', onclick: function () { sel = null; renderList(); drawPanel(); } })]));
    var formRow = h('div', { class: 'o3-row' }), accRow = h('div', { class: 'o3-row' }), gradRow = h('div', { class: 'o3-row' });
    FORMS.forEach(function (f) { formRow.appendChild(h('button', { type: 'button', class: 'o3-pill' + (L.form === f ? ' on' : ''), text: f === 'orb' ? 'Orb' : f === 'crystal' ? 'Crystal' : 'Figure', onclick: function (e) { L.form = f; apply(); formRow.querySelectorAll('.o3-pill').forEach(function (x) { x.classList.toggle('on', x === e.target); }); } })); });
    ACCS.forEach(function (c) { accRow.appendChild(h('button', { type: 'button', class: 'o3-pill' + (L.acc === c ? ' on' : ''), text: c === 'none' ? 'None' : c[0].toUpperCase() + c.slice(1), onclick: function (e) { L.acc = c; apply(); accRow.querySelectorAll('.o3-pill').forEach(function (x) { x.classList.toggle('on', x === e.target); }); } })); });
    var c1 = h('input', { type: 'color', value: L.c1, 'aria-label': 'Top colour' }), c2 = h('input', { type: 'color', value: L.c2, 'aria-label': 'Bottom colour' });
    c1.addEventListener('input', function () { L.c1 = c1.value; apply(); }); c2.addEventListener('input', function () { L.c2 = c2.value; apply(); });
    GRADS.forEach(function (g) { gradRow.appendChild(h('button', { type: 'button', class: 'o3-sw', 'aria-label': 'Gradient ' + g[0] + ' to ' + g[1], style: 'background:linear-gradient(135deg,' + g[0] + ',' + g[1] + ')', onclick: function () { L.c1 = g[0]; L.c2 = g[1]; c1.value = g[0]; c2.value = g[1]; apply(); } })); });
    var glow = h('input', { type: 'range', min: '40', max: '160', value: String(Math.round(L.glow * 100)), 'aria-label': 'Glow', class: 'o3-range' }); glow.addEventListener('input', function () { L.glow = glow.value / 100; apply(); });
    panel.appendChild(h('div', { class: 'o3-sec' }, [h('div', { class: 'o3-lbl', text: 'Form' }), formRow, h('div', { class: 'o3-note', text: 'Crystal and Figure are upgrade forms: preview now, unlock with Sparks later.' })]));
    panel.appendChild(h('div', { class: 'o3-sec' }, [h('div', { class: 'o3-lbl', text: 'Gradient' }), gradRow, h('div', { class: 'o3-row' }, [c1, c2])]));
    panel.appendChild(h('div', { class: 'o3-sec' }, [h('div', { class: 'o3-lbl', text: 'Accessory' }), accRow]));
    panel.appendChild(h('div', { class: 'o3-sec' }, [h('div', { class: 'o3-lbl', text: 'Glow' }), glow]));
    var status = h('div', { class: 'o3-note' });
    panel.appendChild(h('div', { class: 'o3-row' }, [h('button', { type: 'button', class: 'o3-btn', text: 'Save look', onclick: function () {
      var look = sane(L, a.id); try { localStorage.setItem('shd_orb_' + a.id, JSON.stringify(look)); } catch (e) { /* ignore */ }
      if (op) { api('PATCH', '/api/operatives/' + encodeURIComponent(op.id), { look: Object.assign({}, op.look || {}, { orb: look }) }).then(function (d) { if (d.ok) { op.look = d.operative && d.operative.look || Object.assign({}, op.look || {}, { orb: look }); status.textContent = 'Saved. Your 3D world reads this look too.'; } else status.textContent = 'Saved on this device. Could not save to your agent (' + (d.error || d._s) + ').'; }); }
      else status.textContent = 'Saved on this device (outside bots and council agents keep their look locally).'; } }), h('button', { type: 'button', class: 'o3-btn ghost', text: 'Reset', onclick: function () { try { localStorage.removeItem('shd_orb_' + a.id); } catch (e) { /* ignore */ } L = defaultLook(a.id); apply(); drawPanel(); } })]));
    panel.appendChild(status);
  }
  function naviMenu() {
    var m = card.querySelector('.o3-navi'); if (m) { m.remove(); return; }
    var box = h('div', { class: 'o3-navi' }, [h('div', { class: 'o3-ph' }, [h('b', { text: 'Navi' }), h('button', { type: 'button', class: 'o3-x', 'aria-label': 'Close', text: '×', onclick: function () { box.remove(); } })]), h('div', { class: 'o3-note', text: 'Your guide lives in the 3D world. Pick a module to open it there.' })]);
    NAVI.forEach(function (n) { box.appendChild(h('button', { type: 'button', class: 'o3-pill', text: n[1], onclick: function () { exitFull(); if (window.enter3DWorld) window.enter3DWorld({ navi: n[0] }); } })); });
    host.parentNode.appendChild(box);
  }
  var qBtn, recBtn;
  function setQBtn() { if (qBtn) qBtn.textContent = 'Quality: ' + (quality === 'high' ? 'High' : 'Low'); }
  function toggleQuality() { quality = quality === 'high' ? 'low' : 'high'; try { localStorage.setItem('shd_o3_q', quality); } catch (e) { /* ignore */ } renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, quality === 'low' ? 1 : 2)); buildDust(); size(); setQBtn(); }
  // Motion-studio idea: a short clip of your agents working, made from the canvas itself (no server, nothing uploaded).
  function record() {
    if (rec) return; var cv = renderer && renderer.domElement; if (!cv || !cv.captureStream || !window.MediaRecorder) { toast('Recording is not supported in this browser'); return; }
    var mime = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].filter(function (m) { return MediaRecorder.isTypeSupported(m); })[0]; if (!mime) { toast('Recording is not supported in this browser'); return; }
    var chunks = [], mr = new MediaRecorder(cv.captureStream(30), { mimeType: mime, videoBitsPerSecond: 2500000 }); rec = mr; recBtn.textContent = 'Recording…'; recBtn.disabled = true;
    mr.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
    mr.onstop = function () { rec = null; recBtn.disabled = false; recBtn.textContent = 'Record 10s'; var a = h('a', { href: URL.createObjectURL(new Blob(chunks, { type: 'video/webm' })), download: 'my-shaddai-office.webm' }); document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 800); toast('Clip saved to your downloads'); };
    mr.start(); setTimeout(function () { if (mr.state !== 'inactive') mr.stop(); }, 10000);
  }
  function toggleFull() { full = !full; card.classList.toggle('o3-full', full); document.body.style.overflow = full ? 'hidden' : ''; size(); }
  function exitFull() { if (full) toggleFull(); }

  /* ── mount ── */
  function mount() {
    var view = document.getElementById('officeView'); if (!view || document.getElementById('shdOffice3d') || legacy()) return;
    var intro = h('div', { class: 'o3-intro' }, [h('b', { text: 'MY 3D OFFICE' }), h('span', { text: 'walk your room · watch your agents work live · customize them' }), h('button', { type: 'button', class: 'o3-btn', text: 'Open 3D office', onclick: open })]);
    host = h('div', { class: 'o3-host', style: 'display:none' }); prompt = h('div', { class: 'o3-prompt', style: 'display:none' }); listEl = h('div', { class: 'o3-list' }); panel = h('div', { class: 'o3-panel', style: 'display:none' });
    qBtn = h('button', { type: 'button', class: 'o3-btn ghost', onclick: toggleQuality }); recBtn = h('button', { type: 'button', class: 'o3-btn ghost', text: 'Record 10s', onclick: record });
    hud = h('div', { class: 'o3-hud' }, [h('button', { type: 'button', class: 'o3-btn ghost', text: 'Navi', onclick: naviMenu }), qBtn, recBtn, h('button', { type: 'button', class: 'o3-btn ghost', text: 'Spectate world', onclick: function () { exitFull(); worldsTab('arena'); } }), h('button', { type: 'button', class: 'o3-btn ghost', text: 'Full screen', onclick: toggleFull }), h('button', { type: 'button', class: 'o3-btn ghost', text: 'Close', onclick: close })]);
    var stage = h('div', { class: 'o3-stage' }, [host, prompt, hud, panel, h('div', { class: 'o3-help', text: 'WASD / arrows move · click a desk · drag to turn · wheel to zoom · E to use' })]);
    card = h('section', { id: 'shdOffice3d', class: 'o3-card' }, [intro, stage, listEl]); stage.style.display = 'none'; card._stage = stage; card._intro = intro;
    view.insertBefore(card, view.firstChild);
  }
  function open() {
    card._intro.querySelector('button').disabled = true; card._intro.querySelector('button').textContent = 'Loading…';
    import('/vendor/three/three.module.js').then(function (m) {
      T = m; try { renderer = new T.WebGLRenderer({ antialias: window.innerWidth > 700, alpha: false }); } catch (e) { throw new Error('WebGL is not available in this browser'); }
      try { quality = localStorage.getItem('shd_o3_q') || ((window.innerWidth < 700 || reduce) ? 'low' : 'high'); } catch (e) { /* ignore */ }
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, quality === 'low' ? 1 : (window.innerWidth < 700 ? 1.5 : 2))); host.style.display = 'block'; card._stage.style.display = 'block'; card._intro.style.display = 'none'; host.appendChild(renderer.domElement);
      buildScene(); buildDust(); size(); bindInput(); setQBtn(); running = true; lastT = performance.now(); pollCity(); poll = setInterval(pollCity, 2000); raf = requestAnimationFrame(frame);
    }).catch(function (e) { loadErr = e; card._intro.querySelector('button').disabled = false; card._intro.querySelector('button').textContent = 'Open 3D office'; toast('3D office unavailable: ' + (e && e.message || e)); });
  }
  function close() {
    exitFull(); running = false; clearInterval(poll); cancelAnimationFrame(raf);
    if (renderer) { try { renderer.dispose(); renderer.domElement.remove(); } catch (e) { /* ignore */ } renderer = null; }
    if (rec && rec.state !== 'inactive') { try { rec.stop(); } catch (e) { /* ignore */ } } if (scene) disposeObj(scene); pulses = []; dust = null;
    agents = {}; sel = null; if (listEl) listEl.textContent = ''; if (panel) panel.style.display = 'none'; var m = card.querySelector('.o3-navi'); if (m) m.remove();
    if (card) { card._stage.style.display = 'none'; card._intro.style.display = ''; var b = card._intro.querySelector('button'); b.disabled = false; b.textContent = 'Open 3D office'; } host.style.display = 'none'; labelCache = {};
  }
  window.addEventListener('resize', function () { if (running) size(); });
  document.addEventListener('visibilitychange', function () { if (!document.hidden && running) pollCity(); });
  function wrap() { var sv = window.showView; if (typeof sv !== 'function' || sv._o3) return; window.showView = function (v) { var r = sv.apply(this, arguments); if (v === 'office') setTimeout(mount, 60); else if (running && !full) { /* keep scene but pause cheaply via offsetParent check */ } return r; }; window.showView._o3 = true; }
  wrap(); window.addEventListener('load', function () { wrap(); setTimeout(wrap, 700); setTimeout(mount, 1200); });
  window.shdOffice3d = { open: open, close: close, mount: mount, _agents: function () { return agents; }, _player: function () { return player; }, stations: STATIONS };
})();
