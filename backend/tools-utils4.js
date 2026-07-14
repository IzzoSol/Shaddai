/* ══════════════════════════════════════════════════════════════════
   tools-utils4.js — REAL geometry, finance, base & date tools (compute).
   Deterministic, keyless. Tagged to ALL agents → final push to 250.
   ══════════════════════════════════════════════════════════════════ */
'use strict';
const ALL = ['SHADDAI', 'NEXUS', 'ZEROX', 'ORACLE', 'TURTLE', 'QUILL', 'PIKADON'];
const ok = (o) => JSON.stringify(o);
const err = (m) => JSON.stringify({ error: m });
const N = (v, n) => { const x = Number(v); if (v == null || v === '' || isNaN(x)) throw new Error(n + ' (number) required'); return x; };
const S = (v, n) => { if (v == null || v === '') throw new Error(n + ' required'); return String(v); };
const r2 = (x) => Math.round(x * 100) / 100;
function tool(name, desc, schema, fn, cat) { return { name, description: desc, schema: schema || {}, agents: ALL, category: cat || 'Calculators', async execute(p = {}) { try { return ok(fn(p || {})); } catch (e) { return err(e.message); } } }; }
const TOOLS_UTILS4 = {};
const reg = (t) => { TOOLS_UTILS4[t.name] = t; };

// ── geometry ───────────────────────────────────────────────────────
reg(tool('rectangle_area', 'Area + perimeter of a rectangle.', { width: 'number', height: 'number' }, (p) => { const w = N(p.width, 'width'), h = N(p.height, 'height'); return { area: w * h, perimeter: 2 * (w + h) }; }, 'Geometry'));
reg(tool('triangle_area', 'Area of a triangle (base × height ÷ 2).', { base: 'number', height: 'number' }, (p) => ({ area: r2(N(p.base, 'base') * N(p.height, 'height') / 2) }), 'Geometry'));
reg(tool('trapezoid_area', 'Area of a trapezoid.', { a: 'number — base1', b: 'number — base2', height: 'number' }, (p) => ({ area: r2((N(p.a, 'a') + N(p.b, 'b')) / 2 * N(p.height, 'height')) }), 'Geometry'));
reg(tool('sphere_volume', 'Volume + surface area of a sphere.', { radius: 'number' }, (p) => { const r = N(p.radius, 'radius'); return { volume: r2(4 / 3 * Math.PI * r ** 3), surfaceArea: r2(4 * Math.PI * r ** 2) }; }, 'Geometry'));
reg(tool('cylinder_volume', 'Volume of a cylinder.', { radius: 'number', height: 'number' }, (p) => ({ volume: r2(Math.PI * N(p.radius, 'radius') ** 2 * N(p.height, 'height')) }), 'Geometry'));
reg(tool('cone_volume', 'Volume of a cone.', { radius: 'number', height: 'number' }, (p) => ({ volume: r2(1 / 3 * Math.PI * N(p.radius, 'radius') ** 2 * N(p.height, 'height')) }), 'Geometry'));
reg(tool('distance_2d', 'Distance between two 2D points.', { x1: 'number', y1: 'number', x2: 'number', y2: 'number' }, (p) => ({ distance: r2(Math.hypot(N(p.x2, 'x2') - N(p.x1, 'x1'), N(p.y2, 'y2') - N(p.y1, 'y1'))) }), 'Geometry'));
reg(tool('midpoint', 'Midpoint between two 2D points.', { x1: 'number', y1: 'number', x2: 'number', y2: 'number' }, (p) => ({ x: (N(p.x1, 'x1') + N(p.x2, 'x2')) / 2, y: (N(p.y1, 'y1') + N(p.y2, 'y2')) / 2 }), 'Geometry'));
reg(tool('slope', 'Slope of the line through two points.', { x1: 'number', y1: 'number', x2: 'number', y2: 'number' }, (p) => { const dx = N(p.x2, 'x2') - N(p.x1, 'x1'); if (dx === 0) return { slope: 'undefined (vertical)' }; return { slope: r2((N(p.y2, 'y2') - N(p.y1, 'y1')) / dx) }; }, 'Geometry'));

// ── finance ────────────────────────────────────────────────────────
reg(tool('simple_interest', 'Simple interest earned.', { principal: 'number', rate: 'number — annual %', years: 'number' }, (p) => { const i = N(p.principal, 'principal') * N(p.rate, 'rate') / 100 * N(p.years, 'years'); return { interest: r2(i), total: r2(N(p.principal, 'principal') + i) }; }));
reg(tool('future_value', 'Future value of a present sum.', { present: 'number', rate: 'number — %', years: 'number' }, (p) => ({ futureValue: r2(N(p.present, 'present') * Math.pow(1 + N(p.rate, 'rate') / 100, N(p.years, 'years'))) })));
reg(tool('present_value', 'Present value of a future sum.', { future: 'number', rate: 'number — %', years: 'number' }, (p) => ({ presentValue: r2(N(p.future, 'future') / Math.pow(1 + N(p.rate, 'rate') / 100, N(p.years, 'years'))) })));
reg(tool('rule_of_72', 'Years to double an investment at a rate (Rule of 72).', { rate: 'number — %' }, (p) => ({ yearsToDouble: r2(72 / N(p.rate, 'rate')) })));
reg(tool('savings_goal', 'Monthly savings needed to reach a goal.', { goal: 'number', months: 'number' }, (p) => ({ perMonth: r2(N(p.goal, 'goal') / N(p.months, 'months')) })));

