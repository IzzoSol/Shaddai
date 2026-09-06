// backend/lib/tool-registry.js
// TOOL REGISTRY — version + snapshot the agent tool catalog (agent-engine.js TOOLS).
//
// Purpose: roll back a bad/sharp tool change, see what changed when, and expose
// the current catalog (names, descriptions, providedBy) without importing all of
// agent-engine's heavy graph. Read-mostly: the source of truth remains agent-engine
// TOOLS; this only snapshots + diffs it, it never mutates the live catalog.
//
// Persistence: backend/data/tool-registry.json (append-only snapshots, capped).
'use strict';

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const STORE = path.join(DATA_DIR, 'tool-registry.json');
const MAX_SNAPSHOTS = 50;

function loadStore() {
  try { return JSON.parse(fs.readFileSync(STORE, 'utf8')); }
  catch (_) { return { snapshots: [], active: null }; }
}
function saveStore(s) {
  try { fs.mkdirSync(DATA_DIR, { recursive: true }); fs.writeFileSync(STORE, JSON.stringify(s, null, 2)); return true; }
  catch (_) { return false; }
}

// Live tool catalog (lazy, never throw).
function liveCatalog() {
  try {
    const eng = require('../agent-engine');
    const TOOLS = eng.TOOLS || {};
    const out = {};
    for (const name of Object.keys(TOOLS)) {
      const t = TOOLS[name] || {};
      out[name] = {
        name,
        description: String(t.description || '').slice(0, 240),
        agents: Array.isArray(t.agents) ? t.agents.slice() : [],
      };
    }
    return out;
  } catch (e) {
    return { _error: String((e && e.message) || e) };
  }
}

function catalogFingerprint(keys) {
  // cheap stable digest is enough for change-detection here (no crypto needed)
  let hash = 5381;
  for (const k of keys) { for (let i = 0; i < k.length; i++) hash = ((hash * 33) ^ k.charCodeAt(i)) >>> 0; }
  return String(hash);
}

/** Snapshot the current catalog. Returns { ok, version, added, removed, changed }. */
function snapshot(by = 'manual') {
  const cat = liveCatalog();
  const names = Object.keys(cat).filter(k => k !== '_error');
  const store = loadStore();
  const prev = store.snapshots.length ? store.snapshots[store.snapshots.length - 1] : null;
  const prevNames = prev ? Object.keys(prev.catalog) : [];

  const added = names.filter(n => prevNames.indexOf(n) === -1);
  const removed = prevNames.filter(n => names.indexOf(n) === -1);
  const changed = names.filter(n =>
    prevNames.indexOf(n) !== -1 &&
    (prev.catalog[n].description !== cat[n].description || JSON.stringify(prev.catalog[n].agents) !== JSON.stringify(cat[n].agents))
  );

  const ver = 'v' + Date.now().toString(36);
  store.snapshots.push({ version: ver, at: new Date().toISOString(), by, count: names.length, fingerprint: catalogFingerprint(names), catalog: cat });
  store.active = ver;
  if (store.snapshots.length > MAX_SNAPSHOTS) store.snapshots = store.snapshots.slice(-MAX_SNAPSHOTS);
  saveStore(store);

  return { ok: true, version: ver, total: names.length, added, removed, changed };
}

/** List snapshots (most recent first). */
function list() {
  const store = loadStore();
  return store.snapshots.map(s => ({ version: s.version, at: s.at, by: s.by, count: s.count, fingerprint: s.fingerprint })).reverse();
}

/** Current catalog (name → descriptor). */
function current() {
  const store = loadStore();
  const last = store.snapshots.length ? store.snapshots[store.snapshots.length - 1] : null;
  if (last) return { version: store.active, at: last.at, tools: last.catalog };
  const cat = liveCatalog();
  return { version: 'live', at: null, tools: cat };
}

/** Fetch one snapshot's catalog by version. */
function get(version) {
  const store = loadStore();
  const s = store.snapshots.find(x => x.version === version);
  return s ? { version: s.version, at: s.at, by: s.by, tools: s.catalog } : null;
}

// NOTE: "rollback" is advisory only by design — the live catalog lives in
// agent-engine.js. Diffing a version here shows exactly what to undo in code,
// rather than silently rewriting the in-memory TOOLS map behind running requests.
function diff(aVersion, bVersion) {
  const a = get(aVersion), b = get(bVersion);
  if (!a || !b) return { ok: false, error: 'unknown version' };
  const aNames = Object.keys(a.tools), bNames = Object.keys(b.tools);
  return {
    ok: true,
    added: bNames.filter(n => aNames.indexOf(n) === -1),
    removed: aNames.filter(n => bNames.indexOf(n) === -1),
    changed: aNames.filter(n => bNames.indexOf(n) !== -1 && a.tools[n].description !== b.tools[n].description),
  };
}

module.exports = { snapshot, list, current, get, diff, liveCatalog };