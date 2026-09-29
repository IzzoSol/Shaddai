'use strict';
// EXAMPLE ONLY (not mounted). Backend chain routes for world-showcase.js WorldChain adapters. Copy into Shaddai/backend and mount at /api/chain.
// RULES: signing keys live ONLY in server env (never sent to the game); every route requires an authenticated session; Sparks never touch the chain.
const express = require('express');
module.exports = function chainRoutes({ requireAuth, hedera, solana, economy, log }) {
  const r = express.Router();
  const adapters = { hedera, solana };   // each: { attest({kind,hash,meta,user}), mint({meta,user}), verifyOwner({account,user}) }
  r.use(requireAuth);
  r.post('/:chain/attest', async (req, res) => {   // receipts scoreboard: HCS topic message (Hedera) / memo tx (Solana). Body: { kind, hash, meta }
    const a = adapters[req.params.chain]; if (!a) return res.status(404).json({ ok: false, why: 'unknown chain' });
    const { kind, hash, meta } = req.body || {}; if (!/^[a-z-]{2,24}$/.test(kind || '') || !/^[a-f0-9]{16,128}$/i.test(hash || '')) return res.status(400).json({ ok: false, why: 'bad kind/hash' });
    try { const out = await a.attest({ kind, hash, meta: meta || {}, user: req.user.id }); log && log('chain.attest', { chain: req.params.chain, kind, user: req.user.id }); res.json({ ok: true, chain: req.params.chain, ...out }); }
    catch (e) { res.status(502).json({ ok: false, why: 'chain unavailable' }); }
  });
  r.post('/:chain/mint', async (req, res) => {     // NFT showcase: HTS token (Hedera) / Metaplex (Solana). Only APPROVED showcase items, only the creator.
    const a = adapters[req.params.chain]; if (!a) return res.status(404).json({ ok: false, why: 'unknown chain' });
    try { const out = await a.mint({ meta: (req.body || {}).meta, user: req.user.id }); res.json({ ok: true, chain: req.params.chain, ...out }); } catch (e) { res.status(502).json({ ok: false, why: 'chain unavailable' }); }
  });
  r.post('/:chain/verify-owner', async (req, res) => { // holder checks (tier unlock for NFT holders): read-only, address only
    const a = adapters[req.params.chain]; if (!a) return res.status(404).json({ ok: false, why: 'unknown chain' });
    try { res.json({ ok: true, ...(await a.verifyOwner({ account: (req.body || {}).account, user: req.user.id })) }); } catch (e) { res.status(502).json({ ok: false, why: 'chain unavailable' }); }
  });
  return r;
};
