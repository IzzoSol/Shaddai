# PIKADON — SECURITY REVIEW (Triple Pass)
**Scope:** Free API registry (`freeapi_registry.json`, 61 APIs), `FREEAPI-HANDOFF.md`, and the planned pro-markets connector (`/api/markets/*`, `/api/free/*`).
**Date:** 2026-08-07 · **Reviewer:** PIKADON (SHADDAI Security & Compliance)
**Verdict:** ⚠️ CONDITIONALLY PASS — 1 medium finding + 7 required hardening rules before the connector ships.

Existing infra the build MUST reuse (already present in `backend/`):
- `security-middleware.js` → helmet, corsMiddleware, `sanitizeMiddleware`, per-IP `apiLimiter` on `/api/`, `csrfProtection`, errorHandler
- `security-hardening.js` → `logAuditEvent()` audit trail
- `key-pool.js` → multi-key rotation on 429 (add new providers' env prefixes)
- `.gitleaks.toml` at repo root → secret scanning (run before every commit)

---

## PASS 1 — ASSETS & SECRETS

### Findings
| # | Severity | Finding | Location | Fix |
|---|----------|---------|----------|-----|
| P1-1 | MEDIUM | Google API key `AIzaSyB9QzPlI9AiAnisSO-jK-UUJ-ZwtmHlzjw` hardcoded in client HTML | `public/index.html:66` (Firebase config) | Firebase web keys are public identifiers, NOT app secrets — but must be **restricted**: (a) in Google Cloud Console set HTTP-referrer restriction to your app's domains + only enable Firebase services; (b) verify Firestore/Storage **security rules** deny public writes; (c) enable Firebase **App Check**. |
| P1-2 | LOW | `_apiAuthValues` / localStorage usage in index.html surfaced in scan | scan false-positive | No action — but keep secrets OUT of localStorage. `localStorage` = readable by any XSS. |
| P1-3 | PASS | Registry + handoff contain **0** real keys (only `{key}` placeholders) | — | Maintain this: never commit real keys. Registry entries marked `"auth":"free key"` must source the value from env only. |
| P1-4 | PASS | `.env` + `.env.local` present and `.gitignore` exists | repo root | Confirm `.env`, `.env.local`, `*.key`, `ai.key` are all gitignored (see `.gitignore`). `ai.key` (57B) at repo root — verify it is ignored or rotate. |

### Rules (Pass 1)
1. **All 31 keyed providers** → env vars in `backend/.env` only: `ALPHAVANTAGE_KEY, FCS_KEY, TWELVEDATA_KEY, FINNHUB_KEY, POLYGON_KEY, FMP_KEY, FRED_KEY, GNES_KEY, NEWSAPI_KEY, NYT_KEY, CRYPTOPANIC_KEY, MARKETAUX_KEY, DUNE_KEY, BLOCKDAEMON_KEY, UNSPLASH_KEY, OPENWEATHER_KEY, MAPBOX_KEY, GTRANSLATE_KEY`.
2. Register rotation prefixes in `key-pool.js` `ENV_PREFIX` for the high-quota ones (finnhub, gnews, marketaux) so 429s auto-cool to a backup key.
3. Keys never appear in: HTML, JS, browser storage, logs, responses, or this repo. Backend proxy = the only consumer.

---

## PASS 2 — ATTACK SURFACE (connector + free APIs)

| # | Vector | Risk | Mitigation (required) |
|---|--------|------|------------------------|
| P2-1 | **SSRF / open proxy** — if `/api/markets/*?provider=...` lets the caller pick a URL/host, the server fetches arbitrary internal hosts | CRITICAL | **Host allow-list.** The route accepts a provider ID (e.g. `yahoo`), never a URL. Map provider→fixed base host. Drop unknown. See template below. |
| P2-2 | **Param injection** — `symbol=SPY;rm /` or `ids=foo&bar`, path traversal into upstream | HIGH | Strict whitelist regex per provider: symbols `^[A-Z0-9.\-=]{1,20}$`, coin ids `^[a-z0-9_\-]{1,64}$`, mint `^[A-Za-z0-9]{32,44}$`, ticker pairs `^[A-Z0-9\-]{2,20}$`. Reject 400 on mismatch. Never interpolate into URL without `encodeURIComponent`. |
| P2-3 | **Key leakage** — upstream calls that need keys get them server-side; if response passes upstream errors through, keys can leak in error bodies | HIGH | Strip upstream `apiKey`/`token` echo from responses. Never `res.send(upstreamRaw)` blindly — map to a fixed safe shape. Strip `Set-Cookie`, `Location` (open redirect via Yahoo meta). |
| P2-4 | **Cache poisoning** — cache key built from unsanitized user input, or TTL too long serving stale cross-user data | MEDIUM | Cache key = `sha256(provider + ':' + validatedParams)`. TTL: stocks 60s, crypto 30s, forex 300s, news 120s, feargreed 3600s. Flag `stale:true` on fallback, never serve wrong provider data. |
| P2-5 | **Rate-limit abuse / free-tier burn** — /api/free/* hammered by bots exhausts 25/day Alpha Vantage etc. | HIGH | Per-IP limiter on the proxy group (reuse `apiLimiter`, e.g. 60 req/min/IP). Provider-level circuit breaker: after N failures mark provider down 5 min. |
| P2-6 | **XSS via market data** — names/titles come from external APIs (RSS, screener CSV, coin names) | MEDIUM | Never inject external strings via `innerHTML`. Build DOM with `textContent` / escape helpers. Symbols rendered as text. Existing `sanitizeMiddleware` guards server-side input only — frontend must escape **output**. |
| P2-7 | **CSRF on alerts** — `POST /api/alerts` adds tokens | MEDIUM | Keep POSTs behind `csrfProtection` (already mounted). Alerts can also live client-side (localStorage) which is fine — but then validate shapes on read (see P2-8). |
| P2-8 | **localStorage tampering** — `pro_filters`, `pro_alerts`, `pro_signals_cache` | LOW | On read: `Array.isArray`, coerce numbers, clamp slider to 0..10, drop unknown alert fields. Never trust saved values as code. |
| P2-9 | **Notification abuse** — auto `Notification.requestPermission()` on page load is both annoying and phishable | LOW | Request only after a user gesture (e.g. clicking "Enable alerts"). Cap polling to 30s and stop when tab hidden (`visibilitychange`). |
| P2-10 | **Logging** — yahoo/guardian may drop requests without UA, but do NOT log Authorization headers | MEDIUM | Redact `Authorization`, `api-key`, `token`, `Cookie` in any request logger. Use `logAuditEvent('MARKETDATA', {...})` for audit, no secrets. |
| P2-11 | **CORS** — pro-signals.html on :3000 calling same-origin `/api/*` | PASS if same-origin | Keep `corsMiddleware` same-origin. NEVER `Access-Control-Allow-Origin: *` for anything returning market data. |

---

## PASS 3 — HARDENING REQUIREMENTS (gate to ship)

### Must-fix checklist (all required before merge)
- [ ] P1-1 Firebase key: referrer-restricted + App Check + rules deny public writes
- [ ] P1-4 `ai.key` gitignored or rotated
- [ ] P2-1 Host allow-list in connector (no user-supplied URL/host)
- [ ] P2-2 Param whitelist regexes per provider (reject 400)
- [ ] P2-3 Responses mapped to fixed safe shape; upstream error bodies stripped
- [ ] P2-4 Hash-keyed cache + TTLs + `stale` flag
- [ ] P2-5 Per-IP rate limit on proxy group + provider circuit breaker
- [ ] P2-6 All external strings rendered via textContent/escape
- [ ] P2-7 Alerts POST behind CSRF
- [ ] P2-9 Notification permission on user gesture only
- [ ] P2-10 Request logs redacted
- [ ] Run `gitleaks detect` — 0 findings before any commit

### Hardened connector template (use this, not a raw fetch pass-through)

```js
// backend/freeapi-gateway.js  (mount in server-production.js)
'use strict';
const crypto = require('crypto');
const { logAuditEvent } = require('./security-hardening');

// P2-1: host allow-list. provider -> { host, build(url, params) }
const PROVIDERS = {
  yahoo:    { host: 'query1.finance.yahoo.com',
              path: p => `/v8/finance/chart/${encodeURIComponent(p.symbol)}?interval=1d&range=1d` },
  coingecko:{ host: 'api.coingecko.com',
              path: () => '/api/v3/simple/price?ids=bitcoin,ethereum,solana&vs_currencies=usd&include_24hr_change=true' },
  erapi:    { host: 'open.er-api.com', path: () => '/v6/latest/USD' },
  fng:      { host: 'api.alternative.me', path: () => '/fng/?limit=7' },
  gnews_rss:{ host: 'news.google.com',
              path: p => `/rss/search?q=${encodeURIComponent(p.q)}&hl=en-US&gl=US&ceid=US:en` },
};
// P2-2: param whitelists
const SYM_RE = /^[A-Z0-9.\-=]{1,20}$/;       // SPY, BTC-USD, GC=F, NVDA
const IDS_RE = /^[a-z0-9_\-]{1,64}$/;        // bitcoin, btc-bitcoin
const MINT_RE = /^[A-Za-z0-9]{32,44}$/;      // solana mint
const CACHE_TTL = { yahoo: 60e3, coingecko: 30e3, erapi: 300e3, fng: 3600e3, gnews_rss: 120e3 };
const cache = new Map();                      // P2-4 hash-keyed

function validate(p, params) {
  for (const k of Object.keys(params)) {
    const v = params[k];
    if (k === 'symbol' && !SYM_RE.test(v)) return false;
    if (k === 'ids'   && !IDS_RE.test(v))  return false;
    if (k === 'mint'  && !MINT_RE.test(v)) return false;
    if (k === 'q'     && v.length > 100)   return false;
  }
  return PROVIDERS[p] && Object.keys(params).length <= 3;
}

module.exports = function gateway(req, res) {
  const p = (req.params.provider || '').toLowerCase();
  const params = req.query || {};
  if (!validate(p, params)) { logAuditEvent('MARKETDATA_REJECT', { provider: p, ip: req.ip }); return res.status(400).json({ error: 'bad_request' }); }

  const key = crypto.createHash('sha256').update(p + ':' + JSON.stringify(params)).digest('hex');
  const hit = cache.get(key);
  if (hit && Date.now() - hit.ts < CACHE_TTL[p]) return res.json(hit.data);

  const prov = PROVIDERS[p];
  const url = 'https://' + prov.host + prov.path(params);   // P2-1 fixed host only
  fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 SHADDAI' }, signal: AbortSignal.timeout(10e3) })
    .then(r => r.text()).then(raw => {
      const data = { provider: p, ts: Date.now(), data: raw.slice(0, 200_000) }; // P2-3 size cap, fixed shape
      cache.set(key, { data, ts: Date.now() });
      logAuditEvent('MARKETDATA_OK', { provider: p, bytes: raw.length });
      res.json(data);
    })
    .catch(e => { logAuditEvent('MARKETDATA_FAIL', { provider: p, ip: req.ip }); res.status(502).json({ error: 'upstream_failed', stale: !!hit }); });
};
```

Wire it with the existing limiter (P2-5):
```js
app.use('/api/free/:provider', require('./freeapi-gateway'));        // host allow-listed
app.use('/api/free', limiter);                                        // per-IP cap (P2-5)
```
Never a route like `/api/free?url=...` — the allow-list gate is the whole point.

---

## Sign-off
| Pass | Result |
|------|--------|
| Pass 1 — Assets & Secrets | 1 MEDIUM (Firebase key restriction) + 1 LOW (ai.key) |
| Pass 2 — Attack Surface | 11 vectors reviewed, 6 REQUIRED gates |
| Pass 3 — Hardening | 12-point checklist + gateway template |

**PIKADON verdict:** Ship the connector ONLY with all 12 checklist items done. Highest priority: host allow-list (P2-1), param whitelist (P2-2), key hygiene (P1), and output escaping (P2-6).
