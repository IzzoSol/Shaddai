'use strict';
const fs = require('fs');
const path = require('path');

function createStore(dir) {
  dir = dir || process.env.ACADEMY_DATA_DIR || path.join(__dirname, '..', '..', 'data', 'academy-skills');
  fs.mkdirSync(dir, { recursive: true });
  const file = (n) => path.join(dir, n);
  function read(name, fallback) {
    try { return JSON.parse(fs.readFileSync(file(name + '.json'), 'utf8')); } catch (_) { return fallback; }
  }
  function write(name, data) {
    const f = file(name + '.json'); const t = f + '.tmp';
    fs.writeFileSync(t, JSON.stringify(data, null, 2));
    fs.renameSync(t, f);
    return data;
  }
  function append(name, obj) { fs.appendFileSync(file(name + '.jsonl'), JSON.stringify(obj) + '\n'); return obj; }
  function readLines(name) {
    try { return fs.readFileSync(file(name + '.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)); }
    catch (_) { return []; }
  }
  return { dir, read, write, append, readLines };
}

module.exports = { createStore };
