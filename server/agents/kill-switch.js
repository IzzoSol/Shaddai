'use strict';
// Four-level kill switches (global / agent / tool / provider), runtime-configurable without a deploy.
function makeKillSwitch() {
  const s = { global: false, tool: new Set(), agent: new Set(), provider: new Set() };
  return {
    set(level, id, on = true) {
      if (level === 'global') { s.global = !!on; return; }
      const set = s[level];
      if (!set) throw new Error('bad kill-switch level');
      if (on) set.add(id); else set.delete(id);
    },
    blocked({ tool, agentId, provider } = {}) {
      if (s.global) return 'kill_global';
      if (agentId && s.agent.has(agentId)) return 'kill_agent';
      if (tool && s.tool.has(tool)) return 'kill_tool';
      if (provider && s.provider.has(provider)) return 'kill_provider';
      return null;
    },
    snapshot() { return { global: s.global, tool: [...s.tool], agent: [...s.agent], provider: [...s.provider] }; },
  };
}
module.exports = { makeKillSwitch };
