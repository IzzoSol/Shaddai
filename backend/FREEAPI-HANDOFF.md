# FREE API HANDOFF — MiroFish / Pro-Markets Build

> For the terminal building `pro-signals.html` + the `MARKETS` panel.
> Source of truth: `SHADDAI-SYSTEM/configs/freeapi_registry.json` (verified 2026-08-07).
> All no-key endpoints below were **live-tested from this machine**. Keys in `backend/.env` when required.

---

## 1. NO-KEY MARKET DATA (verified live, use these FIRST)

### STOCKS
| Provider | Endpoint | Shape |
|----------|----------|-------|
| **Yahoo Finance** (unofficial) | `GET https://query1.finance.yahoo.com/v8/finance/chart/AAPL?interval=1d&range=1d` | `chart.result[0].meta.{regularMarketPrice, chartPreviousClose, currency, longName, regularMarketChangePercent}` + `indicators.quote[0]` |
| **Finviz Screener** | `GET https://finviz.com/screener.ashx?v=152&f=cap_microover&o=-marketcap` | CSV: `No., Ticker, Company, Sector, Market Cap, P/E, Price, Change`. Top gainers: `f=sh_price_5to100,o=-change` |

> Yahoo symbols: `SPY QQQ AAPL NVDA TSLA META MSFT AMZN GOOGL` + commodities `GC=F SI=F CL=F NG=F`.
> Yahoo is unofficial + fragile — ALWAYS proxy via backend, cache 60s, and fall back to the crypto exchanges for anything crypto-shaped.

### CRYPTO
| Provider | Endpoint | Shape |
|----------|----------|-------|
| **CoinGecko** | `GET https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana&vs_currencies=usd&include_24hr_change=true` | `{id:{usd, usd_24h_change}}`; also `/coins/markets?vs_currency=usd&per_page=30` gives `{image}` for logos |
| **DexScreener** | `GET https://api.dexscreener.com/latest/dex/tokens/{mint1,mint2,...}` (batch 30) | `pairs[0].info.imageUrl` = token logo; `{priceUsd, fdv, volume.h24, liquidity.usd}`. Search: `/search?q=SOL` |
| **GeckoTerminal** | `GET https://api.geckoterminal.com/api/v2/networks/solana/trending_pools` | DEX candles/OHLCV, 100+ chains, token logo in `base_token.image_url` |
| **CoinPaprika** | `GET https://api.coinpaprika.com/v1/tickers/btc-bitcoin` | `quotes.USD.{price, percent_change_24h, market_cap}` + `/people` for team bios |
| **CoinLore** | `GET https://api.coinlore.net/api/ticker/?id=90` | `[{price_usd, percent_change_24h, market_cap_usd}]` |
| **Alternative.me** | `GET https://api.alternative.me/fng/?limit=7` | `data[].{value, value_classification}` — **this is the Fear & Greed panel source** |

### EXCHANGE PUBLIC TICKERS (no key — multi-source redundancy + cross-exchange sanity)
| Provider | Endpoint |
|----------|----------|
| Coinbase | `GET https://api.coinbase.com/v2/prices/BTC-USD/spot` |
| OKX | `GET https://www.okx.com/api/v5/market/ticker?instId=BTC-USDT` |
| Kraken | `GET https://api.kraken.com/0/public/Ticker?pair=XBTUSD` |
| Binance.US | `GET https://api.binance.us/api/v3/ticker/price?symbol=BTCUSDT` (use .US — api.binance.com is 451-geo-blocked) |
| KuCoin | `GET https://api.kucoin.com/api/v1/market/orderbook/level1?symbol=BTC-USDT` |
| MEXC | `GET https://api.mexc.com/api/v3/ticker/price?symbol=BTCUSDT` |
| Bitstamp | `GET https://www.bitstamp.net/api/v2/ticker/btcusd/` |
| Gemini | `GET https://api.gemini.com/v1/pubticker/btcusd` |

### FOREX / DATA
| Provider | Endpoint |
|----------|----------|
| **open.er-api** | `GET https://open.er-api.com/v6/latest/USD` → `rates.{EUR, GBP, JPY, CAD, AUD, CHF}` |
| Open-Meteo | `GET https://api.open-meteo.com/v1/forecast?latitude=40.7&longitude=-74&current_weather=true` |
| Picsum | `GET https://picsum.photos/seed/{any}/400` → placeholder images |

