/* world-city-v3.js — SHADDAI City v3 RUNTIME (Map v4, ?map=v4), 2026-09-27.
 *
 * Reads the three Blender-exported city files (Blender == game == dashboard):
 *   /assets/world/markers-v4.json    108 named markers (HUB_HOME_*, STALL_*, OBJ_HIRING_BOARD, NODE_SKILL_INSTALL, GATE_START ...)
 *   /assets/world/plots-v4.json      ~1,275 SW plots (deed rows; lights = ledger)
 *   /assets/world/art-slots-v4.json  ~7,900 art slots (data only; meshes are made lazily when a slot is filled)
 * Coordinates: metres, X east, Y north, Z up  →  game x = X·U, y = Z·U, z = -Y·U  (U = 7/1.8 units per metre).
 * Yaw (plots, slots): degrees, "clusters-loader format" → three rotation.y = -yaw·π/180 (== Blender rot about +Z).
 *
 *   window.buildWorldCityV3({ THREE, scene, getPlayer: () => ({pos}), heightAt?, fetchJSON?, onInteract?(marker), onPing?(evt),
 *                             base?, radius_m? (3), vTol_m? (6), keyTarget? (window), document?, canInteract?() })
 *     → { ready: Promise, update(dt), markers, nearest(pos, r_m), current(), interact(), setPlotState(plot_id, state),
 *         placeArt(slot_id, texture|null), plot(id), slot(id), stats(), dispose() }
 *
 * Rules (DOC_SPARKS / DOC_PAYMENTS): this module does NO SPARKS math and makes NO backend calls. It only emits
 * callbacks (onInteract, onPing); the dashboard/backend layer owns money. SPARKS is closed-loop, never cash-out.
 */
