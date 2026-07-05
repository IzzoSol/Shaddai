/**
 * context-compress.test.cjs
 * Plain-node test runner (no framework) for context-compress.js
 * Run: node context-compress.test.cjs
 */

'use strict';

const {
  estimateTokens,
  compressToolOutput,
  compactHistory,
} = require('./context-compress.js');

let passed = 0;
let failed = 0;

function check(label, actual, expected) {
  if (String(actual) === String(expected)) {
    passed++;
    console.log(`  PASS  ${label}`);
  } else {
    failed++;
    console.log(`  FAIL  ${label}`);
    console.log(`        expected: ${expected}`);
    console.log(`        actual:   ${actual}`);
  }
}

/* --------------------- fixtures --------------------- */

// Build a big JSON-string tool output (~2-4 KB).
function bigJsonBlob(n) {
  const arr = [];
  for (let i = 0; i < n; i++) {
    arr.push({
      symbol: `coin${i}`,
      price: `$${(i * 137.5).toFixed(2)}`,
      change24h: `${(i % 10) - 5}.${i}%`,
      volume: i * 100000,
      note: 'lorem ipsum dolor sit amet consectetur adipiscing elit',
    });
  }
  return JSON.stringify(arr);
}

function makeHistory() {
  return [
    { role: 'system', content: 'You are SHADDAI, a helpful multi-agent orchestrator. Stay terse.' },
    { role: 'user', content: 'analyze the BTC market and the top alts' },
    { role: 'assistant', content: 'I will fetch the price data', tool_calls: [{ id: 'call_1', type: 'function' }] },
    { role: 'tool', content: bigJsonBlob(40) }, // big
    { role: 'assistant', content: 'Got prices, fetching news now' },
    { role: 'tool', content: bigJsonBlob(50) }, // big
    { role: 'assistant', content: 'Now searching social sentiment' },
    { role: 'tool', content: bigJsonBlob(45) }, // big
    { role: 'user', content: 'ok summarize what you found so far please' },
    { role: 'assistant', content: 'Summary: BTC is up, alts mixed.' },
  ];
}

/* --------------------- tests --------------------- */

// 1. estimateTokens
check('estimateTokens("abcd") === 1', estimateTokens('abcd'), 1);
check('estimateTokens("") === 0', estimateTokens(''), 0);
check('estimateTokens(null) === 0', estimateTokens(null), 0);
check('estimateTokens(undefined) === 0', estimateTokens(undefined), 0);
check('estimateTokens(12345) === 2', estimateTokens(12345), 2);

// 2. short strings unchanged
const shortStr = 'hello world, this is short';
check('compressToolOutput leaves short string unchanged', compressToolOutput(shortStr), shortStr);

// 3. long plain string truncated with marker, bounded length
const longPlain = 'x'.repeat(5000);
const truncated = compressToolOutput(longPlain, 800);
check('long plain string is shorter than input', truncated.length < longPlain.length, true);
check('long plain string contains compression marker', truncated.includes('[compressed'), true);
check('truncated length within maxChars + marker budget', truncated.length <= 800 + 60, true);

// 4. long JSON array keeps leading items + omitted marker
const longArr = bigJsonBlob(60);
const arrComp = compressToolOutput(longArr, 800);
check('JSON array compressed is shorter than input', arrComp.length < longArr.length, true);
check('JSON array compressed includes omitted marker', arrComp.includes('more items omitted'), true);
check('JSON array compressed still starts as array', arrComp.trim().startsWith('['), true);

// 5. under budget -> unchanged, saved === 0
const tiny = [
  { role: 'system', content: 'sys' },
  { role: 'user', content: 'hi' },
  { role: 'assistant', content: 'hello' },
];
const tinyRes = compactHistory(tiny, { budget: 3000 });
check('under-budget saved === 0', tinyRes.saved, 0);
check('under-budget before === after', tinyRes.before === tinyRes.after, true);
check('under-budget keeps same message count', tinyRes.messages.length, tiny.length);

// 6. over budget compaction behavior
const hist = makeHistory();
const snapshot = JSON.stringify(hist);
const res = compactHistory(hist, { budget: 500, keepRecent: 4, maxChars: 800 });

check('over-budget after <= before', res.after <= res.before, true);
check('over-budget saved >= 0', res.saved >= 0, true);
check('over-budget saved > 0 (big tool outputs)', res.saved > 0, true);

// system message content unchanged (byte-for-byte)
check('system content unchanged', res.messages[0].content, hist[0].content);

// last user message unchanged (index 8)
check('last user content unchanged', res.messages[8].content, hist[8].content);

// most recent keepRecent(4) messages unchanged: indices 6,7,8,9
check('recent msg[6] unchanged', res.messages[6].content, hist[6].content);
check('recent msg[7] unchanged', res.messages[7].content, hist[7].content);
check('recent msg[8] unchanged', res.messages[8].content, hist[8].content);
check('recent msg[9] unchanged', res.messages[9].content, hist[9].content);

// an older tool message (index 3) WAS compressed
check('older tool msg[3] was compressed', res.messages[3].content.length < hist[3].content.length, true);

// tool_calls preserved on assistant msg[2]
check('tool_calls preserved on assistant', Array.isArray(res.messages[2].tool_calls), true);

// 7. input not mutated
check('input messages not mutated', JSON.stringify(hist), snapshot);

// extra: returns a new array (not same reference)
check('returns new array reference', res.messages === hist, false);

// extra: defensive on non-array input
const bad = compactHistory(null);
check('non-array input returns empty messages', bad.messages.length, 0);
check('non-array input saved 0', bad.saved, 0);

// extra: non-string content not corrupted
const structured = [
  { role: 'system', content: 'sys' },
  { role: 'user', content: 'q' },
  { role: 'tool', content: { big: 'x'.repeat(4000) } }, // non-string
  { role: 'tool', content: 'y'.repeat(4000) },
  { role: 'assistant', content: 'a' },
  { role: 'user', content: 'final' },
];
const sres = compactHistory(structured, { budget: 200, keepRecent: 2, maxChars: 800 });
check('non-string tool content left as object', typeof sres.messages[2].content, 'object');
check('non-string tool content preserved', sres.messages[2].content.big.length, 4000);

/* --------------------- results --------------------- */

console.log(`\nResults: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
