/* world-live-feeds.js — one client for the FREE market + news feeds (2026-10-23, owner: "wiring the free apis into the navi for
 * markets and the screens in zerox shaddai city and news screen"). The backend already proxies + caches them (backend/markets-routes.js):
 *   /api/markets/tickers (CoinGecko) · /api/markets/fear-greed (alternative.me) · /api/markets/trending (CoinGecko) · /api/news/crypto (Cointelegraph RSS)
 * Shared by NAVI (MARKETS + NEWS modules) and the in-world screens (world-city-screens.js). Never fakes data: when the server is not
 * reachable each feed reports state 'offline' and the UI says so. Refresh: 60 s markets, 5 min news (the server caches longer).
 *   WorldFeeds.get(name) -> { state: 'idle'|'loading'|'ready'|'offline', data, at } · WorldFeeds.on(fn) (called after any update)
 */
(function (root) {
  'use strict';
  var FEEDS = {
    tickers: { path: '/api/markets/tickers?ids=btc,eth,sol,bnb,xrp,doge,ada,avax', ttl: 60000, pick: function (j) { return j.tickers || []; } },
    fng: { path: '/api/markets/fear-greed', ttl: 600000, pick: function (j) { return (j.data || [])[0] || null; } },
    trending: { path: '/api/markets/trending', ttl: 300000, pick: function (j) { return ((j.data && j.data.coins) || []).slice(0, 7).map(function (c) { var i = c.item || {}; return { symbol: (i.symbol || '').toUpperCase(), name: i.name, rank: i.market_cap_rank }; }); } },
    news: { path: '/api/news/crypto', ttl: 300000, pick: function (j) { return j.news || []; } }
  };
  var S = {}, subs = [];
  Object.keys(FEEDS).forEach(function (k) { S[k] = { state: 'idle', data: null, at: 0 }; });
  function base() { return (root.SHADDAI_API_BASE || '').replace(/\/$/, ''); }
  function load(k) {
    var F = FEEDS[k], s = S[k]; if (!F || s.state === 'loading') return;
    if (s.at && Date.now() - s.at < F.ttl) return;
    s.state = 'loading';
    fetch(base() + F.path, { cache: 'no-store' }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (j) { if (!j || j.ok === false) throw new Error('not ok'); s.data = F.pick(j); s.state = 'ready'; s.at = Date.now(); emit(); })
      .catch(function () { s.state = s.data ? 'ready' : 'offline'; s.at = Date.now(); emit(); });
  }
  function emit() { subs.forEach(function (f) { try { f(); } catch (e) { } }); }
  function get(k) { load(k); return S[k]; }
  function on(f) { subs.push(f); }
  setInterval(function () { Object.keys(FEEDS).forEach(function (k) { if (S[k].at) load(k); }); }, 30000);
  root.WorldFeeds = { get: get, on: on, FEEDS: FEEDS };
})(typeof window !== 'undefined' ? window : this);
