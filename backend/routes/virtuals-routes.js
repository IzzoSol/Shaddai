'use strict';
// virtuals-routes.js — read-only REST surface for ZEROX's Virtuals ACP identity.
// Mirrors the MCP tools (zerox_virtuals_me, zerox_virtuals_agent, zerox_wallet_status)
// so the browser terminals (simple-signals, signals) can show the ACP identity,
// marketplace listing, and live gas/wallet status without needing an MCP client.
// These endpoints are GET-only and NEVER echo the VIRTUALS_API_KEY — identity
// fields (agent id/name/wallet) are fine to expose; the secret stays server-side.

const express = require('express');
const router = express.Router({ mergeParams: true });

const KEY = () => String(process.env.VIRTUALS_API_KEY || process.env.VIRTUALS_ACP_KEY || '').trim();
const ACS_BASE = () => (process.env.VIRTUALS_ACP_BASE || 'https://claw-api.virtuals.io').replace(/\/+$/, '');
const ACPX_BASE = () => (process.env.VIRTUALS_ACPX_BASE || 'https://acpx.virtuals.io').replace(/\/+$/, '');
const SOL_WALLET = () => String(process.env.VIRTUALS_SOL_WALLET || '').trim();
const BASE_WALLET = () => String(process.env.VIRTUALS_BASE_WALLET || '').trim().toLowerCase();

async function vApi(p) {
  const k = KEY();
  if (!k) return { error: 'VIRTUALS_API_KEY not set (backend/.env). Registration state unknown.' };
  try {
    const r = await fetch(ACS_BASE() + p, {
      method: 'GET',
      headers: { 'x-api-key': k },
      signal: AbortSignal.timeout(60000),
    });
    const txt = await r.text().catch(() => '');
    let j = {};
    try { j = txt ? JSON.parse(txt) : {}; } catch (_) { return { status: r.status, error: 'non-JSON reply from Virtuals ACP' }; }
    if (!r.ok) return { status: r.status, ...j };
    return Object.keys(j).length ? j : { empty: true };
  } catch (e) {
    return { error: 'request failed: ' + ((e && e.message) || e) };
  }
}

// GET /api/virtuals/status — ACP identity/registration state
router.get('/api/virtuals/status', async (req, res) => {
  const out = {
    ok: true,
    keySet: !!KEY(),
    base: ACS_BASE(),
    solWallet: SOL_WALLET(),
    baseWallet: BASE_WALLET(),
    identity: null,
    registered: null,
  };
  if (!KEY()) return res.json({ ...out, ok: false, detail: 'VIRTUALS_API_KEY not set (backend/.env).' });
  try {
    const d = await vApi('/acp/me');
    if (d.status || d.error || d.empty) {
      out.ok = false;
      out.registered = false;
      out.detail = (d.status ? 'ACP HTTP ' + d.status : (d.error || 'empty reply — agent may not be registered'));
    } else {
      const info = d.data && !Array.isArray(d.data) && typeof d.data === 'object' ? d.data : d;
      const agent = info.agent || info.agentId || info.name || info.id || null;
      out.registered = !!agent;
      out.identity = {
        agent,
        name: info.name || info.agent || null,
        id: info.id || info.agentId || null,
        walletAddress: info.walletAddress || info.wallet || null,
        status: info.status || 'ok',
        tokenSymbol: info.tokenSymbol || null,
      };
      out.detail = out.registered ? 'registered' : 'agent not registered yet — activate at https://app.virtuals.io/acp/agents (Settings → Generate API).';
    }
  } catch (e) {
    out.ok = false;
    out.detail = String((e && e.message) || e);
  }
  res.json(out);
});

// GET /api/virtuals/agent/:id — public marketplace listing/detail (no key needed)
router.get('/api/virtuals/agent/:id', async (req, res) => {
  const id = String(req.params.id || '').trim();
  if (!id) return res.status(400).json({ error: 'agent id required' });
  try {
    const r = await fetch(ACPX_BASE() + '/api/agents/' + encodeURIComponent(id) + '/details', {
      method: 'GET', signal: AbortSignal.timeout(60000),
    });
    const txt = await r.text().catch(() => '');
    const d = txt ? JSON.parse(txt) : {};
    if (!r.ok) return res.status(r.status < 600 ? r.status : 502).json({ error: (d.error && d.error.message) || (d.statusCode ? 'HTTP ' + d.statusCode : 'HTTP ' + r.status) });
    const info = d.data || d.details || d;
    res.json({
      ok: true,
      id,
      name: info.name || info.agent || null,
      description: info.description || null,
      tokenSymbol: info.tokenSymbol || null,
      walletAddress: info.walletAddress || info.wallet || null,
      offerings: Array.isArray(info.offerings) ? info.offerings.map((o) => ({
        name: o.name || o.jobOfferingName || o.title || '?',
        feeUsd: o.feeUsd || null,
        automated: typeof o.automated === 'boolean' ? o.automated : null,
      })) : [],
    });
  } catch (e) {
    res.status(502).json({ error: String((e && e.message) || e) });
  }
});

// GET /api/virtuals/wallets — live gas/balance of the ZEROX agent wallets (public RPCs, read-only)
router.get('/api/virtuals/wallets', async (req, res) => {
  const resOut = { ok: true, wallets: [] };

  if (BASE_WALLET()) {
    try {
      const r = await fetch('https://mainnet.base.org', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getBalance', params: [BASE_WALLET(), 'latest'] }),
        signal: AbortSignal.timeout(60000),
      });
      const j = await r.json().catch(() => ({}));
      const eth = j.result ? parseInt(j.result, 16) / 1e18 : 0;
      resOut.wallets.push({ chain: 'base', label: 'ZEROX Base (ACP provider)', address: BASE_WALLET(), balance: eth, funded: eth >= 0.001 });
    } catch (e) { resOut.wallets.push({ chain: 'base', label: 'ZEROX Base (ACP provider)', address: BASE_WALLET(), balance: null, funded: null, error: String((e && e.message) || e) }); }
  }

  if (SOL_WALLET()) {
    try {
      const r = await fetch('https://api.mainnet-beta.solana.com', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getBalance', params: [SOL_WALLET()] }),
        signal: AbortSignal.timeout(60000),
      });
      const j = await r.json().catch(() => ({}));
      const sol = j.result && j.result.value != null ? j.result.value / 1e9 : 0;
      resOut.wallets.push({ chain: 'solana', label: 'ZEROX Solana agent', address: SOL_WALLET(), balance: sol, funded: sol >= 0.001 });
    } catch (e) { resOut.wallets.push({ chain: 'solana', label: 'ZEROX Solana agent', address: SOL_WALLET(), balance: null, funded: null, error: String((e && e.message) || e) }); }
  }

  if (!resOut.wallets.length) resOut.detail = 'No agent wallets configured (VIRTUALS_BASE_WALLET / VIRTUALS_SOL_WALLET).';
  res.json(resOut);
});

module.exports = router;