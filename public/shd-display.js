/* SHADDAI V119 — DISPLAY TUNING. Brightness, contrast, saturation, tint, scanlines and calm motion, with presets.
   One source of truth (localStorage shd_display) composes the page filter, so the older Brightness/Contrast sliders buried in
   Display Settings stay in sync instead of fighting this panel. shdDisplay.panel() returns the Settings card. */
(function () {
  'use strict';
  var KEY = 'shd_display';
  var DEF = { b: 100, c: 100, s: 100, h: 0, scan: true, calm: false };
  var PRESETS = [['Default', { b: 100, c: 100, s: 100, h: 0 }], ['Night', { b: 82, c: 108, s: 90, h: 0 }], ['Vivid', { b: 106, c: 114, s: 135, h: 0 }], ['High contrast', { b: 104, c: 145, s: 110, h: 0 }], ['Soft', { b: 96, c: 90, s: 94, h: 0 }], ['Cool', { b: 100, c: 105, s: 105, h: -18 }], ['Warm', { b: 102, c: 100, s: 108, h: 14 }]];
  var st = (function () { try { return Object.assign({}, DEF, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { return Object.assign({}, DEF); } })();
  function clamp(v, a, b) { v = +v; return isFinite(v) ? Math.min(b, Math.max(a, v)) : a; }
  function sane() { st.b = clamp(st.b, 50, 150); st.c = clamp(st.c, 70, 160); st.s = clamp(st.s, 0, 200); st.h = clamp(st.h, -30, 30); st.scan = st.scan !== false; st.calm = !!st.calm; }
  var ui = {};
  function apply() {
    sane(); var d = document.documentElement, plain = st.b === 100 && st.c === 100 && st.s === 100 && st.h === 0;
    d.style.filter = plain ? '' : 'brightness(' + st.b + '%) contrast(' + st.c + '%) saturate(' + st.s + '%)' + (st.h ? ' hue-rotate(' + st.h + 'deg)' : '');
    d.classList.toggle('shd-calm', st.calm);
    var sl = document.getElementById('shaddaiScanlines'); if (sl) sl.style.display = st.scan ? '' : 'none';
    try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) { /* ignore */ }
    // keep the legacy sliders and their saved settings in step
    try { var lb = document.getElementById('brightnessSlider'), lc = document.getElementById('contrastSlider'); if (lb) { lb.value = st.b; var v1 = document.getElementById('brightnessValue'); if (v1) v1.textContent = st.b + '%'; } if (lc) { lc.value = st.c; var v2 = document.getElementById('contrastValue'); if (v2) v2.textContent = st.c + '%'; } if (window.S && S.settings && S.settings.ui) { S.settings.ui.brightness = st.b; S.settings.ui.contrast = st.c; } } catch (e) { /* ignore */ }
    paint();
  }
  function paint() {
    if (!ui.root) return;
    ['b', 'c', 's', 'h'].forEach(function (k) { if (ui[k]) { ui[k].input.value = st[k]; ui[k].out.textContent = (k === 'h' ? (st.h > 0 ? '+' : '') + st.h + '°' : st[k] + '%'); } });
    ui.scan.checked = st.scan; ui.calm.checked = st.calm;
    [].forEach.call(ui.presets.children, function (b, i) { var p = PRESETS[i][1], on = p.b === st.b && p.c === st.c && p.s === st.s && p.h === st.h; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); });
  }
  function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  function slider(key, label, min, max, hint) {
    var wrap = el('label', 'dsp-row'), top = el('div', 'dsp-top'), out = el('span', 'dsp-val'), input = document.createElement('input');
    input.type = 'range'; input.min = min; input.max = max; input.step = 1; input.setAttribute('aria-label', label); input.className = 'dsp-range';
    input.addEventListener('input', function () { st[key] = +input.value; apply(); });
    var reset = el('button', 'dsp-reset', 'Reset'); reset.type = 'button'; reset.addEventListener('click', function (e) { e.preventDefault(); st[key] = DEF[key]; apply(); });
    top.appendChild(el('span', 'dsp-l', label)); top.appendChild(out); top.appendChild(reset); wrap.appendChild(top); wrap.appendChild(input); if (hint) wrap.appendChild(el('span', 'dsp-h', hint));
    ui[key] = { input: input, out: out }; return wrap;
  }
  function toggle(key, label, hint) {
    var wrap = el('label', 'dsp-tog'), cb = document.createElement('input'); cb.type = 'checkbox'; cb.addEventListener('change', function () { st[key] = cb.checked; apply(); });
    var t = el('span', 'dsp-togt'); t.appendChild(el('b', null, label)); t.appendChild(el('small', null, hint)); wrap.appendChild(cb); wrap.appendChild(t); ui[key] = cb; return wrap;
  }
  function panel() {
    if (ui.root && document.body.contains(ui.root)) return ui.root;
    var root = el('div', 'settings-section dsp'); root.id = 'shdDisplayPanel'; ui.root = root;
    var title = el('div', 'settings-title', 'Display tuning'); root.appendChild(title);
    root.appendChild(el('div', 'dsp-lead', 'Make the whole dashboard brighter, sharper or calmer. It saves on this device and applies to every screen.'));
    var pr = el('div', 'dsp-presets'); pr.setAttribute('role', 'group'); pr.setAttribute('aria-label', 'Display presets'); ui.presets = pr;
    PRESETS.forEach(function (p) { var b = el('button', 'dsp-chip', p[0]); b.type = 'button'; b.addEventListener('click', function () { Object.assign(st, p[1]); apply(); }); pr.appendChild(b); });
    root.appendChild(pr);
    var g = el('div', 'dsp-grid'); g.appendChild(slider('b', 'Brightness', 50, 150, 'Lower for dark rooms, higher for sunlight.')); g.appendChild(slider('c', 'Contrast', 70, 160, 'Higher makes text and edges pop.')); g.appendChild(slider('s', 'Colour intensity', 0, 200, 'Zero is greyscale, 100 is normal.')); g.appendChild(slider('h', 'Tint', -30, 30, 'Shift every colour cooler or warmer.')); root.appendChild(g);
    var tg = el('div', 'dsp-togs'); tg.appendChild(toggle('scan', 'Scanlines', 'The faint CRT lines over the background.')); tg.appendChild(toggle('calm', 'Calm motion', 'Turn off animations and transitions.')); root.appendChild(tg);
    var all = el('button', 'dsp-all', 'Reset display to default'); all.type = 'button'; all.addEventListener('click', function () { Object.assign(st, DEF); apply(); }); root.appendChild(all);
    paint(); return root;
  }
  // legacy sliders now route through the same state
  window.adjustBrightness = function (v) { st.b = +v; apply(); };
  window.adjustContrast = function (v) { st.c = +v; apply(); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', apply); else apply();
  window.shdDisplay = { panel: panel, apply: apply, state: function () { return Object.assign({}, st); }, set: function (o) { Object.assign(st, o); apply(); } };
})();
