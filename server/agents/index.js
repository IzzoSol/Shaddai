'use strict';
// Agent Gateway foundation (WP2/WP3/WP5): registry, dispatcher, approvals, kill switches, audit, AURA usage, providers.
const { makeRegistry } = require('./tool-registry');
const { makeDispatcher } = require('./dispatcher');
const { makeApprovals } = require('./approvals');
const { makeKillSwitch } = require('./kill-switch');
const { makeAudit } = require('./audit');
const { makeUsage, makePriceTable } = require('./usage');
const { runAgentTurn } = require('./runtime');
const { createOpenAICompat } = require('./providers/openai-compat');
const { createMock } = require('./providers/mock');
const { PROVIDERS, routeAllowed } = require('./providers/config');

function createGateway({ auditFile, limits, priceEntries = {}, priceVersion } = {}) {
  const registry = makeRegistry();
  const killSwitch = makeKillSwitch();
  const approvals = makeApprovals();
  const audit = makeAudit(auditFile);
  const usage = makeUsage({ limits });
  const prices = makePriceTable(priceEntries, priceVersion);
  const dispatch = makeDispatcher({ registry, killSwitch, approvals, audit, usage });
  const deps = { registry, killSwitch, approvals, audit, usage, prices, dispatch };
  return Object.assign({ run: args => runAgentTurn(Object.assign({ deps }, args)) }, deps);
}
module.exports = { createGateway, createOpenAICompat, createMock, PROVIDERS, routeAllowed, runAgentTurn };
