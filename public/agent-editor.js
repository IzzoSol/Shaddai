/* agent-editor.js — re-edit a forged operative's tools, anywhere.
 * Dependency-free IIFE. Exposes:  window.SHADDAI_AGENT_EDITOR.open(operativeId, cap)
 *
 * Persistence (matches the live backend):
 *   GET   /api/operatives            -> { ok, operatives:[ { id, codename, tools:[...], ... } ] }
 *   GET   /api/agent/tools           -> { tools:[ { name, description, ... } ], total }
 *   PATCH /api/operatives/:id  body { tools:[...] }  -> { ok, operative }
 *     (the store Object.assign-merges the patch and recomputes stats from tools)
 *
 * Design goals: never throw, null-safe on every DOM/JSON access, tier cap respected.
 */
(function () {
  'use strict';
  if (typeof window === 'undefined') return;
  if (window.SHADDAI_AGENT_EDITOR) return; // already mounted

  var ROOT_ID = 'shdAgentEditor';
  var state = { op: null, cap: 20, selected: [], all: [], busy: false };

  function el(tag, cls, txt) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (txt != null) n.textContent = String(txt);
    return n;
  }
  function byId(id) { return document.getElementById(id); }

  // ── one persistent root, built once ──────────────────────────────────────
  function ensureRoot() {
    var root = byId(ROOT_ID);
    if (root) return root;
    root = el('div'); root.id = ROOT_ID;

    var card = el('div', 'shd-card');

    var hd = el('div', 'shd-hd');
    var hdText = el('div');
    hdText.appendChild(document.createTextNode('✎ EDIT TOOLS'));
    var sub = el('span', 'shd-sub', 'operative'); sub.id = 'shdAeSub';
    hdText.appendChild(sub);
    hd.appendChild(hdText);
    var x = el('button', 'shd-x', '×'); x.type = 'button'; x.onclick = close;
    hd.appendChild(x);

    var body = el('div', 'shd-body');

    var lab = el('div', 'shd-lab');
    lab.appendChild(document.createTextNode('Equipped tools'));
    var count = el('span', 'shd-count', '0 / 20'); count.id = 'shdAeCount';
    lab.appendChild(count);
    body.appendChild(lab);

    var tools = el('div', 'shd-tools'); tools.id = 'shdAeChips';
    body.appendChild(tools);

    var lab2 = el('div', 'shd-lab', 'Add a tool'); lab2.style.marginTop = '14px';
    body.appendChild(lab2);
    var search = el('input', 'shd-search'); search.id = 'shdAeSearch';
    search.type = 'text'; search.placeholder = 'search available tools…';
    search.oninput = renderPicker;
    body.appendChild(search);
    var picker = el('div', 'shd-picker'); picker.id = 'shdAePicker';
    body.appendChild(picker);

    var ft = el('div', 'shd-ft');
    var msg = el('div', 'shd-msg'); msg.id = 'shdAeMsg';
    ft.appendChild(msg);
    var cancel = el('button', 'shd-cancel', 'Cancel'); cancel.type = 'button'; cancel.onclick = close;
    ft.appendChild(cancel);
    var save = el('button', 'shd-save', 'Save'); save.type = 'button'; save.id = 'shdAeSave'; save.onclick = doSave;
    ft.appendChild(save);

    card.appendChild(hd); card.appendChild(body); card.appendChild(ft);
    root.appendChild(card);
    root.addEventListener('click', function (e) { if (e && e.target === root) close(); });
    document.addEventListener('keydown', function (e) {
      if (e && e.key === 'Escape' && root.classList.contains('shd-open')) close();
    });
    (document.body || document.documentElement).appendChild(root);
    return root;
  }

  function setMsg(text, kind) {
    var m = byId('shdAeMsg'); if (!m) return;
    m.textContent = text || '';
    m.className = 'shd-msg' + (kind ? ' shd-' + kind : '');
  }

  // ── rendering ─────────────────────────────────────────────────────────────
  function renderChips() {
    var wrap = byId('shdAeChips'); if (!wrap) return;
    wrap.textContent = '';
    if (!state.selected.length) {
      wrap.appendChild(el('div', 'shd-empty', 'no tools bound — add one below'));
    } else {
      state.selected.forEach(function (name) {
        var chip = el('div', 'shd-chip');
        chip.appendChild(el('span', null, name));
        var rm = el('span', 'shd-rm', '×');
        rm.title = 'remove ' + name;
        rm.onclick = function () { removeTool(name); };
        chip.appendChild(rm);
        wrap.appendChild(chip);
      });
    }
    var c = byId('shdAeCount');
    if (c) {
      c.textContent = state.selected.length + ' / ' + state.cap;
      c.className = 'shd-count' + (state.selected.length >= state.cap ? ' shd-full' : '');
    }
  }

  function renderPicker() {
    var picker = byId('shdAePicker'); if (!picker) return;
    picker.textContent = '';
    var q = '';
    var s = byId('shdAeSearch'); if (s && s.value) q = String(s.value).toLowerCase().trim();
    var chosen = {}; state.selected.forEach(function (n) { chosen[n] = true; });
    var shown = 0;
    for (var i = 0; i < state.all.length; i++) {
      var t = state.all[i]; if (!t || !t.name) continue;
      var nm = String(t.name);
      if (q && nm.toLowerCase().indexOf(q) === -1 &&
          String(t.description || '').toLowerCase().indexOf(q) === -1) continue;
      var opt = el('div', 'shd-opt' + (chosen[nm] ? ' shd-on' : ''));
      opt.appendChild(el('span', null, (chosen[nm] ? '✓ ' : '+ ') + nm));
      if (t.description) opt.appendChild(el('small', null, String(t.description)));
      (function (name, isOn) {
        opt.onclick = function () { isOn ? removeTool(name) : addTool(name); };
      })(nm, !!chosen[nm]);
      picker.appendChild(opt);
      if (++shown >= 200) break;
    }
    if (!shown) picker.appendChild(el('div', 'shd-opt', q ? 'no tools match' : 'no tools available'));
  }

  function addTool(name) {
    if (!name) return;
    if (state.selected.indexOf(name) !== -1) return;
    if (state.selected.length >= state.cap) {
      setMsg('Cap reached — ' + state.cap + ' tools max on this core. Remove one or upgrade the core.', 'err');
      return;
    }
    state.selected.push(name);
    setMsg('');
    renderChips(); renderPicker();
  }
  function removeTool(name) {
    var i = state.selected.indexOf(name);
    if (i === -1) return;
    state.selected.splice(i, 1);
    setMsg('');
    renderChips(); renderPicker();
  }

  // ── data ──────────────────────────────────────────────────────────────────
  function fetchJSON(url, opts) {
    return fetch(url, opts).then(function (r) {
      return r.json().catch(function () { return null; });
    }).catch(function () { return null; });
  }

  function loadOperative(id) {
    return fetchJSON('/api/operatives').then(function (d) {
      var list = (d && Array.isArray(d.operatives)) ? d.operatives : [];
      for (var i = 0; i < list.length; i++) {
        if (list[i] && String(list[i].id) === String(id)) return list[i];
      }
      return null;
    });
  }
  function loadAllTools() {
    return fetchJSON('/api/agent/tools').then(function (d) {
      var list = (d && (d.tools || d.data)) || [];
      return Array.isArray(list) ? list : [];
    });
  }

  function doSave() {
    if (state.busy || !state.op) return;
    state.busy = true;
    var btn = byId('shdAeSave'); if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
    setMsg('saving…', null);
    fetchJSON('/api/operatives/' + encodeURIComponent(state.op.id), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tools: state.selected.slice() })
    }).then(function (r) {
      if (r && r.ok && r.operative) {
        setMsg('✓ saved — ' + (r.operative.tools ? r.operative.tools.length : state.selected.length) + ' tools bound', 'ok');
        state.op = r.operative;
        try {
          window.dispatchEvent(new CustomEvent('shaddai:operative-updated', { detail: r.operative }));
        } catch (e) {}
        setTimeout(close, 750);
      } else {
        setMsg('⚠ save failed' + (r && r.error ? (' — ' + r.error) : ' — server did not confirm'), 'err');
      }
    }).catch(function (e) {
      setMsg('⚠ ' + ((e && e.message) || 'network error'), 'err');
    }).then(function () {
      state.busy = false;
      var b = byId('shdAeSave'); if (b) { b.disabled = false; b.textContent = 'Save'; }
    });
  }

  function close() {
    var root = byId(ROOT_ID); if (root) root.classList.remove('shd-open');
  }

  // ── public API ──────────────────────────────────────────────────────────
  function open(operativeId, cap) {
    try {
      var root = ensureRoot();
      state.cap = (typeof cap === 'number' && cap > 0) ? cap : 20;
      state.busy = false;
      state.op = null; state.selected = []; state.all = [];
      root.classList.add('shd-open');
      var sub = byId('shdAeSub'); if (sub) sub.textContent = 'loading…';
      var chips = byId('shdAeChips'); if (chips) { chips.textContent = ''; chips.appendChild(el('div', 'shd-empty', 'loading…')); }
      var picker = byId('shdAePicker'); if (picker) picker.textContent = '';
      setMsg('');
      if (operativeId == null) { setMsg('⚠ no operative id given', 'err'); return; }

      Promise.all([loadOperative(operativeId), loadAllTools()]).then(function (res) {
        var op = res[0], tools = res[1] || [];
        state.all = tools;
        if (!op) {
          if (sub) sub.textContent = 'not found';
          setMsg('⚠ operative "' + operativeId + '" not found', 'err');
          if (chips) { chips.textContent = ''; chips.appendChild(el('div', 'shd-empty', '—')); }
          return;
        }
        state.op = op;
        state.selected = Array.isArray(op.tools) ? op.tools.filter(function (t) { return !!t; }).map(String) : [];
        // enforce cap on load: if the stored build exceeds the passed cap, trim + warn
        if (state.selected.length > state.cap) {
          setMsg('This core holds ' + state.cap + ' tools — trim ' + (state.selected.length - state.cap) + ' before saving.', 'err');
        }
        if (sub) sub.textContent = op.codename || op.id;
        renderChips(); renderPicker();
      });
    } catch (e) {
      // never throw
      try { setMsg('⚠ ' + ((e && e.message) || 'error'), 'err'); } catch (e2) {}
    }
  }

  window.SHADDAI_AGENT_EDITOR = { open: open, close: close };
})();
