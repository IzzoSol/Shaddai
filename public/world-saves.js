/* world-saves.js — G-1 PLAYER SAVE SYNC + G-13 PREFS (2026-11-16)
 * Wires the realm to the EXISTING backend save routes (agent-room-routes.js):
 *   GET /api/world/saves  -> { ok, uid, at, save }   (softAuth identity)
 *   PUT /api/world/saves  { save } -> { ok, at }     (atomic file write)
 * Until now the frontend never called them: hero lived only in localStorage
 * 'shd.hero3d', position in 'shd_world_snapshot_v1' / 'shd_navi_v1', inventory
 * in 'shd_inv_v1', prefs (G-13) in their own keys — all per-device. Now, for a
 * signed-in player, those namespaces ride the account across devices:
 *   load on entry (hydrate localStorage BEFORE world-main's consumers read it:
 *   hero restore is a 6 s timer, navi load() is on-demand, inventory gets an
 *   explicit ShdInv._reload() after hydration), push on identity-ready, every
 *   30 s when changed, and on beforeunload/pagehide (keepalive).
 * Identity: Bearer shd_token (softAuth verifies Firebase/session JWT) +
 * x-user-id shd_userid (honoured off-production, same as world-gate). The
 * backend 401s guests/'local' BY DESIGN — a guest save can never overwrite an
 * account save — so anonymous sessions simply stay local-only, no errors.
 * Conflict rule: the server stamps every write with `at` (server clock = a
 * version counter). Hydrate only when the server copy is NEWER than the last
 * `at` this device reconciled (localStorage 'shd_saves_meta_v1'), or when the
 * account changed. PUTs merge over the last known server save, so a push can
 * never delete keys another device wrote. ?saves=0 = OFF: this module goes
 * inert and the realm is exactly the old localStorage-only behaviour.
 * Self-contained, null-safe: a failed sync never breaks the world.
 */
