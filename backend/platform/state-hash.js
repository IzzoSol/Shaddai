'use strict';
/**
 * state-hash.js — Fast, deterministic hashing of game state for replay/desync detection.
 * Uses FNV-1a over stable serialization. Zero dependencies.
 * Order-sensitive: arrays preserve order, objects have keys sorted for consistency.
 */

/**
 * Recursively sort object keys and serialize to JSON for stable hashing.
 * Arrays stay in order, objects are key-sorted to ensure consistent serialization.
 * @param {*} value - Arbitrary JSON-serializable value
 * @returns {string} Stable JSON string
 */
function stableStringify(value) {
  if (value === null) return 'null';
  if (typeof value !== 'object') {
    if (typeof value === 'string') return JSON.stringify(value);
    return String(value);
  }
  if (Array.isArray(value)) {
    return '[' + value.map(stableStringify).join(',') + ']';
  }
  // Object: sort keys, recursively stringify
  const keys = Object.keys(value).sort();
  const pairs = keys.map(k => `${JSON.stringify(k)}:${stableStringify(value[k])}`);
  return '{' + pairs.join(',') + '}';
}

/**
 * FNV-1a 32-bit hash of a string.
 * @param {string} str - String to hash
 * @returns {number} FNV-1a hash
 */
function fnv1a(str) {
  let hash = 0x811c9dc5; // FNV offset basis (32-bit)
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = (hash + (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24)) >>> 0;
  }
  return hash >>> 0;
}

/**
 * Hash an arbitrary value to a short hex string.
 * Same value (even with key reordering for objects) → same hash.
 * @param {*} value - Value to hash
 * @returns {string} Hex hash (8 chars)
 */
function hashState(value) {
  const stable = stableStringify(value);
  const hash = fnv1a(stable);
  return hash.toString(16).padStart(8, '0');
}

module.exports = { hashState, stableStringify };
