/* ══════════════════════════════════════════════════════════════════
   SHADDAI — FORGE ↔ WORKFLOW SKILLS (alignment)
   The Workflow Gallery, the agent tools, and the Forge loadout should be
   ONE aligned set. This reads the SAME catalog the gallery uses
   (window.SHADDAI_WF.catalog) and exposes each workflow as an equippable
   "Workflow Skill" inside the Forge. Equipped skills are recorded on
   window.SHADDAI_FORGE_SKILLS and stamped onto the forged agent, so an
   agent you forge/buy actually carries these capabilities.
   Additive + defensive: never breaks the existing forge skill system.
   ══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  window.SHADDAI_FORGE_SKILLS = window.SHADDAI_FORGE_SKILLS || [];

  function catalog() {
    return (window.SHADDAI_WF && window.SHADDAI_WF.catalog) ? window.SHADDAI_WF.catalog : [];
  }

  function injectStyles() {
    if (document.getElementById('wfskill-styles')) return;
    var s = document.createElement('style');
    s.id = 'wfskill-styles';
    s.textContent =
      '#wfSkillBlock{margin:14px 0 4px;padding:12px;border:1px solid rgba(0,255,136,.18);border-radius:8px;' +
        'background:linear-gradient(158deg,rgba(0,255,136,.04),rgba(0,0,0,.2));font-family:"Share Tech Mono",monospace}' +
      '#wfSkillBlock .wfs-hd{font-size:10px;letter-spacing:.14em;color:#00ff88;text-transform:uppercase;margin-bottom:4px;font-weight:700}' +
      '#wfSkillBlock .wfs-sub{font-size:9px;color:#7fbfa0;margin-bottom:9px}' +
      '#wfSkillBlock .wfs-count{color:#ffd23f}' +
      '#wfSkillBlock .wfs-wrap{display:flex;flex-wrap:wrap;gap:6px;max-height:150px;overflow-y:auto}' +
      '#wfSkillBlock .wfs-chip{font-family:inherit;font-size:9px;letter-spacing:.03em;padding:5px 9px;border-radius:3px;cursor:pointer;' +
        'border:1px solid rgba(0,255,136,.22);background:rgba(0,255,136,.04);color:#bfefd6;transition:all .13s;white-space:nowrap}' +
      '#wfSkillBlock .wfs-chip:hover{border-color:#00ff88;color:#00ff88}' +
      '#wfSkillBlock .wfs-chip.on{background:linear-gradient(180deg,#00ff88,#00c46a);color:#001b10;font-weight:700;border-color:#00ff88;box-shadow:0 0 10px rgba(0,255,136,.35)}';
    document.head.appendChild(s);
  }

  function render(host) {
    if (document.getElementById('wfSkillBlock')) return;
    var cat = catalog();
    if (!cat.length) return; // gallery not ready yet — poller will retry

    injectStyles();
    var block = document.createElement('div');
    block.id = 'wfSkillBlock';
    var chips = '';
    cat.forEach(function (c) {
      c.items.forEach(function (w) {
        chips += '<button type="button" class="wfs-chip" data-wf="' + w.id + '" title="' +
          (w.desc || '').replace(/"/g, '&quot;') + '">' + w.icon + ' ' + w.title + '</button>';
      });
    });
    block.innerHTML =
      '<div class="wfs-hd">⚡ Workflow Skills <span class="wfs-count" id="wfsCount">0 equipped</span></div>' +
      '<div class="wfs-sub">Same tools as the Workflow Gallery — equip them so this agent can run them.</div>' +
      '<div class="wfs-wrap">' + chips + '</div>';
    host.appendChild(block);

    block.addEventListener('click', function (e) {
      var chip = e.target.closest('.wfs-chip');
      if (!chip) return;
      chip.classList.toggle('on');
      var id = chip.getAttribute('data-wf');
      var arr = window.SHADDAI_FORGE_SKILLS;
      var i = arr.indexOf(id);
      if (chip.classList.contains('on')) { if (i < 0) arr.push(id); }
      else if (i >= 0) arr.splice(i, 1);
      var c = document.getElementById('wfsCount');
      if (c) c.textContent = arr.length + ' equipped';
    });
  }

  // Hook the forge button so equipped workflow-skills get stamped onto the new agent.
  function hookForge() {
    var btn = document.getElementById('ofForge');
    if (!btn || btn.__wfHooked) return;
    btn.__wfHooked = true;
    btn.addEventListener('click', function () {
      try {
        var equipped = (window.SHADDAI_FORGE_SKILLS || []).slice();
        if (!equipped.length) return;
        // Best-effort: attach to the most recently created forged agent shortly after forge runs.
        setTimeout(function () {
          try {
            if (window.S && Array.isArray(S.forgedAgents) && S.forgedAgents.length) {
              var a = S.forgedAgents[S.forgedAgents.length - 1];
              a.workflowSkills = equipped;
            } else if (window.S && Array.isArray(S.agents) && S.agents.length) {
              var b = S.agents[S.agents.length - 1];
              if (b && !b.workflowSkills) b.workflowSkills = equipped;
            }
          } catch (e) {}
        }, 600);
      } catch (e) {}
    }, true);
  }

  function mount() {
    var forge = document.getElementById('operatorForge');
    if (!forge) return false;
    var host = document.getElementById('ofSkills');
    // place our block right after the skills loadout, else at the end of the forge panel
    var anchor = host ? (host.parentElement || forge) : forge;
    render(anchor);
    hookForge();
    return !!document.getElementById('wfSkillBlock');
  }

  function boot() {
    if (mount()) return;
    var tries = 0;
    var t = setInterval(function () { tries++; if (mount() || tries > 80) clearInterval(t); }, 120);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
