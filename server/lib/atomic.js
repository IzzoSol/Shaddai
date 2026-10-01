// server/lib/atomic.js — crash-safe JSON files + a tiny per-key mutex (FORGE-AGENT-WIRING step 7: no lost updates / double-spend under concurrent requests).
const fs = require('fs');
const path = require('path');

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return fallback; }
}
function writeJsonAtomic(file, obj) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.' + process.pid + '.' + Date.now() + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2), 'utf8');
  fs.renameSync(tmp, file);   // atomic on the same volume
}

// per-key promise chain: withLock('char_1', async () => { ... }) runs one at a time per key
const chains = new Map();
function withLock(key, fn) {
  const prev = chains.get(key) || Promise.resolve();
  const next = prev.then(fn, fn);
  chains.set(key, next.catch(() => { }));
  return next;
}

module.exports = { readJson, writeJsonAtomic, withLock };