(function (root) {
  var U = 7 / 1.8, GZ_M = 6, BEACON_H_M = 3.3, BEACON_SIZE_M = 0.6, THROTTLE_S = 0.2;
  var STATES = ['empty', 'claimed', 'built', 'listed', 'lapsed'];
  // lights = ledger (DOC_PLOTS): empty dark · claimed beacon · built warm windows · listed cyan edge · lapsed dims
  var STATE_COLORS = { empty: 0x000000, claimed: 0x00ff9c, built: 0xfff2d0, listed: 0x3dfff0, lapsed: 0x3a3c40 };
  var INTERACTIVE_KEYS = ['endpoints', 'endpoint', 'dashboard_id', 'paybox_merchant_id', 'skill_required', 'skill_gate'];
  // markers@2 (tools/city/normalize-markers.mjs): endpoints[] + sparks_price number|null + price_rule; old prose kept in props.legacy
  var PRICE_RULE_LABEL = { seller: 'set by seller', 'per-skill': 'per skill', 'per-class': 'per class', dynamic: 'varies' };
  var PREFIX = /^(OBJ|NODE|BLD|HUB|VEH|PAD|PLAZA)_/;

  function toGame(p) { return { x: (+p[0] || 0) * U, y: (+p[2] || 0) * U, z: -(+p[1] || 0) * U }; }
  function yawToRotY(yawDeg) { return -(+yawDeg || 0) * Math.PI / 180; }

  // props may carry JSON strings ('["a","b"]', '{"k":1}') or be a JSON string themselves — parse defensively
  function parseMaybe(v) {
    if (typeof v !== 'string') return v;
    var s = v.trim();
    if ((s.charAt(0) === '[' && s.charAt(s.length - 1) === ']') || (s.charAt(0) === '{' && s.charAt(s.length - 1) === '}')) {
      try { return JSON.parse(s); } catch (e) { return v; }
    }
    return v;
  }
  function normProps(p) {
    p = parseMaybe(p);
    if (!p || typeof p !== 'object' || Array.isArray(p)) return {};
    var out = {};
    for (var k in p) if (Object.prototype.hasOwnProperty.call(p, k)) out[k] = parseMaybe(p[k]);
    return out;
  }
  function has(v) { return v !== undefined && v !== null && v !== ''; }
  function niceName(name) {
    var s = String(name || '').replace(PREFIX, '').toLowerCase().split('_');
    return s.map(function (w) { return w ? w.charAt(0).toUpperCase() + w.slice(1) : w; }).join(' ');
  }
  function normMarker(m) {
    var props = normProps(m && m.props), pos_m = (m && Array.isArray(m.pos_m)) ? m.pos_m : [0, 0, 0];
    var skill = has(props.skill_required) ? String(props.skill_required) : (has(props.skill_gate) ? String(props.skill_gate) : null);
    var price = props.sparks_price;
    if (typeof price === 'string' && price.trim() !== '' && isFinite(+price)) price = +price;
    var interactive = INTERACTIVE_KEYS.some(function (k) { return Array.isArray(props[k]) ? props[k].length > 0 : has(props[k]); });
    var legacy = (props.legacy && typeof props.legacy === 'object') ? props.legacy : {};
    var endpoints = Array.isArray(props.endpoints) ? props.endpoints : [];
    var endpoint = has(props.endpoint) ? props.endpoint : (has(legacy.endpoint) ? legacy.endpoint : null);
    return {
      name: String(m && m.name || ''), title: niceName(m && m.name), pos_m: pos_m, pos: toGame(pos_m), props: props,
      interactive: interactive, dashboard_id: has(props.dashboard_id) ? props.dashboard_id : null,
      endpoints: endpoints, endpoint: endpoint, merchant: has(props.paybox_merchant_id) ? props.paybox_merchant_id : null,
      sparks_price: has(price) ? price : null, price_rule: has(props.price_rule) ? props.price_rule : null, price_unit: has(props.price_unit) ? props.price_unit : null,
      skill: skill, skills: skill ? skill.split('|') : []
    };
  }
  function promptParts(mk) {   // "E — Hiring Board · work.hire" (+ gold SPARKS price when there is one)
    var main = 'E — ' + mk.title + (mk.skill ? ' · ' + mk.skill : '');
    var price = null;
    if (typeof mk.sparks_price === 'number' && mk.sparks_price > 0) price = mk.sparks_price + ' SPARKS' + (mk.price_unit === 'day' ? '/day' : '');
    else if (typeof mk.sparks_price === 'string') price = 'SPARKS · ' + mk.sparks_price;
    else if (mk.sparks_price == null && PRICE_RULE_LABEL[mk.price_rule]) price = 'SPARKS · ' + PRICE_RULE_LABEL[mk.price_rule];
    return { main: main, price: price };
  }
  function nearestIn(list, pos, r_m, vTol_m) {
    if (!pos) return null;
    var r = (r_m == null ? 3 : r_m) * U, r2 = r * r, vt = (vTol_m == null ? 6 : vTol_m) * U, best = null, bd = Infinity;
    var py = +pos.y, useY = isFinite(py);
    for (var i = 0; i < list.length; i++) {
      var mk = list[i]; if (!mk.interactive) continue;
      var dx = mk.pos.x - pos.x, dz = mk.pos.z - pos.z, d2 = dx * dx + dz * dz;
      if (d2 > r2 || d2 >= bd) continue;
      if (useY && Math.abs(mk.pos.y - py) > vt) continue;        // e.g. PERCH_MAIN at 92.5 m is not "near" someone on the street below
      best = mk; bd = d2;
    }
    return best;
  }
  function isTyping(t) {
    if (!t) return false;
    var tag = String(t.tagName || '').toUpperCase();
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || !!t.isContentEditable;
  }

  function build(opts) {
    var THREE = opts.THREE, scene = opts.scene, doc = opts.document || (typeof document !== 'undefined' ? document : null);
    var R_M = opts.radius_m == null ? 3 : opts.radius_m, VTOL = opts.vTol_m == null ? 6 : opts.vTol_m;
    var base = opts.base || '/assets/world/';
    var fetchJSON = opts.fetchJSON || function (url) { return fetch(url).then(function (r) { if (!r.ok) throw new Error(url + ' ' + r.status); return r.json(); }); };
    var group = new THREE.Group(); group.name = 'world-city-v3'; scene.add(group);

    var markers = [], byName = {}, plots = [], plotIdx = {}, slots = [], slotIdx = {}, artMeshes = {}, geoCache = {};
    var beacons = null, loaded = false, pendingStates = {}, pendingArt = {}, current = null, acc = THROTTLE_S, disposed = false;
    var tmpObj = new THREE.Object3D(), tmpCol = new THREE.Color();
    var warn = function (m) { if (typeof console !== 'undefined') console.warn('[city-v3] ' + m); };

    // ── DOM prompt (obsidian bg, emerald text, gold SPARKS) — created lazily, touched ≤ 5×/s and only on change ──
    var promptEl = null, promptMain = null, promptPrice = null, promptKey = '';
    function ensurePrompt() {
      if (promptEl || !doc || !doc.createElement || !doc.body) return promptEl;
      promptEl = doc.createElement('div');
      promptEl.id = 'city-v3-prompt';
      promptEl.style.cssText = 'position:fixed;left:50%;bottom:18%;transform:translateX(-50%);z-index:40;pointer-events:none;display:none;' +
        'background:#06080b;color:#00ff9c;border:1px solid rgba(0,255,156,.35);border-radius:6px;padding:6px 12px;' +
        'font:600 13px/1.3 system-ui,-apple-system,Segoe UI,sans-serif;letter-spacing:.02em;white-space:nowrap;box-shadow:0 0 12px rgba(0,255,156,.18)';
      promptMain = doc.createElement('span'); promptPrice = doc.createElement('span');
      promptPrice.style.cssText = 'color:#e8c45c;margin-left:10px';
      promptEl.appendChild(promptMain); promptEl.appendChild(promptPrice);
      doc.body.appendChild(promptEl);
      return promptEl;
    }
    function renderPrompt(mk) {
      var key = mk ? mk.name : '';
      if (key === promptKey) return;
      promptKey = key;
      if (!ensurePrompt()) return;
      if (!mk) { promptEl.style.display = 'none'; return; }
      var p = promptParts(mk);
      promptMain.textContent = p.main;
      promptPrice.textContent = p.price || '';
      promptPrice.style.display = p.price ? '' : 'none';
      promptEl.style.display = 'block';
    }

    // ── E to interact ──
    // CAPTURE phase + stopImmediatePropagation when we actually handle the press: same convention as the transit
    // station menu / npc-dialog (earlier capture listeners still win), so the host's bubble-phase E handlers
    // (building doors, SHADDAI 2nd projectile, dossier, kiosk, board dismount) don't ALSO fire at a city marker.
    // opts.canInteract?() → false hides the prompt and leaves E to the host (riding, cutscene, menus open ...).
    var keyTarget = opts.keyTarget || (typeof window !== 'undefined' ? window : null);
    function allowed() { if (!opts.canInteract) return true; try { return !!opts.canInteract(); } catch (err) { return false; } }
    function onKey(e) {
      if (!e || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.code !== 'KeyE' && e.key !== 'e' && e.key !== 'E') return;
      if (isTyping(e.target) || (doc && isTyping(doc.activeElement))) return;
      if (!current || !allowed()) return;
      if (interact()) {
        if (typeof e.preventDefault === 'function') e.preventDefault();
        if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
      }
    }
    if (keyTarget && keyTarget.addEventListener) keyTarget.addEventListener('keydown', onKey, true);
    function interact() {
      if (!current || !loaded || disposed) return false;
      if (opts.onInteract) { try { opts.onInteract(current); } catch (err) { warn('onInteract threw: ' + (err && err.message)); } }
      return true;
    }
    function ping(evt) { if (opts.onPing) { try { opts.onPing(evt); } catch (err) { warn('onPing threw: ' + (err && err.message)); } } }

    // ── plot beacons: ONE InstancedMesh, colour per instance = ledger state ──
    function beaconY(x, z) { return (opts.heightAt ? opts.heightAt(x, z) : GZ_M * U) + BEACON_H_M * U; }
    function buildBeacons() {
      if (!plots.length) return;
      var s = BEACON_SIZE_M * U;
      var mat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
      beacons = new THREE.InstancedMesh(new THREE.BoxGeometry(s, s, s), mat, plots.length);
      beacons.name = 'city-v3-plot-beacons';
      for (var i = 0; i < plots.length; i++) {
        var p = plots[i], b = p.beacon_m, x = b[0] * U, z = -b[1] * U;
        tmpObj.position.set(x, beaconY(x, z), z); tmpObj.rotation.set(0, yawToRotY(p.yaw), 0); tmpObj.scale.set(1, 1, 1); tmpObj.updateMatrix();
        beacons.setMatrixAt(i, tmpObj.matrix);
        beacons.setColorAt(i, tmpCol.setHex(STATE_COLORS[p.state] != null ? STATE_COLORS[p.state] : 0));
      }
      beacons.instanceMatrix.needsUpdate = true;
      if (beacons.instanceColor) beacons.instanceColor.needsUpdate = true;
      if (beacons.computeBoundingSphere) beacons.computeBoundingSphere();
      group.add(beacons);
    }
    function setPlotState(plot_id, state) {
      if (STATES.indexOf(state) < 0) { warn('unknown plot state "' + state + '" for ' + plot_id); return false; }
      if (!loaded) { pendingStates[plot_id] = state; return true; }
      var i = plotIdx[plot_id];
      if (i == null) { warn('unknown plot ' + plot_id); return false; }
      var p = plots[i];
      if (p.state === state) return true;
      p.state = state;
      if (beacons) { beacons.setColorAt(i, tmpCol.setHex(STATE_COLORS[state])); beacons.instanceColor.needsUpdate = true; }
      ping({ type: 'plot', plot_id: plot_id, state: state });
      return true;
    }

    // ── art slots: registry only; a mesh exists only while a slot is filled ──
    function geoFor(w, h) {
      var k = w + 'x' + h;
      return geoCache[k] || (geoCache[k] = new THREE.PlaneGeometry(w * U, h * U));
    }
    function placeArt(slot_id, texture) {
      if (!loaded) { pendingArt[slot_id] = texture || null; return true; }
      var s = slotIdx[slot_id];
      if (!s) { warn('unknown art slot ' + slot_id); return false; }
      var old = artMeshes[slot_id];
      if (!texture) {
        if (!old) return true;
        group.remove(old); old.material.dispose();     // geometry is shared (cache), texture belongs to the caller
        delete artMeshes[slot_id]; s.filled = null;
        ping({ type: 'art', slot_id: slot_id, filled: false });
        return true;
      }
      if (THREE.SRGBColorSpace && 'colorSpace' in texture) texture.colorSpace = THREE.SRGBColorSpace;
      if (old) {
        old.material.map = texture; old.material.emissiveMap = texture; old.material.needsUpdate = true;
      } else {
        var mat = new THREE.MeshStandardMaterial({ color: 0x111111, map: texture, emissive: 0xffffff, emissiveMap: texture, emissiveIntensity: 1, roughness: 0.6, metalness: 0 });
        var mesh = new THREE.Mesh(geoFor(s.w_m, s.h_m), mat);
        var ry = yawToRotY(s.yaw), g = toGame(s.pos_m), off = 0.05 * U;       // plane faces the façade's outward side; 5 cm proud of the blank panel
        // slot pos_m z = panel BOTTOM (Blender box z0) → centre = z + h/2
        mesh.position.set(g.x + Math.sin(ry) * off, g.y + s.h_m / 2 * U, g.z + Math.cos(ry) * off);
        mesh.rotation.set(0, ry, 0);
        mesh.name = 'art:' + slot_id;
        group.add(mesh); artMeshes[slot_id] = mesh;
      }
      s.filled = true;
      ping({ type: 'art', slot_id: slot_id, filled: true });
      return true;
    }

    // ── load ──
    function arr(j, key) { var a = j && (Array.isArray(j) ? j : j[key]); return Array.isArray(a) ? a : []; }
    var ready = Promise.all([
      fetchJSON(base + 'markers-v4.json'), fetchJSON(base + 'plots-v4.json'), fetchJSON(base + 'art-slots-v4.json')
    ]).then(function (res) {
      if (disposed) return api;
      arr(res[0], 'markers').forEach(function (m) {
        var mk = normMarker(m); if (!mk.name) return;
        if (byName[mk.name]) warn('duplicate marker ' + mk.name);
        byName[mk.name] = mk; markers.push(mk);
      });
      var __search = (typeof location !== 'undefined' && location.search) || '';
      var __fullCity = /[?&]fullcity=1\b/.test(__search);
      var __swOff = /[?&]swhalf=0\b/.test(__search);
      var __swKeep = 0.05,   /* owner 2026-10-16: 'way too many plots' - 0.25 -> 0.12 -> 0.05 (refs image 66/72: low density) */ __m = /[?&]swkeep=([0-9.]+)\b/.exec(__search);
      if (__m) __swKeep = Math.min(1, Math.max(0, parseFloat(__m[1])));
      arr(res[1], 'plots').forEach(function (p) {
        if (!p || !p.plot_id || !Array.isArray(p.beacon_m) || !isFinite(p.beacon_m[0]) || !isFinite(p.beacon_m[1])) { warn('bad plot row ' + (p && p.plot_id)); return; }
        if (plotIdx[p.plot_id] != null) { warn('duplicate plot ' + p.plot_id); return; }
        if (STATES.indexOf(p.state) < 0) p.state = 'empty';
        var __isCity = p.plot_id.indexOf('PLOT-CITY-') === 0;
        if (!__fullCity && __isCity && Math.abs(Math.sin(p.beacon_m[0] * 39.346 + p.beacon_m[1] * 11.135) * 43758.5453) % 1 >= 0.35) return;   // city garden plots: keep ~1/3 (owner: too many plots)
        if (!__fullCity && !__swOff && !__isCity && Math.abs(Math.sin(p.beacon_m[0] * 12.9898 + p.beacon_m[1] * 78.233) * 43758.5453) % 1 >= __swKeep) return;   // owner 2026-10-16: hide ~75% SW grid (?fullcity=1 = all, ?swhalf=0 = off, ?swkeep=0..1 tune)
        plotIdx[p.plot_id] = plots.length; plots.push(p);
      });
      arr(res[2], 'slots').forEach(function (s) {
        if (!s || !s.slot_id || !Array.isArray(s.pos_m) || !(s.w_m > 0) || !(s.h_m > 0)) { warn('bad slot row ' + (s && s.slot_id)); return; }
        if (slotIdx[s.slot_id]) { warn('duplicate slot ' + s.slot_id); return; }
        s.filled = null; slotIdx[s.slot_id] = s; slots.push(s);
      });
      buildBeacons();
      loaded = true;
      for (var id in pendingStates) setPlotState(id, pendingStates[id]);
      for (var sid in pendingArt) placeArt(sid, pendingArt[sid]);
      pendingStates = {}; pendingArt = {};
      return api;
    });

    function update(dt) {
      if (!loaded || disposed) return;
      acc += dt || 0;
      if (acc < THROTTLE_S) return;                   // ~5 Hz scan + DOM
      acc = 0;
      var P = opts.getPlayer ? opts.getPlayer() : null;
      current = (P && P.pos && allowed()) ? nearestIn(markers, P.pos, R_M, VTOL) : null;
      renderPrompt(current);
    }
    function stats() {
      var byState = { empty: 0, claimed: 0, built: 0, listed: 0, lapsed: 0 };
      plots.forEach(function (p) { byState[p.state] = (byState[p.state] || 0) + 1; });
      return {
        loaded: loaded, markers: markers.length, interactive: markers.filter(function (m) { return m.interactive; }).length,
        plots: plots.length, plotsByState: byState, slots: slots.length, filledSlots: Object.keys(artMeshes).length,
        current: current ? current.name : null
      };
    }
    function dispose() {
      disposed = true;
      if (keyTarget && keyTarget.removeEventListener) keyTarget.removeEventListener('keydown', onKey, true);
      if (promptEl && promptEl.parentNode) promptEl.parentNode.removeChild(promptEl);
      Object.keys(artMeshes).forEach(function (id) { artMeshes[id].material.dispose(); });
      if (beacons) { beacons.geometry.dispose(); beacons.material.dispose(); }
      for (var k in geoCache) geoCache[k].dispose();
      scene.remove(group);
    }

    var api = {
      group: group, ready: ready, update: update, markers: markers,
      nearest: function (pos, r_m) { return nearestIn(markers, pos, r_m == null ? R_M : r_m, VTOL); },
      current: function () { return current; }, interact: interact,
      marker: function (name) { return byName[name] || null; },
      plot: function (id) { var i = plotIdx[id]; return i == null ? null : plots[i]; },
      slot: function (id) { return slotIdx[id] || null; },
      setPlotState: setPlotState, placeArt: placeArt, stats: stats, dispose: dispose,
      _beacons: function () { return beacons; }, _artMesh: function (id) { return artMeshes[id] || null; }
    };
    return api;
  }

  var PURE = { U: U, STATES: STATES, STATE_COLORS: STATE_COLORS, toGame: toGame, yawToRotY: yawToRotY, parseMaybe: parseMaybe,
    normProps: normProps, normMarker: normMarker, niceName: niceName, promptParts: promptParts, nearestIn: nearestIn, isTyping: isTyping };
  build.pure = PURE;
  if (root) root.buildWorldCityV3 = build;
  if (typeof module !== 'undefined' && module.exports) { module.exports = PURE; module.exports.build = build; }
})(typeof window !== 'undefined' ? window : null);
