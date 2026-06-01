'use strict';
/**
 * SHADDAI Tool Audit — Phase 1 evidence gathering
 * Runs every tool with sample args, records pass/fail/ms/error.
 */

const { TOOLS } = require('../backend/agent-engine.js');

// Sensible default arg map keyed by schema param name
const SAMPLE_ARGS = {
  // generic text
  prompt: 'a neon city at night',
  query: 'bitcoin',
  text: 'hello world this is a test message',
  message: 'hello',
  symbol: 'bitcoin',
  coin: 'bitcoin',
  token: 'bitcoin',
  url: 'https://example.com',
  address: '0x0000000000000000000000000000000000000000',
  code: '1 + 1',
  when: 'in 2 hours',
  action: 'ping',
  expression: 'sqrt(144) * 2',
  markdown: '# Hello\n**bold** text',
  data: '[{"name":"Alice","score":10},{"name":"Bob","score":20}]',
  format: 'markdown_table',
  word: 'ephemeral',
  topic: 'artificial intelligence',
  language: 'javascript',
  pattern: 'api',
  target: 'es',
  source: 'en',
  city: 'New York',
  country: 'Japan',
  ip: '8.8.8.8',
  hex: 'FF6B35',
  mode: 'analogic',
  encoded: 'aGVsbG8=',
  input: 'hello world',
  password: 'P@ssw0rd!longer',
  timezone: 'America/New_York',
  tag: 'success',
  category: 'Programming',
  subreddit: 'technology',
  repo: 'microsoft/vscode',
  owner: 'vercel',
  limit: 3,
  count: 2,
  days: 7,
  algorithm: 'sha256',
  pattern: '\\w+',
  flags: 'g',
  filename: 'test.txt',
  content: 'hello file content',
  subject: 'test subject',
  agent: 'NEXUS',
  key: 'test-key',
  value: 'test-value',
  name: 'Test Collectible',
  rarity: 'common',
  owner: 'NEXUS',
  id: 1,
  priceCredits: 10,
  jobId: 'job-001',
  bidCredits: 100,
  eta: '1 day',
  deliverable: 'done',
  collectible_id: 1,
  buyer: 'test-buyer',
  buyer_credits: 100,
  pack_id: 'pack-test',
  user: 'test-user',
  from: 'USD',
  to: 'EUR',
  amount: 100,
  state: 'idle',
  mood: 'happy',
  items: [1, 2],
  target_agent: 'NEXUS',
  system_prompt: 'You are helpful.',
  price_credits: 10,
  tools: ['search_web'],
  steps: [{ agent: 'NEXUS', goal: 'test' }],
  stopOnFail: false,
  currencies: 'EUR,GBP',
  pack: 'express',
  json_string: '{"foo":"bar"}',
  type: 'flowchart',
  description: 'A->B->C',
  sentences: 3,
  target_tokens: 100,
  account_size: 1000,
  risk_percent: 1,
  entry_price: 100,
  stop_loss_price: 90,
  text1: 'hello world',
  text2: 'hello there',
  story_id: null,
  // network
  host: 'localhost',
  port: 3000,
  // GitHub
  language: 'javascript',
  // url_clean
  // Reddit
  // ArXiv
  // Jupiter
  inputMint: 'So11111111111111111111111111111111111111112',
  outputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  // ETH
  // sol address
  // misc
  method: 'GET',
  lat: '40.7128',
  lon: '-74.0060',
  columns: 'name,score',
  from2: 'C',
  to2: 'F',
  value2: '100',
};

function buildArgs(schema) {
  if (!schema || typeof schema !== 'object') return {};
  const args = {};
  for (const key of Object.keys(schema)) {
    // Special per-key overrides
    if (key === 'address') {
      // Could be ETH or SOL — use ETH for get_eth_balance, SOL for get_sol_balance
      args[key] = '0x0000000000000000000000000000000000000000';
    } else if (key in SAMPLE_ARGS) {
      args[key] = SAMPLE_ARGS[key];
    } else {
      // fallback: use 'hello' for strings, 1 for numbers
      const desc = String(schema[key] || '');
      args[key] = desc.includes('number') || desc.includes('int') ? 1 : 'hello';
    }
  }
  return args;
}

// Fix sol address for SOL-specific tools
const SOL_ADDRESS = 'GjwpgEaeBbEbJ5jvnRDmS3tJFxRE8iiHUEhkDWcbFb1x';

