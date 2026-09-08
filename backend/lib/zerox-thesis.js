/**
 * ZEROX THESIS ENGINE — deterministic coin breakdown + entry/exit plan.
 *
 * Built for the "ASK ZEROX" button on every pro-signal call card. Takes what
 * the scanner actually saw (call record from tg-calls.json) plus optional live
 * DexScreener pair data (liq, vol, price change, socials) and returns a direct
 * read: sentiment, a one-paragraph thesis, concrete entry zones, exit targets
 * and a position-size guess — no fluff, no "DYOR" cop-out.
 *
 * Deliberately rule-based, not LLM: the verdict must be explainable, instant,
 * and identical for identical inputs. (The /api/ask brain exists for open-ended
 * questions; this is a tool, and tools should not hallucinate.)
 */

'use strict';

const $ = (n) => Number(n) || 0;

/* 0-100, higher = more bullish. Built from signal-side quality metrics
   (risk/viability/holders/liq/volume) plus live market state. */
function sentiment(call, live) {
  let s = 50;

  const viab = $(call.viabilityScore);
  if (viab) s += Math.min(14, viab / 100 * 14);
  const risk = $(call.riskScore);
  if (risk) s -= Math.min(16, risk / 100 * 16);

  s += Math.min(12, Math.max(0, $(live.liq || call.liq) / 100000 * 12));      // $100k liq = full marks
  s += Math.min(8, Math.max(0, $(live.vol24 || call.vol24) / 200000 * 8));    // $200k vol = full marks
  s += Math.min(6, Math.max(0, $(call.holders) / 5000 * 6));                  // 5k holders = full marks

  const lp = $(call.lpPct);
  if (lp >= 90) s += 6; else if (lp >= 70) s += 3; else if (lp && lp < 40) s -= 6;
  if (call.bundlers) s -= 6;
  const t10 = $(call.top10Pct);
  if (t10 > 45) s -= 6; else if (t10 && t10 < 25) s += 3;

  if (live.socials && live.socials.any) s += 4;                          // has twitter/telegram/site
  if (typeof live.chg1h === 'number') {
    if (live.chg1h > 15) s -= 4;                                        // already pumped the last hour
    if (live.chg1h < -12) s -= 6;                                       // outright dumping
  }
  if (!call.bundlers && !call.insiders && !call.snipers) s += 4;         // clean launch profile
  if (call.closed) s -= 10;                                             // exhausted lifecycle

  return Math.max(2, Math.min(98, Math.round(s)));
}

function verdict(s) {
  if (s >= 75) return { tag: 'BULLISH', emoji: '🟢', color: '#00ff9c' };
  if (s >= 60) return { tag: 'CONSTRUCTIVE', emoji: '🔵', color: '#38bdf8' };
  if (s >= 45) return { tag: 'MIXED', emoji: '🟡', color: '#f4c842' };
  if (s >= 30) return { tag: 'DEFENSIVE', emoji: '🟠', color: '#fb923c' };
  return { tag: 'AVOID', emoji: '🔴', color: '#fb4766' };
}

/* One honest paragraph. Lead with the strongest single factor, then the
   biggest risk, then the practical note. No hedge-soup. */
function thesis(call, live, sent) {
  const sym = call.symbol || 'this coin';
  const liq = $(live.liq || call.liq);
  const vol = $(live.vol24 || call.vol24);
  const parts = [];

  if (liq >= 50000) parts.push(`real liquidity at $${Math.round(liq).toLocaleString()} — you can actually get out`);
  else if (liq) parts.push(`trades on thin $${Math.round(liq).toLocaleString()} liquidity, so size accordingly`);
  if (vol >= 100000) parts.push(`$24h volume of $${Math.round(vol).toLocaleString()} shows real hands`);
  else if (vol) parts.push(`volume is light ($${Math.round(vol).toLocaleString()}/24h) — one chop can move it hard`);

  if ($(call.holders)) parts.push(`${$loc($(call.holders))} holders`);
  if ($(call.lpPct)) parts.push(`LP is ${Math.round($(call.lpPct))}% of the pool`);
  if (call.bundlers || $(call.top10Pct) > 45) {
    parts.push(`but ${Math.round($(call.top10Pct||0))}% sits in the top 10${call.bundlers ? ' and bundling was flagged' : ''} — a de-risk target`);
  } else if ($(call.riskScore) >= 65) {
    parts.push(`though the risk engine flags it (${Math.round($(call.riskScore))}/100)`);
  }

  const topSocial = live.socials && (live.socials.twitter ? 'a live Twitter' : live.socials.telegram ? 'a Telegram' : live.socials.site ? 'a website' : null);
  if (topSocial) parts.push(`and it has ${topSocial}, which beats most daily pump dumps`);

  const lead = sent >= 60 ? 'setup looks clean' : sent >= 45 ? 'middling setup' : 'setup carries real downside';
  const T = call.name && String(call.name).length > 3 ? String(call.name) : sym;
  return `${T}: ${lead}. ${parts.join('; ')}.`;
}

