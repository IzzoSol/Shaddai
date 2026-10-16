'use strict';
// One registry, one declaration format. Risky classes need an approval policy; some tools are never agent-callable.
const CLASSES = ['READ_PUBLIC', 'READ_PRIVATE', 'WRITE_LOW', 'WRITE_WORLD', 'SPEND', 'TRANSFER', 'ISSUE', 'CONTACT', 'ADMIN'];
const APPROVAL = ['never', 'required', 'required_unless_allowance'];
const RISKY = new Set(['SPEND', 'TRANSFER', 'ISSUE', 'CONTACT', 'ADMIN']);
// Agents may only *request*; the platform/owner flow executes these (manual 19.6, 20.6).
const NEVER_AGENT_CALLABLE = new Set([
  'change_permissions', 'issue_receipt', 'modify_world_structure', 'update_agent_spending_policy',
  'execute_approved_trade', 'execute_approved_payment', 'mint_asset', 'issue_asset',
  'complete_quest', 'complete_job', 'reward_player', 'transfer_item',
]);

function makeRegistry() {
  const tools = new Map();
  return {
    define(t) {
      if (!t || !/^[a-z][a-z0-9_]{1,48}$/.test(t.name || '')) throw new Error('tool name invalid');
      if (tools.has(t.name)) throw new Error('duplicate tool ' + t.name);
      if (NEVER_AGENT_CALLABLE.has(t.name)) throw new Error('tool is never agent-callable: ' + t.name);
      if (!CLASSES.includes(t.permissionClass)) throw new Error('bad permissionClass');
      const approval = t.approval || 'never';
      if (!APPROVAL.includes(approval)) throw new Error('bad approval policy');
      if (RISKY.has(t.permissionClass) && approval === 'never') throw new Error('risky tool needs an approval policy');
      if (typeof t.handler !== 'function') throw new Error('handler required');
      tools.set(t.name, Object.freeze(Object.assign(
        { rateLimit: { perAgentPerMin: 30 }, costClass: 'free', audit: true, input: { type: 'object', properties: {}, additionalProperties: false } },
        t, { approval })));
    },
    get(n) { return tools.get(n); },
    // Only granted tools are ever shown to a model.
    granted(grants) { return [...tools.values()].filter(t => grants && grants.has(t.name)); },
    all() { return [...tools.values()]; },
  };
}
module.exports = { makeRegistry, CLASSES, NEVER_AGENT_CALLABLE };
