'use strict';
// Production wiring for the Academy: real economy, real operatives, real LLM judge, lazy singleton.
const { createAcademy } = require('./academy-core');
const { createLlmJudge } = require('./judge');

// The router only trusts the verified uid that softAuth set; never a header or a body field.
function uidFromReq(req) {
  const u = String((req && req.userId) || '').trim();
  return (!u || u.length > 128 || u === 'local') ? '' : u;
}

// chat is resolved lazily so the router loads (and tests run) without any LLM key configured.
function defaultJudge(opts) {
  const chat = (opts && opts.chat) || ((messages, o) => require('../llm-router').chat(messages, o));
  return createLlmJudge({ chat });
}

function buildAcademy(opts) {
  opts = opts || {};
  return createAcademy({
    dir: opts.dir,
    economy: opts.economy || require('../../economy-service').getDefault(),
    operatives: opts.operatives || require('../operatives'),
    judge: opts.judge || defaultJudge(),
    hooks: opts.hooks,
    adminIds: opts.adminIds,
    receiptKey: opts.receiptKey
  });
}

let _instance = null;
function getAcademy() {
  if (!_instance) _instance = buildAcademy();
  return _instance;
}

module.exports = { buildAcademy, getAcademy, defaultJudge, uidFromReq };
