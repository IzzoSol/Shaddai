'use strict';
// Production wiring for the Academy: real economy, real operatives, real LLM judge, lazy singleton.
const { createAcademy } = require('./academy-core');
const { createLlmJudge } = require('./judge');
const { seedCurriculum } = require('./curriculum');
const { createAgentRunner } = require('./agent-runner');

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
  const academy = createAcademy({
    dir: opts.dir,
    economy: opts.economy || require('../../economy-service').getDefault(),
    operatives: opts.operatives || require('../operatives'),
    judge: opts.judge || defaultJudge(),
    hooks: opts.hooks,
    adminIds: opts.adminIds,
    receiptKey: opts.receiptKey
  });
  if (opts.seed) seedCurriculum(academy);            // idempotent: existing (or teacher-edited) content is never overwritten
  return academy;
}

let _instance = null;
function getAcademy() {
  if (!_instance) _instance = buildAcademy({ seed: true });
  return _instance;
}

// Runs the learning loop for an owner's own agents using their brain through the shared LLM router (resolved lazily).
function buildRunner(opts) {
  opts = opts || {};
  return createAgentRunner({
    academy: opts.academy || getAcademy(),
    operatives: opts.operatives || require('../operatives'),
    chat: opts.chat || ((messages, o) => require('../llm-router').chat(messages, o))
  });
}
let _runner = null;
function getRunner() {
  if (!_runner) _runner = buildRunner();
  return _runner;
}

module.exports = { buildAcademy, getAcademy, buildRunner, getRunner, defaultJudge, uidFromReq, seed: seedCurriculum };
