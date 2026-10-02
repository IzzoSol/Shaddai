'use strict';
// Per-key async mutex: run(key, fn) executes fn after every earlier run() for the same key has settled.
function createLock() {
  const tails = new Map();
  return function run(key, fn) {
    const prev = tails.get(key) || Promise.resolve();
    const next = prev.catch(() => {}).then(fn);
    const tail = next.catch(() => {});
    tails.set(key, tail);
    tail.then(() => { if (tails.get(key) === tail) tails.delete(key); });
    return next;
  };
}

module.exports = { createLock };
