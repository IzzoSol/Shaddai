'use strict';
// One secret scanner for skills, homework and exam outputs.
const SECRET_KEY = /private|secret|seed|mnemonic|password|api_?key/i;
const SECRET_VALUES = [
  /\bsk-[A-Za-z0-9_-]{10,}/,                                   // OpenAI / Anthropic style (sk-proj-..., sk-ant-...)
  /\bxai-[A-Za-z0-9_-]{10,}/,
  /\bgh[pousr]_[A-Za-z0-9]{20,}/,                              // GitHub tokens
  /\bAKIA[0-9A-Z]{16}\b/,                                      // AWS access key id
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/, // JWT
  /\b[0-9a-fA-F]{64}\b/,                                       // 32-byte hex
  /\b[1-9A-HJ-NP-Za-km-z]{80,90}\b/,                           // base58 private key (Solana)
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/
];

function hasSecretValue(s) { return typeof s === 'string' && SECRET_VALUES.some((re) => re.test(s)); }

function hasSecret(v, depth) {
  depth = depth || 0;
  if (depth > 8) return false;
  if (typeof v === 'string') return hasSecretValue(v);
  if (v && typeof v === 'object') return Object.keys(v).some((k) => SECRET_KEY.test(k) || hasSecret(v[k], depth + 1));
  return false;
}

module.exports = { SECRET_KEY, hasSecretValue, hasSecret };
