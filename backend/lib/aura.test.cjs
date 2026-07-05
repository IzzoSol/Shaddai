'use strict';
/**
 * backend/lib/aura.test.cjs
 * Plain-node test runner — no framework required.
 * Run: node backend/lib/aura.test.cjs
 * Exits non-zero on first failure.
 */

// Use a temp AURA_HOME so tests don't pollute real cache
const os = require('os');
const path = require('path');
const fs = require('fs');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'aura-test-'));
process.env.AURA_HOME = TMP;

// Require AFTER setting AURA_HOME so paths resolve correctly
const { route, recordAnswer, stats } = require('./aura.js');

let passed = 0, failed = 0;

function check(label, actual, expected) {
  const ok = String(actual) === String(expected);
  if (ok) {
    console.log(`  PASS  ${label}`);
    passed++;
  } else {
    console.error(`  FAIL  ${label}`);
    console.error(`        expected: ${JSON.stringify(expected)}`);
    console.error(`        got:      ${JSON.stringify(actual)}`);
    failed++;
  }
}

function checkHit(label, result, expectedAnswer) {
  if (!result.hit) {
    console.error(`  FAIL  ${label} — no hit (expected compute/fetch)`);
    failed++;
    return;
  }
  check(label, result.answer, expectedAnswer);
}

function checkMiss(label, result) {
  if (result.hit) {
    console.error(`  FAIL  ${label} — expected miss but got hit: ${result.answer}`);
    failed++;
  } else {
    console.log(`  PASS  ${label}`);
    passed++;
  }
}

// ============================================================
console.log('\n=== PARAMETRIC TEMPLATES ===');
checkHit('15% of 240',             route('15% of 240'),            '36');
checkHit('20% of 50',              route('20% of 50'),             '10');
checkHit('20% off $100',           route('20% off $100'),          '80 (you save 20)');
checkHit('tip on 80 at 20%',       route('tip on 80 at 20%'),      'tip 16, total 96');
checkHit('percent change 80->100', route('percent change from 80 to 100'), '25%');

// ============================================================
console.log('\n=== STATISTICS ===');
checkHit('average of 10 20 30',     route('average of 10, 20, 30'),        '20');
checkHit('avg of 1 2 3 4 5',        route('avg of 1 2 3 4 5'),             '3');
checkHit('sum of 5 10 15',          route('sum of 5, 10, 15'),             '30');
checkHit('min of 3 1 4 1 5',        route('min of 3, 1, 4, 1, 5'),        '1');
checkHit('max of 3 1 4 1 5',        route('max of 3, 1, 4, 1, 5'),        '5');
checkHit('median of 1 2 3 4 5',     route('median of 1, 2, 3, 4, 5'),     '3');
checkHit('median even list',         route('median of 1, 2, 3, 4'),        '2.5');
checkHit('range of 5 10 15',        route('range of 5, 10, 15'),          '10');
checkHit('count of numbers',         route('count of 10, 20, 30, 40'),     '4');
checkHit('minimum of 7 and 3',      route('minimum of 7 and 3'),           '3');
checkHit('maximum of 7 and 3',      route('maximum of 7 and 3'),           '7');

// ============================================================
console.log('\n=== DATE / DATE MATH ===');
{
  const r = route("what is today's date");
  check("today's date is a valid YYYY-MM-DD", r.answer && /^\d{4}-\d{2}-\d{2}$/.test(r.answer), 'true');
  check("today's date is a hit", r.hit, true);
}
{
  const r = route('days between 2024-01-01 and 2024-12-31');
  checkHit('days between two dates', r, '365');
}
{
  const r = route('7 days from today');
  check('7 days from today is YYYY-MM-DD', r.hit && /^\d{4}-\d{2}-\d{2}$/.test(r.answer), true);
}
{
  const r = route('30 days ago');
  check('30 days ago is YYYY-MM-DD', r.hit && /^\d{4}-\d{2}-\d{2}$/.test(r.answer), true);
}
{
  const r = route('what day of the week is 2024-01-01');
  checkHit('day of week for 2024-01-01', r, 'Monday');
}

