const fs = require('fs');
const path = require('path');
const vm = require('vm');

const JOURNAL = path.join(__dirname, '..', 'data', 'tg-code-journal.json');
const STATE = path.join(__dirname, '..', 'data', 'tg-code-state.json');
const DATA_DIR = path.join(__dirname, '..', 'data');
const MAX = 300;

function load() {
  try { return JSON.parse(fs.readFileSync(JOURNAL, 'utf8')); } catch (e) { return []; }
}

function logEntry(entry) {
  try {
    const j = load();
    j.push(entry);
    if (j.length > MAX) j.splice(0, j.length - MAX);
    fs.writeFileSync(JOURNAL, JSON.stringify(j));
  } catch (e) {}
}

function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE, 'utf8')) || {}; } catch (e) { return {}; }
}
function saveState(map) {
  try { fs.writeFileSync(STATE, JSON.stringify(map)); } catch (e) {}
}

const SECRET_RE = /secret|_key|token|cred|auth|password|\.env/i;
const ALLOWED = new Set(['tg-calls.json', 'token-calls.json', 'paper-portfolios.json', 'economy.json', 'offices.json', 'work.json', 'webhooks.json', 'tg-rejected.json', 'tg-bad-mints.json', 'tg-alerted.json', 'token-snapshots.json', 'source-overlap.json', 'zerox-failures.json', 'zerox-learning.json', 'zerox-autotune.json', 'tg-code-state.json']);

// read-only handle into backend/data for the sandbox (whitelist + secret-block, JSON only)
function readDataFile(name) {
  const base = path.basename(String(name || ''));
  if (!ALLOWED.has(base)) return { err: 'not-allowed: ' + base };
  if (SECRET_RE.test(base)) return { err: 'blocked: secrets' };
  try {
    return JSON.parse(fs.readFileSync(path.join(DATA_DIR, base), 'utf8'));
  } catch (e) {
    return { err: 'unreadable: ' + (e && e.message || e) };
  }
}

function safeEnv(key) {
  const k = String(key || '').toUpperCase().trim();
  const val = process.env[k];
  if (val === undefined) return undefined;
  if (/SECRET|KEY|TOKEN|PASSWORD|AUTH/i.test(k)) return '***set***';
  return val;
}

function toStr(x, depth) {
  if (x === null) return 'null';
  if (x === undefined) return 'undefined';
  const t = typeof x;
  if (t === 'object') { try { const s = JSON.stringify(x); return s && s.length > 800 ? s.slice(0, 800) + '…' : s; } catch (e) { return String(x); } }
  return String(x);
}

function runCode(code, chatId) {
  const out = [];
  const state = loadState();
  const terminal = {
    read: (name) => readDataFile(name),
    calls: (limit) => {
      const d = readDataFile('tg-calls.json');
      const arr = d && Array.isArray(d.calls) ? d.calls : (Array.isArray(d) ? d : null);
      if (!arr) return d;
      return arr.slice(0, Math.min(parseInt(limit, 10) || 5, 50));
    },
    state: () => Object.assign({}, state),
    save: (k, v) => {
      if (k === undefined || k === null) return { err: 'key required' };
      const key = String(k).slice(0, 60);
      const str = typeof v === 'string' ? v : JSON.stringify(v);
      if (!str || str.length > 5000) return { err: 'value > 5000 chars' };
      state[key] = str.slice(0, 5000);
      if (Object.keys(state).length > 200) delete state[Object.keys(state)[0]];
      saveState(state);
      return { saved: key, keys: Object.keys(state).length };
    },
    load: (k) => (k === undefined ? undefined : state[String(k)]),
    env: (k) => safeEnv(k),
    now: () => new Date().toISOString()
  };
  const sb = {
    console: {
      log: (...a) => out.push(a.map((x) => (typeof x === 'object' ? toStr(x) : String(x))).join(' ')),
      error: (...a) => out.push('ERR ' + a.map((x) => (typeof x === 'object' ? toStr(x) : String(x))).join(' ')),
      warn: (...a) => out.push('WARN ' + a.map((x) => (typeof x === 'object' ? toStr(x) : String(x))).join(' ')),
    },
    terminal, state,
    Math, Date, JSON, String, Number, Boolean, Array, Object, RegExp, Error,
    parseInt, parseFloat, isNaN, encodeURIComponent, decodeURIComponent,
    setTimeout, clearTimeout
  };
  sb.globalThis = sb;
  let err = null, result;
  try {
    const script = new vm.Script('(function(){' + code + '\n})()', { timeout: 4000 });
    result = script.runInContext(vm.createContext(sb));
  } catch (e) { err = e && e.message || String(e); }
  if (result && typeof result.then === 'function') { result = '(promise)'; }
  const text = out.join('\n');
  const value = result === undefined ? '' : toStr(result);
  const entry = {
    t: Date.now(),
    chat: String(chatId || 'terminal'),
    code: String(code).slice(0, 500),
    result: (text + (text && value ? '\n' : '') + value).slice(0, 2000),
    err, len: String(code).length
  };
  logEntry(entry);
  return entry;
}

function status() {
  return {
    host: process.env.RENDER ? 'render' : 'local',
    render: !!process.env.RENDER,
    admin: !!(process.env.SHADDAI_ADMIN_ID || '').trim(),
    token: !!process.env.TELEGRAM_BOT_TOKEN,
    states: Object.keys(loadState()).length,
    journal: load().length
  };
}

module.exports = { runCode, load, logEntry, status };