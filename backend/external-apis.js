/**
 * External API Integration Module
 * Handles calls to Ollama, DexScreener, CoinGecko, Helius, and other external services
 */

const axios = require('axios');

const OLLAMA_URL = process.env.OLLAMA_API_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'mistral';
const HELIUS_KEY = process.env.HELIUS_API_KEY;
// DexScreener: env may not have /latest — always force it
const _dsBase = (process.env.DEXSCREENER_API_URL || 'https://api.dexscreener.com').replace(/\/+$/, '');
const DEXSCREENER_URL = _dsBase.endsWith('/latest') ? _dsBase : _dsBase + '/latest';
const COINGECKO_URL = process.env.COINGECKO_API_URL || 'https://api.coingecko.com/api/v3';

// ═══════════════════════════════════════════════════════════════
// OLLAMA LLM API
// ═══════════════════════════════════════════════════════════════

async function callOllama(prompt, model = OLLAMA_MODEL) {
  try {
    const response = await axios.post(`${OLLAMA_URL}/api/generate`, {
      model,
      prompt,
      stream: false
    }, { timeout: 120000 });
    return response.data.response;
  } catch (error) {
    console.error('[OLLAMA] Error:', error.message);
    throw new Error(`Ollama API failed: ${error.message}`);
  }
}

async function listOllamaModels() {
  try {
    const response = await axios.get(`${OLLAMA_URL}/api/tags`, { timeout: 5000 });
    return response.data.models || [];
  } catch (error) {
    console.error('[OLLAMA] Models list error:', error.message);
    return [];
  }
}

// ═══════════════════════════════════════════════════════════════
// DEXSCREENER - Crypto Market Data
// ═══════════════════════════════════════════════════════════════

async function getDexScreenerData(tokenAddress) {
  try {
    const response = await axios.get(
      `${DEXSCREENER_URL}/dex/search?q=${tokenAddress}`,
      { timeout: 10000 }
    );
    return response.data;
  } catch (error) {
    console.error('[DEXSCREENER] Error:', error.message);
    throw new Error(`DexScreener API failed: ${error.message}`);
  }
}

async function getDexScreenerPairs(chainId, tokenAddress) {
  try {
    const response = await axios.get(
      `${DEXSCREENER_URL}/dex/pairs/${chainId}/${tokenAddress}`,
      { timeout: 10000 }
    );
    return response.data;
  } catch (error) {
    console.error('[DEXSCREENER] Pairs error:', error.message);
    throw new Error(`DexScreener pairs API failed: ${error.message}`);
  }
}

// ═══════════════════════════════════════════════════════════════
// COINGECKO - Price & Trend Data
// ═══════════════════════════════════════════════════════════════

async function getCoinGeckoPrice(coinId) {
  try {
    const response = await axios.get(
      `${COINGECKO_URL}/simple/price?ids=${coinId}&vs_currencies=usd&include_market_cap=true&include_24hr_vol=true`,
      { timeout: 10000 }
    );
    return response.data;
  } catch (error) {
    console.error('[COINGECKO] Price error:', error.message);
    throw new Error(`CoinGecko API failed: ${error.message}`);
  }
}

async function getCoinGeckoMarketData(coinId) {
  try {
    const response = await axios.get(
      `${COINGECKO_URL}/coins/${coinId}`,
      { timeout: 10000 }
    );
    return response.data;
  } catch (error) {
    console.error('[COINGECKO] Market data error:', error.message);
    throw new Error(`CoinGecko market data failed: ${error.message}`);
  }
}

// ═══════════════════════════════════════════════════════════════
// HELIUS - Solana RPC
// ═══════════════════════════════════════════════════════════════

async function getHeliusBalance(walletAddress) {
  try {
    const response = await axios.post(
      `https://mainnet.helius-rpc.com/?api-key=${HELIUS_KEY}`,
      {
        jsonrpc: '2.0',
        id: 1,
        method: 'getBalance',
        params: [walletAddress]
      },
      { timeout: 10000 }
    );
    if (response.data.result) {
      return response.data.result.value / 1e9; // Convert lamports to SOL
    }
    throw new Error('Invalid response format');
  } catch (error) {
    console.error('[HELIUS] Balance error:', error.message);
    throw new Error(`Helius RPC failed: ${error.message}`);
  }
}

