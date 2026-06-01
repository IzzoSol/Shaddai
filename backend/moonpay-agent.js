// ============================================================================
// MoonPay Agents — server-side coordination for ZEROX's non-custodial trading.
// ----------------------------------------------------------------------------
// MODEL = Option A (chosen): the real MoonPay CLI/MCP (@moonpay/cli) runs on the
// USER'S machine. Wallets are non-custodial — keys live locally in the user's
// `mp` wallet and NEVER touch this server. This module therefore:
//   • holds NO keys and moves NO money,
//   • owns the PIKADON kill-switch (default ON = all trading blocked),
//   • records ZEROX trade *intents* (paper-trade first), and
//   • hands the user the exact `mp` command to sign/execute locally.
// Mounted at /api/moonpay.
// ============================================================================
const express = require('express');
const router = express.Router();
const json = express.json();

const state = {
  killSwitch: true,   // PIKADON: ON = block ALL execution. Default = safe.
  paperMode: true,    // start in simulation; real trades require explicit opt-out
  dailyCapUsd: 100,   // soft risk cap surfaced to ZEROX
  intents: [],
  updated: Date.now()
};

function snapshot() {
  return {
    killSwitch: state.killSwitch,
    paperMode: state.paperMode,
    dailyCapUsd: state.dailyCapUsd,
    intentCount: state.intents.length,
    custody: 'non-custodial — keys live in the user\'s local @moonpay/cli wallet (Option A)',
    updated: state.updated
  };
}

// Status — the UI panel and ZEROX read this BEFORE proposing/acting.
router.get('/status', (req, res) => res.json({ ok: true, ...snapshot() }));

// PIKADON kill-switch. Body {on:true|false} (omit to toggle).
router.post('/killswitch', json, (req, res) => {
  state.killSwitch = (req.body && typeof req.body.on === 'boolean') ? req.body.on : !state.killSwitch;
  state.updated = Date.now();
  res.json({ ok: true, killSwitch: state.killSwitch, by: 'PIKADON' });
});

// Paper-mode toggle. Body {on:true|false}.
router.post('/paper', json, (req, res) => {
  state.paperMode = (req.body && typeof req.body.on === 'boolean') ? req.body.on : !state.paperMode;
  state.updated = Date.now();
  res.json({ ok: true, paperMode: state.paperMode });
});

// ZEROX proposes a trade. Gated by the kill-switch. NEVER executes real funds here.
router.post('/intent', json, (req, res) => {
  if (state.killSwitch) {
    return res.status(423).json({
      ok: false, blocked: true,
      reason: 'PIKADON kill-switch is ON — trading disabled. A human must toggle it off (and accept risk) before any intent is accepted.'
    });
  }
  const b = req.body || {};
  if (!b.action || !b.fromToken || !b.toToken) {
    return res.status(400).json({ ok: false, error: 'intent requires { action, fromToken, toToken, amount, chain?, rationale? }' });
  }
  const chain = b.chain || 'solana';
  const intent = {
    id: 'mpi_' + Date.now().toString(36),
    ts: Date.now(),
    agent: b.agent || 'ZEROX',
    action: b.action,                 // 'swap' | 'bridge' | 'buy'
    fromToken: b.fromToken,
    toToken: b.toToken,
    amount: Number(b.amount) || 0,
    chain,
    rationale: b.rationale || '',
    paper: state.paperMode,
    // The exact command the USER runs in their LOCAL @moonpay/cli to sign & execute.
    // SHADDAI does NOT run this — keys never leave the user's machine.
    cliCommand: b.action === 'bridge'
      ? `mp token bridge --from-wallet main --from-chain ${chain} --from-token ${b.fromToken} --from-amount ${b.amount || 0} --to-chain ${b.toChain || chain} --to-token ${b.toToken}`
      : `mp token swap --wallet main --chain ${chain} --from-token ${b.fromToken} --from-amount ${b.amount || 0} --to-token ${b.toToken}`,
    status: state.paperMode ? 'paper-proposed' : 'awaiting-user-signature'
  };
  state.intents.unshift(intent);
  state.intents = state.intents.slice(0, 100);
  state.updated = Date.now();
  res.json({
    ok: true, intent,
    note: state.paperMode
      ? 'Paper trade recorded — no funds moved.'
      : 'Run intent.cliCommand in your local @moonpay/cli to sign & execute. SHADDAI never holds keys.'
  });
});

// Intent ledger for the UI panel.
router.get('/intents', (req, res) => res.json({ ok: true, intents: state.intents.slice(0, 50) }));

// --------------------------------------------------------------------------
// AGENT ECONOMY: pay a SHADDAI agent (in stablecoin) for completing a task.
// This is the user/ZEROX -> agent payment leg. Same safety model: kill-switch
// gated, paper-first, NON-custodial (the user signs the transfer in local mp).
// `earnings` is an in-memory tally for the dashboard; real settlement is the
// stablecoin transfer the user signs locally.
// --------------------------------------------------------------------------
const earnings = {}; // agentName -> total USD paid (paper or real)

router.post('/pay-agent', json, (req, res) => {
  if (state.killSwitch) {
    return res.status(423).json({ ok: false, blocked: true, reason: 'PIKADON kill-switch is ON — agent payments disabled.' });
  }
  const b = req.body || {};
  if (!b.agent || !(Number(b.amountUsd) > 0)) {
    return res.status(400).json({ ok: false, error: 'pay-agent requires { agent, amountUsd, task?, token?, chain?, toAddress? }' });
  }
  const token = b.token || 'usdc';
  const chain = b.chain || 'solana';
  const amount = Number(b.amountUsd);
  const payment = {
    id: 'mpp_' + Date.now().toString(36),
    ts: Date.now(),
    type: 'agent-payment',
    payTo: b.agent,
    task: b.task || '',
    amountUsd: amount,
    token, chain,
    toAddress: b.toAddress || '<agent-wallet-address>',
    paper: state.paperMode,
    // Stablecoin transfer the USER signs in their local @moonpay/cli (keys never leave their machine).
    // NOTE: verify exact transfer syntax with `mp tools` — based on the CLI's transfer support.
    cliCommand: `mp token transfer --wallet main --chain ${chain} --token ${token} --amount ${amount} --to ${b.toAddress || '<agent-wallet-address>'}`,
    status: state.paperMode ? 'paper-paid' : 'awaiting-user-signature'
  };
  earnings[b.agent] = (earnings[b.agent] || 0) + amount;
  state.intents.unshift(payment);
  state.intents = state.intents.slice(0, 100);
  state.updated = Date.now();
  res.json({
    ok: true, payment, agentEarningsUsd: earnings[b.agent],
    note: state.paperMode
      ? 'Paper payment recorded — no funds moved.'
      : 'Sign payment.cliCommand in your local @moonpay/cli to send the stablecoin to the agent wallet.'
  });
});

// Per-agent earnings tally for the dashboard.
router.get('/earnings', (req, res) => res.json({ ok: true, earnings }));

module.exports = router;