const TOOL_ARG_OVERRIDES = {
  get_sol_balance: { address: SOL_ADDRESS },
  get_sol_token_info: { address: 'So11111111111111111111111111111111111111112' },
  get_nft_floor: { symbol: 'okay_bears' },
  get_github_repo: { repo: 'microsoft/vscode' },
  get_github_trending: { language: 'javascript', topic: '' },
  get_rss_feed: { url: 'https://feeds.feedburner.com/TechCrunch', limit: 3 },
  translate_text: { text: 'hello', target: 'es', source: 'en' },
  regex_test: { pattern: '\\w+', flags: 'g', text: 'hello world' },
  get_country_info: { country: 'Japan' },
  get_weather: { city: 'London' },
  weather_live: { city: 'London' },
  get_timezone: { timezone: 'America/New_York' },
  get_color_palette: { hex: 'FF6B35', mode: 'analogic' },
  get_qr_code: { data: 'https://example.com' },
  shorten_url: { url: 'https://example.com' },
  check_port: { host: 'localhost', port: 3000 },
  hash_text: { text: 'hello', algorithm: 'sha256' },
  base64_codec: { input: 'hello', mode: 'encode' },
  calculate: { expression: 'sqrt(144)' },
  run_js: { code: '1+1' },
  check_security: { code: 'const x = 1;' },
  write_file: { filename: 'audit-test.txt', content: 'test' },
  read_file: { filename: 'audit-test.txt' },
  format_data: { data: '[{"name":"Alice","score":10}]', format: 'markdown_table' },
  analyze_sentiment: { text: 'bitcoin is going to the moon great gains' },
  extract_keywords: { text: 'bitcoin blockchain cryptocurrency trading profit market analysis', limit: 5 },
  count_tokens: { text: 'hello world this is a sample text for token counting' },
  markdown_to_html: { markdown: '# Hello\n**bold** text' },
  translate_text: { text: 'hello', target: 'es', source: 'en' },
  save_to_inbox: { subject: 'Audit Test', content: 'Test content', agent: 'NEXUS' },
  save_memory: { key: 'audit-test', value: 'test123', agent: 'NEXUS' },
  get_memory: { key: 'audit-test', agent: 'NEXUS' },
  mint_collectible: { name: 'Audit Gem', rarity: 'common', owner: 'NEXUS' },
  list_collectible: { id: 1, priceCredits: 10 },
  bid_on_job: { jobId: 'job-001', agent: 'NEXUS', bidCredits: 100, eta: '1 day' },
  complete_job: { jobId: 'job-001', agent: 'NEXUS', deliverable: 'done' },
  execute_trade: { collectible_id: 1, buyer: 'test-buyer', buyer_credits: 1000 },
  delegate_to_agent: { agent: 'NEXUS', task: 'say hello' },
  get_exchange_rates: { currencies: 'EUR,GBP' },
  get_ohlcv: { symbol: 'bitcoin', days: 7 },
  get_token_info: { symbol: 'solana' },
  whale_scan: { query: 'bitcoin' },
  fetch_url: { url: 'https://example.com' },
  fetch_url_clean: { url: 'https://example.com' },
  get_hackernews: { limit: 3 },
  get_rss_feed: { url: 'https://hnrss.org/frontpage', limit: 3 },
  screenshot_url: { url: 'https://example.com', width: 800 },
  search_npm: { query: 'express', limit: 3 },
  get_github_issues: { owner: 'vercel', repo: 'next.js', limit: 3 },
  search_github_repos: { query: 'AI agent', language: 'javascript', limit: 3 },
  get_package_info: { package: 'express' },
  diff_texts: { text1: 'hello world', text2: 'hello there' },
  validate_json: { json_string: '{"foo":"bar"}' },
  convert_units: { value: 100, from: 'c', to: 'f' },
  analyze_code_complexity: { code: 'function hello() { return 1; }' },
  detect_language: { code: 'const x = require("express");' },
  generate_mermaid: { type: 'flowchart', description: 'A->B->C' },
  summarize_text: { text: 'The quick brown fox jumps over the lazy dog. This is a test sentence. Another sentence here.', sentences: 2 },
  extract_entities: { text: 'Bitcoin hit $50,000 on January 15, 2024. Contact: test@example.com' },
  compress_prompt: { text: 'This is a long text that needs to be compressed. It has many sentences. Each sentence adds to the total count. We need to reduce it significantly for LLM processing.', target_tokens: 20 },
  generate_code_template: { language: 'javascript', pattern: 'api' },
  check_password_strength: { password: 'P@ssw0rd!longer123' },
  grammar_check: { text: 'This sentence have a error.', language: 'en-US' },
  get_wikipedia_summary: { topic: 'Artificial intelligence' },
  encode_base64: { text: 'hello world' },
  decode_base64: { encoded: 'aGVsbG8gd29ybGQ=' },
  get_uuid: { count: 2 },
  get_random_quote: { tag: 'success' },
  get_joke: { category: 'Programming' },
  get_word_definition: { word: 'ephemeral' },
  get_ip_info: { ip: '8.8.8.8' },
  get_country_info: { country: 'Japan' },
  get_stock_quote: { symbol: 'AAPL' },
  get_crypto_news: {},
  get_gas_price: {},
  get_history_today: {},
  get_moon_phase: {},
  get_trending: {},
  get_fear_greed: {},
  get_fear_greed_history: {},
  get_global_market: {},
  get_defi_tvl: { limit: 5 },
  get_dominance: {},
  get_stablecoin_data: {},
  get_onchain_activity: {},
  get_funding_rates: { symbol: 'BTC' },
  get_top_gainers: { limit: 5 },
  dex_price: { symbol: 'SOL' },
  binance_price: { symbol: 'BTC' },
  binance_orderbook: { symbol: 'BTC' },
  get_eth_gas: {},
  calculate_position_size: { account_size: 1000, risk_percent: 1, entry_price: 100, stop_loss_price: 90 },
  get_protocol_revenue: { protocol: 'uniswap' },
  get_sol_token_info: { address: 'So11111111111111111111111111111111111111112' },
  fetch_price: { symbol: 'bitcoin' },
  binance_price: { symbol: 'BTC' },
  search_web: { query: 'bitcoin' },
  wikipedia_search: { query: 'bitcoin' },
  get_reddit_posts: { subreddit: 'technology' },
  get_arxiv_papers: { query: 'large language models' },
  get_hacker_news_comments: { story_id: null },
  get_news_headlines: { topic: 'technology', limit: 5 },
  get_stackoverflow: { tag: 'javascript', limit: 3 },
  get_medium_articles: { topic: 'artificial-intelligence', limit: 3 },
  get_product_hunt: { limit: 3 },
  get_trending_topics: { source: 'hn' },
  search_web_ddg: { query: 'bitcoin' },
  format_as_table: { data: '[{"name":"Alice","score":10},{"name":"Bob","score":20}]', columns: 'name,score' },
  weather_live: { city: 'London' },
  geocode_address: { query: 'Eiffel Tower, Paris' },
  get_forex_rate: { from: 'USD', to: 'EUR', amount: 1 },
  get_crypto_backup: { symbol: 'BTC' },
  remember_fact: { key: 'audit', value: 'test', agent: 'global' },
  recall_memory: { key: 'audit', agent: 'global' },
  post_webhook: { url: 'https://httpbin.org/post', data: { test: true }, method: 'POST' },
  set_agent_room_state: { agent: 'NEXUS', state: 'idle', mood: 'calm' },
  save_room_layout: { agent: 'NEXUS', items: [1, 2] },
  get_agent_mood: { agent: 'NEXUS' },
  create_skill_pack: { name: 'Test Pack', author: 'Audit', target_agent: 'NEXUS', system_prompt: 'You are helpful.', price_credits: 0, tools: [] },
  list_skill_packs: { target_agent: 'NEXUS' },
  install_skill_pack: { pack_id: 'pack-nonexistent', user: 'audit-user' },
  run_workflow_chain: { steps: [{ agent: 'NEXUS', goal: 'hello' }], stopOnFail: false },
  list_files: {},
  list_open_jobs: {},
  browse_listings: {},
  list_scheduled_tasks: {},
  get_public_apis: { query: 'crypto' },
  get_public_apis: { query: 'weather' },
  run_python: { code: 'print("hello from python")' },
  read_obsidian_skill: { skill: 'market-brief' },
  schedule_task: { when: 'in 2 hours', action: 'test action', agent: 'NEXUS' },
  generate_image: { prompt: 'a neon city', model: 'flux', width: 512, height: 512 },
  generate_image_free: { prompt: 'a neon city', width: 512, height: 512 },
  run_local_llm: { prompt: 'say hello', model: 'llama3.2:1b' },
  jupiter_quote: { inputMint: 'So11111111111111111111111111111111111111112', outputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', amount: 1000000 },
  random_user: { count: 1 },
  pay_api_call: { url: 'https://example.com', method: 'GET', est_cost_usd: 0.01 },
  post_discord: { message: 'test', title: 'Audit' },
  send_telegram: { message: 'test audit message', chat_id: '123' },
  create_github_issue: { owner: 'test', repo: 'test', title: 'Test Issue', body: 'Test body', labels: 'bug' },
  shorten_url: { url: 'https://example.com' },
};

// Tools to skip (require env keys that definitely won't be set)
const SKIP_TOOLS = new Set([
  'delegate_to_agent', // Calls full LLM loop — too slow for audit
  'run_workflow_chain', // Queues/logs only, no real execution here
  'run_local_llm',     // Needs Ollama running locally
  'pay_api_call',      // Needs pay-guard + Solana wallet
]);

// Tools that legitimately need an API key
const NEEDS_KEY = new Set([
  'post_discord',      // DISCORD_WEBHOOK_URL
  'send_telegram',     // TELEGRAM_BOT_TOKEN
  'create_github_issue', // GITHUB_TOKEN
]);

async function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

async function runAudit() {
  const toolNames = Object.keys(TOOLS);
  console.log(`\n${'='.repeat(60)}`);
  console.log(`SHADDAI TOOL AUDIT — ${toolNames.length} tools`);
  console.log(`${'='.repeat(60)}\n`);

  const results = [];
  const TIMEOUT_MS = 15000;

  for (const name of toolNames) {
    const tool = TOOLS[name];
    if (!tool || typeof tool.execute !== 'function') {
      results.push({ name, ok: false, ms: 0, error: 'No execute() function' });
      continue;
    }

    if (SKIP_TOOLS.has(name)) {
      results.push({ name, ok: true, ms: 0, error: null, note: 'SKIPPED (slow/external)' });
      continue;
    }

    if (NEEDS_KEY.has(name)) {
      results.push({ name, ok: true, ms: 0, error: null, note: 'SKIPPED (needs API key env var)' });
      continue;
    }

    // Build args: prefer explicit override, else derive from schema
    const override = TOOL_ARG_OVERRIDES[name];
    const args = override !== undefined ? override : buildArgs(tool.schema || {});

    const t0 = Date.now();
    try {
      const result = await withTimeout(tool.execute(args), TIMEOUT_MS);
      const ms = Date.now() - t0;
      // Check for "meaningful" result — not null/undefined/empty
      if (result === null || result === undefined) {
        results.push({ name, ok: false, ms, error: 'Returned null/undefined' });
      } else {
        const str = String(result);
        results.push({ name, ok: true, ms, result: str.slice(0, 120) });
      }
    } catch (e) {
      const ms = Date.now() - t0;
      results.push({ name, ok: false, ms, error: e.message?.slice(0, 200) || String(e) });
    }
  }

  // Print results
  const passed = results.filter(r => r.ok);
  const failed = results.filter(r => !r.ok);
  const skipped = results.filter(r => r.note);

  console.log('RESULTS:\n');
  for (const r of results) {
    const status = r.note ? `SKIP  [${r.note}]` : r.ok ? `PASS  (${r.ms}ms)` : `FAIL  (${r.ms}ms) — ${r.error}`;
    console.log(`  ${r.ok || r.note ? '✓' : '✗'} ${r.name.padEnd(35)} ${status}`);
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`SUMMARY: ${passed.length} passed, ${failed.length} failed, ${skipped.length} skipped out of ${toolNames.length} total`);
  console.log(`${'='.repeat(60)}\n`);

  if (failed.length > 0) {
    console.log('FAILED TOOLS:\n');
    for (const r of failed) {
      console.log(`  ✗ ${r.name}`);
      console.log(`    Error: ${r.error}`);
    }
  }

  return { results, passed: passed.length, failed: failed.length, skipped: skipped.length, total: toolNames.length, failures: failed };
}

runAudit().catch(e => {
  console.error('Audit crashed:', e.message);
  process.exit(1);
});