async function getHeliusTokenAccounts(walletAddress) {
  try {
    const response = await axios.post(
      `https://mainnet.helius-rpc.com/?api-key=${HELIUS_KEY}`,
      {
        jsonrpc: '2.0',
        id: 1,
        method: 'getTokenAccountsByOwner',
        params: [
          walletAddress,
          { programId: 'TokenkegQfeZyiNwAJsyFbPVwwQQfg5bgUvCMSLw6ak' },
          { encoding: 'jsonParsed' }
        ]
      },
      { timeout: 10000 }
    );
    return response.data.result?.value || [];
  } catch (error) {
    console.error('[HELIUS] Token accounts error:', error.message);
    throw new Error(`Helius token query failed: ${error.message}`);
  }
}

// ═══════════════════════════════════════════════════════════════
// POLYMARKET CLOB API
// ═══════════════════════════════════════════════════════════════

async function getPolymarketMarkets() {
  try {
    const response = await axios.get(
      'https://clob.polymarket.com/markets',
      { timeout: 10000 }
    );
    return response.data;
  } catch (error) {
    console.error('[POLYMARKET] Markets error:', error.message);
    throw new Error(`Polymarket API failed: ${error.message}`);
  }
}

async function getPolymarketPrices() {
  try {
    const response = await axios.get(
      'https://clob.polymarket.com/prices',
      { timeout: 10000 }
    );
    return response.data;
  } catch (error) {
    console.error('[POLYMARKET] Prices error:', error.message);
    throw new Error(`Polymarket prices failed: ${error.message}`);
  }
}

// ═══════════════════════════════════════════════════════════════
// MESSARI - On-Chain Metrics
// ═══════════════════════════════════════════════════════════════

async function getMessariAssetMetrics(assetKey) {
  try {
    const response = await axios.get(
      `https://data.messari.io/api/v1/assets/${assetKey}/metrics`,
      { timeout: 10000, headers: { Authorization: `Messari ${process.env.MESSARI_API_KEY}` } }
    );
    return response.data;
  } catch (error) {
    console.error('[MESSARI] Metrics error:', error.message);
    throw error;
  }
}

// ═══════════════════════════════════════════════════════════════
// GLASSNODE - On-Chain Analytics
// ═══════════════════════════════════════════════════════════════

async function getGlassnodeMetric(metric, asset = 'BTC') {
  try {
    const response = await axios.get(
      `https://api.glassnode.com/v1/metrics/blockchain/${metric}`,
      {
        params: { a: asset, api_key: process.env.GLASSNODE_API_KEY },
        timeout: 10000
      }
    );
    return response.data;
  } catch (error) {
    console.error('[GLASSNODE] Metric error:', error.message);
    throw error;
  }
}

// ═══════════════════════════════════════════════════════════════
// BIRDEYE - Solana DEX Analytics
// ═══════════════════════════════════════════════════════════════

async function getBirdeyeTokenOverview(tokenAddress) {
  try {
    const response = await axios.get(
      `https://api.birdeye.so/defi/token_overview`,
      {
        params: { address: tokenAddress },
        headers: { 'X-API-KEY': process.env.BIRDEYE_API_KEY },
        timeout: 10000
      }
    );
    return response.data;
  } catch (error) {
    console.error('[BIRDEYE] Token overview error:', error.message);
    throw error;
  }
}

// ═══════════════════════════════════════════════════════════════
// LLAMAFO - Protocol & TVL Analytics
// ═══════════════════════════════════════════════════════════════

async function getLlamaFolio(address) {
  try {
    const response = await axios.get(
      `https://api.llama.fi/portfolio/${address}`,
      { timeout: 10000 }
    );
    return response.data;
  } catch (error) {
    console.error('[LLAMAFO] Portfolio error:', error.message);
    throw error;
  }
}

async function getLlamaTVL() {
  try {
    const response = await axios.get(
      `https://api.llama.fi/tvl`,
      { timeout: 10000 }
    );
    return response.data;
  } catch (error) {
    console.error('[LLAMAFO] TVL error:', error.message);
    throw error;
  }
}

