'use strict';
const crypto = require('crypto');

function canonical(v) {
  if (v === undefined || v === null) return 'null';
  if (typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
  return '{' + Object.keys(v).filter((k) => v[k] !== undefined).sort()
    .map((k) => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}';
}
function sha256(s) { return crypto.createHash('sha256').update(String(s)).digest('hex'); }
function hashOf(v) { return sha256(canonical(v)); }
// Removes tags, including an unclosed trailing one (<img src=x onerror=...). A bare "<" in prose ("a < b") is kept.
// Output is still untrusted text: renderers must escape it.
function stripMarkup(s) { return String(s == null ? '' : s).replace(/<\/?[A-Za-z!?][^>]*>?/g, '').trim(); }

module.exports = { canonical, sha256, hashOf, stripMarkup };
