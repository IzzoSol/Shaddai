/**
 * SHADDAI Skill Index & Recipe System
 *
 * Two-tier skill system:
 *   1. RECIPES — deterministic tool sequences (fast, predictable, no LLM planning).
 *      100 named recipes across all 7 agents. Each maps to: [tool, params], ...
 *      LLM is only called at the end to synthesize results into prose.
 *
 *   2. MD CATALOG — all 316 skills in backend/data/agents/*.md.
 *      Loaded into an in-memory TF-IDF-ish index for fast keyword search.
 *      Searchable by query; falls back to LLM-driven planning if no recipe exists.
 *
 * Why this scales: instead of injecting 316 skill descriptions into every prompt
 * (token explosion), we index them once and only inject the top 3-5 relevant ones
 * for a given user query — RAG for skills.
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const AGENTS_DIR  = path.join(__dirname, 'data', 'agents');
const CATALOG_JSON = path.join(__dirname, 'data', 'skills-catalog.json');

// ═══════════════════════════════════════════════════════════════════
// BAKED CATALOG — production source-of-truth (loaded once at boot)
// No Obsidian/file-system dependency. Scales to thousands of users
// because skills are read-only data in shared memory.
// ═══════════════════════════════════════════════════════════════════

let _bakedCatalog = null;
function loadBakedCatalog() {
  if (_bakedCatalog) return _bakedCatalog;
  if (!fs.existsSync(CATALOG_JSON)) {
    console.warn('[SKILL-INDEX] No baked catalog. Run: node backend/scripts/build-skills-catalog.js');
    _bakedCatalog = { skills: [], totalSkills: 0 };
    return _bakedCatalog;
  }
  try {
    const raw = fs.readFileSync(CATALOG_JSON, 'utf8');
    _bakedCatalog = JSON.parse(raw);
    console.log(`[SKILL-INDEX] Loaded baked catalog: ${_bakedCatalog.totalSkills} skills (built ${_bakedCatalog.builtAt})`);
    return _bakedCatalog;
  } catch(e) {
    console.error('[SKILL-INDEX] Failed to load baked catalog:', e.message);
    _bakedCatalog = { skills: [], totalSkills: 0 };
    return _bakedCatalog;
  }
}

function getBakedSkill(id) {
  const cat = loadBakedCatalog();
  return cat.skills.find(s => s.id === id || s.name === id);
}

// ═══════════════════════════════════════════════════════════════════
// SKILL RECIPES — deterministic tool sequences
// Format: { agent, params: [...], steps: [{tool, paramsTemplate}], synthesize? }
// {{input.X}} or {{step[N].field}} interpolation supported.
// ═══════════════════════════════════════════════════════════════════

const RECIPES = {

  // ── ZEROX market skills ───────────────────────────────────────────

  'daily-market-snapshot': {
    agent: 'ZEROX',
    description: 'Live BTC/ETH/SOL prices, Fear & Greed, top trending coins, global market cap.',
    steps: [
      { tool: 'fetch_price',       params: { symbol: 'bitcoin' } },
      { tool: 'fetch_price',       params: { symbol: 'ethereum' } },
      { tool: 'fetch_price',       params: { symbol: 'solana' } },
      { tool: 'get_fear_greed',    params: {} },
      { tool: 'get_trending',      params: {} },
      { tool: 'get_global_market', params: {} }
    ],
    synthesize: 'Write a punchy 4-paragraph daily market snapshot using the data above. Include: (1) major prices + 24h moves, (2) sentiment from Fear & Greed, (3) trending coins to watch, (4) global market cap summary. Be concrete with numbers.'
  },

  'token-price-check': {
    agent: 'ZEROX',
    description: 'Quick price check for any token with 7-day price action and trend.',
    params: ['symbol'],
    steps: [
      { tool: 'fetch_price', params: { symbol: '{{input.symbol}}' } },
      { tool: 'get_ohlcv',   params: { symbol: '{{input.symbol}}', days: 7 } },
      { tool: 'get_token_info', params: { symbol: '{{input.symbol}}' } }
    ],
    synthesize: 'Summarize price action for {{input.symbol}}: current price, 7-day change, key levels (high/low), and one-line outlook.'
  },

  'whale-tracker': {
    agent: 'ZEROX',
    description: 'Scan DEX for whale activity and large trades on a token.',
    params: ['symbol'],
    steps: [
      { tool: 'whale_scan',  params: { query: '{{input.symbol}}' } },
      { tool: 'fetch_price', params: { symbol: '{{input.symbol}}' } }
    ],
    synthesize: 'Report whale activity for {{input.symbol}}: top pairs by liquidity, 24h volume, price action. Flag any unusual movement.'
  },

  'defi-leaderboard': {
    agent: 'ZEROX',
    description: 'Top DeFi protocols by TVL right now.',
    steps: [
      { tool: 'get_defi_tvl', params: { limit: 10 } }
    ],
    synthesize: 'List the top 10 DeFi protocols by TVL with chain, category, and 1-day change. Highlight movers.'
  },

  'sol-wallet-check': {
    agent: 'ZEROX',
    description: 'Check SOL balance of any Solana address.',
    params: ['address'],
    steps: [
      { tool: 'get_sol_balance', params: { address: '{{input.address}}' } },
      { tool: 'fetch_price',     params: { symbol: 'solana' } }
    ],
    synthesize: 'Report SOL balance and USD value for the wallet.'
  },

  'eth-wallet-check': {
    agent: 'ZEROX',
    description: 'Check ETH balance of any Ethereum address.',
    params: ['address'],
    steps: [
      { tool: 'get_eth_balance', params: { address: '{{input.address}}' } },
      { tool: 'fetch_price',     params: { symbol: 'ethereum' } }
    ],
    synthesize: 'Report ETH balance and USD value for the wallet.'
  },

  'fiat-converter': {
    agent: 'ZEROX',
    description: 'Live exchange rates for fiat currencies.',
    steps: [
      { tool: 'get_exchange_rates', params: { currencies: 'EUR,GBP,JPY,CAD,AUD,CHF,CNY,INR' } }
    ],
    synthesize: 'List USD → fiat exchange rates with one-line commentary on USD strength.'
  },

  // ── ORACLE research skills ────────────────────────────────────────

  'hn-tech-pulse': {
    agent: 'ORACLE',
    description: 'Top trending stories on Hacker News right now.',
    steps: [
      { tool: 'get_hackernews', params: { limit: 10 } }
    ],
    synthesize: 'Summarize the top 10 Hacker News stories. Group by theme. Identify what tech world is buzzing about.'
  },

  'github-trending-scan': {
    agent: 'ORACLE',
    description: 'GitHub trending repos in a language or topic.',
    params: ['language', 'topic'],
    steps: [
      { tool: 'get_github_trending', params: { language: '{{input.language}}', topic: '{{input.topic}}' } }
    ],
    synthesize: 'List trending GitHub repos with stars, language, description, and 1-sentence summary of what makes each interesting.'
  },

  'wiki-deep-dive': {
    agent: 'ORACLE',
    description: 'Wikipedia lookup with extended research.',
    params: ['topic'],
    steps: [
      { tool: 'wikipedia_search', params: { query: '{{input.topic}}' } },
      { tool: 'search_web',       params: { query: '{{input.topic}} latest 2026' } }
    ],
    synthesize: 'Combine Wikipedia background with recent news on {{input.topic}}. Format as: Overview, Recent Developments, Key Facts.'
  },

  'sentiment-tracker': {
    agent: 'ORACLE',
    description: 'Analyze sentiment for any topic across multiple sources.',
    params: ['topic'],
    steps: [
      { tool: 'search_web',        params: { query: '{{input.topic}}' } },
      { tool: 'get_hackernews',    params: { limit: 5 } },
      { tool: 'analyze_sentiment', params: { text: '{{step[0].result}}' } }
    ],
    synthesize: 'Synthesize sentiment for {{input.topic}}: overall mood, key positive/negative terms, and what the chatter says.'
  },

  'weather-report': {
    agent: 'ORACLE',
    description: 'Current weather for any city.',
    params: ['city'],
    steps: [
      { tool: 'get_weather', params: { city: '{{input.city}}' } }
    ],
    synthesize: 'Brief weather report for {{input.city}}.'
  },

  'translate-text': {
    agent: 'ORACLE',
    description: 'Translate text to any language.',
    params: ['text', 'target'],
    steps: [
      { tool: 'translate_text', params: { text: '{{input.text}}', target: '{{input.target}}' } }
    ],
    synthesize: 'Show the translation cleanly.'
  },

  // ── NEXUS dev skills ──────────────────────────────────────────────

  'github-repo-stats': {
    agent: 'NEXUS',
    description: 'Get full stats on a GitHub repo.',
    params: ['repo'],
    steps: [
      { tool: 'get_github_repo', params: { repo: '{{input.repo}}' } }
    ],
    synthesize: 'Report repo stats: stars, forks, language, recent activity, license. One-line verdict.'
  },

  'npm-package-lookup': {
    agent: 'NEXUS',
    description: 'Search npm for packages matching a query.',
    params: ['query'],
    steps: [
      { tool: 'search_npm', params: { query: '{{input.query}}', limit: 5 } }
    ],
    synthesize: 'List top 5 npm packages with weekly downloads. Recommend the best for the use case.'
  },

  'hash-string': {
    agent: 'NEXUS',
    description: 'Generate SHA256/SHA1/MD5 hash of a string.',
    params: ['text', 'algorithm'],
    steps: [
      { tool: 'hash_text', params: { text: '{{input.text}}', algorithm: '{{input.algorithm||sha256}}' } }
    ]
  },

  'base64-encode': {
    agent: 'NEXUS',
    description: 'Base64 encode a string.',
    params: ['input'],
    steps: [
      { tool: 'base64_codec', params: { input: '{{input.input}}', mode: 'encode' } }
    ]
  },

  'base64-decode': {
    agent: 'NEXUS',
    description: 'Decode a base64 string.',
    params: ['input'],
    steps: [
      { tool: 'base64_codec', params: { input: '{{input.input}}', mode: 'decode' } }
    ]
  },

  'regex-test': {
    agent: 'NEXUS',
    description: 'Test a regex pattern against text.',
    params: ['pattern', 'text', 'flags'],
    steps: [
      { tool: 'regex_test', params: { pattern: '{{input.pattern}}', text: '{{input.text}}', flags: '{{input.flags||g}}' } }
    ]
  },

  'js-eval': {
    agent: 'NEXUS',
    description: 'Run JavaScript code in a sandbox.',
    params: ['code'],
    steps: [
      { tool: 'run_js', params: { code: '{{input.code}}' } }
    ],
    synthesize: 'Explain what the code did and its result.'
  },

  'python-eval': {
    agent: 'NEXUS',
    description: 'Run Python code.',
    params: ['code'],
    steps: [
      { tool: 'run_python', params: { code: '{{input.code}}' } }
    ],
    synthesize: 'Explain what the code did and its result.'
  },

  'math-calc': {
    agent: 'NEXUS',
    description: 'Evaluate a math expression.',
    params: ['expression'],
    steps: [
      { tool: 'calculate', params: { expression: '{{input.expression}}' } }
    ]
  },

  // ── PIKADON security skills ──────────────────────────────────────

  'security-quick-scan': {
    agent: 'PIKADON',
    description: 'Quick OWASP-style security audit of a code snippet.',
    params: ['code'],
    steps: [
      { tool: 'check_security', params: { code: '{{input.code}}' } }
    ],
    synthesize: 'Report findings ranked by severity. Recommend fix for each.'
  },

  'file-security-audit': {
    agent: 'PIKADON',
    description: 'Audit all files in generated-output for security issues.',
    steps: [
      { tool: 'list_files', params: {} }
    ],
    synthesize: 'List the files found. Recommend which to audit first based on filename hints.'
  },

  // ── QUILL writing skills ──────────────────────────────────────────

  'tweet-draft': {
    agent: 'QUILL',
    description: 'Draft a viral tweet about a topic.',
    params: ['topic'],
    steps: [
      { tool: 'search_web', params: { query: '{{input.topic}}' } },
      { tool: 'extract_keywords', params: { text: '{{step[0].result}}', limit: 5 } }
    ],
    synthesize: 'Write 3 distinct tweet variations about {{input.topic}}. Each ≤ 280 chars. Use the keywords. One hook, one insight, one CTA.'
  },

  'thread-generator': {
    agent: 'QUILL',
    description: 'Generate a full Twitter thread on a topic.',
    params: ['topic'],
    steps: [
      { tool: 'search_web',       params: { query: '{{input.topic}}' } },
      { tool: 'wikipedia_search', params: { query: '{{input.topic}}' } }
    ],
    synthesize: 'Write a 7-tweet thread on {{input.topic}}. Start with a strong hook. End with a CTA. Number each tweet.'
  },

  'blog-post-draft': {
    agent: 'QUILL',
    description: 'Draft a full blog post with research.',
    params: ['topic'],
    steps: [
      { tool: 'search_web',       params: { query: '{{input.topic}}' } },
      { tool: 'wikipedia_search', params: { query: '{{input.topic}}' } },
      { tool: 'get_hackernews',   params: { limit: 5 } }
    ],
    synthesize: 'Write a 600-word blog post on {{input.topic}}. Include H2 headings, real facts from the research, and a strong opening + closing.'
  },

  'count-words': {
    agent: 'QUILL',
    description: 'Count words, characters, tokens, reading time for any text.',
    params: ['text'],
    steps: [
      { tool: 'count_tokens', params: { text: '{{input.text}}' } }
    ]
  },

  'md-to-html': {
    agent: 'QUILL',
    description: 'Convert markdown to clean HTML.',
    params: ['markdown'],
    steps: [
      { tool: 'markdown_to_html', params: { markdown: '{{input.markdown}}' } }
    ]
  },

  // ── TURTLE design skills ──────────────────────────────────────────

  'gen-image': {
    agent: 'TURTLE',
    description: 'Generate an AI image from a prompt.',
    params: ['prompt'],
    steps: [
      { tool: 'generate_image', params: { prompt: '{{input.prompt}}', width: 1024, height: 1024 } }
    ],
    synthesize: 'Return the image URL with a one-line caption.'
  },

  'site-screenshot': {
    agent: 'TURTLE',
    description: 'Capture a screenshot of any URL.',
    params: ['url'],
    steps: [
      { tool: 'screenshot_url', params: { url: '{{input.url}}', width: 1024 } }
    ]
  },

  // ── SHADDAI commander skills ──────────────────────────────────────

  'all-agent-report': {
    agent: 'SHADDAI',
    description: 'Get a status report from all 6 specialist agents.',
    steps: [
      { tool: 'delegate_to_agent', params: { agent: 'ZEROX',   task: 'Report current market conditions in one paragraph.' } },
      { tool: 'delegate_to_agent', params: { agent: 'ORACLE',  task: 'Report top news from the last 24 hours.' } },
      { tool: 'delegate_to_agent', params: { agent: 'NEXUS',   task: 'List any recent files in generated-output and their status.' } },
      { tool: 'delegate_to_agent', params: { agent: 'PIKADON', task: 'Report any security concerns in current files.' } }
    ],
    synthesize: 'Compile a 1-page executive briefing combining all 4 agent reports above.'
  },

  'remember': {
    agent: 'SHADDAI',
    description: 'Save a fact to persistent memory.',
    params: ['key', 'value'],
    steps: [
      { tool: 'save_memory', params: { key: '{{input.key}}', value: '{{input.value}}', agent: 'SHADDAI' } }
    ]
  },

  'recall': {
    agent: 'SHADDAI',
    description: 'Retrieve a saved memory.',
    params: ['key'],
    steps: [
      { tool: 'get_memory', params: { key: '{{input.key}}' } }
    ]
  },

  // ── ZEROX — new crypto recipes ────────────────────────────────────────

  'solana-ecosystem-pulse': {
    agent: 'ZEROX',
    description: 'Full Solana ecosystem overview: SOL price, DeFi TVL, trending SOL tokens.',
    steps: [
      { tool: 'fetch_price',    params: { symbol: 'solana' } },
      { tool: 'get_defi_tvl',  params: { limit: 5 } },
      { tool: 'get_trending',  params: {} },
      { tool: 'dex_price',     params: { symbol: 'SOL' } }
    ],
    synthesize: 'Write a punchy Solana ecosystem report. Include SOL price, top DeFi protocols by TVL, trending tokens, and DEX activity. Be specific with all numbers.'
  },

  'nft-floor-check': {
    agent: 'ZEROX',
    description: 'Check NFT collection floor price on Magic Eden.',
    params: ['collection'],
    steps: [
      { tool: 'get_nft_floor', params: { symbol: '{{input.collection}}' } },
      { tool: 'fetch_price',   params: { symbol: 'solana' } }
    ],
    synthesize: 'Report the NFT floor price in SOL and USD. Mention whether it looks cheap or expensive relative to SOL price.'
  },

  'eth-gas-tracker': {
    agent: 'ZEROX',
    description: 'Current Ethereum gas prices with cost estimates for common transactions.',
    steps: [
      { tool: 'get_eth_gas',   params: {} },
      { tool: 'fetch_price',   params: { symbol: 'ethereum' } }
    ],
    synthesize: 'Report current ETH gas prices. Calculate approximate costs in USD for: simple transfer, token swap, NFT mint. Advise on best time to transact.'
  },

  'btc-dominance-analysis': {
    agent: 'ZEROX',
    description: 'Bitcoin dominance analysis with altcoin season indicator.',
    steps: [
      { tool: 'get_dominance',      params: {} },
      { tool: 'fetch_price',        params: { symbol: 'bitcoin' } },
      { tool: 'get_fear_greed',     params: {} },
      { tool: 'get_global_market',  params: {} }
    ],
    synthesize: 'Analyze BTC dominance. Is this altcoin season or Bitcoin season? What does the Fear & Greed index say? Give a clear market phase assessment.'
  },

  'top-movers-scan': {
    agent: 'ZEROX',
    description: 'Scan top gaining and losing cryptocurrencies today.',
    steps: [
      { tool: 'get_top_gainers',  params: { limit: 10 } },
      { tool: 'get_fear_greed',   params: {} }
    ],
    synthesize: 'List today\'s top gainers and note which sectors are moving. Is this broad market strength or sector rotation? Reference the Fear & Greed index.'
  },

  'stablecoin-health-check': {
    agent: 'ZEROX',
    description: 'Monitor stablecoin supply, peg stability, and market share.',
    steps: [
      { tool: 'get_stablecoin_data', params: {} },
      { tool: 'get_global_market',   params: {} }
    ],
    synthesize: 'Assess stablecoin market health. Are pegs holding? Which stablecoin dominates? Is stablecoin supply growing or shrinking (indicator of market confidence)?'
  },

  'sol-wallet-deep-dive': {
    agent: 'ZEROX',
    description: 'Deep analysis of a Solana wallet including balance and SOL price context.',
    params: ['address'],
    steps: [
      { tool: 'get_sol_balance', params: { address: '{{input.address}}' } },
      { tool: 'fetch_price',     params: { symbol: 'solana' } },
      { tool: 'get_defi_tvl',   params: { limit: 3 } }
    ],
    synthesize: 'Analyze this Solana wallet. What is the USD value of their SOL holdings? How does their position compare to the broader DeFi market context?'
  },

  'crypto-news-brief': {
    agent: 'ZEROX',
    description: 'Latest crypto news with market context.',
    steps: [
      { tool: 'get_crypto_news', params: { limit: 8 } },
      { tool: 'get_fear_greed',  params: {} },
      { tool: 'fetch_price',     params: { symbol: 'bitcoin' } }
    ],
    synthesize: 'Summarize the most important crypto news stories. How do they relate to current market sentiment (Fear & Greed index)? What should traders watch?'
  },

  'defi-yield-scan': {
    agent: 'ZEROX',
    description: 'Scan DeFi protocols for TVL and yield opportunities.',
    steps: [
      { tool: 'get_defi_tvl',         params: { limit: 10 } },
      { tool: 'get_protocol_revenue',  params: {} },
      { tool: 'get_stablecoin_data',   params: {} }
    ],
    synthesize: 'Identify the top DeFi yield opportunities right now. Which protocols have the most TVL? Are stablecoins stable? Where is the smart money going?'
  },

  'position-size-calculator': {
    agent: 'ZEROX',
    description: 'Calculate safe position size for any trade given risk parameters.',
    params: ['symbol', 'account_size', 'risk_percent', 'entry_price', 'stop_loss'],
    steps: [
      { tool: 'fetch_price',           params: { symbol: '{{input.symbol}}' } },
      { tool: 'calculate_position_size', params: { account_size: '{{input.account_size}}', risk_percent: '{{input.risk_percent}}', entry_price: '{{input.entry_price}}', stop_loss_price: '{{input.stop_loss}}' } }
    ],
    synthesize: 'Present the position size calculation clearly. Add a risk warning and remind the trader to use stop losses. Include current market price for context.'
  },

  'funding-rate-monitor': {
    agent: 'ZEROX',
    description: 'Check perpetual futures funding rates to gauge market sentiment.',
    params: ['symbol'],
    steps: [
      { tool: 'get_funding_rates', params: { symbol: '{{input.symbol}}' } },
      { tool: 'fetch_price',       params: { symbol: '{{input.symbol}}' } },
      { tool: 'get_fear_greed',    params: {} }
    ],
    synthesize: 'Analyze funding rates for {{input.symbol}}. Positive = longs paying shorts (bullish sentiment, possible squeeze). Negative = shorts paying longs. What does this signal?'
  },

  'dex-deep-scan': {
    agent: 'ZEROX',
    description: 'Deep DEX analysis for any token including all trading pairs.',
    params: ['symbol'],
    steps: [
      { tool: 'dex_price',     params: { symbol: '{{input.symbol}}' } },
      { tool: 'binance_price', params: { symbol: '{{input.symbol}}' } },
      { tool: 'whale_scan',    params: { query: '{{input.symbol}}' } }
    ],
    synthesize: 'Compare DEX vs CEX price for {{input.symbol}}. Is there an arbitrage opportunity? What is whale activity showing? Include all pair details.'
  },

  'crypto-market-regime': {
    agent: 'ZEROX',
    description: 'Determine current crypto market regime: bull, bear, or sideways.',
    steps: [
      { tool: 'fetch_price',       params: { symbol: 'bitcoin' } },
      { tool: 'get_fear_greed',    params: {} },
      { tool: 'get_dominance',     params: {} },
      { tool: 'get_global_market', params: {} },
      { tool: 'get_ohlcv',         params: { symbol: 'bitcoin', days: 30 } }
    ],
    synthesize: 'Determine the current crypto market regime. Is this a bull market, bear market, or consolidation? Use all data points: price trend, fear/greed, dominance, volume. Give a clear verdict.'
  },

  'sol-token-deep-dive': {
    agent: 'ZEROX',
    description: 'Complete analysis of any Solana token by contract address.',
    params: ['address'],
    steps: [
      { tool: 'get_sol_token_info', params: { address: '{{input.address}}' } },
      { tool: 'dex_price',          params: { symbol: '{{input.address}}' } },
      { tool: 'fetch_price',        params: { symbol: 'solana' } }
    ],
    synthesize: 'Full token report for {{input.address}}. Include price, volume, liquidity, DEX data, and how it performs relative to SOL. Flag any red flags in the data.'
  },

  // ── ORACLE — research recipes ─────────────────────────────────────────

  'arxiv-ai-research': {
    agent: 'ORACLE',
    description: 'Latest AI research papers from arXiv with summaries.',
    steps: [
      { tool: 'get_arxiv_papers', params: { query: 'AI agents autonomous LLM', limit: 5 } },
      { tool: 'get_hackernews',   params: { limit: 5 } }
    ],
    synthesize: 'Summarize the most important recent AI research. What are the breakthrough themes? What should developers know? Cross-reference with what HackerNews is discussing.'
  },

  'reddit-pulse': {
    agent: 'ORACLE',
    description: 'Scan multiple Reddit communities for trending discussions.',
    params: ['topic'],
    steps: [
      { tool: 'get_reddit_posts', params: { subreddit: 'technology', limit: 5 } },
      { tool: 'get_reddit_posts', params: { subreddit: '{{input.topic}}', limit: 5 } },
      { tool: 'search_web',       params: { query: '{{input.topic}} reddit trending 2026' } }
    ],
    synthesize: 'What is Reddit saying about {{input.topic}}? Identify the major discussion themes, sentiment, and any viral posts. What does the community think?'
  },

  'product-hunt-daily': {
    agent: 'ORACLE',
    description: 'Top Product Hunt launches today with analysis.',
    steps: [
      { tool: 'get_product_hunt', params: { limit: 8 } },
      { tool: 'get_hackernews',   params: { limit: 5 } }
    ],
    synthesize: 'What launched on Product Hunt today? Identify the most innovative products and what problems they solve. Any overlap with HackerNews trends?'
  },

  'stackoverflow-trends': {
    agent: 'ORACLE',
    description: 'What developers are struggling with on Stack Overflow right now.',
    params: ['language'],
    steps: [
      { tool: 'get_stackoverflow', params: { tag: '{{input.language}}', limit: 8 } },
      { tool: 'get_github_trending', params: { language: '{{input.language}}' } }
    ],
    synthesize: 'What are {{input.language}} developers asking about most? Cross-reference with trending GitHub repos in the same language. What skills are most needed right now?'
  },

  'medium-tech-digest': {
    agent: 'ORACLE',
    description: 'Latest tech articles from Medium on any topic.',
    params: ['topic'],
    steps: [
      { tool: 'get_medium_articles', params: { topic: '{{input.topic}}', limit: 6 } },
      { tool: 'get_arxiv_papers',    params: { query: '{{input.topic}}', limit: 3 } }
    ],
    synthesize: 'Synthesize the latest thinking on {{input.topic}} from Medium writers and academic researchers. What is the consensus? What is contested?'
  },

  'competitor-intelligence': {
    agent: 'ORACLE',
    description: 'Research a competitor or company across multiple sources.',
    params: ['company'],
    steps: [
      { tool: 'search_web',          params: { query: '{{input.company}} news 2026' } },
      { tool: 'get_news_headlines',  params: { topic: '{{input.company}}' } },
      { tool: 'get_github_repo',     params: { repo: '{{input.company}}' } },
      { tool: 'get_reddit_posts',    params: { subreddit: 'programming', limit: 3 } }
    ],
    synthesize: 'Comprehensive intelligence report on {{input.company}}. What are they doing? Recent news, developer activity, community sentiment. SWOT summary at the end.'
  },

  'topic-deep-research': {
    agent: 'ORACLE',
    description: 'Multi-source deep research on any topic.',
    params: ['topic'],
    steps: [
      { tool: 'wikipedia_search',   params: { query: '{{input.topic}}' } },
      { tool: 'search_web',         params: { query: '{{input.topic}} 2026' } },
      { tool: 'get_arxiv_papers',   params: { query: '{{input.topic}}', limit: 3 } },
      { tool: 'get_news_headlines', params: { topic: '{{input.topic}}' } }
    ],
    synthesize: 'Write a comprehensive research brief on {{input.topic}}. Include: background/history, current state in 2026, recent developments, expert research findings, future outlook. Cite your sources.'
  },

  'tech-landscape': {
    agent: 'ORACLE',
    description: 'Map the current technology landscape for any domain.',
    params: ['domain'],
    steps: [
      { tool: 'get_github_trending', params: { language: '', topic: '{{input.domain}}' } },
      { tool: 'search_npm',          params: { query: '{{input.domain}}' } },
      { tool: 'get_hackernews',      params: { limit: 5 } },
      { tool: 'get_arxiv_papers',    params: { query: '{{input.domain}}', limit: 3 } }
    ],
    synthesize: 'Map the {{input.domain}} technology landscape. What are the top tools, frameworks, and libraries? What is trending on GitHub? What are researchers exploring? Where is this heading?'
  },

  'news-sentiment-brief': {
    agent: 'ORACLE',
    description: 'Get news headlines and analyze overall sentiment on a topic.',
    params: ['topic'],
    steps: [
      { tool: 'get_news_headlines', params: { topic: '{{input.topic}}' } },
      { tool: 'analyze_sentiment',  params: { text: '{{input.topic}} news analysis' } },
      { tool: 'get_reddit_posts',   params: { subreddit: 'news', limit: 5 } }
    ],
    synthesize: 'What is the current media sentiment around {{input.topic}}? Analyze headlines from multiple angles. Is coverage positive, negative, or mixed? What narratives dominate?'
  },

  'daily-intelligence-brief': {
    agent: 'ORACLE',
    description: 'Daily intelligence brief: tech news, HN, Reddit, and research highlights.',
    steps: [
      { tool: 'get_hackernews',      params: { limit: 8 } },
      { tool: 'get_news_headlines',  params: { topic: 'technology AI' } },
      { tool: 'get_reddit_posts',    params: { subreddit: 'technology', limit: 5 } },
      { tool: 'get_arxiv_papers',    params: { query: 'AI machine learning', limit: 3 } }
    ],
    synthesize: 'Write today\'s intelligence brief. Top stories from HN, tech news, Reddit, and research. What are the 3 most important things happening in tech today? Keep it punchy and actionable.'
  },

  // ── QUILL — writing recipes ───────────────────────────────────────────

  'blog-post-outline': {
    agent: 'QUILL',
    description: 'Create a detailed blog post outline with research backing.',
    params: ['topic'],
    steps: [
      { tool: 'search_web',         params: { query: '{{input.topic}} guide 2026' } },
      { tool: 'get_arxiv_papers',   params: { query: '{{input.topic}}', limit: 3 } },
      { tool: 'extract_keywords',   params: { text: '{{input.topic}}' } }
    ],
    synthesize: 'Create a detailed blog post outline for "{{input.topic}}". Include: working title (5 options), target audience, SEO keywords, 5-7 section headers with bullet points under each, CTA, estimated word count.'
  },

  'twitter-thread-pack': {
    agent: 'QUILL',
    description: 'Write a full Twitter/X thread on any topic.',
    params: ['topic'],
    steps: [
      { tool: 'search_web',         params: { query: '{{input.topic}} facts statistics 2026' } },
      { tool: 'get_news_headlines', params: { topic: '{{input.topic}}' } }
    ],
    synthesize: 'Write a compelling Twitter/X thread about {{input.topic}}. Format: Tweet 1 (hook), Tweets 2-8 (key points with data), Tweet 9 (summary/CTA). Each tweet under 280 chars. Number each tweet (1/9, 2/9, etc.).'
  },

  'email-campaign-draft': {
    agent: 'QUILL',
    description: 'Write a complete email campaign sequence for any product or topic.',
    params: ['product', 'audience'],
    steps: [
      { tool: 'search_web', params: { query: '{{input.product}} email marketing best practices' } }
    ],
    synthesize: 'Write a 3-email sequence for {{input.product}} targeting {{input.audience}}. Email 1: Welcome/value intro. Email 2: Problem/solution. Email 3: CTA/offer. Include subject lines and preview text for each.'
  },

  'product-description-pack': {
    agent: 'QUILL',
    description: 'Write product descriptions for multiple platforms from a brief.',
    params: ['product', 'features'],
    steps: [
      { tool: 'extract_keywords', params: { text: '{{input.product}} {{input.features}}' } }
    ],
    synthesize: 'Write product descriptions for {{input.product}} (features: {{input.features}}) in 4 formats: (1) Amazon listing (200 words), (2) Website hero copy (50 words), (3) Social media caption (30 words), (4) App store description (100 words).'
  },

  'seo-content-brief': {
    agent: 'QUILL',
    description: 'Create an SEO content brief with keyword research.',
    params: ['keyword'],
    steps: [
      { tool: 'search_web',        params: { query: '{{input.keyword}} site:reddit.com OR site:quora.com' } },
      { tool: 'get_news_headlines', params: { topic: '{{input.keyword}}' } },
      { tool: 'extract_keywords',   params: { text: '{{input.keyword}}' } }
    ],
    synthesize: 'Create an SEO content brief for "{{input.keyword}}". Include: search intent analysis, target audience, 10 related keywords/LSI terms, competitor angle, recommended structure, word count target, and content angle that would rank.'
  },

  'press-release-draft': {
    agent: 'QUILL',
    description: 'Write a professional press release for any announcement.',
    params: ['company', 'announcement'],
    steps: [
      { tool: 'search_web', params: { query: '{{input.company}} {{input.announcement}}' } }
    ],
    synthesize: 'Write a professional press release for {{input.company}} announcing: {{input.announcement}}. Include: dateline, headline, subheadline, 3 body paragraphs (news, context, quote), boilerplate, press contact. AP style.'
  },

  'content-calendar-week': {
    agent: 'QUILL',
    description: 'Generate a week of content ideas for any brand or topic.',
    params: ['brand', 'platform'],
    steps: [
      { tool: 'get_trending',       params: {} },
      { tool: 'get_news_headlines', params: { topic: '{{input.brand}}' } },
      { tool: 'get_hackernews',     params: { limit: 5 } }
    ],
    synthesize: 'Create a 7-day content calendar for {{input.brand}} on {{input.platform}}. Each day: post idea, hook, content type (video/image/text), hashtags, best posting time. Mix promotional (20%) and value content (80%).'
  },

  'caption-pack': {
    agent: 'QUILL',
    description: 'Generate 10 social media captions for any topic or image.',
    params: ['topic', 'tone'],
    steps: [
      { tool: 'extract_keywords', params: { text: '{{input.topic}}' } }
    ],
    synthesize: 'Write 10 social media captions for {{input.topic}} with a {{input.tone}} tone. Mix lengths: 2 short (<50 chars), 4 medium (50-150 chars), 4 full with hashtags. Number them 1-10.'
  },

  // ── NEXUS — developer recipes ─────────────────────────────────────────

  'npm-security-audit': {
    agent: 'NEXUS',
    description: 'Audit an npm package for security vulnerabilities and outdated deps.',
    params: ['package'],
    steps: [
      { tool: 'get_package_info',  params: { package: '{{input.package}}' } },
      { tool: 'check_security',    params: { code: 'require("{{input.package}}")' } },
      { tool: 'search_github_repos', params: { query: '{{input.package}} vulnerability CVE', limit: 3 } }
    ],
    synthesize: 'Security audit for npm package {{input.package}}. Report: version, license, dependency count, known vulnerabilities, GitHub security reports. Verdict: safe to use, use with caution, or avoid.'
  },

  'github-repo-health': {
    agent: 'NEXUS',
    description: 'Complete health check for any GitHub repository.',
    params: ['owner', 'repo'],
    steps: [
      { tool: 'get_github_repo',    params: { repo: '{{input.owner}}/{{input.repo}}' } },
      { tool: 'get_github_issues',  params: { owner: '{{input.owner}}', repo: '{{input.repo}}', limit: 5 } }
    ],
    synthesize: 'Health report for {{input.owner}}/{{input.repo}}. Assess: stars/forks (popularity), open issues count and quality, last commit (maintenance), license, documentation quality. Score out of 10 with recommendations.'
  },

  'code-review-quick': {
    agent: 'NEXUS',
    description: 'Quick code review for correctness, security, and style.',
    params: ['code', 'language'],
    steps: [
      { tool: 'check_security',           params: { code: '{{input.code}}' } },
      { tool: 'analyze_code_complexity',  params: { code: '{{input.code}}' } },
      { tool: 'detect_language',          params: { code: '{{input.code}}' } }
    ],
    synthesize: 'Code review for the provided {{input.language}} code. Report: (1) Security issues found, (2) Complexity analysis, (3) Style recommendations, (4) Potential bugs, (5) Performance concerns. Be specific with line-level feedback.'
  },

  'api-endpoint-builder': {
    agent: 'NEXUS',
    description: 'Generate a complete API endpoint with validation, error handling, and docs.',
    params: ['endpoint', 'method', 'purpose'],
    steps: [
      { tool: 'generate_code_template', params: { language: 'javascript', pattern: 'api' } }
    ],
    synthesize: 'Build a complete {{input.method}} {{input.endpoint}} endpoint for: {{input.purpose}}. Include: Express.js route, input validation, error handling, JSDoc, example request/response, and unit test skeleton.'
  },

  'dependency-audit': {
    agent: 'NEXUS',
    description: 'Audit a list of npm dependencies for security and freshness.',
    params: ['dependencies'],
    steps: [
      { tool: 'search_github_repos', params: { query: '{{input.dependencies}} npm security', limit: 5 } },
      { tool: 'check_security',      params: { code: '{{input.dependencies}}' } }
    ],
    synthesize: 'Dependency audit for: {{input.dependencies}}. For each major dependency: is it maintained? Any known CVEs? Better alternatives? Recommend which to update, replace, or remove.'
  },

  'tech-stack-evaluation': {
    agent: 'NEXUS',
    description: 'Evaluate a technology stack for a given use case.',
    params: ['stack', 'use_case'],
    steps: [
      { tool: 'get_github_trending',  params: { language: '{{input.stack}}' } },
      { tool: 'get_stackoverflow',    params: { tag: '{{input.stack}}', limit: 5 } },
      { tool: 'search_web',           params: { query: '{{input.stack}} vs alternatives 2026' } }
    ],
    synthesize: 'Evaluate {{input.stack}} for {{input.use_case}}. Assess: ecosystem maturity, community support, performance, learning curve, job market. Recommend: proceed, choose alternative, or wait.'
  },

  'regex-builder': {
    agent: 'NEXUS',
    description: 'Build and test a regex pattern for any use case.',
    params: ['description', 'test_string'],
    steps: [
      { tool: 'regex_test', params: { pattern: '.+', text: '{{input.test_string}}' } }
    ],
    synthesize: 'Build a regex pattern for: {{input.description}}. Test it against: "{{input.test_string}}". Provide: the pattern, explanation of each part, edge cases it handles, edge cases it misses, and JavaScript/Python code example.'
  },

  // ── PIKADON — security recipes ────────────────────────────────────────

  'owasp-top10-scan': {
    agent: 'PIKADON',
    description: 'Scan code for OWASP Top 10 vulnerabilities.',
    params: ['code'],
    steps: [
      { tool: 'check_security', params: { code: '{{input.code}}' } },
      { tool: 'analyze_code_complexity', params: { code: '{{input.code}}' } }
    ],
    synthesize: 'OWASP Top 10 security scan results. Check each: A01 Broken Access Control, A02 Cryptographic Failures, A03 Injection, A04 Insecure Design, A05 Security Misconfiguration, A06 Vulnerable Components, A07 Auth Failures, A08 Integrity Failures, A09 Logging Failures, A10 SSRF. Flag any found. Severity: Critical/High/Medium/Low.'
  },

  'api-key-audit': {
    agent: 'PIKADON',
    description: 'Scan code for exposed API keys, secrets, and credentials.',
    params: ['code'],
    steps: [
      { tool: 'check_security', params: { code: '{{input.code}}' } },
      { tool: 'regex_test',     params: { pattern: '(api[_-]?key|secret|password|token|bearer)\\s*[=:]\\s*["\'][^"\']{8,}', text: '{{input.code}}' } }
    ],
    synthesize: 'API key and secrets audit. List all potential exposed credentials found. Classify each: definite leak, probable leak, or false positive. Provide remediation: use env vars, rotate key immediately if leaked.'
  },

  'sql-injection-check': {
    agent: 'PIKADON',
    description: 'Check code for SQL injection vulnerabilities.',
    params: ['code'],
    steps: [
      { tool: 'check_security', params: { code: '{{input.code}}' } }
    ],
    synthesize: 'SQL injection vulnerability report. Identify: string concatenation in queries, missing parameterization, raw user input in SQL. For each vulnerability: show the vulnerable line, explain the attack vector, provide the fixed version using parameterized queries.'
  },

  'auth-flow-audit': {
    agent: 'PIKADON',
    description: 'Audit an authentication implementation for security weaknesses.',
    params: ['code'],
    steps: [
      { tool: 'check_security', params: { code: '{{input.code}}' } },
      { tool: 'search_web',     params: { query: 'authentication security best practices JWT 2026' } }
    ],
    synthesize: 'Authentication security audit. Check: password hashing strength, session management, JWT security (if applicable), brute force protection, MFA support, secure cookie flags. Report issues with severity and fix recommendations.'
  },

  'config-security-audit': {
    agent: 'PIKADON',
    description: 'Audit configuration files for security misconfigurations.',
    params: ['config'],
    steps: [
      { tool: 'check_security', params: { code: '{{input.config}}' } },
      { tool: 'validate_json',  params: { json_string: '{{input.config}}' } }
    ],
    synthesize: 'Configuration security audit. Check: debug mode in production, exposed ports, permissive CORS, missing security headers, hardcoded values, overly permissive permissions. Each issue: severity, impact, fix.'
  },

  'dependency-cve-check': {
    agent: 'PIKADON',
    description: 'Check npm dependencies for known CVEs and vulnerabilities.',
    params: ['package_json'],
    steps: [
      { tool: 'search_github_repos', params: { query: 'CVE vulnerability npm 2026', limit: 5 } },
      { tool: 'search_web',          params: { query: 'npm audit vulnerabilities 2026 critical' } }
    ],
    synthesize: 'Dependency CVE analysis for the provided package.json. Identify high-risk packages, link to known CVEs, and provide upgrade paths. Priority order: Critical > High > Medium > Low.'
  },

  'xss-check': {
    agent: 'PIKADON',
    description: 'Check frontend code for Cross-Site Scripting (XSS) vulnerabilities.',
    params: ['code'],
    steps: [
      { tool: 'check_security', params: { code: '{{input.code}}' } },
      { tool: 'regex_test',     params: { pattern: 'innerHTML|outerHTML|document\\.write|eval\\(', text: '{{input.code}}' } }
    ],
    synthesize: 'XSS vulnerability scan. Check: innerHTML usage, DOM manipulation, eval(), unescaped user input in templates. For each vulnerability: attack scenario, impact, sanitization fix. Recommend: DOMPurify, CSP headers, output encoding.'
  },

  // ── TURTLE — creative recipes ─────────────────────────────────────────

  'image-prompt-pack': {
    agent: 'TURTLE',
    description: 'Generate 5 detailed AI image prompts for any concept.',
    params: ['concept', 'style'],
    steps: [
      { tool: 'generate_image_free', params: { prompt: '{{input.concept}} {{input.style}} cyberpunk' } },
      { tool: 'extract_keywords',    params: { text: '{{input.concept}} {{input.style}}' } }
    ],
    synthesize: 'Generate 5 detailed AI image prompts for "{{input.concept}}" in {{input.style}} style. Each prompt should be 50-100 words and include: subject, environment, lighting, camera angle, artistic style, quality modifiers. Also provide one free Pollinations.ai URL.'
  },

  'color-palette-generator': {
    agent: 'TURTLE',
    description: 'Generate a complete color palette for any brand or mood.',
    params: ['brand', 'mood'],
    steps: [
      { tool: 'extract_keywords', params: { text: '{{input.brand}} {{input.mood}} color palette design' } }
    ],
    synthesize: 'Create a complete color palette for {{input.brand}} with a {{input.mood}} mood. Include: Primary (with hex), Secondary (with hex), Accent (with hex), Background, Text, Success, Warning, Error colors. Add CSS variables. Explain the psychology behind each choice.'
  },

  'ui-component-brief': {
    agent: 'TURTLE',
    description: 'Create a detailed UI component design brief.',
    params: ['component', 'platform'],
    steps: [
      { tool: 'search_web', params: { query: '{{input.component}} UI design best practices {{input.platform}}' } }
    ],
    synthesize: 'Design brief for a {{input.component}} component on {{input.platform}}. Include: visual hierarchy, color usage, typography, spacing, states (default/hover/active/disabled/loading/error), accessibility requirements (WCAG 2.1), mobile responsiveness, animations, and CSS pseudocode.'
  },

  'brand-brief': {
    agent: 'TURTLE',
    description: 'Create a complete brand identity brief for any company or project.',
    params: ['company', 'industry'],
    steps: [
      { tool: 'search_web',        params: { query: '{{input.company}} {{input.industry}} brand identity' } },
      { tool: 'get_news_headlines', params: { topic: '{{input.industry}} design trends 2026' } }
    ],
    synthesize: 'Create a brand identity brief for {{input.company}} in the {{input.industry}} space. Include: brand personality (5 adjectives), target audience, visual direction, typography recommendations, logo concept brief, color psychology, tone of voice, and competitor differentiation.'
  },

  'pixel-art-prompt': {
    agent: 'TURTLE',
    description: 'Generate pixel art prompts for game sprites or icons.',
    params: ['subject', 'style'],
    steps: [
      { tool: 'generate_image_free', params: { prompt: '{{input.subject}} pixel art 16-bit retro game sprite' } }
    ],
    synthesize: 'Generate 3 pixel art prompts for {{input.subject}} in {{input.style}} style. Include grid size (8x8, 16x16, 32x32), color palette size, dithering style, animation frames if applicable. Provide one free Pollinations.ai link.'
  },

  // ── SHADDAI — orchestration & intelligence recipes ────────────────────

  'morning-briefing': {
    agent: 'SHADDAI',
    description: 'Complete morning briefing: markets, news, weather, and tech pulse.',
    steps: [
      { tool: 'fetch_price',        params: { symbol: 'bitcoin' } },
      { tool: 'fetch_price',        params: { symbol: 'solana' } },
      { tool: 'get_fear_greed',     params: {} },
      { tool: 'get_hackernews',     params: { limit: 5 } },
      { tool: 'get_news_headlines', params: { topic: 'technology AI' } },
      { tool: 'get_trending',       params: {} }
    ],
    synthesize: 'Write the morning briefing for the SHADDAI Empire. Format: (1) Market Pulse — BTC/SOL prices + sentiment, (2) Tech Headlines — top 3 HN + tech news, (3) Crypto Trending — coins to watch today, (4) Action Items — what to focus on. Keep it punchy and executive-level.'
  },

  'daily-standup-prep': {
    agent: 'SHADDAI',
    description: 'Prepare for a daily standup meeting with context from multiple sources.',
    steps: [
      { tool: 'get_hackernews',     params: { limit: 5 } },
      { tool: 'get_github_trending', params: { language: 'javascript' } },
      { tool: 'get_news_headlines', params: { topic: 'software development AI' } }
    ],
    synthesize: 'Standup prep brief. Format: YESTERDAY context (what was in the news that matters), TODAY priorities (based on trending tech), BLOCKERS to watch (security issues, breaking changes). Keep to 5 bullets max per section.'
  },

  'opportunity-scanner': {
    agent: 'SHADDAI',
    description: 'Scan for business and investment opportunities across markets and tech.',
    steps: [
      { tool: 'get_top_gainers',     params: { limit: 10 } },
      { tool: 'get_github_trending', params: { language: '' } },
      { tool: 'get_product_hunt',    params: { limit: 6 } },
      { tool: 'get_hackernews',      params: { limit: 8 } }
    ],
    synthesize: 'Identify 5 concrete opportunities right now. Format each as: Opportunity name → Supporting evidence → Why now → Risk → Recommended action. Cover: crypto momentum plays, emerging tech trends, product gaps in market, undervalued tools.'
  },

  'weekly-recap': {
    agent: 'SHADDAI',
    description: 'Weekly recap of market performance, tech trends, and opportunities.',
    steps: [
      { tool: 'get_ohlcv',          params: { symbol: 'bitcoin', days: 7 } },
      { tool: 'get_fear_greed_history', params: {} },
      { tool: 'get_news_headlines', params: { topic: 'crypto technology AI week' } },
      { tool: 'get_global_market',  params: {} }
    ],
    synthesize: 'Write the weekly SHADDAI Empire recap. Cover: market performance last 7 days, sentiment trend from F&G history, major news events, and strategic outlook for next week. Executive summary format.'
  },

  'risk-assessment': {
    agent: 'SHADDAI',
    description: 'Assess current risks across markets, technology, and security.',
    steps: [
      { tool: 'get_fear_greed',     params: {} },
      { tool: 'get_global_market',  params: {} },
      { tool: 'get_news_headlines', params: { topic: 'risk security vulnerability' } },
      { tool: 'get_dominance',      params: {} }
    ],
    synthesize: 'Risk assessment brief. Identify top 5 risks right now across: Market Risk (prices, sentiment), Technology Risk (security vulnerabilities, breaking changes), Regulatory Risk (news signals), Systemic Risk (market structure). Each risk: probability, impact, mitigation.'
  },

  'executive-dashboard': {
    agent: 'SHADDAI',
    description: 'Executive-level dashboard view of all key metrics.',
    steps: [
      { tool: 'fetch_price',          params: { symbol: 'bitcoin' } },
      { tool: 'fetch_price',          params: { symbol: 'ethereum' } },
      { tool: 'fetch_price',          params: { symbol: 'solana' } },
      { tool: 'get_fear_greed',       params: {} },
      { tool: 'get_global_market',    params: {} },
      { tool: 'get_hackernews',       params: { limit: 3 } },
      { tool: 'get_defi_tvl',         params: { limit: 3 } }
    ],
    synthesize: 'Executive dashboard report. Format as: MARKETS (BTC/ETH/SOL prices + trend), SENTIMENT (F&G index reading), MACRO (global market cap + volume), DEFI (top 3 TVL protocols), TECH (top 3 HN stories). One sentence per metric. End with 30-second overall verdict.'
  },

  'competitive-intel': {
    agent: 'SHADDAI',
    description: 'Competitive intelligence report for any market or product category.',
    params: ['category'],
    steps: [
      { tool: 'search_web',          params: { query: '{{input.category}} competitors market leaders 2026' } },
      { tool: 'get_news_headlines',  params: { topic: '{{input.category}}' } },
      { tool: 'get_product_hunt',    params: { limit: 5 } },
      { tool: 'get_github_trending', params: { language: '' } }
    ],
    synthesize: 'Competitive intelligence for {{input.category}}. Map: market leaders, emerging challengers, recent launches, tech trends. Identify: gaps in the market, where incumbents are weak, what new entrants are doing differently. Strategic opportunity summary.'
  },

  'end-of-day-summary': {
    agent: 'SHADDAI',
    description: 'End-of-day wrap-up with market close data and next-day outlook.',
    steps: [
      { tool: 'fetch_price',          params: { symbol: 'bitcoin' } },
      { tool: 'fetch_price',          params: { symbol: 'ethereum' } },
      { tool: 'fetch_price',          params: { symbol: 'solana' } },
      { tool: 'get_fear_greed',       params: {} },
      { tool: 'get_top_gainers',      params: { limit: 5 } },
      { tool: 'get_crypto_news',      params: { limit: 5 } }
    ],
    synthesize: 'End-of-day SHADDAI Empire report. What happened today: price action, top movers, news drivers, sentiment shift. Outlook: what to watch overnight, key levels for tomorrow, any signals for next session.'
  },

  'strategy-session': {
    agent: 'SHADDAI',
    description: 'Full strategic planning session with market and competitive data.',
    params: ['goal'],
    steps: [
      { tool: 'get_global_market',   params: {} },
      { tool: 'get_fear_greed',      params: {} },
      { tool: 'get_hackernews',      params: { limit: 5 } },
      { tool: 'search_web',          params: { query: '{{input.goal}} strategy 2026' } }
    ],
    synthesize: 'Strategic planning session for goal: {{input.goal}}. Framework: Situation (current market/context), Complication (what makes this hard), Question (what decision needs making), Answer (recommended path). Include 3 alternative strategies with pros/cons.'
  },

  // ── MULTI-AGENT orchestration recipes ────────────────────────────────

  'full-market-report': {
    agent: 'SHADDAI',
    description: 'Comprehensive market report combining price data, research, and written analysis.',
    steps: [
      { tool: 'fetch_price',         params: { symbol: 'bitcoin' } },
      { tool: 'fetch_price',         params: { symbol: 'ethereum' } },
      { tool: 'fetch_price',         params: { symbol: 'solana' } },
      { tool: 'get_fear_greed',      params: {} },
      { tool: 'get_global_market',   params: {} },
      { tool: 'get_defi_tvl',        params: { limit: 5 } },
      { tool: 'get_top_gainers',     params: { limit: 5 } },
      { tool: 'get_crypto_news',     params: { limit: 5 } },
      { tool: 'search_web',          params: { query: 'crypto market outlook 2026' } }
    ],
    synthesize: 'Write a professional-grade market report. Sections: (1) Executive Summary, (2) Market Overview with all prices and metrics, (3) DeFi Ecosystem analysis, (4) Top Movers analysis, (5) News Catalyst review, (6) Outlook and Strategy. Use actual numbers throughout. Minimum 500 words.'
  },

  'investment-thesis': {
    agent: 'SHADDAI',
    description: 'Build a complete investment thesis for any crypto asset.',
    params: ['symbol'],
    steps: [
      { tool: 'fetch_price',       params: { symbol: '{{input.symbol}}' } },
      { tool: 'get_ohlcv',         params: { symbol: '{{input.symbol}}', days: 30 } },
      { tool: 'get_token_info',    params: { symbol: '{{input.symbol}}' } },
      { tool: 'search_web',        params: { query: '{{input.symbol}} crypto thesis bull case bear case 2026' } },
      { tool: 'get_fear_greed',    params: {} },
      { tool: 'get_dominance',     params: {} }
    ],
    synthesize: 'Build a complete investment thesis for {{input.symbol}}. Include: (1) Asset overview and use case, (2) Bull case with catalysts, (3) Bear case with risks, (4) Technical analysis from price data, (5) Market context, (6) Position sizing recommendation, (7) Entry/exit strategy. Be balanced and evidence-based.'
  },

  'security-full-audit': {
    agent: 'PIKADON',
    description: 'Comprehensive security audit combining OWASP, secrets, and dependency checks.',
    params: ['code'],
    steps: [
      { tool: 'check_security',           params: { code: '{{input.code}}' } },
      { tool: 'analyze_code_complexity',  params: { code: '{{input.code}}' } },
      { tool: 'detect_language',          params: { code: '{{input.code}}' } },
      { tool: 'regex_test',               params: { pattern: '(api[_-]?key|secret|password|token)\\s*[=:]\\s*["\'][^"\']+', text: '{{input.code}}' } }
    ],
    synthesize: 'Comprehensive security audit report. Sections: (1) Language/framework detected, (2) Critical vulnerabilities (must fix), (3) High severity issues, (4) Exposed secrets/keys found, (5) Code complexity risk, (6) Recommended fixes with code examples, (7) Security score out of 10.'
  },

  'project-launch-audit': {
    agent: 'NEXUS',
    description: 'Pre-launch audit: code quality, security, dependencies, and documentation.',
    params: ['repo'],
    steps: [
      { tool: 'get_github_repo',     params: { repo: '{{input.repo}}' } },
      { tool: 'get_github_issues',   params: { owner: '{{input.repo}}'.split('/')[0], repo: '{{input.repo}}'.split('/')[1], limit: 5 } },
      { tool: 'search_web',          params: { query: '{{input.repo}} launch checklist production' } }
    ],
    synthesize: 'Pre-launch audit for {{input.repo}}. Checklist: Code quality (GitHub health), Open issues (blockers?), Documentation (README quality), Security posture, Performance considerations, Monitoring/logging, Rollback plan. GO / NO-GO verdict with reasoning.'
  },

  'tech-evaluation-report': {
    agent: 'ORACLE',
    description: 'Evaluate any technology, framework, or tool for adoption.',
    params: ['technology'],
    steps: [
      { tool: 'get_github_trending',  params: { language: '{{input.technology}}' } },
      { tool: 'get_stackoverflow',    params: { tag: '{{input.technology}}' } },
      { tool: 'search_npm',           params: { query: '{{input.technology}}' } },
      { tool: 'get_news_headlines',   params: { topic: '{{input.technology}}' } },
      { tool: 'get_arxiv_papers',     params: { query: '{{input.technology}}', limit: 3 } }
    ],
    synthesize: 'Technology evaluation report for {{input.technology}}. Assess: Community size (GitHub/SO activity), Ecosystem maturity (npm packages), Industry adoption (news/trends), Research backing (arXiv), Learning curve, Performance characteristics, When to use vs avoid. Adoption recommendation: adopt/trial/assess/hold.'
  },

  'portfolio-snapshot': {
    agent: 'ZEROX',
    description: 'Live portfolio snapshot for BTC, ETH, SOL with USD value and 24h P&L.',
    params: ['btc_amount', 'eth_amount', 'sol_amount'],
    steps: [
      { tool: 'fetch_price', params: { symbol: 'bitcoin' } },
      { tool: 'fetch_price', params: { symbol: 'ethereum' } },
      { tool: 'fetch_price', params: { symbol: 'solana' } },
      { tool: 'get_fear_greed', params: {} }
    ],
    synthesize: 'Calculate portfolio value: {{input.btc_amount}} BTC, {{input.eth_amount}} ETH, {{input.sol_amount}} SOL at current prices. Show total USD value, 24h change per asset, portfolio-level P&L. Add sentiment context from Fear & Greed index.'
  },

  // ── ZEROX — additional market intelligence ────────────────────────────────

  'stock-market-snapshot': {
    agent: 'ZEROX',
    description: 'Live snapshot of top US stocks SPY NVDA AAPL TSLA plus crypto Fear and Greed sentiment.',
    steps: [
      { tool: 'get_stock_quote', params: { symbol: 'SPY' } },
      { tool: 'get_stock_quote', params: { symbol: 'NVDA' } },
      { tool: 'get_stock_quote', params: { symbol: 'AAPL' } },
      { tool: 'get_stock_quote', params: { symbol: 'TSLA' } },
      { tool: 'get_fear_greed',  params: {} }
    ],
    synthesize: 'Report today\'s US stock market pulse: SPY (market direction), NVDA (AI sentiment), AAPL (big tech), TSLA (risk appetite). Cross-reference with crypto Fear & Greed to identify whether risk-on or risk-off mood dominates across all markets.'
  },

  'sol-network-health': {
    agent: 'ZEROX',
    description: 'Solana network performance: live TPS, SOL price, and top DeFi protocols by TVL.',
    steps: [
      { tool: 'get_onchain_activity', params: {} },
      { tool: 'fetch_price',          params: { symbol: 'solana' } },
      { tool: 'get_defi_tvl',         params: { limit: 5 } }
    ],
    synthesize: 'Assess the health of the Solana network. Report current TPS and slot performance, SOL token price, and top DeFi protocols by TVL. Is the network congested or running smoothly? Is DeFi TVL growing?'
  },

  'binance-depth-read': {
    agent: 'ZEROX',
    description: 'Binance order book depth analysis to gauge buy/sell pressure for any token.',
    params: ['symbol'],
    steps: [
      { tool: 'binance_orderbook', params: { symbol: '{{input.symbol}}' } },
      { tool: 'binance_price',     params: { symbol: '{{input.symbol}}' } },
      { tool: 'get_fear_greed',    params: {} }
    ],
    synthesize: 'Analyze the {{input.symbol}} order book. Are buyers or sellers dominant? Calculate bid/ask imbalance. Cross-reference with Fear & Greed sentiment. What is the short-term price direction signal?'
  },

  'crypto-arb-check': {
    agent: 'ZEROX',
    description: 'Scan for price discrepancies between DEX and Binance for any token.',
    params: ['symbol'],
    steps: [
      { tool: 'dex_price',     params: { symbol: '{{input.symbol}}' } },
      { tool: 'binance_price', params: { symbol: '{{input.symbol}}' } },
      { tool: 'fetch_price',   params: { symbol: '{{input.symbol}}' } }
    ],
    synthesize: 'Arbitrage analysis for {{input.symbol}}: compare DEX price, Binance spot price, and CoinGecko price. Is there a spread worth acting on? Account for gas costs and slippage. Flag any significant price discrepancy between venues.'
  },

  // ── ORACLE — additional research recipes ──────────────────────────────────

  'hn-story-deep-dive': {
    agent: 'ORACLE',
    description: 'Get top Hacker News stories and read community comments on the most popular one.',
    steps: [
      { tool: 'get_hackernews',           params: { limit: 3 } },
      { tool: 'get_hacker_news_comments', params: {} }
    ],
    synthesize: 'Deep dive into today\'s top Hacker News story. What is it about? What are the most insightful community comments? What does the developer community think, disagree on, or find most interesting? Provide a 3-paragraph synthesis.'
  },

  'world-news-pulse': {
    agent: 'ORACLE',
    description: 'World, tech, and economy news headlines with overall sentiment analysis.',
    steps: [
      { tool: 'get_news_headlines', params: { topic: 'world news' } },
      { tool: 'get_news_headlines', params: { topic: 'technology AI' } },
      { tool: 'get_news_headlines', params: { topic: 'economy finance' } },
      { tool: 'analyze_sentiment',  params: { text: 'world news technology economy markets growth risk' } }
    ],
    synthesize: 'Synthesize today\'s world, tech, and economic news. What are the 3 biggest stories? What is the overall sentiment across categories? Is the news cycle positive, negative, or mixed? Highlight any stories that could impact markets or tech decisions.'
  },

  'country-profile': {
    agent: 'ORACLE',
    description: 'Complete profile for any country: facts, current weather, and Wikipedia overview.',
    params: ['country'],
    steps: [
      { tool: 'get_country_info', params: { country: '{{input.country}}' } },
      { tool: 'get_weather',      params: { city: '{{input.country}}' } },
      { tool: 'wikipedia_search', params: { query: '{{input.country}}' } }
    ],
    synthesize: 'Build a complete profile for {{input.country}}: population, capital, currency, languages, current weather in the capital, and a historical/political overview from Wikipedia. Format as a concise country brief.'
  },

  'dev-community-pulse': {
    agent: 'ORACLE',
    description: 'What the developer community is building and struggling with right now.',
    steps: [
      { tool: 'get_stackoverflow',   params: { tag: 'javascript', limit: 5 } },
      { tool: 'get_medium_articles', params: { topic: 'programming', limit: 5 } },
      { tool: 'get_github_trending', params: { language: 'javascript' } }
    ],
    synthesize: 'Developer community pulse report. Top Stack Overflow pain points, popular Medium tutorials, trending GitHub repos. Identify the 3 biggest themes. What skills are hot? What tools are gaining traction? What problems are developers stuck on?'
  },

  // ── NEXUS — additional developer utility recipes ──────────────────────────

  'uuid-batch': {
    agent: 'NEXUS',
    description: 'Generate 5 unique UUIDs instantly for use as IDs, tokens, or keys.',
    steps: [
      { tool: 'get_uuid', params: { count: 5 } }
    ],
    synthesize: 'List the 5 generated UUIDs and suggest a use case for each: primary keys, session tokens, request IDs, file names, correlation IDs.'
  },

  'test-data-pack': {
    agent: 'NEXUS',
    description: 'Generate realistic test users and UUIDs for development and QA.',
    steps: [
      { tool: 'random_user', params: { count: 5 } },
      { tool: 'get_uuid',    params: { count: 5 } }
    ],
    synthesize: 'Format as a ready-to-use test data set. Pair each user with a UUID as their ID. Present as a JSON-ready array with names, emails, phones, locations, and IDs. Add a note about using fake data safely in tests.'
  },

  'mermaid-diagram': {
    agent: 'NEXUS',
    description: 'Generate a Mermaid flowchart or sequence diagram from a plain text description.',
    params: ['type', 'description'],
    steps: [
      { tool: 'generate_mermaid', params: { type: '{{input.type}}', description: '{{input.description}}' } }
    ],
    synthesize: 'Present the Mermaid diagram code. Explain what each node and connection represents. Add usage instructions: paste into mermaid.live to render.'
  },

  'code-intelligence': {
    agent: 'NEXUS',
    description: 'Detect language, analyze complexity, and count tokens for any code snippet.',
    params: ['code'],
    steps: [
      { tool: 'detect_language',         params: { code: '{{input.code}}' } },
      { tool: 'analyze_code_complexity', params: { code: '{{input.code}}' } },
      { tool: 'count_tokens',            params: { text: '{{input.code}}' } }
    ],
    synthesize: 'Code intelligence report: detected language and confidence, complexity assessment (lines, functions, nesting depth, TODOs), and token/character counts. What does this code likely do based on its structure? What refactoring would improve it?'
  },

  'unit-convert': {
    agent: 'NEXUS',
    description: 'Convert between units: temperature (C/F/K), length, weight, or data sizes.',
    params: ['value', 'from', 'to'],
    steps: [
      { tool: 'convert_units', params: { value: '{{input.value}}', from: '{{input.from}}', to: '{{input.to}}' } }
    ],
    synthesize: 'Show the conversion result clearly with context. Supported: C/F/K, m/ft/km/mi, kg/lb, GB/MB/KB.'
  },

  // ── QUILL — additional writing recipes ────────────────────────────────────

  'text-full-analysis': {
    agent: 'QUILL',
    description: 'Complete text analysis: word count, tokens, reading time, keywords, entities, and summary.',
    params: ['text'],
    steps: [
      { tool: 'count_tokens',     params: { text: '{{input.text}}' } },
      { tool: 'extract_keywords', params: { text: '{{input.text}}', limit: 10 } },
      { tool: 'extract_entities', params: { text: '{{input.text}}' } },
      { tool: 'summarize_text',   params: { text: '{{input.text}}', sentences: 3 } }
    ],
    synthesize: 'Complete text analysis report: reading stats (words, tokens, estimated reading time), top 10 keywords by frequency, entities found (prices, dates, URLs, emails), and a 3-sentence extractive summary of the key points.'
  },

  'grammar-polish': {
    agent: 'QUILL',
    description: 'Grammar check, keyword extraction, and reading stats for any text.',
    params: ['text'],
    steps: [
      { tool: 'grammar_check',    params: { text: '{{input.text}}', language: 'en-US' } },
      { tool: 'extract_keywords', params: { text: '{{input.text}}', limit: 8 } },
      { tool: 'count_tokens',     params: { text: '{{input.text}}' } }
    ],
    synthesize: 'Grammar and style report: list all grammar/spelling issues found with specific corrections. List the top 8 keywords. Give an overall writing quality score out of 10 with 2-3 concrete improvement suggestions.'
  },

  'content-translate-pack': {
    agent: 'QUILL',
    description: 'Translate content to any language and extract key terms from the original.',
    params: ['text', 'target'],
    steps: [
      { tool: 'translate_text',   params: { text: '{{input.text}}', target: '{{input.target}}' } },
      { tool: 'extract_keywords', params: { text: '{{input.text}}' } },
      { tool: 'count_tokens',     params: { text: '{{input.text}}' } }
    ],
    synthesize: 'Show the translation to {{input.target}}. List the key terms from the original text. Note reading stats. Flag any terms that may not translate cleanly and suggest alternatives.'
  },

  // ── PIKADON — additional security recipes ─────────────────────────────────

  'password-security-check': {
    agent: 'PIKADON',
    description: 'Analyze password strength, hash it safely, and suggest secure alternatives.',
    params: ['password'],
    steps: [
      { tool: 'check_password_strength', params: { password: '{{input.password}}' } },
      { tool: 'hash_text',               params: { text: '{{input.password}}', algorithm: 'sha256' } },
      { tool: 'get_uuid',                params: { count: 3 } }
    ],
    synthesize: 'Password security report: strength rating, entropy bits, what is missing. Show the SHA256 hash as proof of concept (never store plaintext). Provide 3 UUID-based secure token examples as alternatives. Recommend a passphrase strategy with an example.'
  },

  'full-code-security-scan': {
    agent: 'PIKADON',
    description: 'Comprehensive security scan: OWASP vulnerabilities, language, hardcoded secrets, and complexity risk.',
    params: ['code'],
    steps: [
      { tool: 'check_security',          params: { code: '{{input.code}}' } },
      { tool: 'detect_language',         params: { code: '{{input.code}}' } },
      { tool: 'analyze_code_complexity', params: { code: '{{input.code}}' } },
      { tool: 'regex_test',              params: { pattern: '(password|secret|api[_-]?key|token)\\s*[=:]\\s*["\'][^"\']{4,}', text: '{{input.code}}', flags: 'gi' } }
    ],
    synthesize: 'Comprehensive security scan. Report: (1) Language detected with confidence, (2) OWASP vulnerabilities found with severity (Critical/High/Medium/Low), (3) Hardcoded secrets/credentials detected, (4) Code complexity risk, (5) Security score /10, (6) Top 3 fixes to apply immediately with code examples.'
  },

  'json-security-validate': {
    agent: 'PIKADON',
    description: 'Validate JSON structure and scan for hardcoded secrets or security misconfigurations.',
    params: ['config'],
    steps: [
      { tool: 'validate_json',    params: { json_string: '{{input.config}}' } },
      { tool: 'check_security',   params: { code: '{{input.config}}' } },
      { tool: 'extract_entities', params: { text: '{{input.config}}' } }
    ],
    synthesize: 'JSON security validation: Is the JSON valid? What keys are present? Any hardcoded secrets, debug flags, or insecure values detected by OWASP scan? Any exposed URLs, tokens, or credentials found? Provide a safe configuration checklist with pass/fail for each item.'
  },

  // ── TURTLE — additional creative recipes ──────────────────────────────────

  'color-scheme-from-hex': {
    agent: 'TURTLE',
    description: 'Generate three complete color schemes from a seed hex color: analogic, complement, and triad.',
    params: ['hex'],
    steps: [
      { tool: 'get_color_palette', params: { hex: '{{input.hex}}', mode: 'analogic' } },
      { tool: 'get_color_palette', params: { hex: '{{input.hex}}', mode: 'complement' } },
      { tool: 'get_color_palette', params: { hex: '{{input.hex}}', mode: 'triad' } }
    ],
    synthesize: 'Three color schemes from seed #{{input.hex}}:\n1. Analogic (harmonious, calm)\n2. Complement (high contrast, bold)\n3. Triad (balanced, vibrant)\n\nFor each: list colors with hex codes and CSS variables. Recommend which scheme fits best for: a tech dashboard, a marketing landing page, and a mobile app UI.'
  },

  'creative-daily-spark': {
    agent: 'TURTLE',
    description: 'Daily creative inspiration: an inspiring quote, a historical event today, and an AI art image link.',
    steps: [
      { tool: 'get_random_quote',    params: { tag: 'success' } },
      { tool: 'get_history_today',   params: {} },
      { tool: 'generate_image_free', params: { prompt: 'abstract digital art creative inspiration light particles flowing' } }
    ],
    synthesize: 'Daily creative spark for the SHADDAI Empire: (1) Today\'s inspiring quote with context, (2) A fascinating historical event that happened on this date — connect it to modern tech or design, (3) AI-generated image link for visual inspiration. Wrap with a one-line creative intention for the day.'
  },

  'world-clock-brief': {
    agent: 'TURTLE',
    description: 'Current time in 5 major global timezones for scheduling and team coordination.',
    steps: [
      { tool: 'get_timezone', params: { timezone: 'America/New_York' } },
      { tool: 'get_timezone', params: { timezone: 'Europe/London' } },
      { tool: 'get_timezone', params: { timezone: 'Asia/Tokyo' } },
      { tool: 'get_timezone', params: { timezone: 'Asia/Singapore' } },
      { tool: 'get_timezone', params: { timezone: 'America/Los_Angeles' } }
    ],
    synthesize: 'World clock for global team coordination. Show current time in: New York (ET), London (GMT/BST), Tokyo (JST), Singapore (SGT), Los Angeles (PT). Flag which locations are in business hours, outside hours, or asleep. Suggest the best 1-hour window for a global team call.'
  },

  // ── SHADDAI — additional command and orchestration recipes ────────────────

  'quick-market-ping': {
    agent: 'SHADDAI',
    description: 'Instant 30-second market check: BTC price, Fear and Greed index, and top trending coin.',
    steps: [
      { tool: 'fetch_price',    params: { symbol: 'bitcoin' } },
      { tool: 'get_fear_greed', params: {} },
      { tool: 'get_trending',   params: {} }
    ],
    synthesize: 'Quick market ping — three lines max: BTC price + 24h change, Fear & Greed number + label, #1 trending coin right now. Close with one word: hot, cold, or sideways.'
  },

  'agent-status-board': {
    agent: 'SHADDAI',
    description: 'Check the live status of all agents and list open marketplace jobs.',
    steps: [
      { tool: 'get_agent_mood', params: { agent: 'ZEROX' } },
      { tool: 'get_agent_mood', params: { agent: 'NEXUS' } },
      { tool: 'get_agent_mood', params: { agent: 'ORACLE' } },
      { tool: 'get_agent_mood', params: { agent: 'PIKADON' } },
      { tool: 'list_open_jobs', params: {} }
    ],
    synthesize: 'SHADDAI Empire status board. Which agents are working, idle, or sleeping? List all open marketplace jobs. For each open job, recommend the best agent to handle it based on their specialization (ZEROX=finance, NEXUS=dev, ORACLE=research, PIKADON=security, TURTLE=design, QUILL=writing) and current status.'
  },

  'marketplace-pulse': {
    agent: 'SHADDAI',
    description: 'Overview of the SHADDAI marketplace: collectibles for sale, open jobs, and skill packs.',
    steps: [
      { tool: 'browse_listings',  params: {} },
      { tool: 'list_open_jobs',   params: {} },
      { tool: 'list_skill_packs', params: {} }
    ],
    synthesize: 'SHADDAI Marketplace pulse report. What collectibles are listed for sale and at what prices? What jobs are open for agent bids? What skill packs are available? Highlight best deals, most urgent jobs, and most popular skill packs. Give a 1-line marketplace health verdict.'
  },

  'this-day-intel': {
    agent: 'SHADDAI',
    description: 'Intelligence brief: historical events today, wisdom quote, moon phase, and tech headlines.',
    steps: [
      { tool: 'get_history_today', params: {} },
      { tool: 'get_random_quote',  params: { tag: 'technology' } },
      { tool: 'get_moon_phase',    params: {} },
      { tool: 'get_hackernews',    params: { limit: 3 } }
    ],
    synthesize: 'SHADDAI daily intelligence brief. What happened on this date in history (pick the 2 most fascinating)? A relevant technology quote for today. Current moon phase and next major phase. Top 3 HN stories the tech world is discussing. Close with a one-line SHADDAI Empire directive for the day.'
  },

  // ── NEW v2 tool recipes — single-tool wrappers so the new real tools appear
  //    as equippable "runnable tools" in the Forge (kind:'tool') and run deterministically.
  'iss-tracker': {
    agent: 'ORACLE', description: 'Live position of the International Space Station (lat/long/altitude/velocity).',
    steps: [{ tool: 'get_iss_location', params: {} }],
    synthesize: 'Report the ISS current position: latitude, longitude, altitude and speed, and roughly where over Earth it is right now.'
  },
  'upcoming-launches': {
    agent: 'ORACLE', description: 'Upcoming rocket launches worldwide.',
    steps: [{ tool: 'get_space_launches', params: { limit: 5 } }],
    synthesize: 'List the next 5 upcoming rocket launches: mission name, provider, and launch window.'
  },
  'holiday-lookup': {
    agent: 'ORACLE', description: 'Public holidays for a country and year.', params: ['country', 'year'],
    steps: [{ tool: 'get_public_holidays', params: { country: '{{input.country}}', year: '{{input.year}}' } }],
    synthesize: 'List the public holidays with their dates for the requested country/year.'
  },
  'trivia-pack': {
    agent: 'QUILL', description: 'Fresh trivia questions with answers.',
    steps: [{ tool: 'get_trivia_questions', params: { amount: 5 } }],
    synthesize: 'Present 5 trivia questions with their answers, grouped by category.'
  },
  'free-book-finder': {
    agent: 'ORACLE', description: 'Find free public-domain books (Project Gutenberg).', params: ['query'],
    steps: [{ tool: 'gutenberg_search', params: { query: '{{input.query}}' } }],
    synthesize: 'List matching public-domain books: title, author, download count, and a link.'
  },
  'daily-horoscope': {
    agent: 'ORACLE', description: 'Daily horoscope for a zodiac sign.', params: ['sign'],
    steps: [{ tool: 'get_horoscope', params: { sign: '{{input.sign}}' } }],
    synthesize: 'Deliver the daily horoscope for the requested sign in an engaging, encouraging tone.'
  },
  'btc-fee-check': {
    agent: 'ZEROX', description: 'Current Bitcoin network fees by confirmation speed.',
    steps: [{ tool: 'get_btc_fees', params: {} }],
    synthesize: 'Report current BTC fees (sat/vB) for fastest / half-hour / hour / economy and advise which to use now.'
  },
  'currency-convert': {
    agent: 'ZEROX', description: 'Convert an amount between two fiat currencies at live rates.', params: ['amount', 'from', 'to'],
    steps: [{ tool: 'convert_currency', params: { amount: '{{input.amount}}', from: '{{input.from}}', to: '{{input.to}}' } }],
    synthesize: 'State the converted amount, the live rate used, and the timestamp.'
  },
  'github-profile': {
    agent: 'NEXUS', description: 'Public GitHub user profile summary.', params: ['username'],
    steps: [{ tool: 'github_user_info', params: { username: '{{input.username}}' } }],
    synthesize: 'Summarize the GitHub user: name, bio, public repos, followers, and account age.'
  },
  'http-header-inspect': {
    agent: 'NEXUS', description: 'Inspect HTTP status + response headers for a URL.', params: ['url'],
    steps: [{ tool: 'http_headers', params: { url: '{{input.url}}' } }],
    synthesize: 'Report the HTTP status, server, content-type, and flag any missing security headers (HSTS, CSP, X-Frame-Options).'
  },
  'synonym-finder': {
    agent: 'QUILL', description: 'Find synonyms for a word.', params: ['word'],
    steps: [{ tool: 'word_synonyms', params: { word: '{{input.word}}' } }],
    synthesize: 'List the best synonyms for the word and suggest which fit a formal vs casual tone.'
  },
  'dns-lookup': {
    agent: 'PIKADON', description: 'Resolve DNS records for a domain (DNS-over-HTTPS).', params: ['name', 'type'],
    steps: [{ tool: 'dns_lookup', params: { name: '{{input.name}}', type: '{{input.type}}' } }],
    synthesize: 'Report the resolved DNS records for the domain and note anything unusual.'
  },
  'domain-whois': {
    agent: 'PIKADON', description: 'WHOIS/RDAP registration data for a domain.', params: ['domain'],
    steps: [{ tool: 'rdap_domain', params: { domain: '{{input.domain}}' } }],
    synthesize: 'Report the domain registrar, status, registration/expiry dates, and nameservers.'
  },
  'strong-password': {
    agent: 'PIKADON', description: 'Generate a cryptographically-strong password.', params: ['length'],
    steps: [{ tool: 'generate_password', params: { length: '{{input.length}}' } }],
    synthesize: 'Provide the generated password and its estimated entropy in bits.'
  },
  'contrast-check': {
    agent: 'TURTLE', description: 'WCAG color contrast ratio between two colors.', params: ['fg', 'bg'],
    steps: [{ tool: 'color_contrast_check', params: { fg: '{{input.fg}}', bg: '{{input.bg}}' } }],
    synthesize: 'Report the contrast ratio and whether it passes WCAG AA/AAA for normal and large text.'
  }

};

// ═══════════════════════════════════════════════════════════════════
// MD SKILL CATALOG — load all 316 skills from agent MD files
// ═══════════════════════════════════════════════════════════════════

let _mdCatalog = null;

function loadMdCatalog() {
  if (_mdCatalog) return _mdCatalog;
  const skills = [];
  if (fs.existsSync(AGENTS_DIR)) {
    fs.readdirSync(AGENTS_DIR).filter(f => f.endsWith('.md')).forEach(f => {
      const agentName = f.replace('.md', '').toUpperCase();
      const content = fs.readFileSync(path.join(AGENTS_DIR, f), 'utf8');
      const rows = content.match(/^\|\s*([a-z0-9-]+)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|$/gm) || [];
      rows.slice(1).forEach(row => {  // skip header
        const m = row.match(/^\|\s*([a-z0-9-]+)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|$/);
        if (m) skills.push({ id: m[1], name: m[2].trim(), description: m[3].trim(), agent: agentName });
      });
    });
  }
  _mdCatalog = skills;
  console.log(`[SKILL-INDEX] Loaded ${skills.length} skills from ${Object.keys(skills.reduce((a,s)=>(a[s.agent]=1,a),{})).length} agent files`);
  return skills;
}

// ═══════════════════════════════════════════════════════════════════
// SKILL SEARCH — TF-IDF-ish keyword scoring
// ═══════════════════════════════════════════════════════════════════

const STOPWORDS = new Set(['the','a','an','and','or','of','to','in','on','for','with','by','from','as','is','are','be','do','does','what','how','who','where','when','your','my','our']);

function tokenize(s) {
  return (s || '').toLowerCase().match(/\b[a-z]{2,}\b/g)?.filter(w => !STOPWORDS.has(w)) || [];
}

function findSkills(query, opts = {}) {
  const { agent, limit = 10, includeRecipes = true, includeMd = true, includeObsidian = true } = opts;
  const qTokens = tokenize(query);
  if (!qTokens.length) return [];

  const candidates = [];

  // Tier 1: RECIPES (deterministic, instant) — score boost 2x
  if (includeRecipes) {
    Object.entries(RECIPES).forEach(([id, r]) => {
      if (agent && r.agent.toUpperCase() !== agent.toUpperCase()) return;
      const text = `${id} ${r.description || ''}`;
      const score = scoreMatch(qTokens, text);
      if (score > 0) candidates.push({
        id, type: 'recipe', agent: r.agent, name: id, description: r.description,
        params: r.params || [], stepCount: r.steps.length, score: score * 2.0
      });
    });
  }

  // Tier 2: AGENT MD catalog (316 skills) — score boost 1.3x
  if (includeMd) {
    const catalog = loadMdCatalog();
    catalog.forEach(s => {
      if (agent && s.agent !== agent.toUpperCase()) return;
      const text = `${s.id} ${s.name} ${s.description}`;
      const score = scoreMatch(qTokens, text);
      if (score > 0) candidates.push({
        id: s.id, type: 'md', agent: s.agent, name: s.name, description: s.description, score: score * 1.3
      });
    });
  }

  // Tier 3: BAKED CATALOG (3022 skills) — base score, production-safe
  if (includeObsidian) {  // param name kept for backward compat
    const baked = loadBakedCatalog();
    baked.skills.forEach(s => {
      if (agent && s.agent !== agent.toUpperCase()) return;
      const text = `${s.name} ${s.description} ${s.category || ''}`;
      const score = scoreMatch(qTokens, text);
      if (score > 0) candidates.push({
        id: s.id, type: 'baked', agent: s.agent, name: s.name,
        description: s.description, category: s.category, score
      });
    });
  }

  return candidates.sort((a, b) => b.score - a.score).slice(0, limit);
}

// Load full skill methodology (recipe / MD / baked catalog)
function loadSkillContent(skillId, opts = {}) {
  const { type } = opts;
  // Recipe (deterministic)
  if (type === 'recipe' || RECIPES[skillId]) {
    const r = RECIPES[skillId];
    if (r) return { type: 'recipe', recipe: r };
  }
  // MD catalog (agent skill table)
  const md = loadMdCatalog().find(s => s.id === skillId);
  if (md) return { type: 'md', skill: md, content: `${md.name}: ${md.description}` };
  // BAKED catalog (3022 production skills)
  const baked = getBakedSkill(skillId);
  if (baked) return { type: 'baked', skill: baked, content: baked.methodology || `${baked.name}: ${baked.description}` };
  return null;
}

function scoreMatch(qTokens, text) {
  const docTokens = tokenize(text);
  if (!docTokens.length) return 0;
  const docSet = new Set(docTokens);
  let hits = 0;
  qTokens.forEach(q => {
    if (docSet.has(q)) hits += 1;
    else if (docTokens.some(d => d.includes(q) || q.includes(d))) hits += 0.4;
  });
  return hits / Math.sqrt(qTokens.length);
}

// ═══════════════════════════════════════════════════════════════════
// PARAMETER INTERPOLATION — {{input.X}} and {{step[N].field}}
// ═══════════════════════════════════════════════════════════════════

function interpolate(template, input, steps) {
  if (typeof template !== 'string') return template;
  return template.replace(/\{\{([^}]+)\}\}/g, (_, expr) => {
    expr = expr.trim();
    // Default: {{input.symbol||"bitcoin"}}
    if (expr.includes('||')) {
      const [primary, fallback] = expr.split('||').map(s => s.trim());
      const v = resolvePath(primary, input, steps);
      return v != null && v !== '' ? v : fallback.replace(/^["']|["']$/g, '');
    }
    const v = resolvePath(expr, input, steps);
    return v != null ? String(v) : '';
  });
}

function resolvePath(expr, input, steps) {
  // input.X
  if (expr.startsWith('input.')) return input?.[expr.slice(6)];
  // step[N].field
  const stepMatch = expr.match(/^step\[(\d+)\]\.(.+)$/);
  if (stepMatch) {
    const idx = parseInt(stepMatch[1]);
    const field = stepMatch[2];
    const step = steps?.[idx];
    if (!step) return null;
    // Parse step.result as JSON if needed
    let resultObj = step.result;
    if (typeof resultObj === 'string') {
      try { resultObj = JSON.parse(resultObj); } catch { return resultObj; }
    }
    return field === 'result' ? step.result : resultObj?.[field];
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════════
// CATALOG ENRICHMENT — derive kind / useCase / model / estCost
//
// Rules are derived by code — NOT hand-written per skill.
// Call enrichSkill(item) before serving any catalog entry.
//
// Fields added:
//   kind      — 'tool' (recipe, actually runs tools) | 'skill' (methodology)
//   useCase   — plain-language one-liner from description
//   model     — 'light' | 'balanced' | 'heavy' (recommended reasoning depth)
//   estCost   — rough per-run cost estimate string
// ═══════════════════════════════════════════════════════════════════

const _HEAVY_AGENTS   = new Set(['PIKADON', 'SHADDAI']);
const _HEAVY_KEYWORDS = ['security','audit','strategy','thesis','regime','analysis','report',
  'review','deep','full','comprehensive','intelligence','evaluation','complex','invest'];
// Recipes that are pure data transforms — no LLM synthesis needed
const _LIGHT_RECIPE_IDS = new Set([
  'hash-string','base64-encode','base64-decode','regex-test','math-calc',
  'count-words','md-to-html','remember','recall',
]);

function enrichSkill(item) {
  const recipe = (item.type === 'recipe') ? RECIPES[item.id] : null;

  // ── kind ──────────────────────────────────────────────────────────
  const kind = (item.type === 'recipe') ? 'tool' : 'skill';

  // ── useCase ───────────────────────────────────────────────────────
  // Derive from description; trim gracefully to ≤140 chars.
  const rawDesc = (item.description || item.name || '').trim();
  const useCase = rawDesc.length > 140
    ? rawDesc.slice(0, 137) + '...'
    : (rawDesc || `${item.agent || 'Agent'} ${item.id || item.name} entry.`);

  // ── model ─────────────────────────────────────────────────────────
  let model;
  if (kind === 'tool' && recipe) {
    const hasSynth = !!recipe.synthesize;
    const nSteps   = (recipe.steps || []).length;
    const id       = item.id || '';
    const isLight  = !hasSynth || _LIGHT_RECIPE_IDS.has(id);
    const isHeavy  = hasSynth && (
      nSteps >= 5 ||
      _HEAVY_AGENTS.has(String(item.agent || '').toUpperCase()) ||
      _HEAVY_KEYWORDS.some(w => id.includes(w))
    );
    model = isLight ? 'light' : isHeavy ? 'heavy' : 'balanced';
  } else {
    // methodology skill — derive from agent + text signals
    const agentUpper = String(item.agent || '').toUpperCase();
    const text = `${item.name || ''} ${item.description || ''}`.toLowerCase();
    model = (_HEAVY_AGENTS.has(agentUpper) || _HEAVY_KEYWORDS.some(w => text.includes(w)))
      ? 'heavy'
      : 'balanced';
  }

  // ── estCost ───────────────────────────────────────────────────────
  let estCost;
  if (kind === 'skill') {
    estCost = '$0 (methodology only — no tool calls)';
  } else if (!recipe || !recipe.synthesize) {
    estCost = '$0 (free data API only — no LLM call)';
  } else {
    const nSteps = (recipe.steps || []).length;
    if (nSteps <= 2)      estCost = '~$0.001 (1–2 API calls + small LLM synthesis)';
    else if (nSteps <= 5) estCost = '~$0.003 (3–5 API calls + LLM synthesis)';
    else                  estCost = '~$0.01 (6+ API calls + heavy LLM synthesis)';
  }

  return { ...item, kind, useCase, model, estCost };
}

// ═══════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════

module.exports = {
  RECIPES,
  loadMdCatalog,
  findSkills,
  interpolate,
  loadSkillContent,
  enrichSkill,
  getRecipe: (id) => RECIPES[id],
  listRecipes: () => Object.entries(RECIPES).map(([id, r]) => ({
    id, agent: r.agent, description: r.description, params: r.params || [], stepCount: r.steps.length
  })),
  // Catalog stats — how many skills are available
  getStats: () => {
    const mdCount = loadMdCatalog().length;
    const baked = loadBakedCatalog();
    return {
      recipes: Object.keys(RECIPES).length,
      mdCatalog: mdCount,
      bakedCatalog: baked.totalSkills || 0,
      bakedByAgent: baked.byAgent || {},
      catalogBuiltAt: baked.builtAt,
      total: Object.keys(RECIPES).length + mdCount + (baked.totalSkills || 0)
    };
  },
  loadBakedCatalog,
  getBakedSkill
};
