/* ══════════════════════════════════════════════════════════════════
   tools-solana.js — REAL Solana / Web3 tools (API-backed, mostly keyless).

   Every tool has a real executor hitting a live public endpoint:
     • Solana JSON-RPC  (api.mainnet-beta.solana.com) — keyless
     • Jupiter          (quote-api.jup.ag / price.jup.ag) — keyless
     • Magic Eden       (api-mainnet.magiceden.dev) — keyless
     • RugCheck         (api.rugcheck.xyz) — keyless
     • DexScreener      (api.dexscreener.com) — keyless
     • Birdeye          (public.birdeye.so) — uses BIRDEYE_API_KEY if set

   Shape matches agent-engine's TOOLS registry: merged via Object.assign,
   `agents:[]` routes each tool to those agents in the dashboard swivel /
   rooms / Bazaar. Executors return a string (JSON) — errors are returned
   as a JSON string, never thrown, so the agent loop stays alive.
   ══════════════════════════════════════════════════════════════════ */
'use strict';

const RPC = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';

async function rpc(method, params) {
  const r = await fetch(RPC, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const j = await r.json();
  if (j.error) throw new Error(j.error.message || 'RPC error');
  return j.result;
}
async function getJson(url, opts) {
  const r = await fetch(url, opts || {});
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}
const ok  = (o) => JSON.stringify(o);
const err = (e) => JSON.stringify({ error: (e && e.message) || String(e) });
const lamportsToSol = (l) => (Number(l) / 1e9);

const TOOLS_SOLANA = {

  sol_account_balance: {
    name: 'sol_account_balance',
    description: 'Live SOL balance for a wallet/account address (Solana mainnet RPC).',
    schema: { address: 'string — base58 wallet address' },
    agents: ['ZEROX', 'ORACLE', 'PIKADON'],
    async execute({ address }) {
      try { if (!address) return err('address required');
        const r = await rpc('getBalance', [address]);
        return ok({ address, sol: lamportsToSol(r.value), lamports: r.value });
      } catch (e) { return err(e); }
    },
  },

  sol_supply: {
    name: 'sol_supply',
    description: 'Circulating + total SOL supply from the network.',
    schema: {},
    agents: ['ZEROX', 'ORACLE'],
    async execute() {
      try { const r = await rpc('getSupply', [{ excludeNonCirculatingAccountsList: true }]);
        const v = r.value || r;
        return ok({ total: lamportsToSol(v.total), circulating: lamportsToSol(v.circulating), nonCirculating: lamportsToSol(v.nonCirculating) });
      } catch (e) { return err(e); }
    },
  },

  sol_token_supply: {
    name: 'sol_token_supply',
    description: 'Total supply + decimals for an SPL token mint.',
    schema: { mint: 'string — SPL token mint address' },
    agents: ['ZEROX', 'ORACLE'],
    async execute({ mint }) {
      try { if (!mint) return err('mint required');
        const r = await rpc('getTokenSupply', [mint]);
        return ok({ mint, amount: r.value.uiAmountString, decimals: r.value.decimals });
      } catch (e) { return err(e); }
    },
  },

  sol_token_holders: {
    name: 'sol_token_holders',
    description: 'Top 20 largest holders (accounts) of an SPL token mint — concentration check.',
    schema: { mint: 'string — SPL token mint address' },
    agents: ['ZEROX', 'ORACLE', 'PIKADON'],
    async execute({ mint }) {
      try { if (!mint) return err('mint required');
        const r = await rpc('getTokenLargestAccounts', [mint]);
        const top = (r.value || []).slice(0, 20).map((a, i) => ({ rank: i + 1, address: a.address, amount: a.uiAmountString }));
        return ok({ mint, topHolders: top });
      } catch (e) { return err(e); }
    },
  },

  sol_tx_history: {
    name: 'sol_tx_history',
    description: 'Recent transaction signatures for a Solana address (most recent first).',
    schema: { address: 'string — wallet/account address', limit: 'number — default 10, max 50' },
    agents: ['ZEROX', 'ORACLE', 'PIKADON'],
    async execute({ address, limit = 10 }) {
      try { if (!address) return err('address required');
        const lim = Math.max(1, Math.min(50, Number(limit) || 10));
        const r = await rpc('getSignaturesForAddress', [address, { limit: lim }]);
        return ok({ address, count: r.length, signatures: r.map((s) => ({ sig: s.signature, slot: s.slot, err: s.err ? 'failed' : 'ok', time: s.blockTime })) });
      } catch (e) { return err(e); }
    },
  },

  sol_epoch: {
    name: 'sol_epoch',
    description: 'Current Solana epoch info — epoch #, slot progress, absolute slot.',
    schema: {},
    agents: ['NEXUS', 'ORACLE'],
    async execute() {
      try { const r = await rpc('getEpochInfo', []);
        return ok({ epoch: r.epoch, slotIndex: r.slotIndex, slotsInEpoch: r.slotsInEpoch, absoluteSlot: r.absoluteSlot, transactionCount: r.transactionCount });
      } catch (e) { return err(e); }
    },
  },

  sol_network_tps: {
    name: 'sol_network_tps',
    description: 'Live Solana throughput (transactions per second) from recent performance samples.',
    schema: {},
    agents: ['NEXUS', 'ORACLE'],
    async execute() {
      try { const r = await rpc('getRecentPerformanceSamples', [3]);
        const s = (r || [])[0];
        if (!s) return err('no samples');
        const tps = s.numTransactions / s.samplePeriodSecs;
        return ok({ tps: Math.round(tps), sampleSecs: s.samplePeriodSecs, txInSample: s.numTransactions });
      } catch (e) { return err(e); }
    },
  },

  jupiter_price: {
    name: 'jupiter_price',
    description: 'Live token price(s) in USD from Jupiter (keyless). Accepts mint(s) or symbol(s).',
    schema: { ids: 'string — comma-separated mints or symbols e.g. SOL,BONK' },
    agents: ['ZEROX', 'ORACLE', 'SHADDAI'],
    async execute({ ids = 'SOL' }) {
      try {
        const list = String(ids).split(',').map((s) => s.trim()).filter(Boolean).slice(0, 6);
        const out = [];
        for (const id of list) {
          const arr = await getJson('https://lite-api.jup.ag/tokens/v2/search?query=' + encodeURIComponent(id));
          const t = Array.isArray(arr) ? arr[0] : null;
          if (t && t.usdPrice != null) out.push({ symbol: t.symbol, name: t.name, price: '$' + Number(t.usdPrice).toLocaleString(), change24h: t.stats24h && t.stats24h.priceChange != null ? Number(t.stats24h.priceChange).toFixed(2) + '%' : null });
        }
        return ok({ prices: out });
      } catch (e) { return err(e); }
    },
  },

  jupiter_quote: {
    name: 'jupiter_quote',
    description: 'Real swap quote (best route + output amount + price impact) from Jupiter aggregator. Keyless.',
    schema: { inputMint: 'string — mint or SOL', outputMint: 'string — mint', amount: 'number — input amount in base units (lamports for SOL)' },
    agents: ['ZEROX', 'NEXUS'],
    async execute({ inputMint = 'So11111111111111111111111111111111111111112', outputMint, amount = 1000000000 }) {
      try { if (!outputMint) return err('outputMint required');
        const url = `https://lite-api.jup.ag/swap/v1/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amount}&slippageBps=50`;
        const d = await getJson(url);
        return ok({ inAmount: d.inAmount, outAmount: d.outAmount, priceImpactPct: d.priceImpactPct, routeHops: (d.routePlan || []).length });
      } catch (e) { return err(e); }
    },
  },

  magiceden_floor: {
    name: 'magiceden_floor',
    description: 'Magic Eden NFT collection stats — floor price, listed count, 24h volume. Keyless.',
    schema: { symbol: 'string — ME collection symbol e.g. mad_lads, okay_bears' },
    agents: ['ORACLE', 'TURTLE', 'ZEROX'],
    async execute({ symbol }) {
      try { if (!symbol) return err('symbol required');
        const d = await getJson('https://api-mainnet.magiceden.dev/v2/collections/' + encodeURIComponent(symbol) + '/stats');
        return ok({ symbol, floorSol: d.floorPrice ? lamportsToSol(d.floorPrice) : null, listed: d.listedCount, volAll: d.volumeAll ? lamportsToSol(d.volumeAll) : null });
      } catch (e) { return err(e); }
    },
  },

  rugcheck_token: {
    name: 'rugcheck_token',
    description: 'RugCheck safety report for an SPL token — risk score + flags. Keyless.',
    schema: { mint: 'string — SPL token mint address' },
    agents: ['PIKADON', 'ZEROX', 'ORACLE'],
    async execute({ mint }) {
      try { if (!mint) return err('mint required');
        const d = await getJson('https://api.rugcheck.xyz/v1/tokens/' + encodeURIComponent(mint) + '/report/summary');
        return ok({ mint, score: d.score, risks: (d.risks || []).map((r) => ({ name: r.name, level: r.level })) });
      } catch (e) { return err(e); }
    },
  },

  dexscreener_token: {
    name: 'dexscreener_token',
    description: 'DexScreener pairs for a token address — price, liquidity, 24h volume, FDV. Keyless, multi-chain.',
    schema: { address: 'string — token contract/mint address' },
    agents: ['ZEROX', 'ORACLE'],
    async execute({ address }) {
      try { if (!address) return err('address required');
        const d = await getJson('https://api.dexscreener.com/latest/dex/tokens/' + encodeURIComponent(address));
        const p = (d.pairs || [])[0];
        if (!p) return ok({ address, note: 'no pairs found' });
        return ok({ symbol: p.baseToken?.symbol, chain: p.chainId, priceUsd: p.priceUsd, liquidityUsd: p.liquidity?.usd, vol24h: p.volume?.h24, fdv: p.fdv });
      } catch (e) { return err(e); }
    },
  },

  dexscreener_search: {
    name: 'dexscreener_search',
    description: 'Search DexScreener for token pairs by name/symbol across chains. Keyless.',
    schema: { query: 'string — token name or symbol' },
    agents: ['ZEROX', 'ORACLE'],
    async execute({ query }) {
      try { if (!query) return err('query required');
        const d = await getJson('https://api.dexscreener.com/latest/dex/search?q=' + encodeURIComponent(query));
        const rows = (d.pairs || []).slice(0, 8).map((p) => ({ symbol: p.baseToken?.symbol, chain: p.chainId, priceUsd: p.priceUsd, vol24h: p.volume?.h24 }));
        return ok({ query, results: rows });
      } catch (e) { return err(e); }
    },
  },

  sol_inflation: {
    name: 'sol_inflation',
    description: 'Current Solana inflation rate (total, validator, foundation).',
    schema: {},
    agents: ['ORACLE', 'ZEROX'],
    async execute() {
      try { const r = await rpc('getInflationRate', []);
        return ok({ total: (r.total * 100).toFixed(2) + '%', validator: (r.validator * 100).toFixed(2) + '%', epoch: r.epoch });
      } catch (e) { return err(e); }
    },
  },

  sol_validators: {
    name: 'sol_validators',
    description: 'Count of current + delinquent Solana validators (network health).',
    schema: {},
    agents: ['NEXUS', 'PIKADON', 'ORACLE'],
    async execute() {
      try { const r = await rpc('getVoteAccounts', []);
        return ok({ current: (r.current || []).length, delinquent: (r.delinquent || []).length });
      } catch (e) { return err(e); }
    },
  },

  sol_token_meta: {
    name: 'sol_token_meta',
    description: 'Token metadata (symbol, name, decimals, logo) from the Jupiter strict token list. Keyless.',
    schema: { mint: 'string — SPL token mint address' },
    agents: ['ORACLE', 'ZEROX', 'TURTLE'],
    async execute({ mint }) {
      try { if (!mint) return err('mint required');
        const arr = await getJson('https://lite-api.jup.ag/tokens/v2/search?query=' + encodeURIComponent(mint));
        const d = Array.isArray(arr) ? arr[0] : null;
        if (!d) return ok({ mint, note: 'not found' });
        return ok({ mint, symbol: d.symbol, name: d.name, decimals: d.decimals, logo: d.icon, holders: d.holderCount, mcap: d.mcap, priceUsd: d.usdPrice });
      } catch (e) { return err(e); }
    },
  },

};

module.exports = { TOOLS_SOLANA };
