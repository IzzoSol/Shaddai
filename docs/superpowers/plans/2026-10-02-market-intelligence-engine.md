# Market Intelligence Engine Implementation Plan (Slices 1–2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A shared, plug-in market-signal engine (stocks, crypto, prediction markets) with a correlation/regime layer and a simple paper ledger, exposed at `/api/intel/*` and shown as a new "Intel" station in the dashboard Markets view.

**Architecture:** `backend/markets/` holds keyless adapters (return a common `Quote`), strategy modules (`run(quotes) -> Signal[]`), a correlation/regime helper, a JSON-file paper ledger and an Express router factory. One static page `public/markets-hub.html` renders five tabs and is embedded lazily as a station in `public/index.html`. Everything is dependency-injected (fetch, clock, file path) so tests never touch the network.

**Tech Stack:** Node 25 (CommonJS, global `fetch`), Express 4, `node:test` + `node:assert` (jest/supertest are NOT installed), vanilla HTML/JS.

**Spec:** `docs/superpowers/specs/2026-10-02-market-intelligence-engine-design.md`

**Out of this plan (own plan next):** slice 3 — TG bot posting, MiroFish adapter, ZEROX MCP tools (`zerox_signals`, `zerox_correlation`). DexScreener/meme adapter is also deferred (existing Markets station already covers DEX trending).

## Global Constraints

- CommonJS (`'use strict'; require/module.exports`), no new npm dependencies.
- Free, keyless data only. Never log or require API keys.
- Paper trading only. No real-money execution, no commissions, no PayBox.
- Do not change existing `/api/markets/*` routes; new routes mount at `/api/intel`.
- Theme: obsidian `#06080b`, emerald `#00ff9c`, gold `#e8c45c`.
- Escape all upstream strings (names, questions) before inserting into HTML.
- Source repos are MIT; add a one-line "idea adapted from <repo> (MIT)" comment in the module that borrows from one.
- Commit only the files each task lists (the repo has many unrelated dirty/untracked files). Do not push.
- Commit trailer: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`

## Review Focus

- One upstream (Yahoo/CoinGecko/Polymarket) is down or rate-limited → response still 200 with the other classes' data plus an `errors` list, never a 500.
- Series with < 21 points, NaN/null closes (Yahoo returns nulls for halted days), or a flat series → no signal and no NaN in output.
- Zero-variance or too-short series in correlation → `null`, never `NaN`/`Infinity` in JSON.
- Polymarket market with missing/garbled `outcomePrices` or closed market → skipped, not a crash.
- Paper ledger: opening the same signal twice, closing an unknown id, closing another user's trade, or an oversized/negative size → clean 4xx error, ledger unchanged.
- Unauthenticated user hitting paper endpoints → 401, while read-only signal endpoints stay public.

## File Structure

```
backend/markets/
  http.js              cached JSON fetcher (stale-on-error)
  indicators.js        sma, rsi, pctChange, returns, pearson, cleanCloses
  signal.js            makeSignal() — the Signal shape
  adapters/yahoo.js    stocks  -> Quote[]
  adapters/coingecko.js crypto -> Quote[]
  adapters/polymarket.js prediction -> Quote[]
  adapters/basket.js   daily series for regime (SPY,QQQ,NVDA,BTC,ETH,SOL)
  modules/stock-screener.js
  modules/crypto-momentum.js
  modules/prediction-watch.js
  modules/index.js     MODULES registry array
  correlation.js       alignSeries, matrix, computeRegime, regimeAdjust
  engine.js            createEngine({adapters, modules, getRegime})
  paper.js             createPaper({file, now})
  routes.js            createRouter({engine, paper})
  index.js             createDefault() — real wiring
  *.test.js            node:test files next to each unit
public/markets-hub.html   five-tab UI
public/index.html         + Intel station (modify)
backend/server-production.js  + mount (modify)
package.json              + "test:markets" script (modify)
```

**Shared shapes (all tasks use exactly these):**

```js
// Quote
{ symbol: 'NVDA', name: 'NVIDIA', assetClass: 'stock'|'crypto'|'prediction',
  price: Number, change24hPct: Number, volume: Number, closes: Number[] }
// Signal (from makeSignal)
{ id: 'moduleId:SYMBOL:side', moduleId, symbol, name, assetClass,
  side: 'buy'|'sell', confidence: 0..1, entry, target, stop, rationale, ts }
// Module
{ id, source, assetClasses: [..], run(quotes) -> Signal[] }
// Adapter
{ id, fetch: async () -> Quote[] }
```

---

### Task 1: HTTP cache + indicators + signal shape

**Files:**
- Create: `backend/markets/http.js`, `backend/markets/indicators.js`, `backend/markets/signal.js`
- Test: `backend/markets/foundation.test.js`
- Modify: `package.json` (add script)

**Interfaces:**
- Produces: `makeJsonFetcher({fetchImpl, now}) -> getJson(url, ttlMs?)`; `sma(arr,n)`, `rsi(arr,n=14)`, `pctChange(arr,n)`, `returns(arr)`, `pearson(x,y)`, `cleanCloses(arr)`; `makeSignal({...})`.

- [ ] **Step 1: Write the failing test** — `backend/markets/foundation.test.js`

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { makeJsonFetcher } = require('./http');
const { sma, rsi, pctChange, returns, pearson, cleanCloses } = require('./indicators');
const { makeSignal } = require('./signal');

const okRes = (data) => ({ ok: true, status: 200, json: async () => data });

test('getJson caches within ttl', async () => {
  let calls = 0, t = 1000;
  const get = makeJsonFetcher({ fetchImpl: async () => { calls++; return okRes({ a: 1 }); }, now: () => t });
  await get('http://x', 60000); t += 1000; await get('http://x', 60000);
  assert.strictEqual(calls, 1);
});

test('getJson serves stale data when upstream fails, throws when nothing cached', async () => {
  let fail = false, t = 0;
  const get = makeJsonFetcher({
    fetchImpl: async () => (fail ? { ok: false, status: 429 } : okRes({ v: 7 })), now: () => t,
  });
  assert.deepStrictEqual(await get('http://y', 10), { v: 7 });
  t += 100; fail = true;
  assert.deepStrictEqual(await get('http://y', 10), { v: 7 });
  await assert.rejects(() => get('http://never', 10), /upstream 429/);
});

test('indicators', () => {
  assert.strictEqual(sma([1, 2, 3, 4], 2), 3.5);
  assert.strictEqual(sma([1], 2), null);
  const up = Array.from({ length: 20 }, (_, i) => 100 + i);
  assert.strictEqual(rsi(up, 14), 100);
  assert.strictEqual(rsi([1, 2], 14), null);
  assert.strictEqual(pctChange([100, 110], 1), 10);
  assert.strictEqual(pctChange([100], 5), null);
  assert.deepStrictEqual(returns([100, 110]).map((x) => +x.toFixed(2)), [0.1]);
  assert.deepStrictEqual(cleanCloses([1, null, NaN, 0, -3, 2, 'x']), [1, 2]);
});

test('pearson: +1, -1, and null for flat / too-short series', () => {
  const a = [1, 2, 3, 4, 5, 6], b = [2, 4, 6, 8, 10, 12], c = [6, 5, 4, 3, 2, 1];
  assert.ok(Math.abs(pearson(a, b) - 1) < 1e-9);
  assert.ok(Math.abs(pearson(a, c) + 1) < 1e-9);
  assert.strictEqual(pearson(a, [3, 3, 3, 3, 3, 3]), null);
  assert.strictEqual(pearson([1, 2], [1, 2]), null);
});

test('makeSignal clamps confidence and sets target/stop by side', () => {
  const s = makeSignal({ moduleId: 'm', symbol: 'AAA', assetClass: 'stock', side: 'buy',
    confidence: 1.4, entry: 100, targetPct: 0.06, stopPct: 0.03, rationale: 'r' });
  assert.strictEqual(s.id, 'm:AAA:buy');
  assert.strictEqual(s.confidence, 1);
  assert.strictEqual(s.target, 106);
  assert.strictEqual(s.stop, 97);
  const d = makeSignal({ moduleId: 'm', symbol: 'AAA', assetClass: 'stock', side: 'sell',
    confidence: -1, entry: 100, targetPct: 0.06, stopPct: 0.03, rationale: 'r' });
  assert.strictEqual(d.confidence, 0);
  assert.strictEqual(d.target, 94);
  assert.strictEqual(d.stop, 103);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test backend/markets/foundation.test.js`
Expected: FAIL — `Cannot find module './http'`

- [ ] **Step 3: Implement**

`backend/markets/http.js`:
```js
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
```

`backend/markets/indicators.js`:
```js
'use strict';
const sma = (a, n) => (a.length < n ? null : a.slice(-n).reduce((s, x) => s + x, 0) / n);

function rsi(closes, n = 14) {
  if (closes.length < n + 1) return null;
  let gain = 0, loss = 0;
  for (let i = closes.length - n; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) gain += d; else loss -= d;
  }
  if (loss === 0) return gain === 0 ? 50 : 100;
  return 100 - 100 / (1 + gain / loss);
}

const pctChange = (a, n) =>
  a.length <= n || !a[a.length - 1 - n] ? null : (a[a.length - 1] / a[a.length - 1 - n] - 1) * 100;

const returns = (a) => a.slice(1).map((x, i) => (a[i] ? x / a[i] - 1 : NaN));

const cleanCloses = (arr) => (arr || []).filter((x) => typeof x === 'number' && Number.isFinite(x) && x > 0);

function pearson(x, y) {
  const n = Math.min(x.length, y.length);
  if (n < 5) return null;
  const xs = x.slice(-n), ys = y.slice(-n);
  if (xs.some((v) => !Number.isFinite(v)) || ys.some((v) => !Number.isFinite(v))) return null;
  const mx = xs.reduce((s, v) => s + v, 0) / n, my = ys.reduce((s, v) => s + v, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; syy += (ys[i] - my) ** 2;
  }
  if (sxx === 0 || syy === 0) return null;
  return sxy / Math.sqrt(sxx * syy);
}

module.exports = { sma, rsi, pctChange, returns, cleanCloses, pearson };
```