// ============================================================
console.log('\n=== BASE64 ===');
checkHit('base64 encode hello',      route('base64 encode hello'),    'aGVsbG8=');
checkHit('base64 decode aGVsbG8=',   route('base64 decode aGVsbG8='), 'hello');

// ============================================================
console.log('\n=== WORD / CHAR COUNT ===');
checkHit('word count "the quick brown fox"', route('word count of: the quick brown fox'), '4');
checkHit('char count "hello"',               route('character count of: hello'),           '5');
checkHit('char count with spaces',           route('character count of: hello world'),      '11');

// ============================================================
console.log('\n=== STRING OPS ===');
checkHit('uppercase: hello world',   route('uppercase: hello world'),            'HELLO WORLD');
checkHit('lowercase: HELLO',         route('lowercase: HELLO'),                  'hello');
checkHit('reverse: abc',             route('reverse: abc'),                      'cba');
checkHit('slugify: Hello World',     route('slugify: Hello World'),              'hello-world');
checkHit('slugify: The Quick Fox!',  route('slugify: The Quick Brown Fox!'),     'the-quick-brown-fox');
checkHit('title case: basic',        route('title case: the quick brown fox'),   'The Quick Brown Fox');
checkHit('title case: small words',  route('title case: fear and loathing in las vegas'), 'Fear and Loathing in Las Vegas');
checkHit('count occurrences l in hello world',
  route("count occurrences of 'l' in 'hello world'"), '3');

// ============================================================
console.log('\n=== ROMAN NUMERALS ===');
checkHit('roman numeral for 14',      route('roman numeral for 14'),     'XIV');
checkHit('roman numeral for 42',      route('roman numeral for 42'),     'XLII');
checkHit('roman numeral for 2024',    route('roman numeral for 2024'),   'MMXXIV');
checkHit('XIV to decimal',            route('XIV in decimal'),            '14');
checkHit('XLII to number',            route('what number is XLII'),       '42');
checkHit('MMXXIV to number',          route('convert MMXXIV to decimal'), '2024');

// ============================================================
console.log('\n=== PRIME / GCD / LCM / FACTORIAL ===');
checkHit('is 17 prime',       route('is 17 prime'),         'Yes, 17 is prime');
checkHit('is 15 prime',       route('is 15 prime'),         'No, 15 is not prime');
checkHit('is 2 prime',        route('is 2 prime'),          'Yes, 2 is prime');
checkHit('is 1 prime',        route('is 1 prime'),          'No, 1 is not prime');
checkHit('gcd of 12 and 8',   route('gcd of 12 and 8'),     '4');
checkHit('gcd of 100 and 75', route('gcd of 100 and 75'),   '25');
checkHit('lcm of 4 and 6',    route('lcm of 4 and 6'),      '12');
checkHit('lcm of 3 and 5',    route('lcm of 3 and 5'),      '15');
checkHit('factorial of 5',    route('factorial of 5'),       '120');
checkHit('factorial of 0',    route('factorial of 0'),       '1');
checkHit('factorial of 10',   route('factorial of 10'),      '3628800');
checkHit('6!',                route('6!'),                   '720');

// ============================================================
console.log('\n=== BASE CONVERSION ===');
checkHit('255 in hex',             route('255 in hex'),              '0xFF');
checkHit('255 to binary',          route('255 to binary'),           '0b11111111');
checkHit('0xff in decimal',        route('0xff in decimal'),         '255');
checkHit('0b1010 in decimal',      route('0b1010 in decimal'),       '10');
checkHit('0o17 in decimal',        route('0o17 in decimal'),         '15');
checkHit('10 to binary',           route('10 to binary'),            '0b1010');
checkHit('42 in octal',            route('42 in octal'),             '0o52');

// ============================================================
console.log('\n=== NUMBER FORMATTING ===');
checkHit('format 1000000 with commas',    route('format 1000000 with commas'),   '1,000,000');
checkHit('1000000 with commas',           route('1000000 with commas'),           '1,000,000');
checkHit('add commas to 9876543',         route('add commas to 9876543'),         '9,876,543');
checkHit('negative with commas',          route('-1234567 with commas'),          '-1,234,567');

