'use strict';

// scripts/seed-baseline.js — rebuild the call record's historical baseline.
//
// Owner spec (2026-10-12): "keep the all-time hit rate WITHOUT the calls that
// were at 2x rugs — a balanced number based on obvious ones I wouldn't have
// bought." Translation: keep the historical calls a real subscriber could
// have acted on, drop everything that was never buyable or never exitable:
//   KEEP   vetted calls (deep fields measured) with a measured outcome
//   DROP   unvetted fail-open calls (83% of the record — never buyable)
//   DROP   flash-rugs (peak>=2x then <0.5x — the X was never exitable)
//   DROP   seed/test entries (paper seeds, not real signals)
// The curated set is written into data/tg-calls.json (the live record) with
// baseline:true so future audits can tell baseline from new-era calls.
//
//   node scripts/seed-baseline.js [--dry]

const fs = require('fs');
const path = require('path');
const ARCHIVE = path.join(__dirname, '..', 'data', 'tg-calls-archive-2026-10-12.json');
const RECORD = path.join(__dirname, '..', 'data', 'tg-calls.json');
const DRY = process.argv.includes('--dry');

const j = JSON.parse(fs.readFileSync(ARCHIVE, 'utf8'));
const all = j.calls || [];
const unvetted = (c) => (c.rugScore === 60 || c.rugScore === 0 || c.rugScore == null) && !(c.holders > 0) && !(c.top10Pct > 0) && !(c.insiders > 0);
const measured = (c) => (Number(c.peakMult) || 0) > 1.01 || !!c.closed || (Array.isArray(c.milestones) && c.milestones.length > 0);
const flashRug = (c) => (Number(c.peakMult) || 0) >= 2 && (Number(c.curMult) || 0) > 0 && (Number(c.curMult) || 0) < 0.5;

const keep = all.filter((c) =>
  !unvetted(c) &&                                   // vetted: deep fields were measured
  measured(c) &&                                    // price outcome was tracked
  !flashRug(c) &&                                   // the X was exitable (no 2x-rug round-trips)
  c.source !== 'seed' && c.source !== 'test'        // real signal feeds only
);

const n = keep.length;
const w2 = keep.filter((c) => (c.peakMult || 0) >= 2).length;
const w5 = keep.filter((c) => (c.peakMult || 0) >= 5).length;
const dur = keep.filter((c) => (c.peakMult || 0) >= 2 && (c.curMult || 0) >= 0.5).length;
console.log(`archive: ${all.length} calls`);
console.log(`curated baseline: ${n} calls  ·  2x+ ${Math.round((w2 / n) * 100)}%  ·  durable-2x+ ${Math.round((dur / n) * 100)}%  ·  5x+ ${Math.round((w5 / n) * 100)}%`);
console.log(`dropped: ${all.length - n} (unvetted / untracked / flash-rug / seed-test)`);

if (DRY) { console.log('(dry run — record not written)'); process.exit(0); }

for (const c of keep) c.baseline = true;
fs.writeFileSync(RECORD, JSON.stringify({ calls: keep }, null, 2));
console.log(`written: ${n} baseline calls -> data/tg-calls.json`);