`backend/markets/signal.js`:
```js
'use strict';
const p = (x) => Number(Number(x).toPrecision(6));

function makeSignal({ moduleId, symbol, name, assetClass, side, confidence, entry, targetPct, stopPct, rationale }) {
  const dir = side === 'buy' ? 1 : -1;
  return {
    id: `${moduleId}:${symbol}:${side}`, moduleId, symbol, name: name || symbol, assetClass, side,
    confidence: Math.max(0, Math.min(1, Math.round(confidence * 100) / 100)),
    entry: p(entry), target: p(entry * (1 + dir * targetPct)), stop: p(entry * (1 - dir * stopPct)),
    rationale, ts: Date.now(),
  };
}
module.exports = { makeSignal };
```

`package.json` — in `"scripts"` add after `"test"`: `"test:markets": "node --test backend/markets/",`

- [ ] **Step 4: Run to verify it passes**

Run: `node --test backend/markets/foundation.test.js`
Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add backend/markets/http.js backend/markets/indicators.js backend/markets/signal.js backend/markets/foundation.test.js package.json
git commit -m "feat(markets): fetch cache, indicators, signal shape

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Adapters (Yahoo, CoinGecko, Polymarket, basket)

**Files:**
- Create: `backend/markets/adapters/yahoo.js`, `coingecko.js`, `polymarket.js`, `basket.js`
- Test: `backend/markets/adapters.test.js`

**Interfaces:**
- Consumes: `getJson(url, ttlMs)` from Task 1; `cleanCloses` from Task 1.
- Produces: `createYahooAdapter(getJson, symbols?) -> {id:'yahoo', fetch}`; `createCoinGeckoAdapter(getJson) -> {id:'coingecko', fetch}`; `createPolymarketAdapter(getJson) -> {id:'polymarket', fetch}`; `fetchBasket(getJson) -> { SPY:[{d,c}], ... }` (symbols `SPY,QQQ,NVDA,BTC,ETH,SOL`); `DEFAULT_STOCKS`.

- [ ] **Step 1: Write the failing test** — `backend/markets/adapters.test.js`

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { createYahooAdapter } = require('./adapters/yahoo');
const { createCoinGeckoAdapter } = require('./adapters/coingecko');
const { createPolymarketAdapter } = require('./adapters/polymarket');
const { fetchBasket } = require('./adapters/basket');

const chart = (closes, price) => ({ chart: { result: [{
  meta: { regularMarketPrice: price, chartPreviousClose: closes[closes.length - 2], shortName: 'Acme' },
  timestamp: closes.map((_, i) => 1700000000 + i * 86400),
  indicators: { quote: [{ close: closes, volume: closes.map(() => 1000) }] },
}] } });

test('yahoo: maps chart to Quote, drops null closes, skips failed symbols', async () => {
  const getJson = async (url) => {
    if (url.includes('/BAD?')) throw new Error('upstream 404');
    return chart([100, null, 102, NaN, 104, 106], 106);
  };
  const a = createYahooAdapter(getJson, ['AAA', 'BAD']);
  const q = await a.fetch();
  assert.strictEqual(q.length, 1);
  assert.strictEqual(q[0].symbol, 'AAA');
  assert.strictEqual(q[0].assetClass, 'stock');
  assert.deepStrictEqual(q[0].closes, [100, 102, 104, 106]);
  assert.ok(Number.isFinite(q[0].change24hPct));
});

test('yahoo: throws when every symbol fails', async () => {
  const a = createYahooAdapter(async () => { throw new Error('upstream 429'); }, ['AAA']);
  await assert.rejects(() => a.fetch(), /all symbols failed/);
});

test('coingecko: maps markets payload', async () => {
  const getJson = async () => [{ symbol: 'btc', name: 'Bitcoin', current_price: 60000,
    price_change_percentage_24h: 2.5, total_volume: 3e10, sparkline_in_7d: { price: [1, 2, 3] } },
    { symbol: 'bad', current_price: null }];
  const q = await createCoinGeckoAdapter(getJson).fetch();
  assert.strictEqual(q.length, 1);
  assert.deepStrictEqual([q[0].symbol, q[0].assetClass, q[0].price], ['BTC', 'crypto', 60000]);
  assert.deepStrictEqual(q[0].closes, [1, 2, 3]);
});

test('polymarket: parses outcomePrices, skips closed/garbled markets', async () => {
  const getJson = async () => [
    { question: 'Will X happen?', slug: 'x', outcomePrices: '["0.62","0.38"]', volume24hr: 90000, oneDayPriceChange: 0.08, closed: false },
    { question: 'Garbled', slug: 'g', outcomePrices: 'nope', volume24hr: 1, closed: false },
    { question: 'Closed', slug: 'c', outcomePrices: '["0.5","0.5"]', volume24hr: 1, closed: true },
    { question: 'Missing', slug: 'm', volume24hr: 1 },
  ];
  const q = await createPolymarketAdapter(getJson).fetch();
  assert.strictEqual(q.length, 1);
  assert.strictEqual(q[0].assetClass, 'prediction');
  assert.strictEqual(q[0].price, 0.62);
  assert.strictEqual(q[0].change24hPct, 8);
});

test('basket: returns dated series for stocks and crypto, tolerates one failure', async () => {
  const getJson = async (url) => {
    if (url.includes('ethereum')) throw new Error('upstream 429');
    if (url.includes('finance.yahoo.com')) return chart([1, 2, 3], 3);
    return { prices: [[Date.UTC(2026, 8, 1), 10], [Date.UTC(2026, 8, 2), 11]] };
  };
  const b = await fetchBasket(getJson);
  assert.ok(Array.isArray(b.SPY) && b.SPY.length === 3);
  assert.strictEqual(b.BTC[0].d, '2026-09-01');
  assert.strictEqual(b.ETH, undefined);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test backend/markets/adapters.test.js`
Expected: FAIL — `Cannot find module './adapters/yahoo'`

- [ ] **Step 3: Implement**

`backend/markets/adapters/yahoo.js`:
```js
'use strict';
const { cleanCloses } = require('../indicators');

const DEFAULT_STOCKS = ['SPY', 'QQQ', 'AAPL', 'MSFT', 'NVDA', 'TSLA', 'AMZN', 'GOOGL', 'META', 'AMD',
  'NFLX', 'AVGO', 'JPM', 'V', 'COST', 'LLY', 'XOM', 'COIN', 'PLTR', 'SMCI', 'MSTR', 'DIS', 'BA', 'UBER'];

async function pool(items, n, fn) {
  const out = []; let i = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (i < items.length) { const it = items[i++]; out.push(await fn(it)); }
  }));
  return out;
}

