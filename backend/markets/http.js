'use strict';
// Cached JSON fetcher. Serves stale data if the upstream fails (rate limits are common on free APIs).
function makeJsonFetcher({ fetchImpl = globalThis.fetch, now = Date.now } = {}) {
  const cache = new Map();
  return async function getJson(url, ttlMs = 60000) {
    const hit = cache.get(url);
    if (hit && now() - hit.at < ttlMs) return hit.data;
    try {
      const r = await fetchImpl(url, {
        signal: AbortSignal.timeout(12000),
        headers: { accept: 'application/json', 'user-agent': 'SHADDAI/2.0' },
      });
      if (!r.ok) throw new Error('upstream ' + r.status);
      const data = await r.json();
      cache.set(url, { at: now(), data });
      return data;
    } catch (e) {
      if (hit) return hit.data;
      throw e;
    }
  };
}
module.exports = { makeJsonFetcher };
