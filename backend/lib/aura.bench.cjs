#!/usr/bin/env node
/* AURA benchmark — proves the deterministic layer is REAL (not larp) and measures success rate.
 *
 * Three things are measured, each with a target:
 *   1) COMPUTE CORRECTNESS — labeled prompts must return the exact right answer (no LLM).   target 100%
 *   2) SAFETY / PRECISION  — open-ended/opinion prompts must be DECLINED (hit:false),         target 100%
 *                            so AURA never fabricates an answer it can't actually compute.
 *   3) RECIPE ROUTING      — recurring task goals must route to the correct deterministic     target >80%
 *                            recipe (the AINL fast-path), and unrelated goals must NOT.
 *
 * Run:  node backend/lib/aura.bench.cjs        (exits non-zero if overall < 0.80)
 */
const path = require('path');
const aura = require(path.join(__dirname, 'aura.js'));
let skillIndex; try { skillIndex = require(path.join(__dirname, '..', 'skill-index.js')); } catch (_) {}

// ── 1) COMPUTE CORRECTNESS — every one of these is solved in pure JS, zero LLM ──
const COMPUTE = [
  ['average of 12, 18, 30', '20'],
  ['sum of 5 10 15', '30'],
  ['max of 3, 9, 4', '9'],
  ['min of 3, 9, 4', '3'],
  ['255 in hex', '0xFF'],
  ['0b1010 in decimal', '10'],
  ['roman numeral for 2025', 'MMXXV'],
  ['XIV in decimal', '14'],
  ['factorial of 5', '120'],
  ['6!', '720'],
  ['gcd of 12 and 8', '4'],
  ['lcm of 4 and 6', '12'],
  ['is 17 prime', 'Yes, 17 is prime'],
  ['3 hours in minutes', '180 minutes'],
  ['1 gb to mb', '1024 mb'],
  ['10 km to miles', '6.213712 miles'],
  ['100 c to f', '212 f'],
  ['15% of 240', '36'],
  ['20% off 80', '64 (you save 16)'],
  ['12 * 12', '144'],
  ['(3 + 4) * 5', '35'],
  ['2^10', '1024'],
  ['format 1000000 with commas', '1,000,000'],
  ['uppercase: hello world', 'HELLO WORLD'],
  ['reverse: abc', 'cba'],
  ['word count of: the quick brown fox', '4'],
  ['base64 encode hello', 'aGVsbG8='],
];

// ── 2) SAFETY — AURA must DECLINE these (return hit:false): it can't truly compute them ──
const MUST_DECLINE = [
  'write a haiku about autumn rain',
  'what is the meaning of life',
  'explain quantum entanglement to a child',
  'should I buy Tesla stock',           // also volatile
  'give me a marketing slogan for shoes',
  'what is the current price of bitcoin', // volatile — must pass through
  'summarize the French revolution',
];

// ── 3) RECIPE ROUTING — recurring goals must match the right deterministic recipe ──
// [goal, expectedRecipeIdOrNull]   (null = must NOT route to any recipe / falls back to LLM)
const ROUTING = [
  ['give me the daily market snapshot with btc eth sol prices and fear and greed', 'daily-market-snapshot'],
  ['run a full market report', 'full-market-report'],
  ['what is bitcoin dominance right now, altcoin season?', 'btc-dominance-analysis'],
  ['scan the top movers today', 'top-movers-scan'],
  ['ethereum gas tracker', 'eth-gas-tracker'],
  ['top defi protocols by tvl leaderboard', 'defi-leaderboard'],
  ['solana ecosystem pulse overview', 'solana-ecosystem-pulse'],
  ['write me a poem about the sea', null],
  ['help me debug my javascript', null],
  ['what should I cook for dinner', null],
];
const MIN_ROUTE_SCORE = 1.6;
function routeRecipe(goal) {
  if (!skillIndex) return null;
  const m = skillIndex.findSkills(goal, { includeRecipes: true, includeMd: false, includeObsidian: false, limit: 1 });
  if (!m.length || m[0].type !== 'recipe' || (m[0].score || 0) < MIN_ROUTE_SCORE) return null;
  return m[0].id;
}

// ── runner ──
let pass = 0, fail = 0; const fails = [];
function check(name, ok, detail) { if (ok) pass++; else { fail++; fails.push(name + (detail ? '  — ' + detail : '')); } }

console.log('\n=== 1) COMPUTE CORRECTNESS (pure-JS, no LLM) ===');
let cPass = 0;
for (const [prompt, expected] of COMPUTE) {
  const r = aura.route(prompt);
  const got = r.hit ? String(r.answer).trim() : '(declined)';
  const ok = r.hit && got === expected;
  if (ok) cPass++; check('compute: ' + prompt, ok, ok ? '' : `got "${got}" want "${expected}"`);
}
console.log(`  ${cPass}/${COMPUTE.length} correct`);

console.log('\n=== 2) SAFETY / PRECISION (must decline, never fabricate) ===');
let sPass = 0;
for (const prompt of MUST_DECLINE) {
  const r = aura.route(prompt);
  const ok = !r.hit;  // must be a miss → goes to the real LLM
  if (ok) sPass++; check('decline: ' + prompt, ok, ok ? '' : `WRONGLY answered "${String(r.answer).slice(0,40)}"`);
}
console.log(`  ${sPass}/${MUST_DECLINE.length} correctly declined (no false positives)`);

console.log('\n=== 3) RECIPE ROUTING (AINL deterministic fast-path) ===');
let rPass = 0;
for (const [goal, expected] of ROUTING) {
  const got = routeRecipe(goal);
  const ok = got === expected;
  if (ok) rPass++; check('route: ' + goal.slice(0, 42), ok, ok ? '' : `got "${got}" want "${expected}"`);
}
console.log(`  ${rPass}/${ROUTING.length} routed correctly`);

const total = pass + fail, rate = total ? pass / total : 0;
console.log('\n────────────────────────────────────────────');
console.log(`COMPUTE ${cPass}/${COMPUTE.length} · SAFETY ${sPass}/${MUST_DECLINE.length} · ROUTING ${rPass}/${ROUTING.length}`);
console.log(`OVERALL SUCCESS RATE: ${(rate * 100).toFixed(1)}%  (${pass}/${total})  — target ≥ 80%`);
if (fails.length) { console.log('\nFAILURES:'); fails.forEach(f => console.log('  ✗ ' + f)); }
console.log('');
process.exit(rate >= 0.80 ? 0 : 1);