---

## 2. NO-KEY NEWS (verified live)

| Provider | Endpoint | Shape |
|----------|----------|-------|
| **Google News RSS** | `GET https://news.google.com/rss/search?q=crypto&hl=en-US&gl=US&ceid=US:en` | RSS XML `<item><title><link><pubDate>` |
| **CoinDesk RSS** | `GET https://www.coindesk.com/arc/outboundfeeds/rss/` | RSS XML |
| **CoinTelegraph RSS** | `GET https://cointelegraph.com/rss` | RSS XML |
| **Hacker News** | `GET https://hacker-news.firebaseio.com/v0/topstories.json` + `/item/{id}.json` | `{title, url, score, descendants}` |
| **Guardian** | `GET https://content.guardianapis.com/search?q=crypto&api-key=test` | `results[]: {webTitle, webUrl, webPublicationDate}` (test key works) |

> RSS → JSON: parse with `fast-xml-parser` or regex `<title>`. Rotate Google News `q=` for per-topic feeds.

---

## 3. FREE-TIER WITH KEY (sign up, drop key in `backend/.env`)

**Trading/stocks:** Alpha Vantage (25/day), FCS API (500/mo), Twelve Data (800/day), Finnhub (60/min), Polygon (5/min, options), Financial Modeling Prep (250/day), FRED (120/min economic).
**Crypto:** CoinMarketCap (15k credits/mo, keyless trial), CryptoCompare (100k/mo), Dune (SQL on-chain), Blockdaemon (nodes).
**News:** CryptoPanic (crypto news), Marketaux (has per-ticker **sentiment** — use for pro-markets sentiment score), NewsAPI.org (100/day), GNews (100/day), NYT (500/day).
**Trading bots:** Alpaca (paper trading + market data + news, 200/min) — best free paper-trading sandbox.
**AI:** Groq, OpenRouter, HuggingFace Inference (free tiers).

---

## 4. RECOMMENDED ARCHITECTURE (server-production.js)

```js
// 3 proxy routes the pro-markets build needs. Add to server-production.js:
// all cache in-memory 60s, all attach { provider, lastUpdated } to response.

GET /api/markets/stocks   -> Yahoo Finance v8/finance/chart, symbols=SPY,QQQ,...&commodities=1
GET /api/markets/crypto   -> CoinGecko /coins/markets (30 coins) + CoinPaprika fallback
GET /api/markets/forex    -> open.er-api/v6/latest/USD (cache 5 min)
GET /api/markets/news     -> Google News RSS (q param) parsed to JSON
GET /api/markets/feargreed-> alternative.me/fng (cache 60 min)
```

**Fallback ladder (write it into one helper):**
1. Yahoo (stocks/commodities) or CoinGecko (crypto)
2. CoinPaprika / CoinLore
3. Exchange ticker (OKX → Kraken → Binance.US)
4. If all fail → serve last cached value + `stale:true` flag

**Rules from verification:**
- `api.binance.com` → 451 in US. Use `api.binance.us`.
- `api.coincap.io`, `api.jup.ag`, `api-inference.huggingface.co` → DNS-blocked on this network, OK elsewhere (keep in fallbacks).
- Stooq returns 404 on the old `/q/l/` path — prefer Yahoo.
- IEX Cloud is **sunset** — never use.
- Always send `User-Agent: Mozilla/5.0 ...` header — Yahoo/Finviz/Guardian drop requests without one.

---

## 5. COUNT SUMMARY

- **Verified live, no key (trading + news + data): 25**
  (Yahoo, Finviz, CoinGecko, DexScreener, GeckoTerminal, CoinPaprika, CoinLore, Alternative.me, Coinbase, OKX, Kraken, Binance.US, KuCoin, MEXC, Bitstamp, Gemini, open.er-api, Open-Meteo, Picsum, Google News, CoinDesk, CoinTelegraph, Hacker News, Guardian, ipwho.is-fallback)
- **Free-tier with key / self-host: 31** (in registry)
- **Dead/avoid: IEX Cloud (sunset), CoinCap & Jupiter & HF-Inference (DNS-blocked here), Stooq (404)**

Full manifest with return shapes + brain transcript IDs: `SHADDAI-SYSTEM/configs/freeapi_registry.json`
