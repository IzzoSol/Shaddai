/* SHADDAI V119 — AGENT BODY VIEWER. Opens from any agent card (Agents tab, My Space): a real 3D body you can swivel,
   with angle + light presets, accent colour, zoom, snapshot, and a saved look. Council bodies and forged agents (which wear
   one of the seven council models) both use /assets/agents/<MODEL>.glb. Bodies load only when opened (ZEROX is 12 MB).
   Look settings are for this viewer; cosmetics that carry into the 3D world come from the 3D Forge. */
(function () {
  'use strict';
  var BODIES = {
    SHADDAI: { rank: 'Supreme commander', color: '#f0b429' }, ZEROX: { rank: 'Revenue strategist', color: '#00e5ff' }, ORACLE: { rank: 'Intelligence officer', color: '#a78bfa' },
    NEXUS: { rank: 'Systems architect', color: '#00f0ff' }, TURTLE: { rank: 'Design director', color: '#00ff88' }, QUILL: { rank: 'Comms specialist', color: '#fb923c' }, PIKADON: { rank: 'Security lead', color: '#f43f5e' }
  };
  var ANGLES = { Front: '0deg 78deg auto', '¾': '38deg 74deg auto', Side: '90deg 80deg auto', Back: '180deg 78deg auto', Top: '0deg 18deg auto' };
  var LIGHTS = {
    Studio: { exposure: 1.0, shadow: 1.1, bg: 'radial-gradient(ellipse at 50% 35%, #26324a 0%, #0b1220 70%)' },
    Neon: { exposure: 0.75, shadow: 0.6, bg: 'radial-gradient(ellipse at 50% 100%, var(--av-accent-dim) 0%, #080b16 62%)' },
    Night: { exposure: 0.45, shadow: 0.3, bg: 'linear-gradient(180deg, #02040a, #0a0f1e)' },
    Day: { exposure: 1.35, shadow: 1.4, bg: 'linear-gradient(180deg, #8fb4e8, #dfe9f7 75%)' }
  };
  var SWATCHES = ['', '#00e5a0', '#00e5ff', '#a78bfa', '#f0b429', '#fb923c', '#f43f5e', '#ffffff'];
  var root = null, mv = null, cur = null, look = null, lastFocus = null, mvLoading = null;

  function h(tag, attrs, kids) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'text') e.textContent = attrs[k]; else if (k === 'class') e.className = attrs[k];
      else if (k.indexOf('on') === 0) e.addEventListener(k.slice(2), attrs[k]); else if (attrs[k] != null) e.setAttribute(k, attrs[k]);
    });
    (kids || []).forEach(function (c) { if (c != null) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return e;
  }
  function ensureMV() {
    // NEXUS, ORACLE and QUILL are meshopt-compressed: the viewer needs a decoder, hosted here so no third-party request is made.
    var withDecoder = function () { try { var C = customElements.get('model-viewer'); if (C && !C.meshoptDecoderLocation) C.meshoptDecoderLocation = location.origin + '/vendor/meshopt_decoder.js'; } catch (e) { /* ignore */ } };
    if (window.customElements && customElements.get('model-viewer')) { withDecoder(); return Promise.resolve(); }
    if (mvLoading) return mvLoading;
    mvLoading = new Promise(function (res, rej) {
      var s = document.querySelector('script[data-forge3d-mv]') || h('script', { type: 'module', src: '/model-viewer.min.js?v=15', 'data-forge3d-mv': '1' });
      if (!s.parentNode) document.head.appendChild(s);
      var t = Date.now(); (function wait() { if (customElements.get('model-viewer')) { withDecoder(); return res(); } if (Date.now() - t > 15000) return rej(new Error('viewer failed to load')); setTimeout(wait, 80); })();
    });
    return mvLoading;
  }
  function loadLook(name) { try { return JSON.parse(localStorage.getItem('shd_look_' + name) || 'null') || {}; } catch (e) { return {}; } }
  function saveLook() { try { localStorage.setItem('shd_look_' + cur.name, JSON.stringify(look)); } catch (e) { /* ignore */ } }
  function hex2rgb(hx) { var m = /^#?([0-9a-f]{6})$/i.exec(hx || ''); if (!m) return null; var n = parseInt(m[1], 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }

  function build() {
    if (root) return;
    var stage = h('div', { class: 'av-stage', id: 'avStage' }), prog = h('div', { class: 'av-prog', id: 'avProg' }, [h('i')]), note = h('div', { class: 'av-note', id: 'avNote' });
    var panel = h('div', { class: 'av-panel' });
    root = h('div', { id: 'shdAV', class: 'av-root', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Agent body viewer', style: 'display:none' }, [
      h('div', { class: 'av-card' }, [stage, prog, note, h('button', { type: 'button', class: 'av-x', 'aria-label': 'Close viewer', text: '×', onclick: close }), panel])
    ]);
    root.addEventListener('mousedown', function (e) { if (e.target === root) close(); });
    document.addEventListener('keydown', function (e) { if (root.style.display !== 'none' && e.key === 'Escape') close(); });
    document.body.appendChild(root);
  }
  function section(title, kids) { return h('div', { class: 'av-sec' }, [h('div', { class: 'av-lbl', text: title }), h('div', { class: 'av-row' }, kids)]); }
  function pill(text, on, fn) { var b = h('button', { type: 'button', class: 'av-pill' + (on ? ' on' : ''), text: text, onclick: function () { fn(b); } }); return b; }
  function group(btns, fn) { btns.forEach(function (b) { b.addEventListener('click', function () { btns.forEach(function (x) { x.classList.toggle('on', x === b); }); }); }); return btns; }

  function applyAccent() {
    var c = look.accent || cur.color; var rgb = hex2rgb(c) || [0, 229, 160];
    root.style.setProperty('--av-accent', c); root.style.setProperty('--av-accent-dim', 'rgba(' + rgb.join(',') + ',.38)');
    if (!mv || !mv.model) return;
    try {   // tint emissive parts (glow strips, eyes) when the viewer supports it; otherwise the backdrop carries the accent
      mv.model.materials.forEach(function (m) {
        if (m._avE === undefined) m._avE = (m.emissiveFactor || [0, 0, 0]).slice ? m.emissiveFactor.slice() : [0, 0, 0];
        var lit = (m._avE[0] + m._avE[1] + m._avE[2]) > 0.05;
        if (lit && look.accent && m.setEmissiveFactor) m.setEmissiveFactor([rgb[0] / 255, rgb[1] / 255, rgb[2] / 255]);
        else if (lit && !look.accent && m.setEmissiveFactor) m.setEmissiveFactor(m._avE);
      });
    } catch (e) { /* backdrop-only */ }
  }
  function applyLight() { var L = LIGHTS[look.light || 'Studio']; if (!mv) return; mv.setAttribute('exposure', L.exposure); mv.setAttribute('shadow-intensity', L.shadow); document.getElementById('avStage').style.background = L.bg; }
  function applyAngle(a) { if (mv && ANGLES[a]) { mv.setAttribute('camera-orbit', ANGLES[a]); } }
  function applySpin() { if (!mv) return; if (look.spin === false) mv.removeAttribute('auto-rotate'); else mv.setAttribute('auto-rotate', ''); mv.setAttribute('rotation-per-second', (look.speed || 22) + 'deg'); }

  function open(agent) {
    if (!agent || !agent.name) return;
    var key = String(agent.model || agent.name).toUpperCase(); if (!BODIES[key]) key = BODIES[String(agent.name).toUpperCase()] ? String(agent.name).toUpperCase() : 'SHADDAI';
    cur = { name: agent.name, model: key, color: agent.color || BODIES[key].color, rank: agent.rank || BODIES[key].rank, forged: !!agent.forged };
    look = loadLook(cur.name); build(); lastFocus = document.activeElement;
    var stage = document.getElementById('avStage'), prog = document.getElementById('avProg'), note = document.getElementById('avNote'), panel = root.querySelector('.av-panel');
    stage.textContent = ''; note.textContent = 'Loading body…'; note.style.display = 'block'; prog.firstChild.style.width = '0%'; prog.style.display = 'block';
    root.style.display = 'flex'; document.body.style.overflow = 'hidden';
    stage.appendChild(h('img', { class: 'av-poster', alt: '', src: '/assets/agents/' + key + '-portrait.png' }));

    var accentBtns = SWATCHES.map(function (c) { var b = h('button', { type: 'button', class: 'av-sw' + ((look.accent || '') === c ? ' on' : ''), 'aria-label': c ? 'Accent ' + c : 'Default accent', style: c ? 'background:' + c : '', title: c || 'Default', text: c ? '' : '○' }); b.addEventListener('click', function () { look.accent = c || null; accentBtns.forEach(function (x) { x.classList.toggle('on', x === b); }); applyAccent(); saveLook(); }); return b; });
    var angleBtns = group(Object.keys(ANGLES).map(function (a) { return pill(a, false, function () { look.spin = false; applySpin(); spinBtn.classList.remove('on'); applyAngle(a); saveLook(); }); }));
    var lightBtns = group(Object.keys(LIGHTS).map(function (n) { return pill(n, (look.light || 'Studio') === n, function () { look.light = n; applyLight(); saveLook(); }); }));
    var spinBtn = pill('Auto-spin', look.spin !== false, function (b) { look.spin = !(look.spin !== false); b.classList.toggle('on', look.spin); applySpin(); saveLook(); });
    var speed = h('input', { type: 'range', min: '6', max: '90', value: String(look.speed || 22), 'aria-label': 'Spin speed', class: 'av-range' }); speed.addEventListener('input', function () { look.speed = +speed.value; applySpin(); saveLook(); });
    var zoom = h('input', { type: 'range', min: '60', max: '180', value: '100', 'aria-label': 'Zoom', class: 'av-range' }); zoom.addEventListener('input', function () { if (mv) mv.setAttribute('field-of-view', (30 * 100 / +zoom.value).toFixed(1) + 'deg'); });
    panel.textContent = '';
    panel.appendChild(h('div', { class: 'av-title' }, [h('b', { text: cur.name }), h('span', { text: cur.rank + (cur.forged ? ' · forged' : '') })]));
    panel.appendChild(section('Swivel', [spinBtn, speed, h('span', { class: 'av-hint', text: 'or drag the body' })]));
    panel.appendChild(section('Angle', angleBtns));
    panel.appendChild(section('Light', lightBtns));
    panel.appendChild(section('Accent', accentBtns));
    panel.appendChild(section('Zoom', [zoom]));
    panel.appendChild(h('div', { class: 'av-actions' }, [
      h('button', { type: 'button', class: 'av-btn', text: 'Snapshot', onclick: snap }),
      h('button', { type: 'button', class: 'av-btn ghost', text: 'Reset', onclick: function () { look = {}; saveLook(); open(agent); } }),
      typeof window.chatWithAgent === 'function' && !cur.forged ? h('button', { type: 'button', class: 'av-btn ghost', text: 'Chat', onclick: function () { close(); window.chatWithAgent(cur.name); } }) : null,
      h('button', { type: 'button', class: 'av-btn ghost', text: 'Connect a bot', onclick: function () { close(); try { showView('worlds'); setTimeout(function () { window.switchWorldsTab && window.switchWorldsTab('space'); }, 60); } catch (e) { /* ignore */ } } })
    ]));
    panel.appendChild(h('div', { class: 'av-foot', text: 'Look settings stay in this viewer. Cosmetics that travel into the 3D world are made in the 3D Forge. Wheel and humanoid bodies you can buy with Sparks: coming soon.' }));
    applyAccent();

    ensureMV().then(function () {
      mv = h('model-viewer', { src: '/assets/agents/' + key + '.glb?v=14', alt: cur.name + ' 3D body', 'camera-controls': '', 'touch-action': 'pan-y', 'interaction-prompt': 'none', 'shadow-softness': '0.9', 'environment-image': 'neutral',
        'camera-orbit': ANGLES['¾'], 'min-camera-orbit': 'auto auto 40%', 'max-camera-orbit': 'auto auto 220%', 'interpolation-decay': '90', class: 'av-mv', 'disable-pan': '' });
      mv.addEventListener('progress', function (e) { var p = (e.detail && e.detail.totalProgress) || 0; prog.firstChild.style.width = Math.round(p * 100) + '%'; });
      mv.addEventListener('load', function () { prog.style.display = 'none'; note.style.display = 'none'; var po = stage.querySelector('.av-poster'); if (po) po.remove(); applyAccent(); applyLight(); });
      mv.addEventListener('error', function () { prog.style.display = 'none'; note.textContent = 'Could not load this body. The portrait is shown instead.'; note.style.display = 'block'; });
      stage.appendChild(mv); applySpin(); applyLight();
      if (look.spin === false) applyAngle('¾');
    }).catch(function () { prog.style.display = 'none'; note.textContent = '3D viewer unavailable in this browser. The portrait is shown instead.'; });
    setTimeout(function () { var x = root.querySelector('.av-x'); if (x) x.focus(); }, 30);
  }
  function snap() {
    if (!mv || !mv.toBlob) return;
    mv.toBlob({ mimeType: 'image/png' }).then(function (b) { var a = h('a', { href: URL.createObjectURL(b), download: cur.name.toLowerCase() + '-body.png' }); document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500); }).catch(function () { /* ignore */ });
  }
  function close() {
    if (!root) return; root.style.display = 'none'; document.body.style.overflow = '';
    if (mv) { try { mv.removeAttribute('src'); mv.remove(); } catch (e) { /* ignore */ } mv = null; }    // frees GPU memory
    document.getElementById('avStage').textContent = ''; if (lastFocus && lastFocus.focus) { try { lastFocus.focus(); } catch (e) { /* ignore */ } }
  }

  /* ── hook the Agents tab dossier cards ── */
  function decorate() {
    document.querySelectorAll('#agent3DGrid .operator-dossier').forEach(function (card) {
      if (card.querySelector('.av-open')) return;
      var hero = card.querySelector('.op-hero'), nm = card.querySelector('.op-callsign'); if (!hero || !nm) return;
      var name = nm.textContent.trim(), rank = (card.querySelector('.op-designation') || {}).textContent || '';
      var color = getComputedStyle(card).getPropertyValue('--op-color').trim();
      var b = h('button', { type: 'button', class: 'av-open', 'aria-label': 'View ' + name + ' in 3D', text: 'View body', onclick: function (e) { e.stopPropagation(); open({ name: name, rank: rank.trim().toLowerCase().replace(/^./, function (c) { return c.toUpperCase(); }), color: color }); } });
      hero.appendChild(b);
    });
  }
  var grid = document.getElementById('agent3DGrid');
  if (grid) { new MutationObserver(function () { decorate(); }).observe(grid, { childList: true }); decorate(); }
  window.addEventListener('load', function () { var g = document.getElementById('agent3DGrid'); if (g && !grid) { grid = g; new MutationObserver(function () { decorate(); }).observe(g, { childList: true }); } decorate(); });
  window.shdAgentViewer = { open: open, close: close, bodies: BODIES };
})();
