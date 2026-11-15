// backend/lib/topup.js  (PATCH FILE — copy into shaddai-repo, do not edit in place here)
// ─────────────────────────────────────────────────────────────────────────────
// TOP UP — EASY BY DESIGN
//
// Owner flow (dashboard):  [Top up] → pick $10/$25/$50/$100 → confirm → done.
// Agent flow: the agent notices its owner's balance is low and asks ONCE —
//   balance-low → top-up REQUEST created → owner approves (one tap) →
//   payment confirmed → credited. An agent can NEVER charge silently:
//   no approval, no money. Prepaid only. Kill switch closes the whole flow.
//
// Packs are the ones already in code (backend/data/credit-costs.json →
// topups): $10/$25/$50/$100 → credits + Sparks at 1 Spark per $1.
//
// PAYMENT HERE IS **SIM**. processPayment() is a labelled simulation seam:
// in production it is replaced by the Stripe Payment Link / checkout
// confirm that billing-service.js already uses. No real charge happens in
// this file, ever.
//
// Balance storage is INJECTED (getBalance/applyCredit) so this drops onto
// billing-service.js's customer record without owning it.
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

const PACKS = {
  // id -> { usd, credits, sparks } — mirrors credit-costs.json topups exactly.
  credits_10:  { usd: 10,  credits: 1000,  sparks: 10 },
  credits_25:  { usd: 25,  credits: 2750,  sparks: 25 },
  credits_50:  { usd: 50,  credits: 6000,  sparks: 50 },
  credits_100: { usd: 100, credits: 13000, sparks: 100 },
};

const DEFAULTS = {
  lowBalanceCredits: 100, // agent speaks up when balance drops below this
};

class TopupService {
  /**
   * @param {object} opts
   * @param {function} opts.getBalance   async (userId) -> credits (number)
   * @param {function} opts.applyCredit  async (userId, {credits, sparks, topupId}) -> void
   * @param {function} [opts.notifyOwner] async (userId, topup) -> void (dashboard badge/email)
   * @param {object} [opts.env]
   * @param {function} [opts.now]
   */
  constructor(opts = {}) {
    if (typeof opts.getBalance !== 'function' || typeof opts.applyCredit !== 'function') {
      throw new Error('topup: getBalance and applyCredit are required');
    }
    this.getBalance = opts.getBalance;
    this.applyCredit = opts.applyCredit;
    this.notifyOwner = opts.notifyOwner || (async () => {});
    this.env = opts.env || process.env;
    this.now = opts.now || (() => Date.now());
    this.lowBalanceCredits = opts.lowBalanceCredits || DEFAULTS.lowBalanceCredits;
    this._topups = new Map(); // id -> topup
    this._seq = 0;
  }

  enabled() { return this.env.SHADDAI_TOPUP_OFF !== '1'; } // kill switch

  packs() { return { ...PACKS }; }

  /**
   * Create a top-up. requestedBy: 'owner' | 'agent'.
   * Owner + dashboard = the payment confirm IS the approval (status moves
   * straight to awaiting_payment). Agent = awaiting_approval until the
   * owner taps approve. Deduped: one open request per user at a time.
   */
  async request(userId, packId, requestedBy = 'owner') {
    if (!this.enabled()) return { ok: false, error: 'top-ups are off (kill switch)' };
    const pack = PACKS[packId];
    if (!pack) return { ok: false, error: `unknown pack ${packId}` };
    const open = [...this._topups.values()].find(t => t.userId === userId && (t.status === 'awaiting_approval' || t.status === 'awaiting_payment'));
    if (open) return { ok: true, topup: open, deduped: true };
    const topup = {
      id: `top_${++this._seq}_${this.now().toString(36)}`,
      userId, packId, ...pack,
      requestedBy,
      status: requestedBy === 'agent' ? 'awaiting_approval' : 'awaiting_payment',
      createdAt: this.now(), history: [{ at: this.now(), event: 'requested', by: requestedBy }],
    };
    this._topups.set(topup.id, topup);
    if (requestedBy === 'agent') await this.notifyOwner(userId, topup);
    return { ok: true, topup };
  }

