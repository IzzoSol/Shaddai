'use strict';
// backend/lib/grounding.test.cjs — anti-larp / anti-garble guardrail tests.
const g = require('./grounding');
let passed = 0, failed = 0;
function check(label, actual, expected) {
  if (String(actual) === String(expected)) { console.log(`  PASS  ${label}`); passed++; }
  else { console.error(`  FAIL  ${label}\n        expected ${JSON.stringify(expected)} got ${JSON.stringify(actual)}`); failed++; }
}

console.log('\n=== needsRealData ===');
check('btc price needs data',      g.needsRealData('what is the bitcoin price'), true);
check('fear & greed needs data',   g.needsRealData('current fear and greed index'), true);
check('write a poem (no data)',    g.needsRealData('write a poem about the ocean'), false);

console.log('\n=== looksFabricated (THE anti-larp guard) ===');
// the real failure we saw: 1B model said "$43,718.12" for a price goal with NO tools called
check('larp: $price, 0 tools, data goal', g.looksFabricated('Bitcoin is $43,718.12 right now', 0, 'bitcoin price'), true);
check('larp: percent, 0 tools',           g.looksFabricated('It is down 2.9% today', 0, 'btc price today'), true);
check('ok: specifics WITH tools',         g.looksFabricated('Bitcoin is $58,500', 3, 'bitcoin price'), false);
check('ok: no specifics',                 g.looksFabricated('Sentiment looks bearish overall.', 0, 'btc price'), false);
check('ok: not a data goal',              g.looksFabricated('A haiku has 17 syllables', 0, 'write a haiku'), false);

console.log('\n=== synthesisGrounded (anti-garble/drift) ===');
const realData = '[fetch_price] {"symbol":"bitcoin","price":"$58,500","change24h":"-3.01%"}';
check('grounded: reuses real numbers', g.synthesisGrounded('Bitcoin is $58,500, down 3.01% on the day.', realData), true);
check('DRIFT: invented numbers',       g.synthesisGrounded('Bitcoin is $44,700 and up 12,566.84 points', realData), false);
check('no numbers in synth → ok',      g.synthesisGrounded('The market looks weak today.', realData), true);

console.log('\n=== formatToolData (deterministic fallback) ===');
const steps = [
  { tool: 'fetch_price', result: JSON.stringify({ symbol: 'bitcoin', price: '$58,500', change24h: '-3.01%', marketCap: '$1172.88B' }) },
  { tool: 'get_fear_greed', result: JSON.stringify({ today: { score: '29', label: 'Fear' } }) },
  { tool: 'get_x', error: 'timeout' }
];
const out = g.formatToolData(steps, { title: 'Snapshot' });
check('includes real price',  /Bitcoin: \$58,500/.test(out), true);
check('includes fear&greed',  /Fear & Greed: 29/.test(out), true);
check('shows error line',     /unavailable: timeout/.test(out), true);
check('never throws on junk',  (() => { try { g.formatToolData(null); g.formatToolData([{tool:'x',result:undefined}]); return 'ok'; } catch (e) { return 'threw'; } })(), 'ok');

console.log('\n=== honestUnverified ===');
check('honest msg, no fake numbers', /\$\d/.test(g.honestUnverified('btc price')), false);

console.log(`\n${'='.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
