/* ══════════════════════════════════════════════════════════════════
   safe-regex.js — compile USER-supplied regex without ReDoS risk.
   Rejects catastrophic-backtracking shapes (nested quantifiers like
   (a+)+ , (a|b)* {…}), caps pattern complexity, and bounds input text.
   ══════════════════════════════════════════════════════════════════ */
'use strict';

// A quantifier applied to a group whose body ALSO contains a quantifier/alternation → classic ReDoS.
const NESTED_QUANTIFIER = /\((?:\?[:=!])?[^()]*[+*{|][^()]*\)\s*[+*{]/;

function safeRegex(pattern, flags) {
  const p = String(pattern == null ? '' : pattern);
  if (!p) throw new Error('pattern required');
  if (p.length > 300) throw new Error('pattern too long (max 300 chars)');
  if (NESTED_QUANTIFIER.test(p)) throw new Error('pattern rejected — nested quantifier (ReDoS risk)');
  if ((p.match(/[+*]/g) || []).length > 12) throw new Error('pattern rejected — too many quantifiers');
  return new RegExp(p, flags);
}

// Bound input length so even a linear-time regex can't be fed a huge string.
function capText(t, max = 20000) { return String(t == null ? '' : t).slice(0, max); }

module.exports = { safeRegex, capText };