  /** Owner approves an agent-initiated request. One tap in the dashboard. */
  async approve(topupId, approvedBy) {
    const t = this._topups.get(topupId);
    if (!t) return { ok: false, error: 'top-up not found' };
    if (t.status !== 'awaiting_approval') return { ok: false, error: `cannot approve from status ${t.status}` };
    if (approvedBy !== t.userId) return { ok: false, error: 'only the owner can approve' };
    t.status = 'awaiting_payment';
    t.history.push({ at: this.now(), event: 'approved', by: approvedBy });
    return { ok: true, topup: t };
  }

  async decline(topupId, declinedBy) {
    const t = this._topups.get(topupId);
    if (!t) return { ok: false, error: 'top-up not found' };
    if (declinedBy !== t.userId) return { ok: false, error: 'only the owner can decline' };
    if (t.status !== 'awaiting_approval' && t.status !== 'awaiting_payment') return { ok: false, error: `cannot decline from status ${t.status}` };
    t.status = 'declined';
    t.history.push({ at: this.now(), event: 'declined', by: declinedBy });
    return { ok: true, topup: t };
  }

  /**
   * **SIM** payment seam. In production this is where the Stripe checkout
   * confirmation lands (webhook / return URL). Here it always succeeds
   * unless the caller passes { fail:true } to exercise the failure path.
   */
  async processPayment(topup, opts = {}) {
    return { sim: true, paid: !opts.fail, ref: `SIM-${topup.id}` };
  }

  /** Confirm payment and credit the balance. Idempotent per top-up. */
  async confirmPayment(topupId, opts = {}) {
    const t = this._topups.get(topupId);
    if (!t) return { ok: false, error: 'top-up not found' };
    if (t.status === 'credited') return { ok: true, topup: t, alreadyCredited: true };
    if (t.status !== 'awaiting_payment') return { ok: false, error: `cannot pay from status ${t.status} — approval first` };
    const pay = await this.processPayment(t, opts);
    if (!pay.paid) {
      t.status = 'payment_failed';
      t.history.push({ at: this.now(), event: 'payment_failed', ref: pay.ref });
      return { ok: false, topup: t, error: 'payment failed (SIM)' };
    }
    await this.applyCredit(t.userId, { credits: t.credits, sparks: t.sparks, topupId: t.id });
    t.status = 'credited';
    t.history.push({ at: this.now(), event: 'credited', ref: pay.ref, sim: !!pay.sim });
    return { ok: true, topup: t, sim: !!pay.sim };
  }

  /**
   * The agent's low-balance check — call after any settle(). If the balance
   * is low, the agent files ONE top-up request and the owner gets notified.
   * It can ask; it can never take.
   */
  async checkBalanceAndMaybeRequest(userId, packId = 'credits_25') {
    const balance = await this.getBalance(userId);
    if (balance >= this.lowBalanceCredits) return { low: false, balance };
    const r = await this.request(userId, packId, 'agent');
    return { low: true, balance, requested: r.ok ? r.topup : null, deduped: !!r.deduped };
  }

  get(topupId) { return this._topups.get(topupId) || null; }
  openFor(userId) { return [...this._topups.values()].filter(t => t.userId === userId && (t.status === 'awaiting_approval' || t.status === 'awaiting_payment')); }
}

// ── The ONE endpoint shape (mount in server.js — see SHADDAI_PATCH.md) ──────
//   POST /api/billing/topup            { packId }            → request (owner)
//   POST /api/billing/topup/:id/approve                      → approve (owner)
//   POST /api/billing/topup/:id/pay                          → SIM confirm → credited
//   GET  /api/billing/topup/open                             → owner's open requests (badge)
function mountTopupRoutes(app, service, requireAuth) {
  const auth = requireAuth || ((req, res, next) => next());
  app.post('/api/billing/topup', auth, async (req, res) => {
    const r = await service.request(req.user.id, (req.body || {}).packId, 'owner');
    res.status(r.ok ? 200 : 400).json(r);
  });
  app.post('/api/billing/topup/:id/approve', auth, async (req, res) => {
    const r = await service.approve(req.params.id, req.user.id);
    res.status(r.ok ? 200 : 400).json(r);
  });
  app.post('/api/billing/topup/:id/pay', auth, async (req, res) => {
    const r = await service.confirmPayment(req.params.id);
    res.status(r.ok ? 200 : 400).json(r);
  });
  app.get('/api/billing/topup/open', auth, async (req, res) => {
    res.json({ open: service.openFor(req.user.id) });
  });
}

module.exports = { TopupService, PACKS, mountTopupRoutes };