function $loc(n) {
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
  return String(n);
}

/* Entry plan. Anchor on the entry FDV the scanner caught, then give zones
   relative to that — plus a flat "now vs caught" read. */
function entryPlan(call, live, cur) {
  const entry = $(call.entryFdv);
  const nowFdv = entry * cur;
  const got = call.source && call.source.includes('seed') ? 'SEED-caught' : 'scanner-caught';

  const zones = [];
  if (cur < 1.15) zones.push({ label: 'NOW', note: `near the ${got} entry — the whole move is still in front of you`, lo: nowFdv * 0.9, hi: nowFdv * 1.1 });
  if (cur >= 0.6) zones.push({ label: 'PULLBACK', note: '1st safe add on a shake-out', lo: entry * 0.75, hi: entry * 1.0 });
  if (entry) zones.push({ label: 'CATCH', note: 'only for conviction — sub-entry reload as long as liq stays above the floor', lo: entry * 0.5, hi: entry * 0.75 });

  return {
    got,
    nowFdv,
    zones: zones.slice(0, 3),
    trimHint: zones.length > 2 ? 3 : 2,            // don't chase past 3 tranches
  };
}

/* Exit plan. Targets laddered, stop derived from how far it has run already
   (a 10x needs a real stop or you give a winner back). */
function exitPlan(call, live, cur) {
  const peak = $(call.peakMult) || 1;
  const base = Math.max(peak, cur * 1.2, 1);
  const targets = [];
  const ladder = [1.5, 2.5, 4, 6, 10];
  for (const m of ladder) {
    if (m <= base * 1.02) continue;
    targets.push({
      label: m + '×',
      zone: 'FDV ' + $fmt((call.entryFdv || 0) * m),
      take: m === ladder[0] ? 'book a starter; trail the rest' : m >= 4 ? 'bank hard, move stop to break-even' : 'roll the runner',
    });
  }
  if (!targets.length) targets.push({ label: base.toFixed(1) + '×', zone: 'current', take: 'let it run while liq holds' });

  const stopMult = Math.max(0.3, Math.min(0.75, cur * 0.6));      // 40% below now, never below 0.3x entry
  return {
    targets: targets.slice(0, 3),
    stop: stopMult,
    stopNote: `hard stop ${Math.round((1 - stopMult) * 100)}% below the current mark (≈ ${$fmt((call.entryFdv || 0) * stopMult)}) — a full round-trip back through this level usually means the trade is over`,
  };
}

function $fmt(n) {
  if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
  if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
  return '$' + Math.round(n);
}

/* ── PUBLIC ─────────────────────────────────────────────────────────────
   call: the record from tg-calls.json (or a compat object).
   live: optional enriched pair data (see lib/token-enrich shape(); may be {}).
   Returns a flat object ready to JSON.stringify — every field present. */
function build(call, live) {
  call = call || {};
  live = live || {};
  const cur = typeof call.currentMult === 'number' ? call.currentMult : (call.curMult || 1);
  const sent = sentiment(call, live);
  const v = verdict(sent);

  const risk = Math.round($(call.riskScore));
  const viab = Math.round($(call.viabilityScore));
  const rug = Math.round($(call.rugScore));

  return {
    symbol: call.symbol || (live.symbol || ''),
    name: call.name || '',
    mint: call.mint || '',
    source: call.source || 'unknown',
    ts: call.ts || 0,
    sentiment: v,
    score: sent,
    color: v.color,
    thesis: thesis(call, live, sent),
    riskProfile: {
      riskScore: risk || null,
      viabilityScore: viab || null,
      rugScore: rug || null,
      liq: $(live.liq || call.liq),
      vol24: $(live.vol24 || call.vol24),
      holders: $(call.holders) || null,
      lpPct: $(call.lpPct) || null,
      top10Pct: $(call.top10Pct) || null,
      bundlers: !!call.bundlers,
      insiders: !!call.insiders,
      snipers: !!call.snipers,
      milestones: Array.isArray(call.milestones) ? call.milestones.length : 0,
      closed: !!call.closed,
    },
    market: {
      entryFdv: $(call.entryFdv),
      nowFdv: $(call.entryFdv) * cur,
      peakMult: $(call.peakMult) || 1,
      curMult: Math.round(cur * 100) / 100,
      chg24: typeof live.chg24 === 'number' ? live.chg24 : null,
      socials: live.socials || null,
      pairUrl: live.pairUrl || null,
    },
    entry: entryPlan(call, live, cur),
    exit: exitPlan(call, live, cur),
    // The one-line direct answer to "should I buy?"
    bottomLine: `${v.emoji} ${v.tag} — ${sent >= 60 ? 'a trader play you can size normally' : sent >= 45 ? 'small size only, clear stop' : sent >= 30 ? 'defend your existing bag, do not add' : 'stand aside — the risk/reward is broken'}.`,
    generatedAt: Date.now(),
  };
}

module.exports = { build, sentiment, verdict, thesis, entryPlan, exitPlan };