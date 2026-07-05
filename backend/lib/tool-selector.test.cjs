/**
 * tool-selector.test.cjs — plain-node test runner (no framework).
 * Run: node backend/lib/tool-selector.test.cjs
 */

'use strict';

const { selectTools } = require('./tool-selector.js');

let passed = 0;
let failed = 0;

function check(label, actual, expected) {
  if (String(actual) === String(expected)) {
    passed++;
    console.log('  PASS: ' + label);
  } else {
    failed++;
    console.log('  FAIL: ' + label);
    console.log('        expected: ' + String(expected));
    console.log('        actual:   ' + String(actual));
  }
}

// ---- Fake tool catalog -------------------------------------------------
const tools = [
  {
    name: 'fetch_price',
    description: 'Live crypto price from CoinGecko. Returns USD price, 24h change, market cap, volume.',
    schema: { symbol: 'string — coin id e.g. bitcoin' },
    agents: ['SHADDAI', 'ZEROX', 'ORACLE']
  },
  {
    name: 'get_market_overview',
    description: 'Crypto market overview: total market cap, bitcoin dominance, top movers.',
    schema: {},
    agents: ['ZEROX', 'ORACLE']
  },
  {
    name: 'github_repo',
    description: 'Look up a GitHub repository: stars, forks, open issues, latest release.',
    schema: { owner: 'string', repo: 'string' },
    agents: ['NEXUS']
  },
  {
    name: 'npm_search',
    description: 'Search the npm registry for a package and return downloads and version.',
    schema: { query: 'string — package name' },
    agents: ['NEXUS']
  },
  {
    name: 'define_word',
    description: 'Dictionary definition of an English word with examples and synonyms.',
    schema: { word: 'string' },
    agents: ['QUILL']
  },
  {
    name: 'get_time',
    description: 'Current time in a given timezone.',
    schema: { tz: 'string' },
    agents: ['SHADDAI']
  },
  {
    name: 'get_weather',
    description: 'Current weather and forecast for a city.',
    schema: { city: 'string' },
    agents: ['ORACLE']
  },
  {
    name: 'web_search',
    description: 'General web search returning titles, snippets and URLs.',
    schema: { query: 'string' },
    agents: ['ORACLE', 'SHADDAI']
  }
];

console.log('tool-selector tests');

// 1. Crypto/markets goal ranks a market tool above an unrelated dictionary tool.
const r1 = selectTools('what is the bitcoin price and market cap', tools, { max: 5 });
const top1 = r1[0] && r1[0].name;
check('1a: top result is a market/price tool', top1 === 'fetch_price' || top1 === 'get_market_overview', true);
const names1 = r1.map(function (t) { return t.name; });
const priceIdx = names1.indexOf('fetch_price');
const defineIdx = names1.indexOf('define_word');
check('1b: price tool ranks above define_word',
  priceIdx !== -1 && (defineIdx === -1 || priceIdx < defineIdx), true);

// 2. Code goal ranks repo/npm tools into the top results.
const r2 = selectTools('look up the github repo and npm package', tools, { max: 4 });
const names2 = r2.map(function (t) { return t.name; });
check('2a: github_repo in top results', names2.indexOf('github_repo') !== -1, true);
check('2b: npm_search in top results', names2.indexOf('npm_search') !== -1, true);

// 3. max is respected (ignoring always).
const r3 = selectTools('bitcoin price market cap volume', tools, { max: 2, min: 1 });
check('3: returns <= max', r3.length <= 2, true);

// 4. min is respected for a nonsense goal with no matches.
const r4 = selectTools('zzzqqq xyloblargh nonsense', tools, { max: 8, min: 3 });
check('4: nonsense goal still returns >= min', r4.length >= 3, true);

// 5. always includes an irrelevant tool.
const r5 = selectTools('bitcoin price', tools, { max: 3, always: ['get_time'] });
const names5 = r5.map(function (t) { return t.name; });
check('5a: always tool present', names5.indexOf('get_time') !== -1, true);
check('5b: always tool pinned to front', names5[0], 'get_time');

// 6. Empty goal does not throw and returns a sane number of tools.
let r6, threw6 = false;
try {
  r6 = selectTools('', tools, { max: 5, min: 3 });
} catch (e) {
  threw6 = true;
}
check('6a: empty goal does not throw', threw6, false);
check('6b: empty goal returns within [min,max]', r6.length >= 3 && r6.length <= 5, true);

// 7. Defensive: tool missing description/schema does not crash.
const brokenTools = [
  { name: 'lonely_tool' },                       // no description, no schema
  { name: 'half_tool', schema: null },           // null schema
  { description: 'no name here', schema: {} },   // no name
  null,                                          // not even an object
  { name: 'web_search', description: 'search the web', schema: { q: 'string' } }
];
let r7, threw7 = false;
try {
  r7 = selectTools('search the web', brokenTools, { max: 4, min: 2 });
} catch (e) {
  threw7 = true;
}
check('7a: broken tools do not crash', threw7, false);
check('7b: returns an array', Array.isArray(r7), true);

// Extra: agent bonus is a soft preference (does not throw, returns array).
let r8, threw8 = false;
try {
  r8 = selectTools('weather forecast', tools, { agent: 'ORACLE', max: 3 });
} catch (e) {
  threw8 = true;
}
check('8: agent option does not throw', threw8, false);

// Extra: non-array tools input returns [] safely.
check('9: non-array tools returns empty array', selectTools('x', null).length, 0);

console.log('Results: ' + passed + ' passed, ' + failed + ' failed');
process.exit(failed > 0 ? 1 : 0);
