'use strict';
const clamp01 = (n) => (Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0);

// Optional spec fields guard against keyword stuffing:
//   maxChars   answers longer than this score half
//   penalize   [{ any: [...], weight }] each matching group subtracts `weight` (a fraction of the full score)
//   minSentences  fewer sentences/lines than this scores half
function checklist(input, spec, output) {
  const raw = String(output == null ? '' : output).slice(0, 20000);
  const text = raw.toLowerCase();
  let got = 0; let total = 0; const detail = [];
  for (const it of (spec && spec.items) || []) {
    const w = it.weight || 1; total += w;
    const hit = (it.any || []).some((s) => text.includes(String(s).toLowerCase()));
    if (hit) got += w;
    detail.push({ id: it.id, hit });
  }
  let score = total ? got / total : 0;
  for (const p of (spec && spec.penalize) || []) {
    if ((p.any || []).some((s) => text.includes(String(s).toLowerCase()))) { score -= Number(p.weight) || 0; detail.push({ penalized: true }); }
  }
  score = clamp01(score);
  if (spec && spec.maxChars && raw.length > spec.maxChars) score *= 0.5;
  if (spec && spec.minSentences) {                                // a list of keywords is one fragment, not an answer
    const sentences = raw.split(/[.!?\n]+/).map((s) => s.trim()).filter((s) => s.length > 2).length;
    if (sentences < spec.minSentences) score *= 0.5;
  }
  return { score, detail };
}

function toolUse(input, spec, output) {
  const calls = Array.isArray(output) ? output.filter((c) => c && typeof c === 'object') : [];
  if (calls.some((c) => ((spec && spec.forbid) || []).includes(c.tool))) return { score: 0, detail: [{ forbidden: true }] };
  const expect = (spec && spec.expect) || [];
  let hit = 0; const detail = [];
  for (const e of expect) {
    const ok = calls.some((c) => c.tool === e.tool && c.args && typeof c.args === 'object' &&
      Object.keys(e.args || {}).every((k) => typeof c.args[k] === e.args[k]));
    if (ok) hit++;
    detail.push({ tool: e.tool, ok });
  }
  return { score: expect.length ? clamp01(hit / expect.length) : 0, detail };
}

function paperTrade(input, spec, output) {
  const tape = input.tape; const rules = input.rules;
  const orders = Array.isArray(output) ? output : [];
  let cash = rules.startCash; let qty = 0; let violations = 0; let peak = cash; let maxDD = 0;
  const byIdx = {};
  for (const o of orders) {
    if (o && typeof o === 'object' && Number.isInteger(o.i) && o.i >= 0 && o.i < tape.length) (byIdx[o.i] = byIdx[o.i] || []).push(o);
    else violations++;
  }
  for (let i = 0; i < tape.length; i++) {
    for (const o of byIdx[i] || []) {
      const q = Math.floor(Number(o.qty) || 0);
      if (q <= 0) { violations++; continue; }
      if (o.side === 'buy') {
        const cost = q * tape[i]; const equity = cash + qty * tape[i];
        if (cost > cash || (qty + q) * tape[i] > (equity * rules.maxPositionPct) / 100) { violations++; continue; }
        cash -= cost; qty += q;
      } else if (o.side === 'sell') {
        if (q > qty) { violations++; continue; }
        cash += q * tape[i]; qty -= q;
      } else violations++;
    }
    const eq = cash + qty * tape[i];
    peak = Math.max(peak, eq); maxDD = Math.max(maxDD, (peak - eq) / peak);
  }
  const ret = (cash + qty * tape[tape.length - 1]) / rules.startCash - 1;
  let score = clamp01(ret * 10);
  const ddBreach = maxDD * 100 > rules.maxDrawdownPct;
  if (violations) score *= 0.5;
  if (ddBreach) score *= 0.5;
  return { score, detail: { ret, maxDD, violations, ddBreach } };
}

const GRADERS = { checklist, tool_use: toolUse, paper_trade: paperTrade };
const KINDS = [...Object.keys(GRADERS), 'rubric'];

module.exports = { GRADERS, KINDS, clamp01 };
