'use strict';
// ============================================================================
// aura-warmer.js — makes AURA smarter on demand.
// Press "Train AURA" -> generate REALISTIC prompts people actually ask, answer
// each ONCE via the shared Groq pool, and store the answer in AURA. Every future
// user asking the same/similar thing then gets it FREE (FETCH/QUERY hit). This is
// how the hit-rate climbs beyond toy "sqrt(x)" compute answers.
// Uses the app's own LLM pool — costs the SHARED keys, never the owner's tokens.
// ============================================================================
const aura = require('./lib/aura');
let engine = null; try { engine = require('./agent-engine'); } catch (_) {}

// Real domains SHADDAI users care about. Templates × topics = a large, realistic bank.
const TOPICS = [
  'Bitcoin', 'Ethereum', 'Solana', 'staking', 'DeFi', 'an NFT', 'a smart contract', 'gas fees',
  'a stablecoin', 'a DAO', 'liquidity pools', 'yield farming', 'a hardware wallet', 'cold storage',
  'dollar-cost averaging', 'market cap', 'a bull market', 'a bear market', 'tokenomics', 'an airdrop',
  'a memecoin', 'RSI', 'moving averages', 'support and resistance', 'a limit order', 'slippage',
  'an LLM', 'RAG', 'a vector database', 'prompt engineering', 'fine-tuning', 'an AI agent',
  'an API key', 'rate limiting', 'a webhook', 'two-factor authentication', 'a phishing scam',
  'passive income', 'compound interest', 'a Roth IRA', 'an index fund', 'diversification',
];
const TEMPLATES = [
  'What is {t}?', 'How does {t} work?', 'Explain {t} simply.', 'Is {t} safe?',
  'What are the risks of {t}?', 'How do I get started with {t}?', 'What are the pros and cons of {t}?',
  'Give me a beginner overview of {t}.', 'How is {t} different from traditional finance?',
];
// SHADDAI-specific how-to prompts (drive users to the product's real value).
const HOWTO = [
  'How do I create an agent in SHADDAI?', 'What can the SHADDAI agents do?',
  'How does AURA save me money?', 'What is the difference between the Free and Pro tiers?',
  'How do I earn credits in SHADDAI?', 'How do I run a workflow?', 'What is the Agent Forge?',
  'How do I generate an image?', 'How do the Council agents work together?',
  'What is the SHADDAI marketplace?', 'How do I bring my own API key?', 'What is a Founder tier?',
  'How do I set up my profile?', 'What is the Battle Arena?', 'How do skill loadouts work?',
];
const GENERAL = [
  'How do I stay productive while learning to code?', 'What is a good morning routine for focus?',
  'How do I write a clear cold email?', 'Give me tips for negotiating a raise.',
  'How do I build a personal brand online?', 'What makes a good landing page?',
];

function buildBank() {
  const bank = [];
  for (const t of TOPICS) for (const tpl of TEMPLATES) bank.push(tpl.replace('{t}', t));
  bank.push(...HOWTO, ...GENERAL);
  return bank; // ~ 40*9 + ~21 ≈ 380 realistic prompts
}
const BANK = buildBank();

async function warmOne(prompt) {
  try {
    const hit = aura.route(prompt);
    if (hit && hit.hit) return 'hit';
    if (!engine || typeof engine.modelChat !== 'function') return 'no-engine';
    const r = await engine.modelChat([{ role: 'user', content: prompt }], 'ORACLE', { maxTokens: 380 });
    const ans = r && (r.content || r.answer);
    if (ans && ans.trim().length > 20) { try { aura.recordAnswer(prompt, ans); } catch (_) {} return 'cached'; }
    return 'no-answer';
  } catch (_) { return 'error'; }
}

let _cursor = 0;
// Warm N prompts (bounded). Sequential so we don't hammer the shared pool. Returns progress.
async function warm(n = 10) {
  n = Math.max(1, Math.min(40, parseInt(n) || 10));
  let cached = 0, alreadyHit = 0, failed = 0;
  for (let i = 0; i < n; i++) {
    const prompt = BANK[_cursor % BANK.length]; _cursor++;
    const s = await warmOne(prompt);
    if (s === 'cached') cached++; else if (s === 'hit') alreadyHit++; else failed++;
  }
  let st = {}; try { st = aura.stats() || {}; } catch (_) {}
  return {
    tried: n, cached, alreadyHit, failed,
    bankSize: BANK.length, coveredSoFar: _cursor,
    hitRate: st.hitRate ?? null, cacheSize: st.cacheSize ?? st.entries ?? null,
  };
}

// Background self-improvement: constantly warm AURA on the server (shared pool, no
// owner tokens). OFF by default — enable with env AURA_AUTOWARM=true. Gentle by
// design so it doesn't hog the shared free quota real users need.
let _autoTimer = null;
function startAutoWarm() {
  if (_autoTimer) return false;
  if (String(process.env.AURA_AUTOWARM || '').toLowerCase() !== 'true') return false;
  const everyMs = Math.max(60000, parseInt(process.env.AURA_AUTOWARM_MS) || 300000); // default 5 min
  const batch = Math.max(1, Math.min(8, parseInt(process.env.AURA_AUTOWARM_BATCH) || 3));
  _autoTimer = setInterval(() => { warm(batch).catch(() => {}); }, everyMs);
  if (_autoTimer.unref) _autoTimer.unref();
  console.log(`[aura-warmer] auto-warm ON — ${batch} prompts / ${everyMs / 1000}s (fills AURA in the background)`);
  return true;
}

module.exports = { warm, bankSize: () => BANK.length, startAutoWarm };
