/* ══════════════════════════════════════════════════════════════════
   tools-dev.js — REAL compute utility tools (keyless, deterministic).

   Pure computation — encoders, converters, generators, validators,
   text/data transforms, math, time. Every executor returns a real,
   correct result with zero external calls. Universal utilities are
   tagged to ALL agents (any agent can base64-encode) to lift each
   agent's tool count toward the 250 goal.
   ══════════════════════════════════════════════════════════════════ */
'use strict';

const crypto = require('crypto');
const ALL = ['SHADDAI', 'NEXUS', 'ZEROX', 'ORACLE', 'TURTLE', 'QUILL', 'PIKADON'];
const ok = (o) => (typeof o === 'string' ? o : JSON.stringify(o));
const err = (m) => JSON.stringify({ error: m });
const need = (v, n) => { if (v == null || v === '') throw new Error(n + ' required'); return v; };
function tool(name, desc, schema, agents, fn) { return { name, description: desc, schema: schema || {}, agents: agents || ALL, category: 'Dev & Utility', async execute(p = {}) { try { return ok(fn(p || {})); } catch (e) { return err(e.message); } } }; }

const MORSE = { A: '.-', B: '-...', C: '-.-.', D: '-..', E: '.', F: '..-.', G: '--.', H: '....', I: '..', J: '.---', K: '-.-', L: '.-..', M: '--', N: '-.', O: '---', P: '.--.', Q: '--.-', R: '.-.', S: '...', T: '-', U: '..-', V: '...-', W: '.--', X: '-..-', Y: '-.--', Z: '--..', 0: '-----', 1: '.----', 2: '..---', 3: '...--', 4: '....-', 5: '.....', 6: '-....', 7: '--...', 8: '---..', 9: '----.', ' ': '/' };
const MORSE_REV = Object.fromEntries(Object.entries(MORSE).map(([k, v]) => [v, k]));
const ROMAN = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
function numWords(n) { n = Math.floor(n); if (n < 20) return ONES[n]; if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? '-' + ONES[n % 10] : ''); if (n < 1000) return ONES[Math.floor(n / 100)] + ' hundred' + (n % 100 ? ' ' + numWords(n % 100) : ''); if (n < 1e6) return numWords(Math.floor(n / 1000)) + ' thousand' + (n % 1000 ? ' ' + numWords(n % 1000) : ''); if (n < 1e9) return numWords(Math.floor(n / 1e6)) + ' million' + (n % 1e6 ? ' ' + numWords(n % 1e6) : ''); return String(n); }

const TOOLS_DEV = {};
const reg = (t) => { TOOLS_DEV[t.name] = t; };

