'use strict';
// FREE-STACK — singleton wiring for the free-keys modules (free-router,
// charging, topup) described in the shaddai-free-keys SHADDAI_PATCH (Step 3).
// Loads the provider catalog (backend/data/providers.json — the ONE place
// model ids live), builds the router + charging engine + top-up service
// against billing-service's ledger, and runs startup model validation once
// (fire-and-forget: a provider that can't be reached keeps its catalog
// models, flagged unvalidated — call-time fallback still protects us).
// Requiring this module never throws: on any failure it exports { ok:false }
// and callers fall back to the legacy path.
let stack = null;

function build() {
  if (stack) return stack;
  try {
    const { FreeRouter, loadCatalog } = require('./free-router');
    const { ChargingEngine } = require('./charging');
    const { TopupService } = require('./topup');
    const billing = require('../billing-service');

    const catalog = loadCatalog();
    const router = new FreeRouter({ catalog });
    const charging = new ChargingEngine({ catalog });
    const topups = new TopupService({
      getBalance: async (userId) => {
        const c = billing.getOrCreateCustomer(String(userId));
        return c ? (c.creditsRemaining || 0) : 0;
      },
      applyCredit: async (userId, grant) => {
        billing.getOrCreateCustomer(String(userId));
        return billing.credit(String(userId), grant.credits, 'topup');
      },
      notifyOwner: async () => {},
    });

    // Startup validation prunes models a provider no longer lists, so the
    // next decommission is a log line instead of an outage. Never awaited:
    // boot must not block on provider latency, and failure is non-fatal.
    router.validateModels()
      .then(r => { if (r && r.pruned && r.pruned.length) console.warn('[free-stack] pruned dead models:', r.pruned.map(p => p.ref).join(', ')); })
      .catch(e => console.warn('[free-stack] model validation skipped:', e.message));

    stack = { ok: true, router, charging, topups, catalog };
  } catch (e) {
    console.warn('[free-stack] unavailable, legacy path only:', e.message);
    stack = { ok: false, error: e.message };
  }
  return stack;
}

module.exports = build();
