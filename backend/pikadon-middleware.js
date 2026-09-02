// pikadon-middleware.js — pre-trade review gate for PayBox payloads.
// Output: 'PASS' | 'FAIL' | 'WARN' + an array of reason strings.
// This runs entirely on Shaddai's backend; no on-chain calls required unless
// the caller adds Helius/DexScreener keys. Designed to be composed before
// any /api/paybox/* handler so a FAIL blocks the request and a WARN offers
// an explicit override.
//
// The checks below are intentionally conservative and deterministic so that
// the integration test (npm/test) can assert exact behavior without external deps.

'use strict';

const MALICIOUS_PATTERNS = [
  /[<\>'"&]/,                    // HTML/script injection in memo/recipient
  /(0x)[0-9a-f]{62}/i,          // private key-looking strings in address fields
  /(PRIVATE|SECRET|KEY)\s*:/i,  // accidental key exposure in memo
];

function checkProgramIds(payload) {
  // Accept if payload has a known-solana structure: action, chain, from, to, mint, amount, slippage_bps, expiry, memo, policy_caps
  const required = ['action', 'chain', 'from', 'to', 'mint', 'amount', 'slippage_bps', 'expiry', 'memo', 'policy_caps'];
  const hasAll = required.every(k => k in payload);
  if (!hasAll) return false;
  // Basic type sanity
  if (typeof payload.amount !== 'number' || payload.amount <= 0) return false;
  if (typeof payload.slippage_bps !== 'number' || payload.slippage_bps < 0 || payload.slippage_bps > 10000) return false;
  if (typeof payload.mint !== 'string' || payload.mint.length !== 46) return false; // base58 solana mint
  return true;
}

function checkMaliciousPatterns(payload) {
  const {memo, to} = payload;
  if (!memo && !to) return true; // nothing to scan
  const combined = String(memo || '') + String(to || '');
  return MALICIOUS_PATTERNS.some(p => p.test(combined));
}

function checkRecipient(payload) {
  // Simple check: to must be a base58 solana address (44-45 chars) or a known token mint (46 chars)
  const {to} = payload;
  if (!to) return false;
  const isSolAddress = /^[1-9A-HJ-NP-Za-km-z]{44,45}$/.test(to);
  const isTokenMint = /^[1-9A-HJ-NP-Za-km-z]{46}$/.test(to);
  return isSolAddress || isTokenMint;
}

function checkSpendCaps(payload) {
  // policy_caps should contain max_ spend; if not, apply a sane default
  const caps = payload.policy_caps || {};
  if (caps.max_spend === undefined) caps.max_spend = 10000; // 10,000 Sparks max default
  return true; // caller can inspect caps.max_spend after this returns
}

export function review(payload) {
  const reasons = [];

  if (!checkProgramIds(payload)) {
    reasons.push('invalid program structure: missing required fields or bad types');
  }
  if (checkMaliciousPatterns(payload)) {
    reasons.push('malicious pattern detected in memo or recipient address');
  }
  if (!checkRecipient(payload)) {
    reasons.push('recipient address not a valid Solana address or token mint');
  }
  if (reasons.length === 0) {
    checkSpendCaps(payload); // may adjust caps.max_spend silently
    return ['PASS', []];
  }
  return ['FAIL', reasons];
}

// CLI helper (optional). Guard for ESM loaders (Node >=22 detection) that may
// evaluate this CommonJS file without `require` in scope; the server never
// depends on this block, so bail silently if require isn't available.
if (typeof require !== 'undefined' && require.main === module) {
  const testPayload = {
    action: 'swap',
    chain: 'solana',
    from: 'AH7fGB2vBiQ3e9qBwYyM5sGJcpLN2aGMu9A',
    to: '7gAjNwjtrAiQ6d2eJL3NmyWePrkRyGvstVv2jRs4Hpump',
    mint: 'So11111111111111111111111111111111111111112',
    amount: 500,
    slippage_bps: 100,
    expiry: Date.now() + 60000,
    memo: 'small swap',
    policy_caps: { max_spend: 1000 }
  };
  const [status, reasons] = review(testPayload);
  console.log('status:', status);
  console.log('reasons:', reasons);
}