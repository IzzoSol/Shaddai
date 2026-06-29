#!/usr/bin/env node
/**
 * SHADDAI v79.9 — Full tool audit
 * Executes EVERY tool in the registry with sensible default params,
 * sequentially (to avoid Ollama/API contention on small machines),
 * and reports which return real data vs error vs throw.
 *
 * Usage: node backend/audit-tools.js
 */
const engine = require('./agent-engine');
const TOOLS = engine.TOOLS;

// Sensible test params per tool. Tools not listed get {} (use their defaults).
const PARAMS = {
  fetch_price: { symbol: 'bitcoin' },
  get_ohlcv: { symbol: 'bitcoin' },
  get_token_info: { symbol: 'bitcoin' },
  whale_scan: { symbol: 'bitcoin' },
  get_defi_tvl: { protocol: 'aave' },
  get_sol_balance: { address: 'So11111111111111111111111111111111111111112' },
  get_eth_balance: { address: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045' },
  get_exchange_rates: { base: 'USD' },
  jupiter_quote: { inputMint: 'So11111111111111111111111111111111111111112', outputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', amount: 1000000 },
  get_nft_floor: { symbol: 'okay_bears' },
  get_stock_quote: { symbol: 'AAPL' },
  get_crypto_news: { limit: 3 },
  get_gas_price: {},
  dex_price: { address: 'So11111111111111111111111111111111111111112' },
  binance_price: { symbol: 'BTC' },
  binance_orderbook: { symbol: 'BTC' },
  get_eth_gas: {},
  get_top_gainers: { limit: 5 },
  get_stablecoin_data: {},
  get_protocol_revenue: { protocol: 'aave' },
  get_fear_greed_history: {},
  calculate_position_size: { account_size: 1000, risk_percent: 2, entry_price: 100, stop_loss_price: 95 },
  get_sol_token_info: { address: 'So11111111111111111111111111111111111111112' },
  get_onchain_activity: {},
  get_funding_rates: { symbol: 'BTC' },
  get_dominance: {},
  search_web: { query: 'AI agents 2026' },
  wikipedia_search: { query: 'Solana blockchain' },
  get_wikipedia_summary: { topic: 'Bitcoin' },
  fetch_url: { url: 'https://example.com' },
  fetch_url_clean: { url: 'https://example.com' },
  screenshot_url: { url: 'https://example.com' },
  get_hackernews: {},
  get_rss_feed: { url: 'https://hnrss.org/frontpage' },
  get_reddit_posts: { subreddit: 'technology' },
  get_arxiv_papers: { query: 'language models' },
  get_weather: { city: 'London' },
  weather_live: { city: 'Tokyo' },
  get_country_info: { country: 'Japan' },
  get_ip_info: { ip: '8.8.8.8' },
  get_history_today: {},
  get_moon_phase: {},
  get_timezone: { timezone: 'America/New_York' },
  get_news_headlines: { topic: 'technology', limit: 3 },
  get_product_hunt: { limit: 3 },
  get_github_issues: { owner: 'vercel', repo: 'next.js', limit: 3 },
  search_web_ddg: { query: 'Solana' },
  get_stackoverflow: { tag: 'javascript', limit: 3 },
  get_medium_articles: { topic: 'ai' },
  get_hacker_news_comments: {},
  get_trending_topics: {},
  get_word_definition: { word: 'ephemeral' },
  detect_language: { code: 'def foo():\n  print("hi")' },
  translate_text: { text: 'hello world', target: 'es' },
  analyze_sentiment: { text: 'I love this product, it is amazing!' },
  extract_keywords: { text: 'Artificial intelligence and machine learning are transforming technology.' },
  extract_entities: { text: 'Apple released the iPhone in California on September 2024.' },
  summarize_text: { text: 'The quick brown fox jumps over the lazy dog. '.repeat(20) },
  count_tokens: { text: 'hello world this is a test' },
  format_data: { data: '{"a":1,"b":2}' },
  format_as_table: { data: [{ a: 1, b: 2 }] },
  markdown_to_html: { markdown: '# Title\n- item' },
  calculate: { expression: '2 + 2 * 10' },
  run_js: { code: 'return 2 + 2' },
  get_github_repo: { owner: 'solana-labs', repo: 'solana' },
  get_github_trending: {},
  search_npm: { query: 'express' },
  search_github_repos: { query: 'ai agent', limit: 3 },
  check_security: { code: 'const x = eval(userInput);' },
  check_password_strength: { password: 'P@ssw0rd123!' },
  regex_test: { pattern: '\\d+', text: 'abc 123' },
  analyze_code_complexity: { code: 'function f(){ if(a){ for(;;){} } }' },
  validate_json: { json: '{"valid": true}' },
  convert_units: { value: 100, from: 'km', to: 'mi' },
  get_package_info: { package: 'express' },
  diff_texts: { text1: 'hello world', text2: 'hello there' },
  hash_text: { text: 'password123' },
  base64_codec: { text: 'hello', mode: 'encode' },
  encode_base64: { text: 'hello' },
  decode_base64: { encoded: 'aGVsbG8=' },
  get_uuid: {},
  generate_uuid: {},
  generate_code_template: { language: 'python', type: 'cli' },
  generate_mermaid: { description: 'login flow' },
  get_color_palette: {},
  get_qr_code: { text: 'https://shaddai.ai' },
  get_random_quote: {},
  get_joke: {},
  random_user: {},
  get_public_apis: {},
  check_port: { host: 'google.com', port: 443 },
  shorten_url: { url: 'https://example.com/very/long/path' },
  get_word_count: { text: 'one two three' },
  compress_prompt: { text: 'Please could you kindly help me to understand this'.repeat(5) },
  generate_image: { prompt: 'a sunset' },
  generate_image_free: { prompt: 'a mountain' },
  write_file: { filename: '_audit_test.txt', content: 'audit test content' },
  read_file: { filename: '_audit_test.txt' },
  list_files: {},
  save_to_inbox: { message: 'audit test message' },
  save_memory: { key: 'audit_key', value: 'audit_value' },
  get_memory: { key: 'audit_key' },
  remember_fact: { key: 'audit_fact', value: 'remembered', agent: 'TEST' },
  recall_memory: { key: 'audit_fact', agent: 'TEST' },
  read_obsidian_skill: { skill: 'ad-creative' },
  mint_collectible: { name: 'Audit Gem', rarity: 'T3', owner: 'auditor' },
  browse_listings: {},
  list_skill_packs: {},
  set_agent_room_state: { agent: 'NEXUS', state: 'idle', mood: 'calm' },
  get_agent_mood: { agent: 'NEXUS' },
  list_open_jobs: {},
  get_global_market: {},
  get_fear_greed: {},
  get_trending: {},
  // LLM-dependent (skip in fast mode; tested separately): run_python, run_local_llm,
  // delegate_to_agent, post_discord, post_webhook, send_telegram, create_github_issue,
  // generate_uuid handled. translate via API.
};

// Tools to skip in the fast audit (need external creds, side effects, or LLM):
const SKIP = new Set([
  'run_local_llm',       // hits Ollama — tested via agent tasks
  'delegate_to_agent',   // spawns sub-task
  'post_discord',        // needs webhook
  'post_webhook',        // needs URL+side effect
  'send_telegram',       // needs bot token
  'create_github_issue', // needs token + side effect
  'run_python',          // subprocess, slow
  'mint_collectible',    // tested in e2e; avoid spamming data
  'list_collectible', 'bid_on_job', 'complete_job', 'execute_trade', // need ids
  'create_skill_pack', 'install_skill_pack',  // mutate marketplace
  'save_room_layout', 'run_workflow_chain',
]);

async function main() {
  const names = Object.keys(TOOLS).filter(n => !SKIP.has(n));
  console.log(`Auditing ${names.length} tools (${Object.keys(TOOLS).length} total, ${SKIP.size} skipped)...\n`);
  const ok = [], errored = [], threw = [], noschema = [];
  for (const name of names) {
    const tool = TOOLS[name];
    if (!tool.name || !tool.schema) noschema.push(name);
    const params = PARAMS[name] || {};
    try {
      const t0 = Date.now();
      const result = await Promise.race([
        tool.execute(params),
        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout 20s')), 20000))
      ]);
      const dt = Date.now() - t0;
      const str = String(result || '');
      const looksError = /^error|error:|failed|not found|unavailable|rate limit|invalid|no data|cannot/i.test(str.trim());
      if (looksError) {
        errored.push({ name, dt, msg: str.slice(0, 70) });
      } else {
        ok.push({ name, dt, preview: str.slice(0, 55).replace(/\n/g, ' ') });
      }
    } catch (e) {
      threw.push({ name, msg: e.message.slice(0, 70) });
    }
  }

  console.log('── OK (' + ok.length + ') ──');
  ok.forEach(r => console.log(`  ✓ ${r.name.padEnd(26)} ${String(r.dt).padStart(5)}ms  ${r.preview}`));
  if (errored.length) {
    console.log('\n── RETURNED ERROR/EMPTY (' + errored.length + ') ──');
    errored.forEach(r => console.log(`  ⚠ ${r.name.padEnd(26)} ${r.msg}`));
  }
  if (threw.length) {
    console.log('\n── THREW EXCEPTION (' + threw.length + ') ──');
    threw.forEach(r => console.log(`  ✗ ${r.name.padEnd(26)} ${r.msg}`));
  }
  if (noschema.length) {
    console.log('\n── MISSING name/schema (' + noschema.length + ') ──');
    console.log('  ' + noschema.join(', '));
  }
  console.log(`\nSUMMARY: ${ok.length} ok, ${errored.length} error/empty, ${threw.length} threw, ${noschema.length} no-schema`);
  process.exit(threw.length ? 1 : 0);
}
main().catch(e => { console.error('FATAL', e); process.exit(2); });
