// GET /api/paybox/agent-wallets — each agent's PAYBOX wallet balance, read-only.
// The balance is whatever the shared credit ledger (x402-ledger.json, written by paybox-settle) holds for that agent.
// An agent with no ledger entry shows 0, NOT the default starting credits a buyer gets, so nothing is invented.
// Solana and Hyperliquid are reported as coming_soon; this route never moves money and returns no addresses.
const fs = require('fs');
const path = require('path');
const express = require('express');

const COUNCIL = ['SHADDAI', 'ZEROX', 'ORACLE', 'NEXUS', 'TURTLE', 'QUILL', 'PIKADON'];
const r2 = (n) => Math.round(n * 100) / 100;

function make(opts) {
  const dir = (opts && opts.dataDir) || path.join(__dirname, '..', 'data');
  const router = express.Router();
  router.get('/', (req, res) => {
    let balances = {};
    try { balances = (JSON.parse(fs.readFileSync(path.join(dir, 'x402-ledger.json'), 'utf8')) || {}).balances || {}; } catch (e) { balances = {}; }
    // forged agents can be asked for by codename (?agents=Bolt,Zed); the ledger keys sellers in upper case
    const extra = String(req.query.agents || '').split(',').map((s) => s.trim()).filter((s) => /^[A-Za-z0-9 _-]{1,24}$/.test(s)).map((s) => s.toUpperCase());
    const names = COUNCIL.concat(Array.from(new Set(extra)).filter((n) => COUNCIL.indexOf(n) < 0).slice(0, 20));
    res.json({
      ok: true, unit: 'credits', chains: { paybox: 'live', solana: 'coming_soon', hyperliquid: 'coming_soon' },
      agents: names.map((n) => ({ agent: n, kind: COUNCIL.indexOf(n) > -1 ? 'council' : 'forged', balance: r2(Number(balances[n]) || 0), unit: 'credits' }))
    });
  });
  return router;
}
module.exports = make;
module.exports.COUNCIL = COUNCIL;
