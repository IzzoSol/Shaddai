/* world-editor.js — in-game PLACEMENT EDITOR (admin), 2026-09-25.
 *
 * Always-on core (tiny): modules call  window.__registerPlaceable(key, object3D, info)  for every placed model.
 * Saved owner edits (localStorage 'shd.placementEdits', or 'shd.placementEdits.v4' under ?map=v4) are re-applied the moment an object registers.
 *
 * Editor UI: open the world with ?edit=1 → Tab (free cursor) → click a model → gizmo:
 *   W move · E rotate · R scale · F focus camera · Del hide · Ctrl+Z undo last · Esc deselect
 * Panel: searchable list of every placed model, "Copy for Claude" (JSON of all edits), "Reset all".
 * Claude bakes the copied JSON into world-layout.js realmModels / world-falprops.js ITEMS (colliders follow).
 */
(function () {
  // Edits are namespaced by map version so Map v3 edits never pin Map v4 models (v3 keeps the original key).
  var _v4 = (window.WORLD_LAYOUT && window.WORLD_LAYOUT.mapVersion === 'v4') || /[?&]map=v4(?:&|$|#)/.test(location.search);
  var KEY = _v4 ? 'shd.placementEdits.v4' : 'shd.placementEdits';
  var edits = {}; try { edits = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) {}
  var reg = {};          // key -> { obj, info }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(edits)); } catch (e) {} }
  function apply(key, obj) {
    var e = edits[key]; if (!e) return;
    if (e.p) obj.position.set(e.p[0], e.p[1], e.p[2]);
    if (e.r != null) obj.rotation.y = e.r;
    if (e.s != null) obj.scale.setScalar(e.s);
    if (e.hidden) obj.visible = false;
  }
  window.__registerPlaceable = function (key, obj, info) {
    if (!obj) return;
    var k = key, n = 1; while (reg[k] && reg[k].obj !== obj) k = key + '~' + (++n);
    obj.userData.placeKey = k;
    reg[k] = { obj: obj, info: info || {} };
    apply(k, obj);
    if (window.__editor && window.__editor.refresh) window.__editor.refresh();
  };
  window.__placeables = reg;

  // ── shared model-load queue (used by world-falprops.js / world-nature.js): max 4 in flight, 2 retries.
  //    Bursting ~40 GLB requests at once overflowed small servers ('Failed to fetch') and fought the world
  //    build for bandwidth; a queue loads the same models reliably and smooths the intro. ──
  var Q = [], active = 0, MAX = 4;
  function pump() {
    while (active < MAX && Q.length) {
      var job = Q.shift(); active++;
      (function (j) {
        j.loader.load(j.url, function (g) { active--; try { j.ok(g); } catch (e) { console.warn('[loadQueue] handler error ' + j.url + ': ' + e.message); } pump(); },
          undefined, function (err) { active--; if (j.tries++ < 2) setTimeout(function () { Q.push(j); pump(); }, 600 * j.tries); else if (j.fail) j.fail(err); pump(); });
      })(job);
    }
  }
  window.__queueLoad = function (loader, url, ok, fail) { Q.push({ loader: loader, url: url, ok: ok, fail: fail, tries: 0 }); pump(); };

  if (!/[?&]edit=1\b/.test(location.search)) return;

  // ── editor UI (admin only) ──
  var css = document.createElement('style');
  css.textContent = '#ed{position:fixed;right:12px;top:70px;width:300px;max-height:calc(100vh - 90px);display:flex;flex-direction:column;gap:6px;background:rgba(10,14,20,.94);border:1px solid #e8c45c66;border-radius:12px;padding:10px;z-index:99999;font:12px system-ui;color:#dfe7ee}' +
    '#ed h3{margin:0;font-size:12px;letter-spacing:.14em;color:#e8c45c}#ed input{width:100%;box-sizing:border-box;background:#101822;border:1px solid #1d2733;color:#dfe7ee;border-radius:6px;padding:5px}' +
    '#ed .list{overflow:auto;flex:1;border:1px solid #1d2733;border-radius:8px}#ed .it{padding:4px 7px;cursor:pointer;border-bottom:1px solid #141b24;display:flex;justify-content:space-between}#ed .it:hover,#ed .it.on{background:#1b2533;color:#e8c45c}' +
    '#ed .row{display:flex;gap:5px;flex-wrap:wrap}#ed button{background:#101822;border:1px solid #1d2733;color:#dfe7ee;border-radius:6px;padding:5px 8px;cursor:pointer;font:inherit}#ed button.on,#ed button:hover{border-color:#e8c45c;color:#e8c45c}' +
    '#ed .sel{background:#080c11;border:1px solid #1d2733;border-radius:8px;padding:6px;font-family:ui-monospace,Consolas,monospace;font-size:11px;white-space:pre-wrap}';
  document.head.appendChild(css);
  var el = document.createElement('div'); el.id = 'ed';
  el.innerHTML = '<h3>PLACEMENT EDITOR</h3><div style="color:#7a8794">Tab = mouse · click a model · W move · E rotate · R scale · F focus · Del hide · Ctrl+Z undo</div>' +
    '<div class="row"><button data-m="translate" class="on">Move</button><button data-m="rotate">Rotate</button><button data-m="scale">Scale</button><button id="edSnap">Snap: off</button></div>' +
    '<div class="sel" id="edSel">Nothing selected.</div><input id="edQ" placeholder="search models…"><div class="list" id="edList"></div>' +
    '<div class="row"><button id="edCopy">Copy for Claude</button><button id="edReset">Reset all</button></div><div id="edCount" style="color:#7a8794"></div>';
  function mount() { if (!document.body) return setTimeout(mount, 100); document.body.appendChild(el); boot(); }
  mount();

  var selKey = null, tc = null, THREE = null, history = [], snap = false;
  function boot() {
    Promise.all([import('three'), import('three/addons/controls/TransformControls.js')]).then(function (mods) {
      THREE = mods[0]; var TC = mods[1].TransformControls;
      var wait = setInterval(function () {
        var D = window.__w3dDebug; if (!D || !D.scene || !D.camera) return; clearInterval(wait);
        var canvas = document.querySelector('canvas');
        tc = new TC(D.camera, canvas); tc.setSize(1.2); D.scene.add(tc.getHelper ? tc.getHelper() : tc);
        tc.addEventListener('mouseDown', function () { var o = tc.object; if (o) history.push({ k: selKey, p: o.position.toArray(), r: o.rotation.y, s: o.scale.x }); });
        tc.addEventListener('objectChange', function () { record(selKey); });
        canvas.addEventListener('pointerdown', pick);
        refresh();
      }, 300);
    }).catch(function (e) { document.getElementById('edSel').textContent = 'Editor failed to load: ' + e.message; });
  }
  function record(k) {
    var R = reg[k]; if (!R) return; var o = R.obj;
    edits[k] = Object.assign(edits[k] || {}, { p: o.position.toArray().map(function (v) { return Math.round(v * 100) / 100; }), r: Math.round(o.rotation.y * 1000) / 1000, s: Math.round(o.scale.x * 1000) / 1000 });
    save(); showSel();
  }
  function select(k) {
    selKey = k; var R = reg[k]; if (!R || !tc) return;
    tc.attach(R.obj); showSel();
    [].forEach.call(document.querySelectorAll('#edList .it'), function (d) { d.classList.toggle('on', d.dataset.k === k); });
  }
  function showSel() {
    var R = reg[selKey]; var box = document.getElementById('edSel');
    if (!R) { box.textContent = 'Nothing selected.'; return; }
    var o = R.obj, w = new (o.position.constructor)(); o.getWorldPosition(w);
    box.textContent = selKey + '\nworld x ' + w.x.toFixed(1) + '  z ' + w.z.toFixed(1) + '  y ' + w.y.toFixed(1) + '\nyaw ' + (o.rotation.y * 57.3).toFixed(0) + '°  scale ×' + o.scale.x.toFixed(2) + (edits[selKey] ? '\n✎ edited' : '');
  }
  function pick(ev) {
    if (!THREE || !tc || tc.dragging || ev.button !== 0) return;
    var D = window.__w3dDebug, c = ev.target.getBoundingClientRect();
    var ray = new THREE.Raycaster(); ray.setFromCamera(new THREE.Vector2(((ev.clientX - c.left) / c.width) * 2 - 1, -((ev.clientY - c.top) / c.height) * 2 + 1), D.camera);
    var objs = Object.keys(reg).map(function (k) { return reg[k].obj; }).filter(function (o) { return o.visible !== false; });
    var hit = ray.intersectObjects(objs, true)[0]; if (!hit) return;
    var o = hit.object; while (o && !o.userData.placeKey) o = o.parent;
    if (o) select(o.userData.placeKey);
  }
  function refresh() {
    var q = (document.getElementById('edQ').value || '').toLowerCase(), list = document.getElementById('edList');
    var keys = Object.keys(reg).filter(function (k) { return !q || k.toLowerCase().indexOf(q) >= 0; }).sort();
    list.innerHTML = keys.map(function (k) { return '<div class="it' + (k === selKey ? ' on' : '') + '" data-k="' + k + '"><span>' + k + '</span><span>' + (edits[k] ? '✎' : '') + '</span></div>'; }).join('');
    document.getElementById('edCount').textContent = Object.keys(reg).length + ' placed models · ' + Object.keys(edits).length + ' edited';
  }
  window.__editor = { refresh: refresh };
  el.addEventListener('click', function (e) {
    var t = e.target;
    if (t.dataset.k) { select(t.dataset.k); focusSel(); }
    if (t.dataset.m && tc) { tc.setMode(t.dataset.m); [].forEach.call(el.querySelectorAll('[data-m]'), function (b) { b.classList.toggle('on', b === t); }); }
    if (t.id === 'edSnap' && tc) { snap = !snap; tc.setTranslationSnap(snap ? 5 : null); tc.setRotationSnap(snap ? Math.PI / 12 : null); t.textContent = 'Snap: ' + (snap ? '5u / 15°' : 'off'); }
    if (t.id === 'edCopy') { var txt = 'PLACEMENT EDITS ' + (_v4 ? '(map v4) ' : '') + JSON.stringify(edits); try { navigator.clipboard.writeText(txt); t.textContent = 'Copied ✓'; setTimeout(function () { t.textContent = 'Copy for Claude'; }, 1500); } catch (x) { prompt('Copy this:', txt); } }
    if (t.id === 'edReset' && confirm('Reset every placement edit?')) { edits = {}; save(); location.reload(); }
  });
  document.getElementById('edQ').addEventListener('input', refresh);
  function focusSel() {
    var R = reg[selKey], D = window.__w3dDebug; if (!R || !D) return;
    var w = new (R.obj.position.constructor)(); R.obj.getWorldPosition(w);
    window.__probeCam = { pos: [w.x + 90, w.y + 70, w.z + 90], look: [w.x, w.y + 10, w.z] };
    setTimeout(function () { window.__probeCam = null; }, 2500);
  }
  addEventListener('keydown', function (e) {
    if (/input|textarea/i.test((document.activeElement || {}).tagName || '') || !tc) return;
    if (e.code === 'KeyW' && e.shiftKey === false && tc.object) tc.setMode('translate');
    if (e.code === 'KeyE' && tc.object) tc.setMode('rotate');
    if (e.code === 'KeyR' && tc.object) tc.setMode('scale');
    if (e.code === 'KeyF') focusSel();
    if (e.code === 'Escape') { tc.detach(); selKey = null; showSel(); }
    if (e.code === 'Delete' && selKey) { reg[selKey].obj.visible = false; edits[selKey] = Object.assign(edits[selKey] || {}, { hidden: true }); save(); tc.detach(); refresh(); }
    if (e.code === 'KeyZ' && e.ctrlKey && history.length) { var h = history.pop(), R = reg[h.k]; if (R) { R.obj.position.fromArray(h.p); R.obj.rotation.y = h.r; R.obj.scale.setScalar(h.s); record(h.k); } }
  });
})();
