// bazaar-checkout.js — settle Skill-Bazaar purchases through the existing x402 ledger.
//   The Bazaar (skills market) sells skill runs. Every purchase is a real x402 charge:
//   the buyer is debited, the seller agent is paid the net, and the 5% fee → treasury.
//   This module is a thin HTTP wrapper over the live /api/x402 endpoints (no direct
//   ledger access) so it works against whatever server is running.
//
//   bazaarCheckout({ userId, itemId, amountCredits, payTo, reason }) → { txId, newBalance, fee }
//   settleSale({ grossCredits, sellerId, agentId })                  → revenue split breakdown
//
// Revenue split: 5% platform fee, 95% seller — nothing else.
//   The x402 /charge already pays the seller the net (gross − 5% fee) and the
//   treasury the 5% fee (paybox-settle FEE_RATE = 0.05, the finalize plan's
//   stated settlement: 5% fee, no cash-out). settleSale MUST NOT grant
//   anything on top: the old code granted the agent a further 10% via
//   /api/x402/grant, so a sale paid out 95% + 10% = 105% — minted money.
//   The selling agent's pay IS the seller's 95% net (the seller is usually
//   the agent). If an agent commission is ever wanted, it comes OUT of the
//   seller's 95% (or the platform's 5%) — never on top. Parts sum to 100%.

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

// Revenue split for a completed sale — 5% platform fee / 95% seller / 0% agent.
//   The x402 /charge already paid the seller the net (gross − 5% fee) and the
//   treasury the 5% fee. There is NO additional grant: the old code granted
//   the agent +10% on top (95 + 10 = 105% paid out). The selling agent's pay
//   is the seller's 95% net. Parts sum to exactly 100% of gross.
async function settleSale({ grossCredits, sellerId, agentId }) {
  const gross = Number(grossCredits) || 0;
  const r2 = (n) => Math.round(n * 100) / 100;
  const split = {
    gross,
    platform: r2(gross * 0.05),   // taken as the x402 fee at charge time
    seller: r2(gross * 0.95),     // already received as net from the x402 charge
    agent: 0,                     // no top-up: any agent commission must come out of the seller's 95%, never on top
    sellerId: sellerId || null,
    agentId: agentId || null,
    sellerPaidAtCharge: true,
    agentGranted: false
  };
  return split;
}

module.exports = { bazaarCheckout, settleSale, BASE };