// ============================================================
console.log('\n=== UNIT CONVERSIONS: existing ===');
checkHit('10 km to miles',    route('10 km to miles'),    '6.213712 miles');
checkHit('5 kg in lbs',       route('5 kg in lbs'),       '11.023122 lbs');
checkHit('100 c to f',        route('100 c to f'),        '212 f');
checkHit('32 f to c',         route('32 f to c'),         '0 c');

console.log('\n=== UNIT CONVERSIONS: data size ===');
checkHit('1 gb to mb',     route('1 gb to mb'),      '1024 mb');
checkHit('512 mb to gb',   route('512 mb in gb'),    '0.5 gb');
checkHit('1 kb to bytes',  route('1 kb in bytes'),   '1024 bytes');
checkHit('2 tb to gb',     route('2 tb to gb'),      '2048 gb');

console.log('\n=== UNIT CONVERSIONS: time ===');
checkHit('3 hours to minutes',   route('3 hours in minutes'),   '180 minutes');
checkHit('90 seconds to minutes', route('90 seconds in minutes'), '1.5 minutes');
checkHit('2 days to hours',      route('2 days in hours'),      '48 hours');
checkHit('1 week to days',       route('1 week in days'),       '7 days');

console.log('\n=== UNIT CONVERSIONS: speed ===');
checkHit('60 mph to kph',   route('60 mph to kph'),    '96.56064 kph');
checkHit('100 kph to mph',  route('100 kph to mph'),   '62.137119 mph');
checkHit('10 mps to fps',   route('10 mps to fps'),    '32.808399 fps');

// ============================================================
console.log('\n=== SAFE MATH ===');
checkHit('2 + 2',                route('2 + 2'),               '4');
checkHit('what is 3 * 7',        route('what is 3 * 7'),       '21');
checkHit('(10 + 5) * 2',         route('(10 + 5) * 2'),        '30');
checkHit('2 ^ 10',               route('2 ^ 10'),              '1024');

// ============================================================
console.log('\n=== CACHE: FETCH & QUERY ===');
{
  // Clear any leftover state from compute auto-caching by using a unique non-compute prompt
  const testPrompt = 'The capital of Shaddai is the Nexus Hub';
  const testAnswer = 'Nexus Hub';
  recordAnswer(testPrompt, testAnswer);

  const r1 = route(testPrompt);
  check('FETCH: exact hit', r1.hit && r1.method, 'fetch');
  check('FETCH: correct answer', r1.answer, testAnswer);

  // Slight variation — should match via QUERY (cosine similarity)
  const similar = 'The capital of Shaddai is the Nexus Hub.';
  const r2 = route(similar);
  check('QUERY: similar prompt hits', r2.hit, true);
  check('QUERY: returns same answer', r2.answer, testAnswer);
}

// ============================================================
console.log('\n=== STATS STRUCTURE ===');
{
  const s = stats();
  check('stats.hits is a number',        typeof s.hits,         'number');
  check('stats.misses is a number',      typeof s.misses,       'number');
  check('stats.hitRate is a number',     typeof s.hitRate,      'number');
  check('stats.tokensSaved is a number', typeof s.tokensSaved,  'number');
  check('stats.costSavedUsd is a number',typeof s.costSavedUsd, 'number');
  check('stats.byMethod exists',         typeof s.byMethod,     'object');
  check('stats.byMethod.fetch exists',   typeof s.byMethod.fetch, 'number');
  check('stats.byMethod.query exists',   typeof s.byMethod.query, 'number');
  check('stats.byMethod.compute exists', typeof s.byMethod.compute, 'number');
  check('stats.recentSaves is array',    Array.isArray(s.recentSaves), true);
  check('stats.recentSaves has entries', s.recentSaves.length > 0, true);
  const first = s.recentSaves[0];
  check('recentSaves[0].method exists',  typeof first.method, 'string');
  check('recentSaves[0].snippet exists', typeof first.snippet, 'string');
  check('recentSaves[0].tokens exists',  typeof first.tokens, 'number');
  check('recentSaves[0].ts exists',      typeof first.ts, 'number');
}

