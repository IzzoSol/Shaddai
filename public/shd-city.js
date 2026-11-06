/* SHADDAI V119 — AGENT CITY: a live top-down view of YOUR forged agents and outside bots walking to the places
   they work (Market, Library, Garden, Athenaeum, Workshop) while they run tasks, and resting at the Office.
   It only DRAWS what the server reports (/api/bridge/city): presence, station and step name. No outputs, no keys.
   Other players' agents appear as anonymous dots. Lives on Worlds → Overview. */
(function () {
  'use strict';
  var STATIONS = {
    office:    { x: .50, y: .76, name: 'Office',    note: 'home base' },
    market:    { x: .17, y: .26, name: 'Market',    note: 'prices & data' },
    library:   { x: .50, y: .24, name: 'Library',   note: 'research & news' },
    garden:    { x: .83, y: .26, name: 'Garden',    note: 'plots' },
    athenaeum: { x: .17, y: .76, name: 'Athenaeum', note: 'classes & skills' },
    workshop:  { x: .83, y: .76, name: 'Workshop',  note: 'tools' }
  };
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var el = null, cv = null, ctx = null, tip = null, list = null, note = null;
  var W = 0, H = 0, dpr = 1, agents = {}, others = [], timer = null, raf = 0, running = false, lastDraw = 0, state = 'idle', accent = '#00e5a0';

  function h(tag, attrs, kids) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) { if (k === 'text') e.textContent = attrs[k]; else if (k === 'class') e.className = attrs[k]; else if (attrs[k] != null) e.setAttribute(k, attrs[k]); });
    (kids || []).forEach(function (c) { if (c) e.appendChild(c); });
    return e;
  }
  function hue(id) { var n = 0; for (var i = 0; i < id.length; i++) n = (n * 31 + id.charCodeAt(i)) >>> 0; return n % 360; }
  function auth() { var o = {}; try { var t = localStorage.getItem('shd_token'); if (t) o.Authorization = 'Bearer ' + t; } catch (e) { /* ignore */ } return o; }

  function build() {
    var panel = document.querySelector('#worldsView [data-wtab="worlds"]');
    if (!panel || document.getElementById('shdCityCard')) return !!document.getElementById('shdCityCard');
    cv = h('canvas', { id: 'shdCityCanvas', role: 'img', 'aria-label': 'Live map of your agents and bots at work' });
    tip = h('div', { class: 'cy-tip' }); note = h('div', { class: 'cy-note' }); list = h('ul', { class: 'cy-list', 'aria-live': 'polite' });
    el = h('section', { id: 'shdCityCard', class: 'wh-card cy-card' }, [
      h('div', { class: 'cy-hd' }, [h('b', { text: 'AGENT CITY' }), h('span', { text: 'live · your forged agents and bots at work' })]),
      h('div', { class: 'cy-stage' }, [cv, tip, note]), list
    ]);
    panel.appendChild(el);
    ctx = cv.getContext('2d');
    cv.addEventListener('mousemove', hover); cv.addEventListener('mouseleave', function () { tip.style.display = 'none'; });
    cv.addEventListener('click', function (e) { var a = pick(e); if (a && a.kind === 'forged' && window.switchWorldsTab) window.switchWorldsTab('space'); });
    window.addEventListener('resize', size);
    return true;
  }
  function size() {
    if (!cv) return; var r = cv.parentNode.getBoundingClientRect(); if (!r.width) return;
    dpr = Math.min(2, window.devicePixelRatio || 1); W = Math.round(r.width); H = W < 520 ? 250 : 320;
    cv.style.width = W + 'px'; cv.style.height = H + 'px'; cv.width = W * dpr; cv.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  function pos(st, i, n) { var s = STATIONS[st] || STATIONS.office; var a = (i / Math.max(n, 1)) * Math.PI * 2 + 0.6; var r = n > 1 ? 26 : 0; return { x: s.x * W + Math.cos(a) * r, y: s.y * H + 34 + Math.sin(a) * r * 0.6 }; }

  /* ── data ── */
  function poll() {
    if (!el || !cv.offsetParent || document.hidden) return;
    fetch('/api/bridge/city', { credentials: 'same-origin', headers: auth() }).then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { d._s = r.status; return d; }); }).then(function (d) {
      if (d._s === 401) { state = 'signin'; agents = {}; others = []; render(); return; }
      if (d._s >= 400 || !d.me) { state = 'off'; render(); return; }
      state = 'ok'; others = d.others || [];
      var seen = {}, perStation = {};
      d.me.forEach(function (m) { var st = m.station || 'office'; perStation[st] = (perStation[st] || 0) + 1; });
      var idx = {};
      d.me.forEach(function (m) {
        var st = m.presence === 'idle' || !m.station ? 'office' : m.station; idx[st] = (idx[st] || 0);
        var a = agents[m.id] || (agents[m.id] = { id: m.id, x: STATIONS.office.x * W, y: STATIONS.office.y * H + 34, born: Date.now() });
        a.name = m.name; a.kind = m.kind; a.presence = m.presence; a.step = m.step; a.st = st;
        var t = pos(st, idx[st]++, perStation[st] || 1); a.tx = t.x; a.ty = t.y; a.hue = hue(m.id); seen[m.id] = 1;
      });
      Object.keys(agents).forEach(function (k) { if (!seen[k]) delete agents[k]; });
      render();
    }).catch(function () { state = 'off'; render(); });
  }
  function label(a) {
    var p = a.presence;
    if (p === 'working') return (a.step ? String(a.step).replace(/^\d+\.\s*/, '').replace(/^price:/, 'price ').replace(/_/g, ' ') : 'working');
    if (p === 'awaiting_approval') return 'waiting for you';
    if (p === 'celebrating') return 'done';
    if (p === 'failed') return 'failed';
    return 'idle';
  }
  function render() {
    var ids = Object.keys(agents);
    note.textContent = state === 'signin' ? 'Sign in to see your agents here.' : state === 'off' ? 'The live view needs the bot bridge on this server.' : (!ids.length ? 'No agents yet. Forge one, or connect a bot (My Space → Outside bots) and give it a task.' : '');
    note.style.display = note.textContent ? 'block' : 'none';
    list.textContent = '';
    ids.forEach(function (id) { var a = agents[id]; list.appendChild(h('li', { class: 'cy-' + a.presence }, [h('i', { style: 'background:hsl(' + a.hue + ',80%,60%)' }), h('b', { text: a.name }), h('span', { text: (a.kind === 'bot' ? 'bot · ' : '') + label(a) })])); });
  }

  /* ── drawing ── */
  function glyph(c, id, x, y, col) {
    c.save(); c.translate(x, y); c.strokeStyle = col; c.fillStyle = col; c.lineWidth = 1.6; c.lineCap = 'round'; c.lineJoin = 'round'; c.beginPath();
    if (id === 'market') { c.moveTo(-8, 6); c.lineTo(-8, 0); c.moveTo(-2, 6); c.lineTo(-2, -5); c.moveTo(4, 6); c.lineTo(4, -2); c.moveTo(10, 6); c.lineTo(10, -8); }
    else if (id === 'library') { c.rect(-9, -6, 8, 12); c.rect(1, -6, 8, 12); }
    else if (id === 'garden') { c.arc(0, 2, 7, 0, Math.PI * 2); c.moveTo(0, 9); c.lineTo(0, -8); }
    else if (id === 'athenaeum') { c.moveTo(-10, 7); c.lineTo(10, 7); c.moveTo(-8, 4); c.lineTo(-8, -3); c.moveTo(0, 4); c.lineTo(0, -3); c.moveTo(8, 4); c.lineTo(8, -3); c.moveTo(-11, -4); c.lineTo(0, -10); c.lineTo(11, -4); c.closePath(); }
    else if (id === 'workshop') { c.arc(0, 0, 6, 0, Math.PI * 2); c.moveTo(0, -10); c.lineTo(0, -6); c.moveTo(0, 6); c.lineTo(0, 10); c.moveTo(-10, 0); c.lineTo(-6, 0); c.moveTo(6, 0); c.lineTo(10, 0); }
    else { c.moveTo(-10, 2); c.lineTo(0, -8); c.lineTo(10, 2); c.moveTo(-7, 0); c.lineTo(-7, 9); c.lineTo(7, 9); c.lineTo(7, 0); }
    c.stroke(); c.restore();
  }
  function draw(t) {
    if (!ctx || !W) return; var c = ctx;
    c.clearRect(0, 0, W, H);
    var g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#060b16'); g.addColorStop(1, '#0a1220'); c.fillStyle = g; c.fillRect(0, 0, W, H);
    c.strokeStyle = 'rgba(255,255,255,.04)'; c.lineWidth = 1; for (var gx = 0; gx < W; gx += 28) { c.beginPath(); c.moveTo(gx, 0); c.lineTo(gx, H); c.stroke(); } for (var gy = 0; gy < H; gy += 28) { c.beginPath(); c.moveTo(0, gy); c.lineTo(W, gy); c.stroke(); }
    var o = STATIONS.office; c.strokeStyle = 'rgba(160,190,255,.14)'; c.lineWidth = 6; c.lineCap = 'round';
    Object.keys(STATIONS).forEach(function (k) { if (k === 'office') return; var s = STATIONS[k]; c.beginPath(); c.moveTo(o.x * W, o.y * H + 34); c.lineTo(s.x * W, s.y * H + 34); c.stroke(); });
    var busy = {}; Object.keys(agents).forEach(function (k) { var a = agents[k]; if (a.presence === 'working') busy[a.st] = 1; });
    Object.keys(STATIONS).forEach(function (k) {
      var s = STATIONS[k], x = s.x * W, y = s.y * H + 34, bw = Math.min(118, W * 0.24), bh = 62, on = busy[k];
      var col = on ? accent : 'rgba(170,195,235,.55)';
      c.fillStyle = on ? 'rgba(0,229,160,.10)' : 'rgba(255,255,255,.035)'; c.strokeStyle = on ? accent : 'rgba(170,195,235,.22)'; c.lineWidth = on ? 1.6 : 1;
      c.beginPath(); if (c.roundRect) c.roundRect(x - bw / 2, y - bh / 2 - 10, bw, bh, 14); else c.rect(x - bw / 2, y - bh / 2 - 10, bw, bh); c.fill(); c.stroke();
      glyph(c, k, x, y - 14, col);
      c.fillStyle = on ? accent : 'rgba(205,220,245,.8)'; c.font = '700 10px Orbitron, sans-serif'; c.textAlign = 'center'; c.fillText(s.name.toUpperCase(), x, y + 14);
    });
    others.forEach(function (ot, i) { var p = pos(ot.station || 'office', i, Math.max(others.length, 1)); var ph = (t / 600 + i) % (Math.PI * 2); c.fillStyle = 'rgba(190,205,235,.35)'; c.beginPath(); c.arc(p.x + Math.cos(ph) * 3, p.y + Math.sin(ph) * 2 + 24, 3.2, 0, Math.PI * 2); c.fill(); });
    Object.keys(agents).forEach(function (k) {
      var a = agents[k]; var dx = a.tx - a.x, dy = a.ty - a.y, d = Math.hypot(dx, dy);
      if (d > 0.8) { var sp = Math.min(d, 2.4); a.x += dx / d * sp; a.y += dy / d * sp; }
      var walking = d > 3, bob = walking && !reduce ? Math.sin(t / 90) * 1.6 : 0;
      var wob = (!walking && a.presence === 'idle' && !reduce) ? { x: Math.sin(t / 900 + a.hue) * 6, y: Math.cos(t / 1100 + a.hue) * 3 } : { x: 0, y: 0 };
      var px = a.x + wob.x, py = a.y + wob.y + bob + 24; a._px = px; a._py = py;
      var col = a.presence === 'failed' ? '#ff5a6a' : a.presence === 'awaiting_approval' ? '#e8c45c' : 'hsl(' + a.hue + ',85%,62%)';
      var pulse = a.presence === 'working' && !walking && !reduce ? 1 + Math.sin(t / 160) * 0.12 : 1;
      c.save(); c.shadowColor = col; c.shadowBlur = 14; c.fillStyle = col; c.beginPath();
      if (a.kind === 'bot') { var r = 9 * pulse; c.moveTo(px, py - r); c.lineTo(px + r, py); c.lineTo(px, py + r); c.lineTo(px - r, py); c.closePath(); } else { c.arc(px, py, 8 * pulse, 0, Math.PI * 2); }
      c.fill(); c.restore();
      c.fillStyle = '#04100c'; c.font = '800 9px Orbitron, sans-serif'; c.textAlign = 'center'; c.fillText(String(a.name || '?').charAt(0).toUpperCase(), px, py + 3);
      if (a.presence === 'celebrating' && !reduce) { for (var q = 0; q < 5; q++) { var ang = t / 200 + q * 1.26; c.fillStyle = col; c.fillRect(px + Math.cos(ang) * 16 - 1, py + Math.sin(ang) * 16 - 1, 2.4, 2.4); } }
      if (a.presence !== 'idle') {
        var txt = label(a); if (txt.length > 24) txt = txt.slice(0, 23) + '…';
        c.font = '600 10px sans-serif'; var tw = c.measureText(txt).width + 12, bx = Math.max(4, Math.min(W - tw - 4, px - tw / 2)), by = py - 34;
        c.fillStyle = 'rgba(8,14,26,.92)'; c.strokeStyle = col; c.lineWidth = 1; c.beginPath(); if (c.roundRect) c.roundRect(bx, by, tw, 18, 9); else c.rect(bx, by, tw, 18); c.fill(); c.stroke();
        c.fillStyle = '#e8eefc'; c.textAlign = 'left'; c.fillText(txt, bx + 6, by + 12.5);
      }
    });
  }
  function pick(e) {
    var r = cv.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top, hit = null;
    Object.keys(agents).forEach(function (k) { var a = agents[k]; if (a._px != null && Math.hypot(a._px - mx, a._py - my) < 14) hit = a; }); return hit;
  }
  function hover(e) {
    var a = pick(e); if (!a) { tip.style.display = 'none'; cv.style.cursor = 'default'; return; }
    cv.style.cursor = a.kind === 'forged' ? 'pointer' : 'default';
    tip.textContent = a.name + ' · ' + (a.kind === 'bot' ? 'outside bot' : 'forged agent') + ' · ' + label(a);
    tip.style.display = 'block'; var r = cv.getBoundingClientRect(); tip.style.left = Math.min(r.width - 170, Math.max(4, e.clientX - r.left + 10)) + 'px'; tip.style.top = Math.max(4, e.clientY - r.top - 28) + 'px';
  }
  function loop(t) {
    if (!running) return; raf = requestAnimationFrame(loop);
    if (!cv.offsetParent) return; if (t - lastDraw < 33) return; lastDraw = t; draw(t);
  }

  function start() {
    if (document.documentElement.classList.contains('shd-legacy-nav')) return;
    if (!build()) return; try { accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || accent; } catch (e) { /* ignore */ }
    size(); if (running) return; running = true; poll(); timer = setInterval(poll, 2000); raf = requestAnimationFrame(loop);
  }
  function stop() { running = false; clearInterval(timer); cancelAnimationFrame(raf); }

  function wrap() {
    var fn = window.switchWorldsTab; if (typeof fn !== 'function' || fn._city) return;
    window.switchWorldsTab = function (tab) { var r = fn.apply(this, arguments); if (tab === 'worlds') setTimeout(start, 30); else stop(); return r; };
    window.switchWorldsTab._city = true;
    ['_sw'].forEach(function (k) { if (fn[k]) window.switchWorldsTab[k] = fn[k]; });
  }
  function boot() { wrap(); }
  boot(); window.addEventListener('load', function () { boot(); setTimeout(boot, 700); });
  document.addEventListener('visibilitychange', function () { if (!document.hidden && running) poll(); });
  window.shdCity = { start: start, stop: stop, _agents: function () { return agents; } };
})();
