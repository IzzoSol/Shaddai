// backend/lib/charging.js  (PATCH FILE — copy into shaddai-repo, do not edit in place here)
// ─────────────────────────────────────────────────────────────────────────────
// PER-MODEL DIRECT CHARGING ENGINE
//
// Every model has its OWN price, computed from a real call's measured tokens:
//
//   providerCostUsd = inTokens/1e6 * costInPer1M + outTokens/1e6 * costOutPer1M
//   chargeCredits   = ceil(providerCostUsd * markup * CREDITS_PER_USD)
//   1 Spark = $1 = 100 credits   (fixed in lib/tiers.js — canonical)
//
// LANES:
//   free  — provider cost $0 to us → user charge 0 credits. Still METERED:
//           every call is counted and rate-capped per user per day, so a
//           free tier can't be farmed and we can see real usage.
//   local — $0 both sides, metered the same way.
//   grok  — a connected Grok bot lane; metered, charge per its table row.
//   paid  — charge per the formula above, subject to min charge + run cap.
//   byok  — user's own key → 0 credits, ALWAYS (existing rule in
//           credit-costs.json: "BYOK = 0 credits, never debited, never
//           blocked"). Metered for visibility only.
//
// SAFETY (from the 2026-11 pricing research, unchanged):
//   prepaid only · per-run cap · global kill switch
//   (SHADDAI_PAID_LANES_OFF=1 closes paid/grok lanes; free/local keep working)
//
// RELATIONSHIP TO EXISTING CODE — read before arguing:
//   lib/tiers.js says "talking is NOT metered; Sparks are only for produced
//   output" and credit-costs.json charges fast_chat 1cr / strong_chat 10cr
//   per ACTION. This engine is the per-MODEL layer Israel asked for
//   (2026-11-11): when a call goes through free-router.js, settle() here
//   replaces the flat action cost for that call. Free-lane calls settle at
//   0 credits — which keeps tiers.js's promise for the common case — while
//   paid-lane calls charge what the model actually cost. The CONTRADICTION
//   is real and flagged in shaddai-free-keys/SHADDAI_PATCH.md: chat on a
//   PAID lane is now charged per model, where tiers.js says talking is
//   never charged. Israel picks which rule wins; the engine supports both
//   via CHARGE_PAID_CHAT (default true per his 2026-11-11 direction).
//
// RETAIL PRICES ARE CONFIG, NOT CODE. markup / minCharge / caps below are
// PROPOSAL defaults in providers.json → charging:{}. Israel settles final
// pricing; nothing here hardcodes a retail price.
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

const CREDITS_PER_USD = 100; // 1 Spark = $1 = 100 credits (tiers.js)

const DEFAULT_CONFIG = {
  markup: 2.0,              // PROPOSAL — provider cost × markup
  minChargeCredits: 1,      // PROPOSAL — a paid call never rounds to free
  maxCreditsPerRun: 100,    // PROPOSAL — 1 Spark hard cap per single call
  chargePaidChat: true,     // per Israel 2026-11-11 (see header note)
  freeLaneDailyCapPerUser: 200, // requests/day on free+local lanes (abuse cap)
};

class ChargingEngine {
  /**
   * @param {object} opts
   * @param {object} opts.catalog  parsed providers.json
   * @param {object} [opts.config] overrides for catalog.charging / DEFAULT_CONFIG
   * @param {object} [opts.env]    env source (kill switch)
   * @param {function} [opts.now]  clock (tests)
   */
  constructor(opts = {}) {
    this.catalog = opts.catalog;
    this.config = { ...DEFAULT_CONFIG, ...((opts.catalog && opts.catalog.charging) || {}), ...(opts.config || {}) };
    this.env = opts.env || process.env;
    this.now = opts.now || (() => Date.now());
    this._byRef = new Map();
    for (const prov of (this.catalog && this.catalog.providers) || []) {
      for (const m of prov.models || []) this._byRef.set(`${prov.id}/${m.id}`, { provider: prov, model: m });
    }
    this._meter = new Map(); // `${userId}|${yyyy-mm-dd}` -> {calls, inTokens, outTokens, credits}
  }

  /** Look up the catalog row for 'provider/model'. */
  row(ref) { return this._byRef.get(ref) || null; }

  /** Is the paid path open right now? (kill switch) */
  paidLanesOpen() { return this.env.SHADDAI_PAID_LANES_OFF !== '1'; }

  /** Provider cost in USD for a measured call. Pure math, no state. */
  providerCostUsd(ref, usage) {
    const r = this.row(ref);
    if (!r) return null;
    const inT = (usage && usage.inputTokens) || 0;
    const outT = (usage && usage.outputTokens) || 0;
    return (inT / 1e6) * (r.model.costInPer1M || 0) + (outT / 1e6) * (r.model.costOutPer1M || 0);
  }