// ═══════════════════════════════════════════════════════════════
// JUPITER - Solana DEX Quotes
// ═══════════════════════════════════════════════════════════════

async function getJupiterQuote(inputMint, outputMint, amount) {
  try {
    const response = await axios.get(
      `https://quote-api.jup.ag/v6/quote`,
      {
        params: {
          inputMint,
          outputMint,
          amount,
          slippageBps: 50
        },
        timeout: 10000
      }
    );
    return response.data;
  } catch (error) {
    console.error('[JUPITER] Quote error:', error.message);
    throw error;
  }
}

// ═══════════════════════════════════════════════════════════════
// NEWSAPI - Crypto News
// ═══════════════════════════════════════════════════════════════

async function getNewsAPIHeadlines(query = 'cryptocurrency') {
  try {
    const response = await axios.get(
      `https://newsapi.org/v2/top-headlines`,
      {
        params: {
          q: query,
          sortBy: 'publishedAt',
          apiKey: process.env.NEWSAPI_API_KEY
        },
        timeout: 10000
      }
    );
    return response.data;
  } catch (error) {
    console.error('[NEWSAPI] Headlines error:', error.message);
    throw error;
  }
}

// ═══════════════════════════════════════════════════════════════
// COINGLASS - Futures Analytics
// ═══════════════════════════════════════════════════════════════

async function getCoinglass(endpoint, params = {}) {
  try {
    const response = await axios.get(
      `https://api.coinglass.com${endpoint}`,
      {
        params: { ...params, apikey: process.env.COINGLASS_API_KEY },
        timeout: 10000
      }
    );
    return response.data;
  } catch (error) {
    console.error('[COINGLASS] Error:', error.message);
    throw error;
  }
}

// ═══════════════════════════════════════════════════════════════
// HEALTH CHECK
// ═══════════════════════════════════════════════════════════════

async function checkAPIs() {
  const status = {
    ollama: false,
    dexscreener: false,
    coingecko: false,
    helius: false,
    polymarket: false,
    timestamp: new Date().toISOString()
  };

  // Check Ollama
  try {
    await axios.get(`${OLLAMA_URL}/api/tags`, { timeout: 3000 });
    status.ollama = true;
  } catch (e) {
    console.warn('[HEALTH] Ollama unavailable');
  }

  // Check DexScreener
  try {
    await axios.get(DEXSCREENER_URL, { timeout: 3000 });
    status.dexscreener = true;
  } catch (e) {
    console.warn('[HEALTH] DexScreener unavailable');
  }

  // Check CoinGecko
  try {
    await axios.get(`${COINGECKO_URL}/ping`, { timeout: 3000 });
    status.coingecko = true;
  } catch (e) {
    console.warn('[HEALTH] CoinGecko unavailable');
  }

  // Check Helius
  try {
    await axios.post(`https://mainnet.helius-rpc.com/?api-key=${HELIUS_KEY}`,
      { jsonrpc: '2.0', id: 1, method: 'getSlot', params: [] },
      { timeout: 3000 }
    );
    status.helius = true;
  } catch (e) {
    console.warn('[HEALTH] Helius unavailable');
  }

  // Check Polymarket
  try {
    await axios.get('https://clob.polymarket.com/markets?limit=1', { timeout: 3000 });
    status.polymarket = true;
  } catch (e) {
    console.warn('[HEALTH] Polymarket unavailable');
  }

  return status;
}

module.exports = {
  // Ollama
  callOllama,
  listOllamaModels,

  // DexScreener
  getDexScreenerData,
  getDexScreenerPairs,

  // CoinGecko
  getCoinGeckoPrice,
  getCoinGeckoMarketData,

  // Solana
  getHeliusBalance,
  getHeliusTokenAccounts,

  // Polymarket
  getPolymarketMarkets,
  getPolymarketPrices,

  // Messari
  getMessariAssetMetrics,

  // Glassnode
  getGlassnodeMetric,

  // Birdeye
  getBirdeyeTokenOverview,

  // LLamaFolio
  getLlamaFolio,
  getLlamaTVL,

  // Jupiter
  getJupiterQuote,

  // NewsAPI
  getNewsAPIHeadlines,

  // Coinglass
  getCoinglass,

  // Health
  checkAPIs
};