// ── base conversions ───────────────────────────────────────────────
reg(tool('decimal_to_binary', 'Convert a decimal number to binary.', { n: 'number' }, (p) => ({ binary: Math.floor(N(p.n, 'n')).toString(2) }), 'Convert'));
reg(tool('binary_to_decimal', 'Convert a binary string to decimal.', { binary: 'string — 0/1' }, (p) => ({ decimal: parseInt(S(p.binary, 'binary'), 2) }), 'Convert'));
reg(tool('decimal_to_hex', 'Convert a decimal number to hexadecimal.', { n: 'number' }, (p) => ({ hex: Math.floor(N(p.n, 'n')).toString(16) }), 'Convert'));
reg(tool('hex_to_decimal', 'Convert a hexadecimal string to decimal.', { hex: 'string' }, (p) => ({ decimal: parseInt(S(p.hex, 'hex').replace(/^0x/, ''), 16) }), 'Convert'));

// ── text ───────────────────────────────────────────────────────────
reg(tool('swap_case', 'Swap the case of every letter.', { text: 'string' }, (p) => ({ result: S(p.text, 'text').replace(/[a-z]/gi, (c) => c === c.toLowerCase() ? c.toUpperCase() : c.toLowerCase()) }), 'Text & Format'));
reg(tool('sentence_case', 'Capitalize the first letter of each sentence.', { text: 'string' }, (p) => ({ result: S(p.text, 'text').toLowerCase().replace(/(^\s*\w|[.!?]\s*\w)/g, (c) => c.toUpperCase()) }), 'Text & Format'));
reg(tool('remove_vowels', 'Remove all vowels from text.', { text: 'string' }, (p) => ({ result: S(p.text, 'text').replace(/[aeiou]/gi, '') }), 'Text & Format'));
reg(tool('count_syllables', 'Estimate the syllable count of a word/text.', { text: 'string' }, (p) => ({ syllables: (S(p.text, 'text').toLowerCase().match(/[aeiouy]+/g) || []).length }), 'Text & Format'));
reg(tool('snake_to_camel', 'Convert snake_case to camelCase.', { text: 'string' }, (p) => ({ result: S(p.text, 'text').replace(/_([a-z])/g, (_, c) => c.toUpperCase()) }), 'Text & Format'));
reg(tool('camel_to_snake', 'Convert camelCase to snake_case.', { text: 'string' }, (p) => ({ result: S(p.text, 'text').replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '') }), 'Text & Format'));
reg(tool('acronym', 'Build an acronym from a phrase.', { text: 'string' }, (p) => ({ acronym: S(p.text, 'text').split(/\s+/).map((w) => w[0]).join('').toUpperCase() }), 'Text & Format'));

// ── date / misc ────────────────────────────────────────────────────
reg(tool('is_weekend', 'Check if a date falls on a weekend.', { date: 'string — YYYY-MM-DD' }, (p) => { const d = new Date(S(p.date, 'date')).getUTCDay(); return { weekend: d === 0 || d === 6 }; }, 'Date'));
reg(tool('add_hours', 'Add N hours to an ISO datetime.', { datetime: 'string — ISO', hours: 'number' }, (p) => { const d = new Date(S(p.datetime, 'datetime')); d.setUTCHours(d.getUTCHours() + Number(p.hours || 0)); return { result: d.toISOString() }; }, 'Date'));
reg(tool('clamp_number', 'Clamp a number to a [min,max] range.', { value: 'number', min: 'number', max: 'number' }, (p) => ({ result: Math.max(N(p.min, 'min'), Math.min(N(p.max, 'max'), N(p.value, 'value'))) }), 'Math'));
reg(tool('coin_flip', 'Flip a fair coin.', {}, () => ({ result: Math.random() < 0.5 ? 'heads' : 'tails' }), 'Misc'));
reg(tool('magic_8ball', 'Ask the Magic 8-Ball a yes/no question.', { question: 'string' }, (p) => { const A = ['It is certain', 'Without a doubt', 'Yes definitely', 'Most likely', 'Outlook good', 'Signs point to yes', 'Reply hazy try again', 'Ask again later', "Don't count on it", 'My reply is no', 'Very doubtful', 'Outlook not so good']; return { question: p.question || '', answer: A[Math.floor(Math.random() * A.length)] }; }, 'Misc'));

module.exports = { TOOLS_UTILS4, _count: Object.keys(TOOLS_UTILS4).length };