function createYahooAdapter(getJson, symbols = DEFAULT_STOCKS) {
  return {
    id: 'yahoo',
    async fetch() {
      const results = await pool(symbols, 6, async (sym) => {
        try {
          const d = await getJson(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=3mo&interval=1d`, 120000);
          const r = d && d.chart && d.chart.result && d.chart.result[0];
          if (!r) return null;
          const q = (r.indicators && r.indicators.quote && r.indicators.quote[0]) || {};
          const closes = cleanCloses(q.close);
          const price = r.meta && r.meta.regularMarketPrice;
          if (!closes.length || !Number.isFinite(price)) return null;
          const prev = closes.length > 1 ? closes[closes.length - 2] : null;
          const vols = (q.volume || []).filter(Number.isFinite);
          return { symbol: sym, name: (r.meta && (r.meta.shortName || r.meta.symbol)) || sym, assetClass: 'stock',
            price, change24hPct: prev ? (price / prev - 1) * 100 : 0, volume: vols.length ? vols[vols.length - 1] : 0, closes };
        } catch (_) { return null; }
      });
      const quotes = results.filter(Boolean);
      if (!quotes.length) throw new Error('yahoo: all symbols failed');
      return quotes;
    },
  };
}
module.exports = { createYahooAdapter, DEFAULT_STOCKS };
```

`backend/markets/adapters/coingecko.js`:
```js
'use strict';
const { cleanCloses } = require('../indicators');
const CG = 'https://api.coingecko.com/api/v3';

function createCoinGeckoAdapter(getJson) {
  return {
    id: 'coingecko',
    async fetch() {
      const rows = await getJson(`${CG}/coins/markets?vs_currency=usd&order=volume_desc&per_page=30&page=1&sparkline=true&price_change_percentage=24h`, 90000);
      return (Array.isArray(rows) ? rows : [])
        .filter((c) => c && Number.isFinite(c.current_price))
        .map((c) => ({ symbol: String(c.symbol || '').toUpperCase(), name: c.name || c.symbol, assetClass: 'crypto',
          price: c.current_price, change24hPct: Number(c.price_change_percentage_24h) || 0,
          volume: Number(c.total_volume) || 0, closes: cleanCloses(c.sparkline_in_7d && c.sparkline_in_7d.price) }));
    },
  };
}
module.exports = { createCoinGeckoAdapter };
```

`backend/markets/adapters/polymarket.js`:
```js
'use strict';
function createPolymarketAdapter(getJson) {
  return {
    id: 'polymarket',
    async fetch() {
      const rows = await getJson('https://gamma-api.polymarket.com/markets?active=true&closed=false&order=volume24hr&ascending=false&limit=40', 120000);
      const out = [];
      for (const m of Array.isArray(rows) ? rows : []) {
        if (!m || m.closed) continue;
        let prices;
        try { prices = JSON.parse(m.outcomePrices); } catch (_) { continue; }
        const yes = Number(prices && prices[0]);
        if (!Number.isFinite(yes)) continue;
        out.push({ symbol: String(m.slug || m.question).slice(0, 60), name: String(m.question || m.slug), assetClass: 'prediction',
          price: yes, change24hPct: (Number(m.oneDayPriceChange) || 0) * 100, volume: Number(m.volume24hr) || 0, closes: [] });
      }
      return out;
    },
  };
}
module.exports = { createPolymarketAdapter };
```

`backend/markets/adapters/basket.js`:
```js
'use strict';
const { cleanCloses } = require('../indicators');
const CG = 'https://api.coingecko.com/api/v3';
const STOCKS = ['SPY', 'QQQ', 'NVDA'];
const COINS = { BTC: 'bitcoin', ETH: 'ethereum', SOL: 'solana' };
const day = (ms) => new Date(ms).toISOString().slice(0, 10);

async function fetchBasket(getJson) {
  const out = {};
  await Promise.all([
    ...STOCKS.map(async (sym) => {
      try {
        const d = await getJson(`https://query1.finance.yahoo.com/v8/finance/chart/${sym}?range=1mo&interval=1d`, 3600000);
        const r = d.chart.result[0];
        const ts = r.timestamp || [], cl = r.indicators.quote[0].close || [];
        const series = ts.map((t, i) => ({ d: day(t * 1000), c: cl[i] })).filter((p) => cleanCloses([p.c]).length);
        if (series.length) out[sym] = series;
      } catch (_) { /* leave symbol out */ }
    }),
    ...Object.entries(COINS).map(async ([sym, id]) => {
      try {
        const d = await getJson(`${CG}/coins/${id}/market_chart?vs_currency=usd&days=30&interval=daily`, 3600000);
        const series = (d.prices || []).map(([ms, c]) => ({ d: day(ms), c })).filter((p) => cleanCloses([p.c]).length);
        if (series.length) out[sym] = series;
      } catch (_) { /* leave symbol out */ }
    }),
  ]);
  return out;
}
module.exports = { fetchBasket };
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test backend/markets/adapters.test.js`
Expected: all PASS

- [ ] **Step 5: Live smoke (one-time, confirms real payload shapes)**

Run:
```bash
node -e "const {makeJsonFetcher}=require('./backend/markets/http');const g=makeJsonFetcher();(async()=>{const y=await require('./backend/markets/adapters/yahoo').createYahooAdapter(g,['SPY','NVDA']).fetch();console.log('yahoo',y.length,y[0].price,y[0].closes.length);const c=await require('./backend/markets/adapters/coingecko').createCoinGeckoAdapter(g).fetch();console.log('cg',c.length,c[0].symbol,c[0].closes.length);const p=await require('./backend/markets/adapters/polymarket').createPolymarketAdapter(g).fetch();console.log('pm',p.length,p[0]&&p[0].name);})().catch(e=>console.log('ERR',e.message))"
```
Expected: three lines with non-zero counts. If an adapter errors or returns 0 rows, fix the field mapping against the real payload before continuing (CoinGecko may rate-limit; retry after a minute).

- [ ] **Step 6: Commit**

```bash
git add backend/markets/adapters backend/markets/adapters.test.js
git commit -m "feat(markets): yahoo/coingecko/polymarket/basket adapters

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Strategy modules

**Files:**
- Create: `backend/markets/modules/stock-screener.js`, `crypto-momentum.js`, `prediction-watch.js`, `index.js`
- Test: `backend/markets/modules.test.js`

**Interfaces:**
- Consumes: `sma, rsi, pctChange` (Task 1), `makeSignal` (Task 1), `Quote` shape.
- Produces: each module `{id, source, assetClasses, run(quotes) -> Signal[]}`; `modules/index.js` exports `MODULES` (array of the three).

- [ ] **Step 1: Write the failing test** — `backend/markets/modules.test.js`

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const stock = require('./modules/stock-screener');
const crypto = require('./modules/crypto-momentum');
const pred = require('./modules/prediction-watch');
const { MODULES } = require('./modules');

// 26 flat closes at 100, then one step per char: 'u' = +1, 'd' = -1
const series = (steps) => { const c = Array(26).fill(100); for (const s of steps) c.push(c[c.length - 1] + (s === 'u' ? 1 : -1)); return c; };
const sq = (symbol, closes) => ({ symbol, name: symbol, assetClass: 'stock', price: closes[closes.length - 1], change24hPct: 0, volume: 1e6, closes });

test('stock-screener: buy on uptrend with healthy RSI; sell on downtrend; nothing on flat/short', () => {
  const out = stock.run([
    sq('UP', series('ddddduuuuuuuuu')),                 // 5 d then 9 u -> RSI ~64, price above SMA20
    sq('DN', series('uuuuuddddddddd')),                 // 5 u then 9 d -> RSI ~36, price below SMA20
    sq('FLAT', Array(40).fill(100)),
    sq('SHORT', [100, 101, 102]),
    sq('NANS', [100, NaN, 101]),
  ]);
  const by = Object.fromEntries(out.map((s) => [s.symbol, s]));
  assert.strictEqual(by.UP.side, 'buy');
  assert.ok(by.UP.confidence >= 0.5 && by.UP.confidence <= 0.95);
  assert.ok(by.UP.target > by.UP.entry && by.UP.stop < by.UP.entry);
  assert.strictEqual(by.DN.side, 'sell');
  assert.ok(by.DN.target < by.DN.entry && by.DN.stop > by.DN.entry);
  assert.strictEqual(by.FLAT, undefined);
  assert.strictEqual(by.SHORT, undefined);
  assert.strictEqual(by.NANS, undefined);
  out.forEach((s) => Object.values(s).forEach((v) => { if (typeof v === 'number') assert.ok(Number.isFinite(v)); }));
});

test('crypto-momentum: buy on rising 7d + 24h pop; ignores low volume and other classes', () => {
  const rising = Array.from({ length: 168 }, (_, i) => 100 + i * 0.06);
  const mk = (o) => ({ symbol: 'AAA', name: 'A', assetClass: 'crypto', price: 110, change24hPct: 4, volume: 5e7, closes: rising, ...o });
  assert.strictEqual(crypto.run([mk({})])[0].side, 'buy');
  assert.strictEqual(crypto.run([mk({ volume: 100 })]).length, 0);
  assert.strictEqual(crypto.run([mk({ assetClass: 'stock' })]).length, 0);
  const falling = rising.slice().reverse();
  assert.strictEqual(crypto.run([mk({ closes: falling, price: 100, change24hPct: -5 })])[0].side, 'sell');
  assert.strictEqual(crypto.run([mk({ closes: [] })]).length, 0);
});

test('prediction-watch: follows big moves on liquid markets, confidence capped', () => {
  const mk = (o) => ({ symbol: 's', name: 'Will X?', assetClass: 'prediction', price: 0.6, change24hPct: 9, volume: 90000, closes: [], ...o });
  const up = pred.run([mk({})])[0];
  assert.strictEqual(up.side, 'buy');
  assert.ok(up.confidence <= 0.7);
  assert.strictEqual(pred.run([mk({ change24hPct: -9 })])[0].side, 'sell');
  assert.strictEqual(pred.run([mk({ change24hPct: 2 })]).length, 0);
  assert.strictEqual(pred.run([mk({ volume: 100 })]).length, 0);
  assert.strictEqual(pred.run([mk({ price: 0.99 })]).length, 0);
});

test('registry exposes the three modules with unique ids', () => {
  assert.deepStrictEqual(MODULES.map((m) => m.id).sort(), ['crypto-momentum', 'prediction-watch', 'stock-screener']);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test backend/markets/modules.test.js`
Expected: FAIL — `Cannot find module './modules/stock-screener'`

- [ ] **Step 3: Implement**

`backend/markets/modules/stock-screener.js`:
```js
'use strict';
// Trend + RSI screener — idea adapted from zc6503204-collab/stock-strategy-dashboard (MIT).
const { sma, rsi, pctChange } = require('../indicators');
const { makeSignal } = require('../signal');

module.exports = {
  id: 'stock-screener',
  source: 'stock-strategy-dashboard',
  assetClasses: ['stock'],
  run(quotes) {
    const out = [];
    for (const q of quotes) {
      if (q.assetClass !== 'stock' || !Array.isArray(q.closes) || q.closes.length < 21) continue;
      const s20 = sma(q.closes, 20), r = rsi(q.closes, 14), ret5 = pctChange(q.closes, 5);
      if (s20 == null || r == null || ret5 == null) continue;
      const base = { moduleId: this.id, symbol: q.symbol, name: q.name, assetClass: 'stock', entry: q.price };
      if (q.price > s20 && r >= 50 && r <= 70 && ret5 > 0) {
        out.push(makeSignal({ ...base, side: 'buy', targetPct: 0.06, stopPct: 0.03,
          confidence: 0.5 + Math.min(0.25, ret5 / 20) + (r >= 55 && r <= 65 ? 0.1 : 0),
          rationale: `Above 20-day average, RSI ${r.toFixed(0)}, +${ret5.toFixed(1)}% over 5 days` }));
      } else if (q.price < s20 && r < 45 && ret5 < 0) {
        out.push(makeSignal({ ...base, side: 'sell', targetPct: 0.06, stopPct: 0.03,
          confidence: 0.5 + Math.min(0.25, Math.abs(ret5) / 20),
          rationale: `Below 20-day average, RSI ${r.toFixed(0)}, ${ret5.toFixed(1)}% over 5 days` }));
      }
    }
    return out;
  },
};
```

`backend/markets/modules/crypto-momentum.js`:
```js
'use strict';
const { sma, pctChange } = require('../indicators');
const { makeSignal } = require('../signal');
const MIN_VOLUME = 1e6;

module.exports = {
  id: 'crypto-momentum',
  source: 'shaddai',
  assetClasses: ['crypto'],
  run(quotes) {
    const out = [];
    for (const q of quotes) {
      if (q.assetClass !== 'crypto' || q.volume < MIN_VOLUME || !Array.isArray(q.closes) || q.closes.length < 48) continue;
      const s24 = sma(q.closes, 24), ret7d = pctChange(q.closes, q.closes.length - 1);
      if (s24 == null || ret7d == null) continue;
      const base = { moduleId: this.id, symbol: q.symbol, name: q.name, assetClass: 'crypto', entry: q.price, targetPct: 0.1, stopPct: 0.05 };
      if (q.change24hPct > 2 && ret7d > 0 && q.price > s24) {
        out.push(makeSignal({ ...base, side: 'buy', confidence: Math.min(0.85, 0.5 + Math.min(0.3, q.change24hPct / 30) + (ret7d > 5 ? 0.05 : 0)),
          rationale: `+${q.change24hPct.toFixed(1)}% 24h, +${ret7d.toFixed(1)}% 7d, above 24h average` }));
      } else if (q.change24hPct < -3 && ret7d < 0 && q.price < s24) {
        out.push(makeSignal({ ...base, side: 'sell', confidence: Math.min(0.85, 0.5 + Math.min(0.3, Math.abs(q.change24hPct) / 30)),
          rationale: `${q.change24hPct.toFixed(1)}% 24h, ${ret7d.toFixed(1)}% 7d, below 24h average` }));
      }
    }
    return out;
  },
};
```

`backend/markets/modules/prediction-watch.js`:
```js
'use strict';
const { makeSignal } = require('../signal');
// Follows large 24h probability moves on liquid markets. Momentum only — NOT a claim of true edge, so confidence is capped.
module.exports = {
  id: 'prediction-watch',
  source: 'polymarket',
  assetClasses: ['prediction'],
  run(quotes) {
    const out = [];
    for (const q of quotes) {
      if (q.assetClass !== 'prediction' || q.volume < 50000 || Math.abs(q.change24hPct) < 5) continue;
      if (q.price < 0.05 || q.price > 0.95) continue; // near-certain markets carry no tradeable move
      const side = q.change24hPct > 0 ? 'buy' : 'sell';
      out.push(makeSignal({ moduleId: this.id, symbol: q.symbol, name: q.name, assetClass: 'prediction', side,
        entry: q.price, targetPct: 0.15, stopPct: 0.1, confidence: Math.min(0.7, 0.45 + Math.abs(q.change24hPct) / 50),
        rationale: `Yes ${(q.price * 100).toFixed(0)}% (${q.change24hPct > 0 ? '+' : ''}${q.change24hPct.toFixed(0)} pts in 24h), $${Math.round(q.volume).toLocaleString()} volume` }));
    }
    return out;
  },
};
```

`backend/markets/modules/index.js`:
```js
'use strict';
// Add a new strategy file here and it appears everywhere (API, UI, later TG/MCP).
const MODULES = [require('./stock-screener'), require('./crypto-momentum'), require('./prediction-watch')];
module.exports = { MODULES };
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test backend/markets/modules.test.js`
Expected: all PASS. If the `UP`/`DN` fixtures fail, compute RSI/SMA for the fixture and fix the *fixture* only if the rule logic matches the comments above.

- [ ] **Step 5: Commit**

```bash
git add backend/markets/modules backend/markets/modules.test.js
git commit -m "feat(markets): stock-screener, crypto-momentum, prediction-watch modules

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Correlation + regime

**Files:**
- Create: `backend/markets/correlation.js`
- Test: `backend/markets/correlation.test.js`

**Interfaces:**
- Consumes: `returns`, `pearson`, `pctChange` (Task 1); basket shape `{SYM:[{d,c}]}` (Task 2).
- Produces: `alignSeries(basket) -> {dates:[], closes:{SYM:[]}}`; `matrix(basket) -> {symbols:[], values:[[r|null]]}`; `computeRegime(basket) -> {riskOn: true|false|null, spy5d, btc5d, btcSpyCorr}`; `regimeAdjust(signal, regime) -> Signal` (new object).

- [ ] **Step 1: Write the failing test** — `backend/markets/correlation.test.js`

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { alignSeries, matrix, computeRegime, regimeAdjust } = require('./correlation');

const mk = (vals, start = 1) => vals.map((c, i) => ({ d: `2026-09-${String(start + i).padStart(2, '0')}`, c }));

test('alignSeries keeps only common dates', () => {
  const a = alignSeries({ A: mk([1, 2, 3, 4], 1), B: mk([5, 6, 7], 2) });
  assert.deepStrictEqual(a.dates, ['2026-09-02', '2026-09-03', '2026-09-04']);
  assert.deepStrictEqual(a.closes.A, [2, 3, 4]);
});

test('matrix: diagonal 1, proportional = 1, opposite = -1, flat = null', () => {
  const up = [10, 11, 10.5, 12, 11.8, 13, 12.5, 14];
  const m = matrix({ A: mk(up), B: mk(up.map((x) => x * 2)), C: mk(up.map((x) => 30 - x)), F: mk(up.map(() => 5)) });
  const i = (s) => m.symbols.indexOf(s);
  assert.ok(Math.abs(m.values[i('A')][i('A')] - 1) < 1e-9);
  assert.ok(Math.abs(m.values[i('A')][i('B')] - 1) < 1e-9);
  assert.ok(m.values[i('A')][i('C')] < -0.9);
  assert.strictEqual(m.values[i('A')][i('F')], null);
  JSON.stringify(m); // must serialise without NaN
});

test('computeRegime: risk-on, risk-off, mixed, and missing data', () => {
  const grow = mk([100, 101, 102, 103, 104, 105, 106]);
  const fall = mk([106, 105, 104, 103, 102, 101, 100]);
  assert.strictEqual(computeRegime({ SPY: grow, BTC: grow }).riskOn, true);
  assert.strictEqual(computeRegime({ SPY: fall, BTC: fall }).riskOn, false);
  assert.strictEqual(computeRegime({ SPY: grow, BTC: fall }).riskOn, null);
  assert.strictEqual(computeRegime({}).riskOn, null);
});

test('regimeAdjust nudges aligned/unaligned signals by 0.05, leaves others and null regime alone', () => {
  const sig = (side, assetClass = 'stock') => ({ side, assetClass, confidence: 0.6, rationale: 'r' });
  assert.strictEqual(regimeAdjust(sig('buy'), { riskOn: true }).confidence, 0.65);
  assert.strictEqual(regimeAdjust(sig('buy'), { riskOn: false }).confidence, 0.55);
  assert.strictEqual(regimeAdjust(sig('sell'), { riskOn: false }).confidence, 0.65);
  assert.strictEqual(regimeAdjust(sig('buy'), { riskOn: null }).confidence, 0.6);
  assert.strictEqual(regimeAdjust(sig('buy', 'prediction'), { riskOn: true }).confidence, 0.6);
  assert.match(regimeAdjust(sig('buy'), { riskOn: true }).rationale, /risk-on/);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test backend/markets/correlation.test.js`
Expected: FAIL — `Cannot find module './correlation'`

- [ ] **Step 3: Implement** — `backend/markets/correlation.js`

```js
'use strict';
const { returns, pearson, pctChange } = require('./indicators');

function alignSeries(basket) {
  const syms = Object.keys(basket);
  if (!syms.length) return { dates: [], closes: {} };
  const maps = Object.fromEntries(syms.map((s) => [s, new Map(basket[s].map((p) => [p.d, p.c]))]));
  const dates = [...maps[syms[0]].keys()].filter((d) => syms.every((s) => maps[s].has(d))).sort();
  const closes = Object.fromEntries(syms.map((s) => [s, dates.map((d) => maps[s].get(d))]));
  return { dates, closes };
}

function matrix(basket) {
  const { closes } = alignSeries(basket);
  const symbols = Object.keys(closes);
  const rets = Object.fromEntries(symbols.map((s) => [s, returns(closes[s])]));
  const values = symbols.map((a) => symbols.map((b) => {
    const r = a === b ? (rets[a].length >= 5 ? 1 : null) : pearson(rets[a], rets[b]);
    return r == null ? null : Math.round(r * 100) / 100;
  }));
  return { symbols, values };
}

function computeRegime(basket) {
  const last5 = (s) => (basket[s] && basket[s].length > 5 ? pctChange(basket[s].map((p) => p.c), 5) : null);
  const spy5d = last5('SPY'), btc5d = last5('BTC');
  let riskOn = null;
  if (spy5d != null && btc5d != null) {
    if (spy5d > 0 && btc5d > 0) riskOn = true; else if (spy5d < 0 && btc5d < 0) riskOn = false;
  }
  const m = matrix({ SPY: basket.SPY || [], BTC: basket.BTC || [] });
  const btcSpyCorr = m.symbols.length === 2 ? m.values[0][1] : null;
  return { riskOn, spy5d, btc5d, btcSpyCorr };
}

function regimeAdjust(signal, regime) {
  if (!regime || regime.riskOn == null || (signal.assetClass !== 'stock' && signal.assetClass !== 'crypto')) return signal;
  const aligned = (regime.riskOn && signal.side === 'buy') || (!regime.riskOn && signal.side === 'sell');
  const c = Math.max(0, Math.min(1, Math.round((signal.confidence + (aligned ? 0.05 : -0.05)) * 100) / 100));
  return { ...signal, confidence: c, rationale: `${signal.rationale} · ${regime.riskOn ? 'risk-on' : 'risk-off'} market` };
}

module.exports = { alignSeries, matrix, computeRegime, regimeAdjust };
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test backend/markets/correlation.test.js`
Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add backend/markets/correlation.js backend/markets/correlation.test.js
git commit -m "feat(markets): correlation matrix and risk-on/off regime adjust

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Engine

**Files:**
- Create: `backend/markets/engine.js`
- Test: `backend/markets/engine.test.js`

**Interfaces:**
- Consumes: adapters `{id, fetch}` (Task 2), modules (Task 3), `regimeAdjust` (Task 4), `computeRegime`/`matrix` (Task 4).
- Produces: `createEngine({adapters, modules, getBasket, now?, ttlMs?}) -> { snapshot(), signals({assetClass?}), quotes({assetClass?}), correlations(), signalById(id) }`. `snapshot()` → `{quotes, errors:[{adapter, error}], ts}`. `signals()` → `{signals, errors, regime, ts}`.

- [ ] **Step 1: Write the failing test** — `backend/markets/engine.test.js`

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { createEngine } = require('./engine');

const stockQuote = { symbol: 'AAA', name: 'A', assetClass: 'stock', price: 10, change24hPct: 1, volume: 1, closes: [1] };
const cryptoQuote = { symbol: 'BBB', name: 'B', assetClass: 'crypto', price: 5, change24hPct: 1, volume: 1, closes: [1] };
const mod = (id, cls, conf) => ({ id, source: 't', assetClasses: [cls],
  run: (qs) => qs.filter((q) => q.assetClass === cls).map((q) => ({ id: `${id}:${q.symbol}:buy`, moduleId: id, symbol: q.symbol,
    assetClass: cls, side: 'buy', confidence: conf, entry: q.price, target: 1, stop: 1, rationale: 'r', ts: 0 })) });
const grow = Array.from({ length: 7 }, (_, i) => ({ d: `2026-09-0${i + 1}`, c: 100 + i }));

function make(over = {}) {
  return createEngine({
    adapters: [{ id: 'ok', fetch: async () => [stockQuote, cryptoQuote] }],
    modules: [mod('m1', 'stock', 0.6), mod('m2', 'crypto', 0.8)],
    getBasket: async () => ({ SPY: grow, BTC: grow }),
    ...over,
  });
}

test('signals are sorted by confidence desc, regime-adjusted, and filterable by class', async () => {
  const e = make();
  const { signals, regime } = await e.signals();
  assert.strictEqual(regime.riskOn, true);
  assert.deepStrictEqual(signals.map((s) => s.moduleId), ['m2', 'm1']);
  assert.strictEqual(signals[1].confidence, 0.65);
  assert.deepStrictEqual((await e.signals({ assetClass: 'stock' })).signals.map((s) => s.symbol), ['AAA']);
});

test('a failing adapter yields partial data + errors, not a throw', async () => {
  const e = make({ adapters: [
    { id: 'ok', fetch: async () => [stockQuote] },
    { id: 'bad', fetch: async () => { throw new Error('upstream 429'); } } ] });
  const snap = await e.snapshot();
  assert.strictEqual(snap.quotes.length, 1);
  assert.deepStrictEqual(snap.errors, [{ adapter: 'bad', error: 'upstream 429' }]);
});

test('a throwing module or basket failure does not break the response', async () => {
  const e = make({ modules: [mod('m1', 'stock', 0.6), { id: 'boom', assetClasses: ['stock'], run() { throw new Error('x'); } }],
    getBasket: async () => { throw new Error('basket down'); } });
  const r = await e.signals();
  assert.strictEqual(r.signals.length, 1);
  assert.strictEqual(r.regime.riskOn, null);
  assert.deepStrictEqual((await e.correlations()).symbols, []);
});

test('snapshot is cached within ttl; signalById finds a current signal', async () => {
  let calls = 0, t = 0;
  const e = make({ adapters: [{ id: 'ok', fetch: async () => { calls++; return [stockQuote]; } }], now: () => t, ttlMs: 1000 });
  await e.signals(); await e.signals();
  assert.strictEqual(calls, 1);
  assert.strictEqual((await e.signalById('m1:AAA:buy')).symbol, 'AAA');
  assert.strictEqual(await e.signalById('nope'), null);
  t += 5000; await e.signals();
  assert.strictEqual(calls, 2);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test backend/markets/engine.test.js`
Expected: FAIL — `Cannot find module './engine'`

- [ ] **Step 3: Implement** — `backend/markets/engine.js`

```js
'use strict';
const { computeRegime, matrix, regimeAdjust } = require('./correlation');

function createEngine({ adapters, modules, getBasket, now = Date.now, ttlMs = 60000 }) {
  let snap = null, inflight = null, basket = null;

  async function loadBasket() {
    if (basket && now() - basket.at < 3600000) return basket.data;
    try { basket = { at: now(), data: await getBasket() }; } catch (_) { return basket ? basket.data : {}; }
    return basket.data;
  }

  async function snapshot() {
    if (snap && now() - snap.at < ttlMs) return snap.data;
    if (inflight) return inflight;
    inflight = (async () => {
      const settled = await Promise.allSettled(adapters.map((a) => a.fetch()));
      const quotes = [], errors = [];
      settled.forEach((r, i) => {
        if (r.status === 'fulfilled') quotes.push(...r.value);
        else errors.push({ adapter: adapters[i].id, error: String(r.reason && r.reason.message || r.reason) });
      });
      const data = { quotes, errors, ts: now() };
      snap = { at: now(), data };
      return data;
    })().finally(() => { inflight = null; });
    return inflight;
  }

  async function signals({ assetClass } = {}) {
    const snapData = await snapshot();
    const { quotes, ts } = snapData, errors = [...snapData.errors]; // copy: module errors must not leak into the cached snapshot
    const regime = computeRegime(await loadBasket());
    let out = [];
    for (const m of modules) {
      try { out.push(...m.run(quotes)); } catch (e) { errors.push({ adapter: 'module:' + m.id, error: e.message }); }
    }
    out = out.map((s) => regimeAdjust(s, regime)).sort((a, b) => b.confidence - a.confidence);
    if (assetClass) out = out.filter((s) => s.assetClass === assetClass);
    return { signals: out, errors, regime, ts };
  }

  async function quotes({ assetClass } = {}) {
    const { quotes: q, errors, ts } = await snapshot();
    return { quotes: assetClass ? q.filter((x) => x.assetClass === assetClass) : q, errors, ts };
  }

  async function correlations() { return matrix(await loadBasket()); }
  async function signalById(id) { return (await signals()).signals.find((s) => s.id === id) || null; }

  return { snapshot, signals, quotes, correlations, signalById };
}
module.exports = { createEngine };
```


- [ ] **Step 4: Run to verify it passes**

Run: `node --test backend/markets/engine.test.js`
Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add backend/markets/engine.js backend/markets/engine.test.js
git commit -m "feat(markets): engine with cached snapshot, partial-failure tolerance

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Paper ledger

**Files:**
- Create: `backend/markets/paper.js`
- Test: `backend/markets/paper.test.js`

**Interfaces:**
- Produces: `createPaper({file, now?, startBalance?=100000, maxSize?=10000, maxOpen?=10}) -> { open({owner, signal, sizeUsd}), close({owner, id, price}), portfolio({owner, prices}) }`. `open`/`close` return `{ok:true, trade}` or `{ok:false, status, error}`. `portfolio` returns `{cash, equity, openTrades, closedTrades, byModule:{moduleId:{pnl, trades, wins}}}`. `prices` is `{SYMBOL: price}`.

- [ ] **Step 1: Write the failing test** — `backend/markets/paper.test.js`

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createPaper } = require('./paper');

const tmp = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'paper-')), 'p.json');
const sig = (side = 'buy', over = {}) => ({ id: `m:AAA:${side}`, moduleId: 'm', symbol: 'AAA', side, entry: 100, ...over });

test('long trade: open, close at profit, per-module P&L', () => {
  const p = createPaper({ file: tmp() });
  const o = p.open({ owner: 'u1', signal: sig('buy'), sizeUsd: 1000 });
  assert.ok(o.ok);
  assert.strictEqual(p.portfolio({ owner: 'u1', prices: { AAA: 110 } }).equity, 100100);
  const c = p.close({ owner: 'u1', id: o.trade.id, price: 110 });
  assert.ok(c.ok);
  const pf = p.portfolio({ owner: 'u1', prices: {} });
  assert.strictEqual(pf.cash, 100100);
  assert.strictEqual(pf.byModule.m.pnl, 100);
  assert.strictEqual(pf.byModule.m.wins, 1);
});

test('short trade profits when price falls', () => {
  const p = createPaper({ file: tmp() });
  const o = p.open({ owner: 'u1', signal: sig('sell'), sizeUsd: 1000 });
  p.close({ owner: 'u1', id: o.trade.id, price: 90 });
  assert.strictEqual(p.portfolio({ owner: 'u1', prices: {} }).byModule.m.pnl, 100);
});

test('rejects duplicates, bad sizes, too many open, unknown/foreign close; ledger unchanged', () => {
  const p = createPaper({ file: tmp(), maxOpen: 1 });
  const o = p.open({ owner: 'u1', signal: sig('buy'), sizeUsd: 1000 });
  for (const [args, status] of [
    [{ owner: 'u1', signal: sig('buy'), sizeUsd: 1000 }, 409],
    [{ owner: 'u1', signal: sig('buy', { id: 'x' }), sizeUsd: 1000 }, 429],
    [{ owner: 'u2', signal: sig('buy'), sizeUsd: -5 }, 400],
    [{ owner: 'u2', signal: sig('buy'), sizeUsd: 999999 }, 400],
    [{ owner: 'u2', signal: sig('buy'), sizeUsd: NaN }, 400],
    [{ owner: 'u2', signal: sig('buy', { entry: 0 }), sizeUsd: 100 }, 400],
  ]) { const r = p.open(args); assert.strictEqual(r.ok, false); assert.strictEqual(r.status, status); }
  assert.strictEqual(p.close({ owner: 'u1', id: 'nope', price: 1 }).status, 404);
  assert.strictEqual(p.close({ owner: 'u2', id: o.trade.id, price: 1 }).status, 404);
  assert.strictEqual(p.close({ owner: 'u1', id: o.trade.id, price: -1 }).status, 400);
  assert.strictEqual(p.portfolio({ owner: 'u1', prices: {} }).openTrades.length, 1);
});

test('cannot open more than available cash; ledger persists across instances', () => {
  const file = tmp();
  const p = createPaper({ file, startBalance: 1500, maxSize: 1000 });
  assert.ok(p.open({ owner: 'u', signal: sig('buy', { id: 'a' }), sizeUsd: 1000 }).ok);
  assert.strictEqual(p.open({ owner: 'u', signal: sig('buy', { id: 'b' }), sizeUsd: 1000 }).status, 400);
  assert.strictEqual(createPaper({ file }).portfolio({ owner: 'u', prices: {} }).openTrades.length, 1);
});

test('corrupt ledger file starts fresh instead of crashing', () => {
  const file = tmp(); fs.writeFileSync(file, '{not json');
  assert.strictEqual(createPaper({ file }).portfolio({ owner: 'u', prices: {} }).cash, 100000);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test backend/markets/paper.test.js`
Expected: FAIL — `Cannot find module './paper'`

- [ ] **Step 3: Implement** — `backend/markets/paper.js`

```js
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const fail = (status, error) => ({ ok: false, status, error });

function createPaper({ file, now = Date.now, startBalance = 100000, maxSize = 10000, maxOpen = 10 }) {
  let db = {};
  try { db = JSON.parse(fs.readFileSync(file, 'utf8')) || {}; } catch (_) { db = {}; }

  function save() {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(db));
    fs.renameSync(tmp, file);
  }
  const acct = (owner) => (db[owner] = db[owner] || { cash: startBalance, trades: [] });

  function open({ owner, signal, sizeUsd }) {
    const a = acct(owner);
    if (!Number.isFinite(sizeUsd) || sizeUsd < 10 || sizeUsd > maxSize) return fail(400, `size must be between 10 and ${maxSize}`);
    if (!signal || !Number.isFinite(signal.entry) || signal.entry <= 0) return fail(400, 'signal has no valid entry price');
    if (a.trades.some((t) => !t.closedAt && t.signalId === signal.id)) return fail(409, 'already open on this signal');
    if (a.trades.filter((t) => !t.closedAt).length >= maxOpen) return fail(429, `max ${maxOpen} open trades`);
    if (sizeUsd > a.cash) return fail(400, 'not enough paper cash');
    const trade = { id: crypto.randomUUID(), signalId: signal.id, moduleId: signal.moduleId, symbol: signal.symbol,
      side: signal.side, entry: signal.entry, sizeUsd, units: sizeUsd / signal.entry, openedAt: now(), closedAt: null, exit: null, pnl: null };
    a.cash -= sizeUsd; a.trades.push(trade); save();
    return { ok: true, trade };
  }

  const pnlOf = (t, price) => (t.side === 'buy' ? (price - t.entry) : (t.entry - price)) * t.units;

  function close({ owner, id, price }) {
    const a = acct(owner);
    const t = a.trades.find((x) => x.id === id && !x.closedAt);
    if (!t) return fail(404, 'open trade not found');
    if (!Number.isFinite(price) || price <= 0) return fail(400, 'invalid price');
    t.exit = price; t.closedAt = now(); t.pnl = Math.round(pnlOf(t, price) * 100) / 100;
    a.cash += t.sizeUsd + t.pnl; save();
    return { ok: true, trade: t };
  }

  function portfolio({ owner, prices = {} }) {
    const a = acct(owner);
    const openTrades = a.trades.filter((t) => !t.closedAt).map((t) => {
      const px = Number.isFinite(prices[t.symbol]) ? prices[t.symbol] : t.entry;
      return { ...t, mark: px, unrealized: Math.round(pnlOf(t, px) * 100) / 100 };
    });
    const closedTrades = a.trades.filter((t) => t.closedAt);
    const byModule = {};
    for (const t of closedTrades) {
      const m = (byModule[t.moduleId] = byModule[t.moduleId] || { pnl: 0, trades: 0, wins: 0 });
      m.pnl = Math.round((m.pnl + t.pnl) * 100) / 100; m.trades++; if (t.pnl > 0) m.wins++;
    }
    const equity = Math.round((a.cash + openTrades.reduce((s, t) => s + t.sizeUsd + t.unrealized, 0)) * 100) / 100;
    return { cash: Math.round(a.cash * 100) / 100, equity, openTrades, closedTrades, byModule };
  }

  return { open, close, portfolio };
}
module.exports = { createPaper };
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test backend/markets/paper.test.js`
Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add backend/markets/paper.js backend/markets/paper.test.js
git commit -m "feat(markets): paper trading ledger with per-module P&L

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Router, default wiring, server mount

**Files:**
- Create: `backend/markets/routes.js`, `backend/markets/index.js`
- Test: `backend/markets/routes.test.js`
- Modify: `backend/server-production.js` (add one line after line 1877, the `/api/cosmetics` mount)

**Interfaces:**
- Consumes: engine (Task 5), paper (Task 6).
- Produces: `createRouter({engine, paper}) -> express.Router` with
  `GET /signals?assetClass=`, `GET /quotes?assetClass=`, `GET /correlations`, `GET /modules`,
  `GET /paper` (auth), `POST /paper/open {signalId, sizeUsd}` (auth), `POST /paper/close {id}` (auth).
  Auth = `req.userId` truthy, else 401. `createDefault() -> express.Router` (real wiring).

- [ ] **Step 1: Write the failing test** — `backend/markets/routes.test.js`

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const express = require('express');
const { createRouter } = require('./routes');

const SIG = { id: 'm:AAA:buy', moduleId: 'm', symbol: 'AAA', assetClass: 'stock', side: 'buy', confidence: 0.7, entry: 100, target: 106, stop: 97, rationale: 'r', ts: 0 };
const engine = {
  signals: async ({ assetClass } = {}) => ({ signals: assetClass && assetClass !== 'stock' ? [] : [SIG], errors: [], regime: { riskOn: null }, ts: 1 }),
  quotes: async () => ({ quotes: [{ symbol: 'AAA', price: 100, assetClass: 'stock' }], errors: [], ts: 1 }),
  correlations: async () => ({ symbols: [], values: [] }),
  signalById: async (id) => (id === SIG.id ? SIG : null),
};
const store = [];
const paper = {
  open: ({ owner, signal, sizeUsd }) => { const trade = { id: 't1', owner, signalId: signal.id, sizeUsd }; store.push(trade); return { ok: true, trade }; },
  close: ({ id }) => (id === 't1' ? { ok: true, trade: { id } } : { ok: false, status: 404, error: 'open trade not found' }),
  portfolio: () => ({ cash: 1, equity: 1, openTrades: [], closedTrades: [], byModule: {} }),
};

async function withServer(userId, fn) {
  const app = express(); app.use(express.json());
  app.use((req, _r, next) => { if (userId) req.userId = userId; next(); });
  app.use('/api/intel', createRouter({ engine, paper }));
  const srv = http.createServer(app).listen(0);
  const base = `http://127.0.0.1:${srv.address().port}/api/intel`;
  try { await fn(base); } finally { srv.close(); }
}
const j = (r) => r.json();

test('read endpoints are public', async () => {
  await withServer(null, async (b) => {
    assert.strictEqual((await j(await fetch(b + '/signals'))).signals.length, 1);
    assert.strictEqual((await j(await fetch(b + '/signals?assetClass=crypto'))).signals.length, 0);
    assert.strictEqual((await j(await fetch(b + '/quotes'))).ok, true);
    assert.deepStrictEqual((await j(await fetch(b + '/correlations'))).symbols, []);
    assert.ok((await j(await fetch(b + '/modules'))).modules.length >= 3);
  });
});

test('paper endpoints require login', async () => {
  await withServer(null, async (b) => {
    assert.strictEqual((await fetch(b + '/paper')).status, 401);
    assert.strictEqual((await fetch(b + '/paper/open', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status, 401);
  });
});

test('paper open uses the SERVER signal (not client prices); unknown signal 404; close errors map to status', async () => {
  await withServer('u1', async (b) => {
    const post = (p, body) => fetch(b + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const ok = await post('/paper/open', { signalId: SIG.id, sizeUsd: 500, entry: 1 });
    assert.strictEqual(ok.status, 200);
    assert.strictEqual(store[0].signalId, SIG.id);
    assert.strictEqual((await post('/paper/open', { signalId: 'nope', sizeUsd: 500 })).status, 404);
    assert.strictEqual((await post('/paper/close', { id: 'zzz' })).status, 404);
    assert.strictEqual((await post('/paper/close', { id: 't1' })).status, 200);
    assert.strictEqual((await fetch(b + '/paper')).status, 200);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test backend/markets/routes.test.js`
Expected: FAIL — `Cannot find module './routes'`

- [ ] **Step 3: Implement**

`backend/markets/routes.js`:
```js
'use strict';
const express = require('express');
const { MODULES } = require('./modules');

const CLASSES = new Set(['stock', 'crypto', 'prediction']);
const cls = (q) => (CLASSES.has(q) ? q : undefined);

function createRouter({ engine, paper }) {
  const r = express.Router();
  const need = (req, res) => { if (!req.userId) { res.status(401).json({ ok: false, error: 'sign in to paper trade' }); return false; } return true; };
  const guard = (fn) => async (req, res) => { try { await fn(req, res); } catch (e) { res.status(500).json({ ok: false, error: String(e.message) }); } };

  r.get('/signals', guard(async (req, res) => res.json({ ok: true, ...(await engine.signals({ assetClass: cls(req.query.assetClass) })) })));
  r.get('/quotes', guard(async (req, res) => res.json({ ok: true, ...(await engine.quotes({ assetClass: cls(req.query.assetClass) })) })));
  r.get('/correlations', guard(async (_q, res) => res.json({ ok: true, ...(await engine.correlations()) })));
  r.get('/modules', (_q, res) => res.json({ ok: true, modules: MODULES.map((m) => ({ id: m.id, source: m.source, assetClasses: m.assetClasses })) }));

  r.get('/paper', guard(async (req, res) => {
    if (!need(req, res)) return;
    const { quotes } = await engine.quotes();
    const prices = Object.fromEntries(quotes.map((q) => [q.symbol, q.price]));
    res.json({ ok: true, ...paper.portfolio({ owner: String(req.userId), prices }) });
  }));

  r.post('/paper/open', guard(async (req, res) => {
    if (!need(req, res)) return;
    const signal = await engine.signalById(String((req.body && req.body.signalId) || ''));
    if (!signal) return res.status(404).json({ ok: false, error: 'signal no longer active' });
    const out = paper.open({ owner: String(req.userId), signal, sizeUsd: Number(req.body.sizeUsd) });
    res.status(out.ok ? 200 : out.status).json(out);
  }));

  r.post('/paper/close', guard(async (req, res) => {
    if (!need(req, res)) return;
    const { quotes } = await engine.quotes();
    const id = String((req.body && req.body.id) || '');
    const open = paper.portfolio({ owner: String(req.userId), prices: {} }).openTrades.find((t) => t.id === id);
    const q = open && quotes.find((x) => x.symbol === open.symbol);
    const out = paper.close({ owner: String(req.userId), id, price: q ? q.price : (open ? open.entry : NaN) });
    res.status(out.ok ? 200 : out.status).json(out);
  }));

  return r;
}
module.exports = { createRouter };
```

Note on the route test: the fake `paper.portfolio` returns no open trades, so `/paper/close` with id `t1` computes `price = NaN`, which the fake `paper.close` ignores. The real ledger rejects a NaN price with 400, which only happens when the trade doesn't exist (already a 404 first via `find`). Keep as written.

`backend/markets/index.js`:
```js
'use strict';
const path = require('node:path');
const { makeJsonFetcher } = require('./http');
const { createYahooAdapter } = require('./adapters/yahoo');
const { createCoinGeckoAdapter } = require('./adapters/coingecko');
const { createPolymarketAdapter } = require('./adapters/polymarket');
const { fetchBasket } = require('./adapters/basket');
const { MODULES } = require('./modules');
const { createEngine } = require('./engine');
const { createPaper } = require('./paper');
const { createRouter } = require('./routes');

function createDefault() {
  const getJson = makeJsonFetcher();
  const engine = createEngine({
    adapters: [createYahooAdapter(getJson), createCoinGeckoAdapter(getJson), createPolymarketAdapter(getJson)],
    modules: MODULES,
    getBasket: () => fetchBasket(getJson),
  });
  // NOTE: Render's disk is ephemeral — the paper ledger resets on deploy. Fine for paper; revisit if it becomes valuable.
  const paper = createPaper({ file: path.join(__dirname, '..', '..', 'data', 'markets-paper.json') });
  return createRouter({ engine, paper });
}
module.exports = { createDefault };
```

`backend/server-production.js` — insert directly after the `/api/cosmetics` mount line (1877):
```js
try { app.use('/api/intel', softAuth, require('./markets').createDefault()); console.log('[prod] market intel mounted'); } catch (e) { console.warn('[prod] market intel skipped:', e.message); } // Market Intelligence Engine: signals/quotes/correlations (public) + paper ledger (login)
```

- [ ] **Step 4: Run tests + live check**

Run: `node --test backend/markets/`
Expected: all test files PASS.

Run (server on a free port; kill it afterwards — owner laptop is low-spec, one job at a time):
```bash
PORT=3999 node backend/server-production.js &
sleep 8; curl -s "http://localhost:3999/api/intel/signals?assetClass=stock" | head -c 600; echo; curl -s http://localhost:3999/api/intel/correlations | head -c 300; echo; kill %1
```
Expected: JSON with `"ok":true`; `signals` may be empty if the market is flat but `errors` should be `[]` or explain which upstream failed. If the server needs other env to boot and fails for unrelated reasons, report that and fall back to the route test only.

- [ ] **Step 5: Commit**

```bash
git add backend/markets/routes.js backend/markets/index.js backend/markets/routes.test.js backend/server-production.js
git commit -m "feat(markets): /api/intel routes, default wiring, server mount

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

(`backend/server-production.js` may already carry unrelated uncommitted edits. Use `git add -p backend/server-production.js` and stage only the new mount line.)

---

### Task 8: Markets Hub UI + Intel station

**Files:**
- Create: `public/markets-hub.html`
- Modify: `public/index.html` (add `intelCard` before `proSignalsCard` at ~line 5996; add a station to `STATIONS` at ~line 6879; change default station fallback)

**Interfaces:**
- Consumes: `/api/intel/signals|quotes|correlations|paper|paper/open|paper/close` (Task 7).

- [ ] **Step 1: Create `public/markets-hub.html`** (self-contained, five tabs; every upstream string goes through `esc()`)

```html
<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Market Intel</title>
<style>
:root{--bg:#06080b;--panel:#0d1218;--edge:#1a232c;--text:#d8e2ea;--mute:#6f8394;--em:#00ff9c;--gold:#e8c45c;--red:#ff5c6c}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:13px/1.45 system-ui,sans-serif}
header{display:flex;gap:6px;align-items:center;padding:10px 12px;border-bottom:1px solid var(--edge);flex-wrap:wrap}
.tab{background:none;border:1px solid var(--edge);color:var(--mute);padding:7px 14px;border-radius:8px;cursor:pointer;font-weight:700;letter-spacing:.04em}
.tab[aria-pressed=true]{background:var(--em);color:#04120c;border-color:var(--em)}
.chips{display:flex;gap:6px;padding:10px 12px;flex-wrap:wrap}.chip{border:1px solid var(--edge);background:none;color:var(--mute);border-radius:999px;padding:4px 12px;cursor:pointer}
.chip[aria-pressed=true]{color:var(--gold);border-color:var(--gold)}
main{padding:0 12px 16px}.err{color:var(--gold);font-size:11px;padding:6px 12px}
.card{background:var(--panel);border:1px solid var(--edge);border-radius:10px;padding:10px 12px;margin-bottom:8px}
.row{display:flex;gap:10px;align-items:center;flex-wrap:wrap}.sym{font-weight:800;min-width:64px}.buy{color:var(--em)}.sell{color:var(--red)}
.mute{color:var(--mute);font-size:11px}.bar{height:5px;border-radius:3px;background:var(--edge);flex:1;min-width:60px;max-width:140px}.bar i{display:block;height:100%;border-radius:3px;background:var(--em)}
button.act{background:none;border:1px solid var(--gold);color:var(--gold);border-radius:6px;padding:4px 10px;cursor:pointer}
table{border-collapse:collapse;width:100%}td,th{padding:6px 8px;border-bottom:1px solid var(--edge);text-align:right}th:first-child,td:first-child{text-align:left}
.regime{padding:8px 12px;margin:0 12px 8px;border:1px solid var(--edge);border-radius:8px;color:var(--mute)}
</style></head><body>
<header id="tabs"></header>
<div class="chips" id="chips"></div>
<div class="regime" id="regime" hidden></div>
<div class="err" id="errs"></div>
<main id="out">Loading…</main>
<script>
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const TABS=[['signals','Signals'],['stocks','Stocks'],['crypto','Crypto'],['corr','Correlations'],['paper','Paper']];
const CLS=[['','All'],['stock','Stocks'],['crypto','Crypto'],['prediction','Predictions']];
let tab=(()=>{try{return localStorage.getItem('mh_tab')||'signals'}catch(_){return 'signals'}})(),cls='';
const $=id=>document.getElementById(id);
const api=async(p,o)=>{const r=await fetch('/api/intel'+p,Object.assign({credentials:'same-origin'},o));let j={};try{j=await r.json()}catch(_){}return Object.assign({_status:r.status},j)};
const money=n=>n==null?'—':(n>=1?n.toLocaleString(undefined,{maximumFractionDigits:2}):String(+n.toPrecision(4)));
const pct=n=>(n>=0?'+':'')+(+n).toFixed(2)+'%';

function head(){
  $('tabs').innerHTML=TABS.map(([k,l])=>`<button class="tab" data-k="${k}" aria-pressed="${k===tab}">${l}</button>`).join('');
  $('chips').hidden=tab!=='signals';
  $('chips').innerHTML=CLS.map(([k,l])=>`<button class="chip" data-c="${k}" aria-pressed="${k===cls}">${l}</button>`).join('');
}
document.addEventListener('click',e=>{
  const t=e.target.closest('.tab'),c=e.target.closest('.chip'),a=e.target.closest('[data-open]'),x=e.target.closest('[data-close]');
  if(t){tab=t.dataset.k;try{localStorage.setItem('mh_tab',tab)}catch(_){}render()}
  else if(c){cls=c.dataset.c;render()}
  else if(a)openTrade(a.dataset.open);
  else if(x)closeTrade(x.dataset.close);
});
function errs(j){$('errs').textContent=(j.errors&&j.errors.length)?'Some sources unavailable: '+j.errors.map(e=>e.adapter).join(', '):''}

function sigRow(s){
  return `<div class="card"><div class="row"><span class="sym">${esc(s.symbol.length>14?s.symbol.slice(0,14)+'…':s.symbol)}</span>
  <span class="${esc(s.side)}">${esc(s.side.toUpperCase())}</span><span class="mute">${esc(s.assetClass)}</span>
  <span class="bar"><i style="width:${Math.round(s.confidence*100)}%"></i></span><span>${Math.round(s.confidence*100)}%</span>
  <span class="mute">entry ${money(s.entry)} → ${money(s.target)} · stop ${money(s.stop)}</span>
  <button class="act" data-open="${esc(s.id)}">Paper trade</button></div>
  <div class="mute">${esc(s.name)} — ${esc(s.rationale)} <em>(${esc(s.moduleId)})</em></div></div>`;
}
async function render(){
  head();$('regime').hidden=true;$('out').textContent='Loading…';
  if(tab==='signals'){
    const j=await api('/signals'+(cls?'?assetClass='+cls:''));errs(j);
    if(j.regime&&j.regime.riskOn!=null){$('regime').hidden=false;$('regime').textContent='Market regime: '+(j.regime.riskOn?'risk-on':'risk-off')+' (SPY 5d '+pct(j.regime.spy5d)+', BTC 5d '+pct(j.regime.btc5d)+')'}
    $('out').innerHTML=(j.signals||[]).map(sigRow).join('')||'<div class="mute">No signals right now — markets are quiet.</div>';
  }else if(tab==='stocks'||tab==='crypto'){
    const j=await api('/quotes?assetClass='+(tab==='stocks'?'stock':'crypto'));errs(j);
    $('out').innerHTML='<table><tr><th>Symbol</th><th>Price</th><th>24h</th></tr>'+(j.quotes||[]).map(q=>`<tr><td>${esc(q.symbol)} <span class="mute">${esc(q.name)}</span></td><td>${money(q.price)}</td><td class="${q.change24hPct>=0?'buy':'sell'}">${pct(q.change24hPct)}</td></tr>`).join('')+'</table>';
  }else if(tab==='corr'){
    const j=await api('/correlations');
    if(!j.symbols||!j.symbols.length){$('out').innerHTML='<div class="mute">Correlation data unavailable right now.</div>';return}
    const cell=v=>v==null?'<td class="mute">—</td>':`<td style="background:${v>=0?`rgba(0,255,156,${Math.abs(v)*.55})`:`rgba(255,92,108,${Math.abs(v)*.55})`}">${v.toFixed(2)}</td>`;
    $('out').innerHTML='<table><tr><th></th>'+j.symbols.map(s=>`<th>${esc(s)}</th>`).join('')+'</tr>'+j.symbols.map((s,i)=>`<tr><td>${esc(s)}</td>${j.values[i].map(cell).join('')}</tr>`).join('')+'</table><div class="mute" style="margin-top:8px">30-day daily-return correlation. Green = move together, red = move opposite.</div>';
  }else{
    const j=await api('/paper');
    if(j._status===401){$('out').innerHTML='<div class="mute">Sign in to paper trade.</div>';return}
    const bm=Object.entries(j.byModule||{});
    $('out').innerHTML=`<div class="card"><div class="row"><b>Equity $${money(j.equity)}</b><span class="mute">cash $${money(j.cash)} · paper money only</span></div></div>`+
      '<h4>Open</h4>'+((j.openTrades||[]).map(t=>`<div class="card row"><span class="sym">${esc(t.symbol)}</span><span class="${esc(t.side)}">${esc(t.side)}</span><span>$${money(t.sizeUsd)} @ ${money(t.entry)}</span><span class="${t.unrealized>=0?'buy':'sell'}">${t.unrealized>=0?'+':''}${t.unrealized}</span><button class="act" data-close="${esc(t.id)}">Close</button></div>`).join('')||'<div class="mute">No open trades.</div>')+
      '<h4>Which strategy is winning</h4>'+(bm.map(([m,v])=>`<div class="card row"><b>${esc(m)}</b><span class="${v.pnl>=0?'buy':'sell'}">${v.pnl>=0?'+':''}${v.pnl}</span><span class="mute">${v.wins}/${v.trades} wins</span></div>`).join('')||'<div class="mute">Close a trade to see strategy results.</div>');
  }
}
async function openTrade(id){
  const v=prompt('Paper trade size in USD (10 – 10,000):','1000');if(!v)return;
  const r=await api('/paper/open',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({signalId:id,sizeUsd:Number(v)})});
  if(r._status===401)alert('Sign in to paper trade.');else if(!r.ok)alert(r.error||'Could not open trade');else{tab='paper';render()}
}
async function closeTrade(id){
  const r=await api('/paper/close',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id})});
  if(!r.ok)alert(r.error||'Could not close');render();
}
render();
</script></body></html>
```

- [ ] **Step 2: Add the station in `public/index.html`**

2a. Immediately before the line containing `<div id="proSignalsCard" class="card"` (~line 5996) insert:
```html
    <div id="intelCard" class="card" style="padding:0;overflow:hidden;border:1px solid rgba(0,255,156,0.25)">
      <iframe id="intelFrame" title="Market Intel" data-src="/markets-hub.html" style="width:100%;height:78vh;border:0;background:#06080b" loading="lazy"></iframe>
    </div>
```
2b. In `STATIONS` (~line 6879) insert as the **first** entry:
```js
        {key:'intel', ic:'🧭', nm:'Intel', ds:'Signals · Stocks · Paper',
          src:[{id:'intelCard'}],
          init:function(){ var f=el('intelFrame'); if(f && !f.getAttribute('src')) f.setAttribute('src', f.dataset.src); }},
```
2c. Change the default: `MK.cur=localStorage.getItem(LS_STA)||'dex';` → `...||'intel';`
2d. Read `lazy(key)` (a few lines below `stationNeedsRetry`, ~line 6960) and confirm it calls `st.init()` the first time a station is focused. If it only inits once via a `_inited` map keyed by station key, no change is needed. If it special-cases keys, add `intel` to the same path.

- [ ] **Step 3: Verify in a browser (one tab, then close it)**

Start the server (`PORT=3999 node backend/server-production.js`), open `http://localhost:3999/markets-hub.html` directly, and check: five tabs switch; Signals shows rows or the quiet-market message; Correlations shows a heatmap or the unavailable message; Paper shows "Sign in" when logged out; no console errors. Then open `http://localhost:3999/index.html`, go to Markets, and confirm the 🧭 Intel station is first, loads the hub, and the other stations still work. Resize to phone width (≈390px) and confirm there is no horizontal scroll. Kill the server. (The owner prefers no leftover servers and no visible browser automation for routine checks — if you can't verify visually, say so explicitly rather than claiming it works.)

- [ ] **Step 4: Commit**

```bash
git add public/markets-hub.html
git add -p public/index.html   # stage ONLY the intelCard, STATIONS entry and default-station edits
git commit -m "feat(markets): Market Intel hub page + Intel station in Markets view

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:** adapters (Task 2; DexScreener deferred, noted at top) · module registry + 3 modules (3) · correlation/regime (4) · engine (5) · paper ledger, per-module P&L (6) · `/api/intel` routes (7) · Markets tab sub-tabs Signals/Stocks/Crypto/Correlations/Paper (8) · Pro terminal wiring: the Intel hub is reachable from the Markets view; adding a "Full Terminal" link from `signals.html` to `/markets-hub.html` and pointing its signal feed at `/api/intel/signals` is deferred to the slice-3 plan alongside TG/MiroFish/MCP (read `signals.html` first; it is a 2k-line file). Spec text said "dexscreener" in adapters and "Pro terminal reads same endpoints" — both are intentionally phased and noted here.

**Placeholders:** none; the one conditional instruction (2d) names exactly what to check.

**Type consistency:** `Quote`/`Signal` shapes are defined once and used identically; `getJson(url, ttlMs)` signature is the same in Tasks 1, 2 and 7; `createEngine({adapters, modules, getBasket, now, ttlMs})` matches its use in `index.js`; paper return shapes `{ok, trade}` / `{ok:false,status,error}` match the router's `out.status` usage; `basket` shape `{SYM:[{d,c}]}` is shared by Tasks 2, 4 and 5.
