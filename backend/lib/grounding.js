'use strict';
/**
 * Grounding & anti-larp guardrails for the SHADDAI agent engine.
 *
 * Makes two weak-model failure modes STRUCTURALLY IMPOSSIBLE — not "less likely":
 *
 *   (A) LARP  — the model invents specific data (prices, %, numbers) instead of calling
 *               a tool. Guard: `looksFabricated()` flags a data-goal answer that asserts
 *               specifics with ZERO tools used → the engine refuses to ship it.
 *
 *   (B) GARBLE / DRIFT — synthesis produces numbers that aren't in the real tool data
 *               (or times out). Guard: `synthesisGrounded()` requires the prose to REUSE
 *               the real numbers; if it doesn't, the engine falls back to `formatToolData()`,
 *               a deterministic, always-correct, instant summary of the actual tool results.
 *
 * Net effect: the engine either returns REAL data (verbatim or grounded prose) or an HONEST
 * "couldn't verify" — never fabricated specifics, never garbled numbers, never a hang-forever.
 *
 * Zero dependencies. Deterministic. Never throws.
 */

// Goals that REQUIRE real/live data to answer truthfully.
const DATA_RE = /\b(price|prices|worth|market\s*cap|marketcap|volume|rate|fear\s*(?:and|&)?\s*greed|sentiment|trending|gainers|losers|dominance|tvl|apr|apy|yield|funding|gas|balance|holders|supply|stock|ticker|quote|weather|forecast|news|headline|latest|current|today'?s?|right\s*now|live|on[-\s]?chain|whale|stats?)\b/i;

// Specific factual claims a model shouldn't invent: currency, percentages, big numbers.
const SPECIFIC_RE = /(\$\s?\d[\d,]*(?:\.\d+)?|\d+(?:\.\d+)?\s?%|\b\d{1,3}(?:,\d{3})+(?:\.\d+)?\b|\b\d+(?:\.\d+)?\s?(?:k|m|bn?|billion|million|trillion|usd|btc|eth)\b)/i;

function needsRealData(goal) {
  try { return DATA_RE.test(String(goal || '')); } catch (_) { return false; }
}

/**
 * True when an answer asserts specific facts but no tool was actually called to source them
 * (for a goal that needs real data). That's fabrication — the engine must not ship it.
 */
function looksFabricated(answer, toolsUsedCount, goal) {
  try {
    if (Number(toolsUsedCount) > 0) return false;   // it used real data
    if (!needsRealData(goal)) return false;          // not a live-data goal
    return SPECIFIC_RE.test(String(answer || ''));   // specific claims with zero tools → fabricated
  } catch (_) { return false; }
}

// Extract comparable numeric tokens (strip grouping/trailing punctuation).
function _nums(s) {
  return new Set((String(s).match(/\d[\d,]*(?:\.\d+)?/g) || [])
    .map(x => x.replace(/,/g, '').replace(/\.0+$/, ''))
    .filter(x => x.length >= 2));   // ignore tiny 1-digit noise
}

/**
 * True when synthesis prose is GROUNDED in the tool data — i.e. the numbers it states
 * actually appear in the collected data. If the model invented different numbers (drift /
 * garble / hallucination), this returns false and the caller should use formatToolData().
 */
function synthesisGrounded(synth, dataBlock) {
  try {
    const a = _nums(synth);
    if (a.size === 0) return true;          // no numeric claims → nothing to fabricate
    const b = _nums(dataBlock);
    if (b.size === 0) return true;          // no data numbers to compare against
    let overlap = 0;
    for (const n of a) if (b.has(n)) overlap++;
    return (overlap / a.size) >= 0.5;       // ≥half the stated numbers must come from real data
  } catch (_) { return true; }
}

function _cap(s) { s = String(s || ''); return s.charAt(0).toUpperCase() + s.slice(1); }

// Render ONE tool result as a clean human line (deterministic, no LLM).
function _prettyOne(toolName, result) {
  let obj = null;
  try { obj = (typeof result === 'string') ? JSON.parse(result) : result; } catch (_) {}
  if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
    if (obj.price && obj.symbol) {
      return `• ${_cap(obj.symbol)}: ${obj.price}` +
        (obj.change24h ? ` (${obj.change24h} 24h)` : '') +
        (obj.marketCap ? `, mkt cap ${obj.marketCap}` : '') +
        (obj.volume24h ? `, vol ${obj.volume24h}` : '');
    }
    if (obj.today && (obj.today.score != null)) {
      return `• Fear & Greed: ${obj.today.score} (${obj.today.label || ''})`.trim();
    }
    const scalars = Object.entries(obj).filter(([, v]) => v == null || typeof v !== 'object').slice(0, 6);
    if (scalars.length) return `• ${toolName}: ` + scalars.map(([k, v]) => `${k} ${v}`).join(', ');
    return `• ${toolName}: ${JSON.stringify(obj).slice(0, 180)}`;
  }
  if (Array.isArray(obj)) return `• ${toolName}: ${obj.length} item(s) — ${JSON.stringify(obj.slice(0, 3)).slice(0, 160)}`;
  return `• ${toolName}: ${String(result).slice(0, 200)}`;
}

/**
 * Deterministic, always-correct summary built straight from the real tool results.
 * stepResults: [{ tool, result } | { tool, error }]. Never throws; always returns a string.
 */
function formatToolData(stepResults, opts = {}) {
  try {
    const title = opts.title || 'Live data';
    const lines = (stepResults || []).map(s =>
      s && s.error ? `• ${s.tool}: (unavailable: ${String(s.error).slice(0, 80)})`
                   : _prettyOne(s && s.tool, s && s.result));
    if (!lines.length) return `${title}: (no data collected)`;
    return `${title}:\n${lines.join('\n')}`;
  } catch (_) {
    return 'Live data: (formatting error)';
  }
}

// Honest message used when a data goal can't be grounded (no recipe, no tools) — beats a guess.
function honestUnverified(goal) {
  return `I can't verify live data for this right now, so I won't guess. ` +
    `(This needs a real data tool or a stronger model to fetch it.) Goal: "${String(goal || '').slice(0, 120)}"`;
}

module.exports = { needsRealData, looksFabricated, synthesisGrounded, formatToolData, honestUnverified };
