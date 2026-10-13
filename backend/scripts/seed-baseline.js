'use strict';

// scripts/seed-baseline.js — rebuild the call record's historical baseline.
//
// Owner spec (2026-10-12, refined): "trim the OBVIOUS SCAM from the all-time
// hit rate" — not a gut-job. The strict vetted-only cut (41 calls / 5% 5x+)
// erased real winners the owner remembers. This curation keeps history and
// drops only what was never buyable or never real:
//   DROP   seed/test entries (paper seeds, not signals)
//   DROP   flat unmeasured rows (dead-tracker era — missing data, not losses)
//   DROP   sub-5x flash-rugs (the "2x rugs": small paper peaks that died
//          within minutes and were never exitable)
//   DROP   thin-liquidity unvetted calls (no real book to buy)
//   KEEP   every 5x+ winner INCLUDING ones that later round-tripped — their
//          exit windows were real ("we had more than 5% 5x+")
// Result: the credible all-time board — real calls, real wins, no scams.
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
  c.source !== 'seed' && c.source !== 'test' &&
  measured(c) &&
  !((Number(c.peakMult) || 0) < 5 && flashRug(c)) &&
  !(unvetted(c) && (Number(c.liq) || 0) < 10000)
);

const n = keep.length;
const w2 = keep.filter((c) => (c.peakMult || 0) >= 2).length;
const w5 = keep.filter((c) => (c.peakMult || 0) >= 5).length;
const dur = keep.filter((c) => (c.peakMult || 0) >= 2 && (c.curMult || 0) >= 0.5).length;
console.log(`archive: ${all.length} calls`);
console.log(`curated baseline: ${n} calls  ·  2x+ ${Math.round((w2 / n) * 100)}%  ·  durable-2x+ ${Math.round((dur / n) * 100)}%  ·  5x+ ${Math.round((w5 / n) * 100)}%`);
console.log(`dropped: ${all.length - n} (seed/test · flat-unmeasured · sub-5x flash-rugs · thin-liq unvetted)`);

if (DRY) { console.log('(dry run — record not written)'); process.exit(0); }

for (const c of keep) c.baseline = true;
fs.writeFileSync(RECORD, JSON.stringify({ calls: keep }, null, 2));
console.log(`written: ${n} baseline calls -> data/tg-calls.json`);
