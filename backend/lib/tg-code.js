const fs = require('fs');
const path = require('path');
const vm = require('vm');

const JOURNAL = path.join(__dirname, '..', 'data', 'tg-code-journal.json');
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

function toStr(x, depth) {
  if (x === null) return 'null';
  if (x === undefined) return 'undefined';
  const t = typeof x;
  if (t === 'object') { try { const s = JSON.stringify(x); return s && s.length > 800 ? s.slice(0, 800) + '…' : s; } catch (e) { return String(x); } }
  return String(x);
}

function runCode(code, chatId) {
  const out = [];
  const sb = {
    console: {
      log: (...a) => out.push(a.map((x) => (typeof x === 'object' ? toStr(x) : String(x))).join(' ')),
      error: (...a) => out.push('ERR ' + a.map((x) => (typeof x === 'object' ? toStr(x) : String(x))).join(' ')),
      warn: (...a) => out.push('WARN ' + a.map((x) => (typeof x === 'object' ? toStr(x) : String(x))).join(' ')),
    },
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
  if (result && typeof result.then === 'function') { result = '(promise — resolve async via /code with await inside an IIFE)'; }
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

module.exports = { runCode, load, logEntry };