// ── encoders / decoders ────────────────────────────────────────────
reg(tool('base64_encode', 'Encode text to Base64.', { text: 'string' }, ALL, (p) => ({ result: Buffer.from(String(need(p.text, 'text'))).toString('base64') })));
reg(tool('base64_decode', 'Decode Base64 to text.', { text: 'string — base64' }, ALL, (p) => ({ result: Buffer.from(String(need(p.text, 'text')), 'base64').toString('utf8') })));
reg(tool('url_encode', 'Percent-encode text for URLs.', { text: 'string' }, ALL, (p) => ({ result: encodeURIComponent(String(need(p.text, 'text'))) })));
reg(tool('url_decode', 'Decode a percent-encoded URL string.', { text: 'string' }, ALL, (p) => ({ result: decodeURIComponent(String(need(p.text, 'text'))) })));
reg(tool('html_encode', 'Escape HTML special characters.', { text: 'string' }, ALL, (p) => ({ result: String(need(p.text, 'text')).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])) })));
reg(tool('html_decode', 'Unescape HTML entities.', { text: 'string' }, ALL, (p) => ({ result: String(need(p.text, 'text')).replace(/&(amp|lt|gt|quot|#39);/g, (m) => ({ '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" }[m])) })));
reg(tool('hex_encode', 'Encode text to hexadecimal.', { text: 'string' }, ALL, (p) => ({ result: Buffer.from(String(need(p.text, 'text'))).toString('hex') })));
reg(tool('hex_decode', 'Decode hexadecimal to text.', { text: 'string — hex' }, ALL, (p) => ({ result: Buffer.from(String(need(p.text, 'text')).replace(/[^0-9a-f]/gi, ''), 'hex').toString('utf8') })));
reg(tool('rot13', 'Apply the ROT13 cipher.', { text: 'string' }, ALL, (p) => ({ result: String(need(p.text, 'text')).replace(/[a-z]/gi, (c) => String.fromCharCode((c <= 'Z' ? 90 : 122) >= (c = c.charCodeAt(0) + 13) ? c : c - 26)) })));
reg(tool('morse_encode', 'Encode text to Morse code.', { text: 'string' }, ALL, (p) => ({ result: String(need(p.text, 'text')).toUpperCase().split('').map((c) => MORSE[c] || '').join(' ').trim() })));
reg(tool('morse_decode', 'Decode Morse code to text.', { text: 'string — dots/dashes' }, ALL, (p) => ({ result: String(need(p.text, 'text')).trim().split(/\s+/).map((c) => MORSE_REV[c] || '').join('') })));
reg(tool('binary_encode', 'Encode text to binary (8-bit).', { text: 'string' }, ALL, (p) => ({ result: String(need(p.text, 'text')).split('').map((c) => c.charCodeAt(0).toString(2).padStart(8, '0')).join(' ') })));
reg(tool('binary_decode', 'Decode 8-bit binary to text.', { text: 'string — 0/1 groups' }, ALL, (p) => ({ result: String(need(p.text, 'text')).trim().split(/\s+/).map((b) => String.fromCharCode(parseInt(b, 2))).join('') })));

// ── text transforms ────────────────────────────────────────────────
reg(tool('to_uppercase', 'UPPERCASE text.', { text: 'string' }, ALL, (p) => ({ result: String(need(p.text, 'text')).toUpperCase() })));
reg(tool('to_lowercase', 'lowercase text.', { text: 'string' }, ALL, (p) => ({ result: String(need(p.text, 'text')).toLowerCase() })));
reg(tool('title_case', 'Convert text to Title Case.', { text: 'string' }, ALL, (p) => ({ result: String(need(p.text, 'text')).toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()) })));
reg(tool('camel_case', 'Convert to camelCase.', { text: 'string' }, ALL, (p) => { const w = String(need(p.text, 'text')).split(/[^a-z0-9]+/i).filter(Boolean); return { result: w.map((x, i) => i ? x[0].toUpperCase() + x.slice(1).toLowerCase() : x.toLowerCase()).join('') }; }));
reg(tool('snake_case', 'Convert to snake_case.', { text: 'string' }, ALL, (p) => ({ result: String(need(p.text, 'text')).trim().replace(/[^a-z0-9]+/gi, '_').replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase().replace(/^_|_$/g, '') })));
reg(tool('kebab_case', 'Convert to kebab-case.', { text: 'string' }, ALL, (p) => ({ result: String(need(p.text, 'text')).trim().replace(/[^a-z0-9]+/gi, '-').replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase().replace(/^-|-$/g, '') })));
reg(tool('slugify', 'Make a URL slug from text.', { text: 'string' }, ALL, (p) => ({ result: String(need(p.text, 'text')).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') })));
reg(tool('reverse_text', 'Reverse a string.', { text: 'string' }, ALL, (p) => ({ result: String(need(p.text, 'text')).split('').reverse().join('') })));
reg(tool('count_words', 'Count words, characters, lines, sentences.', { text: 'string' }, ALL, (p) => { const t = String(need(p.text, 'text')); return { words: (t.match(/\S+/g) || []).length, chars: t.length, charsNoSpace: t.replace(/\s/g, '').length, lines: t.split(/\n/).length, sentences: (t.match(/[.!?]+/g) || []).length }; }));
reg(tool('remove_duplicates', 'Remove duplicate lines from text.', { text: 'string — newline-separated' }, ALL, (p) => { const lines = String(need(p.text, 'text')).split('\n'); const uniq = [...new Set(lines)]; return { removed: lines.length - uniq.length, result: uniq.join('\n') }; }));
reg(tool('sort_lines', 'Sort lines alphabetically.', { text: 'string — newline-separated', desc: 'string — "true" for Z-A (optional)' }, ALL, (p) => { let l = String(need(p.text, 'text')).split('\n').sort(); if (String(p.desc) === 'true') l.reverse(); return { result: l.join('\n') }; }));

// ── generators ─────────────────────────────────────────────────────
reg(tool('uuid_v4', 'Generate a random UUID v4.', {}, ALL, () => ({ uuid: crypto.randomUUID() })));
reg(tool('random_password', 'Generate a strong random password.', { length: 'number — default 16' }, ALL, (p) => { const n = Math.max(6, Math.min(128, Number(p.length) || 16)); const cs = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%^&*'; let s = ''; const b = crypto.randomBytes(n); for (let i = 0; i < n; i++) s += cs[b[i] % cs.length]; return { password: s, length: n }; }));
reg(tool('random_string', 'Generate a random alphanumeric string.', { length: 'number — default 12' }, ALL, (p) => ({ result: crypto.randomBytes(Math.max(1, Math.min(256, Number(p.length) || 12))).toString('base64url').slice(0, Number(p.length) || 12) })));
reg(tool('random_number', 'Random integer in a range.', { min: 'number — default 1', max: 'number — default 100' }, ALL, (p) => { const a = Number(p.min) || 1, b = Number(p.max) || 100; return { result: a + (crypto.randomBytes(4).readUInt32BE() % (Math.abs(b - a) + 1)) }; }));
reg(tool('dice_roll', 'Roll dice, e.g. 2d6.', { notation: 'string — like 2d6 (default 1d20)' }, ALL, (p) => { const m = String(p.notation || '1d20').match(/(\d+)d(\d+)/i); if (!m) throw new Error('use NdM like 2d6'); const [n, s] = [+m[1], +m[2]]; const rolls = Array.from({ length: Math.min(n, 100) }, () => 1 + (crypto.randomBytes(1)[0] % s)); return { rolls, total: rolls.reduce((a, b) => a + b, 0) }; }));
reg(tool('lorem_ipsum', 'Generate lorem ipsum placeholder text.', { words: 'number — default 40' }, ALL, (p) => { const base = 'lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua ut enim ad minim veniam quis nostrud'.split(' '); const n = Math.max(1, Math.min(500, Number(p.words) || 40)); let out = []; for (let i = 0; i < n; i++) out.push(base[i % base.length]); const s = out.join(' '); return { result: s.charAt(0).toUpperCase() + s.slice(1) + '.' }; }));

// ── data / format ──────────────────────────────────────────────────
reg(tool('json_format', 'Pretty-print / validate JSON.', { json: 'string — JSON text', indent: 'number — spaces (default 2)' }, ALL, (p) => ({ result: JSON.stringify(JSON.parse(need(p.json, 'json')), null, Number(p.indent) || 2) })));
reg(tool('json_minify', 'Minify JSON.', { json: 'string — JSON text' }, ALL, (p) => ({ result: JSON.stringify(JSON.parse(need(p.json, 'json'))) })));
reg(tool('json_keys', 'List the top-level keys of a JSON object.', { json: 'string — JSON object' }, ALL, (p) => ({ keys: Object.keys(JSON.parse(need(p.json, 'json'))) })));
reg(tool('csv_to_json', 'Convert CSV (with header row) to JSON array.', { csv: 'string — CSV text' }, ALL, (p) => { const rows = String(need(p.csv, 'csv')).trim().split('\n').map((r) => r.split(',')); const h = rows.shift(); return { result: rows.map((r) => Object.fromEntries(h.map((k, i) => [k.trim(), (r[i] || '').trim()]))) }; }));
reg(tool('json_to_csv', 'Convert a JSON array of objects to CSV.', { json: 'string — JSON array' }, ALL, (p) => { const arr = JSON.parse(need(p.json, 'json')); if (!Array.isArray(arr) || !arr.length) throw new Error('need a non-empty JSON array'); const h = Object.keys(arr[0]); return { result: [h.join(','), ...arr.map((o) => h.map((k) => JSON.stringify(o[k] ?? '')).join(','))].join('\n') }; }));

// ── math / convert ─────────────────────────────────────────────────
reg(tool('temperature_convert', 'Convert temperature between C/F/K.', { value: 'number', from: 'string — C|F|K', to: 'string — C|F|K' }, ALL, (p) => { const v = Number(need(p.value, 'value')); const f = String(p.from || 'C').toUpperCase(), t = String(p.to || 'F').toUpperCase(); const c = f === 'C' ? v : f === 'F' ? (v - 32) * 5 / 9 : v - 273.15; const out = t === 'C' ? c : t === 'F' ? c * 9 / 5 + 32 : c + 273.15; return { result: Math.round(out * 100) / 100, unit: t }; }));
reg(tool('length_convert', 'Convert length (m, km, mi, ft, in, cm).', { value: 'number', from: 'string', to: 'string' }, ALL, (p) => { const M = { m: 1, km: 1000, cm: 0.01, mm: 0.001, mi: 1609.34, ft: 0.3048, in: 0.0254, yd: 0.9144 }; const f = M[String(p.from).toLowerCase()], t = M[String(p.to).toLowerCase()]; if (!f || !t) throw new Error('units: m,km,cm,mm,mi,ft,in,yd'); return { result: Math.round(Number(need(p.value, 'value')) * f / t * 10000) / 10000, unit: p.to }; }));
reg(tool('weight_convert', 'Convert weight (kg, g, lb, oz, ton).', { value: 'number', from: 'string', to: 'string' }, ALL, (p) => { const M = { kg: 1, g: 0.001, mg: 1e-6, lb: 0.453592, oz: 0.0283495, ton: 1000 }; const f = M[String(p.from).toLowerCase()], t = M[String(p.to).toLowerCase()]; if (!f || !t) throw new Error('units: kg,g,mg,lb,oz,ton'); return { result: Math.round(Number(need(p.value, 'value')) * f / t * 10000) / 10000, unit: p.to }; }));
reg(tool('percentage', 'Compute X% of Y, or what % X is of Y.', { part: 'number', whole: 'number', percent: 'number — (optional) instead of part' }, ALL, (p) => { const whole = Number(need(p.whole, 'whole')); if (p.percent != null) return { result: Number(p.percent) / 100 * whole }; const part = Number(need(p.part, 'part')); return { percent: Math.round(part / whole * 10000) / 100 + '%', ratio: part / whole }; }));
reg(tool('tip_calculator', 'Calculate tip + total for a bill.', { bill: 'number', percent: 'number — default 18', people: 'number — default 1' }, ALL, (p) => { const b = Number(need(p.bill, 'bill')), pct = Number(p.percent) || 18, ppl = Number(p.people) || 1; const tip = b * pct / 100; return { tip: Math.round(tip * 100) / 100, total: Math.round((b + tip) * 100) / 100, perPerson: Math.round((b + tip) / ppl * 100) / 100 }; }));
reg(tool('is_prime', 'Check if a number is prime.', { n: 'number' }, ALL, (p) => { const n = Math.floor(Number(need(p.n, 'n'))); if (n < 2) return { n, prime: false }; for (let i = 2; i * i <= n; i++) if (n % i === 0) return { n, prime: false, divisor: i }; return { n, prime: true }; }));
reg(tool('factorial', 'Compute n! (factorial).', { n: 'number — 0..170' }, ALL, (p) => { let n = Math.floor(Number(need(p.n, 'n'))); if (n < 0 || n > 170) throw new Error('n must be 0..170'); let r = 1; for (let i = 2; i <= n; i++) r *= i; return { n, result: r }; }));
reg(tool('fibonacci', 'First N Fibonacci numbers.', { count: 'number — default 15' }, ALL, (p) => { const n = Math.max(1, Math.min(90, Number(p.count) || 15)); const a = [0, 1]; while (a.length < n) a.push(a[a.length - 1] + a[a.length - 2]); return { result: a.slice(0, n) }; }));
reg(tool('gcd_lcm', 'Greatest common divisor + least common multiple of two integers.', { a: 'number', b: 'number' }, ALL, (p) => { let a = Math.abs(Math.floor(Number(need(p.a, 'a')))), b = Math.abs(Math.floor(Number(need(p.b, 'b')))); const g = (x, y) => y ? g(y, x % y) : x; const gg = g(a, b); return { gcd: gg, lcm: gg ? a / gg * b : 0 }; }));
reg(tool('roman_numeral', 'Convert an integer (1–3999) to a Roman numeral.', { n: 'number' }, ALL, (p) => { let n = Math.floor(Number(need(p.n, 'n'))); if (n < 1 || n > 3999) throw new Error('1..3999'); let s = ''; for (const [v, sym] of ROMAN) while (n >= v) { s += sym; n -= v; } return { result: s }; }));
reg(tool('number_to_words', 'Spell out a number in English words.', { n: 'number' }, ALL, (p) => ({ result: numWords(Number(need(p.n, 'n'))) })));

// ── time ───────────────────────────────────────────────────────────
reg(tool('timestamp_now', 'Current time — ISO, Unix seconds, and ms.', {}, ALL, () => { const d = new Date(); return { iso: d.toISOString(), unix: Math.floor(d.getTime() / 1000), ms: d.getTime() }; }));
reg(tool('unix_to_date', 'Convert a Unix timestamp (seconds) to a readable date.', { unix: 'number — seconds' }, ALL, (p) => ({ result: new Date(Number(need(p.unix, 'unix')) * 1000).toISOString() })));
reg(tool('days_between', 'Days between two dates (YYYY-MM-DD).', { from: 'string — YYYY-MM-DD', to: 'string — YYYY-MM-DD' }, ALL, (p) => { const a = new Date(need(p.from, 'from')), b = new Date(need(p.to, 'to')); if (isNaN(a) || isNaN(b)) throw new Error('use YYYY-MM-DD'); return { days: Math.round(Math.abs(b - a) / 864e5) }; }));

module.exports = { TOOLS_DEV, _count: Object.keys(TOOLS_DEV).length };
