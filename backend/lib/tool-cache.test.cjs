'use strict';
/**
 * backend/lib/tool-cache.test.cjs — plain-node tests for the tool-result cache.
 * Run: node backend/lib/tool-cache.test.cjs
 */
const tc = require('./tool-cache');

let passed = 0, failed = 0;
function check(label, actual, expected) {
  if (String(actual) === String(expected)) { console.log(`  PASS  ${label}`); passed++; }
  else { console.error(`  FAIL  ${label}\n        expected ${JSON.stringify(expected)} got ${JSON.stringify(actual)}`); failed++; }
}

// ── clock we control ──
let clock = 1_000_000;
tc.__setClock(() => clock);

// ── TTL policy ──
console.log('\n=== TTL POLICY ===');
check('fetch_price → 45s',        tc.ttlFor('fetch_price'), 45000);
check('get_fear_greed → 45s',     tc.ttlFor('get_fear_greed'), 45000);
check('get_crypto_news → 5min',   tc.ttlFor('get_crypto_news'), 300000);
check('github_repo → 2h',         tc.ttlFor('github_repo'), 7200000);
check('define_word → 2h',         tc.ttlFor('define_word'), 7200000);
check('post_tweet → never (0)',   tc.ttlFor('post_tweet'), 0);
check('mint_nft → never (0)',     tc.ttlFor('mint_nft'), 0);
check('generate_image → never',   tc.ttlFor('generate_image'), 0);
check('unknown_tool → 60s default', tc.ttlFor('something_else'), 60000);

// ── mutation-safety: CRUD + financial mutations must NEVER cache (regression) ──
console.log('\n=== MUTATION SAFETY (never cache state changes) ===');
for (const t of ['update_config','deleteUser','remove_item','edit_post','patch_record','http_put','withdraw_funds','deposit_sol','stake_sol','claim_reward','revoke_key','cancel_order','swap_tokens','insert_row','execute_trade']) {
  check(`${t} → never (0)`, tc.ttlFor(t), 0);
}
// ── read tools whose names merely CONTAIN a mutation substring must still cache ──
console.log('\n=== NO FALSE-BLOCK (word boundaries) ===');
check('get_credit still caches (not "edit")', tc.ttlFor('get_credit') > 0, true);
check('compute_score still caches (not "put")', tc.ttlFor('compute_score') > 0, true);
check('design_doc still caches (not "sign")', tc.ttlFor('design_doc') > 0, true);
check('output_summary still caches (not "put")', tc.ttlFor('output_summary') > 0, true);
check('settings still caches (not "set")', tc.ttlFor('settings') > 0, true);

// ── caching a read tool: 2nd identical call is a HIT (no 2nd real call) ──
console.log('\n=== READ TOOL CACHING ===');
tc._reset();
let realCalls = 0;
const priceTool = { name: 'fetch_price', async execute(p) { realCalls++; clock += 50; return JSON.stringify({ sym: p.symbol, n: realCalls }); } };
const TOOLS = { fetch_price: priceTool, post_tweet: { name: 'post_tweet', async execute() { realCalls++; return 'posted'; } } };
check('wrapAll wraps 2 tools', tc.wrapAll(TOOLS), 2);

(async () => {
  const a = await TOOLS.fetch_price.execute({ symbol: 'bitcoin' });
  const b = await TOOLS.fetch_price.execute({ symbol: 'bitcoin' });   // HIT
  check('same params → identical result', a, b);
  check('real API called only once',      realCalls, 1);
  check('different params → real call',   JSON.parse(await TOOLS.fetch_price.execute({ symbol: 'ethereum' })).n, 2);

  // ── TTL expiry: after 45s the entry is stale → real call again ──
  console.log('\n=== TTL EXPIRY ===');
  const before = realCalls;
  clock += 46000;                                   // advance past 45s TTL
  await TOOLS.fetch_price.execute({ symbol: 'bitcoin' });
  check('stale entry re-fetches', realCalls, before + 1);

  // ── mutating tool is NEVER cached ──
  console.log('\n=== MUTATING TOOL NOT CACHED ===');
  const m0 = realCalls;
  await TOOLS.post_tweet.execute({ text: 'gm' });
  await TOOLS.post_tweet.execute({ text: 'gm' });   // must call twice (no cache)
  check('post_tweet executes every time', realCalls - m0, 2);

  // ── stats reflect real saves ──
  console.log('\n=== STATS ===');
  const s = tc.getStats();
  check('pullsSaved counted (>=1)', s.pullsSaved >= 1, true);
  check('realPulls counted',        s.realPulls >= 3, true);
  check('cachedEndpoints tracked',  s.cachedEndpoints >= 1, true);
  check('topTools has fetch_price', s.topTools.some(t => t.name === 'fetch_price'), true);

  // ── disabled mode bypasses entirely ──
  console.log('\n=== DISABLE SWITCH ===');
  tc._reset();
  process.env.TOOL_CACHE = 'off';
  const c0 = realCalls;
  await TOOLS.fetch_price.execute({ symbol: 'solana' });
  await TOOLS.fetch_price.execute({ symbol: 'solana' });   // no cache when off
  check('TOOL_CACHE=off → both call through', realCalls - c0, 2);
  delete process.env.TOOL_CACHE;

  console.log(`\n${'='.repeat(50)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
