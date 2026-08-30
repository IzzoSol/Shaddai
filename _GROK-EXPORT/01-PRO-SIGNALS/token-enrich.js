/* ══════════════════════════════════════════════════════════════════════════
   TOKEN ENRICHMENT — logos, socials and live pair data for a list of mints.

   The signal feed stores what the scanner saw when it called a coin: mint,
   symbol, entry FDV, multiples. It has no logo and no socials, so the signals
   UI could show neither — and "does this coin have a Twitter" is one of the
   first things anyone checks before buying.

   DexScreener's token endpoint carries all of it, keyless:
     https://api.dexscreener.com/latest/dex/tokens/<comma separated mints>
   returning info.imageUrl, info.socials[{type,url}], info.websites[] plus
   live price, volume and priceChange.

   THREE THINGS THIS FILE EXISTS TO GET RIGHT:

   1. BATCHING. The endpoint takes up to 30 addresses per call. Asking for 300
      coins one at a time is 300 requests and a rate-limit ban; asking in
      batches of 30 is ten.
   2. CACHING. The signals page refreshes every 60s and several people may have
      it open. Without a cache that is a request storm against a free API that
      owes us nothing.
   3. NEVER FAILING THE CALLER. Enrichment is decoration. If DexScreener is
      slow or down the signals still have to render — so every failure path
      returns "no extra data" rather than an error.
   ══════════════════════════════════════════════════════════════════════════ */
'use strict';

const BASE = 'https://api.dexscreener.com/latest/dex/tokens/';
const BATCH = 30;                  // the endpoint's documented ceiling
const TTL_MS = 90 * 1000;          // a logo does not change; price does
const MAX_CACHE = 4000;

const cache = new Map();           // mint -> { at, data }

function fresh(mint) {
  const hit = cache.get(mint);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.data;
  return null;
}

function remember(mint, data) {
  // Bounded, oldest-first. An unbounded Map here is a slow memory leak in a
  // long-running server, and this one is fed by user-supplied mint lists.
  if (cache.size >= MAX_CACHE) {
    const drop = Math.ceil(MAX_CACHE * 0.2);
    let i = 0;
    for (const k of cache.keys()) { cache.delete(k); if (++i >= drop) break; }
  }
  cache.set(mint, { at: Date.now(), data });
}

/* One token can have many pairs. The one that matters is the deepest — that is
   where price is real and where a buyer would actually land. */
function bestPair(pairs) {
  return pairs.reduce((best, p) => {
    const l = Number((p.liquidity && p.liquidity.usd) || 0);
    const bl = best ? Number((best.liquidity && best.liquidity.usd) || 0) : -1;
    return l > bl ? p : best;
  }, null);
}

function shape(pair) {
  if (!pair) return null;
  const info = pair.info || {};
  const socials = Array.isArray(info.socials) ? info.socials : [];
  const websites = Array.isArray(info.websites) ? info.websites : [];
  const has = (t) => socials.some((s) => String(s.type || '').toLowerCase() === t);

  return {
    symbol: (pair.baseToken && pair.baseToken.symbol) || null,
    image: info.imageUrl || null,
    // Typed flags rather than raw arrays: the UI filters on "has a Twitter",
    // and asking every caller to re-derive that from a list invites drift.
    socials: {
      any: socials.length > 0 || websites.length > 0,
      twitter: has('twitter'),
      telegram: has('telegram'),
      discord: has('discord'),
      website: websites.length > 0,
      links: socials.slice(0, 4).map((s) => ({ type: s.type, url: s.url })),
      site: (websites[0] && websites[0].url) || null,
    },
    priceUsd: Number(pair.priceUsd) || null,
    liq: Number((pair.liquidity && pair.liquidity.usd) || 0),
    vol24: Number((pair.volume && pair.volume.h24) || 0),
    vol1h: Number((pair.volume && pair.volume.h1) || 0),
    chg24: Number((pair.priceChange && pair.priceChange.h24) || 0),
    chg1h: Number((pair.priceChange && pair.priceChange.h1) || 0),
    pairUrl: pair.url || null,
    dex: pair.dexId || null,
    pairCreatedAt: pair.pairCreatedAt || null,
  };
}

