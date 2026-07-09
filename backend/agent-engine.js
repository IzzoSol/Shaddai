/**
 * SHADDAI Agent Engine — Real Agentic Core v2
 * 35 real tools, 7 agents, LLM loop, task queue, workflow engine
 * Patterns: CrewAI (task execution), LangChain (tool registry), AutoGPT (agent loop)
 */

'use strict';

const axios   = require('axios');
const vm      = require('vm');
const { runSandboxedJs } = require('./lib/sandbox');
const fs      = require('fs');
const path    = require('path');
const crypto  = require('crypto');
const { execSync, exec } = require('child_process');
const skillIndex = require('./skill-index');
const agentEventBus = require('./agent-event-bus');
const llmTracer = require('./llm-tracer');
const cacheAnalytics = require('./cache-analytics');
let mcpClient = null;
try { mcpClient = require('./mcp-client'); } catch (e) { console.warn('[ENGINE] MCP client unavailable:', e.message); }
let payGuard = null;
try { payGuard = require('./pay-guard'); } catch (e) { console.warn('[ENGINE] pay-guard unavailable:', e.message); }

// Resolve a tool by name: static registry first, then any connected MCP tool.
function resolveTool(name) {
  if (TOOLS[name]) return TOOLS[name];
  if (mcpClient && name.startsWith('mcp__')) {
    const mcpTools = mcpClient.getAgentTools();
    if (mcpTools[name]) return mcpTools[name];
  }
  return null;
}

// ─────────────────────────────────────────────────────────────
// DIRS & CONSTANTS
// ─────────────────────────────────────────────────────────────

const OUTPUT_DIR = path.join(__dirname, '..', 'generated-output');
const LOGS_DIR   = path.join(__dirname, 'execution-logs');
const INBOX_FILE = path.join(__dirname, 'data', 'inbox.json');
const MEMORY_FILE = path.join(__dirname, 'data', 'agent-memory.json');

[OUTPUT_DIR, LOGS_DIR, path.dirname(INBOX_FILE)].forEach(d => {
  try { fs.mkdirSync(d, { recursive: true }); } catch {}
});

const GROQ_KEY     = process.env.GROQ_API_KEY || process.env.GROQ_KEY || '';
const OLLAMA_URL   = process.env.OLLAMA_API_URL || 'http://localhost:11434';
const GROQ_MODEL   = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
const OLLAMA_MODEL = process.env.DEFAULT_OLLAMA_MODEL || 'llama3.2:1b';
// Local-model tuning (env-overridable). Defaults raised so the tool-laden system prompt fits the
// context window (the old num_ctx:4096 overflowed → Ollama hung the full timeout → agent runs failed).
const OLLAMA_NUM_CTX     = parseInt(process.env.OLLAMA_NUM_CTX || '8192', 10);
const OLLAMA_NUM_PREDICT = parseInt(process.env.OLLAMA_NUM_PREDICT || '512', 10);
const OLLAMA_TIMEOUT_MS  = parseInt(process.env.OLLAMA_TIMEOUT_MS || '120000', 10);
const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY || process.env.OPENROUTER_KEY || '';
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || 'meta-llama/llama-3.3-70b-instruct:free';
const ANTHROPIC_KEY  = process.env.ANTHROPIC_API_KEY || '';
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001';
const OPENAI_KEY     = process.env.OPENAI_API_KEY || '';
const OPENAI_MODEL   = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const GEMINI_KEY     = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';
const GEMINI_MODEL   = process.env.GEMINI_MODEL || 'gemini-2.0-flash-lite';

// BYOK helper — reads backend/data/byok-keys.json and returns the stored key for a
// given provider (any tier, highest-permission first). Returns '' when nothing stored.
// Called inside callLLM() so each invocation gets the freshest key without a restart.
const _BYOK_FILE = path.join(__dirname, 'data', 'byok-keys.json');
function getBYOKKey(provider) {
  try {
    const raw = fs.readFileSync(_BYOK_FILE, 'utf8');
    const store = JSON.parse(raw);
    for (const tier of ['alpha', 'pro', 'builder']) {
      const entry = store[`${tier}:${provider}`];
      if (entry && typeof entry.key === 'string' && entry.key.length > 8) return entry.key;
    }
  } catch (_) { /* file absent or parse error — fall back to env key */ }
  return '';
}

// HTTP helper — axios with default timeout
const http = (url, opts = {}) => axios.get(url, { timeout: 10000, ...opts });

// Remove [TOOL:name:{...}] blocks from LLM output, balancing nested braces and
// escaped quotes so JSON args (arrays, nested objects) don't leak into the result.
function stripToolCalls(text) {
  if (!text) return text;
  let out = '';
  for (let i = 0; i < text.length; ) {
    if (text.startsWith('[TOOL:', i)) {
      // Find end: scan to the matching ']' after a balanced '{...}' (if present)
      let j = i + 6;
      // skip tool name up to ':'
      while (j < text.length && text[j] !== ':' && text[j] !== ']') j++;
      if (text[j] === ':') {
        j++;
        if (text[j] === '{') {
          let depth = 0, inStr = false, esc = false;
          for (; j < text.length; j++) {
            const c = text[j];
            if (esc) { esc = false; continue; }
            if (c === '\\') { esc = true; continue; }
            if (c === '"') { inStr = !inStr; continue; }
            if (!inStr && c === '{') depth++;
            else if (!inStr && c === '}') { depth--; if (depth === 0) { j++; break; } }
          }
        }
      }
      // consume trailing ']' (and optional whitespace)
      while (j < text.length && text[j] !== ']') j++;
      if (text[j] === ']') j++;
      i = j;
    } else {
      out += text[i++];
    }
  }
  return out.replace(/\n{3,}/g, '\n\n').trim();
}

// Strip HTML tags from text
function stripHtml(s) {
  return s.replace(/<script[\s\S]*?<\/script>/gi, '')
          .replace(/<style[\s\S]*?<\/style>/gi, '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ').trim();
}

// ═══════════════════════════════════════════════════════════════════
// TOOL REGISTRY — 35 real tools
// ═══════════════════════════════════════════════════════════════════

