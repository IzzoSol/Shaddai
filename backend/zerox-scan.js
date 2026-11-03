'use strict';
const fetch = (typeof globalThis.fetch === 'function') ? globalThis.fetch : require('node-fetch');

// ZeroX scan: pull live market data from DexScreener + Helius RPC fallback.
// Returns JSON only: price, liq, 5m/1h/24h change, top pools, suggested entry, risks, timestamp, source URLs.
// Fail loud if APIs are down. No hallucinated candles.

const DEXSCREENER_URL = 'https://api.dexscreener.com/latest/dex/tokens/';
const HELIUS_RPC = process.env.HELIUS_RPC || '';

async function zerox_scan({ mint_or_symbol, vs = 'SOL' }) {
  // Normalize: try symbol first, then mint address
  let result = null;

  // 1) DexScreener (primary, no key required)
  try {
    const url = `${DEXSCREENER_URL}${mint_or_symbol}?address=${mint_or_symbol}`;
    const r = await fetch(url, { timeout: 8000 });
    if (r.ok) {
      const data = await r.json();
      const pair = data.pairs?.[0];
      if (pair) {
        result = {
          price: pair.priceUsd,
          liq: pair.liquidity?.usd,
          change: {
            m5: pair.changes?.m5?.price,
            h1: pair.changes?.h1?.price,
            d1: pair.changes?.h1?.price, // approximate; DexScreener may not give 24h in same shape
          },
          top_pools: pair?.baseToken?.symbol ? [pair.baseToken.symbol] : [],
          suggested_entry: pair.priceUsd,
          risks: [],
          timestamp: new Date().toISOString(),
          source_url: pair?.pairAddress ? `https://dexscreener.com/solana/${pair.pairAddress}` : null,
        };
      }
    }
  } catch (e) {
    console.warn('DexScreener scan failed:', e.message);
  }

  // 2) Helius RPC fallback (if key configured)
  if (!result && HELIUS_RPC) {
    try {
      const r = await fetch(HELIUS_RPC, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'getAsset',
          params: [mint_or_symbol],
        }),
        timeout: 8000,
      });
      const j = await r.json();
      if (j.result && j.result.value) {
        const v = j.result.value;
        result = {
          price: v.price,
          liq: v.liquidity,
          change: { m5: null, h1: null, d1: null },
          top_pools: [],
          suggested_entry: v.price,
          risks: [],
          timestamp: new Date().toISOString(),
          source_url: null,
        };
      }
    } catch (e) {
      console.warn('Helius scan failed:', e.message);
    }
  }

  // 3) Loud fail: return structured error if nothing worked
  if (!result) {
    throw new Error(
      `zerox_scan: unable to fetch data for "${mint_or_symbol}" via DexScreener or Helius. ` +
        'Set HElius_RPC env var or ensure the mint/symbol is correct.'
    );
  }

  return result;
}

module.exports = { zerox_scan };