(function (root) {
  'use strict';
  var OFF = /[?&]saves=0(?:&|$)/.test((root.location && root.location.search) || '');
  root.ShdSaves = { enabled: !OFF };
  if (OFF) return;

  var NS = { hero: 'shd.hero3d', navi: 'shd_navi_v1', inv: 'shd_inv_v1', snapshot: 'shd_world_snapshot_v1' };
  var NS_KEYS = ['hero', 'navi', 'inv', 'snapshot'];
  var PREF_KEYS = ['shd_quality', 'shaddai_world_theme', 'shd_hud_prefs_v1', 'shd_display_name', 'shaddai_audio_enabled'];
  var META_KEY = 'shd_saves_meta_v1';
  var URL = '/api/world/saves';

  var loadSettled = false, loadInFlight = false, putInFlight = false;
  var signedOut = false, lastServerSave = {}, baselineJson = null;
  var resolveReady = null;
  var ready = new Promise(function (res) { resolveReady = res; });
  root.__savesReady = ready;

  function ls(key) { try { return root.localStorage.getItem(key); } catch (e) { return null; } }
  function setLs(key, val) { try { root.localStorage.setItem(key, val); } catch (e) { } }
  function identity() { return { uid: ls('shd_userid') || '', token: ls('shd_token') || '' }; }
  function hasIdentity(id) { return !!(id.uid || id.token); }
  function headers(json, id) {
    var h = {};
    if (json) h['Content-Type'] = 'application/json';
    if (id.token) h.Authorization = 'Bearer ' + id.token;
    if (id.uid) h['x-user-id'] = id.uid;
    return h;
  }
  // localStorage values are strings; JSON-valued ones ride as objects so the
  // cloud file stays readable. Parse-if-possible is lossless both ways.
  function readVal(key) {
    var s = ls(key);
    if (s === null || s === undefined) return undefined;
    try { return JSON.parse(s); } catch (e) { return s; }
  }
  function writeVal(key, v) {
    if (v === undefined || v === null) return;
    setLs(key, (typeof v === 'string') ? v : JSON.stringify(v));
  }
  function buildLocal() {
    var out = {}, i, k, prefs = {}, hasPrefs = false;
    for (i = 0; i < NS_KEYS.length; i++) { k = NS_KEYS[i]; var v = readVal(NS[k]); if (v !== undefined) out[k] = v; }
    for (i = 0; i < PREF_KEYS.length; i++) { var pv = readVal(PREF_KEYS[i]); if (pv !== undefined) { prefs[PREF_KEYS[i]] = pv; hasPrefs = true; } }
    if (hasPrefs) out.prefs = prefs;
    return out;
  }
  // Canonical projection of the keys this module manages (fixed key order) —
  // used for the dirty check so key order in nested payloads can't fool it
  // into thinking nothing changed, and server copies can't look "different"
  // just for carrying extra keys.
  function project(save) {
    var out = {}, i, k;
    save = save || {};
    for (i = 0; i < NS_KEYS.length; i++) { k = NS_KEYS[i]; if (save[k] !== undefined && save[k] !== null) out[k] = save[k]; }
    if (save.prefs && typeof save.prefs === 'object') {
      var p = {};
      for (i = 0; i < PREF_KEYS.length; i++) { k = PREF_KEYS[i]; if (save.prefs[k] !== undefined && save.prefs[k] !== null) p[k] = save.prefs[k]; }
      out.prefs = p;
    }
    return out;
  }
  function readMeta() { try { return JSON.parse(ls(META_KEY) || 'null') || {}; } catch (e) { return {}; } }
  function writeMeta(at, uid) { setLs(META_KEY, JSON.stringify({ at: at || 0, uid: uid || '' })); }

  function hydrate(save) {
    var i, k;
    for (i = 0; i < NS_KEYS.length; i++) { k = NS_KEYS[i]; if (save[k] !== undefined && save[k] !== null) writeVal(NS[k], save[k]); }
    if (save.prefs && typeof save.prefs === 'object') {
      for (i = 0; i < PREF_KEYS.length; i++) { k = PREF_KEYS[i]; if (save.prefs[k] !== undefined && save.prefs[k] !== null) writeVal(k, save.prefs[k]); }
    }
    // Inventory parsed its copy at script init (before this fetch landed) —
    // re-read so THIS session plays with the restored items, not just the next.
    try { if (root.ShdInv && root.ShdInv._reload) root.ShdInv._reload(); } catch (e) { }
    try { if (root.document && root.document.dispatchEvent) root.document.dispatchEvent(new root.CustomEvent('shd:saves-hydrated', { detail: { at: readMeta().at || 0 } })); } catch (e) { }
  }

  function settle() {
    if (!loadSettled) { loadSettled = true; if (resolveReady) resolveReady(api.state()); }
  }

  function load() {
    var id = identity();
    if (!hasIdentity(id)) { settle(); return Promise.resolve(false); }
    if (loadInFlight) return Promise.resolve(false);
    loadInFlight = true;
    return root.fetch(URL, { method: 'GET', headers: headers(false, id), credentials: 'same-origin' })
      .then(function (r) {
        if (r.status === 401) { signedOut = true; loadInFlight = false; settle(); return false; }
        return r.json().catch(function () { return null; }).then(function (d) {
          loadInFlight = false;
          if (!d || !d.ok) { settle(); return false; }
          signedOut = false;
          lastServerSave = (d.save && typeof d.save === 'object') ? d.save : {};
          baselineJson = JSON.stringify(project(lastServerSave));
          var meta = readMeta();
          var accountChanged = !!(meta.uid && id.uid && meta.uid !== id.uid);
          var serverAt = d.at || 0;
          if ((serverAt > (meta.at || 0) || accountChanged) && Object.keys(lastServerSave).length) {
            writeMeta(serverAt, id.uid);
            hydrate(lastServerSave);
          } else if (accountChanged) {
            writeMeta(serverAt, id.uid);
          }
          settle();
          saveNow();   // identity-ready push: local state the server lacks goes up now
          return true;
        });
      })
      .catch(function () { loadInFlight = false; settle(); return false; });
  }

  function saveNow(opts) {
    opts = opts || {};
    if (!loadSettled || signedOut || putInFlight) return false;
    var id = identity();
    if (!hasIdentity(id)) return false;
    var local = buildLocal();
    var merged = {}, k;
    for (k in lastServerSave) if (Object.prototype.hasOwnProperty.call(lastServerSave, k)) merged[k] = lastServerSave[k];
    for (k in local) if (Object.prototype.hasOwnProperty.call(local, k)) merged[k] = local[k];
    if (lastServerSave.prefs && local.prefs) { merged.prefs = {}; var pk; for (pk in lastServerSave.prefs) merged.prefs[pk] = lastServerSave.prefs[pk]; for (pk in local.prefs) merged.prefs[pk] = local.prefs[pk]; }
    if (JSON.stringify(project(merged)) === baselineJson) return false;   // nothing new to push
    putInFlight = true;
    var init = { method: 'PUT', headers: headers(true, id), credentials: 'same-origin', body: JSON.stringify({ save: merged }) };
    if (opts.keepalive) init.keepalive = true;
    root.fetch(URL, init)
      .then(function (r) {
        if (r.status === 401) { signedOut = true; putInFlight = false; return null; }
        return r.json().catch(function () { return null; });
      })
      .then(function (d) {
        putInFlight = false;
        if (d && d.ok) {
          lastServerSave = merged;
          baselineJson = JSON.stringify(project(merged));
          writeMeta(d.at || 0, id.uid);
        }
      })
      .catch(function () { putInFlight = false; });
    return true;
  }

  var api = {
    enabled: true,
    load: load,
    saveNow: saveNow,
    state: function () {
      return { loadSettled: loadSettled, signedOut: signedOut, hasIdentity: hasIdentity(identity()) };
    }
  };
  root.ShdSaves = api;

  // Triggers (spec): identity-ready (initial attempt + late sign-in paths),
  // every 30 s, beforeunload/pagehide.
  load();
  // One late retry: covers a first attempt that never settled and sign-ins
  // that land just after boot (e.g. the session token restored async).
  setTimeout(function () {
    if (loadInFlight || signedOut) return;
    if (!loadSettled) load();
    else if (baselineJson === null && hasIdentity(identity())) load();
  }, 8000);
  setInterval(function () { saveNow(); }, 30000);
  if (root.addEventListener) {
    root.addEventListener('beforeunload', function () { saveNow({ keepalive: true }); });
    root.addEventListener('pagehide', function () { saveNow({ keepalive: true }); });
    root.addEventListener('storage', function (e) {
      if (e && (e.key === 'shd_token' || e.key === 'shd_userid') && hasIdentity(identity())) { signedOut = false; loadSettled = false; load(); }
    });
  }
  if (root.document && root.document.addEventListener) {
    root.document.addEventListener('shd:worldgate-grant', function () { signedOut = false; loadSettled = false; load(); });
  }
})(typeof window !== 'undefined' ? window : globalThis);
