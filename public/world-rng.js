/* world-rng.js — seedable deterministic RNG (mulberry32) for gameplay that must be reproducible/testable.
 *
 *   var r = WorldRNG.create(WorldRNG.hashSeed('daily-2026-10-09'));
 *   r()            float in [0,1)
 *   r.int(n)       integer in [0,n)
 *   r.pick(arr)    random element (undefined for empty)
 *   r.shuffle(arr) Fisher-Yates, IN PLACE, returns arr
 * WorldRNG.hashSeed(str) -> FNV-1a 32-bit unsigned int.
 */
(function (root) {
  'use strict';
  function hashSeed(str) {
    var h = 0x811c9dc5; str = String(str);
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return h >>> 0;
  }
  function create(seed) {
    var a = (typeof seed === 'string' ? hashSeed(seed) : (seed >>> 0)) || 0;
    function rnd() {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    rnd.int = function (n) { return Math.floor(rnd() * Math.max(0, Math.floor(n))); };
    rnd.pick = function (arr) { return arr && arr.length ? arr[rnd.int(arr.length)] : undefined; };
    rnd.shuffle = function (arr) { for (var i = arr.length - 1; i > 0; i--) { var j = rnd.int(i + 1), t = arr[i]; arr[i] = arr[j]; arr[j] = t; } return arr; };
    return rnd;
  }
  var api = { create: create, hashSeed: hashSeed };
  root.WorldRNG = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
