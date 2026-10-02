'use strict';

function installSkill({ operatives, operativeId, receipt, skill }) {
  const op = operatives.get(operativeId);
  if (!op) return { ok: false, error: 'unknown operative' };
  if (!receipt || receipt.agentId !== operativeId || receipt.skillId !== skill.id || receipt.skillHash !== skill.hash) {
    return { ok: false, error: 'receipt does not match this operative and skill' };
  }
  if (!receipt.passed) return { ok: false, error: 'receipt is not a pass' };
  const skills = (op.skills || []).filter((s) => s.skillId !== skill.id);
  skills.push({ skillId: skill.id, version: skill.version, hash: skill.hash, receiptId: receipt.receiptId });
  const tools = Array.from(new Set([...(op.tools || []), ...skill.allows]));
  const updated = operatives.update(operativeId, { skills, tools });
  return { ok: true, operative: updated };
}

module.exports = { installSkill };
