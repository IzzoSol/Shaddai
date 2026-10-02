'use strict';
// Ids that come from callers become object keys; reject prototype keys and odd characters up front.
const DANGEROUS = new Set(['__proto__', 'constructor', 'prototype']);
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9_.:@-]{0,127}$/;

function isSafeId(s) { return typeof s === 'string' && ID_RE.test(s) && !DANGEROUS.has(s); }
function hasOwn(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }

module.exports = { isSafeId, hasOwn, DANGEROUS };
