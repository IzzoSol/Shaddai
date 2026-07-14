/* ══════════════════════════════════════════════════════════════════
   tool-runner.js — dashboard Tool Runner (the wiring).

   Makes every registered engine tool RUNNABLE from the dashboard:
     • lists all tools from GET /api/agent/tools (name, desc, schema, agents)
     • search + filter by agent
     • renders inputs from each tool's `schema`
     • runs via POST /api/tools/run { tool, args } → shows the REAL result

   Exposes:
     window.openToolRunner({ agent, tool })  — open (optionally filtered/preselected)
   Additive, null-safe, on-theme. One-line include in index.html.
   ══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var CACHE = null, SELECTED = null, FILTER_AGENT = '', FILTER_CAT = '';
  var AGENTS = ['ALL', 'SHADDAI', 'NEXUS', 'ZEROX', 'ORACLE', 'TURTLE', 'QUILL', 'PIKADON'];

  function css() {
    if (document.getElementById('toolRunnerCss')) return;
    var s = document.createElement('style'); s.id = 'toolRunnerCss';
    s.textContent = [
      '#toolRunnerOverlay{position:fixed;inset:0;z-index:100050;display:none;align-items:center;justify-content:center;background:rgba(3,6,12,.82);backdrop-filter:blur(8px)}',
      '#toolRunnerOverlay .tr-shell{width:min(1040px,96vw);height:min(88vh,760px);display:grid;grid-template-columns:320px 1fr;background:linear-gradient(180deg,#080c14,#04060c);border:1.5px solid rgba(0,229,160,.4);border-radius:14px;overflow:hidden;box-shadow:0 24px 80px rgba(0,0,0,.7),0 0 60px rgba(0,229,160,.12)}',
      '#toolRunnerOverlay .tr-left{display:flex;flex-direction:column;border-right:1px solid rgba(0,229,160,.18);min-height:0}',
      '#toolRunnerOverlay .tr-head{display:flex;align-items:center;justify-content:space-between;padding:14px 14px 10px}',
      '#toolRunnerOverlay .tr-title{font-family:"Press Start 2P",monospace;font-size:11px;color:#00e5a0;text-shadow:0 0 12px rgba(0,229,160,.6)}',
      '#toolRunnerOverlay .tr-x{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.14);border-radius:6px;color:#9fb0c3;width:28px;height:28px;cursor:pointer;font-size:13px}',
      '#toolRunnerOverlay .tr-search{margin:0 14px 8px;padding:8px 10px;background:rgba(0,0,0,.4);border:1px solid rgba(0,229,160,.25);border-radius:8px;color:#e8ecf2;font-family:"Share Tech Mono",monospace;font-size:12px;outline:none}',
      '#toolRunnerOverlay .tr-cat{margin:0 14px 8px;padding:7px 10px;background:rgba(0,0,0,.4);border:1px solid rgba(0,229,160,.25);border-radius:8px;color:#bfe9d8;font-family:"Share Tech Mono",monospace;font-size:11px;outline:none;cursor:pointer}',
      '#toolRunnerOverlay .tr-cat option{background:#04060c;color:#e8ecf2}',
      '#toolRunnerOverlay .tr-agents{display:flex;flex-wrap:wrap;gap:4px;padding:0 14px 8px}',
      '#toolRunnerOverlay .tr-ag{font-family:"Share Tech Mono",monospace;font-size:8px;letter-spacing:.5px;padding:3px 7px;border-radius:20px;border:1px solid rgba(255,255,255,.14);color:#9fb0c3;cursor:pointer;background:transparent}',
      '#toolRunnerOverlay .tr-ag.on{border-color:#00e5a0;color:#00e5a0;background:rgba(0,229,160,.12)}',
      '#toolRunnerOverlay .tr-list{flex:1;overflow:auto;padding:0 8px 10px;min-height:0}',
      '#toolRunnerOverlay .tr-item{padding:8px 10px;border-radius:8px;cursor:pointer;border:1px solid transparent;margin-bottom:3px}',
      '#toolRunnerOverlay .tr-item:hover{background:rgba(0,229,160,.06)}',
      '#toolRunnerOverlay .tr-item.on{background:rgba(0,229,160,.12);border-color:rgba(0,229,160,.4)}',
      '#toolRunnerOverlay .tr-iname{font-family:"Share Tech Mono",monospace;font-size:12px;color:#e8ecf2;font-weight:700}',
      '#toolRunnerOverlay .tr-idesc{font-size:9.5px;color:#7c8aa0;margin-top:2px;line-height:1.35}',
      '#toolRunnerOverlay .tr-right{display:flex;flex-direction:column;min-height:0;padding:16px 18px;overflow:auto}',
      '#toolRunnerOverlay .tr-rt{font-family:"Press Start 2P",monospace;font-size:12px;color:#00e5a0;margin-bottom:4px}',
      '#toolRunnerOverlay .tr-rd{font-size:11px;color:#9fb0c3;line-height:1.5;margin-bottom:14px}',
      '#toolRunnerOverlay .tr-field{margin-bottom:11px}',
      '#toolRunnerOverlay .tr-flbl{display:block;font-family:"Share Tech Mono",monospace;font-size:9px;letter-spacing:1px;color:rgba(0,229,160,.8);margin-bottom:5px;text-transform:uppercase}',
      '#toolRunnerOverlay .tr-fin{width:100%;box-sizing:border-box;padding:9px 11px;background:rgba(0,0,0,.4);border:1px solid rgba(0,229,160,.22);border-radius:8px;color:#e8ecf2;font-family:"Share Tech Mono",monospace;font-size:12px;outline:none}',
      '#toolRunnerOverlay .tr-fin:focus{border-color:#00e5a0}',
      '#toolRunnerOverlay .tr-run{margin-top:6px;padding:12px;background:linear-gradient(135deg,#00e5a0,#00b37e);border:none;border-radius:9px;color:#04120c;font-family:"Press Start 2P",monospace;font-size:10px;cursor:pointer;box-shadow:0 0 18px rgba(0,229,160,.4)}',
      '#toolRunnerOverlay .tr-run:disabled{opacity:.6;cursor:wait}',
      '#toolRunnerOverlay .tr-result{margin-top:16px;background:#02040a;border:1px solid rgba(0,229,160,.25);border-radius:9px;padding:12px;font-family:"Share Tech Mono",monospace;font-size:11px;color:#bfe9d8;white-space:pre-wrap;word-break:break-word;max-height:280px;overflow:auto}',
      '#toolRunnerOverlay .tr-chip{display:inline-block;font-family:"Share Tech Mono",monospace;font-size:7.5px;letter-spacing:.5px;padding:2px 6px;border-radius:20px;border:1px solid rgba(0,229,160,.3);color:#00e5a0;margin:0 3px 3px 0}',
      '#toolRunnerOverlay .tr-empty{color:#7c8aa0;font-size:11px;text-align:center;padding:40px 10px;font-family:"Share Tech Mono",monospace}',
      '#toolRunnerLaunch{cursor:pointer}'
    ].join('');
    document.head.appendChild(s);
  }

  function esc(s) { return String(s == null ? '' : s).replace(/[<>&"]/g, function (c) { return { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]; }); }

  function ensureOverlay() {
    css();
    var o = document.getElementById('toolRunnerOverlay');
    if (o) return o;
    o = document.createElement('div'); o.id = 'toolRunnerOverlay';
    o.innerHTML =
      '<div class="tr-shell">' +
        '<div class="tr-left">' +
          '<div class="tr-head"><span class="tr-title">⚙ TOOLS</span><button class="tr-x" title="Close">✕</button></div>' +
          '<input class="tr-search" placeholder="search tools…" />' +
          '<select class="tr-cat"><option value="">◆ All categories</option></select>' +
          '<div class="tr-agents"></div>' +
          '<div class="tr-list"></div>' +
        '</div>' +
        '<div class="tr-right"><div class="tr-empty">Select a tool on the left to run it.</div></div>' +
      '</div>';
    document.body.appendChild(o);
    o.addEventListener('click', function (e) { if (e.target === o) hide(); });
    o.querySelector('.tr-x').onclick = hide;
    o.querySelector('.tr-search').oninput = function () { renderList(this.value); };
    o.querySelector('.tr-cat').onchange = function () { FILTER_CAT = this.value; renderList(o.querySelector('.tr-search').value); };
    var ag = o.querySelector('.tr-agents');
    AGENTS.forEach(function (a) {
      var b = document.createElement('button'); b.className = 'tr-ag' + (a === 'ALL' ? ' on' : ''); b.textContent = a; b.dataset.ag = a;
      b.onclick = function () { FILTER_AGENT = (a === 'ALL' ? '' : a); [].forEach.call(ag.children, function (x) { x.classList.toggle('on', x.dataset.ag === a); }); renderList(o.querySelector('.tr-search').value); };
      ag.appendChild(b);
    });
    return o;
  }

  function toolsFor() {
    var arr = CACHE || [];
    return arr.filter(function (t) {
      if (FILTER_CAT && (t.category || 'Uncategorized') !== FILTER_CAT) return false;
      if (!FILTER_AGENT) return true;
      return (t.agents || []).indexOf(FILTER_AGENT) >= 0 || !(t.agents && t.agents.length);
    });
  }

  // Populate the category dropdown from the loaded tool registry (distinct categories + counts).
  function populateCats() {
    var o = document.getElementById('toolRunnerOverlay'); if (!o) return;
    var sel = o.querySelector('.tr-cat'); if (!sel) return;
    var counts = {};
    (CACHE || []).forEach(function (t) { var c = t.category || 'Uncategorized'; counts[c] = (counts[c] || 0) + 1; });
    var cats = Object.keys(counts).sort();
    sel.innerHTML = '<option value="">◆ All categories (' + (CACHE || []).length + ')</option>' +
      cats.map(function (c) { return '<option value="' + esc(c) + '"' + (c === FILTER_CAT ? ' selected' : '') + '>' + esc(c) + ' (' + counts[c] + ')</option>'; }).join('');
  }

  function renderList(q) {
    var o = ensureOverlay(); var list = o.querySelector('.tr-list');
    q = (q || '').toLowerCase().trim();
    var items = toolsFor().filter(function (t) {
      if (!q) return true;
      return (t.name || '').toLowerCase().indexOf(q) >= 0 || (t.description || '').toLowerCase().indexOf(q) >= 0;
    });
    if (!items.length) { list.innerHTML = '<div class="tr-empty">No tools match.</div>'; return; }
    list.innerHTML = items.map(function (t) {
      return '<div class="tr-item" data-name="' + esc(t.name) + '"><div class="tr-iname">' + esc(t.name) + '</div><div class="tr-idesc">' + esc((t.description || '').slice(0, 90)) + '</div></div>';
    }).join('');
    [].forEach.call(list.querySelectorAll('.tr-item'), function (el) {
      el.onclick = function () {
        [].forEach.call(list.querySelectorAll('.tr-item'), function (x) { x.classList.remove('on'); });
        el.classList.add('on');
        select(el.dataset.name);
      };
    });
  }

  function select(name) {
    SELECTED = (CACHE || []).find(function (t) { return t.name === name; });
    var right = ensureOverlay().querySelector('.tr-right');
    if (!SELECTED) { right.innerHTML = '<div class="tr-empty">Tool not found.</div>'; return; }
    var schema = SELECTED.schema || {};
    var keys = Object.keys(schema);
    var agents = (SELECTED.agents || []).map(function (a) { return '<span class="tr-chip">' + esc(a) + '</span>'; }).join('');
    var fields = keys.length ? keys.map(function (k) {
      var hint = String(schema[k] || '');
      var isNum = /number/i.test(hint);
      return '<div class="tr-field"><label class="tr-flbl">' + esc(k) + (/optional/i.test(hint) ? ' (optional)' : '') + '</label>' +
        '<input class="tr-fin" data-k="' + esc(k) + '" type="' + (isNum ? 'number' : 'text') + '" placeholder="' + esc(hint) + '"></div>';
    }).join('') : '<div class="tr-rd">No inputs — just run it.</div>';
    right.innerHTML =
      '<div class="tr-rt">' + esc(SELECTED.name) + '</div>' +
      '<div class="tr-rd">' + esc(SELECTED.description || '') + '<br>' + agents + '</div>' +
      fields +
      '<button class="tr-run">▶ RUN TOOL</button>' +
      '<div class="tr-result" style="display:none"></div>';
    right.querySelector('.tr-run').onclick = run;
    var first = right.querySelector('.tr-fin'); if (first) first.focus();
  }

  async function run() {
    var right = ensureOverlay().querySelector('.tr-right');
    var btn = right.querySelector('.tr-run'); var out = right.querySelector('.tr-result');
    var args = {};
    [].forEach.call(right.querySelectorAll('.tr-fin'), function (i) { var v = i.value.trim(); if (v !== '') args[i.dataset.k] = (i.type === 'number' ? Number(v) : v); });
    btn.disabled = true; btn.textContent = '⏳ RUNNING…';
    out.style.display = 'block'; out.textContent = 'Running ' + SELECTED.name + '…';
    try {
      var r = await fetch('/api/tools/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tool: SELECTED.name, args: args }) });
      var d = await r.json();
      var res = d.ok ? d.result : (d.error || 'failed');
      out.textContent = (typeof res === 'string') ? res : JSON.stringify(res, null, 2);
    } catch (e) { out.textContent = 'Error: ' + e.message; }
    btn.disabled = false; btn.textContent = '▶ RUN TOOL';
  }

  async function load() {
    if (CACHE) return CACHE;
    try {
      var r = await fetch('/api/agent/tools'); var d = await r.json();
      var arr = d.tools || d; CACHE = (Array.isArray(arr) ? arr : Object.values(arr)).filter(function (t) { return t && t.name && typeof t.execute !== 'function'; });
      // some payloads include execute; strip nothing — just ensure name exists
      CACHE = (Array.isArray(arr) ? arr : Object.values(arr)).filter(function (t) { return t && t.name; });
    } catch (e) { CACHE = []; }
    return CACHE;
  }

  function hide() { var o = document.getElementById('toolRunnerOverlay'); if (o) o.style.display = 'none'; }

  window.openToolRunner = async function (opts) {
    opts = opts || {};
    var o = ensureOverlay();
    await load();
    populateCats();
    if (opts.agent) { FILTER_AGENT = String(opts.agent).toUpperCase(); [].forEach.call(o.querySelectorAll('.tr-ag'), function (x) { x.classList.toggle('on', x.dataset.ag === FILTER_AGENT); }); }
    o.style.display = 'flex';
    renderList('');
    if (opts.tool) { select(opts.tool); var li = o.querySelector('.tr-item[data-name="' + opts.tool + '"]'); if (li) li.classList.add('on'); }
  };

  // Inject a launch button into the HQ header strip if present (non-blocking; retries a few times).
  function injectLauncher() {
    if (document.getElementById('toolRunnerLaunch')) return true;
    var host = document.querySelector('#marketplaceView .hq-btn') && document.querySelector('#marketplaceView .hq-btn').parentElement;
    if (!host) return false;
    var b = document.createElement('button');
    b.id = 'toolRunnerLaunch'; b.className = 'hq-btn';
    b.style.cssText = 'color:#00e5a0;border-color:rgba(0,229,160,.4);background:rgba(0,229,160,.08)';
    b.innerHTML = '<svg class="hq-i" viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h10"/></svg>TOOLS';
    b.onclick = function () { window.openToolRunner(); };
    host.appendChild(b);
    return true;
  }
  var tries = 0; var iv = setInterval(function () { tries++; if (injectLauncher() || tries > 40) clearInterval(iv); }, 500);
})();
