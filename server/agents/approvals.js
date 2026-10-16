'use strict';
// Approvals bound to the exact action: argsHash of canonicalized args, short expiry, single use, owner-only decision.
const crypto = require('crypto');

function canon(v) {
  if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}';
  return JSON.stringify(v);
}
const argsHash = (toolName, args) => crypto.createHash('sha256').update(toolName + '|' + canon(args)).digest('hex');

function makeApprovals({ ttlMs = 5 * 60 * 1000, now = () => Date.now() } = {}) {
  const store = new Map();
  return {
    create({ agentId, userId, toolName, args, preview }) {
      const id = 'apr_' + crypto.randomBytes(12).toString('hex'); // unguessable, not Date.now()
      const rec = { id, agentId, userId, toolName, argsHash: argsHash(toolName, args), preview: String(preview || '').slice(0, 400),
        expiresAt: now() + ttlMs, singleUse: true, status: 'pending' };
      store.set(id, rec);
      return Object.assign({}, rec);
    },
    decide(id, userId, decision) {
      const r = store.get(id);
      if (!r || r.userId !== userId) return { ok: false, code: 'not_found' }; // foreign ids look identical to missing ones
      if (r.status !== 'pending') return { ok: false, code: 'already_decided' };
      if (now() > r.expiresAt) { r.status = 'expired'; return { ok: false, code: 'expired' }; }
      r.status = decision === 'approve' ? 'approved' : 'denied';
      return { ok: true, status: r.status };
    },
    // Succeeds only if approved, unexpired, unused, same agent/user/tool and the args hash matches.
    consume(id, { agentId, userId, toolName, args }) {
      const r = store.get(id);
      if (!r) return { ok: false, code: 'approval_unknown' };
      if (r.status === 'used') return { ok: false, code: 'approval_replayed' };
      if (r.status !== 'approved') return { ok: false, code: 'approval_' + r.status };
      if (now() > r.expiresAt) { r.status = 'expired'; return { ok: false, code: 'approval_expired' }; }
      if (r.agentId !== agentId || r.userId !== userId || r.toolName !== toolName) return { ok: false, code: 'approval_mismatch' };
      if (r.argsHash !== argsHash(toolName, args)) return { ok: false, code: 'approval_hash_mismatch' };
      r.status = 'used';
      return { ok: true };
    },
    get(id) { const r = store.get(id); return r ? Object.assign({}, r) : null; },
    pendingFor(userId) { return [...store.values()].filter(r => r.userId === userId && r.status === 'pending').map(r => Object.assign({}, r)); },
  };
}
module.exports = { makeApprovals, argsHash, canon };
