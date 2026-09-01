// lesson-plan.js — serves structured lesson content that agents can reference
// when performing tasks. Lessons are simple JSON objects with a title, body,
// and optional "action" that the agent should take. This is the "grok-style"
// teaching: the bot learns from curated lessons rather than hallucinating.
//
// Endpoint: GET /api/lesson-plan?agent=<codename>&topic=<topic>
// Returns: { ok: true, lesson: { title, body, action, source } }
// If no lesson matches, returns { ok: true, lesson: null }

// Pre-loaded lessons (expand as needed). Lessons are neutral, factual, and
// do not contain marketing copy or 3D world lore.
const lessons = [
  {
    topic: 'solana-basics',
    title: 'Solana Transaction Basics',
    body:
      'A Solana transaction encodes instructions for programs running on chain. ' +
      'Each instruction has a program ID, accounts (signers, writable), and data. ' +
      'Transactions are confirmed by validators via Proof of History + Tower BFT. ' +
      'Typical steps: fund a wallet, build a transaction, sign (if required), ' +
      'submit via RPC, await confirmation.',
    action: 'summarize the transaction flow in 3 bullets',
  },
  {
    topic 'paybox-ledger',
    title: 'PayBox Internal Ledger',
    body:
      'Shaddai uses a non-custodial x402 credit ledger. Purchases debit the buyer ‘s balance ' +
      'and credit the seller’s. Fees are 5 %. Receipts are written to paybox-receipts.json and ' +
      'are verifiable. No real on-chain funds move; the ledger is closed-loop.',
    action: 'explain the difference between custodial and non-custodial in 2 sentences',
  },
  {
    topic: 'pikadon-review',
    title: 'PIKADON Pre-Trade Review',
    body:
      'PIKADON reviews a PayBox payload for: valid program IDs, malicious patterns (HTML tags, ' +
      'private-key-looking strings), recipient validity (base58 Solana address or token mint), ' +
      'and spend caps. Output is PASS / FAIL / WARN with reasons. No on-chain calls unless keys are set.',
    action: 'list the 4 PIKADON check categories',
  },
];

function findLesson(topic) {
  if (!topic) return null;
  const key = topic.toLowerCase().replace(/[-s]/g, '-');
  return lessons.find(l => l.topic === key) || null;
}

module.exports = function lessonPlanRouter(app) {
  app.get('/api/lesson-plan', async (req, res) => {
    const { agent: agentCodename, topic } = req.query;
    if (!topic) return res.json({ ok: true, lesson: null });
    const lesson = findLesson(topic);
    if (!lesson) return res.json({ ok: true, lesson: null });
    res.json({ ok: true, lesson });
  });
};