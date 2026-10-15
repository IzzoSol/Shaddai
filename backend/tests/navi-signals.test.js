// node backend/tests/navi-signals.test.js — Navi signals tier gating (server-side, PIKADON rule)
const assert = require('assert'); const { buildSignalsResponse: B, isPaid, FREE_DELAY_MS } = require('../lib/navi-signals');
let pass = 0; const t = (n, f) => { try { f(); pass++; console.log('  ok  ' + n); } catch (e) { console.log('  FAIL ' + n + ': ' + e.message); process.exitCode = 1; } };
const now = 1_000_000_000_000, min = 60000, mk = (i, ageMin) => ({ symbol: 'T' + i, chain: 'sol', ts: now - ageMin * min, mint: 'M' + i, entry: 1 + i, stop: 0.5, target: 5, peakMult: 2.345 + i, link: 'https://x/' + i });
const calls = [mk(1, 2), mk(2, 5), mk(3, 20), mk(4, 30), mk(5, 45), mk(6, 90), mk(7, 200)];
t('free preview: only calls at least 15 minutes old, max 3, newest first', () => { const r = B({ tier: 'free', calls, now }); assert.strictEqual(r.live, false); assert.strictEqual(r.locked, true); assert.deepStrictEqual(r.calls.map(c => c.symbol), ['T3', 'T4', 'T5']); assert(r.calls.every(c => c.ageMin >= 15)); assert.strictEqual(r.delayMin, 15); });
t('free preview never leaks entry, stop, target, mint or link', () => { const r = B({ tier: 'free', calls, now }); r.calls.forEach(c => { ['entry', 'stop', 'target', 'mint', 'link', 'ts'].forEach(k => assert(!(k in c), 'leaked ' + k)); }); assert(r.upgrade && /paid/.test(r.upgrade.msg)); });
t('paid tiers get the live feed with every field, newest first, capped at 50', () => {
  ['pro', 'elite', 'MAX', 'founder', 'builder', 'alpha'].forEach(tier => { const r = B({ tier, calls, now }); assert(r.live && !r.locked && r.calls[0].symbol === 'T1' && r.calls[0].entry === 2 && r.calls[0].mint === 'M1'); });
  const many = Array.from({ length: 80 }, (_, i) => mk(i, i)); assert.strictEqual(B({ tier: 'pro', calls: many, now }).calls.length, 50);
});
t('unknown / missing / garbage tier is treated as free (never paid by accident)', () => { [undefined, null, '', 'gold', 'PRO ', '__proto__', 'true'].forEach(x => { const r = B({ tier: x, calls, now }); assert.strictEqual(r.locked, !isPaid(x)); }); assert(!isPaid('gold') && !isPaid(undefined) && !isPaid('free') && isPaid('Pro')); });
t('empty feed is a valid answer for both', () => { assert.strictEqual(B({ tier: 'free', calls: [], now }).count, 0); assert.strictEqual(B({ tier: 'pro', calls: [], now }).count, 0); assert.strictEqual(FREE_DELAY_MS, 900000); });
console.log(pass + ' passed');
