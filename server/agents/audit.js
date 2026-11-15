'use strict';
// Hash-chained, append-only audit log for the Agent Gateway.
// Every entry links to the previous entry's hash (sha256 over a canonical
// form of the entry), so any later edit to history breaks verify().
// Secrets are redacted BEFORE an entry is stored or hashed — the log must
// never become a place credentials leak into. Optional JSONL persistence:
// pass a file path and each entry is appended as one JSON line; an existing
// file is reloaded on construction so the chain continues across restarts.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Canonical JSON (same scheme as approvals.js) so hashing is key-order stable.
function canon(v) {
  if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}';
  return JSON.stringify(v);
}

const REDACTIONS = [
  [/\bBearer\s+[A-Za-z0-9._\-]+/gi, 'Bearer [REDACTED]'],
  [/\bsk-(ant-)?[A-Za-z0-9_\-]{8,}/g, '[REDACTED]'],
  [/\bgh[pousr]_[A-Za-z0-9]{8,}/g, '[REDACTED]'],
  [/\bgithub_pat_[A-Za-z0-9_]{8,}/g, '[REDACTED]'],
  [/\bxai-[A-Za-z0-9_\-]{8,}/g, '[REDACTED]'],
  [/\bAIza[A-Za-z0-9_\-]{8,}/g, '[REDACTED]'],
  [/((?:api[_-]?key|secret|password|passwd|access[_-]?token)\s*[:=]\s*['"]?)[^\s'"]+/gi, '$1[REDACTED]'],
  [/(\bkey\s+)[A-Za-z0-9_\-]{12,}/gi, '$1[REDACTED]'],
];
function redact(v) {
  if (typeof v === 'string') {
    let s = v;
    for (const [re, rp] of REDACTIONS) s = s.replace(re, rp);
    return s;
  }
  if (Array.isArray(v)) return v.map(redact);
  if (v && typeof v === 'object') {
    const o = {};
    for (const k of Object.keys(v)) o[k] = redact(v[k]);
    return o;
  }
  return v;
}

const GENESIS = '0'.repeat(64);
const hashOf = (seq, prev, entry) =>
  crypto.createHash('sha256').update(prev + '|' + seq + '|' + canon(entry)).digest('hex');

function makeAudit(file) {
  let entries = [];
  if (file) {
    try {
      entries = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
    } catch (_) { entries = []; }
  }
  function verify(list) {
    const rows = list || entries;
    let prev = GENESIS;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (!r || r.seq !== i || r.prev !== prev) return false;
      const rest = {};
      for (const k of Object.keys(r)) if (k !== 'seq' && k !== 'prev' && k !== 'hash') rest[k] = r[k];
      if (hashOf(r.seq, r.prev, rest) !== r.hash) return false;
      prev = r.hash;
    }
    return true;
  }
  return {
    write(entry) {
      const clean = redact(entry || {});
      const seq = entries.length;
      const prev = seq ? entries[seq - 1].hash : GENESIS;
      const stored = Object.assign({}, clean, { seq, prev, hash: hashOf(seq, prev, clean) });
      entries.push(stored);
      if (file) {
        try {
          fs.mkdirSync(path.dirname(file), { recursive: true });
          fs.appendFileSync(file, JSON.stringify(stored) + '\n');
        } catch (_) { /* audit persistence is best-effort; the in-memory chain still verifies */ }
      }
      return Object.assign({}, stored);
    },
    entries() { return entries.map(e => JSON.parse(JSON.stringify(e))); },
    verify,
  };
}
module.exports = { makeAudit };
