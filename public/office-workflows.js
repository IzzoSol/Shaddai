/* ══════════════════════════════════════════════════════════════════
   SHADDAI — OFFICE ↔ WORKFLOWS
   Wires the (decluttered) Command Floor buttons to REAL workflows from
   the Workflow Gallery, and drives the agent "get to work" motion using
   the dashboard's existing office helpers. Null-safe, never throws.
   ══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  function moveAgentsToWork() {
    try {
      if (window.S && S.agents) {
        S.agents.forEach(function (a) {
          if (a.name !== 'SHADDAI') { a.status = 'WORKING'; a.tx = a.dx; a.ty = a.dy; }
        });
        S.break = false;
        if (typeof renderAgents === 'function') renderAgents();
        if (typeof renderStatus === 'function') renderStatus();
      }
      if (typeof _officeCommandAll === 'function') _officeCommandAll('desk');
    } catch (e) { /* ignore */ }
  }

  // Launch a real workflow (by gallery id) from the floor
  window.officeRunWF = function (id, label) {
    try {
      moveAgentsToWork();
      if (typeof addSysMsg === 'function') addSysMsg('▶ Deploying agents for: ' + (label || id));
      if (window.SHADDAI_WF && SHADDAI_WF.openRun) {
        var ok = SHADDAI_WF.openRun(id);
        if (!ok && typeof notify === 'function') notify('Workflow not found: ' + id);
      } else if (typeof notify === 'function') {
        notify('Workflow engine still loading — try again in a moment.');
      }
    } catch (e) { if (typeof notify === 'function') notify('Run error: ' + e.message); }
  };

  // Simple office modes (cosmetic agent life, no workflow)
  window.officeMode = function (m) {
    try {
      if (window.S && S.agents) {
        S.agents.forEach(function (a) {
          if (a.name !== 'SHADDAI') a.status = (m === 'break' ? 'BREAK' : 'WORKING');
        });
        S.break = (m === 'break');
        if (typeof renderAgents === 'function') renderAgents();
      }
      if (typeof _officeCommandAll === 'function') _officeCommandAll(m === 'break' ? 'break' : 'desk');
      if (typeof addSysMsg === 'function') addSysMsg(m === 'break' ? '☕ Agents on break.' : '⚙ Agents at work.');
    } catch (e) { /* ignore */ }
  };
})();
