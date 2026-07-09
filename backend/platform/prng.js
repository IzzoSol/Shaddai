'use strict';
/**
 * prng.js — Deterministic PRNG (mulberry32) for SHADDAI arcade platform.
 * Zero dependencies. All functions take a rand() generator and never call Math.random().
 * Sequences are reproducible per seed: same seed → identical random sequence.
 */

/**
 * Create a seeded RNG function (mulberry32 algorithm).
 * @param {number} [seed] - Optional seed. If falsy, seeds from Math.random().
 * @returns {function} A rand() → float in [0,1)
 */
function rng(seed) {
  let a = (seed >>> 0) || (Math.random() * 2 ** 32) >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Generate a random integer in [lo, hi] (inclusive on both ends).
 * @param {function} rand - The rand() generator
 * @param {number} lo - Inclusive lower bound
 * @param {number} hi - Inclusive upper bound
 * @returns {number} Random integer
 */
function randInt(rand, lo, hi) {
  return Math.floor(rand() * (hi - lo + 1)) + lo;
}

/**
 * Generate a random float in [lo, hi).
 * @param {function} rand - The rand() generator
 * @param {number} lo - Inclusive lower bound
 * @param {number} hi - Exclusive upper bound
 * @returns {number} Random float
 */
function randFloat(rand, lo, hi) {
  return rand() * (hi - lo) + lo;
}

/**
 * Pick a random element from an array.
 * @param {function} rand - The rand() generator
 * @param {array} arr - Array to pick from
 * @returns {*} Random element, or undefined if array is empty
 */
function pick(rand, arr) {
  if (!arr || arr.length === 0) return undefined;
  return arr[Math.floor(rand() * arr.length)];
}

/**
 * Return true with probability p (in [0,1]).
 * @param {function} rand - The rand() generator
 * @param {number} p - Probability (0–1)
 * @returns {boolean}
 */
function chance(rand, p) {
  return rand() < p;
}

/**
 * Shuffle an array in-place using Fisher–Yates, return a new shuffled copy.
 * @param {function} rand - The rand() generator
 * @param {array} arr - Array to shuffle
 * @returns {array} New shuffled array
 */
function shuffle(rand, arr) {
  const copy = Array.from(arr);
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

module.exports = { rng, randInt, randFloat, pick, chance, shuffle };
