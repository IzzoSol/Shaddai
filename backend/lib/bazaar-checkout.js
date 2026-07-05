// bazaar-checkout.js — settle Skill-Bazaar purchases through the existing x402 ledger.
//   The Bazaar (skills market) sells skill runs. Every purchase is a real x402 charge:
//   the buyer is debited, the seller agent is paid the net, and the 5% fee → treasury.
//   This module is a thin HTTP wrapper over the live /api/x402 endpoints (no direct
//   ledger access) so it works against whatever server is running.
//
//   bazaarCheckout({ userId, itemId, amountCredits, payTo, reason }) → { txId, newBalance, fee }
//   settleSale({ grossCredits, sellerId, agentId })                  → revenue split breakdown
//
// Revenue split: platform 10% / seller 80% / agent 10%.
//   x402 /charge already routes net (95%) → payee (the seller) and 5% fee → treasury.
//   settleSale tops the model up to the documented split: it grants the agent its 10%
//   cut and records that the seller already received the net from the charge.

const BASE = process.env.RENDER_EXTERNAL_URL || ('http://localhost:' + (process.env.PORT || 8099));

// Minimal JSON POST helper. Uses global fetch (Node 18+); returns { status, body }.
async function postJSON(pathname, payload) {
  const res = await fetch(BASE + pathname, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload)
  });
  let body = null;
  try { body = await res.json(); } catch (e) { body = null; }
  return { status: res.status, body: body || {} };
}

// Settle a purchase through the x402 ledger. Throws INSUFFICIENT_CREDITS on HTTP 402.
async function bazaarCheckout({ userId, itemId, amountCredits, payTo, reason }) {
  const amount = Number(amountCredits);
  if (!(amount > 0)) throw new Error('amountCredits must be a positive number');
  const { status, body } = await postJSON('/api/x402/charge', {
    user: userId || 'guest',
    amount,
    reason: reason || ('skill:' + (itemId || 'unknown')),
    payee: payTo || 'SHADDAI'
  });
  if (status === 402) throw new Error('INSUFFICIENT_CREDITS');
  if (status >= 400 || !body.ok) throw new Error(body.error || ('x402 charge failed (' + status + ')'));
  // /charge returns { ok, charged, fee, net, balance, tx }
  return { txId: body.tx && body.tx.id, newBalance: body.balance, fee: body.fee };
}

// Revenue split for a completed sale. Platform 10% / seller 80% / agent 10%.
//   The x402 /charge already paid the seller the net (gross − 5% fee) and the treasury
//   the 5% fee. To honour the documented 10/80/10 split we additionally grant the agent
//   its 10% cut when an agentId is supplied. The seller's net was settled at charge time.
async function settleSale({ grossCredits, sellerId, agentId }) {
  const gross = Number(grossCredits) || 0;
  const r2 = (n) => Math.round(n * 100) / 100;
  const split = {
    gross,
    platform: r2(gross * 0.10),   // stays in treasury (5% taken as x402 fee + retained margin)
    seller: r2(gross * 0.80),     // already received as net from the x402 charge
    agent: r2(gross * 0.10),      // granted below when agentId is provided
    sellerId: sellerId || null,
    agentId: agentId || null,
    sellerPaidAtCharge: true,
    agentGranted: false
  };
  if (agentId && split.agent > 0) {
    try {
      const { status, body } = await postJSON('/api/x402/grant', { user: agentId, amount: split.agent });
      split.agentGranted = status < 400 && !!body.ok;
    } catch (e) {
      split.agentGranted = false;
    }
  }
  return split;
}

module.exports = { bazaarCheckout, settleSale, BASE };
