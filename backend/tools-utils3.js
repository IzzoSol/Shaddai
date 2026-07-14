/* ══════════════════════════════════════════════════════════════════
   tools-utils3.js — REAL text, date & format tools (compute, keyless).
   Extraction, string ops, ciphers, date math. Deterministic. Tagged to
   ALL agents → lifts each toward 250.
   ══════════════════════════════════════════════════════════════════ */
'use strict';
const ALL = ['SHADDAI', 'NEXUS', 'ZEROX', 'ORACLE', 'TURTLE', 'QUILL', 'PIKADON'];
const ok = (o) => JSON.stringify(o);
const err = (m) => JSON.stringify({ error: m });
const S = (v, n) => { if (v == null || v === '') throw new Error(n + ' required'); return String(v); };
function tool(name, desc, schema, fn, cat) { return { name, description: desc, schema: schema || {}, agents: ALL, category: cat || 'Text & Format', async execute(p = {}) { try { return ok(fn(p || {})); } catch (e) { return err(e.message); } } }; }
const TOOLS_UTILS3 = {};
const reg = (t) => { TOOLS_UTILS3[t.name] = t; };

// ── extraction ─────────────────────────────────────────────────────
reg(tool('extract_emails', 'Extract all email addresses from text.', { text: 'string' }, (p) => ({ emails: [...new Set(S(p.text, 'text').match(/[\w.+-]+@[\w-]+\.[\w.-]+/g) || [])] })));
reg(tool('extract_urls', 'Extract all URLs from text.', { text: 'string' }, (p) => ({ urls: [...new Set(S(p.text, 'text').match(/https?:\/\/[^\s"'<>]+/g) || [])] })));
reg(tool('extract_numbers', 'Extract all numbers from text.', { text: 'string' }, (p) => ({ numbers: (S(p.text, 'text').match(/-?\d+(?:\.\d+)?/g) || []).map(Number) })));
reg(tool('extract_hashtags', 'Extract #hashtags from text.', { text: 'string' }, (p) => ({ hashtags: [...new Set(S(p.text, 'text').match(/#\w+/g) || [])] })));
reg(tool('extract_mentions', 'Extract @mentions from text.', { text: 'string' }, (p) => ({ mentions: [...new Set(S(p.text, 'text').match(/@\w+/g) || [])] })));
reg(tool('extract_domain', 'Extract the domain from a URL or email.', { input: 'string' }, (p) => { const t = S(p.input, 'input'); const m = t.match(/@([\w.-]+)/) || t.match(/https?:\/\/([^\/\s]+)/) || t.match(/([\w-]+\.[\w.-]+)/); return { domain: m ? m[1] : null }; }));

// ── string ops ─────────────────────────────────────────────────────
reg(tool('truncate_text', 'Truncate text to N chars with an ellipsis.', { text: 'string', length: 'number — default 100' }, (p) => { const t = S(p.text, 'text'), n = Number(p.length) || 100; return { result: t.length > n ? t.slice(0, n).trimEnd() + '…' : t }; }));
reg(tool('pad_string', 'Pad a string to a length.', { text: 'string', length: 'number', char: 'string — default space', side: 'string — start|end (default start)' }, (p) => { const t = S(p.text, 'text'), n = Number(p.length) || t.length, c = (p.char || ' '); return { result: p.side === 'end' ? t.padEnd(n, c) : t.padStart(n, c) }; }));
reg(tool('repeat_text', 'Repeat text N times.', { text: 'string', times: 'number' }, (p) => ({ result: S(p.text, 'text').repeat(Math.max(0, Math.min(1000, Number(p.times) || 1))) })));
reg(tool('count_occurrences', 'Count occurrences of a substring in text.', { text: 'string', substring: 'string' }, (p) => ({ count: S(p.text, 'text').split(S(p.substring, 'substring')).length - 1 })));
reg(tool('remove_punctuation', 'Strip punctuation from text.', { text: 'string' }, (p) => ({ result: S(p.text, 'text').replace(/[^\w\s]|_/g, '') })));
reg(tool('initials', 'Get the initials of a name.', { name: 'string' }, (p) => ({ initials: S(p.name, 'name').trim().split(/\s+/).map((w) => w[0].toUpperCase()).join('') })));
reg(tool('reverse_words', 'Reverse the order of words in text.', { text: 'string' }, (p) => ({ result: S(p.text, 'text').split(/\s+/).reverse().join(' ') })));
reg(tool('longest_word', 'Find the longest word in text.', { text: 'string' }, (p) => { const w = S(p.text, 'text').match(/\S+/g) || []; return { word: w.reduce((a, b) => b.length > a.length ? b : a, ''), length: Math.max(0, ...w.map((x) => x.length)) }; }));
reg(tool('mask_string', 'Mask all but the last N chars of a string.', { text: 'string', visible: 'number — default 4' }, (p) => { const t = S(p.text, 'text'), v = Number(p.visible) || 4; return { result: t.length <= v ? t : '•'.repeat(t.length - v) + t.slice(-v) }; }));
reg(tool('char_frequency', 'Count frequency of each character in text.', { text: 'string' }, (p) => { const f = {}; for (const c of S(p.text, 'text').replace(/\s/g, '')) f[c] = (f[c] || 0) + 1; return { frequency: Object.fromEntries(Object.entries(f).sort((a, b) => b[1] - a[1]).slice(0, 20)) }; }));
reg(tool('count_vowels', 'Count vowels and consonants in text.', { text: 'string' }, (p) => { const t = S(p.text, 'text').toLowerCase(); const v = (t.match(/[aeiou]/g) || []).length, c = (t.match(/[bcdfghjklmnpqrstvwxyz]/g) || []).length; return { vowels: v, consonants: c }; }));

// ── checks / transforms ────────────────────────────────────────────
reg(tool('palindrome_check', 'Check if text is a palindrome.', { text: 'string' }, (p) => { const t = S(p.text, 'text').toLowerCase().replace(/[^a-z0-9]/g, ''); return { isPalindrome: t === t.split('').reverse().join('') }; }));
reg(tool('anagram_check', 'Check if two strings are anagrams.', { a: 'string', b: 'string' }, (p) => { const norm = (x) => S(x, 'input').toLowerCase().replace(/[^a-z0-9]/g, '').split('').sort().join(''); return { areAnagrams: norm(p.a) === norm(p.b) }; }));
reg(tool('levenshtein', 'Edit distance between two strings.', { a: 'string', b: 'string' }, (p) => { const a = S(p.a, 'a'), b = S(p.b, 'b'); const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]); for (let j = 0; j <= b.length; j++) d[0][j] = j; for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); return { distance: d[a.length][b.length] }; }));
reg(tool('string_similarity', 'Similarity % between two strings (0–100).', { a: 'string', b: 'string' }, (p) => { const a = S(p.a, 'a'), b = S(p.b, 'b'); const lev = (x, y) => { const d = Array.from({ length: x.length + 1 }, (_, i) => [i, ...Array(y.length).fill(0)]); for (let j = 0; j <= y.length; j++) d[0][j] = j; for (let i = 1; i <= x.length; i++) for (let j = 1; j <= y.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1)); return d[x.length][y.length]; }; const m = Math.max(a.length, b.length) || 1; return { similarity: Math.round((1 - lev(a, b) / m) * 100) + '%' }; }));
reg(tool('caesar_cipher', 'Shift letters by N (Caesar cipher).', { text: 'string', shift: 'number — default 3' }, (p) => { const s = ((Number(p.shift) || 3) % 26 + 26) % 26; return { result: S(p.text, 'text').replace(/[a-z]/gi, (c) => { const base = c <= 'Z' ? 65 : 97; return String.fromCharCode((c.charCodeAt(0) - base + s) % 26 + base); }) }; }));
reg(tool('atbash_cipher', 'Encode/decode with the Atbash cipher.', { text: 'string' }, (p) => ({ result: S(p.text, 'text').replace(/[a-z]/gi, (c) => { const base = c <= 'Z' ? 65 : 97; return String.fromCharCode(base + 25 - (c.charCodeAt(0) - base)); }) })));
reg(tool('leetspeak', 'Convert text to leetspeak.', { text: 'string' }, (p) => ({ result: S(p.text, 'text').replace(/[aeiostAEIOST]/g, (c) => ({ a: '4', e: '3', i: '1', o: '0', s: '5', t: '7', A: '4', E: '3', I: '1', O: '0', S: '5', T: '7' }[c])) })));
reg(tool('nato_phonetic', 'Spell text in the NATO phonetic alphabet.', { text: 'string' }, (p) => { const N = { a: 'Alfa', b: 'Bravo', c: 'Charlie', d: 'Delta', e: 'Echo', f: 'Foxtrot', g: 'Golf', h: 'Hotel', i: 'India', j: 'Juliett', k: 'Kilo', l: 'Lima', m: 'Mike', n: 'November', o: 'Oscar', p: 'Papa', q: 'Quebec', r: 'Romeo', s: 'Sierra', t: 'Tango', u: 'Uniform', v: 'Victor', w: 'Whiskey', x: 'Xray', y: 'Yankee', z: 'Zulu' }; return { result: S(p.text, 'text').toLowerCase().split('').map((c) => N[c] || (/\d/.test(c) ? c : '')).filter(Boolean).join(' ') }; }));
reg(tool('format_phone', 'Format a 10-digit US phone number.', { number: 'string' }, (p) => { const d = S(p.number, 'number').replace(/\D/g, ''); if (d.length !== 10) throw new Error('need 10 digits'); return { result: `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` }; }));

// ── date / time ────────────────────────────────────────────────────
reg(tool('is_leap_year', 'Check whether a year is a leap year.', { year: 'number' }, (p) => { const y = Number(S(p.year, 'year')); return { year: y, leap: (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 }; }));
reg(tool('day_of_week', 'Day of week for a date (YYYY-MM-DD).', { date: 'string' }, (p) => { const d = new Date(S(p.date, 'date')); if (isNaN(d)) throw new Error('use YYYY-MM-DD'); return { day: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][d.getUTCDay()] }; }));
reg(tool('add_days', 'Add N days to a date.', { date: 'string — YYYY-MM-DD', days: 'number' }, (p) => { const d = new Date(S(p.date, 'date')); d.setUTCDate(d.getUTCDate() + Number(p.days || 0)); return { result: d.toISOString().slice(0, 10) }; }));
reg(tool('week_number', 'ISO week number for a date.', { date: 'string — YYYY-MM-DD' }, (p) => { const d = new Date(S(p.date, 'date')); const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); const day = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - day); const ys = new Date(Date.UTC(t.getUTCFullYear(), 0, 1)); return { week: Math.ceil(((t - ys) / 864e5 + 1) / 7) }; }));
reg(tool('quarter', 'Fiscal quarter for a date.', { date: 'string — YYYY-MM-DD' }, (p) => { const d = new Date(S(p.date, 'date')); return { quarter: 'Q' + (Math.floor(d.getUTCMonth() / 3) + 1), year: d.getUTCFullYear() }; }));
reg(tool('zodiac_sign', 'Western zodiac sign for a birthdate.', { date: 'string — YYYY-MM-DD or MM-DD' }, (p) => { const d = new Date(S(p.date, 'date').length <= 5 ? '2000-' + p.date : p.date); const m = d.getUTCMonth() + 1, day = d.getUTCDate(); const signs = [[1, 20, 'Aquarius'], [2, 19, 'Pisces'], [3, 21, 'Aries'], [4, 20, 'Taurus'], [5, 21, 'Gemini'], [6, 21, 'Cancer'], [7, 23, 'Leo'], [8, 23, 'Virgo'], [9, 23, 'Libra'], [10, 23, 'Scorpio'], [11, 22, 'Sagittarius'], [12, 22, 'Capricorn']]; let sign = 'Capricorn'; for (const [sm, sd, nm] of signs) if (m === sm && day >= sd || m === (sm % 12) + 1 && day < (signs[sm % 12][1])) { sign = nm; break; } return { sign }; }));
reg(tool('business_days', 'Count business days (Mon–Fri) between two dates.', { from: 'string — YYYY-MM-DD', to: 'string — YYYY-MM-DD' }, (p) => { let d = new Date(S(p.from, 'from')); const end = new Date(S(p.to, 'to')); let n = 0; while (d <= end) { const w = d.getUTCDay(); if (w !== 0 && w !== 6) n++; d.setUTCDate(d.getUTCDate() + 1); } return { businessDays: n }; }));
reg(tool('time_until', 'Time remaining until a future date.', { date: 'string — YYYY-MM-DD' }, (p) => { const t = new Date(S(p.date, 'date')) - new Date(); if (t < 0) return { note: 'date is in the past' }; const days = Math.floor(t / 864e5); return { days, hours: Math.floor(t / 36e5) % 24, readable: days + ' days' }; }));

module.exports = { TOOLS_UTILS3, _count: Object.keys(TOOLS_UTILS3).length };
