'use strict';
// Flash-rug vs durable analysis over the archive — answers:
// (a) what "durable" cutoff means in practice (>=1x vs >=0.5x)
// (b) do call-time features (churn, liq depth) predict flash-rugs?
const fs = require('fs');
const j = JSON.parse(fs.readFileSync(__dirname + '/../data/tg-calls-archive-2026-10-12.json', 'utf8'));
const a = j.calls.filter((c) => (c.peakMult || 0) >= 2 && (c.curMult || 0) > 0);
const med = (arr) => { const s = arr.slice().sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };
const feat = (rows, f) => med(rows.map((c) => Number(c[f] || 0)));

const dur1 = a.filter((c) => c.curMult >= 1);
const dur05 = a.filter((c) => c.curMult >= 0.5 && c.curMult < 1);
const flash = a.filter((c) => c.curMult < 0.5);

console.log('2x+ calls with live prices:', a.length);
console.log('(a) still >=1x (never underwater):', dur1.length, '| 0.5-1x (in profit, gave back):', dur05.length, '| <0.5x (flash-rug):', flash.length);
console.log('');
console.log('(b) call-time features - medians:');
for (const f of ['entryFdv', 'liq', 'vol24', 'vol1h']) {
  console.log('  ' + f + ': durable(>=1x) ' + Math.round(feat(dur1, f)) + '  |  flash-rug ' + Math.round(feat(flash, f)));
}
const churn = (rows) => med(rows.map((c) => c.liq > 0 ? (c.vol1h || 0) / c.liq : 0));
const churn24 = (rows) => med(rows.map((c) => c.liq > 0 ? (c.vol24 || 0) / c.liq : 0));
console.log('  vol1h/liq churn: durable ' + churn(dur1).toFixed(2) + '  |  flash ' + churn(flash).toFixed(2));
console.log('  vol24/liq churn: durable ' + churn24(dur1).toFixed(1) + '  |  flash ' + churn24(flash).toFixed(1));
const thinF = flash.filter((c) => (c.liq || 0) < 20000).length / flash.length;
const thinD = dur1.filter((c) => (c.liq || 0) < 20000).length / dur1.length;
console.log('  entry liq under 20k: durable ' + Math.round(thinD * 100) + '%  |  flash ' + Math.round(thinF * 100) + '%');
const churnHiF = flash.filter((c) => c.liq > 0 && (c.vol1h || 0) / c.liq >= 3).length / flash.length;
const churnHiD = dur1.filter((c) => c.liq > 0 && (c.vol1h || 0) / c.liq >= 3).length / dur1.length;
console.log('  vol1h/liq >= 3x at entry: durable ' + Math.round(churnHiD * 100) + '%  |  flash ' + Math.round(churnHiF * 100) + '%');
