'use strict';
// Tools that outside bots and forged agents may run through the bridge. READ-ONLY data and pure computation only:
// no writes, trades, posting, payments, code execution, file access or recursion. Default deny: a tool not listed here
// cannot be called. (backend/grok-connect.js keeps its own copy of this list; fold it into this file when next touched.)
// Removed on purpose for the bridge: get_rss_feed (caller-chosen URL = server-side request forgery), regex_test (caller regex can hang the server).
module.exports = new Set([
  'fetch_price', 'get_fear_greed', 'get_trending', 'get_ohlcv', 'get_global_market', 'get_token_info',
  'whale_scan', 'get_defi_tvl', 'get_sol_balance', 'get_eth_balance', 'get_exchange_rates', 'search_web',
  'wikipedia_search', 'get_hackernews', 'get_github_trending', 'get_github_repo',
  'search_npm', 'get_weather', 'calculate', 'check_security', 'list_open_jobs',
  'analyze_sentiment', 'format_data', 'hash_text', 'base64_codec', 'extract_keywords',
  'markdown_to_html', 'translate_text', 'count_tokens', 'get_reddit_posts', 'get_arxiv_papers',
  'get_gas_price', 'get_nft_floor', 'get_crypto_news'
]);
