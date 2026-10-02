'use strict';
const crypto = require('crypto');
const { hashOf } = require('./canon');

const META = ['hash', 'receiptId', 'sig'];
function core(rec) { const c = Object.assign({}, rec); for (const k of META) delete c[k]; return c; }

function createReceipts({ store, key }) {
  key = key !== undefined ? key : (process.env.ACADEMY_RECEIPT_KEY || '');
  const lines = () => store.readLines('receipts');

  function issue(body) {
    const all = lines();
    if (body.examAttemptId) {
      const dupe = all.find((r) => r.examAttemptId === body.examAttemptId);
      if (dupe) return dupe;
    }
    const prev = [...all].reverse().find((r) => r.agentId === body.agentId);
    const rec = Object.assign({}, body, { ts: body.ts || Date.now(), prev: prev ? prev.hash : null });
    rec.hash = hashOf(rec);
    rec.receiptId = 'rc_' + rec.hash.slice(0, 16);
    rec.sig = key ? crypto.createHmac('sha256', key).update(rec.hash).digest('hex') : null;
    store.append('receipts', rec);
    return rec;
  }

  const forAgent = (agentId) => lines().filter((r) => r.agentId === agentId);
  const get = (receiptId) => lines().find((r) => r.receiptId === receiptId) || null;

  function verifyChain(agentId) {
    const rs = forAgent(agentId); let prev = null;
    for (let i = 0; i < rs.length; i++) {
      const r = rs[i];
      if (r.prev !== prev || hashOf(core(r)) !== r.hash) return { ok: false, brokenAt: i };
      if (key) {                                       // with a signing key every receipt must carry a valid HMAC
        const want = crypto.createHmac('sha256', key).update(r.hash).digest('hex');
        if (r.sig !== want) return { ok: false, brokenAt: i };
      }
      prev = r.hash;
    }
    return { ok: true, count: rs.length };
  }

  return { issue, forAgent, verifyChain, get };
}

module.exports = { createReceipts };