  /**
   * Plain-language per-use estimate for the dashboard picker.
   * Users see "≈ X Sparks per chat" or FREE — never per-1M math.
   * Assumes a typical chat of 2,000 in / 1,000 out tokens (config).
   */
  pickerPrice(ref) {
    const r = this.row(ref);
    if (!r) return null;
    if (r.model.lane === 'free' || r.model.lane === 'local') return { free: true, label: 'FREE' };
    const est = this.providerCostUsd(ref, { inputTokens: 2000, outputTokens: 1000 });
    const credits = this._creditsFor(est);
    const sparks = credits / CREDITS_PER_USD;
    return { free: false, credits, sparks, label: sparks < 0.1 ? 'under 0.1 Spark per chat' : `≈ ${trimNum(sparks)} Spark${sparks === 1 ? '' : 's'} per chat` };
  }

  _creditsFor(costUsd) {
    if (!costUsd || costUsd <= 0) return 0;
    const raw = Math.ceil(costUsd * this.config.markup * CREDITS_PER_USD);
    return Math.min(Math.max(raw, this.config.minChargeCredits), this.config.maxCreditsPerRun);
  }

  /** Pre-flight: may this user make this call at all? (caps + kill switch) */
  authorize(userId, ref) {
    const r = this.row(ref);
    if (!r) return { allowed: false, reason: `unknown model ${ref}` };
    const lane = r.model.lane;
    if ((lane === 'paid' || lane === 'grok') && !this.paidLanesOpen()) {
      return { allowed: false, reason: 'paid lanes are off (kill switch)' };
    }
    if (lane === 'free' || lane === 'local') {
      const used = this.meterToday(userId).calls;
      if (used >= this.config.freeLaneDailyCapPerUser) {
        return { allowed: false, reason: `free-lane daily cap reached (${this.config.freeLaneDailyCapPerUser})` };
      }
    }
    return { allowed: true, lane };
  }

  /**
   * Settle a finished call. ALWAYS meters; charges per lane rules.
   * @returns {{credits:number, sparks:number, costUsd:number, marginUsd:number,
   *            lane:string, metered:true, capped:boolean}}
   */
  settle(userId, ref, usage, opts = {}) {
    const r = this.row(ref);
    if (!r) throw new Error(`charging: unknown model ${ref}`);
    const lane = opts.byok ? 'byok' : r.model.lane;
    const costUsd = this.providerCostUsd(ref, usage) || 0;

    let credits = 0;
    let capped = false;
    if (lane === 'paid' || lane === 'grok') {
      if (this.config.chargePaidChat) {
        const raw = costUsd > 0 ? Math.ceil(costUsd * this.config.markup * CREDITS_PER_USD) : 0;
        credits = this._creditsFor(costUsd);
        capped = raw > this.config.maxCreditsPerRun;
      }
    }
    // free / local / byok: credits stays 0 — metered only.

    const key = `${userId}|${dayKey(this.now())}`;
    const m = this._meter.get(key) || { calls: 0, inTokens: 0, outTokens: 0, credits: 0 };
    m.calls += 1;
    m.inTokens += (usage && usage.inputTokens) || 0;
    m.outTokens += (usage && usage.outputTokens) || 0;
    m.credits += credits;
    this._meter.set(key, m);

    return {
      credits,
      sparks: credits / CREDITS_PER_USD,
      costUsd,
      marginUsd: credits / CREDITS_PER_USD - costUsd,
      lane,
      metered: true,
      capped,
    };
  }

  /** Today's meter for a user (all lanes): {calls, inTokens, outTokens, credits}. */
  meterToday(userId) {
    return this._meter.get(`${userId}|${dayKey(this.now())}`) || { calls: 0, inTokens: 0, outTokens: 0, credits: 0 };
  }

  /** The full per-model table (for PROVIDERS.md / admin): cost → charge → margin. */
  table() {
    const rows = [];
    for (const [ref, r] of this._byRef.entries()) {
      const estUsage = { inputTokens: 2000, outputTokens: 1000 };
      const cost = this.providerCostUsd(ref, estUsage);
      const credits = (r.model.lane === 'paid' || r.model.lane === 'grok') ? this._creditsFor(cost) : 0;
      rows.push({
        ref, provider: r.provider.id, model: r.model.id, lane: r.model.lane,
        costInPer1M: r.model.costInPer1M, costOutPer1M: r.model.costOutPer1M,
        estCostUsdPerChat: round6(cost), chargeCreditsPerChat: credits,
        chargeSparksPerChat: credits / CREDITS_PER_USD,
        marginUsdPerChat: round6(credits / CREDITS_PER_USD - cost),
      });
    }
    return rows;
  }
}

function dayKey(ts) { return new Date(ts).toISOString().slice(0, 10); }
function round6(n) { return Math.round(n * 1e6) / 1e6; }
function trimNum(n) { return (Math.round(n * 100) / 100).toString(); }

module.exports = { ChargingEngine, CREDITS_PER_USD, DEFAULT_CONFIG };