// ============================================================
console.log('\n=== PARAMETRIC: MARKUP ===');
checkHit('20% markup on 50',       route('20% markup on 50'),     '60 (markup 10)');
checkHit('10% markup on 200',      route('10% markup on 200'),    '220 (markup 20)');

// ============================================================
console.log('\n=== STATISTICS: MODE ===');
checkHit('mode of 1 2 2 3',        route('mode of 1, 2, 2, 3'),   '2');
checkHit('mode of 1 1 2 3 3',      route('mode of 1, 1, 2, 3, 3'), '1, 3');

// ============================================================
console.log('\n=== STANDARD DEVIATION / VARIANCE ===');
checkHit('stddev of 2 4 4 4 5 5 7 9', route('stddev of 2, 4, 4, 4, 5, 5, 7, 9'), '2');
checkHit('variance of 2 4 6',      route('variance of 2, 4, 6'),  '2.6666666667');
checkHit('standard deviation of 1 2 3 4 5', route('standard deviation of 1, 2, 3, 4, 5'), '1.4142135624');

// ============================================================
console.log('\n=== RATIO SIMPLIFY ===');
checkHit('simplify ratio 12:8',    route('simplify ratio 12:8'),  '3:2');
checkHit('simplify ratio 100:25',  route('simplify ratio 100:25'), '4:1');
checkHit('ratio 6:4 in simplest form', route('6:4 in simplest form'), '3:2');

// ============================================================
console.log('\n=== ROUND TO DECIMAL PLACES ===');
checkHit('round 3.14159 to 2 decimal places', route('round 3.14159 to 2 decimal places'), '3.14');
checkHit('round 2.5 to 0 decimal places',     route('round 2.5 to 0 decimal places'),     '3');
checkHit('round 1.23456 to 4 decimal places', route('round 1.23456 to 4 decimal places'), '1.2346');

// ============================================================
console.log('\n=== X OUT OF Y AS PERCENT ===');
checkHit('3 out of 4 as a percent',   route('3 out of 4 as a percent'),     '75%');
checkHit('1 out of 8 as a percent',   route('1 out of 8 as a percent'),     '12.5%');
checkHit('what percent is 7 out of 10', route('what percent is 7 out of 10'), '70%');

// ============================================================
console.log('\n=== COMPOUND INTEREST ===');
checkHit('compound interest on 1000 at 10% for 2 years',
  route('compound interest on 1000 at 10% for 2 years'), '1210');
checkHit('compound interest on 5000 at 5% for 1 years',
  route('compound interest on 5000 at 5% for 1 years'), '5250');

// ============================================================
console.log('\n=== LOAN MONTHLY PAYMENT ===');
{
  const r = route('monthly payment on 120000 at 6% for 30 years');
  check('loan payment hit', r.hit, true);
  // PMT ≈ 719.46; just verify it's a string ending /month
  check('loan payment format', r.hit && r.answer.endsWith('/month'), true);
}

// ============================================================
console.log('\n=== ORDINAL ===');
checkHit('ordinal of 1',   route('ordinal of 1'),   '1st');
checkHit('ordinal of 2',   route('ordinal of 2'),   '2nd');
checkHit('ordinal of 3',   route('ordinal of 3'),   '3rd');
checkHit('ordinal of 11',  route('ordinal of 11'),  '11th');
checkHit('ordinal of 21',  route('ordinal of 21'),  '21st');
checkHit('ordinal of 22',  route('ordinal of 22'),  '22nd');
checkHit('ordinal of 113', route('ordinal of 113'), '113th');
checkHit('42 in ordinal',  route('42 in ordinal'),  '42nd');

// ============================================================
console.log('\n=== NUMBER TO WORDS ===');
checkHit('0 in words',       route('0 in words'),       'zero');
checkHit('1 in words',       route('1 in words'),       'one');
checkHit('21 in words',      route('21 in words'),      'twenty-one');
checkHit('100 in words',     route('100 in words'),     'one hundred');
checkHit('123 in words',     route('123 in words'),     'one hundred twenty-three');
checkHit('1000 in words',    route('1000 in words'),    'one thousand');
checkHit('999999 in words',  route('999999 in words'),  'nine hundred ninety-nine thousand nine hundred ninety-nine');

