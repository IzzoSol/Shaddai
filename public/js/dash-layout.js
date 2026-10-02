/* DASHBOARD LAYOUT CUSTOMIZER (v101.3)
   Lets each person decide what their dashboard shows: sidebar items, home tiles, top-bar buttons, order, interface size.
   Nothing is deleted; hidden items are just display:none and always come back via Customize (or Reset).
   Saved per device in localStorage ("shd_layout_v1"). All colours come from theme variables so every skin works. */
(function () {
  'use strict';
  var KEY = 'shd_layout_v1';
  var DEFAULT = { sbHidden: [], sbOrder: {}, tileHidden: [], tileOrder: [], topHidden: [], scale: 1, preset: 'full' };
  var ALWAYS = /^(dashboard|settings)$/i;               // can never be hidden, so nobody locks themselves out
  var PRESETS = {
    full:    { label: 'Everything', keep: null },
    creator: { label: 'Creator',    keep: /dashboard|chat|agents|office|media|social|document|library|workflow|forge|settings/i },
    trader:  { label: 'Trader',     keep: /dashboard|chat|agents|market|news|signal|wallet|sentiment|economy|settings/i },
    builder: { label: 'Builder',    keep: /dashboard|chat|agents|office|workflow|automation|tool|api|forge|security|settings/i },
    minimal: { label: 'Minimal',    keep: /dashboard|chat|agents|office|settings/i }
  };
  var S = load();

  function load() { try { var v = JSON.parse(localStorage.getItem(KEY) || 'null'); return Object.assign({}, DEFAULT, v || {}); } catch (e) { return Object.assign({}, DEFAULT); } }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }
  function txt(el) { return (el.textContent || '').replace(/\s+/g, ' ').trim(); }
  function label(el) { var l = el.querySelector && el.querySelector('.dl-lbl'); return l ? txt(l) : (txt(el) || el.getAttribute('title') || '').replace(/^[^\w]+/, '').trim(); }
  function sbItems() { return [].slice.call(document.querySelectorAll('#sbNav .sb-list .sbt')); }
  function tiles() { return [].slice.call(document.querySelectorAll('#dashLauncher .dl-tile')); }
  function tops() { return [].slice.call(document.querySelectorAll('#topBar .tb-seg')).filter(function (b) { return b.id !== 'tbMcChip'; }); }
  function groupOf(btn) { var p = btn.previousElementSibling; while (p && p.classList && p.classList.contains('sbt')) p = p.previousElementSibling; return p ? txt(p) : 'Menu'; }

  /* ── apply ── */
  function ensureCss() {
    if (document.getElementById('shdLayoutCss')) return;
    var s = document.createElement('style'); s.id = 'shdLayoutCss';
    s.textContent =
      '.shd-hidden{display:none !important}' +
      '#shdLayoutBtn{display:inline-flex;align-items:center;gap:6px;margin:0 0 10px;padding:0 12px;min-height:30px;border-radius:9px;cursor:pointer;font:600 11px "Rajdhani",sans-serif;letter-spacing:.09em;text-transform:uppercase;' +
        'color:var(--accent,#00e5a0);background:color-mix(in srgb,var(--accent,#00e5a0) 10%,transparent);border:1px solid color-mix(in srgb,var(--accent,#00e5a0) 38%,transparent)}' +
      '#shdLayoutBtn:hover{background:color-mix(in srgb,var(--accent,#00e5a0) 18%,transparent)}' +
      '#shdLayout{position:fixed;inset:0;z-index:100002;display:none;align-items:center;justify-content:center;background:rgba(2,5,10,.74);backdrop-filter:blur(6px)}' +
      '#shdLayout.on{display:flex}' +
      '#shdLayout .box{width:min(820px,95vw);max-height:90vh;overflow:auto;border-radius:16px;padding:20px;background:var(--bg-card,#0a0e13);color:var(--text-primary,#e9efe9);border:1px solid color-mix(in srgb,var(--text-primary,#e9efe9) 22%,transparent);box-shadow:0 30px 80px rgba(0,0,0,.6)}' +
      '#shdLayout h2{margin:0 0 4px;font:700 18px "Rajdhani",sans-serif;letter-spacing:.1em;text-transform:uppercase;color:var(--accent,#00e5a0)}' +
      '#shdLayout .sub{margin:0 0 14px;font-size:12px;color:var(--text-muted,#8a99a6)}' +
      '#shdLayout h3{margin:18px 0 8px;font:700 12px "Rajdhani",sans-serif;letter-spacing:.12em;text-transform:uppercase;color:var(--text-muted,#8a99a6)}' +
      '#shdLayout .chips{display:flex;flex-wrap:wrap;gap:6px}' +
      '#shdLayout .chip{min-height:32px;padding:0 14px;border-radius:999px;cursor:pointer;font:600 12px "Rajdhani",sans-serif;letter-spacing:.08em;text-transform:uppercase;color:var(--text-primary,#e9efe9);background:transparent;border:1px solid color-mix(in srgb,var(--text-primary,#e9efe9) 26%,transparent)}' +
      '#shdLayout .chip.on{background:var(--accent,#00e5a0);color:var(--bg-deep,#03150f);border-color:transparent}' +
      '#shdLayout .cols{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:14px}' +
      '#shdLayout .list{display:grid;gap:4px}' +
      '#shdLayout .row{display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:8px;border:1px solid color-mix(in srgb,var(--text-primary,#e9efe9) 14%,transparent);font-size:13px;cursor:grab}' +
      '#shdLayout .row.drag{opacity:.4}' +
      '#shdLayout .row label{display:flex;align-items:center;gap:8px;flex:1;cursor:pointer}' +
      '#shdLayout .row input{accent-color:var(--accent,#00e5a0)}' +
      '#shdLayout .row .mv{border:0;background:transparent;color:var(--text-muted,#8a99a6);cursor:pointer;font-size:14px;padding:2px 6px;border-radius:6px}' +
      '#shdLayout .row .mv:hover{color:var(--accent,#00e5a0);background:color-mix(in srgb,var(--accent,#00e5a0) 10%,transparent)}' +
      '#shdLayout .grp{margin:8px 0 2px;font:700 10px "Rajdhani",sans-serif;letter-spacing:.14em;text-transform:uppercase;color:var(--text-muted,#8a99a6)}' +
      '#shdLayout .foot{display:flex;gap:8px;justify-content:space-between;margin-top:18px;flex-wrap:wrap}';
    document.head.appendChild(s);
  }

  function apply() {
    ensureCss();
    // sidebar: order within group, then visibility
    var items = sbItems();
    items.forEach(function (b) {
      var g = groupOf(b), order = S.sbOrder[g];
      b.classList.toggle('shd-hidden', S.sbHidden.indexOf(label(b)) > -1 && !ALWAYS.test(label(b)));
    });
    Object.keys(S.sbOrder).forEach(function (g) {
      var inG = items.filter(function (b) { return groupOf(b) === g; });
      var ord = S.sbOrder[g]; if (!ord || !ord.length || !inG.length) return;
      var anchor = inG[0].previousElementSibling; // group label
      var sorted = inG.slice().sort(function (a, b) { var x = ord.indexOf(label(a)), y = ord.indexOf(label(b)); return (x < 0 ? 999 : x) - (y < 0 ? 999 : y); });
      var ref = anchor ? anchor.nextSibling : null;
      sorted.forEach(function (b) { anchor.parentNode.insertBefore(b, ref); ref = b.nextSibling; });
    });
    // hide a group label when every item under it is hidden
    [].forEach.call(document.querySelectorAll('#sbNav .sb-list > div'), function (lab) {
      var n = lab.nextElementSibling, any = false;
      while (n && n.classList && n.classList.contains('sbt')) { if (!n.classList.contains('shd-hidden')) any = true; n = n.nextElementSibling; }
      if (lab.nextElementSibling && lab.nextElementSibling.classList.contains('sbt')) lab.classList.toggle('shd-hidden', !any);
    });
    // tiles
    var ts = tiles(), host = document.getElementById('dashLauncher');
    ts.forEach(function (t) { t.classList.toggle('shd-hidden', S.tileHidden.indexOf(label(t)) > -1); });
    if (host && S.tileOrder.length) {
      ts.slice().sort(function (a, b) { var x = S.tileOrder.indexOf(label(a)), y = S.tileOrder.indexOf(label(b)); return (x < 0 ? 999 : x) - (y < 0 ? 999 : y); })
        .forEach(function (t) { host.appendChild(t); });
    }
    // top bar
    tops().forEach(function (b) { b.classList.toggle('shd-hidden', S.topHidden.indexOf(label(b)) > -1); });
    // interface size
    document.documentElement.style.zoom = S.scale && S.scale !== 1 ? String(S.scale) : '';
  }

  function applyPreset(id) {
    var p = PRESETS[id]; S.preset = id;
    if (!p || !p.keep) { S.sbHidden = []; S.tileHidden = []; }
    else {
      S.sbHidden = sbItems().map(label).filter(function (l) { return !ALWAYS.test(l) && !p.keep.test(l); });
      S.tileHidden = tiles().map(label).filter(function (l) { return !p.keep.test(l); });
    }
    save(); apply(); render();
  }

  /* ── dialog ── */
  var dlg;
  function build() {
    if (dlg) return dlg;
    dlg = document.createElement('div'); dlg.id = 'shdLayout'; dlg.setAttribute('role', 'dialog'); dlg.setAttribute('aria-modal', 'true'); dlg.setAttribute('aria-label', 'Customize layout');
    dlg.innerHTML = '<div class="box"><h2>Customize your dashboard</h2><p class="sub">Choose what you see and in what order. Nothing is deleted: hidden items come back any time. Saved on this device.</p><div id="shdLayoutBody"></div></div>';
    document.body.appendChild(dlg);
    dlg.addEventListener('mousedown', function (e) { if (e.target === dlg) close(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && dlg.classList.contains('on')) close(); });
    return dlg;
  }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

  function listRows(root, names, hidden, onToggle, onMove, lockRe) {
    names.forEach(function (name, i) {
      var row = el('div', 'row'); row.draggable = true; row.dataset.name = name;
      var lab = el('label'); var cb = el('input'); cb.type = 'checkbox'; cb.checked = hidden.indexOf(name) < 0;
      if (lockRe && lockRe.test(name)) { cb.checked = true; cb.disabled = true; }
      cb.addEventListener('change', function () { onToggle(name, cb.checked); });
      lab.appendChild(cb); lab.appendChild(el('span', '', name)); row.appendChild(lab);
      if (onMove) {
        [['↑', -1, 'Move up'], ['↓', 1, 'Move down']].forEach(function (m) {
          var b = el('button', 'mv', m[0]); b.type = 'button'; b.title = m[2]; b.setAttribute('aria-label', m[2] + ' ' + name);
          b.addEventListener('click', function () { onMove(name, m[1]); }); row.appendChild(b);
        });
        row.addEventListener('dragstart', function (e) { row.classList.add('drag'); e.dataTransfer.setData('text/plain', name); e.dataTransfer.effectAllowed = 'move'; });
        row.addEventListener('dragend', function () { row.classList.remove('drag'); });
        row.addEventListener('dragover', function (e) { e.preventDefault(); });
        row.addEventListener('drop', function (e) {
          e.preventDefault(); var from = e.dataTransfer.getData('text/plain'); if (!from || from === name) return;
          var from_i = names.indexOf(from), to_i = names.indexOf(name); onMove(from, to_i - from_i);
        });
      }
      root.appendChild(row);
    });
  }
  function moveIn(arr, name, delta) { var i = arr.indexOf(name), j = i + delta; if (i < 0 || j < 0 || j >= arr.length) return arr; var a = arr.slice(); a.splice(j, 0, a.splice(i, 1)[0]); return a; }

  function render() {
    if (!dlg) return;
    var body = document.getElementById('shdLayoutBody'); body.innerHTML = '';
    // presets
    body.appendChild(el('h3', '', 'Start from a preset'));
    var chips = el('div', 'chips');
    Object.keys(PRESETS).forEach(function (id) { var c = el('button', 'chip' + (S.preset === id ? ' on' : ''), PRESETS[id].label); c.type = 'button'; c.addEventListener('click', function () { applyPreset(id); }); chips.appendChild(c); });
    body.appendChild(chips);
    // size
    body.appendChild(el('h3', '', 'Interface size'));
    var sz = el('div', 'chips');
    [['Compact', 0.92], ['Default', 1], ['Large', 1.1], ['Extra large', 1.22]].forEach(function (o) { var c = el('button', 'chip' + (Math.abs((S.scale || 1) - o[1]) < .01 ? ' on' : ''), o[0]); c.type = 'button'; c.addEventListener('click', function () { S.scale = o[1]; save(); apply(); render(); }); sz.appendChild(c); });
    body.appendChild(sz);

    var cols = el('div', 'cols');
    // tiles
    var c1 = el('div'); c1.appendChild(el('h3', '', 'Home tiles'));
    var l1 = el('div', 'list');
    var tnames = tiles().map(label);
    var tord = S.tileOrder.length ? S.tileOrder.filter(function (n) { return tnames.indexOf(n) > -1; }).concat(tnames.filter(function (n) { return S.tileOrder.indexOf(n) < 0; })) : tnames;
    listRows(l1, tord, S.tileHidden, function (n, on) { S.tileHidden = on ? S.tileHidden.filter(function (x) { return x !== n; }) : S.tileHidden.concat(n); S.preset = 'custom'; save(); apply(); },
      function (n, d) { S.tileOrder = moveIn(tord, n, d); S.preset = 'custom'; save(); apply(); render(); });
    c1.appendChild(l1); cols.appendChild(c1);
    // sidebar
    var c2 = el('div'); c2.appendChild(el('h3', '', 'Sidebar'));
    var byG = {}; sbItems().forEach(function (b) { (byG[groupOf(b)] = byG[groupOf(b)] || []).push(label(b)); });
    Object.keys(byG).forEach(function (g) {
      c2.appendChild(el('div', 'grp', g)); var l = el('div', 'list');
      listRows(l, byG[g], S.sbHidden, function (n, on) { S.sbHidden = on ? S.sbHidden.filter(function (x) { return x !== n; }) : S.sbHidden.concat(n); S.preset = 'custom'; save(); apply(); },
        function (n, d) { S.sbOrder[g] = moveIn(byG[g], n, d); S.preset = 'custom'; save(); apply(); render(); }, ALWAYS);
      c2.appendChild(l);
    });
    cols.appendChild(c2);
    // top bar
    var c3 = el('div'); c3.appendChild(el('h3', '', 'Top bar'));
    var l3 = el('div', 'list');
    listRows(l3, tops().map(label), S.topHidden, function (n, on) { S.topHidden = on ? S.topHidden.filter(function (x) { return x !== n; }) : S.topHidden.concat(n); S.preset = 'custom'; save(); apply(); }, null);
    c3.appendChild(l3); cols.appendChild(c3);
    body.appendChild(cols);

    var foot = el('div', 'foot');
    var reset = el('button', 'chip', 'Reset to default'); reset.type = 'button'; reset.addEventListener('click', function () { S = Object.assign({}, DEFAULT); save(); apply(); render(); });
    var done = el('button', 'chip on', 'Done'); done.type = 'button'; done.addEventListener('click', close);
    foot.appendChild(reset); foot.appendChild(done); body.appendChild(foot);
  }
  function open() { build(); render(); dlg.classList.add('on'); }
  function close() { if (dlg) dlg.classList.remove('on'); }

  /* ── entry points: home toolbar + Settings ── */
  function addButtons() {
    var host = document.getElementById('dashLauncher');
    if (host && !document.getElementById('shdLayoutBtn')) {
      var b = document.createElement('button'); b.id = 'shdLayoutBtn'; b.type = 'button'; b.textContent = '⚙ Customize layout'; b.addEventListener('click', open);
      host.parentNode.insertBefore(b, host);
    }
    var first = document.querySelector('#settingsView .settings-section');
    if (first && !document.getElementById('shdLayoutSetting')) {
      var sec = document.createElement('div'); sec.id = 'shdLayoutSetting'; sec.className = 'settings-section'; sec.setAttribute('data-sgrp', 'appearance');
      sec.innerHTML = '<div class="settings-title">Layout</div><div style="font-size:12px;color:var(--text-muted);margin:6px 0 10px">Choose which tabs, tiles and buttons you see, reorder them, and set the interface size.</div>';
      var sb = document.createElement('button'); sb.className = 'btn btn-accent'; sb.type = 'button'; sb.textContent = 'Customize layout'; sb.addEventListener('click', open);
      sec.appendChild(sb); first.parentNode.insertBefore(sec, first);
    }
  }

  window.shdLayout = { open: open, close: close, apply: apply, preset: applyPreset, state: function () { return S; } };
  function boot() { var n = 0, t = setInterval(function () { apply(); addButtons(); if (++n > 12) clearInterval(t); }, 700); apply(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
