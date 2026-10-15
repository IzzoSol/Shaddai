'use strict';
// One secret scanner for skills, homework and exam outputs. Every pattern is bounded so hostile input cannot stall the event loop,
// and every string is scanned only up to MAX_SCAN characters (callers also enforce body-size limits).
const SECRET_KEY = /private[_-]?key|secret|mnemonic|seed[_ -]?phrase|password|api[_-]?key/i;   // bare "seed" is a normal image parameter
const MAX_SCAN = 20000;      // characters scanned per string
const BUDGET = 200000;       // characters scanned per hasSecret() call across the whole structure

const SECRET_VALUES = [
  /\bsk-[A-Za-z0-9_-]{10,200}/,                                                                 // OpenAI / Anthropic style (sk-proj-..., sk-ant-...)
  /\bxai-[A-Za-z0-9_-]{10,200}/,
  /\bgh[pousr]_[A-Za-z0-9]{20,200}/,                                                            // GitHub tokens
  /\bAKIA[0-9A-Z]{16}\b/,                                                                       // AWS access key id
  /\beyJ[A-Za-z0-9_-]{10,1500}\.[A-Za-z0-9_-]{10,1500}\.[A-Za-z0-9_-]{10,1500}/,                // JWT
  /-----BEGIN [A-Z ]{0,20}PRIVATE KEY-----/
];
// Shapes that are secrets when bare but ordinary when labeled (tx hashes, signatures, checksums).
const LABELED = [/\b[0-9a-fA-F]{64}\b/g, /\b[1-9A-HJ-NP-Za-km-z]{80,90}\b/g];
const LABEL = /(hash|sha-?256|digest|signature|\btx\b|txid|transaction|checksum|commit)/i;

function hasSecretValue(s) {
  if (typeof s !== 'string') return false;
  const t = s.length > MAX_SCAN ? s.slice(0, MAX_SCAN) : s;
  if (SECRET_VALUES.some((re) => re.test(t))) return true;
  for (const re of LABELED) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(t)) !== null) {
      if (!LABEL.test(t.slice(Math.max(0, m.index - 24), m.index))) return true;
    }
  }
  return false;
}

function hasSecret(v) {
  const budget = { left: BUDGET };
  return scan(v, 0, budget);
}
function scan(v, depth, budget) {
  if (depth > 8 || budget.left <= 0) return false;
  if (typeof v === 'string') { budget.left -= Math.min(v.length, MAX_SCAN); return hasSecretValue(v); }
  if (v && typeof v === 'object') {
    for (const k of Object.keys(v)) {
      if (SECRET_KEY.test(k)) return true;
      if (scan(v[k], depth + 1, budget)) return true;
    }
  }
  return false;
}

module.exports = { SECRET_KEY, hasSecretValue, hasSecret };