// ============================================================
console.log('\n=== COUNT VOWELS ===');
checkHit('count vowels in hello',       route("count vowels in 'hello'"),        '2');
checkHit('count vowels in hello world', route("count vowels in 'hello world'"),  '3');
checkHit('how many vowels in aeiou',    route("how many vowels in 'aeiou'"),     '5');

// ============================================================
console.log('\n=== HASH ===');
{
  const r = route("sha256 of 'hello'");
  check('sha256 hit', r.hit, true);
  check('sha256 length 64', r.hit && r.answer.length, 64);
  check('sha256 known value', r.hit && r.answer,
    '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
}
{
  const r = route("md5 of 'hello'");
  check('md5 hit', r.hit, true);
  check('md5 known value', r.hit && r.answer, '5d41402abc4b2a76b9719d911017c592');
}

// ============================================================
console.log('\n=== URL ENCODE / DECODE ===');
checkHit('url encode hello world',  route('url encode hello world'),        'hello%20world');
checkHit('url decode hello%20world', route('url decode hello%20world'),     'hello world');
checkHit('url encode hello@example.com', route('url encode hello@example.com'), 'hello%40example.com');

// ============================================================
console.log('\n=== JSON MINIFY / PRETTIFY ===');
checkHit('json minify {"a":1}',  route('json minify {"a":1}'),  '{"a":1}');
{
  const r = route('json prettify {"a":1}');
  check('json prettify hit', r.hit, true);
  check('json prettify has newline', r.hit && r.answer.includes('\n'), true);
}

// ============================================================
console.log('\n=== UNIX TIMESTAMP ===');
checkHit('unix timestamp for 2024-01-01',
  route('unix timestamp for 2024-01-01'), '1704067200');
{
  const r = route('timestamp 1704067200 to date');
  check('timestamp to date hit', r.hit, true);
  check('timestamp to date value', r.hit && r.answer, '2024-01-01');
}
checkHit('2024-06-15 to unix timestamp',
  route('2024-06-15 to unix timestamp'), '1718409600');

// ============================================================
console.log('\n=== HEX COLOR <-> RGB ===');
checkHit('#FF5733 to rgb',      route('#FF5733 to rgb'),        'rgb(255, 87, 51)');
checkHit('#000000 to rgb',      route('#000000 to rgb'),        'rgb(0, 0, 0)');
checkHit('#FFFFFF to rgb',      route('#FFFFFF to rgb'),        'rgb(255, 255, 255)');
checkHit('rgb 255 87 51 to hex', route('rgb(255, 87, 51) to hex'), '#FF5733');
checkHit('rgb 0 0 0 to hex',    route('rgb(0, 0, 0) to hex'),  '#000000');

// ============================================================
console.log('\n=== CLAMP ===');
checkHit('clamp 150 between 0 and 100', route('clamp 150 between 0 and 100'), '100');
checkHit('clamp -5 between 0 and 100',  route('clamp -5 between 0 and 100'),  '0');
checkHit('clamp 50 between 0 and 100',  route('clamp 50 between 0 and 100'),  '50');

// ============================================================
console.log('\n=== DATE MATH: days until / months from ===');
{
  const r = route('days until 2099-01-01');
  check('days until is a hit', r.hit, true);
  check('days until is a number string', r.hit && /^-?\d+$/.test(r.answer), true);
}
{
  const r = route('3 months from today');
  check('3 months from today hit', r.hit, true);
  check('3 months from today is YYYY-MM-DD', r.hit && /^\d{4}-\d{2}-\d{2}$/.test(r.answer), true);
}

// ============================================================
console.log('\n=== NEW UNIT CONVERSIONS: area / volume / pressure / bits ===');
checkHit('1 hectare to sqm',  route('1 hectare to sqm'),  '10000 sqm');
checkHit('1 acre to sqft',    route('1 acre to sqft'),    '43560.057264 sqft');
checkHit('1 gallon to liters', route('1 gallon to liters'), '3.78541 liters');
checkHit('500 ml to liters',  route('500 ml to liters'),  '0.5 liters');
checkHit('1 atm to pa',       route('1 atm to pa'),       '101325 pa');
checkHit('1 bar to psi',      route('1 bar to psi'),      '14.503768 psi');
checkHit('8 bits to bytes',   route('8 bits to bytes'),   '1 bytes');
checkHit('1 kb to bits',      route('1 kb to bits'),      '8192 bits');

// ============================================================
console.log('\n=== SQUARE ROOT ===');
checkHit('sqrt of 144',            route('sqrt of 144'),                 '12');
checkHit('square root of 169',     route('square root of 169'),          '13');

console.log('\n=== POWERS (natural language) ===');
checkHit('2 to the power of 10',   route('2 to the power of 10'),        '1024');
checkHit('5 squared',              route('5 squared'),                   '25');
checkHit('3 cubed',                route('3 cubed'),                     '27');

console.log('\n=== MODULO ===');
checkHit('17 mod 5',               route('17 mod 5'),                    '2');
checkHit('remainder 17 div by 5',  route('remainder of 17 divided by 5'),'2');

console.log('\n=== CEIL / FLOOR / ROUND / ABS ===');
checkHit('round up 4.2',           route('round up 4.2'),                '5');
checkHit('ceil 4.2',               route('ceil 4.2'),                    '5');
checkHit('floor 4.8',              route('floor 4.8'),                   '4');
checkHit('abs of -5',              route('abs of -5'),                   '5');
checkHit('round 4.6',              route('round 4.6'),                   '5');

console.log('\n=== COMBINATIONS / PERMUTATIONS ===');
checkHit('10 choose 3',            route('10 choose 3'),                 '120');
checkHit('permutations of 5 and 2',route('permutations of 5 and 2'),     '20');

console.log('\n=== FIBONACCI ===');
checkHit('10th fibonacci',         route('10th fibonacci number'),       '55');
checkHit('fibonacci of 7',         route('fibonacci of 7'),              '13');

console.log('\n=== LEAP YEAR ===');
checkHit('is 2024 a leap year',    route('is 2024 a leap year'),         'Yes, 2024 is a leap year');
checkHit('is 2023 a leap year',    route('is 2023 a leap year'),         'No, 2023 is not a leap year');
checkHit('is 1900 a leap year',    route('is 1900 a leap year'),         'No, 1900 is not a leap year');

console.log('\n=== GEOMETRY ===');
checkHit('area of circle r=5',     route('area of a circle with radius 5'),        '78.539816');
checkHit('circumference r=5',      route('circumference of a circle with radius 5'),'31.415927');
checkHit('hypotenuse of 3 and 4',  route('hypotenuse of 3 and 4'),       '5');
checkHit('bmi 70kg 1.8m',          route('bmi for 70 kg and 1.8 m'),     '21.6');

console.log('\n=== MISS CASES (should not false-positive) ===');
checkMiss('what is a leap year (no year)',   route('what is a leap year'));
checkMiss('explain the fibonacci sequence',  route('explain the fibonacci sequence'));
checkMiss('what is the meaning of life (open question)', route('what is the meaning of life'));
checkMiss('write me a poem about SHADDAI', route('write me a poem about SHADDAI'));
checkMiss('explain blockchain to a 5 year old', route('explain blockchain to a 5 year old'));
checkMiss('write a poem about standard deviation', route('write a poem about standard deviation'));
checkMiss('how do I simplify my codebase architecture', route('how do I simplify my codebase architecture'));
checkMiss('what is compound interest as a concept', route('what is compound interest as a concept'));

// ============================================================
// Cleanup temp dir
try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (_) {}

// Summary
console.log(`\n${'='.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error(`\nFAILED: ${failed} test(s) did not pass.`);
  process.exit(1);
} else {
  console.log('\nAll tests passed.');
  process.exit(0);
}