const TOOLS = {

  // ── CRYPTO & MARKET ──────────────────────────────────────────────

  fetch_price: {
    name: 'fetch_price',
    description: 'Live crypto price from CoinGecko. Returns USD price, 24h change %, market cap, volume.',
    schema: { symbol: 'string — coin id e.g. bitcoin, ethereum, solana, dogecoin' },
    agents: ['SHADDAI','ZEROX','ORACLE'],
    async execute({ symbol = 'bitcoin' }) {
      const id = symbol.toLowerCase().replace(/\s+/g,'-');
      const r = await http(`https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd&include_24hr_change=true&include_market_cap=true&include_24hr_vol=true`);
      const d = r.data[id];
      if (!d) return `No CoinGecko data for "${id}". Try the full name like "bitcoin" not "BTC".`;
      return JSON.stringify({
        symbol: id,
        price: `$${d.usd.toLocaleString()}`,
        change24h: (d.usd_24h_change || 0).toFixed(2) + '%',
        marketCap: '$' + (d.usd_market_cap / 1e9).toFixed(2) + 'B',
        volume24h: '$' + (d.usd_24h_vol / 1e9).toFixed(2) + 'B'
      });
    }
  },

  get_fear_greed: {
    name: 'get_fear_greed',
    description: 'Crypto Fear & Greed Index (0=Extreme Fear, 100=Extreme Greed). Also returns 7-day history.',
    schema: {},
    agents: ['ZEROX','ORACLE','SHADDAI'],
    async execute() {
      const r = await http('https://api.alternative.me/fng/?limit=7');
      const all = r.data.data;
      return JSON.stringify({
        today: { score: all[0].value, label: all[0].value_classification },
        history: all.slice(1).map(d => ({ score: d.value, label: d.value_classification }))
      });
    }
  },

  get_trending: {
    name: 'get_trending',
    description: 'Top 7 trending crypto coins on CoinGecko right now.',
    schema: {},
    agents: ['ZEROX','ORACLE','SHADDAI'],
    async execute() {
      const r = await http('https://api.coingecko.com/api/v3/search/trending');
      return JSON.stringify(r.data.coins.slice(0,7).map(c => ({
        name: c.item.name, symbol: c.item.symbol,
        rank: c.item.market_cap_rank || 'unranked',
        score: c.item.score
      })));
    }
  },

  get_ohlcv: {
    name: 'get_ohlcv',
    description: 'Price history (OHLCV candles) for a coin over last N days from CoinGecko.',
    schema: { symbol: 'string — coin id e.g. bitcoin', days: 'number — 1, 7, 14, 30, 90' },
    agents: ['ZEROX','ORACLE'],
    async execute({ symbol = 'bitcoin', days = 7 }) {
      const r = await http(`https://api.coingecko.com/api/v3/coins/${symbol}/ohlc?vs_currency=usd&days=${days}`);
      const candles = r.data.slice(-14).map(([ts, o, h, l, c]) => ({
        date: new Date(ts).toISOString().split('T')[0],
        open: o, high: h, low: l, close: c
      }));
      const latest = candles[candles.length - 1];
      const earliest = candles[0];
      const change = (((latest?.close - earliest?.open) / earliest?.open) * 100).toFixed(2);
      return JSON.stringify({ symbol, days, change: change + '%', candles });
    }
  },

  get_global_market: {
    name: 'get_global_market',
    description: 'Global crypto market overview: total market cap, BTC dominance, 24h volume, active coins.',
    schema: {},
    agents: ['ZEROX','ORACLE','SHADDAI'],
    async execute() {
      const r = await http('https://api.coingecko.com/api/v3/global');
      const d = r.data.data;
      return JSON.stringify({
        totalMarketCap: '$' + (d.total_market_cap.usd / 1e12).toFixed(2) + 'T',
        totalVolume24h: '$' + (d.total_volume.usd / 1e9).toFixed(1) + 'B',
        btcDominance: d.market_cap_percentage.btc?.toFixed(1) + '%',
        ethDominance: d.market_cap_percentage.eth?.toFixed(1) + '%',
        activeCoins: d.active_cryptocurrencies,
        marketCapChange24h: d.market_cap_change_percentage_24h_usd?.toFixed(2) + '%'
      });
    }
  },

  get_token_info: {
    name: 'get_token_info',
    description: 'Detailed coin data from CoinGecko: description, categories, links, ATH, supply.',
    schema: { symbol: 'string — coin id e.g. solana' },
    agents: ['ZEROX','ORACLE'],
    async execute({ symbol = 'solana' }) {
      const r = await http(`https://api.coingecko.com/api/v3/coins/${symbol}?localization=false&tickers=false&community_data=false&developer_data=false`);
      const d = r.data;
      return JSON.stringify({
        name: d.name, symbol: d.symbol?.toUpperCase(),
        description: d.description?.en?.slice(0,300) || '',
        categories: d.categories?.slice(0,4) || [],
        ath: '$' + (d.market_data?.ath?.usd || 0).toLocaleString(),
        athDate: d.market_data?.ath_date?.usd?.split('T')[0],
        circulatingSupply: d.market_data?.circulating_supply?.toLocaleString(),
        website: d.links?.homepage?.[0] || ''
      });
    }
  },

  whale_scan: {
    name: 'whale_scan',
    description: 'DexScreener whale data: top pairs, liquidity, 24h volume for any token.',
    schema: { query: 'string — token name, symbol, or contract address' },
    agents: ['ZEROX','ORACLE'],
    async execute({ query }) {
      const r = await http(`https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(query)}`);
      const pairs = (r.data.pairs || []).slice(0,5).map(p => ({
        pair: (p.baseToken?.symbol || '?') + '/' + (p.quoteToken?.symbol || '?'),
        priceUsd: p.priceUsd,
        liquidity: '$' + Number(p.liquidity?.usd || 0).toLocaleString(),
        volume24h: '$' + Number(p.volume?.h24 || 0).toLocaleString(),
        priceChange24h: p.priceChange?.h24 + '%',
        dex: p.dexId, chain: p.chainId
      }));
      return pairs.length ? JSON.stringify(pairs) : `No DEX pairs found for "${query}"`;
    }
  },

  get_defi_tvl: {
    name: 'get_defi_tvl',
    description: 'DeFi Total Value Locked data from DeFiLlama. Top protocols by TVL.',
    schema: { limit: 'number — how many protocols to return (default 10)' },
    agents: ['ZEROX','ORACLE'],
    async execute({ limit = 10 }) {
      const r = await http('https://api.llama.fi/protocols');
      const top = r.data.slice(0, limit).map(p => ({
        name: p.name, chain: p.chain,
        tvl: '$' + (p.tvl / 1e9).toFixed(2) + 'B',
        change1d: p.change_1d?.toFixed(2) + '%',
        category: p.category
      }));
      const total = r.data.slice(0,200).reduce((s, p) => s + (p.tvl || 0), 0);
      return JSON.stringify({ totalTVL: '$' + (total / 1e9).toFixed(1) + 'B', protocols: top });
    }
  },

  get_sol_balance: {
    name: 'get_sol_balance',
    description: 'Get SOL balance of any Solana wallet address. Uses mainnet-beta public RPC.',
    schema: { address: 'string — Solana wallet address (base58)' },
    agents: ['ZEROX','PIKADON','SHADDAI'],
    async execute({ address }) {
      if (!address || address.length < 32) return 'Invalid Solana address';
      const r = await axios.post('https://api.mainnet-beta.solana.com', {
        jsonrpc: '2.0', id: 1, method: 'getBalance', params: [address]
      }, { timeout: 10000 });
      const lamports = r.data.result?.value || 0;
      const sol = lamports / 1e9;
      return JSON.stringify({ address, balance: sol.toFixed(4) + ' SOL', lamports });
    }
  },

  get_eth_balance: {
    name: 'get_eth_balance',
    description: 'Get ETH balance of any Ethereum wallet. Uses Cloudflare public RPC (no key needed).',
    schema: { address: 'string — Ethereum address (0x...)' },
    agents: ['ZEROX','PIKADON'],
    async execute({ address }) {
      if (!address?.startsWith('0x')) return 'Invalid ETH address — must start with 0x';
      const r = await axios.post('https://cloudflare-eth.com', {
        jsonrpc: '2.0', id: 1, method: 'eth_getBalance', params: [address, 'latest']
      }, { timeout: 10000 });
      const wei = parseInt(r.data.result, 16);
      const eth = (wei / 1e18).toFixed(6);
      return JSON.stringify({ address, balance: eth + ' ETH', weiBalance: wei });
    }
  },

  get_exchange_rates: {
    name: 'get_exchange_rates',
    description: 'Live fiat currency exchange rates (USD base). Free, no key required.',
    schema: { currencies: 'string — comma-separated currency codes e.g. EUR,GBP,JPY,CAD' },
    agents: ['ZEROX','ORACLE'],
    async execute({ currencies = 'EUR,GBP,JPY,CAD,AUD,CHF' }) {
      const r = await http(`https://api.exchangerate-api.com/v4/latest/USD`);
      const rates = {};
      const wantedList = currencies.split(',').map(s => s.trim().toUpperCase());
      wantedList.forEach(c => { if (r.data.rates[c]) rates[c] = r.data.rates[c]; });
      return JSON.stringify({ base: 'USD', date: r.data.date, rates });
    }
  },

  // ── RESEARCH & WEB ───────────────────────────────────────────────

  search_web: {
    name: 'search_web',
    description: 'Web search — tries Google News RSS (great for recent news) then DuckDuckGo Instant Answer. Returns titles, snippets, URLs.',
    schema: { query: 'string — search query' },
    agents: ['ORACLE','SHADDAI','QUILL','NEXUS','ZEROX'],
    async execute({ query }) {
      const results = [];

      // Strategy 1: Google News RSS (best for current events/news)
      try {
        const rssUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
        const rr = await axios.get(rssUrl, { timeout: 10000, responseType: 'text', headers: { 'User-Agent': 'SHADDAI-Agent/2.0' } });
        const itemRe = /<item>([\s\S]*?)<\/item>/g;
        let m;
        while ((m = itemRe.exec(rr.data)) !== null && results.length < 6) {
          const chunk = m[1];
          const title = (chunk.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/) || [])[1] || '';
          const link  = (chunk.match(/<link[^>]*\/?>(https?:[^<]+)<\/link>|<link>(https?:[^<]+)</) || [])[1] || (chunk.match(/<link>(https?:[^<]+)/) || [])[1] || '';
          const desc  = (chunk.match(/<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/) || [])[1] || '';
          const t = stripHtml(title).trim().replace(/\s+-\s+Google News.*/, '');
          if (t) results.push({ title: t, snippet: stripHtml(desc).trim().slice(0,200), url: link.trim(), source: 'news' });
        }
      } catch {}

      // Strategy 2: DuckDuckGo Instant Answer (good for knowledge queries)
      if (results.length < 3) {
        try {
          const dr = await axios.get(`https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`, { timeout: 8000 });
          const d = dr.data;
          if (d.AbstractText) results.unshift({ title: d.Heading || query, snippet: d.AbstractText.slice(0,400), url: d.AbstractURL, source: 'ddg_abstract' });
          (d.RelatedTopics || []).slice(0,4).forEach(t => {
            if (t.Text && results.length < 8) results.push({ title: t.Text.slice(0,80), snippet: t.Text.slice(0,200), url: t.FirstURL || '', source: 'ddg_related' });
          });
        } catch {}
      }

      return results.length
        ? JSON.stringify(results.slice(0,8))
        : JSON.stringify([{ title: 'No results', snippet: `No search results found for: ${query}`, url: '', source: 'none' }]);
    }
  },

  wikipedia_search: {
    name: 'wikipedia_search',
    description: 'Search Wikipedia. Reliable for facts, people, concepts, technology. Returns article summary.',
    schema: { query: 'string — topic to look up on Wikipedia' },
    agents: ['ORACLE','QUILL','SHADDAI','NEXUS'],
    async execute({ query }) {
      const UA = { 'User-Agent': 'SHADDAI-Agent/2.0 (https://shaddai.ai; contact@shaddai.ai)' };
      // Step 1: opensearch to find best title
      // Try opensearch first, fall back to full-text search
      let title = '';
      const searchR = await axios.get(
        `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(query)}&limit=3&namespace=0&format=json`,
        { timeout: 10000, headers: UA }
      );
      const [, titles] = searchR.data;
      if (titles?.length) {
        title = titles[0];
      } else {
        // Full-text search fallback
        const ftR = await axios.get(
          `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&srlimit=1&format=json`,
          { timeout: 10000, headers: UA }
        );
        const hits = ftR.data?.query?.search;
        if (!hits?.length) return JSON.stringify({ error: `No Wikipedia article for "${query}"` });
        title = hits[0].title;
      }
      // Get REST summary
      const summaryR = await axios.get(
        `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`,
        { timeout: 10000, headers: UA }
      );
      const d = summaryR.data;
      return JSON.stringify({
        title: d.title,
        extract: d.extract?.slice(0, 600) || 'No extract.',
        url: d.content_urls?.desktop?.page || '',
        pageId: d.pageid
      });
    }
  },

  fetch_url: {
    name: 'fetch_url',
    description: 'Fetch full text from any URL. Strips HTML, returns clean readable text (first 3000 chars).',
    schema: { url: 'string — full https:// URL' },
    agents: ['ORACLE','QUILL','NEXUS','PIKADON'],
    async execute({ url }) {
      if (!url?.startsWith('http')) return 'URL must start with https://';
      const r = await axios.get(url, {
        timeout: 12000,
        headers: { 'User-Agent': 'Mozilla/5.0 SHADDAI-Agent/2.0' },
        responseType: 'text',
        maxContentLength: 500000
      });
      const titleMatch = r.data.match(/<title[^>]*>([^<]+)<\/title>/i);
      const text = stripHtml(r.data).slice(0, 3000);
      return JSON.stringify({
        title: titleMatch ? titleMatch[1].trim() : 'No title',
        url, contentLength: r.data.length,
        text
      });
    }
  },

  get_hackernews: {
    name: 'get_hackernews',
    description: 'Top Hacker News stories right now. Returns titles, URLs, scores, comment counts.',
    schema: { limit: 'number — stories to return (default 10, max 20)' },
    agents: ['ORACLE','NEXUS','QUILL'],
    async execute({ limit = 10 }) {
      const topR = await http('https://hacker-news.firebaseio.com/v0/topstories.json');
      const ids = topR.data.slice(0, Math.min(limit, 20));
      const stories = await Promise.all(ids.map(id =>
        http(`https://hacker-news.firebaseio.com/v0/item/${id}.json`).then(r => ({
          title: r.data.title, url: r.data.url || `https://news.ycombinator.com/item?id=${id}`,
          score: r.data.score, comments: r.data.descendants || 0, by: r.data.by
        })).catch(() => null)
      ));
      return JSON.stringify(stories.filter(Boolean));
    }
  },

  get_rss_feed: {
    name: 'get_rss_feed',
    description: 'Fetch and parse any RSS/Atom feed URL. Returns latest items with title, link, summary.',
    schema: { url: 'string — RSS feed URL', limit: 'number — items to return (default 8)' },
    agents: ['ORACLE','QUILL'],
    async execute({ url, limit = 8 }) {
      const r = await axios.get(url, { timeout: 10000, responseType: 'text', headers: { 'User-Agent': 'SHADDAI-Agent/2.0' } });
      const xml = r.data;
      // Extract items from RSS or Atom
      const itemRe = /<item[^>]*>([\s\S]*?)<\/item>|<entry[^>]*>([\s\S]*?)<\/entry>/gi;
      const items = [];
      let m;
      while ((m = itemRe.exec(xml)) !== null && items.length < limit) {
        const chunk = m[1] || m[2];
        const title = (chunk.match(/<title[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/) || [])[1] || '';
        const link  = (chunk.match(/<link[^>]*>([^<]+)<\/link>|<link[^>]*href="([^"]+)"/) || [])[1] || (chunk.match(/<link[^>]*href="([^"]+)"/) || [])[1] || '';
        const desc  = (chunk.match(/<description[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>|<summary[^>]*>([\s\S]*?)<\/summary>/) || [])[1] || '';
        items.push({ title: stripHtml(title).trim().slice(0,120), link: link.trim(), summary: stripHtml(desc).trim().slice(0,200) });
      }
      return items.length ? JSON.stringify(items) : 'Could not parse RSS feed or feed is empty';
    }
  },

  get_github_trending: {
    name: 'get_github_trending',
    description: 'Recently trending GitHub repos (sorted by stars, pushed in last 7 days). Uses public GitHub API.',
    schema: { language: 'string — language filter e.g. javascript (optional)', topic: 'string — topic e.g. llm, agents (optional)' },
    agents: ['NEXUS','ORACLE'],
    async execute({ language = '', topic = '' }) {
      const since = new Date(Date.now() - 7*24*60*60*1000).toISOString().split('T')[0];
      let q = `pushed:>${since} stars:>100`;
      if (language) q += ` language:${language}`;
      if (topic) q += ` topic:${topic}`;
      const r = await axios.get(
        `https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&sort=stars&order=desc&per_page=10`,
        { timeout: 12000, headers: { 'Accept': 'application/vnd.github.v3+json', 'User-Agent': 'SHADDAI-Agent/2.0' } }
      );
      const repos = r.data.items.map(repo => ({
        repo: repo.full_name,
        description: repo.description?.slice(0,150) || '',
        language: repo.language || 'unknown',
        stars: repo.stargazers_count.toLocaleString(),
        forks: repo.forks_count,
        url: repo.html_url
      }));
      return JSON.stringify(repos);
    }
  },

  get_github_repo: {
    name: 'get_github_repo',
    description: 'GitHub repository details: stars, forks, issues, language, recent activity. No auth needed.',
    schema: { repo: 'string — owner/repo e.g. microsoft/vscode' },
    agents: ['NEXUS','ORACLE'],
    async execute({ repo }) {
      if (!repo?.includes('/')) return 'Repo must be in format owner/repo';
      const r = await http(`https://api.github.com/repos/${repo}`, {
        headers: { 'Accept': 'application/vnd.github.v3+json', 'User-Agent': 'SHADDAI-Agent/2.0' }
      });
      const d = r.data;
      return JSON.stringify({
        name: d.full_name, description: d.description?.slice(0,200),
        stars: d.stargazers_count?.toLocaleString(), forks: d.forks_count,
        openIssues: d.open_issues_count, language: d.language,
        lastPush: d.pushed_at?.split('T')[0], license: d.license?.spdx_id || 'none',
        url: d.html_url
      });
    }
  },

  search_npm: {
    name: 'search_npm',
    description: 'Search npm registry for packages. Returns name, version, description, weekly downloads.',
    schema: { query: 'string — package name or keyword', limit: 'number — results (default 5)' },
    agents: ['NEXUS'],
    async execute({ query, limit = 5 }) {
      const r = await http(`https://registry.npmjs.org/-/v1/search?text=${encodeURIComponent(query)}&size=${limit}`);
      const pkgs = r.data.objects.map(o => ({
        name: o.package.name, version: o.package.version,
        description: o.package.description?.slice(0,150),
        downloads: o.downloads?.weekly?.toLocaleString() || 'unknown',
        url: `https://npmjs.com/package/${o.package.name}`
      }));
      return JSON.stringify(pkgs);
    }
  },

  get_weather: {
    name: 'get_weather',
    description: 'Current weather for any city. Returns temp, conditions, humidity, wind.',
    schema: { city: 'string — city name e.g. "New York", "London", "Tokyo"' },
    agents: ['ORACLE','SHADDAI','QUILL'],
    async execute({ city }) {
      const r = await http(`https://wttr.in/${encodeURIComponent(city)}?format=j1`);
      const cur = r.data.current_condition?.[0];
      if (!cur) return `No weather data for "${city}"`;
      return JSON.stringify({
        city, condition: cur.weatherDesc?.[0]?.value,
        tempC: cur.temp_C + '°C', tempF: cur.temp_F + '°F',
        feelsLikeC: cur.FeelsLikeC + '°C', humidity: cur.humidity + '%',
        windKmph: cur.windspeedKmph + ' km/h', windDir: cur.winddir16Point,
        visibility: cur.visibility + ' km', uvIndex: cur.uvIndex
      });
    }
  },

  // ── CODE & DEVELOPMENT ───────────────────────────────────────────

  run_js: {
    name: 'run_js',
    description: 'Execute JavaScript in a sandboxed Node.js vm. Returns console output and result value.',
    schema: { code: 'string — JavaScript code to execute' },
    agents: ['NEXUS','SHADDAI'],
    async execute({ code }) {
      // Routed through the shared sandbox module (backend/lib/sandbox.js).
      // Preserves the { success, output[], error } JSON contract callers expect.
      const r = await runSandboxedJs(code, { timeoutMs: 3000 });
      return JSON.stringify(r);
    }
  },

  run_python: {
    name: 'run_python',
    description: 'Execute Python code via system Python. Returns stdout. Requires ALLOW_PYTHON_EXEC=true env var; disabled by default for security.',
    schema: { code: 'string — Python code to run' },
    agents: ['NEXUS','SHADDAI'],
    async execute({ code }) {
      // Gate: disabled unless the operator explicitly opts in.
      // PRODUCTION: route through Docker (--network none --memory 128m --cpus 0.5)
      // or a sandboxed runner (E2B, Firecracker) — never exec arbitrary Python on
      // the shared server process. See SPEC_security-hardening.md Issue 3.
      if (process.env.ALLOW_PYTHON_EXEC !== 'true') {
        return JSON.stringify({
          success: false,
          error: 'python exec disabled — set ALLOW_PYTHON_EXEC=true and use a sandboxed runner (Docker --network none)'
        });
      }

      return new Promise((resolve) => {
        const tmpFile = path.join(OUTPUT_DIR, `tmp_py_${Date.now()}.py`);
        try { fs.writeFileSync(tmpFile, code, 'utf8'); } catch (writeErr) {
          return resolve(JSON.stringify({ success: false, error: `failed to write temp file: ${writeErr.message}`, stdout: '' }));
        }
        // Timeout set to 8 s. For true isolation wrap with:
        // docker run --rm --network none --memory 128m --cpus 0.5 python:3.11-slim python -c "<code>"
        exec(`python "${tmpFile}"`, { timeout: 8000, maxBuffer: 50000 }, (err, stdout, stderr) => {
          try { fs.unlinkSync(tmpFile); } catch {}
          if (err && !stdout) return resolve(JSON.stringify({ success: false, error: stderr?.slice(0,500) || err.message, stdout: '' }));
          resolve(JSON.stringify({ success: true, stdout: stdout.slice(0,2000), stderr: stderr?.slice(0,500) || '', exitCode: err?.code || 0 }));
        });
      });
    }
  },

  calculate: {
    name: 'calculate',
    description: 'Safely evaluate math expressions. Supports +,-,*,/,**,sqrt,log,sin,cos,PI,E,floor,ceil.',
    schema: { expression: 'string — math expression e.g. "sqrt(144) * 2 + log(100)"' },
    agents: ['NEXUS','ZEROX','SHADDAI','ORACLE'],
    async execute({ expression }) {
      // Safe math-only eval — no arbitrary code
      const safe = expression.replace(/[^0-9+\-*/().%^eE ,a-zA-Z]/g, '');
      try {
        const mathCtx = {
          sqrt: Math.sqrt, abs: Math.abs, log: Math.log, log2: Math.log2, log10: Math.log10,
          sin: Math.sin, cos: Math.cos, tan: Math.tan, floor: Math.floor, ceil: Math.ceil,
          round: Math.round, pow: Math.pow, min: Math.min, max: Math.max, PI: Math.PI, E: Math.E
        };
        const ctx = vm.createContext(mathCtx);
        const result = vm.runInContext(safe, ctx, { timeout: 1000 });
        return JSON.stringify({ expression: safe, result });
      } catch(e) {
        return JSON.stringify({ error: 'Invalid expression: ' + e.message });
      }
    }
  },

  check_security: {
    name: 'check_security',
    description: 'PIKADON security audit: SQL injection, XSS, hardcoded secrets, eval, path traversal, CORS, CSRF, insecure deps.',
    schema: { code: 'string — code snippet or file content to audit' },
    agents: ['PIKADON'],
    async execute({ code }) {
      const findings = [];
      const checks = [
        [/eval\s*\(/g,                              'HIGH',     'eval() — remote code execution risk'],
        [/new Function\s*\(/g,                      'HIGH',     'new Function() — dynamic code execution'],
        [/process\.env\.[A-Z_]{4,}\s*=(?!=)/g,     'HIGH',     'Overwriting env variable at runtime'],
        [/['"`][A-Za-z0-9]{32,}['"`]/g,            'CRITICAL', 'Possible hardcoded secret (long string literal)'],
        [/GROQ_API_KEY|OPENAI_API_KEY|sk-[a-z0-9]{40}/g, 'CRITICAL', 'API key pattern detected in code'],
        [/exec\s*\(`[^`]*\$\{/g,                   'CRITICAL', 'Template literal in exec() — command injection'],
        [/child_process.*\$\{/g,                   'HIGH',     'Unsafe child_process with variable interpolation'],
        [/query\s*[+=]+.*req\.|`[^`]*\$\{req\./g,  'CRITICAL', 'SQL injection risk — user input in query string'],
        [/\.innerHTML\s*=/g,                        'HIGH',     'innerHTML assignment — XSS risk'],
        [/\.outerHTML\s*=/g,                        'HIGH',     'outerHTML assignment — XSS risk'],
        [/document\.write\(/g,                      'HIGH',     'document.write() — XSS risk'],
        [/cors\(\)/g,                               'MEDIUM',   'CORS wildcard — allows all origins'],
        [/origin:\s*['"]\*['"]/g,                   'HIGH',     'CORS explicit wildcard in header'],
        [/\.\.(\/|\\)/g,                            'HIGH',     'Path traversal risk — ../'],
        [/path\.join\([^)]*req\./g,                 'HIGH',     'User input in path.join() — path traversal'],
        [/password\s*=\s*req\.|req\..*password/gi, 'MEDIUM',   'Password from request — ensure hashed'],
        [/MD5\(|md5\(/g,                            'MEDIUM',   'MD5 for passwords/crypto — use bcrypt/argon2'],
        [/http:\/\/(?!localhost)/g,                 'LOW',      'HTTP (not HTTPS) for external URL'],
        [/disable.*security|ignoreSsl|rejectUnauthorized.*false/gi, 'HIGH', 'SSL/TLS verification disabled'],
        [/console\.log\(.*password|console\.log\(.*secret|console\.log\(.*token/gi, 'MEDIUM', 'Sensitive value logged to console'],
      ];
      checks.forEach(([re, severity, msg]) => {
        const matches = code.match(re);
        if (matches) findings.push({ severity, issue: msg, count: matches.length });
      });
      const score = findings.reduce((s, f) => s + ({CRITICAL:10,HIGH:5,MEDIUM:2,LOW:1}[f.severity]||0), 0);
      return JSON.stringify({
        findings,
        riskScore: score,
        riskLevel: score === 0 ? 'CLEAN' : score < 5 ? 'LOW' : score < 15 ? 'MEDIUM' : score < 30 ? 'HIGH' : 'CRITICAL',
        summary: findings.length === 0 ? 'No obvious vulnerabilities detected.' : `${findings.length} issue(s) found. Risk score: ${score}.`
      });
    }
  },

  // ── FILE & PERSISTENCE ───────────────────────────────────────────

  write_file: {
    name: 'write_file',
    description: 'Write content to a file in generated-output/. Safe filename auto-generated. Returns path.',
    schema: { filename: 'string — desired filename with extension', content: 'string — file content' },
    agents: ['QUILL','NEXUS','TURTLE','SHADDAI'],
    async execute({ filename, content }) {
      const safe = path.basename(String(filename)).replace(/[^a-zA-Z0-9._-]/g,'_');
      const name = `${Date.now()}_${safe.includes('.')? safe : safe+'.txt'}`;
      const fp = path.join(OUTPUT_DIR, name);
      fs.writeFileSync(fp, content, 'utf8');
      return JSON.stringify({ success: true, path: fp, filename: name, bytes: Buffer.byteLength(content) });
    }
  },

  read_file: {
    name: 'read_file',
    description: 'Read a file from generated-output/ by filename. Returns content up to 5000 chars.',
    schema: { filename: 'string — filename only (no path)' },
    agents: ['QUILL','NEXUS','ORACLE','PIKADON'],
    async execute({ filename }) {
      const fp = path.join(OUTPUT_DIR, path.basename(String(filename)));
      if (!fs.existsSync(fp)) {
        const files = fs.readdirSync(OUTPUT_DIR).join(', ');
        return `File "${filename}" not found. Available: ${files || 'none'}`;
      }
      const content = fs.readFileSync(fp, 'utf8');
      return JSON.stringify({ filename, content: content.slice(0,5000), totalBytes: Buffer.byteLength(content) });
    }
  },

  list_files: {
    name: 'list_files',
    description: 'List all files in generated-output/ with size and modification time.',
    schema: {},
    agents: ['NEXUS','QUILL','PIKADON','SHADDAI'],
    async execute() {
      const files = fs.existsSync(OUTPUT_DIR) ? fs.readdirSync(OUTPUT_DIR).map(f => {
        const stat = fs.statSync(path.join(OUTPUT_DIR, f));
        return { name: f, bytes: stat.size, modified: stat.mtime.toISOString().split('T')[0] };
      }) : [];
      return JSON.stringify({ count: files.length, files: files.slice(-20) });
    }
  },

  save_to_inbox: {
    name: 'save_to_inbox',
    description: 'Save agent output to SHADDAI inbox. User sees it in dashboard inbox tab.',
    schema: { subject: 'string', content: 'string', agent: 'string' },
    agents: ['SHADDAI','NEXUS','ZEROX','ORACLE','TURTLE','QUILL','PIKADON'],
    async execute({ subject, content, agent = 'AGENT' }) {
      const inbox = loadInbox();
      const entry = { id: crypto.randomUUID(), subject, content, agent, ts: new Date().toISOString(), read: false };
      inbox.unshift(entry);
      saveInbox(inbox.slice(0,200));
      return JSON.stringify({ success: true, id: entry.id });
    }
  },

  save_memory: {
    name: 'save_memory',
    description: 'Persist a key-value pair to agent memory. Survives across tasks. Use to remember important facts.',
    schema: { key: 'string — memory key', value: 'string — value to store', agent: 'string — which agent owns this' },
    agents: ['SHADDAI','NEXUS','ZEROX','ORACLE','TURTLE','QUILL','PIKADON'],
    async execute({ key, value, agent = 'AGENT' }) {
      const mem = loadMemory();
      mem[`${agent}:${key}`] = { value, updatedAt: new Date().toISOString(), agent };
      saveMemory(mem);
      return JSON.stringify({ success: true, key: `${agent}:${key}`, value });
    }
  },

  // ── COLLECTIBLES ────────────────────────────────────────────────
  mint_collectible: {
    name: 'mint_collectible',
    description: 'Mint a new collectible NFT-style receipt. Persists to backend/data/collectibles.json with HMAC signature.',
    schema: { name: 'string — collectible name', rarity: 'string — common|rare|epic|legendary', owner: 'string — owner agent or user' },
    agents: ['ZEROX','SHADDAI'],
    async execute({ name, rarity, owner }) {
      const file = path.join(__dirname, 'data', 'collectibles.json');
      try { fs.mkdirSync(path.dirname(file), { recursive: true }); } catch {}
      let list = [];
      try { list = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { list = []; }
      const id = list.length + 1;
      const secret = process.env.HMAC_SECRET || 'shaddai-default-secret';
      const fields = { id, name, rarity, owner, mintedAt: new Date().toISOString() };
      const signature = crypto.createHmac('sha256', secret).update(JSON.stringify(fields)).digest('hex').slice(0,16);
      const entry = { ...fields, signature };
      list.push(entry);
      fs.writeFileSync(file, JSON.stringify(list, null, 2));
      return `Minted ${name} #${id} (${rarity}) for ${owner}`;
    }
  },

  list_collectible: {
    name: 'list_collectible',
    description: 'List a collectible on the marketplace at a credit price.',
    schema: { id: 'number — collectible id', priceCredits: 'number — listing price' },
    agents: ['ZEROX','QUILL'],
    async execute({ id, priceCredits }) {
      const file = path.join(__dirname, 'data', 'collectibles.json');
      let list = [];
      try { list = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { list = []; }
      const item = list.find(c => Number(c.id) === Number(id));
      if (!item) return `Collectible #${id} not found`;
      item.listing = { priceCredits: Number(priceCredits), listedAt: new Date().toISOString() };
      fs.writeFileSync(file, JSON.stringify(list, null, 2));
      return `Listed #${id} for ${priceCredits} credits`;
    }
  },

  browse_listings: {
    name: 'browse_listings',
    description: 'Browse all currently-listed collectibles on the marketplace.',
    schema: {},
    agents: ['ZEROX','ORACLE'],
    async execute() {
      const file = path.join(__dirname, 'data', 'collectibles.json');
      let list = [];
      try { list = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { list = []; }
      const listed = list.filter(c => c.listing);
      if (!listed.length) return 'No collectibles currently listed.';
      const rows = listed.map(c => `${c.id} | ${c.name} | ${c.rarity} | ${c.listing.priceCredits} | ${c.owner}`);
      return ['ID | Name | Rarity | Price | Owner', '---|---|---|---|---', ...rows].join('\n');
    }
  },

  // ── MARKETPLACE ────────────────────────────────────────────────
  list_open_jobs: {
    name: 'list_open_jobs',
    description: 'List all open jobs from the marketplace (backend/data/marketplace.json).',
    schema: {},
    agents: ['SHADDAI','NEXUS','ZEROX','ORACLE','TURTLE','QUILL','PIKADON'],
    async execute() {
      const file = path.join(__dirname, 'data', 'marketplace.json');
      let data = [];
      try { data = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { data = []; }
      const jobs = Array.isArray(data) ? data : (data.jobs || []);
      const open = jobs.filter(j => !j.status || j.status === 'open');
      if (!open.length) return 'No open jobs.';
      const rows = open.map(j => `${j.id} | ${j.title || ''} | ${j.budget || 0} | ${j.agentTarget || 'any'} | ${j.deadline || 'n/a'}`);
      return ['ID | Title | Budget | AgentTarget | Deadline', '---|---|---|---|---', ...rows].join('\n');
    }
  },

  bid_on_job: {
    name: 'bid_on_job',
    description: 'Place a bid on an open marketplace job. Appends to job.bids array.',
    schema: { jobId: 'string — job id', agent: 'string — bidding agent', bidCredits: 'number — bid amount', eta: 'string — estimated delivery' },
    agents: ['ZEROX','NEXUS','ORACLE'],
    async execute({ jobId, agent, bidCredits, eta }) {
      const file = path.join(__dirname, 'data', 'marketplace.json');
      let data = [];
      try { data = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { data = []; }
      const isArr = Array.isArray(data);
      const jobs = isArr ? data : (data.jobs || []);
      const job = jobs.find(j => String(j.id) === String(jobId));
      if (!job) return `Job ${jobId} not found`;
      job.bids = job.bids || [];
      job.bids.push({ agent, bidCredits: Number(bidCredits), eta, bidAt: new Date().toISOString() });
      fs.writeFileSync(file, JSON.stringify(isArr ? jobs : data, null, 2));
      return `Bid recorded: ${agent} → ${jobId} @ ${bidCredits} credits`;
    }
  },

  complete_job: {
    name: 'complete_job',
    description: 'Mark a marketplace job as completed, store deliverable, and credit the agent earnings.',
    schema: { jobId: 'string — job id', agent: 'string — completing agent', deliverable: 'string — work output' },
    agents: ['SHADDAI','NEXUS','ZEROX','ORACLE','TURTLE','QUILL','PIKADON'],
    async execute({ jobId, agent, deliverable }) {
      const file = path.join(__dirname, 'data', 'marketplace.json');
      let data = [];
      try { data = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { data = []; }
      const isArr = Array.isArray(data);
      const jobs = isArr ? data : (data.jobs || []);
      const job = jobs.find(j => String(j.id) === String(jobId));
      if (!job) return `Job ${jobId} not found`;
      job.status = 'completed';
      job.deliverable = deliverable;
      job.completedBy = agent;
      job.completedAt = new Date().toISOString();
      const budget = Number(job.budget || 0);
      job.earnings = (job.earnings || 0) + budget;
      // Track agent earnings
      const earningsFile = path.join(__dirname, 'data', 'agent-earnings.json');
      let earnings = {};
      try { earnings = JSON.parse(fs.readFileSync(earningsFile, 'utf8')); } catch { earnings = {}; }
      earnings[agent] = (earnings[agent] || 0) + budget;
      try { fs.writeFileSync(earningsFile, JSON.stringify(earnings, null, 2)); } catch {}
      fs.writeFileSync(file, JSON.stringify(isArr ? jobs : data, null, 2));
      return `Job ${jobId} completed by ${agent}, earned ${budget} credits`;
    }
  },

  execute_trade: {
    name: 'execute_trade',
    description: 'Execute a collectibles trade: buyer pays priceCredits, ownership transfers, platform takes 10% fee.',
    schema: { collectible_id: 'string|number — collectible id', buyer: 'string — buyer wallet/name', buyer_credits: 'number — credits buyer is paying' },
    agents: ['SHADDAI','ZEROX'],
    async execute({ collectible_id, buyer, buyer_credits }) {
      const fp = path.join(__dirname, 'data', 'collectibles.json');
      const tradesFp = path.join(__dirname, 'data', 'collectible-trades.json');
      let items = [];
      try { items = JSON.parse(fs.readFileSync(fp, 'utf8')); } catch {}
      const item = items.find(c => String(c.id) === String(collectible_id));
      if (!item) return `Collectible ${collectible_id} not found`;
      if (!item.listing) return `Collectible ${collectible_id} is not listed for sale`;
      const price = Number(item.listing.priceCredits);
      const paid = Number(buyer_credits);
      if (paid < price) return `Insufficient credits: need ${price}, got ${paid}`;
      const fee = Math.round(price * 0.10);
      const sellerProceeds = price - fee;
      const oldOwner = item.owner;
      const trade = {
        id: 'trade-' + Date.now().toString(36),
        collectibleId: item.id,
        seller: oldOwner,
        buyer: buyer,
        price: price,
        platformFee: fee,
        sellerProceeds: sellerProceeds,
        executedAt: new Date().toISOString()
      };
      item.owner = buyer;
      delete item.listing;
      item.tradedAt = trade.executedAt;
      let trades = [];
      try { trades = JSON.parse(fs.readFileSync(tradesFp, 'utf8')); } catch {}
      trades.push(trade);
      try { fs.writeFileSync(tradesFp, JSON.stringify(trades, null, 2)); } catch {}
      fs.writeFileSync(fp, JSON.stringify(items, null, 2));
      return `Trade executed: ${item.name} transferred from ${oldOwner} → ${buyer} for ${price} credits (${sellerProceeds} to seller, ${fee} platform fee). Trade ID: ${trade.id}`;
    }
  },

  get_memory: {
    name: 'get_memory',
    description: 'Retrieve a previously saved memory by key. Returns the stored value.',
    schema: { key: 'string — memory key (with or without agent prefix)', agent: 'string — agent name (optional)' },
    agents: ['SHADDAI','NEXUS','ZEROX','ORACLE','TURTLE','QUILL','PIKADON'],
    async execute({ key, agent = '' }) {
      const mem = loadMemory();
      const fullKey = agent ? `${agent}:${key}` : key;
      // Try exact key first, then scan for partial match
      const entry = mem[fullKey] || Object.entries(mem).find(([k]) => k.includes(key))?.[1];
      return entry
        ? JSON.stringify({ found: true, key: fullKey, value: entry.value, updatedAt: entry.updatedAt })
        : JSON.stringify({ found: false, key: fullKey, allKeys: Object.keys(mem).slice(0,20) });
    }
  },

  // ── COMMUNICATION ────────────────────────────────────────────────

  post_discord: {
    name: 'post_discord',
    description: 'Post to Discord via webhook. Requires DISCORD_WEBHOOK_URL in .env.',
    schema: { message: 'string', title: 'string (optional)' },
    agents: ['QUILL','SHADDAI'],
    async execute({ message, title }) {
      const url = process.env.DISCORD_WEBHOOK_URL;
      if (!url) return 'Not configured: set DISCORD_WEBHOOK_URL in backend/.env';
      const body = title
        ? { embeds: [{ title, description: message.slice(0,4096), color: 0x00e5a0, timestamp: new Date().toISOString() }] }
        : { content: message.slice(0,2000) };
      await axios.post(url, body, { timeout: 8000 });
      return JSON.stringify({ success: true });
    }
  },

  generate_image: {
    name: 'generate_image',
    description: 'Generate a real AI image using HuggingFace FLUX.1-schnell (server-side key pool, no client key needed). Returns a served URL to the rendered PNG.',
    schema: { prompt: 'string — detailed image description', model: "string — ignored (always uses FLUX.1-schnell)", width: 'number (default 1024)', height: 'number (default 1024)' },
    agents: ['TURTLE'],
    async execute({ prompt, model = 'flux', width = 1024, height = 1024 }) {
      const hf = require('./lib/hf-keys');
      const DATA_DIR = path.join(__dirname, '..', 'data');
      const IMG_DIR  = path.join(DATA_DIR, 'agent-images');
      try { fs.mkdirSync(IMG_DIR, { recursive: true }); } catch (_) {}
      if (!hf.keys().length) {
        return JSON.stringify({ success: false, error: 'No HF token configured. Add HF_TOKENS to .env or backend/data/runtime-keys.json.', code: 'NO_KEY' });
      }
      let img;
      try { img = await hf.generate(String(prompt || 'abstract AI art')); }
      catch (e) { return JSON.stringify({ success: false, error: 'Image generation failed: ' + (e && e.message || 'unknown'), code: e && e.code || 'GEN_ERROR' }); }
      const file = 'gen-' + Date.now() + '-' + Math.floor(Math.random() * 1e5) + '.png';
      try { fs.writeFileSync(path.join(IMG_DIR, file), img); }
      catch (e) { return JSON.stringify({ success: false, error: 'Could not save image: ' + (e && e.message || 'unknown') }); }
      const url = '/api/forge/image/' + file;
      const dataUri = 'data:image/png;base64,' + img.toString('base64');
      return JSON.stringify({ success: true, ok: true, provider: 'huggingface-flux', url, dataUri, prompt, note: 'Image saved server-side. Access via ' + url });
    }
  },

  schedule_task: {
    name: 'schedule_task',
    description: 'Schedule a task or reminder for a future time. Persists it for the background job runner. Accepts ISO datetime or relative ("in 2 hours", "in 3 days").',
    schema: { when: 'string — ISO datetime or relative like "in 2 hours"', action: 'string — what to do', agent: 'string — agent to run it (optional)' },
    agents: ['SHADDAI', 'ORACLE', 'QUILL'],
    async execute({ when, action, agent = 'SHADDAI' }) {
      const fs = require('fs'), path = require('path');
      const dir = path.join(__dirname, '..', 'data'), file = path.join(dir, 'scheduled-tasks.json');
      const now = Date.now(); let whenISO = when;
      const m = String(when || '').match(/in\s+(\d+)\s*(min|hour|day)/i);
      if (m) { const n = +m[1], u = m[2].toLowerCase(); whenISO = new Date(now + (u.startsWith('min') ? n * 6e4 : u.startsWith('hour') ? n * 36e5 : n * 864e5)).toISOString(); }
      else { const d = new Date(when); if (!isNaN(d.getTime())) whenISO = d.toISOString(); }
      const task = { id: 'sch_' + now.toString(36), when: whenISO, action: action || '', agent, status: 'scheduled', created: new Date().toISOString() };
      try { fs.mkdirSync(dir, { recursive: true }); let arr = []; try { arr = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) {} arr.push(task); fs.writeFileSync(file, JSON.stringify(arr, null, 2)); }
      catch (e) { return JSON.stringify({ success: false, error: 'could not persist: ' + e.message }); }
      return JSON.stringify({ success: true, scheduled: task, note: 'Saved to data/scheduled-tasks.json — background job runner executes due tasks.' });
    }
  },

  list_scheduled_tasks: {
    name: 'list_scheduled_tasks',
    description: 'List scheduled tasks / reminders.',
    schema: {},
    agents: ['SHADDAI', 'ORACLE', 'QUILL'],
    async execute() {
      const fs = require('fs'), path = require('path');
      try { const arr = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'scheduled-tasks.json'), 'utf8')); return JSON.stringify({ success: true, count: arr.length, tasks: arr.slice(-20) }); }
      catch (_) { return JSON.stringify({ success: true, count: 0, tasks: [] }); }
    }
  },

  analyze_sentiment: {
    name: 'analyze_sentiment',
    description: 'Analyze sentiment of any text. Returns score (-1 to +1), label, and key terms.',
    schema: { text: 'string — text to analyze' },
    agents: ['ORACLE','ZEROX','QUILL'],
    async execute({ text }) {
      const positive = ['good','great','excellent','amazing','bull','bullish','up','gain','profit','win','rise','pump','growth','strong','buy','positive','opportunity','recover','green','moon'];
      const negative = ['bad','terrible','crash','bear','bearish','down','loss','fail','drop','dump','weak','sell','negative','risk','danger','warning','red','fear','panic','drop'];
      const words = text.toLowerCase().match(/\b\w+\b/g) || [];
      const posHits = words.filter(w => positive.includes(w));
      const negHits = words.filter(w => negative.includes(w));
      const score = (posHits.length - negHits.length) / Math.max(words.length, 1);
      const normalizedScore = Math.max(-1, Math.min(1, score * 10));
      return JSON.stringify({
        score: normalizedScore.toFixed(3),
        label: normalizedScore > 0.1 ? 'POSITIVE' : normalizedScore < -0.1 ? 'NEGATIVE' : 'NEUTRAL',
        positiveTerms: [...new Set(posHits)].slice(0,8),
        negativeTerms: [...new Set(negHits)].slice(0,8),
        wordCount: words.length
      });
    }
  },

  format_data: {
    name: 'format_data',
    description: 'Format raw data as markdown table, JSON, CSV, or bullet list. Clean output for reports.',
    schema: { data: 'string — raw data (JSON string or text)', format: 'string — "markdown_table", "csv", "bullets", "json_pretty"' },
    agents: ['QUILL','NEXUS','ORACLE'],
    async execute({ data, format = 'markdown_table' }) {
      let parsed;
      try { parsed = JSON.parse(data); } catch { parsed = data; }

      if (format === 'json_pretty') {
        return JSON.stringify({ output: JSON.stringify(parsed, null, 2) });
      }
      if (format === 'csv' && Array.isArray(parsed)) {
        const headers = Object.keys(parsed[0] || {});
        const csv = [headers.join(','), ...parsed.map(row => headers.map(h => JSON.stringify(row[h] ?? '')).join(','))].join('\n');
        return JSON.stringify({ output: csv });
      }
      if (format === 'bullets' && Array.isArray(parsed)) {
        const bullets = parsed.map(item => typeof item === 'object'
          ? '- ' + Object.entries(item).map(([k,v]) => `**${k}**: ${v}`).join(', ')
          : '- ' + item
        ).join('\n');
        return JSON.stringify({ output: bullets });
      }
      // Default: markdown table
      if (Array.isArray(parsed) && parsed.length > 0) {
        const headers = Object.keys(parsed[0]);
        const divider = headers.map(() => '---').join(' | ');
        const rows = parsed.map(row => headers.map(h => String(row[h] ?? '')).join(' | '));
        const table = ['| ' + headers.join(' | ') + ' |', '| ' + divider + ' |', ...rows.map(r => '| ' + r + ' |')].join('\n');
        return JSON.stringify({ output: table });
      }
      return JSON.stringify({ output: String(data) });
    }
  },

  // ── MULTI-AGENT DELEGATION (CrewAI supervisor pattern) ────────────

  delegate_to_agent: {
    name: 'delegate_to_agent',
    description: 'Delegate a sub-task to another agent. SHADDAI uses this to coordinate. Returns sub-task result.',
    schema: { agent: 'string — agent name (NEXUS, ZEROX, ORACLE, TURTLE, QUILL, PIKADON)', task: 'string — what they should do' },
    agents: ['SHADDAI','NEXUS'],
    async execute({ agent, task }) {
      if (!AGENTS[agent?.toUpperCase()]) return `Unknown agent: ${agent}. Valid: ${Object.keys(AGENTS).join(', ')}`;
      const subTask = createTask(task, agent.toUpperCase());
      await runAgentLoop(subTask.id);
      const done = getTask(subTask.id);
      return JSON.stringify({
        delegatedTo: agent.toUpperCase(),
        task,
        status: done.status,
        result: done.result?.slice(0, 1500) || done.error,
        tools_used: [...new Set(done.tools_used)]
      });
    }
  },

  // ── DEV/UTILITY TOOLS ───────────────────────────────────────────

  screenshot_url: {
    name: 'screenshot_url',
    description: 'Capture a screenshot of any webpage. Returns image URL. Uses thum.io (free, no key).',
    schema: { url: 'string — full https:// URL to screenshot', width: 'number — width in px (default 1024)' },
    agents: ['TURTLE','ORACLE','NEXUS'],
    async execute({ url, width = 1024 }) {
      if (!url?.startsWith('http')) return 'URL must start with http:// or https://';
      const imageUrl = `https://image.thum.io/get/width/${width}/crop/800/${encodeURIComponent(url)}`;
      return JSON.stringify({ success: true, screenshotUrl: imageUrl, sourceUrl: url });
    }
  },

  hash_text: {
    name: 'hash_text',
    description: 'Hash a string with SHA256, SHA1, or MD5. Useful for fingerprinting, checksums.',
    schema: { text: 'string — text to hash', algorithm: 'string — sha256, sha1, md5 (default sha256)' },
    agents: ['NEXUS','PIKADON','SHADDAI'],
    async execute({ text, algorithm = 'sha256' }) {
      const hash = crypto.createHash(algorithm).update(text).digest('hex');
      return JSON.stringify({ algorithm, input: text.slice(0,80), hash, length: hash.length });
    }
  },

  base64_codec: {
    name: 'base64_codec',
    description: 'Base64 encode or decode a string. Useful for JWTs, data URIs, basic auth.',
    schema: { input: 'string — text to encode or base64 to decode', mode: 'string — "encode" or "decode"' },
    agents: ['NEXUS','PIKADON'],
    async execute({ input, mode = 'encode' }) {
      try {
        const output = mode === 'decode'
          ? Buffer.from(input, 'base64').toString('utf8')
          : Buffer.from(input, 'utf8').toString('base64');
        return JSON.stringify({ mode, input: input.slice(0,80), output });
      } catch(e) { return JSON.stringify({ error: e.message }); }
    }
  },

  regex_test: {
    name: 'regex_test',
    description: 'Test a regex pattern against text. Returns matches, groups, and count.',
    schema: { pattern: 'string — regex pattern (no flags)', flags: 'string — regex flags e.g. gi', text: 'string — text to test' },
    agents: ['NEXUS','PIKADON','QUILL'],
    async execute({ pattern, flags = 'g', text }) {
      try {
        const re = new RegExp(pattern, flags);
        const matches = [];
        let m;
        if (flags.includes('g')) {
          while ((m = re.exec(text)) !== null && matches.length < 50) matches.push({ match: m[0], index: m.index, groups: m.slice(1) });
        } else {
          m = re.exec(text);
          if (m) matches.push({ match: m[0], index: m.index, groups: m.slice(1) });
        }
        return JSON.stringify({ pattern, flags, matchCount: matches.length, matches: matches.slice(0,20) });
      } catch(e) { return JSON.stringify({ error: 'Invalid regex: ' + e.message }); }
    }
  },

  extract_keywords: {
    name: 'extract_keywords',
    description: 'Extract top keywords from text by frequency. Strips common stop words.',
    schema: { text: 'string — text to analyze', limit: 'number — keywords to return (default 10)' },
    agents: ['ORACLE','QUILL','ZEROX'],
    async execute({ text, limit = 10 }) {
      const stop = new Set(['the','a','an','and','or','but','is','are','was','were','be','been','being','have','has','had','do','does','did','will','would','should','could','may','might','must','can','this','that','these','those','i','you','he','she','it','we','they','what','which','who','when','where','why','how','of','to','in','on','at','for','with','by','from','as','about','into','through','during','before','after','above','below','up','down','out','off','over','under','again','further','then','once','here','there','all','any','both','each','few','more','most','other','some','such','no','not','only','own','same','so','than','too','very','just']);
      const words = text.toLowerCase().match(/\b[a-z]{3,}\b/g) || [];
      const freq = {};
      words.forEach(w => { if (!stop.has(w)) freq[w] = (freq[w] || 0) + 1; });
      const top = Object.entries(freq).sort((a,b) => b[1] - a[1]).slice(0, limit).map(([word, count]) => ({ word, count }));
      return JSON.stringify({ totalWords: words.length, uniqueKeywords: Object.keys(freq).length, top });
    }
  },

  markdown_to_html: {
    name: 'markdown_to_html',
    description: 'Convert markdown to HTML. Supports headings, bold, italic, lists, links, code blocks.',
    schema: { markdown: 'string — markdown text' },
    agents: ['QUILL','TURTLE','NEXUS'],
    async execute({ markdown }) {
      if (typeof markdown !== 'string' || !markdown.trim()) return JSON.stringify({ error: 'markdown_to_html needs a non-empty "markdown" string', example: { markdown: '# Title\n\nSome **bold** text.' } });
      let html = markdown
        .replace(/```([a-z]*)\n([\s\S]*?)```/g, '<pre><code class="lang-$1">$2</code></pre>')
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        .replace(/^### (.+)$/gm, '<h3>$1</h3>')
        .replace(/^## (.+)$/gm, '<h2>$1</h2>')
        .replace(/^# (.+)$/gm, '<h1>$1</h1>')
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/\*([^*]+)\*/g, '<em>$1</em>')
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
        .replace(/^- (.+)$/gm, '<li>$1</li>')
        .replace(/(<li>.*<\/li>\n?)+/g, m => '<ul>' + m + '</ul>')
        .replace(/\n\n/g, '</p><p>')
        .replace(/^(?!<[a-z])/gm, '<p>')
        .replace(/(?<![>])$/gm, '</p>')
        .replace(/<p><\/p>/g, '');
      return JSON.stringify({ html: html.slice(0, 5000) });
    }
  },

  translate_text: {
    name: 'translate_text',
    description: 'Translate text to another language. Uses MyMemory (free, no key, 5k chars/day).',
    schema: { text: 'string — text to translate', target: 'string — target language code (es, fr, de, ja, zh, etc.)', source: 'string — source code (default auto)' },
    agents: ['QUILL','ORACLE','SHADDAI'],
    async execute({ text, target, source = 'en' }) {
      const r = await http(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text.slice(0,500))}&langpair=${source}|${target}`);
      const translated = r.data.responseData?.translatedText || '(no translation)';
      return JSON.stringify({ source, target, original: text.slice(0,200), translated });
    }
  },

  count_tokens: {
    name: 'count_tokens',
    description: 'Count words, characters, and estimate LLM tokens (~4 chars per token) for any text.',
    schema: { text: 'string — text to count' },
    agents: ['NEXUS','QUILL','ORACLE','SHADDAI'],
    async execute({ text }) {
      const chars = text.length;
      const words = (text.match(/\b\w+\b/g) || []).length;
      const lines = text.split('\n').length;
      const sentences = (text.match(/[.!?]+\s/g) || []).length;
      const tokensEst = Math.ceil(chars / 4);
      const readMinutes = (words / 200).toFixed(1);
      return JSON.stringify({ chars, words, lines, sentences, tokensEst, readingTimeMinutes: readMinutes });
    }
  },

  read_obsidian_skill: {
    name: 'read_obsidian_skill',
    description: 'Read the full SKILL.md content from Obsidian vault by skill name. Returns step-by-step methodology.',
    schema: { skill: 'string — skill name e.g. market-brief, security-audit' },
    agents: ['SHADDAI','NEXUS','ZEROX','ORACLE','TURTLE','QUILL','PIKADON'],
    execute: async (params) => {
      const id = params.skill_id || params.id || params.name || params.skill || '';
      const skill = skillIndex.getBakedSkill(id);
      if (!skill) return `Skill "${id}" not found in catalog. Use /find to search.`;
      return `Skill: ${skill.name}\nAgent: ${skill.agent}\nCategory: ${skill.category}\n\n${(skill.methodology || skill.description || 'No methodology available.').slice(0, 2000)}`;
    }
  },

  run_skill: {
    name: 'run_skill',
    description: 'Execute one of the 3,437 SHADDAI skills by name or intent. For RECIPE skills, runs all tool steps deterministically and returns combined results. For MD/baked skills, returns the methodology so you can apply it. Prefer your own agent\'s skills first.',
    schema: {
      skill:  'string — skill name (e.g. "daily-market-snapshot") or a natural-language description of what you want (e.g. "analyze BTC dominance")',
      input:  'object — optional input params passed to recipe {{input.X}} placeholders (e.g. {"symbol":"bitcoin","address":"abc"})',
      agent:  'string — optional: restrict search to a specific agent\'s skills (ZEROX, ORACLE, NEXUS, TURTLE, QUILL, PIKADON, SHADDAI)'
    },
    agents: ['SHADDAI','ZEROX','ORACLE','NEXUS','TURTLE','QUILL','PIKADON'],
    execute: async ({ skill: skillQuery = '', input: inputParams = {}, agent: preferAgent } = {}) => {
      const _runSkillDepth = (TOOLS.run_skill.execute._depth || 0);
      if (_runSkillDepth >= 1) {
        return `[run_skill] Recursion blocked: run_skill cannot be called from inside a run_skill execution. Use individual tools (fetch_price, search_web, etc.) directly instead.`;
      }
      TOOLS.run_skill.execute._depth = _runSkillDepth + 1;
      const STEP_TIMEOUT_MS = 8000;
      try {
        if (!skillQuery || !skillQuery.trim()) {
          return '[run_skill] Error: "skill" param is required. Provide a skill name or description.';
        }
        let skillMeta = null, skillContent = null;
        const { RECIPES, loadSkillContent, findSkills } = skillIndex;
        if (RECIPES[skillQuery]) {
          skillMeta = { id: skillQuery, type: 'recipe' };
          skillContent = { type: 'recipe', recipe: RECIPES[skillQuery] };
        }
        if (!skillContent) {
          const searchAgent = preferAgent || undefined;
          const matches = findSkills(skillQuery, { agent: searchAgent, limit: 1 });
          if (matches.length === 0) {
            const wideMatches = searchAgent ? findSkills(skillQuery, { limit: 1 }) : [];
            if (wideMatches.length === 0) {
              return `[run_skill] No skill found matching "${skillQuery}". Try a different description or use read_obsidian_skill to browse by name.`;
            }
            skillMeta = wideMatches[0];
          } else {
            skillMeta = matches[0];
          }
          skillContent = loadSkillContent(skillMeta.id, { type: skillMeta.type });
          if (!skillContent) {
            return `[run_skill] Skill "${skillMeta.id}" found in index but content could not be loaded.`;
          }
        }
        const resolvedId = (skillMeta && skillMeta.id) || skillQuery;
        if (skillContent.type === 'recipe') {
          const recipe = skillContent.recipe;
          const stepResults = [];
          for (let i = 0; i < recipe.steps.length; i++) {
            const step = recipe.steps[i];
            if (step.tool === 'run_skill') {
              stepResults.push({ tool: step.tool, result: '[blocked: run_skill cannot call itself]', error: true });
              continue;
            }
            const resolvedParams = {};
            Object.entries(step.params || {}).forEach(([k, v]) => {
              resolvedParams[k] = skillIndex.interpolate(String(v), inputParams, stepResults);
            });
            const tool = resolveTool(step.tool);
            if (!tool) {
              stepResults.push({ tool: step.tool, result: `Unknown tool: ${step.tool}`, error: true });
              continue;
            }
            try {
              const result = await Promise.race([
                tool.execute(resolvedParams),
                new Promise((_, rej) => setTimeout(() => rej(new Error(`timeout after ${STEP_TIMEOUT_MS}ms`)), STEP_TIMEOUT_MS))
              ]);
              stepResults.push({ tool: step.tool, result: String(result).slice(0, 800) });
            } catch (stepErr) {
              stepResults.push({ tool: step.tool, result: `Error: ${stepErr.message}`, error: true });
            }
          }
          const dataBlock = stepResults.map(s => `[${s.tool}]${s.error ? ' ERROR' : ''}: ${s.result}`).join('\n\n');
          const note = recipe.synthesize
            ? `\n\n[run_skill note] This skill has a suggested synthesis prompt — apply it to the data above:\n"${skillIndex.interpolate(recipe.synthesize, inputParams, stepResults).slice(0, 300)}..."`
            : '';
          return `Skill "${resolvedId}" — ${recipe.description || ''}\nAgent: ${recipe.agent}\nSteps executed: ${stepResults.length}\n\n${dataBlock}${note}`;
        }
        const s = skillContent.skill;
        const content = skillContent.content || (s && s.methodology) || (s && s.description) || 'No methodology available.';
        const agentLabel = (s && s.agent) || (skillMeta && skillMeta.agent) || 'SHADDAI';
        const category = (s && s.category) ? `\nCategory: ${s.category}` : '';
        return `Skill: ${(s && s.name) || resolvedId}\nAgent: ${agentLabel}${category}\nType: ${skillContent.type} (methodology — apply yourself)\n\n${content.slice(0, 2000)}`;
      } finally {
        TOOLS.run_skill.execute._depth = Math.max(0, (TOOLS.run_skill.execute._depth || 1) - 1);
      }
    }
  },

  // ── 25 NEW REAL TOOLS ──────────────────────────────────────────────────────

  get_reddit_posts: {
    name: 'get_reddit_posts',
    description: 'Fetch top posts from any subreddit — real community discussion',
    schema: { subreddit: 'string — e.g. cryptocurrency, technology, ArtificialIntelligence' },
    execute: async ({ subreddit }) => {
      const sub = String(subreddit || 'technology').replace(/[^a-zA-Z0-9_]/g, '');
      const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36';
      // Reddit increasingly 403s data-center IPs; try multiple hosts, then fall back gracefully.
      for (const host of ['https://www.reddit.com', 'https://old.reddit.com']) {
        try {
          const r = await fetch(`${host}/r/${sub}/top.json?limit=5&t=day`, { headers: { 'User-Agent': UA, 'Accept': 'application/json' }, signal: AbortSignal.timeout(15000) });
          if (!r.ok) continue;
          const d = await r.json();
          const posts = d.data?.children || [];
          if (posts.length) return `r/${sub} top posts:\n` + posts.map((p, i) => `${i+1}. ${p.data.title} (${p.data.score}↑, ${p.data.num_comments} comments)`).join('\n');
        } catch {}
      }
      // Fallback: HackerNews search for the topic (keyless, reliable) so the agent still gets community signal
      try {
        const r = await fetch(`https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(sub)}&tags=story&hitsPerPage=5`, { signal: AbortSignal.timeout(10000) });
        const d = await r.json();
        if (d.hits?.length) return `Reddit blocked automated access; here are related Hacker News discussions for "${sub}":\n` + d.hits.map((h, i) => `${i+1}. ${h.title} (${h.points || 0} pts)`).join('\n');
      } catch {}
      return `r/${sub}: Reddit is blocking automated access (common from cloud IPs). Try a different source.`;
    }
  },

  get_arxiv_papers: {
    name: 'get_arxiv_papers',
    description: 'Search arXiv for research papers by topic',
    schema: { query: 'string — search terms e.g. large language models' },
    execute: async ({ query }) => {
      const r = await fetch(`https://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(query)}&max_results=3&sortBy=submittedDate&sortOrder=descending`, { signal: AbortSignal.timeout(10000) });
      const xml = await r.text();
      const titles = [...xml.matchAll(/<title>([\s\S]*?)<\/title>/g)].slice(1).map(m => m[1].trim());
      const summaries = [...xml.matchAll(/<summary>([\s\S]*?)<\/summary>/g)].map(m => m[1].trim().slice(0,150));
      return titles.map((t,i) => `${i+1}. ${t}\n   ${summaries[i]||''}`).join('\n\n') || 'No papers found';
    }
  },

  get_gas_price: {
    name: 'get_gas_price',
    description: 'Current Ethereum gas prices (slow/standard/fast in Gwei)',
    schema: {},
    execute: async () => {
      const r = await fetch('https://api.owlracle.info/v4/eth/gas', { signal: AbortSignal.timeout(10000) });
      const d = await r.json();
      if (d.speeds) return `ETH Gas — Slow: ${d.speeds[0]?.maxFeePerGas?.toFixed(1)} | Standard: ${d.speeds[1]?.maxFeePerGas?.toFixed(1)} | Fast: ${d.speeds[2]?.maxFeePerGas?.toFixed(1)} Gwei`;
      return JSON.stringify(d).slice(0,200);
    }
  },

  get_nft_floor: {
    name: 'get_nft_floor',
    description: 'MagicEden Solana NFT collection floor price and stats',
    schema: { symbol: 'string — collection symbol e.g. okay_bears, degods' },
    execute: async ({ symbol }) => {
      const r = await fetch(`https://api-mainnet.magiceden.dev/v2/collections/${symbol}/stats`, { signal: AbortSignal.timeout(10000) });
      const d = await r.json();
      if (!d.floorPrice) return `Collection "${symbol}" not found`;
      return `${symbol}: Floor ${(d.floorPrice/1e9).toFixed(3)} SOL | Listed: ${d.listedCount} | Volume: ${(d.volumeAll/1e9).toFixed(1)} SOL`;
    }
  },

  get_crypto_news: {
    name: 'get_crypto_news',
    description: 'Latest hot cryptocurrency news headlines',
    schema: {},
    execute: async () => {
      // 1) CryptoCompare news API
      try {
        const r = await fetch('https://min-api.cryptocompare.com/data/v2/news/?lang=EN&limit=6', { signal: AbortSignal.timeout(10000) });
        const d = await r.json();
        if (Array.isArray(d.Data) && d.Data.length) {
          return 'Crypto News:\n' + d.Data.slice(0,6).map((a,i) => `${i+1}. ${a.title} (${a.source||a.source_info?.name||'news'})`).join('\n');
        }
      } catch {}
      // 2) CoinDesk RSS fallback
      try {
        const r = await fetch('https://www.coindesk.com/arc/outboundfeeds/rss/', { headers: { 'User-Agent': 'SHADDAI/2.0' }, signal: AbortSignal.timeout(10000) });
        const xml = await r.text();
        const titles = [...xml.matchAll(/<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/g)].slice(1, 7).map(m => m[1]);
        if (titles.length) return 'Crypto News (CoinDesk):\n' + titles.map((t,i) => `${i+1}. ${t}`).join('\n');
      } catch {}
      // 3) CoinTelegraph RSS final fallback
      try {
        const r = await fetch('https://cointelegraph.com/rss', { headers: { 'User-Agent': 'SHADDAI/2.0' }, signal: AbortSignal.timeout(10000) });
        const xml = await r.text();
        const titles = [...xml.matchAll(/<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/g)].slice(1, 7).map(m => m[1]);
        if (titles.length) return 'Crypto News (CoinTelegraph):\n' + titles.map((t,i) => `${i+1}. ${t}`).join('\n');
      } catch {}
      return 'Crypto news temporarily unavailable from all sources.';
    }
  },

  get_stock_quote: {
    name: 'get_stock_quote',
    description: 'Real-time stock price from Yahoo Finance — works for any ticker (AAPL, TSLA, NVDA, etc.)',
    schema: { symbol: 'string — stock ticker e.g. AAPL, TSLA, NVDA, SPY' },
    execute: async ({ symbol }) => {
      const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol.toUpperCase()}?interval=1d&range=1d`, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(10000) });
      const d = await r.json();
      const meta = d.chart?.result?.[0]?.meta;
      if (!meta) return `Symbol ${symbol} not found`;
      return `${symbol.toUpperCase()}: $${meta.regularMarketPrice} | Change: ${((meta.regularMarketPrice-meta.previousClose)/meta.previousClose*100).toFixed(2)}% | Volume: ${(meta.regularMarketVolume/1e6).toFixed(1)}M`;
    }
  },

  get_country_info: {
    name: 'get_country_info',
    description: 'Country facts: population, capital, currency, languages, flag',
    schema: { country: 'string — country name e.g. Japan, Brazil, Germany' },
    execute: async ({ country }) => {
      const r = await fetch(`https://restcountries.com/v3.1/name/${encodeURIComponent(country)}?fields=name,capital,population,currencies,languages,flags`, { signal: AbortSignal.timeout(10000) });
      const d = await r.json();
      const c = d[0];
      const cur = Object.values(c.currencies||{})[0];
      const lang = Object.values(c.languages||{}).join(', ');
      return `${c.name.common} — Capital: ${c.capital?.[0]} | Pop: ${(c.population/1e6).toFixed(1)}M | Currency: ${cur?.name} (${cur?.symbol}) | Languages: ${lang} | Flag: ${c.flags?.png}`;
    }
  },

  get_ip_info: {
    name: 'get_ip_info',
    description: 'Geolocate an IP address — country, city, ISP, coordinates',
    schema: { ip: 'string — IPv4 address e.g. 8.8.8.8' },
    execute: async ({ ip }) => {
      const r = await fetch(`https://ipapi.co/${ip}/json/`, { signal: AbortSignal.timeout(10000) });
      const d = await r.json();
      return `IP ${ip}: ${d.city}, ${d.region}, ${d.country_name} | ISP: ${d.org} | Lat: ${d.latitude} Lon: ${d.longitude}`;
    }
  },

  get_word_definition: {
    name: 'get_word_definition',
    description: 'Dictionary definition, pronunciation, and example usage for any English word',
    schema: { word: 'string — the word to define' },
    execute: async ({ word }) => {
      const r = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`, { signal: AbortSignal.timeout(10000) });
      const d = await r.json();
      if (!Array.isArray(d)) return `No definition found for "${word}"`;
      const e = d[0].meanings[0];
      const def = e.definitions[0];
      return `${word} (${e.partOfSpeech}): ${def.definition}${def.example ? ' — Example: "'+def.example+'"' : ''}`;
    }
  },

  get_random_quote: {
    name: 'get_random_quote',
    description: 'Get an inspiring or interesting random quote',
    schema: { tag: 'string — optional topic e.g. success, technology, wisdom' },
    execute: async ({ tag = '' }) => {
      // 1) zenquotes.io (keyless, reliable)
      try {
        const r = await fetch('https://zenquotes.io/api/random', { signal: AbortSignal.timeout(8000) });
        const d = await r.json();
        if (Array.isArray(d) && d[0]?.q) return `"${d[0].q}" — ${d[0].a}`;
      } catch {}
      // 2) quotable.io fallback
      try {
        const url = tag ? `https://api.quotable.io/random?tags=${tag}` : 'https://api.quotable.io/random';
        const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
        const d = await r.json();
        if (d.content) return `"${d.content}" — ${d.author}`;
      } catch {}
      // 3) static fallback
      const fallback = [
        '"The best way to predict the future is to invent it." — Alan Kay',
        '"Code is like humor. When you have to explain it, it’s bad." — Cory House',
        '"Simplicity is the soul of efficiency." — Austin Freeman',
        '"Make it work, make it right, make it fast." — Kent Beck'
      ];
      return fallback[Math.floor(Math.random() * fallback.length)];
    }
  },

  get_joke: {
    name: 'get_joke',
    description: 'Get a programming or tech joke',
    schema: { category: 'string — Programming, Misc, Dark, Pun (default: Programming)' },
    execute: async ({ category = 'Programming' }) => {
      const r = await fetch(`https://v2.jokeapi.dev/joke/${category}?safe-mode`, { signal: AbortSignal.timeout(10000) });
      const d = await r.json();
      return d.type === 'single' ? d.joke : `${d.setup}\n→ ${d.delivery}`;
    }
  },

  get_history_today: {
    name: 'get_history_today',
    description: 'Historical events that happened on today\'s date throughout history',
    schema: {},
    execute: async () => {
      const r = await fetch('https://history.muffinlabs.com/date', { signal: AbortSignal.timeout(10000) });
      const d = await r.json();
      const events = d.data?.Events?.slice(0,5).map(e => `${e.year}: ${e.text}`).join('\n');
      return `Today in history:\n${events}`;
    }
  },

  get_moon_phase: {
    name: 'get_moon_phase',
    description: 'Current moon phase and next full/new moon dates',
    schema: {},
    execute: async () => {
      const today = new Date().toISOString().split('T')[0];
      const r = await fetch(`https://aa.usno.navy.mil/api/moon/phases/date?date=${today}&nump=4`, { signal: AbortSignal.timeout(10000) });
      const d = await r.json();
      return d.phasedata?.slice(0,3).map(p => `${p.phase}: ${p.date} ${p.time}`).join('\n') || 'Moon data unavailable';
    }
  },

  get_timezone: {
    name: 'get_timezone',
    description: 'Current time and date in any timezone worldwide',
    schema: { timezone: 'string — e.g. America/New_York, Europe/London, Asia/Tokyo' },
    execute: async ({ timezone }) => {
      const tz = timezone || 'UTC';
      try {
        const now = new Date();
        const formatted = now.toLocaleString('en-US', {
          timeZone: tz, weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
          hour: '2-digit', minute: '2-digit', second: '2-digit', timeZoneName: 'short'
        });
        // Compute UTC offset for the zone
        const tzDate = new Date(now.toLocaleString('en-US', { timeZone: tz }));
        const utcDate = new Date(now.toLocaleString('en-US', { timeZone: 'UTC' }));
        const offsetMin = Math.round((tzDate - utcDate) / 60000);
        const sign = offsetMin >= 0 ? '+' : '-';
        const oh = String(Math.floor(Math.abs(offsetMin) / 60)).padStart(2, '0');
        const om = String(Math.abs(offsetMin) % 60).padStart(2, '0');
        return `${tz}: ${formatted} (UTC${sign}${oh}:${om})`;
      } catch {
        return `Unknown timezone: ${tz}. Use IANA format like "America/New_York", "Europe/London", "Asia/Tokyo".`;
      }
    }
  },

  get_color_palette: {
    name: 'get_color_palette',
    description: 'Generate a harmonious color palette from a seed color',
    schema: { hex: 'string — hex color without # e.g. FF6B35', mode: 'string — analogic, complement, triad (default: analogic)' },
    execute: async ({ hex = 'FF6B35', mode = 'analogic' }) => {
      const r = await fetch(`https://www.thecolorapi.com/scheme?hex=${hex}&mode=${mode}&count=5`, { signal: AbortSignal.timeout(10000) });
      const d = await r.json();
      const colors = d.colors?.map(c => `${c.name.value} (#${c.hex.clean})`).join(', ');
      return `Palette from #${hex} (${mode}):\n${colors}`;
    }
  },

  get_qr_code: {
    name: 'get_qr_code',
    description: 'Generate a QR code image URL for any text or URL',
    schema: { data: 'string — text or URL to encode' },
    execute: async ({ data }) => {
      const encoded = encodeURIComponent(data);
      return `QR Code URL: https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encoded}\nScan or open the URL to view.`;
    }
  },

  shorten_url: {
    name: 'shorten_url',
    description: 'Shorten any long URL using TinyURL',
    schema: { url: 'string — the URL to shorten' },
    execute: async ({ url }) => {
      const r = await fetch(`https://tinyurl.com/api-create.php?url=${encodeURIComponent(url)}`, { signal: AbortSignal.timeout(10000) });
      const short = await r.text();
      return `Shortened: ${short}`;
    }
  },

  check_port: {
    name: 'check_port',
    description: 'Check if a TCP port is open on a host',
    schema: { host: 'string — hostname or IP', port: 'number — port number' },
    execute: async ({ host, port }) => {
      if (!host || port == null || isNaN(Number(port))) return `check_port needs "host" and a numeric "port" — e.g. { "host": "example.com", "port": 443 }.`;
      return new Promise((resolve) => {
        const net = require('net');
        const socket = new net.Socket();
        const timeout = setTimeout(() => { socket.destroy(); resolve(`${host}:${port} — CLOSED (timeout)`); }, 3000);
        socket.connect(port, host, () => { clearTimeout(timeout); socket.destroy(); resolve(`${host}:${port} — OPEN`); });
        socket.on('error', () => { clearTimeout(timeout); resolve(`${host}:${port} — CLOSED`); });
      });
    }
  },

  get_public_apis: {
    name: 'get_public_apis',
    description: 'Search a directory of free public APIs by topic',
    schema: { query: 'string — topic to search e.g. weather, finance, music, crypto' },
    execute: async ({ query = '' }) => {
      // api.publicapis.org is defunct (DNS dead). Use a curated keyless directory.
      const DIR = [
        { API: 'CoinGecko', cat: 'crypto', Description: 'Crypto prices, market data', Auth: 'none', Link: 'https://www.coingecko.com/en/api' },
        { API: 'DeFiLlama', cat: 'crypto finance', Description: 'DeFi TVL and protocol data', Auth: 'none', Link: 'https://defillama.com/docs/api' },
        { API: 'CoinCap', cat: 'crypto finance', Description: 'Real-time crypto market data', Auth: 'none', Link: 'https://docs.coincap.io' },
        { API: 'Open-Meteo', cat: 'weather', Description: 'Free weather forecast, no key', Auth: 'none', Link: 'https://open-meteo.com' },
        { API: 'OpenWeatherMap', cat: 'weather', Description: 'Weather data', Auth: 'apiKey', Link: 'https://openweathermap.org/api' },
        { API: 'REST Countries', cat: 'geo reference', Description: 'Country info', Auth: 'none', Link: 'https://restcountries.com' },
        { API: 'Wikipedia', cat: 'reference knowledge', Description: 'Encyclopedia content', Auth: 'none', Link: 'https://www.mediawiki.org/wiki/API' },
        { API: 'Hacker News', cat: 'news tech', Description: 'Tech news and discussion', Auth: 'none', Link: 'https://github.com/HackerNews/API' },
        { API: 'arXiv', cat: 'research science', Description: 'Academic papers', Auth: 'none', Link: 'https://arxiv.org/help/api' },
        { API: 'GitHub', cat: 'dev code', Description: 'Repos, issues, users', Auth: 'OAuth/none', Link: 'https://docs.github.com/rest' },
        { API: 'npm Registry', cat: 'dev', Description: 'Package metadata', Auth: 'none', Link: 'https://github.com/npm/registry' },
        { API: 'Jupiter', cat: 'crypto solana finance', Description: 'Solana swap aggregator', Auth: 'none', Link: 'https://station.jup.ag/docs/apis' },
        { API: 'Alternative.me F&G', cat: 'crypto finance', Description: 'Fear & Greed index', Auth: 'none', Link: 'https://alternative.me/crypto/fear-and-greed-index' },
        { API: 'ZenQuotes', cat: 'fun quotes', Description: 'Inspirational quotes', Auth: 'none', Link: 'https://zenquotes.io' },
        { API: 'Pollinations', cat: 'ai images', Description: 'Free AI image generation', Auth: 'none', Link: 'https://pollinations.ai' }
      ];
      const q = query.toLowerCase().trim();
      const hits = q ? DIR.filter(e => e.cat.includes(q) || e.API.toLowerCase().includes(q) || e.Description.toLowerCase().includes(q)) : DIR;
      const list = (hits.length ? hits : DIR).slice(0, 8);
      return `Free APIs${q ? ` for "${query}"` : ''}:\n` + list.map(e => `${e.API}: ${e.Description} | Auth: ${e.Auth} | ${e.Link}`).join('\n');
    }
  },

  encode_base64: {
    name: 'encode_base64',
    description: 'Encode any text to Base64',
    schema: { text: 'string — text to encode' },
    execute: async ({ text }) => `Base64: ${Buffer.from(text).toString('base64')}`
  },

  decode_base64: {
    name: 'decode_base64',
    description: 'Decode Base64 string back to plain text',
    schema: { encoded: 'string — Base64 string to decode' },
    execute: async ({ encoded }) => {
      try { return `Decoded: ${Buffer.from(encoded, 'base64').toString('utf8')}` }
      catch { return 'Invalid Base64 string' }
    }
  },

  get_uuid: {
    name: 'get_uuid',
    description: 'Generate unique IDs, tokens, or random strings',
    schema: { count: 'number — how many UUIDs to generate (1-10)' },
    execute: async ({ count = 1 }) => {
      const ids = Array.from({length: Math.min(count, 10)}, () => crypto.randomUUID());
      return ids.join('\n');
    }
  },

  check_password_strength: {
    name: 'check_password_strength',
    description: 'Analyze password strength — length, entropy, suggestions',
    schema: { password: 'string — password to analyze (never stored or logged)' },
    execute: async ({ password }) => {
      if (typeof password !== 'string' || !password) return 'check_password_strength needs a "password" string to analyze (never stored or logged).';
      const checks = {
        length: password.length >= 12,
        uppercase: /[A-Z]/.test(password),
        lowercase: /[a-z]/.test(password),
        numbers: /\d/.test(password),
        symbols: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password),
        notCommon: !['password','123456','qwerty','letmein'].includes(password.toLowerCase())
      };
      const score = Object.values(checks).filter(Boolean).length;
      const rating = score <= 2 ? 'WEAK' : score <= 4 ? 'MODERATE' : score <= 5 ? 'STRONG' : 'VERY STRONG';
      const missing = Object.entries(checks).filter(([,v]) => !v).map(([k]) => k).join(', ');
      const entropy = Math.floor(password.length * Math.log2(
        (/[a-z]/.test(password)?26:0)+(/[A-Z]/.test(password)?26:0)+(/\d/.test(password)?10:0)+(/[^a-zA-Z0-9]/.test(password)?32:0)
      ));
      return `Strength: ${rating} (${score}/6) | Entropy: ~${entropy} bits | Missing: ${missing||'nothing — excellent!'}`;
    }
  },

  grammar_check: {
    name: 'grammar_check',
    description: 'Check text for grammar and spelling errors using LanguageTool (free)',
    schema: { text: 'string — text to check', language: 'string — language code e.g. en-US, es, fr (default: en-US)' },
    execute: async ({ text, language = 'en-US' }) => {
      const body = new URLSearchParams({ text, language });
      const r = await fetch('https://api.languagetool.org/v2/check', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body.toString(), signal: AbortSignal.timeout(25000) });
      const d = await r.json();
      if (!d.matches?.length) return 'No grammar or spelling issues found.';
      return d.matches.slice(0,5).map(m => `Line offset ${m.offset}: "${m.context.text.slice(m.context.offset, m.context.offset+m.context.length)}" — ${m.message}${m.replacements?.[0] ? ' (suggest: '+m.replacements[0].value+')' : ''}`).join('\n');
    }
  },

  get_wikipedia_summary: {
    name: 'get_wikipedia_summary',
    description: 'Get a clean Wikipedia summary paragraph for any topic',
    schema: { topic: 'string — topic to look up' },
    execute: async ({ topic }) => {
      if (!topic || typeof topic !== 'string') return 'get_wikipedia_summary needs a "topic" string.';
      const r = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(topic.replace(/ /g,'_'))}`, { headers: { 'User-Agent': 'SHADDAI/2.0 (https://shaddai.ai)', 'Accept': 'application/json' }, signal: AbortSignal.timeout(10000) });
      if (!r.ok) return `Wikipedia summary unavailable for "${topic}" (HTTP ${r.status}). Try wikipedia_search instead.`;
      let d; try { d = await r.json(); } catch (_) { return `Wikipedia returned a non-JSON response for "${topic}". Try wikipedia_search instead.`; }
      if (d.type === 'https://mediawiki.org/wiki/HyperSwitch/errors/not_found') return `No Wikipedia article found for "${topic}"`;
      return `${d.title}: ${d.extract}`;
    }
  },

  // ── END NEW TOOLS ──────────────────────────────────────────────────────────

  jupiter_quote: {
    name: 'jupiter_quote',
    description: 'Get Jupiter aggregator swap quote for SOL ecosystem. Best-price route across all DEXes.',
    schema: { inputMint: 'string — input token mint address', outputMint: 'string — output token mint', amount: 'number — input amount in atomic units' },
    agents: ['ZEROX'],
    async execute({ inputMint, outputMint, amount }) {
      // SOL = So11111111111111111111111111111111111111112, USDC = EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
      // Jupiter migrated quote-api.jup.ag → lite-api.jup.ag (free tier)
      const qs = `inputMint=${inputMint}&outputMint=${outputMint}&amount=${amount}&slippageBps=50`;
      let d;
      try {
        const r = await http(`https://lite-api.jup.ag/swap/v1/quote?${qs}`);
        d = r.data;
      } catch {
        const r = await http(`https://api.jup.ag/swap/v1/quote?${qs}`);
        d = r.data;
      }
      if (!d || !d.outAmount) return JSON.stringify({ error: 'No route found', detail: d });
      return JSON.stringify({
        inputAmount: d.inAmount,
        outputAmount: d.outAmount,
        priceImpact: d.priceImpactPct + '%',
        route: (d.routePlan || []).map(p => p.swapInfo?.label).join(' → '),
        slippage: '0.50%'
      });
    }
  },

  random_user: {
    name: 'random_user',
    description: 'Generate fake user data for testing (name, email, address). Uses randomuser.me.',
    schema: { count: 'number — how many users (default 1, max 10)' },
    agents: ['NEXUS','TURTLE','QUILL'],
    async execute({ count = 1 }) {
      const r = await http(`https://randomuser.me/api/?results=${Math.min(count, 10)}`);
      const users = r.data.results.map(u => ({
        name: `${u.name.first} ${u.name.last}`,
        email: u.email, phone: u.phone,
        location: `${u.location.city}, ${u.location.country}`,
        username: u.login.username
      }));
      return JSON.stringify(users);
    }
  },

  // ── CRYPTO/FINANCE (54 NEW TOOLS — batch 1: 15 crypto/finance) ────

  dex_price: {
    description: 'Get real-time DEX price for any token via DexScreener. No API key needed.',
    params: ['symbol'],
    execute: async (params) => {
      const q = encodeURIComponent(params.symbol || params.query || 'SOL');
      const r = await fetch(`https://api.dexscreener.com/latest/dex/search/?q=${q}`, { headers: { 'User-Agent': 'SHADDAI/2.0' }, signal: AbortSignal.timeout(10000) });
      const d = await r.json();
      const pairs = (d.pairs || []).slice(0, 5);
      if (!pairs.length) return `No DEX pairs found for ${params.symbol}`;
      return pairs.map(p => `${p.baseToken?.symbol}/${p.quoteToken?.symbol} on ${p.dexId}: $${p.priceUsd} | 24h vol: $${Number(p.volume?.h24||0).toLocaleString()} | Liquidity: $${Number(p.liquidity?.usd||0).toLocaleString()}`).join('\n');
    }
  },

  binance_price: {
    description: 'Get live spot price from Binance. Fastest price data available, no auth needed.',
    params: ['symbol'],
    execute: async (params) => {
      const sym = (params.symbol || 'BTC').toUpperCase().replace('USDT','') + 'USDT';
      const r = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=${sym}`, { signal: AbortSignal.timeout(10000) });
      const d = await r.json();
      if (d.code) return `Binance error: ${d.msg}`;
      return `${sym}: $${Number(d.lastPrice).toLocaleString()} | 24h: ${Number(d.priceChangePercent).toFixed(2)}% | High: $${Number(d.highPrice).toLocaleString()} | Low: $${Number(d.lowPrice).toLocaleString()} | Vol: ${Number(d.volume).toLocaleString()}`;
    }
  },

  binance_orderbook: {
    description: 'Get Binance order book depth to see buy/sell pressure.',
    params: ['symbol'],
    execute: async (params) => {
      const sym = (params.symbol || 'BTC').toUpperCase().replace('USDT','') + 'USDT';
      const r = await fetch(`https://api.binance.com/api/v3/depth?symbol=${sym}&limit=5`, { signal: AbortSignal.timeout(10000) });
      const d = await r.json();
      const bids = (d.bids||[]).map(b => `  Bid: $${b[0]} x ${Number(b[1]).toFixed(4)}`).join('\n');
      const asks = (d.asks||[]).map(a => `  Ask: $${a[0]} x ${Number(a[1]).toFixed(4)}`).join('\n');
      return `${sym} Order Book:\nTop Bids:\n${bids}\nTop Asks:\n${asks}`;
    }
  },

  get_eth_gas: {
    description: 'Get current Ethereum gas price in Gwei (keyless public RPC).',
    params: [],
    execute: async (params) => {
      // Keyless: query a public Ethereum RPC for eth_gasPrice + priority fee
      const rpcs = ['https://ethereum-rpc.publicnode.com', 'https://eth.llamarpc.com', 'https://cloudflare-eth.com'];
      for (const rpc of rpcs) {
        try {
          const call = async (method) => {
            const r = await fetch(rpc, {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params: [] }),
              signal: AbortSignal.timeout(8000)
            });
            const d = await r.json();
            return d.result ? parseInt(d.result, 16) : null;
          };
          const gasWei = await call('eth_gasPrice');
          if (!gasWei) continue;
          const gwei = gasWei / 1e9;
          let prio = null;
          try { const p = await call('eth_maxPriorityFeePerGas'); if (p) prio = p / 1e9; } catch {}
          const slow = (gwei * 0.9).toFixed(2), std = gwei.toFixed(2), fast = (gwei * 1.2).toFixed(2);
          return `ETH Gas Prices (Gwei):\nSlow: ${slow}\nStandard: ${std}\nFast: ${fast}${prio !== null ? `\nPriority fee: ${prio.toFixed(2)}` : ''}`;
        } catch {}
      }
      return 'ETH gas data temporarily unavailable from all RPCs.';
    }
  },

  get_top_gainers: {
    description: 'Get top gaining and losing cryptocurrencies in the last 24 hours.',
    params: ['limit'],
    execute: async (params) => {
      const limit = params.limit || 10;
      const r = await fetch(`https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=${Math.min(limit*2,50)}&page=1&price_change_percentage=24h`, { headers: { 'User-Agent': 'SHADDAI/2.0' }, signal: AbortSignal.timeout(10000) });
      const coins = await r.json();
      if (!Array.isArray(coins)) return 'CoinGecko rate limited. Try again in 60s.';
      const sorted = [...coins].sort((a,b) => (b.price_change_percentage_24h||0) - (a.price_change_percentage_24h||0));
      return 'Top Gainers (24h):\n' + sorted.slice(0,limit).map(c => `${c.symbol.toUpperCase()}: $${c.current_price} (${c.price_change_percentage_24h?.toFixed(2)}%)`).join('\n');
    }
  },

  get_stablecoin_data: {
    description: 'Get stablecoin market cap and peg data from DeFiLlama.',
    params: [],
    execute: async (params) => {
      const r = await fetch('https://stablecoins.llama.fi/stablecoins?includePrices=true', { signal: AbortSignal.timeout(10000) });
      const d = await r.json();
      const stables = (d.peggedAssets || []).slice(0, 8);
      return 'Stablecoin Data:\n' + stables.map(s => `${s.symbol}: $${(s.circulating?.peggedUSD/1e9||0).toFixed(2)}B market cap | Price: $${s.price?.toFixed(4)||'1.00'}`).join('\n');
    }
  },

  get_protocol_revenue: {
    description: 'Get DeFi protocol revenue data from DeFiLlama.',
    params: ['protocol'],
    execute: async (params) => {
      try {
        if (params.protocol) {
          const r = await fetch(`https://api.llama.fi/protocol/${params.protocol}`, { signal: AbortSignal.timeout(12000) });
          const d = await r.json();
          if (!d || !d.name) return `Protocol "${params.protocol}" not found on DeFiLlama`;
          return `${d.name} Revenue: TVL $${(d.tvl/1e9||0).toFixed(2)}B | Category: ${d.category} | Chain: ${d.chain}`;
        }
        const r = await fetch('https://api.llama.fi/protocols', { signal: AbortSignal.timeout(12000) });
        const d = await r.json();
        if (!Array.isArray(d)) return JSON.stringify({ success: false, error: 'Unexpected response from DeFiLlama' });
        return 'Top Protocols by Revenue:\n' + d.slice(0,8).map(p => `${p.name}: $${(p.tvl/1e9).toFixed(2)}B TVL | ${p.category}`).join('\n');
      } catch (e) {
        return JSON.stringify({ success: false, error: e.message });
      }
    }
  },

  get_fear_greed_history: {
    description: 'Get historical Fear & Greed index data (last 7 days).',
    params: [],
    execute: async (params) => {
      const r = await fetch('https://api.alternative.me/fng/?limit=7&format=json', { signal: AbortSignal.timeout(10000) });
      const d = await r.json();
      const entries = (d.data || []).map(e => `${new Date(e.timestamp*1000).toLocaleDateString()}: ${e.value} (${e.value_classification})`);
      return 'Fear & Greed History (7 days):\n' + entries.join('\n');
    }
  },

  calculate_position_size: {
    description: 'Calculate safe position size based on account size and risk percentage.',
    params: ['account_size', 'risk_percent', 'entry_price', 'stop_loss_price'],
    execute: async (params) => {
      const account = Number(params.account_size) || 1000;
      const risk = Number(params.risk_percent) || 1;
      const entry = Number(params.entry_price) || 100;
      const stop = Number(params.stop_loss_price) || 90;
      const riskAmount = account * (risk / 100);
      const riskPerUnit = Math.abs(entry - stop);
      const units = riskAmount / riskPerUnit;
      const positionValue = units * entry;
      return `Position Size Calculator:\nAccount: $${account.toLocaleString()}\nRisk: ${risk}% = $${riskAmount.toFixed(2)}\nEntry: $${entry} | Stop: $${stop}\nRisk per unit: $${riskPerUnit.toFixed(4)}\nUnits to buy: ${units.toFixed(4)}\nPosition value: $${positionValue.toFixed(2)}\nMax loss: $${riskAmount.toFixed(2)}`;
    }
  },

  get_sol_token_info: {
    description: 'Get Solana token info from DexScreener by contract address or symbol.',
    params: ['address'],
    execute: async (params) => {
      const addr = params.address || params.symbol || 'So11111111111111111111111111111111111111112';
      const r = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${addr}`, { headers: { 'User-Agent': 'SHADDAI/2.0' }, signal: AbortSignal.timeout(10000) });
      const d = await r.json();
      const pair = (d.pairs || [])[0];
      if (!pair) return `No data found for ${addr}`;
      return `Token: ${pair.baseToken?.name} (${pair.baseToken?.symbol})\nAddress: ${pair.baseToken?.address}\nPrice: $${pair.priceUsd}\n24h Vol: $${Number(pair.volume?.h24||0).toLocaleString()}\nLiquidity: $${Number(pair.liquidity?.usd||0).toLocaleString()}\nDEX: ${pair.dexId} | Chain: ${pair.chainId}`;
    }
  },

  get_onchain_activity: {
    description: 'Get recent on-chain activity metrics for Solana.',
    params: [],
    execute: async (params) => {
      const r = await fetch('https://api.mainnet-beta.solana.com', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getRecentPerformanceSamples', params: [4] }),
        signal: AbortSignal.timeout(10000)
      });
      const d = await r.json();
      const samples = d.result || [];
      return 'Solana Performance:\n' + samples.map(s => `TPS: ${Math.round(s.numTransactions/s.samplePeriodSecs)} | Slots: ${s.numSlots}`).join('\n');
    }
  },

  get_funding_rates: {
    description: 'Get crypto perpetual futures funding rates from Binance.',
    params: ['symbol'],
    execute: async (params) => {
      const base = (params.symbol || 'BTC').toUpperCase();
      const sym = base + 'USDT';
      // 1) Binance (may be geo-blocked 451 in some regions)
      try {
        const r = await fetch(`https://fapi.binance.com/fapi/v1/fundingRate?symbol=${sym}&limit=5`, { signal: AbortSignal.timeout(8000) });
        const d = await r.json();
        if (Array.isArray(d) && d.length) {
          return `${sym} Funding Rates (Binance, last 5):\n` + d.map(f => `${new Date(f.fundingTime).toLocaleString()}: ${(Number(f.fundingRate)*100).toFixed(4)}%`).join('\n');
        }
      } catch {}
      // 2) Bybit fallback
      try {
        const r = await fetch(`https://api.bybit.com/v5/market/funding/history?category=linear&symbol=${sym}&limit=5`, { signal: AbortSignal.timeout(8000) });
        const d = await r.json();
        const list = d.result?.list || [];
        if (list.length) {
          return `${sym} Funding Rates (Bybit, last ${list.length}):\n` + list.map(f => `${new Date(Number(f.fundingRateTimestamp)).toLocaleString()}: ${(Number(f.fundingRate)*100).toFixed(4)}%`).join('\n');
        }
      } catch {}
      // 3) OKX fallback (current rate only)
      try {
        const r = await fetch(`https://www.okx.com/api/v5/public/funding-rate?instId=${base}-USDT-SWAP`, { signal: AbortSignal.timeout(8000) });
        const d = await r.json();
        const f = d.data?.[0];
        if (f) return `${base}-USDT-SWAP Funding Rate (OKX, current): ${(Number(f.fundingRate)*100).toFixed(4)}% | next: ${new Date(Number(f.nextFundingTime)).toLocaleString()}`;
      } catch {}
      return 'Funding rate data unavailable (Binance/Bybit/OKX all unreachable).';
    }
  },

  get_dominance: {
    description: 'Get Bitcoin and Ethereum market dominance percentages.',
    params: [],
    execute: async (params) => {
      const r = await fetch('https://api.coingecko.com/api/v3/global', { headers: { 'User-Agent': 'SHADDAI/2.0' }, signal: AbortSignal.timeout(10000) });
      const d = await r.json();
      const data = d.data || {};
      return `Market Dominance:\nBTC: ${data.market_cap_percentage?.btc?.toFixed(2)}%\nETH: ${data.market_cap_percentage?.eth?.toFixed(2)}%\nTotal Market Cap: $${(data.total_market_cap?.usd/1e12).toFixed(2)}T\nTotal Volume 24h: $${(data.total_volume?.usd/1e9).toFixed(2)}B`;
    }
  },

  // ── RESEARCH/WEB (10 new) ─────────────────────────────────────────

  fetch_url_clean: {
    description: 'Fetch a URL and extract clean readable text (strips HTML tags and scripts).',
    params: ['url'],
    execute: async (params) => {
      if (!params.url) return 'No URL provided';
      const r = await fetch(params.url, { headers: { 'User-Agent': 'Mozilla/5.0 SHADDAI/2.0' }, signal: AbortSignal.timeout(10000) });
      let html = await r.text();
      html = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
      html = html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
      html = html.replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '');
      html = html.replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '');
      const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      return text.slice(0, 3000) + (text.length > 3000 ? '...' : '');
    }
  },

  get_news_headlines: {
    description: 'Get latest news headlines from multiple sources via RSS.',
    params: ['topic', 'limit'],
    execute: async (params) => {
      const topic = params.topic || 'technology';
      const limit = params.limit || 8;
      const feedUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(topic)}&hl=en-US&gl=US&ceid=US:en`;
      const r = await fetch(feedUrl, { headers: { 'User-Agent': 'SHADDAI/2.0' }, signal: AbortSignal.timeout(10000) });
      const xml = await r.text();
      const titles = [...xml.matchAll(/<title>(.*?)<\/title>/g)].slice(1, limit+1).map(m => m[1].replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>'));
      return `News Headlines — "${topic}":\n` + titles.join('\n');
    }
  },

  get_product_hunt: {
    description: 'Get top products from Product Hunt today.',
    params: ['limit'],
    execute: async (params) => {
      const limit = params.limit || 8;
      try {
        const r = await fetch('https://www.producthunt.com/feed', { headers: { 'User-Agent': 'Mozilla/5.0 SHADDAI/2.0' }, signal: AbortSignal.timeout(10000) });
        const xml = await r.text();
        // Lenient: match CDATA or plain titles, skip the channel title
        const titles = [...xml.matchAll(/<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/g)].slice(1, limit+1).map(m => m[1].trim()).filter(Boolean);
        if (titles.length) return `Product Hunt Today:\n` + titles.map((t,i) => `${i+1}. ${t}`).join('\n');
      } catch {}
      // Fallback: Hacker News Show HN (similar audience — new products/launches)
      try {
        const r = await fetch('https://hn.algolia.com/api/v1/search_by_date?tags=show_hn&hitsPerPage=' + limit, { signal: AbortSignal.timeout(10000) });
        const d = await r.json();
        const hits = d.hits || [];
        if (hits.length) return `Latest Launches (Show HN):\n` + hits.map((h,i) => `${i+1}. ${h.title} (${h.points||0} pts)`).join('\n');
      } catch {}
      return 'Product launch feeds temporarily unavailable.';
    }
  },

  get_github_issues: {
    description: 'Get open issues from any public GitHub repository.',
    params: ['owner', 'repo', 'limit'],
    execute: async (params) => {
      const owner = params.owner || 'vercel';
      const repo = params.repo || 'next.js';
      const limit = params.limit || 8;
      const r = await fetch(`https://api.github.com/repos/${owner}/${repo}/issues?state=open&per_page=${limit}`, { headers: { 'User-Agent': 'SHADDAI/2.0', 'Accept': 'application/vnd.github.v3+json' }, signal: AbortSignal.timeout(10000) });
      const issues = await r.json();
      if (!Array.isArray(issues)) return `Could not fetch issues for ${owner}/${repo}`;
      return `Open Issues — ${owner}/${repo}:\n` + issues.map(i => `#${i.number}: ${i.title} | ${i.comments} comments | ${i.labels?.map(l=>l.name).join(', ')||'no labels'}`).join('\n');
    }
  },

  search_web_ddg: {
    description: 'Search the web using DuckDuckGo instant answers API. No API key needed.',
    params: ['query'],
    execute: async (params) => {
      const q = encodeURIComponent(params.query || '');
      const r = await fetch(`https://api.duckduckgo.com/?q=${q}&format=json&no_html=1&skip_disambig=1`, { headers: { 'User-Agent': 'SHADDAI/2.0' }, signal: AbortSignal.timeout(10000) });
      const d = await r.json();
      const results = [];
      if (d.AbstractText) results.push(`Summary: ${d.AbstractText}`);
      if (d.RelatedTopics) {
        d.RelatedTopics.slice(0,5).forEach(t => { if (t.Text) results.push(t.Text); });
      }
      if (!results.length) return `No DuckDuckGo instant results for "${params.query}". Try search_web for full results.`;
      return `DDG Results — "${params.query}":\n` + results.join('\n');
    }
  },

  get_stackoverflow: {
    description: 'Get top Stack Overflow questions for any programming topic.',
    params: ['tag', 'limit'],
    execute: async (params) => {
      const tag = encodeURIComponent(params.tag || 'javascript');
      const limit = params.limit || 6;
      const r = await fetch(`https://api.stackexchange.com/2.3/questions?order=desc&sort=votes&tagged=${tag}&site=stackoverflow&pagesize=${limit}&filter=withbody`, { signal: AbortSignal.timeout(10000) });
      const d = await r.json();
      const qs = d.items || [];
      return `StackOverflow — "${params.tag}":\n` + qs.map(q => `[${q.score}↑ ${q.answer_count}ans] ${q.title}`).join('\n');
    }
  },

  get_medium_articles: {
    description: 'Get latest Medium articles on any topic via RSS.',
    params: ['topic', 'limit'],
    execute: async (params) => {
      const rawTopic = params.topic || 'artificial-intelligence';
      const topic = encodeURIComponent(rawTopic);
      const limit = params.limit || 6;
      // 1) Medium RSS
      try {
        const r = await fetch(`https://medium.com/feed/tag/${topic}`, { headers: { 'User-Agent': 'Mozilla/5.0 SHADDAI/2.0' }, signal: AbortSignal.timeout(10000) });
        const xml = await r.text();
        let titles = [...xml.matchAll(/<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/g)].slice(1, limit + 1).map(m => m[1].trim()).filter(Boolean);
        if (titles.length) return `Medium articles — "${rawTopic}":\n` + titles.map((t, i) => `${i+1}. ${t}`).join('\n');
      } catch {}
      // 2) dev.to API fallback (keyless, reliable)
      try {
        const tag = String(rawTopic).toLowerCase().replace(/[^a-z0-9]/g, '');
        const r = await fetch(`https://dev.to/api/articles?tag=${tag}&per_page=${limit}`, { headers: { 'User-Agent': 'SHADDAI/2.0' }, signal: AbortSignal.timeout(10000) });
        const arts = await r.json();
        if (Array.isArray(arts) && arts.length) return `Articles on "${rawTopic}" (dev.to):\n` + arts.map((a, i) => `${i+1}. ${a.title} (${a.positive_reactions_count}♥, ${a.comments_count} comments)`).join('\n');
      } catch {}
      return `No articles found for "${rawTopic}" on Medium or dev.to right now.`;
    }
  },

  get_hacker_news_comments: {
    description: 'Get top comments from a Hacker News story.',
    params: ['story_id'],
    execute: async (params) => {
      const id = params.story_id || params.id;
      if (!id) {
        const r = await fetch('https://hacker-news.firebaseio.com/v0/topstories.json', { signal: AbortSignal.timeout(10000) });
        const ids = await r.json();
        const storyId = ids[0];
        const sr = await fetch(`https://hacker-news.firebaseio.com/v0/item/${storyId}.json`, { signal: AbortSignal.timeout(10000) });
        const story = await sr.json();
        return `Top HN Story: ${story.title}\nURL: ${story.url||'(self)'}\nScore: ${story.score} | Comments: ${story.descendants}`;
      }
      const r = await fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`, { signal: AbortSignal.timeout(10000) });
      const d = await r.json();
      const comments = await Promise.all((d.kids||[]).slice(0,5).map(kid => fetch(`https://hacker-news.firebaseio.com/v0/item/${kid}.json`, { signal: AbortSignal.timeout(10000) }).then(r=>r.json())));
      return `HN: ${d.title}\n\nTop Comments:\n` + comments.filter(c=>c.text).map(c => c.text.replace(/<[^>]+>/g,' ').trim().slice(0,200)).join('\n---\n');
    }
  },

  // ── DEV/CODE (8 new) ──────────────────────────────────────────────

  analyze_code_complexity: {
    description: 'Analyze code complexity: count lines, functions, nested depth, and flag issues.',
    params: ['code'],
    execute: async (params) => {
      const code = params.code || '';
      const lines = code.split('\n').length;
      const functions = (code.match(/function\s+\w+|=>\s*\{|async\s+\w+/g) || []).length;
      const nesting = Math.max(...code.split('\n').map(l => (l.match(/^\s+/)||[''])[0].length / 2));
      const todos = (code.match(/TODO|FIXME|HACK|XXX/g) || []).length;
      const longLines = code.split('\n').filter(l => l.length > 100).length;
      return `Code Analysis:\nLines: ${lines}\nFunctions: ${functions}\nMax nesting depth: ${Math.round(nesting)}\nTODOs/FIXMEs: ${todos}\nLong lines (>100 chars): ${longLines}\nComplexity: ${lines < 50 ? 'Low' : lines < 200 ? 'Medium' : 'High'}`;
    }
  },

  generate_uuid: {
    description: 'Generate a UUID v4 (or multiple UUIDs).',
    params: ['count'],
    execute: async (params) => {
      const crypto = require('crypto');
      const count = Math.min(Number(params.count) || 1, 10);
      const uuids = Array.from({length: count}, () => crypto.randomUUID());
      return count === 1 ? uuids[0] : uuids.join('\n');
    }
  },

  validate_json: {
    description: 'Validate JSON string and return structure info or errors.',
    params: ['json_string'],
    execute: async (params) => {
      try {
        const parsed = JSON.parse(params.json_string || params.json || '');
        const keys = typeof parsed === 'object' && parsed !== null ? Object.keys(parsed) : [];
        const type = Array.isArray(parsed) ? 'array' : typeof parsed;
        return `Valid JSON!\nType: ${type}\n${type === 'object' ? `Keys (${keys.length}): ${keys.join(', ')}` : type === 'array' ? `Length: ${parsed.length}` : `Value: ${parsed}`}`;
      } catch (e) {
        return `Invalid JSON: ${e.message}`;
      }
    }
  },

  convert_units: {
    description: 'Convert between units: temperature (C/F/K), length (m/ft/mi/km), weight (kg/lb), data (B/KB/MB/GB).',
    params: ['value', 'from', 'to'],
    execute: async (params) => {
      const val = Number(params.value);
      const from = (params.from || '').toLowerCase();
      const to = (params.to || '').toLowerCase();
      let result;
      if (from === 'c' && to === 'f') result = val * 9/5 + 32;
      else if (from === 'f' && to === 'c') result = (val - 32) * 5/9;
      else if (from === 'c' && to === 'k') result = val + 273.15;
      else if (from === 'k' && to === 'c') result = val - 273.15;
      else if (from === 'm' && to === 'ft') result = val * 3.28084;
      else if (from === 'ft' && to === 'm') result = val / 3.28084;
      else if (from === 'km' && to === 'mi') result = val * 0.621371;
      else if (from === 'mi' && to === 'km') result = val * 1.60934;
      else if (from === 'kg' && to === 'lb') result = val * 2.20462;
      else if (from === 'lb' && to === 'kg') result = val / 2.20462;
      else if (from === 'gb' && to === 'mb') result = val * 1024;
      else if (from === 'mb' && to === 'gb') result = val / 1024;
      else if (from === 'mb' && to === 'kb') result = val * 1024;
      else if (from === 'kb' && to === 'mb') result = val / 1024;
      else return `Unknown conversion: ${from} → ${to}. Supported: C/F/K, m/ft/km/mi, kg/lb, GB/MB/KB`;
      return `${val} ${from.toUpperCase()} = ${result.toFixed(4)} ${to.toUpperCase()}`;
    }
  },

  get_package_info: {
    description: 'Get npm package information: version, description, downloads, dependencies.',
    params: ['package'],
    execute: async (params) => {
      const pkg = params.package || params.name || 'express';
      const r = await fetch(`https://registry.npmjs.org/${pkg}`, { signal: AbortSignal.timeout(10000) });
      const d = await r.json();
      if (d.error) return `Package "${pkg}" not found on npm`;
      const latest = d['dist-tags']?.latest;
      const info = d.versions?.[latest] || {};
      return `npm: ${pkg}\nLatest: ${latest}\nDescription: ${d.description}\nLicense: ${info.license||'unknown'}\nDependencies: ${Object.keys(info.dependencies||{}).length}\nKeywords: ${(d.keywords||[]).join(', ')}`;
    }
  },

  search_github_repos: {
    description: 'Search GitHub for repositories matching a query.',
    params: ['query', 'language', 'limit'],
    execute: async (params) => {
      const q = encodeURIComponent(params.query || 'AI agent');
      const lang = params.language ? `+language:${params.language}` : '';
      const limit = params.limit || 6;
      const r = await fetch(`https://api.github.com/search/repositories?q=${q}${lang}&sort=stars&per_page=${limit}`, { headers: { 'User-Agent': 'SHADDAI/2.0', 'Accept': 'application/vnd.github.v3+json' }, signal: AbortSignal.timeout(10000) });
      const d = await r.json();
      if (!d.items) return 'GitHub search unavailable (rate limited). Try again.';
      return `GitHub Search — "${params.query}":\n` + d.items.map(r => `${r.stargazers_count.toLocaleString()} stars: ${r.full_name} — ${r.description?.slice(0,80)||'no description'}`).join('\n');
    }
  },

  diff_texts: {
    description: 'Compare two texts and show what changed (added/removed lines).',
    params: ['text1', 'text2'],
    execute: async (params) => {
      const a = (params.text1 || '').split('\n');
      const b = (params.text2 || '').split('\n');
      const removed = a.filter(l => !b.includes(l)).map(l => `- ${l}`);
      const added = b.filter(l => !a.includes(l)).map(l => `+ ${l}`);
      const same = a.filter(l => b.includes(l)).length;
      return `Text Diff:\nSame lines: ${same}\nRemoved (${removed.length}):\n${removed.slice(0,10).join('\n')}\nAdded (${added.length}):\n${added.slice(0,10).join('\n')}`;
    }
  },

  // ── AI/GENERATION (8 new) ─────────────────────────────────────────

  run_local_llm: {
    description: 'Send a prompt directly to local Ollama LLM. Free, private, no API key needed.',
    params: ['prompt', 'model', 'system'],
    execute: async (params) => {
      const model = params.model || 'llama3.2:1b';
      const messages = [];
      if (params.system) messages.push({ role: 'system', content: params.system });
      messages.push({ role: 'user', content: params.prompt || params.message || '' });
      try {
        const r = await fetch('http://localhost:11434/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model, messages, stream: false }),
          signal: AbortSignal.timeout(30000)
        });
        const d = await r.json();
        return d.message?.content || 'No response from Ollama';
      } catch (e) {
        return `Ollama unavailable: ${e.message}. Start Ollama with: ollama serve`;
      }
    }
  },

  generate_image_free: {
    description: 'Generate a real AI image using the server-side HuggingFace FLUX.1-schnell key pool. Returns a served URL to the rendered PNG (no client key required).',
    params: ['prompt', 'width', 'height'],
    execute: async (params) => {
      const hf = require('./lib/hf-keys');
      const fs = require('fs');
      const path = require('path');
      const DATA_DIR = path.join(__dirname, '..', 'data');
      const IMG_DIR  = path.join(DATA_DIR, 'agent-images');
      try { fs.mkdirSync(IMG_DIR, { recursive: true }); } catch (_) {}
      const prompt = params.prompt || 'cyberpunk AI agent dashboard';
      if (!hf.keys().length) {
        return JSON.stringify({ success: false, error: 'No HF token configured. Add HF_TOKENS to .env or backend/data/runtime-keys.json.', code: 'NO_KEY' });
      }
      let img;
      try { img = await hf.generate(String(prompt)); }
      catch (e) { return JSON.stringify({ success: false, error: 'Image generation failed: ' + (e && e.message || 'unknown'), code: e && e.code || 'GEN_ERROR' }); }
      const file = 'gen-' + Date.now() + '-' + Math.floor(Math.random() * 1e5) + '.png';
      try { fs.writeFileSync(path.join(IMG_DIR, file), img); }
      catch (e) { return JSON.stringify({ success: false, error: 'Could not save image: ' + (e && e.message || 'unknown') }); }
      const url = '/api/forge/image/' + file;
      const dataUri = 'data:image/png;base64,' + img.toString('base64');
      return JSON.stringify({ success: true, ok: true, provider: 'huggingface-flux', url, dataUri, prompt, note: 'Image saved server-side. Access via ' + url });
    }
  },

  summarize_text: {
    description: 'Extractive summarization of long text — picks the most important sentences. No LLM needed.',
    params: ['text', 'sentences'],
    execute: async (params) => {
      const text = params.text || '';
      const numSentences = Number(params.sentences) || 5;
      const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
      const words = text.toLowerCase().split(/\W+/).filter(w => w.length > 4);
      const wordFreq = {};
      words.forEach(w => { wordFreq[w] = (wordFreq[w]||0) + 1; });
      const scored = sentences.map(s => ({
        text: s.trim(),
        score: s.toLowerCase().split(/\W+/).reduce((sum, w) => sum + (wordFreq[w]||0), 0)
      }));
      scored.sort((a, b) => b.score - a.score);
      const summary = scored.slice(0, numSentences).map(s => s.text).join(' ');
      return `Summary (${numSentences} key sentences from ${sentences.length} total):\n${summary}`;
    }
  },

  extract_entities: {
    description: 'Extract named entities (people, orgs, locations, dates, amounts) from text.',
    params: ['text'],
    execute: async (params) => {
      const text = params.text || '';
      const patterns = {
        prices: text.match(/\$[\d,]+(?:\.\d+)?[KMBTkmbt]?/g) || [],
        percentages: text.match(/\d+(?:\.\d+)?%/g) || [],
        dates: text.match(/\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2}(?:,\s+\d{4})?|\d{1,2}\/\d{1,2}\/\d{2,4}/g) || [],
        urls: text.match(/https?:\/\/[^\s]+/g) || [],
        emails: text.match(/[\w.-]+@[\w.-]+\.\w+/g) || [],
        hashtags: text.match(/#\w+/g) || [],
        numbers: text.match(/\b\d{4,}\b/g) || [],
      };
      const results = Object.entries(patterns)
        .filter(([,v]) => v.length)
        .map(([k,v]) => `${k}: ${v.slice(0,5).join(', ')}`);
      return results.length ? `Entities found:\n${results.join('\n')}` : 'No entities detected in text.';
    }
  },

  generate_mermaid: {
    description: 'Generate a Mermaid diagram definition for flowcharts, sequences, or mind maps.',
    params: ['type', 'description'],
    execute: async (params) => {
      const type = params.type || 'flowchart';
      const desc = params.description || 'User → System → Database → Response';
      const steps = desc.split(/→|->|,/).map(s => s.trim());
      if (type === 'flowchart' || type === 'flow') {
        const nodes = steps.map((s,i) => `  ${String.fromCharCode(65+i)}[${s}]`).join('\n');
        const edges = steps.slice(0,-1).map((_,i) => `  ${String.fromCharCode(65+i)} --> ${String.fromCharCode(65+i+1)}`).join('\n');
        return `\`\`\`mermaid\nflowchart TD\n${nodes}\n${edges}\n\`\`\``;
      }
      if (type === 'sequence') {
        const seqs = steps.slice(0,-1).map((s,i) => `  ${s}->>+${steps[i+1]}: step ${i+1}`).join('\n');
        return `\`\`\`mermaid\nsequenceDiagram\n${seqs}\n\`\`\``;
      }
      return `\`\`\`mermaid\nmindmap\n  root((${steps[0]||'Topic'}))\n${steps.slice(1).map(s=>`    ${s}`).join('\n')}\n\`\`\``;
    }
  },

  detect_language: {
    description: 'Detect the programming language of a code snippet.',
    params: ['code'],
    execute: async (params) => {
      const code = params.code || '';
      const patterns = {
        Python: [/def\s+\w+\s*\(/, /import\s+\w+/, /:\s*$/, /print\s*\(/],
        JavaScript: [/const\s+\w+\s*=/, /function\s+\w+/, /=>\s*\{/, /require\s*\(/],
        TypeScript: [/:\s*string/, /:\s*number/, /interface\s+\w+/, /type\s+\w+\s*=/],
        Rust: [/fn\s+\w+/, /let\s+mut/, /impl\s+\w+/, /use\s+std::/],
        Go: [/func\s+\w+/, /package\s+main/, /import\s+"/, /:=\s/],
        Java: [/public\s+class/, /void\s+main/, /System\.out/, /new\s+\w+\(/],
        SQL: [/SELECT\s+/i, /FROM\s+\w+/i, /WHERE\s+/i, /INSERT\s+INTO/i],
        HTML: [/<html/, /<div/, /<script/, /<style/],
        CSS: [/\{[\s\S]*?:[\s\S]*?\}/, /margin:/, /padding:/, /display:/],
        Solidity: [/pragma\s+solidity/, /contract\s+\w+/, /mapping\s*\(/, /emit\s+\w+/],
      };
      const scores = Object.entries(patterns).map(([lang, pats]) => ({
        lang,
        score: pats.filter(p => p.test(code)).length
      })).filter(s => s.score > 0).sort((a,b) => b.score - a.score);
      if (!scores.length) return 'Language not detected (plain text or unknown)';
      return `Detected: ${scores[0].lang} (confidence: ${Math.round(scores[0].score/Object.values(patterns[scores[0].lang]).length*100)}%)\nOther possibilities: ${scores.slice(1,3).map(s=>s.lang).join(', ')||'none'}`;
    }
  },

  compress_prompt: {
    description: 'Compress a long prompt to use fewer tokens while preserving meaning.',
    params: ['text', 'target_tokens'],
    execute: async (params) => {
      const text = params.text || '';
      const targetTokens = Number(params.target_tokens) || 500;
      const estimatedTokens = Math.round(text.length / 4);
      if (estimatedTokens <= targetTokens) return `Already compact: ~${estimatedTokens} tokens.\n${text}`;
      const sentences = text.match(/[^.!?\n]+[.!?\n]+/g) || [text];
      const words = text.toLowerCase().split(/\W+/).filter(w => w.length > 4);
      const wordFreq = {};
      words.forEach(w => { wordFreq[w] = (wordFreq[w]||0) + 1; });
      const scored = sentences.map(s => ({ text: s, score: s.toLowerCase().split(/\W+/).reduce((sum,w)=>sum+(wordFreq[w]||0),0)/Math.max(s.split(' ').length,1) }));
      scored.sort((a,b) => b.score - a.score);
      let result = '';
      let tokens = 0;
      for (const s of scored) {
        const t = Math.round(s.text.length / 4);
        if (tokens + t > targetTokens) break;
        result += s.text + ' ';
        tokens += t;
      }
      return `Compressed: ~${tokens} tokens (from ~${estimatedTokens}):\n${result.trim()}`;
    }
  },

  generate_code_template: {
    description: 'Generate a code boilerplate template for common patterns.',
    params: ['language', 'pattern'],
    execute: async (params) => {
      const lang = (params.language || 'javascript').toLowerCase();
      const pattern = (params.pattern || 'api').toLowerCase();
      const templates = {
        'javascript:api': `const express = require('express');\nconst app = express();\napp.use(express.json());\n\napp.get('/health', (req, res) => res.json({ ok: true }));\n\napp.listen(3000, () => console.log('API running on port 3000'));`,
        'javascript:tool': `async function myTool(params) {\n  const { input } = params;\n  if (!input) throw new Error('input required');\n  // Your logic here\n  return \`Result: \${input}\`;\n}\nmodule.exports = { myTool };`,
        'python:api': `from flask import Flask, request, jsonify\napp = Flask(__name__)\n\n@app.route('/health')\ndef health():\n    return jsonify({'ok': True})\n\nif __name__ == '__main__':\n    app.run(port=8000)`,
        'python:class': `class MyClass:\n    def __init__(self, name: str):\n        self.name = name\n    \n    def process(self, data: dict) -> dict:\n        return {'result': data, 'source': self.name}`,
        'javascript:recipe': `'my-skill-name': {\n  agent: 'ZEROX',\n  description: 'What this skill does',\n  params: ['symbol'],\n  steps: [\n    { tool: 'fetch_price', params: { symbol: '{{input.symbol}}' } }\n  ],\n  synthesize: 'Summarize the data above in 2 paragraphs.'\n},`,
      };
      const key = `${lang}:${pattern}`;
      return templates[key] || `Template not found for ${lang}:${pattern}.\nAvailable: javascript:api, javascript:tool, javascript:recipe, python:api, python:class`;
    }
  },

  // ── COMMUNICATION/UTILITY (13 new) ───────────────────────────────

  weather_live: {
    description: 'Get live weather for any city using Open-Meteo. Free, no API key needed.',
    params: ['city', 'lat', 'lon'],
    execute: async (params) => {
      let lat = params.lat;
      let lon = params.lon;
      let cityName = params.city || 'New York';
      if (!lat || !lon) {
        const geo = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cityName)}&count=1`, { signal: AbortSignal.timeout(10000) });
        const geoData = await geo.json();
        const loc = geoData.results?.[0];
        if (!loc) return `City "${cityName}" not found.`;
        lat = loc.latitude;
        lon = loc.longitude;
        cityName = `${loc.name}, ${loc.country}`;
      }
      const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true&hourly=relative_humidity_2m,precipitation_probability&timezone=auto`, { signal: AbortSignal.timeout(10000) });
      const d = await r.json();
      const w = d.current_weather;
      const code = {0:'Clear',1:'Mostly Clear',2:'Partly Cloudy',3:'Overcast',45:'Foggy',51:'Light Drizzle',61:'Rain',71:'Snow',80:'Showers',95:'Thunderstorm'};
      return `Weather — ${cityName}:\nTemp: ${w.temperature}°C (${(w.temperature*9/5+32).toFixed(1)}°F)\nCondition: ${code[w.weathercode]||'Unknown'}\nWind: ${w.windspeed} km/h\nTime: ${w.time}`;
    }
  },

  set_agent_room_state: {
    name: 'set_agent_room_state',
    description: 'Update an agent room state (sleeping/idle/working/completed). Persists to backend/data/agent-rooms.json.',
    schema: { agent: 'string — agent name', state: 'string — sleeping|idle|working|completed', mood: 'string — optional mood label' },
    agents: ['SHADDAI','NEXUS','ZEROX','ORACLE','TURTLE','QUILL','PIKADON'],
    execute: async ({ agent, state, mood }) => {
      const fp = require('path').join(__dirname, 'data', 'agent-rooms.json');
      let rooms = {};
      try { rooms = JSON.parse(require('fs').readFileSync(fp, 'utf8')); } catch {}
      rooms[agent] = { ...(rooms[agent]||{}), state: state || 'idle', mood: mood || '', updatedAt: new Date().toISOString() };
      require('fs').writeFileSync(fp, JSON.stringify(rooms, null, 2));
      return `Room state set: ${agent} → ${state}${mood?' ('+mood+')':''}`;
    }
  },

  save_room_layout: {
    name: 'save_room_layout',
    description: 'Save an agent room layout (placed collectible IDs). Max 5 items per room.',
    schema: { agent: 'string', items: 'array of collectible IDs (max 5)' },
    agents: ['SHADDAI','TURTLE','NEXUS','ZEROX','ORACLE','QUILL','PIKADON'],
    execute: async ({ agent, items }) => {
      const fp = require('path').join(__dirname, 'data', 'agent-rooms.json');
      let rooms = {};
      try { rooms = JSON.parse(require('fs').readFileSync(fp, 'utf8')); } catch {}
      const list = Array.isArray(items) ? items.slice(0, 5) : [];
      rooms[agent] = { ...(rooms[agent]||{}), items: list, updatedAt: new Date().toISOString() };
      require('fs').writeFileSync(fp, JSON.stringify(rooms, null, 2));
      return `Saved ${list.length} items in ${agent}'s room`;
    }
  },

  get_agent_mood: {
    name: 'get_agent_mood',
    description: 'Read an agent room state and mood from persistent storage.',
    schema: { agent: 'string — agent name' },
    agents: ['SHADDAI','ORACLE','NEXUS','ZEROX','TURTLE','QUILL','PIKADON'],
    execute: async ({ agent }) => {
      const fp = require('path').join(__dirname, 'data', 'agent-rooms.json');
      let rooms = {};
      try { rooms = JSON.parse(require('fs').readFileSync(fp, 'utf8')); } catch {}
      const r = rooms[agent];
      if (!r) return `${agent} room: idle (no state recorded yet)`;
      const ageMin = (Date.now() - new Date(r.updatedAt).getTime()) / 60000;
      const effectiveState = ageMin > 30 && r.state !== 'working' ? 'sleeping' : r.state;
      return `${agent} room: ${effectiveState}${r.mood?' ('+r.mood+')':''} | items: ${(r.items||[]).length}/5 | last activity ${Math.round(ageMin)}m ago`;
    }
  },

  create_skill_pack: {
    name: 'create_skill_pack',
    description: 'Create a new skill pack with custom system prompt for an agent. Saves to backend/data/skill-packs.json.',
    schema: { name: 'string', author: 'string', target_agent: 'string — agent name', system_prompt: 'string', price_credits: 'number', tools: 'array of tool names' },
    agents: ['SHADDAI','NEXUS','QUILL','TURTLE'],
    execute: async ({ name, author, target_agent, system_prompt, price_credits, tools }) => {
      const fp = require('path').join(__dirname, 'data', 'skill-packs.json');
      let packs = [];
      try { packs = JSON.parse(require('fs').readFileSync(fp, 'utf8')); } catch {}
      const pack = {
        id: 'pack-' + Date.now().toString(36),
        name: name || 'Untitled Pack',
        author: author || 'anonymous',
        target_agent: target_agent || 'SHADDAI',
        system_prompt: system_prompt || '',
        price_credits: Number(price_credits) || 0,
        tools: Array.isArray(tools) ? tools : [],
        purchases: 0,
        rating: 0,
        createdAt: new Date().toISOString()
      };
      packs.push(pack);
      require('fs').writeFileSync(fp, JSON.stringify(packs, null, 2));
      return `Skill pack created: ${pack.name} (ID: ${pack.id}) by ${pack.author} — ${pack.price_credits} credits, targets ${pack.target_agent}`;
    }
  },

  list_skill_packs: {
    name: 'list_skill_packs',
    description: 'List all available skill packs in the marketplace. Optionally filter by target agent.',
    schema: { target_agent: 'string — optional agent filter' },
    agents: ['SHADDAI','NEXUS','ZEROX','ORACLE','TURTLE','QUILL','PIKADON'],
    execute: async ({ target_agent }) => {
      const fp = require('path').join(__dirname, 'data', 'skill-packs.json');
      let packs = [];
      try { packs = JSON.parse(require('fs').readFileSync(fp, 'utf8')); } catch {}
      const filtered = target_agent ? packs.filter(p => p.target_agent === target_agent) : packs;
      if (!filtered.length) return target_agent ? `No skill packs found for ${target_agent}` : 'No skill packs in marketplace yet';
      return `Skill Packs (${filtered.length}):\n` + filtered.map(p => `[${p.id}] ${p.name} — ${p.target_agent} | ${p.price_credits} credits | ⭐${p.rating}/5 | ${p.purchases} sold | by ${p.author}`).join('\n');
    }
  },

  install_skill_pack: {
    name: 'install_skill_pack',
    description: 'Purchase and install a skill pack — applies its system prompt override to the target agent. Tracks installations.',
    schema: { pack_id: 'string — skill pack ID', user: 'string — installer name/wallet' },
    agents: ['SHADDAI','NEXUS','ZEROX','ORACLE','TURTLE','QUILL','PIKADON'],
    execute: async ({ pack_id, user }) => {
      const fp = require('path').join(__dirname, 'data', 'skill-packs.json');
      const installsPath = require('path').join(__dirname, 'data', 'skill-installs.json');
      let packs = [];
      try { packs = JSON.parse(require('fs').readFileSync(fp, 'utf8')); } catch {}
      const pack = packs.find(p => p.id === pack_id);
      if (!pack) return `Skill pack "${pack_id}" not found`;
      pack.purchases = (pack.purchases || 0) + 1;
      let installs = {};
      try { installs = JSON.parse(require('fs').readFileSync(installsPath, 'utf8')); } catch {}
      const userKey = user || 'guest';
      installs[userKey] = installs[userKey] || [];
      if (!installs[userKey].includes(pack_id)) installs[userKey].push(pack_id);
      require('fs').writeFileSync(fp, JSON.stringify(packs, null, 2));
      require('fs').writeFileSync(installsPath, JSON.stringify(installs, null, 2));
      return `Installed "${pack.name}" → ${pack.target_agent} for ${user}. Total purchases: ${pack.purchases}. Use this skill pack by setting agent system_prompt override.`;
    }
  },

  run_workflow_chain: {
    name: 'run_workflow_chain',
    description: 'Run a multi-step workflow chain. Each step is {agent, goal}. Output of step N is fed as context to step N+1.',
    schema: { steps: 'array of {agent: string, goal: string} objects', stopOnFail: 'boolean — default false' },
    agents: ['SHADDAI'],
    execute: async ({ steps, stopOnFail }) => {
      if (!Array.isArray(steps) || !steps.length) return 'No workflow steps provided';
      const fp = require('path').join(__dirname, 'data', 'workflow-runs.json');
      let runs = [];
      try { runs = JSON.parse(require('fs').readFileSync(fp, 'utf8')); } catch {}
      const runId = 'wf-' + Date.now().toString(36);
      const record = { id: runId, steps: steps.length, startedAt: new Date().toISOString(), status: 'queued' };
      runs.push(record);
      require('fs').writeFileSync(fp, JSON.stringify(runs.slice(-100), null, 2));
      return `Workflow chain queued: ${runId} (${steps.length} steps). Use the autonomous endpoint POST /api/agent/autonomous with the steps array to execute.`;
    }
  },

  geocode_address: {
    name: 'geocode_address',
    description: 'Geocode any place/address to coordinates via OpenStreetMap Nominatim (free, no key).',
    schema: { query: 'string — address or place name, e.g. "Eiffel Tower" or "Tokyo, Japan"' },
    agents: ['ORACLE','NEXUS','SHADDAI'],
    execute: async ({ query }) => {
      if (!query) return 'No address/place provided';
      const r = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1&addressdetails=1`,
        { headers: { 'User-Agent': 'SHADDAI-Agent/2.0 (contact@shaddai.ai)' }, signal: AbortSignal.timeout(10000) });
      const d = await r.json();
      if (!Array.isArray(d) || !d.length) return `No location found for "${query}"`;
      const p = d[0];
      return `${p.display_name}\nLat: ${p.lat}, Lon: ${p.lon}\nType: ${p.type || p.class || 'place'}`;
    }
  },

  get_forex_rate: {
    name: 'get_forex_rate',
    description: 'Live fiat currency exchange rates from Frankfurter (ECB data, free, no key, very reliable).',
    schema: { from: 'string — base currency code e.g. USD', to: 'string — target code(s) e.g. EUR or "EUR,GBP,JPY"', amount: 'number — optional amount to convert' },
    agents: ['ZEROX','ORACLE','SHADDAI'],
    execute: async ({ from = 'USD', to = 'EUR', amount }) => {
      const base = String(from).toUpperCase();
      const targets = String(to).toUpperCase();
      const amt = Number(amount) || 1;
      const r = await fetch(`https://api.frankfurter.app/latest?base=${base}&symbols=${targets}&amount=${amt}`, { signal: AbortSignal.timeout(10000) });
      const d = await r.json();
      if (!d.rates) return `Forex unavailable for ${base}→${targets}`;
      const lines = Object.entries(d.rates).map(([k, v]) => `${amt} ${base} = ${v} ${k}`);
      return `Forex rates (${d.date}):\n${lines.join('\n')}`;
    }
  },

  get_crypto_backup: {
    name: 'get_crypto_backup',
    description: 'Crypto price from CoinPaprika (free, no key) — resilient backup when CoinGecko rate-limits.',
    schema: { symbol: 'string — coin symbol or name e.g. BTC, ETH, SOL' },
    agents: ['ZEROX','ORACLE','SHADDAI'],
    execute: async ({ symbol = 'BTC' }) => {
      const map = { BTC: 'btc-bitcoin', ETH: 'eth-ethereum', SOL: 'sol-solana', BNB: 'bnb-binance-coin', XRP: 'xrp-xrp', ADA: 'ada-cardano', DOGE: 'doge-dogecoin', AVAX: 'avax-avalanche', LINK: 'link-chainlink', MATIC: 'matic-polygon' };
      const sym = String(symbol).toUpperCase();
      let id = map[sym];
      if (!id) {
        // resolve via coin list
        try {
          const lr = await fetch('https://api.coinpaprika.com/v1/coins', { signal: AbortSignal.timeout(10000) });
          const coins = await lr.json();
          const hit = (coins || []).find(c => c.symbol === sym && c.is_active) || (coins || []).find(c => c.symbol === sym);
          id = hit && hit.id;
        } catch {}
      }
      if (!id) return `Unknown symbol "${sym}" on CoinPaprika`;
      const r = await fetch(`https://api.coinpaprika.com/v1/tickers/${id}`, { signal: AbortSignal.timeout(10000) });
      const d = await r.json();
      const q = d.quotes?.USD;
      if (!q) return `No data for ${sym}`;
      return `${d.name} (${d.symbol}) — CoinPaprika\nPrice: $${q.price?.toLocaleString(undefined,{maximumFractionDigits:6})}\n24h: ${q.percent_change_24h}%\nMarket Cap: $${(q.market_cap/1e9).toFixed(2)}B\nRank: #${d.rank}`;
    }
  },

  pay_api_call: {
    name: 'pay_api_call',
    description: 'Pay-per-use API call via pay.sh (Solana). GUARDED: per-call cap, daily budget, and human approval above a threshold. Spends real money — use only when a free tool cannot do the job.',
    schema: {
      url: 'string — pay.sh service URL or FQN to call',
      method: 'string — GET/POST (default GET)',
      body: 'object — optional request body',
      est_cost_usd: 'number — your best estimate of the call cost in USD (for pre-checks)'
    },
    agents: ['SHADDAI','ZEROX','ORACLE','NEXUS'],
    execute: async ({ url, method, body, est_cost_usd }) => {
      if (!payGuard) return 'pay.sh guard not available.';
      const r = await payGuard.guardedCall({ url, method, body, est_cost_usd });
      if (r.pending) return `PAYMENT PENDING APPROVAL — ${r.reason} (approval_id: ${r.approval_id})`;
      if (r.refused) return `PAYMENT REFUSED — ${r.reason}`;
      if (!r.ok) return `pay.sh error — ${r.reason}`;
      return `Paid API result (cost $${r.cost_usd}, spent today $${r.spent_today}/${r.daily_budget}):\n${r.output}`;
    }
  },

  remember_fact: {
    description: 'Save a fact or result to agent memory for future use (persists across sessions).',
    params: ['key', 'value', 'agent'],
    execute: async (params) => {
      const memoryPath = require('path').join(__dirname, 'data', 'agent-memory.json');
      let memory = {};
      try { memory = JSON.parse(require('fs').readFileSync(memoryPath, 'utf8')); } catch {}
      const key = `${params.agent||'global'}:${params.key||'fact'}`;
      memory[key] = { value: params.value, savedAt: new Date().toISOString(), agent: params.agent||'global' };
      require('fs').writeFileSync(memoryPath, JSON.stringify(memory, null, 2));
      return `Saved to memory: "${params.key}" = "${params.value}"`;
    }
  },

  recall_memory: {
    description: 'Retrieve a previously saved fact from agent memory.',
    params: ['key', 'agent'],
    execute: async (params) => {
      const memoryPath = require('path').join(__dirname, 'data', 'agent-memory.json');
      let memory = {};
      try { memory = JSON.parse(require('fs').readFileSync(memoryPath, 'utf8')); } catch { return 'No memory stored yet.'; }
      const key = `${params.agent||'global'}:${params.key||''}`;
      if (params.key) {
        const entry = memory[key] || memory[`global:${params.key}`];
        if (!entry) return `No memory found for key "${params.key}"`;
        return `Memory: "${params.key}" = "${entry.value}" (saved ${entry.savedAt})`;
      }
      const entries = Object.entries(memory).filter(([k]) => !params.agent || k.startsWith(params.agent+':')).slice(0,10);
      return entries.length ? 'Memory entries:\n' + entries.map(([k,v]) => `${k}: ${v.value}`).join('\n') : 'No memories found.';
    }
  },

  post_webhook: {
    description: 'Send data to any HTTP webhook URL via POST.',
    params: ['url', 'data', 'method'],
    execute: async (params) => {
      if (!params.url) return 'No webhook URL provided';
      const method = params.method || 'POST';
      const body = typeof params.data === 'string' ? params.data : JSON.stringify(params.data || {});
      const r = await fetch(params.url, {
        method,
        headers: { 'Content-Type': 'application/json', 'User-Agent': 'SHADDAI/2.0' },
        body: method !== 'GET' ? body : undefined,
        signal: AbortSignal.timeout(10000)
      });
      return `Webhook ${method} ${params.url}: ${r.status} ${r.statusText}`;
    }
  },

  send_telegram: {
    description: 'Send a Telegram message via bot. Requires TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID env vars.',
    params: ['message', 'chat_id'],
    execute: async (params) => {
      const token = process.env.TELEGRAM_BOT_TOKEN;
      if (!token) return 'TELEGRAM_BOT_TOKEN not set in .env';
      const chatId = params.chat_id || process.env.TELEGRAM_CHAT_ID;
      if (!chatId) return 'No chat_id provided and TELEGRAM_CHAT_ID not set';
      const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: params.message || params.text || '', parse_mode: 'Markdown' }),
        signal: AbortSignal.timeout(10000)
      });
      const d = await r.json();
      return d.ok ? `Telegram message sent to ${chatId}` : `Telegram error: ${d.description}`;
    }
  },

  create_github_issue: {
    description: 'Create a GitHub issue in any repository. Requires GITHUB_TOKEN env var.',
    params: ['owner', 'repo', 'title', 'body', 'labels'],
    execute: async (params) => {
      const token = process.env.GITHUB_TOKEN;
      if (!token) return 'GITHUB_TOKEN not set in .env';
      const r = await fetch(`https://api.github.com/repos/${params.owner}/${params.repo}/issues`, {
        method: 'POST',
        headers: { 'Authorization': `token ${token}`, 'Content-Type': 'application/json', 'User-Agent': 'SHADDAI/2.0' },
        body: JSON.stringify({ title: params.title, body: params.body||'', labels: params.labels ? params.labels.split(',').map(l=>l.trim()) : [] }),
        signal: AbortSignal.timeout(10000)
      });
      const d = await r.json();
      if (d.html_url) return `Issue created: ${d.html_url}`;
      return `GitHub error: ${d.message}`;
    }
  },

  get_trending_topics: {
    description: 'Get trending topics from multiple sources: GitHub, HackerNews, Reddit.',
    params: ['source'],
    execute: async (params) => {
      const source = params.source || 'all';
      const results = [];
      // Each source isolated — one failing source never kills the whole tool.
      if (source === 'all' || source === 'hn') {
        try {
          const r = await fetch('https://hacker-news.firebaseio.com/v0/topstories.json', { signal: AbortSignal.timeout(10000) });
          const ids = (await r.json()).slice(0, 5);
          const stories = await Promise.all(ids.map(id => fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`, { signal: AbortSignal.timeout(8000) }).then(r => r.json()).catch(() => null)));
          results.push('HackerNews Top:\n' + stories.filter(Boolean).map(s => `  - ${s.title}`).join('\n'));
        } catch {}
      }
      if (source === 'all' || source === 'github') {
        try {
          const r = await fetch('https://api.github.com/search/repositories?q=created:>2024-01-01&sort=stars&order=desc&per_page=5', { headers: { 'User-Agent': 'SHADDAI/2.0', 'Accept': 'application/vnd.github.v3+json' }, signal: AbortSignal.timeout(10000) });
          const d = await r.json();
          if (Array.isArray(d.items)) results.push('Trending GitHub repos:\n' + d.items.map(x => `  - ${x.full_name} (${x.stargazers_count.toLocaleString()}★)`).join('\n'));
        } catch {}
      }
      if (source === 'reddit') {
        // Reddit-only requested — reuse the resilient reddit tool path
        try { results.push(await TOOLS.get_reddit_posts.execute({ subreddit: 'technology' })); } catch {}
      }
      return results.length ? results.join('\n\n') : 'Trending sources temporarily unavailable.';
    }
  },

  format_as_table: {
    description: 'Format JSON array data as a readable ASCII table.',
    params: ['data', 'columns'],
    execute: async (params) => {
      let data;
      try { data = typeof params.data === 'string' ? JSON.parse(params.data) : params.data; } catch { return 'Invalid JSON data for table'; }
      if (!Array.isArray(data) || !data.length) return 'No array data provided';
      const cols = params.columns ? params.columns.split(',').map(c=>c.trim()) : Object.keys(data[0]).slice(0,5);
      const widths = cols.map(c => Math.max(c.length, ...data.map(r => String(r[c]||'').length)));
      const header = cols.map((c,i) => c.padEnd(widths[i])).join(' | ');
      const divider = widths.map(w => '-'.repeat(w)).join('-+-');
      const rows = data.slice(0,20).map(row => cols.map((c,i) => String(row[c]||'').padEnd(widths[i])).join(' | '));
      return [header, divider, ...rows].join('\n');
    }
  },

};

// ── Normalize tool definitions ───────────────────────────────────────────
// Older tools use { description, params: ['k'], execute } without `name`/`schema`.
// The LLM tool prompt renders `[TOOL:${t.name}:${JSON.stringify(t.schema)}]`, so
// missing fields produce an uncallable `[TOOL:undefined:undefined]`. Backfill
// `name` from the object key and `schema` from the `params` array so EVERY tool
// advertises itself correctly to the LLM.
for (const [key, tool] of Object.entries(TOOLS)) {
  if (!tool || typeof tool !== 'object') continue;
  if (!tool.name) tool.name = key;
  if (!tool.schema) {
    if (Array.isArray(tool.params) && tool.params.length) {
      tool.schema = {};
      for (const p of tool.params) tool.schema[p] = 'string';
    } else {
      tool.schema = {};
    }
  }
}

// Helper for read_obsidian_skill
function findSkillFile(dir, skillName) {
  try {
    const files = fs.readdirSync(dir, { withFileTypes: true });
    for (const f of files) {
      const fp = path.join(dir, f.name);
      if (f.isDirectory()) {
        if (f.name === skillName) {
          const skillMd = path.join(fp, 'SKILL.md');
          if (fs.existsSync(skillMd)) return skillMd;
        }
        const sub = findSkillFile(fp, skillName);
        if (sub) return sub;
      } else if (f.name === skillName + '.md') return fp;
    }
  } catch {}
  return null;
}

// ═══════════════════════════════════════════════════════════════════
// AGENT DEFINITIONS — 7 agents with upgraded tool grants
// ═══════════════════════════════════════════════════════════════════

// Merge the free, no-key extra tools (SHADDAI_MEGA_BUILD_SPEC §2) into the registry.
try { Object.assign(TOOLS, require('./extra-tools')); console.log('[ENGINE] extra-tools merged:', Object.keys(require('./extra-tools')).length); } catch (e) { console.warn('[ENGINE] extra-tools failed:', e.message); }

const AGENTS = {
  SHADDAI: {
    name: 'SHADDAI', role: 'Supreme Commander', port: 8000,
    goal: 'Coordinate ALL agents. Delegate sub-tasks to specialists via delegate_to_agent. Deliver executive synthesis.',
    tools: ['delegate_to_agent','fetch_price','get_fear_greed','get_global_market','search_web','wikipedia_search','get_wikipedia_summary','get_weather','calculate','count_tokens','write_file','save_to_inbox','save_memory','get_memory','run_js','post_discord','read_obsidian_skill','translate_text','hash_text','random_user','get_uuid','get_random_quote','get_history_today','compress_prompt','run_local_llm','remember_fact','recall_memory','format_as_table','summarize_text','mint_collectible','list_open_jobs','complete_job','set_agent_room_state','save_room_layout','get_agent_mood','create_skill_pack','list_skill_packs','install_skill_pack','run_workflow_chain','pay_api_call','geocode_address','get_forex_rate','get_crypto_backup'],
    keywords: ['plan','coordinate','overview','strategy','all agents','orchestrate','manage','what should','help me','summary','delegate','remember','recall','compress','room','mood','workflow','chain','skill pack']
  },
  NEXUS: {
    name: 'NEXUS', role: 'Technical Architect', port: 8003, preferredProvider: 'openrouter',
    goal: 'Build and review code. Design APIs. Solve technical problems. Ship working solutions.',
    tools: ['delegate_to_agent','run_js','run_python','write_file','read_file','list_files','search_web','wikipedia_search','get_github_repo','get_github_trending','search_npm','check_security','calculate','count_tokens','hash_text','base64_codec','encode_base64','decode_base64','regex_test','markdown_to_html','random_user','save_to_inbox','save_memory','get_memory','read_obsidian_skill','check_port','get_public_apis','get_uuid','get_arxiv_papers','grammar_check','analyze_code_complexity','validate_json','convert_units','get_package_info','search_github_repos','diff_texts','generate_uuid','generate_code_template','format_as_table','generate_mermaid','run_local_llm','list_open_jobs','bid_on_job','complete_job','pay_api_call','geocode_address'],
    keywords: ['code','build','api','backend','function','refactor','debug','script','implement','architecture','npm','package','python','javascript','node','github','repo','bug','test','lint','regex','hash','port','encode','decode','diagram','mermaid','json','validate','complexity','template']
  },
  ZEROX: {
    name: 'ZEROX', role: 'Wealth & Revenue Engine', port: 8001, preferredProvider: 'groq',
    goal: 'Analyze markets, track prices, spot opportunities. Deliver actionable financial intelligence.',
    tools: ['fetch_price','get_fear_greed','get_trending','get_ohlcv','get_global_market','get_token_info','whale_scan','get_defi_tvl','get_sol_balance','get_eth_balance','get_exchange_rates','jupiter_quote','get_nft_floor','get_stock_quote','get_crypto_news','get_gas_price','calculate','analyze_sentiment','extract_keywords','save_to_inbox','save_memory','get_memory','read_obsidian_skill','dex_price','binance_price','binance_orderbook','get_eth_gas','get_top_gainers','get_stablecoin_data','get_protocol_revenue','get_fear_greed_history','calculate_position_size','get_sol_token_info','get_onchain_activity','get_funding_rates','get_dominance','format_as_table','mint_collectible','list_collectible','browse_listings','list_open_jobs','bid_on_job','complete_job','execute_trade','pay_api_call','get_forex_rate','get_crypto_backup'],
    keywords: ['price','market','crypto','trading','whale','revenue','finance','coin','token','sol','btc','eth','defi','tvl','wallet','balance','exchange','rate','profit','invest','swap','jupiter','stock','nft','gas','news','dominance','funding','stablecoin','orderbook']
  },
  ORACLE: {
    name: 'ORACLE', role: 'Research & Intelligence', port: 8002, preferredProvider: 'openrouter',
    goal: 'Research any topic deeply. Synthesize data. Produce intelligence briefs.',
    tools: ['search_web','wikipedia_search','get_wikipedia_summary','fetch_url','screenshot_url','get_hackernews','get_rss_feed','get_reddit_posts','get_arxiv_papers','fetch_price','get_fear_greed','get_github_trending','get_weather','weather_live','get_country_info','get_ip_info','get_history_today','get_moon_phase','get_timezone','analyze_sentiment','extract_keywords','count_tokens','format_data','translate_text','save_to_inbox','save_memory','get_memory','read_obsidian_skill','fetch_url_clean','get_news_headlines','get_product_hunt','get_github_issues','search_web_ddg','get_stackoverflow','get_medium_articles','get_hacker_news_comments','get_trending_topics','get_word_definition','detect_language','summarize_text','extract_entities','format_as_table','browse_listings','list_open_jobs','bid_on_job','complete_job','pay_api_call','geocode_address','get_forex_rate','get_crypto_backup'],
    keywords: ['research','analyze','investigate','find','news','trends','intelligence','report','data','what is','who is','explain','summarize','brief','translate','keywords','reddit','arxiv','country','history','timezone','medium','stackoverflow','product hunt','word','definition','language']
  },
  TURTLE: {
    name: 'TURTLE', role: 'UI/UX & Creative', port: 8004,
    goal: 'Create beautiful designs, images, UI components, and creative content.',
    tools: ['generate_image','screenshot_url','markdown_to_html','write_file','search_web','wikipedia_search','get_wikipedia_summary','get_color_palette','get_qr_code','shorten_url','get_random_quote','get_joke','random_user','save_to_inbox','read_obsidian_skill','generate_image_free','generate_mermaid','format_as_table','list_open_jobs','complete_job'],
    keywords: ['design','ui','image','create','generate image','visual','creative','art','logo','banner','style','color','palette','mockup','prototype','screenshot','html','qr','quote','diagram','mermaid','free image']
  },
  QUILL: {
    name: 'QUILL', role: 'Writing & Communication', port: 8005,
    goal: 'Write compelling content: tweets, threads, docs, emails, blogs, copy. Always save output to file.',
    tools: ['write_file','read_file','search_web','wikipedia_search','get_wikipedia_summary','get_hackernews','get_rss_feed','get_reddit_posts','get_random_quote','grammar_check','analyze_sentiment','extract_keywords','count_tokens','format_data','markdown_to_html','translate_text','post_discord','regex_test','shorten_url','save_to_inbox','save_memory','read_obsidian_skill','summarize_text','extract_entities','get_trending_topics','post_webhook','send_telegram','create_github_issue','detect_language','format_as_table','get_news_headlines','list_collectible','list_open_jobs','complete_job'],
    keywords: ['write','tweet','blog','email','thread','document','copy','caption','post','draft','article','announce','letter','report','content','translate','summarize','grammar','check','telegram','webhook','trending','entities']
  },
  PIKADON: {
    name: 'PIKADON', role: 'Security & Compliance', port: 8008,
    goal: 'Audit code for vulnerabilities. Find security issues. Protect the system.',
    tools: ['check_security','check_password_strength','read_file','list_files','search_web','wikipedia_search','get_ip_info','check_port','get_sol_balance','get_eth_balance','calculate','hash_text','base64_codec','encode_base64','decode_base64','regex_test','save_to_inbox','read_obsidian_skill','validate_json','analyze_code_complexity','diff_texts','post_webhook','create_github_issue','list_open_jobs','complete_job'],
    keywords: ['security','audit','vulnerability','hack','exploit','owasp','scan','review','compliance','protect','safe','risk','threat','pentest','password','port','ip','domain','json','validate','complexity']
  }
};

// Prune confirmed-flaky tools from agents + grant each agent its new working extra-tools (§2).
(function(){
  const FLAKY = ['get_color_palette','get_country_info','get_funding_rates','weather_live','get_crypto_news','get_ohlcv','get_protocol_revenue','grammar_check'];
  const EXTRA = {
    ORACLE: ['semantic_scholar_search','wayback_snapshot','open_library_search','hn_algolia_search','coingecko_trending','rss_fetch','get_iss_location','get_space_launches','get_public_holidays','get_trivia_questions','gutenberg_search','random_fact','get_horoscope'],
    ZEROX:  ['defillama_tvl','defillama_yields','coingecko_trending','jupiter_token_price','svg_chart','get_btc_fees','convert_currency'],
    NEXUS:  ['npm_package_info','bundlephobia_size','cve_lookup','semantic_scholar_search','svg_chart','github_user_info','http_headers','json_to_csv','csv_to_json','generate_password'],
    TURTLE: ['svg_chart','color_palette','font_pairing','tweet_thread','color_contrast_check','word_synonyms'],
    QUILL:  ['readability_score','tweet_thread','rss_fetch','open_library_search','font_pairing','word_synonyms','slugify','random_fact','gutenberg_search','json_to_csv','csv_to_json'],
    PIKADON:['cve_lookup','wayback_snapshot','dns_lookup','rdap_domain','http_headers','generate_password','color_contrast_check'],
    SHADDAI:['semantic_scholar_search','npm_package_info','defillama_tvl','svg_chart','get_iss_location','convert_currency','github_user_info']
  };
  for (const [nm, a] of Object.entries(AGENTS)) {
    if (Array.isArray(a.tools)) {
      a.tools = a.tools.filter(t => !FLAKY.includes(t));
      (EXTRA[nm] || []).forEach(t => { if (TOOLS[t] && !a.tools.includes(t)) a.tools.push(t); });
    }
  }
})();

// ═══════════════════════════════════════════════════════════════════
// WORKFLOW TEMPLATES — Battle-tested multi-agent flows
// Pattern: CrewAI Crew with sequential tasks, MetaGPT team workflows
// ═══════════════════════════════════════════════════════════════════

const WORKFLOW_TEMPLATES = {
  'market-brief': {
    name: 'Daily Market Brief',
    description: 'ZEROX gets prices → ORACLE finds news → QUILL writes brief',
    steps: [
      { agent: 'ZEROX', goal: 'Get current BTC, ETH, SOL prices, the Fear & Greed Index, and top 5 trending coins.' },
      { agent: 'ORACLE', goal: 'Find the top 3 crypto news headlines from today. Use search_web with query "crypto news today" and get_hackernews.' },
      { agent: 'QUILL', goal: 'Write a 3-paragraph daily crypto market brief using the data above. Include prices, sentiment, and news. Save to file as market-brief.md.' }
    ]
  },
  'security-audit': {
    name: 'Full Security Audit',
    description: 'PIKADON audits code → NEXUS proposes fixes → QUILL documents',
    steps: [
      { agent: 'PIKADON', goal: 'Use list_files to find recent code files in generated-output. Read each one with read_file. Run check_security on every file. Produce a vulnerability report with severity scores.' },
      { agent: 'NEXUS', goal: 'For each vulnerability found above, propose a specific code fix. Be concrete with before/after code.' },
      { agent: 'QUILL', goal: 'Write a clean security audit report combining the findings and fixes above. Format as markdown with severity badges. Save as security-audit-report.md.' }
    ]
  },
  'research-report': {
    name: 'Deep Research Report',
    description: 'ORACLE researches → ORACLE analyzes → QUILL writes report',
    steps: [
      { agent: 'ORACLE', goal: '{{INPUT}} — use search_web, wikipedia_search, and get_rss_feed to gather facts from 3+ sources.' },
      { agent: 'ORACLE', goal: 'Analyze the research above. Use extract_keywords to find themes. Use analyze_sentiment to gauge tone. Identify 3 key insights.' },
      { agent: 'QUILL', goal: 'Write a 5-paragraph research report using the data above. Structure: intro, 3 key insights, conclusion. Use markdown headings. Save as research-report.md.' }
    ]
  },
  'agent-council': {
    name: 'Agent Council Decision',
    description: 'All 7 agents weigh in on a decision',
    steps: [
      { agent: 'ZEROX', goal: '{{INPUT}} — analyze from a financial/business perspective. Use fetch_price if relevant.' },
      { agent: 'ORACLE', goal: 'Research the topic above. Find precedents and data. Use search_web and wikipedia_search.' },
      { agent: 'NEXUS', goal: 'Analyze technical feasibility of the topic above. Consider architecture and implementation.' },
      { agent: 'PIKADON', goal: 'Identify security risks for the topic above.' },
      { agent: 'TURTLE', goal: 'Think about user experience and design implications of the topic above.' },
      { agent: 'QUILL', goal: 'Consider how to communicate this decision to users.' },
      { agent: 'SHADDAI', goal: 'Synthesize all the perspectives above into a final executive decision with clear reasoning.' }
    ]
  },
  'content-blast': {
    name: 'Content Blast Campaign',
    description: 'ORACLE finds trending → QUILL writes 3 platforms → SHADDAI reviews',
    steps: [
      { agent: 'ORACLE', goal: 'Find the top 3 trending topics in {{INPUT}}. Use search_web and get_rss_feed.' },
      { agent: 'QUILL', goal: 'Write 3 separate posts based on the trending topics above: (1) a Twitter thread (5 tweets), (2) a LinkedIn post (200 words), (3) an Instagram caption. Save each to a file.' },
      { agent: 'SHADDAI', goal: 'Review the 3 posts above. Rate each on engagement potential 1-10. Pick the best one and explain why.' }
    ]
  },
  'token-deep-dive': {
    name: 'Token Deep Dive',
    description: 'ZEROX fetches everything about a token, ORACLE researches community sentiment',
    steps: [
      { agent: 'ZEROX', goal: 'Deep analysis of token {{INPUT}}. Get: price, 7-day OHLCV, token info, whale activity (whale_scan), DEX liquidity. Compute volatility.' },
      { agent: 'ORACLE', goal: 'Research the project {{INPUT}}. Use wikipedia_search and search_web. Find recent news and sentiment.' },
      { agent: 'ZEROX', goal: 'Synthesize the financial and research data into a verdict: BUY / HOLD / AVOID with 3 reasons. Save full analysis to file.' }
    ]
  }
};

// Alias for ORACLE — get_news_search not defined as its own tool, use search_web
// (oracle can call search_web with news-focused query)

// ═══════════════════════════════════════════════════════════════════
// AGENT ROUTER — keyword scoring
// ═══════════════════════════════════════════════════════════════════

function routeTask(goal, preferredAgent) {
  if (preferredAgent) {
    const up = preferredAgent.toUpperCase();
    if (AGENTS[up]) return AGENTS[up];
  }
  const text = goal.toLowerCase();
  let best = null, bestScore = -1;
  Object.values(AGENTS).forEach(agent => {
    const score = agent.keywords.reduce((s, kw) => s + (text.includes(kw) ? 1 : 0), 0);
    if (score > bestScore) { bestScore = score; best = agent; }
  });
  return best || AGENTS.SHADDAI;
}

// ═══════════════════════════════════════════════════════════════════
// LLM CALL — Groq → Ollama fallback
// ═══════════════════════════════════════════════════════════════════

// Truncate the long tool-result messages so we stay under the TPM budget
function trimMessages(msgs, maxChars = 8000) {
  let total = msgs.reduce((s, m) => s + (m.content?.length || 0), 0);
  if (total <= maxChars) return msgs;
  // Keep system + last 2 messages full; truncate middle history
  const out = [msgs[0]];
  const tail = msgs.slice(-2);
  for (let i = 1; i < msgs.length - 2; i++) {
    out.push({ ...msgs[i], content: (msgs[i].content || '').slice(0, 600) + '\n[... truncated ...]' });
  }
  return out.concat(tail);
}

// ── BASE TOOLS: every agent (council AND forged) always gets these — research, compute,
//    memory, skill search, and full skill execution. run_skill bridges all 3,437 skills, so a
//    forged agent is genuinely useful out of the box and gains its domain via run_skill.
const BASE_TOOLS = ['search_web','run_js','save_memory','search_skills','read_obsidian_skill','run_skill'];

async function callLLM(messages, agentName, options = {}) {
  const agent = AGENTS[agentName] || AGENTS.SHADDAI;
  const t0 = Date.now();
  const user = options.user || 'guest';

  // Build tool instruction block — this agent's tools, OR an explicit custom loadout.
  // Forged/custom agents pass their equipped skills via options.tools so the skills the
  // owner picked in the Forge are EXACTLY the tools the agent is offered + allowed to call.
  const customTools = (Array.isArray(options.tools) && options.tools.length) ? options.tools : null;
  // Resolve the equipped loadout. Raw tool names stay as-is; equipped *recipe* skills from
  // the Forge catalog (e.g. "daily-market-snapshot") are EXPANDED into the concrete step-tools
  // they run — otherwise they resolve to nothing and a forged agent ends up with no tools.
  // run_skill (in BASE_TOOLS) still lets it execute the whole recipe by name.
  const _loadout = customTools || agent.tools || [];
  const _equippedSkills = [];
  const _resolved = [];
  for (const n of _loadout) {
    if (TOOLS[n]) { _resolved.push(n); continue; }
    const r = (skillIndex.getRecipe && skillIndex.getRecipe(n)) || null;
    if (r && Array.isArray(r.steps)) {
      _equippedSkills.push(n);
      r.steps.forEach(s => { if (s.tool && TOOLS[s.tool]) _resolved.push(s.tool); });
    }
  }
  const ownTools = [...new Set([...BASE_TOOLS, ..._resolved])].map(n => TOOLS[n]).filter(Boolean);
  // Tell the agent exactly which named skills it was forged with, so it runs them via run_skill.
  const equippedNote = _equippedSkills.length
    ? `\n\nEQUIPPED SKILLS — you were forged with these ready-to-run skills: ${_equippedSkills.join(', ')}. When the task matches one, CALL run_skill with that exact skill name — it executes real tools and returns live data. Never claim you lack data before trying run_skill or your other tools.`
    : '';
  // Append any currently-connected MCP tools (available to every agent)
  let mcpTools = [];
  if (mcpClient) {
    try { mcpTools = Object.values(mcpClient.getAgentTools()); } catch {}
  }
  // Selective tool injection — advertise only the tools most RELEVANT to this goal
  // (ranked by lib/tool-selector) so the prompt carries fewer tool descriptions per call,
  // and a capped list can't drop the relevant tool to an arbitrary slice. ownTools stays the
  // allow-set (execution is unrestricted); BASE_TOOLS are always kept so capability is preserved.
  let _promptTools = [...ownTools, ...mcpTools];
  try {
    const { selectTools } = require('./lib/tool-selector');
    const _goal = messages.filter(m => m.role === 'user').slice(-1)[0]?.content || '';
    _promptTools = selectTools(_goal, _promptTools, { max: 22, min: 6, always: BASE_TOOLS, agent: agentName });
  } catch (_) { /* fall back to full list */ }
  const toolBlock = _promptTools
    .map(t => `[TOOL:${t.name}:${JSON.stringify(t.schema)}] — ${String(t.description || '').slice(0, 60)}`)  // trim desc → leaner prompt for small local models
    .join('\n');

  // Inject matching skill methodology so the agent actually knows the topic deeply
  let skillContext = '';
  try {
    const { semanticFindSkills } = require('./skill-embeddings');
    const userGoal = messages.filter(m => m.role === 'user').slice(-1)[0]?.content || '';
    const matched = semanticFindSkills(userGoal, 1, agentName);
    if (matched.length && matched[0].score > 0.15) {
      const sk = skillIndex.getBakedSkill(matched[0].id);
      if (sk && sk.methodology) {
        skillContext = `\n\nSKILL KNOWLEDGE — ${matched[0].name}:\n${sk.methodology.slice(0, 1200)}`;
      }
    }
  } catch {}

  // Inject installed skill pack system prompts for this user/agent
  let skillPackPrompt = '';
  try {
    const packsPath = require('path').join(__dirname, 'data', 'skill-packs.json');
    const installsPath = require('path').join(__dirname, 'data', 'skill-installs.json');
    const packs = JSON.parse(require('fs').readFileSync(packsPath, 'utf8'));
    const installs = JSON.parse(require('fs').readFileSync(installsPath, 'utf8'));
    const userPackIds = installs[user] || [];
    for (const pid of userPackIds) {
      const pack = packs.find(p => p.id === pid);
      if (pack && pack.target_agent === agentName && pack.system_prompt) {
        skillPackPrompt += `\n\n[ACTIVE SKILL PACK: ${pack.name}]\n${pack.system_prompt}`;
        console.log(`[ENGINE] Injected skill pack "${pack.name}" for ${agentName} (user=${user})`);
      }
    }
  } catch {}

  // plainChat (gateway/conversational): persona only, NO tool instructions, so the
  // model talks normally instead of emitting [TOOL:...] syntax.
  const system = options.plainChat ? {
    role: 'system',
    content: `You are ${agent.name}, ${agent.role} of SHADDAI.
${agent.goal}${skillPackPrompt}${equippedNote}

Respond conversationally and helpfully. Do NOT output tool syntax or code unless asked. Be concise and clear.`
  } : {
    role: 'system',
    content: `You are ${agent.name}, ${agent.role} of SHADDAI.
Goal: ${agent.goal}${skillContext}${skillPackPrompt}${equippedNote}

TOOL SYSTEM — call tools by writing EXACTLY:
[TOOL:tool_name:{"param":"value"}]

Call tools to get real data. Don't guess. After tools execute, their results inject back to you.
Then write the final answer using ONLY real data. Be concise.

Tools (one call per line, no markdown fences):
${toolBlock}`
  };

  // Agent SOUL — inject the agent's identity doc (data/agents/NAME.md) so personality
  // truly shapes behavior (cached per agent; trimmed to keep the prompt lean).
  try {
    callLLM._soul = callLLM._soul || {};
    const key = String(agentName).toUpperCase();
    if (!(key in callLLM._soul)) {
      const sp = path.join(__dirname, 'data', 'agents', key + '.md');
      callLLM._soul[key] = fs.existsSync(sp) ? fs.readFileSync(sp, 'utf8').slice(0, 900) : '';
    }
    if (callLLM._soul[key]) system.content += '\n\n[YOUR IDENTITY]\n' + callLLM._soul[key];
  } catch (_) {}

  // Per-customer memory — agents "learn/grow" with each user (widget passes options.user).
  try {
    if (options.user) {
      const memCtx = require('./lib/agent-memory').contextString(options.user, agentName);
      if (memCtx) system.content += '\n\n' + memCtx;
    }
  } catch (_) {}
  const allMsgs = trimMessages([system, ...messages], 8000);

  // ── PROVIDER CHAIN ──────────────────────────────────────────────────────────
  // Try providers in order until one returns content. An agent's optional
  // `preferredProvider` goes FIRST, so different agents can run on different
  // providers concurrently — no single provider's rate limit bottlenecks all 7.
  // Default order is Ollama (free/local) → Groq → OpenRouter. In the cloud
  // (no Ollama) it auto-skips to the cloud providers.
  async function pOllama() {
    // LEAN prompt for the small local model. The full schema-laden tool block (25+ tools × JSON
    // schema) makes a 1–3B model's prompt-eval crawl → it blows the timeout and the run "fails".
    // Here we give Ollama a compact prompt: persona + a capped list of tool NAMES (no schemas) +
    // any short skill context, trimmed tight. Cloud providers below still get the full prompt.
    const leanTools = _promptTools.slice(0, 14)   // already ranked by goal relevance — the 14 kept are the most relevant
      .map(t => `[TOOL:${t.name}] ${String(t.description || '').slice(0, 40)}`).join('\n');
    const leanSystem = { role: 'system', content:
`You are ${agent.name}, ${agent.role} of SHADDAI. ${agent.goal}${skillContext ? '\n' + skillContext.slice(0, 500) : ''}
To call a tool, output [TOOL:name:{"param":"value"}] on its own line, then stop. Available tools:
${leanTools}
Use tools for real data, then give a concise final answer.` };
    const ollamaMsgs = trimMessages([leanSystem, ...messages], 4000);
    const r = await fetch(OLLAMA_URL + '/api/chat', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: OLLAMA_MODEL, messages: ollamaMsgs, stream: false, options: { num_ctx: OLLAMA_NUM_CTX, num_predict: OLLAMA_NUM_PREDICT } }),
      signal: AbortSignal.timeout(OLLAMA_TIMEOUT_MS)
    });
    if (!r.ok) throw new Error('ollama HTTP ' + r.status);
    const d = await r.json();
    const c = d.message?.content;
    if (!c) throw new Error('ollama empty response');
    llmTracer.trace({ provider: 'ollama', model: OLLAMA_MODEL, agentName,
      inputTokens: d.prompt_eval_count ?? Math.ceil(JSON.stringify(ollamaMsgs).length / 4),
      outputTokens: d.eval_count ?? Math.ceil(c.length / 4),
      durationMs: Date.now() - t0, success: true, exact: d.eval_count != null });
    return c;
  }
  // OpenAI-compatible providers (Groq, OpenRouter both use this shape)
  async function pOpenAICompatible(name, url, key, models) {
    if (!key) throw new Error(name + ' no key');
    let lastErr;
    for (const model of models) {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const headers = { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
          if (name === 'openrouter') { headers['HTTP-Referer'] = 'https://shaddai.app'; headers['X-Title'] = 'SHADDAI'; }
          const r = await axios.post(url, { model, messages: allMsgs, max_tokens: 1500, temperature: 0.6 }, { headers, timeout: 30000 });
          llmTracer.trace({ provider: name, model, agentName,
            inputTokens: r.data.usage?.prompt_tokens || 0, outputTokens: r.data.usage?.completion_tokens || 0,
            durationMs: Date.now() - t0, success: true });
          return r.data.choices[0].message.content;
        } catch (e) {
          lastErr = e;
          const msg = e.response?.data?.error?.message || e.message;
          const rl = e.response?.status === 429 || /rate limit|TPM|Limit/i.test(msg);
          console.warn(`[ENGINE] ${name} ${model} attempt ${attempt + 1}: ${String(msg).slice(0, 120)}`);
          if (rl && attempt === 0) {
            const w = String(msg).match(/in ([\d.]+)s/);
            await new Promise(res => setTimeout(res, Math.min(8000, Math.ceil((w ? parseFloat(w[1]) : 3) * 1000) + 500)));
            continue;
          }
          break; // next model
        }
      }
    }
    throw lastErr || new Error(name + ' failed');
  }
  // Effective API keys: BYOK (user's stored key from /api/byok/set) wins over the
  // server env key so the user's own quota is consumed, not the shared pool.
  // Note: 'claude' is the BYOK provider name for Anthropic.
  const _bGroq      = getBYOKKey('groq')      || GROQ_KEY;
  const _bRouter    = getBYOKKey('openrouter') || OPENROUTER_KEY;
  const _bOpenAI    = getBYOKKey('openai')     || OPENAI_KEY;
  const _bAnthropic = getBYOKKey('claude')     || ANTHROPIC_KEY;
  const _bGemini    = getBYOKKey('gemini')     || GEMINI_KEY;

  // Anthropic (paid, reliable — different API shape: system separate, x-api-key).
  async function pAnthropic() {
    if (!_bAnthropic) throw new Error('anthropic no key');
    const sys = allMsgs.find(m => m.role === 'system');
    const userMsgs = allMsgs.filter(m => m.role !== 'system').map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content || '' }));
    if (!userMsgs.length) userMsgs.push({ role: 'user', content: 'Hello' });
    const model = (options.provider === 'anthropic' && options.model) || ANTHROPIC_MODEL;
    const r = await axios.post('https://api.anthropic.com/v1/messages',
      { model, max_tokens: 1500, temperature: 0.6, ...(sys ? { system: sys.content } : {}), messages: userMsgs },
      { headers: { 'x-api-key': _bAnthropic, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' }, timeout: 35000 });
    const c = (r.data.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
    if (!c) throw new Error('anthropic empty');
    llmTracer.trace({ provider: 'anthropic', model, agentName, inputTokens: r.data.usage?.input_tokens || 0, outputTokens: r.data.usage?.output_tokens || 0, durationMs: Date.now() - t0, success: true });
    return c;
  }
  // Gemini (free, generous, SEPARATE quota from groq/openrouter — different API shape).
  async function pGemini() {
    if (!_bGemini) throw new Error('gemini no key');
    const sys = allMsgs.find(m => m.role === 'system');
    const contents = allMsgs.filter(m => m.role !== 'system').map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content || '' }] }));
    if (!contents.length) contents.push({ role: 'user', parts: [{ text: 'Hello' }] });
    const model = (options.provider === 'gemini' && options.model) || GEMINI_MODEL;
    const body = { contents, ...(sys ? { systemInstruction: { parts: [{ text: sys.content }] } } : {}), generationConfig: { maxOutputTokens: 1500, temperature: 0.6 } };
    const r = await axios.post(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${_bGemini}`, body, { timeout: 35000 });
    const c = (r.data.candidates?.[0]?.content?.parts || []).map(p => p.text).join('');
    if (!c) throw new Error('gemini empty');
    llmTracer.trace({ provider: 'gemini', model, agentName, inputTokens: 0, outputTokens: Math.ceil(c.length / 4), durationMs: Date.now() - t0, success: true });
    return c;
  }
  const PROVIDERS = {
    ollama: pOllama,
    gemini: pGemini,
    groq: () => pOpenAICompatible('groq', 'https://api.groq.com/openai/v1/chat/completions', _bGroq, [(options.provider === 'groq' && options.model) || GROQ_MODEL, 'llama-3.1-8b-instant']),
    openrouter: () => pOpenAICompatible('openrouter', 'https://openrouter.ai/api/v1/chat/completions', _bRouter, [(options.provider === 'openrouter' && options.model) || OPENROUTER_MODEL, 'meta-llama/llama-3.1-8b-instruct:free']),
    anthropic: pAnthropic,
    openai: () => pOpenAICompatible('openai', 'https://api.openai.com/v1/chat/completions', _bOpenAI, [(options.provider === 'openai' && options.model) || OPENAI_MODEL]),
  };
  // Per-step override (options.provider) wins, else the agent's preferredProvider.
  const pref = options.provider || (AGENTS[agentName] && AGENTS[agentName].preferredProvider) || null;
  // Fast cloud first (groq), Ollama LAST as free local fallback — keeps agent loops snappy.
  // free/fast first (groq, openrouter) → paid+reliable (anthropic, openai) catch
  // free-tier rate limits → ollama local last. So a chain never dies on a 429.
  const order = [...new Set([pref, 'groq', 'gemini', 'openrouter', 'anthropic', 'openai', 'ollama'].filter(Boolean))];
  const MODEL_OF = { ollama: OLLAMA_MODEL, gemini: GEMINI_MODEL, groq: GROQ_MODEL, openrouter: OPENROUTER_MODEL, anthropic: ANTHROPIC_MODEL, openai: OPENAI_MODEL };
  // ── AURA forCall — token savings + cache on EVERY LLM call ──────────────────
  // forCall() applies all savings levers (cache hit, prompt compression, tool-injection
  // savings, history compaction) and records the totals in stats every single call.
  // This is the chokepoint — every agent call routes through here.
  const _aura = require('./lib/aura');
  const _lastUserMsg = messages.slice().reverse().find(m => m && m.role === 'user' && typeof m.content === 'string');
  const _auraPrompt = _lastUserMsg ? _lastUserMsg.content : '';
  const _fc = _aura.forCall({
    prompt:        _auraPrompt,
    system:        system.content || '',
    ownTools:      ownTools,          // FULL agent tool list (before tool-selector ran)
    selectedTools: _promptTools,      // already-selected subset (after tool-selector)
    history:       messages.filter(m => m && m.role !== 'system')
  });
  if (_fc.hit) {
    console.log(`[AURA] forCall hit — ~${_fc.saved.total} tokens saved — skipping LLM`);
    return _fc.answer;
  }
  console.log(`[AURA] forCall miss — saved ${_fc.saved.total} tokens (compress=${_fc.saved.compress} tools=${_fc.saved.tools} history=${_fc.saved.history})`);
  // ────────────────────────────────────────────────────────────────────────────

  let lastError;
  for (const pname of order) {
    const fn = PROVIDERS[pname];
    if (!fn) continue;
    try {
      const out = await fn();
      if (out) {
        const provider = pname, model = (options.provider === pname && options.model) || MODEL_OF[pname];
        console.log('[LLM] provider=' + provider + ' model=' + model);
        // Record in AURA cache for future reuse — on EVERY provider (incl. Ollama). Even when the
        // local model is "free", caching makes the repeat instant (vs 40s) AND, if the user later
        // binds a paid BYOK key, the same prompt is served free from cache. This is the savings loop.
        if (_auraPrompt) {
          try { _aura.recordAnswer(_auraPrompt, out); } catch (_) {}
        }
        return out;
      }
    }
    catch (e) { lastError = e; console.warn(`[ENGINE] provider ${pname} unavailable: ${String(e.message || '').slice(0, 100)}`); }
  }
  throw new Error(`All LLM providers failed (tried ${order.join(', ')}). Last: ${lastError?.message || 'unknown'}. Set GROQ_API_KEY or OPENROUTER_API_KEY, or run Ollama locally.`);
}

// ═══════════════════════════════════════════════════════════════════
// TOOL EXECUTOR — extract and run [TOOL:name:{params}]
// ═══════════════════════════════════════════════════════════════════

async function extractAndRunTools(text, agentName, taskId = null, allowed = null) {
  // Match [TOOL:name:{...}] — allow MCP-prefixed names (mcp__server__tool), digits, hyphens
  const re = /\[TOOL:([a-zA-Z0-9_-]+):(\{(?:[^{}]|\{[^{}]*\})*\})\]/g;
  const results = [];
  let match;
  while ((match = re.exec(text)) !== null) {
    const toolName = match[1];
    let params = {};
    try { params = JSON.parse(match[2]); } catch(e) {
      console.warn('[ENGINE] Bad JSON params for', toolName, ':', match[2]);
    }
    const tool = resolveTool(toolName);
    if (!tool) { results.push({ tool: toolName, result: `Unknown tool: ${toolName}.` }); continue; }
    const agentDef = AGENTS[agentName];
    const isMcp = toolName.startsWith('mcp__');  // MCP tools are available to all agents
    // Allow-list: an explicit custom loadout (forged agents) takes precedence over the built-in agent's list.
    const allowList = [...new Set([...BASE_TOOLS, ...((Array.isArray(allowed) && allowed.length) ? allowed : (agentDef && agentDef.tools) || [])])];
    if (!isMcp && allowList && !allowList.includes(toolName)) {
      results.push({ tool: toolName, result: `${agentName} does not have access to ${toolName}` });
      continue;
    }
    const t0 = Date.now();
    if (taskId) agentEventBus.toolStart(taskId, toolName, params);

    // Cache-first: check cache before hitting external API
    const cached = cacheAnalytics.get(toolName, params);
    if (cached !== null) {
      results.push({ tool: toolName, params, result: cached });
      if (taskId) agentEventBus.toolDone(taskId, toolName, cached, Date.now() - t0);
      console.log(`[TOOL] ${agentName} → ${toolName} → CACHE HIT (${Date.now()-t0}ms)`);
      continue;
    }

    try {
      // Per-tool timeout so a hung tool can't stall the whole autonomous loop.
      const result = await Promise.race([
        tool.execute(params),
        new Promise((_, rej) => setTimeout(() => rej(new Error('tool timeout')), 30000))
      ]);
      cacheAnalytics.set(toolName, params, result); // store for next call
      results.push({ tool: toolName, params, result });
      if (taskId) agentEventBus.toolDone(taskId, toolName, result, Date.now() - t0);
      const safeParams = Object.fromEntries(Object.entries(params).map(([k,v]) => [k, /password|secret|key|token/i.test(k) ? '***' : v]));
      console.log(`[TOOL] ${agentName} → ${toolName}(${JSON.stringify(safeParams).slice(0,80)}) → OK (${Date.now()-t0}ms)`);
    } catch(e) {
      results.push({ tool: toolName, params, result: `Tool error: ${e.message}` });
      if (taskId) agentEventBus.toolError(taskId, toolName, e.message);
      console.error(`[TOOL] ${toolName} failed:`, e.message);
    }
  }
  return results;
}

// ═══════════════════════════════════════════════════════════════════
// TASK QUEUE
// ═══════════════════════════════════════════════════════════════════

const taskQueue = new Map();
const TASK_QUEUE_MAX = 1000; // bound memory: evict oldest completed tasks (Map keeps insertion order)

function createTask(goal, agentName, options = {}) {
  const id = crypto.randomUUID();
  const agent = routeTask(goal, agentName);
  const task = { id, goal, agentName: agent.name, status: 'pending', steps: [], result: null, error: null, startedAt: null, completedAt: null, tools_used: [], options };
  taskQueue.set(id, task);
  // Prevent unbounded growth on a long-lived process — drop the oldest entries.
  while (taskQueue.size > TASK_QUEUE_MAX) {
    const oldest = taskQueue.keys().next().value;
    if (oldest === undefined) break;
    taskQueue.delete(oldest);
  }
  return task;
}

function getTask(id) { return taskQueue.get(id) || null; }
function getAllTasks() { return Array.from(taskQueue.values()).slice(-50); }

// ═══════════════════════════════════════════════════════════════════
// AGENT LOOP — the core execution engine (max 5 iterations)
// ═══════════════════════════════════════════════════════════════════

async function runAgentLoop(taskId) {
  const task = taskQueue.get(taskId);
  if (!task) throw new Error('Task not found: ' + taskId);
  task.status = 'running';
  task.startedAt = new Date().toISOString();
  const messages = [{ role: 'user', content: task.goal }];

  try {
    const grounding = require('./lib/grounding');
    const maxIter = task.options?.maxIter || 5;

    // ── GUARD: PRE-FLIGHT GROUNDING ──────────────────────────────────────────────
    // For live-data goals, run a matching DETERMINISTIC recipe first (real tools, no
    // weak-model guessing). If it yields an answer, use it and skip the loop entirely —
    // so a weak model never gets the chance to invent data it was supposed to fetch.
    if (grounding.needsRealData(task.goal) && process.env.RECIPE_FASTPATH !== 'off') {
      try {
        const fp = await tryRecipeFastPath(task.goal, task.agentName);
        if (fp && fp.result) {
          task.result = fp.result;
          task.tools_used.push(...(fp.tools || []));
          task.steps.push({ iteration: 1, status: 'completed', grounded: true, recipe: fp.recipeId, tools: fp.tools || [] });
          task.status = 'completed';
          task.completedAt = new Date().toISOString();
          try { fs.writeFileSync(path.join(LOGS_DIR, `task_${taskId.slice(0,8)}_${Date.now()}.json`), JSON.stringify(task, null, 2), 'utf8'); } catch (_) {}
          agentEventBus.taskDone(taskId, task.result || '', task.agentName);
          return task;
        }
      } catch (_) { /* no recipe matched → normal loop */ }
    }

    for (let iter = 0; iter < maxIter; iter++) {
      const step = { iteration: iter + 1, status: 'thinking', ts: new Date().toISOString() };
      task.steps.push(step);

      // Compact accumulated history before re-sending — keeps the goal, latest instruction, and
      // recent turns full while compressing OLDER large tool outputs. Shrinks the paid prompt on
      // iterations 2+ (the same big JSON blobs were otherwise re-sent verbatim every iteration).
      try {
        const cc = require('./lib/context-compress');
        const r = cc.compactHistory(messages, { budget: 4000, keepRecent: 3, maxChars: 700 });
        if (r.saved > 0) {
          messages.length = 0; messages.push(...r.messages);
          step.compacted_tokens = r.saved;
        }
      } catch (_) { /* compaction is best-effort */ }

      const response = await callLLM(messages, task.agentName, { user: task.options?.user || task.user, provider: task.options?.provider, model: task.options?.model, tools: task.options?.tools });
      step.llm_response = response.slice(0, 600) + (response.length > 600 ? '…' : '');

      const toolResults = await extractAndRunTools(response, task.agentName, task.id, task.options?.tools);

      if (toolResults.length === 0) {
        // ── GUARD: ANTI-LARP ──────────────────────────────────────────────────────
        // The model gave a final answer. If this is a live-data goal, the answer asserts
        // specific figures, and NO tool was used the whole run → the model fabricated it.
        // Refuse to ship fake numbers: rescue with a real recipe, else say so honestly.
        if (grounding.looksFabricated(response, task.tools_used.length, task.goal)) {
          let rescued = null;
          try { const fp = await tryRecipeFastPath(task.goal, task.agentName); if (fp && fp.result) rescued = fp; } catch (_) {}
          if (rescued) { task.result = rescued.result; task.tools_used.push(...(rescued.tools || [])); step.grounded = true; }
          else { task.result = grounding.honestUnverified(task.goal); step.fabrication_blocked = true; }
        } else {
          task.result = response;
        }
        task.status = 'completed';
        task.completedAt = new Date().toISOString();
        step.status = 'completed';
        break;
      }

      task.tools_used.push(...toolResults.map(r => r.tool));
      step.tools = toolResults.map(r => ({ name: r.tool, resultPreview: String(r.result).slice(0,200) }));
      step.status = 'tool_executed';

      messages.push({ role: 'assistant', content: response });
      const injected = toolResults.map(r => `[TOOL_RESULT:${r.tool}]\n${r.result}`).join('\n\n');
      messages.push({ role: 'user', content: `Tool results:\n${injected}\n\nNow write your final answer using ONLY this real data. Be specific and concrete.` });

      if (iter === 4) {
        task.result = response;
        task.status = 'completed';
        task.completedAt = new Date().toISOString();
      }
    }

    const logFile = path.join(LOGS_DIR, `task_${taskId.slice(0,8)}_${Date.now()}.json`);
    fs.writeFileSync(logFile, JSON.stringify(task, null, 2), 'utf8');
    agentEventBus.taskDone(taskId, task.result || '', task.agentName);

  } catch(e) {
    task.status = 'failed';
    task.error = e.message;
    task.completedAt = new Date().toISOString();
    console.error(`[ENGINE] Task ${taskId} failed:`, e.message);
    agentEventBus.taskError(taskId, e.message);
  }

  return task;
}

// ═══════════════════════════════════════════════════════════════════
// WORKFLOW ENGINE — sequential multi-step with context chaining
// ═══════════════════════════════════════════════════════════════════

// ── AINL FAST-PATH (compile-once, run-many) ──────────────────────────────────
// If a goal strongly + unambiguously matches a param-LESS recipe, run that recipe's
// REAL tool steps deterministically (zero LLM orchestration) instead of the multi-
// iteration agent loop. Only the synthesis LLM call remains (the genuine judgment gate).
// Saves the orchestration tokens (credited to AURA). Conservative by design.
//   Disable with env RECIPE_FASTPATH=off.
// Deterministic param extraction for the AINL fast-path. Only returns params when EVERY required
// input is found with high confidence — otherwise null → we fall back to the LLM loop (safe).
const _COIN = { btc:'bitcoin', bitcoin:'bitcoin', eth:'ethereum', ethereum:'ethereum', sol:'solana', solana:'solana',
  bnb:'binancecoin', xrp:'ripple', ripple:'ripple', ada:'cardano', cardano:'cardano', doge:'dogecoin', dogecoin:'dogecoin',
  avax:'avalanche-2', matic:'matic-network', polygon:'matic-network', dot:'polkadot', polkadot:'polkadot',
  link:'chainlink', chainlink:'chainlink', ltc:'litecoin', litecoin:'litecoin', shib:'shiba-inu', uni:'uniswap', atom:'cosmos' };
const _LANGS = ['javascript','typescript','python','rust','go','golang','java','c++','c#','ruby','php','swift','kotlin','scala','solidity','html','css','sql','bash','shell'];
function _cleanTopic(goal) {
  return String(goal)
    .replace(/^\s*(please\s+)?(can you\s+)?(research|tell me about|what(?:'s| is| are)|give me|find|look up|explain|analyze|do a deep dive on|deep research on|info on|a report on|the latest on)\b[:\s]*/i, '')
    .replace(/[?.!]+$/, '').trim();
}
function _extractRecipeParams(recipe, goal) {
  const need = Array.isArray(recipe.params) ? recipe.params : [];
  if (!need.length) return {};
  const out = {}; const g = ' ' + String(goal).toLowerCase() + ' ';
  for (const p of need) {
    if (p === 'symbol' || p === 'collection') {
      let found = null;
      for (const k of Object.keys(_COIN)) { if (new RegExp('\\b' + k + '\\b').test(g)) { found = _COIN[k]; break; } }
      if (!found) return null; out[p] = found;
    } else if (p === 'address') {
      const m = String(goal).match(/0x[0-9a-fA-F]{40}|[1-9A-HJ-NP-Za-km-z]{32,44}/);
      if (!m) return null; out[p] = m[0];
    } else if (p === 'language') {
      const lang = _LANGS.find(l => new RegExp('\\b' + l.replace('+', '\\+').replace('#', '\\#') + '\\b', 'i').test(g));
      if (!lang) return null; out[p] = lang;
    } else if (p === 'repo') {
      const m = String(goal).match(/\b([\w.-]+\/[\w.-]+)\b/);
      if (!m) return null; out[p] = m[1];
    } else if (p === 'city') {
      const m = String(goal).match(/\b(?:in|for|at)\s+([A-Z][a-zA-Z]+(?:[ -][A-Z][a-zA-Z]+)?)/);
      if (!m) return null; out[p] = m[1];
    } else if (p === 'topic' || p === 'query' || p === 'keyword' || p === 'company' || p === 'technology' || p === 'domain') {
      const t = _cleanTopic(goal);
      if (t.length < 2 || t.length > 90) return null; out[p] = t;
    } else {
      return null;  // a param type we can't extract confidently → don't fast-path (falls back to LLM)
    }
  }
  return out;
}

async function tryRecipeFastPath(goal, agentName) {
  try {
    if (process.env.RECIPE_FASTPATH === 'off') return null;
    const ag = (agentName && AGENTS[String(agentName).toUpperCase()]) ? String(agentName).toUpperCase() : undefined;
    const matches = skillIndex.findSkills(goal, { agent: ag, includeRecipes: true, includeMd: false, includeObsidian: false, limit: 1 });
    if (!matches.length || matches[0].type !== 'recipe' || (matches[0].score || 0) < 1.6) return null;
    const r = skillIndex.getRecipe(matches[0].id);
    if (!r) return null;
    const input = _extractRecipeParams(r, goal);        // {} for param-less; null if inputs can't be extracted
    if (input === null) return null;                    // → fall back to the LLM loop (safe)
    const done = await runSkill(matches[0].id, input, ag || r.agent);  // deterministic — no orchestration LLM
    if (!done || done.status === 'failed' || !done.result) return null;
    try { require('./lib/aura').creditDeterministic(goal, 1800); } catch (_) {}  // ~3 avoided LLM iterations
    return { result: done.result, recipeId: matches[0].id, tools: done.tools_used || [], params: input, score: matches[0].score };
  } catch (_) { return null; }
}

async function runWorkflow(steps, options = {}) {
  const workflowId = crypto.randomUUID();
  const results = [];
  let prevOutput = '';

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    // AINL: deterministic recipe fast-path when the goal clearly matches one (no chained-context yet).
    if (!prevOutput) {
      const fp = await tryRecipeFastPath(step.goal, step.agent);
      if (fp) {
        results.push({ step: i+1, agent: step.agent, goal: step.goal, result: fp.result, status: 'completed', tools: fp.tools, via: 'recipe:' + fp.recipeId });
        prevOutput = fp.result || prevOutput;
        continue;
      }
    }
    const goal = prevOutput
      ? `${step.goal}\n\nContext from previous step:\n${prevOutput.slice(0, 1200)}`
      : step.goal;
    const task = createTask(goal, step.agent, { provider: step.provider, model: step.model });
    await runAgentLoop(task.id);
    const t = getTask(task.id);
    results.push({ step: i+1, agent: t.agentName, goal: step.goal, result: t.result, status: t.status, tools: t.tools_used });
    prevOutput = t.result || prevOutput;  // keep last good output if this step failed
    // Continue on individual step failures by default; only halt if explicitly set to stopOnFail
    if (t.status === 'failed' && step.stopOnFail) break;
  }

  return { workflowId, steps: results, finalOutput: prevOutput };
}

// ═══════════════════════════════════════════════════════════════════
// MEMORY & INBOX HELPERS
// ═══════════════════════════════════════════════════════════════════

function loadInbox()  { try { return JSON.parse(fs.readFileSync(INBOX_FILE, 'utf8')); } catch { return []; } }
function saveInbox(d) { try { fs.writeFileSync(INBOX_FILE, JSON.stringify(d,null,2), 'utf8'); } catch {} }
function loadMemory() { try { return JSON.parse(fs.readFileSync(MEMORY_FILE,'utf8')); } catch { return {}; } }
function saveMemory(d){ try { fs.writeFileSync(MEMORY_FILE, JSON.stringify(d,null,2), 'utf8'); } catch {} }

// ═══════════════════════════════════════════════════════════════════
// SELF-TEST
// ═══════════════════════════════════════════════════════════════════

async function selfTest() {
  const task = createTask('Get Bitcoin price, Fear & Greed index, and global market cap', 'ZEROX');
  await runAgentLoop(task.id);
  const done = getTask(task.id);
  console.log('[ENGINE] Self-test:', done.status, '| tools:', done.tools_used.join(', ') || 'none');
  return done;
}

// ═══════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════
// AUTONOMOUS COMMANDER MODE — SHADDAI plans + delegates without user
// Pattern: AutoGPT goal decomposition + CrewAI supervisor
// ═══════════════════════════════════════════════════════════════════

async function runAutonomousCommander(goal, options = {}) {
  const id = crypto.randomUUID();
  const task = { id, goal, agentName: 'SHADDAI-COMMANDER', status: 'running', steps: [], result: null, error: null, startedAt: new Date().toISOString(), completedAt: null, tools_used: [], delegations: [] };
  taskQueue.set(id, task);

  try {
    // Step 1: SHADDAI plans by breaking goal into sub-tasks per specialist
    const planPrompt = `You are SHADDAI, supreme commander. Given this goal: "${goal}"

Decompose it into 2-4 sub-tasks. For each, pick the BEST agent (NEXUS, ZEROX, ORACLE, TURTLE, QUILL, PIKADON).
Respond with ONLY this JSON (no markdown):
{"plan":"one sentence plan","tasks":[{"agent":"AGENT_NAME","task":"specific goal"}]}

Available specialists:
- NEXUS: code, APIs, github, npm, python
- ZEROX: crypto prices, market data, whales, DeFi
- ORACLE: research, news, wikipedia, sentiment
- TURTLE: images, design, UI mockups
- QUILL: writing, content, summarization
- PIKADON: security audits, vulnerabilities`;

    const planMessages = [{ role: 'user', content: planPrompt }];
    const planResp = await callLLM(planMessages, 'SHADDAI');
    task.steps.push({ phase: 'planning', output: planResp.slice(0,600) });

    let plan;
    try {
      const jsonMatch = planResp.match(/\{[\s\S]*"tasks"[\s\S]*?\][\s\S]*?\}/);
      plan = JSON.parse(jsonMatch ? jsonMatch[0] : planResp);
    } catch(e) {
      throw new Error('SHADDAI failed to produce valid plan: ' + e.message);
    }

    task.steps.push({ phase: 'plan_parsed', plan: plan.plan, taskCount: plan.tasks.length });

    // Step 2: Delegate each sub-task to the chosen specialist (sequential, context-passing)
    const subResults = [];
    let context = '';
    for (let i = 0; i < plan.tasks.length; i++) {
      const sub = plan.tasks[i];
      const enrichedGoal = context
        ? `${sub.task}\n\nContext from previous specialists:\n${context.slice(0,1200)}`
        : sub.task;
      const subTask = createTask(enrichedGoal, sub.agent);
      await runAgentLoop(subTask.id);
      const done = getTask(subTask.id);
      subResults.push({ step: i+1, agent: sub.agent, goal: sub.task, result: done.result, tools: done.tools_used });
      task.delegations.push({ agent: sub.agent, taskId: subTask.id, status: done.status, tools: done.tools_used });
      task.tools_used.push(...(done.tools_used || []));
      context += `\n[${sub.agent}]: ${done.result?.slice(0,800) || done.error}\n`;
    }

    // Step 3: SHADDAI synthesizes everything into a final executive answer
    const synthPrompt = `Goal: "${goal}"\n\nYour specialists delivered:\n${context}\n\nNow write the final, executive-quality answer that consolidates all of this into a single deliverable for the user. Be concrete, specific, and use the real data above. No hedging.`;
    const finalResp = await callLLM([{ role: 'user', content: synthPrompt }], 'SHADDAI');

    // Strip any leftover tool markers from final response
    task.result = stripToolCalls(finalResp);
    task.status = 'completed';
    task.completedAt = new Date().toISOString();

    const logFile = path.join(LOGS_DIR, `autonomous_${id.slice(0,8)}_${Date.now()}.json`);
    fs.writeFileSync(logFile, JSON.stringify(task, null, 2), 'utf8');
  } catch(e) {
    task.status = 'failed';
    task.error = e.message;
    task.completedAt = new Date().toISOString();
  }

  return task;
}

// ═══════════════════════════════════════════════════════════════════
// SKILL RUNNER — execute any of 5000+ skills efficiently
// Recipes run deterministically (no LLM planning).
// MD/Obsidian skills load full methodology + run via agent engine.
// ═══════════════════════════════════════════════════════════════════

async function runSkill(skillId, input = {}, agentOverride) {
  const taskId = crypto.randomUUID();
  const task = {
    id: taskId, goal: `Execute skill: ${skillId}`, status: 'running',
    skillId, input, steps: [], result: null, tools_used: [],
    agentName: agentOverride, type: null,
    startedAt: new Date().toISOString(), completedAt: null
  };
  taskQueue.set(taskId, task);

  try {
    // Look up the skill — recipe first, then MD, then Obsidian
    let skill = skillIndex.loadSkillContent(skillId);
    if (!skill) {
      // Try fuzzy lookup
      const matches = skillIndex.findSkills(skillId, { limit: 1 });
      if (matches.length === 0) throw new Error(`Skill not found: ${skillId}`);
      skill = skillIndex.loadSkillContent(matches[0].id, { type: matches[0].type });
      if (!skill) throw new Error(`Skill found but could not load: ${matches[0].id}`);
    }

    task.type = skill.type;
    const agentName = agentOverride || skill.recipe?.agent || skill.skill?.agent || 'SHADDAI';
    task.agentName = agentName;

    // ── PATH A: RECIPE (deterministic, no LLM planning) ──────────
    if (skill.type === 'recipe') {
      const r = skill.recipe;
      const stepResults = [];

      for (let i = 0; i < r.steps.length; i++) {
        const step = r.steps[i];
        // Interpolate {{input.X}} and {{step[N].field}} into params
        const params = {};
        Object.entries(step.params || {}).forEach(([k, v]) => {
          params[k] = skillIndex.interpolate(v, input, stepResults);
        });
        const tool = TOOLS[step.tool];
        if (!tool) {
          stepResults.push({ tool: step.tool, params, result: `Unknown tool: ${step.tool}`, error: true });
          continue;
        }
        const t0recipe = Date.now();
        if (task.id) agentEventBus.toolStart(task.id, step.tool, params);
        try {
          const result = await tool.execute(params);
          stepResults.push({ tool: step.tool, params, result });
          task.tools_used.push(step.tool);
          task.steps.push({ tool: step.tool, params, resultPreview: String(result).slice(0,200), status: 'ok' });
          if (task.id) agentEventBus.toolDone(task.id, step.tool, result, Date.now() - t0recipe);
        } catch(e) {
          stepResults.push({ tool: step.tool, params, error: e.message });
          task.steps.push({ tool: step.tool, params, error: e.message, status: 'failed' });
          if (task.id) agentEventBus.toolError(task.id, step.tool, e.message);
        }
      }

      // Synthesize results into prose if synthesize prompt provided
      const dataBlock = stepResults.map(s =>
        `[${s.tool}] ${s.error ? 'ERROR: ' + s.error : s.result}`
      ).join('\n\n');
      const _grounding = require('./lib/grounding');
      const _deterministic = _grounding.formatToolData(stepResults, { title: skillId.replace(/-/g, ' ') });
      if (r.synthesize) {
        const synthPrompt = skillIndex.interpolate(r.synthesize, input, stepResults);
        try {
          // Bound synthesis so a slow model can't hang the task — on timeout we use the
          // deterministic summary (real data, instant) instead of waiting out the full LLM timeout.
          const synth = await Promise.race([
            callLLM([
              { role: 'user', content: `Data collected for skill "${skillId}":\n\n${dataBlock}\n\nTask: ${synthPrompt}\n\nUse ONLY the figures above — do not invent any number.` }
            ], agentName),
            new Promise((_, rej) => setTimeout(() => rej(new Error('synthesis timeout (25s)')), 25000))
          ]);
          const cleaned = stripToolCalls(synth);
          // Accept LLM synthesis ONLY if it's non-trivial AND its numbers are grounded in the real
          // tool data (this catches weak-model garble / drift / hallucination). Otherwise ship the
          // deterministic real-data summary — always correct, instant, never garbled.
          task.result = (cleaned && cleaned.length > 15 && _grounding.synthesisGrounded(cleaned, dataBlock))
            ? cleaned
            : _deterministic;
        } catch (synthErr) {
          // LLM synthesis failed/timed out — deliver the deterministic real-data summary.
          console.warn(`[SKILL-RUNNER] ${skillId} synthesis failed (${synthErr.message}); using deterministic summary`);
          task.result = _deterministic;
        }
      } else {
        // No synthesis — return raw structured results
        task.result = JSON.stringify(stepResults.map(s => ({ tool: s.tool, result: s.result, error: s.error })), null, 2);
      }
    }

    // ── PATH B: MD CATALOG (LLM-driven with tool access) ──────────
    else if (skill.type === 'md') {
      const goal = `Skill: ${skill.skill.name}\nDescription: ${skill.skill.description}\n${input && Object.keys(input).length ? '\nInput: ' + JSON.stringify(input) : ''}\n\nExecute this skill using your available tools. Deliver concrete results.`;
      const subTask = createTask(goal, agentName, { maxIter: 3 });
      await runAgentLoop(subTask.id);
      const done = getTask(subTask.id);
      task.result = done.result;
      task.tools_used = done.tools_used;
      task.steps = done.steps;
    }

    // ── PATH C: BAKED CATALOG (full SKILL.md methodology, prod-safe) ──
    else if (skill.type === 'baked' || skill.type === 'obsidian') {
      const goal = `Skill: "${skill.skill.name}"\nDescription: ${skill.skill.description || ''}\n\n` +
        `Methodology:\n${(skill.content||'').slice(0, 1200)}\n\n` +
        (input && Object.keys(input).length ? `User input: ${JSON.stringify(input)}\n\n` : '') +
        `Apply this methodology. Be specific and concise. Deliver concrete results.`;
      const subTask = createTask(goal, agentName, { maxIter: 2 });
      await runAgentLoop(subTask.id);
      const done = getTask(subTask.id);
      task.result = done.result;
      task.tools_used = done.tools_used;
      task.steps = done.steps;
    }

    task.status = 'completed';
    task.completedAt = new Date().toISOString();
  } catch(e) {
    task.status = 'failed';
    task.error = e.message;
    task.completedAt = new Date().toISOString();
    console.error(`[SKILL-RUNNER] ${skillId} failed:`, e.message);
  }

  return task;
}

// ── PROVIDER GATEWAY ─────────────────────────────────────────────────────────
// One entry point for ALL plain LLM chat. The UI calls this (via /api/model/chat)
// and never talks to a vendor directly. callLLM already does the free-first chain
// (Ollama → Groq → Ollama), so this just wraps it and returns uniform metadata.
async function modelChat(messages, agentName = 'SHADDAI', options = {}) {
  const before = llmTracer.getStats().totalCalls;
  const raw = await callLLM(messages, agentName, { ...options, plainChat: true });
  // Safety net: strip any stray [TOOL:...] syntax so plain chat never shows it
  const content = stripToolCalls(raw) || raw;
  // The trace just recorded by callLLM is the newest entry — read its metadata.
  const stats = llmTracer.getStats();
  const last = (stats.last10 && stats.last10.length) ? stats.last10[stats.last10.length - 1] : {};
  const recorded = stats.totalCalls > before;
  return {
    content,
    provider: recorded ? (last.provider || 'unknown') : 'unknown',
    model: recorded ? (last.model || '') : '',
    inputTokens: recorded ? (last.inputTokens || 0) : 0,
    outputTokens: recorded ? (last.outputTokens || 0) : 0,
    costUSD: recorded ? (last.costUSD || 0) : 0,
    exact: recorded ? !!last.exact : false
  };
}

// Merge the extra tool catalog (scrape/pdf/csv/pwned/pubmed + keyed stubs) into the registry
try { Object.assign(TOOLS, require('./tools-extra').TOOLS_EXTRA); } catch (e) { console.warn('[tools-extra] not loaded:', e.message); }
try { Object.assign(TOOLS, require('./tools-social')); } catch (e) { console.warn('[tools-social] not loaded:', e.message); }
try { Object.assign(TOOLS, require('./tools-news').TOOLS_NEWS); } catch (e) { console.warn('[tools-news] not loaded:', e.message); }
try { Object.assign(TOOLS, require('./tools-defi').TOOLS_DEFI); } catch (e) { console.warn('[tools-defi] not loaded:', e.message); }
try { Object.assign(TOOLS, require('./lib/nft-mint')); } catch (e) { console.warn('[nft-mint] not loaded:', e.message); }
// Upgrade legacy stub names → the REAL implementations (dedup; callers of the old
// names now hit real tools instead of "needs key" stubs). No breakage.
try {
  if (TOOLS.search_x)         TOOLS.search_twitter = TOOLS.search_x;
  if (TOOLS.post_to_x)        TOOLS.post_twitter   = TOOLS.post_to_x;
  if (TOOLS.post_to_telegram) TOOLS.send_telegram  = TOOLS.post_to_telegram;
} catch (e) {}

// Wrap every tool's execute() with the short-TTL result cache so repeated/concurrent
// API pulls (same tool + same params within its freshness window) cost one real call,
// not N. Mutating tools (post/mint/deploy/…) are auto-excluded by policy. TOOL_CACHE=off disables.
try {
  const wrapped = require('./lib/tool-cache').wrapAll(TOOLS);
  console.log(`[tool-cache] wrapped ${wrapped} tools with TTL result cache`);
} catch (e) { console.warn('[tool-cache] not loaded:', e.message); }

module.exports = { TOOLS, AGENTS, WORKFLOW_TEMPLATES, routeTask, createTask, runAgentLoop, runWorkflow, tryRecipeFastPath, runAutonomousCommander, runSkill, getTask, getAllTasks, selfTest, skillIndex, callLLM, modelChat };