async function fetchBatch(mints) {
  const out = {};
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 9000);   // never hang a page render
    const res = await fetch(BASE + mints.join(','), { signal: ctl.signal });
    clearTimeout(timer);
    if (!res.ok) throw new Error('dexscreener ' + res.status);
    const data = await res.json();

    const byMint = {};
    for (const p of (data.pairs || [])) {
      const addr = p.baseToken && p.baseToken.address;
      if (!addr) continue;
      (byMint[addr] = byMint[addr] || []).push(p);
    }
    for (const m of mints) {
      const shaped = shape(bestPair(byMint[m] || []));
      out[m] = shaped;
      remember(m, shaped);       // cache misses too, so a dud is not re-fetched
    }
  } catch (e) {
    // Decoration must never break the page. Record nothing so the next call
    // retries rather than caching a failure as "this coin has no logo".
    console.warn('[token-enrich] batch failed:', e && e.message);
    for (const m of mints) if (!(m in out)) out[m] = null;
  }
  return out;
}

/**
 * Enrich a list of mints. Returns { <mint>: {image, socials, ...} | null }.
 * Never throws.
 *
 * @param {string[]} mints
 * @param {number} [cap] hard ceiling on how many to look up (default 120)
 */
async function enrich(mints, cap) {
  const list = [...new Set((mints || []).filter(Boolean))].slice(0, cap || 120);
  const out = {};
  const need = [];

  for (const m of list) {
    const hit = fresh(m);
    if (hit !== null) out[m] = hit; else need.push(m);
  }
  if (!need.length) return out;

  const batches = [];
  for (let i = 0; i < need.length; i += BATCH) batches.push(need.slice(i, i + BATCH));

  // Parallel, but bounded by the cap above — ten batches at most by default.
  const results = await Promise.all(batches.map(fetchBatch));
  for (const r of results) Object.assign(out, r);
  return out;
}

/* The coins currently being pushed hardest on DexScreener, with logos and
   socials already attached.

   Source is /token-boosts/top/v1, NOT the pair search. Two earlier attempts
   were wrong in instructive ways:
     · /latest/dex/pairs/solana?limit=25 is not an endpoint — it returns an
       HTML error page, which is why /top-dex answered "Unexpected token '<'".
     · /latest/dex/search?q=SOL returns whatever matches the string, so the top
       result was SOL itself on $128k volume, almost none of it with a logo.

   The boosts feed is the honest answer to "what is being promoted right now",
   carries `icon` and `links` natively, and doubles as the boost signal the
   product already cares about. Live price and volume are layered on top from
   the token endpoint, so a boosted coin with no liquidity is still visible as
   exactly that rather than silently omitted. */
async function topDex(limit) {
  const n = Math.max(1, Math.min(Number(limit) || 25, 50));
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 9000);
    const res = await fetch('https://api.dexscreener.com/token-boosts/top/v1', { signal: ctl.signal });
    clearTimeout(timer);
    if (!res.ok) throw new Error('dexscreener ' + res.status);

    const raw = await res.json();
    const rows = (Array.isArray(raw) ? raw : (raw.data || []))
      .filter((x) => x && x.chainId === 'solana' && x.tokenAddress)
      .slice(0, n);
    if (!rows.length) return [];

    // live numbers for the same set, in one batched call
    const live = await enrich(rows.map((r) => r.tokenAddress), n);

    return rows.map((r, i) => {
      const L = live[r.tokenAddress] || {};
      const links = Array.isArray(r.links) ? r.links : [];
      const typed = (t) => links.some((l) => String(l.type || l.label || '').toLowerCase() === t);
      const site = links.find((l) => !l.type && l.url) || null;

      return {
        rank: i + 1,
        mint: r.tokenAddress,
        symbol: (L.symbol) || '',
        name: String(r.description || '').split(String.fromCharCode(10))[0].slice(0, 60),
        boost: Number(r.totalAmount) || 0,
        // the boost feed's own icon wins — it is the artwork the team paid to show
        image: r.icon || L.image || null,
        socials: {
          any: links.length > 0 || !!(L.socials && L.socials.any),
          twitter: typed('twitter') || !!(L.socials && L.socials.twitter),
          telegram: typed('telegram') || !!(L.socials && L.socials.telegram),
          discord: typed('discord') || !!(L.socials && L.socials.discord),
          website: !!site || !!(L.socials && L.socials.website),
          links: links.slice(0, 4).map((l) => ({ type: l.type || 'website', url: l.url })),
          site: site ? site.url : (L.socials && L.socials.site) || null,
        },
        priceUsd: L.priceUsd || null,
        liq: L.liq || 0,
        vol24: L.vol24 || 0,
        vol1h: L.vol1h || 0,
        chg24: L.chg24 || 0,
        chg1h: L.chg1h || 0,
        pairUrl: L.pairUrl || r.url || null,
        dex: L.dex || null,
      };
    });
  } catch (e) {
    console.warn('[token-enrich] topDex failed:', e && e.message);
    return [];
  }
}

module.exports = { enrich, topDex, _cacheSize: () => cache.size };
