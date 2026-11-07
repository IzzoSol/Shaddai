'use strict';
// Tools that outside bots and forged agents may run through the bridge: READ-ONLY public-data lookups and pure computation.
// No writes, trades, posting, payments, code execution, file access, recursion, LLM calls or caller-chosen URLs. Default deny:
// a tool not listed here cannot be called, directly or through a skill recipe.
// Vetted by scanning each tool's source (no child_process/eval/fs writes/LLM/process.env, fixed API hosts) - a scan, not a full audit.
// Excluded on purpose: get_rss_feed, http_headers, screenshot_url, dns_lookup (server-side request forgery), regex_test (ReDoS),
// run_js/run_python/list_files/write_file (execution + files), save_memory/save_to_inbox/remember_fact (global files shared by all users),
// generate_image/summarize_text/grammar_check (server LLM cost), delegate_to_agent, shorten_url, browse_listings, all money/trade tools.
// (backend/grok-connect.js keeps its own copy of the older list; fold it into this file when next touched.)
module.exports = new Set([
  'fetch_price', 'get_fear_greed', 'get_trending', 'search_web', 'wikipedia_search', 'get_hackernews',
  'get_crypto_news', 'get_random_quote', 'check_security', 'list_open_jobs', 'get_joke', 'get_word_definition',
  'get_color_palette', 'dex_price', 'get_eth_gas', 'get_dominance', 'get_top_gainers', 'get_stablecoin_data',
  'get_protocol_revenue', 'calculate_position_size', 'get_funding_rates', 'binance_price', 'get_sol_token_info',
  'get_product_hunt', 'get_stackoverflow', 'get_medium_articles', 'get_news_headlines', 'get_package_info',
  'search_github_repos', 'get_github_issues', 'analyze_code_complexity', 'detect_language', 'validate_json',
  'get_fear_greed_history', 'get_stock_quote', 'get_onchain_activity', 'binance_orderbook',
  'get_hacker_news_comments', 'get_country_info', 'get_uuid', 'random_user', 'generate_mermaid', 'convert_units',
  'extract_entities', 'check_password_strength', 'get_history_today', 'get_timezone', 'get_moon_phase',
  'get_qr_code', 'get_global_market', 'get_ohlcv', 'whale_scan', 'get_defi_tvl', 'get_sol_balance',
  'get_eth_balance', 'get_exchange_rates', 'get_github_trending', 'get_reddit_posts', 'get_arxiv_papers',
  'get_gas_price', 'get_nft_floor', 'analyze_sentiment', 'format_data', 'hash_text', 'base64_codec',
  'extract_keywords', 'markdown_to_html', 'translate_text', 'count_tokens', 'search_npm', 'get_weather',
  'get_token_info', 'calculate', 'hl_prices', 'hl_account'
]);
