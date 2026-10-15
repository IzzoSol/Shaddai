/* backend/lib/navi-signals.js — tier gating for the Navi SIGNALS module (owner 2026-10-01: "different subscriptions for the navi, access to ZEROX signals").
 * PIKADON rule: the tier is decided SERVER-SIDE from a VERIFIED identity; the client never says what it is allowed to see.
 *   free  -> a preview: the 3 newest calls that are at least 15 minutes old, symbol + chain + age only (no entry/stop/targets/mint/links), plus an upgrade notice.
 *   paid  -> the live feed (up to 50): everything the call carries, newest first.
 * Pure function so it is unit-tested without Express or Firebase.
 */
'use strict';
const FREE_DELAY_MS = 15 * 60 * 1000, FREE_MAX = 3, PAID_MAX = 50;
const PAID = new Set(['pro', 'elite', 'max', 'founder', 'builder', 'alpha']);   // every paid plan name used across billing-service / stripe-routes / tiers.js

function isPaid(tier) { return PAID.has(String(tier || '').toLowerCase()); }

function buildSignalsResponse(o) {
  const now = o.now || Date.now(), tier = String(o.tier || 'free').toLowerCase(), calls = Array.isArray(o.calls) ? o.calls : [];
  const sorted = calls.slice().sort((a, b) => (b.ts || 0) - (a.ts || 0));
  if (isPaid(tier)) return { ok: true, tier, live: true, locked: false, count: Math.min(PAID_MAX, sorted.length), calls: sorted.slice(0, PAID_MAX) };
  const preview = sorted.filter(c => now - (c.ts || 0) >= FREE_DELAY_MS).slice(0, FREE_MAX).map(c => ({ symbol: c.symbol || c.name || '?', chain: c.chain || '', ageMin: Math.round((now - (c.ts || 0)) / 60000), peakMult: c.peakMult != null ? Math.round(c.peakMult * 10) / 10 : null }));
  return { ok: true, tier: 'free', live: false, locked: true, delayMin: FREE_DELAY_MS / 60000, count: preview.length, calls: preview, upgrade: { msg: 'Live ZEROX signals with entries, stops and targets are part of the paid Navi plans.', path: '/pricing' } };
}

module.exports = { buildSignalsResponse, isPaid, FREE_DELAY_MS, FREE_MAX, PAID_MAX };
