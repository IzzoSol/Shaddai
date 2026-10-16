'use strict';
// External-agent bridge (Jev, any bot, any developer's agent): Shaddai POSTs a SIGNED observation and expects intents back.
// HMAC-SHA256 over `${timestamp}.${body}` with a per-agent secret; responses are schema-checked and size-capped.
// External agents get the same observation format and the same tool permission checks as hosted ones. No back door.
const crypto = require('crypto');
const { validateEndpoint } = require('../ssrf');

const MAX_RESPONSE_BYTES = 64 * 1024;
const INTENT_TYPES = new Set(['say', 'move_to', 'use_tool']);

function sign(secret, timestamp, body) { return crypto.createHmac('sha256', secret).update(timestamp + '.' + body).digest('hex'); }
function verifySignature(secret, timestamp, body, sig, { now = Date.now(), windowMs = 5 * 60 * 1000 } = {}) {
  if (!secret || !timestamp || !sig) return false;
  if (Math.abs(now - Number(timestamp)) > windowMs) return false;                        // replay window
  const a = Buffer.from(sign(secret, timestamp, body)), b = Buffer.from(String(sig));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function parseIntents(text) {
  if (Buffer.byteLength(text) > MAX_RESPONSE_BYTES) return { ok: false, code: 'response_too_large' };
  let j; try { j = JSON.parse(text); } catch (_) { return { ok: false, code: 'bad_json' }; }
  if (!j || !Array.isArray(j.intents) || j.intents.length > 8) return { ok: false, code: 'bad_shape' };
  for (const it of j.intents) {
    if (!it || !INTENT_TYPES.has(it.type)) return { ok: false, code: 'bad_intent_type' };
    if (it.type === 'say' && (typeof it.text !== 'string' || it.text.length > 280)) return { ok: false, code: 'bad_intent' };
    if (it.type === 'use_tool' && (typeof it.tool !== 'string' || typeof it.args !== 'object')) return { ok: false, code: 'bad_intent' };
  }
  return { ok: true, intents: j.intents };
}

function createWebhookAgent({ agentId, url, secret, production = true, fetchImpl, resolve, now = () => Date.now(), timeoutMs = 8000 }) {
  const f = fetchImpl || globalThis.fetch;
  return {
    providerId: 'webhook:' + agentId,
    async decide(observation) {
      const v = await validateEndpoint(url, { production, resolve });          // re-validated on every request (DNS rebinding)
      if (!v.ok) return { ok: false, code: v.code };
      const body = JSON.stringify({ agentId, observation });
      const ts = String(now());
      const ac = new AbortController(); const t = setTimeout(() => ac.abort(), timeoutMs);
      try {
        const res = await f(url, { method: 'POST', redirect: 'error', signal: ac.signal,
          headers: { 'content-type': 'application/json', 'x-shaddai-timestamp': ts, 'x-shaddai-signature': sign(secret, ts, body) }, body });
        if (!res.ok) return { ok: false, code: 'http_' + res.status };
        return parseIntents(await res.text());
      } catch (_) { return { ok: false, code: 'unreachable' }; } finally { clearTimeout(t); }
    },
  };
}
module.exports = { createWebhookAgent, sign, verifySignature, parseIntents };
