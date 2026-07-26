/**
 * SHADDAI ALPHA — x402 Monetized Endpoint (Base micro-payments)
 * ---------------------------------------------------------------
 * Returns SHADDAI's top crypto "alpha" signals. Every request settles an
 * automatic per-call payment in USDC (or $SHADDAI) on Base via Bankr's x402 layer.
 *
 * Design (per Bankr standards):
 *   - Non-blocking & deterministic: serves cached signals from appKV instantly.
 *   - Freshness kept by a background agent run (bankr.askAgent) — the caller NEVER waits on it.
 *   - Zero hardcoded secrets: any upstream keys come from `secrets` (env vars).
 *   - Low memory / fast: one appKV read, capped payload.
 *
 * Install: register as an x402 endpoint in Bankr Terminal.
 * Price:   set in Bankr (recommended $0.01–$0.05 USDC/call). Handler is price-agnostic.
 *
 * Injected globals (Bankr runtime): appKV, http, bankr, secrets
 */

const CACHE_KEY  = 'shaddai:alpha:latest';
const LOCK_KEY   = 'shaddai:alpha:refreshing';
const MAX_AGE_MS = 5 * 60 * 1000;   // signals considered fresh for 5 minutes
const MAX_LIMIT  = 10;

// The agent brief that regenerates the signal set. Deterministic JSON contract.
const REFRESH_TASK =
  'You are SHADDAI ORACLE, a crypto signals analyst. Return STRICT JSON only: ' +
  '{"signals":[{"symbol":"TICKER","chain":"base|solana","score":0-100,' +
  '"thesis":"one sentence","risk":"low|medium|high","action":"watch|accumulate|avoid"}]}. ' +
  'Give 5 current, specific, non-hype signals. No prose outside the JSON.';

async function readCache() {
  try { const raw = await appKV.get(CACHE_KEY); return raw ? JSON.parse(raw) : null; }
  catch (_) { return null; }
}

// Fire-and-forget refresh: run a SHADDAI agent, store its JSON to appKV. Never blocks the response.
async function kickRefresh(now) {
  try {
    const locked = await appKV.get(LOCK_KEY);
    if (locked && (now - Number(locked)) < 60_000) return;   // one refresh per minute, max
    await appKV.set(LOCK_KEY, String(now));
    bankr.askAgent({
      agent: 'ORACLE',
      task: REFRESH_TASK,
      onResult: async (out) => {
        try {
          const text = typeof out === 'string' ? out : (out && (out.text || out.result || ''));
          const match = String(text).match(/\{[\s\S]*\}/);
          const parsed = match ? JSON.parse(match[0]) : null;
          const signals = parsed && Array.isArray(parsed.signals) ? parsed.signals.slice(0, MAX_LIMIT) : [];
          if (signals.length) await appKV.set(CACHE_KEY, JSON.stringify({ ts: Date.now(), signals }));
        } catch (_) { /* keep last good cache */ }
        finally { try { await appKV.set(LOCK_KEY, '0'); } catch (_) {} }
      },
    });
  } catch (_) { /* refresh is best-effort */ }
}

/**
 * x402 request handler. Bankr settles payment before/around this call.
 * @param {{ query?: Record<string,string> }} req
 * @returns {Promise<{status:number, body:object}>}
 */
export default async function handler(req) {
  const now = Date.now();
  const limit = Math.max(1, Math.min(MAX_LIMIT, Number((req && req.query && req.query.limit) || 5)));

  const cached = await readCache();
  const stale = !cached || (now - (cached.ts || 0) > MAX_AGE_MS);

  if (stale) kickRefresh(now);   // non-blocking; caller gets current data now

  const signals = (cached && Array.isArray(cached.signals)) ? cached.signals : [];

  return {
    status: 200,
    body: {
      ok: true,
      source: 'SHADDAI Signal Engine',
      generatedAt: cached ? new Date(cached.ts).toISOString() : null,
      fresh: !stale,
      count: Math.min(signals.length, limit),
      signals: signals.slice(0, limit),
      disclaimer: 'Educational signals only — NOT financial advice. Crypto/memecoins are extremely high-risk; you can lose everything.',
    },
  };
}
